import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyNarrativeSceneContract } from '../../tools/visual/narrative-scene-contract.mjs';

const H = 'a'.repeat(40);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-scene-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prose = 'Ник произнёс: «Не трогай кастрюлю». Эрик отступил. Позже героиня нашла ключ и дверь кухни открылась.';
  fs.writeFileSync(path.join(root, 'story.txt'), prose);
  fs.writeFileSync(path.join(root, 'keys.webp'), 'KEYS_PHOTOGRAPH');
  fs.writeFileSync(path.join(root, 'dinner.webp'), 'DINNER_PHOTOGRAPH');
  const beats = [
    {id:'S65-keys',at:[0,0],authoredExcerpt:'героиня нашла ключ и дверь кухни открылась',requiredCast:['Alice','Nick'],actor:'Alice',action:'find-key',location:'closed-kitchen',assetPath:'keys.webp',assetSha256:sha('KEYS_PHOTOGRAPH')},
    {id:'S65-dinner',at:[0,29],authoredExcerpt:'Позже героиня нашла ключ и дверь кухни открылась',requiredCast:['Alice','Nick'],actor:'Alice',action:'dinner',location:'open-kitchen',assetPath:'dinner.webp',assetSha256:sha('DINNER_PHOTOGRAPH')}
  ];
  const contract = {schemaVersion:1,sourceHead:H,sceneId:'S65',source:{path:'story.txt',sha256:sha(prose)},beats};
  const mapping = {schemaVersion:1,sourceHead:H,sceneId:'S65',beats:beats.map(({at,actor,action,location,requiredCast,assetPath,assetSha256}) => ({at,actor,action,location,requiredCast,assetPath,assetSha256,presentation:'cg'}))};
  return {root, contract, mapping};
}
const verify = data => verifyNarrativeSceneContract(data.root,data.contract,data.mapping,{currentHead:H});

test('valid declared source/mapping remains separate from independent Web acceptance', t => {
  const result = verify(fixture(t));
  assert.equal(result.status, 'PASS_DECLARED_SCENE_MAPPING');
  assert.match(result.warning,/independent/);
});
test('S07 wrong acting character is rejected', t => {
  const data=fixture(t); data.mapping.beats[0].actor='Eric';
  assert.ok(verify(data).errors.some(x=>x.code==='MISATTRIBUTED_ACTOR'));
});
test('S65 dinner asset before key-discovery cue is rejected', t => {
  const data=fixture(t);data.mapping.beats[0].assetPath='dinner.webp';data.mapping.beats[0].assetSha256=sha('DINNER_PHOTOGRAPH');
  assert.ok(verify(data).errors.some(x=>x.code==='WRONG_BEAT_ASSET'));
});
test('fabricated narrative excerpt cannot be source-grounded', t => {
  const data=fixture(t);data.contract.beats[0].authoredExcerpt='A robot flies into the kitchen to open the safe.';
  assert.ok(verify(data).errors.some(x=>x.code==='MISSING_AUTHORED_ANCHOR'));
});
test('cue ordering and missing runtime beats fail closed', t => {
  const data=fixture(t);data.mapping.beats.pop();data.contract.beats.reverse();
  const codes=verify(data).errors.map(x=>x.code);
  assert.ok(codes.includes('NON_MONOTONIC_CUE'));assert.ok(codes.includes('MISSING_RUNTIME_BEAT'));
});
test('sprite stage requires an explicit exception to CG-first', t => {
  const data=fixture(t);data.mapping.beats[0].presentation='sprites';
  assert.ok(verify(data).errors.some(x=>x.code==='SPRITES_WITHOUT_REASON'));
  data.mapping.beats[0].spriteExceptionReason='Actor expressions change each paragraph';
  assert.equal(verify(data).errors.length,0);
});
test('stale HEAD is not accepted', t => {
  const data=fixture(t);data.contract.sourceHead='f'.repeat(40);
  assert.ok(verify(data).errors.some(x=>x.code==='STALE_HEAD'));
});
test('asset traversal or symlink escape cannot pass', t => {
  const data=fixture(t);data.mapping.beats[0].assetPath='../escape.webp';
  assert.ok(verify(data).errors.some(x=>x.code==='BAD_PATH'));
});
