(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SKORPortalActivity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const HEARTBEAT_MS=5*60*1000, IDLE_MS=15*60*1000, RETRY_MS=60*1000;
  function latestActivityAt(event){
    const values=[event?.last_seen_at,event?.occurred_at].filter(value=>Number.isFinite(Date.parse(value)));
    return values.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
  }
  function groupActivity(rows){
    const groups=new Map();
    for(const row of rows||[]){
      const id=String(row.participant_id||row.roster_player_id||'');
      if(!id)continue;
      if(!groups.has(id))groups.set(id,{...row,events:[]});
      if(row.event_id)groups.get(id).events.push(row);
    }
    for(const group of groups.values())group.events.sort((a,b)=>(Date.parse(latestActivityAt(b))||0)-(Date.parse(latestActivityAt(a))||0));
    return [...groups.values()];
  }
  function relativeActivity(value,now=Date.now()){
    const time=Date.parse(value);
    if(!Number.isFinite(time))return 'No recorded activity';
    const ms=Math.max(0,now-time);
    if(ms<60*1000)return 'Just now';
    if(ms<60*60*1000)return `${Math.floor(ms/(60*1000))}m ago`;
    if(ms<24*60*60*1000)return `${Math.floor(ms/(60*60*1000))}h ago`;
    return `${Math.floor(ms/(24*60*60*1000))}d ago`;
  }
  function createTracker({client,portal,win=window,doc=win.document,onRecorded=()=>{},onError=()=>{},now=()=>Date.now()}){
    if(!['player','captain'].includes(portal))throw new Error('Unknown portal.');
    let active=null;
    const visible=()=>doc.visibilityState!=='hidden';
    async function record(){
      const state=active,time=now();
      if(!state||!visible()||state.busy||time-state.interaction>IDLE_MS||time-state.sent<HEARTBEAT_MS||time-state.attempt<RETRY_MS)return false;
      state.busy=true;state.attempt=time;
      try{
        const session=await client.auth.getSession();
        if(active!==state)return false;
        if(session.error)throw session.error;
        if(session.data?.session?.user?.id!==state.userId)return false;
        let request=client.rpc('record_my_portal_activity',{p_portal:portal});
        if(request.abortSignal&&state.abort)request=request.abortSignal(state.abort.signal);
        const result=await request;
        if(active!==state)return false;
        if(result.error)throw result.error;
        if(!result.data)throw new Error('Activity was not confirmed.');
        state.sent=now();
        onRecorded();
        return true;
      }catch(error){if(active===state)onError(error);return false;}
      finally{state.busy=false;}
    }
    function interact(){if(active&&visible()){active.interaction=now();void record();}}
    function clear(){active?.abort?.abort();active=null;}
    function start(userId){
      if(!userId){clear();return Promise.resolve(false);}
      if(active?.userId===userId)return record();
      clear();
      active={userId,interaction:now(),sent:-Infinity,attempt:-Infinity,busy:false,abort:win.AbortController?new win.AbortController():null};
      return record();
    }
    for(const event of ['pointerdown','keydown','touchstart'])doc.addEventListener(event,interact,{passive:true});
    doc.addEventListener('visibilitychange',interact);
    for(const event of ['focus','pageshow','online'])win.addEventListener(event,interact);
    const timer=win.setInterval(()=>{void record();},RETRY_MS);
    function destroy(){
      clear();win.clearInterval(timer);
      for(const event of ['pointerdown','keydown','touchstart','visibilitychange'])doc.removeEventListener(event,interact);
      for(const event of ['focus','pageshow','online'])win.removeEventListener(event,interact);
    }
    return {start,clear,destroy,record};
  }
  return {HEARTBEAT_MS,IDLE_MS,createTracker,latestActivityAt,groupActivity,relativeActivity};
});
