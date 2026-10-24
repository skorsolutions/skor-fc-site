(function(root){
  'use strict';
  const ROLES={starting:'starting keeper',starting_temp:'starting temp keeper',secondary_temp:'secondary temp keeper',backup:'backup keeper'};
  const isFreeform=s=>['Freeform','Freeform / Custom'].includes(s?.formation);
  function jersey(value){
    if(value===null||value===undefined||String(value).trim()==='')return null;
    const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=99?n:null;
  }
  function normalize(value){
    const assignments={};
    if(value?.assignments&&typeof value.assignments==='object'&&!Array.isArray(value.assignments)){
      Object.entries(value.assignments).forEach(([pid,a])=>{
        if(!pid||['__proto__','constructor','prototype'].includes(pid)||!Object.hasOwn(ROLES,a?.role))return;
        assignments[pid]={role:a.role,jerseyNumber:jersey(a.jerseyNumber)};
      });
    }
    const numbers=Array.isArray(value?.spareNumbers)?value.spareNumbers:[30];
    return {spareNumbers:[...new Set(numbers.map(jersey).filter(n=>n!==null))],assignments};
  }
  function squadIds(state){
    return [...new Set([...(isFreeform(state)?Object.keys(state?.freeform||{}):Object.values(state?.slots||{})),...(state?.bench||[])].filter(Boolean).map(String))];
  }
  function startingId(state){
    if(!isFreeform(state))return String(state?.slots?.GK||'');
    const plan=normalize(state?.keeperPlan),field=new Set(Object.keys(state?.freeform||{}));
    return Object.keys(plan.assignments).find(pid=>field.has(pid)&&['starting','starting_temp'].includes(plan.assignments[pid].role))||'';
  }
  function details(state,pid,primaryNumber){
    const key=String(pid||''),plan=normalize(state?.keeperPlan),a=plan.assignments[key];
    const starter=startingId(state),start=plan.assignments[starter];
    const temp=a&&(a.role.includes('temp')||(a.role==='backup'&&a.jerseyNumber!==null));
    const starterTemp=start&&(start.role.includes('temp')||(start.role==='backup'&&start.jerseyNumber!==null));
    let role='';
    if(squadIds(state).includes(key)){
      if(key===starter)role=temp?'starting_temp':'starting';
      else if(a)role=starterTemp?'secondary_temp':'backup';
    }
    const secondary=role?a?.jerseyNumber??null:null;
    const primary=primaryNumber===null||primaryNumber===undefined?'':String(primaryNumber);
    const number=secondary!==null&&String(secondary)!==primary?`${primary} / ${secondary}`:primary;
    return {role,label:ROLES[role]||'',jerseyNumber:secondary,number};
  }
  function prune(state){
    const plan=normalize(state?.keeperPlan),allowed=new Set(squadIds(state));
    Object.keys(plan.assignments).forEach(pid=>{if(!allowed.has(pid))delete plan.assignments[pid];});
    state.keeperPlan=plan;return plan;
  }
  function validate(state){
    const errors=[],plan=normalize(state?.keeperPlan),allowed=new Set(squadIds(state));
    const starters=Object.entries(plan.assignments).filter(([pid,a])=>allowed.has(pid)&&['starting','starting_temp'].includes(a.role));
    if(isFreeform(state)&&starters.length>1)errors.push('Choose one starting keeper.');
    if(Object.keys(plan.assignments).some(pid=>allowed.has(pid))&&!startingId(state))errors.push('Choose a starting keeper for this lineup.');
    Object.entries(plan.assignments).forEach(([pid,a])=>{
      if(!allowed.has(pid))return;
      if((a.role.includes('temp')||a.role==='backup')&&a.jerseyNumber===null)errors.push('Choose a spare jersey number (1–99) for each temporary or backup keeper.');
    });
    return [...new Set(errors)];
  }
  function setRole(state,pid,role){
    if(!squadIds(state).includes(pid))return 'Add this player to the field or Substitutes first.';
    if(role&&!Object.hasOwn(ROLES,role))return 'Choose a valid keeper role.';
    const plan=normalize(state.keeperPlan),current=startingId(state);
    if(current===pid&&!isFreeform(state)&&!role.startsWith('starting'))return 'Choose a different starting keeper or move this player out of GK first.';
    if(!role)delete plan.assignments[pid];
    else{
      plan.assignments[pid]={role,jerseyNumber:plan.assignments[pid]?.jerseyNumber??(role==='starting'?null:plan.spareNumbers[0]??30)};
      if(role.startsWith('starting')){
        Object.entries(plan.assignments).forEach(([other,a])=>{
          if(other===pid||!a.role.startsWith('starting'))return;
          if(a.role==='starting'&&a.jerseyNumber===null)delete plan.assignments[other];
          else a.role=a.role==='starting_temp'?'secondary_temp':'backup';
        });
        state.bench=(state.bench||[]).filter(id=>id!==pid);
        if(isFreeform(state)){
          state.freeform=state.freeform||{};
          if(!state.freeform[pid])state.freeform[pid]={x:50,y:92};
        }else{
          const old=state.slots?.GK;
          state.slots=state.slots||{};
          Object.keys(state.slots).forEach(slot=>{if(state.slots[slot]===pid)delete state.slots[slot];});
          if(old&&old!==pid&&!state.bench.includes(old))state.bench.push(old);
          state.slots.GK=pid;
        }
      }
    }
    state.keeperPlan=plan;return '';
  }
  const api={ROLES,jersey,normalize,squadIds,startingId,details,prune,validate,setRole};
  root.SKORKeeperPlan=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
