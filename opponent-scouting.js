(function(root){
  'use strict';
  const FORMATIONS=['Unknown','4-2-3-1','4-3-3','4-4-2','4-5-1','3-5-2','3-2-3-2','3-4-3','5-3-2','Custom / Freeform'];
  const copy=v=>JSON.parse(JSON.stringify(v)),phase={pregame:0,first_half:1,second_half:2};
  function recommend(snapshot,now=Date.now()){
    const rows=(snapshot?.observations||[]).filter(o=>o.valid_match!==false&&FORMATIONS.includes(o.formation)&&!['Unknown','Custom / Freeform'].includes(o.formation));
    const current=rows.filter(o=>String(o.match_id)===String(snapshot.match_id)).sort((a,b)=>(a.kind==='observed'?-1:1)-(b.kind==='observed'?-1:1)||(phase[b.phase]||0)-(phase[a.phase]||0)||Date.parse(b.updated_at)-Date.parse(a.updated_at));
    if(current.length)return {formation:current[0].formation,kind:current[0].kind,count:1,total:1,evidence:[current[0].id],reason:'Captain '+current[0].kind+' formation for this game.'};
    const games=new Map(),cutoff=Math.min(Date.parse(snapshot?.kickoff)||now,now);
    rows.filter(o=>o.kind==='observed'&&o.match_status!=='cancelled'&&Date.parse(o.kickoff)<cutoff).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)||(phase[b.phase]||0)-(phase[a.phase]||0)||Date.parse(b.updated_at)-Date.parse(a.updated_at)).forEach(o=>{if(!games.has(o.match_id))games.set(o.match_id,o);});
    const history=[...games.values()].slice(0,5),counts=new Map();history.forEach(o=>counts.set(o.formation,(counts.get(o.formation)||0)+1));
    const winner=history.slice().sort((a,b)=>counts.get(b.formation)-counts.get(a.formation)||Date.parse(b.kickoff)-Date.parse(a.kickoff))[0];
    if(!winner)return {formation:null,kind:'unknown',count:0,total:0,evidence:[],reason:'No observed formation history yet. Choose the opponent shape manually.'};
    const stale=now-Date.parse(winner.kickoff)>180*86400000;
    return {formation:winner.formation,kind:'history',count:counts.get(winner.formation),total:history.length,evidence:history.map(o=>o.id),last_observed:winner.kickoff,stale,
      reason:`Observed ${winner.formation} in ${counts.get(winner.formation)} of the last ${history.length} recorded meeting${history.length===1?'':'s'}.`+(stale?' The latest evidence is over six months old.':'')};
  }
  function capture(raw){
    if(!raw?.profile)return null;
    const snap=copy(raw);snap.version=1;snap.suggestion=recommend(snap);
    snap.observations=(snap.observations||[]).slice(0,30);
    // Retain dates/formation provenance even when long historical notes exceed the snapshot budget.
    for(let i=snap.observations.length-1;i>=0&&JSON.stringify(snap).length>80000;i--)snap.observations[i].details={};
    if(JSON.stringify(snap).length>95000)throw Error('Scouting is too large for a strategy snapshot. Shorten the general notes first.');
    return snap;
  }
  function threats(snapshot){
    const current=(snapshot?.observations||[]).filter(o=>o.match_id===snapshot.match_id).sort((a,b)=>(a.kind==='observed'?-1:1)-(b.kind==='observed'?-1:1)||(phase[b.phase]||0)-(phase[a.phase]||0));
    return copy(current.find(o=>o.details?.dangerous_players?.length)?.details.dangerous_players||snapshot?.profile?.details?.dangerous_players||[]);
  }
  function annotate(scene,snapshot){
    const byRole=new Map();for(const p of threats(snapshot)){if(p.position&&!byRole.has(p.position))byRole.set(p.position,p);}
    for(const frame of scene.subScenes||[])for(const actor of frame.opponents||[]){
      const p=byRole.get(actor.role||actor.label);if(!p)continue;
      actor.scoutingLabel=[p.number!==''&&p.number!=null?'#'+p.number:'',p.name||p.threat?.slice(0,35)||'Scouted threat'].filter(Boolean).join(' ').slice(0,60);
    }
    return scene;
  }
  const api={FORMATIONS,recommend,capture,threats,annotate};root.SKORScouting=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
