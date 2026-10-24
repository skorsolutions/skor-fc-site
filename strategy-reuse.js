/* Role-based tactical copying. Pure helpers; no storage or database writes. */
(function(global){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function plan({sourceState,targetState,targetPlayers,scenes,formations}){
    const source=sourceState?.formation,target=targetState?.formation;
    if(!source||!target)return {ok:false,reason:'Both lineups need a saved formation before copying.'};
    if(source!==target)return {ok:false,reason:`Cannot clone: source formation ${source} differs from target formation ${target}. Choose a lineup with the same formation.`};
    if(!Object.hasOwn(formations,source))return {ok:false,reason:'Custom/freeform lineups do not have fixed positions to match. Choose a standard formation.'};
    const roles=formations[source].map(row=>Array.isArray(row)?row[0]:row);
    const ids=new Set(),targetIds=new Set(),players=new Map((targetPlayers||[]).map(p=>[String(p.id),p])),mapping=[];
    if(!Array.isArray(scenes)||!scenes.length||scenes.length>20)return {ok:false,reason:'Choose a strategy containing 1–20 bundles.'};
    for(const role of roles){
      const from=String(sourceState.slots?.[role]||''),to=String(targetState.slots?.[role]||'');
      if(!from||!to)return {ok:false,reason:`Cannot clone: ${role} is empty in ${!from?'the source':'the target'} lineup. Fill every formation position first.`};
      if(ids.has(from)||targetIds.has(to))return {ok:false,reason:'Cannot clone: a player occupies more than one formation position.'};
      if(!players.has(to))return {ok:false,reason:`Roster details for target ${role} are unavailable. Open that lineup in Lineups, then try again.`};
      ids.add(from);targetIds.add(to);mapping.push({role,fromId:from,to:copy(players.get(to))});
    }
    for(let bi=0;bi<scenes.length;bi++){
      const steps=scenes[bi].subScenes||[];
      if(!steps.length||steps.length>12)return {ok:false,reason:`Bundle ${bi+1} must contain 1–12 animation steps.`};
      for(let si=0;si<steps.length;si++){
        const home=steps[si].home;
        if(!Array.isArray(home)||home.length!==roles.length||new Set(home.map(p=>String(p.id))).size!==roles.length||home.some(p=>!ids.has(String(p.id))||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))){
          return {ok:false,reason:`Cannot clone bundle ${bi+1}, step ${si+1}: its players do not match the source lineup. Correct that step before copying.`};
        }
      }
    }
    const first=scenes[0].subScenes[0].home;
    return {ok:true,formation:source,mapping:mapping.map(row=>({...row,from:copy(first.find(p=>String(p.id)===row.fromId))})),bundleCount:scenes.length,stepCount:scenes.reduce((n,s)=>n+s.subScenes.length,0)};
  }
  function remap(scenes,approved,makeId){
    if(!approved?.ok)throw Error(approved?.reason||'Choose matching formations before copying.');
    const replacements=new Map(approved.mapping.map(row=>[row.fromId,row]));
    return scenes.map(scene=>{
      const result=copy(scene);result.id=makeId('scene');result.sourceBundleId=null;result.copyAsNew=true;
      result.subScenes=result.subScenes.map(step=>{
        const frame=copy(step);frame.id=makeId('step');
        frame.home=frame.home.map(p=>{const row=replacements.get(String(p.id));if(!row)throw Error('The source players changed. Review the copy again.');return {...copy(row.to),role:row.role,x:p.x,y:p.y};});
        return frame;
      });
      result.activeSubSceneId=result.subScenes[0].id;
      for(const key of ['home','opponents','ball','drawings'])result[key]=copy(result.subScenes[0][key]??(key==='ball'?{x:50,y:45}:[]));
      return result;
    });
  }
  function uniqueName(base,used){
    const names=new Set((used||[]).map(s=>String(s).trim().toLowerCase())),name=String(base||'Strategy').trim().slice(0,70)||'Strategy';
    if(!names.has(name.toLowerCase()))return name;
    for(let i=1;;i++){const suffix=i===1?' Copy':` Copy ${i}`,candidate=name.slice(0,70-suffix.length)+suffix;if(!names.has(candidate.toLowerCase()))return candidate;}
  }
  const api={plan,remap,uniqueName};if(typeof module==='object'&&module.exports)module.exports=api;global.SKORStrategyReuse=api;
})(typeof window!=='undefined'?window:globalThis);
