(function(root){
  'use strict';
  const fields=['recorded_matches','present_count','absent_count','excused_count','unmarked_count','eligible_count','goals','assists','yellow_cards','red_cards','motm'];
  function normalize(value){
    if(!value||!value.summary||!Array.isArray(value.matches))throw new Error('Match record is unavailable.');
    const summary={...value.summary};
    for(const key of fields){
      if(summary[key]===null||summary[key]===undefined||summary[key]===''||!Number.isSafeInteger(Number(summary[key]))||Number(summary[key])<0)throw new Error('Match record is incomplete.');
      summary[key]=Number(summary[key]);
    }
    if(summary.eligible_count!==summary.present_count+summary.absent_count||summary.recorded_matches!==value.matches.length)throw new Error('Match record is incomplete.');
    const ids=new Set();
    const matches=value.matches.map(m=>{
      if(!m.match_id||ids.has(m.match_id)||m.status!=='final'||!['present','absent','excused','unmarked'].includes(m.attendance_status))throw new Error('Match history is incomplete.');
      ids.add(m.match_id);
      for(const key of ['my_goals','my_assists','my_yellow_cards','my_red_cards','skor_score','opponent_score'])if(!Number.isSafeInteger(Number(m[key]))||m[key]===null||Number(m[key])<0)throw new Error('Match history is incomplete.');
      if(typeof m.my_motm!=='boolean'||!Number.isFinite(Date.parse(m.kickoff)))throw new Error('Match history is incomplete.');
      const result={...m};for(const key of ['my_goals','my_assists','my_yellow_cards','my_red_cards','skor_score','opponent_score'])result[key]=Number(m[key]);
      return result;
    });
    const totals={recorded_matches:matches.length,present_count:0,absent_count:0,excused_count:0,unmarked_count:0,eligible_count:0,goals:0,assists:0,yellow_cards:0,red_cards:0,motm:0};
    for(const m of matches){totals[m.attendance_status+'_count']++;if(['present','absent'].includes(m.attendance_status))totals.eligible_count++;for(const key of ['goals','assists','yellow_cards','red_cards'])totals[key]+=m['my_'+key];if(m.my_motm)totals.motm++;}
    if(fields.some(key=>totals[key]!==summary[key]))throw new Error('Match totals and history disagree.');
    summary.attendance_rate=summary.eligible_count?100*summary.present_count/summary.eligible_count:null;
    return {summary,matches,as_of:value.as_of||null};
  }
  function createController({fetchRecord,onChange,onState,isVisible=()=>true,now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout,interval=30000}){
    let owner=null,generation=0,inFlight=null,timer=null,record=null,refreshedAt=null,lastAttempt=-Infinity;
    function state(phase){onState({phase,record,refreshedAt});}
    function stopTimer(){if(timer!==null)cancel(timer);timer=null;}
    function arm(){stopTimer();if(owner&&isVisible())timer=schedule(()=>{timer=null;void refresh();},interval);}
    function clear(){generation++;owner=null;inFlight=null;stopTimer();record=null;refreshedAt=null;lastAttempt=-Infinity;state('idle');}
    async function refresh(){
      if(!owner||!isVisible())return;
      if(inFlight)return inFlight;
      stopTimer();lastAttempt=now();const ticket=generation;
      state('loading');
      const request=(async()=>{
        try{
          const response=await Promise.resolve().then(fetchRecord);
          if(ticket!==generation)return;
          if(response.error)throw response.error;
          const next=normalize(response.data);
          record=next;refreshedAt=now();onChange(next);state('ready');
        }catch(error){
          if(ticket===generation)state(record?'stale':'error');
        }finally{
          if(ticket===generation){inFlight=null;arm();}
        }
      })();
      inFlight=request;await request;
    }
    function start(id){clear();owner=id;return refresh();}
    function resume(){if(owner&&isVisible()){if(now()-lastAttempt>=2000)void refresh();else arm();}else stopTimer();}
    return {start,refresh,resume,pause:stopTimer,clear};
  }
  const api={normalize,createController};root.SKORPlayerMatchRecord=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
