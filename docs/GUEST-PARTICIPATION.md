# Guest participation records — v58.31

Approved 2026-11-02 UTC. Database migration is applied and verified; Captain Portal v58.31 is deployed. Player Portal remains v58.28.

The reported removed guest was absent from the actual Final/Production lineup but persisted on three old draft benches. The broad technical-reference helper correctly retained those saved plans, but incorrectly used their existence to keep a saved-game card. Profile availability and planning references must be separate from match participation.

## New rule

A guest/TEMP entry qualifies for match history only when at least one of these exists for that exact game and stable player identity:

- The **Final/Production** lineup selects the player in a formation field slot, valid freeform position or bench.
- A captain explicitly marks **Present** attendance.
- An official match event identifies the player or assister, or the captain selects the player as Man of the Match.

Creating a profile, assigning a TEMP name/jersey, keeping the TEMP active, or referencing a player only in old drafts, depth charts, planned waves, keeper metadata, Strategy/bundle snapshots, comments or Crowd votes does not qualify. These source records are preserved. Saved plans and event/jersey keys are never deleted or rewritten by this fix.

A Final selection creates a saved match selection, not proof that the person attended. **Games attended** and fee proposals continue to depend on explicit Present attendance; this change never writes attendance or charges. Present attendance and official personal stats remain authoritative when a historical lineup is incomplete or a TEMP has since been removed.

The directory shows eligible saved games and moves ineligible entries into a default-closed **Not selected / unused TEMP entries** section. They have no create/link-history action and cannot be selected as games in the history review form. Reusable profile creation remains available separately. Linking a profile is an identity operation and does not itself create participation. The import RPC rechecks eligibility at save time, including when the Final lineup changed after review without changing the TEMP row's timestamp.

Shared completed-match queries apply this rule to guests and their historical guest matches before promotion. Existing regular-roster behavior remains. Actual historical Final selections can be linked to a profile created later without manufacturing Present attendance. The private guest portal excludes unused completed games but preserves assigned upcoming/current match access for RSVP, approved lineups and feedback. Access scopes and publication rules remain.

Removing a TEMP, overwriting/updating/changing a Final lineup, or deleting a Final lineup immediately refreshes the guest directory from the authoritative backend. Removing an entry in an unsaved draft does not edit the saved Final lineup; the captain must update Final to change that published match squad.

## Exact database update

Exact approved SQL: [GUEST-PARTICIPATION-RECORDS.sql](sql/GUEST-PARTICIPATION-RECORDS.sql).

SHA-256: `e9a91a21621f655cc2a1ccf34d10795f6247c283e93e15f23c3325ef14f8bbe8`.

It adds three private invoker helpers with empty search paths and revoked client EXECUTE: exact lineup selection, exact match participation evidence and TEMP identity resolution. It replaces four existing guarded/shared functions: `get_guest_console`, `player_completed_matches`, `get_my_guest_portal` and `manage_guest_history`. The console adds `participation_version: 1` plus boolean `history_eligible` metadata while preserving `history_version: 1` and all other shapes. The new captain client requires the additive participation contract; the player client contract stays compatible.

The existing broad `temp_entry_has_usage` stays intact for identity/reference safety. Existing guest API authorization, retry receipts, regular-number/TBD promotion, ledger constraints, physical jersey behavior and RLS remain intact. The migration changes functions only: no rows, attendance, charges, profiles, links, saved plans or published flags are modified by application.

## Verification

All 22 local suites pass, including the actual Lineups removal handler refreshing a mounted directory immediately, active/inactive draft-only exclusions despite retained references, no history-import actions for unused records, eligible player grouping, exact retries and account/dialog/stale/viewer guards. Existing guest, optional-number, substitution, export/referee/keeper, Strategy/AI, post-match, match-record, dues and portal checks pass.

Read-only production queries confirm that the reported guest is absent from Final and has no official personal events or MOTM. The proposed exact selection/evidence expression compiles against all current TEMP entries and excludes that entry while leaving all source records untouched. No real identities are embedded in public fixtures or documentation.

Post-approval suite: [verify-guest-participation-db.sql](../tests/verify-guest-participation-db.sql). Its synthetic transaction rolls back and covers draft bench/depth/keeper false positives, exact formation/bench/freeform selections, profile creation without history, Final selection/removal, stale eligibility after review, atomic import rollback, private portal history versus upcoming access, confirmed attendance/clearing, official goal/assist/MOTM preservation, private helper ACLs and no automatic fees. The existing history rollback fixture now explicitly selects its historical participants in Final lineups. Both fixtures and guest-profile, optional-number, post-match and match-record regressions pass. Exact approved migration `20261102005325 fix_guest_participation_records` is applied (SHA-256 `e9a91a21621f655cc2a1ccf34d10795f6247c283e93e15f23c3325ef14f8bbe8`), with seven matching live function bodies and verified role ACLs. Six real-role rollback suites pass, including guest participation, atomic history import, guest portal/promotion/dues, optional numbers, post-match and match-record regressions. All 14 original application/ledger fingerprints match; no new advisor notices. Live captain readback excludes the reported draft-only guest and classifies ten unlinked entries as four eligible saved games across three names plus six unused entries. No real records were deleted or rewritten.

The exact approved migration is applied with a byte-identical versioned source. No application-data changes or persistent fixtures were retained. Cloudflare build `22ba046a-5965-4389-b571-d15ad3de340e` succeeded for source release [`cfaeda74b931a8b3f013feb90749ae33d3f60023`](https://github.com/skorsolutions/skor-fc-site/commit/cfaeda74b931a8b3f013feb90749ae33d3f60023); version `0e3b0769-851a-48d0-b2f0-c3dbe013a90e`, deployment `52888387-8340-41a9-b5e5-3e6553d76de2`, is verified at 100% production traffic. Build completed at 2026-11-02 00:56:22 UTC. All 17 source hashes and the exact release file set match checked source; build logs confirm the same deployed version. Player Portal remains v58.28, pregame version 16 and homepage v58.15. A documentation-only follow-up may produce another build with identical application code. Browser visual checks remain unavailable; no browser launch was retried. Commit-comment tooling remains unavailable.
