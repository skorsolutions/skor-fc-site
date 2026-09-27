# Referee Game Card

Build: **v56.2**

This document defines the Captain Portal referee-card workflow. The feature reproduces the supplied Roswell Recreation & Parks game-card layout as a separate export beside the lineup PNG/JPG actions.

## Captain workflow

1. Select a scheduled game in the Lineup Builder.
2. Load or prepare the lineup that should be used for the match.
3. Put every attending player either on the field or in **Substitutes**.
4. Select **Ref Game Card** beside the PNG/JPG export actions.
5. Review the automatically populated opponent, date, field, scheduled start time, coach, colors, and roster.
6. Correct an editable header field if needed.
7. Select **Print / Save PDF** or **Download Excel**.

The card uses the current board. The lineup does not have to be saved or published as Production / Final first.

## Player inclusion and ordering

- Include each player currently assigned to the starting field or the named Substitutes bench.
- Exclude the general player pool, attendance records by themselves, Potential Positions by themselves, and planned-substitution references by themselves.
- De-duplicate a player who is encountered more than once.
- Use `team_roster.full_name` for permanent players. Do not reuse the lineup's preferred/short display name.
- Use the complete `match_temp_players.display_name` value for a TEMP player.
- Sort permanent players by numeric jersey number.
- Place TEMP players after all permanent players, then sort the TEMP group by assigned jersey number and name.
- The official layout has 26 physical player rows. Populate only the selected match squad and leave every unused row blank for handwritten, last-minute additions.

## Match/header mapping

| Game-card field | Source |
| --- | --- |
| Team Name | Fixed as `SKOR FC` |
| Team Colors | Defaults to `White / Black / Maroon`; editable in preview |
| Coach | Defaults to `Edward Levin`; editable in preview |
| Opponent | The non-SKOR side of the selected `matches` row; editable in preview |
| Field | Selected match `location`; editable in preview |
| Date | Selected match `kickoff`, formatted in `America/New_York`; editable in preview |
| Scheduled Starting Time | Selected match `kickoff`, formatted in `America/New_York`; editable in preview |
| League | Preserves the supplied template's `Over 30 / Over 25` and `Over 50` labels |
| Player name | Full permanent-roster or full TEMP name |
| Jersey # | Permanent roster number or assigned TEMP inventory number |

Referee-owned fields remain blank: actual start time, team kicking off, weather/field condition, goals, cards, sportsmanship, remarks, winning team, final score, and officials.

## Validation

Printing and Excel download are blocked when:

- no scheduled game is selected;
- the opponent or game date is missing;
- the current field/bench squad is empty;
- more than 26 players are selected;
- a selected lineup identity no longer exists in the current roster/TEMP list;
- any selected player lacks a jersey number; or
- two selected players have the same jersey number.

A missing field or scheduled time produces a warning but remains printable because a captain can enter it in preview or write it by hand.

## Print/PDF behavior

- The browser opens a dedicated print view using US Letter, landscape, with 0.25-inch margins.
- The output is one page and retains all 26 player rows.
- The referee header is given enough vertical space to keep Weather/Field separate from Sportsmanship, and the roster type is sized for legible printing.
- Populated team, match, field, date, and scheduled-time values are centered horizontally and vertically within their underlined form fields. Player names remain left-aligned in the roster table.
- The print document title is `SKOR_FC_vs_<Opponent>_<YYYY-MM-DD>_Ref_Game_Card`, which becomes the suggested filename in browsers that use the document title for Save as PDF.
- The in-portal preview and print view use the same card-markup generator.
- The dialog controls remain usable on phones; the full paper preview scales to the available screen width.

## Excel behavior

- `assets/SKOR-Ref-Game-Card-Template.xlsx` is a sanitized derivative of the supplied organization workbook.
- The public template contains no historical player list or prior opponent.
- The browser inserts the current header and roster into the workbook at export time.
- Excel files may omit XML nodes for completely blank cells. The exporter skips missing cells that remain blank and creates any missing cell that needs a player value, inheriting the nearest same-column template style.
- The generated workbook sets the Template sheet print area to `A1:L36`, uses US Letter landscape, fits to one page, and hides the unused blank helper roster tab.
- The downloaded filename follows the same match-specific convention as the PDF/print document.
- JSZip runs in the browser to preserve the template's Excel styling while updating only the required cells and print metadata.

## Data and security boundaries

- This feature performs no Supabase write. It reads only match, lineup, permanent-roster, and match-specific TEMP data already loaded in the Captain Portal.
- Header corrections in the preview affect only that export. They do not edit the scheduled match or team roster.
- No roster data is embedded in the repository template. Current names and numbers exist only in the captain's authenticated browser and the file they deliberately generate.
- The referee card is not sent to AI, Crowd Game Day, public Matches, or the Captain Notebook.
- No SQL migration or Edge Function deployment is required.

## QA checklist

- Use a scheduled game with SKOR as both the home side and the away side in separate tests.
- Confirm only field plus Substitutes players appear.
- Confirm full names appear even when the lineup uses preferred names.
- Confirm permanent players sort by jersey and TEMP players appear last.
- Confirm all unused rows remain blank and row numbering runs 1–26.
- Confirm missing/duplicate jersey validation blocks both outputs.
- Confirm editable header changes appear in the preview, print view, and Excel file.
- Confirm the PDF/print result is one landscape Letter page.
- Open the `.xlsx` in Excel and confirm the print area, orientation, scaling, styles, and populated cells.
- Check desktop and representative phone widths.
