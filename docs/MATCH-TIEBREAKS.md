# Match periods and shootouts — v58.39 (prepared, not deployed)

## Captain workflow

The clock has a full-width **Start game — 1st half** button, running/paused phase and inline status/error feedback. A failed request restores controls; overlapping requests and stale match/account replies cannot update another match.

Record after game continues to save a reviewed diff against official event IDs. After a confirmed save, **Add more goals or cards** explicitly reloads the latest official snapshot and revision before further edits. A delayed native close event cannot clear a newly reopened dialog. Another intentional save uses a new receipt; uncertain retries keep their receipt. The selected players and open periods remain useful across continuation.

For an already finished game, turn on **This match had overtime** in Record after game. Overtime 1st Half and Overtime 2nd Half have the same goal/assist/card entry controls, and save atomically with regulation events. Overtime goals count toward match goals and player stats. Historical event times are never fabricated.

Overtime & penalty shootout is a separate disclosure beside the captain clock. Save the competition settings before starting overtime: two **5-minute** halves by default, editable to 1–30 minutes each; golden goal can be enabled or disabled. Initial shootout kicks default to 5 per team, editable to 1–20. First team to kick is explicit. These settings and kicks are shared per match. Unopened sections do not create results.

Live progression: End regulation → Start overtime 1st half → Overtime halftime → Start overtime 2nd half → Start penalty shootout if tied. Pause/resume work during overtime. Golden goal keeps the referee authoritative: after the first overtime goal, confirm **Full Time** at the whistle. A second period cannot start after an unequal golden-goal score; normal overtime still allows the second half when a team is ahead. Entering completed history never requires starting a clock. Reopening a finished match for live play requires confirmation.

Each penalty is a scored/missed kick, with optional SKOR kicker. Teams alternate. The calculator detects an early clinch and requires a completed pair in sudden death. It rejects extra kicks after a winner. Remove the last kick or correct a result deliberately before saving. A separate confirmation marks a decided shootout complete and finalizes the match. It does not create a clock if none exists.

Shootout kicks never become match_events, goals, assists or player goal statistics. Existing public score privacy remains; the new detailed shootout/settings APIs are captain-only. Public Home/Match Center/Crowd show overtime/shootout clock phases without revealing scores. Existing player match/guest statistics continue counting official match_events, including overtime goals. No attendance is inferred.

## Database contract and review boundary

Proposed SQL: [MATCH-TIEBREAKS.sql](sql/MATCH-TIEBREAKS.sql). It expands half/clock/status check constraints, extends the four existing guarded event/clock APIs and existing stamping trigger while retaining signatures, authorization and historical timestamps, and adds two private RLS tables plus guarded get/save APIs for competition settings/kicks and append-only receipts. Private helpers have no browser execute grant. Requests lock session then match; version checks reject stale changes; exact retries recover previous successful receipts. All existing clock/public projection shapes and score grants remain.

No real match result, scorer, kick, attendance, lineup or historical time is seeded by the migration. Existing rows remain unchanged. The actual production schema/function bodies were read before drafting. No production migration has been applied. AGENTS.md requires explicit approval before any Supabase migration.

## Verification

- Existing controller suites plus verify-tiebreaks.mjs cover continued saving, overtime goal/card periods, goal/assist totals, configurable kicks, alternating first teams, early clinch and sudden-death pairs.
- browser-match-periods.mjs exercises native phone/desktop repeated goal taps, save → continue → second save with stable IDs, kickoff/error recovery and overtime controls using fictional APIs.
- Disposable PostgreSQL 17 replays the proposed migration and tests official overtime timestamps, golden-goal rules, configurable normal overtime, shootout isolation/finalization, exact retries, stale revisions and anonymous/player denials.
- These checks run on feature/match-periods before database deployment approval; production verification and live-role rollback checks must follow approval.
