import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const directory=require('../temp-player-directory.js');
const refCard=require('../ref-game-card.js');
const admin=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');

assert.equal(directory.isFullName('First'),false);
assert.equal(directory.isFullName('   '),false);
assert.equal(directory.isFullName('First Last'),true);
assert.equal(directory.isFullName('First '+ 'x'.repeat(80)),false);
assert.deepEqual(directory.namesFromRows([
  {display_name:'  Avery   Example  ',jersey_number:7},
  {display_name:'avery example',active:false},
  {display_name:'Blake Sample',jersey_number:99},
  {display_name:'FirstOnly'},
]),['Avery Example','Blake Sample']);

const calls=[];
const client={from(table){
  assert.equal(table,'match_temp_players');
  return {select(columns){
    assert.equal(columns,'id,display_name','the name directory must never retrieve a saved jersey');
    return {order(column){assert.equal(column,'id');return {async range(start,end){
      calls.push([start,end]);
      return {data:start===0?Array.from({length:500},()=>({display_name:'Avery Example'})):[{display_name:'Blake Sample'}],error:null};
    }}}};
  }};
}};
assert.deepEqual(await directory.loadNames(client),['Avery Example','Blake Sample']);
assert.deepEqual(calls,[[0,499],[500,999]],'history beyond a single API page must remain searchable');
await assert.rejects(directory.loadNames({from(){return {select(){return {order(){return {range:async()=>({error:new Error('not authorized')})}}}}}}}),/not authorized/);

const elements={tempPlayerName:{value:''},tempPlayerJersey:{value:'old-jersey'},tempPlayerEditId:{value:''}};
let selectHandler,saveHandler,inserted=null;
const messages=[];
const sandbox={
  window:{SKORTempDirectory:directory,SKORPortalCanWrite:()=>true,SKORJerseys:{labelFor:()=>''}},
  document:{getElementById:id=>elements[id]},
  selectedRealMatchId:()=> 'new-game',
  savedTempNameSelect:{value:'Avery Example',addEventListener:(_event,handler)=>{selectHandler=handler;}},
  saveTempPlayerBtn:{disabled:false,textContent:'Add TEMP',addEventListener:(_event,handler)=>{saveHandler=handler;}},
  markStatus:(message)=>messages.push(message),
  renderTempJerseyOptions:()=>{},
  refreshTempNameDirectory:()=>{},
  resetTempPlayerForm:()=>{elements.tempPlayerName.value='';elements.tempPlayerJersey.value='';},
  refreshTempPlayers:async()=>{},
  sbClient:()=>({auth:{getUser:async()=>({data:{user:{id:'captain-id'}}})},from:table=>({
    insert:async payload=>{assert.equal(table,'match_temp_players');inserted=payload;return {error:null};}
  })}),
  Date,
};
vm.createContext(sandbox);
const selection=admin.match(/if\(savedTempNameSelect\)savedTempNameSelect\.addEventListener\("change",\(\)=>\{[\s\S]*?\n  \}\);/)[0];
vm.runInContext(selection,sandbox);
selectHandler();
assert.equal(elements.tempPlayerName.value,'Avery Example');
assert.equal(elements.tempPlayerJersey.value,'','a previous name must not carry forward any jersey selection');
elements.tempPlayerJersey.value='today-jersey';
const save=admin.match(/if\(saveTempPlayerBtn\)saveTempPlayerBtn\.addEventListener\("click",async\(\)=>\{[\s\S]*?\n  \}\);/)[0];
vm.runInContext(save,sandbox);
await saveHandler();
assert.equal(inserted.display_name,'Avery Example');
assert.equal(inserted.match_id,'new-game','reusing a name must create a new match identity');
assert.equal(inserted.jersey_inventory_id,'today-jersey');
assert.equal(inserted.jersey_number,null,'the current inventory assignment determines the number');
assert.equal(inserted.created_by,'captain-id');

inserted=null;elements.tempPlayerName.value='FirstOnly';
await saveHandler();
assert.equal(inserted,null,'new first-name-only players must not be saved as PDF-ready identities');
assert.match(messages.at(-1),/first and last name/);
elements.tempPlayerName.value='Avery Example';sandbox.window.SKORPortalCanWrite=()=>false;
await saveHandler();
assert.equal(inserted,null,'view-only users cannot create saved player names');
sandbox.window.SKORPortalCanWrite=()=>true;

const card=refCard.buildCardData({
  match:{id:'new-game',kickoff:'2026-10-18T19:00:00Z',home_team:'SKOR FC',away_team:'Example FC'},
  state:{formation:'4-2-3-1',slots:{GK:'temp:new-id'},bench:[]},
  roster:[{player_key:'temp:new-id',id:'temp:new-id',number:23,name:'Avery Example',fullName:'Avery Example',temp:true}],
});
assert.equal(card.players[0].name,'Avery Example');
assert.equal(card.players[0].number,23);
assert.match(refCard.buildCardMarkup(card),/Avery Example/);

for(const [i,script] of [...admin.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(script[1],{filename:'admin-inline-'+i});
const ids=[...admin.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'all HTML IDs must remain unique');
assert.match(admin,/\.temp-saved-names select\{width:100%;min-width:0;max-width:100%;min-height:44px\}/);
assert.match(admin,/temp-player-directory\.js\?v=58\.3/);
console.log('Saved TEMP names: pagination, identity reuse, match-specific jerseys, full-name validation, permissions, referee output and JavaScript checks passed.');
