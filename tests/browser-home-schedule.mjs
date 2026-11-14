import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SKOR_PLAYWRIGHT_PATH || "playwright");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const clock = await readFile(new URL("../public-match-clock.js", import.meta.url), "utf8");
const fixture = {
  id: "00000000-0000-4000-8000-000000000123", slug: "fixture-new-playoff",
  kickoff: "2026-11-15T16:00:00Z", arrival_at: "2026-11-15T15:45:00Z",
  home_team: "SKOR FC", away_team: "Fixture FC", location: "Fixture Park SC#2",
  status: "scheduled", published: true
};
const sdk = `
window.holdMatches = true;
window.matchWaiters = [];
window.fixtureReply = {data: [], error: null};
window.supabase = {createClient() {
  return {
    from(table) {
      const chain = new Proxy({}, {get(_, key) {
        if(key === "then")return (resolve,reject) => {
          if(table === "matches") {
            if(window.holdMatches)return new Promise(r=>window.matchWaiters.push(r)).then(resolve,reject);
            return Promise.resolve(window.fixtureReply).then(resolve,reject);
          }
          return Promise.resolve({data:[],error:null}).then(resolve,reject);
        };
        return () => chain;
      }});
      return chain;
    },
    rpc: async () => ({data:[],error:null})
  };
}};
`;
const server = createServer((req,res)=>{
  res.setHeader("Content-Type", req.url.startsWith("/public-match-clock.js") ? "text/javascript" : "text/html");
  res.end(req.url.startsWith("/public-match-clock.js") ? clock : html);
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin = "http://127.0.0.1:"+server.address().port;
const browser = await chromium.launch({
  headless:true,
  ...(process.env.SKOR_CHROMIUM_EXECUTABLE ? {executablePath:process.env.SKOR_CHROMIUM_EXECUTABLE} : {}),
  args:["--no-sandbox"]
});
try {
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
    const page = await browser.newPage({viewport,timezoneId:"America/Los_Angeles"});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.clock.install({time:new Date("2026-11-14T18:00:00Z")});
    await page.route("**/*",async route=>{
      const url=route.request().url();
      if(url.includes("cdn.jsdelivr.net/npm/@supabase/"))return route.fulfill({contentType:"text/javascript",body:sdk});
      if(url.startsWith(origin) && !url.includes("/assets/"))return route.continue();
      return route.abort();
    });
    await page.goto(origin,{waitUntil:"load"});
    await page.waitForFunction(()=>window.matchWaiters.length>0);
    assert.match(await page.locator("#nextMatchCard").textContent(),/No upcoming matches/);
    await page.evaluate(row=>{
      window.holdMatches=false;
      window.fixtureReply={data:[row],error:null};
      window.matchWaiters.splice(0).forEach(resolve=>resolve(window.fixtureReply));
    },fixture);
    await page.waitForFunction(()=>document.getElementById("nextMatchTitle")?.textContent==="SKOR FC vs Fixture FC");
    assert.match(await page.locator("#nextMatchMeta").textContent(),/Nov 15/);
    assert.match(await page.locator("#nextMatchMeta").textContent(),/11:00 AM/);
    assert.equal(await page.locator("#matchCenterLink").getAttribute("href"),"matches.html?game=fixture-new-playoff");
    assert.match(await page.locator("#upcomingGames").textContent(),/Fixture FC/);
    assert.equal(await page.locator("#nextMatchLogos img").count(),2);
    // Repeated refresh must preserve existing DOM/clock nodes.
    assert.equal(await page.evaluate(async()=>{
      const node=document.getElementById("nextMatchTitle");
      await loadMatchCenterData();
      return node===document.getElementById("nextMatchTitle");
    }),true);
    // A successful empty response removes the old game; a later publication restores it.
    await page.evaluate(async()=>{window.fixtureReply={data:[],error:null};await loadMatchCenterData();});
    assert.match(await page.locator("#nextMatchCard").textContent(),/No upcoming matches/);
    assert.doesNotMatch(await page.locator("#upcomingGames").textContent(),/Fixture FC/);
    await page.evaluate(async row=>{window.fixtureReply={data:[row],error:null};await loadMatchCenterData();},fixture);
    assert.equal(await page.locator("#nextMatchTitle").textContent(),"SKOR FC vs Fixture FC");
    // Transient failures retain the last successful publication and recover on retry.
    await page.evaluate(async()=>{window.fixtureReply={data:null,error:{message:"fixture offline"}};await loadMatchCenterData();});
    assert.equal(await page.locator("#nextMatchTitle").textContent(),"SKOR FC vs Fixture FC");
    await page.evaluate(async row=>{window.fixtureReply={data:[{...row,away_team:"Updated Fixture FC"}],error:null};await loadMatchCenterData();},fixture);
    assert.equal(await page.locator("#nextMatchTitle").textContent(),"SKOR FC vs Updated Fixture FC");
    const box=await page.locator("#nextMatchCard").boundingBox();
    assert.ok(box.width>0 && box.x>=0 && box.x+box.width<=viewport.width+1);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  if(process.env.SKOR_HOME_LIVE) {
    const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:"America/Los_Angeles"});
    let ready=false;
    for(let attempt=0;attempt<4;attempt++){
      await page.goto(process.env.SKOR_HOME_LIVE+"?home-check="+Date.now(),{waitUntil:"networkidle"});
      ready=await page.locator('meta[name="skor-build"]').getAttribute("content")==="public-home-v58.38-schedule-recovery";
      if(ready)break;
      await page.waitForTimeout(10000);
    }
    assert.ok(ready,"Deployed homepage build did not become available");
    const expected=await page.evaluate(async()=>{
      const {data,error}=await publicDb.from("matches").select("slug,kickoff,home_team,away_team").eq("published",true).order("kickoff",{ascending:true});
      if(error)throw new Error(error.message);
      return data.find(m=>Date.now()<new Date(m.kickoff).getTime()+2*60*60*1000)||null;
    });
    if(expected){
      await page.waitForFunction(m=>document.getElementById("nextMatchTitle")?.textContent===m.home_team+" vs "+m.away_team,expected);
      assert.equal(await page.locator("#matchCenterLink").getAttribute("href"),"matches.html?game="+encodeURIComponent(expected.slug));
      assert.ok((await page.locator("#upcomingGames").textContent()).includes(expected.away_team));
      console.log("Live signed-out homepage: published next game is visible; match link verified.",expected.slug);
    }else{
      assert.match(await page.locator("#nextMatchCard").textContent(),/No upcoming matches/);
    }
    await page.close();
  }
  console.log("Homepage: expired fallback → delayed published match, empty → republished, errors/retry, links/logos, phone/desktop and Eastern times pass.");
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
