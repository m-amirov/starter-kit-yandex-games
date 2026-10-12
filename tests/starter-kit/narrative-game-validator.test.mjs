import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNarrativeGame } from '../../tools/narrative/narrative-game-validator.mjs';

const model=()=>({
 schemaVersion:1,start:'opening',characters:['Alice','Nick'],locales:['ru','en'],
 stateSchema:{route:{type:'string',values:['none','nick','self']},hasKey:{type:'boolean'}},
 initialState:{route:'none',hasKey:false},
 scenes:[
  {id:'opening',dialogue:{ru:[{speaker:null,text:'Кому довериться?'}],en:[{speaker:null,text:'Who do I trust?'}]},
   choices:[
    {id:'nick',label:{ru:'Выбрать Ника',en:'Choose Nick'},to:'search',effects:{route:'nick'}},
    {id:'self',label:{ru:'Выбрать себя',en:'Choose myself'},to:'independent',effects:{route:'self'}}
   ]},
  {id:'search',dialogue:{ru:[{speaker:'Nick',text:'Я помогу найти ключ.'}],en:[{speaker:'Nick',text:'I can find the key.'}]},
   choices:[{id:'found-key',label:{ru:'Найти ключ',en:'Find key'},to:'nick-end',effects:{hasKey:true}}]},
  {id:'nick-end',dialogue:{ru:[{speaker:'Alice',text:'Мы открыли дверь.'}],en:[{speaker:'Alice',text:'We opened the door.'}]},ending:true},
  {id:'independent',dialogue:{ru:[{speaker:'Alice',text:'Мой выбор — я сама.'}],en:[{speaker:'Alice',text:'I choose myself.'}]},ending:true}
 ]
});
const saves=()=>({schemaVersion:1,samples:[
 {schemaVersion:1,sceneId:'opening',locale:'ru',dialogueIndex:0,state:{route:'none',hasKey:false}},
 {schemaVersion:1,sceneId:'nick-end',locale:'en',dialogueIndex:0,state:{route:'nick',hasKey:true}},
 {schemaVersion:1,sceneId:'independent',locale:'ru',dialogueIndex:0,state:{route:'self',hasKey:false}}
]});
const codes=(m=model(),s=saves())=>checkNarrativeGame(m,s).errors.map(x=>x.code);

test('valid graph explores distinct romance and self routes with all endings and save samples',()=>{
 const r=checkNarrativeGame(model(),saves());
 assert.equal(r.status,'PASS_DECLARED_NARRATIVE_GRAPH');
 assert.equal(r.coverage.declaredScenes,4);
 assert.equal(r.coverage.reachedEndings,2);
 assert.equal(r.coverage.saveFixtures,3);
});

test('dangling choice target blocks routing',()=>{
 const m=model();m.scenes[0].choices[0].to='missing';
 assert.ok(codes(m).includes('DANGLING_EDGE'));
});

test('unreachable ending cannot be passed by a happy path alone',()=>{
 const m=model();m.scenes[0].choices.pop();
 assert.ok(codes(m).includes('UNREACHABLE_ENDING'));
});

test('wrong dialogue speaker blocks narrative dialogue contract',()=>{
 const m=model();m.scenes[1].dialogue.ru[0].speaker='Eric';
 assert.ok(codes(m).includes('INVALID_DIALOGUE_LINE'));
});

test('missing translated dialogue or choice label blocks RU/EN completeness',()=>{
 const m=model();delete m.scenes[2].dialogue.en;
 delete m.scenes[0].choices[0].label.en;
 const errors=codes(m);
 assert.ok(errors.includes('MISSING_DIALOGUE'));
 assert.ok(errors.includes('MISSING_CHOICE_LABEL'));
});

test('unknown or invalid state effects block the graph',()=>{
 const m=model();m.scenes[0].choices[0].effects={route:'impossible'};
 assert.ok(codes(m).includes('INVALID_STATE_VALUE'));
});

test('unreachable save snapshot state fails closed',()=>{
 const s=saves();s.samples[1].state={route:'self',hasKey:true};
 assert.ok(codes(model(),s).includes('UNREACHABLE_SAVE_STATE'));
});

test('invalid cursor and old save schema version are rejected',()=>{
 const s=saves();s.samples[0].dialogueIndex=100;s.samples[1].schemaVersion=2;
 const errors=codes(model(),s);
 assert.ok(errors.includes('INVALID_SAVE_CURSOR'));
 assert.ok(errors.includes('SAVE_SCHEMA_VERSION'));
});

test('loop without reachable ending fails nontermination',()=>{
 const m=model();m.scenes[1].choices[0].to='search';
 const errors=codes(m);
 assert.ok(errors.includes('NON_TERMINATING_PATH'));
 assert.ok(errors.includes('UNREACHABLE_ENDING'));
});

test('missing save fixtures never silently counts as save PASS',()=>{
 assert.ok(codes(model(),{schemaVersion:1,samples:[]}).includes('NO_SAVE_FIXTURES'));
});

test('choices with same target and effects create a warning',()=>{
 const m=model();m.scenes[0].choices.push({
   id:'also-nick',label:{ru:'Другой вариант',en:'Another option'},to:'search',effects:{route:'nick'}});
 const result=checkNarrativeGame(m,saves());
 assert.equal(result.status,'PASS_DECLARED_NARRATIVE_GRAPH');
 assert.ok(result.warnings.some(x=>x.code==='SAME_RESULT_CHOICES'));
});
