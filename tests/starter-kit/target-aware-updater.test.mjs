import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  ROOT,
  assertPathInside,
  filePathFromModuleUrl,
  resolveTargetPath,
  sha256File,
  sha256Tree
} from '../../tools/starter-kit/lib.mjs';
import {
  loadManifest,
  resolveManifestEntries,
  validateManifest
} from '../../tools/starter-kit/manifest.mjs';
import {
  loadTargetProfile,
  validateTargetProfile
} from '../../tools/starter-kit/profile.mjs';
import { planPackageMerge } from '../../tools/starter-kit/package-merge.mjs';
import { executeUpdate } from '../../tools/starter-kit/update-engine.mjs';
import { inspectTargetStatus } from '../../tools/starter-kit/status-core.mjs';

const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

function tempFixture(name) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-kit-test-'));
  const target = path.join(parent, name);
  fs.mkdirSync(target, { recursive: true });
  const source = path.join(FIXTURES, name);
  if (fs.existsSync(source)) {
    fs.cpSync(source, target, {
      recursive: true,
      filter: (candidate) => path.basename(candidate) !== '.gitkeep'
    });
  }
  return { parent, target };
}

function removeTemp(parent) {
  fs.rmSync(parent, { recursive: true, force: true });
}

function hashProduct(target) {
  const hashes = {};
  for (const relative of ['index.html', 'game-spec.yaml', 'src', 'public']) {
    const candidate = path.join(target, relative);
    if (fs.existsSync(candidate)) hashes[relative] = sha256Tree(candidate);
  }
  return hashes;
}

function matureProfile(overrides = {}) {
  return loadTargetProfile(ROOT, 'mature-yandex-phaser', {
    mode: 'update',
    ...overrides
  });
}

test('Windows module URL does not produce a double drive prefix', () => {
  const value = filePathFromModuleUrl('file:///E:/Work/YandexGames/starter/tools/lib.mjs');
  assert.doesNotMatch(value, /^[A-Za-z]:\\[A-Za-z]:\\/);
});

test('fileURLToPath decodes escaped spaces in a module URL', () => {
  const value = filePathFromModuleUrl('file:///E:/Work/Project%20With%20Spaces/lib.mjs');
  assert.match(value, /Project With Spaces/);
  assert.doesNotMatch(value, /%20/);
});

test('absolute Windows target remains absolute without drive duplication', () => {
  const target = path.join(FIXTURES, 'windows-path-project');
  const value = resolveTargetPath(target, 'C:\\Caller');
  assert.equal(path.win32.normalize(value), path.win32.normalize(target));
});

test('Windows target with spaces resolves without URL escaping', () => {
  const target = path.join(FIXTURES, 'project-with-spaces');
  const value = resolveTargetPath(target, 'C:\\Caller');
  assert.equal(path.win32.normalize(value), path.win32.normalize(target));
});

test('relative Windows target resolves against the supplied cwd', () => {
  const value = resolveTargetPath('child', 'E:\\Work\\Parent');
  assert.equal(path.win32.normalize(value), 'E:\\Work\\Parent\\child');
});

test('POSIX target resolves with POSIX semantics when a POSIX cwd is supplied', () => {
  assert.equal(resolveTargetPath('../game', '/work/starter', path.posix), '/work/game');
});

test('module file URL round-trips through a filesystem path', () => {
  const file = path.join(ROOT, 'tools', 'starter-kit', 'lib.mjs');
  assert.equal(path.normalize(filePathFromModuleUrl(pathToFileURL(file))), path.normalize(file));
});

test('file URL target resolves to the decoded filesystem path', () => {
  const target = path.join(ROOT, 'tests', 'fixtures', 'project-with-spaces');
  assert.equal(path.normalize(resolveTargetPath(pathToFileURL(target).href)), path.normalize(target));
});

test('target path traversal outside the project root is rejected', () => {
  assert.throws(() => assertPathInside('E:\\Project', 'E:\\Outside\\file.txt'), /outside target root/i);
});

test('mature profile validates required ownership protections', () => {
  assert.doesNotThrow(() => validateTargetProfile(matureProfile()));
});

test('update of a non-empty project requires an explicit profile', () => {
  assert.throws(
    () => loadTargetProfile(ROOT, undefined, { mode: 'update', targetNonEmpty: true }),
    /profile is required/i
  );
});

test('mature profile does not resolve index.html as an update target', () => {
  const entries = resolveManifestEntries(loadManifest(ROOT), matureProfile(), 'update');
  assert.equal(entries.some((entry) => entry.target === 'index.html'), false);
});

test('mature profile does not resolve game-spec.yaml as an update target', () => {
  const entries = resolveManifestEntries(loadManifest(ROOT), matureProfile(), 'update');
  assert.equal(entries.some((entry) => entry.target === 'game-spec.yaml'), false);
});

test('manifest never manages src or public for the mature profile', () => {
  const entries = resolveManifestEntries(loadManifest(ROOT), matureProfile(), 'update');
  assert.equal(entries.some((entry) => /^(src|public)(\/|$)/.test(entry.target)), false);
});

test('AGENTS.md resolves as semantic-merge for a mature update', () => {
  const entries = resolveManifestEntries(loadManifest(ROOT), matureProfile(), 'update');
  const agents = entries.find((entry) => entry.target === 'AGENTS.md');
  assert.equal(agents.ownership, 'semantic-merge');
  assert.notEqual(agents.conflictPolicy, 'overwrite');
});

test('manifest validation rejects managed index.html', () => {
  const manifest = {
    schemaVersion: 2,
    version: 'test',
    updaterSchemaVersion: 2,
    entries: [{
      source: 'index.html',
      logicalId: 'bad:index',
      ownership: 'managed',
      target: 'index.html',
      modes: ['update'],
      projectTypes: ['mature'],
      conflictPolicy: 'replace-if-baseline',
      sha256: '0'.repeat(64)
    }]
  };
  assert.throws(() => validateManifest(manifest), /index\.html.*managed/i);
});

test('manifest validation rejects update-enabled seeds', () => {
  const manifest = {
    schemaVersion: 2,
    version: 'test',
    updaterSchemaVersion: 2,
    entries: [{
      source: 'game-spec.yaml',
      logicalId: 'seed:game-spec',
      ownership: 'new-project-seed',
      target: 'game-spec.yaml',
      modes: ['init', 'update'],
      projectTypes: ['new'],
      conflictPolicy: 'create-only',
      sha256: '0'.repeat(64)
    }]
  };
  assert.throws(() => validateManifest(manifest), /seed.*update/i);
});

test('manifest validation rejects duplicate resolved targets', () => {
  const manifest = loadManifest(ROOT);
  const duplicate = structuredClone(manifest);
  duplicate.entries.push({ ...duplicate.entries[0], logicalId: 'duplicate:logical-id' });
  assert.throws(() => resolveManifestEntries(duplicate, matureProfile(), 'update'), /same target/i);
});

test('manifest validation rejects ambiguous ownership', () => {
  const manifest = loadManifest(ROOT);
  const broken = structuredClone(manifest);
  delete broken.entries[0].ownership;
  assert.throws(() => validateManifest(broken), /ownership/i);
});

test('manifest validation rejects a source path outside the Starter Kit root', () => {
  const manifest = loadManifest(ROOT);
  const broken = structuredClone(manifest);
  broken.entries[0].source = '../outside.txt';
  assert.throws(() => validateManifest(broken, ROOT), /outside target root/i);
});

test('skill mapping resolves starter skills into .agents/skills', () => {
  const entries = resolveManifestEntries(loadManifest(ROOT), matureProfile(), 'update');
  const skill = entries.find((entry) => entry.logicalId === 'skill:game-audio-quality:SKILL.md');
  assert.equal(skill.target, '.agents/skills/game-audio-quality/SKILL.md');
});

test('forbidden second skill root is absent from the mature plan', () => {
  const entries = resolveManifestEntries(loadManifest(ROOT), matureProfile(), 'update');
  assert.equal(entries.some((entry) => entry.target.startsWith('.codex/skills/')), false);
});

test('existing forbidden second skill root blocks update', async () => {
  const { parent, target } = tempFixture('mature-project-codex-root');
  try {
    await assert.rejects(
      executeUpdate({
        sourceRoot: ROOT,
        targetRoot: target,
        profile: 'mature-yandex-phaser',
        mode: 'update',
        dryRun: true
      }),
      /second skill root/i
    );
  } finally {
    removeTemp(parent);
  }
});

test('custom Codex-root profile preserves its project-specific skill', async () => {
  const { parent, target } = tempFixture('mature-project-codex-root');
  try {
    const customProfile = path.join(parent, 'custom-profile.json');
    fs.writeFileSync(customProfile, JSON.stringify({
      ...matureProfile(),
      profileName: 'custom-codex-root',
      skillRoot: '.codex/skills'
    }));
    const sentinel = path.join(target, '.codex', 'skills', 'project-specific', 'SKILL.md');
    const before = sha256File(sentinel);
    const result = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: customProfile,
      mode: 'update',
      dryRun: true
    });
    assert.equal(sha256File(sentinel), before);
    assert.equal(result.created.some((item) => item.target.startsWith('.agents/skills/')), false);
  } finally {
    removeTemp(parent);
  }
});

test('package merge preserves project scripts and identity', () => {
  const target = {
    name: 'game',
    version: '9.0.0',
    scripts: { build: 'project-build', custom: 'project-custom' }
  };
  const source = { scripts: { 'starter-kit:status': 'node status.mjs' } };
  const result = planPackageMerge(source, target);
  assert.equal(result.value.name, 'game');
  assert.equal(result.value.version, '9.0.0');
  assert.equal(result.value.scripts.build, 'project-build');
  assert.equal(result.value.scripts.custom, 'project-custom');
});

test('package merge reports an incompatible script instead of replacing it', () => {
  const result = planPackageMerge(
    { scripts: { build: 'starter-build' } },
    { scripts: { build: 'project-build' } }
  );
  assert.deepEqual(result.conflicts.map((item) => item.key), ['scripts.build']);
  assert.equal(result.value.scripts.build, 'project-build');
});

test('package merge never downgrades an existing dependency', () => {
  const result = planPackageMerge(
    { dependencies: { phaser: '^3.80.0' } },
    { dependencies: { phaser: '^3.90.0' } }
  );
  assert.equal(result.value.dependencies.phaser, '^3.90.0');
  assert.deepEqual(result.conflicts, []);
});

test('package script conflict is non-writing until explicit semantic resolution', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    const packageFile = path.join(target, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    packageJson.scripts['starter-kit:status'] = 'project-status';
    fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
    const before = sha256File(packageFile);
    const first = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update'
    });
    assert.equal(first.conflicts.some((item) => item.logicalId === 'contract:package-json'), true);
    assert.equal(sha256File(packageFile), before);
    await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      resolveSemantic: first.conflicts.map((item) => item.logicalId)
    });
    assert.equal(JSON.parse(fs.readFileSync(packageFile, 'utf8')).scripts['starter-kit:status'], 'project-status');
  } finally {
    removeTemp(parent);
  }
});

test('new-project seed is applied only during init', () => {
  const manifest = loadManifest(ROOT);
  const profile = loadTargetProfile(ROOT, 'new-project', { mode: 'init' });
  const initEntries = resolveManifestEntries(manifest, profile, 'init');
  const updateEntries = resolveManifestEntries(manifest, profile, 'update');
  assert.equal(initEntries.some((entry) => entry.logicalId === 'seed:index-html'), true);
  assert.equal(updateEntries.some((entry) => entry.logicalId === 'seed:index-html'), false);
});

test('init rejects a non-empty existing project', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    await assert.rejects(
      executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init', dryRun: true }),
      /empty target/i
    );
  } finally {
    removeTemp(parent);
  }
});

test('new-project seed is recorded as project-owned after init', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    const result = await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    const state = JSON.parse(fs.readFileSync(path.join(target, '.starter-kit', 'state.json'), 'utf8'));
    assert.equal(result.conflicts.length, 0);
    assert.equal(state.projectOwned['seed:index-html'].target, 'index.html');
    assert.equal(state.projectOwned['seed:game-spec'].target, 'game-spec.yaml');
    assert.equal(state.baseline['seed:index-html'], undefined);
    assert.equal(state.baseline['seed:game-spec'], undefined);
    assert.equal(state.baseline['contract:AGENTS.md'], undefined);
    const packageJson = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts['starter-kit:status'] !== undefined, true);
    assert.equal(packageJson.scripts['starter-kit:package'], undefined);
  } finally {
    removeTemp(parent);
  }
});

test('autonomy seed declares the current kit version and survives fresh init', async () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const seed = path.join(ROOT, 'autonomy', 'state.json');
  const manifest = loadManifest(ROOT);
  const entry = manifest.entries.find((item) => item.logicalId === 'seed:autonomy-state');
  const { parent, target } = tempFixture('empty-new-project');
  try {
    assert.equal(JSON.parse(fs.readFileSync(seed, 'utf8')).starterKitVersion, version);
    assert.equal(entry?.sha256, sha256File(seed));
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'autonomy', 'state.json'), 'utf8')).starterKitVersion, version);
  } finally {
    removeTemp(parent);
  }
});

test('mature dry run preserves product runtime hashes and project-specific skills', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    const before = hashProduct(target);
    const skill = path.join(target, '.agents', 'skills', 'project-specific', 'SKILL.md');
    const skillHash = sha256File(skill);
    const result = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      dryRun: true
    });
    assert.deepEqual(hashProduct(target), before);
    assert.equal(sha256File(skill), skillHash);
    assert.equal(result.created.some((item) => item.target.startsWith('src/')), false);
  } finally {
    removeTemp(parent);
  }
});

test('dry run writes no target metadata or files', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    const before = sha256Tree(target);
    await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      dryRun: true
    });
    assert.equal(sha256Tree(target), before);
    assert.equal(fs.existsSync(path.join(target, '.starter-kit')), false);
  } finally {
    removeTemp(parent);
  }
});

test('same-name changed skill creates a semantic conflict', async () => {
  const { parent, target } = tempFixture('mature-project-conflicting-agents');
  try {
    const result = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      dryRun: true
    });
    assert.equal(
      result.conflicts.some((item) => item.target === '.agents/skills/implementation-cycle/SKILL.md'),
      true
    );
  } finally {
    removeTemp(parent);
  }
});

test('AGENTS semantic conflict creates proposal and merge notes on apply', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
    const before = hashProduct(target);
    const result = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update'
    });
    assert.equal(result.conflicts.some((item) => item.target === 'AGENTS.md'), true);
    assert.equal(fs.existsSync(path.join(target, '.starter-kit', 'conflicts', version, 'AGENTS.md.new')), true);
    assert.equal(fs.existsSync(path.join(target, '.starter-kit', 'conflicts', version, 'AGENTS.md.merge.md')), true);
    assert.deepEqual(hashProduct(target), before);
  } finally {
    removeTemp(parent);
  }
});

test('unresolved semantic merge makes target status non-clean', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'mature-yandex-phaser', mode: 'update' });
    const status = inspectTargetStatus({ sourceRoot: ROOT, targetRoot: target });
    assert.equal(status.status, 'conflicts');
    assert.ok(status.unresolvedConflicts.length > 0);
    const cli = spawnSync(process.execPath, [
      path.join(ROOT, 'tools', 'starter-kit', 'status.mjs'),
      '--target',
      target
    ], { encoding: 'utf8' });
    assert.equal(cli.status, 2, `${cli.stdout}\n${cli.stderr}`);
  } finally {
    removeTemp(parent);
  }
});

test('resolved mature update and repeated dry run are idempotent', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    const first = await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'mature-yandex-phaser', mode: 'update' });
    const resolutionIds = first.conflicts.map((item) => item.logicalId);
    await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      resolveSemantic: resolutionIds
    });
    const dryRun = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      dryRun: true
    });
    assert.equal(dryRun.conflicts.length, 0);
    assert.equal(dryRun.created.length, 0);
    assert.equal(dryRun.updated.length, 0);
  } finally {
    removeTemp(parent);
  }
});

test('resolved mature repeated update is byte-idempotent', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    const first = await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'mature-yandex-phaser', mode: 'update' });
    await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      resolveSemantic: first.conflicts.map((item) => item.logicalId)
    });
    const before = sha256Tree(target, { exclude: ['.starter-kit/update-report.json'] });
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'mature-yandex-phaser', mode: 'update' });
    const after = sha256Tree(target, { exclude: ['.starter-kit/update-report.json'] });
    assert.equal(after, before);
  } finally {
    removeTemp(parent);
  }
});

test('status exposes target profile, manifest and ownership data', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    const status = inspectTargetStatus({ sourceRoot: ROOT, targetRoot: target });
    assert.equal(status.sourceVersion, fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim());
    assert.equal(status.updaterSchemaVersion, 2);
    assert.equal(status.projectType, 'new');
    assert.equal(status.skillRoot, '.codex/skills');
    assert.match(status.sourceManifestHash, /^[a-f0-9]{64}$/);
  } finally {
    removeTemp(parent);
  }
});

test('status detects a locally modified managed file', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    fs.appendFileSync(path.join(target, 'tools', 'starter-kit', 'status.mjs'), '\n// local drift\n');
    const status = inspectTargetStatus({ sourceRoot: ROOT, targetRoot: target });
    assert.equal(status.status, 'modified');
    assert.equal(status.modifiedManagedFiles.includes('tools/starter-kit/status.mjs'), true);
  } finally {
    removeTemp(parent);
  }
});

test('explicit managed resolution replaces only a drifted baseline-managed file', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    const managed = path.join(target, '.starter-kit', 'core', 'CODEX_ENGINEERING_SYSTEM.md');
    fs.appendFileSync(managed, '\nlocal managed drift\n');
    const result = await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'new-project',
      mode: 'update',
      resolveManaged: ['managed:codex-engineering-system-core']
    });
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.resolved.some((item) => item.resolution === 'replace-managed-drift'), true);
    assert.equal(sha256File(managed), sha256File(path.join(ROOT, '.starter-kit', 'core', 'CODEX_ENGINEERING_SYSTEM.md')));
    assert.equal(inspectTargetStatus({ sourceRoot: ROOT, targetRoot: target }).status, 'clean');
  } finally {
    removeTemp(parent);
  }
});

test('status detects a forbidden second skill root', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    fs.mkdirSync(path.join(target, '.agents', 'skills', 'unexpected'), { recursive: true });
    fs.writeFileSync(path.join(target, '.agents', 'skills', 'unexpected', 'SKILL.md'), '# unexpected');
    const status = inspectTargetStatus({ sourceRoot: ROOT, targetRoot: target });
    assert.equal(status.status, 'modified');
    assert.equal(status.forbiddenSecondRootStatus, 'violation');
  } finally {
    removeTemp(parent);
  }
});

test('status detects a manifest schema mismatch', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    const manifestFile = path.join(target, '.starter-kit', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.schemaVersion = 999;
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    const status = inspectTargetStatus({ sourceRoot: target, targetRoot: target });
    assert.equal(status.status, 'modified');
    assert.equal(status.violations.some((item) => item.includes('Manifest schema mismatch')), true);
  } finally {
    removeTemp(parent);
  }
});

test('update never creates a release ZIP in the target project', async () => {
  const { parent, target } = tempFixture('mature-project-agents-root');
  try {
    await executeUpdate({
      sourceRoot: ROOT,
      targetRoot: target,
      profile: 'mature-yandex-phaser',
      mode: 'update',
      dryRun: true
    });
    const zips = fs.readdirSync(target, { recursive: true }).filter((entry) => String(entry).endsWith('.zip'));
    assert.deepEqual(zips, []);
  } finally {
    removeTemp(parent);
  }
});

test('source manifest hash is deterministic', () => {
  const first = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'starter-kit.manifest.json'))).digest('hex');
  const second = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'starter-kit.manifest.json'))).digest('hex');
  assert.equal(first, second);
});

test('Windows autocrlf checkout preserves canonical manifest bytes and binary files', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-kit-eol-'));
  const source = path.join(parent, 'source');
  const canonical = path.join(parent, 'canonical');
  const checkout = path.join(parent, 'windows-checkout');
  const binary = path.join(source, 'fixtures', 'binary-eol-probe.png');
  const binaryBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x0d, 0x0a]);
  const runGit = (cwd, args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  };
  try {
    fs.cpSync(ROOT, source, {
      recursive: true,
      filter: (candidate) => path.basename(candidate) !== '.git'
    });
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, binaryBytes);
    runGit(source, ['init', '--initial-branch=main']);
    runGit(source, ['add', '--all']);
    runGit(source, ['-c', 'user.name=Starter Kit Test', '-c', 'user.email=starter-kit-test@example.invalid', 'commit', '-m', 'fixture']);
    runGit(parent, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'clone', source, canonical]);
    const stateFile = path.join(canonical, 'autonomy', 'state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.starterKitVersion = fs.readFileSync(path.join(canonical, 'VERSION'), 'utf8').trim();
    fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    const manifest = spawnSync(process.execPath, [path.join(canonical, 'tools', 'starter-kit', 'build-manifest.mjs')], { cwd: canonical, encoding: 'utf8' });
    assert.equal(manifest.status, 0, `${manifest.stdout}\n${manifest.stderr}`);
    runGit(canonical, ['add', '--all']);
    runGit(canonical, ['-c', 'user.name=Starter Kit Test', '-c', 'user.email=starter-kit-test@example.invalid', 'commit', '-m', 'canonical fixture']);
    runGit(parent, ['-c', 'core.autocrlf=true', '-c', 'core.eol=crlf', 'clone', canonical, checkout]);
    const eol = spawnSync('git', ['ls-files', '--eol', '--', 'AGENTS.md', 'starter-kit.manifest.json'], { cwd: checkout, encoding: 'utf8' });
    assert.equal(eol.status, 0, `${eol.stdout}\n${eol.stderr}`);
    assert.match(eol.stdout, /w\/lf/);
    assert.deepEqual(fs.readFileSync(path.join(checkout, 'fixtures', 'binary-eol-probe.png')), binaryBytes);
    const selfTest = spawnSync(process.execPath, [path.join(checkout, 'tools', 'starter-kit', 'self-test.mjs')], { cwd: checkout, encoding: 'utf8' });
    assert.equal(selfTest.status, 0, `${selfTest.stdout}\n${selfTest.stderr}`);
  } finally {
    removeTemp(parent);
  }
});

test('Windows project-with-spaces init and copied self-test pass', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yg kit windows '));
  const target = path.join(parent, 'project with spaces');
  try {
    const init = spawnSync(process.execPath, [
      path.join(ROOT, 'tools', 'starter-kit', 'init-project.mjs'),
      '--target',
      target,
      '--profile',
      'new-project'
    ], { encoding: 'utf8' });
    assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);
    const selfTest = spawnSync(process.execPath, [
      path.join(target, 'tools', 'starter-kit', 'self-test.mjs')
    ], { cwd: target, encoding: 'utf8' });
    assert.equal(selfTest.status, 0, `${selfTest.stdout}\n${selfTest.stderr}`);
    const status = spawnSync(process.execPath, [
      path.join(target, 'tools', 'starter-kit', 'status.mjs')
    ], { cwd: target, encoding: 'utf8' });
    assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  } finally {
    removeTemp(parent);
  }
});

test('0.5.1 screenshot gate migration is delivered, baseline-updated and idempotent', async () => {
  const { parent, target } = tempFixture('empty-new-project');
  try {
    const first = await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'init' });
    assert.equal(first.conflicts.length, 0);
    const migration = path.join(target, 'migrations', '0.5.1-screenshot-visual-gate.md');
    assert.equal(fs.existsSync(migration), true);
    assert.match(fs.readFileSync(migration, 'utf8'), /SCREENSHOT_VISUAL_GATE/);
    const before = sha256Tree(target, { exclude: ['.starter-kit/update-report.json'] });
    const second = await executeUpdate({ sourceRoot: ROOT, targetRoot: target, profile: 'new-project', mode: 'update' });
    const after = sha256Tree(target, { exclude: ['.starter-kit/update-report.json'] });
    assert.equal(second.conflicts.length, 0);
    assert.equal(after, before);
  } finally {
    removeTemp(parent);
  }
});
