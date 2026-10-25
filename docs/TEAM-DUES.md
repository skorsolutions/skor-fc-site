# Team dues — v58.24

**v58.24 is deployed to the Captain and Player Portals.** The approved database migration, opening data, real-role checks, exact source file set and matching Cloudflare production traffic are verified. No payment processor, checkout or money transfer is integrated.

## Captain workflow

1. Payments opens the current season. The participant ledger shows assigned dues, recorded net receipts, remaining balance, payment-method totals and status. Current-season badges in Roster and the Dashboard owing count use the same balance snapshot.
2. Create a season or special event. A canonical, case-insensitively unique tag belongs to that group, e.g. an event name/year. Select roster participants, including unclaimed profiles, and optionally link scheduled games. A season can become the current season; special events do not replace it.
3. Expand Run Numbers. Enter league/event cost and itemized other fees, optional team contribution, participants and whole percentage discounts (with 30%/50% shortcuts for linked captains). Run Numbers verifies a proposed allocation with PostgreSQL. Save Scenario keeps an immutable, captain-private planning copy. Compare up to four saved scenarios side by side; load one as a fresh scenario to experiment.
4. Review & assign shows every old charge, proposed charge, adjustment and resulting balance. **Finalize & Assign Dues** is the only scenario action that assigns charges. It appends differences rather than replacing history. Group revisions reject stale scenarios/reviews; changed settings or participant selections require a fresh scenario. An applied scenario cannot be applied twice.
5. Add a confirmed external receipt for a participant. Each installment has its own amount, date, method (Venmo, Zelle, Cash App, Cash, Check), reference and captain note. Multiple methods are allowed. Retried unchanged receipts use the same UUID; changed retries cannot overwrite an existing entry. Overpayments become credit.
6. Corrections void entries with a reason, retaining their original amount/method/date/recorder. A refund is recorded only after it happens externally. Refunds cannot exceed net recorded receipts; related refunds must be voided before voiding a receipt that would make net receipts negative. Neither action transfers money.

The existing site styles are retained: light Captain Portal, dark Player Portal, maroon accents, wrapping controls and intentional horizontal scrolling for the accounting/comparison tables. Settings, saved scenarios, receipt history and audit history use default-closed disclosures. Roster refresh updates only the dues badge, preserving existing roster controls. Ledger refresh does not replace unsaved editor forms or collapse an open report section. Ledger snapshots refresh every 30 seconds while visible and on foreground/manual refresh. Errors show unavailable/stale state rather than invented zero balances.

## Allocation and accounting rules

- Currency is USD; all stored/calculated amounts use integer cents. Budget maximum is $1,000,000. Up to 30 cost lines and 200 distinct participants are accepted.
- Player weight is `100 − discount percentage`. Each proposed charge is `(budget − team contribution) × weight / total weights`.
- Start with each whole-cent floor. Distribute remaining cents by largest fractional remainder, with UUID order as a stable tie-breaker. Charges sum exactly to the amount participants must cover. All-zero shares require a zero participant-funded budget.
- JavaScript uses BigInt multiplication/division; PostgreSQL uses bigint. Server calculation is authoritative and ignores caller-supplied charge totals. The UI checks its preview against the server before saving.
- A $3,300 budget split among ten full shares and two half shares is ten × $300 and two × $150. At 30% off, exact-cent full shares are $289.47/$289.48 and discounted shares $202.63/$202.64 as dictated by stable rounding.
- A saved scenario has a base group revision and immutable plan/preview. Assignments append per-player deltas. Prior scenarios, assessments, receipts, voids and recorded actors remain available for audit.
- Balance is cumulative assigned cents minus nonvoid receipts plus nonvoid refunds. Status is Unpaid, Partial, Paid or Credit. Membership without an assessment is Not assigned, never assumed paid.
- Changing event membership alone changes access, retaining old charges/payments/history. Excluding someone during a reviewed new dues allocation explicitly sets their dues to zero and retains any receipts as credit. Refunds and transfers are never guessed. The review checkbox makes this consequence visible.
- Writes take one transaction-level team ledger advisory lock before row locks. This serializes financial mutations and avoids competing current-season/finalization/payment operations producing inconsistent totals. Read snapshots remain nonblocking. This is deliberately a single-team feature.

## Fall 2026 opening record

The user confirmed every current active permanent player is fully paid, with no historical amount/method entry and no retroactive discounts. The implementation uses a distinct opening settlement, not fabricated $0 receipts.

The one-time `initialize_fall_2026` API is guarded and was exercised with rollback-only fixtures. Production opening data was initialized administratively in one atomic CTE statement using the privately reviewed roster UUID snapshot and supplied payment instructions. It requires that exact list still matches the active roster, otherwise initialization fails for review. Current preflight snapshot has 20 active players. The production audit explicitly records administrative initialization approved by the user (reserved nil UUID, `actor_type=approved_administrative_initialization`), without attributing that administrative action to an unrelated captain login. It records the participant count, creates the current Fall 2026 group, and marks only those memberships Paid — confirmed by captain. No assessments or receipt rows are invented. New players are never automatically marked paid; claimed profiles resolve the existing roster identity.

The schema migration contains **no player identities or private payment contacts**. Initial contact instructions are supplied privately to the database after approval. Team defaults and group overrides are editable in Payments and visible only to the group's own linked player participants. Blank group overrides inherit current team instructions. No private contact information is committed to this public repository.

The opening group cannot be reassessed or receive invented historical receipts through the UI/API. Run Numbers belongs to a new season or event. Its opening settlement remains historical when another season becomes current.

## Player and event visibility

- My season & event dues displays the caller's own balance, receipt methods/dates, season-paid state and instructions. It has no caller-supplied player identity; the API resolves `current_player_id()` from approved profile access. Unclaimed profiles retain dues on `team_roster.id`, so later approved claiming shows the same balance without matching names or jersey numbers.
- Roster membership is not gated on payment balance. Active tagged participants see event information and linked **published** scheduled games. Their historical balance/history remain visible after removal; event-content access ends.
- Linked matches automatically show the existing Final / Production lineup projection, including the primary/spare keeper pair and keeper note. Draft variations are excluded. No lineup state or publication behavior is modified.
- Existing Strategy “Published for AI” is **not** a player-sharing permission. Payments has an explicit Ready for players review for a saved strategy based on a linked Final / Production lineup. The shared immutable projection allows only animation bundles, steps, ball, opponents, marker identities/numbers/keeper labels, drawings and labels. Captain coaching points, source snapshots, author/contact fields and AI context are excluded.
- Sharing is not automatic. The captain must review animation labels before explicitly sharing. Editing the source strategy hides the older share until it is reviewed/shared again; removing the Final flag or unpublishing the match also hides it. This preserves the user's Final / Production visibility gate without exposing existing captain-only strategy notes.
- Players can step through or play shared bundles and generate a bundle GIF locally with the already vendored gifenc encoder. This read-only viewer does not import captain Strategy tables/controllers or grant player writes. Existing Strategy reuse, editor exports and AI publication remain unchanged.
- Public/anonymous visitors and Captain Portal viewers do not receive ledger access. No payment contacts, ledger balances, new event-strategy content or individual payment details are added to public pages.

## Database/API boundary

Exact approved migration: [`sql/TEAM-DUES.sql`](sql/TEAM-DUES.sql), logical name `add_team_dues_ledger`. Exact prepared SQL SHA-256: `c0dc8289fb5e6b9c0826da65d9f617e603be9454ca6e79fab8730a7002c41245`. Applied as `20261024215244_add_team_dues_ledger.sql` on 2026-10-24, with all seven stored function bodies verified byte-for-byte against the approved SQL.

Private `skor_private` tables: `dues_settings`, `dues_groups`, `dues_members`, `dues_matches`, `dues_scenarios`, `dues_assessments`, `dues_payments`, `dues_voids`, `dues_strategy_shares`, `dues_audit`. Every table has RLS and no direct client grants. Private helpers and identity sequence execution/access are revoked from PUBLIC/anon/authenticated. The existing private schema remains inaccessible to client roles. Primary ledger/member/match reads have covering indexes. Advisors note one informational missing composite covering index for the event-share `(group_id,match_id)` foreign key; current share count is zero. This does not change access or correctness; no unapproved follow-up DDL was applied.

Authenticated API functions have empty search paths and explicit identity/role guards:

- `get_captain_dues()` — captain/super-admin team snapshot, including private audit/receipt metadata.
- `preview_team_dues(jsonb)` — captain-only pure plan validation and allocation; no writes.
- `manage_team_dues(text,jsonb)` — captain-only validated commands; no caller-supplied actor. No table deletion, payment processing or automatic external messages.
- `get_my_dues()` — approved self-only player snapshot, omitting captain notes, references and recorder/account IDs. Financial rows for other participants never appear. The narrow roster marker list supplies only existing public-style names, numbers, keys and positions for published lineup presentation.

The user explicitly approved database deployment after review of the exact migration, one-time private instruction/roster initialization, rollback-only verification fixtures and application publication. Existing match, roster, access, attendance, notification and Strategy records are not rewritten. No Edge Function deployment is required.

## Verification / release gate

Prepared tests: `npm run test:dues` exercises 800 randomized exact-cent allocations, order invariance, bounds, discount/contribution examples, currency validation, balance display, opening paid display without false amounts, keeper pairs, escaping, actual SVG/interpolation and real controller read/write/error/account-isolation paths. Related regression suites cover record, notifications, equipment, strategy reuse/animation, keepers, clock/alarm, referee/gameplan exports, score privacy, saved variations and personal ribbon order.

Read-only PostgreSQL preflight validates the actual captain/self snapshot and balance query bodies against typed empty CTEs, exercises the actual animation allowlist with planted private fields, and verifies weighted allocation and the actual balance helper with synthetic unpaid/partial/paid/credit/opening/unassigned, refund, void and adjustment cases. It creates no objects and edits no production rows. Supabase docs for privileged database functions were consulted; the changelog HTTP fetch is unavailable because the executor proxy cannot connect.

Approved migration `20261024215244 add_team_dues_ledger` is applied. All seven stored function bodies match the exact approved source. All ten tables have RLS with zero direct client table/sequence privileges. Actual captain, two linked-player, unlinked and anonymous role checks passed for private drafts, allocation, stale/repeated assignments, mixed partial receipts, idempotent retries, refunds, void history and retained adjustment credits. The transaction was rolled back; the same suite passed again against the committed opening state.

[`../tests/verify-team-dues-events-db.sql`](../tests/verify-team-dues-events-db.sql) passed with disposable new match/lineup/strategy fixtures, all rolled back: unpaid tagged participants see reviewed Final content, untagged players do not, planted captain points/source/contact fields are omitted, keeper spare metadata is preserved, stale strategy revisions/nonfinal/unpublished content is hidden, and removal preserves money/history while hiding event content.

Committed ledger state is exactly one Fall 2026 group, 20 paid memberships, one administrative initialization audit and the supplied private instructions. There are zero assessments, receipts, voids, scenarios, linked matches or shares. All 12 linked approved player profiles return the correct opening paid state, instructions, null historical amount and no fabricated receipts. Seven original source-table counts/digests (roster, access, matches, lineup variations, strategies, bundle library and captain allowlist) are unchanged. No named captain was impersonated to attribute the production seed. The connector returned two expired-request errors before the successful atomic initialization; readback proved no earlier writes or duplicate records.

Security advisors add no feature-related ERROR. Four intentional `authenticated_security_definer_function_executable` WARN findings identify the guarded public RPCs: each has an empty search path, explicit captain/self authorization, authenticated-only execute grants and tested player/unlinked/anonymous denial. Ten private-table INFO findings reflect the intended default-deny RLS/no direct grants model. Performance advisors add the informational event-share covering-index notice and expected unused-index notices on new tables. Existing unrelated findings remain unchanged. Release commit [`4eb3aadc58cd9cd154a68fc45a612f8f25638bbb`](https://github.com/skorsolutions/skor-fc-site/commit/4eb3aadc58cd9cd154a68fc45a612f8f25638bbb) contains exactly 18 checked files; all published blob hashes match. Cloudflare build `b5ba2d43-ad27-4bdd-a2eb-c9216657810d` succeeded for this exact commit; deployed version `721ec2dd-9b6b-42ba-8a4f-8f510ac75a06`, deployment `694d1073-85b0-414b-9954-bb86bbe0893d`, is verified at 100% production traffic.

Real PL/pgSQL/role/data verification, frontend publication and production traffic verification are complete. Rendered phone/desktop, actual signed-in browser saves and binary GIF download cannot be verified in this environment; Chromium cannot launch under the socket restrictions. Do not describe these as passed. GitHub commit-comment creation remains unavailable through connected tools; record the release summary in chat and deployment notes.


## Published release summary

Deployed **v58.24** to the Captain and Player Portals.

- Payments includes Run Numbers, discount comparisons, partial payments and event tags, synced with Roster and Player Portal balances.
- All 20 current Fall 2026 players show **paid**, without invented historical amounts or receipts.
- The approved database migration and real-role checks passed, along with 17 local test suites. Cloudflare production is verified at 100% traffic.

Open **Captain Portal → Payments**. Create a new season/event to use Run Numbers. Browser visual/GIF download checks remain unverified.

[Captain Portal](https://skorfc.net/admin.html) · [Release](https://github.com/skorsolutions/skor-fc-site/commit/4eb3aadc58cd9cd154a68fc45a612f8f25638bbb). Release notes are saved; the connector cannot post commit comments.

## v58.25 integration

Guest/event profiles and reviewed individual participation fees are described in [GUEST-PROFILES.md](GUEST-PROFILES.md). New guest fees default off. Individual balances use the same append-only ledger, receipts and own-portal projections; shared-cost scenarios exclude individual assessments. Original Fall 2026 paid memberships are protected. The exact extension SQL was approved and applied as `20261025000902 add_guest_profiles_and_participation_dues`; real-role rollback checks pass. Captain/Player Portal v58.25 is deployed and verified at 100% production traffic.
