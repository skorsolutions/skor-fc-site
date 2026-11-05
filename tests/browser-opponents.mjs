// Real Chromium UI/raster/download checks, with fictional API fixtures only.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.SKOR_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const bootstrap=()=>{
  const clone=v=>JSON.parse(JSON.stringify(v)),mid='40000000-0000-4000-8000-000000000001',oid='50000000-0000-4000-8000-000000000001';
  const match={id:mid,home_team:'SKOR FC',away_team:'Fixture Wolves',kickoff:new Date(Date.now()+86400000).toISOString(),status:'scheduled'};
  const profile={id:oid,name:'Fixture Wolves',revision:1,ai_enabled:true,updated_at:new Date().toISOString(),details:{}};
  const observations=[],writes=[],roles=SKORMatchPlan.ROLES['4-3-3'];
  const candidates=roles.map((role,i)=>({player_key:'fixture'+i,name:'Fixture '+i,number:i+1,position:i===0?'Keeper':'Midfield',rsvp_status:'going',temporary:false}));
  const roster=candidates.map(p=>({...p,full_name:p.name,preferred_name:p.name,jersey_number:p.number,active:true}));
  const tables={match_strategies:[],strategy_scene_bundles:[],team_roster:roster};
  function from(table){let filters=[],payload,op='read';const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},range(){return q},insert(p){op='insert';payload=p;return q},update(p){op='update';payload=p;return q},async single(){const r=run();return {...r,data:Array.isArray(r.data)?r.data[0]:r.data}},async maybeSingle(){const r=run();return {...r,data:r.data[0]||null}},then(ok,bad){return Promise.resolve(run()).then(ok,bad)}};
    function run(){const rows=tables[table]||[];if(op!=='read'){const record={...clone(payload),id:crypto.randomUUID(),updated_at:new Date().toISOString()};rows.push(record);writes.push({table,payload:clone(payload)});return {data:record,error:null}}return {data:clone(rows.filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v))),error:null}}return q}
  const snapshot=()=>({version:1,match_id:mid,kickoff:match.kickoff,opponent_id:oid,profile:clone(profile),observations:clone(observations),ai_enabled:profile.ai_enabled});
  const client={from,removeChannel(){},channel(){return {on(){return this},subscribe(){return this}}},auth:{getUser:async()=>({data:{user:{id:'60000000-0000-4000-8000-000000000001'}}})},rpc:async(name,p={})=>{
    if(name==='get_opponents_console')return {data:{opponents:[clone(profile)],profile:clone(profile),matches:[match],observations:clone(observations)}};
    if(name==='get_opponent_scouting_for_match')return {data:snapshot()};
    if(name==='get_match_plan_candidates')return {data:clone(candidates)};
    if(name==='save_opponent_scouting'){
      if(p.p_kind==='profile'){Object.assign(profile,clone(p.p_payload),{revision:profile.revision+1,updated_at:new Date().toISOString()});return {data:clone(profile)}}
      const obs={...clone(p.p_payload),id:p.p_id,revision:p.p_revision+1,kickoff:match.kickoff,status:match.status,valid_match:true,updated_at:new Date().toISOString()};observations.push(obs);return {data:clone(obs)};
    }return {data:[]};},functions:{invoke:async()=>({data:{match_id:mid,candidates:clone(candidates),scouting_snapshot:SKORScouting.capture(snapshot()),scouting_summary:'Fixture scouting used for review.',plan:{formation:'4-3-3',explanation:'Fixture proposal based on opponent scouting.',assignments:roles.map((role,i)=>({role,player_key:candidates[i].player_key,reason:'Fixture role review',sources:['opponent_scouting']})),bench:[],defense:'Screen the central lane.',attack:'Use the wide areas.',set_pieces:'Review marking.',warnings:[]}}})}};
  window.SKORSupabase=client;window.SKORPortalCanWrite=()=>true;
  const navigate=id=>{SKORStrategy.lockBoard();document.querySelectorAll('.view').forEach(n=>n.classList.toggle('active',n.id===id));if(id==='strategy')SKORStrategy.activate()};
  window.fixture={navigate,writes,profile,observations,mid};
  document.getElementById('authGate').style.display='none';document.getElementById('adminApp').style.display='grid';
  SKORLineup.setCaptain('fixture-captain');SKORLineup.setRoster(roster);SKORLineup.setEvents([match],true);
  const event=document.getElementById('lineupEvent');event.value=mid;event.dispatchEvent(new Event('change'));
  setTimeout(async()=>{
    SKORLineup.loadVariation({name:'Fixture XI',state:{formation:'4-3-3',slots:Object.fromEntries(roles.map((r,i)=>[r,candidates[i].player_key])),bench:[],keeperPlan:{spareNumbers:[30],assignments:{}}}});
    const workspace=SKOROpponents.mount({rootId:'opponentsWorkspace',client,canWrite:SKORPortalCanWrite,navigate});window.SKOROpponents=workspace;await workspace.start('fixture-captain');
    window.SKORAIPlan=SKORMatchPlanEditor.mount({client,canWrite:SKORPortalCanWrite,navigate});SKORAIPlan.start('fixture-captain');SKORStrategy.init();navigate('opponents');window.fixtureReady=true;
  },100);
};
const keep=new Set(['keeper-plan.js','match-jerseys.js','match-jerseys-editor.js','sub-wave-plan.js','lineup-marker.js','lineup-free-move.js','keeper-editor.js','ribbon-order.js','temp-player-directory.js','opponent-scouting.js','opponents.js','match-plan-core.js','match-plan-editor.js','strategy-reuse.js','strategy-attack-defense.js','strategy-lineup-source.js','strategy.js']);
let inline=0,html=read('admin.html').replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(all,attrs,body)=>{
 const src=attrs.match(/src="([^"]+)"/);if(src)return keep.has(src[1].split('?')[0])?all:'';return ++inline===1?all:'';
}).replace('</body>','<script>('+bootstrap.toString()+')();</script></body>');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture');try{const p=decodeURIComponent(url.pathname);if(p==='/fixture'){res.setHeader('content-type','text/html');res.end(html);return}const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('content-type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const draft=()=>page.evaluate(()=>SKORStrategy.getDraft()),go=id=>page.evaluate(id=>fixture.navigate(id),id),status=selector=>page.locator(selector);
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');await page.waitForFunction(()=>window.fixtureReady);
 const profile=page.locator('[data-profile-form]');await profile.locator('[name="style"]').fill('High central press');await profile.locator('[data-add-threat]').click();
 const threat=profile.locator('[data-threat-id]');await threat.locator('[name="number"]').fill('10');await threat.locator('[name="position"]').selectOption('ST');await threat.locator('[name="threat"]').fill('Runs behind');await threat.locator('[name="containment"]').fill('Protect the space');
 await profile.locator('[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-opp-status]').textContent.includes('Scouting saved'));
 const observation=page.locator('[data-observation-form]');await observation.locator('[name="formation"]').selectOption('4-3-3');await observation.locator('[name="notes"]').fill('Expected narrow front three');await observation.locator('[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('.opp-history article').length===1);
 await go('strategy');await status('#strategyRefreshScouting').click();await page.waitForFunction(()=>document.getElementById('strategyScoutingSummary').textContent.includes('High central press'));
 await status('#strategyScoutingLabels').check();await status('#strategyApplyScouting').click();await page.waitForFunction(()=>SKORStrategy.getDraft().scoutingSnapshot?.profile?.details?.style==='High central press');
 assert.equal((await draft()).opponentFormation,'4-3-3');const snapshot=JSON.stringify((await draft()).scoutingSnapshot);
 // Board starts locked, then explicitly unlock/finish/cancel; step creation is blocked while editing.
 assert.equal(await status('#strategyPitch').getAttribute('data-editing'),'false');
 const piece=page.locator('#strategyPitch [data-kind="home"]').nth(1);await piece.scrollIntoViewIfNeeded();
 async function drag(){const box=await piece.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+42,box.y+box.height/2-20,{steps:6});await page.mouse.up()}
 const before=JSON.stringify((await draft()).scenes);await drag();assert.equal(JSON.stringify((await draft()).scenes),before,'locked mouse drag is inert');
 await status('#strategyEditStep').click();assert.equal(await status('#strategyAddSubScene').isDisabled(),true);await drag();assert.notEqual(JSON.stringify((await draft()).scenes),before);await status('#strategyFinishEdit').click();assert.equal(await status('#strategyPitch').getAttribute('data-editing'),'false');
 const finished=JSON.stringify((await draft()).scenes);await status('#strategyEditStep').click();await drag();await status('#strategyCancelEdit').click();assert.equal(JSON.stringify((await draft()).scenes),finished,'Cancel restores positions');
 const steps=(await draft()).scenes[0].subScenes.length;await status('#strategyAddSubScene').click();assert.equal((await draft()).scenes[0].subScenes.length,steps+1);assert.equal(await status('#strategyPitch').getAttribute('data-editing'),'false');
 await status('#strategySaveShared').click();await page.waitForFunction(()=>fixture.writes.some(w=>w.table==='match_strategies'));assert.equal(JSON.stringify(await page.evaluate(()=>fixture.writes.find(w=>w.table==='match_strategies').payload.scouting_snapshot)),snapshot);
 // Profile changes do not mutate the already applied snapshot.
 await page.evaluate(()=>fixture.profile.details.style='New profile version');await status('#strategyRefreshScouting').click();await page.waitForFunction(()=>document.getElementById('strategyScoutingSummary').textContent.includes('New profile version'));assert.equal(JSON.stringify((await draft()).scoutingSnapshot),snapshot);
 const downloadPromise=page.waitForEvent('download',{timeout:120000});await status('#strategyQuickGif').click();const download=await downloadPromise;const bytes=fs.readFileSync(await download.path());assert.match(bytes.subarray(0,6).toString(),/^GIF8[79]a$/);assert.equal(bytes.at(-1),0x3b);assert.ok(bytes.length>10000,'native SVG/canvas GIF encoded');
 // Review and apply the real Lineup and Strategy controllers without publishing saved records.
 await go('lineups');await page.locator('#lineupAiPlan [data-generate-plan]').click();await page.locator('#lineupAiPlan [data-apply-lineup]').waitFor();const count=await page.evaluate(()=>fixture.writes.length);await page.locator('#lineupAiPlan [data-apply-lineup]').click();await page.waitForFunction(()=>document.querySelector('#lineupAiPlan [data-plan-status]').textContent.includes('Local lineup draft applied'));
 await page.locator('#lineupAiPlan [data-apply-strategy]').click();await page.waitForFunction(()=>SKORStrategy.getDraft().title.startsWith('AI Match Plan'));assert.equal(await page.evaluate(()=>fixture.writes.length),count);assert.equal(await status('#strategyPitch').getAttribute('data-editing'),'false');assert.equal((await draft()).scenes[0].subScenes.length,3);
 await page.setViewportSize({width:390,height:844});await status('#strategyPitch').scrollIntoViewIfNeeded();const mobileBefore=JSON.stringify((await draft()).scenes);await page.mouse.wheel(0,250);assert.equal(JSON.stringify((await draft()).scenes),mobileBefore);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'mobile has no horizontal overflow');
 await go('opponents');assert.equal(await profile.locator('[name="style"]').inputValue(),'New profile version');
 assert.deepEqual(errors,[]);console.log('Chromium passed: opponent profile/threat/observation saves, scouting application and immutable shared snapshots, locked board/edit/finish/cancel/step guard, native raster GIF download, AI review/local lineup+Strategy apply, mobile layout.');
}catch(e){fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/opponents-failure.png',fullPage:true});console.error('Browser page errors:',errors);console.error('Strategy status:',await page.locator('#strategySharedState').textContent());throw e}finally{await browser.close();await new Promise(r=>server.close(r))}
