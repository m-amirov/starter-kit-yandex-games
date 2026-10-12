import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/i;
const HEAD = /^[a-f0-9]{40}$/i;
const SCENE = /^S\d{2,3}$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const position = at => Array.isArray(at) && at.length === 2 && at.every(n => Number.isSafeInteger(n) && n >= 0);
const key = at => String(at[0]) + ':' + String(at[1]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function checkedFile(root, relative, expected, failures, label) {
  if (!nonempty(relative) || path.isAbsolute(relative) || /^[a-zA-Z]:[\\/]/.test(relative) ||
      relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..')) {
    failures.push({ code: 'BAD_PATH', label }); return null;
  }
  try {
    const canonicalRoot = fs.realpathSync(root);
    const file = path.resolve(canonicalRoot, relative);
    const canonical = fs.realpathSync(file);
    if (!canonical.startsWith(canonicalRoot + path.sep) || !fs.statSync(canonical).isFile())
      throw new Error('not a regular file inside root');
    const data = fs.readFileSync(canonical);
    if (!SHA256.test(expected || '') || hash(data) !== expected.toLowerCase())
      failures.push({ code: 'FILE_HASH_MISMATCH', label });
    return data;
  } catch {
    failures.push({ code: 'FILE_UNAVAILABLE', label }); return null;
  }
}

/** Checks declared, source-bound scene/cue mapping; never validates image semantics or Web acceptance. */
export function verifyNarrativeSceneContract(root, contract, mapping, { currentHead } = {}) {
  const errors = [];
  const fail = (code, detail = '') => errors.push({ code, detail });
  if (contract?.schemaVersion !== 1 || !SCENE.test(contract?.sceneId ?? '') ||
      !HEAD.test(contract?.sourceHead ?? '') || !Array.isArray(contract?.beats) || !contract.beats.length)
    return { status: 'BLOCKED_SCENE_CONTRACT', errors: [{ code: 'BAD_CONTRACT' }] };
  if (mapping?.schemaVersion !== 1 || mapping.sceneId !== contract.sceneId || !Array.isArray(mapping.beats))
    return { status: 'BLOCKED_SCENE_CONTRACT', errors: [{ code: 'BAD_RUNTIME_MAPPING' }] };
  const actualHead = currentHead ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
  if (!HEAD.test(actualHead ?? '') || contract.sourceHead !== actualHead || mapping.sourceHead !== actualHead)
    fail('STALE_HEAD');
  const source = checkedFile(root, contract.source?.path, contract.source?.sha256, errors, 'authoredSource');
  const text = source?.toString('utf8');
  const runtimeByKey = new Map();
  for (const runtime of mapping.beats) {
    if (!position(runtime?.at)) { fail('BAD_RUNTIME_CUE'); continue; }
    const id = key(runtime.at);
    if (runtimeByKey.has(id)) fail('DUPLICATE_RUNTIME_CUE', id);
    runtimeByKey.set(id, runtime);
  }
  let last = null;
  const seen = new Set();
  for (const beat of contract.beats) {
    if (!position(beat?.at) || !nonempty(beat?.id)) { fail('BAD_BEAT'); continue; }
    const id = key(beat.at);
    if (seen.has(id)) fail('DUPLICATE_AUTHORED_CUE', id);
    seen.add(id);
    if (last && (beat.at[0] < last[0] || (beat.at[0] === last[0] && beat.at[1] <= last[1])))
      fail('NON_MONOTONIC_CUE', id);
    last = beat.at;
    if (!nonempty(beat.authoredExcerpt) || beat.authoredExcerpt.length < 12 ||
        text === undefined || !text.includes(beat.authoredExcerpt)) fail('MISSING_AUTHORED_ANCHOR', id);
    if (!nonempty(beat.location) || !nonempty(beat.action) || !nonempty(beat.actor) ||
        !Array.isArray(beat.requiredCast) || !beat.requiredCast.length ||
        beat.requiredCast.some(x => !nonempty(x)) || new Set(beat.requiredCast).size !== beat.requiredCast.length ||
        !beat.requiredCast.includes(beat.actor)) fail('BAD_STORY_INTENT', id);
    const runtime = runtimeByKey.get(id);
    if (!runtime) { fail('MISSING_RUNTIME_BEAT', id); continue; }
    for (const field of ['actor', 'action', 'location'])
      if (runtime[field] !== beat[field]) fail('MISATTRIBUTED_' + field.toUpperCase(), id);
    if (!same(runtime.requiredCast, beat.requiredCast)) fail('CAST_MISMATCH', id);
    if (beat.assetSha256 !== runtime.assetSha256 || beat.assetPath !== runtime.assetPath)
      fail('WRONG_BEAT_ASSET', id);
    checkedFile(root, runtime.assetPath, runtime.assetSha256, errors, 'asset:' + id);
    if (runtime.presentation === 'sprites' && !nonempty(runtime.spriteExceptionReason))
      fail('SPRITES_WITHOUT_REASON', id);
    if (runtime.presentation !== 'cg' && runtime.presentation !== 'sprites') fail('BAD_PRESENTATION', id);
  }
  for (const id of runtimeByKey.keys()) if (!seen.has(id)) fail('UNDECLARED_RUNTIME_BEAT', id);
  return {
    status: errors.length ? 'BLOCKED_SCENE_CONTRACT' : 'PASS_DECLARED_SCENE_MAPPING',
    sourceHead: actualHead ?? null, sceneId: contract.sceneId,
    authoredBeatCount: contract.beats.length, runtimeBeatCount: mapping.beats.length,
    errors,
    warning: 'Metadata and source anchors only; requires actual-pixel independent narrative/art review.'
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opt = name => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
    const root = opt('--project'), contractFile = opt('--contract'), mappingFile = opt('--mapping');
    if (!root || !contractFile || !mappingFile)
      throw new Error('Usage: node narrative-scene-contract.mjs --project DIR --contract JSON --mapping JSON');
    const contract = JSON.parse(fs.readFileSync(path.resolve(contractFile), 'utf8'));
    const mapping = JSON.parse(fs.readFileSync(path.resolve(mappingFile), 'utf8'));
    const result = verifyNarrativeSceneContract(root, contract, mapping);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.errors.length) process.exitCode = 2;
  } catch (error) {
    process.stderr.write('SCENE_CONTRACT_ERROR: ' + error.message + '\n');
    process.exitCode = 2;
  }
}
