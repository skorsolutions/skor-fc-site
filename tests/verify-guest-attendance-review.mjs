import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({crypto:webcrypto,Intl,Date,Map,Set,BigInt,Promise,setTimeout:()=>1,clearTimeout(){}});
vm.runInContext(fs.readFileSync('team-dues.js','utf8'),ctx);vm.runInContext(fs.readFileSync('guest-profiles.js','utf8'),ctx);const api=ctx.SKORGuestProfiles;
function record(statuses=['unmarked','unmarked','present']){const matches=statuses.map((status,i)=>({match_id:'m'+i,kickoff:'2026-10-'+String(4+i).padStart(2,'0')+'T15:00:00Z',home_team:'SKOR FC',away_team:'Fixture '+i,status:'final',attendance_status:status}));const summary={recorded_matches:matches.length,goals:0,assists:0,motm:0,yellow_cards:0,red_cards:0};for(const s of ['present','absent','excused','unmarked'])summary[s+'_count']=statuses.filter(x=>x===s).length;return {matches,summary};}
const profile={player_id:'guest',full_name:'Fixture Guest',is_guest:true,record:record()};
assert.equal(api.pendingAttendance(profile.record).count,2);assert.equal(api.pendingAttendance(profile.record).total,3);assert.equal(api.pendingAttendance(profile.record).complete,true);
const shown=api.recordMarkup(profile.record,{clarify:true});assert.match(shown,/1 confirmed/);assert.match(shown,/2 games need confirmation/);assert.match(shown,/3 completed games/);assert.doesNotMatch(api.recordMarkup(profile.record),/1 confirmed/,'player-only default presentation is preserved');
const prompt=api.attendancePrompt(profile);assert.match(prompt,/Did <strong>Fixture Guest/);assert.match(prompt,/Yes, both games/);assert.doesNotMatch(prompt,/2026-10-06/,'already Present game is not asked about again');assert.match(prompt,/No attendance is assumed/);
assert.equal(api.attendancePrompt({...profile,is_guest:false}),'');assert.equal(api.attendancePrompt({...profile,record:record([])}),'');assert.doesNotMatch(api.attendancePrompt({...profile,record:record(Array(4).fill('unmarked'))}),/data-gp="attendance-all"/,'bulk yes requires all asked dates to be shown');
assert.doesNotMatch(api.attendancePrompt({...profile,full_name:'<img src=x onerror=alert(1)>'}),/<img/);assert.match(api.attendancePrompt(profile,true),/ disabled/);
assert.doesNotMatch(api.attendancePrompt({...profile,record:{summary:{unmarked_count:2},matches:[]}}),/data-gp="attendance-all"/,'incomplete dates cannot be bulk confirmed');
async function harness(){
 let actor='captain',allowed=true,readError=false,nextRead=null,loseAt=null,failAt=null,gate=null,afterWrite=null;
 const p=structuredClone(profile),s={as_of:new Date().toISOString(),history_version:1,participation_version:1,profiles:[p],links:[],event_participants:[],legacy:[],fee_settings:[],entries:[],ledger:{}};
 const calls=[],receipts=new Map(),recount=()=>{for(const status of ['present','absent','excused','unmarked'])p.record.summary[status+'_count']=p.record.matches.filter(m=>m.attendance_status===status).length;};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:actor}}}})},rpc:async(name,args)=>{
  if(name==='get_guest_console'){if(nextRead){const hook=nextRead;nextRead=null;hook();recount();}return readError?{error:new Error('Refresh unavailable')}:{data:structuredClone(s)};}
  assert.equal(name,'manage_guest_profile');assert.equal(args.p_action,'attendance');const q=args.p;calls.push(structuredClone(q));if(gate)await gate;
  if(failAt===calls.length){failAt=null;return {error:new Error('Offline before commit')};}
  if(receipts.has(q.request_id))assert.deepEqual(receipts.get(q.request_id),JSON.parse(JSON.stringify(q)));
  else{const m=p.record.matches.find(m=>m.match_id===q.match_id);assert(m);m.attendance_status=q.status;recount();receipts.set(q.request_id,structuredClone(q));}
  if(afterWrite){const hook=afterWrite;afterWrite=null;hook();recount();}
  if(loseAt===calls.length){loseAt=null;return {error:new Error('Response lost')};}return {data:{ok:true}};
 }};
 const c=api.createController({client,schedule:()=>1,cancel(){}});await c.start(actor);const flow=api.createAttendanceReview(c,{canWrite:()=>allowed});
 return {p,s,c,flow,calls,recount,setAllowed:v=>allowed=v,setReadError:v=>readError=v,nextRead:fn=>nextRead=fn,setLoseAt:n=>loseAt=n,setFailAt:n=>failAt=n,setGate:v=>gate=v,setActor:v=>actor=v,afterWrite:fn=>afterWrite=fn};
}
const both=[{match_id:'m0',status:'present'},{match_id:'m1',status:'present'}];
const h=await harness();await h.flow.confirm('guest',both);assert.equal(h.p.record.summary.present_count,3);assert.equal(h.p.record.summary.unmarked_count,0);assert.equal(h.calls.length,2);assert.deepEqual(h.calls.map(x=>x.match_id),['m0','m1']);assert(h.calls.every(x=>x.status==='present'&&!Object.hasOwn(x,'rsvp')));h.c.clear();
const one=await harness();await one.flow.confirm('guest',[{match_id:'m0',status:'excused'}]);assert.equal(one.p.record.summary.unmarked_count,1);assert.equal(one.p.record.summary.present_count,1);assert.equal(one.p.record.summary.excused_count,1);one.c.clear();
const conflict=await harness();conflict.nextRead(()=>conflict.p.record.matches[0].attendance_status='absent');await assert.rejects(conflict.flow.confirm('guest',both),/Attendance changed/);assert.equal(conflict.calls.length,0);assert.equal(conflict.p.record.matches[0].attendance_status,'absent');conflict.c.clear();
const invalid=await harness();for(const choices of [[],[...both,both[0]],[{match_id:'missing',status:'present'}],[{match_id:'m0',status:'unmarked'}],Array.from({length:51},(_,i)=>({match_id:'x'+i,status:'present'}))])await assert.rejects(invalid.flow.confirm('guest',choices));assert.equal(invalid.calls.length,0);invalid.c.clear();
const lost=await harness();lost.setLoseAt(1);await assert.rejects(lost.flow.confirm('guest',both),/Response lost/);await lost.c.refresh();await lost.flow.confirm('guest',both);assert.equal(lost.calls.length,2,'verified first commit is skipped, not duplicated');assert.equal(lost.p.record.summary.present_count,3);lost.c.clear();
const partial=await harness();partial.setFailAt(2);await assert.rejects(partial.flow.confirm('guest',both),/Offline before commit/);assert.equal(partial.p.record.summary.present_count,2);await partial.c.refresh();await partial.flow.confirm('guest',both);assert.equal(partial.p.record.summary.present_count,3);assert.deepEqual(partial.calls[1],partial.calls[2],'unacknowledged failed step retries its exact request');partial.c.clear();
const recheck=await harness();recheck.afterWrite(()=>recheck.p.record.matches[0].attendance_status='unmarked');await assert.rejects(recheck.flow.confirm('guest',[both[0]]),/could not be verified/);await recheck.flow.confirm('guest',[both[0]]);assert.notEqual(recheck.calls[0].request_id,recheck.calls[1].request_id,'acknowledged receipts retire before another explicit confirmation');recheck.c.clear();
const readonly=await harness();readonly.setAllowed(false);await assert.rejects(readonly.flow.confirm('guest',both),/Refresh guests/);assert.equal(readonly.calls.length,0);readonly.c.clear();
const stale=await harness();stale.setReadError(true);await stale.c.refresh();await assert.rejects(stale.flow.confirm('guest',both),/Refresh guests/);assert.equal(stale.calls.length,0);stale.c.clear();
const changed=await harness();let finish;changed.setGate(new Promise(r=>finish=r));const pending=changed.flow.confirm('guest',both);while(!changed.calls.length)await Promise.resolve();changed.c.clear();changed.flow.clear();changed.setActor('other');finish();await assert.rejects(pending,/Account changed/);assert.equal(changed.calls.length,1);assert.equal(changed.c.state().snapshot,null);
const closed=await harness();let release,valid=true;closed.setGate(new Promise(r=>release=r));const saving=closed.flow.confirm('guest',both,{stillValid:()=>valid});while(!closed.calls.length)await Promise.resolve();valid=false;release();await assert.rejects(saving,/review closed/);assert.equal(closed.calls.length,1);closed.c.clear();
console.log('Guest attendance review: clear confirmed/pending totals, explicit dated questions, selective saves, no default Present, stale conflicts, lost responses/partial retries, fresh receipts, role/account/dialog guards and no inferred RSVP passed.');
