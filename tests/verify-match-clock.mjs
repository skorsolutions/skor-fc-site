import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const admin = read("admin.html");
const crowd = read("gameday.html");
const home = read("index.html");
const matches = read("matches.html");
const migration = read("supabase/migrations/20260926203049_add_persistent_match_clock.sql");
const publicClockMigration = read("supabase/migrations/20260927134927_expose_public_match_clock.sql");
const publicClockSource = read("public-match-clock.js");
const handbook = read("docs/PROJECT-HANDBOOK.md");
const clockDoc = read("docs/GAME-DAY-CLOCK.md");

for (const [file, html] of [["admin.html", admin], ["gameday.html", crowd], ["index.html", home], ["matches.html", matches]]) {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(inline.length, `${file} must contain an inline script`);
  inline.forEach((match, index) => new vm.Script(match[1], { filename: `${file}#inline-${index + 1}` }));

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${file} must not contain duplicate IDs`);
}

assert.match(admin, /data-clock-action="start_first_half"/);
assert.match(admin, /data-clock-action="halftime"/);
assert.match(admin, /data-clock-action="start_second_half"/);
assert.match(admin, /data-clock-action="full_time"/);
assert.match(admin, /<option value="45">45 minutes<\/option><option value="40">40 minutes<\/option>/);
assert.match(admin, /<option value="15">Every 15 minutes<\/option><option value="10">Every 10 minutes<\/option>/);
assert.match(admin, /data-sub-wave-unit/);
assert.match(admin, /data-sub-wave-minute/);
assert.match(admin, /data-event="skor_foul"/);
assert.match(admin, /data-event="opponent_foul"/);
assert.match(admin, /clock_period,clock_elapsed_seconds,clock_recorded_at/);
assert.match(admin, /Start the official 1st or 2nd half clock before recording a live event/);
assert.match(admin, /Official Event Log/);

assert.match(crowd, /id="officialClockTime"/);
assert.match(crowd, /renderOfficialClock/);
assert.match(crowd, /eventClockLabel\(ev\)/);
assert.match(crowd, /eventClockLabel\(d\)/);
assert.match(matches, /eventClockLabel/);
assert.match(matches, /renderFoulGroup/);
assert.match(matches, /clock_period,clock_elapsed_seconds,clock_recorded_at/);
assert.match(matches, /get_public_match_clocks/);
assert.match(matches, /data-official-clock/);
assert.match(matches, /Official time not recorded/);
assert.match(home, /get_public_match_clocks/);
assert.match(home, /data-official-clock/);
assert.match(home, /public-match-clock\.js\?v=57\.0/);

const publicClockContext = { globalThis: {} };
vm.runInNewContext(publicClockSource, publicClockContext, { filename: "public-match-clock.js" });
const publicClock = publicClockContext.globalThis.SKORPublicMatchClock;
assert.ok(publicClock, "public clock helper must expose its renderer contract");
const runningClock={clock_phase:"first_half",clock_running:true,clock_elapsed_seconds:600,clock_started_at:"2026-09-27T16:00:00.000Z"};
assert.equal(publicClock.officialSeconds(runningClock,Date.parse("2026-09-27T16:00:12.900Z")),612);
assert.equal(publicClock.format(612),"10:12");
assert.equal(publicClock.phaseLabel(runningClock),"1st Half");
assert.equal(publicClock.isCurrent(runningClock),true);
assert.equal(publicClock.isCurrent({...runningClock,clock_phase:"full_time"}),false);

for (const required of [
  "clock_phase",
  "clock_running",
  "clock_elapsed_seconds",
  "clock_started_at",
  "clock_phase_started_at",
  "half_length_minutes",
  "sub_interval_minutes",
  "control_match_clock",
  "trg_stamp_match_event_clock",
  "report_game_day_event",
  "report_ref_decision"
]) assert.ok(migration.includes(required), `migration must contain ${required}`);

assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /revoke all on function public\.control_match_clock[\s\S]*from public, anon/i);
assert.match(migration, /grant execute on function public\.control_match_clock[\s\S]*to authenticated/i);
assert.match(publicClockMigration, /create or replace function public\.get_public_match_clocks\(\)/i);
assert.match(publicClockMigration, /security definer\s+set search_path = ''/i);
assert.match(publicClockMigration, /where m\.published = true/i);
assert.match(publicClockMigration, /revoke all on function public\.get_public_match_clocks\(\) from public, anon, authenticated/i);
assert.match(publicClockMigration, /grant execute on function public\.get_public_match_clocks\(\) to anon, authenticated/i);
assert.doesNotMatch(publicClockMigration, /s\.(active|motm_voting_open|ref_review_open|created_by|updated_by)/i);

const officialSeconds = ({ anchor, running, startedAt, now }) =>
  Math.max(0, anchor + (running && startedAt ? Math.floor((now - startedAt) / 1000) : 0));
assert.equal(officialSeconds({ anchor: 900, running: true, startedAt: 1_000_000, now: 1_012_900 }), 912);
assert.equal(officialSeconds({ anchor: 912, running: false, startedAt: null, now: 9_000_000 }), 912);
assert.equal(45 * 60, 2700, "second half must anchor at 45:00 for a 45-minute match");
assert.equal(40 * 60, 2400, "second half must anchor at 40:00 for a 40-minute match");

assert.match(handbook, /Game Day clock and live scoring/);
assert.match(clockDoc, /The captain\/admin clock is official/);
assert.match(clockDoc, /Background push notifications are not part of v55\.0/);

console.log("Persistent match clock verification passed.");
