/**
 * Optional narrative-game contract validator. It checks the supplied graph/model,
 * not the provenance of a live game export or quality of prose.
 */
import { checkStoryPromises } from './story-promise-validator.mjs';

const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const validText = s => typeof s === 'string' && s.trim().length > 0;
const primitive = x => x===null || ['string','number','boolean'].includes(typeof x);
const idOK = x => validText(x) && /^[A-Za-z0-9_.:-]+$/.test(x);
const stable = obj => JSON.stringify(obj);
const MAX_STATES=4096;

export function checkNarrativeGame(model, saves, storyPromiseLedger=undefined) {
  const errors=[], warnings=[];
  const fail=(code,scope='')=>errors.push({code,scope});
  if(model?.schemaVersion!==1 || !Array.isArray(model.scenes) || model.scenes.length===0 ||
      !validText(model.start) || !Array.isArray(model.characters) ||
      !Array.isArray(model.locales) || !model.locales.length ||
      !model.stateSchema || typeof model.stateSchema!=='object' ||
      !model.initialState || typeof model.initialState!=='object')
    return {status:'BLOCKED_NARRATIVE_GAME',errors:[{code:'BAD_MODEL',scope:'root'}],warnings:[]};
  const locales=model.locales;
  if(new Set(locales).size!==locales.length || locales.some(x=>!idOK(x)))fail('BAD_LOCALES');
  const chars=new Set(model.characters);
  if(chars.size!==model.characters.length || [...chars].some(x=>!idOK(x)))fail('BAD_CHARACTERS');
  const stateKeys=Object.keys(model.stateSchema).sort();
  if(!stateKeys.length) fail('EMPTY_STATE_SCHEMA');
  const canonicalState=(state,where)=>{
    if(!state || typeof state!=='object' || Array.isArray(state)){fail('BAD_STATE',where);return null;}
    const keys=Object.keys(state).sort();
    if(stable(keys)!==stable(stateKeys)){fail('STATE_KEYS_MISMATCH',where);return null;}
    for(const key of stateKeys){
      const def=model.stateSchema[key],v=state[key];
      if(!def || !['boolean','string','number'].includes(def.type) ||
          typeof v!==def.type || (def.type==='number' && !Number.isFinite(v)) ||
          (Array.isArray(def.values)&& !def.values.some(x=>x===v))){
        fail('INVALID_STATE_VALUE',where+':'+key);return null;
      }
      if(def.type!=='boolean' && (!Array.isArray(def.values)||def.values.length===0))
        fail('UNBOUNDED_STATE_DOMAIN',key);
    }
    return Object.fromEntries(stateKeys.map(k=>[k,state[k]]));
  };
  const initial=canonicalState(model.initialState,'initial');
  const scenes=new Map();
  for(const scene of model.scenes){
    if(!idOK(scene?.id)){fail('BAD_SCENE_ID');continue;}
    if(scenes.has(scene.id)){fail('DUPLICATE_SCENE',scene.id);continue;}
    scenes.set(scene.id,scene);
    const kinds=[scene.ending===true,validText(scene.next),Array.isArray(scene.choices)].filter(Boolean);
    if(kinds.length!==1)fail('BAD_SCENE_EXIT',scene.id);
    for(const loc of locales){
      const lines=scene.dialogue?.[loc];
      if(!Array.isArray(lines)||!lines.length){fail('MISSING_DIALOGUE',scene.id+':'+loc);continue;}
      for(const [index,line] of lines.entries()){
        if(!validText(line?.text) || (line?.speaker!==null && !chars.has(line?.speaker)))
          fail('INVALID_DIALOGUE_LINE',scene.id+':'+loc+':'+index);
      }
    }
    if(scene.choices){
      if(!Array.isArray(scene.choices)||!scene.choices.length)fail('EMPTY_CHOICES',scene.id);
      const ids=new Set();
      for(const choice of (Array.isArray(scene.choices)?scene.choices:[])){
        if(!idOK(choice?.id)||ids.has(choice.id))fail('BAD_CHOICE_ID',scene.id);
        ids.add(choice?.id);
        if(!idOK(choice?.to))fail('BAD_CHOICE_TARGET',scene.id);
        for(const loc of locales)if(!validText(choice?.label?.[loc]))fail('MISSING_CHOICE_LABEL',scene.id+':'+loc);
        for(const kind of ['requires','effects']){
          if(choice?.[kind]!==undefined){
            if(!choice[kind] || Array.isArray(choice[kind]) || typeof choice[kind]!=='object')fail('BAD_'+kind.toUpperCase(),scene.id);
            else for(const [key,value] of Object.entries(choice[kind])){
              if(!stateKeys.includes(key)||!primitive(value))fail('UNKNOWN_STATE_EFFECT_OR_GUARD',scene.id+':'+key);
            }
          }
        }
      }
    }
  }
  if(!scenes.has(model.start))fail('START_MISSING');
  for(const scene of scenes.values()){
    if(scene.next&&!scenes.has(scene.next))fail('DANGLING_EDGE',scene.id+'->'+scene.next);
    for(const c of (Array.isArray(scene.choices)?scene.choices:[]))if(c?.to&&!scenes.has(c.to))fail('DANGLING_EDGE',scene.id+'->'+c.to);
  }
  if(errors.length)return {status:'BLOCKED_NARRATIVE_GAME',errors,warnings};
  const queue=[{id:model.start,state:initial}], nodes=new Map(), byScene=new Map(), visitedChoiceIds=new Set();
  const nodeKey=(id,state)=>id+':'+stable(state);
  while(queue.length){
    const q=queue.shift(),k=nodeKey(q.id,q.state);
    if(nodes.has(k))continue;
    if(nodes.size>=MAX_STATES){fail('STATE_SPACE_LIMIT');break;}
    const scene=scenes.get(q.id), edges=[];
    nodes.set(k,{id:q.id,state:q.state,edges,ending:scene.ending===true});
    if(!byScene.has(q.id))byScene.set(q.id,[]);
    byScene.get(q.id).push(k);
    if(scene.ending===true)continue;
    const choices=scene.choices||[{id:'_next',to:scene.next}];
    const fingerprints=new Map();
    for(const c of choices){
      if(Object.entries(c.requires||{}).some(([key,v])=>q.state[key]!==v))continue;
      if(scene.choices)visitedChoiceIds.add(q.id+':'+c.id);
      const next=canonicalState({...q.state,...c.effects},q.id+':'+c.id);
      if(!next)continue;
      const target=nodeKey(c.to,next);
      edges.push(target);
      queue.push({id:c.to,state:next});
      const fp=c.to+':'+stable(next);
      if(fingerprints.has(fp))warnings.push({code:'SAME_RESULT_CHOICES',scope:q.id,choiceIds:[fingerprints.get(fp),c.id]});
      fingerprints.set(fp,c.id);
    }
    if(!edges.length)fail('NO_AVAILABLE_TRANSITION',k);
  }
  const finishing=new Set([...nodes].filter(([,n])=>n.ending).map(([k])=>k));
  const backwards=new Map();
  for(const [k,n] of nodes)for(const target of n.edges){
    if(!backwards.has(target))backwards.set(target,[]);
    backwards.get(target).push(k);
  }
  const canFinish=new Set(finishing),pending=[...finishing];
  for(let i=0;i<pending.length;i++)for(const parent of backwards.get(pending[i])||[]){
    if(!canFinish.has(parent)){canFinish.add(parent);pending.push(parent);}
  }
  for(const k of nodes.keys())if(!canFinish.has(k))fail('NON_TERMINATING_PATH',k);
  const declaredEndings=[...scenes.values()].filter(s=>s.ending===true).map(s=>s.id);
  if(!declaredEndings.length)fail('NO_ENDINGS');
  for(const id of declaredEndings)if(!byScene.has(id))fail('UNREACHABLE_ENDING',id);
  for(const id of scenes.keys())if(!byScene.has(id))fail('UNREACHABLE_SCENE',id);
  for(const scene of scenes.values())for(const choice of scene.choices||[])
    if(!visitedChoiceIds.has(scene.id+':'+choice.id))fail('UNREACHABLE_CHOICE',scene.id+':'+choice.id);

  if(saves?.schemaVersion!==1 || !Array.isArray(saves.samples) || saves.samples.length===0)fail('NO_SAVE_FIXTURES');
  else for(const [idx,sample] of saves.samples.entries()){
    const where='save:'+idx;
    if(sample?.schemaVersion!==1){fail('SAVE_SCHEMA_VERSION',where);continue;}
    const state=canonicalState(sample.state,where);
    const scene=scenes.get(sample.sceneId);
    if(!scene || !locales.includes(sample.locale) || !Number.isSafeInteger(sample.dialogueIndex) ||
       sample.dialogueIndex<0 || sample.dialogueIndex>= (scene?.dialogue?.[sample.locale]?.length??0)){
      fail('INVALID_SAVE_CURSOR',where);continue;
    }
    if(state && !nodes.has(nodeKey(sample.sceneId,state)))fail('UNREACHABLE_SAVE_STATE',where);
    if(state){
      const restored=JSON.parse(JSON.stringify({schemaVersion:1,sceneId:sample.sceneId,state,locale:sample.locale,dialogueIndex:sample.dialogueIndex}));
      if(stable(restored.state)!==stable(state)||restored.sceneId!==sample.sceneId)
        fail('SAVE_ROUNDTRIP_MISMATCH',where);
    }
  }
  const storyPromises=storyPromiseLedger===undefined
    ? {status:'SKIPPED_OPTIONAL_STORY_PROMISES',errors:[],warnings:[]}
    : checkStoryPromises(model,storyPromiseLedger,{nodes,byScene});
  errors.push(...storyPromises.errors);
  warnings.push(...storyPromises.warnings);
  return {status:errors.length?'BLOCKED_NARRATIVE_GAME':'PASS_DECLARED_NARRATIVE_GRAPH',errors,warnings,storyPromises,
    coverage:{declaredScenes:scenes.size,reachedScenes:byScene.size,visitedStates:nodes.size,
      declaredEndings:declaredEndings.length,reachedEndings:declaredEndings.filter(x=>byScene.has(x)).length,
      saveFixtures:saves?.samples?.length??0},
    disclaimer:'Checks supplied model and JSON snapshots only; cannot attest live runtime saves, prose quality or Web review.'};
}
