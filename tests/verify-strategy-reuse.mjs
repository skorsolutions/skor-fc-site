import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../strategy-reuse.js'),K=require('../keeper-plan.js'),M=require('../lineup-marker.js');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const code=read('strategy.js'),html=read('admin.html');
const defs={};vm.runInNewContext(code.slice(code.indexOf('  const HOME_FORMATIONS='),code.indexOf('  const TYPE_LABELS=')).replace('const HOME_FORMATIONS=','globalThis.formations='),defs);
const formations=plain(defs.formations),roles=formations['4-2-3-1'].map(r=>r[0]);
const matchA='10000000-0000-4000-8000-000000000001',matchB='10000000-0000-4000-8000-000000000002',strategyId='20000000-0000-4000-8000-000000000001',bundleId='30000000-0000-4000-8000-000000000001',targetId='40000000-0000-4000-8000-000000000001';
const sourceState={formation:'4-2-3-1',slots:Object.fromEntries(roles.map((r,i)=>[r,'old-'+i])),bench:['old-bench']};
const targetState={formation:'4-2-3-1',slots:Object.fromEntries(roles.map((r,i)=>[r,i===0?'temp:new-keeper':'new-'+i])),bench:['new-bench'],keeperPlan:{spareNumbers:[31],assignments:{'temp:new-keeper':{role:'starting_temp',jerseyNumber:31}}}};
const oldHome=roles.map((r,i)=>({id:'old-'+i,name:'Old'+r,number:i+1,x:10+i*7,y:85-i*5,keeperNumber:i===0?30:null,keeperLabel:i===0?'starting temp keeper':''}));
const targetPlayers=roles.map((r,i)=>({id:targetState.slots[r],name:'New'+r,number:20+i,x:50,y:50,keeperNumber:i===0?31:null,keeperLabel:i===0?'starting temp keeper':''}));
const scenes=[0,1].map(b=>({id:'bundle-'+b,sourceBundleId:bundleId,name:b?'Press':'Goal Kick Dig Out',type:'offense',category:'offense',points:'OldGK plays to the left back.',activeSubSceneId:'step-'+b+'-0',subScenes:Array.from({length:11},(_,s)=>({id:'step-'+b+'-'+s,name:'Step '+(s+1),home:oldHome.map(p=>({...p,x:p.x+s/10,y:p.y-s/10})),opponents:[{id:'opponent',x:30+s,y:20}],ball:{x:40+s,y:70-s},drawings:[{type:'arrow',x1:1,y1:2,x2:3,y2:4},{type:'text',x:5,y:6,text:'OldGK: pass here'}]}))}));
const plan=extra=>R.plan({sourceState,targetState,targetPlayers,scenes,formations,...extra});
const input=JSON.stringify({sourceState,targetState,targetPlayers,scenes});let serial=0;const result=R.remap(scenes,plan(),kind=>kind+'-'+ ++serial);
assert.equal(result.length,2);assert.equal(plan().stepCount,22);assert.equal(JSON.stringify({sourceState,targetState,targetPlayers,scenes}),input,'copying must not mutate either lineup or source animation');
for(let b=0;b<2;b++){
 assert.equal(result[b].sourceBundleId,null);assert.equal(result[b].copyAsNew,true);assert.notEqual(result[b].id,scenes[b].id);assert.equal(result[b].subScenes.length,11);
 for(let s=0;s<11;s++){
  const frame=result[b].subScenes[s],old=scenes[b].subScenes[s];assert.notEqual(frame.id,old.id);assert.deepEqual(frame.ball,old.ball);assert.deepEqual(frame.opponents,old.opponents);assert.deepEqual(frame.drawings,old.drawings);
  for(let p=0;p<11;p++){assert.equal(frame.home[p].id,targetPlayers[p].id);assert.equal(frame.home[p].name,targetPlayers[p].name);assert.equal(frame.home[p].role,roles[p]);assert.equal(frame.home[p].x,old.home[p].x);assert.equal(frame.home[p].y,old.home[p].y);}
 }
 assert.equal(result[b].home[0].keeperNumber,31,'compatibility frame must also contain target keeper identity');
}
for(const [formation,shape] of Object.entries(formations)){
 const rr=shape.map(r=>r[0]),a={formation,slots:Object.fromEntries(rr.map((r,i)=>[r,'a'+i]))},b={formation,slots:Object.fromEntries(rr.map((r,i)=>[r,'b'+i]))};
 const actors=rr.map((r,i)=>({id:'a'+i,x:20+i,y:30+i})),targets=rr.map((r,i)=>({id:'b'+i,name:r,number:i}));
 assert.equal(R.plan({sourceState:a,targetState:b,targetPlayers:targets,scenes:[{subScenes:[{home:actors}]}],formations}).ok,true,formation);
}
for(const mutate of [v=>v.targetState.formation='4-4-2',v=>delete v.targetState.slots.GK,v=>v.sourceState.slots.LB=v.sourceState.slots.GK,v=>v.targetState.slots.LB=v.targetState.slots.GK,v=>v.targetPlayers=[],v=>v.scenes[0].subScenes[0].home[0].id='unknown',v=>v.scenes[0].subScenes[0].home[0].x=NaN,v=>v.scenes[0].subScenes.push(...v.scenes[0].subScenes),v=>v.scenes=[]]){const data=plain({sourceState,targetState,targetPlayers,scenes});mutate(data);const blocked=R.plan({...data,formations});assert.equal(blocked.ok,false);assert.throws(()=>R.remap(data.scenes,blocked,()=> 'id'));}
assert.match(plan({targetState:{...targetState,formation:'4-4-2'}}).reason,/source formation 4-2-3-1.*target formation 4-4-2/);
assert.equal(plan({sourceState:{formation:'Freeform / Custom'},targetState:{formation:'Freeform / Custom'}}).ok,false);
const swapped=plain(targetState);swapped.slots.LB='old-2';swapped.slots.LCB='old-1';const swapPlayers=targetPlayers.map((p,i)=>({...p,id:swapped.slots[roles[i]]}));
const swap=R.remap(scenes,plan({targetState:swapped,targetPlayers:swapPlayers}),kind=>kind+'-'+ ++serial);assert.equal(swap[0].subScenes[0].home[1].id,'old-2','same players in new roles must follow the role path, not their old identity');
assert.equal(R.uniqueName('Plan',['plan','Plan Copy']),'Plan Copy 2');assert.ok(R.uniqueName('x'.repeat(70),['x'.repeat(70)]).length<=70);

class Node{
 constructor(id){this.id=id;this.value=id==='strategyLineupSource'?'current':'';this.disabled=false;this.open=false;this.dataset={};this.textContent='';this.className='';this.options=[];this.classList={toggle(){},add(){},remove(){}};}
 set innerHTML(v){this.html=v;this.options=[...v.matchAll(/<option[^>]*value="([^"]*)"/g)].map(m=>({value:m[1]}));}
 get innerHTML(){return this.html||'';}querySelectorAll(){return [];}querySelector(){return null;}addEventListener(){}showModal(){this.open=true;}close(){this.open=false;}scrollIntoView(){}insertAdjacentHTML(_,v){this.innerHTML=v+this.innerHTML;}
}
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
let captain='captain-a',canWrite=true,failInsert=false;const writes=[],rpc=[],storage=new Map();
const tables={match_strategies:[],strategy_scene_bundles:[]};let dbCounter=10;
function from(table){let filters=[],operation='read',payload=null;
 const run=()=>{
  const rows=tables[table]||[];
  if(operation==='insert'){
   writes.push({table,operation,payload:plain(payload)});
   const duplicate=rows.some(r=>r.event_key===payload.event_key&&(table==='match_strategies'?String(r.title).trim().toLowerCase()===String(payload.title).trim().toLowerCase():r.category===payload.category&&String(r.name).trim().toLowerCase()===String(payload.name).trim().toLowerCase()));
   if(failInsert||duplicate)return {error:{code:'23505',message:'conflict'}};
   const record={...plain(payload),id:'90000000-0000-4000-8000-'+String(++dbCounter).padStart(12,'0'),updated_at:new Date().toISOString()};rows.push(record);return {data:record};
  }
  const found=rows.filter(r=>filters.every(([k,v])=>String(r[k])===String(v)));
  if(operation==='update'){writes.push({table,operation,payload:plain(payload)});found.forEach(r=>Object.assign(r,plain(payload)));}
  return {data:found};
 };
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},insert(v){operation='insert';payload=v;return q;},update(v){operation='update';payload=v;return q;},async single(){const r=run();return {...r,data:Array.isArray(r.data)?r.data[0]:r.data};},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]||null};},then(ok,bad){return Promise.resolve(run()).then(ok,bad);}};return q;
}
const roster=targetPlayers.map(p=>({player_key:p.id,number:p.number,name:p.name,temp:p.id.startsWith('temp:'),position:'Midfielder'}));
const variation={id:targetId,event_key:matchB,event_label:'Target game',name:'Target lineup',state:plain(targetState)};
const window={SKORStrategyReuse:R,SKORKeeperPlan:K,SKORLineupMarker:M,SKORPortalCanWrite:()=>canWrite,SKORLineup:{getCaptainKey:()=>captain,getRoster:()=>plain(roster),getState:()=>plain(targetState),getEventKey:()=>matchB,getEventLabel:()=> 'Target game',listVariations:()=>[variation]},SKORSupabase:{from,auth:{getUser:async()=>({data:{user:{id:'80000000-0000-4000-8000-000000000001'}}})},rpc:async(name,args)=>{rpc.push({name,args});return {data:{}};}},dispatchEvent(){}};
const context={window,document:{getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},confirm:()=>true,CustomEvent:class{constructor(type){this.type=type;}}};
const injected=code.replace('  window.SKORStrategy={',`  window.__reuseHarness={set:(d,s,b)=>{draft=d;strategyLibrary=s;bundleLibrary=b;},get:()=>draft,openClone,applyClone,refreshClonePreview,cancelClone,saveSharedStrategy,saveSceneBundle,loadSharedStrategy,loadBundleForEdit,normalizeDraft,renderStrategyLibrary,renderBundleLibrary,sceneForStorage};\n  window.SKORStrategy={`);
vm.runInNewContext(injected,context);const h=window.__reuseHarness;
const sourceDraft=()=>({version:2,title:'Full strategy',source:{id:'saved:source',label:'Source lineup',eventKey:matchA,eventLabel:'Source game',matchId:matchA,variationId:null,formation:sourceState.formation,state:plain(sourceState),roster:[]},opponentFormation:'4-4-2',showLanes:true,activeSceneId:scenes[0].id,scenes:plain(scenes)});
const record={id:strategyId,title:'Saved original',event_key:matchA,event_label:'Source game',match_id:matchA,lineup_name:'Source lineup',lineup_snapshot:plain(sourceState),opponent_formation:'4-4-2',show_lanes:true,scenes:plain(scenes),status:'published',ai_context_enabled:true,updated_at:new Date().toISOString()};
const bundle={id:bundleId,name:'Goal Kick Dig Out',event_key:matchA,event_label:'Source game',match_id:matchA,lineup_name:'Source lineup',lineup_snapshot:plain(sourceState),opponent_formation:'4-4-2',show_lanes:true,category:'offense',scene_type:'offense',coaching_points:'Review OldGK instruction.',subscenes:plain(scenes[0].subScenes),updated_at:new Date().toISOString()};
tables.match_strategies.push(plain(record));tables.strategy_scene_bundles.push(plain(bundle));const originalRecord=JSON.stringify(record),originalBundle=JSON.stringify(bundle);
h.set(sourceDraft(),[record],[bundle]);h.openClone('strategy',strategyId);assert.equal(node('strategyCloneDialog').open,true);assert.equal(node('strategyCloneSubmit').disabled,false);assert.match(node('strategyClonePreview').innerHTML,/22 animation steps/);h.applyClone({preventDefault(){}});
let copied=h.get();assert.equal(copied.source.matchId,matchB);assert.equal(copied.source.variationId,null);assert.equal(copied.copyAsNew,true);assert.equal(copied.scenes.length,2);assert.equal(writes.length,0,'creating copies never performs a database write or publication');assert.equal(rpc.length,0);assert.equal(JSON.stringify(record),originalRecord);assert.equal(JSON.stringify(bundle),originalBundle);
assert.equal(copied.scenes[0].subScenes[0].home[0].keeperNumber,31);assert.match(window.SKORStrategy.renderExportSvg(),/NewGK/);assert.doesNotMatch(window.SKORStrategy.renderExportSvg(),/data-id="old-/);
assert.equal(copied.scenes[0].points,scenes[0].points,'coaching text is intentionally copied unchanged for review');
await h.saveSharedStrategy('draft');assert.equal(writes.at(-1).operation,'insert');assert.equal(writes.at(-1).payload.status,'draft');assert.equal(writes.at(-1).payload.ai_context_enabled,false);assert.equal(writes.at(-1).payload.match_id,matchB);assert.equal(copied.copyAsNew,false);assert.equal(rpc.length,0);
const stored=plain(tables.match_strategies.at(-1));assert.equal(stored.scenes[0].home[0].id,'temp:new-keeper');assert.equal(stored.lineup_snapshot.slots.GK,'temp:new-keeper');
h.loadSharedStrategy(stored);assert.equal(h.get().source.matchId,matchB);assert.equal(h.get().source.state.slots.GK,'temp:new-keeper');assert.equal(h.get().scenes[0].subScenes.length,11,'saved copy reloads all steps and target lineup');
h.set(sourceDraft(),[record],[bundle]);h.openClone('bundle',bundleId);h.applyClone();copied=h.get();assert.equal(copied.scenes.length,1);assert.equal(copied.scenes[0].subScenes.length,11);assert.equal(copied.scenes[0].sourceBundleId,null);
failInsert=true;const callsBefore=writes.length;await h.saveSharedStrategy('draft');assert.equal(writes.length,callsBefore+1);assert.equal(writes.at(-1).operation,'insert');assert.equal(copied.copyAsNew,true);assert.match(node('strategySharedState').textContent,/Rename your copy/);
await h.saveSceneBundle();assert.equal(writes.at(-1).operation,'insert');assert.equal(copied.scenes[0].copyAsNew,true);assert.match(node('strategySharedState').textContent,/Rename your copy/);failInsert=false;
await h.saveSceneBundle();assert.equal(copied.scenes[0].copyAsNew,false);assert.ok(copied.scenes[0].sourceBundleId);assert.equal(tables.strategy_scene_bundles[0].id,bundleId);assert.equal(JSON.stringify(tables.strategy_scene_bundles[0]),originalBundle);
const loaded=h.normalizeDraft(plain(stored));assert.equal(loaded.scenes[0].subScenes[0].home[0].id,'temp:new-keeper');
const editor=sourceDraft();editor.source={...copied.source,state:plain(targetState),roster:plain(roster)};editor.scenes=plain(copied.scenes);editor.activeSceneId=editor.scenes[0].id;h.set(editor,[record],[bundle]);const oldScene=JSON.stringify(editor.scenes[0]);h.openClone('bundle',bundleId,true);assert.equal(node('strategyCloneLineup').disabled,true);h.applyClone();assert.equal(editor.scenes.length,2);assert.equal(JSON.stringify(editor.scenes[0]),oldScene);assert.equal(editor.scenes[1].subScenes[0].home[0].id,'temp:new-keeper');
const mismatch=sourceDraft();mismatch.source.state.formation='4-4-2';h.set(mismatch,[record],[bundle]);h.openClone('strategy');assert.equal(node('strategyCloneSubmit').disabled,true);assert.match(node('strategyCloneError').textContent,/Cannot clone: source formation/);const noChange=JSON.stringify(h.get());h.applyClone();assert.equal(JSON.stringify(h.get()),noChange);
h.set(sourceDraft(),[record],[bundle]);h.openClone('strategy');captain='captain-b';h.applyClone();assert.match(node('strategyCloneError').textContent,/account changed/);h.cancelClone();assert.equal(node('strategyCloneDialog').open,false);captain='captain-a';canWrite=false;h.openClone('strategy');assert.equal(node('strategyCloneDialog').open,false);canWrite=true;
const tinker=sourceDraft();tinker.source={...tinker.source,id:'current',eventKey:'tinker',matchId:null};assert.equal(h.normalizeDraft(tinker).source.matchId,null,'explicit Tinker copies never inherit the currently selected game on reload');
h.set(sourceDraft(),[record],[bundle]);h.openClone('strategy');node('strategyCloneLineup').value='saved:'+targetId;h.refreshClonePreview(true);h.applyClone();assert.equal(h.get().source.variationId,targetId,'saved target lineup identity is retained');
h.set(sourceDraft(),[record],[bundle]);h.openClone('strategy');const originalNumber=roster[1].number;roster[1].number=88;h.applyClone();assert.equal(h.get().source.matchId,matchA);assert.match(node('strategyCloneError').textContent,/target lineup changed/);h.applyClone();assert.equal(h.get().scenes[0].subScenes[0].home[1].number,88,'a changed target requires a refreshed mapping to be reviewed');roster[1].number=originalNumber;
h.set(sourceDraft(),[record],[bundle]);const originalName=roster[1].name;roster[1].name='<img/onerror=alert(1)>';h.openClone('strategy');assert.doesNotMatch(node('strategyClonePreview').innerHTML,/<img/);assert.match(node('strategyClonePreview').innerHTML,/&lt;img/);h.cancelClone();roster[1].name=originalName;
h.set(sourceDraft(),[record],[bundle]);h.openClone('strategy');node('strategyCloneLineup').value='saved:missing';h.refreshClonePreview();assert.equal(node('strategyCloneSubmit').disabled,true);assert.match(node('strategyCloneError').textContent,/no longer available/);h.cancelClone();
const writesBeforeEdit=writes.length;h.loadBundleForEdit(bundleId);assert.equal(h.get().source.matchId,matchA);assert.equal(h.get().scenes[0].sourceBundleId,bundleId);assert.equal(h.get().scenes[0].subScenes[0].home[0].id,'old-0');assert.equal(writes.length,writesBeforeEdit,'Edit original uses its own lineup and does not save automatically');
for(const id of ['strategyCloneAll','strategyCloneBundle','strategyCloneDialog','strategyCloneLineup','strategyClonePreview','strategyCloneSubmit'])assert.match(html,new RegExp('id="'+id+'"'));
assert.match(html,/Coaching notes and text labels stay unchanged/);assert.match(code,/data-strategy-clone/);assert.match(code,/data-bundle-clone/);assert.match(code,/openClone\('bundle',id,true\)/);assert.match(code,/draft\.copyAsNew===true/);
for(const script of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script[1]);
console.log('Strategy reuse verified: all formations, 11-step bundles/whole strategies, role swaps, target keeper/TEMP metadata, movement/opponent/ball/marks preservation, mismatch/incomplete guards, UI preview/apply, independent drafts, append mode, insert-only strategy/bundle saves, duplicate conflicts, Tinker reload, export identities and unchanged originals.');
