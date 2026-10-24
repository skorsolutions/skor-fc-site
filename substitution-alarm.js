/* Local, opt-in Game Day chime. Never writes or controls the official clock. */
(function(global){
  'use strict';
  const FRESH_MS=30000;
  function settings(value={}){
    const out={interval:Number(value.interval??15),ring:Number(value.ring??5),snooze:Number(value.snooze??60),repeats:Number(value.repeats??1),stopMinute:Number(value.stopMinute??90),safetyMinutes:Number(value.safetyMinutes??120)};
    if(![10,15,20].includes(out.interval)||![3,5,10].includes(out.ring)||![0,30,60,120].includes(out.snooze)||![1,2].includes(out.repeats)||!Number.isInteger(out.stopMinute)||out.stopMinute<1||out.stopMinute>180||!Number.isInteger(out.safetyMinutes)||out.safetyMinutes<10||out.safetyMinutes>180)throw Error('Choose valid alarm settings.');
    return out;
  }
  function seconds(clock,wall){
    const anchor=Number(clock?.clock_elapsed_seconds)||0,start=Date.parse(clock?.clock_started_at);
    return Math.max(0,anchor+(clock?.clock_running&&Number.isFinite(start)?Math.max(0,Math.floor((wall-start)/1000)):0));
  }
  function createEngine({getContext,play,silence,onChange=()=>{},now=()=>performance.now(),wallNow=Date.now,visible=()=>true,lease={claim:()=>true,renew:()=>true,release(){}}}){
    let feed=null,active=false,config=settings(),owner=null,match=null,started=0,wallStarted=0,hadStarted=false,phaseIdentity=null,previous=null,next=null,ringUntil=null,snoozeAt=null,repeats=0,message='Off · Choose settings to start on this phone.';
    const state=()=>({active,config:{...config},message,next,ringing:ringUntil!==null,snoozeAt,repeats,match});
    const emit=()=>onChange(state());
    function quiet(){silence();ringUntil=null;snoozeAt=null;repeats=0;}
    function stop(reason='Alarm off.'){quiet();active=false;previous=null;next=null;message=reason;lease.release();emit();}
    function start(value){
      if(active)throw Error('Stop the alarm before changing settings.');
      config=settings(value);const c=getContext();
      if(!c?.canUse||!c.userId||!c.matchId)throw Error('Select a match with captain access first.');
      if(!visible())throw Error('Open Game Day and keep this phone unlocked.');
      if(c.matchStatus==='final'||feed?.matchId===c.matchId&&feed.clock?.clock_phase==='full_time')throw Error('This match has finished.');
      if(!feed||feed.matchId!==c.matchId||wallNow()-feed.receivedAt>FRESH_MS)throw Error('Refresh Game Day to load the official clock first.');
      if(!lease.claim())throw Error('Close other alarm tabs and allow site storage, then try again.');
      owner=c.userId;match=c.matchId;started=now();wallStarted=wallNow();hadStarted=false;phaseIdentity=null;previous=null;next=null;active=true;tick();return active;
    }
    function ring(repeat=false){
      silence();if(repeat)repeats--;else repeats=config.snooze?config.repeats:0;
      try{play(config.ring);}catch(e){stop(e.message||'Sound unavailable. Tap Start alarm again.');return;}
      ringUntil=now()+config.ring*1000;snoozeAt=repeats>0?ringUntil+config.snooze*1000:null;
    }
    function tick(){
      if(!active)return;
      const c=getContext(),time=now(),wall=wallNow();
      if(!c?.canUse||c.userId!==owner||c.matchId!==match){stop('Alarm stopped: account or match changed.');return;}
      if(!visible()){stop('Alarm stopped: keep this phone unlocked with Game Day open, then tap Start alarm.');return;}
      if(c.matchStatus==='final'){stop('Alarm stopped at full time.');return;}
      if(time-started>=config.safetyMinutes*60000||wall-wallStarted>=config.safetyMinutes*60000){stop('Alarm stopped at the safety time limit.');return;}
      if(!lease.renew()){stop('Alarm stopped: another tab is using alarms on this phone.');return;}
      if(!feed||feed.matchId!==match||wall-feed.receivedAt>FRESH_MS){stop('Alarm stopped: clock updates unavailable. Refresh Game Day and restart.');return;}
      const clock=feed.clock||{},phase=clock.clock_phase||'not_started',elapsed=seconds(clock,wall),half=(Number(clock.half_length_minutes)||45)*60;
      if(phase==='full_time'||elapsed>=config.stopMinute*60){stop('Alarm stopped at its selected match time.');return;}
      if(phase==='not_started'){
        if(hadStarted){stop('Alarm stopped: official clock was reset.');return;}
        quiet();previous=null;next=null;message='Alarm active · Waiting for kickoff.';emit();return;
      }
      if(phase==='halftime'){quiet();previous=null;next=null;message='Alarm active · Silent at halftime.';emit();return;}
      if(!['first_half','second_half'].includes(phase)){stop('Alarm stopped: official clock unavailable.');return;}
      const parsedToken=Date.parse(clock.clock_phase_started_at),token=Number.isFinite(parsedToken)?parsedToken:clock.clock_phase_started_at;
      if(phaseIdentity&&(phaseIdentity.phase==='second_half'&&phase==='first_half'||phaseIdentity.phase===phase&&phaseIdentity.token&&token&&phaseIdentity.token!==token)){
        stop('Alarm stopped: official clock was restarted.');return;
      }
      phaseIdentity={phase,token};
      hadStarted=true;
      const base=phase==='second_half'?half:0,end=base+half,step=config.interval*60;
      if(elapsed>=end){quiet();previous=null;next=null;message='Alarm active · Silent at the end of this half.';emit();return;}
      if(!clock.clock_running){quiet();previous=null;next=null;message='Alarm active · Paused with the match clock.';emit();return;}
      // Seed from current time after starting/resuming, phase changes or a timer
      // gap. Never replay a missed interval or an old snooze after suspension.
      if(!previous||previous.phase!==phase||time-previous.time>5000||elapsed<previous.elapsed||elapsed-previous.elapsed>5){
        quiet();next=base+(Math.floor(Math.max(0,elapsed-base)/step)+1)*step;
      }else if(next!==null&&elapsed>=next){
        if(elapsed-next<=3)ring();
        next=base+(Math.floor(Math.max(0,elapsed-base)/step)+1)*step;
      }
      if(!active)return;
      if(ringUntil!==null&&time>=ringUntil){silence();ringUntil=null;}
      if(snoozeAt!==null&&time>=snoozeAt){if(time-snoozeAt<=3000)ring(true);else{quiet();}}
      if(!active)return;
      previous={phase,time,elapsed};
      const target=next!==null&&next<Math.min(end,config.stopMinute*60)?next:null;
      message=ringUntil!==null?'SUB NOW · Chime stops automatically.':snoozeAt!==null?`Alarm active · Reminder in ${Math.max(0,Math.ceil((snoozeAt-time)/1000))}s.`:target!==null?`Alarm active · Next sub in ${Math.floor((target-elapsed)/60).toString().padStart(2,'0')}:${Math.floor((target-elapsed)%60).toString().padStart(2,'0')} (${Math.floor(target/60)}′).`:'Alarm active · No more intervals this half.';
      emit();
    }
    function updateClock(matchId,clock){feed={matchId,clock,receivedAt:wallNow()};tick();}
    return {start,stop,tick,updateClock,state};
  }
  function createSound(win=global){
    let context=null,nodes=[];
    function stop(){for(const {osc,gain} of nodes){try{osc.stop();}catch(_){}try{osc.disconnect();gain.disconnect();}catch(_){}}nodes=[];}
    async function unlock(){
      const Audio=win.AudioContext||win.webkitAudioContext;if(!Audio)throw Error('This browser cannot play the alarm.');
      if(!context||context.state==='closed')context=new Audio();
      await context.resume();if(context.state!=='running')throw Error('Sound is blocked. Tap Start alarm again.');
    }
    function ring(duration){
      if(!context||context.state!=='running')throw Error('Sound paused. Tap Start alarm again.');
      stop();const start=context.currentTime;
      // Every oscillator has its own audio-clock stop. A delayed JS timer can
      // never leave a continuous tone running past the selected duration.
      for(let offset=0;offset+.22<=duration;offset+=.75){
        const osc=context.createOscillator(),gain=context.createGain(),at=start+offset;
        osc.type='sine';osc.frequency.setValueAtTime(660,at);osc.frequency.setValueAtTime(880,at+.10);
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.12,at+.015);gain.gain.setValueAtTime(.12,at+.14);gain.gain.linearRampToValueAtTime(0,at+.20);
        osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+.22);nodes.push({osc,gain});
      }
    }
    function close(){stop();const old=context;context=null;try{old?.close()?.catch?.(()=>{});}catch(_){}}
    return {unlock,ring,stop,close};
  }
  function createLease(storage,id,wallNow=Date.now){
    const key='skor-sub-alarm-device';
    function read(){try{return JSON.parse(storage.getItem(key)||'null');}catch(_){return null;}}
    function claim(){try{const current=read(),time=wallNow();if(current&&current.id!==id&&current.until>time)return false;storage.setItem(key,JSON.stringify({id,until:time+5000}));return read()?.id===id;}catch(_){return false;}}
    function renew(){const current=read();if(current?.id!==id)return false;if(current.until-wallNow()>2000)return true;return claim();}
    function release(){try{if(read()?.id===id)storage.removeItem(key);}catch(_){}}
    return {claim,renew,release};
  }
  function mount({rootId,getContext,win=global,doc=global.document}){
    const root=doc.getElementById(rootId);if(!root)return null;
    const el=id=>doc.getElementById('subAlarm'+id),sound=createSound(win);
    let storage;try{storage=win.localStorage;}catch(_){}
    const lease=createLease(storage,win.crypto.randomUUID());
    let actionVersion=0,timer=null,wake=null,wakePending=null,wakeGeneration=0,wakeAttempted=false,owner=null,previewTimer=null,lastMatch=null;
    const fields={interval:el('Interval'),ring:el('Ring'),snooze:el('Snooze'),repeats:el('Repeats'),stopMinute:el('StopMinute'),safetyMinutes:el('Safety')};
    const visible=()=>doc.visibilityState==='visible'&&doc.getElementById('gameday')?.classList.contains('active');
    function releaseWake(){wakeGeneration++;const old=wake;wake=null;old?.release()?.catch?.(()=>{});}
    function requestWake(){
      if(wake||wakePending||wakeAttempted||!win.navigator.wakeLock||!visible())return;
      wakeAttempted=true;
      const version=wakeGeneration;
      wakePending=win.navigator.wakeLock.request('screen').then(lock=>{if(version!==wakeGeneration||!engine.state().active){lock.release()?.catch?.(()=>{});return;}wake=lock;}).catch(()=>{}).finally(()=>{wakePending=null;});
    }
    function clearPreview(){if(previewTimer!==null)win.clearTimeout(previewTimer);previewTimer=null;sound.stop();}
    function draw(state){
      el('Status').textContent=state.message;el('Badge').textContent=state.active?(state.ringing?'Ringing':'Active'):'Off';
      el('PhoneNote').hidden=!state.active;el('Stop').hidden=!state.active;el('Start').disabled=state.active;
      for(const field of Object.values(fields))field.disabled=state.active;
      el('Preview').disabled=state.active;
      if(state.active){if(timer===null)timer=win.setInterval(()=>engine.tick(),250);requestWake();}
      else{if(timer!==null)win.clearInterval(timer);timer=null;releaseWake();wakeAttempted=false;}
    }
    const engine=createEngine({getContext,play:d=>sound.ring(d),silence:()=>sound.stop(),onChange:draw,visible,lease});
    function contextChanged(){
      const c=getContext();root.hidden=!c?.canUse;
      if(!c?.canUse&&engine.state().active)stop('Alarm off · Captain access required.');
      if(owner!==c?.userId){stop('Alarm off.');owner=c?.userId||null;lastMatch=null;loadSettings();}
      if(lastMatch!==c?.matchId){stop('Alarm off · Select settings for this match.');lastMatch=c?.matchId;}
    }
    function loadSettings(){
      let value=settings();try{if(owner){const saved=storage?.getItem('skor-sub-alarm-settings:'+owner);if(saved)value=settings(JSON.parse(saved));}}catch(_){}
      for(const [key,field] of Object.entries(fields))field.value=String(value[key]);
    }
    function stop(reason){actionVersion++;clearPreview();engine.stop(reason);sound.close();}
    el('Start').addEventListener('click',async()=>{
      const c=getContext(),version=++actionVersion;clearPreview();
      try{
        const value=settings(Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));
        await sound.unlock();if(version!==actionVersion||getContext().userId!==c.userId||getContext().matchId!==c.matchId||!visible())return;
        if(engine.start(value)){try{storage?.setItem('skor-sub-alarm-settings:'+c.userId,JSON.stringify(value));}catch(_){} }
      }catch(e){if(version===actionVersion){engine.stop('Alarm off · '+e.message);sound.close();}}
    });
    el('Preview').addEventListener('click',async()=>{
      if(engine.state().active)return;const version=++actionVersion;clearPreview();
      try{await sound.unlock();if(version!==actionVersion||!visible())return;sound.ring(1.2);previewTimer=win.setTimeout(()=>{clearPreview();sound.close();},1300);}
      catch(e){if(version===actionVersion)el('Status').textContent=e.message;}
    });
    el('Stop').addEventListener('click',()=>stop('Alarm off.'));
    doc.addEventListener('visibilitychange',()=>{if(!visible())stop('Alarm stopped: unlock this phone, open Game Day and tap Start alarm.');});
    win.addEventListener('pagehide',()=>stop('Alarm stopped when leaving the page.'));
    win.addEventListener('storage',e=>{if(e.key==='skor-sub-alarm-device')engine.tick();});
    loadSettings();draw(engine.state());
    return {stop,contextChanged,updateClock:(matchId,clock)=>{contextChanged();engine.updateClock(matchId,clock);},state:engine.state};
  }
  const api={settings,seconds,createEngine,createSound,createLease,mount,FRESH_MS};
  if(typeof module==='object'&&module.exports)module.exports=api;
  global.SKORSubstitutionAlarm=api;
})(typeof window!=='undefined'?window:globalThis);
