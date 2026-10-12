import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkNarrativeGame } from '../../tools/narrative/narrative-game-validator.mjs';
import { runNarrativeGameProfile } from '../../tools/narrative/narrative-game-check.mjs';

const model=()=>({
 schemaVersion:1,start:'start',characters:['A'],locales:['ru'],
 stateSchema:{route:{type:'string',values:['none','nick','self']},found:{type:'boolean'}},
 initialState:{route:'none',found:false},
 scenes:[
  {id:'start',dialogue:{ru:[{speaker:'A',text:'Начало'}]},choices:[
    {id:'n',label:{ru:'Ник'},to:'nick',effects:{route:'nick'}},
    {id:'s',label:{ru:'Я'},to:'solo',effects:{route:'self'}}]},
  {id:'nick',dialogue:{ru:[{speaker:'A',text:'Тайна'}]},choices:[
    {id:'reveal',label:{ru:'Узнать'},to:'nick-end',effects:{found:true}}]},
  {id:'nick-end',dialogue:{ru:[{speaker:'A',text:'Разгадка'}]},ending:true},
  {id:'solo',dialogue:{ru:[{speaker:'A',text:'Свободный выбор'}]},ending:true}
 ]
});
const saves=()=>({schemaVersion:1,samples:[{schemaVersion:1,sceneId:'start',locale:'ru',
 dialogueIndex:0,state:{route:'none',found:false}}]});
const ledger=(promises)=>({schemaVersion:1,promises});
const authored=()=>({id:'key',status:'authored',setup:{sceneId:'nick',requires:{route:'nick'}},
 payoff:{sceneId:'nick-end',requires:{found:true}}});
const check=promises=>checkNarrativeGame(model(),saves(),ledger(promises));
const codes=r=>r.errors.map(x=>x.code);

test('unchanged graph-only opt-in never silently triggers story promise checks',()=>{
 const r=checkNarrativeGame(model(),saves());
 assert.equal(r.status,'PASS_DECLARED_NARRATIVE_GRAPH');
 assert.equal(r.storyPromises.status,'SKIPPED_OPTIONAL_STORY_PROMISES');
});
test('valid source-bound route and effect condition pass only declared references',()=>{
 const r=check([authored()]);
 assert.equal(r.status,'PASS_DECLARED_NARRATIVE_GRAPH');
 assert.equal(r.storyPromises.status,'PASS_DECLARED_PROMISE_REFERENCES');
 assert.equal(r.storyPromises.coverage.structurallyChecked,1);
 assert.match(r.storyPromises.disclaimer,/Never attests prose quality/);
});
test('dangling scene IDs fail closed',()=>{
 const p=authored();p.payoff.sceneId='nonexistent';
 assert.ok(codes(check([p])).includes('UNKNOWN_PROMISE_SCENE'));
});
test('invalid and unknown state guards fail closed',()=>{
 const p=authored();p.setup.requires={route:'other',lostKey:true};
 assert.ok(codes(check([p])).includes('BAD_PROMISE_GUARD'));
});
test('route setup cannot claim payoff on an unrelated branch',()=>{
 const p=authored();p.payoff.sceneId='solo';p.payoff.requires={route:'self'};
 assert.ok(codes(check([p])).includes('PROMISE_PAYOFF_UNREACHABLE_ON_ROUTE'));
});
test('a promise set before a branch split must resolve on all matching routes',()=>{
 const p=authored();p.setup={sceneId:'start'};p.payoff={sceneId:'nick-end'};
 assert.ok(codes(check([p])).includes('PROMISE_PAYOFF_UNREACHABLE_ON_ROUTE'));
});
test('a route guard without reachable setup cannot silently pass',()=>{
 const p=authored();p.setup.requires={route:'self'};
 assert.ok(codes(check([p])).includes('PROMISE_SETUP_UNREACHABLE'));
});
test('planned and unresolved promises are visible as unverified, not fake PASS',()=>{
 const r=check([{id:'later',status:'planned',payoff:{sceneId:'future'}}]);
 assert.equal(r.status,'PASS_DECLARED_NARRATIVE_GRAPH');
 assert.equal(r.storyPromises.status,'NOT_VERIFIED_PROMISE_EVIDENCE');
 assert.equal(r.storyPromises.coverage.notVerified,1);
});
test('a runtime-verified claim is not attested by supplied graph JSON',()=>{
 const p=authored();p.status='runtime-verified';
 const r=check([p]);
 assert.equal(r.storyPromises.status,'NOT_VERIFIED_PROMISE_EVIDENCE');
 assert.ok(r.warnings.some(x=>x.code==='RUNTIME_PROMISE_EVIDENCE_NOT_ATTESTED'));
});
test('an intentionally open thread requires explicit author decision and no payoff',()=>{
 const good={id:'open',status:'intentionally-open',setup:{sceneId:'solo',requires:{route:'self'}},
  authorDecision:'Deliberate sequel thread'};
 assert.equal(check([good]).storyPromises.status,'PASS_DECLARED_PROMISE_REFERENCES');
 const bad={...good,authorDecision:'',payoff:{sceneId:'nick-end'}};
 const ec=codes(check([bad]));
 assert.ok(ec.includes('OPEN_PROMISE_NO_AUTHOR_DECISION'));
 assert.ok(ec.includes('OPEN_PROMISE_HAS_PAYOFF'));
});
test('malformed/duplicate ledgers never pass',()=>{
 assert.ok(codes(checkNarrativeGame(model(),saves(),{})).includes('BAD_PROMISE_LEDGER'));
 assert.ok(codes(check([authored(),authored()])).includes('BAD_PROMISE_ID'));
});
test('profile reads ledger only after explicit opt-in and rejects traversal',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'story-promise-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const disabled={schemaVersion:1,profile:'narrative-game',enabled:false,modelPath:'x',savesPath:'y',promisesPath:'../secret'};
 assert.equal(runNarrativeGameProfile(root,disabled).status,'SKIPPED_OPT_IN_PROFILE');
 fs.mkdirSync(path.join(root,'narrative'));
 fs.writeFileSync(path.join(root,'narrative/model.json'),JSON.stringify(model()));
 fs.writeFileSync(path.join(root,'narrative/saves.json'),JSON.stringify(saves()));
 fs.writeFileSync(path.join(root,'narrative/promises.json'),JSON.stringify(ledger([authored()])));
 const profile={schemaVersion:1,profile:'narrative-game',enabled:true,
  modelPath:'narrative/model.json',savesPath:'narrative/saves.json',promisesPath:'narrative/promises.json'};
 assert.equal(runNarrativeGameProfile(root,profile).storyPromises.status,'PASS_DECLARED_PROMISE_REFERENCES');
 assert.throws(()=>runNarrativeGameProfile(root,{...profile,promisesPath:'../secret'}),/Unsafe profile path/);
});
