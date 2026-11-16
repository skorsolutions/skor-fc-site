import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.SKOR_PLAYWRIGHT_PATH||'playwright');
const result={match_id:'fixture',home_score:3,away_score:3,skor_score:3,opponent_score:3,penalty_skor:4,penalty_opponent:2,on_penalties:true,outcome:'win'};
const match={id:'fixture',slug:'fixture-result',status:'final',kickoff:'2026-01-01T16:00:00Z',home_team:'SKOR FC',away_team:'Fixture FC',published:true,location:'Fixture Park'};
const sdk=`window.fixtureResult=${JSON.stringify(result)};window.fixtureMatch=${JSON.stringify(match)};window.rawEventReads=0;window.supabase={createClient(){return {rpc:async(name)=>name==='get_public_match_results'?{data:window.resultError?null:window.fixtureResult?[window.fixtureResult]:[],error:window.resultError?{message:'fixture offline'}:null}:{data:[],error:null},from(table){if(table==='match_events')window.rawEventReads++;const chain=new Proxy({},{get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve({data:table==='matches'?[window.fixtureMatch]:[],error:null}).then(resolve,reject);return ()=>chain}});return chain}}}};`;
const server=http.createServer((req,res)=>{const path=new URL(req.url,'http://fixture').pathname.slice(1)||'matches.html';if(!/^[a-zA-Z0-9.-]+$/.test(path)){res.writeHead(404);res.end();return;}try{res.setHeader('content-type',path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.SKOR_CHROMIUM_EXECUTABLE||undefined});
try{if(!process.env.SKOR_RESULTS_LIVE)for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=route.request().url();if(url.includes('cdn.jsdelivr.net/npm/@supabase/'))return route.fulfill({contentType:'text/javascript',body:sdk});if(url.startsWith(origin)&&!url.includes('/assets/'))return route.continue();return route.abort();});
 await page.goto(origin+'/matches.html?game=fixture-result');
 await page.waitForFunction(()=>document.querySelector('#selectedMatch .score')?.textContent==='3–3');
 assert.match(await page.locator('#selectedMatch').textContent(),/SKOR FC won on penalties/);assert.match(await page.locator('#selectedMatch').textContent(),/4–2/);
 assert.match(await page.locator('#pastList').textContent(),/3–3/);assert.match(await page.locator('#pastList').textContent(),/won on penalties/);
 assert.doesNotMatch(await page.locator('#selectedMatch').textContent(),/Discipline|Yellow|Red Cards|Fouls/);assert.equal(await page.evaluate(()=>rawEventReads),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'result card fits viewport');
 await page.evaluate(async()=>{fixtureResult={...fixtureResult,outcome:'loss',penalty_skor:2,penalty_opponent:4};await load();});assert.match(await page.locator('#selectedMatch').textContent(),/SKOR FC lost on penalties/);
 await page.evaluate(async()=>{resultError=true;await load();});assert.match(await page.locator('#selectedMatch').textContent(),/lost on penalties/,'failed refresh retains acknowledged result');
 await page.evaluate(async()=>{resultError=false;fixtureResult=null;await load();});assert.equal(await page.locator('#selectedMatch .score').textContent(),'VS','withdrawn result clears successfully');
 await page.evaluate(async()=>{fixtureMatch={...fixtureMatch,status:'scheduled'};await load();});assert.equal(await page.locator('#selectedMatch .score').textContent(),'VS');
 for(const name of ['players.html','squad.html']){await page.goto(origin+'/'+name);assert.equal(await page.locator('[data-stat=yellow],[data-stat=red],#teamYellow,#teamRed').count(),0);}
 assert.deepEqual(errors,[]);await page.close();
}if(process.env.SKOR_RESULTS_LIVE){
 const live=process.env.SKOR_RESULTS_LIVE.replace(/\/$/,'');
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const page=await browser.newPage({viewport}),errors=[],eventReads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/rest/v1/match_events'))eventReads.push(r.url());});
  await page.goto(live+'/matches?result-check='+Date.now(),{waitUntil:'networkidle'});
  assert.equal(await page.locator('meta[name="skor-build"]').getAttribute('content'),'public-match-center-v58.43-results');
  await page.waitForFunction(()=>typeof matchResults!=='undefined'&&matchResults.records().size>0);
  const expected=await page.evaluate(()=>{const candidates=matches.filter(m=>matchResults.get(m.id,m.status));const m=candidates.find(m=>matchResults.get(m.id,m.status).on_penalties)||candidates[0];return {slug:m.slug,...matchResults.get(m.id,m.status)};});
  await page.goto(live+'/matches?game='+encodeURIComponent(expected.slug)+'&result-check='+Date.now(),{waitUntil:'networkidle'});
  await page.waitForFunction(score=>document.querySelector('#selectedMatch .score')?.textContent===score,expected.home_score+'–'+expected.away_score);
  const text=await page.locator('#selectedMatch').textContent();assert.match(text,new RegExp('SKOR FC '+(expected.outcome==='win'?'won':expected.outcome==='loss'?'lost':'')));
  if(expected.on_penalties){assert.match(text,/on penalties/);assert(text.includes(expected.penalty_skor+'–'+expected.penalty_opponent));}
  assert.doesNotMatch(text,/Discipline|SKOR FC Cards|Opponent Cards|Fouls/);assert.deepEqual(eventReads,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const name of ['players','squad']){await page.goto(live+'/'+name,{waitUntil:'networkidle'});assert.equal(await page.locator('[data-stat=yellow],[data-stat=red],#teamYellow,#teamRed').count(),0);}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('LIVE signed-out production Match Center: verified final scores and saved penalty winner against public RPC, no discipline/raw event requests or player card tiles, phone and desktop.');
}else console.log('Native public results: phone/desktop 3-3 won 4-2, past list, loss and failure/withdrawal refresh, upcoming VS, no raw events or public discipline/card totals pass.');}
finally{await browser.close();await new Promise(r=>server.close(r));}
