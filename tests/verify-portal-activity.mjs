import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const activity=require('../portal-activity.js');
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const admin=read('admin.html'),player=read('player-portal.html');
for(const [file,html] of [['admin.html',admin],['player-portal.html',player]]){
  for(const [i,m] of [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(m[1],{filename:`${file}#${i}`});
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,`${file}: unique IDs`);
  assert.ok(html.indexOf('src="portal-activity.js?v=58.6"')<html.indexOf('const SUPABASE_URL'));
}

class Target{
  listeners=new Map();
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name){for(const fn of this.listeners.get(name)||[])fn();}
}
function fixture(portal='captain'){
  let time=Date.parse('2026-10-19T12:00:00Z'),signedIn='captain-a',calls=[],errors=[],recorded=0,response={data:'saved-event',error:null},pending=null;
  const doc=new Target();doc.visibilityState='visible';
  const win=new Target();win.document=doc;win.AbortController=AbortController;win.setInterval=fn=>(win.tick=fn,1);win.clearInterval=()=>{win.tick=null;};
  const client={auth:{getSession:async()=>({data:{session:signedIn?{user:{id:signedIn}}:null}})},rpc:(name,args)=>{
    calls.push({name,args});return pending||Promise.resolve(response);
  }};
  const tracker=activity.createTracker({client,portal,win,doc,now:()=>time,onError:error=>errors.push(error),onRecorded:()=>recorded++});
  return {tracker,win,doc,calls,errors,advance:ms=>time+=ms,signIn:id=>signedIn=id,respond:value=>response=value,delay:value=>pending=value,recorded:()=>recorded};
}
const f=fixture();
f.doc.fire('pointerdown');await flush();assert.equal(f.calls.length,0,'no tracking before authorization');
assert.equal(await f.tracker.start('captain-a'),true);
assert.deepEqual(f.calls[0],{name:'record_my_portal_activity',args:{p_portal:'captain'}});
await f.tracker.start('captain-a');f.win.fire('focus');f.doc.fire('visibilitychange');await flush();
assert.equal(f.calls.length,1,'initial auth, refocus and duplicate events are throttled');
f.advance(activity.HEARTBEAT_MS);f.win.tick();await flush();assert.equal(f.calls.length,2,'visible recent use updates last activity');
f.doc.visibilityState='hidden';f.advance(activity.HEARTBEAT_MS);f.win.tick();f.win.fire('focus');await flush();assert.equal(f.calls.length,2,'background tabs do not count');
f.doc.visibilityState='visible';f.doc.fire('visibilitychange');await flush();assert.equal(f.calls.length,3,'returning to a saved session is recorded');
f.advance(activity.IDLE_MS+1);f.win.tick();await flush();assert.equal(f.calls.length,3,'a visible but idle page does not remain active forever');
f.doc.fire('keydown');await flush();assert.equal(f.calls.length,4,'actual interaction restarts recording after idle');
f.tracker.clear();f.advance(activity.HEARTBEAT_MS);f.doc.fire('pointerdown');f.win.tick();await flush();assert.equal(f.calls.length,4,'sign-out stops all recording');
f.signIn('captain-b');await f.tracker.start('captain-b');assert.equal(f.calls.length,5,'new accounts record independently');
f.advance(activity.HEARTBEAT_MS);f.respond({data:null,error:new Error('offline')});
assert.equal(await f.tracker.record(),false);assert.equal(f.errors.length,1);
f.doc.fire('pointerdown');await flush();assert.equal(f.calls.length,6,'failed tracking does not hammer the API');
f.respond({data:'retry-event',error:null});f.advance(60000);f.win.tick();await flush();assert.equal(f.calls.length,7,'transport errors retry without blocking the portal');
f.signIn('different-account');f.advance(activity.HEARTBEAT_MS);await f.tracker.record();assert.equal(f.calls.length,7,'session/account mismatch blocks a stale write');
f.tracker.destroy();assert.equal(f.win.tick,null);assert.equal([...f.doc.listeners.values()].reduce((n,set)=>n+set.size,0),0);

const p=fixture('player');p.signIn('player-a');await p.tracker.start('player-a');assert.equal(p.calls[0].args.p_portal,'player');
let finish;const slow=fixture();slow.delay(new Promise(resolve=>{finish=resolve;}));
const inFlight=slow.tracker.start('captain-a');await flush();slow.tracker.clear();finish({data:'old-event'});await inFlight;assert.equal(slow.recorded(),0,'late responses cannot refresh another account');
let release;const double=fixture();double.delay(new Promise(resolve=>{release=resolve;}));
const first=double.tracker.start('captain-a');await flush();double.doc.fire('pointerdown');double.win.fire('focus');await flush();assert.equal(double.calls.length,1,'only one request in flight');release({data:'one-event'});await first;

const now=Date.parse('2026-10-19T12:00:00Z'),old='2026-10-10T12:00:00Z',fresh='2026-10-19T11:59:50Z';
assert.equal(activity.latestActivityAt({occurred_at:old,last_seen_at:fresh}),fresh);
assert.equal(activity.latestActivityAt({occurred_at:old,last_seen_at:'invalid'}),old);
assert.equal(activity.relativeActivity(fresh,now),'Just now');
assert.equal(activity.relativeActivity('not-a-date',now),'No recorded activity');
assert.equal(activity.relativeActivity('2026-10-20T12:00:00Z',now),'Just now','clock skew never yields a negative age');
const rows=[
  {participant_id:'player:a',roster_player_id:'a',jersey_number:9,display_name:'Example <Player>',portal_role:'captain',event_id:'old',event_type:'portal_login',portal:'player',occurred_at:old,last_seen_at:old},
  {participant_id:'player:a',roster_player_id:'a',jersey_number:9,display_name:'Example <Player>',portal_role:'captain',event_id:'recent',event_type:'portal_login',portal:'captain',occurred_at:old,last_seen_at:fresh},
  {participant_id:'captain:b',roster_player_id:null,jersey_number:null,display_name:'Console Captain',portal_role:'captain',event_id:'console',event_type:'portal_login',portal:'captain',occurred_at:fresh,last_seen_at:fresh},
  {participant_id:'player:c',roster_player_id:'c',jersey_number:11,display_name:'New Player',portal_role:'player',event_id:null},
];
const groups=activity.groupActivity(rows);assert.equal(groups.length,3);assert.equal(groups[0].events[0].event_id,'recent');

const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,classList:{contains:()=>true}});return nodes.get(id);};
let request=async()=>({data:rows,error:null}),canWrite=true;
const context={window:{SKORPortalActivity:activity,addEventListener(){}},document:{getElementById:node,addEventListener(){},visibilityState:'visible'},Date:class extends Date{static now(){return now;}},Map,console:{warn(){}},setInterval(){},setTimeout,adminApp:{style:{display:'grid'}},portalCanWrite:()=>canWrite,sb:{rpc:(...args)=>request(...args)},gdEsc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')};
vm.createContext(context);
vm.runInContext('let PLAYER_PORTAL_ACTIVITY=[];'+admin.slice(admin.indexOf('function activityDateTime('),admin.indexOf('function feedbackOpponent(')),context);
await context.loadPlayerActivity();
assert.equal(node('activityRecentCount').textContent,2,'last_seen_at determines recent activity despite an old session start');
assert.equal(node('activityNeverCount').textContent,1);
assert.match(node('playerActivityList').innerHTML,/Console Captain/);
assert.match(node('playerActivityList').innerHTML,/Example &lt;Player&gt;/);
assert.doesNotMatch(node('playerActivityList').innerHTML,/#null|#undefined/);
assert.match(node('playerActivityList').innerHTML,/Captain Portal/);
assert.match(node('playerActivityList').innerHTML,/Just now/);
node('activityLoginFilter').value='recent';context.renderPlayerActivity();assert.doesNotMatch(node('playerActivityList').innerHTML,/New Player/);
node('activityLoginFilter').value='never';context.renderPlayerActivity();assert.match(node('playerActivityList').innerHTML,/New Player/);
node('activityLoginFilter').value='all';context.renderPlayerActivity();const prior=node('playerActivityList').innerHTML;
request=async()=>({error:new Error('network')});await context.loadPlayerActivity();assert.equal(node('playerActivityList').innerHTML,prior);assert.match(node('playerActivityStatus').textContent,/Refresh failed/);
let complete;request=()=>new Promise(resolve=>{complete=resolve;});const report=context.loadPlayerActivity();context.clearPlayerActivity();complete({data:rows});await report;
assert.equal(node('playerActivityList').innerHTML,'','an old report cannot repopulate signed-out state');assert.equal(node('refreshPlayerActivityBtn').disabled,false);
canWrite=false;await context.loadPlayerActivity();assert.match(node('playerActivityList').innerHTML,/Captain access required/);

let authorize;const shown=[];
const authContext={clearAuthError(){},captainIsApproved:()=>new Promise(resolve=>{authorize=resolve;}),showDashboard:user=>shown.push(user.id),showLogin(){},showAuthError(){}};
vm.createContext(authContext);
vm.runInContext('let portalSessionVersion=0;'+admin.slice(admin.indexOf('async function handleSession(session){'),admin.indexOf('googleLogin.addEventListener(',admin.indexOf('async function handleSession(session){'))),authContext);
const oldAuth=authContext.handleSession({user:{id:'old-account'}});
await authContext.handleSession(null);authorize({role:'captain'});await oldAuth;
assert.deepEqual(shown,[],'an authorization check finishing after sign-out must not reopen the old account');

// The production schema is not changed by this suite. SQL role behavior is checked
// separately after explicit migration approval, inside a rolled-back transaction.
const sql=read('docs/sql/PORTAL-ACTIVITY.sql');
assert.match(sql,/auth\.uid\(\)/);assert.match(sql,/current_player_id\(\)/);assert.match(sql,/is_approved_captain\(\)/);assert.match(sql,/is_skor_captain\(\)/);
assert.equal((sql.match(/security definer set search_path = ''/g)||[]).length,2);
assert.match(sql,/revoke all on table public\.player_portal_login_events from anon, authenticated/);
assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/order by le\.last_seen_at desc/);
assert.doesNotMatch(sql,/user_metadata|raw_user_meta_data|delete from|truncate|drop table|set auth_user_id|set last_login_at/i);
assert.match(admin,/captainActivity\.start\(user.id\)/);assert.match(admin,/captainActivity\.clear\(\)/);
assert.match(player,/playerActivity\.start\(user.id\)/);assert.match(player,/playerActivity\.clear\(\)/);
assert.doesNotMatch(player,/db\.rpc\('record_my_player_portal_login'\)/);
console.log('Portal activity verification passed: both portals, restored sessions, visibility/idle throttling, retries, account isolation, last-seen sorting/filtering, report refresh/errors, and source/security contracts.');
