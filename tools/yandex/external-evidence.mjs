import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import { ROOT } from '../starter-kit/lib.mjs';
import {
  redactString,
  redactValue,
  verifyIntegrityManifest
} from './external-runtime-provider/lib/security.mjs';
import { PIPELINE_STAGES, REQUIRED_REPORT_FILES } from './external-runtime-provider/lib/reporting.mjs';

export const PROVIDER_ID = 'yandex-draft-runtime-hardened';
export const PROVIDER_VERSION = 'hardened-draft-runtime-harness-1.3.0';
export const VALIDATED_MANIFEST_SHA256 = '3a73a9feb15de4b38f2ecd57bec167f5c280d8e0780f394b7d5a122e45a3755a';
export const VALIDATED_RUN_ID = '2026-08-29T03-32-01-617Z-551358';
export const VALIDATED_AT = '2026-08-29';
export const VALIDATED_PROVIDER_VERDICT = 'PASS_LIVE_HARDENED_PROVIDER_VALIDATION';
export const EXTERNAL_STATUSES = Object.freeze([
  'EXTERNAL_EVIDENCE_PASS',
  'EXTERNAL_EVIDENCE_WARN',
  'EXTERNAL_EVIDENCE_FAIL',
  'EXTERNAL_EVIDENCE_NOT_VERIFIED',
  'EXTERNAL_EVIDENCE_UNAVAILABLE',
  'EXTERNAL_EVIDENCE_ERROR'
]);
export const REQUIRED_PROVIDER_REPORTS = Object.freeze([
  'report.json', 'evidence.json', 'console.json', 'chrome.log', 'panel.txt', 'run-state.json'
]);

const DEFAULT_PROVIDER_ROOT = path.join(ROOT, 'tools', 'yandex', 'external-runtime-provider');
const DEFAULT_EVIDENCE_ROOT = path.join(ROOT, 'artifacts', 'evidence', 'external', 'yandex-runtime');
const ALLOWED_REQUIREMENT_IDS = new Set([
  '1.19.1', '1.19.2', '1.19.3', '1.19.4', '2.14', '1.6.2.7', '1.10.2',
  '4.1', '4.2', '4.3', '4.4', '4.5', '4.5.1', '4.5.2', '4.6.1', '4.6.2', '4.7'
]);
const PROVIDER_RUNTIME_HASHES = new Set([
  '46c7fcba8be67d2590334c84262d119dea075b857c4bc92479224c8c3ffe04e9',
  '8ea26e3a6557ac12126977686d83bbefcc770a255fea8e8bf5cd587d060589c1',
  '633a4c5ebd93ad5125697fa89ab372609e81009a204a555570918a286b9889dd',
  'cac3abe23e74fe2e1098d5fb324c70486476fae617f286e77a19bd5fb48529f1',
  'cf31050a3eafcaf3424ee912d81eb3edb07d207dfcfe6a8e4b492f3d05075d3e',
  'afef22563d2c42f37c577f3e12d27113d979280f36d20dd70e08ca4dd172657e'
]);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function installedStarterKitVersion(root = ROOT) {
  for (const file of [path.join(root, 'VERSION'), path.join(root, '.starter-kit', 'VERSION')]) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  }
  return null;
}

function integrityFailure(classification, message) {
  const error = new Error(`${classification}: ${message}`);
  error.code = 'BLOCK_PROVIDER_INTEGRITY_FAILURE';
  error.classification = classification;
  return error;
}

function normalizedPath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function manifestAt(providerRoot) {
  return path.join(providerRoot, 'integrity-manifest.json');
}

export async function verifyProviderIntegrity({
  providerRoot = DEFAULT_PROVIDER_ROOT,
  enforceValidatedManifestHash = true
} = {}) {
  const manifestFile = manifestAt(providerRoot);
  if (!fs.existsSync(manifestFile)) throw integrityFailure('MANIFEST_FILE_MISSING', 'managed provider manifest is missing');
  const actualManifestSha256 = sha256File(manifestFile);
  if (enforceValidatedManifestHash && actualManifestSha256 !== VALIDATED_MANIFEST_SHA256) {
    throw integrityFailure('VALIDATED_MANIFEST_HASH_MISMATCH', 'managed manifest does not match the validated pin; do not repin automatically');
  }
  let manifest;
  try {
    manifest = await verifyIntegrityManifest(pathToFileURL(manifestFile));
  } catch (error) {
    throw integrityFailure(error.classification ?? 'PROVIDER_INTEGRITY_FAILURE', error.message);
  }
  const runtimeClosure = manifest.runtimeClosure.map((entry) => {
    const actualSha256 = sha256File(path.join(providerRoot, entry.path));
    return { ...entry, actualSha256, identical: actualSha256 === entry.sha256 };
  });
  if (runtimeClosure.some((entry) => !entry.identical)) {
    throw integrityFailure('RUNTIME_CLOSURE_HASH_MISMATCH', 'one or more managed runtimeClosure files changed');
  }
  return {
    status: 'PASS',
    providerId: PROVIDER_ID,
    providerVersion: manifest.providerVersion,
    validatedManifestSha256: VALIDATED_MANIFEST_SHA256,
    actualManifestSha256,
    runtimeClosure,
    provenanceInputs: manifest.provenanceInputs,
    upstream: manifest.upstream
  };
}

function remoteExecutableSource(source) {
  return [
    /\b(?:fetch|importScripts|Worker|SharedWorker)\s*\(\s*['"`]https?:\/\//i,
    /\bimport\s*\(\s*['"`]https?:\/\//i,
    /\b(?:import|export)\s+[^\n]*?['"`]https?:\/\//i,
    /<script\b[^>]*\bsrc\s*=\s*['"]https?:\/\//i
  ].some((pattern) => pattern.test(source));
}

export async function auditProviderDistribution({
  providerRoot = DEFAULT_PROVIDER_ROOT,
  verifyHashes = true
} = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestAt(providerRoot), 'utf8'));
  if (verifyHashes) await verifyProviderIntegrity({ providerRoot });
  const physicalProvenanceInputs = manifest.provenanceInputs
    .map((entry) => entry.historicalPath)
    .filter((relative) => fs.existsSync(path.join(providerRoot, relative)));
  if (physicalProvenanceInputs.length) {
    throw integrityFailure('PROVENANCE_INPUT_PHYSICALLY_PRESENT', `historical inputs were vendored: ${physicalProvenanceInputs.join(', ')}`);
  }
  const allowedFiles = new Set([
    ...manifest.runtimeClosure.map((entry) => entry.path),
    'integrity-manifest.json', 'integrity-manifest.schema.json', 'validation-record.json',
    '.gitignore', '.gitattributes'
  ]);
  const walk = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = normalizedPath(path.posix.join(prefix, entry.name));
    if (['.state', 'evidence'].includes(relative.split('/')[0])) return [];
    return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative];
  });
  const unexpectedFiles = walk(providerRoot).filter((relative) => !allowedFiles.has(relative));
  if (unexpectedFiles.length) {
    throw integrityFailure('PROVIDER_DISTRIBUTION_UNEXPECTED_FILE', `non-closure provider files were distributed: ${unexpectedFiles.join(', ')}`);
  }
  for (const entry of manifest.runtimeClosure) {
    const file = path.join(providerRoot, entry.path);
    const source = fs.readFileSync(file, 'utf8');
    if (remoteExecutableSource(source)) {
      throw integrityFailure('RUNTIME_REMOTE_EXECUTABLE_SOURCE_FORBIDDEN', `${entry.path} can fetch or import remote executable source`);
    }
    for (const forbidden of [
      /\bPage\.setBypassCSP\b/,
      /\bSecurity\.setIgnoreCertificateErrors\b/,
      /\bInput\.dispatch(?:Key|Mouse|Touch)Event\b/,
      /\buserGesture\s*:\s*true\b/,
      /\b(?:setData|setLeaderboardScore|purchase|consumePurchase|showFullscreenAdv|showRewardedVideo)\s*\(/
    ]) {
      if (forbidden.test(source)) throw integrityFailure('PASSIVE_RUNTIME_POLICY_VIOLATION', `${entry.path} contains a forbidden mutation or bypass operation`);
    }
  }
  return { status: 'PASS', physicalProvenanceInputs, unexpectedFiles, runtimeClosurePaths: manifest.runtimeClosure.map((entry) => entry.path) };
}

function validSha(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

function oopifProof(identity, gameSessionSha256) {
  if (!identity || identity.targetType !== 'iframe') return false;
  if (!identity.targetId || !identity.cdpSessionId || !Number.isInteger(identity.executionContextId)) return false;
  if (!validSha(gameSessionSha256)) return false;
  const expected = identity.expectedOrigin;
  if (!/^https:\/\/app-\d+\.games\.s3\.yandex\.net\/$/.test(expected ?? '')) return false;
  return identity.origin === expected && identity.runtimeOrigin === expected && identity.observerOrigin === expected;
}

function fullStageHistory(stages) {
  return PIPELINE_STAGES.every((stage) => stages?.[stage]?.status === 'COMPLETED');
}

function rawStatus(report, evidence, runState) {
  return report?.finalVerdict ?? evidence?.finalVerdict ?? runState?.finalVerdict
    ?? report?.providerStatus ?? evidence?.providerStatus ?? runState?.providerStatus ?? 'UNAVAILABLE';
}

function sanitizedDraftUrl(target, appId) {
  const id = String(appId ?? target?.appId ?? '');
  return /^\d{1,12}$/.test(id) ? `https://yandex.ru/games/app/${id}` : null;
}

function normalizeMapping(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!ALLOWED_REQUIREMENT_IDS.has(String(entry?.requirementId ?? ''))) {
      throw new Error(`UNKNOWN_REQUIREMENT_MAPPING: ${entry?.requirementId ?? 'missing'}`);
    }
    const classification = entry.classification === 'heuristic' ? 'heuristic' : 'advisory';
    return {
      requirementId: String(entry.requirementId),
      status: String(entry.status ?? 'NOT_VERIFIED'),
      classification,
      heuristic: classification === 'heuristic',
      evidence: entry.evidence ?? null
    };
  });
}

export function auditRedactionArtifacts({ artifacts = {}, sensitiveProfilePaths = [] } = {}) {
  const blockers = [];
  const patterns = [
    /\bAuthorization\s*:\s*(?!\[REDACTED\])[^\r\n"}]+/i,
    /\b(?:Cookie|Set-Cookie)\s*:\s*(?!\[REDACTED\])[^\r\n"}]+/i,
    /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{6,}/i,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    /[?&](?:token|access_token|refresh_token|oauth|code|session|csrf|password|secret)=(?!%5BREDACTED%5D|\[REDACTED\])[^&#\s"}]+/i,
    /--user-data-dir=(?!\[REDACTED_PROFILE_PATH\])[^\s"}]+/i,
    /(?:[A-Za-z]:[\\/]|\/(?:home|Users|tmp|var\/tmp)\/)[^\r\n"}]*?(?:dedicated-auth-profile|yg-(?:debug|hardened)-profile)/i
  ];
  for (const [name, value] of Object.entries(artifacts)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const markerCount = (candidate) => (String(candidate).match(/\[REDACTED(?:_[A-Z_]+)?\]/g) ?? []).length;
    let changedByValidatedRedactor = markerCount(redactString(text, { sensitivePaths: sensitiveProfilePaths })) > markerCount(text);
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (markerCount(JSON.stringify(redactValue(parsed, '', { sensitivePaths: sensitiveProfilePaths }))) > markerCount(JSON.stringify(parsed))) changedByValidatedRedactor = true;
    } catch { /* text artifact */ }
    if (changedByValidatedRedactor || patterns.some((pattern) => pattern.test(text))) blockers.push(`${name}: possible authentication secret or profile path is not redacted`);
    for (const profilePath of sensitiveProfilePaths) if (profilePath && text.includes(profilePath)) blockers.push(`${name}: sensitive profile path is retained`);
  }
  return { status: blockers.length ? 'BLOCK' : 'PASS', blockers };
}

export function redactExternalEvidence(value, sensitiveProfilePaths = []) {
  return redactValue(value, '', { sensitivePaths: sensitiveProfilePaths });
}

function normalizedStatusFor({ raw, providerStatus, proof, stagesComplete, mutationCount, manifestIdentity }) {
  if (mutationCount > 0) return 'EXTERNAL_EVIDENCE_FAIL';
  if (/ERROR|TIMEOUT/i.test(`${raw} ${providerStatus}`)) return 'EXTERNAL_EVIDENCE_ERROR';
  if (/UNAVAILABLE|NOT_RUN/i.test(`${raw} ${providerStatus}`)) return 'EXTERNAL_EVIDENCE_UNAVAILABLE';
  if (/FAIL|BLOCK/i.test(raw)) return 'EXTERNAL_EVIDENCE_FAIL';
  if (/WARN/i.test(raw)) return 'EXTERNAL_EVIDENCE_WARN';
  if (/NOT[_ ]?VERIFIED|MANUAL|UNKNOWN/i.test(raw)) return 'EXTERNAL_EVIDENCE_NOT_VERIFIED';
  if (/PASS/i.test(raw) && proof && stagesComplete && manifestIdentity) return 'EXTERNAL_EVIDENCE_PASS';
  return 'EXTERNAL_EVIDENCE_NOT_VERIFIED';
}

export function normalizeExternalEvidence({
  report = {},
  evidence = {},
  runState = {},
  artifactPaths = {},
  artifactContents = {},
  metadata = {},
  actualManifestSha256 = null
} = {}) {
  const identity = report.targetIdentity ?? evidence.targetIdentity ?? null;
  const mutationLedger = report.mutationLedger ?? evidence.mutationLedger
    ?? { mutationCapableOperationCount: 0, mutationCapableOperations: [], passiveObservations: [] };
  const stages = report.stages ?? runState.stages ?? {};
  const provenance = report.provenance ?? {};
  const raw = rawStatus(report, evidence, runState);
  const providerStatus = report.providerStatus ?? evidence.providerStatus ?? runState.providerStatus ?? 'UNAVAILABLE';
  const actualManifest = actualManifestSha256 ?? provenance.manifestSha256 ?? null;
  const appId = identity?.appId ?? provenance.target?.appId ?? metadata.appId ?? null;
  const proof = oopifProof(identity, provenance.gameSessionSha256);
  const stagesComplete = fullStageHistory(stages);
  const mutationCount = Number(mutationLedger.mutationCapableOperationCount ?? mutationLedger.count ?? 0);
  const manifestIdentity = actualManifest === VALIDATED_MANIFEST_SHA256 && provenance.providerVersion === PROVIDER_VERSION;
  const normalizedStatus = normalizedStatusFor({ raw: String(raw), providerStatus: String(providerStatus), proof, stagesComplete, mutationCount, manifestIdentity });
  const requirementMapping = normalizeMapping(report.requirementMapping ?? evidence.requirementMapping ?? []);
  const availableReports = REQUIRED_PROVIDER_REPORTS.filter((name) => typeof artifactPaths[name] === 'string' && artifactPaths[name]);
  const redaction = auditRedactionArtifacts({ artifacts: { ...artifactContents, report, evidence, runState } });
  const classification = normalizedStatus === 'EXTERNAL_EVIDENCE_ERROR' ? 'tooling-error'
    : normalizedStatus === 'EXTERNAL_EVIDENCE_FAIL' ? 'game-or-policy-failure'
      : normalizedStatus === 'EXTERNAL_EVIDENCE_WARN' ? 'review-required'
        : normalizedStatus === 'EXTERNAL_EVIDENCE_PASS' ? 'supporting'
          : normalizedStatus === 'EXTERNAL_EVIDENCE_UNAVAILABLE' ? 'unavailable' : 'not-verified';
  const result = {
    schemaVersion: 1,
    providerId: PROVIDER_ID,
    providerVersion: PROVIDER_VERSION,
    normalizedStatus,
    providerRawStatus: String(raw),
    classification,
    requirementMapping,
    heuristic: requirementMapping.some((entry) => entry.heuristic),
    provenance: {
      providerId: PROVIDER_ID,
      providerVersion: PROVIDER_VERSION,
      validatedManifestSha256: VALIDATED_MANIFEST_SHA256,
      actualManifestSha256: actualManifest,
      upstreamRepository: provenance.upstreamRepository ?? 'Nioris/yandex-games-debug-checker',
      upstreamCommit: provenance.upstreamCommit ?? '0bc5ef9123f471b43c0a2683afb990fe0793f9a5',
      upstreamCandidate: provenance.upstreamCandidate ?? 'v1.2.8-test',
      starterKitVersion: metadata.starterKitVersion ?? null,
      project: metadata.project ?? null,
      appId,
      sanitizedDraftUrl: sanitizedDraftUrl(provenance.target, appId),
      releaseBuildSha256: metadata.releaseBuildSha256 ?? null,
      browserVersion: report.browser?.product ?? metadata.browserVersion ?? null,
      profileMode: provenance.profileMode ?? metadata.profileMode ?? null,
      locale: metadata.locale ?? null,
      viewport: metadata.viewport ?? null,
      targetId: identity?.targetId ?? null,
      cdpSessionId: identity?.cdpSessionId ?? null,
      executionContextId: identity?.executionContextId ?? null,
      gameOrigin: identity?.runtimeOrigin ?? identity?.origin ?? null,
      observerOrigin: identity?.observerOrigin ?? null,
      gameSessionSha256: provenance.gameSessionSha256 ?? null,
      mutationLedger,
      stages,
      startedAt: report.startedAt ?? runState.startedAt ?? null,
      completedAt: report.completedAt ?? runState.completedAt ?? null,
      verdict: String(raw)
    },
    artifactPaths: Object.fromEntries(availableReports.map((name) => [name, normalizedPath(artifactPaths[name])])),
    artifactCompleteness: availableReports.length === REQUIRED_PROVIDER_REPORTS.length ? 'full' : 'partial',
    runtimeTargetIdentity: identity,
    oopifProof: proof,
    mutationLedger,
    stageHistory: stages,
    stagesComplete,
    redactionStatus: redaction.status,
    redactionBlockers: redaction.blockers,
    advisory: true,
    optional: true
  };
  return redactExternalEvidence(result);
}

export function auditNormalizedEvidence(value) {
  const blockers = [];
  if (!value || value.schemaVersion !== 1) blockers.push('normalized evidence schemaVersion is unsupported');
  if (!EXTERNAL_STATUSES.includes(value?.normalizedStatus)) blockers.push('normalized status is unknown');
  if (value?.providerId !== PROVIDER_ID || value?.providerVersion !== PROVIDER_VERSION) blockers.push('provider pin/version mismatch');
  if (value?.provenance?.validatedManifestSha256 !== VALIDATED_MANIFEST_SHA256
    || value?.provenance?.actualManifestSha256 !== VALIDATED_MANIFEST_SHA256) blockers.push('actual manifest hash does not match validated pin');
  if (value?.artifactCompleteness !== 'full') blockers.push('provider report set is partial');
  if (value?.redactionStatus !== 'PASS') blockers.push('provider artifact redaction audit failed');
  if ((value?.mutationLedger?.mutationCapableOperationCount ?? value?.mutationLedger?.count ?? 0) !== 0) blockers.push('mutation ledger is not zero');
  if (value?.normalizedStatus === 'EXTERNAL_EVIDENCE_PASS') {
    if (!value.oopifProof) blockers.push('PASS lacks game OOPIF identity proof');
    if (!value.stagesComplete) blockers.push('PASS lacks complete stage history');
    if (!validSha(value.provenance?.gameSessionSha256)) blockers.push('PASS lacks gameSessionSha256');
  }
  return { status: blockers.length ? 'BLOCK' : 'PASS', blockers };
}

export function resolveExternalEvidenceConflict({
  starterStatus,
  starterKind = 'automated',
  externalStatus,
  externalProvesFullClause = false
}) {
  if (starterStatus === 'FAIL' || starterStatus === 'BLOCK') return { status: 'FAIL', externalRole: 'cannot-override-starter-failure' };
  if (starterStatus === 'MANUAL' || starterKind === 'manual') {
    return externalStatus === 'EXTERNAL_EVIDENCE_PASS' && externalProvesFullClause
      ? { status: 'PASS', externalRole: 'full-clause-supporting' }
      : { status: 'MANUAL', externalRole: 'advisory-only' };
  }
  if (starterStatus === 'PASS' && ['EXTERNAL_EVIDENCE_FAIL', 'EXTERNAL_EVIDENCE_WARN'].includes(externalStatus)) {
    return { status: 'REVIEW_REQUIRED', externalRole: 'conflict' };
  }
  if (externalStatus === 'EXTERNAL_EVIDENCE_ERROR') return { status: starterStatus, externalRole: 'provider-tooling-problem' };
  if (externalStatus === 'EXTERNAL_EVIDENCE_PASS') return { status: starterStatus, externalRole: 'supporting' };
  return { status: starterStatus, externalRole: 'not-supporting' };
}

function contaminationReason(name, content = '', sha256 = '') {
  const value = normalizedPath(name).toLowerCase();
  if (value.includes('tools/yandex/external-runtime-provider/')) return 'provider runtime module';
  if (/(?:^|\/)(?:hardened-harness\.mjs|hardened-live-observer\.js|debugcheck(?:[-._][^\/]*)?\.js)$/.test(value)) return 'provider executable';
  if (PROVIDER_RUNTIME_HASHES.has(String(sha256).toLowerCase())) return 'provider runtime hash';
  if (/(?:^|\/)artifacts\/evidence\/external\/yandex-runtime\//.test(value)) return 'raw external evidence';
  if (/(?:^|\/)(?:browser-profiles?|browser_profiles?|\.state)\//.test(value) || value.includes('dedicated-auth-profile')) return 'browser profile';
  if (/YGDebugChecker|hardened-draft-runtime-harness|__YG_HARDENED_OBSERVER/.test(content)) return 'provider signature';
  return null;
}

export function auditReleaseContamination({ entries = [] } = {}) {
  const matches = [];
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const content = typeof entry === 'object' && typeof entry.content === 'string' ? entry.content : '';
    const reason = contaminationReason(name, content, typeof entry === 'object' ? entry.sha256 : '');
    if (reason) matches.push({ name: normalizedPath(name), reason });
  }
  return { status: matches.length ? 'BLOCK' : 'PASS', blockers: matches.map((entry) => `${entry.reason} must not be in the production game ZIP: ${entry.name}`), matches };
}

export function inspectZipForExternalEvidence(file) {
  const buffer = fs.readFileSync(file);
  let eocd = -1;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory record not found');
  const entries = [];
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let content = '';
    let sha256 = null;
    if (uncompressedSize <= 5_000_000 && /\.(?:html?|js|mjs|cjs|json|txt|log)$/i.test(name)) {
      const bytes = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
      if (bytes) {
        content = bytes.toString('utf8');
        sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      }
    }
    entries.push({ name, content, sha256 });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return auditReleaseContamination({ entries });
}

function readArg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseViewport(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) throw new Error('--viewport must use WIDTHxHEIGHT');
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function loadExternalRun(runDirectory) {
  const json = (name) => {
    const file = path.join(runDirectory, name);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  };
  const artifactPaths = Object.fromEntries(REQUIRED_PROVIDER_REPORTS
    .filter((name) => fs.existsSync(path.join(runDirectory, name)))
    .map((name) => [name, path.relative(ROOT, path.join(runDirectory, name))]));
  const artifactContents = Object.fromEntries(REQUIRED_PROVIDER_REPORTS
    .filter((name) => fs.existsSync(path.join(runDirectory, name)))
    .map((name) => [name, fs.readFileSync(path.join(runDirectory, name), 'utf8')]));
  return { report: json('report.json'), evidence: json('evidence.json'), runState: json('run-state.json'), artifactPaths, artifactContents };
}

function latestRun(evidenceRoot = DEFAULT_EVIDENCE_ROOT) {
  if (!fs.existsSync(evidenceRoot)) return null;
  const directories = fs.readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  return directories.length ? path.join(evidenceRoot, directories.at(-1)) : null;
}

function moveRun(source, destination) {
  if (fs.existsSync(destination)) throw new Error(`refusing to overwrite existing project evidence: ${destination}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try { fs.renameSync(source, destination); }
  catch {
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
}

function ensureDedicatedProfileOutsideManagedTree() {
  const stateLink = path.join(DEFAULT_PROVIDER_ROOT, '.state');
  const profileBase = path.join(ROOT, 'browser-profiles', 'yandex-external-provider');
  fs.mkdirSync(profileBase, { recursive: true });
  if (fs.existsSync(stateLink)) {
    const stat = fs.lstatSync(stateLink);
    if (!stat.isSymbolicLink()) throw new Error('provider .state must be an ignored link to browser-profiles; refusing to use a profile inside managed tooling');
    if (fs.realpathSync(stateLink) !== fs.realpathSync(profileBase)) throw new Error('provider .state link targets an unexpected profile location');
    return;
  }
  fs.symlinkSync(profileBase, stateLink, process.platform === 'win32' ? 'junction' : 'dir');
}

function runProviderCli() {
  const url = readArg('--url');
  if (!url) throw new Error('yandex:external:run requires --url <Yandex Draft URL>');
  const providerEvidence = path.join(DEFAULT_PROVIDER_ROOT, 'evidence');
  const before = new Set(fs.existsSync(providerEvidence) ? fs.readdirSync(providerEvidence) : []);
  if (process.argv.includes('--dedicated-auth')) ensureDedicatedProfileOutsideManagedTree();
  const forwarded = ['--url', url];
  for (const flag of ['--dedicated-auth', '--interactive', '--screenshot']) if (process.argv.includes(flag)) forwarded.push(flag);
  const browserKind = readArg('--browser-kind');
  if (browserKind) forwarded.push('--browser-kind', browserKind);
  const result = spawnSync(process.execPath, [path.join(DEFAULT_PROVIDER_ROOT, 'hardened-harness.mjs'), ...forwarded], {
    cwd: ROOT, stdio: 'inherit'
  });
  const after = fs.existsSync(providerEvidence) ? fs.readdirSync(providerEvidence) : [];
  const created = after.filter((name) => !before.has(name));
  for (const runId of created) moveRun(path.join(providerEvidence, runId), path.join(DEFAULT_EVIDENCE_ROOT, runId));
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return created;
}

async function runCli() {
  const command = process.argv[2];
  if (!['verify', 'run', 'normalize', 'audit'].includes(command)) {
    throw new Error('Usage: external-evidence.mjs <verify|run|normalize|audit> [options]');
  }
  if (command === 'verify') {
    const integrity = await verifyProviderIntegrity();
    const distribution = await auditProviderDistribution();
    console.log(JSON.stringify({ ...integrity, distribution }, null, 2));
    return;
  }
  await verifyProviderIntegrity();
  if (command === 'run') {
    const created = runProviderCli();
    console.log(JSON.stringify({ status: process.exitCode ? 'ERROR' : 'COMPLETE', projectEvidenceRuns: created }, null, 2));
    return;
  }
  const runArgument = readArg('--run');
  const runDirectory = runArgument ? path.resolve(runArgument) : latestRun();
  if (!runDirectory || !fs.existsSync(runDirectory)) {
    if (command === 'audit') {
      console.log(JSON.stringify({ status: 'PASS', externalStatus: 'EXTERNAL_EVIDENCE_UNAVAILABLE', optional: true, note: 'Provider was not run; explicit Draft runtime evidence is recommended before submission.' }, null, 2));
      return;
    }
    throw new Error('no external provider run is available; pass --run <directory>');
  }
  const metadata = {
    starterKitVersion: installedStarterKitVersion(),
    project: readArg('--project', path.basename(ROOT)),
    releaseBuildSha256: readArg('--release-sha256', null),
    locale: readArg('--locale', null),
    viewport: parseViewport(readArg('--viewport', null))
  };
  const normalized = normalizeExternalEvidence({ ...loadExternalRun(runDirectory), metadata, actualManifestSha256: VALIDATED_MANIFEST_SHA256 });
  const normalizedFile = path.join(runDirectory, 'normalized-evidence.json');
  if (command === 'normalize') {
    fs.writeFileSync(normalizedFile, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ status: normalized.normalizedStatus, output: normalizedFile }, null, 2));
    return;
  }
  const evidenceAudit = auditNormalizedEvidence(normalized);
  const zip = readArg('--zip');
  const archiveAudit = zip ? inspectZipForExternalEvidence(path.resolve(zip)) : { status: 'NOT_CHECKED', blockers: [], matches: [] };
  const conflict = resolveExternalEvidenceConflict({
    starterStatus: readArg('--starter-status', 'PASS'),
    starterKind: readArg('--starter-kind', 'automated'),
    externalStatus: normalized.normalizedStatus,
    externalProvesFullClause: process.argv.includes('--external-proves-full-clause')
  });
  const blockers = [...evidenceAudit.blockers, ...archiveAudit.blockers];
  console.log(JSON.stringify({ status: blockers.length ? 'BLOCK' : 'PASS', evidence: normalized, evidenceAudit, archiveAudit, conflict, blockers }, null, 2));
  if (blockers.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli().catch((error) => {
    console.error(`${error.classification ?? error.code ?? 'EXTERNAL_EVIDENCE_ERROR'}: ${error.message}`);
    process.exitCode = 1;
  });
}
