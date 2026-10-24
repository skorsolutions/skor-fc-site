import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const admin=read('admin.html'),css=read('keeper-plan.css');
const source=admin.slice(admin.indexOf('  function renderVariations(){'),admin.indexOf('  async function refreshTinkerVariations(){'));
assert.match(admin,/>Saved Game Variations /);
assert.match(admin,/<details class="panel saved-tinker-variations" id="savedTinkerVariationsPanel">/);
assert.doesNotMatch(admin,/<details[^>]*id="savedTinkerVariationsPanel"[^>]*\bopen\b/);
assert.ok(admin.indexOf('id="lineupVariationList"')<admin.indexOf('id="savedTinkerVariationsPanel"'));
assert.ok(admin.indexOf('id="savedTinkerVariationsPanel"')<admin.indexOf('<h2>Planned Substitutions</h2>'));
assert.match(css,/#tinkerVariationList\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
assert.match(css,/#tinkerVariationList \.variation-card-actions\{flex-wrap:wrap/);
assert.match(admin,/body\.viewer-mode #tinkerVariationList \.variation-delete\{display:none!important/);
assert.match(admin,/\[refreshBtn,refreshSavedTinkerBtn\]\.forEach/);

// Execute the real renderer and its event handlers in two independent list nodes.
class List {
  set innerHTML(value){
    this.markup=value;this.buttons=[];
    for(const match of value.matchAll(/data-(load|copy|delete|final)-variation="([^"]*)"/g)){
      const key=match[1]+'Variation';
      this.buttons.push({kind:match[1],dataset:{[key]:match[2]},addEventListener(event,fn){this[event]=fn;}});
    }
  }
  get innerHTML(){return this.markup;}
  querySelectorAll(selector){return this.buttons.filter(b=>selector==='[data-'+b.kind+'-variation]');}
}
const nodes=new Map([
  ['lineupVariationList',new List()],['tinkerVariationList',new List()],
  ['lineupVariationCount',{}],['tinkerVariationCount',{}],
  ['savedTinkerVariationsPanel',{open:false}],['lineupEvent',{value:'tinker',options:[]}],
]);
const snapshot={formation:'4-2-3-1',slots:{GK:'keeper'},bench:['cover'],keeperPlan:{spareNumbers:[30],assignments:{keeper:{role:'starting_temp',jerseyNumber:30}}}};
const row=(id,event_key,created_at,is_production=false)=>({id,event_key,event_label:event_key,name:id,state:structuredClone(snapshot),created_at,is_production,created_by_name:'Fixture Captain'});
const library=[row('game-new','game-1','2026-10-24'),row('tinker-new','tinker','2026-10-24'),row('game-old','game-2','2026-10-20',true),row('tinker-old','tinker','2026-10-19')];
const original=JSON.stringify(library),calls={copies:[],loaded:[],deleted:[],finals:[],blocked:[],refreshes:0};
const context={
  allSharedVariations:library,sharedVariations:[],sharedTinkerVariations:library.filter(r=>r.event_key==='tinker'),
  document:{getElementById:id=>nodes.get(id)},eventKey:()=> 'tinker',
  normalizeState:structuredClone,isFreeform:f=>f==='Freeform / Custom',formatStamp:v=>v,
  esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  updateProductionCurrentButton(){},updateVariationSaveButton(){},renderEventOptions(){
    nodes.get('lineupEvent').options=library.map(r=>({value:r.event_key==='tinker'?'variation:'+r.id:r.event_key}));
  },
  async refreshTempPlayers(){},async refreshTinkerVariations(){},
  loadVariationRecord:r=>calls.loaded.push(r),openCopyLineupDialog:r=>calls.copies.push(r),
  window:{SKORPortalCanWrite:()=>true,SKORViewerBlocked:message=>calls.blocked.push(message)},
  confirm:()=>true,checkKeepers:()=>true,markStatus(){},
  sbClient:()=>({
    from:()=>({delete:()=>({eq:async(field,id)=>{assert.equal(field,'id');calls.deleted.push(id);return {error:null};}})}),
    rpc:async(name,args)=>{calls.finals.push({name,args});return {error:null};},
  }),
  async refreshVariations(){
    calls.refreshes++;
    context.allSharedVariations=context.allSharedVariations.filter(r=>!calls.deleted.includes(r.id));
    context.renderVariations();
  },
};
vm.createContext(context);vm.runInContext(source,context);context.renderVariations();
const games=nodes.get('lineupVariationList'),tinkers=nodes.get('tinkerVariationList'),disclosure=nodes.get('savedTinkerVariationsPanel');
const button=(box,kind,id)=>box.buttons.find(b=>b.kind===kind&&b.dataset[kind+'Variation']===id);
assert.equal(nodes.get('lineupVariationCount').textContent,2);
assert.equal(nodes.get('tinkerVariationCount').textContent,2);
assert.match(games.innerHTML,/game-new/);assert.doesNotMatch(games.innerHTML,/tinker-new/);
assert.match(tinkers.innerHTML,/tinker-new/);assert.doesNotMatch(tinkers.innerHTML,/game-new/);
assert.ok(tinkers.innerHTML.indexOf('tinker-new')<tinkers.innerHTML.indexOf('tinker-old'));
assert.equal(games.querySelectorAll('[data-final-variation]').length,2);
assert.equal(tinkers.querySelectorAll('[data-final-variation]').length,0);
assert.equal(disclosure.open,false);
assert.equal(JSON.stringify(library),original,'rendering cannot mutate saved boards or keeper state');

disclosure.open=true;context.renderVariations();assert.equal(disclosure.open,true,'refreshing lists must preserve the disclosure choice');
await button(tinkers,'load','tinker-new').click();
assert.equal(nodes.get('lineupEvent').value,'variation:tinker-new');
assert.equal(calls.loaded.at(-1).id,'tinker-new');assert.equal(disclosure.open,true);
await button(games,'load','game-new').click();
assert.equal(nodes.get('lineupEvent').value,'game-1');assert.equal(calls.loaded.at(-1).id,'game-new');
button(tinkers,'copy','tinker-new').click();button(games,'copy','game-new').click();
assert.deepEqual(calls.copies.map(c=>c.sourceEventKey),['tinker','game-1']);
assert.deepEqual(calls.copies[0].snapshot.keeperPlan,snapshot.keeperPlan,'copy receives complete keeper state');

await button(games,'final','game-new').click();
assert.equal(calls.finals[0].name,'set_production_lineup');assert.equal(calls.finals[0].args.p_variation_id,'game-new');
context.window.SKORPortalCanWrite=()=>false;
await button(tinkers,'delete','tinker-new').click();await button(games,'final','game-new').click();
assert.equal(calls.deleted.length,0);assert.equal(calls.finals.length,1);assert.equal(calls.blocked.length,2);
context.window.SKORPortalCanWrite=()=>true;
await button(tinkers,'delete','tinker-new').click();
assert.deepEqual(calls.deleted,['tinker-new']);assert.equal(nodes.get('tinkerVariationCount').textContent,1);assert.equal(nodes.get('lineupVariationCount').textContent,2);
assert.equal(disclosure.open,true);
await button(games,'delete','game-new').click();assert.equal(nodes.get('lineupVariationCount').textContent,1);

context.allSharedVariations=[];context.sharedVariations=[];context.renderVariations();
assert.match(games.innerHTML,/No saved game variations yet/);assert.match(tinkers.innerHTML,/No saved Tinker variations yet/);
assert.equal(nodes.get('lineupVariationCount').textContent,0);assert.equal(nodes.get('tinkerVariationCount').textContent,0);
assert.equal(games.buttons.length+tinkers.buttons.length,0,'empty lists must remove stale action handlers');
context.sharedVariations=[row('<img src=x>','tinker','2026-10-24')];context.renderVariations();
assert.equal(nodes.get('tinkerVariationCount').textContent,1);assert.equal(nodes.get('lineupVariationCount').textContent,0);
assert.doesNotMatch(tinkers.innerHTML,/<img/);assert.match(tinkers.innerHTML,/&lt;img/);
disclosure.open=false;context.renderVariations();assert.equal(disclosure.open,false);
console.log('Saved variations verified: split counts and empty states, default disclosure, load/copy/delete in both lists, game-only publication, viewer guards, escaping and preserved keeper snapshots.');
