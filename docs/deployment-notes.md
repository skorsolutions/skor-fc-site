# v58.0 — Strategy Scene Bundles and local GIF animation

- Upgrades each Strategy scene into a parent **Scene Bundle** with ordered animation sub-scenes such as 1.1 ball right, 1.2 ball center, and 1.3 ball left.
- Adds bundle and sub-scene creation, duplication, reordering, renaming/editing, and removal while automatically renumbering the visible hierarchy.
- Adds Slow, Normal, and Fast preview for the selected bundle only. Unrelated tactical bundles never play as one continuous animation.
- Adds a browser-local looping GIF export for each Scene Bundle and keeps a high-resolution PNG export for the selected sub-scene. Tactical images are not uploaded for rendering.
- Adds a shared captain Scene Bundle library grouped by game/Tinker and tactical category, with same-name overwrite, Edit/update/rename, Add copy, delete, direct GIF export, and snapshot-based reuse.
- Preserves all existing saved Strategy rows. A legacy flat scene becomes a one-step bundle at load time, and new saves retain a first-frame compatibility mirror.
- Extends the explicitly published Pregame Talk context with ordered bundle sub-scenes, set pieces, player/opponent movement, ball movement, and tactical marks. Drafts, Tinker bundles, and library-only bundles remain excluded from AI.
- Adds responsive phone controls, focused regression coverage, a vendored MIT-licensed `gifenc` 1.0.3 encoder, and `docs/STRATEGY-ANIMATION.md`.
- **SQL needed:** Yes. The approved local migration `20260927220904_add_strategy_scene_bundles.sql` was applied as Supabase migration `20260927223330 add_strategy_scene_bundles`.
- **Database changes performed:** Created the empty captain-only `strategy_scene_bundles` table with RLS, least-privilege grants, event/category/name uniqueness, JSON keyframe limits, audit fields, and supporting indexes. Existing `match_strategies` and all other tables and rows were preserved. Policy, grant, constraint, and index checks passed; Supabase advisors found no new security issue, with only expected unused-index notices for the new empty table.
- **Edge Function deployment:** The approved `generate-pregame-talk` update was deployed as active version 13 with JWT verification enabled. The deployed source was checked for ordered `sub_scenes`, animation step counts, and the separation rule for unrelated bundles. The function sends the approved match/captain context to OpenAI with `store: false` only after an authenticated captain deliberately generates a Pregame Talk.
- **Live status:** Production release commit `a3f912637a3f0e1153906bb9397c3da29aab3708` was verified on `skorfc.net` on 2026-09-27. Captain Portal served `captain-portal-v58.0-strategy-animation-bundles` with `strategy.js?v=58.0` and `strategy.css?v=58.0`. The live HTML, Strategy JavaScript/CSS, all browser-required `gifenc` runtime modules, and the vendored license exactly matched the repository files.
- Affected assets: `admin.html`, `strategy.css`, `strategy.js`, `vendor/gifenc/*`, `supabase/migrations/20260927220904_add_strategy_scene_bundles.sql`, `supabase/functions/generate-pregame-talk/index.ts`, `package.json`, `tests/verify-strategy-animation.mjs`, `docs/STRATEGY-ANIMATION.md`, `docs/PROJECT-HANDBOOK.md`, and this deployment note.

## v57.0 — Public official match clock and timestamped Match Center

- Shows the captain-controlled official clock on the public Home featured match and current-game schedule row while the match is in the first half, halftime, or second half.
- Shows the same official clock prominently on the selected Match Center scoreboard and on the current-game list row.
- Reconstructs running time every second from the Supabase server anchor, so viewers see smooth persistent time without making a database request every second.
- Refreshes the safe public clock projection every five seconds and public match status, score, and timestamped events every 30 seconds.
- Labels Match Center goals, cards, and fouls with explicit **Official MM:SS · Half** timestamps; historical events remain labeled **Official time not recorded** instead of receiving guessed minutes.
- Keeps the existing database trigger as the timestamp authority. Captain Game Day now blocks a new live event until the official clock is in the first or second half, while edits preserve the event's original timestamp.
- Adds `get_public_match_clocks()`, a narrow read-only RPC for published matches. It exposes only clock calculation fields and no Crowd access, invite, participant, voting, captain, or write data.
- Verification: JavaScript syntax, duplicate-ID checks, public clock calculations, migration security/grants, direct anonymous RPC execution, persistent-clock suite, and lineup/referee-card regression suites all passed. Production browser/DOM checks then confirmed the released page structures and build markers.
- **SQL needed:** Yes. The approved migration `20260927134927_expose_public_match_clock.sql` was applied as Supabase migration `20260927134927 expose_public_match_clock`.
- **Database changes performed:** Added only the read-only `get_public_match_clocks()` function and its least-privilege execute grants. The migration contains no table or row mutation; existing match, session, and event data was preserved. Anonymous execution returned only the seven documented clock fields and zero unpublished rows. Supabase advisors correctly report the intentionally public `SECURITY DEFINER` endpoint; the projection, published-match filter, empty search path, explicit qualification, and revoked `PUBLIC` grant were validated. No Edge Function deployment was required.
- **Live status:** Production release commit `8dbc56e4aa071f4580d5ae414c5c36c3ce7e6ab9` was verified on `skorfc.net` on 2026-09-27. Home served `public-home-v57.0-official-live-match-clock`, Match Center served `public-match-center-v57.0-live-official-clock`, Captain Portal served `captain-portal-v57.0-public-official-match-clock`, and the deployed `public-match-clock.js?v=57.0` exactly matched the repository asset. The anonymous production RPC returned only the documented seven fields. Its returned sessions were already at full time, so no clock was expected to be visible during the verification window.
- Affected assets: `index.html`, `matches.html`, `admin.html`, `public-match-clock.js`, `tests/verify-match-clock.mjs`, `tests/verify-lineup-export.mjs`, `tests/verify-ref-game-card.mjs`, `supabase/migrations/20260927134927_expose_public_match_clock.sql`, `docs/GAME-DAY-CLOCK.md`, `docs/PROJECT-HANDBOOK.md`, and this deployment note.

## v56.3 — Referee-card Excel one-page layout repair

- Fixes Excel player rows whose names and jersey numbers could be vertically cut off.
- Narrows the roster sequence and jersey-number columns, gives the player-name column the useful remaining width, and centers the sequence numbers.
- Uses 18.5-point roster rows to preserve readability without pushing the referee signatures below the page.
- Removes the competing fixed Excel scale percentage and explicitly enables one-page-wide/one-page-tall fit with automatic page breaks disabled.
- Uses 0.18-inch print margins so the right-side referee fields and the final **Linesman 2** row remain inside one US Letter landscape page.
- Preserves the existing 26 player rows, full-name/TEMP ordering, missing-cell repair, editable header mapping, PDF layout, and read-only integration boundaries.
- Verification: referee-card, lineup-export, and persistent-clock suites; JavaScript syntax; Excel archive integrity and print metadata; and a generated one-page Letter landscape render confirming the complete right edge and **Linesman 2** line.
- Documentation: updates `docs/REF-GAME-CARD.md` and the durable project handbook with the Excel sizing and print rules.
- **SQL needed:** No.
- **Database changes performed:** None. No Supabase migration or Edge Function deployment is required.
- **Live status:** Published to GitHub `main` in release commit `27f20c7`. The connected Cloudflare production deployment is live; the public Captain Portal v56.3 build marker, visible v56.3 label, and v56.3 `ref-game-card.css` / `ref-game-card.js` asset references were verified from `skorfc.net`.
- Affected assets: `admin.html`, `ref-game-card.js`, `tests/verify-ref-game-card.mjs`, `tests/verify-lineup-export.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/REF-GAME-CARD.md`, and this deployment note.

## v56.2 — Referee-card PDF layout repair

- Rebalances the one-page US Letter landscape layout so the referee header, Weather/Field row, and Sportsmanship section no longer overlap.
- Increases roster text legibility while preserving all 26 printed player rows and the one-page output.
- Centers populated team, coach, opponent, league, field, date, and scheduled-time values horizontally and vertically within their underlined form fields; roster player names remain left-aligned for readability.
- Keeps the Excel export and all v56.1 missing-cell handling unchanged.
- Adds regression checks for the print-grid spacing, centered field rules, larger roster type, and v56.2 asset versions.
- Documentation: updates `docs/REF-GAME-CARD.md` and the durable project handbook with the approved PDF layout rules.
- **SQL needed:** No.
- **Database changes performed:** None. No Supabase migration or Edge Function deployment is required.
- **Live status:** Published to GitHub `main` in release commit `eb632c2` and deployed through the connected Cloudflare production build. The live Captain Portal v56.2 marker and exact `ref-game-card.css`/`ref-game-card.js` assets were verified from `skorfc.net`.
- Affected assets: `admin.html`, `ref-game-card.css`, `ref-game-card.js`, `tests/verify-ref-game-card.mjs`, `tests/verify-lineup-export.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/REF-GAME-CARD.md`, and this deployment note.

## v56.1 — Referee-card blank Excel cell repair

- Fixes **Download Excel** failing with `Excel template cell B31 is missing` when the sanitized organization workbook omits XML nodes for completely blank handwriting rows.
- Missing cells that will remain blank are now left untouched. If a selected squad is large enough to need an omitted cell, the exporter creates it in the correct worksheet row and column and inherits the nearest same-column template style.
- Keeps all v56.0 roster rules unchanged: starters plus Substitutes only, full permanent-player names, TEMP players last, duplicate/missing-number validation, and all 26 physical rows available for printing or handwriting.
- Adds a regression fixture that confirms `B31` is absent from the template and verifies that the exporter contains both safe missing-blank handling and missing-populated-cell creation.
- Documentation: updates `docs/REF-GAME-CARD.md` and the durable project handbook with the blank-cell rule.
- **SQL needed:** No.
- **Database changes performed:** None. No Supabase migration or Edge Function deployment is required.
- **Live status:** Published to GitHub `main` in release commit `9ca552a` and deployed through the connected Cloudflare production build. The live Captain Portal v56.1 marker and the exact repaired `ref-game-card.js` asset were verified from `skorfc.net`.
- Affected assets: `admin.html`, `ref-game-card.js`, `tests/verify-ref-game-card.mjs`, `tests/verify-lineup-export.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/REF-GAME-CARD.md`, and this deployment note.

## v56.0 — Referee game-card print and Excel export

- Adds a separate **Ref Game Card** action beside lineup PNG/JPG export.
- Uses the current selected scheduled game and current Lineup Builder board, including only starters and the named Substitutes bench.
- Uses permanent players' full roster names, sorts permanent players by jersey number, and appends match-specific TEMP players with their assigned jersey numbers.
- Preserves all 26 physical player rows from the supplied organization layout; unused rows remain blank for handwritten, last-minute additions.
- Auto-fills opponent, date, field, scheduled kickoff, coach, and team colors. The export preview allows one-time header corrections without changing Supabase.
- Blocks output for Tinker/no-game boards, an empty squad, more than 26 players, stale identities, missing jersey numbers, or duplicate jersey numbers.
- Adds a phone-capable preview and one-page US Letter landscape **Print / Save PDF** flow.
- Adds a match-specific **Download Excel** flow that preserves the official styling and applies the `A1:L36` one-page print area.
- Sanitizes the committed Excel template so no historical opponent or player list is stored in the public repository; current roster data is inserted only in the captain's browser.
- Connected behavior: reads existing `matches`, current lineup state, `team_roster`, `match_temp_players`, and TEMP jersey assignments. It does not modify Production / Final, attendance, Game Day, Crowd Scoring, public Matches, Notebook, Strategy, or AI context.
- Verification: focused data/ordering/validation/template tests, Captain Portal inline-JavaScript parsing, existing lineup-export and persistent-clock suites, generated Excel inspection/rendering, and responsive-layout contract checks. Live desktop/phone review remains part of post-deployment verification.
- Documentation: adds `docs/REF-GAME-CARD.md` and updates the durable project handbook.
- **SQL needed:** No.
- **Database changes performed:** None. No Supabase migration or Edge Function deployment is required.
- **Live status:** Published to GitHub `main` in release commit `bf25c69` and deployed through the connected Cloudflare production build. The live Captain Portal v56.0 marker, Ref Game Card control, JavaScript, responsive print CSS, and valid Excel template archive were verified from `skorfc.net`.
- Affected assets: `admin.html`, `ref-game-card.js`, `ref-game-card.css`, `assets/SKOR-Ref-Game-Card-Template.xlsx`, `package.json`, `tests/verify-ref-game-card.mjs`, `tests/verify-lineup-export.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/REF-GAME-CARD.md`, and this deployment note.

## v55.2 — Opponent-18 Gameplan crop and larger jerseys

- Crops the Shareable Gameplan Export at the opponent's 18-yard line, removing the opponent goal, goal area, and penalty area from the picture.
- Widens the visible pitch from 720 to 800 pixels and uses the real cropped proportion of `68:88.5` instead of rendering the complete 105-metre field.
- Enlarges on-field jerseys from `68 × 60` to `100 × 88` pixels and scales their numbers, role labels, player names, TEMP labels, and captain badge for better phone readability.
- Remaps canonical full-pitch vertical positions into the cropped field without changing saved lineup coordinates. Adds a small export-only goalkeeper adjustment to avoid a center-back/goalkeeper label collision at the larger size.
- Keeps the in-portal preview and PNG/JPG download on the same SVG renderer. Bench, Potential Positions, every enabled substitution wave, quote, notes, Crowd Game Day, public Matches, saved lineups, and AI context are unchanged.
- Verification: all Captain Portal inline JavaScript parses; the renderer-contract test validates the crop dimensions, coordinate transformation, opponent-box removal, larger jerseys, goalkeeper spacing, shared preview/download renderer, and documentation; the persistent-clock suite still passes. An actual `3-2-3-2` export fixture with eleven starters, a captain, and three substitutes was rendered and visually checked after user approval.
- **SQL needed:** No.
- **Database changes performed:** None. No Supabase migration or Edge Function deployment was required.
- Affected assets: `admin.html`, `tests/verify-lineup-export.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/LINEUP-EXPORT.md`, and this deployment note.

## v55.1 — Lineup-style Gameplan picture

- Rebuilds the Shareable Gameplan Export around the same vertical `68:105` field proportion used by the Lineup Builder, Crowd Game Day, and public Matches.
- Replaces the old circular on-field markers with maroon jersey/shirt silhouettes containing the saved jersey number, plus role, optional player name, TEMP label, and captain badge.
- Uses the exact canonical saved formation coordinates instead of rescaling the occupied players to fill a wide landscape field.
- Matches the lineup presentation with striped grass and proportionally placed halfway line, center circle, penalty areas, and six-yard boxes.
- Keeps one renderer for the live preview and PNG/JPG downloads, so the preview is the exported picture.
- Preserves the existing named bench, optional Potential Positions, every enabled substitution wave, quote, notes, dynamic-height reflow, and WhatsApp-ready download workflow.
- Verification: all Captain Portal inline JavaScript parses; `test:lineup-export` validates the pitch ratio, canonical-coordinate mapping, jersey marker, shared preview/download renderer, and removal of the old circular on-field marker; the existing persistent-clock suite still passes. A rendered `3-2-3-2` fixture was visually checked for pitch proportions, jersey spacing, labels, captain badge, bench flow, and clipping.
- Documentation: adds `docs/LINEUP-EXPORT.md` and updates the durable project handbook.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected assets: `admin.html`, `package.json`, `tests/verify-lineup-export.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/LINEUP-EXPORT.md`, and this deployment note.

## v55.0 — Persistent official match clock

- Adds a captain-authoritative match clock that persists through refreshes and closed apps by storing a Supabase elapsed-time anchor and server start timestamp.
- Adds 40/45-minute halves, pause/resume, an explicit Halftime action with a separate break timer, second-half continuation from exactly 40:00/45:00, and explicit Full Time.
- Synchronizes clock phase changes with the existing Scheduled → 1st Half → Halftime → 2nd Half → Final match status flow.
- Adds visual/vibration warnings when the regulation halftime/full-time threshold is reached; the referee remains authoritative and the phase never changes automatically.
- Adds score-neutral **SKOR Foul** and **Opponent Foul** actions to captain scoring, plus server-derived official timestamps on new captain goals/cards/fouls, Crowd goals/cards, and Crowd referee/foul reviews. Captain, Crowd, and public event feeds display the captured time; historical events are not assigned guessed minutes.
- Adds 10/15-minute substitution cadence, Defense/Midfield/Strikers/Mixed wave groups, optional exact absolute match minutes, two-minute **GET READY** reminders, and **SUB NOW** alerts.
- Carries wave group/timing metadata through saved lineup JSON, exports, Production / Final, Captain Game Day, and Crowd Game Day while preserving older saved lineups.
- Separates official clock state from Crowd access: configuring or running the clock does not automatically open Crowd Scoring.
- Documentation: adds `docs/GAME-DAY-CLOCK.md` and updates the durable project handbook with the state machine, data contract, security boundary, deployment order, and operational checklist.
- Verification: the automated clock test passes; all inline JavaScript in `admin.html`, `gameday.html`, and `matches.html` parses; shared JavaScript modules parse; HTML IDs are unique; and whitespace/error checks pass. Live schema checks confirmed all clock/event timestamp columns, constraints, the supporting foreign-key index, the enabled event-stamping trigger, and authenticated-only grants for the new/updated RPCs. Supabase security/performance advisors were rerun: the clock changes add no new warning/error, while the fresh supporting index has the expected initial unused-index informational notice; unrelated pre-existing project findings remain.
- **SQL needed:** Yes — `supabase/migrations/20260926203049_add_persistent_match_clock.sql`.
- **Database changes performed:** The approved migration was applied successfully as `20260927001357 add_persistent_match_clock`. Existing Game Day sessions and match events were preserved; historical event times were not backfilled or guessed. No Edge Function deployment was required.
- **Live status:** Published to GitHub `main` and deployed through the connected Cloudflare production build; production asset markers and representative desktop/phone layouts were checked after deployment.
- Affected assets: `admin.html`, `gameday.html`, `matches.html`, `package.json`, `tests/verify-match-clock.mjs`, `docs/PROJECT-HANDBOOK.md`, `docs/GAME-DAY-CLOCK.md`, this deployment note, and `supabase/migrations/20260926203049_add_persistent_match_clock.sql`.

## v54.3 — 3-2-3-2 lineup formation and project handbook

- Adds **3-2-3-2** with `LB, CB, RB / LDM, RDM / LAM, CAM, RAM / LCF, RCF`, plus the goalkeeper.
- Makes the formation available in the Lineup Builder and as an opponent shape in Strategy.
- Carries the exact role names through Potential Positions, saved lineup variations, lineup exports, Strategy imports, Game Day, Production / Final, public Matches, and AI strategy context.
- Repairs the existing **4-5-1** public Game Day and Matches renderers so published lineups do not fall back to the 4-2-3-1 coordinates.
- Adds `docs/PROJECT-HANDBOOK.md` as the living cross-chat system reference and `AGENTS.md` as the permanent requirement to read and update it after every build.
- Records one consolidated upfront authorization step for public full-source publishing so future chats do not interrupt a release with repeated file-specific confirmations.
- Establishes a two-location release summary rule: every production release must be summarized in the chat handoff and in a GitHub comment on the release commit.
- Verification: JavaScript syntax passed for the shared modules and every inline script; automated consistency checks confirmed the exact 11-player role sequence in the builder, Strategy, Crowd Game Day, public Matches, and Production / Final role ordering.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected assets: `admin.html`, `strategy.js`, `gameday.html`, `matches.html`, `AGENTS.md`, `docs/PROJECT-HANDBOOK.md`, and this deployment note.

## v54.2 — Shared named Strategy library

- Adds a shared **Saved Strategies** library that every approved captain can load from any device.
- Groups strategies by scheduled game and **Tinker / No Game**, with Load, Publish for AI, and Delete controls.
- Saving the same strategy name again within the same game or Tinker group overwrites the existing strategy using a trimmed, case-insensitive name match.
- Allows multiple named strategies per game while enforcing one published AI strategy per scheduled game.
- Keeps browser storage only as a recovery copy; **Save Strategy** is now the persistent captain workflow.
- Captain Notebook and Pregame Talk continue to use only the explicitly published strategy, never drafts or Tinker strategies.
- **SQL needed:** Yes.
- **Approved database changes:** Expanded `match_strategies` with game/Tinker grouping fields, normalized unique names, a one-published-strategy index, and the captain-only `publish_match_strategy(uuid)` transaction. Existing strategy data was preserved.
- Strategy migration filenames now match the exact versions recorded by Supabase so future CLI migration checks stay in sync.
- Affected assets: `admin.html`, `strategy.css`, `strategy.js`, `captain-notebook.js`, and `supabase/migrations/20260926181753_expand_match_strategy_library.sql`.

## v54.1 — Strategy scene controls and phone repair

- Adds clear **Rename selected** and **Remove selected** actions beside the strategy scene tabs.
- Keeps the editable selected-scene name field for quick inline changes and disables removal when only one scene remains.
- Rebuilds the Strategy workspace at phone widths so scene tabs, scene actions, drawing tools, pitch, and coaching controls remain inside the viewport.
- Adds larger invisible touch targets around players, opponent placeholders, and the ball without changing the exported tactic image.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected assets: `admin.html`, `strategy.css`, and `strategy.js`.

## v53.2 — Optional depth chart and named export bench

- Adds an export-only option to include or omit **Potential Positions / Depth Chart** without changing the saved lineup.
- Adds an **Available Substitutes** section that lists the actual players currently assigned to the lineup bench, including jersey numbers and TEMP labels.
- Reflows the export dynamically so the bench, optional depth chart, planned waves, quote, and notes cannot overlap as their contents grow.
- Expands Planned Substitution rows when names wrap instead of allowing text to collide or hiding later waves.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v53.1 — 4-5-1 lineup formation

- Adds **4-5-1** to the Lineup Builder formation choices.
- Uses a back four, four midfielders across, one advanced central midfielder, and one striker.
- The formation is supported by the tactical board, Potential Positions depth chart, saved variations, exports, and the published Game Day lineup.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v53.0 — Jersey inventory and TEMP assignments

- Adds a dedicated **Jerseys** area to the Captain Portal for physical walk-on/TEMP kit inventory.
- Captains can manage configurable kits, starting with **Maroon** and **White**, including kit names, color labels, display colors, and archived status.
- Every physical jersey records its kit, number, size, availability, captain custodian, and optional condition/storage notes.
- Jersey choices in Lineup Builder now come only from active kits and inventory marked **On Hand**.
- One inventory jersey can be assigned to each TEMP player for a match; the physical jersey number automatically becomes the TEMP player's lineup and Game Day number.
- The same physical jersey—or another kit jersey with the same number—cannot be assigned to two active TEMP players in the same match.
- Existing TEMP players and historical manual jersey numbers remain compatible.
- View-only portal users can review inventory; only captains and super admins can add or change kits and jerseys.
- **SQL needed:** Yes.
- **Approved database changes:** Added `team_kits`, `jersey_inventory`, and nullable `match_temp_players.jersey_inventory_id`, with indexes, synchronization triggers, captain-only write policies, approved-portal read policies, and least-privilege grants.
- Affected assets: `admin.html`, `jerseys.css`, `jerseys.js`, and `supabase/migrations/20260923171652_add_jersey_inventory.sql`.

## v52.10 — Match-squad-only planned substitutions

- Planned-substitution choices now include only players currently assigned to the field or the **Substitutes** area.
- Moving a player onto the field or bench immediately makes that player available in every wave.
- Removing a player from both areas automatically removes stale selections for that player from first- and second-half waves.
- The existing **Absent** action now removes the player from the wave selections and, because the player is no longer in the match squad, from all wave choices.
- Clearing the field and substitutes keeps wave names but clears their player selections.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v52.6 — Captain-confirmed player nickname memory

- Notes and debriefs now run a player-name check when a captain saves them.
- Unfamiliar likely player names open a confirmation dialog where the captain can match the name to an active roster player or mark it as not a player.
- Confirmed mappings are shared captain memory, so later AI requests can understand nicknames consistently.
- Historical WhatsApp organization and Pregame Talk generation receive only active-player first/preferred names, jersey numbers, and captain-confirmed aliases.
- The name checker sends only the current saved text plus that limited identity guide to OpenAI with `store: false`.
- The authenticated `check-player-names` Edge Function requires JWT verification and confirms captain access inside the function.
- **SQL needed:** Yes.
- **Database changes performed:** Added `captain_player_name_aliases` with normalized unique aliases, optional remembered non-player terms, roster and confirmer foreign keys, indexes, captain-only RLS, and least-privilege grants. No existing roster, notes, comments, or debriefs were changed.
- Updated assets: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, `generate-pregame-talk`, `organize-whatsapp-note`, the new `check-player-names` function, and the alias migration.

## v52.5 — Useful player identity in AI context

- Captain-selected player comments now include the player's jersey number and first/preferred name in the protected AI context.
- Full names, email addresses, and other roster contact information remain excluded.
- Team-visible input may support constructive player-specific coaching when relevant.
- Private-to-captains input retains its protection: the generated team talk must not identify or imply who authored it.
- **SQL needed:** No.
- **Database changes performed:** None. Persistent nickname matching remains pending separate database approval.
- Updated assets: `admin.html` and `generate-pregame-talk`.

## v52.4 — Game context for selected player comments

- Every team or private player comment selected with **Use with AI** now shows its related matchup and game date in the Captain Notebook.
- The protected AI payload includes a structured `related_game` object with the match ID, kickoff date, home team, and away team for each selected comment.
- The AI is explicitly instructed to keep each player suggestion tied to that historical game and not confuse it with the upcoming target match.
- Player names and jersey numbers remain excluded from the AI payload.
- **SQL needed:** No.
- **Database changes performed:** None.
- Updated assets: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, and `generate-pregame-talk`.

## v52.3 — Captain dropdown and player-input AI controls

- Replaces the unreliable captain-name datalist with a true dropdown populated from the active captain and super-admin list.
- The new get_notebook_captain_directory() RPC exposes display names only, requires an authenticated approved captain, and does not expose captain emails or roles.
- Adds **Use with AI** to team-visible and private-to-captains player comments in Game Day.
- Player comments are included only when a captain selects them, remain selected only for the current browser session, and are re-fetched server-side before AI use.
- The AI receives those entries explicitly as player input—not captain conclusions—without the player's name or jersey number.
- Private player comments are generalized so the generated talk cannot reveal the author or that the source was private.
- **SQL needed:** Yes.
- **Database changes performed:** Added one restricted, names-only captain-directory RPC. No tables, existing notes, player comments, or other data were changed.
- Updated assets: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, and `generate-pregame-talk`.

## v52.2 — Historical WhatsApp note imports

- Adds an **Import WhatsApp Note** workflow to the Captain Notebook for older game discussions.
- Records the original captain name and original message date/time separately from the authenticated user who performs the import.
- Requires every WhatsApp import to be attached to a game and clearly labels imported entries in the Notebook feed.
- Adds a WhatsApp-only feed filter plus visible **WhatsApp** and **AI organized** labels.
- Captain names are suggested from existing Notebook and debrief history while still allowing an older or unlisted captain name.
- The optional **Organize with AI** action runs only after an authorized captain deliberately presses the button. It sends only the selected pasted text to OpenAI, uses `store: false`, and is instructed to preserve the captain's meaning without inventing tactical claims.
- The authenticated `organize-whatsapp-note` Supabase Edge Function requires JWT verification and checks `is_skor_captain()` again inside the function.
- **SQL needed:** Yes.
- **Database changes performed:** Added `source`, `attributed_captain_name`, `source_occurred_at`, and `ai_organized` to `captain_notebook_entries`, with constraints requiring game, captain, and timestamp attribution for WhatsApp imports. Existing notes were preserved and default to `source = 'manual'`.
- Affected files: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, `supabase/functions/organize-whatsapp-note/index.ts`, `supabase/migrations/20260920124706_add_whatsapp_notebook_attribution.sql`, and this deployment note.

## v52.1 — AI Pregame Talk and improved debriefs

- Adds an editable **Pregame Talk** generator to the Captain Notebook for a selected upcoming match, with tone, length, formation context, and captain-priority controls.
- Grounds suggestions in completed captain-shared debriefs, selected-game attendance/availability, the current generator inputs, and general soccer strategy.
- Private Notebook notes, debrief drafts, RSVP notes, and individual player assessments are not sent to OpenAI.
- AI requests run through the authenticated `generate-pregame-talk` Supabase Edge Function. The OpenAI key remains server-side, JWT verification is enabled, captain access is checked again inside the function, and model output uses a strict JSON schema.
- Generated talks remain editable and can be copied, printed, or saved into the existing Captain Notebook.
- Adds the debrief question **What improved from the previous match, and what caused it?**
- **SQL needed:** Yes.
- **Database changes performed:** Added the nullable `captain_match_debriefs.improvements_since_last_game` text column with a 3,000-character check constraint. No existing debrief rows were changed or backfilled.
- Affected files: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, `supabase/functions/generate-pregame-talk/index.ts`, `supabase/migrations/20260920050804_add_debrief_improvements_since_last_game.sql`, and this deployment note.

## v52.0 — Captain Notebook

- Adds an isolated **Captain Notebook** view to the Captain Portal without rewriting the existing Lineups, Game Day, Announcements, Roster, or Player Portal engines.
- Captains can record private or captain-shared notes and associate them with a match, player, and coaching category.
- Adds guided post-game debriefs covering overall performance, standout players, tactical observations, issues, position changes, and practice priorities.
- Adds a Captain Dashboard prompt for the newest past/final match that the signed-in captain has not completed a debrief for; private drafts can be resumed directly.
- Adds structured player-by-player observations with quick coaching tags and optional written detail. Confirmed match attendees are shown first when attendance is available.
- Each captain drafts independently. Drafts remain private to their author; completed reviews become readable by other approved captains.
- The portal detects a missing Notebook schema and shows a safe setup-pending state instead of affecting other live portal features.
- New isolated assets: `captain-notebook.css` and `captain-notebook.js`.
- SQL applied: `create_captain_notebook` plus `tighten_captain_notebook_grants`. The three new tables use RLS, author ownership checks, captain-only sharing, and least-privilege authenticated grants.

## v51.40 — Create announcements from scheduled games

- Each scheduled game now includes a **Create Announcement** action.
- The action opens the existing announcement editor and prefills the match type, current publish date, matchup, kickoff, arrival time, location, home/away status, and the reminder to bring both kits.
- The message ends with an **Additional notes** area and remains fully editable before publication.
- Creating the draft does not publish anything; the captain must still review it and press **Publish Announcement**.
- The scheduled match's saved arrival time is used when available, with the existing 45-minute fallback otherwise.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v51.39 — Reorder substitution waves

- Every first-half and second-half substitution wave now has **↑ Up** and **↓ Down** controls.
- Captains can add a new wave at the end and move it between existing waves.
- Reordering stays within the selected half and immediately renumbers all waves.
- The **Bench after this wave** calculations and lineup export order update immediately after a move.
- First and last waves disable unavailable move directions.
- Existing saved lineup data remains compatible because waves were already stored as ordered arrays.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v51.38 — Show every substitution wave on export

- The lineup image export no longer limits each half to four substitution waves.
- Every first-half wave is rendered in full; every second-half wave is also rendered when second-half export visibility is enabled.
- The substitutions card and total image height now grow dynamically so additional waves do not overlap the quote or gameplan notes.
- The previous `+ N more ... planned` summary is removed.
- The existing second-half export visibility toggle is preserved.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v51.37 — Overwrite same-name lineup variations

- Saving a lineup now updates the newest existing variation when the selected game and trimmed lineup name match.
- Name matching is case-insensitive, so `Balanced` and `balanced` are treated as the same lineup within one game.
- The same lineup name can still exist independently under different games.
- The rule applies to both **Save Variation** and **Copy Current to Game**.
- Existing historical duplicate rows are preserved; this change prevents new duplicates during normal captain saves.
- No Supabase schema, policy, or direct data changes were made.
- Affected file: `admin.html`.

## v51.36 — Bench tracker beneath substitution waves

- Each planned substitution wave now shows a compact **Bench after this wave** panel directly beneath it.
- The bench is calculated cumulatively: players entering are removed from the bench, players leaving are added, and each later wave starts from the prior wave's result.
- Second-half wave calculations continue from the completed first-half plan.
- Bench chips include the same player labels and jersey numbers used elsewhere in the lineup builder.
- This is a lineup-planning UI change only; no Supabase schema or saved-state changes are required.
- Affected file: `admin.html`.

## v51.35 — Restore Potential Positions in saved lineups

- The Potential Positions panel now redraws immediately after a player is assigned or moved on the formation board.
- Existing saved lineups with empty Potential Positions are automatically backfilled from their named field-slot assignments when loaded.
- Backfill merges with manually entered Potential Positions and prevents duplicate player entries.
- Freeform lineups remain unchanged because they do not have named formation slots to infer.
- Affected file: `admin.html`.

## v51.34 — Auto-fill Potential Positions

- Assigning a player to a named formation slot now immediately adds that player to the matching row in **Potential Positions**.
- Automatic additions are deduplicated. Reassigning a player to the same slot does not create duplicate entries.
- Moving a player to another field position adds the new potential position without removing previously recorded positions.
- Occupied field slots retain their tactical label (for example, `LB`, `CAM`, or `ST`) so the position remains visible beside the player.
- Freeform placement is unchanged because the custom board does not use named formation slots.
- Affected file: `admin.html`.
