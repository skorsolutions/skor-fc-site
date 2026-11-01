import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire,stripTypeScriptTypes} from 'node:module';
const require=createRequire(import.meta.url),J=require('../match-jerseys.js'),K=require('../keeper-plan.js'),M=require('../lineup-marker.js'),R=require('../ref-game-card.js');
const read=f=>fs.readFileSync(f,'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const roster=[{player_key:'regular-a',number:null,name:'Alex',fullName:'Alex Example',temp:false},{player_key:'regular-b',number:null,name:'Alex',fullName:'Alex Other',temp:false},{player_key:'keeper',number:1,name:'Keeper',position:'Keeper',temp:false},{player_key:'temp:g',number:40,name:'Guest',temp:true}];
const start={formation:'4-2-3-1',slots:{GK:'keeper',LB:'regular-a',RB:'regular-b'},bench:['temp:g'],keeperPlan:K.normalize(null)};
for(const x of [null,undefined,'',0,-1,100,'TBD','null',NaN,Infinity,1.5])assert.equal(J.number(x),null);
for(let n=1;n<=99;n++)assert.equal(J.number(String(n)),n);
assert.equal(J.label(null),'TBD');assert.equal(J.label(0),'TBD');
assert.equal(J.normalize(JSON.parse('{"__proto__":15,"constructor":17,"temp:g":8,"regular-a":18}'))['__proto__'],Object.prototype);
assert.equal(Object.hasOwn(J.normalize(JSON.parse('{"__proto__":15}')),'__proto__'),false);
const state=J.capture({...start,matchJerseys:{'regular-a':18,'regular-b':19}},roster),original=JSON.stringify(state),originalRoster=JSON.stringify(roster);
assert.equal(J.resolve(state,'regular-a',null),18);assert.equal(J.resolve({},'regular-a',null),null);
assert.deepEqual(J.validate(state,roster),[]);assert.equal(J.available(state,roster,'regular-a',19),false);assert.equal(J.available(state,roster,'regular-a',40),false);
assert.equal(J.available(state,roster,'regular-a',22),true);
assert.equal(J.projectRoster(state,roster)[0].temp,false);assert.equal(JSON.stringify(roster),originalRoster);
const later=roster.map(p=>p.player_key==='regular-a'?{...p,number:58}:p);
assert.equal(J.resolve(state,'regular-a',58),18,'old game keeps its saved borrowed jersey');
assert.equal(J.projectRoster(state,later)[0].number,18);
assert.equal(J.projectRoster({},later)[0].number,58,'new board uses the new permanent number');
assert.equal(J.resolve({matchJerseys:{'regular-a':null}},'regular-a',58),null,'explicit TBD never turns into a later permanent number');
assert.equal(JSON.stringify(state),original);
for(let n=1;n<=99;n++){
  const snapshot=J.capture({...start,matchJerseys:{'regular-a':n,'regular-b':n===99?98:n+1}},roster);
  const reloaded=JSON.parse(JSON.stringify(snapshot));assert.deepEqual(J.projectRoster(reloaded,roster),J.projectRoster(snapshot,roster));
  assert.equal(J.resolve(reloaded,'regular-a',58),n);
}
const match={id:'fixture',kickoff:'2026-11-01T18:00:00Z',home_team:'SKOR FC',away_team:'Visitors',location:'Fixture field'};
const card=R.buildCardData({state,roster,match});assert.equal(R.validateCardData(card).valid,true);
assert.equal(card.players.find(p=>p.id==='regular-a').number,18);assert.equal(card.players.find(p=>p.id==='regular-a').temp,false);
const pending=R.buildCardData({state:{...state,matchJerseys:{'regular-a':null,'regular-b':19}},roster,match});assert.equal(R.validateCardData(pending).valid,false);assert.match(R.validateCardData(pending).errors.join(' '),/Alex Example/);
const keeperState={...state,slots:{GK:'regular-a',LB:'keeper'},bench:['regular-b','temp:g'],keeperPlan:{spareNumbers:[30],assignments:{'regular-a':{role:'starting_temp',jerseyNumber:30}}}};
assert.equal(R.buildCardData({state:keeperState,roster,match}).players.find(p=>p.id==='regular-a').jerseyLabel,'18 / 30');

const admin=read('admin.html');
function fn(source,name,indent='  '){
  const pattern=new RegExp('(?:async )?function '+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\('),m=source.match(pattern);assert.ok(m,name);
  const a=m.index,line=source.slice(a,source.indexOf('\n',a));
  if(line.includes('}')&&line.trimEnd().endsWith('}'))return line;
  const b=source.indexOf('\n'+indent+'}',a);assert.ok(b>a,name+' end');return source.slice(a,b+indent.length+2);
}
// Actual native select renderer: available choices, blank TBD, account write guard.
let markup='',selects=[],writes=0,errors=0,allowed=true;
const rows={set innerHTML(s){markup=s;selects=[...s.matchAll(/data-match-jersey="([^"]+)"/g)].map(m=>({dataset:{matchJersey:m[1]},value:'',addEventListener(e,cb){this[e]=cb;}}));},get innerHTML(){return markup;},querySelectorAll(){return selects;}};
const editorContext={SKORMatchJerseys:J,document:{getElementById:()=>rows}};vm.runInNewContext(read('match-jerseys-editor.js'),editorContext);
const editState=structuredClone(state);const render=()=>editorContext.SKORMatchJerseysEditor.render({state:editState,roster,id:p=>p.player_key,canWrite:()=>allowed,onChange:()=>writes++,onError:()=>errors++});render();
assert.equal(selects.length,3);assert.match(markup,/Permanent: TBD/);assert.match(markup,/TBD — choose before referee export/);
let select=selects.find(s=>s.dataset.matchJersey==='regular-a');select.value='19';select.change();assert.equal(errors,1);assert.equal(writes,0);
select.value='22';select.change();assert.equal(writes,1);assert.equal(editState.matchJerseys['regular-a'],22);
allowed=false;select.value='23';select.change();assert.equal(writes,1);assert.equal(editState.matchJerseys['regular-a'],22);

// Execute actual lineup, public/Crowd and Strategy adapters.
const editor={window:{SKORMatchJerseys:J,SKORKeeperPlan:K,SKORLineupMarker:M},state,roster,id:p=>p.player_key};
vm.runInNewContext(fn(admin,'primaryJerseyLabel'),editor);assert.equal(editor.primaryJerseyLabel(roster[0]),'18');assert.equal(editor.primaryJerseyLabel({...roster[0],player_key:'unassigned'}),'TBD');
for(const [file,first,last,list]of [['matches.html','productionPlayer','renderOfficialLineup','publicRoster'],['gameday.html','matchLineupPlayer','matchSubUnitLabel','roster']]){
  const source=read(file),ctx={window:{SKORMatchJerseys:J,SKORKeeperPlan:K,SKORLineupMarker:M},productionLineup:{state},productionTempPlayers:[{id:'g',display_name:'Guest',jersey_number:40}],[list]:roster.filter(p=>!p.temp).map(p=>({...p,display_name:p.name,jersey_number:p.number}))};
  vm.runInNewContext(source.slice(source.indexOf('function '+first+'('),source.indexOf('function '+last+'(')),ctx);
  assert.equal(ctx[first]('regular-a').number,'18');assert.equal(ctx[first]('regular-a').temp,false);assert.equal(ctx[first]('temp:g').temp,true);
}
const strategy=read('strategy.js'),shape={};vm.runInNewContext(strategy.slice(strategy.indexOf('  const HOME_FORMATIONS='),strategy.indexOf('  const TYPE_LABELS=')).replace('const HOME_FORMATIONS=','globalThis.formations='),shape);
const st={window:{SKORMatchJerseys:J,SKORKeeperPlan:K,SKORLineupMarker:M},HOME_FORMATIONS:shape.formations,clamp:(n,a,b)=>Math.max(a,Math.min(b,n))};
vm.runInNewContext(fn(strategy,'playerName')+'\n'+fn(strategy,'playersFromLineup'),st);
assert.equal(st.playersFromLineup(state,roster).find(p=>p.id==='regular-a').number,18);
assert.equal(st.playersFromLineup({...start,matchJerseys:{}},roster).find(p=>p.id==='regular-a').number,'TBD');

// Real event selection carries stable keys despite identical names and pending numbers.
const gd={ROSTER:roster.filter(p=>!p.temp),PRODUCTION_GAMEPLAN:{state},window:{SKORMatchJerseys:J},MATCH_TEMP_PLAYERS:[]};
for(const name of ['playerValue','parsePlayerChoice','selectedPlayerData'])vm.runInNewContext(fn(admin,name,''),gd);
for(const id of ['regular-a','regular-b']){
  const value=gd.playerValue(roster.find(p=>p.player_key===id)),selected=gd.selectedPlayerData({value},{value:''},{value:''});
  assert.equal(selected.playerKey,id);assert.equal(selected.rosterNumber,null);assert.equal(selected.number,id==='regular-a'?18:19);
}

// Real public squad renderer and stats loader keep same-name TBD players separate.
for(const file of ['players.html','squad.html']){
  const html=read(file);assert.ok(!html.slice(0,html.indexOf('<script src=')).includes('${'),'static public HTML must not contain template placeholders');const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}});return nodes.get(id);};
  const publicRoster=roster.slice(0,2).map(p=>({player_key:p.player_key,number:'TBD',name:p.name}));
  const cards=publicRoster.map(p=>({dataset:{playerKey:p.player_key,playerNumber:'TBD',playerName:p.name},querySelector(selector){return this[selector]??=( {textContent:''});}}));
  const ctx={roster:publicRoster,document:{getElementById:node,querySelectorAll:()=>cards},console,statsDb:{rpc:async()=>({data:{players:[{player_key:'regular-a',number:'TBD',name:'Alex',goals:1},{player_key:'regular-b',number:'TBD',name:'Alex',goals:3}],totals:{goals:4}}})}};
  for(const name of ['rosterEsc','rosterInitial','renderRosterCards','norm','publicStatKey','playerKey','statIdentity','displayPlayer','newStat','bestPlayer','loadSeasonStats'])vm.runInNewContext(fn(html,name,''),ctx);
  ctx.renderRosterCards();assert.match(node('squadGrid').innerHTML,/>TBD<\/div>/);assert.doesNotMatch(node('squadGrid').innerHTML,/#TBD|null|undefined/);
  await ctx.loadSeasonStats();assert.equal(cards[0]['[data-stat="goals"]'].textContent,1);assert.equal(cards[1]['[data-stat="goals"]'].textContent,3);
}

// AI uses only the match-resolved number for every player reference in its approved lineup context.
const edge=read('supabase/functions/generate-pregame-talk/index.ts'),a=edge.indexOf('  const buildLineupContext ='),b=edge.indexOf('  const productionLineupContext =',a);
const ai={keeperPlan:K,matchJerseys:J,rosterResult:{data:roster},lineupPlayer:id=>({first_name:'Alex',jersey_number:null,temporary:String(id).startsWith('temp:')}),objectValue:v=>v&&typeof v==='object'?v:{},clean:(v,max)=>String(v??'').slice(0,max)};
vm.runInNewContext(stripTypeScriptTypes(edge.slice(a,b)+'\nglobalThis.makeContext=buildLineupContext;'),ai);
const context=ai.makeContext({...state,subs:{firstHalf:[{out:['regular-a'],in:['regular-b']}]},captainId:'regular-a'},{status:'test',name:'Test',updated_at:null});
assert.equal(context.starting_lineup.find(p=>p.position==='LB').player.jersey_number,18);assert.equal(context.planned_substitutions[0].players_in[0].jersey_number,19);assert.equal(context.field_captain.jersey_number,18);
assert.equal(read('match-jerseys.js'),read('supabase/functions/generate-pregame-talk/match-jerseys.js'));
const guest=read('guest-profiles.js');assert.match(guest,/Permanent squad number \(optional\)/);assert.doesNotMatch(guest,/name="number"[^>]*required/);
assert.match(admin,/s\.matchJerseys=\{\}/);assert.match(admin,/SKORMatchJerseys.capture/);
assert.match(read('docs/sql/OPTIONAL-SQUAD-NUMBERS.sql'),/DROP CONSTRAINT roster_regular_jersey_required/);
assert.match(read('docs/sql/OPTIONAL-SQUAD-NUMBERS.sql'),/\^\[0-9\]\{1,2\}\$' then/);
assert.match(read('docs/sql/OPTIONAL-SQUAD-NUMBERS.sql'),/end else r.jersey_number end,r.is_guest/);
for(const file of ['admin.html','player-portal.html','players.html','squad.html','matches.html','gameday.html'])for(const m of read(file).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
console.log('Optional numbers: pending/assigned/historical jerseys, collisions, real editor/viewer controls, referee/keeper/Strategy/public/AI/event identities and separate same-name TBD statistics passed.');
