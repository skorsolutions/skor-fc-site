# Game Day substitution alarm — v58.21

Status: implementation complete; deployment verification pending.

The alarm is an optional local tool in Captain Portal → Game Day, beside the official clock. Captains choose one phone to make the sound; other phones should leave it off. The settings disclosure starts closed. Preview sound checks device volume, and Start alarm on this phone explicitly unlocks browser audio. Active status, Stop alarm and the keep-phone-unlocked note stay visible even when settings are collapsed.

## Settings and schedule

| Setting | Choices / default |
| --- | --- |
| Interval | 10, 15 or 20 minutes / 15 |
| Ring | 3, 5 or 10 seconds / 5 |
| Automatic snooze | Off, 30, 60 or 120 seconds after ring ends / 60 |
| Repeats | Once or twice / once |
| Match-minute cutoff | 1–180 / 90 |
| Elapsed safety limit | 10–180 minutes from arming / 120 |

Intervals align to the official clock within each half: for 45-minute halves, a 15-minute alarm rings at 15, 30, 60 and 75; a 20-minute alarm rings at 20, 40, 65 and 85. Half-end boundaries are silent. A mid-half start schedules the next future boundary without replaying earlier windows. An alarm can be armed before kickoff; elapsed safety time includes that wait and halftime. The referee and official clock control match phases; this feature does not advance them.

Automatic snooze repeats only the specified number of times. A new regular interval replaces any old reminder chain; snooze never moves the regular cadence. Stop time is inclusive: no new sound at or after that match minute. Regulation half-end gates also silence sound even if the referee has not yet ended that half. The independent elapsed safety limit compares monotonic and wall time; a wall-clock adjustment cannot extend it indefinitely.

The audible alarm is independent of planned lineup waves. Those retain their existing server-backed 10/15-minute cadence and optional exact saved minutes. The existing selector is labeled Planned wave cadence to make this distinction clear; a 20-minute audible choice does not send an unsupported value to the official clock RPC or alter saved waves.

## Automatic silence and stops

- Pause/halftime stop current sound, discard snoozes and wait silently; resuming targets the next upcoming boundary.
- Full Time, Reset/restart, selected cutoff, elapsed safety deadline, match/account/role changes, leaving Game Day, hiding/locking/closing the page, or clock data older than 30 seconds stop the alarm. Reopening requires Start alarm again.
- Long timer gaps and delayed snoozes are skipped, never replayed in a burst. Browser sound errors stop the alarm with a restart message.
- Every oscillator has an audio-clock stop within the selected duration. All nodes are stopped/disconnected on cancellation. User-interface timer delays cannot leave a continuous oscillator running indefinitely.
- Settings are saved locally per authenticated account. Enabled state, deadlines and ring/snooze queues are never persisted. Logout/identity changes cancel pending audio unlocks and require a new explicit start.

A renewable five-second browser-storage lease limits alarms to one tab in that browser. It is not a cross-device captain election: designate one phone manually. The lease is checked before sounds and released on stop. Storage availability is required for arming; blocked storage or another active tab gives a retry message. No browser notification permission or service worker is installed.

## Phone behavior

The note beside the clock reads: **Keep this phone unlocked with Game Day open for substitution alarms to sound.**

An optional screen wake lock is requested once per armed session when supported, released on stop, and never required for the feature. The note remains applicable if wake lock is denied or the operating system overrides it. Preview does not start the alarm, change match data or mark notifications read. Sound uses the phone's existing volume/output; the webpage cannot guarantee audibility, silent-mode behavior or background execution.

Locked-phone/background alerts are planned for the future **Iskra Sports app**. This web release deliberately stops when Game Day is hidden and makes no background-delivery promise.

## Integration and validation

`substitution-alarm.js` exposes a pure timing engine, a finite Web Audio adapter, browser-storage tab lease and a DOM adapter. Existing successful Game Day clock snapshots feed it, so no additional backend reads/writes, migrations, permissions or Edge Functions are needed. Clock responses captured for a previously selected match are ignored. Existing clock actions, event timestamping, public/Crowd projections, saved waves/keepers/exports, inbox receipts and Player Portal disclosures retain their contracts.

`test:substitution-alarm` executes the real engine across interval/ring/snooze combinations, phases, boundaries, cutoffs, hard stops, stale snapshots, remote restart, timer gaps, auth/match/visibility changes and audio failures. It also executes the audio scheduler with a mock AudioContext to verify finite stops and cleanup, the real tab lease, and the DOM adapter for gesture activation, warning/Stop visibility, wake-lock denial, local settings and stop-during-unlock races. Existing persistent-clock/privacy/inbox/export checks verify surrounding integration.

Real phone audio, volume/output, rendered layout and OS lock/background behavior cannot be verified in this execution environment. Test Preview on the intended unlocked phone before relying on the alarm. Deployment source hashes and Cloudflare production result remain pending.
