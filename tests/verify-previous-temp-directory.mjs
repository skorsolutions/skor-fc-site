import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('guest-profiles.js','utf8'),dues=fs.readFileSync('team-dues.js','utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const ctx=vm.createContext({crypto:webcrypto,Intl,Date,Map,Set,BigInt,Promise,encodeURIComponent,setTimeout:()=>1,clearTimeout(){}});vm.runInContext(dues,ctx);vm.runInContext(source,ctx);
const api=ctx.SKORGuestProfiles;
const appearances=[{id:'t1',match_id:'m1',name:'Alex Example',number:18,active:true,history_eligible:true,updated_at:'2026-10-01T10:00:00Z'},{id:'t2',match_id:'m2',name:' ALEX  EXAMPLE ',number:22,active:true,history_eligible:true,updated_at:'2026-10-01T10:00:00Z'},{id:'t3',match_id:'m1',name:'Different Person',number:null,active:true,history_eligible:true,updated_at:'2026-10-01T10:00:00Z'},{id:'t4',match_id:'m3',name:'<img src=x onerror=alert(1)>',number:44,active:true,history_eligible:true,updated_at:'2026-10-01T10:00:00Z'}];
const initial=JSON.stringify(appearances),groups=api.legacyGroups(appearances);
assert.equal(groups.length,3);assert.equal(groups.find(g=>g.key==='alex example').games.length,2);assert.equal(JSON.stringify(appearances),initial);
const removed={...appearances[0],id:'old',active:false,has_usage:false,history_eligible:false},used={...removed,id:'referenced',match_id:'m4',has_usage:true,history_eligible:true};
const classified=api.legacyGroups([...appearances,removed,used,appearances[0]]).find(g=>g.key==='alex example');
assert.equal(classified.games.length,3,'inactive referenced assignments remain in saved history');assert.equal(classified.archived.length,1,'unused removed rows do not add saved games');
const conflict=api.legacyGroups([appearances[0],{...appearances[0],id:'another'}])[0];assert.equal(conflict.games.length,1);assert.equal(conflict.games[0].rows.length,2);
const html=api.legacyDirectoryMarkup({legacy:[...appearances,removed]},id=>'Game '+id);
assert.equal((html.match(/data-gp="legacy-create"/g)||[]).length,3,'one create action per person');assert.equal((html.match(/data-gp="legacy-link"/g)||[]).length,3);assert.match(html,/2 saved games/);assert.match(html,/Not selected \/ unused TEMP entries \(1\)/);assert.match(html,/No match participation recorded/);assert.match(html,/Match jersey #18/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
assert.match(api.legacyDirectoryMarkup({legacy:[]},()=>''),/All current saved TEMP assignments are linked/);
assert.doesNotMatch(api.legacyDirectoryMarkup({legacy:[removed]},()=>''),/1 saved game/);
const linkedArchive=api.legacyDirectoryMarkup({legacy:[removed],links:[{name:removed.name,match_id:removed.match_id}]},()=> 'Saved game');assert.doesNotMatch(linkedArchive,/data-gp="legacy-create"/,'leftover archived duplicate cannot create another profile');
assert.equal((api.legacyDirectoryMarkup({legacy:appearances},()=>'',true).match(/ disabled/g)||[]).length,6);

// A created or draft-only TEMP must never become a saved game, even if active or referenced.
const draftOnly={...appearances[0],id:'draft-only',name:'Draft Only Person',history_eligible:false,has_usage:true,active:true};
const inactiveDraft={...draftOnly,id:'removed-draft',active:false};
for(const row of [draftOnly,inactiveDraft]){
 const groups=api.legacyGroups([row]);assert.equal(groups[0].games.length,0);assert.equal(groups[0].archived.length,1);
 const markup=api.legacyDirectoryMarkup({legacy:[row]},()=> 'Fixture game');assert.doesNotMatch(markup,/data-gp="legacy-(create|link)"/);assert.doesNotMatch(markup,/1 saved game/);assert.match(markup,/No match participation recorded/);assert.match(markup,/data-gp-key="legacy-archive"/);assert.doesNotMatch(markup,/<details[^>]* open/);
}
// A small DOM harness executes the actual controller, native dialogs and submit handlers.
const attrs=text=>Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'")]));
class Element{
  constructor(){this.events={};this.classList={toggle(){}};this.hidden=false;this.open=false;this.textContent='';this.details=[];}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  set innerHTML(value){this.markup=value;this.details=[...value.matchAll(/<details[^>]*data-gp-key="([^"]+)"/g)].map(m=>({dataset:{gpKey:m[1]},open:false}));}
  get innerHTML(){return this.markup||'';}
  querySelectorAll(selector){return selector==='details[open]'?this.details.filter(x=>x.open):selector==='details'?this.details:[];}
  querySelector(selector){if(selector==='[data-gp-status]')return this.status??=new Element();const m=selector.match(/data-gp-key="([^"]+)"/);return m?this.details.find(x=>x.dataset.gpKey===m[1]):null;}
}
class Body extends Element{
  set innerHTML(value){for(const f of this.forms||[])f.isConnected=false;this.markup=value;this.forms=[];
    for(const m of value.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)){
      const a=attrs(m[1]),fields=new Map(),dataset={};for(const[k,v]of Object.entries(a))if(k.startsWith('data-'))dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
      for(const i of m[2].matchAll(/<input\b([^>]*)>/g)){const x=attrs(i[1]);if(x.name&&(x.type!=='checkbox'||i[1].includes('checked'))){const v=x.value||'';fields.set(x.name,fields.has(x.name)?[...[fields.get(x.name)].flat(),v]:v);}}
      for(const select of m[2].matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)){const name=attrs(select[1]).name,opts=[...select[2].matchAll(/<option\b([^>]*)>/g)],chosen=opts.find(x=>x[1].includes('selected'))||opts[0];fields.set(name,chosen?attrs(chosen[1]).value||'':'');}
      const button={disabled:false,isConnected:true};this.forms.push({id:a.id,dataset,fields,isConnected:true,querySelector:()=>button,button});
    }
  }
  get innerHTML(){return this.markup||'';}
}
class FormDataMock{constructor(f){this.fields=new Map(f.fields);}get(k){return this.fields.get(k)??null;}getAll(k){const v=this.fields.get(k);return v===undefined?[]:[v].flat();}has(k){return this.fields.has(k);}[Symbol.iterator](){return this.fields[Symbol.iterator]();}}
async function harness(){
  const directory=new Element(),body=new Body(),error=new Element(),dialog=new Element(),regular=new Element();dialog.open=false;
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};dialog.querySelector=sel=>sel==='[data-gp-dialog-body]'?body:sel==='[data-gp-error]'?error:body.forms.find(f=>'#'+f.id===sel);
  const nodes={guestDirectory:directory,guestCaptainDialog:dialog,regularRosterWorkspace:regular};
  const doc={hidden:false,getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],addEventListener(){}};
  const win={addEventListener(){}};let actor='captain',allowed=true,readFailure=false,writeFailure=false,gate=null;
  const records={summary:{present_count:0,goals:0,assists:0,motm:0,absent_count:0,excused_count:0,unmarked_count:0,yellow_cards:0,red_cards:0}};
  const snapshot={history_version:1,participation_version:1,as_of:new Date().toISOString(),profiles:[{player_id:'existing',player_key:'existing',full_name:'Known Profile',is_guest:true,enabled:true,record:structuredClone(records)}],links:[],event_participants:[],legacy:structuredClone(appearances.slice(0,3)),fee_settings:[],entries:[],ledger:{groups:[],matches:[{id:'m1',kickoff:'2026-10-01T18:00:00Z',label:'SKOR vs A'},{id:'m2',kickoff:'2026-10-08T18:00:00Z',label:'SKOR vs B'}],roster:[],scenarios:[],group_matches:[],members:[]}};
  const writes=[],receipts=new Map(),changes=[];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:actor}}}})},rpc:async(name,args)=>{
    if(name==='get_guest_console'){if(readFailure)return {error:{message:'Refresh unavailable'}};return {data:structuredClone(snapshot)};}
    assert.equal(name,'manage_guest_history');const {p_action:action,p}=args;writes.push({action,p:structuredClone(p)});
    if(gate)await gate;
    if(!receipts.has(p.request_id)){
      assert.equal(action,'import');assert.equal(p.reviewed,true);assert.ok(p.games.length);assert.ok(!Object.hasOwn(p,'number'));
      if(p.create_profile)snapshot.profiles.push({player_id:p.player_id,player_key:p.player_id,full_name:p.full_name,is_guest:true,enabled:true,record:structuredClone(records)});
      for(const game of p.games){const temp=snapshot.legacy.find(t=>t.id===game.temp_id);if(!temp)return {error:{message:'Already linked'}};assert.equal(game.updated_at,temp.updated_at);snapshot.links.push({player_id:p.player_id,match_id:game.match_id,temp_id:game.temp_id,number:temp.number,active:true});snapshot.legacy=snapshot.legacy.filter(t=>t.id!==game.temp_id);}
      receipts.set(p.request_id,{action,p:structuredClone(p)});
    }else assert.deepEqual(receipts.get(p.request_id),{action,p:plain(p)},'retry payload stays exact');
    if(writeFailure){writeFailure=false;return {error:{message:'Response lost'}};}return {data:{ok:true,player_id:p.player_id}};
  }};
  const context=vm.createContext({crypto:webcrypto,Intl,Date,Map,Set,BigInt,Promise,FormData:FormDataMock,encodeURIComponent,setTimeout:()=>1,clearTimeout(){},console});vm.runInContext(dues,context);vm.runInContext(source,context);
  const mounted=context.SKORGuestProfiles.mountCaptain({client,doc,win,canWrite:()=>allowed,onChanged:c=>changes.push(c)});await mounted.start(actor);
  const click=async(action,data={})=>{const button={disabled:false,dataset:{gp:action,...data}};await directory.events.click[0]({target:{closest:()=>button}});};
  const submit=async(f=body.forms[0])=>{await dialog.events.submit[0]({target:f,preventDefault(){}});};
  return {mounted,directory,dialog,body,error,snapshot,writes,receipts,changes,click,submit,setAllowed:v=>allowed=v,setActor:v=>actor=v,setReadFailure:v=>readFailure=v,setWriteFailure:v=>writeFailure=v,setGate:v=>gate=v};
}
const h=await harness();assert.match(h.directory.innerHTML,/Previous TEMP players/);assert.match(h.directory.innerHTML,/3 saved game assignments awaiting linking/);assert.equal(h.writes.length,0);
let group=h.directory.details.find(d=>d.dataset.gpKey.startsWith('legacy-alex'));group.open=true;await h.mounted.refresh();assert.equal(h.directory.details.find(d=>d.dataset.gpKey===group.dataset.gpKey).open,true);
await h.directory.events.change[0]({target:{value:'promoted',matches:s=>s==='[data-gp-filter]'}});assert.match(h.directory.innerHTML,/Previous TEMP players/);
await h.click('legacy-create',{group:'alex example'});assert.match(h.body.innerHTML,/value="Alex Example"/);assert.match(h.body.innerHTML,/2026-10-01/);assert.match(h.body.innerHTML,/2026-10-08/);assert.match(h.body.innerHTML,/Match jersey #18/);
const form=h.body.forms[0];await h.submit(form);assert.equal(h.writes.length,0);assert.match(h.error.textContent,/Confirm/);
form.fields.set('reviewed','on');await h.submit(form);assert.equal(h.writes.length,1,'one atomic request creates and links all selected games');assert.equal(h.writes[0].action,'import');assert.equal(h.writes[0].p.games.length,2);assert.equal(h.snapshot.profiles.length,2);assert.equal(h.snapshot.legacy.length,1);assert.equal(h.snapshot.links.length,2);assert.deepEqual(h.snapshot.links.map(l=>l.number),[18,22]);assert.equal(h.snapshot.profiles.at(-1).record.summary.present_count,0,'linking never invents attendance');assert.equal(h.dialog.open,false);assert.ok(h.changes.some(c=>c.identityChanged));h.mounted.clear();
const link=await harness();await link.click('legacy-link',{group:'alex example'});const lf=link.body.forms[0];lf.fields.set('player_id','existing');lf.fields.set('reviewed','on');await link.submit(lf);assert.equal(link.snapshot.profiles.length,1);assert.equal(link.snapshot.links.length,2);link.mounted.clear();
const retry=await harness();await retry.click('legacy-create',{group:'alex example'});retry.setWriteFailure(true);const original=retry.body.forms[0];original.fields.set('reviewed','on');await retry.submit(original);assert.equal(retry.snapshot.profiles.length,2);assert.match(retry.error.textContent,/Response lost/);await retry.mounted.refresh();await retry.submit(original);assert.equal(retry.snapshot.profiles.length,2);assert.deepEqual(retry.writes[0].p,retry.writes[1].p,'lost-response retry preserves exact identity, manifest and request id');retry.mounted.clear();
const close=await harness();await close.click('legacy-create',{group:'alex example'});close.body.forms[0].fields.set('reviewed','on');let release;close.setGate(new Promise(r=>release=r));const pending=close.submit(close.body.forms[0]);await Promise.resolve();await close.click('close');release();await pending;assert.equal(close.dialog.open,false);close.mounted.clear();
const account=await harness();await account.click('legacy-create',{group:'alex example'});account.body.forms[0].fields.set('reviewed','on');let finish;account.setGate(new Promise(r=>finish=r));const saving=account.submit(account.body.forms[0]);await Promise.resolve();account.mounted.clear();account.setActor('another');finish();await saving;assert.equal(account.dialog.open,false);assert.equal(account.directory.innerHTML,'');assert.equal(account.body.innerHTML,'');assert.equal(account.error.textContent,'');
const guarded=await harness();guarded.setReadFailure(true);await guarded.mounted.refresh();await guarded.click('legacy-link',{group:'alex example'});assert.equal(guarded.dialog.open,false);assert.equal(guarded.writes.length,0);guarded.setReadFailure(false);await guarded.mounted.refresh();guarded.setAllowed(false);await guarded.click('legacy-create',{group:'alex example'});assert.equal(guarded.dialog.open,false);assert.equal(guarded.writes.length,0);guarded.mounted.clear();
const selection=await harness();await selection.click('legacy-link',{group:'alex example'});const sf=selection.body.forms[0];sf.fields.set('player_id','existing');sf.fields.set('reviewed','on');sf.fields.delete('games');await selection.submit(sf);assert.equal(selection.writes.length,0);assert.match(selection.error.textContent,/Select one assignment/);selection.mounted.clear();
// Execute the actual Lineups removal handler: it must refresh the mounted directory now,
// even though old saved drafts still refer to the removed TEMP identity.
const removedUI=await harness();let removeClick,localRefreshes=0;
const admin=fs.readFileSync('admin.html','utf8'),removeSource=admin.match(/    list\.querySelectorAll\("\[data-temp-remove\]"\)\.forEach\(btn=>btn\.addEventListener\("click",async\(\)=>\{[\s\S]*?\n    \}\)\);/)[0];
const removeContext=vm.createContext({
 list:{querySelectorAll:()=>[{dataset:{tempRemove:'t1'},addEventListener:(_,fn)=>removeClick=fn}]},
 window:{SKORPortalCanWrite:()=>true,SKORGuestProfiles:{captain:removedUI.mounted}},
 matchTempPlayers:[{temp_id:'t1',name:'Fixture'}],confirm:()=>true,
 sbClient:()=>({from:()=>({update:()=>({eq:async()=>{const t=removedUI.snapshot.legacy.find(t=>t.id==='t1');t.active=false;t.has_usage=true;t.history_eligible=false;return {error:null};}})})}),
 removePlayerEverywhere(){},persistDraft(){},resetTempPlayerForm(){},refreshTempPlayers:async()=>localRefreshes++,markStatus(){},Date,
});
vm.runInContext(removeSource,removeContext);await removeClick();assert.equal(localRefreshes,1);assert.match(removedUI.directory.innerHTML,/2 saved game assignments awaiting linking/);assert.match(removedUI.directory.innerHTML,/1 saved game/);assert.match(removedUI.directory.innerHTML,/No match participation recorded/);removedUI.mounted.clear();
const css=fs.readFileSync('guest-profiles.css','utf8');assert.match(css,/gp-history-actions button\{min-height:44px/);assert.match(css,/@media\(max-width:560px\)/);assert.match(css,/:focus-visible/);
new vm.Script(source);
console.log('Guest history: player-level atomic create/link, unique saved games, removed/used archives, no invented attendance, exact retries and stale/account/dialog/viewer guards passed.');
