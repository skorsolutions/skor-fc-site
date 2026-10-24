# Captain notification inbox — v58.19

Status: deployed, database and production version verified.

The dashboard inbox shows equipment requests/updates and player feedback from every game. Feedback includes team/private comments and personal/team reactions, including older or subsequently unpublished games. Inbox links retrieve the chosen match; the normal Game Day list still uses published fixtures. No source records are altered to create notifications.

Read status belongs to the signed-in captain. Opening the inbox or its destinations does not acknowledge anything. Mark read for me persists only that captain's receipt. Unread counts cover all sources, while ten-item Newer/Older pages allow every update to be reviewed. All updates includes already-read items. Full feedback text is shown before acknowledgment. The dashboard and Equipment navigation have personal badges.

Equipment continues using its existing notification/read tables. Acknowledging in either surface agrees because both reference `skor_equipment.notification_reads`. Equipment actions/refreshes signal the dashboard; dashboard acknowledgments update the mounted Equipment list without replacing a borrowing draft. Equipment notifications targeted to another individual are excluded; captain/team notifications remain available under existing captain authorization.

Feedback adds `skor_private.captain_feedback_reads`, with `(user_id,kind,source_id)` as the primary key. A receipt stores the exact source revision; updates become unread again and stale acknowledgments fail. The client transmits the original timestamp string without losing microseconds. Existing feedback starts unread for each captain because historical reads cannot be inferred. Existing equipment reads are preserved.

## Approved database update

Review [CAPTAIN-NOTIFICATIONS.sql](sql/CAPTAIN-NOTIFICATIONS.sql).

SHA-256: `135ccbf80da35b412f3a7302706544b082496efefe84219cff4a0709efa05d36`.

- One private RLS-enabled receipt table, no client table privileges.
- One private INVOKER source helper, no client EXECUTE or schema access.
- `get_captain_notifications(integer,integer,text)` returns a paged snapshot plus personal unread counts.
- `mark_captain_notification_read(text,text,timestamptz)` acknowledges a visible source version for `auth.uid()` only.
- Both public RPCs explicitly require a signed-in captain/super-admin, use an empty search path and schema-qualified references, and grant EXECUTE only to authenticated clients. They use SECURITY DEFINER to reach existing RPC-only private data; ordinary players/viewers/anonymous callers are denied. No caller can choose another captain's identity or mark a newer unseen version.
- No request, stock, comment, reaction, match or lineup rewrite, new Realtime publication, Edge Function change, RLS relaxation or public data grant.

User explicitly approved deployment. Applied migration `20261024182232 add_captain_notifications` through the connected tool and saved the identical source under that actual version. All three deployed function bodies, empty search paths and EXECUTE permissions match approved SQL. Anonymous execution and private helper/schema/table access are denied. The approved SQL header is retained exactly so its hash remains unchanged.

## Refresh and privacy

The inbox checks every 30 seconds while the portal is visible, on foreground return, manual Refresh, and after local equipment updates. It does not poll in a hidden tab. Initial failures show unavailable; later failures retain a labeled last snapshot. All private inbox content and badges clear at sign-out/account changes, revoked captain access clears cached snapshots, and old requests cannot paint another account's UI. This release adds in-app notifications only; mobile push delivery is not implemented.

My Match Record stays fully visible in Player Portal. Its four lower disclosures, profile/RSVP drafts, equipment workflows, private captain chat, lineup/keeper/export logic and public homepage stay intact.

## Verification

Nine suites pass: `test:captain-notifications`, `test:equipment`, `test:match-record`, `test:portal-activity`, `test:score-privacy`, `test:lineup-export`, `test:ref-game-card`, `test:strategy-animation`, `test:ribbon-order`.

The inbox tests execute the real controller, renderer and DOM event adapter. They cover independent accounts, equipment synchronization, comments/reactions, old-game pagination, edited versions, stale-version rejection, explicit read actions, foreground/hidden polling, failed requests/writes, deduplication, stale snapshots, logout/session mismatch, escaping, badge updates and destination behavior. Equipment tests verify refresh/write signals, acknowledgment without duplicate writes, destination opening without read acknowledgment and preservation of a borrowing form. All inline scripts parse and HTML IDs are unique.

`node tests/verify-captain-notifications.mjs --sql-fixture` generates a read-only CTE fixture using the exact proposed source helper query. It has been executed on PostgreSQL for two principal IDs; all assertions passed. It confirms personal equipment/feedback receipts, edited-feedback reappearance, private recipient isolation, and historical/unpublished-match inclusion. The fixture creates no functions/tables and writes no rows.

Post-apply verification passed:

- `tests/verify-captain-notifications-db.sql` executed its rollback-only transaction using two real captain accounts and an ordinary player. It verified independent captain status, actual equipment/feedback acknowledgment, edited-comment reappearance, stale revision denial, private table/helper denial and ordinary-player/anonymous read/write denial. Every temporary receipt/source timestamp change rolled back.
- Seven existing source-table snapshots are identical before/after: comments 12, reactions 17, equipment items 5, loan/request 1, equipment notification 1, matches 10 and saved lineups 37. Both receipt tables remain empty.
- Three function bodies match approved SQL exactly. The private helper is INVOKER with client EXECUTE revoked; both public RPCs have empty paths, authenticated-only EXECUTE and explicit captain/identity guards. Receipt RLS is enabled, authenticated private-schema USAGE is denied.
- Advisors reviewed. The three new notices are intentional: the private RLS receipt table has no client policies ([linter reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); the two authenticated SECURITY DEFINER RPCs enforce captain/self guards ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). No new security ERROR or performance group was introduced. Existing unrelated advisories are unchanged.

Source release [`b572643e7aad218f82aaf6f123ffcc3e95576357`](https://github.com/skorsolutions/skor-fc-site/commit/b572643e7aad218f82aaf6f123ffcc3e95576357) is deployed. All 18 source hashes and exact release files match checked sources. Cloudflare build `d7d3b241-aab8-4921-ad79-e70714ae2da9` succeeded; production version `c23a0c87-ec01-4a9f-a29a-5ad250e268c0` verified at 100% traffic. A documentation-only follow-up records these results. Browser visual verification is unavailable in this execution environment. Supabase project is healthy. Current function/private-schema docs were retrieved through Supabase search; the executor proxy prevented direct changelog access. Connected GitHub tools cannot create commit comments.
