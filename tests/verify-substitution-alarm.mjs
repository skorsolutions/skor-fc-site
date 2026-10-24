import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),A=require('../substitution-alarm.js');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const html=read('admin.html');
assert.match(html,/Keep this phone unlocked with Game Day open for substitution alarms to sound/);
assert.match(html,/Iskra Sports app/);assert.match(html,/substitutionAlarm\?\.stop\('Alarm off · Signed out/);
assert.equal((html.match(/substitutionAlarm\?\.updateClock\(requestedMatchId,gameClockState\)/g)||[]).length,2,'both successful clock controls and refreshes feed the alarm');
assert.match(html,/substitutionAlarm\?\.contextChanged\(\)/);assert.match(html,/substitution-alarm\.js\?v=58\.21/);
assert.doesNotMatch(read('substitution-alarm.js'),/\.rpc\(|fetch\(|Notification\.requestPermission|serviceWorker/);
for(const mutate of [v=>v.interval=30,v=>v.ring=60,v=>v.snooze=10,v=>v.repeats=100,v=>v.stopMinute=0,v=>v.safetyMinutes=Infinity]){const v=A.settings();mutate(v);assert.throws(()=>A.settings(v));}
function fixture(config={}){
  let time=0,wall=Date.UTC(2026,9,24,12),visible=true,fail=false;
  let context={canUse:true,userId:'captain-a',matchId:'match-a',matchStatus:'first_half'};
  let clock={clock_phase:'first_half',clock_running:true,clock_elapsed_seconds:0,clock_started_at:new Date(wall).toISOString(),half_length_minutes:45};
  const plays=[],states=[];let silenceCount=0;
  const e=A.createEngine({getContext:()=>context,now:()=>time,wallNow:()=>wall,visible:()=>visible,play:duration=>{if(fail)throw Error('Sound paused.');plays.push({duration,time,seconds:A.seconds(clock,wall)});},silence:()=>silenceCount++,onChange:s=>states.push(s)});
  e.updateClock('match-a',clock);
  const feed=()=>e.updateClock(context.matchId,clock);
  function advance(ms){for(let left=ms;left>0;){const step=Math.min(1000,left);left-=step;time+=step;wall+=step;feed();}}
  return {e,plays,states,advance,feed,start:()=>e.start(A.settings(config)),setClock:update=>{clock={...clock,...update};feed();},context:update=>{context={...context,...update};e.tick();},hide:()=>{visible=false;e.tick();},jump:ms=>{time+=ms;wall+=ms;e.tick();},wallShift:ms=>{wall+=ms;},fail:()=>{fail=true;},silenced:()=>silenceCount,wall:()=>wall,clock:()=>clock};
}
for(const interval of [10,15,20])for(const ring of [3,5,10]){
  const f=fixture({interval,ring,snooze:0});assert.equal(f.start(),true);f.advance(interval*60000-1000);assert.equal(f.plays.length,0);f.advance(1000);assert.equal(f.plays.length,1);assert.equal(f.plays[0].duration,ring);assert.equal(f.e.state().ringing,true);f.advance(ring*1000);assert.equal(f.e.state().ringing,false);f.advance(1000);assert.equal(f.plays.length,1,'no duplicate rings at a boundary');
}
const snooze=fixture({repeats:2});snooze.start();snooze.advance(900000);assert.equal(snooze.plays.length,1);snooze.advance(65000);assert.equal(snooze.plays.length,2);snooze.advance(65000);assert.equal(snooze.plays.length,3);snooze.advance(770000);assert.equal(snooze.plays.length,4);assert.equal(snooze.plays.at(-1).seconds,1800,'snoozes never shift the regular schedule');
for(const wait of [30,60,120]){const f=fixture({snooze:wait,repeats:1});f.start();f.advance(900000+(5+wait)*1000);assert.equal(f.plays.length,2);f.advance((5+wait)*1000);assert.equal(f.plays.length,2,'repeats are bounded');}
const pause=fixture();pause.start();pause.advance(900000);pause.setClock({clock_running:false,clock_elapsed_seconds:900,clock_started_at:null});assert.equal(pause.e.state().ringing,false);assert.equal(pause.e.state().snoozeAt,null);pause.advance(120000);assert.equal(pause.plays.length,1);pause.setClock({clock_running:true,clock_started_at:new Date(pause.wall()).toISOString()});pause.advance(900000);assert.equal(pause.plays.length,2);assert.equal(pause.plays.at(-1).seconds,1800);
const halves=fixture({interval:20,snooze:0});halves.start();halves.advance(2700000);assert.deepEqual(halves.plays.map(p=>p.seconds),[1200,2400]);halves.setClock({clock_phase:'halftime',clock_running:false,clock_elapsed_seconds:2700,clock_started_at:null});halves.advance(600000);assert.equal(halves.plays.length,2);halves.setClock({clock_phase:'second_half',clock_running:true,clock_started_at:new Date(halves.wall()).toISOString()});halves.advance(1200000);assert.equal(halves.plays.at(-1).seconds,3900);halves.advance(1500000);assert.equal(halves.e.state().active,false,'selected 90-minute stop is automatic');
const before=fixture();before.setClock({clock_phase:'not_started',clock_running:false,clock_elapsed_seconds:0});before.start();assert.match(before.e.state().message,/kickoff/);before.setClock({clock_phase:'first_half',clock_running:true,clock_started_at:new Date(before.wall()).toISOString()});before.advance(900000);assert.equal(before.plays.length,1);
const late=fixture();late.advance(1080000);late.start();late.advance(720000);assert.deepEqual(late.plays.map(p=>p.seconds),[1800],'arming mid-half schedules only the next upcoming interval');
const gap=fixture();gap.start();gap.advance(899000);gap.jump(7000);assert.equal(gap.plays.length,0,'timer gaps never replay old alerts');assert.match(gap.e.state().message,/Next sub/);
const stale=fixture();stale.start();stale.jump(31000);assert.equal(stale.e.state().active,false);assert.match(stale.e.state().message,/clock updates unavailable/);
const selected=fixture({stopMinute:16});selected.start();selected.advance(960000);assert.equal(selected.plays.length,1);assert.equal(selected.e.state().active,false);assert.equal(selected.e.state().snoozeAt,null);
const safety=fixture({safetyMinutes:10});safety.start();safety.wallShift(-300000);safety.advance(600000);assert.equal(safety.e.state().active,false,'monotonic safety stop works even if wall clock moves backward');
const hardRing=fixture({safetyMinutes:10,ring:10});hardRing.advance(305000);hardRing.start();hardRing.advance(595000);assert.equal(hardRing.e.state().ringing,true);hardRing.advance(5000);assert.equal(hardRing.e.state().active,false);assert.equal(hardRing.e.state().ringing,false,'hard deadline cuts an active ring short');
for(const trigger of [f=>f.context({userId:'captain-b'}),f=>f.context({matchId:'match-b'}),f=>f.context({canUse:false}),f=>f.context({matchStatus:'final'}),f=>f.hide(),f=>f.setClock({clock_phase:'not_started',clock_elapsed_seconds:0}),f=>f.setClock({clock_phase:'full_time'}),f=>f.e.stop()]){
  const f=fixture();f.start();f.advance(900000);trigger(f);assert.equal(f.e.state().active,false);assert.equal(f.e.state().ringing,false);assert.equal(f.e.state().snoozeAt,null);
}
const audioFail=fixture();audioFail.start();audioFail.fail();audioFail.advance(900000);assert.equal(audioFail.e.state().active,false);assert.match(audioFail.e.state().message,/Sound paused/);
const restarted=fixture();restarted.setClock({clock_phase_started_at:'original'});restarted.start();restarted.advance(900000);restarted.setClock({clock_phase_started_at:'restarted',clock_elapsed_seconds:0,clock_started_at:new Date(restarted.wall()).toISOString()});assert.equal(restarted.e.state().active,false,'remote reset/restart is detected even if the not-started phase was missed');
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
let wall=1000;const memory=storage(),one=A.createLease(memory,'one',()=>wall),two=A.createLease(memory,'two',()=>wall);assert.equal(one.claim(),true);assert.equal(two.claim(),false);assert.equal(one.renew(),true);wall+=6000;assert.equal(two.claim(),true);assert.equal(one.renew(),false);one.release();assert.equal(two.renew(),true);two.release();assert.equal(one.claim(),true);
const sounds=[];class AudioMock{
  constructor(){this.state='suspended';this.currentTime=10;this.destination={};this.nodes=[];sounds.push(this);}
  async resume(){this.state='running';}async close(){this.state='closed';}
  createOscillator(){const n={frequency:{setValueAtTime(){}},connect(){},disconnect(){this.disconnected=true;},start(t){this.startAt=t;},stop(t){this.stopAt=t;}};this.nodes.push(n);return n;}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
const audio=A.createSound({AudioContext:AudioMock});await audio.unlock();
for(const duration of [1.2,3,5,10]){audio.ring(duration);const current=sounds.at(-1);assert.ok(current.nodes.length);for(const n of current.nodes.filter(n=>n.startAt!==undefined&&!n.disconnected)){assert.ok(n.stopAt<=10+duration);assert.ok(n.stopAt>n.startAt);}}
audio.close();assert.equal(sounds.at(-1).state,'closed');
// Exercise real browser adapter: gesture unlock, compact settings, warning,
// wake-lock failure, sign-out/start races, preview and settings-only persistence.
function adapter(){
  let context={canUse:true,userId:'captain-a',matchId:'match-a',matchStatus:'first_half'},id=0,wakeRequests=0;
  const elements={},timers=new Map(),events={};
  for(const key of ['Interval','Ring','Snooze','Repeats','StopMinute','Safety','Start','Stop','Preview','Status','Badge','PhoneNote'])elements['subAlarm'+key]={value:'',hidden:false,disabled:false,events:{},addEventListener(n,fn){this.events[n]=fn;}};
  elements.substitutionAlarm={hidden:true};elements.gameday={classList:{contains:()=>true}};
  const doc={visibilityState:'visible',getElementById:id=>elements[id],addEventListener:(n,fn)=>{events[n]=fn;}};
  const win={AudioContext:AudioMock,localStorage:storage(),crypto:{randomUUID:()=> 'tab-a'},navigator:{wakeLock:{request:async()=>{wakeRequests++;throw Error('Not available');}}},setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:n=>timers.delete(n),setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:n=>timers.delete(n),addEventListener:(n,fn)=>{events[n]=fn;}};
  const m=A.mount({rootId:'substitutionAlarm',getContext:()=>context,win,doc});m.contextChanged();m.updateClock('match-a',{clock_phase:'first_half',clock_running:true,clock_elapsed_seconds:0,clock_started_at:new Date().toISOString(),half_length_minutes:45});
  return {m,win,doc,events,e:elements,timers,context:v=>{context={...context,...v};m.contextChanged();},wakeRequests:()=>wakeRequests,click:key=>elements['subAlarm'+key].events.click()};
}
const b=adapter();assert.equal(b.m.state().active,false);await b.click('Start');assert.equal(b.m.state().active,true);assert.equal(b.e.subAlarmPhoneNote.hidden,false);assert.equal(b.e.subAlarmStop.hidden,false);assert.equal(b.e.subAlarmInterval.disabled,true);assert.equal(b.timers.size,1);await Promise.resolve();await Promise.resolve();for(const fn of b.timers.values())fn();assert.equal(b.wakeRequests(),1,'do not repeatedly request a denied wake lock');
b.doc.visibilityState='hidden';b.events.visibilitychange();assert.equal(b.m.state().active,false);assert.equal(b.timers.size,0);assert.equal(sounds.at(-1).state,'closed');b.doc.visibilityState='visible';await b.click('Preview');assert.equal(b.m.state().active,false);b.m.stop();assert.equal(b.timers.size,0);await b.click('Start');b.context({userId:'captain-b'});assert.equal(b.m.state().active,false);assert.equal(b.e.subAlarmPhoneNote.hidden,true);
const racing=adapter(),pendingStart=racing.click('Start');racing.m.stop('Signed out.');await pendingStart;assert.equal(racing.m.state().active,false,'late audio unlock cannot re-arm after stop/logout');
for(const script of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script[1]);
console.log('Substitution alarm verified: interval/ring presets, bounded automatic snoozes, fixed schedule, pauses/halves, selected and hard stops, no catch-up, stale clock, account/match safety, finite audio nodes, device-tab lease, gesture unlock, warning, wake-lock fallback and adapter cleanup.');
