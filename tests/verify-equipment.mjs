import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const source=fs.readFileSync(new URL('../equipment.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../equipment.css',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../docs/sql/EQUIPMENT.sql',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const player=fs.readFileSync(new URL('../player-portal.html',import.meta.url),'utf8');
new vm.Script(source);
for(const html of [admin,player]){
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'unique HTML IDs');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(match[1])&&!/application\//.test(match[1]))new vm.Script(match[2]);
  assert.match(html,/equipment\.css\?v=58\.5/);assert.match(html,/equipment\.js\?v=58\.19/);
}
assert.match(admin,/data-view="equipment"/);assert.match(admin,/SKOREquipment\?\.mount\(\{rootId:"captainEquipment",client:sb,mode:"captain"\}\)/);
assert.match(admin,/if\(id==="equipment"\)window\.SKOREquipment\?\.refresh\(\)/);
assert.match(player,/SKOREquipment\?\.mount\(\{rootId:"playerEquipment",client:db,mode:"player"\}\)/);
const signedOut=player.slice(player.indexOf("if(event==='SIGNED_OUT'){"),player.indexOf("if(s?.user&&!portalAuthorized)"));
assert.match(signedOut,/window\.SKOREquipment\?\.clear\(\)/,'sign-out must clear equipment even when other portal controllers clear first');
assert.doesNotMatch(css,/\b(?:aside|\.nav|\.app|\.view)\b/,'feature CSS must not override navigation');
assert.match(css,/min-height:44px/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/max-height:calc\(100dvh - 24px\)/);
assert.match(css,/overflow-y:auto/);assert.match(css,/minmax\(min\(100%,250px\),1fr\)/);

// SQL contract checks supplement (and do not replace) future PostgreSQL execution.
assert.match(sql,/^begin;$/m);assert.match(sql,/^commit;$/m);
assert.match(sql,/revoke all on all functions in schema skor_equipment from public, anon, authenticated/);
assert.match(sql,/enable row level security/);assert.doesNotMatch(sql,/grant\s+(?:all|insert|update|delete|select).*?on\s+(?:table\s+)?skor_equipment\.items/i);
assert.match(sql,/public\.current_player_id\(\)/);assert.match(sql,/public\.is_skor_captain\(\)/);assert.doesNotMatch(sql,/user_metadata|service_role/);
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('skor-fc-equipment',0\)\)/);
assert.match(sql,/v_loan\.status<>'pending'/);assert.match(sql,/Captain approval is required before handoff/);
assert.match(sql,/v_loan\.status<>'return_pending'/);assert.match(sql,/Resolve linked missing stock before confirming/);
assert.match(sql,/v_loan\.quantity>skor_equipment\.available_quantity/);
assert.match(sql,/insert into skor_equipment\.allocations select v_id,id,quantity/);
assert.match(sql,/v_previous\.payload_signature<>v_signature/);assert.match(sql,/return v_previous\.result/);
assert.match(sql,/borrower_user=auth\.uid\(\)/);assert.match(sql,/m\.author_user=auth\.uid\(\) or m\.recipient_user=auth\.uid\(\)/);
assert.match(sql,/reporter, owner or a captain must confirm/i);assert.match(sql,/A captain must verify recovered team equipment/);
assert.match(sql,/values\('team',v_id/);assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.(?:announcements|team_roster|player_access|jersey_inventory|matches)/i);
assert.match(sql,/values\('skor-equipment','skor-equipment',false,5242880/);assert.match(sql,/storage\.foldername\(name\).*auth\.uid/);

// Small DOM for exercising the real controller without a browser/network or new dependencies.
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;|&#039;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
class Node {
  constructor(tag='div',attrs={}){this.tag=tag;this.attrs=attrs;this.children=[];this.parent=null;this.listeners={};this.dataset={};this.disabled='disabled'in attrs;this.checked='checked'in attrs;this.open=false;this.value=attrs.value||'';this.selectionStart=0;this._text='';this._html='';this.className=attrs.class||'';for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;this.classList={add:c=>{if(!this.className.split(' ').includes(c))this.className+=' '+c;},toggle:(c,on)=>{this.className=this.className.split(' ').filter(x=>x!==c).concat(on?[c]:[]).join(' ');}};}
  set innerHTML(html){this._html=html;this.children=[];this._text='';const stack=[this];for(const token of html.matchAll(/<\/?[^>]+>|[^<]+/g)){const v=token[0];if(v.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(v.startsWith('<')){const match=v.match(/^<([a-z0-9-]+)/i);if(!match)continue;const attrs={};for(const a of v.matchAll(/([a-zA-Z][\w-]*)(?:="([^"]*)")?/g)){if(a.index===1)continue;attrs[a[1]]=decode(a[2]??'');}const child=new Node(match[1],attrs),parent=stack.at(-1);child.parent=parent;parent.children.push(child);if(!['input','img','br','hr'].includes(child.tag))stack.push(child);}else stack.at(-1)._text+=decode(v);}for(const n of this.all()){if(n.tag==='select'){const options=n.all().filter(x=>x.tag==='option');n.value=(options.find(x=>'selected'in x.attrs)||options[0])?.attrs.value||'';}if(n.tag==='textarea')n.value=n.textContent;}}
  get innerHTML(){return this._html;}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
  all(){return this.children.flatMap(c=>[c,...c.all()]);}
  matches(selector){const parts=selector.split(/\s+/);if(parts.length>1){return this.matches(parts.at(-1))&&!!this.parent?.closest(parts.slice(0,-1).join(' '));}const attr=selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);const cls=selector.match(/^\.([\w-]+)/);const tag=selector.match(/^([a-z]+)/);return (!tag||this.tag===tag[1])&&(!cls||this.className.split(' ').includes(cls[1]))&&(!attr||(attr[1]in this.attrs&&(attr[2]===undefined||this.attrs[attr[1]]===attr[2])));}
  querySelectorAll(s){return this.all().filter(n=>n.matches(s));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){return this.matches(s)?this:this.parent?.closest(s)||null;}
  contains(n){return n===this||this.all().includes(n);}
  addEventListener(n,fn){(this.listeners[n]??=[]).push(fn);}
  removeEventListener(n,fn){this.listeners[n]=(this.listeners[n]||[]).filter(f=>f!==fn);}
  async fire(name,target=this){const e={target,preventDefault(){this.prevented=true;}};for(const fn of this.listeners[name]||[])await fn(e);return e;}
  showModal(){this.open=true;}close(){this.open=false;}
  reportValidity(){return true;}focus(){this.focused=true;}setSelectionRange(a){this.selectionStart=a;}
}
class FormDataMock{constructor(form){this.rows=form.all().filter(n=>['input','textarea','select'].includes(n.tag)&&n.attrs.name).map(n=>[n.attrs.name,n.tag==='input'&&n.attrs.type==='file'?n.file||{size:0}:n.value]);}*[Symbol.iterator](){yield* this.rows;}get(name){return this.rows.find(r=>r[0]===name)?.[1];}}

const initial={actor_key:'captain:a',can_manage:true,can_request:true,people:[{key:'captain:a',name:'Example Captain',kind:'captain'},{key:'captain:b',name:'Other Captain',kind:'captain'},{key:'player:a',name:'Sample Player',kind:'player'}],
  items:[{id:'bag',name:'Match ball bag',category:'ball_bag',quantity:1,missing:0,available:1,active:true,holder_key:'captain:a',holder_name:'Example Captain'},
    {id:'ball',name:'Match balls',category:'ball',quantity:3,missing:0,available:3,active:true,parent_id:'bag',holder_key:'captain:a',holder_name:'Example Captain'},
    {id:'cone',name:'Training cones',category:'cone',quantity:12,missing:0,available:12,active:true,holder_key:'captain:a',holder_name:'Example Captain'}],loans:[],reports:[],messages:[],notifications:[],history:[]};
function fixture(mode='captain'){
  const root=new Node();let actor='user-a',state=structuredClone(initial),canWrite=true,readError=null,writeError=null,writeDelay=null,readDelay=null,authDelay=null,authListener=null;
  if(mode==='player'){state.actor_key='player:a';state.can_manage=false;}
  const writes=[],uploads=[],removals=[],receipts=new Map();let mutations=0;
  const db={auth:{async getUser(){if(authDelay)await authDelay;return {data:{user:actor?{id:actor}:null}};},onAuthStateChange(fn){authListener=fn;return{data:{subscription:{unsubscribe(){authListener=null;}}}};}},
    async rpc(name,args){
      if(name==='equipment_snapshot'){if(readDelay)await readDelay;return readError?{error:readError}:{data:structuredClone(state)};}
      assert.equal(name,'equipment_action');writes.push(structuredClone(args));if(writeDelay)await writeDelay;if(writeError)return {error:writeError};
      const {p_action:action,p_payload:p}=args;if(receipts.has(p.request_id))return {data:receipts.get(p.request_id)};mutations++;
      if(action==='request')state.loans.unshift({id:'loan',item_id:p.item_id,item_name:state.items.find(i=>i.id===p.item_id).name,quantity:p.quantity,status:'pending',due_date:p.due_date,is_mine:true,borrower_name:'Sample Player',note:p.note});
      if(['approve','pickup','report_return','confirm_return','cancel','decline'].includes(action))state.loans.find(l=>l.id===p.id).status={approve:'approved',pickup:'borrowed',report_return:'return_pending',confirm_return:'returned',cancel:'cancelled',decline:'declined'}[action];
      if(action==='transfer')state.items.filter(i=>p.ids.includes(i.id)||p.ids.includes(i.parent_id)).forEach(i=>{i.holder_key=p.holder_key;i.holder_name=state.people.find(x=>x.key===p.holder_key).name;});
      if(action==='report')state.reports.push({...p,id:'report',status:'missing',reporter_key:state.actor_key,reporter_name:'Sample Player',is_mine:true});
      if(action==='message')state.messages.push({...p,id:'message',report_id:p.id,author_key:state.actor_key,author_name:'Sample Player',recipient_key:p.to_key,recipient_name:'Other Captain',created_at:new Date().toISOString()});
      if(action==='read_notification')state.notifications.find(n=>n.id===p.id).read=true;
      const result={ok:true,summary:'Saved: '+action,id:p.id||'new',photo_path:p.photo_path||null};receipts.set(p.request_id,result);return {data:result};
    },storage:{from(bucket){assert.equal(bucket,'skor-equipment');return{async createSignedUrls(paths){return {data:paths.map(path=>({path,signedUrl:'https://example.invalid/private/'+path}))};},async upload(path,file,options){uploads.push({path,file,options});return {data:{path}};},async remove(paths){removals.push(paths);return{};}};}}};
  const events=[];const win={SKORPortalCanWrite:()=>canWrite,CustomEvent:class {constructor(type){this.type=type;}},dispatchEvent:event=>events.push(event.type)};const context={window:win,document:{getElementById:()=>root},crypto:{randomUUID},FormData:FormDataMock,console};vm.runInNewContext(source,context);
  const find=s=>{const n=root.querySelector(s);assert.ok(n,'element exists: '+s);return n;};
  return {root,win,db,writes,uploads,removals,events,get state(){return state;},get mutations(){return mutations;},setState(s){state=s;},setActor(v){actor=v;},authEvent(event,id){authListener?.(event,id?{user:{id}}:null);},setCanWrite(v){canWrite=v;},setReadError(v){readError=v;},setWriteError(v){writeError=v;},setWriteDelay(v){writeDelay=v;},setReadDelay(v){readDelay=v;},setAuthDelay(v){authDelay=v;},find,
    mount:()=>win.SKOREquipment.mount({rootId:'root',client:db,mode}),
    click:async(action,id)=>{const target=root.querySelectorAll(`[data-eq-action="${action}"]`).find(n=>id===undefined||n.dataset.id===id);assert.ok(target,action);assert.equal(target.disabled,false,action+' enabled');await root.fire('click',target);},
    tab:async key=>root.fire('click',find(`[data-eq-tab="${key}"]`)),set(name,value){find(`[name="${name}"]`).value=value;},submit:()=>root.fire('submit',find('form')),
  };
}

const f=fixture();await f.mount();assert.match(f.root.innerHTML,/Equipment &amp; Lost &amp; Found/);
assert.match(f.find('.eq-content').innerHTML,/Contains 3 × Match balls/);
await f.click('request','ball');f.set('quantity','2');f.set('due_date','2099-01-01');f.set('note','After practice');await f.submit();
assert.equal(f.state.loans[0].status,'pending','a request must not imply approval or possession');assert.equal(f.writes[0].p_payload.quantity,2);assert.equal(f.writes[0].p_action,'request');assert.ok(f.writes[0].p_payload.request_id);assert.equal(f.find('dialog').open,false);
await f.tab('loans');assert.match(f.find('.eq-content').innerHTML,/Approve &amp; reserve/);assert.doesNotMatch(f.find('.eq-content').innerHTML,/Confirm physical handoff/);
await f.click('approve');await f.submit();assert.equal(f.state.loans[0].status,'approved');assert.match(f.find('.eq-content').innerHTML,/Confirm physical handoff/);
await f.click('pickup');await f.submit();assert.equal(f.state.loans[0].status,'borrowed');assert.match(f.find('.eq-content').innerHTML,/Report return/);
await f.click('report_return');await f.submit();assert.equal(f.state.loans[0].status,'return_pending');
await f.click('confirm_return');f.set('condition','All three balls checked');await f.submit();assert.equal(f.state.loans[0].status,'returned');assert.equal(f.writes.at(-1).p_payload.condition,'All three balls checked');

// Whole-bag transfers include contents, preserve quantities/categories, and need confirmation.
await f.tab('inventory');await f.root.fire('change',Object.assign(f.find('[data-eq-select="bag"]'),{checked:true}));
f.set('eqBulkHolder','captain:b');await f.click('transfer');assert.match(f.find('dialog').innerHTML,/3 × Match balls/);const before=f.writes.length;await f.click('close');assert.equal(f.writes.length,before);
f.set('eqBulkHolder','captain:b');await f.click('transfer');await f.submit();assert.equal(f.state.items[0].holder_name,'Other Captain');assert.equal(f.state.items[1].holder_name,'Other Captain');assert.equal(f.state.items[1].quantity,3);assert.equal(f.state.items[2].holder_name,'Example Captain');
assert.equal(f.find('[data-eq-select="ball"]').disabled,true,'bag contents transfer with their container');

// Failed writes preserve the dialog/draft and the idempotency token for retry.
await f.click('add_item');f.set('name','Cone set');f.set('holder_key','captain:a');f.setWriteError(new Error('offline'));await f.submit();
const token=f.writes.at(-1).p_payload.request_id;assert.equal(f.find('dialog').open,true);assert.equal(f.find('[name="name"]').value,'Cone set');assert.match(f.find('.eq-dialog .eq-notice').textContent,/offline/);
f.setWriteError(null);await f.submit();assert.equal(f.writes.at(-1).p_payload.request_id,token);assert.equal(f.find('dialog').open,false);

// Disable submit, duplicate clicks and Escape during a save.
await f.tab('lost');await f.click('add_report');f.set('title','Water bottle');f.set('description','Blue bottle');f.set('location','Field 2');
let release;f.setWriteDelay(new Promise(resolve=>{release=resolve;}));const saving=f.submit();await new Promise(r=>setImmediate(r));const writeCount=f.writes.length;
assert.equal(f.find('button[type="submit"]').disabled,true);await f.submit();assert.equal(f.writes.length,writeCount);const cancelled=await f.find('dialog').fire('cancel');assert.equal(cancelled.prevented,true);
release();await saving;f.setWriteDelay(null);assert.match(f.find('.eq-content').innerHTML,/Water bottle/);assert.match(f.find('.eq-content').innerHTML,/Announce to team/);
await f.click('announce');assert.match(f.find('dialog').textContent,/every player's in-app notifications/);await f.click('close');

// Player console sees borrowing and reports, with no inventory/admin actions.
const p=fixture('player');await p.mount();assert.doesNotMatch(p.find('.eq-tabs').innerHTML,/Inventory|History/);assert.match(p.find('.eq-tabs').innerHTML,/My borrowing/);
await p.click('request','cone');p.set('due_date','2099-01-01');await p.submit();await p.tab('loans');assert.doesNotMatch(p.find('.eq-content').innerHTML,/Approve|physical handoff/);assert.match(p.find('.eq-content').innerHTML,/Cancel request/);
p.state.reports.push({id:'r',title:'Shin guards <script>',description:'Left at training',location:'Field',seen_date:'2026-10-14',status:'missing',reporter_key:'captain:b',reporter_name:'Other Captain',owner_key:'captain:b',owner_name:'Other Captain',is_mine:false});
await p.win.SKOREquipment.refresh();await p.tab('lost');assert.match(p.find('.eq-content').innerHTML,/Shin guards &lt;script&gt;/);assert.doesNotMatch(p.find('.eq-content').innerHTML,/Announce to team|Confirm recovered stock|Confirm returned/);
await p.click('contact','r');p.set('body','I found them near the bench');await p.submit();assert.equal(p.writes.at(-1).p_action,'message');assert.equal(p.writes.at(-1).p_payload.to_key,'captain:b');assert.match(p.find('.eq-content').innerHTML,/Private messages/);

// View-only roles cannot request or manage even if a stale UI exposes a button.
const viewer=fixture();viewer.state.can_manage=false;viewer.state.can_request=false;viewer.setCanWrite(false);await viewer.mount();assert.equal(viewer.find('[data-eq-action="request"]').disabled,true);assert.doesNotMatch(viewer.find('.eq-tabs').innerHTML,/Inventory/);

// Private photo upload: immutable path, type/size limits, safe cleanup after rejected writes.
await p.click('add_report');p.set('title','Bottle');p.set('description','Green');p.set('location','Bench');p.find('[name="photo"]').file={size:6000000,type:'image/png'};const priorUploads=p.uploads.length;await p.submit();assert.equal(p.uploads.length,priorUploads);assert.match(p.find('.eq-dialog .eq-notice').textContent,/up to 5 MB/);
p.find('[name="photo"]').file={size:100,type:'image/png'};p.setWriteError(new Error('not saved'));await p.submit();assert.equal(p.uploads.at(-1).options.upsert,false);assert.match(p.uploads.at(-1).path,/^user-a\/.*\.png$/);assert.deepEqual(Array.from(p.removals.at(-1)),[p.uploads.at(-1).path]);p.setWriteError(null);await p.click('close');

// Account mismatch must stop before any mutation; late reads cannot restore old data.
await p.tab('store');await p.click('request','ball');const count=p.writes.length;p.setActor('user-b');await p.submit();assert.equal(p.writes.length,count);assert.equal(p.find('dialog').open,false);assert.equal(p.find('.eq-content').innerHTML,'');
await p.mount();let finish;p.setReadDelay(new Promise(resolve=>{finish=resolve;}));const pending=p.win.SKOREquipment.refresh();p.win.SKOREquipment.clear();finish();await pending;p.setReadDelay(null);assert.equal(p.find('.eq-content').innerHTML,'');
const broken=fixture();broken.setReadError({code:'PGRST202',message:'equipment_snapshot not in schema cache'});await broken.mount();assert.match(broken.find('.eq-main-notice').textContent,/not available yet/);assert.equal(broken.writes.length,0);assert.doesNotMatch(broken.find('.eq-main-notice').textContent,/SQL|migration/,'product UI avoids implementation instructions');

const switched=fixture();await switched.mount();await switched.click('request','ball');switched.authEvent('SIGNED_IN','another-user');assert.equal(switched.find('dialog').open,false);assert.equal(switched.find('.eq-content').innerHTML,'','auth account changes immediately remove private data and drafts');
const filtered=fixture();await filtered.mount();await filtered.tab('inventory');await filtered.root.fire('change',Object.assign(filtered.find('[data-eq-select="bag"]'),{checked:true}));
const search=filtered.find('[data-eq-filter="query"]');search.value='Cones';await filtered.root.fire('input',search);assert.match(filtered.find('.eq-content').innerHTML,/includes hidden selections/);filtered.set('eqBulkHolder','player:a');await filtered.click('transfer');assert.match(filtered.find('dialog').innerHTML,/Match ball bag|Match bag/);assert.match(filtered.find('dialog').innerHTML,/Match balls/);assert.equal(filtered.writes.length,0,'hidden selections remain reviewable before the handoff');await filtered.click('close');
const unavailable=fixture();unavailable.state.items[0].available=0;unavailable.state.items[1].missing=1;unavailable.state.items[1].available=0;await unavailable.mount();assert.equal(unavailable.find('[data-eq-action="request"][data-id="bag"]').disabled,true);assert.match(unavailable.find('.eq-content').innerHTML,/1 missing/);
const savedButOffline=fixture();await savedButOffline.mount();await savedButOffline.click('request','cone');savedButOffline.set('due_date','2099-01-01');savedButOffline.setReadError(new Error('refresh offline'));await savedButOffline.submit();assert.equal(savedButOffline.state.loans.length,1);assert.equal(savedButOffline.find('dialog').open,false,'acknowledged writes close the draft even if subsequent refresh fails');assert.match(savedButOffline.find('.eq-main-notice').textContent,/Could not refresh/);

const inbox=fixture();inbox.state.notifications=[{id:'note',body:'A player requested cones.',audience:'captains',created_at:'2026-10-24',read:false}];await inbox.mount();
assert.deepEqual(inbox.events,['skor:equipment-notifications'],'equipment snapshot notifies the dashboard inbox');
await inbox.tab('notifications');assert.match(inbox.find('.eq-content').innerHTML,/Mark read/);
inbox.win.SKOREquipment.applyNotificationRead('note');assert.doesNotMatch(inbox.find('.eq-content').innerHTML,/Mark read/);assert.equal(inbox.writes.length,0,'dashboard acknowledgment updates equipment display without a duplicate write');
await inbox.win.SKOREquipment.openNotification({loan_id:'loan'});assert.match(inbox.find('.eq-tabs').innerHTML,/Requests &amp; returns|Requests & returns/);assert.equal(inbox.writes.length,0,'opening a notification does not mark it read');
await inbox.tab('notifications');const eventsBefore=inbox.events.length;await inbox.click('read_notification','note');assert.equal(inbox.state.notifications[0].read,true);assert.ok(inbox.events.length>eventsBefore,'marking read inside equipment refreshes dashboard counts');
const preserved=fixture();preserved.state.notifications=[{id:'note',read:false}];await preserved.mount();await preserved.click('request','cone');preserved.set('note','Keep this draft');preserved.win.SKOREquipment.applyNotificationRead('note');assert.equal(preserved.find('dialog').open,true);assert.equal(preserved.find('[name="note"]').value,'Keep this draft','read synchronization preserves an open borrowing form');
const playerEvents=fixture('player');await playerEvents.mount();assert.equal(playerEvents.events.length,0,'player equipment does not trigger captain inbox refreshes');

console.log('Equipment controller checks passed: connected portals, approval/pickup/return states, bag custody, role visibility, private reports/messages/photos, retries, duplicate clicks, failed saves, account races and dashboard notification synchronization. SQL security/concurrency contracts passed; PostgreSQL execution and rendered browser verification remain separate checks.');
