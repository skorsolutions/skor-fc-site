import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('guest-profiles.js','utf8');
const ctx=vm.createContext({Intl,Date,Map,Set,BigInt,Promise,setTimeout,clearTimeout,crypto:webcrypto});
vm.runInContext(fs.readFileSync('team-dues.js','utf8'),ctx);vm.runInContext(source,ctx);
const api=ctx.SKORGuestProfiles,plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(ctx.SKORTeamDues.assignmentPreview({assigned_cents:20000,paid_cents:700,allocation_mode:'individual'},undefined)),{old:20000,next:20000,delta:0,balance:19300,preserved:true});
assert.equal(ctx.SKORTeamDues.assignmentPreview({assigned_cents:20000,paid_cents:700,allocation_mode:'split'},undefined).balance,-700);
assert.equal(ctx.SKORTeamDues.assignmentPreview({assigned_cents:20000,paid_cents:700,allocation_mode:'split'},18000).delta,-2000);
assert.equal(api.prorate({baseline_cents:30000,fixed_cents:0,total_games:10,included_games:6}),18000);
assert.equal(api.prorate({baseline_cents:30000,fixed_cents:5000,total_games:10,included_games:6}),20000);
assert.equal(api.prorate({baseline_cents:10001,fixed_cents:0,total_games:2,included_games:1}),5001);
for(let total=1;total<=200;total++)for(const included of [0,Math.floor(total/2),total]){
  const baseline=98765431,fixed=12345,result=api.prorate({baseline_cents:baseline,fixed_cents:fixed,total_games:total,included_games:included});
  assert.equal(result,Math.floor(fixed+(baseline-fixed)*included/total+.5));
  assert(result>=fixed&&result<=baseline);
}
for(const bad of [{baseline_cents:-1},{fixed_cents:10002},{total_games:0},{total_games:201},{included_games:11},{included_games:1.5}])assert.throws(()=>api.prorate({baseline_cents:10001,fixed_cents:0,total_games:10,included_games:5,...bad}));
assert.equal(api.date('2026-10-25T01:00:00Z'),'2026-10-24');
const snapshot={as_of:new Date().toISOString(),profiles:[{player_id:'p',joined_on:null}],links:[{player_id:'p',match_id:'m',attendance:'present'}],event_participants:[],legacy:[],fee_settings:[{group_id:'g',enabled:true,effective_on:'2026-01-01'}],entries:[],ledger:{group_matches:[{group_id:'g',match_id:'m'}],matches:[{id:'m',kickoff:'2026-02-01T18:00:00Z',published:true,status:'final'}],members:[{group_id:'g',player_id:'p',paid_cents:700}]}};
assert.equal(api.feeCandidates(snapshot,'g').length,1);
assert.equal(api.feeCandidates({...snapshot,links:[],event_participants:snapshot.links},'g').length,1,'Tagged event appearances do not require a match jersey or TEMP link');
assert.equal(api.participations({...snapshot,links:[],event_participants:snapshot.links})[0].player_id,'p');
for(const status of [null,'absent','excused','unmarked','going'])assert.equal(api.feeCandidates({...snapshot,links:[{...snapshot.links[0],attendance:status}]},'g').length,0);
for(const patch of [{published:false},{status:'scheduled'},{kickoff:'2099-01-01T00:00:00Z'}])assert.equal(api.feeCandidates({...snapshot,ledger:{...snapshot.ledger,matches:[{...snapshot.ledger.matches[0],...patch}]}},'g').length,0);
assert.equal(api.feeCandidates({...snapshot,profiles:[{player_id:'p',joined_on:'2026-02-01'}]},'g').length,0);
assert.equal(api.feeCandidates({...snapshot,fee_settings:[{...snapshot.fee_settings[0],enabled:false}]},'g').length,0);
for(const category of ['guest_fee','guest_waiver'])assert.equal(api.feeCandidates({...snapshot,entries:[{group_id:'g',player_id:'p',match_id:'m',category,delta_cents:1000}]},'g').length,0);
const charged={...snapshot,entries:[{group_id:'g',player_id:'p',category:'guest_fee',delta_cents:1000}]};
assert.deepEqual(plain(api.guestTotals(charged,'g')),{charged:1000,collected:700,outstanding:300,waived:0});
assert.equal(api.guestTotals({...charged,entries:[...charged.entries,{group_id:'g',player_id:'p',category:'guest_fee_reversal',delta_cents:-1000}]},'g').collected,0);
assert.equal(api.guestTotals({...charged,ledger:{...snapshot.ledger,members:[{group_id:'g',player_id:'p',paid_cents:2000}]}},'g').collected,1000);
// Execute the production controller, including delayed private responses and account switches.
let actor='captain',error=null,deferred=null,reads=0,writes=0,timers=new Map(),seq=0;
const client={auth:{getSession:async()=>({data:{session:actor?{user:{id:actor}}:null}})},rpc:async(name,args)=>{
  if(name.startsWith('manage_')){writes++;return error?{error}:{data:{ok:true}};}
  reads++;return deferred?await deferred:error?{error}:{data:snapshot};
}};
const c=api.createController({client,schedule:f=>{timers.set(++seq,f);return seq;},cancel:id=>timers.delete(id)});
await c.start(actor);assert.equal(c.state().phase,'ready');assert.equal(timers.size,1);
const a=c.refresh(),b=c.refresh();assert.equal(a,b);await a;assert.equal(reads,2);
await c.write('profile','create',{});assert.equal(writes,1);
error={message:'Offline'};await c.refresh();assert.equal(c.state().phase,'stale');assert(c.state().snapshot);
error={message:'Denied',code:'42501'};await c.refresh();assert.equal(c.state().snapshot,null);
error=null;let finish;deferred=new Promise(resolve=>finish=resolve);const pending=c.refresh();await Promise.resolve();await Promise.resolve();actor='other';finish({data:snapshot});await pending;assert.equal(c.state().snapshot,null);assert.equal(c.state().actor,null);assert.equal(timers.size,0);deferred=null;
await assert.rejects(c.write('profile','create',{}),/access required/);
await c.start(actor);let release;deferred=new Promise(resolve=>release=resolve);const old=c.refresh();await Promise.resolve();c.clear();actor='new';deferred=null;await c.start(actor);release({data:{...snapshot,profiles:[{full_name:'OLD PRIVATE'}]}});await old;assert.equal(c.state().snapshot.profiles[0].player_id,'p');c.clear();
actor='guest';const own=api.createController({client:{auth:client.auth,rpc:async name=>{assert.equal(name,'get_my_guest_portal');return {data:{as_of:new Date().toISOString(),matches:[]}};}},mode:'player',schedule:()=>1,cancel:()=>{}});await own.start(actor);await assert.rejects(own.write('profile','create',{}),/access required/);await assert.rejects(own.write('dues','participation',{}),/access required/);own.clear();
const sql=fs.readFileSync('docs/sql/GUEST-PROFILES.sql','utf8');
for(const fn of ['resolve_player_portal','preview_participation_dues','manage_participant_dues','manage_guest_profile','get_guest_console','get_my_guest_portal','manage_my_guest_match'])assert(sql.includes('function public.'+fn+'('));
assert(sql.includes('u.email_confirmed_at is not null'));assert(sql.includes('approved_email=verified_email'));assert(sql.includes('values(pid,pid::text'));assert(sql.includes('null,false,false,true'));
assert(sql.includes("allocation_mode='split'"));assert(sql.includes("a.status='present'"));assert(sql.includes('Confirmed-paid opening records are protected.'));assert(!/delete from skor_private\.dues_(extra_entries|payments|assessments)/i.test(sql));
assert(sql.includes("'temp:'||temp_id::text"));assert(sql.includes("m.kickoff<=now()"));assert(sql.includes("'guest_fee_reversal'"));assert(sql.includes('enable row level security'));
const html=fs.readFileSync('player-portal.html','utf8');assert(html.includes("db.rpc('resolve_player_portal')"));assert(html.includes("show('guestPortalScreen');return;"));assert(html.includes('guestPortal.clear()'));
const portal=fs.readFileSync('guest-portal.js','utf8');assert(!portal.includes('SKOREquipment'));assert(!portal.includes('get_player_activity'));assert(portal.includes('onAccessChanged'));
for(const file of ['admin.html','player-portal.html']){const page=fs.readFileSync(file,'utf8');for(const [,attrs,body] of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)||/type="(?:application\/json|module)"/.test(attrs))continue;new vm.Script(body,{filename:file});}}
// Check actual document nesting, since valid scripts cannot catch a misplaced wrapper.
for(const file of ['admin.html','player-portal.html']){
  const markup=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const stack=[];for(const m of markup.matchAll(/<(\/?)(div|section|form|details|dialog|main|header)\b[^>]*>/gi)){if(m[1])assert.equal(stack.pop(),m[2],file+' misplaced '+m[0]);else stack.push(m[2]);}assert.equal(stack.length,0,file+' unclosed wrappers');
}
for(const match of sql.matchAll(/\bas\s*(\$[a-z_]*\$)([\s\S]*?)\1/gi))assert.equal(sql.slice(match.index+match[0].length).trimStart()[0],';','Function body must terminate before the next statement');
const loading=vm.createContext({s:null,lineup:{innerHTML:'old'},attendance:{innerHTML:'old'}});
vm.runInContext(source.slice(source.indexOf('function renderMatchTools(){'),source.indexOf('function selectProfiles(',source.indexOf('function renderMatchTools(){'))),loading);loading.renderMatchTools();assert.equal(loading.lineup.innerHTML,'');
console.log('Guest profiles: 600 proration boundaries, attendance/date/fee eligibility, totals, real controller isolation/concurrency/failures, SQL permissions/identity and inline scripts passed.');
