# Equipment and Lost & Found — v58.5

Status: the user explicitly approved the migration and deployment on 2026-10-14. Database migration `20261014011026 add_equipment_and_lost_found` is applied. Rollback-only real-role/stock/privacy tests passed; all Equipment tables and photo objects are empty after verification. Frontend v58.5 is deployed in release [b35bcd22f1b4a8d5c9f8f2dfa7c84c602b894225](https://github.com/skorsolutions/skor-fc-site/commit/b35bcd22f1b4a8d5c9f8f2dfa7c84c602b894225). Cloudflare production build `16b47caf-6290-4a31-a2f5-8f87a56f7f8d` succeeded on 2026-10-14 at 01:14:44 UTC; version `e58d7a3b-75a6-4319-af1a-d4640336dbd2`. The exact eleven-file diff and all source hashes were verified. Direct live HTTP, rendered browser and binary Storage HTTP verification remain unavailable.

## Surfaces

- Captain Portal: Equipment is a new navigation button and view. The existing desktop sidebar, tablet rail and horizontally scrolling phone ribbon keep their original markup, handlers and CSS. The personal ribbon normalizer appends the new feature for captains with a saved order.
- Both portals: Equipment Store, requests/borrowing, Lost & Found and notifications. The captain view additionally has Inventory, approvals/returns and History. A captain using the Player Portal sees the player interface.
- Inventory: configurable ball bags, individual balls or identical-ball quantities, cone sets, cone quantities and other equipment. Add/edit/retire/restore and individual or batch custody transfers use active captain and roster-player dropdowns.
- Real inventory starts empty. No counts, purchases, physical custody or example gear are inferred from existing jerseys. Captains enter the team's actual equipment after release.

## Borrowing and custody

1. An approved team member requests an item/quantity and return date. The request is **pending**; no stock is reserved and custody does not change.
2. A captain approves it. The server checks current availability, date and the borrower's active linked access, then atomically reserves the equipment. Captains may decline instead.
3. A captain confirms **physical handoff**. Only approved gear can become borrowed.
4. The borrower or captain reports a return. The allocation remains reserved while receipt is pending.
5. A captain confirms receipt and condition. Equipment is available again. Overdue borrowing stays allocated and is labeled overdue.

Pending requests and uncollected approvals may be cancelled. Approval never expires silently. A past-due pending request must be declined and resubmitted. No payments, automatic background pushes or delivery service are implemented.

Team ownership stays separate from possession. `items.holder_key`/`holder_name` identifies the custodian of stock not currently lent out and the return destination; active loan allocations identify the borrower and quantity physically away. Captains can see every borrowing record. Players see their own loan details.

A container has quantity 1 and one level of linked contents. Ball bags hold ball entries; cone sets hold cone entries. A whole-container approval reserves the container and every active child entry. An individual-child reservation makes the whole container unavailable. Missing, retired or reserved contents prevent a whole-container checkout. Quantities are not counted as both bags and balls/cones.

Batch custody confirmation lists the selected entries, including those hidden by current filters, and all bag contents. Whole bags move with their contents. Detach an individual entry in Edit before transferring it separately. Transfers change stock custody atomically and never reassign a borrowed, reserved, missing or retired entry. Quantity entries have one stock custodian; split physically separate stocks into separate entries. A partial borrowed quantity is tracked in the loan allocations.

## Lost & Found

Missing and found reports accept descriptions, private photos, a last-seen/found date, location/event text and an optional owner. Personal belongings stay separate from borrowing inventory. Missing reports with no selected owner default to the reporter; found reports may remain unclaimed.

- Captains review a report and deliberately **Announce to team**. One team-only in-app notification reaches all approved team players. The public `announcements` table and homepage are never used for this feature.
- **I found it / I saw it**, **contact finder** and replies create private messages between sender and recipient, with captain assistance. They do not expose phone numbers/emails or automatically change stock. If the recipient has no active linked portal, the UI directs the player to a captain.
- Reporter, owner or captain can mark found/awaiting return. Returned/resolved reports are archived. An unknown owner can arrange a return through a private message to the finder; there is no automatic claim or account-ownership transfer.
- A captain can link a reviewed missing report to an inventory entry and quantity. Missing stock becomes unavailable; its container is unavailable too. A missing container prevents lending its contents. No duplicate loss count is assigned to its children.
- A sighting or found-status change does not restore inventory. A captain must confirm recovered team stock. Complete loan receipt is blocked while any allocated entry still has unresolved missing stock. Availability is deliberately conservative while missing stock overlaps an outstanding loan.

Notifications include requests, approval/pickup/return/cancellation updates, report-review prompts, team announcements and private-message alerts. They load with Equipment and on Refresh (also when opening the captain Equipment tab). They are in-app records, not email, WhatsApp, SMS or closed-browser push notifications. No notification was sent during development.

## Persistence and security

The approved database change is [sql/EQUIPMENT.sql](sql/EQUIPMENT.sql), applied as migration `20261014011026 add_equipment_and_lost_found` on 2026-10-14. The executed script SHA-256 is `c068ec79bffe8e5c520adc2c788108054c4a7014efbda227357695ae9b1c5d11`; only the audit comment header in this repository was updated afterward. Its atomic transaction adds:

- A private `skor_equipment` schema with inventory, loans, allocations, reports, messages, notifications/read receipts, custody/history and idempotency receipts.
- Two public invoker RPCs: `equipment_snapshot()` and `equipment_action(p_action,p_payload)`. Checked definer implementations stay inside the private schema with empty search paths.
- A private `skor-equipment` Storage bucket, max 5 MB, restricted to JPEG/PNG/WebP; own-folder uploads and immutable filenames. Team/viewer reads require approved portal access, and cleanup cannot remove a referenced photo. Restrictive bucket boundaries preserve the rules alongside unrelated permissive policies; other buckets keep their behavior.

Browser roles have no direct access to the private tables; all have RLS enabled. RPCs require an authenticated active captain or claimed active player, with the existing view-only role supported for reads. Authorization uses the existing allowlist and `current_player_id()`, never user-editable metadata. Captain directory keys are opaque hashes; email addresses and account IDs are omitted from loan/report/message identity fields. Private photo object keys use the uploader's account folder.

Every mutation takes the same transaction advisory lock. Availability is rechecked under that lock before allocation, stock/custody changes, bag edits and recovery. Idempotency receipts prevent a transport retry from duplicating reports, requests or messages. Identity checks, auth event clearing and request generations prevent stale client responses from restoring another account's state. Native dialogs block duplicate saves/Escape during a save and preserve failed drafts for retry. Acknowledged saves close before reloading, so a subsequent read failure is reported as a refresh error.

Existing roster/access, match, clock, jersey, TEMP, lineup, referee export, AI, public announcements and Crowd data are not migrated or modified. No Edge Function change is required. The current feature is for this single team; its private schema is **not** a complete multi-team permission model.

## Verification and release status

Passed locally:

```sh
npm run test:equipment
npm run test:ribbon-order
npm run test:jersey-bulk
npm run test:temp-player-directory
npm run test:clock
npm run test:score-privacy
```

Equipment tests run the actual controller with a fake DOM/RPC transport. They cover request/approval/pickup/return rendering and action payloads, batch bag/hidden selection review, role visibility, private messages/photos, error/retry paths, duplicate saves, auth changes and late reads. SQL checks inspect security/transaction/state contracts; **they do not execute PostgreSQL**. All inline scripts parse, IDs are unique, existing Captain Portal inline CSS/navigation nodes and original line endings are preserved. New CSS has phone stacking, 44-pixel controls and a bounded scrolling native modal.

Database verification also passed against the applied production functions using existing approved captain, two player, viewer, unlinked-login and anonymous roles. Synthetic sample records were enclosed in one transaction and rolled back. Checks include pending requests reserving nothing; captain-only decisions/handoff; competing approvals; bag/child reservations; blocked reserved-stock custody changes; return report versus confirmed receipt; missing-stock recovery; team announcements; private finder messages; idempotent message retries; batch bag custody; unchanged unrelated row counts; and photo read/upload/immutability boundaries. No sample inventory, loans, loss reports, messages, notifications or photos remain. All nine private tables have RLS, zero direct browser table grants, and the private bucket has the expected MIME and 5 MB constraints.

Post-migration advisors add only informational findings for this feature: nine intentionally policy-free private tables (default-deny plus zero grants, checked by real-role tests), eight foreign keys without covering indexes, and unused-index notices on the empty tables. No new security ERROR/WARN finding appears versus the baseline. The foreign-key index recommendations are future performance work; the exact approved migration was preserved. References: [RLS enabled / no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). Existing unrelated advisor findings remain unchanged.

The disposable-local fixture script [../tests/verify-equipment-db.sql](../tests/verify-equipment-db.sql) remains available, but no local PostgreSQL binary or Docker socket is usable here. The production rollback test exercised the real applied SQL instead. A rendered desktop/tablet/phone review, binary photo upload through the Storage HTTP API, and a real signed-in browser roundtrip remain unverified: Chromium cannot start in the current command sandbox (`setsockopt` / `shutdown` permission errors). Responsive CSS/controller/SQL tests do not claim to replace those visual/browser checks.

Frontend publication and the native Cloudflare production check succeeded. No Edge Function deployment was required. The connector cannot create a GitHub commit comment; the matching release summary is recorded in the chat and deployment notes.

The local reconstructed checkout does not include the existing lineup-export, referee-card or Strategy test files; those suites were not verified here. Their editor/export logic was not changed.

## Future multi-team app

Retain Equipment and especially **Lost & Found** for the future full app. Shared fields, tournaments and practices make recovery useful across teams. A future version needs team memberships/scopes on inventory, loans, reports, contacts and notifications. A venue/league board must require deliberate sharing and defined privacy rules. This release does not expose a cross-team board or claim to implement multi-team isolation.
