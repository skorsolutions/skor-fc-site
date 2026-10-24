# Reusing strategies and bundles — v58.23

Status: built and tested; source/deployment verification pending.

## Captain workflow

- Load/build a strategy, then choose **Clone strategy to lineup** to reuse every bundle and animation step.
- Choose **Clone bundle to lineup** for the selected bundle, or use Clone to lineup on a saved strategy/bundle card. A bundle becomes a new one-bundle strategy draft for the chosen lineup.
- Use **Add to current** on a saved bundle to append it to the strategy currently being edited, mapped to that strategy's players. Other bundles stay unchanged.
- Choose the target current/saved lineup, review the formation check and position-by-position player replacements, name the new copy and confirm. If the target changes during preview, review the refreshed mapping and confirm again.
- Tweak movements and coaching instructions, then use **Save Strategy**, **Save Scene Bundle**, Preview and the existing GIF/PNG exports as appropriate. Nothing is automatically saved to the shared database or published for AI by the clone action itself; a local recovery copy is maintained.

Creating a new strategy draft replaces the editor's working draft; save other unsaved work first. Saved originals remain unchanged. Add to current retains the other working bundles. Edit original is a separate confirmed action that loads that bundle's original lineup and keeps its library identity, so Save Scene Bundle intentionally edits the original record.

## Mapping and compatibility

The pure `strategy-reuse.js` helper reads source `lineup_snapshot.slots`, target slots and the canonical Strategy formation roles. It maps old GK to target GK, old LB to target LB, and so forth, across all eight supported standard formations. A player's identity, jersey or current drawn coordinates never determines their tactical role. The same player moving to a different role follows the new role's path.

Each source frame must contain the complete source squad exactly once. Source and target lineups need the same standard formation with filled, unique slots and resolved target roster metadata. Different/unknown/custom formations, incomplete lineups, duplicate actors or unmatched frame players disable copying with an actionable warning. This version does not guess missing roles or invent movements for extra players. For saved target lineups containing TEMP players, open that lineup in Lineups first to load the correct match's roster records.

Every copied sub-scene preserves movement coordinates, opponents, ball, drawings and sequence. Target names/numbers/keeper duties replace every home actor; a starting TEMP keeper uses the target spare jersey, never the source spare number. Scene and step IDs are regenerated. `sourceBundleId` is cleared, and top-level compatibility-frame mirrors are rebuilt from the copied first frame so legacy consumers cannot see old actors. Later edits to either copy/library never mutate the other.

Coaching notes and text labels remain literal copies. The dialog and result status explicitly ask captains to review names and adapt the plan for different strengths. Names are not automatically replaced because short-name references can be ambiguous. Existing preview speed/GIF behavior is retained; no per-step timing schema or AI-generated movement is added.

## Persistence and original protection

The existing `match_strategies`, `strategy_scene_bundles` and `publish_match_strategy` contracts are unchanged. No migration or new server endpoint is needed. New source/target state, event/match/variation IDs and player details are serialized with the copy.

- New copies carry `copyAsNew` in local recovery and on embedded bundle snapshots. Their first strategy save and first library-bundle save use INSERT only. A uniqueness conflict yields a rename message and never falls back to updating an original.
- After the first successful save, that new record has its own identity and normal existing name-based saving rules apply. Manual later renames must still respect those ordinary rules. Bundle copy guards remain until that bundle itself is saved as a new library record.
- Original published records remain published; the new strategy starts as a draft with `ai_context_enabled=false` and no published timestamp. Explicit manual Publish for AI uses the existing captain-protected publication flow.
- Explicit Tinker sources remain Tinker on recovery/reload, even if the Lineup Builder currently selects a scheduled match.
- Native dialogs close on logout and validate captain context again at confirmation. Library loading/saving guards prevent cloning while a save is in progress. No new access permissions are introduced.

Copying depends on the saved source snapshot, not a later edited lineup variation. Incomplete older sources require a complete source strategy before they can be reused; this release does not rewrite historical snapshots to invent missing assignments.

## Verification

`test:strategy-reuse` executes the pure mapper across all formations and uses the actual Strategy preview/apply/save/serialization/export controllers with synthetic DOM and database adapters. Fixtures include two eleven-step bundles, swapped players/roles, target TEMP keeper numbering, unchanged source records, all movement/ball/opponent/mark data, regenerated IDs, compatibility mirrors, mismatch/incomplete/custom guards, copy-name conflicts, no update fallback after duplicate inserts, current/saved target metadata, a changed-target re-review, escaping, appended copies, original bundle editing, Tinker recovery and saved-record reload. The SVG used by GIF/PNG rendering is checked for target actor identities.

Existing Strategy animation, keeper, lineup/referee export, clock/alarm, inbox, privacy and ribbon checks cover surrounding behavior. Read-only production shape inspection confirmed the existing eleven-step library bundle has eleven actors per frame, with no actor outside its saved source slots; the three saved strategies have slot snapshots, and an older partial strategy is handled by the incomplete-source guard. No production copy/save or data rewrite was performed during verification.

Real phone/desktop rendering, browser GIF download and an actual signed-in production save cannot be verified in this environment. Source hash/file-set and Cloudflare production checks remain pending.

## Future AI work

Stable formation-role mapping and preserved structured steps provide a foundation for future AI suggestions/generation using the current formation and lineup. This release does not call AI or infer player strengths. AI-generated drafts would need the same formation/player validation and explicit captain review/publication.
