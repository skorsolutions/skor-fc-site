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
  window.events=[];window.saveCalls=0;
  const snapshot=()=>({match:{id:'fixture',home_team:'SKOR FC',away_team:'Fixture FC',kickoff:'2026-01-01T00:00:00Z',status:'final'},revision:'r'+saveCalls,
    participants:[{player_key:'fixture-player',name:'Fixture Player',number:7}],events:structuredClone(events)});
  window.client={auth:{getSession:async()=>({data:{session:{user:{id:'fixture-captain'}}}})},rpc:async(name,p)=>{
    if(name==='get_post_match_editor')return {data:snapshot()};
    if(name==='save_post_match_events'){
      if(p.p_revision!=='r'+saveCalls)return {error:{code:'40001',message:'Fixture stale revision'}};
      events=events.filter(e=>!p.p_delete_ids.includes(e.id));
      for(const row of p.p_upserts){events=events.filter(e=>e.id!==row.id);events.push({...row,roster_player_key:row.player_key,assist_roster_player_key:row.assist_key,entry_source:'post_match'});}
      saveCalls++;return {data:{ok:true}};
    }
    if(name==='control_match_clock'){
      window.clockCalls=(window.clockCalls||0)+1;
      if(window.clockFailure)throw Error('Fixture connection interrupted');
      return {data:{clock_phase:p.p_action==='start_first_half'?'first_half':p.p_action==='pause'?'first_half':'second_half',clock_running:p.p_action!=='pause',clock_elapsed_seconds:0,clock_started_at:new Date().toISOString(),half_length_minutes:45,sub_interval_minutes:15}};
    }
    return {data:[]};
  }};
  window.pm=SKORPostMatch.mount({client,getContext:()=>({userId:'fixture-captain',canUse:true,matchId:'fixture'})});
};
const clockSetup=String.raw`
let gameClockState=null,gameDaySelected={id:'fixture',status:'scheduled'},captainActivityUser='fixture-captain',portalSessionVersion=1;
const gameClockAlerted=new Set(),PRODUCTION_GAMEPLAN=null,editingEventId=null,gameDayEvents=[],tiebreaks={state:()=>({extra_minutes:5,golden_goal:true}),isDirty:()=>false},substitutionAlarm={updateClock(){}};
const portalCanWrite=()=>true,viewerBlocked=()=>{},renderGameDay=()=>{},loadCrowdAdmin=async()=>{},officialEsc=v=>v,sb=client;
const gameClockDisplay=document.getElementById('gameClockDisplay'),gameClockPhase=document.getElementById('gameClockPhase'),gameClockSecondary=document.getElementById('gameClockSecondary'),gameClockAlert=document.getElementById('gameClockAlert'),gameClockHalfLength=document.getElementById('gameClockHalfLength'),gameClockSubInterval=document.getElementById('gameClockSubInterval'),gameClockActions=document.getElementById('gameClockActions'),gameClockSubAlert=document.getElementById('gameClockSubAlert'),eventClockPreview=null,eventHalf=document.getElementById('eventHalf');
`;
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+read('post-match-entry.css')+'</style></head><body><main style="padding:12px;max-width:700px"><button id="openPostMatch">Record after game</button><select id="eventHalf"><option value="first">First</option><option value="second">Second</option></select>'+clockHtml+'</main><dialog id="postMatchDialog" class="pm-dialog"><header class="pm-header"><h2>Record after game</h2><button data-pm="close">×</button></header><div id="postMatchBody"></div></dialog><script>'+read('post-match-entry.js')+read('match-tiebreaks.js')+'('+bootstrap.toString()+')();'+clockSetup+clockCode+';gameClockActions.querySelectorAll("[data-clock-action]").forEach(b=>b.addEventListener("click",()=>controlGameClock(b.dataset.clockAction)));renderGameClock();</script></body></html>';
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
    await page.locator('#openPostMatch').click();
    await page.locator('[data-pm-add=first]').selectOption('fixture-player');
    const plus=()=>page.locator('[data-pm-half=first] button[aria-label="Add one skor goal"]');
    for(let i=0;i<3;i++)await plus().click();
    assert.equal(await page.locator('[data-pm-half=first] .pm-stepper output').first().textContent(),'3');
    await page.locator('[data-pm=save]').click();await page.waitForFunction(()=>window.saveCalls===1);
    const oldIds=await page.evaluate(()=>events.map(e=>e.id));
    await page.locator('[data-pm=continue]').click();await page.waitForFunction(()=>pm.state().phase==='ready');
    assert.equal(await page.locator('[data-pm-half=first] .pm-stepper output').first().textContent(),'3');
    await plus().click();await page.locator('[data-pm=save]').click();await page.waitForFunction(()=>window.saveCalls===2);
    const saved=await page.evaluate(()=>events);assert.equal(saved.length,4);assert.ok(oldIds.every(id=>saved.some(e=>e.id===id)));
    assert.equal(new Set(saved.map(e=>e.id)).size,4);
    await page.locator('[data-pm=continue]').click();await page.waitForFunction(()=>pm.state().phase==='ready');
    await page.locator('[data-pm-extra]').check();assert.equal(await page.locator('[data-pm-half=extra_first]').count(),1);assert.equal(await page.locator('[data-pm-half=extra_second]').count(),1);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Native phone/desktop UI: kickoff and network recovery; repeated goal taps; save → continue → second save preserves IDs without duplicates; overtime periods pass.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
