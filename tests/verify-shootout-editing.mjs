import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const c=vm.createContext({crypto:webcrypto});vm.runInContext(fs.readFileSync('match-tiebreaks.js','utf8'),c);
const api=c.SKORTiebreaks,clone=x=>JSON.parse(JSON.stringify(x));
const people=[{player_key:'p7',name:'Fixture Player',number:7},{player_key:'temp:fixture',name:'Fixture Guest',number:66,is_temp:true},{player_key:'pending',name:'Pending',number:null}];
assert.equal(api.playerLabel(people[0]),'#7 Fixture Player');assert.equal(api.playerLabel(people[1]),'#66 Fixture Guest · TEMP');assert.equal(api.playerLabel(people[2]),'Jersey TBD Pending');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',listeners:{},querySelector:()=>null,addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);}
let stored={match_id:'fixture',revision:0,extra_minutes:5,golden_goal:true,initial_kicks:5,first_team:'skor',shots:[],completed:false,participants:people};
let writes=[];
const client={auth:{getSession:async()=>({data:{session:{user:{id:'cap'}}}})},rpc:async(name,p)=>{
 if(name==='get_match_tiebreak')return {data:clone(stored)};
 api.summary(p.p_payload.shots,p.p_payload.initial_kicks,p.p_payload.first_team);
 writes.push(clone(p));stored={...stored,...clone(p.p_payload),revision:stored.revision+1};return {data:{ok:true,revision:stored.revision}};
}};
const ui=api.mount({client,getContext:()=>({userId:'cap',canUse:true,matchId:'fixture'}),doc:{getElementById:node}});await ui.load();
const click=tb=>node('matchTiebreaks').listeners.click({target:{closest:()=>({disabled:false,dataset:{tb}})}});
const change=(dataset,value,type='select-one')=>node('matchTiebreaks').listeners.change({target:{dataset,value,type,checked:value}});
// Exact reported score: five opening rounds, 4-2, not six added match goals.
for(const outcome of ['missed','missed','scored','missed','scored','scored','scored','scored','scored'])click(outcome);
let sum=api.summary(ui.state().shots);assert.equal(sum.skor,4);assert.equal(sum.opponent,2);assert.equal(sum.winner,'skor');
const ids=ui.state().shots.map(s=>s.id);change({tbPlayer:'0'},'p7');change({tbPlayer:'2'},'p7');change({tbPlayer:'4'},'temp:fixture');
assert(node('matchTiebreaks').innerHTML.includes('#7 Fixture Player'));assert(node('matchTiebreaks').innerHTML.includes('#66 Fixture Guest'));
assert(!/data-tb-setting="initial_kicks"[^>]*disabled/.test(node('matchTiebreaks').innerHTML),'starting rounds remain editable with existing kicks');
change({tbSetting:'initial_kicks'},'6','number');assert.equal(ui.state().initial_kicks,6);assert.equal(api.summary(ui.state().shots,6).winner,null,'increasing initial rounds unlocks remaining legitimate kicks');
change({tbSetting:'initial_kicks'},'5','number');assert.equal(api.summary(ui.state().shots).winner,'skor');assert.deepEqual(clone(ui.state().shots.map(s=>s.id)),clone(ids));
// Correcting an early result can make a later kick invalid until another result is corrected.
change({tbShot:'7'},'missed');change({tbShot:'5'},'missed');
assert.equal(ui.state().shots[5].outcome,'missed','invalid intermediate corrections are retained, not silently rolled back');
assert(api.review(ui.state().shots).error);assert(node('matchTiebreaks').innerHTML.includes('your edits are kept'));assert(/data-tb="save" disabled/.test(node('matchTiebreaks').innerHTML));
const before=writes.length;assert.equal(await ui.save(),false);assert.equal(writes.length,before,'invalid drafts never reach save RPC');
change({tbShot:'5'},'scored');assert(api.review(ui.state().shots).error);
change({tbShot:'7'},'scored');assert.equal(api.review(ui.state().shots).error,null);
assert.equal(api.summary(ui.state().shots).skor,4);assert.equal(api.summary(ui.state().shots).opponent,2);
change({tbSetting:'completed'},true,'checkbox');assert.equal(await ui.save(),true);assert.equal(stored.completed,true);assert.deepEqual(stored.shots.map(s=>s.id),clone(ids));
const stats=clone(api.playerStats(stored.shots,people));assert.equal(stats.find(p=>p.player_key==='p7').taken,2);assert.equal(stats.find(p=>p.player_key==='p7').scored,1);assert.equal(stats.find(p=>p.player_key==='temp:fixture').scored,1);
assert.equal(stats.find(p=>p.player_key==='pending'),undefined,'unknown kicks cannot be credited by matching names or numbers');
await ui.load(true);assert.equal(ui.state().shots.length,9);assert.equal(api.summary(ui.state().shots).opponent,2);
// Five each is not a hard cap: sudden death continues with paired kicks.
stored={...stored,shots:[],completed:false};await ui.load(true);for(let i=0;i<10;i++)click('scored');assert.equal(api.summary(ui.state().shots).sudden_death,true);click('scored');assert.equal(api.summary(ui.state().shots).winner,null);click('missed');assert.equal(api.summary(ui.state().shots).skor,6);assert.equal(api.summary(ui.state().shots).winner,'skor');
change({tbSetting:'initial_kicks'},'0','number');assert(api.review(ui.state().shots,0).error);assert.equal(await ui.save(),false);change({tbSetting:'initial_kicks'},'5','number');assert.equal(api.review(ui.state().shots,5).error,null);
console.log('Shootout editing: numbered stable kickers, 4-2 save/reopen, editable opening rounds, retained intermediate corrections, invalid-save guards, per-player scored/taken and sudden death beyond five pass.');
