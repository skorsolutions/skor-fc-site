# SKOR FC Project Handbook

Last updated: 2026-10-24 UTC
Current Captain Portal build: **v58.22**.
Player Portal build: **v58.18**.
Current public homepage build: **v58.15**.
Latest Captain Portal release: [`f6f2fd56473df6d3384be05ac3fe513fb568c8fb`](https://github.com/skorsolutions/skor-fc-site/commit/f6f2fd56473df6d3384be05ac3fe513fb568c8fb), **v58.22 Game Day engagement dashboard**. Unified directly below Man of the Match, with default-closed roster/attendance, visible attendance reminder and visible feedback. Cloudflare build `df4c3d2c-21d1-42e1-af36-5088bfd53332` succeeded; version `70180640-8eba-4944-8f5c-c94694ab2547`, deployment `7f2a7a83-a480-49d2-8a04-8f7ce8002ea9`, verified at 100% production traffic. All seven source hashes and the exact release file set match checked sources. Seven relevant suites and HTML/script-preservation checks passed; no database change. Browser visual verification remains unavailable.
Previous Captain Portal release: [`5cdfcebe22039b07adf8ddbaa64907890091033c`](https://github.com/skorsolutions/skor-fc-site/commit/5cdfcebe22039b07adf8ddbaa64907890091033c), **v58.21 substitution alarm**. Cloudflare build `87565d8f-579d-455b-b9a8-6c092bddeea8` succeeded; version `ee68d574-6d17-4557-8b25-a1d392849749`, deployment `38dd390d-9331-49ca-bb26-5bc7617dc7ff`, verified at 100% production traffic. All 13 source hashes and the exact release file set match checked sources. Nine suites passed; no database/backend change. Actual phone sound/volume, rendered layout and lock/background behavior remain unverified; use Preview on the intended phone. Player Portal remains v58.18 and homepage v58.15.
Previous Captain Portal release: [`32f85d296c4edb5ac24b08c8610a1fbd03a6142b`](https://github.com/skorsolutions/skor-fc-site/commit/32f85d296c4edb5ac24b08c8610a1fbd03a6142b), **v58.20 collapsed inbox**. Cloudflare build `062e9f27-92e4-4494-923b-083dd099a6fb` succeeded; version `bd2d2b10-50c4-4a55-ae82-3c1ac33e5471`, deployment `99e0d6df-97ed-4970-b083-6c9dacff29e7`, verified at 100% production traffic. All ten source hashes and the exact release file set match checked sources. Six relevant suites passed; no database/backend change. Unread count stays visible, refreshes retain disclosure choice, sign-out resets it closed. Browser visual review remains unavailable.
Previous Captain inbox release: [`b572643e7aad218f82aaf6f123ffcc3e95576357`](https://github.com/skorsolutions/skor-fc-site/commit/b572643e7aad218f82aaf6f123ffcc3e95576357), **v58.19 captain inbox**. Approved migration `20261024182232 add_captain_notifications` is applied with exact function/ACL readback. Nine suites and rolled-back live two-captain/player/anonymous checks passed; original records are unchanged. All 18 source hashes/exact release files verified. Cloudflare build `d7d3b241-aab8-4921-ad79-e70714ae2da9` succeeded, version `c23a0c87-ec01-4a9f-a29a-5ad250e268c0` verified at 100% production traffic. Player Portal remains v58.18 and homepage v58.15. Browser visual review and commit-comment creation remain unavailable.
Latest Player Portal release: [`0a6b259b0c9d11277ed239965a4ba77a6b8f1486`](https://github.com/skorsolutions/skor-fc-site/commit/0a6b259b0c9d11277ed239965a4ba77a6b8f1486), **v58.18 expandable sections**. My Match Record stays visible; Next Matches, Match History, Equipment & Lost + Found and Match Feedback start collapsed. Cloudflare build `1e18a485-26fd-468a-bad9-f9bfc2740878` succeeded; version `57993916-619d-4843-a682-65563c454def` verified at 100% production traffic. All three source hashes/exact release files verified; four relevant suites plus HTML/feedback interaction checks passed. No database/backend changes. Browser visual verification and commit comments remain unavailable.
Latest homepage release: [`07f2ef6d2ccc4838f767abda719b24603da8ca2a`](https://github.com/skorsolutions/skor-fc-site/commit/07f2ef6d2ccc4838f767abda719b24603da8ca2a), **v58.15 kit labels**. Cloudflare production build `4d78c3dd-da3b-421b-9cda-e4eec107ed75` succeeded; version `f3742920-052e-4a9d-8831-0ed6e2dc97a3`. All three hashes and the exact release file set match checked sources. Duplicate kit captions and reserved empty space are removed; original image labels and alt text remain. Homepage checks plus score-privacy and persistent-clock suites passed. No database/backend change. Rendered browser verification remains unavailable.
Latest display release: [`20d8f324e1f5918476d34c406482dced46c15dfe`](https://github.com/skorsolutions/skor-fc-site/commit/20d8f324e1f5918476d34c406482dced46c15dfe), **v58.17 My Match Record**. Approved migration `20261024164008 sync_player_match_record` is applied; all nine function bodies match source. Seven suites and live role checks across 12 linked players (3 captains) passed; seven application-table digests are unchanged. Exact 17-file release and source hashes verified. Initial Cloudflare upload failed with API 10013; retry `6cf4bcd6-cfbb-4ac0-aede-8bbb0308fb01` of the same commit succeeded, version `e49e884d-eca3-4177-ab16-f7fd9e09b24b` verified at 100% production traffic. Player/Captain v58.17 is deployed; homepage remains v58.15. Browser visual review remains unavailable.
Current keeper-restoration release: [`1c4b2c45d51fabb265e2db7ffe877d48cf490b75`](https://github.com/skorsolutions/skor-fc-site/commit/1c4b2c45d51fabb265e2db7ffe877d48cf490b75). Cloudflare production build `7f8b4f15-e118-4f27-a7a0-8899e68fc302` succeeded; version `0adeb322-190a-4a38-bc18-0626b18dc3ac`. All 15 source hashes and the exact release file set match the checked sources. Seven affected suites passed. `generate-pregame-talk` version 15 is ACTIVE with JWT verification enabled and exact packaged-source readback. The user-identified upcoming #18 / 30 starting-temp assignment is repaired and independently verified, with other state/publication flag preserved. No schema migration. Browser visual verification remains unavailable.
Latest implementation release: [`6ab72d06a4a7e80e10066952dc47c4593a4434bb`](https://github.com/skorsolutions/skor-fc-site/commit/6ab72d06a4a7e80e10066952dc47c4593a4434bb). Cloudflare production build `00edd3a0-8bba-4c72-b4d4-09824d162f1e` succeeded; deployed version `5a897dbd-bd67-47ca-984b-9d1c46e969d5`. All 14 source hashes and the exact release file set match checked files. Seven affected suites and HTML structure checks passed. The compact picker, responsive setup panels and closed Potential Positions are deployed. Full referee names and keeper data remain intact. No database or Edge Function changes. Browser visual checks remain blocked by sandbox socket restrictions.
Current implementation release: [`2d21e048ec13788350ca223667d5dbd681c4aba8`](https://github.com/skorsolutions/skor-fc-site/commit/2d21e048ec13788350ca223667d5dbd681c4aba8). Cloudflare production build `d6253897-f2df-4251-b08b-5fac1d024f3c` succeeded; deployed version `d6711af8-65ff-4359-bdce-3ec680f9cccb`. All 14 file hashes and the exact release diff match the tested sources. Six affected suites passed. Approved keeper-number hierarchy and readable TEMP labels are deployed across lineup/editor/PNG/JPG/public/Crowd/Strategy presentation. No database or Edge Function change; pregame function remains version 14. Browser visual verification remains blocked by sandbox socket restrictions.
Production implementation release: [`86ba17a67880f0207dccdf97d95bac5dae21c4db`](https://github.com/skorsolutions/skor-fc-site/commit/86ba17a67880f0207dccdf97d95bac5dae21c4db). Cloudflare production build `b37a06f2-d25d-4505-920c-110541be0bb5` succeeded on 2026-10-24 at 08:07:24 UTC; deployed version `0fa935f8-9ab0-4a2e-9b4a-7d85028b5298`. All 22 release-file blob hashes and the exact file set matched the checked local sources. `generate-pregame-talk` version 14 is ACTIVE with JWT verification enabled; both packaged source files match the release. Ten relevant suites and rollback-only captain/public JSON persistence checks passed. No migration or persistent fixture changes. Browser visual and direct live-source HTTP checks remain unavailable. Workflow and limitations: `docs/MATCH-KEEPERS.md`.
Previous deployed build: **v58.6**.
Previous production release: [`1ab0a7c329367e87b9f1ee025d5e3235e3f3736c`](https://github.com/skorsolutions/skor-fc-site/commit/1ab0a7c329367e87b9f1ee025d5e3235e3f3736c). Approved migration `20261019065353 repair_portal_activity` is applied and verified. Cloudflare production build `04a9f078-d6cf-4247-bed8-06606fbf0b90` succeeded on 2026-10-19; deployed version `35561a6e-8e15-4605-8b75-0f26ee7de33e`. Exact source hashes/release files were verified. Direct HTTP and rendered browser checks remain unavailable.

**v58.3 personal ribbon order and saved TEMP names** is deployed. Ribbon, TEMP-directory, persistent-clock and score-privacy checks passed. The exact nine-file release diff and published source hashes were verified. No schema migration or Edge Function change. Direct live-source HTTP, rendered phone/desktop and real signed-in captain save/reload checks remain unavailable: the executor proxy is unreachable, the web tool cannot access the admin page, and browser control/authenticated captain sessions are unavailable. The connected production check verifies deployment, not those browser behaviors.

**v58.4 bulk jersey custody handoffs** is deployed. Inventory checkboxes and Select all matching let a captain hand off a whole bag or a subset to one active receiving captain. Bulk-jersey, ribbon-order, TEMP-directory, persistent-clock and score-privacy checks passed; the exact eight-file release diff and source hashes were verified. No migration, Edge Function or actual jersey handoff was performed by preparing/deploying the feature. Rendered desktop/phone review and a real signed-in transfer remain unverified because browser control and an authenticated captain session are unavailable. The connected production check verifies deployment, not those browser behaviors.

Data-only follow-up on 2026-10-13: two user-confirmed full names were applied to two historical TEMP rows; a misspelled event row for the first identity was also corrected. The user clarified the second identity and resumed work after a pause. The earlier mistaken additional name is excluded. Independent readback confirms four complete saved TEMP names and seven total TEMP records. No schema change or application deployment. IDs, match links, active status and jersey values were preserved.

This is the durable handoff document for new chats and future developers. Read it before changing the project. Update it after every build whenever behavior, rules, integrations, data, security, deployment, or cross-surface rendering changes. The chronological release record remains in `docs/deployment-notes.md`.

## 1. Product and repository

- Product: SKOR FC, an over-30 soccer team site and captain/player operations app for the Roswell/Alpharetta, Georgia area.
- Repository: `skorsolutions/skor-fc-site` on GitHub; production branch is `main`.
- Hosting: Cloudflare Pages/Workers static asset deployment configured by `wrangler.jsonc`; the connected GitHub deployment publishes production from the repository.
- Domain: `skorfc.net`.
- Architecture: static HTML/CSS/JavaScript frontend using the Supabase browser client. There is no framework build step for ordinary frontend changes.
- Backend: Supabase Postgres, Auth, Storage, RPCs, Row Level Security, and Edge Functions.
- AI: OpenAI is called only from authenticated Supabase Edge Functions. The OpenAI key must remain server-side.

### Homepage kit presentation — v58.15

- The maroon and white PNG assets already include their kit-name labels. Do not add duplicate visible captions beneath them. Keep descriptive image alt text for accessibility.
- Homepage kit cards use content height and balanced padding. No 320px minimum height, fixed mobile height or bottom caption reservation; original jersey images, gradients, borders, two-column kit layout and adjoining join card remain intact.
- This is a public-homepage-only release. Captain Portal remains v58.14; no backend, inventory, database, lineup, keeper or export changes.

### Captain console Homepage action — v58.16

- The shared header has a Homepage link beside the existing Ribbon locked button, below the page title/account row. It is available from every captain-console section, including view-only sessions, and navigates to `index.html` in the same tab, matching the player portal.
- The header actions occupy their own wrapping row with 44px targets. The page-title column can shrink; mobile account controls wrap within half the header width to keep titles, actions and Log out from colliding. The homepage link has visible keyboard focus and a decorative home SVG.
- Native link navigation adds no JavaScript, auth/session changes or backend calls. Ribbon controls retain their existing ID, visibility checks, permissions and navigation-order behavior. It is not a new ribbon item.

## 2. Main surfaces

| File | Surface | Primary responsibility |
| --- | --- | --- |
| `index.html` | Public home | Upcoming matches/practices, announcements, fields, roster summary |
| `matches.html` | Public matches | Schedule, official clock, non-goal discipline events, MOTM identity, published Production / Final lineup; scores are private in v58.1 |
| `players.html` / `squad.html` | Public squad | Published roster presentation |
| `player-portal.html` | Authenticated player portal | Profile, availability/RSVP, playing status, attendance, reactions, comments, captain chat |
| `admin.html` | Captain portal | Dashboard, Game Day, Notebook, attendance, announcements, schedule, roster, jerseys, lineups, fields, payments, sponsors |
| `gameday.html` | Crowd Game Day | Invite-based live scoring, verification, referee decisions, MOTM voting, official lineup |
| `captain-notebook.js/css` | Captain Notebook module | Notes, imports, debriefs, protected AI selection, pregame talk |
| `strategy.js/css` | Strategy module | Scene Bundles, animation keyframes, saved strategies/bundles, GIF/PNG exports, AI publication |
| `jerseys.js/css` | Jersey module | Kits, physical inventory, captain custody, TEMP assignments |
| `jerseys-bulk.js` | Custody handoff | Validates the receiving captain, updates selected holders together and verifies saved values |
| `equipment.js/css` | Equipment / Lost & Found | Shared lending store, custody, captain approval/returns, private reports/messages and team-only notifications |
| `ribbon-order.js/css` | Personal navigation | Locked navigation, separate reorder dialog, personal account preference |
| `temp-player-directory.js` | TEMP name directory | Protected historical full-name suggestions; jerseys stay match-specific |
| `whatsapp-import.js` | Notebook import helper | Ordered WhatsApp batch parsing/import behavior |

## 3. Roles and access rules

- Public pages use the Supabase publishable browser key and must read only public views/RPCs or rows permitted by RLS.
- Player Portal requires supported authentication and a claimed/approved player identity.
- v58.1 makes match scores and per-match goal records private to active linked players and approved Captain Portal identities. Public pages and Crowd never render scores. Public roster pages use a narrow season-aggregate RPC instead of loading individual goal rows. W/D/L and GF/GA/GD records are omitted from public squad pages. A Crowd invite or arbitrary login does not grant score access. The approved SQL is active as migration `20261003225430`; see `docs/SCORE-PRIVACY.md`.
- Captain Portal requires an approved captain, super-admin, or explicitly supported view-only portal role.
- View-only users may inspect allowed team information but may not create, update, publish, or delete records.
- Captain and super-admin write authorization is enforced in the UI and again by RLS/RPC/Edge Function checks. UI hiding is never the security boundary.
- Never expose a Supabase service-role/secret key or OpenAI key in browser code.
- Never use user-editable metadata as authorization input.
- Database migrations require explicit user approval before they are applied.

## 4. Lineup system rules

### Saved game and Tinker variations — v58.14

- Saved Game Variations stays visible first and contains only game-linked records, grouped by game. Saved Tinker Variations is a separate native `<details>` immediately underneath, closed by default. Its count includes only Tinker boards; the game count excludes them.
- Both sections share existing card load, copy, delete and refresh handlers. Production / Final remains a game-only action. Viewer delete controls are hidden in both sections and existing write checks remain. No save payload, overwrite rule, query, stored variation, publication state, keeper or export contract changes.
- Rendering replaces only the two list contents, preserving the user's open/closed disclosure choice during refresh, load, save and realtime updates. Tinker cards are full-width vertically stacked; headings and actions wrap on phones. Existing site styling is retained.

### Compact lineup workspace — v58.12 / v58.13

- The approved layout keeps a compact 6:7 field left and a two-column player picker immediately right of both field and bench, including narrow phones. The workspace is capped at 760px. The picker scrolls independently within the combined field/bench height; it must never move above the pitch.
- The player rail must explicitly set `height:100%`, `max-height:100%`, border-box sizing and stretch alignment on its absolutely positioned panel. Legacy mobile `align-self:start` combined with auto height allowed the full roster to paint over subsequent panels in v58.12. The rail wrapper now clips overflow and isolates painting; the panel scrolls inside the combined field/bench height.
- Substitutes sits directly below the field. The saved game and Tinker sections are outside the workspace, below match setup. Match Fill-ins, Keeper assignments and Potential Positions use native disclosures closed by default. Keeper validation opens the relevant disclosure before reporting an invalid input.
- `SKORLineupMarker.builderPositions` creates display-only, evenly spaced role bands and spreads crowded horizontal rows. `builderScale` fits measured marker envelopes inside the fixed compact pitch; it never grows the pitch. Position tags have their own row above the shirt. The width-only ResizeObserver recalculates marker scale.
- Canonical formations, saved coordinates, dragging/tapping, keeper assignments, public/Game Day/Strategy, referee PDF/Excel and the gameplan SVG renderer are unchanged. The SVG is checked byte-for-byte against v58.11. On-field primary/spare emphasis and duty notes remain; the picker and bench retain primary numbers, short names and one TEMP marker.
- Frontend only: no database query/write, migration, permission or Edge Function change. Browser rendering remains unverified because the environment cannot launch Chromium.

### Legacy keeper restoration — v58.10

- Older saved variations and browser drafts may contain a GK slot without any `keeperPlan`. `SKORKeeperPlan.hydrate(state, roster)` restores a default starting-temp assignment only when that starter has a known outfield roster position and no explicit keeper assignment. It uses the board's first spare number, defaulting to 30. Actual Keeper/GK positions, unknown positions and explicit captain choices are preserved. The helper is pure and does not rewrite the input snapshot.
- Hydration runs before editor rendering, local draft persistence, `getState`/referee export, public/Crowd presentation, Strategy import and protected AI lineup context. The canonical editor roster now includes the existing position field, and public Matches requests position from the existing public roster view. This restores both the primary/spare pair and the starting-temp-keeper label, while keeping the off-field picker primary-only.
- The user-identified upcoming Balanced variation was repaired with the #18 / 30 starting-temp assignment. Only its `keeperPlan` and update timestamp changed; all other state and the Production/Final flag were verified unchanged. No bulk lineup rewrite or schema migration. This specific data repair was authorized by the user's request to restore the missing assignment.
- `keeper-plan.js` and the pregame function's packaged copy must remain identical. The Edge Function includes roster positions only to resolve the existing keeper projection; its AI output still exposes the limited player identity and keeper duties, without adding roster-position data. An authenticated Edge Function deployment is required for this release.

### Compact player selection and mobile setup — v58.9

- The player picker shows primary jersey number, short/first name and one TEMP indication. Secondary keeper numbers and duty captions belong to on-field markers and referee output, not the picker, bench, Potential Positions or substitution chips. The existing large/small on-field hierarchy is retained.
- Short names are presentation values. `tempPlayerFromRow` retains the complete `display_name` as `fullName` for referee PDF/Excel and the explicit full-name edit field. Reusing a saved name still selects/stores the complete identity. No existing database name is rewritten. A legacy CSS pseudo-element that duplicated TEMP was removed; an unnumbered TEMP shirt does not add a second TEMP badge.
- Match Fill-ins and Keepers are separate equal-width panels below the field/player workspace. At 760 pixels or less they stack at full width, with single-column controls, constrained select/input widths and 44-pixel action targets. They never occupy the narrow mobile player rail. The keeper form retains role/jersey inputs but removes its duplicate long preview caption.
- Potential Positions is a native, keyboard-accessible `details` panel, closed by default and opened only on demand. Hiding it does not remove saved positions or change the separate export checkbox.
- No saved lineup schema, roster identity, permission, database or Edge Function change. Referee names and both jersey numbers remain complete. Public/Crowd benches and captain list labels also use short names and primary numbers; on-field and Strategy markers keep keeper details.

### Number hierarchy and TEMP labels — v58.8

- On-field markers preserve primary / spare order. Outfield cover uses a large primary number and small spare; the designated starting keeper uses a small primary number and large keeper number. Single-number players retain their normal size. `lineup-marker.js` supplies shared HTML/SVG presentation for the editor, current-board PNG/JPG, public Matches, Crowd Game Day and Strategy circles/exports.
- TEMP names wrap instead of clipping. A trailing `- TEMP`, `· TEMP` or `(TEMP)` is removed only for display and shown once as a separate TEMP badge. Stored names/full referee names remain untouched. Export name plates and bench rows grow for wrapped labels; following export cards move down. Names + Numbers and Numbers Only remain supported.
- This is a presentation-only release. Saved JSON, roster identities, number order, referee PDF/Excel, AI context, database and Edge Function version 14 remain unchanged. No SQL or backend deployment is required. The user approved a generated visual draft of the number hierarchy before implementation.

### Match-specific keeper assignments — v58.7

- **Keepers for this match** identifies the starting keeper and potential cover. The standard formation's GK is the starter; Freeform explicitly designates one starter. Selecting another starter moves him into goal and puts a displaced standard-formation GK on the bench.
- `state.keeperPlan` stores `spareNumbers` (default `[30]`) and `assignments` keyed by lineup player ID, with `role` (`starting`, `starting_temp`, `secondary_temp`, `backup`) and `jerseyNumber` (1–99 or null for a regular starter wearing his own number). This lives in the existing lineup JSON, so no schema migration is needed.
- Every player retains his primary roster/TEMP number. A different keeper jersey displays beside it as `12 / 30`. Multiple keeper assignments may share the same spare number or use different spares. Secondary spare numbers do not change inventory custody, TEMP inventory bindings, event identity or roster numbers.
- Labels are `(starting keeper)` and `(backup keeper)` with a regular starter; `(starting temp keeper)` and `(secondary temp keeper)` when an outfield player starts in goal. Cover means potential cover, not a promise of keeper minutes. A regular GK placed in the standard GK slot receives the starting label on older saved lineups too.
- Spare choices are saved with each variation, shared with captains on loading, retained when copying to a new match and suggested from the latest saved variation on new boards. There is no separate multi-team settings store. Keeper **assignments** clear on cross-match copy; designate the destination keepers again. Removing a squad player clears his assignment. TEMP guest status and temporary keeper duty are separate concepts.
- Editor, local drafts, saved variations, Final updates, PNG/JPG, referee preview/PDF/Excel, Captain/Crowd Game Day, public Matches and imported Strategy snapshots retain the assignments. The pregame Edge Function packages the same `keeper-plan.js` rules and includes only sanitized existing player identities plus keeper role/numbers in approved lineup context.
- Shared spare numbers pass referee validation. Missing temporary/backup keeper numbers, multiple freeform starters and keeper cover without a starter block save/publication/card export; ordinary duplicate primary numbers still fail, as does a spare conflicting with an outfield player's primary jersey. Numbers range from 1 to 99.
- Shared browser rules: `keeper-plan.js`; touch-friendly editor: `keeper-editor.js` / `keeper-plan.css`. Edge packaging copy: `supabase/functions/generate-pregame-talk/keeper-plan.js`; keep it byte-identical to the browser module. Verify with `npm run test:keepers` and affected existing suites. No SQL or RLS change. Deployment also requires the updated authenticated `generate-pregame-talk` Edge Function.

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
- The export preview and downloaded image use the same canonical renderer.
- The starting-lineup picture uses a vertical tactical crop from the opponent's 18-yard line through SKOR's own goal line. The opponent goal and its boxes are omitted so the useful lineup area is larger.
- Standard formation players originate from their canonical saved `x` / `y` coordinates. Horizontal coordinates remain unchanged; vertical coordinates are remapped from the 105-metre full pitch into the remaining 88.5 metres. The saved lineup is never altered.
- On-field players use large `100 × 88` maroon jersey/shirt silhouettes with scaled number, role, optional name, TEMP label, and captain badge. Circular on-field player markers are not part of the lineup export design.
- The cropped field uses striped grass, the adjusted halfway line and center circle, and SKOR's proportional penalty and six-yard boxes. Crowd Game Day and public Matches retain their existing full-pitch renderers.
- Export includes every lineup/substitution wave, not only the currently selected wave.
- The named substitute bench is always included.
- Potential Positions are optional in the export and do not alter saved lineup data.
- Captain badge, inspirational quote, and gameplan notes may be included.
- Content must reflow so wrapped names, all waves, the bench, optional Potential Positions, quote, and notes never overlap.
- Mobile export controls and previews must remain usable without horizontal clipping.

See `docs/LINEUP-EXPORT.md` for the renderer geometry, data flow, compatibility rules, and QA checklist.

### Referee game-card export

- **Ref Game Card** is a separate action beside the lineup PNG/JPG buttons.
- It reads the current Lineup Builder board for the selected scheduled game. Saving or publishing the lineup is not required before export.
- Only the starting field and named Substitutes bench are included. The general pool, attendance alone, Potential Positions alone, and planned-sub references alone do not add a player.
- Permanent players use `team_roster.full_name`, sort by jersey number, and appear before TEMP players. TEMP players use their full match-specific display name and assigned inventory jersey number.
- The supplied organization layout has 26 physical roster rows. Active players populate the top rows; unused rows remain blank for handwritten, last-minute additions.
- Opponent, date, field, and scheduled time come from the selected `matches` row. Coach and colors use team defaults. These header values can be corrected for the export without modifying Supabase.
- Validation blocks a Tinker/no-game board, empty squad, more than 26 players, stale identities, missing jersey numbers, and duplicate jersey numbers.
- **Print / Save PDF** produces one landscape US Letter page. **Download Excel** fills a sanitized organization template and applies the same one-page print area.
- The public template contains no historical roster data. Current player data is inserted only in the authenticated captain's browser when the export is requested.
- The Excel exporter must not assume blank handwriting-row cells exist in the worksheet XML. It skips absent blank targets and creates an absent cell only when a player value must be written, inheriting a nearby same-column style.
- The Excel roster uses compact sequence and jersey-number columns, a wider player-name column, centered sequence numbers, and 18.5-point player rows so names and numbers remain readable without displacing the signature section.
- Excel export uses `A1:L36`, US Letter landscape, 0.18-inch margins, and one-page-wide/one-page-tall fit metadata with automatic page breaks disabled. A fixed scale percentage must not compete with fit-to-page. The complete right-side form and **Linesman 2** row must remain visible.
- The feature is read-only: it requires no SQL, Supabase write, Edge Function, AI, Crowd, public Matches, Notebook, or Game Day change.

See `docs/REF-GAME-CARD.md` for the complete field mapping, ordering rules, validation, security boundary, and QA checklist.

## 6. Game Day clock and live scoring

### Sideline layout

- Captain Game Day places the official clock first, then the scoreboard and Record Event controls, before the Official Gameplan and Crowd Scoring panels. Desktop and phone follow the same document order.
- The phone scoreboard remains sticky and event entry retains its existing bottom sheet. Supporting RSVP and attendance panels appear after scoring.
- This v58.2 layout change retains the existing score calculation, event persistence, official timestamps, and private-score access rules. No database or Edge Function work is required.

### Authoritative clock model

- Every scheduled match uses its existing unique `game_day_sessions` row for clock state. Creating/configuring a clock does **not** automatically open Crowd Scoring; `game_day_sessions.active` remains the separate Crowd access switch.
- The captain/admin clock is the official source of truth. Crowd Game Day displays the same clock read-only and cannot start, pause, resume, end, or reset it.
- Persistence does not depend on a browser interval. Supabase stores an elapsed-seconds anchor plus `clock_started_at`; clients calculate `anchor + (now - started_at)` while the clock is running. Closing the app therefore does not stop match time.
- Clock phases are `not_started`, `first_half`, `halftime`, `second_half`, and `full_time`. A playable half may be running or paused.
- Captain controls are transactional through `control_match_clock(...)`, which also synchronizes `matches.status` / `current_half`.
- Halftime holds official match time at the selected half length and starts a separate break timer. Starting the second half always resumes official match time from exactly `40:00` or `45:00`, even when the first-half whistle occurred during stoppage time.
- Supported regulation settings are 40- or 45-minute halves. The half length cannot change after the first half starts unless the captain resets the clock.
- The in-app threshold alert appears at `40:00` / `45:00` for halftime and at `80:00` / `90:00` for full time. The referee still determines the whistle; the clock never changes phase automatically.
- In-app vibration/visual reminders run while a Game Day page is open. The server clock continues while the app is closed, and the correct time is reconstructed when reopened; this release does not promise background push notifications from a closed browser.

### Event timestamps and Crowd truth

- New captain `match_events` rows for goals, cards, and ordinary SKOR/opponent fouls are stamped on insert with `clock_period`, `clock_elapsed_seconds`, and `clock_recorded_at`. A database trigger uses the official session clock and overrides the half with the active official half.
- Captain Game Day requires the official clock to be in the first or second half before a new live event can be saved. Editing an existing event remains allowed and preserves its original timestamp.
- New Crowd goals/cards receive the same official fields when the first matching report creates the consensus event. Later confirmations keep the original event time.
- New Crowd referee/foul reviews are also stamped with official clock time.
- Editing a captain event keeps its original timestamp; event edits do not silently rewrite history to the current clock.
- Historical events are not assigned guessed minutes. They continue to display their saved half with “time not recorded” where appropriate.
- Captain Game Day renders all stored official timestamps. v58.1 public Matches and Crowd Game Day render only non-goal event feeds; per-match goals remain private. Crowd event submissions remain consensus-based, with captain/admin time as their source of truth.

### Public live-clock projection

- Public Home and Match Center call `get_public_match_clocks()` and show the captain clock only while a published match is in `first_half`, `halftime`, or `second_half`.
- Each page reconstructs the running time every second from the stored elapsed-seconds anchor plus `clock_started_at`; the RPC refreshes every five seconds so pause, resume, halftime, and second-half changes reach public viewers without reloading.
- The public RPC returns only `match_id`, clock phase/running state, elapsed seconds, start anchor, half length, and update time for published matches. It does not expose Crowd access state, invite codes, participants, captain identity, or write access.
- The home featured match and current-game schedule row show the same official clock. Match Center shows it on both the selected scoreboard and current-game list row.
- v58.1 Match Center refreshes match status and timestamped non-goal event records every 30 seconds while the local official clock continues smoothly every second. It does not render or request goal records.

### Audible substitution alarm — v58.21

- Game Day adds an opt-in, local alarm on the designated phone. Settings are collapsed by default; active status, Stop alarm and the unlocked-phone note stay beside the clock. A captain must tap Start alarm to unlock audio. Settings may persist per account in this browser; enabled state never persists or auto-starts after reload.
- Audible intervals are 10/15/20 minutes within each half, independent of the existing server-backed planned-wave 10/15-minute cadence. No lineup is required. Arming mid-half targets the next upcoming boundary; half-end boundaries are silent. Short 3/5/10-second chimes have finite Web Audio stop times. Snooze is Off/30/60/120 seconds after a ring, once/twice, and never shifts the next regular interval.
- Official pause and halftime cancel current sound/snoozes and wait silently; resumed play schedules the next boundary. Full Time, Reset/restart, selected match-minute cutoff, 10–180-minute elapsed safety limit, match/account/role change, hidden/locked page, leaving Game Day and stale clock updates stop the alarm. It never replays missed rings after suspension. Clock snapshots use the existing Game Day refresh; no new backend reads/writes or migrations.
- Only start on one phone. A short renewable browser-storage lease prevents simultaneous tabs on that same browser; it cannot elect one device across captains/phones. Optional screen wake lock is best effort. Visible note: “Keep this phone unlocked with Game Day open for substitution alarms to sound.” Locked/background alarms belong to the future Iskra Sports app. Use Preview to check system volume; physical phone audio/background behavior cannot be verified in this environment.
- Timing, finite-audio, bounded snooze, phase/stop, stale-source, lease, permission/account and browser-adapter tests are in `tests/verify-substitution-alarm.mjs`; full operational contract in `docs/SUBSTITUTION-ALARM.md`. Existing official clock actions, event stamps, planned waves, public/Crowd projections, keeper/export and personal inbox contracts remain unchanged.

### Substitution reminder rules

- `game_day_sessions.sub_interval_minutes` stores the active match cadence and accepts 10 or 15 minutes.
- Each planned lineup wave may persist `unit` (`defense`, `midfield`, `strikers`, or `mixed`) and an optional absolute match `minute` inside the existing lineup variation JSON.
- If a wave has no exact minute, first-half targets are cadence × wave order; second-half targets are half length + cadence × wave order.
- The captain clock shows the next planned wave, changes to **GET READY** two minutes before it, and changes to **SUB NOW** at the target. Exact saved minutes override the cadence.
- Wave group and timing metadata flow through saved variations, Production / Final, lineup export, Captain Game Day, and Crowd Game Day lineup presentation. Existing saved lineups remain valid and receive safe default wave groups when edited.

See `docs/GAME-DAY-CLOCK.md` for the complete state/action/data contract and operational checklist.

## 7. Strategy system

- Strategy imports the selected lineup variation/current lineup, including exact player placement and formation.
- Captains can change the opponent formation independently of the SKOR lineup.
- A **Strategy** is the complete game plan. It contains ordered **Scene Bundles**, not one automatically continuous animation.
- A **Scene Bundle** is one tactical situation or chapter, such as Narrow Defense, Offense in Possession, Corners, or Free Kicks.
- Every Scene Bundle contains one to twelve ordered **sub-scenes** (animation keyframes). Display numbering is derived from order: the first bundle's frames are 1.1, 1.2, 1.3; the second bundle's frames are 2.1, 2.2, and so on.
- Moving bundles or sub-scenes automatically changes the display numbering. Numbers are not stored as permanent identities.
- Each sub-scene stores its own SKOR player positions, opponent placeholders, ball location, and tactical marks. Bundle name, moment, category, and coaching points apply to the bundle.
- Bundles and sub-scenes can be added, duplicated, selected, reordered, renamed where applicable, and removed. A strategy must keep at least one bundle, and each bundle must keep at least one sub-scene.
- Preview animates only the selected Scene Bundle. It interpolates player, opponent, and ball locations between ordered keyframes; tactical marks switch with the keyframe. It does not join unrelated bundles into one play.
- Strategy is a phone-capable working surface. Tabs, scene actions, tools, pitch, and coaching controls must stay inside the viewport with touch-friendly targets.
- **Export bundle GIF** creates one looping GIF for the selected bundle entirely in the captain's browser. The tactical frames are not uploaded to another service.
- **Export selected step PNG** exports only the current sub-scene. Both formats retain the strategy/bundle/step label and coaching points for WhatsApp sharing.

### Strategy persistence and AI publication

- Shared strategies persist in Supabase `match_strategies`; browser storage is only a recovery copy.
- Strategies are grouped by scheduled game or **Tinker / No Game**.
- Saving the same normalized strategy name in the same group overwrites the existing record.
- Multiple named strategies may exist for a game.
- Only one strategy per scheduled game may be explicitly **Published for AI**.
- Tinker strategies and ordinary drafts are never supplied to the AI.
- `publish_match_strategy(uuid)` performs the one-published-strategy transaction.
- Shared reusable bundles persist separately in captain-only `strategy_scene_bundles`. They are grouped first by scheduled game or Tinker and then by Defense, Offense, Transition, Corners, Free Kicks, Other Set Pieces, or Other.
- Saving the same normalized bundle name in the same event/category overwrites that record. A loaded bundle can be renamed and explicitly saved back to update it; duplicating a bundle in the editor clears its library linkage so it becomes an independent copy.
- Adding a library bundle to a strategy creates an embedded snapshot. Later library updates or deletion never silently change an existing strategy or its AI-published snapshot.
- Existing v1 saved strategies remain compatible. Each old flat scene is normalized into a Scene Bundle containing one sub-scene, and new saves retain a top-level first-frame mirror for safe compatibility.
- The Pregame Talk Edge Function reads every explicitly published bundle and its ordered sub-scenes, while preserving the rule that unrelated bundles are separate tactical situations.

See `docs/STRATEGY-ANIMATION.md` for the complete model, persistence, export, security, compatibility, and test rules.

## 8. Captain Notebook and AI rules

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

## 9. Attendance, RSVP, and player feedback

### Game Day engagement dashboard — v58.22

- The approved RSVP & Player Feedback dashboard stays directly below Man of the Match within Game Day, using the existing selected match and navigation. Its five summary counts and Player Feedback/reactions/private captain chat stay visible. It is one unified full-width panel, not a separate captain navigation view.
- Full Roster RSVP and Match Attendance are independent native disclosures, closed by default on a fresh page load. Attendance's summary includes the always-visible note: “Remember to fill out the match attendance before or after the game.” Lists, attendance metrics/edit actions and explanatory text are hidden until expanded. The open/closed choice survives list refreshes and attendance saves because only the existing inner list containers are rerendered.
- The existing panel/list/control IDs, read/write guards, attendance save/summary math, private replies, AI selection and inbox links remain unchanged. Inbox feedback links still scroll to the parent dashboard, with feedback visible below the collapsed lists. No database, RPC, permission, Edge Function, lineup/export or alarm behavior changes.

### Captain notification inbox — v58.19 / v58.20

- In v58.20 the inbox is a native details/summary card, closed by default. Its compact Captain inbox heading, live personal unread count and chevron remain visible. Filters, full messages and actions appear on expansion. Refresh/polling, read acknowledgments and equipment signals replace only the body and count, preserving the user's open/closed choice. Sign-out/account changes hide and reset the disclosure to closed.
- A prominent inbox directly below Dashboard metrics combines Equipment & Lost + Found notifications with Player Portal comments/private captain messages and reactions from all games. No recency, current-game, season or publication cutoff applies to feedback. Old/unpublished matches are fetched individually for a captain following an inbox link; normal Game Day scheduling still lists published matches.
- Unread counts are personal to the authenticated captain. Equipment uses existing `skor_equipment.notification_reads` so Mark read in either Dashboard or Equipment agrees. Feedback uses private `skor_private.captain_feedback_reads` keyed by caller, source kind and source ID, storing the exact source revision. Edits become unread again; stale revisions cannot acknowledge unseen changes. Existing feedback starts unread per captain; no historical reading is guessed. No source request/comment/reaction is rewritten.
- Inbox defaults to Unread, with All updates, ten-item Newer/Older pages, separate Equipment/Player feedback counts, manual refresh and visible-page 30-second checks. Navigation badges show personal total/equipment unread. Opening a destination or viewing Dashboard does not acknowledge a notification; Mark read for me is explicit. Equipment reads/actions notify the inbox immediately, and dashboard acknowledgments update the mounted Equipment list without replacing drafts.
- The new read-only snapshot and acknowledgment RPCs require authenticated captain/super-admin access, have empty search paths and no caller-supplied identity. Private schema/table/helper access is revoked from clients; table RLS is enabled. Ordinary players, viewers and anonymous sessions cannot use the inbox APIs. Requests are invalidated and private UI cleared on sign-out/account changes. Refresh failures are visible, retaining labeled stale snapshots rather than false zero counts.
- Approved migration and verification workflow: `docs/CAPTAIN-NOTIFICATIONS.md` and `docs/sql/CAPTAIN-NOTIFICATIONS.sql`. Nine suites and read-only source-query fixtures for two principals passed. Approved migration `20261024182232 add_captain_notifications` is applied; all three function bodies/ACLs match source. Rolled-back live tests confirm two-captain isolation, equipment/feedback acknowledgments, edited-version handling and ordinary-player/anonymous/private-helper denials. Existing seven source-table digests and empty receipt tables are unchanged. Frontend source/hash/file-set and production traffic are verified; browser visual verification remains unavailable. Player Portal remains v58.18, with dashboard visible and four lower disclosures closed by default.

### Player Portal expandable sections — v58.18

- My Match Record remains fully visible as the dashboard. My Next Matches, My Match History, Equipment & Lost + Found and Match Feedback use independent native details/summary disclosures, closed on a fresh page load. Current open/closed choices survive content refreshes; no accordion grouping or stored preference forces another section closed/open.
- Summary headers use the existing dark cards, maroon eyebrows, wrapping headings, chevrons, keyboard focus and touch targets. Phone layout stacks the cards; desktop match cards keep their two-column grid without stretching closed cards. Calendar, RSVP, history paging, equipment and all feedback controls remain inside their section bodies with original IDs. The equipment mount remains an inner div, so its renderer cannot replace the disclosure header; its duplicate inner title is hidden only in this portal.
- Initial feedback-match selection loads the latest conversation without opening or scrolling. Open Match Feedback from history expands Feedback before scrolling; closing it while data loads remains respected. Collapsing only hides existing content and preserves drafts. Dashboard polling and all data/auth logic remain unchanged.
- Player-Portal-only release; Captain Portal remains v58.17 and homepage v58.15. No database, RPC, migration, permission, Edge Function, lineup or export changes. Four related suites and HTML/feedback interaction checks passed; rendered browser review remains unavailable.

### My Match Record — v58.17

- Player Portal replaces SKOR Career / My Stats / hard-coded Milestones with My Match Record: games attended, attendance percentage, goals, assists, compact awards/cards, an explicit attendance breakdown, and match-by-match history. Games attended is captain-marked Present, not minutes played. RSVP, saved lineups and Crowd proposals are never counted as participation or official personal events.
- A proposed authenticated self-only `get_my_match_record()` RPC returns summary and history in one snapshot. All participating player/captain RPCs use published matches with `status='final'` and kickoff in the past. Excused/unmarked are excluded from Present/(Present+Absent). Unmarked applicable games remain unknown. Fixtures before roster creation are excluded unless explicit attendance/personal events establish participation; this does not invent joining dates or historical absences.
- Official events and awards match permanent roster keys only. Jersey-number fallbacks are removed from these personal aggregations to prevent spare/reassigned jerseys moving credit. Unlinked historical events are preserved for captain review, never guessed or rewritten. Official scores remain restricted to authorized players/captains; no public score grants change.
- `player-match-record.js` validates totals against history and handles initial errors, stale snapshots, visible-page 30-second polling, manual/foreground refresh, deduplication and logout invalidation. Errors never become fake zeros; no denominator means no percentage. Polling refreshes only the record/history and leaves RSVP notes, profile edits and feedback drafts untouched. No Realtime publication expansion or extra table grants are required.
- User approved migration/deployment on 2026-10-24. Exact approved SQL is applied as `20261024164008 sync_player_match_record` and recorded in the matching migration file. All nine function bodies match the approved source. Authenticated checks passed across 12 linked players (3 captains), with ordinary-player/private-helper/unlinked/anonymous denials verified. Seven application-table counts/digests are unchanged; 3 future attendance marks are excluded from summaries. Workflow and validation: `docs/PLAYER-MATCH-RECORD.md`.


### Portal activity (v58.6)

- Both authorized portals use `portal-activity.js` to record initial/restored access, foreground returns and throttled recent use. Hidden tabs and pages idle over 15 minutes do not keep recording. Events contain identity, source and timestamps, never click/keystroke details.
- Player Activity reads the latest `last_seen_at`, combines Player/Captain Portal sessions and includes approved console-only accounts. A linked captain appears once with their player identity. The report refreshes while visible and labels missing history as No recorded activity. Missed past visits cannot be recovered.
- The existing table/history is preserved. User-approved `docs/sql/PORTAL-ACTIVITY.sql` was applied on 2026-10-19 as migration `20261019065353 repair_portal_activity`, adding source/account-only support and guarded RPCs; old player recorders remain compatible. No roster claims or other feature data changes. Exact file set, tests, security/data contract and release steps are in `docs/PORTAL-ACTIVITY.md`.
- Activity behavior, score privacy and ribbon regression suites passed; inline syntax/IDs and existing CSS/navigation checks passed. Actual production role/persistence tests passed in a rolled-back transaction. The preexisting activity digest/legacy history and unrelated table counts are unchanged. RLS/direct-grant/RPC checks passed; the two expected authenticated SECURITY DEFINER API notices were reviewed against the verified role/identity checks and empty search paths ([advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). Rendered/signed-in browser validation remains unavailable. v58.6 is deployed in release `1ab0a7c329367e87b9f1ee025d5e3235e3f3736c`; the native Cloudflare production check succeeded and the exact ten-file release source was verified. Open portals must reload once to start the new tracker.


- Player RSVP statuses: Going, Maybe, Can’t Make It, and No Response, with optional notes and an explicit save action.
- Captain attendance statuses: Present, Absent, Excused, and Unmarked.
- Attendance is a player statistic. Excused entries do not reduce the attendance percentage. TEMP players are excluded.
- Captains can review team-visible feedback and private captain chat.
- Player comments enter AI context only through deliberate captain selection.

## 10. Jerseys and TEMP players

### Saved TEMP full names

- A native Previous TEMP players dropdown reads existing `match_temp_players.display_name` values across games, including archived entries, under the existing portal RLS. It pages through all records, normalizes spacing/case for deduplication, and includes only names with at least two words and at most 80 characters. This is a format check, not legal-name verification.
- Historical names remain in their existing database rows; no copied private name list is committed to the public repository. No separate directory table, SQL migration, production row change or Edge Function is required.
- New and edited TEMP records require a full name for the referee form. Existing first-name-only records are preserved and omitted from the saved-full-name dropdown until corrected explicitly.
- Selecting a saved name fills only the name, clears the jersey selection and creates a new match-specific TEMP identity through the existing save flow. It never copies an old jersey assignment or imports the player into the permanent roster.
- The native selector remains within the existing player panel on phones and desktop, with a 44-pixel minimum touch height. It is disabled without a scheduled game, for view-only users and while editing an existing TEMP identity.
- Reopening Lineups refreshes the directory; successful saves refresh it too. A failed history read leaves manual full-name entry available. Pending reads are invalidated and options cleared on sign-out.
- The existing TEMP full-name mapping supplies the Lineup Builder, Game Day and referee PDF/Excel renderer. Historical game events with unlinked identities must not be used to silently rename TEMP players.

### Personal ribbon order

- Keep the existing desktop sidebar, tablet rail and phone horizontal scrolling ribbon. The original navigation markup, route handlers and existing responsive CSS remain unchanged. Reorder the original button nodes so click handlers, role visibility and active-tab identity persist. The working page does not scroll when the active navigation button is brought into view.
- The header's Ribbon locked button opens a separate native modal editor. Phone controls are 44-pixel up/down buttons; desktop drag handles are limited to the editor. The navigation ribbon itself never becomes draggable, preserving horizontal phone swipes.
- Changes preview immediately; Cancel and Escape restore the saved order. Reset changes the draft until Lock & save is pressed. Save failures leave the editor unlocked for retry or cancel; controls block duplicate saves while saving.
- Store only feature IDs in the authenticated user's `user_metadata.skor_fc_ribbon_order_v1`, through `auth.updateUser`. This is a presentation preference, never authorization. Existing allowlist/RLS checks remain authoritative. The preference is personal to the captain account and loads across devices with a verified `auth.getUser()` read; there is no shared team order or new schema.
- Ignore unknown/malformed/duplicate saved IDs and append newly added features in default order. Sign-out/account changes clear the previous captain's order and invalidate stale requests. Token/user refreshes do not discard an open editor. View-only users do not receive reorder controls.
- Focus stays within the native modal, moved controls retain focus and scroll into view, and close restores the prior focus. The editor's height is bounded by the viewport and its list scrolls independently so actions remain visible on phones.
- `npm run test:ribbon-order` verifies account isolation, cross-client persistence, defaults/new features, original navigation nodes, phone/desktop controls, cancel/reset, save failures, auth refreshes and stale-response handling. `npm run test:temp-player-directory` covers the connected TEMP save and referee-name flow. Real authenticated browser persistence and rendered phone/tablet/desktop checks are still required before declaring live UI verification complete.

### Bulk custody handoff

- Select inventory rows using their physical asset IDs, or use Select all matching/header checkbox for the current search, kit and status filters. Defaults exclude retired rows; an explicit All statuses filter can include them. Selection survives filter changes and reports selected rows outside the current filters. Clear selection clears every selected row; unchecking the header clears only matching rows.
- Choose an active captain or super-admin from the existing protected `get_notebook_captain_directory()` RPC. The batch recipient list never includes view-only users, inactive names or an arbitrary free-text target. The existing single-jersey editor retains its historical holder-name behavior.
- Transfer selected confirms the count, receiving captain and any hidden selected rows. It changes `jersey_inventory.holder_captain_name` for exactly the selected IDs with one filtered UPDATE statement. Kit, number, size, availability, notes and TEMP assignments are preserved; the existing trigger updates timestamps.
- Refresh the authoritative captain directory before writing. Return and independently read back selected IDs/holders before reporting a complete handoff. Partial or unverified results remain explicit; unconfirmed rows remain selected while they still exist. A readback failure warns that the transfer may have been saved and asks the captain to refresh before retrying.
- Repeated clicks are blocked while transferring. Selection, filters, row actions and refresh controls are disabled during the handoff. Single-jersey/kit saves cannot start during it; a batch cannot start while their save buttons are busy. Successful handoffs update an open individual edit's holder so a later save cannot restore stale custody.
- Reload shared inventory after every attempt. Update the inventory Held By cells and notify Lineups so TEMP jersey labels use the current holder without changing assignments or numbers. Sign-out clears the batch selection.
- Use 44-pixel checkbox hit areas/buttons and a stacked phone action panel. Inventory tables retain intentional horizontal scrolling; the checkbox column stays visible. Existing ribbon/phone/desktop navigation layouts are untouched.
- Existing SELECT/UPDATE grants and captain RLS are sufficient; `jersey_inventory` RLS, UPDATE USING/WITH CHECK and the guarded captain-directory definition were verified read-only. No migration, new table, Edge Function or permission change is required.
- `npm run test:jersey-bulk` covers selecting/filtering/clearing, recipient validation, confirmation cancellation, one custody-only update, independent readback, partial/error states, reload persistence, preserving TEMP eligibility/numbers, double clicks, view-only protection, stale edit holders and responsive/markup contracts. Real authenticated browser handoff and rendered phone/desktop checks remain pending.

### Physical jersey inventory

- Kits are configurable; current defaults include Maroon and White.
- Physical jersey inventory tracks kit, number, size, status, captain holder/custodian, and notes.
- Only active, On Hand inventory is assignable to a TEMP player.
- A physical inventory item cannot be assigned to multiple active TEMP players for the same match.
- TEMP jersey assignment drives the displayed lineup/Game Day number.

## 11. Supabase integration map

The repository contains only the newer incremental migrations. Earlier production objects also exist and are called by the frontend, so do not infer the complete production schema from this folder alone.

### Principal tables/views used by the client

- Team/public data: `team_roster`, `public_roster`, `team_fields`, `public_fields`, `matches`, `practices`, `announcements`, `match_events`.
- Lineups and strategy: `lineup_variations`, `match_temp_players`, `match_strategies`, `strategy_scene_bundles`.
- Player access/activity: `player_access`, `player_match_attendance`, `player_match_reactions`.
- Captain/Notebook: `captain_notebook_entries`, `captain_notebook_attachments`, `captain_match_debriefs`, `captain_ai_player_comment_refs`, `captain_player_name_aliases`.
- Jerseys: `team_kits`, `jersey_inventory`.
- Equipment: private `skor_equipment` inventory/loan/report/notification/history tables, guarded `equipment_snapshot` / `equipment_action` RPCs and private `skor-equipment` Storage. Approved `docs/sql/EQUIPMENT.sql` is applied as migration `20261014011026`; future migration changes still require explicit approval.
- Crowd Game Day and official clock: `game_day_sessions`, `game_day_invites`, `game_day_crowd_events`, `game_day_event_reports`, `game_day_ref_decisions`, `game_day_ref_votes`, `game_day_motm_votes`.

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

## 12. Mobile and responsive rules

- Mobile is a first-class workflow, not a reduced desktop preview.
- The lineup builder uses tap player → tap position/pitch; desktop drag-and-drop remains supported.
- Strategy scene controls, tools, pitch, and export actions must remain visible and usable at phone widths.
- Wide tables may use intentional horizontal overflow, but primary actions and working surfaces may not be clipped off-screen.
- Validate at a representative phone viewport and desktop viewport whenever layout-affecting code changes.

## 13. Deployment and build workflow

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
11. Post the same plain-language release summary in the active chat and as a comment on the GitHub release commit. Both summaries must state the build number, what changed, connected surfaces/integrations, SQL/database status, verification, live status, and commit link.

No SQL change is required for a formation-only release because the saved lineup and strategy JSON accept new formation/role strings. A schema migration is required only if persistence structure or database-enforced behavior changes.

## 14. Definition of done

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
- A matching “what changed” summary is present in the chat handoff and on the GitHub release commit.

## 15. Previous build v58.0

- Upgrades flat Strategy scenes into ordered Scene Bundles with numbered animation sub-scenes.
- Adds bundle and sub-scene add, duplicate, reorder, rename/edit, and remove workflows with safe minimum/maximum limits.
- Adds Slow, Normal, and Fast in-portal animation preview for the selected bundle only.
- Adds local, looping GIF export for the selected bundle and PNG export for the selected animation step.
- Adds a shared captain Scene Bundle library grouped by game/Tinker and tactical category, with same-name overwrite and safe strategy snapshots.
- Preserves old saved strategies by converting each old scene into a one-step bundle on load.
- Extends explicitly published AI strategy context with ordered sub-scenes, set pieces, player/opponent movement, ball movement, and tactical marks.
- The approved `add_strategy_scene_bundles` migration was applied as Supabase migration `20260927223330`, and `generate-pregame-talk` was deployed as active version 13 with JWT verification enabled.
- Production release `a3f912637a3f0e1153906bb9397c3da29aab3708` was verified on `skorfc.net`: the v58.0 Captain Portal marker, Strategy JavaScript/CSS, and browser-required GIF encoder modules exactly matched the repository.


## 16. Previous build v58.1 — Private match scores

- Removes public live/final match scores, per-match goal feeds, scorer summaries, and squad W/D/L/GF/GA/GD records. Keeps fixtures, official time, published lineup, roster and individual player season highlights.
- Preserves Player Profile score RPCs and Captain Portal scoring. Crowd can submit goals without showing a scoreboard or goal feed.
- Approved `docs/sql/SCORE-PRIVACY.sql` was applied as migration `20261003225430 restrict_public_match_scores`: three restrictive read policies, approved portal event reads, and a narrow public season-aggregate RPC. No existing data is modified or deleted. No Edge Function deployment is needed.
- Frontend privacy, persistent-clock and lineup-export tests passed. Real post-migration role checks block anonymous/unlinked goal reads while preserving linked-player and captain scores. All data row counts are unchanged. Browser visual QA remains pending.
- The user approved the migration and publication on 2026-10-03. Production release `4eb58c932756e36908db1d4ef076b51501cfc496` was merged through PR #1; the connected Cloudflare build succeeded. All six changed live pages exactly match approved source and serve v58.1 markers. Anonymous production HTTP checks confirm no goal rows and working safe season-stat/clock RPCs. See `docs/SCORE-PRIVACY.md` for the affected file set and complete verification.
- The GitHub connector cannot create commit comments; the matching release summary is recorded on merged PR #1 with the production commit link and in the chat handoff.


## 17. Previous build v58.2 — Scoring beside the clock

- Moves the scoreboard and Record Event panel directly after the official timer, ahead of the full lineup and Crowd Scoring panels.
- Removes phone-only panel ordering so RSVP, attendance, lineup and Crowd panels cannot precede the scoring controls. Existing sticky scoreboard, touch buttons and entry sheet remain available.
- Persistent-clock and score-privacy regression suites passed, including inline JavaScript syntax and unique IDs. Document-order and responsive CSS checks passed. All inline JavaScript is identical to v58.1; no persistence, event, privacy, export, AI, Crowd or public-rendering logic changed.
- Browser rendering and authenticated save/reload checks could not be performed because browser control and an authenticated captain session are unavailable in this environment.
- SQL/database changes: none required or performed. Production commit [`d0a4778d3eb6d484b6393a51868adedfede2d262`](https://github.com/skorsolutions/skor-fc-site/commit/d0a4778d3eb6d484b6393a51868adedfede2d262) deployed successfully through Cloudflare build `2d5e9801-596e-41ba-a6d6-3fc9dc0e4e1a`, version `718bca75-4ec5-4618-ab24-92d3557cd102`. Direct live HTTP verification is unavailable: the environment proxy connection fails and the web fetch tool cannot access the admin page.

## 18. Equipment and Lost & Found — v58.5 release

The user confirmed captain approval for borrowing, authorized implementation, then explicitly approved the exact database migration and deployment on 2026-10-14. Migration `20261014011026 add_equipment_and_lost_found` is applied. All real-role/stock/privacy test records were rolled back; no sample gear, custody, report, message or announcement persists. Frontend is deployed in release `b35bcd22f1b4a8d5c9f8f2dfa7c84c602b894225`; the native Cloudflare production check succeeded at 01:14:44 UTC (build `16b47caf-6290-4a31-a2f5-8f87a56f7f8d`, version `e58d7a3b-75a6-4319-af1a-d4640336dbd2`). The exact eleven-file release diff and all source hashes match the checked files. Direct live HTTP, rendered phone/tablet/desktop and a real signed-in browser roundtrip remain unverified. The connector has no commit-comment creation operation; the matching summary is recorded in chat and repository notes.

- Captain Equipment tab integrates with personal ribbon order. Existing desktop/tablet/phone navigation buttons, routes and responsive CSS are preserved. Shared Store, borrowing, Lost & Found and Notifications appear in both portals. Inventory, approvals/returns and History are captain controls; viewers have read-only access.
- Configurable ball bags, ball entries/quantities, cone sets, cone entries/quantities and other gear. Assign stock custody to active captains or roster players individually or in a confirmed batch, including all selected bag contents. No real equipment counts are seeded. Team ownership, stock custodian and loan borrower remain distinct.
- **Confirmed rule:** request → captain approval/reservation → captain-confirmed physical handoff → borrowed → reported return → captain-confirmed receipt/condition → available. A request does not reserve or transfer gear. Pending/uncollected requests may be cancelled. Overdue gear stays allocated.
- Bags have one level of contents. Whole-bag borrowing reserves the bag and its children; individual-content borrowing prevents whole-bag checkout. Missing/retired/reserved gear cannot be transferred or booked as available. Quantity stocks have one custodian; physically separate stocks should use separate entries.
- Missing/found reports support personal belongings and team gear, optional private photos, location/event text, date and known/unknown owner. Finder/owner messages are private between participants and assisting captains. Unclaimed items can be identified through a message to the finder. Phone/email are not exposed; loan/report/message identity fields omit account IDs (private photo object keys use uploader folders).
- **Announce to team** deliberately creates an in-app notification for approved team players. It never writes the public homepage announcements table. Updates load with Equipment/on Refresh; no email/SMS/WhatsApp/background push is promised. No actual announcement was sent during development.
- A captain links verified missing inventory/quantity to a report. Missing stock and affected bags are unavailable. Found sightings/statuses do not restore quantities; a captain confirms recovery. A complete loan return cannot be confirmed while linked allocated gear remains missing. Resolved reports remain archived.
- Approved `docs/sql/EQUIPMENT.sql` is applied as migration `20261014011026 add_equipment_and_lost_found` (execution SHA-256 `c068ec79bffe8e5c520adc2c788108054c4a7014efbda227357695ae9b1c5d11`; repository audit comments updated afterward). Private tables with RLS/no direct browser grants, guarded invoker RPCs/private definer implementations, existing allowlist/claimed-player authorization, serialized stock mutations and idempotent retries, private immutable photos and restrictive Storage boundaries. No unrelated production rows or Edge Functions change.
- Six local suites pass: Equipment controller/security contracts, ribbon, bulk jerseys, TEMP names, persistent clock and score privacy. Inline scripts/IDs and original navigation/CSS/line endings pass. Actual rollback-only production PostgreSQL tests pass for captain, two players, viewer, unlinked-login and anonymous roles: approvals, bag/child quantities, custody, returns, recovery, private messages/photos and retry semantics. All nine private tables retain RLS with zero direct browser table grants; all feature rows/photos remain empty. Advisors add only expected default-deny/unused-index and eight informational foreign-key-index notices, no new security ERROR/WARN. Rendered phone/tablet/desktop, binary Storage HTTP upload and a real signed-in browser roundtrip remain unverified due environment socket permissions. `tests/verify-equipment-db.sql` is a disposable-local fixture test, never for production.
- Publication and exact SQL are approved; database verification is complete. The source is published and native Cloudflare production deployment is verified. Full data/API rules, limitations, affected surfaces and release checklist: `docs/EQUIPMENT.md`.
- **Future multi-team app idea retained:** Equipment and Lost & Found should help recover personal/team gear at shared fields, tournaments and practices. Future work needs team-scoped memberships/data/notifications and explicit sharing/privacy rules before any optional venue/league board. The present single-team schema is not a multi-team implementation.


