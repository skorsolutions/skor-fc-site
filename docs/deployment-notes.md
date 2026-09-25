## v53.2 — Optional depth chart and named export bench

- Adds an export-only option to include or omit **Potential Positions / Depth Chart** without changing the saved lineup.
- Adds an **Available Substitutes** section that lists the actual players currently assigned to the lineup bench, including jersey numbers and TEMP labels.
- Reflows the export dynamically so the bench, optional depth chart, planned waves, quote, and notes cannot overlap as their contents grow.
- Expands Planned Substitution rows when names wrap instead of allowing text to collide or hiding later waves.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v53.1 — 4-5-1 lineup formation

- Adds **4-5-1** to the Lineup Builder formation choices.
- Uses a back four, four midfielders across, one advanced central midfielder, and one striker.
- The formation is supported by the tactical board, Potential Positions depth chart, saved variations, exports, and the published Game Day lineup.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v53.0 — Jersey inventory and TEMP assignments

- Adds a dedicated **Jerseys** area to the Captain Portal for physical walk-on/TEMP kit inventory.
- Captains can manage configurable kits, starting with **Maroon** and **White**, including kit names, color labels, display colors, and archived status.
- Every physical jersey records its kit, number, size, availability, captain custodian, and optional condition/storage notes.
- Jersey choices in Lineup Builder now come only from active kits and inventory marked **On Hand**.
- One inventory jersey can be assigned to each TEMP player for a match; the physical jersey number automatically becomes the TEMP player's lineup and Game Day number.
- The same physical jersey—or another kit jersey with the same number—cannot be assigned to two active TEMP players in the same match.
- Existing TEMP players and historical manual jersey numbers remain compatible.
- View-only portal users can review inventory; only captains and super admins can add or change kits and jerseys.
- **SQL needed:** Yes.
- **Approved database changes:** Added `team_kits`, `jersey_inventory`, and nullable `match_temp_players.jersey_inventory_id`, with indexes, synchronization triggers, captain-only write policies, approved-portal read policies, and least-privilege grants.
- Affected assets: `admin.html`, `jerseys.css`, `jerseys.js`, and `supabase/migrations/20260923171652_add_jersey_inventory.sql`.

## v52.10 — Match-squad-only planned substitutions

- Planned-substitution choices now include only players currently assigned to the field or the **Substitutes** area.
- Moving a player onto the field or bench immediately makes that player available in every wave.
- Removing a player from both areas automatically removes stale selections for that player from first- and second-half waves.
- The existing **Absent** action now removes the player from the wave selections and, because the player is no longer in the match squad, from all wave choices.
- Clearing the field and substitutes keeps wave names but clears their player selections.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v52.6 — Captain-confirmed player nickname memory

- Notes and debriefs now run a player-name check when a captain saves them.
- Unfamiliar likely player names open a confirmation dialog where the captain can match the name to an active roster player or mark it as not a player.
- Confirmed mappings are shared captain memory, so later AI requests can understand nicknames consistently.
- Historical WhatsApp organization and Pregame Talk generation receive only active-player first/preferred names, jersey numbers, and captain-confirmed aliases.
- The name checker sends only the current saved text plus that limited identity guide to OpenAI with `store: false`.
- The authenticated `check-player-names` Edge Function requires JWT verification and confirms captain access inside the function.
- **SQL needed:** Yes.
- **Database changes performed:** Added `captain_player_name_aliases` with normalized unique aliases, optional remembered non-player terms, roster and confirmer foreign keys, indexes, captain-only RLS, and least-privilege grants. No existing roster, notes, comments, or debriefs were changed.
- Updated assets: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, `generate-pregame-talk`, `organize-whatsapp-note`, the new `check-player-names` function, and the alias migration.

## v52.5 — Useful player identity in AI context

- Captain-selected player comments now include the player's jersey number and first/preferred name in the protected AI context.
- Full names, email addresses, and other roster contact information remain excluded.
- Team-visible input may support constructive player-specific coaching when relevant.
- Private-to-captains input retains its protection: the generated team talk must not identify or imply who authored it.
- **SQL needed:** No.
- **Database changes performed:** None. Persistent nickname matching remains pending separate database approval.
- Updated assets: `admin.html` and `generate-pregame-talk`.

## v52.4 — Game context for selected player comments

- Every team or private player comment selected with **Use with AI** now shows its related matchup and game date in the Captain Notebook.
- The protected AI payload includes a structured `related_game` object with the match ID, kickoff date, home team, and away team for each selected comment.
- The AI is explicitly instructed to keep each player suggestion tied to that historical game and not confuse it with the upcoming target match.
- Player names and jersey numbers remain excluded from the AI payload.
- **SQL needed:** No.
- **Database changes performed:** None.
- Updated assets: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, and `generate-pregame-talk`.

## v52.3 — Captain dropdown and player-input AI controls

- Replaces the unreliable captain-name datalist with a true dropdown populated from the active captain and super-admin list.
- The new get_notebook_captain_directory() RPC exposes display names only, requires an authenticated approved captain, and does not expose captain emails or roles.
- Adds **Use with AI** to team-visible and private-to-captains player comments in Game Day.
- Player comments are included only when a captain selects them, remain selected only for the current browser session, and are re-fetched server-side before AI use.
- The AI receives those entries explicitly as player input—not captain conclusions—without the player's name or jersey number.
- Private player comments are generalized so the generated talk cannot reveal the author or that the source was private.
- **SQL needed:** Yes.
- **Database changes performed:** Added one restricted, names-only captain-directory RPC. No tables, existing notes, player comments, or other data were changed.
- Updated assets: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, and `generate-pregame-talk`.

## v52.2 — Historical WhatsApp note imports

- Adds an **Import WhatsApp Note** workflow to the Captain Notebook for older game discussions.
- Records the original captain name and original message date/time separately from the authenticated user who performs the import.
- Requires every WhatsApp import to be attached to a game and clearly labels imported entries in the Notebook feed.
- Adds a WhatsApp-only feed filter plus visible **WhatsApp** and **AI organized** labels.
- Captain names are suggested from existing Notebook and debrief history while still allowing an older or unlisted captain name.
- The optional **Organize with AI** action runs only after an authorized captain deliberately presses the button. It sends only the selected pasted text to OpenAI, uses `store: false`, and is instructed to preserve the captain's meaning without inventing tactical claims.
- The authenticated `organize-whatsapp-note` Supabase Edge Function requires JWT verification and checks `is_skor_captain()` again inside the function.
- **SQL needed:** Yes.
- **Database changes performed:** Added `source`, `attributed_captain_name`, `source_occurred_at`, and `ai_organized` to `captain_notebook_entries`, with constraints requiring game, captain, and timestamp attribution for WhatsApp imports. Existing notes were preserved and default to `source = 'manual'`.
- Affected files: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, `supabase/functions/organize-whatsapp-note/index.ts`, `supabase/migrations/20260920124706_add_whatsapp_notebook_attribution.sql`, and this deployment note.

## v52.1 — AI Pregame Talk and improved debriefs

- Adds an editable **Pregame Talk** generator to the Captain Notebook for a selected upcoming match, with tone, length, formation context, and captain-priority controls.
- Grounds suggestions in completed captain-shared debriefs, selected-game attendance/availability, the current generator inputs, and general soccer strategy.
- Private Notebook notes, debrief drafts, RSVP notes, and individual player assessments are not sent to OpenAI.
- AI requests run through the authenticated `generate-pregame-talk` Supabase Edge Function. The OpenAI key remains server-side, JWT verification is enabled, captain access is checked again inside the function, and model output uses a strict JSON schema.
- Generated talks remain editable and can be copied, printed, or saved into the existing Captain Notebook.
- Adds the debrief question **What improved from the previous match, and what caused it?**
- **SQL needed:** Yes.
- **Database changes performed:** Added the nullable `captain_match_debriefs.improvements_since_last_game` text column with a 3,000-character check constraint. No existing debrief rows were changed or backfilled.
- Affected files: `admin.html`, `captain-notebook.css`, `captain-notebook.js`, `supabase/functions/generate-pregame-talk/index.ts`, `supabase/migrations/20260920050804_add_debrief_improvements_since_last_game.sql`, and this deployment note.

## v52.0 — Captain Notebook

- Adds an isolated **Captain Notebook** view to the Captain Portal without rewriting the existing Lineups, Game Day, Announcements, Roster, or Player Portal engines.
- Captains can record private or captain-shared notes and associate them with a match, player, and coaching category.
- Adds guided post-game debriefs covering overall performance, standout players, tactical observations, issues, position changes, and practice priorities.
- Adds a Captain Dashboard prompt for the newest past/final match that the signed-in captain has not completed a debrief for; private drafts can be resumed directly.
- Adds structured player-by-player observations with quick coaching tags and optional written detail. Confirmed match attendees are shown first when attendance is available.
- Each captain drafts independently. Drafts remain private to their author; completed reviews become readable by other approved captains.
- The portal detects a missing Notebook schema and shows a safe setup-pending state instead of affecting other live portal features.
- New isolated assets: `captain-notebook.css` and `captain-notebook.js`.
- SQL applied: `create_captain_notebook` plus `tighten_captain_notebook_grants`. The three new tables use RLS, author ownership checks, captain-only sharing, and least-privilege authenticated grants.

## v51.40 — Create announcements from scheduled games

- Each scheduled game now includes a **Create Announcement** action.
- The action opens the existing announcement editor and prefills the match type, current publish date, matchup, kickoff, arrival time, location, home/away status, and the reminder to bring both kits.
- The message ends with an **Additional notes** area and remains fully editable before publication.
- Creating the draft does not publish anything; the captain must still review it and press **Publish Announcement**.
- The scheduled match's saved arrival time is used when available, with the existing 45-minute fallback otherwise.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v51.39 — Reorder substitution waves

- Every first-half and second-half substitution wave now has **↑ Up** and **↓ Down** controls.
- Captains can add a new wave at the end and move it between existing waves.
- Reordering stays within the selected half and immediately renumbers all waves.
- The **Bench after this wave** calculations and lineup export order update immediately after a move.
- First and last waves disable unavailable move directions.
- Existing saved lineup data remains compatible because waves were already stored as ordered arrays.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v51.38 — Show every substitution wave on export

- The lineup image export no longer limits each half to four substitution waves.
- Every first-half wave is rendered in full; every second-half wave is also rendered when second-half export visibility is enabled.
- The substitutions card and total image height now grow dynamically so additional waves do not overlap the quote or gameplan notes.
- The previous `+ N more ... planned` summary is removed.
- The existing second-half export visibility toggle is preserved.
- **SQL needed:** No.
- **Database changes performed:** None.
- Affected file: `admin.html`.

## v51.37 — Overwrite same-name lineup variations

- Saving a lineup now updates the newest existing variation when the selected game and trimmed lineup name match.
- Name matching is case-insensitive, so `Balanced` and `balanced` are treated as the same lineup within one game.
- The same lineup name can still exist independently under different games.
- The rule applies to both **Save Variation** and **Copy Current to Game**.
- Existing historical duplicate rows are preserved; this change prevents new duplicates during normal captain saves.
- No Supabase schema, policy, or direct data changes were made.
- Affected file: `admin.html`.

## v51.36 — Bench tracker beneath substitution waves

- Each planned substitution wave now shows a compact **Bench after this wave** panel directly beneath it.
- The bench is calculated cumulatively: players entering are removed from the bench, players leaving are added, and each later wave starts from the prior wave's result.
- Second-half wave calculations continue from the completed first-half plan.
- Bench chips include the same player labels and jersey numbers used elsewhere in the lineup builder.
- This is a lineup-planning UI change only; no Supabase schema or saved-state changes are required.
- Affected file: `admin.html`.

## v51.35 — Restore Potential Positions in saved lineups

- The Potential Positions panel now redraws immediately after a player is assigned or moved on the formation board.
- Existing saved lineups with empty Potential Positions are automatically backfilled from their named field-slot assignments when loaded.
- Backfill merges with manually entered Potential Positions and prevents duplicate player entries.
- Freeform lineups remain unchanged because they do not have named formation slots to infer.
- Affected file: `admin.html`.

## v51.34 — Auto-fill Potential Positions

- Assigning a player to a named formation slot now immediately adds that player to the matching row in **Potential Positions**.
- Automatic additions are deduplicated. Reassigning a player to the same slot does not create duplicate entries.
- Moving a player to another field position adds the new potential position without removing previously recorded positions.
- Occupied field slots retain their tactical label (for example, `LB`, `CAM`, or `ST`) so the position remains visible beside the player.
- Freeform placement is unchanged because the custom board does not use named formation slots.
- Affected file: `admin.html`.
