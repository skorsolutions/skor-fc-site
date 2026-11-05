import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as gifenc from '../vendor/gifenc/index.js';
const require=createRequire(import.meta.url),A=require('../strategy-attack-defense.js'),R=require('../strategy-reuse.js');
const S=require('../strategy-lineup-source.js');
const K=require('../keeper-plan.js'),J=require('../match-jerseys.js'),M=require('../lineup-marker.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),code=read('strategy.js'),html=read('admin.html');
const plain=v=>JSON.parse(JSON.stringify(v));
const formations=plain(vm.runInNewContext('('+code.split('const HOME_FORMATIONS=')[1].split('  const TYPE_LABELS=')[0].trim().replace(/;$/,'')+')'));
let serial=0;const makeId=prefix=>prefix+'-'+ ++serial;
for(const [formation,positions] of Object.entries(formations)){
  const home=positions.map(([role,x,y],i)=>({id:'p'+i,name:'Fixture '+i,number:i+1,keeperLabel:i===0?'starting keeper':'',keeperNumber:i===0?30:null,x,y}));
  const opponents=formations['4-4-2'].map(([label,x,y],i)=>({id:'opp'+i,label,x,y:100-y}));
  const before=JSON.stringify({home,opponents}),scene=A.build({home,opponents,keeperId:'p0',opponentKeeperId:'opp0',makeId});
  assert.equal(JSON.stringify({home,opponents}),before,'source lineup and opponent template stay immutable');
  assert.equal(scene.subScenes.length,3,formation);assert.ok(A.isGenerated(scene));
  const [defense,attack,back]=scene.subScenes;
  for(let i=0;i<11;i++){
    const d=defense.home[i],a=attack.home[i];
    assert.equal(d.id,home[i].id);assert.equal(a.number,home[i].number);assert.equal(a.keeperNumber,home[i].keeperNumber);
    if(i===0){assert.deepEqual(d,home[i]);assert.deepEqual(a,home[i]);}
    else{assert.ok(d.y>a.y,'SKOR advances in attack');assert.ok(Math.abs(d.x-50)<=Math.abs(a.x-50),'defense is more compact');}
    assert.equal(defense.opponents[i].id,opponents[i].id);
    if(i===0){assert.deepEqual(defense.opponents[i],opponents[i]);assert.deepEqual(attack.opponents[i],opponents[i]);}
    else assert.ok(defense.opponents[i].y>attack.opponents[i].y,'opponents attack while SKOR defends and recover while SKOR attacks');
    for(const p of [d,a,defense.opponents[i],attack.opponents[i]])assert.ok(p.x>=4&&p.x<=96&&p.y>=4&&p.y<=96);
  }
  assert.deepEqual(back.home,defense.home);assert.deepEqual(back.opponents,defense.opponents);
  defense.home[1].x=43;defense.opponents[1].y=69;defense.ball.y=71;A.syncDefense(scene);
  assert.deepEqual(back.home,defense.home);assert.equal(back.ball.y,71);
  back.home[1].x=31;A.syncDefense(scene,back);assert.equal(defense.home[1].x,31,'editing the return view also updates defense');
}
const customHome=[{id:'keeper',x:51,y:90,number:1},{id:'temp:fixture',x:18,y:73,number:12,temp:true}],customAway=[{id:'gk',label:'GK',x:50,y:8},{id:'out',label:'ST',x:45,y:70}];
const custom=A.build({home:customHome,opponents:customAway,keeperId:'keeper',opponentKeeperId:'gk',makeId});
assert.equal(custom.subScenes[1].home[1].id,'temp:fixture');assert.equal(custom.subScenes[1].home[1].temp,true);
const extended=plain(custom);extended.subScenes.splice(1,0,{...plain(extended.subScenes[1]),id:'extra-step'});
const extendedBefore=JSON.stringify(extended);A.syncDefense(extended);assert.equal(JSON.stringify(extended),extendedBefore);assert.ok(A.isGenerated(extended),'added steps remain an editable baseline without being reset');
for(const bad of [[],[...customHome,customHome[1]],[{id:'bad',x:'bad',y:10}]])assert.throws(()=>A.views(bad,'keeper'));
assert.throws(()=>A.views(customHome,null),/starting keeper/);

class Node{
  constructor(id){this.id=id;this.value=({strategyLineupSource:'current',strategyOpponentFormation:'4-4-2',strategyAnimationSpeed:'normal'})[id]||'';this.checked=true;this.hidden=false;this.disabled=false;this.dataset={};this.classList={toggle(){},add(){},remove(){}};this.handlers={};this.options=[];this.textContent='';}
  set innerHTML(value){this.markup=value;this.options=[...value.matchAll(/<option[^>]*value="([^"]*)"/g)].map(m=>({value:m[1]}));}
  get innerHTML(){return this.markup||'';}getBoundingClientRect(){return {left:0,top:0,width:1000,height:680};}querySelectorAll(){return [];}addEventListener(type,fn){this.handlers[type]=fn;}scrollIntoView(){}
}
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
const roles=formations['4-3-3'].map(p=>p[0]),game='40000000-0000-4000-8000-000000000001';
let owner='fixture-captain',canWrite=true;
const state={formation:'4-3-3',slots:Object.fromEntries(roles.map((r,i)=>[r,'p'+i])),bench:['bench'],keeperPlan:{spareNumbers:[30],assignments:{p0:{role:'starting_temp',jerseyNumber:30}}},matchJerseys:{p0:1}};
const roster=roles.map((role,i)=>({player_key:'p'+i,name:'Fixture '+i,number:i+1,position:i===0?'Keeper':'Midfield'}));
const tables={match_strategies:[],strategy_scene_bundles:[]},writes=[],rpc=[],storage=new Map(),downloads=[],rasters=[];
let readGate=null;
function from(table){let filters=[],operation='read',payload;
 const run=()=>{const rows=tables[table]||[];
  if(operation==='insert'){const record={...plain(payload),id:'50000000-0000-4000-8000-'+String(writes.length+1).padStart(12,'0'),updated_at:new Date().toISOString()};rows.push(record);writes.push({table,payload:plain(payload)});return {data:record};}
  return {data:rows.filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.map(String).includes(String(r[k])):String(r[k])===String(v)))};};
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},insert(p){operation='insert';payload=p;return q;},async single(){const r=run();return {...r,data:Array.isArray(r.data)?r.data[0]:r.data};},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]||null};},then(ok,bad){if(table==='match_temp_players'&&readGate){const gate=readGate;readGate=null;return gate.then(run).then(ok,bad);}return Promise.resolve(run()).then(ok,bad);}};return q;
}
let blockRaster=null,failRaster=false;
const window={SKORStrategySource:S,SKORAttackDefense:A,SKORStrategyReuse:R,SKORKeeperPlan:K,SKORMatchJerseys:J,SKORLineupMarker:M,SKORPortalCanWrite:()=>canWrite,
  SKORLineup:{getCaptainKey:()=>owner,getRoster:()=>plain(roster),getState:()=>plain(state),getEventKey:()=>game,getEventLabel:()=> 'Fixture game',listVariations:()=>[]},
  SKORSupabase:{from,auth:{getUser:async()=>({data:{user:{id:'60000000-0000-4000-8000-000000000001'}}})},rpc:async()=>{rpc.push(1);return {data:{}};}},dispatchEvent(){},__gifenc:gifenc,__downloads:downloads,
  async __raster(scene,frame,width,height,options){
    const svg=window.__attackHarness.exportSvgMarkup(scene,frame,options);rasters.push({frame:plain(frame),options:plain(options),svg});
    if(blockRaster){const block=blockRaster;blockRaster=null;await block;}
    if(failRaster)throw Error('Fixture raster failure');
    const rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<rgba.length;i+=4){rgba[i]=Math.round(frame.home[1].x);rgba[i+1]=Math.round(frame.opponents[1].y);rgba[i+2]=50;rgba[i+3]=255;}return rgba;
  }};
const context={window,document:{getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console:{...console,error(){}},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},Blob,prompt:()=>'Hold shape',CustomEvent:class{}};
let adapted=code.replace('await import("./vendor/gifenc/index.js")','window.__gifenc');
const rasterStart=adapted.indexOf('  async function framePixels('),rasterEnd=adapted.indexOf('  async function exportGif(',rasterStart);
adapted=adapted.slice(0,rasterStart)+'  async function framePixels(scene,frame,width,height,context){return window.__raster(scene,frame,width,height,context);}\n'+adapted.slice(rasterEnd);
const downloadStart=adapted.indexOf('  function downloadBlob('),downloadEnd=adapted.indexOf('  function svgImage(',downloadStart);
adapted=adapted.slice(0,downloadStart)+'  function downloadBlob(blob,filename){window.__downloads.push({blob,filename});}\n'+adapted.slice(downloadEnd);
adapted=adapted.replace('  window.SKORStrategy={',`  window.__attackHarness={get:()=>draft,exportGif,exportSvgMarkup,saveSharedStrategy,saveSceneBundle,loadSharedStrategy,bundleScene,normalizeDraft,sceneForStorage,restorePreviousStrategy,changeOpponentFormation,persist,beginEditing,finishEditing,cancelEditing,isEditing:()=>!!editing,pointerDown,pointerMove,pointerUp,setTool,selectStep:i=>{activeScene().activeSubSceneId=activeScene().subScenes[i].id;}};\n  window.SKORStrategy={`);
vm.runInNewContext(adapted,context);const h=window.__attackHarness;
window.SKORStrategy.init();await Promise.resolve();await Promise.resolve();
const previous=plain(h.get()),sourceBefore=JSON.stringify(state);
const first=node('strategyQuickGif').handlers.click();
assert.equal(node('strategyQuickGif').disabled,true,'one-click generation is busy before the first await');
assert.equal(await node('strategyQuickGif').handlers.click(),false,'repeat clicks cannot start competing GIF builds');
assert.equal(await first,true);assert.equal(downloads.length,1);assert.equal(rasters.length,13);
assert.equal(writes.length,0);assert.equal(rpc.length,0);assert.equal(JSON.stringify(state),sourceBefore);
let generated=h.get(),scene=generated.scenes[0];
assert.equal(generated.copyAsNew,true);assert.equal(node('strategyRestorePrevious').hidden,false);
assert.equal(scene.subScenes[0].home[0].keeperNumber,30);assert.ok(generated.source.state.slots.GK==='p0');
for(const r of rasters){assert.equal((r.svg.match(/data-kind="home"/g)||[]).length,11);assert.equal((r.svg.match(/data-kind="opponent"/g)||[]).length,11);}
assert.equal(rasters[1].frame.home[1].x>rasters[0].frame.home[1].x,false,'left-sided player widens on transition');
const bytes=new Uint8Array(await downloads[0].blob.arrayBuffer());
assert.match(new TextDecoder().decode(bytes.slice(0,6)),/^GIF8[79]a$/);assert.equal(bytes.at(-1),0x3b);
assert.ok(new TextDecoder().decode(bytes).includes('NETSCAPE2.0'),'GIF has an infinite-loop extension');
assert.equal(bytes[6]+256*bytes[7],640);assert.equal(bytes[8]+256*bytes[9],544);

// Manual changes are reused on the next click; the final defense frame stays in sync.
const lockedBefore=JSON.stringify(h.get());let prevented=false;
h.pointerDown({target:{closest:()=>({dataset:{kind:'home',id:'p1'}})},clientX:900,clientY:200,pointerId:1,preventDefault(){prevented=true;}});
h.pointerMove({clientX:800,clientY:200,preventDefault(){prevented=true;}});h.pointerUp();
assert.equal(JSON.stringify(h.get()),lockedBefore);assert.equal(prevented,false,'locked board lets page scrolling proceed');
const drag=(kind,id,x,y)=>{
 const piece={dataset:{kind,id}},event={target:{closest:()=>piece},clientX:x*10,clientY:y*6.8,pointerId:1,preventDefault(){}};
 assert.equal(h.beginEditing(),true);h.pointerDown(event);h.pointerMove(event);h.pointerUp();assert.equal(h.finishEditing(),true);
};
h.selectStep(0);drag('home','p1',37,scene.subScenes[0].home[1].y);
h.selectStep(1);drag('home','p1',19,scene.subScenes[1].home[1].y);
h.selectStep(0);drag('opponent','opp_1',42,72);drag('ball','ball',57,68);
h.beginEditing();h.setTool('text');h.pointerDown({target:{closest:()=>null},clientX:500,clientY:300,preventDefault(){}});h.setTool('move');h.finishEditing();h.persist();
assert.equal(scene.subScenes[0].drawings[0].text,'Hold shape');assert.equal(scene.subScenes[2].drawings[0].text,'Hold shape');
assert.equal(scene.subScenes[2].opponents[1].x,42);assert.equal(scene.subScenes[2].ball.y,68);
rasters.length=0;assert.equal(await node('strategyQuickGif').handlers.click(),true);
assert.equal(h.get(),generated);assert.equal(rasters[0].frame.home[1].x,37);assert.equal(rasters[6].frame.home[1].x,19);assert.equal(rasters.at(-1).frame.home[1].x,37);
assert.equal(writes.length,0);
// Hiding opponents affects preview/SVG/GIF without deleting their editable positions.
node('strategyShowOpponents').handlers.change({target:{checked:false}});
assert.doesNotMatch(node('strategyPitch').innerHTML,/data-kind="opponent"/);
rasters.length=0;assert.equal(await node('strategyQuickGif').handlers.click(),true);
assert.ok(rasters.every(r=>!r.svg.includes('data-kind="opponent"')));assert.equal(h.get().scenes[0].subScenes[0].opponents.length,11);

// Real shared payload/save and bundle reload keep all three physical frames and metadata.
await h.saveSharedStrategy('draft');assert.equal(writes.length,1);assert.equal(writes[0].payload.ai_context_enabled,false);assert.equal(rpc.length,0);
const record=plain(tables.match_strategies[0]);assert.equal(record.scenes[0].subScenes.length,3);assert.equal(record.scenes[0].subScenes[0].home[1].x,37);
h.loadSharedStrategy(record);assert.equal(h.get().scenes[0].subScenes[1].home[1].x,19);assert.ok(A.isGenerated(h.get().scenes[0]));
assert.match(node('strategyQuickGif').textContent,/Download edited/);
const savedLeftBack=state.slots.LB;state.slots.LB='unavailable-player';
assert.equal(await node('strategyQuickGif').handlers.click(),true,'a loaded editable template exports its own saved lineup, even when the current board differs');
const beforeInvalid=h.get();node('strategyLineupSource').handlers.change();
assert.equal(await node('strategyQuickGif').handlers.click(),false,'explicitly selecting a new invalid lineup does not reset the existing edits');
assert.equal(h.get(),beforeInvalid);state.slots.LB=savedLeftBack;
await h.saveSceneBundle();assert.equal(writes.at(-1).table,'strategy_scene_bundles');
const bundle=h.bundleScene(tables.strategy_scene_bundles[0]);assert.ok(A.isGenerated(bundle));assert.equal(bundle.subScenes[1].home[1].x,19);
// Changing opponent formation generates opposite opponent phases without overwriting edited SKOR views.
node('strategyOpponentFormation').value='3-5-2';h.changeOpponentFormation();
scene=h.get().scenes[0];assert.equal(h.get().opponentFormation,'3-5-2');assert.equal(scene.subScenes[0].home[1].x,37);assert.equal(scene.subScenes[1].home[1].x,19);
assert.notEqual(scene.subScenes[0].opponents[1].y,scene.subScenes[1].opponents[1].y);

// The previous strategy can be restored without a backend write.
node('strategyRestorePrevious').handlers.click();assert.deepEqual(plain(h.get()).scenes,plain(h.normalizeDraft(previous)).scenes);
assert.equal(node('strategyRestorePrevious').hidden,true);
// Session/permission/strategy changes after an async raster begins must stop the download.
for(const change of [()=>{owner='another-captain';},()=>{canWrite=false;},()=>{window.SKORStrategy.activate();}]){
  owner='fixture-captain';canWrite=true;window.SKORStrategy.activate();
  let release;blockRaster=new Promise(resolve=>release=resolve);const before=downloads.length;
  const pending=node('strategyQuickGif').handlers.click();await Promise.resolve();await Promise.resolve();
  if(change.toString().includes('activate')){owner='another-captain';}
  change();release();assert.equal(await pending,false);assert.equal(downloads.length,before);
}
owner='fixture-captain';canWrite=true;window.SKORStrategy.activate();
failRaster=true;assert.equal(await node('strategyQuickGif').handlers.click(),false);assert.equal(node('strategyQuickGif').disabled,false);failRaster=false;
assert.match(node('strategySharedState').textContent,/Could not build the GIF/);

assert.match(html,/id="strategyQuickGif"/);assert.match(html,/Show opponents in preview \/ GIF/);
assert.ok(html.indexOf('src="strategy-attack-defense.js')<html.indexOf('src="strategy.js'));
for(const inline of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(inline[1]);
// A saved Freeform lineup can load fill-ins while another game is open.
const savedId='70000000-0000-4000-8000-000000000001',tempId='80000000-0000-4000-8000-000000000001';
const savedState={formation:'Freeform / Custom',freeform:{p0:{x:50,y:92},p1:{x:20,y:55},['temp:'+tempId]:{x:70,y:50}},keeperPlan:{assignments:{}}};
window.SKORLineup.listVariations=()=>[{id:savedId,event_key:game,name:'Synthetic saved Freeform',state:plain(savedState)}];
tables.match_temp_players=[{id:tempId,match_id:game,display_name:'Synthetic Guest',jersey_number:23,active:true}];
node('strategyLineupSource').value='saved:'+savedId;node('strategyLineupSource').handlers.change();
assert.equal(await node('strategyQuickGif').handlers.click(),true);
assert.equal(h.get().scenes[0].subScenes[0].home.length,3);assert.equal(h.get().scenes[0].subScenes[0].home[2].number,23);
for(const reason of ['actor','permission','selection','source']){
 owner='fixture-captain';canWrite=true;window.SKORStrategy.activate();node('strategyLineupSource').value='saved:'+savedId;node('strategyLineupSource').handlers.change();
 let release;readGate=new Promise(resolve=>release=resolve);const before=downloads.length;
 const pending=node('strategyQuickGif').handlers.click();await Promise.resolve();await Promise.resolve();
 if(reason==='actor')owner='other-captain';if(reason==='permission')canWrite=false;
 if(reason==='selection')node('strategyLineupSource').value='current';
 if(reason==='source')savedState.freeform.p1.x=21;
 release();assert.equal(await pending,false,'source-loading guard: '+reason);assert.equal(downloads.length,before);
 savedState.freeform.p1.x=20;
}
owner='fixture-captain';canWrite=true;window.SKORStrategy.activate();
if(process.env.SKOR_SOURCE_FIXTURE_PATH){
 const sample=JSON.parse(fs.readFileSync(process.env.SKOR_SOURCE_FIXTURE_PATH,'utf8'));
 const source=sample.source,original=JSON.stringify(source.state);
 const fixtureRoster=sample.regularRows.filter(p=>p.active!==false);
 window.SKORLineup.getRoster=()=>plain(fixtureRoster);
 window.SKORLineup.listVariations=()=>[{id:source.variationId,event_key:source.eventKey,event_label:'Saved game',name:'Saved lineup',state:plain(source.state)}];
 tables.match_temp_players=plain(sample.tempRows);
 tables.team_roster=sample.regularRows.map(p=>({...p,jersey_number:p.number,full_name:p.fullName,preferred_name:p.name}));
 node('strategyLineupSource').value=source.id;node('strategyLineupSource').handlers.change();
 const count=downloads.length;
 assert.equal(await node('strategyQuickGif').handlers.click(),true,'actual saved lineup resolves its exact match-specific fill-ins');
 assert.equal(downloads.length,count+1);
 const actual=h.get().scenes[0],ids=S.fieldIds(source.state);
 assert.equal(JSON.stringify(actual.subScenes[0].home.map(p=>p.id).sort()),JSON.stringify(ids.slice().sort()),'all exact selected identities survive');
 assert.equal(actual.subScenes[0].home.length,ids.length);
 const keeper=S.keeperId({...source,roster:fixtureRoster},actual.subScenes[0].home);
 assert.ok(keeper);assert.equal(actual.subScenes[0].home.find(p=>p.id===keeper).y,actual.subScenes[1].home.find(p=>p.id===keeper).y);
 assert.equal(JSON.stringify(source.state),original);
 console.log('Private read-only source fixture: all '+ids.length+' selected players resolved; one GIF encoded; keeper fixed; original lineup unchanged.');
}
console.log('Attack/defense verified: all formations, Freeform, both-team movement, fixed keepers, editable/reused views, smooth return, real GIF encoding, shared strategy/bundle reload, opponent visibility, previous draft recovery and async session guards.');
