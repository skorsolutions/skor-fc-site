import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../player-match-record.js');
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const html=read('player-portal.html'),sql=read('docs/sql/PLAYER-MATCH-RECORD.sql');
if(process.argv.includes('--sql-fixture')){
  const body=name=>sql.slice(sql.indexOf('function skor_private.'+name),sql.indexOf('$function$;',sql.indexOf('function skor_private.'+name))).split('as $function$')[1].trim().replace(/;$/,'');
  const fixtures=q=>q.replaceAll('public.team_roster','fixture_roster').replaceAll('public.matches','fixture_matches').replaceAll('public.match_events','fixture_events').replaceAll('public.player_match_attendance','fixture_attendance');
  const player=fixtures(body('player_completed_matches'));
  const query=read('tests/fixtures/player-match-record.sql').replace('/* PLAYER_A_QUERY */',player.replaceAll('p_player_id',"'00000000-0000-0000-0000-000000000001'::uuid")).replace('/* PLAYER_B_QUERY */',player.replaceAll('p_player_id',"'00000000-0000-0000-0000-000000000002'::uuid")).replace('/* ATTENDANCE_QUERY */',fixtures(body('completed_attendance')));
  process.stdout.write(query);process.exit(0);
}
assert.doesNotMatch(html,/milestone|SKOR Career|statGoals">0/);
assert.match(html,/My Match Record/);assert.match(html,/Games attended/);assert.match(html,/My Match History/);
assert.match(html,/get_my_match_record/);assert.doesNotMatch(html,/db\.rpc\('get_my_player_stats'\)/);
assert.match(html,/matchRecordController\.clear\(\)/);assert.match(html,/visibilitychange/);
assert.match(sql,/revoke all on schema skor_private from public, anon, authenticated/);
assert.match(sql,/function public\.get_my_match_record\(\)/);
assert.match(sql,/if auth\.uid\(\) is null then raise exception/);
assert.match(sql,/v_player_id:=public\.current_player_id\(\)/);
assert.doesNotMatch(sql,/grant (?:all|select|usage).* to (?:anon|public)/i);
assert.doesNotMatch(sql,/\.roster_player_number\s*=|\.player_number\s*=/);
assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from)\b/i);
for(const name of ['get_my_player_stats','get_my_attendance_stats','get_my_recent_matches','get_team_attendance_stats','get_team_attendance_by_player','get_team_attendance_matrix'])assert.match(sql,new RegExp('function public\\.'+name+'\\('));

const match=(id,attendance_status='present')=>({match_id:id,kickoff:'2026-10-01T12:00:00Z',home_team:'SKOR FC',away_team:'Opponent',location:'Field',status:'final',attendance_status,skor_score:2,opponent_score:1,my_goals:0,my_assists:0,my_yellow_cards:0,my_red_cards:0,my_motm:false});
const fixture=()=>({summary:{recorded_matches:2,present_count:1,absent_count:1,excused_count:0,unmarked_count:0,eligible_count:2,attendance_rate:99,goals:1,assists:1,yellow_cards:1,red_cards:0,motm:1},matches:[{...match('one'),my_goals:1,my_motm:true},{...match('two','absent'),my_assists:1,my_yellow_cards:1}],as_of:'2026-10-24T12:00:00Z'});
assert.equal(R.normalize(fixture()).summary.attendance_rate,50,'attendance must use present/(present+absent)');
const noCount=fixture();Object.assign(noCount.summary,{present_count:0,absent_count:0,eligible_count:0,excused_count:1,unmarked_count:1});noCount.matches[0].attendance_status='excused';noCount.matches[1].attendance_status='unmarked';assert.equal(R.normalize(noCount).summary.attendance_rate,null);
for(const mutate of [x=>delete x.summary.goals,x=>x.summary.goals=null,x=>x.summary.goals=-1,x=>x.summary.eligible_count=99,x=>x.matches[0].status='scheduled',x=>x.matches[0].attendance_status='going',x=>x.matches.push(x.matches[0])]){const value=fixture();mutate(value);assert.throws(()=>R.normalize(value));}
const fromText=fixture();fromText.matches[0].my_goals='1';assert.equal(R.normalize(fromText).matches[0].my_goals,1);

let time=10000,visible=true,fetches=0,response={data:fixture(),error:null};
const timers=new Map(),states=[],changes=[];let nextTimer=1;
const controller=R.createController({fetchRecord:async()=>{fetches++;return response;},onChange:r=>changes.push(r),onState:s=>states.push(s),isVisible:()=>visible,now:()=>time,schedule:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},cancel:id=>timers.delete(id)});
await controller.start('player-a');assert.equal(fetches,1);assert.equal(states.at(-1).phase,'ready');assert.equal(timers.size,1);
response={data:null,error:new Error('offline')};await controller.refresh();assert.equal(states.at(-1).phase,'stale');assert.equal(changes.length,1);assert.equal(states.at(-1).record.summary.present_count,1,'keep real data on a failed refresh');
visible=false;controller.resume();assert.equal(timers.size,0);await controller.refresh();assert.equal(fetches,2,'hidden tabs do not poll');
visible=true;time+=30000;response={data:fixture()};controller.resume();await controller.refresh();assert.equal(fetches,3);assert.equal(states.at(-1).phase,'ready');
controller.clear();assert.equal(timers.size,0);assert.equal(states.at(-1).record,null);
response={data:null,error:new Error('denied')};await controller.start('player-b');assert.equal(states.at(-1).phase,'error');assert.equal(states.at(-1).record,null,'new player must never inherit the previous player data');
controller.clear();

let resolveOld;const pending=new Promise(resolve=>resolveOld=resolve),raceStates=[],raceChanges=[];
const race=R.createController({fetchRecord:()=>pending,onChange:r=>raceChanges.push(r),onState:s=>raceStates.push(s),schedule:()=>1,cancel(){}});
const oldRequest=race.start('old-user');race.clear();resolveOld({data:fixture()});await oldRequest;assert.equal(raceChanges.length,0);assert.equal(raceStates.at(-1).phase,'idle','late responses after logout must be ignored');
let syncAttempts=0;
const syncFailure=R.createController({fetchRecord:()=>{syncAttempts++;throw new Error('sync failure');},onChange(){},onState(){},schedule:()=>1,cancel(){}});
await syncFailure.start('player');await syncFailure.refresh();assert.equal(syncAttempts,2,'synchronous fetch failures must not leave the controller stuck');syncFailure.clear();

// Exercise the actual page renderers, including unavailable/empty states and escaping.
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',classList:{toggle(){}},querySelectorAll:()=>[]});return nodes.get(id);};
const ctx={matchRecord:R.normalize(fixture()),recent:fixture().matches,historyVisibleCount:6,matchRecordPhase:'ready',document:{getElementById:node},$:node,esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),opponent:m=>m.away_team,dt:v=>v};
function fn(name,next){const plain=html.indexOf('\nfunction '+next+'('),asyncStart=html.indexOf('\nasync function '+next+'(');return html.slice(html.indexOf('function '+name+'('),plain>=0?plain:asyncStart);}
vm.createContext(ctx);vm.runInContext(fn('renderStats','opponent'),ctx);vm.runInContext(fn('renderRecent','selectFeedbackMatch'),ctx);
ctx.renderStats();ctx.renderRecent();assert.equal(node('statGamesAttended').textContent,'1');assert.equal(node('statAttendance').textContent,'50%');assert.match(node('statAttendanceDetail').textContent,/1 attended · 1 absent/);assert.match(node('recentMatches').innerHTML,/Attended/);assert.match(node('recentMatches').innerHTML,/Absent/);
ctx.recent[0].away_team='<img onerror=alert(1)>';ctx.renderRecent();assert.doesNotMatch(node('recentMatches').innerHTML,/<img/);
ctx.matchRecord=null;ctx.recent=[];ctx.matchRecordPhase='error';ctx.renderStats();ctx.renderRecent();assert.equal(node('statGoals').textContent,'—');assert.match(node('recentMatches').innerHTML,/unavailable/);
console.log('Player match record verified: real totals, unavailable/stale states, attendance rules, visible-page polling, session isolation, retry/concurrency, actual renderers, privacy and SQL guards.');
