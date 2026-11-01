import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),W=require('../sub-wave-plan.js');
const admin=fs.readFileSync('admin.html','utf8');
const row=(out=[],incoming=[])=>({label:'',unit:'mixed',minute:null,out,in:incoming});
const base=()=>({formation:'4-2-3-1',slots:{GK:'keeper',LB:'tom',RB:'sam'},freeform:{},bench:['alex','temp:guest'],subs:{firstHalf:[row(['tom'],['alex']),row(['alex'],['tom'])],secondHalf:[row(['sam'],['temp:guest'])]},keeperPlan:{spareNumbers:[30],assignments:{}},depth:{}});
const before=JSON.stringify(base()),p=W.project(base());
assert.equal(JSON.stringify(base()),before);
assert.deepEqual(p.starters,['keeper','tom','sam']);
assert.deepEqual(p.frames.firstHalf[0].before.bench,['alex','temp:guest']);
assert.deepEqual(p.frames.firstHalf[0].before.field,['keeper','tom','sam']);
assert.deepEqual(p.frames.firstHalf[0].after.bench,['temp:guest','tom']);
assert.ok(p.frames.firstHalf[1].before.field.includes('alex'));
assert.ok(p.frames.firstHalf[1].before.bench.includes('tom'));
assert.ok(p.frames.secondHalf[0].before.field.includes('tom'));
assert.ok(!p.frames.secondHalf[0].before.field.includes('alex'));
assert.ok(p.final.field.includes('temp:guest'));
assert.deepEqual(p.problems,[]);
assert.ok(!W.canToggle(p.frames.firstHalf[0],'in','sam'));
assert.ok(!W.canToggle(p.frames.firstHalf[0],'out','alex'));
assert.ok(W.canToggle(p.frames.firstHalf[0],'in','temp:guest'));
assert.ok(!W.canToggle(null,'in','alex'));
assert.ok(!W.canToggle(p.frames.firstHalf[0],'bogus','alex'));

// Reordering and lineup edits retain selections but flag them and do not invent swaps.
for(const mutate of [s=>s.subs.firstHalf.reverse(),s=>{s.slots.LB='alex';s.bench=['tom','temp:guest'];},s=>{s.subs.firstHalf[0].out.push('sam');},s=>{s.subs.firstHalf[0].in=['alex','alex'];},s=>{s.subs.firstHalf[0]=row(['tom'],['tom']);},s=>{s.subs.firstHalf[0].in=['not-in-squad'];}]){
  const s=base();mutate(s);const saved=JSON.stringify(s),plan=W.project(s);
  assert.ok(plan.problems.length);assert.equal(plan.frames.firstHalf[0].applied,false);
  assert.deepEqual(plan.frames.firstHalf[0].before,plan.frames.firstHalf[0].after);
  assert.equal(plan.frames.firstHalf[1].upstreamInvalid,true);
  assert.equal(JSON.stringify(s),saved,'projection must not rewrite old/stale selections');
  for(const side of ['out','in'])for(const pid of plan.frames.firstHalf[0][side])assert.ok(W.canToggle(plan.frames.firstHalf[0],side,pid),'stale selections remain removable');
}
const unknown=W.project(base(),['keeper','tom','sam','temp:guest']);
assert.ok(unknown.problems[0].invalidIn.includes('alex'));
const free=base();free.formation='Freeform / Custom';free.freeform={keeper:{x:50,y:90},tom:{x:20,y:60},sam:{x:80,y:60}};free.slots={ST:'ignored'};
assert.deepEqual(W.project(free).starters,p.starters);
assert.deepEqual(W.project(JSON.parse(JSON.stringify(base()))),p,'JSON save/reload retains projected choices and starter identity');

// Long rolling plans preserve player counts and disjoint field/bench across both halves.
for(let seed=0;seed<200;seed++){
  const s={formation:'4-3-3',slots:Object.fromEntries(Array.from({length:11},(_,i)=>['P'+i,'p'+i])),bench:['p11','p12','temp:guest'],subs:{firstHalf:[],secondHalf:[]}};
  const f=new Set(Object.values(s.slots)),b=new Set(s.bench);
  for(let i=0;i<16;i++){
    const out=[...f][(seed+i)%f.size],incoming=[...b][(seed*3+i)%b.size];
    s.subs[i<8?'firstHalf':'secondHalf'].push(row([out],[incoming]));
    f.delete(out);b.add(out);b.delete(incoming);f.add(incoming);
  }
  const saved=JSON.stringify(s),plan=W.project(s);
  assert.equal(JSON.stringify(s),saved);assert.equal(plan.problems.length,0);
  for(const frame of [...plan.frames.firstHalf,...plan.frames.secondHalf]){
    assert.equal(frame.after.field.length,11);assert.equal(frame.after.bench.length,3);
    assert.ok(frame.after.field.every(pid=>!frame.after.bench.includes(pid)));
    assert.equal(new Set([...frame.after.field,...frame.after.bench]).size,14);
  }
  assert.deepEqual(new Set(plan.final.field),f);assert.deepEqual(new Set(plan.final.bench),b);
}

// Execute actual editor normalization, renderers and selection handlers with a DOM harness.
const extract=name=>{
  const start=admin.indexOf('  function '+name+'(');
  assert.ok(start>=0,name);const end=admin.indexOf('\n  }',start)+4;
  return admin.slice(start,end);
};
const roster=['keeper','tom','sam','alex','temp:guest','not-in-squad'].map((player_key,i)=>({player_key,number:i+1,name:player_key==='temp:guest'?'Anton- TEMP':player_key,temp:player_key==='temp:guest'}));
const buttons=[];let rendered='',persisted=0,status='';
const box={get innerHTML(){return rendered;},set innerHTML(value){rendered=value;buttons.length=0;for(const m of value.matchAll(/<button[^>]*data-sub-chip="1"[^>]*>/g)){const a=Object.fromEntries([...m[0].matchAll(/data-sub-(side|phase|index|player)="([^"]*)"/g)].map(x=>['sub'+x[1][0].toUpperCase()+x[1].slice(1),x[2]]));buttons.push({dataset:a,addEventListener(event,fn){this.click=fn;}});}},querySelector(){return null;},querySelectorAll(sel){return sel==='[data-sub-chip]'?buttons:[];}};
const ctx=vm.createContext({window:{SKORSubWavePlan:W,SKORKeeperPlan:require('../keeper-plan.js')},roster,state:base(),SUB_UNITS:['defense','midfield','strikers','mixed'],FREEFORM:'Freeform / Custom',formations:{'4-2-3-1':[], '4-3-3':[]},document:{getElementById:()=>box},persistDraft(){persisted++;},renderGameplanPreview(){},markStatus(value){status=value;},console});
vm.runInContext(`const id=p=>p.player_key;const player=pid=>roster.find(p=>id(p)===pid);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));const playerListLabel=p=>'#'+p.number+' '+p.name;const isFreeform=f=>f===FREEFORM;const depthPositionsForFormation=()=>[];`,ctx);
for(const name of ['defaultSubUnit','subUnitLabel','blankSubRow','normalizeSubs','normalizeState','ordinal','projectedSubPlan','subFrame','startedBadge','subChipListHTML','benchAfterWave','subWaveBenchHTML','subWaveReviewHTML','checkSubPlan','subRowHTML','firstHalfBenchCoverage','firstHalfCoverageHTML','subPhaseHTML','renderSubPlan'])vm.runInContext(extract(name),ctx);
const run=code=>vm.runInContext(code,ctx);
assert.equal(run('checkSubPlan()'),true);
run('renderSubPlan()');
let firstOut=buttons.filter(b=>b.dataset.subPhase==='firstHalf'&&b.dataset.subIndex==='0'&&b.dataset.subSide==='out').map(b=>b.dataset.subPlayer);
let firstIn=buttons.filter(b=>b.dataset.subPhase==='firstHalf'&&b.dataset.subIndex==='0'&&b.dataset.subSide==='in').map(b=>b.dataset.subPlayer);
assert.deepEqual(firstOut,['keeper','tom','sam']);assert.deepEqual(firstIn,['alex','temp:guest']);
assert.match(run("subWaveBenchHTML('firstHalf',0)"),/sub-original-starter[^>]*>[^<]*tom<small class="sub-started-label">Started/);
assert.doesNotMatch(run("subWaveBenchHTML('firstHalf',0)"),/alex<small class="sub-started-label">Started/);
assert.match(run("subChipListHTML([], 'firstHalf',1,'in')"),/tom<small class="sub-started-label">Started/);
assert.doesNotMatch(run("subChipListHTML([], 'firstHalf',0,'in')"),/data-sub-player="not-in-squad"/);
// A normal chip event updates saved IDs, re-renders dependent waves and persists once.
buttons.find(b=>b.dataset.subPhase==='firstHalf'&&b.dataset.subIndex==='0'&&b.dataset.subSide==='in'&&b.dataset.subPlayer==='alex').click();
assert.equal(persisted,1);assert.equal(run('state.subs.firstHalf[0].in.length'),0);
assert.match(rendered,/same number of Players Out and Players In/);
assert.equal(run('checkSubPlan()'),false);assert.match(status,/first-half sub wave 1/);
buttons.find(b=>b.dataset.subPhase==='firstHalf'&&b.dataset.subIndex==='0'&&b.dataset.subSide==='in'&&b.dataset.subPlayer==='alex').click();
assert.equal(run('checkSubPlan()'),true);
// A stale old DOM button cannot add an ineligible player after the board changes.
const stale=buttons.find(b=>b.dataset.subPhase==='firstHalf'&&b.dataset.subIndex==='0'&&b.dataset.subSide==='in'&&b.dataset.subPlayer==='temp:guest');
run("state.slots.RB='temp:guest';state.bench=['alex','sam'];");const count=persisted;stale.click();assert.equal(persisted,count);
// Legacy/invalid choices remain visible and removable; duplicate errors survive normalization.
run("state=JSON.parse("+JSON.stringify(JSON.stringify(base()))+");state.subs.firstHalf[0].in=['tom'];renderSubPlan();");
assert.match(rendered,/sub-invalid/);assert.match(rendered,/Remove \/ reselect/);
buttons.find(b=>b.dataset.subPhase==='firstHalf'&&b.dataset.subIndex==='0'&&b.dataset.subSide==='in'&&b.dataset.subPlayer==='tom').click();
assert.equal(run('state.subs.firstHalf[0].in.length'),0);
run("state.subs.firstHalf[0].in=['alex','alex'];");assert.equal(run('checkSubPlan()'),false);
run("state=normalizeState({formation:'4-2-3-1',slots:{LB:'tom'},bench:['alex'],subs:{first:{out:'tom',in:'alex'},second:{},halftime:[]}})");
assert.equal(run('projectedSubPlan().frames.firstHalf[0].applied'),true,'old scalar/first/second saved shape still loads');
run("state=JSON.parse("+JSON.stringify(JSON.stringify(base()))+");state.subs.firstHalf[0].out=['alex'];");
assert.equal(run('firstHalfBenchCoverage().plannedIn.has("alex")'),false,'invalid wave does not claim bench minutes');

// Exercise the real save helper: draft writes preserve IDs, Final overwrite rejects a bad plan.
const saveStart=admin.indexOf('  async function saveOrOverwriteVariation('),saveEnd=admin.indexOf('\n  }',saveStart)+4;
let stored=null,existingFinal=false;
ctx.normalizedVariationName=value=>String(value).trim().toLowerCase();
vm.runInContext(admin.slice(saveStart,saveEnd),ctx);
const client={from(){return {
  select(){return {eq(){return {order:async()=>({data:stored?[{id:'saved',name:stored.name,is_production:existingFinal}]:[],error:null})};}};},
  insert:async payload=>{stored=structuredClone(payload);return {error:null};},
  update(payload){return {eq:async()=>{stored=structuredClone(payload);return {error:null};}};}
};}};
const validPayload={event_key:'game',name:'Balanced',state:base()};
await ctx.saveOrOverwriteVariation(client,validPayload);
assert.deepEqual(stored,validPayload);
run('state=normalizeState('+JSON.stringify(JSON.stringify(stored.state))+');');
assert.equal(run('checkSubPlan()'),true);
const incomplete=structuredClone(validPayload);incomplete.state.subs.firstHalf[0].in=[];
await ctx.saveOrOverwriteVariation(client,incomplete);
assert.deepEqual(stored.state.subs,incomplete.state.subs,'unfinished draft stays saveable without repair');
existingFinal=true;
await assert.rejects(()=>ctx.saveOrOverwriteVariation(client,incomplete),/Correct the planned sub waves/);
await ctx.saveOrOverwriteVariation(client,validPayload);
assert.deepEqual(stored.state.subs,validPayload.state.subs,'valid Final overwrite keeps canonical saved wave payload');

for(const match of admin.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
assert.ok(admin.indexOf('sub-wave-plan.js?v=58.27')<admin.indexOf('function subChipListHTML'));
assert.match(admin,/if\(!checkKeepers\(rec.state\)\|\|!checkSubPlan\(rec.state\)\)return/);
assert.match(admin,/if\(!checkKeepers\(\)\|\|!checkSubPlan\(\)\)return/);
assert.match(admin,/existing.is_production===true&&!checkSubPlan\(payload.state\)/);
assert.match(admin,/async function exportGameplanAs\(format\)\{\s*if\(!checkSubPlan\(\)\)return/);
assert.match(admin,/\.sub-player-chip\.sub-original-starter\.selected\{background:#f2ca66/);
assert.match(admin,/\.sub-player-chip\{display:inline-flex[^}]*min-height:44px[^}]*max-width:100%/);
assert.match(admin,/\.sub-player-chip:focus-visible/);
console.log('Sub-wave projection, 200 rolling plans, legacy persistence, actual editor rendering/selection and publication/export guards passed.');
