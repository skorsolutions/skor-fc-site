import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),bulk=require('../jerseys-bulk.js');
const admin=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../jerseys.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../jerseys.css',import.meta.url),'utf8');
assert.deepEqual(bulk.captainNames([{display_name:' Sample Captain '},{display_name:'Example Captain'},{display_name:'Sample Captain'},{display_name:''}]),['Example Captain','Sample Captain']);
const original=[
  {id:'j1',kit_id:'maroon',jersey_number:11,size:'L',status:'on_hand',holder_captain_name:'Example Captain',notes:'Bag A'},
  {id:'j2',kit_id:'white',jersey_number:11,size:'XL',status:'unavailable',holder_captain_name:'Example Captain',notes:'Repair needed'},
  {id:'j3',kit_id:'maroon',jersey_number:99,size:'M',status:'retired',holder_captain_name:null,notes:'History'},
];
let rows=structuredClone(original),writes=[],directoryAvailable=true,targetActive=true,writeError=false,readError=false,partial=false;
let canWrite=true,confirmResult=true,notifications=0,blocked=0,confirmations=[],captainReads=0;
const kits=[{id:'maroon',name:'Maroon',color_name:'Maroon',color_hex:'#741f35',active:true,sort_order:10},{id:'white',name:'White',color_name:'White',color_hex:'#ffffff',active:true,sort_order:20}];
class Query{
  constructor(table){this.table=table;this.ids=null;this.payload=null;this.columns='';}
  select(columns){this.columns=columns;return this;}
  order(){return this;}
  update(payload){this.payload=payload;return this;}
  in(column,ids){assert.equal(column,'id');this.ids=ids;return this;}
  then(resolve,reject){return Promise.resolve().then(()=>{
    if(this.table==='team_kits')return {data:structuredClone(kits),error:null};
    assert.equal(this.table,'jersey_inventory');
    if(this.payload){
      assert.deepEqual(Object.keys(this.payload),['holder_captain_name'],'the bulk write must never overwrite numbers, kits, status, notes or TEMP assignments');
      writes.push({ids:[...this.ids],payload:structuredClone(this.payload)});
      if(writeError)return {data:null,error:new Error('database rejected update')};
      const applied=this.ids.filter((id,index)=>!partial||index===0);
      rows=rows.map(row=>applied.includes(row.id)?{...row,...this.payload}:row);
      return {data:structuredClone(rows.filter(row=>applied.includes(row.id))),error:null};
    }
    if(readError&&this.ids)return {data:null,error:new Error('read unavailable')};
    return {data:structuredClone(rows.filter(row=>!this.ids||this.ids.includes(row.id))),error:null};
  }).then(resolve,reject);}
}
const client={from:table=>new Query(table),async rpc(name){
  assert.equal(name,'get_notebook_captain_directory');captainReads++;
  if(!directoryAvailable||!canWrite)return {error:new Error('captain access required')};
  return {data:[{display_name:'Example Captain'},...(targetActive?[{display_name:'Sample Captain'}]:[])],error:null};
}};
let result=await bulk.transfer(client,['j1','j2','j1'],'Sample Captain');
assert.deepEqual(result.confirmedIds,['j1','j2']);assert.deepEqual(result.unresolvedIds,[]);
assert.equal(writes.length,1);assert.deepEqual(writes[0].ids,['j1','j2']);
for(const row of rows){const before=original.find(item=>item.id===row.id);assert.deepEqual({...row,holder_captain_name:before.holder_captain_name},before);}
assert.equal(rows[2].holder_captain_name,null,'an unselected jersey must remain unchanged');
const beforeInvalid=writes.length;
await assert.rejects(bulk.transfer(client,[],'Sample Captain'),/at least one/);
await assert.rejects(bulk.transfer(client,['j1'],''),/Choose/);
await assert.rejects(bulk.transfer(client,['j1'],'Unknown Captain'),/no longer available/);
targetActive=false;await assert.rejects(bulk.transfer(client,['j1'],'Sample Captain'),/no longer available/);targetActive=true;
directoryAvailable=false;await assert.rejects(bulk.transfer(client,['j1'],'Example Captain'),/verify the captain list/);directoryAvailable=true;
assert.equal(writes.length,beforeInvalid,'invalid or unavailable captains cannot trigger updates');
writeError=true;await assert.rejects(bulk.transfer(client,['j1'],'Example Captain'),/database rejected/);writeError=false;
partial=true;result=await bulk.transfer(client,['j1','j2'],'Example Captain');partial=false;
assert.deepEqual(result.confirmedIds,['j1']);assert.deepEqual(result.unresolvedIds,['j2'],'partial writes must not be reported as complete');
readError=true;await assert.rejects(bulk.transfer(client,['j1'],'Sample Captain'),/may have been saved.*could not be verified/);readError=false;

class Element{
  constructor(){this.value='';this.textContent='';this.style={};this.disabled=false;this.checked=false;this.indeterminate=false;this.dataset={};this.listeners={};this.attributes={};this.children=[];this.className='';this._html='';this.classList={toggle:()=>{}};}
  set innerHTML(value){
    this._html=value;this.children=[];
    for(const match of value.matchAll(/<(?:button|input)\b[^>]*>/g)){
      const child=new Element();
      for(const attr of match[0].matchAll(/data-([a-z-]+)="([^"]*)"/g))child.dataset[attr[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2];
      child.checked=/\schecked\b/.test(match[0]);child.disabled=/\sdisabled\b/.test(match[0]);this.children.push(child);
    }
  }
  get innerHTML(){return this._html;}
  get options(){return [...this._html.matchAll(/<option value="([^"]*)"/g)].map(match=>({value:match[1]}));}
  querySelectorAll(selector){const fields=selector.split(',').map(value=>value.match(/\[data-([a-z-]+)\]/)?.[1]).filter(Boolean).map(value=>value.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()));return this.children.filter(child=>fields.some(field=>child.dataset[field]!==undefined));}
  addEventListener(name,handler){(this.listeners[name]??=[]).push(handler);}
  async fire(name,event={preventDefault(){}}){for(const handler of this.listeners[name]||[])await handler(event);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  focus(){}
}
const nodes=new Map([...admin.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element()]));
const get=id=>nodes.get(id);
get('jerseyKitFilter').value='all';get('jerseyStatusFilter').value='active';
const window={SKORSupabase:client,SKORJerseyBulk:bulk,SKORPortalCanWrite:()=>canWrite,SKORViewerBlocked:()=>blocked++,SKORLineup:{jerseysChanged:()=>notifications++}};
const context={window,document:{getElementById:get},confirm:message=>{confirmations.push(message);return confirmResult;},console};
vm.runInNewContext(source,context,{filename:'jerseys.js'});
rows=structuredClone(original);writes=[];window.SKORJerseys.init();await new Promise(resolve=>setImmediate(resolve));
assert.match(get('jerseyBulkCaptain').innerHTML,/Example Captain/);assert.match(get('jerseyBulkCaptain').innerHTML,/Sample Captain/);
let checks=get('jerseyInventoryBody').querySelectorAll('[data-jersey-select]');
assert.equal(checks.length,2,'default active filter must omit retired jerseys');
checks[0].checked=true;await checks[0].fire('change');
assert.match(get('jerseyBulkCount').textContent,/1 jersey selected/);assert.equal(get('jerseySelectVisible').indeterminate,true);
await get('jerseyBulkSelectAll').fire('click');assert.match(get('jerseyBulkCount').textContent,/2 jerseys selected/);
get('jerseyKitFilter').value='maroon';await get('jerseyKitFilter').fire('change');
assert.match(get('jerseyBulkCount').textContent,/1 outside current filters/);
get('jerseySelectVisible').checked=false;await get('jerseySelectVisible').fire('change');
assert.match(get('jerseyBulkCount').textContent,/1 jersey selected.*1 outside current filters/,'unchecking the filtered header must not deselect hidden rows');
await get('jerseyBulkSelectAll').fire('click');
get('jerseyBulkCaptain').value='Sample Captain';await get('jerseyBulkCaptain').fire('change');
assert.equal(get('jerseyBulkTransfer').disabled,false);
confirmResult=false;await get('jerseyBulkTransfer').fire('click');assert.equal(writes.length,0);assert.match(get('jerseyBulkCount').textContent,/2 jerseys/);
assert.match(confirmations.at(-1),/2 jerseys.*Sample Captain/);assert.match(confirmations.at(-1),/1 selected jersey outside/);
confirmResult=true;get('jerseyEditId').value='j1';get('jerseyHolder').value='Example Captain';
await get('jerseyBulkTransfer').fire('click');
assert.equal(writes.length,1);assert.deepEqual(writes[0].ids,['j2','j1']);
assert.equal(get('jerseyHolder').value,'Sample Captain','an open individual edit must not accidentally restore the old holder');
assert.match(get('jerseyBulkCount').textContent,/0 jerseys selected/);assert.match(get('jerseyBulkStatus').textContent,/2 jerseys now held by Sample Captain/);
assert.match(get('jerseyInventoryBody').innerHTML,/Sample Captain/);assert.ok(notifications>0,'TEMP jersey labels must be refreshed after custody changes');
assert.match(window.SKORJerseys.labelFor('j1'),/held by Sample Captain/);
assert.equal(window.SKORJerseys.getItem('j2').status,'unavailable');
assert.equal(window.SKORJerseys.availableOptions().length,1,'custody transfer must not make unavailable or retired jerseys assignable to TEMP players');
await window.SKORJerseys.refresh();assert.equal(rows[0].holder_captain_name,'Sample Captain','custody must survive another database reload');
get('jerseyKitFilter').value='all';await get('jerseyKitFilter').fire('change');await get('jerseyBulkSelectAll').fire('click');
get('jerseyBulkCaptain').value='Example Captain';partial=true;await get('jerseyBulkTransfer').fire('click');partial=false;
assert.match(get('jerseyBulkStatus').textContent,/Verified 1 of 2/);assert.match(get('jerseyBulkCount').textContent,/1 jersey selected/);
const rpc=client.rpc;let releaseRpc;const pendingRpc=new Promise(resolve=>{releaseRpc=resolve;});
client.rpc=async name=>{await pendingRpc;return rpc(name);};
const beforeDoubleClick=writes.length,confirmationCount=confirmations.length;
const handoff=get('jerseyBulkTransfer').fire('click');await new Promise(resolve=>setImmediate(resolve));
assert.equal(get('jerseyBulkTransfer').disabled,true);assert.equal(get('jerseyBulkClear').disabled,true);
await get('jerseyBulkTransfer').fire('click');
releaseRpc();await handoff;client.rpc=rpc;
assert.equal(writes.length,beforeDoubleClick+1,'double clicks must not run another bulk update');
assert.equal(confirmations.length,confirmationCount+1);
const previousWrites=writes.length;canWrite=false;await get('jerseyBulkTransfer').fire('click');assert.equal(writes.length,previousWrites);assert.equal(blocked,1);
canWrite=true;window.SKORJerseys.clearSelection();assert.match(get('jerseyBulkCount').textContent,/0 jerseys selected/);
get('jerseyStatusFilter').value='all';await get('jerseyStatusFilter').fire('change');await get('jerseyBulkSelectAll').fire('click');
assert.match(get('jerseyBulkCount').textContent,/3 jerseys selected/,'Select all matching must follow the explicitly selected All statuses filter');
window.SKORJerseys.clearSelection();
directoryAvailable=false;await window.SKORJerseys.refresh();
assert.equal(get('jerseyBulkCaptain').disabled,true);assert.match(get('jerseyBulkStatus').textContent,/Captain list unavailable/);
directoryAvailable=true;await get('refreshJerseysBtn').fire('click');
assert.equal(get('jerseyBulkCaptain').disabled,false);assert.equal(get('jerseyBulkStatus').textContent,'','successful refresh must clear a stale captain-list failure');

new vm.Script(source);new vm.Script(fs.readFileSync(new URL('../jerseys-bulk.js',import.meta.url),'utf8'));
for(const match of admin.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
const ids=[...admin.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
assert.ok(admin.indexOf('jerseys-bulk.js?v=58.4')<admin.indexOf('jerseys.js?v=58.4'));
assert.match(css,/width:44px;height:44px/);assert.match(css,/\.jersey-bulk-actions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/body\.viewer-mode \.jersey-write-only\{display:none!important\}/);
console.log('Bulk jersey tests passed: selection/filter scopes, captain validation, one custody-only update, independent readback, partial/error reporting, persistence, TEMP refresh, view-only protection and responsive contracts.');
