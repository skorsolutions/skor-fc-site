# SKOR FC Project Handbook

Last updated: 2026-09-26  
Current Captain Portal build: **v54.3**

This is the durable handoff document for new chats and future developers. Read it before changing the project. Update it after every build whenever behavior, rules, integrations, data, security, deployment, or cross-surface rendering changes. The chronological release record remains in `docs/deployment-notes.md`.

## 1. Product and repository

- Product: SKOR FC, an over-30 soccer team site and captain/player operations app for the Roswell/Alpharetta, Georgia area.
- Repository: `skorsolutions/skor-fc-site` on GitHub; production branch is `main`.
- Hosting: Cloudflare Pages/Workers static asset deployment configured by `wrangler.jsonc`; the connected GitHub deployment publishes production from the repository.
- Domain: `skorfc.net`.
- Architecture: static HTML/CSS/JavaScript frontend using the Supabase browser client. There is no framework build step for ordinary frontend changes.
- Backend: Supabase Postgres, Auth, Storage, RPCs, Row Level Security, and Edge Functions.
- AI: OpenAI is called only from authenticated Supabase Edge Functions. The OpenAI key must remain server-side.

## 2. Main surfaces

| File | Surface | Primary responsibility |
| --- | --- | --- |
| `index.html` | Public home | Upcoming matches/practices, announcements, fields, roster summary |
| `matches.html` | Public matches | Schedule/results, match events, Man of the Match, published Production / Final lineup |
| `players.html` / `squad.html` | Public squad | Published roster presentation |
| `player-portal.html` | Authenticated player portal | Profile, availability/RSVP, playing status, attendance, reactions, comments, captain chat |
| `admin.html` | Captain portal | Dashboard, Game Day, Notebook, attendance, announcements, schedule, roster, jerseys, lineups, fields, payments, sponsors |
| `gameday.html` | Crowd Game Day | Invite-based live scoring, verification, referee decisions, MOTM voting, official lineup |
| `captain-notebook.js/css` | Captain Notebook module | Notes, imports, debriefs, protected AI selection, pregame talk |
| `strategy.js/css` | Strategy module | Tactical scenes, saved strategies, exports, AI publication |
| `jerseys.js/css` | Jersey module | Kits, physical inventory, captain custody, TEMP assignments |
| `whatsapp-import.js` | Notebook import helper | Ordered WhatsApp batch parsing/import behavior |

## 3. Roles and access rules

- Public pages use the Supabase publishable browser key and must read only public views/RPCs or rows permitted by RLS.
- Player Portal requires Google authentication and a claimed/approved player identity.
- Captain Portal requires an approved captain, super-admin, or explicitly supported view-only portal role.
- View-only users may inspect allowed team information but may not create, update, publish, or delete records.
- Captain and super-admin write authorization is enforced in the UI and again by RLS/RPC/Edge Function checks. UI hiding is never the security boundary.
- Never expose a Supabase service-role/secret key or OpenAI key in browser code.
- Never use user-editable metadata as authorization input.
- Database migrations require explicit user approval before they are applied.

## 4. Lineup system rules

### Core model

- The lineup engine in `admin.html` is the canonical editor.
- Saved state includes `formation`, `slots`, `freeform`, `bench`, `depth`, planned substitution waves, label mode, captain, quote, and notes.
- Standard formations map exact role keys to pitch coordinates. Freeform / Custom stores player coordinates independently.
- Saved variations persist in Supabase `lineup_variations`; they are shared across captains and devices.
- Saving a lineup under an existing variation name for the same game overwrites that variation instead of producing duplicates.
- Variations are grouped by scheduled game plus a Tinker / New Board context.
- TEMP players belong to a match, can appear in the XI, bench, Potential Positions, and substitution plans, and never receive Player Portal access.

### Supported lineup formations

| Formation | Exact role order |
| --- | --- |
| 4-2-3-1 | GK / LB, LCB, RCB, RB / LDM, RDM / LW, CAM, RW / ST |
| 4-3-3 | GK / LB, LCB, RCB, RB / LCM, CM, RCM / LW, ST, RW |
| 4-4-2 | GK / LB, LCB, RCB, RB / LM, LCM, RCM, RM / LST, RST |
| 4-5-1 | GK / LB, LCB, RCB, RB / LM, LCM, RCM, RM / CAM / ST |
| 3-5-2 | GK / LCB, CB, RCB / LWB, LCM, CM, RCM, RWB / LST, RST |
| 3-2-3-2 | GK / LB, CB, RB / LDM, RDM / LAM, CAM, RAM / LCF, RCF |
| Freeform / Custom | GK and other players placed freely on the board |

### Potential Positions and attendance interaction

- The user-facing name is **Potential Positions**, not “depth chart” as the main label.
- Potential Positions automatically use the exact role names for the selected formation.
- A player may be listed in multiple potential positions.
- Potential Positions are stored inside each saved variation.
- Planned substitution choices include only players currently on the field or bench.
- Marking a player Absent removes that player from the active match squad and planned substitution choices.

### Save, production, and rendering flow

1. Captain edits the current lineup board.
2. Captain saves a named variation to Supabase.
3. Captain can mark one variation as **Production / Final** for a scheduled match.
4. Last-minute edits can republish the current board to the Production / Final record.
5. Captain Game Day, Crowd Game Day, and public Matches load the Production / Final lineup through their appropriate protected or public RPC.

Every new formation must be added to all applicable locations:

- Lineup formation selector and canonical coordinates in `admin.html`.
- Position display names in `admin.html`.
- Production / Final role ordering in `admin.html`.
- Strategy home/opponent formation map in `strategy.js` and opponent selector in `admin.html`.
- Crowd Game Day renderer in `gameday.html`.
- Public Matches renderer in `matches.html`.
- Export rendering is driven by the canonical lineup map and exact saved role keys.
- Documentation and tests.

## 5. Lineup exports

- Exports are intended for WhatsApp sharing and support PNG and JPG.
- Export includes every lineup/substitution wave, not only the currently selected wave.
- The named substitute bench is always included.
- Potential Positions are optional in the export and do not alter saved lineup data.
- Captain badge, inspirational quote, and gameplan notes may be included.
- Content must reflow so wrapped names, all waves, the bench, optional Potential Positions, quote, and notes never overlap.
- Mobile export controls and previews must remain usable without horizontal clipping.

## 6. Strategy system

- Strategy imports the selected lineup variation/current lineup, including exact player placement and formation.
- Captains can change the opponent formation independently of the SKOR lineup.
- A strategy contains named scenes, scene type, coaching points, home players, opponent placeholders, ball, and drawings.
- Scenes can be added, renamed, selected, reordered where supported, and removed; at least one scene must remain.
- Strategy is a phone-capable working surface. Tabs, scene actions, tools, pitch, and coaching controls must stay inside the viewport with touch-friendly targets.
- Strategy exports are shareable through the same practical WhatsApp workflow expected of lineup exports.

### Strategy persistence and AI publication

- Shared strategies persist in Supabase `match_strategies`; browser storage is only a recovery copy.
- Strategies are grouped by scheduled game or **Tinker / No Game**.
- Saving the same normalized strategy name in the same group overwrites the existing record.
- Multiple named strategies may exist for a game.
- Only one strategy per scheduled game may be explicitly **Published for AI**.
- Tinker strategies and ordinary drafts are never supplied to the AI.
- `publish_match_strategy(uuid)` performs the one-published-strategy transaction.

## 7. Captain Notebook and AI rules

- Notebook entries and debriefs are persistent and tied to games when appropriate.
- After-game guidance captures what worked, what failed, opponent behavior, adjustments, player observations, and improvements since the previous game.
- Pregame Talk uses protected, captain-selected context. It can use the final lineup, planned substitutions, attendance/RSVP, the explicitly published strategy, prior debrief, selected Notebook material, and captain-selected player comments.
- AI context must distinguish historical comments by their related game/date so they are not mistaken for the upcoming match.
- Player identity sent for constructive coaching is limited to jersey number, first/preferred name, and captain-confirmed aliases where required.
- Private player comments remain protected: generated output must not identify or imply the author or reveal that the source was private.
- Private Notebook notes, debrief drafts, RSVP notes, and player assessments are not sent unless the workflow explicitly selects an approved data element.
- Edge Functions require valid JWTs and re-check captain authorization server-side.
- OpenAI requests use `store: false` and constrained output where implemented.

### WhatsApp imports

- Batch-pasted messages preserve source order.
- Imports can be grouped by game/date and selected individually.
- Original author and original message date/time are preserved separately from the captain who performs the import.
- Lineup/tactics images can be attached through the Notebook media flow.
- Organize with AI is an explicit user action and must preserve meaning without inventing tactical claims.
- Duplicate or ambiguous names, such as two players with the same first name, require jersey-aware resolution.

## 8. Attendance, RSVP, and player feedback

- Player RSVP statuses: Going, Maybe, Can’t Make It, and No Response, with optional notes and an explicit save action.
- Captain attendance statuses: Present, Absent, Excused, and Unmarked.
- Attendance is a player statistic. Excused entries do not reduce the attendance percentage. TEMP players are excluded.
- Captains can review team-visible feedback and private captain chat.
- Player comments enter AI context only through deliberate captain selection.

## 9. Jerseys and TEMP players

- Kits are configurable; current defaults include Maroon and White.
- Physical jersey inventory tracks kit, number, size, status, captain holder/custodian, and notes.
- Only active, On Hand inventory is assignable to a TEMP player.
- A physical inventory item cannot be assigned to multiple active TEMP players for the same match.
- TEMP jersey assignment drives the displayed lineup/Game Day number.

## 10. Supabase integration map

The repository contains only the newer incremental migrations. Earlier production objects also exist and are called by the frontend, so do not infer the complete production schema from this folder alone.

### Principal tables/views used by the client

- Team/public data: `team_roster`, `public_roster`, `team_fields`, `public_fields`, `matches`, `practices`, `announcements`, `match_events`.
- Lineups: `lineup_variations`, `match_temp_players`, `match_strategies`.
- Player access/activity: `player_access`, `player_match_attendance`, `player_match_reactions`.
- Captain/Notebook: `captain_notebook_entries`, `captain_notebook_attachments`, `captain_match_debriefs`, `captain_ai_player_comment_refs`, `captain_player_name_aliases`.
- Jerseys: `team_kits`, `jersey_inventory`.
- Crowd Game Day: `game_day_sessions`, `game_day_invites`, `game_day_crowd_events`, `game_day_event_reports`, `game_day_ref_decisions`, `game_day_ref_votes`, `game_day_motm_votes`.

### Edge Functions in this repository

| Function | Purpose | Required boundary |
| --- | --- | --- |
| `generate-pregame-talk` | Builds protected match context and requests a structured pregame talk | JWT + captain RPC check; OpenAI key server-side |
| `organize-whatsapp-note` | Organizes selected imported text | JWT + captain RPC check; `store: false` |
| `check-player-names` | Resolves likely roster names/aliases before saved captain content is finalized | JWT + captain RPC check; limited roster identity guide |

### Migration rule

- Inspect current Supabase state and migration history before proposing changes.
- Obtain explicit user approval before applying DDL or deploying a new/changed Edge Function.
- Use RLS on exposed tables and least-privilege policies/grants.
- After an approved schema change, verify it with a query and Supabase security/performance advisors, then record the exact migration and result in `docs/deployment-notes.md`.

## 11. Mobile and responsive rules

- Mobile is a first-class workflow, not a reduced desktop preview.
- The lineup builder uses tap player → tap position/pitch; desktop drag-and-drop remains supported.
- Strategy scene controls, tools, pitch, and export actions must remain visible and usable at phone widths.
- Wide tables may use intentional horizontal overflow, but primary actions and working surfaces may not be clipped off-screen.
- Validate at a representative phone viewport and desktop viewport whenever layout-affecting code changes.

## 12. Deployment and build workflow

1. Read this handbook and the newest deployment note.
2. Pull the latest `main` branch and preserve unrelated work.
3. Update all connected surfaces, not only the first editor where a feature appears.
4. Run syntax/static checks and targeted behavioral tests. Add renderer consistency checks for formations.
5. Update the build metadata/visible build label in `admin.html` when the Captain Portal changes.
6. Update this handbook if behavior or rules changed.
7. Add the new build entry to the top of `docs/deployment-notes.md`.
8. Before a public GitHub write that replaces full source files, enumerate the complete affected file set. If the publishing tool requires explicit public-disclosure approval, request one consolidated authorization covering every affected source/documentation file before uploading anything; never interrupt the user with separate file-by-file approvals.
9. Commit and push to GitHub `main` unless the user requested a branch/PR instead.
10. Confirm the connected Cloudflare deployment succeeds before declaring production complete.

No SQL change is required for a formation-only release because the saved lineup and strategy JSON accept new formation/role strings. A schema migration is required only if persistence structure or database-enforced behavior changes.

## 13. Definition of done

A build is complete only when:

- The requested workflow works on desktop and phone where applicable.
- Shared state persists in Supabase when persistence is part of the feature.
- Same-name overwrite and Production / Final rules remain intact.
- Exported output contains the expected complete data and is shareable.
- AI receives only explicitly permitted context.
- Game Day/public renderers understand any new formation or published structure.
- No unapproved SQL/database action occurred.
- The build number, handbook, and deployment notes are current.
- The change is committed/pushed and the production deployment is verified.

## 14. Current build v54.3

- Added lineup type **3-2-3-2** with the exact roles requested: `LB, CB, RB / LDM, RDM / LAM, CAM, RAM / LCF, RCF`, plus `GK`.
- Added the shape to the Lineup Builder, Potential Positions, Strategy home/opponent maps, saved/imported lineup flow, exports, Production / Final view, Crowd Game Day, and public Matches renderer.
- Fixed the earlier 4-5-1 omission in the Crowd Game Day and public Matches formation maps.
- No Supabase migration or database change was needed.
