import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNarrativeGameProfile } from '../../tools/narrative/narrative-game-check.mjs';

const make=t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'narrative-game-profile-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
};
test('narrative-game is disabled by default and never claims coverage', t=>{
 const root=make(t);
 const profile={schemaVersion:1,profile:'narrative-game',enabled:false,
  modelPath:'narrative/model.json',savesPath:'narrative/saves.json'};
 assert.equal(runNarrativeGameProfile(root,profile).status,'SKIPPED_OPT_IN_PROFILE');
 assert.equal(fs.readdirSync(root).length,0);
});

test('explicit opt-in validates declared graph and save samples',t=>{
 const root=make(t);
 fs.mkdirSync(path.join(root,'narrative'));
 const m={schemaVersion:1,start:'s0',characters:['Alice'],locales:['ru'],
 stateSchema:{route:{type:'string',values:['none']}},initialState:{route:'none'},
 scenes:[{id:'s0',dialogue:{ru:[{speaker:'Alice',text:'Начинаем.'}]},ending:true}]};
 const saves={schemaVersion:1,samples:[{schemaVersion:1,sceneId:'s0',
  state:{route:'none'},locale:'ru',dialogueIndex:0}]};
 fs.writeFileSync(path.join(root,'narrative/model.json'),JSON.stringify(m));
 fs.writeFileSync(path.join(root,'narrative/saves.json'),JSON.stringify(saves));
 const profile={schemaVersion:1,profile:'narrative-game',enabled:true,
  modelPath:'narrative/model.json',savesPath:'narrative/saves.json'};
 assert.equal(runNarrativeGameProfile(root,profile).status,'PASS_DECLARED_NARRATIVE_GRAPH');
});

test('profile cannot read outside project through traversal',t=>{
 const root=make(t);
 const p={schemaVersion:1,profile:'narrative-game',enabled:true,
  modelPath:'../secrets.json',savesPath:'narrative/save.json'};
 assert.throws(()=>runNarrativeGameProfile(root,p),/Unsafe profile path/);
});

test('optional narrative-game metadata has no implicit activation',()=>{
 const root=path.resolve(import.meta.dirname,'../..');
 const policy=JSON.parse(fs.readFileSync(path.join(root,'config/skill-policy.json'),'utf8'));
 const entry=policy.optionalProfiles.find(x=>x.name==='narrative-game');
 assert.equal(entry.enabledByDefault,false);
 const template=JSON.parse(fs.readFileSync(path.join(root,entry.config),'utf8'));
 assert.equal(template.enabled,false);
});
