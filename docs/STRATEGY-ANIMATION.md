# Strategy Scene Bundles and Animation

Last updated: 2026-09-27 ET
Captain Portal build: **v58.0**

## Purpose and vocabulary

The Strategy workspace separates a complete game plan from the individual tactical situations that make it up:

| Level | Meaning | Example |
| --- | --- | --- |
| Strategy | Complete plan for a game or Tinker board | “Milliken Match Plan” |
| Scene Bundle | One independent tactical chapter | “Narrow Defense” |
| Sub-scene | One animation keyframe inside that bundle | “Ball on right” |

A bundle is not automatically joined to the next bundle. “Narrow Defense” may animate through ball-right, ball-center, and ball-left steps, while “Offense in Possession” remains a separate animation/export.

## Numbering and ordering

- Scene Bundle order is stored as array order inside the Strategy.
- Sub-scene order is stored as array order inside its parent bundle.
- Numbers are display-only and derived at render time: 1.1, 1.2, 1.3, then 2.1, 2.2, and so forth.
- Reordering a bundle or keyframe immediately renumbers the visible tabs and export label.
- Stable generated IDs, not the visible number, identify records while editing.
- A Strategy supports 1–20 bundles. A bundle supports 1–12 sub-scenes.

## Editor behavior

Each sub-scene independently stores:

- SKOR player positions, names, and jersey numbers.
- Opponent placeholder roles and positions.
- Ball location.
- Arrows, lines, coaching zones, and text labels.

The parent bundle stores its name, game moment, library category, and coaching points. Creating a new step copies the selected step so the captain can move only the pieces that change. Resetting from the lineup resets only the selected step and preserves that step's coaching marks.

Changing the opponent formation applies the new opponent shape to every step in the current Strategy unless the board has been changed to Custom / Freeform.

## Preview and export

- Preview runs only the selected bundle.
- Player, opponent, and ball locations interpolate between keyframes.
- Tactical marks switch at the midpoint of a transition because they describe a discrete coaching instruction, not a physical moving object.
- Slow, Normal, and Fast alter both the hold time and transition time.
- Preview stops after one pass; the downloaded GIF loops.
- GIF export uses the vendored MIT-licensed `gifenc` 1.0.3 browser encoder.
- Frames are drawn and encoded locally in the authenticated captain's browser. No animation image is sent to Supabase, OpenAI, or a third-party rendering service.
- GIF output is 640 × 544 for practical WhatsApp sharing. PNG output remains 1400 × 1190 for the selected keyframe.
- Export names contain the strategy, bundle, and—for PNG—the selected step.

## Shared Scene Bundle library

Supabase table: `public.strategy_scene_bundles`.

Bundles are grouped by:

1. Scheduled game UUID or `tinker`.
2. Defense, Offense, Transition, Corners, Free Kicks, Other Set Pieces, or Other.

The normalized unique key is `(event_key, category, name_key)`. Saving the same bundle name again in the same group updates it instead of creating another record. **Edit** replaces the selected working bundle with the saved bundle and keeps its source ID so an explicit **Save Scene Bundle** can update or rename that record. **Add copy** inserts a snapshot after the selected bundle. A locally duplicated bundle clears its source ID and becomes independent.

Adding a bundle to a Strategy copies all bundle/keyframe JSON into the Strategy. The Strategy never reads live bundle contents afterward. This snapshot rule protects saved and AI-published plans from later bundle edits or deletion.

## Strategy and AI persistence

`match_strategies.scenes` remains the authoritative ordered Strategy snapshot. New scene objects contain:

- `id`, `sourceBundleId`, `name`, `type`, `category`, and `points`.
- `activeSubSceneId`.
- Ordered `subScenes`.
- A top-level copy of the first frame's `home`, `opponents`, `ball`, and `drawings` for backward compatibility.

Old records without `subScenes` load as a parent bundle containing one sub-scene. No data migration of existing strategy rows is needed.

Only an explicitly AI-published scheduled-game Strategy is read by `generate-pregame-talk`. The Edge Function sends each bundle's ordered sub-scenes as `sub_scenes`, plus a first-frame compatibility summary. Tinker bundles, library-only bundles, and ordinary Strategy drafts are never supplied to AI.

## Security and database rules

- `strategy_scene_bundles` has RLS enabled.
- All select/insert/update/delete policies require `is_skor_captain()`.
- `PUBLIC` and `anon` receive no table privileges.
- `authenticated` receives only select, insert, update, and delete; RLS remains the authorization boundary.
- Insert/update policies bind audit identity to `auth.uid()`.
- Match, lineup-variation, creator, and updater foreign keys have supporting indexes.
- The migration explicitly grants authenticated Data API access because new Supabase tables are not assumed to be automatically exposed.

## Production backend status

- Approved migration `20260927220904_add_strategy_scene_bundles.sql` was applied as Supabase migration `20260927223330 add_strategy_scene_bundles` on 2026-09-27.
- The new table was empty at creation; existing saved strategies and every other table/row were preserved.
- RLS, grants, policies, constraints, indexes, and Supabase advisors were checked after migration.
- The approved `generate-pregame-talk` update is active as version 13 with JWT verification enabled.
- Its OpenAI request uses `store: false`; the protected context is assembled only for an authenticated captain's deliberate Pregame Talk request.
- Frontend release `a3f912637a3f0e1153906bb9397c3da29aab3708` was verified on `skorfc.net` on 2026-09-27. The v58.0 portal marker, Strategy assets, and browser-required GIF encoder modules exactly matched the repository.

## Release and verification checklist

- Run `node --check strategy.js` and syntax-check every vendored module.
- Run `npm run test:strategy-animation`.
- Run lineup export, referee-card, and persistent-clock regression suites.
- Apply `20260927220904_add_strategy_scene_bundles.sql` only after explicit approval.
- Deploy `generate-pregame-talk` only after explicit approval.
- Validate RLS/grants, insert, same-name overwrite, rename/update, delete, and snapshot preservation as an authenticated captain.
- Run Supabase security and performance advisors after applying the migration.
- On phone and desktop, test bundle/step reordering, preview, GIF download, PNG download, and library grouping.
- Verify an old flat Strategy loads as one-step bundles.
- Verify an explicitly published Strategy reaches AI with ordered sub-scenes; verify a draft/Tinker Strategy does not.
