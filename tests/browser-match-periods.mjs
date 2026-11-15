import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.SKOR_PLAYWRIGHT_PATH||'playwright');
const read=p=>fs.readFileSync(p,'utf8'),admin=read('admin.html');
const css=[...admin.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
const clockHtml=admin.slice(admin.indexOf('<div class="game-clock-card"'),admin.indexOf('<section class="sub-alarm"'))+'</div>';
const clockCode=admin.slice(admin.indexOf('function officialClockSeconds('),admin.indexOf('\ngameClockActions?.querySelectorAll("[data-clock-action]").forEach(btn=>btn.addEventListener'));
const bootstrap=()=>{
  window.events=[];window.saveCalls=0;window.tbStored={match_id:'fixture',revision:0,extra_minutes:5,golden_goal:true,initial_kicks:5,first_team:'skor',shots:[],completed:false,participants:[]};
  const snapshot=()=>({match:{id:'fixture',home_team:'SKOR FC',away_team:'Fixture FC',kickoff:'2026-01-01T00:00:00Z',status:'final'},revision:'r'+saveCalls+':t'+tbStored.revision,
    participants:[{player_key:'fixture-player',name:'Fixture Player',number:7},{player_key:'fixture-assist',name:'Fixture Guest',number:66,is_temp:true}],events:structuredClone(events)});
  window.client={auth:{getSession:async()=>({data:{session:{user:{id:'fixture-captain'}}}})},rpc:async(name,p)=>{
    if(name==='get_post_match_editor')return window.postReadError?{error:{message:'Fixture event refresh unavailable'}}:{data:snapshot()};
    if(name==='save_post_match_events'){
      if(p.p_revision!=='r'+saveCalls+':t'+tbStored.revision)return {error:{code:'40001',message:'Fixture stale revision'}};
      if(p.p_upserts.some(r=>r.event_type==='skor_goal'&&(!['fixture-player','fixture-assist'].includes(r.player_key)||r.player_key===r.assist_key)))return {error:{message:'Choose valid scorer and assister'}};
      events=events.filter(e=>!p.p_delete_ids.includes(e.id));
      for(const row of p.p_upserts){events=events.filter(e=>e.id!==row.id);events.push({...row,roster_player_key:row.player_key,assist_roster_player_key:row.assist_key,entry_source:'post_match'});}
      saveCalls++;return {data:{ok:true}};
    }
    if(name==='get_match_tiebreak')return {data:structuredClone(tbStored)};
    if(name==='save_match_tiebreak'){if(p.p_payload.shots.length&&events.filter(e=>e.event_type==='skor_goal').length!==events.filter(e=>e.event_type==='opponent_goal').length)return {error:{message:'Shootout requires tied match goals'}};if(p.p_revision!==tbStored.revision)return {error:{code:'40001',message:'Fixture stale shootout'}};tbStored={...tbStored,...structuredClone(p.p_payload),revision:tbStored.revision+1};return {data:{ok:true,revision:tbStored.revision,summary:SKORTiebreaks.summary(tbStored.shots,tbStored.initial_kicks,tbStored.first_team)}};}
    if(name==='control_match_clock'){
      window.clockCalls=(window.clockCalls||0)+1;
      if(window.clockFailure)throw Error('Fixture connection interrupted');
      return {data:{clock_phase:p.p_action==='start_first_half'?'first_half':p.p_action==='pause'?'first_half':'second_half',clock_running:p.p_action!=='pause',clock_elapsed_seconds:0,clock_started_at:new Date().toISOString(),half_length_minutes:45,sub_interval_minutes:15}};
    }
    return {data:[]};
  }};
  window.tb=SKORTiebreaks.mount({client,getContext:()=>({userId:'fixture-captain',canUse:true,matchId:'fixture'})});void tb.load();
  window.pm=SKORPostMatch.mount({client,shootoutEditor:tb,getContext:()=>({userId:'fixture-captain',canUse:true,matchId:'fixture'})});
};
const clockSetup=String.raw`
let gameClockState=null,gameDaySelected={id:'fixture',status:'scheduled'},captainActivityUser='fixture-captain',portalSessionVersion=1;
const gameClockAlerted=new Set(),PRODUCTION_GAMEPLAN=null,editingEventId=null,gameDayEvents=[],tiebreaks=tb,substitutionAlarm={updateClock(){}};
const portalCanWrite=()=>true,viewerBlocked=()=>{},renderGameDay=()=>{},loadCrowdAdmin=async()=>{},officialEsc=v=>v,sb=client;
const gameClockDisplay=document.getElementById('gameClockDisplay'),gameClockPhase=document.getElementById('gameClockPhase'),gameClockSecondary=document.getElementById('gameClockSecondary'),gameClockAlert=document.getElementById('gameClockAlert'),gameClockHalfLength=document.getElementById('gameClockHalfLength'),gameClockSubInterval=document.getElementById('gameClockSubInterval'),gameClockActions=document.getElementById('gameClockActions'),gameClockSubAlert=document.getElementById('gameClockSubAlert'),eventClockPreview=null,eventHalf=document.getElementById('eventHalf');
`;
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+read('post-match-entry.css')+read('match-tiebreaks.css')+'</style></head><body><main style="padding:12px;max-width:700px"><button id="openPostMatch">Record after game</button><select id="eventHalf"><option value="first">First</option><option value="second">Second</option></select>'+clockHtml+'<div id="matchTiebreakSettings" class="match-tiebreaks"></div></main><dialog id="postMatchDialog" class="pm-dialog"><header class="pm-header"><h2>Record after game</h2><button data-pm="close">×</button></header><div id="postMatchBody"></div></dialog><div id="postMatchTiebreakParking" hidden><div id="matchTiebreaks" class="match-tiebreaks"></div></div><script>'+read('post-match-entry.js')+read('match-tiebreaks.js')+'('+bootstrap.toString()+')();'+clockSetup+clockCode+';gameClockActions.querySelectorAll("[data-clock-action]").forEach(b=>b.addEventListener("click",()=>controlGameClock(b.dataset.clockAction)));renderGameClock();</script></body></html>';
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.SKOR_CHROMIUM_EXECUTABLE||undefined});
try{
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
    const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const start=page.locator('[data-clock-action=start_first_half]');
    assert.match(await start.textContent(),/Start game/);assert.ok((await start.boundingBox()).height>=50);
    await page.evaluate(()=>window.clockFailure=true);await start.click();
    await page.waitForFunction(()=>document.getElementById('gameClockControlStatus').textContent.includes('connection interrupted'));
    assert.equal(await start.isEnabled(),true,'network failure must not strand clock controls');
    await page.evaluate(()=>window.clockFailure=false);await start.click();
    await page.waitForFunction(()=>document.getElementById('gameClockPhase').textContent.includes('Running'));
    assert.equal(await start.isVisible(),false);assert.equal(await page.locator('[data-clock-action=pause]').isVisible(),true);
    await page.locator('#matchTiebreakSettings summary').click();
    assert.equal(await page.locator('[data-tb-setting=extra_minutes]').inputValue(),'5');
    await page.locator('[data-tb-setting=extra_minutes]').fill('7');await page.locator('[data-tb-setting=extra_minutes]').blur();
    await page.locator('[data-tb=save-settings]').click();await page.waitForFunction(()=>tbStored.revision===1&&!tb.isBusy());
    assert.equal(await page.locator('#matchTiebreaks').isVisible(),false,'penalty entry is absent from the live clock area');
    await page.locator('#openPostMatch').click();
    const plus=()=>page.locator('[data-pm-half=first] button[aria-label="Add one SKOR goal"]');
    for(let i=0;i<3;i++)await plus().click();
    assert.equal(await page.locator('[data-pm-half=first] .pm-stepper output').first().textContent(),'3');
    assert.equal(await page.locator('[data-pm=save]').isEnabled(),false,'each new goal requires a selected scorer');
    assert.equal(await page.locator('[data-pm-assist]').first().isEnabled(),false);
    for(let i=0;i<3;i++)await page.locator('[data-pm-scorer]').nth(i).selectOption('fixture-player');
    await page.locator('[data-pm-assist]').first().selectOption('fixture-assist');
    await page.locator('[data-pm-assist]').nth(1).selectOption('none');
    assert.equal(await page.locator('[data-pm-assist]').first().isVisible(),true,'assister is visible beside each goal without another disclosure');
    assert.equal(await page.getByText('Add player',{exact:true}).count(),0);
    assert.equal(await page.locator('[data-pm-cards=first]').evaluate(e=>e.open),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'goal fields fit the phone width');
    await page.locator('[data-pm=save]').click();await page.waitForFunction(()=>window.saveCalls===1);
    const oldIds=await page.evaluate(()=>events.map(e=>e.id));
    await page.locator('[data-pm=continue]').click();await page.waitForFunction(()=>pm.state().phase==='ready');
    assert.equal(await page.locator('[data-pm-half=first] .pm-stepper output').first().textContent(),'3');
    assert.equal(await page.locator('[data-pm-assist]').first().inputValue(),'fixture-assist');
    await plus().click();
    assert.equal(await page.locator('[data-pm=save]').isEnabled(),false);
    await page.locator('[data-pm-scorer]').nth(3).selectOption('fixture-assist');
    await page.locator('[data-pm-assist]').nth(3).selectOption('fixture-player');
    await page.locator('[data-pm=save]').click();await page.waitForFunction(()=>window.saveCalls===2);
    const saved=await page.evaluate(()=>events);assert.equal(saved.length,4);assert.ok(oldIds.every(id=>saved.some(e=>e.id===id)));
    assert.equal(new Set(saved.map(e=>e.id)).size,4);
    await page.locator('[data-pm=continue]').click();await page.waitForFunction(()=>pm.state().phase==='ready');
    await page.locator('[data-pm-extra]').check();assert.equal(await page.locator('[data-pm-half=extra_first]').count(),1);assert.equal(await page.locator('[data-pm-half=extra_second]').count(),1);
    await page.locator('[data-pm-shootout]').check();
    assert.equal(await page.locator('#postMatchDialog #matchTiebreaks').isVisible(),true);
    await page.locator('[data-tb-setting=initial_kicks]').fill('1');await page.locator('[data-tb-setting=initial_kicks]').blur();
    await page.locator('[data-tb-setting=first_team]').selectOption('opponent');
    await page.locator('[data-tb=scored]').click();await page.locator('[data-tb=missed]').click();
    await page.locator('[data-tb-setting=completed]').check();
    const kickIds=await page.evaluate(()=>tb.state().shots.map(s=>s.id));
    for(let i=0;i<4;i++)await page.locator('[data-pm-half=first] button[aria-label="Add one opponent goal"]').click();
    assert.equal(await page.locator('[data-tb=save]').isEnabled(),false,'save goals first to use the authoritative tied score');
    assert.deepEqual(await page.evaluate(()=>tb.state().shots.map(s=>s.id)),kickIds,'goal rerenders preserve unsaved shootout draft');
    await page.locator('[data-pm=save]').click();await page.waitForFunction(()=>window.saveCalls===3&&!pm.state().busy);
    assert.equal(await page.locator('[data-tb=save]').isEnabled(),true);
    await page.locator('[data-tb=save]').click();await page.waitForFunction(()=>tbStored.revision===2&&!tb.isBusy()&&pm.state().phase==='ready');
    assert.equal(await page.evaluate(()=>tbStored.completed),true);assert.equal(await page.evaluate(()=>events.length),8,'shootout must not add match goals');
    assert.equal(await page.evaluate(()=>pm.state().draft.snapshot.revision),'r3:t2','shootout save refreshes the event revision');
    await page.locator('[data-pm-cards=first] > summary').click();
    await page.locator('[data-pm-card-player=first]').selectOption('fixture-player');
    await page.locator('[data-pm-half=first] button[aria-label="Add one skor yellow card"]').click();
    // Correct attribution directly while preserving the original goal identity.
    await page.locator('[data-pm-assist]').first().selectOption('none');
    await page.locator('[data-pm-scorer]').first().selectOption('fixture-assist');
    await page.locator('[data-pm-assist]').first().selectOption('fixture-player');
    await page.locator('[data-pm=save]').click();await page.waitForFunction(()=>window.saveCalls===4&&!pm.state().busy);
    assert.equal(await page.evaluate(()=>events.filter(e=>e.event_type.includes('goal')).length),8);
    assert.equal(await page.evaluate(id=>events.find(e=>e.id===id).player_key,oldIds[0]),'fixture-assist');
    assert.equal(await page.evaluate(id=>events.find(e=>e.id===id).assist_key,oldIds[0]),'fixture-player');
    await page.locator('#postMatchDialog [data-tb=reload]').click();await page.waitForFunction(()=>tb.state()?.revision===2);
    assert.equal(await page.locator('#postMatchDialog #matchTiebreaks li').count(),2);
    assert.deepEqual(await page.evaluate(()=>tb.state().shots.map(s=>s.id)),kickIds);
    await page.locator('[data-pm=close]').click();assert.equal(await page.locator('#matchTiebreaks').isVisible(),false);
    await page.locator('#openPostMatch').click();await page.waitForFunction(()=>pm.state().phase==='ready');
    assert.equal(await page.locator('[data-pm-shootout]').isChecked(),true,'saved shootouts appear automatically on reopening');
    assert.equal(await page.locator('#postMatchDialog #matchTiebreaks li').count(),2);
    await page.evaluate(()=>window.postReadError=true);
    await page.locator('[data-tb=save]').click();await page.waitForFunction(()=>tbStored.revision===3&&!tb.isBusy()&&pm.state().phase==='error');
    assert.equal(await page.locator('[data-pm=close]').isEnabled(),true,'saved penalties plus a failed event refresh must not trap the modal');
    await page.locator('[data-pm=close]').click();await page.evaluate(()=>window.postReadError=false);
    await page.locator('#openPostMatch').click();await page.waitForFunction(()=>pm.state().phase==='ready');
    assert.deepEqual(await page.evaluate(()=>tb.state().shots.map(s=>s.id)),kickIds);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Native phone/desktop UI: kickoff and network recovery; team goal counters, required scorers and direct assister picks, separate cards, stable attribution corrections; save → continue → second save preserves IDs without duplicates; embedded penalty draft, save order, goal/kick isolation, reload/reopen and event revision refresh pass.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
