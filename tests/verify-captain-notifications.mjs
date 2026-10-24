import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),N=require('../captain-notifications.js');
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const admin=read('admin.html'),sql=read('docs/sql/CAPTAIN-NOTIFICATIONS.sql');
const fixture=read('tests/fixtures/captain-notifications.sql');
if(process.argv.includes('--sql-fixture')){
  let query=sql.split('as $function$')[1].split('$function$;')[0].trim().replace(/;$/,'');
  for(const [a,b] of Object.entries({'public.player_match_comments':'fixture_comments','public.player_match_reactions':'fixture_reactions','public.team_roster':'fixture_roster','public.matches':'fixture_matches','skor_equipment.notification_reads':'fixture_equipment_reads','skor_equipment.notifications':'fixture_equipment','skor_private.captain_feedback_reads':'fixture_feedback_reads','auth.uid()':'(select user_id from fixture_actor)'}))query=query.replaceAll(a,b);
  process.stdout.write(fixture.replace('/* ITEMS_QUERY */',query));process.exit(0);
}
assert.match(admin,/captain-portal-v58\.21-substitution-alarm/);
assert.match(admin,/captainInbox\?\.clear\(\)/);assert.match(admin,/portalCanWrite\(\)\)void captainInbox\?\.start\(user.id\)/);
assert.ok(admin.indexOf('id="captainNotifications"')<admin.indexOf('id="dashboardInjuryPanel"'));
const disclosureTag=admin.match(/<details[^>]*id="captainInboxDisclosure"[^>]*>/)?.[0];assert.ok(disclosureTag);assert.doesNotMatch(disclosureTag,/\sopen(?:\s|=|>)/,'inbox starts collapsed');
assert.match(admin,/data-cn-summary-count/);
assert.doesNotMatch(admin,/DASHBOARD_FEEDBACK|get_recent_player_feedback/);
assert.match(admin,/if\(preferredId&&!data\?\.some/,'old/unpublished matches can be explicitly opened by captains');
assert.match(sql,/primary key \(user_id,kind,source_id\)/);
assert.match(sql,/er\.user_id=auth\.uid\(\)/);assert.match(sql,/fr\.user_id=auth\.uid\(\)/);
assert.match(sql,/fr\.revision>=f\.revision/);assert.match(sql,/p_revision is distinct from v_item\.revision/);
assert.equal((sql.match(/if auth\.uid\(\) is null or not coalesce\(public\.is_skor_captain/g)||[]).length,2);
assert.doesNotMatch(sql,/interval|limit 100\)|p_user_id|p_captain_id/i);
assert.match(sql,/revoke all on skor_private.captain_feedback_reads from public,anon,authenticated/);
assert.match(sql,/enable row level security/);

const rows=Array.from({length:23},(_,i)=>({kind:i===0?'equipment':i===1?'reaction':'comment',id:String(i),revision:'2026-10-24T12:00:00.123456Z',title:'Sample Player',body:'Example feedback',audience:'team',is_read:false,match_id:i?'old-match':null,opponent:'Opponent',kickoff:'2024-01-01T12:00:00Z',loan_id:i?null:'loan',report_id:null}));
let signedIn='captain-a',visible=true,readError=null,writeError=null,delay=null;
const receipts=new Map(),calls=[],states=[],equipmentReads=[],timers=new Map();let nextTimer=0;
const seen=(actor,row)=>receipts.get(actor+':'+row.kind+':'+row.id)===row.revision;
const client={auth:{getSession:async()=>({data:{session:{user:{id:signedIn}}}})},rpc:async(name,args)=>{
  const actor=signedIn;calls.push({actor,name,args});if(delay)await delay;
  if(name==='get_captain_notifications'){
    if(readError)return {error:readError};
    const all=rows.map(r=>({...r,is_read:seen(actor,r)}));
    const filtered=all.filter(r=>args.p_filter==='all'||!r.is_read);
    return {data:{items:filtered.slice(args.p_offset,args.p_offset+args.p_limit),total:filtered.length,unread_equipment:all.filter(r=>!r.is_read&&r.kind==='equipment').length,unread_feedback:all.filter(r=>!r.is_read&&r.kind!=='equipment').length,as_of:'2026-10-24T12:01:00Z'}};
  }
  assert.equal(name,'mark_captain_notification_read');if(writeError)return {error:writeError};
  const row=rows.find(r=>r.id===args.p_id&&r.kind===args.p_kind);
  if(!row||row.revision!==args.p_revision)return {error:new Error('Feedback changed. Refresh.')};
  receipts.set(actor+':'+row.kind+':'+row.id,row.revision);return {data:{ok:true}};
}};
const controller=N.createController({client,onState:s=>states.push(s),onEquipmentRead:id=>equipmentReads.push(id),visible:()=>visible,schedule:fn=>{timers.set(++nextTimer,fn);return nextTimer;},cancel:id=>timers.delete(id)});
await controller.start('captain-a');assert.equal(controller.state().snapshot.total,23);assert.equal(controller.state().snapshot.items.length,10);
assert.equal(receipts.size,0,'opening/refreshing never marks notifications read');
await controller.mark(controller.state().snapshot.items[0]);assert.deepEqual(equipmentReads,['0']);assert.equal(controller.state().snapshot.unread_equipment,0);
assert.equal(seen('captain-b',rows[0]),false,'one captain cannot clear another captain equipment receipt');
await controller.mark(controller.state().snapshot.items[0]);assert.equal(controller.state().snapshot.unread_feedback,21);assert.equal(seen('captain-b',rows[1]),false);
await controller.view('all',2);assert.equal(calls.at(-1).args.p_offset,20);assert.equal(controller.state().snapshot.items.length,3);
await controller.view('unread');assert.equal(controller.state().snapshot.total,21);
const target=controller.state().snapshot.items[0];writeError=new Error('offline');assert.equal(await controller.mark(target),false);assert.equal(seen('captain-a',target),false);assert.equal(controller.state().phase,'stale');writeError=null;
rows.find(r=>r.id===target.id).revision='2026-10-24T12:00:01Z';assert.equal(await controller.mark(target),false,'an unseen edit is not marked read');
await controller.refresh();await controller.mark(controller.state().snapshot.items[0]);assert.equal(controller.state().snapshot.total,20);
rows[1].revision='2026-10-24T12:02:00Z';await controller.refresh();assert.equal(controller.state().snapshot.total,21,'edited reactions become unread again');
readError=new Error('offline');await controller.refresh();assert.equal(controller.state().phase,'stale');assert.equal(controller.state().snapshot.total,21);readError={code:'42501',message:'Captain access required.'};await controller.refresh();assert.equal(controller.state().snapshot,null,'revoked access must clear cached private notifications');readError=null;await controller.refresh();
visible=false;const before=calls.length;await controller.resume();assert.equal(timers.size,0);assert.equal(calls.length,before);visible=true;await controller.resume();assert.equal(timers.size,1);
let release;delay=new Promise(r=>release=r);const first=controller.refresh();const second=controller.refresh();assert.equal(first,second,'deduplicate foreground refreshes');await Promise.resolve();controller.clear();release();await first;assert.equal(controller.state().snapshot,null);delay=null;
signedIn='captain-b';await controller.start('captain-b');assert.equal(controller.state().snapshot.total,23,'another captain retains every unread update');
signedIn='unexpected-user';const prior=calls.length;await controller.mark(controller.state().snapshot.items[0]);assert.equal(calls.length,prior);assert.equal(controller.state().owner,null);assert.equal(controller.state().snapshot,null,'clear private data on session mismatch');
signedIn='captain-a';readError=new Error('offline');await controller.start('captain-a');assert.equal(controller.state().snapshot,null);assert.equal(controller.state().phase,'error');readError=null;
await controller.refresh();const page=controller.state().snapshot;
const rendered=N.render({...controller.state(),snapshot:{...page,items:[{...rows[2],title:'<script>bad</script>',body:'<img onerror=bad>',opponent:'<svg>'}]}});
assert.doesNotMatch(rendered,/<script>|<img|<svg>/);assert.match(rendered,/&lt;img/);assert.match(rendered,/Mark read for me/);assert.match(rendered,/Private feedback|Team feedback/);
for(const mutate of [v=>v.items=null,v=>v.unread_feedback=null,v=>v.total=-1,v=>v.items[0].is_read='false']){const v=structuredClone(page);mutate(v);assert.throws(()=>N.normalize(v));}
for(const file of ['admin.html','player-portal.html'])for(const script of read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
controller.clear();assert.equal(timers.size,0);
// Exercise the actual DOM event adapter and rendered badge updates.
signedIn='captain-b';const badges=[{dataset:{captainUnread:'all'}},{dataset:{captainUnread:'equipment'}}];
const summaryCount={setAttribute(name,value){this[name]=value;}},disclosure={hidden:true,open:false,querySelector:()=>summaryCount};
const root={hidden:true,innerHTML:'',handlers:{},addEventListener(n,fn){this.handlers[n]=fn;},contains:()=>true,closest:()=>disclosure,append(){}};
const doc={visibilityState:'visible',getElementById:()=>root,querySelectorAll:()=>badges,addEventListener(){},createElement:()=>({setAttribute(){}})};
const listeners={},win={addEventListener:(n,fn)=>{listeners[n]=fn;}};let openedEquipment=0,openedFeedback=0,synced=0;
const mounted=N.mount({rootId:'inbox',client,doc,win,onOpenEquipment:async()=>{openedEquipment++;},onOpenFeedback:async id=>{assert.equal(id,'old-match');openedFeedback++;},onEquipmentRead:()=>{synced++;}});
await mounted.start('captain-b');assert.equal(root.hidden,false);assert.equal(badges[0].textContent,23);assert.match(root.innerHTML,/Unread status is yours/);assert.equal(disclosure.hidden,false);assert.equal(disclosure.open,false);assert.equal(summaryCount.textContent,23);
disclosure.open=true;await mounted.refresh();assert.equal(disclosure.open,true,'refresh preserves expanded choice');
disclosure.open=false;await listeners['skor:equipment-notifications']();assert.equal(disclosure.open,false,'equipment refresh preserves collapsed choice');
const click=async attrs=>{const b={dataset:attrs,disabled:false,closest(){return this;},hasAttribute(name){return Object.hasOwn(attrs,name.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));}};await root.handlers.click({target:b});};
const receiptCount=receipts.size;await click({cnOpen:'0'});await click({cnOpen:'1'});assert.equal(openedEquipment,1);assert.equal(openedFeedback,1);assert.equal(receipts.size,receiptCount,'opening either destination cannot mark read');
await click({cnRead:'0'});assert.equal(synced,1);assert.equal(badges[1].textContent,0);assert.equal(badges[1].hidden,true);
assert.equal(summaryCount.textContent,22,'summary count updates while closed');assert.equal(disclosure.open,false);
disclosure.open=true;mounted.clear();assert.equal(root.hidden,true);assert.equal(root.innerHTML,'');assert.equal(badges[0].hidden,true);assert.equal(disclosure.hidden,true);assert.equal(disclosure.open,false,'sign-out resets disclosure for the next account');
console.log('Captain notifications verified: independent receipts, equipment sync, all-game pagination, edited feedback, explicit read actions, errors, visibility polling, concurrency, account isolation, escaping and SQL access contracts.');
