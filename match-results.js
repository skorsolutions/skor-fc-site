(function(root){
  'use strict';
  function normalize(rows){
    if(!Array.isArray(rows))throw Error('Match results unavailable.');
    const map=new Map();
    for(const row of rows){
      if(!row||typeof row.match_id!=='string'||!row.match_id||map.has(row.match_id)||!['win','loss','draw'].includes(row.outcome)||typeof row.on_penalties!=='boolean')throw Error('Invalid match result.');
      const r={match_id:row.match_id,outcome:row.outcome,on_penalties:row.on_penalties};
      for(const key of ['home_score','away_score','skor_score','opponent_score']){
        if(!Number.isSafeInteger(row[key])||row[key]<0)throw Error('Invalid match score.');r[key]=row[key];
      }
      if(!((r.home_score===r.skor_score&&r.away_score===r.opponent_score)||(r.home_score===r.opponent_score&&r.away_score===r.skor_score)))throw Error('Match scores disagree.');
      if(r.on_penalties){
        for(const key of ['penalty_skor','penalty_opponent']){if(!Number.isSafeInteger(row[key])||row[key]<0)throw Error('Invalid penalty score.');r[key]=row[key];}
        if(r.skor_score!==r.opponent_score||r.penalty_skor===r.penalty_opponent||r.outcome!==(r.penalty_skor>r.penalty_opponent?'win':'loss'))throw Error('Penalty result disagrees.');
      }else if(r.outcome!==(r.skor_score>r.opponent_score?'win':r.skor_score<r.opponent_score?'loss':'draw'))throw Error('Match result disagrees.');
      map.set(r.match_id,r);
    }
    return map;
  }
  const label=r=>r?(r.outcome==='win'?'SKOR FC won':r.outcome==='loss'?'SKOR FC lost':'Draw')+(r.on_penalties?' on penalties':''):'';
  const markup=r=>r?`<div class="match-result ${r.outcome}"><strong>${label(r)}</strong>${r.on_penalties?`<span>Penalties: SKOR ${r.penalty_skor}–${r.penalty_opponent} Opponent</span>`:''}</div>`:'';
  function createFeed({client,onChange=()=>{}}){
    let records=new Map(),request=null;
    async function refresh(){
      if(request)return request;
      request=(async()=>{try{const r=await Promise.resolve().then(()=>client.rpc('get_public_match_results'));if(r.error)throw r.error;records=normalize(r.data);onChange(records);return true;}catch{return false;}finally{request=null;}})();
      return request;
    }
    return {refresh,get:(id,status)=>status==='final'?records.get(id)||null:null,records:()=>records};
  }
  root.SKORMatchResults={normalize,label,markup,createFeed};
})(typeof window==='object'?window:globalThis);
