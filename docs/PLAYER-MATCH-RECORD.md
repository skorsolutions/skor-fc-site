# Player match record — v58.17

Status: deployed. User approved the database update and deployment on 2026-10-24. Migration `20261024164008 sync_player_match_record` is applied and verified. Source [`20d8f324e1f5918476d34c406482dced46c15dfe`](https://github.com/skorsolutions/skor-fc-site/commit/20d8f324e1f5918476d34c406482dced46c15dfe) is deployed through successful Cloudflare retry `6cf4bcd6-cfbb-4ac0-aede-8bbb0308fb01`, version `e49e884d-eca3-4177-ab16-f7fd9e09b24b`, verified at 100% production traffic.

The approved change replaces the player portal's career/milestone section with a factual record of completed matches. Existing attendance, official events and awards remain the source; no historical application records are rewritten.

## Counting contract

- Count only published matches whose status is `final` and whose kickoff is not in the future. Do not infer completion from kickoff alone.
- Games attended is captain-marked Present. This is not a claim about minutes played. RSVP, a saved lineup, a bench slot or an event contribution does not automatically mark someone Present.
- Attendance percentage is Present / (Present + Absent). Excused and Unmarked do not reduce it; no denominator displays a dash.
- History includes applicable completed fixtures since the roster record was created. Explicit older attendance, events or awards preserve historical participation even if roster import happened later. Missing marks remain unknown, never inferred absences. This is a recorded history, not a claim to complete career coverage.
- Credit official goals, assists, cards and Player of the Match by the permanent roster key. Match jersey/spare keeper numbers do not identify the player. Existing unlinked events are preserved and require captain review; the migration does not guess their owner.
- Totals and history are returned in one snapshot. The browser checks that the two agree before showing them. A successful zero is distinct from a failed request. Last-known data is retained with a stale label when refresh fails.

## Approved database change

The [exact approved SQL](sql/PLAYER-MATCH-RECORD.sql) is also recorded as `supabase/migrations/20261024164008_sync_player_match_record.sql`. The two files are byte-for-byte identical.

1. Create `skor_private` with no client-role access. Add two read-only invoker helpers for completed attendance and one player's completed match rows. Their EXECUTE privileges are revoked from public/anon/authenticated.
2. Add `public.get_my_match_record()` with an explicit authenticated/current-player check. It accepts no player ID and exposes only the caller's record. The existing RPC-only attendance and identity model requires a narrowly scoped SECURITY DEFINER wrapper; every object is schema-qualified and search_path is empty.
3. Replace six existing functions without changing their return signatures: `get_my_player_stats`, `get_my_attendance_stats`, `get_my_recent_matches`, `get_team_attendance_stats`, `get_team_attendance_by_player`, and `get_team_attendance_matrix`. Player wrappers retain self-only access; captain reports retain captain guards. All use the shared completion rule. Client function grants are authenticated-only; anonymous execution is revoked.
4. Reload the API schema cache. No table data, table grants, RLS policies, auth mappings, Realtime publications, Edge Functions or public score permissions change.

Approval was received before applying the migration through the connected Supabase migration tool. Its actual version was read back from migration history and used for the committed migration filename; no timestamp was invented. Approved SQL SHA-256: `c11af2c952f28f8aeeeab8865af13f9115e6e9c29d59ae64d0d1c161ce2dd700`.

## Browser behavior

`player-match-record.js` polls only the self-scoped snapshot: initially, manually, on foreground return and every 30 seconds while visible. No Realtime table publication is added. Requests are deduplicated and invalidated at logout/account reset; hidden pages stop polling. Refresh touches only totals/history, preserving RSVP notes, profile edits and feedback drafts. History initially shows six fixtures and can expand locally. Existing calendar, comments, private captain chat and equipment flows remain intact.

## Verification

- `npm run test:match-record`: real page renderers, summary/history consistency, zero vs unavailable, stale snapshots, actual attendance labels, escaping, visible-page polling, retries, concurrency and logout invalidation.
- `node tests/verify-player-match-record.mjs --sql-fixture`: generates a read-only query from the exact proposed helper SELECT bodies and synthetic CTE fixtures. It was executed successfully through the database connector without creating objects or changing records. Player A has 5 applicable matches: 2 Present, 1 Absent, 1 Excused, 1 Unmarked, 66.7% attendance, 1 goal, 1 assist, 1 yellow and 1 award. Player B receives only their own keyed goal/assist. Scheduled, future, cancelled and unpublished fixtures are excluded; unlinked matching jersey numbers receive no player credit. Four team attendance marks qualify.
- Existing score privacy, portal activity, equipment, lineup export, referee card and Strategy regression suites are run for the release. An equipment source check is updated to verify that sign-out clears equipment without requiring that call to be the first statement in the sign-out handler.
- Production validation passed: all nine function bodies match source; client schema/helper access is denied; all seven public RPCs reject anonymous execution. `tests/verify-player-match-record-db.sql` exercises all 12 active linked identities, including 3 captains, in a rolled-back transaction. Self-only totals match independent source counts, legacy RPCs agree, noncaptains cannot read captain reports, and unlinked/anonymous accounts are rejected. No-denominator and past/future filters are checked.
- Seven application tables retain identical counts and digests: roster 21, player access 21, matches 10, events 72, attendance 164, lineups 37, TEMP players 10. Completed attendance helper returns 161 marks, excluding 3 future marks. No application record was rewritten.
- Security advisors were reviewed before and after: the sole new notice is the expected [authenticated SECURITY DEFINER API](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) for the intentional self-only RPC. It has an empty search path, no player-ID parameter, explicit authenticated/current-player guards, and verified anonymous/private-helper denials. No table grants, RLS or public score access changed. Performance advisories were also reviewed; this migration adds no tables or indexes.
- Browser rendering and an interactive signed-in player session remain unverified in this environment. Authenticated SQL role tests establish database guards; they do not substitute for an interactive browser session.

## Current production status

Database migration `20261024164008 sync_player_match_record` and both portal clients are deployed and verified. Exact 17-file release and hashes match checked source. Initial push build `b58c998f-6deb-4a6d-933b-f24945f4a60c` failed on Cloudflare assets-upload-session API error 10013. A manual retry of the identical source commit succeeded without application or pipeline changes. Cloudflare deployments readback confirms version `e49e884d-eca3-4177-ab16-f7fd9e09b24b` at 100%. The first GitHub build check may retain its failed status; production success is verified through the Cloudflare build API/logs and deployment version. Public homepage remains v58.15. A documentation-only follow-up records verification; connected tools cannot post commit comments.
