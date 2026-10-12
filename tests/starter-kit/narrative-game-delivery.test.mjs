import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../../tools/starter-kit/lib.mjs';
import { loadManifest, resolveManifestEntries } from '../../tools/starter-kit/manifest.mjs';
import { loadTargetProfile } from '../../tools/starter-kit/profile.mjs';

const sources=[
  'tools/narrative/narrative-game-validator.mjs',
  'tools/narrative/narrative-game-check.mjs',
  'tools/narrative/story-promise-validator.mjs',
  'config/optional-profiles/narrative-game.json',
  'docs/NARRATIVE_GAME_PROFILE.md'
];
test('narrative-game is shipped but opt-in in new and mature projects',()=>{
  const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'config/skill-policy.json'),'utf8'));
  const optional=policy.optionalProfiles.find(x=>x.name==='narrative-game');
  assert.equal(optional.enabledByDefault,false);
  const template=JSON.parse(fs.readFileSync(path.join(ROOT,optional.config),'utf8'));
  assert.equal(template.enabled,false);
  assert.deepEqual(optional.checks,['routes','dialogue','state','saves']);
  const manifest=loadManifest(ROOT);
  for(const source of sources){
    const entry=manifest.entries.find(x=>x.source===source);
    assert.ok(entry,'missing manifest entry '+source);
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,source))).digest('hex');
    assert.equal(entry.sha256,digest,'source drift '+source);
  }
  for(const profile of ['mature-yandex-phaser','new-project']){
    const mode=profile==='new-project'?'init':'update';
    const entries=resolveManifestEntries(manifest,loadTargetProfile(ROOT,profile,{mode}),mode);
    for(const source of sources)assert.ok(entries.some(x=>x.source===source),profile+' missing '+source);
  }
});
test('narrative validator remains independent of SDK and release packaging',()=>{
  const code=fs.readFileSync(path.join(ROOT,'tools/narrative/narrative-game-validator.mjs'),'utf8');
  assert.doesNotMatch(code,/child_process|npm run|sdk\.js|https?:\/\//);
  assert.match(code,/MAX_STATES=4096/);
  assert.match(code,/PASS_DECLARED_NARRATIVE_GRAPH/);
});
