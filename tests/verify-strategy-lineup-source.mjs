import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../strategy-lineup-source.js');
const source={matchId:'game-a',state:{formation:'Freeform / Custom',freeform:{keeper:{x:50,y:92},'temp:saved-a':{x:20,y:50},archived:{x:70,y:60}},keeperPlan:{}},roster:[{player_key:'keeper',name:'Fixture keeper',number:1,position:'Keeper'},{player_key:'temp:other-game',number:90,temp:true}]};
const original=JSON.stringify(source),calls=[];
function client({foreign=false,missing=false,error=false}={}){return {from(table){const filters=[];return {
 select(columns){assert.ok(!columns.includes('email'));return this;},eq(k,v){filters.push([k,v]);return this;},in(k,v){filters.push([k,v]);return this;},
 then(resolve,reject){calls.push({table,filters});const rows=table==='team_roster'?[{player_key:'archived',full_name:'Archived Fixture',jersey_number:8,position:'Defence',active:false}]:[{id:'saved-a',match_id:foreign?'game-b':'game-a',display_name:'Guest Fixture',jersey_number:12,active:false}];return Promise.resolve({data:missing?[]:rows,error:error?{message:'access denied'}:null}).then(resolve,reject);}
 };}};}
const resolved=await S.resolve(source,client());
assert.equal(JSON.stringify(source),original);assert.equal(resolved.roster.length,3);
assert.ok(resolved.roster.some(p=>p.player_key==='archived'),'explicit saved inactive identities remain resolvable');
assert.ok(resolved.roster.some(p=>p.player_key==='temp:saved-a'&&p.number===12&&p.temp));
assert.ok(!resolved.roster.some(p=>p.player_key==='temp:other-game'));
assert.deepEqual(calls.find(c=>c.table==='match_temp_players').filters,[['match_id','game-a'],['id',['saved-a']]]);
assert.deepEqual(calls.find(c=>c.table==='team_roster').filters,[['player_key',['archived']]]);
const home=S.fieldIds(source.state).map(id=>({id}));assert.equal(S.keeperId(resolved,home),'keeper');
assert.equal(S.keeperId({...resolved,roster:[...resolved.roster,{player_key:'archived',position:'Keeper'}]},home),undefined,'ambiguous keepers are never guessed');
assert.equal(S.keeperId({...resolved,state:{...resolved.state,keeperPlan:{assignments:{'temp:saved-a':{role:'starting_temp'}}}}},home),'temp:saved-a','explicit assignment wins');
const regular={state:{formation:'4-3-3',slots:{GK:'keeper'}},roster:source.roster};
assert.equal((await S.resolve(regular,null)).roster.length,1,'an already loaded regular lineup needs no backend call');
assert.equal(S.keeperId(regular,[{id:'keeper'}]),'keeper');
await assert.rejects(S.resolve(source,client({foreign:true})),/could not be loaded for this game/);
await assert.rejects(S.resolve(source,client({missing:true})),/could not be loaded/);
await assert.rejects(S.resolve(source,client({error:true})),/access denied/);
await assert.rejects(S.resolve({...source,matchId:null},client()),/saved game lineup/);
await assert.rejects(S.resolve(source,null),/Connect to Supabase/);
await assert.rejects(S.resolve({state:{formation:'4-4-2',slots:{GK:'a',LB:'a'}},roster:[]},client()),/same player/);
console.log('Strategy source resolution verified: exact game/TEMP keys, stale-cache removal, saved inactive players, clear access/missing errors, immutable source and unambiguous existing keeper detection.');
