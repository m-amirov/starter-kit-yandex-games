import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import { ROOT } from '../../tools/starter-kit/lib.mjs';
import { GuaranteedReporter } from '../../tools/yandex/external-runtime-provider/lib/reporting.mjs';
import {
  EXTERNAL_STATUSES,
  REQUIRED_PROVIDER_REPORTS,
  auditNormalizedEvidence,
  auditProviderDistribution,
  auditRedactionArtifacts,
  auditReleaseContamination,
  normalizeExternalEvidence,
  redactExternalEvidence,
  resolveExternalEvidenceConflict,
  verifyProviderIntegrity
} from '../../tools/yandex/external-evidence.mjs';

const PROVIDER_ROOT = path.join(ROOT, 'tools', 'yandex', 'external-runtime-provider');
const MANIFEST_SHA = '3a73a9feb15de4b38f2ecd57bec167f5c280d8e0780f394b7d5a122e45a3755a';
const GAME_SESSION_SHA = 'cf31050a3eafcaf3424ee912d81eb3edb07d207dfcfe6a8e4b492f3d05075d3e';
const STAGES = [
  'INTEGRITY_VALIDATION', 'BROWSER_LAUNCH', 'CDP_CONNECTION', 'GAME_TARGET_DISCOVERY',
  'GAME_OOPIF_ATTACH', 'ORIGIN_IDENTITY_PROOF', 'OBSERVER_START', 'PASSIVE_OBSERVATION',
  'REPORT_FINALIZATION', 'CONTROLLED_SHUTDOWN'
];

function raw(overrides = {}) {
  const origin = 'https://app-551358.games.s3.yandex.net/';
  const report = {
    schemaVersion: 2,
    providerStatus: 'COMPLETE',
    finalVerdict: 'EXTERNAL_EVIDENCE_PASS',
    startedAt: '2026-08-29T03:32:01.622Z',
    completedAt: '2026-08-29T03:32:17.794Z',
    stages: Object.fromEntries(STAGES.map((stage) => [stage, { status: 'COMPLETED' }])),
    provenance: {
      providerVersion: 'hardened-draft-runtime-harness-1.3.0',
      manifestSha256: MANIFEST_SHA,
      upstreamRepository: 'Nioris/yandex-games-debug-checker',
      upstreamCommit: '0bc5ef9123f471b43c0a2683afb990fe0793f9a5',
      upstreamCandidate: 'v1.2.8-test',
      gameSessionSha256: GAME_SESSION_SHA,
      profileMode: 'ephemeral',
      target: { origin: 'https://yandex.ru', pathname: '/games/app/551358', appId: '551358', query: {} }
    },
    browser: { product: 'Chrome/140.0.0.0' },
    targetIdentity: {
      targetId: 'game-target', targetType: 'iframe', cdpSessionId: 'game-session',
      executionContextId: 7, origin, runtimeOrigin: origin, observerOrigin: origin,
      expectedOrigin: origin, appId: '551358'
    },
    mutationLedger: { mutationCapableOperationCount: 0, mutationCapableOperations: [], passiveObservations: [] },
    ...overrides
  };
  return {
    report,
    evidence: {
      providerStatus: report.providerStatus,
      finalVerdict: report.finalVerdict,
      targetIdentity: report.targetIdentity,
      mutationLedger: report.mutationLedger
    },
    runState: {
      providerStatus: report.providerStatus,
      finalVerdict: report.finalVerdict,
      stages: report.stages,
      startedAt: report.startedAt,
      completedAt: report.completedAt
    }
  };
}

function normalize(overrides = {}, options = {}) {
  return normalizeExternalEvidence({
    ...raw(overrides),
    artifactPaths: Object.fromEntries(REQUIRED_PROVIDER_REPORTS.map((name) => [name, `artifacts/evidence/external/yandex-runtime/run/${name}`])),
    metadata: { starterKitVersion: '0.5.7', project: 'fixture', locale: 'ru', viewport: { width: 1280, height: 720 } },
    actualManifestSha256: MANIFEST_SHA,
    ...options
  });
}

async function copyProviderFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-external-provider-'));
  fs.cpSync(PROVIDER_ROOT, root, { recursive: true });
  return root;
}

test('managed provider manifest and every runtimeClosure file preserve validated raw-byte hashes', async () => {
  const result = await verifyProviderIntegrity({ providerRoot: PROVIDER_ROOT });
  assert.equal(result.status, 'PASS');
  assert.equal(result.actualManifestSha256, MANIFEST_SHA);
  assert.equal(result.runtimeClosure.length, 6);
  assert.equal(result.runtimeClosure.every((entry) => entry.identical), true);
});

test('provider registry declares the validated optional advisory pin and explicit auth workflow', () => {
  const registry = fs.readFileSync(path.join(ROOT, 'config', 'yandex-external-evidence-providers.yaml'), 'utf8');
  for (const token of [
    'id: yandex-draft-runtime-hardened', 'authority: advisory', 'optional: true',
    'authenticatedRun: explicit', 'officialYandexTool: false',
    'providerVersion: hardened-draft-runtime-harness-1.3.0',
    `validatedManifestSha256: ${MANIFEST_SHA}`,
    'validatedRunId: 2026-08-29T03-32-01-617Z-551358'
  ]) assert.match(registry, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('managed validation record preserves controlled live metadata without changing the pinned manifest', () => {
  const record = JSON.parse(fs.readFileSync(path.join(PROVIDER_ROOT, 'validation-record.json'), 'utf8'));
  assert.equal(record.providerVersion, 'hardened-draft-runtime-harness-1.3.0');
  assert.equal(record.validatedManifestSha256, MANIFEST_SHA);
  assert.equal(record.validatedRunId, '2026-08-29T03-32-01-617Z-551358');
  assert.equal(record.validatedProviderVerdict, 'PASS_LIVE_HARDENED_PROVIDER_VALIDATION');
});

test('provenance inputs remain metadata-only and may be physically absent', async () => {
  const result = await auditProviderDistribution({ providerRoot: PROVIDER_ROOT });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.physicalProvenanceInputs, []);
});

test('historical reports and non-closure provider files are not distributable', async () => {
  const root = await copyProviderFixture();
  try {
    fs.writeFileSync(path.join(root, 'OLD_LIVE_REPORT.md'), 'historical');
    await assert.rejects(auditProviderDistribution({ providerRoot: root }), /PROVIDER_DISTRIBUTION_UNEXPECTED_FILE/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing runtime file blocks provider integrity', async () => {
  const root = await copyProviderFixture();
  try {
    fs.rmSync(path.join(root, 'lib', 'game-session.mjs'));
    await assert.rejects(verifyProviderIntegrity({ providerRoot: root }), /RUNTIME_CLOSURE_FILE_MISSING/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runtime hash mismatch blocks without repinning', async () => {
  const root = await copyProviderFixture();
  try {
    fs.appendFileSync(path.join(root, 'lib', 'game-session.mjs'), '\n');
    await assert.rejects(verifyProviderIntegrity({ providerRoot: root }), /RUNTIME_CLOSURE_HASH_MISMATCH/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid provenance metadata blocks', async () => {
  const root = await copyProviderFixture();
  try {
    const file = path.join(root, 'integrity-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.provenanceInputs[0].runtimeRequired = true;
    fs.writeFileSync(file, JSON.stringify(manifest));
    await assert.rejects(verifyProviderIntegrity({ providerRoot: root, enforceValidatedManifestHash: false }), /PROVENANCE_METADATA_INVALID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('historical provenance runtime dependency blocks', async () => {
  const root = await copyProviderFixture();
  try {
    const file = path.join(root, 'integrity-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.runtimeClosure[0].path = manifest.provenanceInputs[0].historicalPath;
    fs.mkdirSync(path.dirname(path.join(root, manifest.runtimeClosure[0].path)), { recursive: true });
    fs.copyFileSync(path.join(root, 'hardened-live-observer.js'), path.join(root, manifest.runtimeClosure[0].path));
    fs.writeFileSync(file, JSON.stringify(manifest));
    await assert.rejects(verifyProviderIntegrity({ providerRoot: root, enforceValidatedManifestHash: false }), /RUNTIME_PROVENANCE_DEPENDENCY_FORBIDDEN|RUNTIME_CLOSURE_UNKNOWN_SOURCE/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('remote executable source blocks distribution audit', async () => {
  const root = await copyProviderFixture();
  try {
    fs.appendFileSync(path.join(root, 'hardened-live-observer.js'), "\nfetch('https://example.com/executable.js')\n");
    await assert.rejects(auditProviderDistribution({ providerRoot: root, verifyHashes: false }), /RUNTIME_REMOTE_EXECUTABLE_SOURCE_FORBIDDEN/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unknown provider version blocks', async () => {
  const root = await copyProviderFixture();
  try {
    const file = path.join(root, 'integrity-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.providerVersion = 'latest';
    fs.writeFileSync(file, JSON.stringify(manifest));
    await assert.rejects(verifyProviderIntegrity({ providerRoot: root, enforceValidatedManifestHash: false }), /UNKNOWN_RUNTIME_PROVIDER_VERSION/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('outer-shell-only evidence is NOT VERIFIED even when raw provider status says PASS', () => {
  const shell = 'https://yandex.ru/';
  assert.equal(normalize({ targetIdentity: { targetId: 'outer', targetType: 'page', cdpSessionId: 's', executionContextId: 1, origin: shell, runtimeOrigin: shell, observerOrigin: shell, expectedOrigin: 'https://app-551358.games.s3.yandex.net/', appId: '551358' } }).normalizedStatus, 'EXTERNAL_EVIDENCE_NOT_VERIFIED');
});

test('valid OOPIF proof can normalize provider PASS', () => {
  const result = normalize();
  assert.equal(result.normalizedStatus, 'EXTERNAL_EVIDENCE_PASS');
  assert.equal(result.runtimeTargetIdentity.targetType, 'iframe');
});

test('missing cdpSessionId prevents PASS', () => {
  const value = raw().report.targetIdentity;
  assert.equal(normalize({ targetIdentity: { ...value, cdpSessionId: null } }).normalizedStatus, 'EXTERNAL_EVIDENCE_NOT_VERIFIED');
});

test('missing gameSessionSha256 prevents PASS', () => {
  const value = raw().report.provenance;
  assert.equal(normalize({ provenance: { ...value, gameSessionSha256: null } }).normalizedStatus, 'EXTERNAL_EVIDENCE_NOT_VERIFIED');
});

test('mutation ledger above zero fails passive provider invariant', () => {
  const mutationLedger = { mutationCapableOperationCount: 1, mutationCapableOperations: ['Storage.setItem'], passiveObservations: [] };
  assert.equal(normalize({ mutationLedger }).normalizedStatus, 'EXTERNAL_EVIDENCE_FAIL');
});

test('authentication secrets are redacted', () => {
  const value = redactExternalEvidence({ authorization: 'Bearer secret', cookie: 'Session_id=secret', url: 'https://yandex.ru/games/app/551358?token=secret' });
  assert.doesNotMatch(JSON.stringify(value), /Bearer secret|Session_id=secret|token=secret/);
});

test('profile paths are redacted', () => {
  const profile = 'C:\\Users\\tester\\yg-hardened-profile-secret';
  const value = redactExternalEvidence({ message: `--user-data-dir=${profile}`, profilePath: profile }, [profile]);
  assert.doesNotMatch(JSON.stringify(value), /tester|profile-secret/);
});

test('safe technical provenance is retained', () => {
  const result = normalize();
  assert.equal(result.provenance.appId, '551358');
  assert.equal(result.provenance.targetId, 'game-target');
  assert.equal(result.provenance.cdpSessionId, 'game-session');
  assert.equal(result.provenance.executionContextId, 7);
  assert.equal(result.provenance.gameSessionSha256, GAME_SESSION_SHA);
  assert.equal(result.provenance.actualManifestSha256, MANIFEST_SHA);
});

test('incomplete stage history prevents PASS', () => {
  assert.equal(normalize({ stages: { INTEGRITY_VALIDATION: { status: 'COMPLETED' } } }).normalizedStatus, 'EXTERNAL_EVIDENCE_NOT_VERIFIED');
});

test('timeout and provider errors normalize separately from game defects', () => {
  const result = normalize({ providerStatus: 'ERROR', finalVerdict: 'PROVIDER_ERROR', errorClassification: 'GAME_TARGET_TIMEOUT' });
  assert.equal(result.normalizedStatus, 'EXTERNAL_EVIDENCE_ERROR');
  assert.equal(result.classification, 'tooling-error');
});

test('partial reports persist status and stage history but fail audit completeness', () => {
  const result = normalize({ providerStatus: 'ERROR', finalVerdict: 'PROVIDER_ERROR' }, { artifactPaths: { 'report.json': 'report.json', 'run-state.json': 'run-state.json' } });
  const audit = auditNormalizedEvidence(result);
  assert.equal(result.artifactCompleteness, 'partial');
  assert.equal(audit.status, 'BLOCK');
  assert.ok(Object.keys(result.stageHistory).length > 0);
});

test('validated reporter creates every guaranteed partial artifact on provider error', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-provider-partial-'));
  try {
    const reporter = new GuaranteedReporter(parent);
    await reporter.initialize({ runId: 'partial-fixture' });
    await reporter.startStage('INTEGRITY_VALIDATION');
    const error = new Error('fixture timeout');
    error.classification = 'INTEGRITY_TIMEOUT';
    await reporter.failStage('INTEGRITY_VALIDATION', error);
    for (const name of REQUIRED_PROVIDER_REPORTS) assert.equal(fs.existsSync(path.join(parent, name)), true, name);
    const state = JSON.parse(fs.readFileSync(path.join(parent, 'run-state.json'), 'utf8'));
    assert.equal(state.stages.INTEGRITY_VALIDATION.status, 'TIMEOUT');
    assert.equal(state.providerStatus, 'PROVIDER_ERROR');
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('Starter PASS plus External FAIL requires review', () => {
  assert.equal(resolveExternalEvidenceConflict({ starterStatus: 'PASS', externalStatus: 'EXTERNAL_EVIDENCE_FAIL' }).status, 'REVIEW_REQUIRED');
});

test('Starter PASS plus External WARN requires review', () => {
  assert.equal(resolveExternalEvidenceConflict({ starterStatus: 'PASS', externalStatus: 'EXTERNAL_EVIDENCE_WARN' }).status, 'REVIEW_REQUIRED');
});

test('Starter FAIL remains FAIL despite External PASS', () => {
  assert.equal(resolveExternalEvidenceConflict({ starterStatus: 'FAIL', externalStatus: 'EXTERNAL_EVIDENCE_PASS' }).status, 'FAIL');
});

test('manual requirement remains manual when External PASS is not full-clause proof', () => {
  assert.equal(resolveExternalEvidenceConflict({ starterStatus: 'MANUAL', externalStatus: 'EXTERNAL_EVIDENCE_PASS', externalProvesFullClause: false }).status, 'MANUAL');
});

test('heuristic external evidence is explicitly classified', () => {
  const result = normalize({ requirementMapping: [{ requirementId: '1.19.1', status: 'PASS', classification: 'heuristic' }] });
  assert.equal(result.heuristic, true);
  assert.equal(result.requirementMapping[0].classification, 'heuristic');
});

test('unknown or invented Yandex requirement mappings are rejected', () => {
  assert.throws(() => normalize({ requirementMapping: [{ requirementId: '9.99', status: 'PASS', classification: 'heuristic' }] }), /UNKNOWN_REQUIREMENT_MAPPING/);
});

test('optional unavailable provider does not block existing Starter PASS', () => {
  assert.equal(resolveExternalEvidenceConflict({ starterStatus: 'PASS', externalStatus: 'EXTERNAL_EVIDENCE_UNAVAILABLE' }).status, 'PASS');
});

test('provider runtime in release ZIP is blocked', () => {
  const result = auditReleaseContamination({ entries: ['index.html', 'tools/yandex/external-runtime-provider/hardened-harness.mjs'] });
  assert.equal(result.status, 'BLOCK');
});

test('renamed provider runtime is blocked by raw SHA-256', () => {
  const result = auditReleaseContamination({ entries: [{ name: 'assets/vendor-helper.mjs', sha256: GAME_SESSION_SHA }] });
  assert.equal(result.status, 'BLOCK');
  assert.equal(result.matches[0].reason, 'provider runtime hash');
});

test('provider reports and browser profiles in release ZIP are blocked', () => {
  const result = auditReleaseContamination({ entries: ['index.html', 'artifacts/evidence/external/yandex-runtime/run/report.json', 'browser-profiles/dedicated-auth/Preferences'] });
  assert.equal(result.status, 'BLOCK');
  assert.equal(result.matches.length, 2);
});

test('raw external evidence redaction audit rejects secrets and retains safe identifiers', () => {
  const result = auditRedactionArtifacts({
    artifacts: { 'report.json': JSON.stringify({ Authorization: 'Bearer abc.def.ghi', targetId: 'target-safe', cdpSessionId: 'session-safe' }) }
  });
  assert.equal(result.status, 'BLOCK');
  assert.match(result.blockers.join('\n'), /secret/i);
});

test('normalized status vocabulary is closed and guaranteed report set is complete', () => {
  assert.deepEqual(EXTERNAL_STATUSES, [
    'EXTERNAL_EVIDENCE_PASS', 'EXTERNAL_EVIDENCE_WARN', 'EXTERNAL_EVIDENCE_FAIL',
    'EXTERNAL_EVIDENCE_NOT_VERIFIED', 'EXTERNAL_EVIDENCE_UNAVAILABLE', 'EXTERNAL_EVIDENCE_ERROR'
  ]);
  assert.deepEqual(REQUIRED_PROVIDER_REPORTS, ['report.json', 'evidence.json', 'console.json', 'chrome.log', 'panel.txt', 'run-state.json']);
});

test('managed manifest bytes have the validated SHA-256 identity', () => {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(PROVIDER_ROOT, 'integrity-manifest.json'))).digest('hex');
  assert.equal(actual, MANIFEST_SHA);
});

test('provider pins survive a Windows-style core.autocrlf Git round trip', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-provider-autocrlf-'));
  try {
    const provider = path.join(parent, 'tools', 'yandex', 'external-runtime-provider');
    fs.mkdirSync(path.dirname(provider), { recursive: true });
    fs.cpSync(PROVIDER_ROOT, provider, { recursive: true });
    const git = (args) => spawnSync('git', args, { cwd: parent, encoding: 'utf8' });
    assert.equal(git(['init', '--initial-branch=main']).status, 0);
    assert.equal(git(['config', 'core.autocrlf', 'true']).status, 0);
    assert.equal(git(['add', '--all']).status, 0);
    assert.equal(git(['-c', 'user.name=Provider Test', '-c', 'user.email=provider@example.invalid', 'commit', '-m', 'provider']).status, 0);
    const stored = git(['show', 'HEAD:tools/yandex/external-runtime-provider/integrity-manifest.json']);
    assert.equal(stored.status, 0);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(stored.stdout, 'utf8')).digest('hex'), MANIFEST_SHA);
    const attributes = git(['check-attr', 'text', '--', 'tools/yandex/external-runtime-provider/integrity-manifest.json']);
    assert.match(attributes.stdout, /text: unset/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('provider integrity verification supports a Windows path with spaces', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-provider-space-'));
  const provider = path.join(parent, 'Provider With Spaces');
  try {
    fs.cpSync(PROVIDER_ROOT, provider, { recursive: true });
    assert.equal((await verifyProviderIntegrity({ providerRoot: provider })).status, 'PASS');
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
