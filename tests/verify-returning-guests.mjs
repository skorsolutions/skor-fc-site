import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('guest-profiles.js','utf8'),ctx=vm.createContext({crypto:webcrypto,Intl,Date,Map,Set,BigInt,Promise,encodeURIComponent,decodeURIComponent,setTimeout:()=>1,clearTimeout(){}});
vm.runInContext(fs.readFileSync('team-dues.js','utf8'),ctx);vm.runInContext(source,ctx);const api=ctx.SKORGuestProfiles,plain=x=>JSON.parse(JSON.stringify(x));
const row=(id,mid,name,eligible=true)=>({id,match_id:mid,name,number:22,active:eligible,history_eligible:eligible,has_usage:true,updated_at:'2026-10-01T10:00:00Z'});
const key=name=>'saved:'+encodeURIComponent(name.toLowerCase());
function snapshot(legacy){return {as_of:new Date().toISOString(),history_version:1,participation_version:1,profiles:[{player_id:'known',full_name:'Known Guest',is_guest:true,enabled:true},{player_id:'off',full_name:'Disabled Guest',is_guest:true,enabled:false},{player_id:'regular',full_name:'Promoted Guest',is_guest:false,enabled:true}],links:[],event_participants:[],legacy,fee_settings:[],entries:[],ledger:{matches:['old','unused','game','another'].map(id=>({id,label:'Fixture '+id,kickoff:'2026-10-01T10:00:00Z'})),groups:[],roster:[],members:[],group_matches:[]}};}
async function harness(rows){
 let s=snapshot(rows),actor='captain',lose=null,gate=null,createdTemps=0;const calls=[],receipts=new Map();
 const client={auth:{getSession:async()=>({data:{session:{user:{id:actor}}}})},rpc:async(name,args)=>{
  if(name==='get_guest_console')return {data:structuredClone(s)};
  const {p_action:action,p}=args;calls.push({name,action,p:structuredClone(p)});if(gate)await gate;
  const receipt=receipts.get(p.request_id);if(receipt)assert.deepEqual(receipt,{name,action,p:plain(p)},'retry identity and payload remain exact');
  else{
   if(action==='create'||action==='import')s.profiles.push({player_id:p.player_id,full_name:p.full_name,is_guest:true,enabled:true,jersey_number:null});
   const bind=(tid,mid)=>{const t=s.legacy.find(t=>t.id===tid);assert(t);s.links.push({player_id:p.player_id,temp_id:tid,match_id:mid,number:t.number,inventory_id:null,active:true,temp_active:t.active});s.legacy=s.legacy.filter(t=>t.id!==tid);};
   if(action==='import'){assert.equal(p.reviewed,true);for(const g of p.games){assert(s.legacy.find(t=>t.id===g.temp_id)?.history_eligible);bind(g.temp_id,g.match_id);}}
   if(action==='bind_game'){assert.equal(p.reviewed,true);bind(p.temp_id,p.match_id);}
   if(action==='assign'){
    let l=s.links.find(l=>l.player_id===p.player_id&&l.match_id===p.match_id);
    if(!l){l={player_id:p.player_id,match_id:p.match_id,temp_id:'new-'+(++createdTemps),active:true,temp_active:true};s.links.push(l);}
    l.active=true;l.temp_active=true;
    if(Object.hasOwn(p,'inventory_id')){l.inventory_id=p.inventory_id;l.number=p.inventory_id?66:null;}else if(Object.hasOwn(p,'number'))l.number=p.number===''?null:Number(p.number);
   }
   receipts.set(p.request_id,{name,action,p:structuredClone(p)});
  }
  if(lose===action){lose=null;return {error:new Error('Response lost')};}return {data:{ok:true,player_id:p.player_id}};
 }};
 const c=api.createController({client,schedule:()=>1,cancel(){}}),flow=api.createReturningAssignment(c);await c.start(actor);
 return {s,c,flow,calls,receipts,created:()=>createdTemps,setLose:x=>lose=x,setGate:x=>gate=x,setActor:x=>actor=x};
}
const choices=plain(api.returningChoices(snapshot([row('a','old','Previous Person'),row('b','unused','Never Selected Person',false),row('c','old','Known Guest')])));
assert.deepEqual(choices.map(c=>c.name),['Known Guest','Never Selected Person','Previous Person']);
assert(!choices.some(c=>['Disabled Guest','Promoted Guest'].includes(c.name)));assert.equal(choices.filter(c=>c.name==='Known Guest').length,1);
assert.match(api.returningOptions(snapshot([row('bad','old','<img src=x onerror=alert(1)>')])),/&lt;img/);assert.doesNotMatch(api.returningOptions(snapshot([row('bad','old','<img src=x onerror=alert(1)>')])),/<img/);
const h=await harness([row('a','old','Previous Person'),row('b','unused','Previous Person',false)]);
await assert.rejects(h.flow.assign({selection:key('Previous Person'),match_id:'game',number:'66'}),/Confirm/);assert.equal(h.calls.length,0);
const result=await h.flow.assign({selection:key('Previous Person'),match_id:'game',number:'66',reviewed:true});
assert.equal(h.s.profiles.filter(p=>p.full_name==='Previous Person').length,1);assert.equal(h.s.links.length,3);assert.equal(h.s.links.find(l=>l.match_id==='game').number,66);assert.equal(h.s.links.find(l=>l.match_id==='old').number,22);assert.equal(h.s.links.find(l=>l.match_id==='unused').temp_active,false);
assert.deepEqual(h.calls.map(c=>c.action),['import','bind_game','assign']);assert(h.calls.every(c=>!['attendance','rsvp'].includes(c.action)),'identity reuse never writes attendance or RSVP');
await h.flow.assign({selection:result.player_id,match_id:'another',number:'18'});assert.equal(h.s.profiles.filter(p=>p.full_name==='Previous Person').length,1);assert.equal(h.calls.at(-1).action,'assign');assert.equal(h.s.links.find(l=>l.match_id==='another').number,18);h.c.clear();
// Created-only/unused historical names are reusable identities without importing fake game history.
const unused=await harness([row('u','unused','Unused Person',false)]);await unused.flow.assign({selection:key('Unused Person'),match_id:'game',number:'66',reviewed:true});assert.deepEqual(unused.calls.map(c=>c.action),['create','bind_game','assign']);assert.equal(unused.s.links.find(l=>l.match_id==='unused').temp_active,false);unused.c.clear();
// An existing unselected entry in this same game is reused, not inserted again.
const current=await harness([row('same','game','Current Person',false)]);await current.flow.assign({selection:key('Current Person'),match_id:'game',number:'66',reviewed:true});assert.equal(current.created(),0);assert.equal(current.s.links[0].temp_id,'same');assert.equal(current.s.links[0].number,66);current.c.clear();
// Lost identity and assignment responses recover with exact receipts, including when the old choice disappears.
for(const stage of ['import','assign']){
 const x=await harness([row('a','old','Retry Person')]);x.setLose(stage);const input={selection:key('Retry Person'),match_id:'game',number:'66',reviewed:true};await assert.rejects(x.flow.assign(input),/Response lost/);await x.c.refresh();await x.flow.assign(input);assert.equal(x.s.profiles.filter(p=>p.full_name==='Retry Person').length,1);assert.equal(x.created(),1);const retries=x.calls.filter(c=>c.action===stage);assert.equal(retries.length,2);assert.deepEqual(retries[0].p,retries[1].p);x.c.clear();
}
const duplicate=await harness([row('a','game','Duplicate Person'),row('b','game','Duplicate Person')]);await assert.rejects(duplicate.flow.assign({selection:key('Duplicate Person'),match_id:'game',number:'66',reviewed:true}),/duplicate/);assert.equal(duplicate.calls.length,0);duplicate.c.clear();
const short=await harness([row('a','unused','Fixture',false)]);await assert.rejects(short.flow.assign({selection:key('Fixture'),match_id:'game',number:'66',reviewed:true}),/full name once/);await short.flow.assign({selection:key('Fixture'),match_id:'game',number:'66',reviewed:true,full_name:'Fixture Fullname'});assert.equal(short.s.profiles.at(-1).full_name,'Fixture Fullname');short.c.clear();
// A verified completed assignment must not reuse an old receipt after a later removal.
const readd=await harness([]);await readd.flow.assign({selection:'known',match_id:'game',number:'66'});const original=readd.s.links[0].temp_id;readd.s.links[0].active=false;readd.s.links[0].temp_active=false;await readd.c.refresh();await readd.flow.assign({selection:'known',match_id:'game',number:'66'});assert.notEqual(readd.calls[0].p.request_id,readd.calls[1].p.request_id);assert.equal(readd.s.links[0].temp_id,original);assert.equal(readd.s.links[0].temp_active,true);assert.equal(readd.created(),1);readd.c.clear();
// Explicit number-only reassignment clears only this game's inventory link.
const kit=await harness([]);kit.s.links.push({player_id:'known',match_id:'game',temp_id:'existing',inventory_id:'old-kit',number:22});await kit.c.refresh();await kit.flow.assign({selection:'known',match_id:'game',inventory_id:null,number:'66'});assert.equal(kit.s.links[0].inventory_id,null);assert.equal(kit.s.links[0].number,66);assert.equal(kit.s.links[0].temp_id,'existing');assert.equal(kit.created(),0);assert.equal(kit.calls.length,2);kit.c.clear();
// Account changes cancel remaining stages and discard identity/retry caches.
const changed=await harness([row('a','old','Account Person')]);let finish;changed.setGate(new Promise(r=>finish=r));const pending=changed.flow.assign({selection:key('Account Person'),match_id:'game',number:'66',reviewed:true});await Promise.resolve();await Promise.resolve();changed.c.clear();changed.flow.clear();changed.setActor('other');finish();await assert.rejects(pending,/Account changed/);assert(!changed.calls.some(c=>c.action==='assign'));
console.log('Returning guests: previous/unused names, one reusable identity, reviewed aliases, same-game reuse, separate jerseys, no RSVP/attendance writes, exact lost-response retries, duplicate/short-name guards and account isolation passed.');
