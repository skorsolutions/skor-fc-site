# v58.1 — Match scores limited to team portals

Status: **v58.1 is live; Supabase migration and production deployment verified on 2026-10-03.** Production release: [`4eb58c932756e36908db1d4ef076b51501cfc496`](https://github.com/skorsolutions/skor-fc-site/commit/4eb58c932756e36908db1d4ef076b51501cfc496), merged through PR #1. Source reviewed from GitHub `main` at `5ade865589df60af40ff24e10cee59255ec07715`.

## Requested behavior

Temporary and prospective players browsing `skorfc.net` can see the team, fixtures, fields, official match time, published lineup, and individual player season highlights without seeing match scores or a negative team results record.

| Surface | v58.1 behavior |
| --- | --- |
| Public Home | Teams and match information; no score or scorer summary |
| Public Match Center | Teams, fixtures, calendar, official clock, lineup, discipline and MOTM identity; no live/final score or goal-by-goal feed |
| Public Players / Squad | Roster and aggregate individual season stats remain; removes W/D/L, GF, GA and GD |
| Crowd Game Day | Keeps invitation/sign-in, event submission, clock, lineup, cards, referee reviews and MOTM voting; omits score, pending goal counts and goal feed |
| Player Profile | Existing authorized recent-match score and personal stats remain |
| Captain Portal | Official and Crowd scoring and event management remain; release marker/label becomes v58.1 |

Public MOTM prose is replaced by a neutral caption because a free-text match summary could mention the score. The captain's stored explanation is preserved.

## Data boundary

- Applied SQL: `docs/sql/SCORE-PRIVACY.sql`; migration `20261003225430 restrict_public_match_scores`, approved by the user on 2026-10-03.
- Adds restrictive SELECT policies for official goals, Crowd goals, and reports on Crowd goals. The policies work together with existing RLS; a crowd invite or an arbitrary login does not grant score access.
- Protected access requires a signed-in, active claimed Player Profile or approved Captain Portal identity. Existing approved read-only portal viewers retain read access and do not gain writes.
- Non-goal events keep their existing publication/participation rules. Captain insert/update/delete authorization is unchanged.
- Adds an intentional public, no-argument season-aggregate RPC, `get_public_player_season_stats()`. Its output contains only public player names/numbers, individual season counts, and season totals for SKOR goals, assists, cards and MOTM. It excludes match IDs, dates, raw goals, opponent goals, scores and W/D/L records. Full names fall back to first names; active roster display names are preferred.
- The aggregate function needs definer privileges to summarize protected goal rows. It has an empty search path, fully qualified relations, no caller-supplied filters and explicit execute grants after revoking PUBLIC access.
- No stored player, match, event, report, lineup, strategy or note is deleted or modified. No Edge Function change is required.
- Existing authenticated Player Profile RPCs already validate the linked active player before returning scores. Their source and client remain unchanged.
- Independent Crowd goal submissions still contribute to existing report consensus. The goal feed's confirmation/dispute controls are no longer displayed in Crowd; captains continue to inspect/manage goal records in their portal.

## Complete approved publication file set

1. `admin.html`
2. `gameday.html`
3. `index.html`
4. `matches.html`
5. `players.html`
6. `squad.html`
7. `package.json`
8. `tests/verify-score-privacy.mjs`
9. `tests/verify-lineup-export.mjs`
10. `docs/sql/SCORE-PRIVACY.sql`
11. `docs/SCORE-PRIVACY.md`
12. `docs/GAME-DAY-CLOCK.md`
13. `docs/PROJECT-HANDBOOK.md`
14. `docs/deployment-notes.md`

This list is the consolidated review for replacing full public source files containing the existing browser authentication and data-access configuration. No service-role key, private player data, credential, token or captain note is added.

## Verification

- `npm run test:score-privacy`: passed. Exercises public renderers across Scheduled, First Half, Halftime, Second Half and Final; checks that stale goal records cannot appear in the public event helper; verifies source parsing, unique IDs, removal of public team results, preservation of player/captain score paths and the restricted data contract.
- `npm run test:clock`: passed. Official clock calculations, timestamped discipline rendering and existing control contracts are preserved.
- `npm run test:lineup-export`: passed. The only test update is its expected release marker; the lineup renderer/export is unchanged.
- Read-only production queries: existing RLS is enabled on all three affected tables; report foreign keys support the Crowd filtering; the proposed aggregate SELECT executes against the current schema and emits exactly the documented safe fields; access-predicate cases pass for visitors, unrelated logins, invited TEMP users, linked players, captains and approved portal viewers.
- The current published announcements contain no numeric score pattern. Existing source score/crowd RPCs were inspected; the player score RPC checks current player authorization.
- Applied migration verification: real `anon` and unlinked `authenticated` role queries return zero official goal rows. Active linked players and captains retain all 43 official goal rows; the protected Player Profile recent-match RPC returns its five existing match entries. Anonymous viewers retain eight non-goal events and access to the safe season aggregate RPC.
- Match, event, roster, Crowd event and Crowd report row counts match the pre-migration snapshot. The aggregate function retains its empty search path. Security advisors flag the intentionally public definer aggregate; its no-argument narrow projection and grants were reviewed. Other reported findings concern pre-existing objects. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- Anonymous production HTTP checks return no official goal records, exactly the documented safe season-stat fields, and a working public clock RPC.
- Cloudflare's `Workers Builds: skor-fc-site` check succeeded for production commit `4eb58c932756e36908db1d4ef076b51501cfc496` (build `5d6c69a3-2161-4a31-9643-0652d9c9abfd`, version `1814304f-0dc4-40b2-b66d-4fff984e92ac`). Live Home, Matches, Players, Squad, Crowd Game Day and Captain Portal HTML exactly match the approved source and serve their v58.1 build markers. Unrelated repository files and existing hosting settings were preserved.
- A browser fixture preview was prepared for desktop and phone widths, but Chromium is unavailable and the browser download failed in this environment. Actual rendered visual QA remains pending. Existing mobile breakpoints are retained; Match Center's summary becomes a single-column panel.

## Approved release order

1. Apply the explicitly approved SQL draft as one Supabase migration.
2. Verify anonymous goal reads return no rows; arbitrary signed-in/invited users cannot read goal records; player and Captain Portal scoring reads continue; non-goal data and the aggregate RPC remain available. Run advisors and record the actual migration version.
3. Publish the approved file set through the existing GitHub/Cloudflare workflow. Preserve the hosting settings and `npx wrangler deploy` command.
4. Verify the deployed build markers and public pages, complete available browser review, and record the production commit/live status in the release notes.
5. Post the same plain-language release summary in chat and on the release commit, as required by the repository instructions.

The available GitHub connector supports PR conversation comments but cannot create commit comments. The release summary is therefore recorded on merged PR #1 with the production commit link, as well as in the chat handoff; a commit comment could not be posted through this connector.
