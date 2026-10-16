import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENTS = { vk: ['vk-web', 'vk-android', 'vk-ios'], ok: ['ok-web', 'ok-android', 'ok-ios'] };
const REQUIRED_CHECKS = ['init', 'pauseResume', 'input', 'portrait', 'saveRoundTrip', 'ads', 'noYandexSdk'];

function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
      /^[A-Za-z]:[\\/]/.test(relative) || relative.includes('\0')) {
    throw new Error('Unsafe profile path');
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  const rel = path.relative(resolvedRoot, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error('Unsafe profile path');
  }
  let current = resolvedRoot;
  for (const part of rel.split(path.sep)) {
    if (!part) continue;
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Unsafe profile path: symlink');
    }
  }
  return target;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function fail(reason) { return { status: 'BLOCKED_VK_GAMES', releaseReady: false, reason }; }
function bundleDigest(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('VK bundle contains symlink');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
      else throw new Error('Unsupported VK bundle entry');
    }
  }
  visit(root);
  if (!files.length) throw new Error('VK bundle empty');
  const hasher = crypto.createHash('sha256');
  for (const file of files.sort()) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const bytes = fs.readFileSync(file);
    if (/\.(html|mjs|js|css)$/i.test(relative) &&
        /YaGames\.init|yandex-games-sdk|yandexGamesSDK|\/sdk\/_\//i.test(bytes.toString('utf8'))) {
      throw new Error('Yandex SDK in VK bundle');
    }
    hasher.update(relative);
    hasher.update('\0');
    hasher.update(bytes);
    hasher.update('\0');
  }
  return hasher.digest('hex');
}

export function runVkGamesProfile(root, profile, { release = false } = {}) {
  if (!profile || profile.schemaVersion !== 1 || profile.profile !== 'vk-games' ||
      typeof profile.enabled !== 'boolean') throw new Error('Invalid vk-games profile');
  if (!profile.enabled) return release ? fail('PROFILE_DISABLED_FOR_RELEASE') : { status: 'SKIPPED_OPT_IN_PROFILE', releaseReady: false };

  const contractFile = inside(root, profile.contractPath);
  if (!fs.existsSync(contractFile)) return fail('CONTRACT_MISSING');
  let c;
  try { c = readJson(contractFile); }
  catch { return fail('INVALID_CONTRACT_JSON'); }
  if (c.schemaVersion !== 1 || c.platform !== 'vk-games' ||
      !Array.isArray(c.distributions) || c.distributions.length === 0 ||
      c.distributions.some((item) => item !== 'vk' && item !== 'ok') ||
      new Set(c.distributions).size !== c.distributions.length ||
      typeof c.bundleDir !== 'string' ||
      c.bridgePackage !== '@vkontakte/vk-bridge' ||
      c.ads?.interstitial !== 'boundary-only' ||
      c.ads?.allowDuringDialogue !== false ||
      typeof c.ads?.rewarded !== 'boolean' ||
      c.saves?.mode !== 'vk-bridge' ||
      !Number.isInteger(c.saves?.maxBytes) || c.saves.maxBytes < 1 ||
      c.saves.maxBytes > 3800 || c.yandexSdkIncluded !== false) {
    return fail('INVALID_VK_CONTRACT');
  }
  const adapterFile = inside(root, c.adapterFile);
  const buildFile = inside(root, c.buildFile);
  const bundleRoot = inside(root, c.bundleDir);
  if (!fs.existsSync(adapterFile) || !fs.statSync(adapterFile).isFile()) return fail('ADAPTER_MISSING');
  if (!fs.existsSync(buildFile) || !fs.statSync(buildFile).isFile()) return fail('VK_BUILD_MISSING');
  if (!fs.existsSync(bundleRoot) || !fs.statSync(bundleRoot).isDirectory()) return fail('VK_BUNDLE_MISSING');
  const relativeEntry = path.relative(bundleRoot, buildFile);
  if (relativeEntry === '..' || relativeEntry.startsWith('..' + path.sep) ||
      path.isAbsolute(relativeEntry)) return fail('INVALID_BUNDLE_SCOPE');
  let bundleSha256;
  try { bundleSha256 = bundleDigest(bundleRoot); }
  catch (error) { return fail(/Yandex SDK/.test(error.message) ? 'YANDEX_SDK_IN_VK_BUILD' : 'INVALID_VK_BUNDLE'); }
  if (!release) {
    return { status: 'PASS_VK_STATIC_CONTRACT', releaseReady: false,
      distributions: c.distributions, bundleSha256 };
  }

  const evidenceFile = inside(root, profile.evidencePath);
  if (!fs.existsSync(evidenceFile)) return fail('RUNTIME_EVIDENCE_MISSING');
  let evidence;
  try { evidence = readJson(evidenceFile); }
  catch { return fail('INVALID_RUNTIME_EVIDENCE'); }
  let head;
  try {
    head = execFileSync('git', ['-C', path.resolve(root), 'rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch { return fail('GIT_HEAD_UNVERIFIED'); }
  if (!/^[a-f0-9]{40}$/.test(head) ||
      evidence.schemaVersion !== 1 || evidence.sourceHead !== head ||
      evidence.bundleSha256 !== bundleSha256 ||
      !Number.isFinite(Date.parse(evidence.capturedAt)) ||
      !Array.isArray(evidence.clients)) return fail('STALE_OR_INVALID_RUNTIME_EVIDENCE');

  const required = c.distributions.flatMap((item) => CLIENTS[item]);
  const observed = evidence.clients;
  if (observed.length !== required.length ||
      new Set(observed.map((item) => item.client)).size !== required.length ||
      !required.every((name) => observed.some((item) => item.client === name &&
        item.status === 'PASS' && item.source === 'real-client-observation' &&
        REQUIRED_CHECKS.every((check) => item.checks?.[check] === true)))) {
    return fail('RUNTIME_MATRIX_INCOMPLETE');
  }
  return { status: 'PASS_VK_RUNTIME_EVIDENCE', releaseReady: true,
    sourceHead: head, bundleSha256, clients: required };
}
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(arg('--root') ?? ROOT);
  let result;
  try {
    const profileFile = inside(root, arg('--profile') ?? 'config/optional-profiles/vk-games.json');
    result = runVkGamesProfile(root, readJson(profileFile), {
      release: process.argv.includes('--release')
    });
  } catch (error) { result = fail(error.message); }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status.startsWith('BLOCKED')) process.exitCode = 2;
}
