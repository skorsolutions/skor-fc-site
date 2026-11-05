import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{mount}=require('../lineup-free-move.js');
const K=require('../keeper-plan.js'),J=require('../match-jerseys.js'),M=require('../lineup-marker.js');
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=read('admin.html');
function extract(source,name){
  const start=source.search(new RegExp('  (?:async )?function '+name+'\\('));
  assert.ok(start>=0,name+' exists');
  const end=source.slice(start+3).search(/\n  (?:async )?function /);
  return source.slice(start,end<0?undefined:start+3+end);
}
const fixture=()=>({formation:'Freeform / Custom',slots:{},freeform:{a:{x:40,y:50},b:{x:50,y:88}},bench:['c'],
  depth:{CM:['a']},subs:{firstHalf:[],secondHalf:[]},matchJerseys:{a:12,b:1,c:9},
  labelMode:'names',captainId:'a',quote:'Keep moving',notes:'Fictional test only',
  keeperPlan:{spareNumbers:[30],assignments:{b:{role:'starting',jerseyNumber:null}}}});
function setup(){
  const calls={saved:[],renders:0,preview:0,status:[],placed:[],benched:[]};
  const storage=new Map(),roster=[{player_key:'a',name:'Avery',number:12},{player_key:'b',name:'Blair',number:1,position:'GK'},{player_key:'c',name:'Casey',number:9}];
  const context=vm.createContext({state:fixture(),selectedPlayer:null,roster,FREEFORM:'Freeform / Custom',formations:{'4-2-3-1':[['GK',50,92]]},SUB_UNITS:['mixed','defense','midfield','strikers'],
    window:{SKORKeeperPlan:K,SKORMatchJerseys:J,SKORLineupMarker:M},
    document:{getElementById:()=>null},console,checkSubPlan:()=>true,
    isFreeform:f=>f==='Freeform / Custom',depthPositionsForFormation:()=>[{key:'CM',label:'Midfield'}],
    clamp:(v,min,max)=>Math.max(min,Math.min(max,v)),clone:structuredClone,
    draftKey:()=> 'fixture-draft',eventLabel:()=> 'Fixture game',
    localStorage:{setItem(key,value){storage.set(key,value);calls.saved.push(value);}},
    renderGameplanPreview(){calls.preview++;},renderSquadChange(){calls.renders++;},markStatus:m=>calls.status.push(m)
  });
  for(const name of ['id','player','selectableRoster','primaryJerseyLabel','keeperDetails','jerseyLabel','keeperSuffix','playerListLabel','removeFromField','persistDraft','placeFreeform','movePlayerToBench','defaultSubUnit','blankSubRow','normalizeSubs','normalizeState','fieldEntries','filledFirstHalfSubs','filledSecondHalfSubs','shortName','prettyPlayer','prettyPlayers','subUnitLabel','svgTextBlock','buildGameplanSvg','normalizedVariationName','saveOrOverwriteVariation']){
    vm.runInContext(extract(admin,name),context);
  }
  context.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const handlers=new Map(),classes=new Set();
  const marker={dataset:{v28Player:'a'},style:{left:'40%',top:'50%'},classList:{add:s=>classes.add(s),remove:s=>classes.delete(s)},closest:s=>s==='.freeform-player'?marker:null};
  let attached=true,held=null;
  const pitch={contains:node=>attached&&node===marker,
    getBoundingClientRect:()=>({left:10,top:20,width:200,height:400}),
    setPointerCapture:id=>held=id,hasPointerCapture:id=>held===id,releasePointerCapture:()=>held=null,
    addEventListener(type,fn){const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list);},
    removeEventListener(type,fn){handlers.set(type,(handlers.get(type)||[]).filter(x=>x!==fn));}};
  const current={event:'fixture-game',captain:'fixture-captain',canMove:true,freeform:true};
  const controller=mount({pitch,getContext:()=>({...current,board:context.state}),getPosition:pid=>context.state.freeform[pid],
    bench:{getBoundingClientRect:()=>({left:10,top:430,right:210,bottom:490,width:200,height:60})},
    onPlace(pid,x,y){calls.placed.push({pid,x,y});context.placeFreeform(pid,x,y);},
    onBench(pid){calls.benched.push(pid);context.movePlayerToBench(pid);}});
  const fire=(type,options={})=>{
    const event={pointerId:1,isPrimary:true,button:0,clientX:90,clientY:220,target:marker,detail:1,
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...options};
    for(const fn of handlers.get(type)||[])fn(event);return event;
  };
  return {context,storage,calls,marker,pitch,current,controller,fire,classes,detach(){attached=false;}};
}

// Execute real mouse/pen/touch handlers plus the canonical placement and draft path.
for(const pointerType of ['mouse','touch','pen']){
  const f=setup(),original=structuredClone(f.context.state);
  f.fire('pointerdown',{pointerType});
  f.fire('pointermove',{pointerType,clientX:130,clientY:180});
  assert.equal(f.marker.style.left,'60%');assert.equal(f.marker.style.top,'40%');
  assert.ok(f.classes.has('freeform-moving'));
  assert.equal(JSON.stringify(f.context.state),JSON.stringify(original),'movement previews do not save midway');
  f.fire('pointerup',{pointerType,clientX:130,clientY:180});
  assert.equal(f.calls.placed.length,1);assert.equal(f.calls.saved.length,1);
  assert.deepEqual(JSON.parse(f.storage.get('fixture-draft')).freeform.a,{x:60,y:40});
  assert.deepEqual(structuredClone(f.context.state.keeperPlan),original.keeperPlan);
  for(const key of ['captainId','depth','subs','notes','quote','bench'])assert.equal(JSON.stringify(f.context.state[key]),JSON.stringify(original[key]));
  const click=f.fire('click');assert.ok(click.prevented&&click.stopped,'release click is consumed');
  f.fire('pointerup',{clientX:130,clientY:180});assert.equal(f.calls.saved.length,1);
}
// Grabbing a shirt edge preserves its offset, and a sub-threshold tap stays a tap.
{
  const f=setup();f.fire('pointerdown',{clientX:100});f.fire('pointermove',{clientX:102});
  f.fire('pointerup',{clientX:102});assert.equal(f.calls.saved.length,0);assert.ok(!f.fire('click').stopped);
  f.fire('pointerdown',{clientX:100});f.fire('pointerup',{clientX:120,clientY:220});
  assert.ok(Math.abs(f.context.state.freeform.a.x-50)<1e-10);assert.equal(f.context.state.freeform.a.y,50);
  assert.ok(!f.fire('click',{detail:0}).stopped,'keyboard activation is retained');
  f.fire('pointerdown',{clientX:110});assert.ok(!f.fire('click').stopped,'next deliberate gesture clears click suppression');
}
for(const event of ['pointercancel','lostpointercapture']){
  const f=setup();f.fire('pointerdown');f.fire('pointermove',{clientX:150});f.fire(event,{target:f.pitch});
  assert.equal(f.marker.style.left,'40%');assert.equal(f.calls.saved.length,0);
  f.fire('pointerup',{clientX:150});assert.equal(f.calls.saved.length,0);
}
{
  const f=setup();f.fire('pointerdown',{pointerType:'touch'});f.fire('pointermove',{clientX:130});
  f.fire('lostpointercapture',{target:f.marker});
  f.fire('pointerup',{clientX:130});assert.equal(f.calls.saved.length,1,'implicit touch capture transfers to pitch without cancelling');
}
for(const change of [f=>f.current.event='other',f=>f.current.captain='other',f=>f.current.canMove=false,
  f=>f.current.freeform=false,f=>f.context.state=fixture(),f=>f.detach(),f=>f.context.state.freeform.a.x=20]){
  const f=setup();f.fire('pointerdown');f.fire('pointermove',{clientX:150});change(f);
  f.fire('pointerup',{clientX:150});assert.equal(f.calls.saved.length,0,'stale/unauthorized gesture cannot write');
}
for(const options of [{button:2},{isPrimary:false}]){
  const f=setup();f.fire('pointerdown',options);f.fire('pointerup',{clientX:150});assert.equal(f.calls.saved.length,0);
}
{
  const f=setup();f.current.canMove=false;f.fire('pointerdown');f.fire('pointerup',{clientX:150});assert.equal(f.calls.saved.length,0);
}
{
  const f=setup();f.fire('pointerdown');f.fire('pointermove',{pointerId:2,clientX:180});
  f.fire('pointerup',{pointerId:2,clientX:180});assert.equal(f.calls.saved.length,0);
  f.fire('pointerup',{clientX:-100,clientY:0});assert.deepEqual(structuredClone(f.context.state.freeform.a),{x:5,y:8});
}
{
  const f=setup();f.fire('pointerdown');f.fire('pointerup',{clientX:900,clientY:900});
  assert.deepEqual(structuredClone(f.context.state.freeform.a),{x:95,y:92});
}
{
  const f=setup();f.fire('pointerdown');f.fire('pointermove',{clientX:100,clientY:450});f.fire('pointerup',{clientX:100,clientY:450});
  assert.deepEqual(f.calls.benched,['a']);assert.equal(f.context.state.freeform.a,undefined);
  assert.deepEqual(structuredClone(f.context.state.bench),['c','a']);assert.equal(f.calls.saved.length,1);
}
{
  const f=setup();f.fire('pointerdown');f.fire('pointermove',{clientX:150});f.controller.cancel();
  f.fire('pointerup',{clientX:150});assert.equal(f.calls.saved.length,0);assert.equal(f.marker.style.left,'40%');
  f.controller.destroy();f.fire('pointerdown');f.fire('pointerup',{clientX:150});assert.equal(f.calls.saved.length,0);
}

// Existing normalization, shared-save/overwrite and renderer/import paths preserve the moved coordinates.
{
  const f=setup();f.fire('pointerdown');f.fire('pointerup',{clientX:130,clientY:180});
  const stored=JSON.parse(f.storage.get('fixture-draft'));
  f.context.state=f.context.normalizeState(stored);
  assert.deepEqual(structuredClone(f.context.state.freeform.a),{x:60,y:40});
  const records=[];
  const client={from(table){assert.equal(table,'lineup_variations');return {
    select:()=>({eq:()=>({order:async()=>({data:records,error:null})})}),
    async insert(payload){records.push({...structuredClone(payload),id:'saved-fixture'});return {error:null};},
    update:payload=>({eq:async(key,id)=>{assert.equal(id,'saved-fixture');Object.assign(records[0],structuredClone(payload));return {error:null};}})
  };}};
  const payload={event_key:'fixture-game',name:'Free move',state:stored};
  assert.equal((await f.context.saveOrOverwriteVariation(client,payload)).overwritten,false);
  assert.equal((await f.context.saveOrOverwriteVariation(client,{...payload,name:' FREE MOVE '})).overwritten,true);
  assert.equal(records.length,1);assert.deepEqual(records[0].state.freeform.a,{x:60,y:40});
  f.context.state=f.context.normalizeState(records[0].state);
  const svg=f.context.buildGameplanSvg(),y=258+Math.round(800*88.5/68)*((40-16.5/105*100)/(100-16.5/105*100));
  assert.ok(svg.includes('x="620" y="'+(y+68)+'"'),'shared PNG/JPG SVG uses moved coordinates');
  const strategy=read('strategy.js');
  vm.runInContext(extract(strategy,'playerName')+'\n'+extract(strategy,'playersFromLineup'),f.context);
  const actors=f.context.playersFromLineup(records[0].state,f.context.roster);
  const moved=actors.find(p=>p.id==='a');assert.equal(moved.x,60);assert.equal(moved.y,40);assert.equal(moved.number,12);
}
// Integration keeps standard formations and tap/native roster placement paths.
assert.match(admin,/SKORLineupFreeMove\.mount\(/);
assert.match(admin,/freeformMove\?\.cancel\(\)/);
assert.match(admin,/onPlace:placeFreeform,onBench:movePlayerToBench/);
assert.match(admin,/btn\.querySelectorAll\('\[draggable\]'\)\.forEach\(el=>el\.draggable=false\)/);
assert.match(admin,/\.freeform-player\{touch-action:none;user-select:none/);
assert.match(admin,/if\(e\.target\.closest\('\.freeform-player'\)\) return/);
assert.match(admin,/builderPositions\(formations\[state\.formation\]/);
assert.match(admin,/slot\.addEventListener\('drop'/);
console.log('Lineup free-move verification passed: pointer lifecycle, guards, tap/bench, save/reload/overwrite, SVG export and Strategy import.');
