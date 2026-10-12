/**
 * Structural, optional story promise checks against the SAME bounded state graph
 * already explored by narrative-game. This cannot assess narrative payoff quality.
 */
const has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const idOK = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]+$/.test(s);
const validText = s => typeof s === 'string' && s.trim().length > 0;
const STATUSES=new Set(['planned','authored','runtime-verified','intentionally-open','unresolved']);
const match = (state,requires={}) => Object.entries(requires).every(([k,v])=>state[k]===v);

export function checkStoryPromises(model,ledger,{nodes,byScene}){
 const errors=[],warnings=[];
 const fail=(code,scope)=>errors.push({code,scope});
 const warn=(code,scope)=>warnings.push({code,scope});
 if(ledger?.schemaVersion!==1||!Array.isArray(ledger.promises))
   return {status:'BLOCKED_PROMISE_REFERENCES',errors:[{code:'BAD_PROMISE_LEDGER',scope:'root'}],warnings};
 const stateSchema=model.stateSchema||{},scenes=new Set(model.scenes.map(s=>s.id)),seen=new Set();
 let checked=0,notVerified=0;
 for(const [i,p] of ledger.promises.entries()){
   const where=idOK(p?.id)?p.id:'index:'+i;
   if(!idOK(p?.id)||seen.has(p.id)){fail('BAD_PROMISE_ID',where);continue;}
   seen.add(p.id);
   if(!STATUSES.has(p.status)){fail('BAD_PROMISE_STATUS',where);continue;}
   const endpoint=(value,label,required,checkExists)=>{
     if(value===undefined||value===null){
       if(required)fail('MISSING_PROMISE_'+label.toUpperCase(),where);
       return null;
     }
     if(!value||typeof value!=='object'||Array.isArray(value)||!idOK(value.sceneId)){
       fail('BAD_PROMISE_'+label.toUpperCase(),where);return null;
     }
     if(checkExists&&!scenes.has(value.sceneId))fail('UNKNOWN_PROMISE_SCENE',where+':'+label+':'+value.sceneId);
     const guard=value.requires===undefined?{}:value.requires;
     if(!guard||typeof guard!=='object'||Array.isArray(guard)){
       fail('BAD_PROMISE_GUARD',where+':'+label);return null;
     }
     for(const [key,val] of Object.entries(guard)){
       const def=stateSchema[key];
       if(!def||typeof val!==def.type||(def.type==='number'&&!Number.isFinite(val))||
          (Array.isArray(def.values)&&!def.values.some(v=>v===val))){
         fail('BAD_PROMISE_GUARD',where+':'+label+':'+key);
       }
     }
     return {sceneId:value.sceneId,requires:guard};
   };
   const planned=p.status==='planned',isOpen=p.status==='intentionally-open';
   const setup=endpoint(p.setup,'setup',!planned,!planned);
   const payoff=endpoint(p.payoff,'payoff',p.status==='authored'||p.status==='runtime-verified',!planned);
   if(isOpen){
     if(p.payoff!==undefined&&p.payoff!==null)fail('OPEN_PROMISE_HAS_PAYOFF',where);
     if(!validText(p.authorDecision))fail('OPEN_PROMISE_NO_AUTHOR_DECISION',where);
   }
   if(planned||p.status==='unresolved'){
     notVerified++;warn('PROMISE_NOT_YET_VERIFIED',where);
     continue;
   }
   if(!setup||!scenes.has(setup.sceneId))continue;
   const starts=(byScene.get(setup.sceneId)||[]).filter(k=>match(nodes.get(k).state,setup.requires));
   if(!starts.length){fail('PROMISE_SETUP_UNREACHABLE',where);continue;}
   if(isOpen){checked++;continue;}
   if(!payoff||!scenes.has(payoff.sceneId))continue;
   // Existence of one payoff path is insufficient: all terminal branches
   // following a matched setup must pass through a matching payoff.
   const checkPaths = start=>{
     const stack=[{key:start,seen:false}],visited=new Set();
     let foundPayoff=false,missingOnEnding=false;
     while(stack.length){
       const {key,seen}=stack.pop(),fingerprint=key+':'+seen;
       if(visited.has(fingerprint))continue;
       visited.add(fingerprint);
       const n=nodes.get(key);
       const satisfied=seen||(n.id===payoff.sceneId&&match(n.state,payoff.requires));
       if(satisfied)foundPayoff=true;
       if(n.ending&&!satisfied)missingOnEnding=true;
       for(const next of n.edges)stack.push({key:next,seen:satisfied});
     }
     return {foundPayoff,missingOnEnding};
   };
   if(starts.some(start=>{
     const {foundPayoff,missingOnEnding}=checkPaths(start);
     return !foundPayoff||missingOnEnding;
   }))fail('PROMISE_PAYOFF_UNREACHABLE_ON_ROUTE',where);
   else checked++;
   if(setup.sceneId===payoff.sceneId)warn('SAME_SCENE_SETUP_PAYOFF_EDITORIAL_REVIEW',where);
   if(p.status==='runtime-verified'){
     notVerified++;warn('RUNTIME_PROMISE_EVIDENCE_NOT_ATTESTED',where);
   }
 }
 return {status:errors.length?'BLOCKED_PROMISE_REFERENCES':
   notVerified?'NOT_VERIFIED_PROMISE_EVIDENCE':'PASS_DECLARED_PROMISE_REFERENCES',
   errors,warnings,coverage:{declared:ledger.promises.length,structurallyChecked:checked,notVerified},
   disclaimer:'Checks declared scene references, state guards, and route reachability only. Never attests prose quality, authored semantic payoff, or live runtime.'};
}
