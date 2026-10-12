import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNarrativeGame } from './narrative-game-validator.mjs';

const args=process.argv;
function option(name) {const pos=args.indexOf(name);return pos<0?null:args[pos+1];}
function resolveInside(root,relative){
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||
      /^[A-Za-z]:[\\/]/.test(relative)||relative.includes('\\')||
      relative.split('/').some(x=>!x||x==='.'||x==='..'))
    throw new Error('Unsafe profile path');
  const absolute=path.resolve(root,relative);
  const realRoot=fs.realpathSync(root);
  const actual=fs.realpathSync(absolute);
  if(!actual.startsWith(realRoot+path.sep)||!fs.statSync(actual).isFile())
    throw new Error('Profile path escapes project');
  return actual;
}
export function runNarrativeGameProfile(root,profile) {
  if(profile?.schemaVersion!==1||profile?.profile!=='narrative-game'||typeof profile?.enabled!=='boolean')
    return {status:'BLOCKED_NARRATIVE_GAME',errors:[{code:'BAD_PROFILE'}]};
  if(!profile.enabled)
    return {status:'SKIPPED_OPT_IN_PROFILE',errors:[],reason:'Set enabled=true in a project-owned profile to opt in.'};
  const model=JSON.parse(fs.readFileSync(resolveInside(root,profile.modelPath),'utf8'));
  const saves=JSON.parse(fs.readFileSync(resolveInside(root,profile.savesPath),'utf8'));
  const promises=profile.promisesPath===undefined
    ? undefined
    : JSON.parse(fs.readFileSync(resolveInside(root,profile.promisesPath),'utf8'));
  return checkNarrativeGame(model,saves,promises);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const root=path.resolve(option('--project')||process.cwd());
    const profilePath=path.resolve(option('--profile')||path.join(root,'config/optional-profiles/narrative-game.json'));
    const profile=JSON.parse(fs.readFileSync(profilePath,'utf8'));
    const result=runNarrativeGameProfile(root,profile);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.errors?.length||result.status==='SKIPPED_OPT_IN_PROFILE'&&args.includes('--require-enabled'))process.exitCode=2;
  }catch(err){process.stderr.write('NARRATIVE_GAME_PROFILE_ERROR: '+err.message+'\n');process.exitCode=2;}
}
