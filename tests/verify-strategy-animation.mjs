import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const admin = read("admin.html");
const strategy = read("strategy.js");
const css = read("strategy.css");
const migration = read("supabase/migrations/20260927220904_add_strategy_scene_bundles.sql");
const pregame = read("supabase/functions/generate-pregame-talk/index.ts");
const handbook = read("docs/PROJECT-HANDBOOK.md");

new vm.Script(strategy, { filename: "strategy.js" });
for (const id of [
  "strategySubScenes",
  "strategyAddSubScene",
  "strategyDuplicateSubScene",
  "strategyMoveSubSceneLeft",
  "strategyMoveSubSceneRight",
  "strategyDeleteSubScene",
  "strategyPreviewPlay",
  "strategyAnimationSpeed",
  "strategySaveBundle",
  "strategyExportGif",
  "strategyBundleLibrary",
]) assert.match(admin, new RegExp(`id="${id}"`), `admin.html must include ${id}`);

assert.match(admin, /Scene Bundle Library/);
assert.match(admin, /Export bundle GIF/);
assert.match(admin, /captain-portal-v58\.0-strategy-animation-bundles/);
assert.match(css, /strategy-subscene-panel/);
assert.match(css, /strategy-subscene-tab\.active/);
assert.match(strategy, /import\("\.\/vendor\/gifenc\/index\.js"\)/);
assert.match(strategy, /A Scene Bundle can contain up to 12 animation steps/);
assert.match(strategy, /Library edits will not alter this copy/);

const context = {
  window: {},
  document: { getElementById: () => null },
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};
vm.runInNewContext(strategy, context, { filename: "strategy.js" });
const api = context.window.SKORStrategy?.__test;
assert.ok(api, "strategy test helpers must be exposed");

const legacy = api.normalizeDraft({
  version: 1,
  title: "Legacy",
  source: { id: "legacy", eventKey: "tinker", eventLabel: "Tinker / No Game", state: {}, roster: [] },
  opponentFormation: "4-4-2",
  activeSceneId: "old-scene",
  scenes: [{
    id: "old-scene",
    name: "Old Scene",
    type: "defense",
    points: "Stay narrow",
    home: [{ id: "p1", name: "Eddy", number: 11, x: 20, y: 70 }],
    opponents: [{ id: "opp_1", label: "ST", x: 50, y: 25 }],
    ball: { x: 75, y: 50 },
    drawings: [],
  }],
});
assert.equal(legacy.version, 2);
assert.equal(legacy.scenes[0].subScenes.length, 1);
assert.equal(legacy.scenes[0].subScenes[0].ball.x, 75);
assert.equal(legacy.scenes[0].category, "defense");

const midpoint = api.interpolateFrame(
  { name: "Right", home: [{ id: "p1", x: 20, y: 50 }], opponents: [], ball: { x: 20, y: 50 }, drawings: [] },
  { name: "Center", home: [{ id: "p1", x: 60, y: 70 }], opponents: [], ball: { x: 60, y: 50 }, drawings: [] },
  0.5,
);
assert.equal(midpoint.home[0].x, 40);
assert.equal(midpoint.home[0].y, 60);
assert.equal(midpoint.ball.x, 40);

const stored = api.sceneForStorage(legacy.scenes[0]);
assert.equal(stored.subScenes.length, 1);
assert.deepEqual(stored.ball, stored.subScenes[0].ball);
assert.ok(stored.home.length, "top-level compatibility frame must remain available");

for (const required of [
  "create table public.strategy_scene_bundles",
  "unique (event_key, category, name_key)",
  "jsonb_array_length(subscenes) between 1 and 12",
  "enable row level security",
  "strategy_scene_bundles_select_captain",
  "strategy_scene_bundles_insert_captain",
  "strategy_scene_bundles_update_captain",
  "strategy_scene_bundles_delete_captain",
  "grant select, insert, update, delete on table public.strategy_scene_bundles to authenticated",
  "notify pgrst, 'reload schema'",
]) assert.ok(migration.includes(required), `migration must contain ${required}`);

assert.match(migration, /revoke all on table public\.strategy_scene_bundles from public, anon, authenticated/i);
assert.match(pregame, /sub_scenes: subScenes/);
assert.match(pregame, /animation_step_count: subScenes\.length/);
assert.match(pregame, /unrelated bundles run as one continuous play/);
assert.match(handbook, /Scene Bundle/);

console.log("Strategy Scene Bundle and GIF verification passed.");
