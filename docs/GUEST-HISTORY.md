# Guest history root fix — v58.30

Approved 2026-11-02 UTC. Database migration is applied and verified; Captain Portal v58.30 frontend deployment is in progress. Player Portal remains v58.28.

## Captain workflow

Roster → Guest / TEMP directory → Previous TEMP players shows one card per normalized saved name. Names group records for browsing; they never prove identity or merge players automatically.

Each player has one **Create profile & link history** or **Link history to profile** action. Review the person and selected saved games once, then confirm one atomic save. A failure rolls back both creation and all links; retries retain the exact request, new player identity and reviewed row revisions. Existing enabled guest or promoted profiles can receive reviewed history. Creating a different person with an already used full name requires explicit confirmation. Assigning a permanent jersey or promoting to regular roster remains a separate existing workflow.

Saved games are read-only history rows after review. The count uses distinct games, not raw TEMP rows, and never means confirmed attendance. Games attended continues to use explicit official Present attendance. Linking does not mark attendance or generate fees.

Removed inactive rows without persisted usage stay in a default-closed archive. They do not increase saved-game counts. A removed record retained by a saved lineup, official event, MOTM, Crowd event/report/vote, Strategy or bundle stays in normal saved history. A removed unused duplicate of a listed or already linked same-name game cannot be selected as an extra game. Archived standalone assignments require explicit selection and identity confirmation; linking preserves their inactive state. Multiple active/referenced identities in the same saved-name/game group block an automatic import and require manual identity review. Nothing is deleted or remapped to another TEMP UUID.

Lineups → Match Fill-ins now selects a reusable guest profile or explicitly creates one together with its first game assignment. Jersey inventory remains match-specific and optional. Re-adding a previously linked guest to the same game reactivates its canonical TEMP row. Old unlinked same-name/game records must be reviewed in Roster first. Regular players continue to use the regular roster and Match jersey numbers panel.

## Database contract and security

Exact approved migration: [GUEST-HISTORY-ROOT-FIX.sql](sql/GUEST-HISTORY-ROOT-FIX.sql).

SHA-256: `9dbc5cd1433a3e984d5dbcfa38ab6c46e3fb7c8536debffc068cfcd4225d80c1`.

- Private invoker `temp_entry_has_usage(uuid)` classifies retained references. It has an empty search path and no client EXECUTE grant. The current small legacy directory is scanned; a large historical dataset would warrant indexed reference extraction.
- Existing guarded `get_guest_console()` adds `history_version: 1` and legacy row active/revision/inventory/usage metadata. Other profile, ledger and participation shapes remain compatible. The new captain client requires this contract before writes; player-only API responses do not change.
- New `manage_guest_history(text,jsonb)` is captain-only, SECURITY DEFINER, empty search path, bounded payload/batch size and serialized with existing guest/dues advisory lock 682401. `import` validates exact selected TEMP IDs, match IDs and updated_at revisions, one assignment per game, confirmed identity and conflicts. `assign` deliberately reuses canonical profile/game links, preserves inventory unless explicitly changed and rejects regular-roster misuse. Stable outer operation receipts enforce exact same-actor retries.
- Existing `manage_guest_profile` guards legacy duplicate creation/binding; optional permanent-number promotion is preserved byte-for-byte outside the bind checks.
- A private invoker BEFORE INSERT trigger rejects direct authenticated/anonymous TEMP insertion. Existing explicitly guarded definer APIs can insert after captain verification. Existing row updates/RLS, private profile data, identity/history links and public scopes are preserved.

Applying the migration only adds/replaces functions and a trigger. It does not create/link/promote real players, delete TEMP records, change historical jerseys/lineups/events, mark attendance or alter paid records. A captain still reviews the person and selected history before linking.

## Validation and rollout

All 22 local suites pass, including the actual mounted history dialog/controller, one atomic create/link request, unique saved games, archive/reference classification, unchanged attendance, selection validation, lost-response exact retries, polling/disclosures, account/dialog/stale/viewer guards, Lineups profile assignment and existing keeper/referee/export/Strategy/AI/ledger contracts. Inline scripts and HTML IDs are checked by existing suites. Read-only live usage queries validate all reference tables/columns and classify ten raw unlinked rows into eight saved game assignments across five names plus two removed unused records. No private identities are embedded in public fixtures or documentation.

Post-approval test: [verify-guest-history-db.sql](../tests/verify-guest-history-db.sql). It runs synthetic fixtures under captain, noncaptain and anonymous roles and rolls everything back. It covers the direct-insert guard, stale multi-game atomic rollback, exact retries, preserved TEMP rows/jerseys/lineup references, unmarked attendance, canonical reactivation and duplicate protections. It and guest-profile, optional-number, post-match and match-record rollback regressions all pass. Physical inventory assignment, preservation, number-only mismatch rejection and explicit return to TBD are also verified. All five stored function bodies and role ACLs match the approved SQL; all 14 original application/ledger fingerprints match. No new security/performance advisor notices appeared.

Applied migration: `20261102001635 fix_guest_history_and_canonical_assignments`. The canonical SQL and versioned migration are byte-identical. No persistent fixture or real profile/link/attendance/ledger changes were retained. The live guarded captain console returns history_version 1 and renders eight saved assignments across five names plus two unused archived rows from ten raw legacy records. Browser visual review remains unavailable due to the previously established environment restriction; no browser launch was retried. Frontend deployment verification is in progress. Commit-comment creation is unavailable in the connected GitHub tool; the release summary will be recorded in release notes and chat.
