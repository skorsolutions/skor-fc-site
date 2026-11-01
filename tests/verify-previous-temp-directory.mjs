import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('guest-profiles.js','utf8'),dues=fs.readFileSync('team-dues.js','utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const ctx=vm.createContext({crypto:webcrypto,Intl,Date,Map,Set,BigInt,Promise,encodeURIComponent,setTimeout:()=>1,clearTimeout(){}});vm.runInContext(dues,ctx);vm.runInContext(source,ctx);
const api=ctx.SKORGuestProfiles;
const appearances=[{id:'t1',match_id:'m1',name:'Alex Example',number:18},{id:'t2',match_id:'m2',name:' ALEX  EXAMPLE ',number:22},{id:'t3',match_id:'m1',name:'Different Person',number:null},{id:'t4',match_id:'m3',name:'<img src=x onerror=alert(1)>',number:44}];
const initial=JSON.stringify(appearances),groups=api.legacyGroups(appearances);
assert.equal(groups.length,3);assert.equal(groups.find(g=>g.key==='alex example').appearances.length,2);assert.equal(JSON.stringify(appearances),initial);
assert.equal(api.legacyGroups([...appearances,appearances[0],{name:'No identity'},{id:'invalid'}]).reduce((n,g)=>n+g.appearances.length,0),4);
const html=api.legacyDirectoryMarkup({legacy:appearances},id=>'Game '+id);
assert.equal((html.match(/data-gp="legacy-create"/g)||[]).length,4);assert.equal((html.match(/data-gp="legacy-link"/g)||[]).length,4);assert.match(html,/Jersey TBD/);assert.match(html,/Match jersey #18/);assert.match(html,/Game m1/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
assert.match(api.legacyDirectoryMarkup({legacy:[]},()=>''),/All saved TEMP appearances are linked/);
assert.equal((api.legacyDirectoryMarkup({legacy:appearances},()=>'',true).match(/ disabled/g)||[]).length,8);
const choices=api.legacyProfileChoices({profiles:[{player_id:'ok',enabled:true,full_name:'Alex',is_guest:true},{player_id:'off',enabled:false,full_name:'Disabled'},{player_id:'taken',enabled:true,full_name:'Other',is_guest:false},{player_id:'regular',enabled:true,full_name:'Promoted',is_guest:false}],links:[{player_id:'taken',match_id:'m1',temp_id:'other'}]},appearances[0],'regular');
assert.match(choices,/value="regular" selected/);assert.match(choices,/Regular roster/);assert.doesNotMatch(choices,/value="off"|value="taken"/);

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
      for(const i of m[2].matchAll(/<input\b([^>]*)>/g)){const x=attrs(i[1]);if(x.name&&(x.type!=='checkbox'||i[1].includes('checked')))fields.set(x.name,x.value||'');}
      for(const select of m[2].matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)){const name=attrs(select[1]).name,opts=[...select[2].matchAll(/<option\b([^>]*)>/g)],chosen=opts.find(x=>x[1].includes('selected'))||opts[0];fields.set(name,chosen?attrs(chosen[1]).value||'':'');}
      const button={disabled:false,isConnected:true};this.forms.push({id:a.id,dataset,fields,isConnected:true,querySelector:()=>button,button});
    }
  }
  get innerHTML(){return this.markup||'';}
}
class FormDataMock{constructor(f){this.fields=new Map(f.fields);}get(k){return this.fields.get(k)??null;}has(k){return this.fields.has(k);}[Symbol.iterator](){return this.fields[Symbol.iterator]();}}
async function harness(){
  const directory=new Element(),body=new Body(),error=new Element(),dialog=new Element(),regular=new Element();dialog.open=false;
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};dialog.querySelector=sel=>sel==='[data-gp-dialog-body]'?body:sel==='[data-gp-error]'?error:body.forms.find(f=>'#'+f.id===sel);
  const nodes={guestDirectory:directory,guestCaptainDialog:dialog,regularRosterWorkspace:regular};
  const doc={hidden:false,getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],addEventListener(){}};
  const win={addEventListener(){}};let actor='captain',allowed=true,readFailure=false,writeFailure=false,gate=null;
  const records={summary:{present_count:0,goals:0,assists:0,motm:0,absent_count:0,excused_count:0,unmarked_count:0,yellow_cards:0,red_cards:0}};
  const snapshot={as_of:new Date().toISOString(),profiles:[{player_id:'existing',player_key:'existing',full_name:'Known Profile',is_guest:true,enabled:true,record:structuredClone(records)}],links:[],event_participants:[],legacy:structuredClone(appearances.slice(0,3)),fee_settings:[],entries:[],ledger:{groups:[],matches:[{id:'m1',kickoff:'2026-10-01T18:00:00Z',label:'SKOR vs A'},{id:'m2',kickoff:'2026-10-08T18:00:00Z',label:'SKOR vs B'}],roster:[],scenarios:[],group_matches:[],members:[]}};
  const writes=[],receipts=new Map(),changes=[];
  const client={auth:{getSession:async()=>({data:{session:{user:{id:actor}}}})},rpc:async(name,args)=>{
    if(name==='get_guest_console'){if(readFailure)return {error:{message:'Refresh unavailable'}};return {data:structuredClone(snapshot)};}
    assert.equal(name,'manage_guest_profile');const {p_action:action,p}=args;writes.push({action,p:structuredClone(p)});
    if(gate)await gate;
    if(!receipts.has(p.request_id)){
      if(action==='create')snapshot.profiles.push({player_id:p.player_id,player_key:p.player_id,full_name:p.full_name,is_guest:true,enabled:true,record:structuredClone(records)});
      else if(action==='bind_game'){
        assert.equal(p.reviewed,true);assert.ok(!Object.hasOwn(p,'number'),'historical number and inventory are not edited');
        const temp=snapshot.legacy.find(t=>t.id===p.temp_id);if(!temp)return {error:{message:'Already linked'}};
        snapshot.links.push({player_id:p.player_id,match_id:p.match_id,temp_id:p.temp_id,number:temp.number,active:true});snapshot.legacy=snapshot.legacy.filter(t=>t.id!==p.temp_id);
        snapshot.profiles.find(x=>x.player_id===p.player_id).record.summary.goals++;
      }
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
const h=await harness();assert.match(h.directory.innerHTML,/Previous TEMP players/);assert.match(h.directory.innerHTML,/3 saved TEMP appearances awaiting linking/);assert.match(h.directory.innerHTML,/Alex Example/);assert.match(h.directory.innerHTML,/Known Profile/);assert.equal(h.writes.length,0,'opening the directory never creates profiles/links');
// Name group disclosure survives polling and all existing profile filters.
let group=h.directory.details.find(d=>d.dataset.gpKey.startsWith('legacy-alex'));group.open=true;await h.mounted.refresh();assert.equal(h.directory.details.find(d=>d.dataset.gpKey===group.dataset.gpKey).open,true);
await h.directory.events.change[0]({target:{value:'promoted',matches:s=>s==='[data-gp-filter]'}});assert.match(h.directory.innerHTML,/Previous TEMP players/);assert.match(h.directory.innerHTML,/No profiles in this view/);
await h.click('legacy-create',{temp:'t1'});assert.match(h.body.innerHTML,/value="Alex Example"/);assert.match(h.body.innerHTML,/2026-10-01/);assert.match(h.body.innerHTML,/Match jersey #18/);
const create=h.body.forms[0];await h.submit(create);assert.equal(h.writes[0].action,'create');assert.equal(h.snapshot.profiles.length,2);assert.equal(h.snapshot.legacy.length,3,'creating the profile does not silently link history');
assert.equal(h.body.forms[0].id,'gpLegacy');const createdId=h.writes[0].p.player_id,link=h.body.forms[0];assert.equal(link.fields.get('player_id'),createdId);assert.equal(link.fields.has('reviewed'),false);
await h.submit(link);assert.equal(h.writes.length,1);assert.match(h.error.textContent,/Confirm/);
link.fields.set('reviewed','on');await h.submit(link);assert.equal(h.writes.at(-1).action,'bind_game');assert.equal(h.snapshot.legacy.length,2);assert.equal(h.snapshot.links[0].temp_id,'t1');assert.equal(h.snapshot.links[0].number,18);assert.equal(h.dialog.open,false);assert.equal(h.directory.details.find(d=>d.dataset.gpKey==='profile-'+createdId).open,true);
await h.click('legacy-link',{temp:'t2'});const second=h.body.forms[0];second.fields.set('player_id',createdId);second.fields.set('reviewed','on');await h.submit(second);assert.equal(h.snapshot.profiles.length,2,'another appearance reuses the profile');assert.equal(h.snapshot.links.length,2);assert.equal(h.snapshot.links[1].number,22);assert.equal(h.snapshot.profiles.find(p=>p.player_id===createdId).record.summary.goals,2);assert.equal(h.snapshot.profiles.find(p=>p.player_id==='existing').record.summary.goals,0);
assert.match(h.directory.innerHTML,/data-gp="promote"/);assert.ok(h.changes.some(c=>c.identityChanged));
// Existing profile-card linking has the same explicit review validation.
await h.click('legacy',{player:'existing'});assert.match(h.body.innerHTML,/name="reviewed" required/);const oldLink=h.body.forms[0];await h.submit(oldLink);assert.match(h.error.textContent,/Confirm/);
h.mounted.clear();assert.equal(h.directory.innerHTML,'');

// A lost create response retries the same identity/request, then opens review without duplicates.
const retry=await harness();await retry.click('legacy-create',{temp:'t1'});retry.setWriteFailure(true);const originalForm=retry.body.forms[0];await retry.submit(originalForm);assert.equal(retry.snapshot.profiles.length,2);assert.match(retry.error.textContent,/Response lost/);
await retry.mounted.refresh();await retry.submit(originalForm);assert.equal(retry.snapshot.profiles.length,2);assert.equal(retry.writes[0].p.request_id,retry.writes[1].p.request_id);assert.equal(retry.body.forms[0].id,'gpLegacy');retry.mounted.clear();

// Closing/switching the dialog or changing account during save never opens another actor's review.
const close=await harness();await close.click('legacy-create',{temp:'t1'});let release;close.setGate(new Promise(r=>release=r));const pending=close.submit(close.body.forms[0]);await Promise.resolve();await close.click('close');release();await pending;assert.equal(close.dialog.open,false);close.mounted.clear();
const account=await harness();await account.click('legacy-create',{temp:'t1'});let finish;account.setGate(new Promise(r=>finish=r));const saving=account.submit(account.body.forms[0]);await Promise.resolve();account.mounted.clear();account.setActor('another');finish();await saving;assert.equal(account.dialog.open,false);assert.equal(account.directory.innerHTML,'');assert.equal(account.body.innerHTML,'');assert.equal(account.error.textContent,'');
// Stale snapshots and viewer access cannot initiate a link/create workflow.
const guarded=await harness();guarded.setReadFailure(true);await guarded.mounted.refresh();await guarded.click('legacy-link',{temp:'t1'});assert.equal(guarded.dialog.open,false);assert.equal(guarded.writes.length,0);guarded.setReadFailure(false);await guarded.mounted.refresh();guarded.setAllowed(false);await guarded.click('legacy-create',{temp:'t1'});assert.equal(guarded.dialog.open,false);assert.equal(guarded.writes.length,0);guarded.mounted.clear();
const css=fs.readFileSync('guest-profiles.css','utf8');assert.match(css,/\.gp-legacy-appearance button\{min-height:44px/);assert.match(css,/@media\(max-width:560px\)\{\.gp-legacy-appearance/);assert.match(css,/:focus-visible/);
new vm.Script(source);
console.log('Previous TEMP directory: visible names/appearances, explicit create/link, same-profile history, preserved numbers, retries, stale/account/dialog/viewer guards and mobile controls passed.');
