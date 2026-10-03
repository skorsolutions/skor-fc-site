# SKOR FC Game Day Clock

Status: **v57.0 production**
Last updated: 2026-09-27

This document is the durable implementation and operating reference for the official match clock, event timestamps, Crowd display, and substitution reminders.

## Product rules

1. The captain/admin clock is official. Crowd users see it but cannot control it.
2. The clock continues when every browser is closed because running time is reconstructed from a Supabase timestamp, not stored only in `setInterval` or browser storage.
3. The referee controls the actual whistle. Reaching 40/45 or 80/90 minutes produces a warning; it never automatically starts halftime or ends the match.
4. A captain explicitly taps **Halftime**, which holds official match time at the regulation half length and starts a separate break timer.
5. A captain explicitly taps **Start 2nd Half**. Official time resumes from exactly 40:00 or 45:00.
6. New goals, cards, and referee/foul reviews capture the server-derived official time.
7. Crowd scoring keeps its consensus rules, but the time attached to a Crowd event comes from the official captain clock.
8. Historical events without a clock timestamp remain valid and are labeled as having no recorded time; the system does not invent historical minutes.
9. Public Home and Match Center show the same captain-authoritative clock anywhere the current match is presented.

## Clock states

| Phase | Official clock | Break clock | Allowed primary action | Match status |
| --- | --- | --- | --- | --- |
| `not_started` | Held at 00:00 | Hidden | Start 1st Half | `scheduled` |
| `first_half` running | Advances | Hidden | Pause or Halftime | `first_half` |
| `first_half` paused | Held | Hidden | Resume or Halftime | `first_half` |
| `halftime` | Held at 40:00/45:00 | Advances from 00:00 | Start 2nd Half | `halftime` |
| `second_half` running | Advances from 40:00/45:00 | Hidden | Pause or Full Time | `second_half` |
| `second_half` paused | Held | Hidden | Resume or Full Time | `second_half` |
| `full_time` | Held at the whistle time | Hidden | Reset | `final` |

Reset returns the official clock to 00:00 and the match to Scheduled. It does not delete or rewrite existing event timestamps.

## Persistence formula

`game_day_sessions` stores:

- `clock_elapsed_seconds`: official seconds accumulated at the last anchor;
- `clock_started_at`: server timestamp for the current running segment, or `NULL` while held;
- `clock_running`: whether the playable clock is advancing;
- `clock_phase_started_at`: when the current phase began, used for the halftime break display;
- `clock_phase`: the state listed above;
- `half_length_minutes`: 40 or 45;
- `sub_interval_minutes`: 10 or 15;
- `clock_updated_at` / `clock_updated_by`: last official control change.

While running, clients display:

`clock_elapsed_seconds + floor(now - clock_started_at)`

The database uses the same rule when stamping events. The database timestamp is authoritative even if a client display is briefly behind or a device clock is imperfect.

## Captain controls

All state transitions use the captain-only `control_match_clock(...)` RPC. It:

- requires an authenticated user who passes `is_skor_captain()`;
- creates an inactive `game_day_sessions` row when a clock is configured before Crowd Scoring opens;
- locks the session row during a transition so two captains cannot create a lost update;
- validates 40/45-minute halves and 10/15-minute substitution cadence;
- synchronizes `matches.status` and `matches.current_half` on phase changes;
- does not open or close Crowd access.

The Crowd `active` flag is intentionally separate. A captain may run the official clock without Crowd Scoring, or open Crowd Scoring before kickoff while the clock still waits at 00:00.

## Event timestamp contract

The three event surfaces store the same nullable fields:

| Table | Captures |
| --- | --- |
| `match_events` | Captain-entered goals, cards, SKOR fouls, and opponent fouls |
| `game_day_crowd_events` | First report that creates a Crowd consensus event |
| `game_day_ref_decisions` | First report that creates a referee/foul review |

Fields:

- `clock_period`: `first_half` or `second_half`;
- `clock_elapsed_seconds`: official absolute match seconds;
- `clock_recorded_at`: server wall-clock time when captured.

Captain events are stamped by the `trg_stamp_match_event_clock` insert trigger. The migration expands the captain event constraint with score-neutral `skor_foul` and `opponent_foul` types. Crowd events and referee reviews are stamped inside their existing protected RPCs. When the official clock is in a playable phase, the server also uses that phase as the event half. Confirming or voting on an existing Crowd item does not change its original time.

Editing a captain event preserves its original timestamp. Deleting an event deletes only that event; it does not affect the clock.

Captain Game Day does not allow a new live event to be saved until the official clock is in `first_half` or `second_half`. This protects the public event timeline from new untimed sideline entries. Existing historical events without timestamps remain valid, and edits keep their original timestamp.

## Public clock data contract

`get_public_match_clocks()` is a read-only `SECURITY DEFINER` RPC with an empty search path and explicit object qualification. It deliberately returns a minimal projection for published matches only:

- `match_id`;
- `clock_phase` and `clock_running`;
- `clock_elapsed_seconds` and `clock_started_at`;
- `half_length_minutes` and `clock_updated_at`.

Execute permission is revoked from `PUBLIC` and then granted explicitly to `anon` and `authenticated`, because both signed-out visitors and signed-in players can open public pages. The function exposes no session ID, Crowd `active` state, invite, participant, voting, referee-review, captain, or write fields.

The approved migration was applied as Supabase migration `20260927134927 expose_public_match_clock`. Direct anonymous execution succeeded, returned only the seven documented fields, and returned zero rows for unpublished matches. The Supabase security advisor intentionally flags this function because it is a public `SECURITY DEFINER` endpoint; its published-match filter and minimal read-only projection are the explicit public contract.

Production commit `8dbc56e4aa071f4580d5ae414c5c36c3ce7e6ab9` was verified on `skorfc.net` on 2026-09-27. Home, Match Center, and Captain Portal served their v57.0 build markers; the deployed `public-match-clock.js?v=57.0` exactly matched the repository asset; and an anonymous production RPC call returned only the approved seven-field projection. The sessions present during verification were already `full_time`, so the public clock correctly remained hidden.

Home and Match Center refresh the safe RPC projection every five seconds and calculate the visible time locally every second. Only `first_half`, `halftime`, and `second_half` are shown as a current public clock. v58.1 refreshes match status and timestamped non-goal events every 30 seconds; public scores and per-match goal feeds are omitted. The official clock projection stays public and unchanged.

## Substitution plan contract

Each saved substitution wave may contain:

```json
{
  "label": "Fresh legs",
  "unit": "midfield",
  "minute": 30,
  "out": ["player-key-1"],
  "in": ["player-key-2"]
}
```

- `unit` accepts `defense`, `midfield`, `strikers`, or `mixed`.
- `minute` is optional and is an absolute match minute.
- When `minute` is absent, first-half wave `n` targets `cadence × n`.
- When `minute` is absent, second-half wave `n` targets `half length + cadence × n`.
- The clock card shows **GET READY** at two minutes before the target and **SUB NOW** at/after the target.
- Visual/vibration reminders run while the Captain Game Day page is open. The match clock itself remains persistent while closed. Background push notifications are not part of v55.0.

The `unit` and `minute` properties live in the existing lineup JSON, so no lineup-table schema change is needed. They flow through shared saved variations, Production / Final, export rendering, Captain Game Day, and the Crowd Game Day lineup card.

## Security and permissions

- Only captain/super-admin accounts can call `control_match_clock(...)`.
- The function is `SECURITY DEFINER` with an empty search path and an explicit authenticated captain check.
- Execute permission is revoked from `PUBLIC` and `anon`; only `authenticated` receives execute permission.
- Crowd users receive read access only through the existing participant RLS policy on their joined `game_day_sessions` row.
- Event-reporting RPCs retain their participant check and now revoke anonymous execution.
- No service-role key or private credential is present in client code or documentation.

## Frontend surfaces

| Surface | Behavior |
| --- | --- |
| `admin.html` | Full clock controls, configuration, halftime break, warnings, substitution reminders, timestamped official event log, and prevention of new untimed live events |
| `gameday.html` | Read-only smooth official clock, break display, threshold notice, timestamped Crowd events/ref reviews |
| `index.html` | Read-only official clock on the featured current match and current-game schedule row |
| `matches.html` | Read-only official clock on the selected/current match plus stored official times on non-goal discipline events; v58.1 keeps scores/goals private |
| `public-match-clock.js` | Shared one-second clock reconstruction and phase rendering for public surfaces |
| Lineup builder/export | Wave group and optional exact match minute |

## Deployment order

Because the updated clients select new columns, production must be released in this order:

1. Obtain explicit approval for the migration.
2. Apply `supabase/migrations/20260926203049_add_persistent_match_clock.sql`.
3. Verify columns, constraints, function grants, trigger, a read query, and Supabase security/performance advisors.
4. Publish the updated static files and documentation to GitHub `main`.
5. Verify Cloudflare production on desktop and phone widths.
6. Post the matching release summary in chat and as a comment on the GitHub release commit.

### v55.0 release record

- User approval covered the database migration, publication to GitHub `main`, and production verification.
- `supabase/migrations/20260926203049_add_persistent_match_clock.sql` was applied successfully as Supabase migration `20260927001357 add_persistent_match_clock`.
- Schema verification confirmed all clock and event-timestamp columns, clock constraints, the `clock_updated_by` foreign-key index, the enabled `BEFORE INSERT` event-stamping trigger, and least-privilege function grants.
- Existing data was preserved: the post-migration validation found the existing Game Day sessions and match events intact. No historical event time was invented.
- Supabase security and performance advisors were rerun. The new clock/report functions have locked search paths and are not executable by `anon`; the existing unrelated project findings remain. The new foreign-key index is initially listed only as an expected unused-index informational notice.
- No Edge Function deployment was required.

## Operational checklist

- Choose the correct match.
- Select 40 or 45-minute halves before kickoff.
- Select a 10 or 15-minute sub cadence.
- Confirm the Production / Final lineup has the intended wave order, group, and any exact minute overrides.
- Tap **Start 1st Half** at the referee's whistle.
- Pause/resume only when official match time should be held.
- Tap **Halftime** at the whistle; use the displayed break clock.
- Tap **Start 2nd Half** at the restart.
- Tap **Full Time** at the final whistle.
- Open/close Crowd Scoring independently as needed.
