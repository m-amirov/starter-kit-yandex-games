import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLOCK_CODE = 'BLOCK_PROVIDER_INTEGRITY_FAILURE';
export const PROVIDER_VERSION = 'hardened-draft-runtime-harness-1.3.0';
export const SECURITY_POLICY_VERSION = '1.3.0';
export const PROFILE_PATH_MARKER = '[REDACTED_PROFILE_PATH]';
const MANIFEST_SCHEMA_VERSION = 2;
const MANIFEST_KIND = 'hardened-yandex-draft-runtime-provider';
const HASH_POLICY = 'raw-bytes-sha256-v1';
const UPSTREAM_REPOSITORY = 'Nioris/yandex-games-debug-checker';
const UPSTREAM_COMMIT = '0bc5ef9123f471b43c0a2683afb990fe0793f9a5';
const UPSTREAM_CANDIDATE = 'v1.2.8-test';
const PREVIOUS_VALIDATED_MANIFEST_SHA256 = '6fb633f59e0d76d5e863f24ff36172b01551562efefa6627d1138b206372f989';
const EXPECTED_RUNTIME_CLOSURE = Object.freeze({
  observer: { path: 'hardened-live-observer.js', role: 'executable-observer' },
  harness: { path: 'hardened-harness.mjs', role: 'executable-harness' },
  security: { path: 'lib/security.mjs', role: 'security-integrity-redaction' },
  'cdp-runtime': { path: 'lib/cdp-runtime.mjs', role: 'cdp-runtime' },
  'game-session': { path: 'lib/game-session.mjs', role: 'game-session-orchestration' },
  reporting: { path: 'lib/reporting.mjs', role: 'reporting-redaction' },
});
const EXPECTED_PROVENANCE_INPUTS = Object.freeze({
  'upstream-debugcheck-candidate': {
    historicalPath: 'reviewed-input/debugcheck-v1.2.8-test.js',
    originalFileName: 'debugcheck-v1.2.8-test.js',
    sha256: '3e675eb2e4ff07ac68705ee3a3f7a2dff7b1ad5f6ed81c4968794f41dd25d9c1',
  },
  'upstream-experimental-harness': {
    historicalPath: 'reviewed-input/yg-yandex-draft-harness-passive.mjs',
    originalFileName: 'yg-yandex-draft-harness-passive.mjs',
    sha256: 'e5f88c7152d3900e077dad5259995aafbdda007b70b04cfe00e222542b1d0d71',
  },
});
const SAFE_QUERY = new Set(['lang', 'debug-mode', 'draft']);
const SAFE_QUERY_VALUE = {
  lang: /^[a-z]{2}(?:-[A-Z]{2})?$/,
  'debug-mode': /^(?:0|1|true|false)$/,
  draft: /^(?:true|\d{1,12})$/,
};
const CREDENTIAL_QUERY = /^(?:authorization|cookie|token|access_token|refresh_token|oauth|code|bearer|session|sessionid|session_id|csrf|password|passwd|secret)$/i;
const SAFE_TECHNICAL_KEYS = new Set(['cdpSessionId', 'gameSessionSha256']);

export class IntegrityError extends Error {
  constructor(message, classification = 'PROVIDER_INTEGRITY_FAILURE') {
    super(`${BLOCK_CODE}: ${message}`);
    this.name = 'IntegrityError';
    this.code = BLOCK_CODE;
    this.classification = classification;
  }
}

export class ToolingError extends Error {
  constructor(classification, message) {
    super(message);
    this.name = 'ToolingError';
    this.code = 'PROVIDER_TOOLING_ERROR';
    this.classification = classification;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForDebuggerEndpoint(port, {
  child,
  fetchImpl = fetch,
  timeoutMs = 15000,
  intervalMs = 100,
  now = Date.now,
  sleep = defaultSleep,
} = {}) {
  const deadline = now() + timeoutMs;
  while (now() <= deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new ToolingError('BROWSER_LAUNCH_FAILURE', 'owned browser exited before the CDP endpoint became ready');
    }
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const endpoint = (await response.json()).webSocketDebuggerUrl;
        if (typeof endpoint === 'string' && endpoint.startsWith('ws://127.0.0.1')) return endpoint;
      }
    } catch { /* endpoint is not ready yet */ }
    if (now() >= deadline) break;
    await sleep(intervalMs);
  }
  throw new ToolingError('CDP_ENDPOINT_TIMEOUT', 'owned browser did not expose a localhost CDP endpoint before timeout');
}

export async function waitForPageTargets(getTargets, {
  timeoutMs = 10000,
  intervalMs = 100,
  now = Date.now,
  sleep = defaultSleep,
} = {}) {
  const deadline = now() + timeoutMs;
  while (now() <= deadline) {
    const targets = (await getTargets()).filter((target) => ['page', 'iframe'].includes(target.type));
    if (targets.length > 0) return targets;
    if (now() >= deadline) break;
    await sleep(intervalMs);
  }
  throw new ToolingError('CDP_TARGET_TIMEOUT', 'CDP endpoint started but no page/OOPIF target appeared before timeout');
}

export async function cleanupEphemeralProfile(path, {
  maxAttempts = 6,
  retryDelayMs = 100,
  remove = rm,
  sleep = defaultSleep,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await remove(path, { recursive: true, force: true });
      return { status: 'PASS', classification: null, attempts: attempt };
    } catch (error) {
      if (attempt === maxAttempts) {
        const locked = ['EBUSY', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error?.code);
        return {
          status: 'TOOLING_CLEANUP_ERROR',
          classification: locked ? 'EPHEMERAL_PROFILE_CLEANUP_LOCKED' : 'EPHEMERAL_PROFILE_CLEANUP_ERROR',
          attempts: attempt,
          errorCode: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
        };
      }
      await sleep(retryDelayMs * attempt);
    }
  }
  throw new ToolingError('EPHEMERAL_PROFILE_CLEANUP_ERROR', 'unreachable cleanup state');
}

export async function sha256File(pathOrUrl) {
  const bytes = await readFile(pathOrUrl);
  return createHash('sha256').update(bytes).digest('hex');
}

export async function sha256CanonicalTextFile(pathOrUrl) {
  const text = await readFile(pathOrUrl, 'utf8');
  return createHash('sha256').update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('hex');
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrityError(`${label} is malformed`, 'MANIFEST_SCHEMA_INVALID');
  }
}

function assertManagedRelativePath(value, label, classification) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.includes(':')) {
    throw new IntegrityError(`${label} is not a managed relative path`, classification);
  }
  const normalized = value.split('/').filter((part) => part !== '.').join('/');
  if (normalized !== value || value.split('/').includes('..')) {
    throw new IntegrityError(`${label} is not normalized`, classification);
  }
}

function validateProvenanceMetadata(manifest) {
  const invalid = (message) => { throw new IntegrityError(message, 'PROVENANCE_METADATA_INVALID'); };
  if (manifest.upstream?.repository !== UPSTREAM_REPOSITORY
    || manifest.upstream?.commit !== UPSTREAM_COMMIT
    || manifest.upstream?.candidate !== UPSTREAM_CANDIDATE
    || manifest.upstream?.auditedDate !== '2026-08-28') invalid('upstream provenance is incomplete or changed');
  if (manifest.repin?.previousProviderVersion !== 'hardened-draft-runtime-harness-1.2.0'
    || manifest.repin?.previousValidatedManifestSha256 !== PREVIOUS_VALIDATED_MANIFEST_SHA256
    || manifest.repin?.reason !== 'RUNTIME_INTEGRITY_CLOSURE_REFINEMENT') invalid('re-pin provenance is incomplete or changed');
  if (!Array.isArray(manifest.provenanceInputs)
    || manifest.provenanceInputs.length !== Object.keys(EXPECTED_PROVENANCE_INPUTS).length) invalid('provenanceInputs inventory is incomplete');
  const seen = new Set();
  for (const entry of manifest.provenanceInputs) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('provenance input is malformed');
    const expected = EXPECTED_PROVENANCE_INPUTS[entry.id];
    if (!expected || seen.has(entry.id)) invalid('provenance input id is unknown or duplicated');
    seen.add(entry.id);
    try { assertManagedRelativePath(entry.historicalPath, `${entry.id}.historicalPath`, 'PROVENANCE_METADATA_INVALID'); } catch { invalid('provenance historical path is invalid'); }
    if (entry.repository !== UPSTREAM_REPOSITORY
      || entry.commit !== UPSTREAM_COMMIT
      || entry.candidate !== UPSTREAM_CANDIDATE
      || entry.auditedDate !== '2026-08-28'
      || entry.historicalPath !== expected.historicalPath
      || entry.originalFileName !== expected.originalFileName
      || entry.sha256 !== expected.sha256
      || entry.runtimeRequired !== false
      || typeof entry.relationship !== 'string'
      || entry.relationship.length < 10) invalid(`provenance input ${entry.id} metadata is incomplete or changed`);
  }
  return new Set(manifest.provenanceInputs.map((entry) => entry.historicalPath));
}

function importSpecifiers(source) {
  const values = [];
  const pattern = /(?:\b(?:import|export)\s+(?:[^'"`]*?\s+from\s*)?['"`]([^'"`]+)['"`]|\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;
  for (const match of source.matchAll(pattern)) values.push(match[1] || match[2]);
  return values;
}

export async function auditRuntimeDependencyClosure(manifest, manifestUrl) {
  const root = dirname(fileURLToPath(manifestUrl));
  const runtimePaths = new Set(manifest.runtimeClosure.map((entry) => entry.path));
  const provenancePaths = new Set(manifest.provenanceInputs.map((entry) => entry.historicalPath));
  for (const path of runtimePaths) {
    if (provenancePaths.has(path)) {
      throw new IntegrityError(`${path} is both runtime and provenance`, 'RUNTIME_PROVENANCE_DEPENDENCY_FORBIDDEN');
    }
  }
  const dependencies = [];
  for (const entry of manifest.runtimeClosure) {
    const source = await readFile(resolve(root, entry.path), 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (/^(?:https?:|data:|file:)/i.test(specifier)) {
        throw new IntegrityError(`${entry.path} has a remote or absolute import`, 'RUNTIME_REMOTE_DEPENDENCY_FORBIDDEN');
      }
      if (!specifier.startsWith('.')) continue;
      const dependencyPath = relative(root, resolve(dirname(resolve(root, entry.path)), specifier)).replaceAll('\\', '/');
      if (provenancePaths.has(dependencyPath)) {
        throw new IntegrityError(`${entry.path} imports historical provenance input ${dependencyPath}`, 'RUNTIME_PROVENANCE_DEPENDENCY_FORBIDDEN');
      }
      if (!runtimePaths.has(dependencyPath)) {
        throw new IntegrityError(`${entry.path} imports undeclared runtime source ${dependencyPath}`, 'RUNTIME_CLOSURE_UNKNOWN_DEPENDENCY');
      }
      dependencies.push({ from: entry.path, to: dependencyPath });
    }
  }
  return { runtimePaths: [...runtimePaths].sort(), dependencies };
}

export async function verifyIntegrityManifest(manifestUrl) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  } catch (error) {
    throw new IntegrityError(`manifest cannot be parsed: ${error.message}`, 'MANIFEST_SCHEMA_INVALID');
  }
  assertObject(manifest, 'manifest');
  if (manifest.providerVersion !== PROVIDER_VERSION) {
    throw new IntegrityError('unknown runtime provider version', 'UNKNOWN_RUNTIME_PROVIDER_VERSION');
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION
    || manifest.$schema !== './integrity-manifest.schema.json'
    || manifest.manifestKind !== MANIFEST_KIND
    || manifest.securityPolicyVersion !== SECURITY_POLICY_VERSION
    || manifest.hashPolicy !== HASH_POLICY) {
    throw new IntegrityError('manifest schema, kind, policy, or hash policy is unsupported', 'MANIFEST_SCHEMA_INVALID');
  }
  const provenancePaths = validateProvenanceMetadata(manifest);
  if (!Array.isArray(manifest.runtimeClosure)
    || manifest.runtimeClosure.length !== Object.keys(EXPECTED_RUNTIME_CLOSURE).length) {
    throw new IntegrityError('runtime closure inventory is incomplete', 'RUNTIME_CLOSURE_UNKNOWN_SOURCE');
  }
  const root = dirname(fileURLToPath(manifestUrl));
  const seen = new Set();
  for (const entry of manifest.runtimeClosure) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new IntegrityError('runtime closure entry is malformed', 'RUNTIME_CLOSURE_UNKNOWN_SOURCE');
    }
    const expected = EXPECTED_RUNTIME_CLOSURE[entry.id];
    if (!expected || seen.has(entry.id)) {
      throw new IntegrityError('runtime closure source is unknown or duplicated', 'RUNTIME_CLOSURE_UNKNOWN_SOURCE');
    }
    seen.add(entry.id);
    assertManagedRelativePath(entry.path, `${entry.id}.path`, 'RUNTIME_CLOSURE_UNKNOWN_SOURCE');
    if (entry.path !== expected.path || entry.role !== expected.role || entry.required !== true) {
      throw new IntegrityError(`${entry.id} runtime metadata is not allowlisted`, 'RUNTIME_CLOSURE_UNKNOWN_SOURCE');
    }
    if (provenancePaths.has(entry.path)) {
      throw new IntegrityError(`${entry.path} is historical provenance`, 'RUNTIME_PROVENANCE_DEPENDENCY_FORBIDDEN');
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
      throw new IntegrityError(`${entry.id} runtime hash is malformed`, 'RUNTIME_CLOSURE_HASH_MISMATCH');
    }
    const path = resolve(root, entry.path);
    const rel = relative(root, path);
    if (rel.startsWith('..') || rel.includes(':')) {
      throw new IntegrityError(`${entry.id} path escapes provider root`, 'RUNTIME_CLOSURE_UNKNOWN_SOURCE');
    }
    let actual;
    try {
      actual = await sha256File(path);
    } catch (error) {
      const classification = error?.code === 'ENOENT'
        ? 'RUNTIME_CLOSURE_FILE_MISSING'
        : 'RUNTIME_CLOSURE_FILE_UNREADABLE';
      throw new IntegrityError(`${entry.id} runtime file is unavailable: ${error.message}`, classification);
    }
    if (actual !== entry.sha256) {
      throw new IntegrityError(`${entry.id} runtime hash mismatch`, 'RUNTIME_CLOSURE_HASH_MISMATCH');
    }
  }
  await auditRuntimeDependencyClosure(manifest, manifestUrl);
  return manifest;
}

export function sanitizeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new IntegrityError('target URL is malformed'); }
  if (url.protocol !== 'https:' || !/^(?:www\.)?yandex\.(?:ru|com)$/.test(url.hostname) || !url.pathname.startsWith('/games/app/')) {
    throw new IntegrityError('only an HTTPS Yandex Games app URL is allowed');
  }
  const query = {};
  for (const [key, item] of url.searchParams) if (SAFE_QUERY.has(key) && SAFE_QUERY_VALUE[key].test(item)) query[key] = item;
  const match = url.pathname.match(/^\/games\/app\/(\d+)/);
  return { origin: url.origin, pathname: url.pathname, appId: match?.[1] ?? null, query };
}

export function sanitizeRuntimeIdentity(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return { origin: 'non-http', pathname: '' };
    return { origin: url.origin, pathname: url.pathname };
  } catch {
    return { origin: 'unknown', pathname: '' };
  }
}

function redactUrls(text) {
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => {
    try {
      const url = new URL(candidate);
      url.username = '';
      url.password = '';
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (CREDENTIAL_QUERY.test(key)) url.searchParams.set(key, '[REDACTED]');
      return url.toString();
    } catch { return '[REDACTED_URL]'; }
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sensitivePathVariants(path) {
  const raw = String(path || '').trim();
  if (!raw) return [];
  const slash = raw.replaceAll('\\', '/');
  const backslash = raw.replaceAll('/', '\\');
  return [...new Set([
    raw,
    slash,
    backslash,
    JSON.stringify(raw).slice(1, -1),
    JSON.stringify(slash).slice(1, -1),
    JSON.stringify(backslash).slice(1, -1),
  ])].sort((left, right) => right.length - left.length);
}

function redactSensitivePaths(value, sensitivePaths = []) {
  let text = value;
  for (const variant of sensitivePaths.flatMap(sensitivePathVariants)) {
    text = text.replace(new RegExp(escapeRegExp(variant), 'gi'), PROFILE_PATH_MARKER);
  }
  text = text.replace(/--user-data-dir=(?:"[^"]*"|'[^']*'|[^\s]+)/gi, `--user-data-dir=${PROFILE_PATH_MARKER}`);
  const profilePath = /(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+[\\/]|\/(?:home|Users|tmp|var\/tmp)\/)[^\r\n"'<>]*?(?:yg-(?:debug|hardened)-profile[^\\/\s"'<>]*|dedicated-auth-profile|ephemeral-profile)(?:[\\/][^\s"'<>]*)?/gi;
  return text.replace(profilePath, PROFILE_PATH_MARKER);
}

function isSensitiveKey(key) {
  if (SAFE_TECHNICAL_KEYS.has(key)) return false;
  const semantic = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return /(authorization|cookie|setcookie|token|oauth|bearer|session|csrf|password|passwd|secret|storage)/.test(semantic);
}

export function redactString(value, { sensitivePaths = [] } = {}) {
  let text = String(value);
  text = redactUrls(text);
  text = redactSensitivePaths(text, sensitivePaths);
  text = text.replace(/\b(Authorization\s*:\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[REDACTED]');
  text = text.replace(/\b(Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, '$1: [REDACTED]');
  text = text.replace(/\b(x-csrf-token|csrf-token)\s*:\s*[^\s,;]+/gi, '$1: [REDACTED]');
  text = text.replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]');
  text = text.replace(/\b(Session_id|sessionid2|yandexuid|session|csrf|token|access_token|refresh_token)=([^\s;&]+)/gi, '$1=[REDACTED]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]');
  return text;
}

export function redactValue(value, key = '', options = {}) {
  if (isSensitiveKey(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactString(value, options);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, '', options));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([itemKey, item]) => [itemKey, redactValue(item, itemKey, options)]));
  return value;
}

export async function writeRedactedJson(path, value, options = {}) {
  await writeFile(path, `${JSON.stringify(redactValue(value, '', options), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function writeRedactedText(path, value, options = {}) {
  await writeFile(path, `${redactString(value, options)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function parseHarnessArgs(argv) {
  const result = { browserKind: 'chrome', profileMode: 'ephemeral', screenshot: false, interactive: false, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dedicated-auth') result.profileMode = 'dedicated-auth';
    else if (arg === '--screenshot') result.screenshot = true;
    else if (arg === '--interactive') result.interactive = true;
    else if (arg === '--url') result.url = argv[++index];
    else if (arg === '--browser-kind') result.browserKind = argv[++index];
    else throw new IntegrityError(`unsupported argument ${arg}`);
  }
  if (!['chrome', 'edge'].includes(result.browserKind)) throw new IntegrityError('browser kind is not allowlisted');
  if (result.interactive && result.profileMode !== 'dedicated-auth') throw new IntegrityError('interactive mode requires the Harness-owned dedicated-auth profile');
  if (result.url) sanitizeUrl(result.url);
  return result;
}

export function createOwnedProcessController() {
  const owned = new Map();
  return {
    register(child) {
      if (!Number.isInteger(child?.pid) || typeof child.kill !== 'function') throw new IntegrityError('invalid spawned process handle');
      owned.set(child.pid, child);
    },
    owns(pid) { return owned.has(pid); },
    release(child) {
      if (child && owned.get(child.pid) === child) owned.delete(child.pid);
    },
    async terminate(child) {
      if (!child || owned.get(child.pid) !== child) throw new IntegrityError('refusing to terminate an unowned process');
      child.kill('SIGTERM');
      owned.delete(child.pid);
    },
  };
}

export function findMarkerBlock(value, start, end) {
  const normalized = String(value).replace(/\r\n?/g, '\n');
  const startIndex = normalized.indexOf(start);
  const endIndex = normalized.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new IntegrityError('marker block is malformed');
  return normalized.slice(startIndex + start.length, endIndex).trim();
}

export function shouldCaptureScreenshot({ url, hasPasswordInput }) {
  if (hasPasswordInput) return false;
  try { return !/(?:passport|oauth)\.yandex\./i.test(new URL(url).hostname) && !/\/(?:auth|login)(?:\/|$)/i.test(new URL(url).pathname); } catch { return false; }
}
