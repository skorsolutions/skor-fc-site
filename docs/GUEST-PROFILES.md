# Guest and event profiles — v58.25

Status: database deployed with explicit user approval on 2026-10-25. Exact SQL SHA-256 `297d620a73f7883087ebfd9f76310434717e7df7463b05231cec9ee537109ee7` is applied as `20261025000902 add_guest_profiles_and_participation_dues`. Captain/Player Portal v58.25 is deployed. Cloudflare build `72f15b5c-05dc-42a1-9db3-9186249197c9` succeeded for source commit [`28db5868872aa55a0ab8628bbcfe9e6d41f9da37`](https://github.com/skorsolutions/skor-fc-site/commit/28db5868872aa55a0ab8628bbcfe9e6d41f9da37); version `a39b4760-36a9-4ad5-8d0c-a2d3bc1b688f`, deployment `4c2d4660-9c5f-4acf-ac40-ac0811c4491c`, is verified at 100% production traffic. All 21 source blob hashes and the exact release file set match the checked source. Build completed at 2026-10-25 00:13:13 UTC.

## Captain workflow

1. Open Roster → Guest / event players. Create a reusable profile with full/preferred name, position and optional approved portal email. No permanent jersey is required. Review the directory first to avoid duplicate identities.
2. Add the profile to a tournament in Payments or its directory action. It counts in Run Numbers before claiming a login. Event creation also offers Create event-only guest. Event participants see published assigned games and reviewed Final / Production content regardless of payment status.
3. In Lineups → Match Fill-ins / TEMP Players, choose the reusable guest and assign this game's jersey. Leave it TBD while planning; the existing referee card requires a valid match number before printing. Each game can use a different jersey. Existing keeper/spare numbers and referee TEMP notes are preserved.
4. Link historical TEMP appearances only after reviewing the exact game and identity. Names/jerseys never merge records automatically. Existing lineup TEMP UUIDs remain unchanged; official events already keyed to those UUIDs follow the linked profile. Unidentified old events still require captain review in Game Day.
5. Confirm Present/Absent/Excused in Game Day's default-closed Match attendance section. Tagged event guests appear in the captain RSVP/attendance dashboard even before a jersey/TEMP assignment. RSVP is separate. Completed published games, confirmed attendance and official player-key events drive records. Guests see only assigned games; promotion retains exact historical aliases.
6. Promote a guest with Join regular season. Choose the season, first eligible date and available regular squad number, calculate/review dues and apply. The same profile, approved login, attendance, stats and receipts continue. Regular full-team portal access starts after promotion. New arrivals never inherit Fall 2026 opening paid status.

## Participation calculator

Payments → Participation & guest fees → Late-joiner / individual fee calculator.

`charge = fixed one-time part + round((full-season baseline − fixed part) × included games / total season games)`

The fixed part is included within the baseline. With a $300 baseline, $50 fixed part and six of ten games, dues are $200. Game counts are editable; linked published season games and first eligible date can suggest missed-game counts. This is based on joining eligibility, not later absences or account creation. Calendar comparisons use America/New_York. A stored season scenario can suggest the undiscounted full-player fee. Fall 2026 has no invented historical amounts; enter its baseline manually.

Preview shows current dues, proposed total, existing receipts, resulting balance and change in assigned season revenue. Applying appends an individual adjustment; it does not redistribute other players' fees. Individual members are excluded from subsequent shared-cost assignments and cannot be silently pulled into a split scenario. Optional consolidation reverses earlier guest fees while retaining charge history and receipts as season credits.

## Optional guest fees

Fees start **off**. Configure rate and effective date per season. Enabling proposals creates no charges. Each fee/waiver requires captain review, a linked completed published season match, confirmed Present attendance, the configured date window and an appearance before promotion's joining date. One original fee or waiver is allowed per player/game/season. Waivers and reversals require a reason. No historical charges are created automatically. Negative reversals remain in the audit trail.

Season totals show net guest charges, guest collections capped at each player's net guest charges, outstanding fees and waivers. Receipts are already part of the ledger totals; do not count them twice. Use guest collections in Run Numbers copies a planning contribution only. It neither moves money nor updates existing assigned dues. Partial/mixed external payments use the existing ledger. No payment processor is added.

## Identity, permissions and preservation

- Stable identity: `team_roster.id`, with `is_guest=true`, `active=false`, `portal_enabled=false`, nullable jersey. Regular rows retain the non-null jersey contract.
- Private `guest_profiles` stores approved email, one claimed auth identity and promotion date. `resolve_player_portal()` requires a verified account and approved identity; guests do not resolve through `current_player_id()`.
- Guest screen mounts its own scoped APIs and own dues only. It does not mount regular equipment, activity or whole-team chat controllers. Protected original APIs continue to deny guest accounts.
- Private exact `guest_match_links` connects one profile to one existing TEMP row per match. Shared lineups do not change identity keys. Promoted players with an alias are not offered twice on the same game sheet.
- New private tables have RLS and no direct client grants. Authenticated RPCs use explicit actor guards and empty search paths; internal helpers are revoked. Clients never provide an arbitrary player ID for own-portal reads.
- Individual charges use append-only `dues_extra_entries` and `dues_members.allocation_mode`. Existing assessments, receipts, opening paid memberships, regular profiles and publication gates are retained. No automatic guest creation, historical linking, fee enabling or proration is performed by this migration.
- Read/save controllers reject account changes, concurrent writes, stale revisions and late responses. Matching retry IDs prevent duplicate profile and financial actions. Failed reads keep a clearly stale snapshot; permission failures clear it.

## Verification and rollout

Run all package test scripts and HTML/static resource checks. `tests/verify-guest-profiles.mjs` executes proration boundaries, fee eligibility, totals and actual controller race/error/permission behavior. Existing suites cover keeper pairs, TEMP names, referee/gameplan exports, strategy reuse, notifications, equipment and original ledger behavior. `tests/verify-guest-profiles-db.sql` is an administrative **rollback-only** post-migration test: it exercises actual captain/guest/regular/anonymous RPC guards, identity claim, match aliases, proration, mixed receipts, fee review, promotion and opening-record protection. Fixtures never persist.

Before applying: record exact SQL SHA-256 and approval, production baseline counts/digests, then use the migration tool. Verify stored definitions, RLS/grants, rollback fixtures and unchanged 20 Fall opening paid records. Publish dependent source only afterward. Verify exact GitHub source hashes and Cloudflare build commit/version at 100% traffic. Browser visual and signed-in interaction checks remain unavailable in this environment; do not claim they passed.

Exact prepared SQL SHA-256: `297d620a73f7883087ebfd9f76310434717e7df7463b05231cec9ee537109ee7`. Pre-approval checks passed: 18 local suites, two read-only PostgreSQL portal SELECT planning checks and six actual balance-body fixtures. Migration, all 20 stored-body comparisons, RLS/ACL checks and three rollback-only real-role fixture suites passed. Five original data digests match; new guest tables remain empty. All 20 Fall opening paid records remain intact. Frontend deployment is verified at 100% production traffic. All 21 source hashes/exact release files match. Browser interaction remains unverified.
