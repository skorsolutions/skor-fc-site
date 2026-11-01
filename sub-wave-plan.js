/* Project planned substitutions without changing the saved starting lineup. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SKORSubWavePlan=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ids=value=>(Array.isArray(value)?value:value?[value]:[]).filter(Boolean).map(String);
  const unique=value=>[...new Set(ids(value))];
  function project(snapshot={},knownIds=null){
    const starters=unique(snapshot.formation==='Freeform / Custom'
      ?Object.keys(snapshot.freeform||{}):Object.values(snapshot.slots||{}));
    const field=new Set(starters);
    const bench=new Set(unique(snapshot.bench).filter(pid=>!field.has(pid)));
    const known=knownIds===null?null:new Set(ids(knownIds));
    const frames={firstHalf:[],secondHalf:[]};
    const problems=[];
    const current=()=>({field:[...field],bench:[...bench]});
    for(const phase of ['firstHalf','secondHalf']){
      const rows=Array.isArray(snapshot.subs?.[phase])?snapshot.subs[phase]:[];
      rows.forEach((row,index)=>{
        const out=ids(row?.out),incoming=ids(row?.in);
        const invalidOut=unique(out).filter(pid=>!field.has(pid)||(known&&!known.has(pid)));
        const invalidIn=unique(incoming).filter(pid=>!bench.has(pid)||(known&&!known.has(pid)));
        const issues=[];
        if(invalidOut.length)issues.push('out_not_on_field');
        if(invalidIn.length)issues.push('in_not_on_bench');
        if(new Set(out).size!==out.length||new Set(incoming).size!==incoming.length)issues.push('duplicate_player');
        if(out.some(pid=>incoming.includes(pid)))issues.push('both_sides');
        if(out.length!==incoming.length)issues.push('unequal_counts');
        const before=current(),upstreamInvalid=problems.length>0;
        // An unfinished or invalid wave cannot establish the next lineup.
        const applied=!issues.length&&(out.length>0||incoming.length>0);
        if(applied){
          out.forEach(pid=>{field.delete(pid);bench.add(pid);});
          incoming.forEach(pid=>{bench.delete(pid);field.add(pid);});
        }
        const frame={phase,index,before,after:current(),out,in:incoming,invalidOut,invalidIn,issues,applied,upstreamInvalid};
        frames[phase].push(frame);
        if(issues.length)problems.push(frame);
      });
    }
    return {starters,frames,problems,final:current()};
  }
  function canToggle(frame,side,pid){
    if(!frame||!['out','in'].includes(side))return false;
    const key=String(pid),selected=frame[side];
    // A stale saved selection must always be removable.
    if(selected.includes(key))return true;
    const eligible=side==='out'?frame.before.field:frame.before.bench;
    return eligible.includes(key)&&!frame[side==='out'?'in':'out'].includes(key);
  }
  return {project,canToggle};
});
