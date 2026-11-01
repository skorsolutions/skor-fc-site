/* Permanent roster numbers and saved match jerseys are separate values. */
(function(root){
  'use strict';
  const key=p=>String(p?.player_key||p?.id||'');
  function number(value){
    if(value===null||value===undefined||String(value).trim()==='')return null;
    const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=99?n:null;
  }
  const label=value=>number(value)===null?'TBD':String(number(value));
  function normalize(value){
    const out={};
    if(!value||typeof value!=='object'||Array.isArray(value))return out;
    Object.entries(value).slice(0,200).forEach(([pid,n])=>{
      if(pid&&!['__proto__','prototype','constructor'].includes(pid)&&!pid.startsWith('temp:'))out[pid]=number(n);
    });
    return out;
  }
  function resolve(state,pid,fallback){
    const jerseys=normalize(state?.matchJerseys),id=String(pid);
    return Object.hasOwn(jerseys,id)?jerseys[id]:number(fallback);
  }
  function squad(state){return [...new Set([...(state?.formation==='Freeform / Custom'?Object.keys(state.freeform||{}):Object.values(state?.slots||{})),...(state?.bench||[])].filter(Boolean).map(String))];}
  function projectRoster(state,roster=[]){return roster.map(p=>{
    if(p.temp||key(p).startsWith('temp:'))return {...p};
    const n=resolve(state,key(p),p.number??p.jersey_number);
    return {...p,number:n,jersey_number:n};
  });}
  function capture(state,roster=[]){
    const jerseys=normalize(state?.matchJerseys),byKey=new Map(roster.map(p=>[key(p),p]));
    squad(state).forEach(pid=>{const p=byKey.get(pid);if(p&&!p.temp&&!pid.startsWith('temp:'))jerseys[pid]=resolve(state,pid,p.number??p.jersey_number);});
    return {...state,matchJerseys:jerseys};
  }
  function available(state,roster,pid,n){
    const wanted=number(n);if(wanted===null)return true;
    const members=new Set(squad(state));
    return !roster.some(p=>key(p)!==String(pid)&&(members.has(key(p))||(p.temp&&!p.archived))&&resolve(state,key(p),p.number??p.jersey_number)===wanted);
  }
  function validate(state,roster,{required=false}={}){
    const members=new Set(squad(state)),errors=[];
    roster.filter(p=>members.has(key(p))&&!p.temp&&!key(p).startsWith('temp:')).forEach(p=>{
      const n=resolve(state,key(p),p.number??p.jersey_number),name=p.name||p.preferred_name||'Player';
      if(required&&n===null)errors.push('Assign a match jersey to '+name+'.');
      if(n!==null&&!available(state,roster,key(p),n))errors.push('Match jersey #'+n+' is already assigned to another player.');
    });
    return [...new Set(errors)];
  }
  const api={number,label,normalize,resolve,squad,projectRoster,capture,available,validate};
  root.SKORMatchJerseys=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
