import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('post-match-entry.js','utf8'),ctx=vm.createContext({crypto:webcrypto,Map,Set,JSON,Number,Promise});vm.runInContext(source,ctx);
const api=ctx.SKORPostMatch,plain=v=>JSON.parse(JSON.stringify(v));let seq=100;const uuid=()=>`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
const participants=[{player_key:'p9',name:'Andres',number:9},{player_key:'p7',name:'Tom',number:7},{player_key:'temp:00000000-0000-4000-8000-000000000001',name:'Guest',number:null,is_temp:true}];
const event=(id,type='skor_goal',key='p9',half='first',assist='p7')=>({id,event_type:type,roster_player_key:key,half,assist_roster_player_key:type==='skor_goal'?assist:null,player_name:'Original name',player_number:'30',clock_elapsed_seconds:350,clock_period:'first_half',sequence:1,entry_source:'live'});
const snapshot=()=>({match:{id:uuid(),home_team:'SKOR FC',away_team:'Opponent',status:'scheduled'},revision:'baseline',participants,events:[event('live'),event('own','skor_own_goal',null),event('manual','skor_goal',null),event('foul','skor_foul','p7')]});
let d=api.createDraft(snapshot());assert.equal(d.base.size,1);assert.equal(d.kept.length,3);assert.equal(api.changes(d).upserts.length,0);assert.equal(api.changes(d).deleted.length,0);
assert.deepEqual(plain(api.totals(d)),{skor:2,opponent:1,goals:2,assists:2,unknown:0,yellow:0,red:0});
api.setCount(d,'first','p9','skor_goal',2,uuid);assert.equal(api.changes(d).added,1);assert.equal(api.totals(d).unknown,1);
const newGoal=d.rows.find(e=>e.id!=='live');api.setAssist(d,newGoal.id,'p7');assert.equal(api.totals(d).assists,3);
api.setCount(d,'first','p9','skor_goal',1,uuid);assert.equal(d.rows[0].id,'live','decreasing count removes new entries before original events');assert.equal(api.changes(d).upserts.length,0);
api.setCount(d,'first','p9','skor_goal',0,uuid);assert.deepEqual(plain(api.changes(d).deleted),['live']);assert.equal(d.kept.length,3);
d=api.createDraft(snapshot());api.setAssist(d,'live','unknown');assert.equal(api.changes(d).updated,1);assert.equal(api.changes(d).upserts[0].assist_key,null);
api.setAssist(d,'live','none');assert.equal(api.totals(d).unknown,0);assert.equal(api.changes(d).upserts[0].assist_status,'none');
assert.throws(()=>api.setAssist(d,'live','p9'));assert.throws(()=>api.setAssist(d,'live','stranger'));assert.throws(()=>api.setCount(d,'third','p9','skor_goal',1));assert.throws(()=>api.setCount(d,'first','p9','skor_goal',1.5));assert.throws(()=>api.setCount(d,'first','p9','skor_yellow_card',3));
api.setCount(d,'second',participants[2].player_key,'skor_goal',1,uuid);assert.equal(api.changes(d).upserts.find(e=>e.half==='second').player_key,participants[2].player_key,'TBD jerseys still use stable TEMP identity');
api.setCount(d,'second',null,'opponent_goal',2,uuid);assert.equal(api.totals(d,'second').opponent,2);
const request=api.submission(d,uuid);assert.equal(api.submission(d,uuid).p_request_id,request.p_request_id);api.setCount(d,'second',null,'opponent_goal',1,uuid);assert.notEqual(api.submission(d,uuid).p_request_id,request.p_request_id);
const legacy=snapshot();legacy.events=[{...event('legacy'),assist_roster_player_key:null,assist_player_name:'Manually recorded assister'}];const ld=api.createDraft(legacy);assert.equal(ld.rows[0].assist_status,'legacy');assert.equal(api.changes(ld).upserts.length,0);api.setAssist(ld,'legacy','p7');assert.equal(api.changes(ld).updated,1);
// Repeated goal/card edits reconcile exact IDs and never include protected other events.
for(let i=0;i<200;i++){
 const model=api.createDraft(snapshot()),n=i%12;api.setCount(model,'first','p9','skor_goal',n,uuid);api.setCount(model,'second','p7','skor_yellow_card',i%3,uuid);
 const diff=api.changes(model),saved=new Map(model.snapshot.events.map(e=>[e.id,e]));for(const id of diff.deleted)saved.delete(id);for(const e of diff.upserts)saved.set(e.id,e);
 assert.equal([...saved.values()].filter(e=>e.event_type==='skor_goal'&&e.roster_player_key==='p9'||e.event_type==='skor_goal'&&e.player_key==='p9').length,n);
 assert(saved.has('own')&&saved.has('manual')&&saved.has('foul'));assert.equal(new Set(model.rows.map(e=>e.id)).size,model.rows.length);
}
const older=snapshot();older.events=Array.from({length:4},(_,i)=>event('yellow-'+i,'skor_yellow_card','p9'));const olderDraft=api.createDraft(older);api.setCount(olderDraft,'first','p9','skor_yellow_card',3,uuid);assert.equal(api.changes(olderDraft).deleted.length,1);assert.throws(()=>api.setCount(olderDraft,'first','p9','skor_yellow_card',4,uuid));
// Run the actual save controller: one request, exact retry ID, conflict protection and account isolation.
let actor='cap',match='m',canUse=true,readError=null,writeError=null,readDelay=null,writeDelay=null,reads=0,writes=[];
const snap=()=>({...snapshot(),match:{...snapshot().match,id:'m'}});
const client={auth:{getSession:async()=>({data:{session:actor?{user:{id:actor}}:null}})},rpc:async(name,args)=>{
 if(name==='get_post_match_editor'){reads++;return readDelay?await readDelay:readError?{error:readError}:{data:snap()};}
 writes.push(args);return writeDelay?await writeDelay:writeError?{error:writeError}:{data:{ok:true}};
}};
const c=api.createController({client,getContext:()=>({userId:actor,matchId:match,canUse}),id:uuid});await c.open();assert.equal(c.state().phase,'ready');
api.setCount(c.state().draft,'first','p9','skor_goal',2,uuid);writeError={message:'Connection lost'};assert.equal(await c.save(),false);const retry=writes.at(-1).p_request_id;assert(c.state().draft);
writeError=null;await c.save();assert.equal(writes.at(-1).p_request_id,retry);assert.equal(c.state().phase,'saved');assert.equal(await c.save(),false,'confirmed saved form cannot submit twice');
await c.open();writeError={message:'Conflict',code:'40001'};await c.save();assert.equal(c.state().phase,'conflict');const count=writes.length;await c.save();assert.equal(writes.length,count);writeError=null;
await c.open();let release;writeDelay=new Promise(resolve=>release=resolve);const a=c.save(),b=c.save();assert.equal(await b,false);await Promise.resolve();await Promise.resolve();release({data:{ok:true}});await a;writeDelay=null;
let finish;readDelay=new Promise(resolve=>finish=resolve);const old=c.open();await Promise.resolve();actor='other';finish({data:snap()});await old;assert.equal(c.state().draft,null);readDelay=null;
actor='cap';await c.open();match='other-match';c.contextChanged();assert.equal(c.state().draft,null);match='m';canUse=false;await c.open();assert.equal(c.state().phase,'error');assert.equal(await c.save(),false);canUse=true;
await c.open();writeError={message:'Denied',code:'42501'};await c.save();assert.equal(c.state().draft,null);c.clear();writeError=null;
// Render and operate the real mobile dialog without a browser engine.
const listeners=new Map(),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',open:false,disabled:false,addEventListener:(type,fn)=>listeners.set(id+':'+type,fn),querySelectorAll:()=>[],querySelector:()=>({textContent:''}),showModal(){this.open=true;},close(){this.open=false;listeners.get(id+':close')?.();}});return nodes.get(id);};
actor='cap';match='m';const mounted=api.mount({client,getContext:()=>({userId:actor,matchId:match,canUse:true}),doc:{getElementById:node},win:{}});
await mounted.open();assert(node('postMatchDialog').open);assert(node('postMatchBody').innerHTML.includes('1st Half'));assert(node('postMatchBody').innerHTML.includes('2nd Half'));assert(node('postMatchBody').innerHTML.includes('Other existing')||node('postMatchBody').innerHTML.includes('other existing'));
const plus={disabled:false,dataset:{pm:'count',half:'first',player:'p9',type:'skor_goal',value:'2'}};listeners.get('postMatchDialog:click')({target:{closest:()=>plus}});assert.equal(api.totals(mounted.state().draft).unknown,1);assert(node('postMatchBody').innerHTML.includes('data-pm-assists="first:p9" open'));assert(node('postMatchBody').innerHTML.includes('Save all events'));
const newUiGoal=mounted.state().draft.rows.find(r=>r.id!=='live');listeners.get('postMatchDialog:change')({target:{hasAttribute:k=>k==='data-pm-assist',dataset:{pmAssist:newUiGoal.id},value:'p7'}});assert.equal(newUiGoal.assist_key,'p7');
await mounted.save();assert(node('postMatchBody').innerHTML.includes('>Saved</button>'));actor='other';mounted.contextChanged();assert(!node('postMatchDialog').open);assert.equal(mounted.state().draft,null);actor='cap';
const html=fs.readFileSync('admin.html','utf8'),sql=fs.readFileSync('docs/sql/POST-MATCH-ENTRY.sql','utf8');
assert(html.includes('id="openPostMatch"'));assert(html.includes('id="postMatchDialog"'));assert(html.includes('Post-match · Minute not recorded'));assert(html.includes('entry_source,assist_status'));assert(html.includes('postMatchEntry?.clear()'));
for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=/.test(attrs))new vm.Script(body);}
const stripped=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');const stack=[];for(const m of stripped.matchAll(/<(\/?)(div|section|form|details|dialog|main|header)\b[^>]*>/gi)){if(m[1])assert.equal(stack.pop(),m[2]);else stack.push(m[2]);}assert.equal(stack.length,0);
assert(sql.includes("new.entry_source='post_match'"));assert(sql.includes('new.clock_elapsed_seconds:=null'));assert(sql.includes('prior.payload=payload'));assert(sql.includes("errcode='40001'"));assert(sql.includes('for update'));assert(sql.includes('enable row level security'));assert(sql.includes('actor_id uuid:=auth.uid()'));assert(!sql.includes("insert into public.game_day_sessions"));
const counter=vm.createContext({gdEsc:v=>String(v),clockStampLabel:()=>'',document:{getElementById:()=>({})}});const renderStart=html.indexOf('function gdEventLabel('),renderEnd=html.indexOf('function renderMotm(',renderStart);vm.runInContext(html.slice(renderStart,renderEnd),counter);assert(counter.gdEventLabel({event_type:'skor_goal',player_name:'Player',assist_status:'unknown'}).includes('Assist unknown'));
console.log('Post-match entry: draft reconciliation (200 cases), half totals, assists, stable TEMP IDs, preserved events, exact retries, concurrency/accounts/conflicts, real log renderer and HTML/SQL contracts passed.');
