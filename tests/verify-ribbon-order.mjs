import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ribbon=require('../ribbon-order.js');
const {PREFERENCE_KEY:key,normalizeOrder,moveItem,preferenceStore,createController}=ribbon;
const defaults=['dashboard','gameday','lineups','roster'];
assert.deepEqual(normalizeOrder(['lineups','unknown','lineups','roster'],defaults),['lineups','roster','dashboard','gameday']);
for(const malformed of [null,{},'lineups',[null,7,{}]])assert.deepEqual(normalizeOrder(malformed,defaults),defaults);
assert.deepEqual(moveItem(defaults,'roster',0),['roster','dashboard','gameday','lineups']);
assert.deepEqual(moveItem(defaults,'dashboard',-1),defaults);
assert.deepEqual(moveItem(defaults,'not-a-feature',0),defaults);

const accounts=new Map([
  ['captain-a',{id:'captain-a',user_metadata:{name:'Example Captain',unrelated:'keep',[key]:['lineups','gameday','dashboard','roster']}}],
  ['captain-b',{id:'captain-b',user_metadata:{[key]:['roster','dashboard','gameday','lineups']}}],
]);
let current='captain-a',writes=0,failSave=false,writeDelay=null,readDelay=null;
const clone=value=>structuredClone(value);
function client(){return {auth:{
  async getUser(){if(readDelay)await readDelay;return {data:{user:clone(accounts.get(current))},error:null};},
  async updateUser(attributes){
    writes++;assert.deepEqual(Object.keys(attributes),['data']);assert.deepEqual(Object.keys(attributes.data),[key]);
    if(writeDelay)await writeDelay;
    if(failSave)return {error:new Error('offline')};
    const user=accounts.get(current);user.user_metadata={...user.user_metadata,...attributes.data};
    return {data:{user:clone(user)},error:null};
  }
}};}
const store=preferenceStore(client(),defaults);
assert.deepEqual(await store.load('captain-a'),['lineups','gameday','dashboard','roster']);
await store.save('captain-a',['gameday','lineups','roster','dashboard']);
assert.equal(accounts.get('captain-a').user_metadata.unrelated,'keep','saving only the preference must preserve unrelated account metadata');
assert.deepEqual(await preferenceStore(client(),defaults).load('captain-a'),['gameday','lineups','roster','dashboard'],'another browser/client must load the saved order');
assert.deepEqual(accounts.get('captain-b').user_metadata[key],['roster','dashboard','gameday','lineups'],'another captain must not be affected');
await assert.rejects(store.save('captain-b',defaults),/login changed/);
assert.equal(writes,1,'an account mismatch must block the write');
failSave=true;await assert.rejects(store.save('captain-a',defaults),/offline/);failSave=false;
assert.deepEqual(accounts.get('captain-a').user_metadata[key],['gameday','lineups','roster','dashboard']);
await assert.rejects(preferenceStore({auth:{getUser:async()=>({data:{user:accounts.get(current)}}),updateUser:async()=>({data:{user:accounts.get(current)}})}},defaults).save('captain-a',defaults),/not saved/,'a response without the requested saved order cannot count as success');

class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.parent=null;this.dataset={};this.attributes={};this.listeners={};this.textContent='';this.disabled=false;this.hidden=false;this.open=false;this.className='';this.scrollWidth=this.clientWidth=200;this.scrollHeight=this.clientHeight=300;this.scrollLeft=this.scrollTop=0;this.classList={contains:value=>this.className.split(' ').includes(value)};}
  append(...items){for(const item of items){if(item.parent)item.parent.children=item.parent.children.filter(child=>child!==item);this.children.push(item);item.parent=this;}}
  appendChild(item){this.append(item);return item;}
  replaceChildren(...items){this.children.forEach(item=>{item.parent=null;});this.children=[];this.append(...items);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,listener){(this.listeners[name]??=[]).push(listener);}
  async fire(name,event={}){await Promise.all((this.listeners[name]||[]).map(listener=>listener(event)));}
  querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll(selector)]);return all.filter(child=>selector==='button'?child.tag==='button':selector==='button[data-view]'?child.tag==='button'&&!!child.dataset.view:false);}
  querySelector(selector){return selector==='span'?this.children.find(child=>child.tag==='span'):null;}
  getBoundingClientRect(){return {left:0,right:100,top:0,bottom:44};}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;for(const listener of this.listeners.close||[])listener();}
}
function fixture(finePointer){
  const nav=new Element(),nodes=new Map();
  for(const id of ['ribbonOrderToggle','ribbonOrderDialog','ribbonOrderList','ribbonOrderSave','ribbonOrderCancel','ribbonOrderReset','ribbonOrderStatus'])nodes.set(id,new Element(id==='ribbonOrderToggle'?'button':'div'));
  const originalButtons=defaults.map(id=>{const button=new Element('button');button.dataset.view=id;button.className=id==='dashboard'?'active':'';const label=new Element('span');label.textContent=id;button.append(label);nav.append(button);return button;});
  const win={document:{querySelector:()=>nav,getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),activeElement:nodes.get('ribbonOrderToggle')},SKORSupabase:client(),SKORPortalCanWrite:()=>true,getComputedStyle:()=>({display:'block'}),matchMedia:()=>({matches:finePointer}),addEventListener:()=>{}};
  return {win,nav,nodes,originalButtons,controller:createController(win)};
}
const phone=fixture(false),f=phone;
const order=()=>f.nav.children.map(button=>button.dataset.view);
const get=id=>f.nodes.get(id);
await f.controller.init(clone(accounts.get('captain-a')));
assert.deepEqual(order(),accounts.get('captain-a').user_metadata[key]);
assert.equal(get('ribbonOrderToggle').hidden,false);
assert.ok(f.originalButtons.every(button=>f.nav.children.includes(button)),'reordering must reuse original buttons and their click handlers');
assert.equal(f.originalButtons.find(button=>button.dataset.view==='dashboard').className,'active');
assert.ok(f.originalButtons.every(button=>!button.draggable),'the navigation ribbon itself must never become draggable');
await get('ribbonOrderToggle').fire('click');
assert.equal(get('ribbonOrderDialog').open,true);
assert.equal(get('ribbonOrderToggle').attributes['aria-expanded'],'true');
assert.ok(get('ribbonOrderList').children.every(row=>row.children[0].draggable===false),'phones use move buttons, without swipe/drag conflicts');
let first=get('ribbonOrderList').children[0];
await first.children.find(button=>button.dataset.direction==='down').fire('click');
assert.deepEqual(order(),['lineups','gameday','roster','dashboard']);
await f.controller.init(clone(accounts.get('captain-a')));
assert.equal(get('ribbonOrderDialog').open,true,'auth refresh must not close an open editor');
const writesBeforeCancel=writes;
await get('ribbonOrderCancel').fire('click');
assert.deepEqual(order(),accounts.get('captain-a').user_metadata[key]);assert.equal(writes,writesBeforeCancel);
assert.equal(get('ribbonOrderDialog').open,false);

await get('ribbonOrderToggle').fire('click');await get('ribbonOrderReset').fire('click');
assert.deepEqual(order(),defaults);assert.equal(writes,writesBeforeCancel,'reset remains a draft until Lock & save');
failSave=true;await get('ribbonOrderSave').fire('click');failSave=false;
assert.equal(get('ribbonOrderDialog').open,true,'failed saves must leave the editor unlocked');
assert.match(get('ribbonOrderStatus').textContent,/Could not save/);
await get('ribbonOrderSave').fire('click');
assert.equal(get('ribbonOrderDialog').open,false);assert.deepEqual(accounts.get('captain-a').user_metadata[key],defaults);
assert.equal(get('ribbonOrderToggle').attributes['aria-expanded'],'false');

await get('ribbonOrderToggle').fire('click');
first=get('ribbonOrderList').children[0];await first.children.find(button=>button.dataset.direction==='down').fire('click');
const writesBeforeEscape=writes;
await get('ribbonOrderDialog').fire('cancel',{preventDefault(){}});
assert.deepEqual(order(),defaults);assert.equal(writes,writesBeforeEscape);

await get('ribbonOrderToggle').fire('click');
let resolveWrite;writeDelay=new Promise(resolve=>{resolveWrite=resolve;});
const saving=get('ribbonOrderSave').fire('click');await new Promise(resolve=>setImmediate(resolve));
await get('ribbonOrderDialog').fire('cancel',{preventDefault(){}});
assert.equal(get('ribbonOrderDialog').open,true,'Escape must not cancel a save in progress');
assert.equal(get('ribbonOrderSave').disabled,true);
resolveWrite();await saving;writeDelay=null;

current='captain-b';await f.controller.init(clone(accounts.get(current)));
assert.deepEqual(order(),accounts.get(current).user_metadata[key],'switching captains loads their own order');
f.controller.clear();assert.deepEqual(order(),defaults);assert.equal(get('ribbonOrderToggle').hidden,true);
f.win.SKORPortalCanWrite=()=>false;await f.controller.init(clone(accounts.get(current)));
assert.equal(get('ribbonOrderToggle').hidden,true,'view-only users must not get reorder controls');

const desktop=fixture(true);await desktop.controller.init(clone(accounts.get(current)));
const dget=id=>desktop.nodes.get(id);await dget('ribbonOrderToggle').fire('click');
let rows=dget('ribbonOrderList').children;
assert.ok(rows.every(row=>row.children[0].draggable),'desktop dragging is limited to editor handles');
const dragEvent={dataTransfer:{setData(){},effectAllowed:'',dropEffect:''},preventDefault(){}};
const moved=rows[0].dataset.view;
await rows[0].children[0].fire('dragstart',dragEvent);await rows[2].fire('drop',dragEvent);
assert.equal(desktop.nav.children[2].dataset.view,moved);
await dget('ribbonOrderCancel').fire('click');
assert.deepEqual(desktop.nav.children.map(button=>button.dataset.view),accounts.get(current).user_metadata[key]);

const late=fixture(false);let resolveRead;readDelay=new Promise(resolve=>{resolveRead=resolve;});
const loading=late.controller.init(clone(accounts.get(current)));late.controller.clear();resolveRead();await loading;readDelay=null;
assert.deepEqual(late.nav.children.map(button=>button.dataset.view),defaults,'an old account response must not restore its order after sign-out');
assert.equal(late.nodes.get('ribbonOrderToggle').hidden,true);

const admin=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../ribbon-order.css',import.meta.url),'utf8');
assert.match(admin,/SKORRibbonOrder\?\.init\(user\)/);assert.match(admin,/SKORRibbonOrder\?\.clear\(\)/);
assert.doesNotMatch(admin.match(/<div class="nav">[\s\S]*?<\/div>/)[0],/ribbonOrder|draggable=/,'lock controls must remain outside the original ribbon');
assert.doesNotMatch(css,/\.nav\b|\baside\b|\.app\b/,'new editor CSS must not override phone/tablet/desktop navigation geometry');
assert.match(css,/44px 44px/);assert.match(css,/max-height:calc\(100dvh - 24px\)/);
console.log('Ribbon checks passed: per-captain cross-client persistence, safe defaults, original nav buttons, phone arrows, desktop drag, cancel/reset, failure handling, auth refreshes and sign-out races.');
