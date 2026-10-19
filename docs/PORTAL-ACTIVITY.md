# v58.6 — Portal activity repair

Status: **User approved the migration and publication on 2026-10-19. Database migration `20261019065353 repair_portal_activity` is applied and verified; frontend publication is in progress.**

## Diagnosis

- The Captain Portal never called the activity recorder.
- The Player Portal recorded only its initial authorized load, with no foreground/return updates.
- The existing report used `occurred_at` (session start) even though the backend also stores `last_seen_at`. Its five-row query was ordered by session start.
- The roster-only recorder/report cannot represent approved console accounts without a claimed player profile.
- Read-only production checks confirm existing events continue to arrive and some sessions have a newer last-seen timestamp. The failure is incomplete recording/display, not a completely unavailable event table.

## Resulting behavior

- Both portals record after their existing authorization succeeds, including restored logins.
- A visible portal records at most once per five minutes while recently used. Returning via focus, visibility, page restore or connectivity, and normal touch/keyboard use, can resume recording. A hidden tab does not record; a visible page stops periodic recording after 15 minutes without interaction. There are no background notifications or click/keystroke details collected.
- The database supplies the authenticated identity and timestamp. The client supplies only `player` or `captain`.
- A session is reused while its last recorded activity is within 15 minutes. An advisory transaction lock serializes concurrent tabs/retries for the same account/portal. Session start is preserved; the heartbeat updates last seen and the existing counter.
- The report includes every active roster player plus active approved console accounts that do not already have a linked active player row. This avoids duplicating a linked captain. Captain and Player Portal sessions are labeled separately.
- Sort, relative times and the seven-day filter use the latest valid last-seen/start timestamp. Empty history says **No recorded activity**, rather than asserting a person never logged in.
- The report refreshes every minute while visible, on return, and after recording the current captain. Failed refreshes retain loaded results with an explicit retry message. Sign-out/account changes invalidate pending responses and clear the report.
- Historical visits that were never recorded cannot be reconstructed. Old events and legacy-login entries remain intact. Existing open browser tabs must reload to receive the new tracker.

## Approved and applied database change

The approved [sql/PORTAL-ACTIVITY.sql](sql/PORTAL-ACTIVITY.sql) was applied as native Supabase migration `20261019065353 repair_portal_activity`. Only its audit comments were updated afterward; executed statements are unchanged.

Approved/executed SQL SHA-256: `08ad288a7c4ee5a3b971dddfe19f5fba453ade13649049ea5e7ebda95f0df250`.

- Extend the existing `player_portal_login_events` table with a constrained `portal` column; existing rows receive `player`.
- Permit an activity row without `player_id` when it has an authenticated account ID, for approved console-only accounts. Keep the player foreign key and require at least one identity.
- Preserve RLS and revoke direct `anon`/`authenticated` table access. Add account/portal/last-seen and player/last-seen indexes.
- Add authenticated-only `record_my_portal_activity(text)` and `get_portal_activity(integer)` RPCs. The recorder requires a current authorized player for Player Portal activity or an active approved console identity for Captain Portal activity. The report requires a writing captain/super-admin; viewer, player and anonymous report access are denied.
- Make the old no-argument player recorder an invoker wrapper around the new player recorder, preserving older clients and preventing them from relabeling captain sessions.
- New privileged functions use an empty search path, explicit object qualification, server-side identity checks and explicit grants. The report returns display names, roles and activity fields; it does not return emails, JWTs, IP addresses or user-agent data. Console participant keys are stable hashes, not email strings.
- No change to roster/access claims, permissions in other features, match scores, clock, lineups, equipment, jerseys, AI, public pages or Edge Functions. No existing event is deleted or assigned a guessed date. Deployment seeds no activity.

## Complete approved publication file set

1. `admin.html`
2. `player-portal.html`
3. `portal-activity.js`
4. `package.json`
5. `tests/verify-portal-activity.mjs`
6. `tests/verify-portal-activity-db.sql`
7. `docs/sql/PORTAL-ACTIVITY.sql`
8. `docs/PORTAL-ACTIVITY.md`
9. `docs/PROJECT-HANDBOOK.md`
10. `docs/deployment-notes.md`

The two portal files retain their existing publishable browser configuration/authentication and data-access code. No secret, service-role key, private activity record, player identity or captain note is added to this public repository.

## Verification and release sequence

- Passed: `npm run test:portal-activity`, `npm run test:score-privacy`, and `npm run test:ribbon-order`.
- Activity tests exercise both portals, restored logins, focus/visibility, foreground heartbeats, idle/hidden suppression, retries, duplicate request suppression, account isolation, stale-response protection, last-seen sorting/filtering, captain-only identities, report errors, escaping, inline JavaScript and unique IDs.
- Existing portal CSS and navigation are unchanged apart from the build label. No new layout is introduced; existing phone/desktop activity cards remain in use.
- Production checks inspected function definitions, schema, RLS/direct grants, migration history and aggregate activity/linkage. The approved migration is applied. The before/after digest confirms every preexisting activity ID, player identity, session start, last-seen timestamp and counter is unchanged after verification; legacy history and unrelated roster/match/event/access counts are preserved.
- All statements in `tests/verify-portal-activity-db.sql` passed against production in a rolled-back transaction. Real-role checks covered player and captain writes, console-only recording/readback, reuse of a session, idle rollover, the old recorder, and forbidden ordinary-player/viewer/unlinked/anonymous report or portal access. No test event or timestamp change was committed. RLS remains enabled; direct table grants remain revoked; the three relevant RPCs have empty search paths and no anonymous execute grants. Security advisors add no findings; the new player/last-seen index has an expected informational [unused-index notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) immediately after creation.
- Browser control and a signed-in browser session remain unavailable. The real database API/role roundtrip is verified; rendered browser use is not. No background behavior is promised.
- Frontend publication in progress: publish the approved ten-file set to GitHub `main`, verify the exact release diff/hashes, and confirm the connected Cloudflare production deployment. Verify live source if network access permits; report browser limitations accurately.
- Record the release summary here/in deployment notes and in chat. The current GitHub connector cannot create the requested commit comment; do not claim that it was posted.
