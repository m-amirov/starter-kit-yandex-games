import fs from 'node:fs';
import path from 'node:path';
import {
  assertNoReparseBetween,
  isDirectoryNonEmpty,
  posix,
  readJson,
  resolveInside,
  sha256Buffer,
  sha256File,
  stableJson,
  writeFileIfChanged,
  writeJson
} from './lib.mjs';
import { loadManifest, resolveManifestEntries } from './manifest.mjs';
import { planPackageMerge } from './package-merge.mjs';
import { loadTargetProfile, validateTargetProfile } from './profile.mjs';

const STATE_SCHEMA_VERSION = 2;
const UPDATER_SCHEMA_VERSION = 2;

function emptyState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    updaterSchemaVersion: UPDATER_SCHEMA_VERSION,
    installedVersion: 'unknown',
    attemptedVersion: null,
    sourceManifestHash: null,
    targetProfile: null,
    baseline: {},
    projectOwned: {},
    semanticAcceptances: {},
    conflicts: [],
    appliedMigrations: []
  };
}

function readState(targetRoot) {
  const file = path.join(targetRoot, '.starter-kit', 'state.json');
  if (!fs.existsSync(file)) return emptyState();
  const state = readJson(file);
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`Target state schema mismatch: ${state.schemaVersion}`);
  }
  return state;
}

function targetProfileFile(targetRoot) {
  return path.join(targetRoot, '.starter-kit', 'target.json');
}

function loadProfileForRun(sourceRoot, targetRoot, requestedProfile, mode) {
  if (requestedProfile) return loadTargetProfile(sourceRoot, requestedProfile, { mode });
  const stored = targetProfileFile(targetRoot);
  if (fs.existsSync(stored)) return validateTargetProfile(readJson(stored));
  return loadTargetProfile(sourceRoot, undefined, {
    mode,
    targetNonEmpty: isDirectoryNonEmpty(targetRoot)
  });
}

function profileSnapshot(profile) {
  return structuredClone(profile);
}

function conflictFiles(targetRoot, version, target) {
  const base = path.join(targetRoot, '.starter-kit', 'conflicts', version, ...target.split('/'));
  return {
    candidate: `${base}.new`,
    notes: `${base}.merge.md`
  };
}

function writeConflict(sourceRoot, targetRoot, manifest, entry, reason, dryRun) {
  const files = conflictFiles(targetRoot, manifest.version, entry.target);
  if (!dryRun) {
    const source = resolveInside(sourceRoot, entry.source);
    assertNoReparseBetween(targetRoot, files.candidate);
    fs.mkdirSync(path.dirname(files.candidate), { recursive: true });
    fs.copyFileSync(source, files.candidate);
    const notes = [
      `# Semantic merge required: ${entry.target}`,
      '',
      `- Logical ID: \`${entry.logicalId}\``,
      `- Ownership: \`${entry.ownership}\``,
      `- Starter Kit version: \`${manifest.version}\``,
      `- Reason: ${reason}`,
      `- Current project file remains unchanged: \`${entry.target}\``,
      `- Proposed source is stored at: \`${posix(path.relative(targetRoot, files.candidate))}\``,
      '',
      'Review both files, preserve project-specific requirements, and apply the merge manually.',
      'Then run the updater with `--resolve-semantic <logical-id>` to record explicit acceptance.',
      'Yandex requirements and project-owned runtime remain authoritative.',
      ''
    ].join('\n');
    fs.writeFileSync(files.notes, notes);
  }
  return {
    logicalId: entry.logicalId,
    target: entry.target,
    ownership: entry.ownership,
    reason,
    candidate: posix(path.relative(targetRoot, files.candidate)),
    mergeNotes: posix(path.relative(targetRoot, files.notes))
  };
}

function removeConflictFiles(targetRoot, version, target) {
  const files = conflictFiles(targetRoot, version, target);
  for (const file of [files.candidate, files.notes]) {
    assertNoReparseBetween(targetRoot, file);
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
}

function detectSecondSkillRoot(targetRoot, profile) {
  if (profile.allowSecondSkillRoot) return [];
  const roots = ['.agents/skills', '.codex/skills'];
  return roots.filter((root) => root !== profile.skillRoot && isDirectoryNonEmpty(path.join(targetRoot, root)));
}

function copySource(sourceRoot, targetRoot, entry) {
  const source = resolveInside(sourceRoot, entry.source);
  const target = resolveInside(targetRoot, entry.target);
  assertNoReparseBetween(targetRoot, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function processPackageEntry({
  sourceRoot,
  targetRoot,
  entry,
  state,
  dryRun,
  resolveSemantic,
  report,
  nextState,
  mode
}) {
  const sourcePackage = readJson(resolveInside(sourceRoot, entry.source));
  const targetScriptNames = sourcePackage.starterKit?.targetScripts ?? Object.keys(sourcePackage.scripts ?? {});
  const source = {
    scripts: Object.fromEntries(
      Object.entries(sourcePackage.scripts ?? {}).filter(([name]) => targetScriptNames.includes(name))
    )
  };
  const targetFile = resolveInside(targetRoot, entry.target);
  assertNoReparseBetween(targetRoot, targetFile);
  const target = fs.existsSync(targetFile)
    ? readJson(targetFile)
    : (mode === 'init'
      ? {
        name: path.basename(targetRoot).toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {}
      }
      : {});
  const merge = planPackageMerge(source, target);
  const currentTargetHash = fs.existsSync(targetFile) ? sha256File(targetFile) : null;
  const accepted = state.semanticAcceptances[entry.logicalId];
  const explicitResolution = resolveSemantic.has(entry.logicalId) || resolveSemantic.has(entry.target);
  const acceptedUnchanged = merge.conflicts.length
    && accepted
    && accepted.sourceHash === entry.sha256
    && accepted.targetHash === currentTargetHash;
  if (acceptedUnchanged) {
    report.preserved.push({ logicalId: entry.logicalId, target: entry.target, ownership: 'semantic-merge' });
    return;
  }
  if (merge.conflicts.length && !explicitResolution) {
    for (const conflict of merge.conflicts) {
      report.conflicts.push({
        logicalId: entry.logicalId,
        target: entry.target,
        ownership: 'semantic-merge',
        reason: `Package merge conflict at ${conflict.key}`,
        current: conflict.current,
        proposed: conflict.proposed
      });
    }
    return;
  }
  if (merge.conflicts.length && explicitResolution) {
    report.resolved.push({ logicalId: entry.logicalId, target: entry.target });
  }
  if (merge.changed) {
    report.merged.push({ logicalId: entry.logicalId, target: entry.target });
    if (!dryRun) writeFileIfChanged(targetFile, stableJson(merge.value));
  } else {
    report.preserved.push({ logicalId: entry.logicalId, target: entry.target });
  }
  const resultingHash = sha256Buffer(Buffer.from(stableJson(merge.value)));
  nextState.semanticAcceptances[entry.logicalId] = {
    target: entry.target,
    sourceHash: entry.sha256,
    targetHash: resultingHash
  };
}

function processEntry(context) {
  const {
    sourceRoot,
    targetRoot,
    manifest,
    entry,
    state,
    nextState,
    dryRun,
    resolveSemantic,
    report
  } = context;
  if (entry.logicalId === 'contract:package-json') {
    processPackageEntry(context);
    return;
  }
  const targetFile = resolveInside(targetRoot, entry.target);
  const exists = fs.existsSync(targetFile);
  const targetHash = exists ? sha256File(targetFile) : null;
  const baseline = state.baseline[entry.logicalId];
  const accepted = state.semanticAcceptances[entry.logicalId];

  if (entry.ownership === 'new-project-seed') {
    if (!exists) {
      report.created.push({ logicalId: entry.logicalId, target: entry.target, ownership: 'project-owned-after-init' });
      if (!dryRun) copySource(sourceRoot, targetRoot, entry);
    } else {
      report.preserved.push({ logicalId: entry.logicalId, target: entry.target, ownership: 'project-owned' });
    }
    nextState.projectOwned[entry.logicalId] = { target: entry.target, sourceHashAtInit: entry.sha256 };
    delete nextState.baseline[entry.logicalId];
    return;
  }

  const semantic = entry.ownership === 'semantic-merge'
    || entry.ownership === 'target-mapped'
    || entry.conflictPolicy === 'semantic-merge';
  const explicitResolution = resolveSemantic.has(entry.logicalId) || resolveSemantic.has(entry.target);

  if (!exists) {
    report.created.push({ logicalId: entry.logicalId, target: entry.target, ownership: entry.ownership });
    if (!dryRun) copySource(sourceRoot, targetRoot, entry);
    if (semantic) {
      nextState.semanticAcceptances[entry.logicalId] = {
        target: entry.target,
        sourceHash: entry.sha256,
        targetHash: entry.sha256
      };
      delete nextState.baseline[entry.logicalId];
    } else {
      nextState.baseline[entry.logicalId] = { target: entry.target, sourceHash: entry.sha256, targetHash: entry.sha256 };
    }
    return;
  }

  if (targetHash === entry.sha256) {
    report.preserved.push({ logicalId: entry.logicalId, target: entry.target });
    if (semantic) {
      nextState.semanticAcceptances[entry.logicalId] = { target: entry.target, sourceHash: entry.sha256, targetHash };
      delete nextState.baseline[entry.logicalId];
    } else {
      nextState.baseline[entry.logicalId] = { target: entry.target, sourceHash: entry.sha256, targetHash };
    }
    return;
  }

  if (explicitResolution && semantic) {
    report.resolved.push({ logicalId: entry.logicalId, target: entry.target });
    nextState.semanticAcceptances[entry.logicalId] = {
      target: entry.target,
      sourceHash: entry.sha256,
      targetHash
    };
    delete nextState.baseline[entry.logicalId];
    if (!dryRun) removeConflictFiles(targetRoot, manifest.version, entry.target);
    return;
  }

  if (semantic) {
    if (accepted && accepted.sourceHash === entry.sha256 && accepted.targetHash === targetHash) {
      report.preserved.push({ logicalId: entry.logicalId, target: entry.target, ownership: entry.ownership });
      return;
    }
    const reason = accepted
      ? (accepted.sourceHash !== entry.sha256 ? 'Starter-owned proposal changed since explicit acceptance' : 'Project file changed since explicit acceptance')
      : 'Existing project file differs from the Starter Kit proposal';
    report.conflicts.push(writeConflict(sourceRoot, targetRoot, manifest, entry, reason, dryRun));
    return;
  }

  if (baseline && baseline.targetHash === targetHash) {
    report.updated.push({ logicalId: entry.logicalId, target: entry.target });
    if (!dryRun) copySource(sourceRoot, targetRoot, entry);
    nextState.baseline[entry.logicalId] = { target: entry.target, sourceHash: entry.sha256, targetHash: entry.sha256 };
    return;
  }

  const reason = baseline ? 'Managed file has local modifications' : 'Existing file has no managed baseline';
  report.conflicts.push(writeConflict(sourceRoot, targetRoot, manifest, entry, reason, dryRun));
}

export async function executeUpdate(options) {
  const {
    sourceRoot,
    targetRoot,
    profile: requestedProfile,
    mode = 'update',
    dryRun = false,
    resolveSemantic = []
  } = options;
  if (!['init', 'update'].includes(mode)) throw new Error(`Unsupported updater mode: ${mode}`);
  const source = path.resolve(sourceRoot);
  const target = path.resolve(targetRoot);
  if (source === target) throw new Error('Source and target must be different directories');
  if (fs.existsSync(target)) assertNoReparseBetween(target, target);
  if (mode === 'init' && isDirectoryNonEmpty(target)) {
    throw new Error('Init requires an empty target; use update with an explicit profile for an existing project');
  }
  if (!dryRun) fs.mkdirSync(target, { recursive: true });
  const profile = loadProfileForRun(source, target, requestedProfile, mode);
  const secondRoots = detectSecondSkillRoot(target, profile);
  if (secondRoots.length) throw new Error(`Forbidden second skill root detected: ${secondRoots.join(', ')}`);

  const manifest = loadManifest(source);
  const sourceManifestFile = path.join(source, 'starter-kit.manifest.json');
  const sourceManifestHash = sha256File(sourceManifestFile);
  const entries = resolveManifestEntries(manifest, profile, mode);
  const state = readState(target);
  const nextState = structuredClone(state);
  nextState.updaterSchemaVersion = UPDATER_SCHEMA_VERSION;
  nextState.attemptedVersion = manifest.version;
  nextState.sourceManifestHash = sourceManifestHash;
  nextState.targetProfile = profileSnapshot(profile);
  const report = {
    schemaVersion: 2,
    updaterSchemaVersion: UPDATER_SCHEMA_VERSION,
    updaterVersion: manifest.version,
    mode,
    dryRun,
    fromVersion: state.installedVersion,
    toVersion: manifest.version,
    sourceManifestHash,
    targetProfile: profile.profileName ?? requestedProfile ?? 'stored',
    projectType: profile.projectType,
    skillRoot: profile.skillRoot,
    created: [],
    updated: [],
    preserved: [],
    merged: [],
    resolved: [],
    projectOwned: Object.entries(profile.ownershipOverrides)
      .filter(([, ownership]) => ownership === 'project-owned')
      .map(([targetPattern]) => targetPattern),
    skippedSeeds: manifest.entries
      .filter((entry) => entry.ownership === 'new-project-seed' && !entries.some((resolved) => resolved.logicalId === entry.logicalId))
      .map((entry) => entry.logicalId),
    conflicts: [],
    forbiddenSecondRoots: secondRoots,
    migrationGuides: manifest.entries
      .filter((entry) => entry.logicalId.startsWith('migration:') && entry.modes.includes(mode))
      .map((entry) => entry.target ?? entry.targetTemplate)
  };

  const resolutions = new Set(resolveSemantic);
  const resolvable = new Set(entries
    .filter((entry) => entry.ownership === 'semantic-merge'
      || entry.ownership === 'target-mapped'
      || entry.conflictPolicy === 'semantic-merge'
      || entry.logicalId === 'contract:package-json')
    .flatMap((entry) => [entry.logicalId, entry.target]));
  for (const resolution of resolutions) {
    if (!resolvable.has(resolution)) throw new Error(`Unknown or non-semantic resolution: ${resolution}`);
  }
  for (const entry of entries) {
    processEntry({
      sourceRoot: source,
      targetRoot: target,
      manifest,
      entry,
      state,
      nextState,
      dryRun,
      resolveSemantic: resolutions,
      report
    });
  }

  nextState.conflicts = report.conflicts;
  nextState.pendingMigrations = report.conflicts.length ? report.migrationGuides : [];
  if (!report.conflicts.length) {
    nextState.installedVersion = manifest.version;
    nextState.appliedMigrations = [...new Set([...(nextState.appliedMigrations ?? []), ...report.migrationGuides])];
  }

  if (!dryRun) {
    const starterDirectory = path.join(target, '.starter-kit');
    assertNoReparseBetween(target, starterDirectory);
    fs.mkdirSync(starterDirectory, { recursive: true });
    writeJson(path.join(starterDirectory, 'target.json'), profileSnapshot(profile));
    writeFileIfChanged(path.join(starterDirectory, 'manifest.json'), fs.readFileSync(sourceManifestFile, 'utf8'));
    writeJson(path.join(starterDirectory, 'update-report.json'), report);
    const previousStable = stableJson(state);
    const nextStable = stableJson(nextState);
    if (previousStable !== nextStable) writeFileIfChanged(path.join(starterDirectory, 'state.json'), nextStable);
  }
  return report;
}
