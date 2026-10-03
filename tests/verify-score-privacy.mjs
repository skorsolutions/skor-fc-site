import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pages = Object.fromEntries(['index.html','matches.html','players.html','squad.html','gameday.html','admin.html','player-portal.html'].map(file => [file,read(file)]));
for (const [file,html] of Object.entries(pages)) {
  for (const [index,match] of [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries()) new vm.Script(match[1],{filename:`${file}#${index}`});
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size,ids.length,`${file}: duplicate element IDs`);
}

const fixture = {id:'privacy-fixture',slug:'privacy-fixture',kickoff:'2026-10-03T19:00:00Z',status:'final',home:'SKOR FC',away:'Opponent',homeLogo:'skor.svg',awayLogo:'opponent.svg',location:'Sweet Apple Park'};
const nodes = new Map();
const node = id => {if (!nodes.has(id)) nodes.set(id,{innerHTML:'',textContent:'',href:''});return nodes.get(id);};
const context = {
  document:{getElementById:node,querySelector:node},
  gameDate:m=>new Date(m.kickoff),statusLabel:()=> 'Final',isLiveStatus:s=>s.includes('half'),
  formatFullDate:()=> 'October 3',formatTime:()=> '3 PM',monthLabel:()=> 'OCT',dayLabel:()=> '03',
  homeFieldLink:v=>v,homeClockHtml:()=> '<span data-official-clock>Clock</span>',syncHomeMatchClocks:()=>{},
  logoBadge:(team)=>`<img alt="${team}">`,escapeHtmlMatch:v=>v,
  esc:v=>v,fmtDate:()=> 'October 3',fmtTime:()=> '3 PM',month:()=> 'OCT',day:()=> '03',
  statusClass:()=> 'final',statusText:()=> 'Final',fieldMetaHtml:()=> 'Field',arrivalText:()=> '2:15 PM',
  matchClockHtml:()=> '<span data-official-clock>Clock</span>',isPast:()=>true,
  renderCards:()=> '<div>Discipline</div>'
};
vm.createContext(context);
const homeStart = pages['index.html'].indexOf('function renderNextMatch(');
const homeEnd = pages['index.html'].indexOf('function practiceDateLabel(',homeStart);
vm.runInContext(pages['index.html'].slice(homeStart,homeEnd),context);
for (const status of ['scheduled','first_half','halftime','second_half','final']) {
  context.renderNextMatch({...fixture,status});
  context.renderUpcomingGames([{...fixture,status}]);
  assert.equal(node('nextMatchTitle').textContent,'SKOR FC vs Opponent');
  assert.doesNotMatch(node('upcomingGames').innerHTML,/game-result|score|Goal|Assist/);
  assert.match(node('upcomingGames').innerHTML,/data-official-clock/);
}

const matchStart=pages['matches.html'].indexOf('function renderSelected(');
const matchEnd=pages['matches.html'].indexOf('function renderLists(',matchStart);
vm.runInContext(pages['matches.html'].slice(matchStart,matchEnd),context);
for (const status of ['scheduled','first_half','halftime','second_half','final']) {
  context.renderSelected({...fixture,status});
  const html=node('selectedMatch').innerHTML;
  assert.match(html,/>VS</);
  assert.doesNotMatch(html,/Goals & Assists|skor_goal|row-result|\d+\s*[–-]\s*\d+/);
  assert.match(html,/Discipline/);
  assert.match(html,/data-official-clock/);
  assert.doesNotMatch(context.row({...fixture,status},true),/row-result|\d+\s*[–-]\s*\d+/);
}

// Public renderers must remain safe even if a stale client contains goal rows.
context.events=[{match_id:fixture.id,event_type:'opponent_goal'},{match_id:fixture.id,event_type:'skor_own_goal'},{match_id:fixture.id,event_type:'skor_yellow_card'}];
vm.runInContext(pages['matches.html'].match(/function evFor\(m\).*\n/)[0],context);
assert.equal(context.evFor(fixture).length,1);
assert.equal(context.evFor(fixture)[0].event_type,'skor_yellow_card');

assert.doesNotMatch(pages['index.html'],/from\("match_events"\)|scoreFor\(/);
assert.match(pages['matches.html'],/not\("event_type","in","\(skor_goal,opponent_goal,opponent_own_goal,skor_own_goal\)"\)/);
for (const file of ['players.html','squad.html']) {
  assert.doesNotMatch(pages[file],/from\("match_events"\)|recordWins|recordLosses|recordGF|recordGA|recordGD/);
  assert.match(pages[file],/get_public_player_season_stats/);
  assert.match(pages[file],/data-stat="goals"/);
}
assert.doesNotMatch(pages['gameday.html'],/id="crowdScore"|id="pendingScore"|function crowdScore/);
assert.match(pages['gameday.html'],/visibleEvents\.map/);
assert.match(pages['player-portal.html'],/claim_player_portal/);
assert.match(pages['player-portal.html'],/get_my_recent_matches/);
assert.match(pages['player-portal.html'],/m\.skor_score}–\$\{m\.opponent_score/);
assert.match(pages['admin.html'],/from\("match_events"\)/);

const sql=read('docs/sql/SCORE-PRIVACY.sql');
assert.equal((sql.match(/as restrictive for select to public/g)||[]).length,3);
assert.match(sql,/auth\.uid\(\)/);
assert.match(sql,/is_approved_captain\(\)/);
assert.match(sql,/current_player_id\(\)/);
assert.match(sql,/stable security definer set search_path = ''/);
assert.match(sql,/revoke all on function public\.get_public_player_season_stats\(\) from public, anon, authenticated/);
assert.doesNotMatch(sql,/\b(update|delete from|truncate|drop table)\b/i);
const resultProjection=sql.slice(sql.indexOf("  select jsonb_build_object("));
assert.doesNotMatch(resultProjection,/'match_id'|'opponent_score'|'wins'|'losses'|'kickoff'|'event_type'/);
console.log('Score privacy verification passed: public rendering, portal preservation, aggregate-only data contract and restrictive policy draft.');
