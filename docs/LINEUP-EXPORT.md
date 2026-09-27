# SKOR FC Lineup Export

Status: **v55.2 production renderer contract**

This is the durable reference for the lineup picture shown in **Shareable Gameplan Export** and downloaded as PNG or JPG. Read it before changing pitch geometry, player markers, formation mapping, export height, or content beneath the pitch.

## Product intent

The exported lineup picture must look like the Lineup Builder rather than a separate diagram style. A captain should recognize the same field orientation, formation shape, shirts, role labels, and player identities in the editor, preview, and downloaded image.

## Canonical visual rules

1. The field is vertical and shows the tactical area from the opponent's 18-yard line through SKOR's own goal line. The visible width-to-length ratio is `68:88.5`.
2. The field uses alternating horizontal green stripes.
3. The opponent goal, goal area, and penalty area are outside the crop and are not drawn. The halfway line, center circle, SKOR penalty area, and SKOR six-yard box keep their real locations within the cropped field.
4. On-field players are maroon jersey/shirt silhouettes with a dark collar and white outline.
5. The saved jersey number appears inside the shirt. TEMP is used when a fill-in has no assigned number.
6. Standard formations show the saved role above the shirt.
7. Names appear below the shirt when the lineup is in **Names + Numbers** mode. **Numbers Only** hides the names without changing positions.
8. The selected captain receives a small `C` badge on the shirt.
9. Circular markers may still be used in compact bench/list chips, but never as the on-field lineup player design.

## Geometry and coordinate contract

The source of truth remains the lineup state in `admin.html`.

- Standard formations use the exact canonical percentage coordinates defined in the `formations` map.
- Freeform / Custom uses its saved player percentages.
- Horizontal export coordinates remain bounded to the supported interactive field range of `5–95%`.
- The canonical vertical coordinate is based on the full 105-metre pitch. The renderer removes the first 16.5 metres, remaps the remaining 88.5 metres into the export, and bounds the visible result to `6–94%`.
- The goalkeeper receives a small export-only downward adjustment, capped at `93%`, so the larger goalkeeper and center-back labels do not collide. Saved lineup coordinates are not changed.
- The exporter must not calculate a new minimum/maximum from occupied players and expand that smaller area across the field. Doing so changes the tactical meaning and makes formations look different from the editor.
- The v55.2 export canvas stays 1,080 pixels wide. The cropped pitch is 800 pixels wide and derives its height as `round(800 × 88.5 ÷ 68)`.
- On-field jersey silhouettes are `100 × 88` export pixels. Numbers, role labels, names, TEMP labels, and the captain badge scale with the larger jersey design.
- The starting-lineup card and all following cards derive their vertical positions from the computed pitch height. Do not return to fixed offsets that assume a landscape pitch.

## Shared rendering pipeline

`buildGameplanSvg()` is the one renderer for both outputs:

1. `renderGameplanPreview()` places its SVG directly in the Captain Portal preview.
2. `exportGameplanAs(format)` renders the same SVG into a canvas.
3. PNG preserves transparency outside the designed card; JPG receives a white canvas background.
4. The filename continues to use the selected event and lineup variation name.

The preview and downloaded file must never use separate field or player renderers.

## Content below the field

The v55.2 pitch crop and larger jerseys do not change the data or rules for:

- the named substitute bench;
- optional Potential Positions / Depth Chart;
- all enabled first-half and second-half substitution waves;
- wave group and exact/automatic timing labels;
- captain selection;
- inspirational quote;
- Gameplan notes;
- dynamic height and wrapped content.

The bench begins after the calculated starting-lineup card height. Lower cards continue to grow from their content so a taller pitch cannot overlap the bench, substitutions, quote, or notes.

## Persistence and integrations

- No additional export state is stored.
- No lineup JSON shape changes.
- Saved variations and Production / Final records remain compatible.
- Crowd Game Day and public Matches keep their existing full-pitch lineup renderers. The opponent-18 crop is specific to the Captain's shareable Gameplan picture.
- Strategy exports remain a separate tactical-scene format and are not changed by this renderer.
- No SQL, Supabase migration, RLS change, Edge Function, or AI-context change is required.

## Responsive behavior

The export image itself has a stable 1,080-pixel width for reliable sharing. The Captain Portal preview scales that SVG to the available panel width with `height: auto`, so desktop and phone show the same composition without changing export geometry.

## Verification checklist

- Run `npm run test:lineup-export`.
- Run `npm run test:clock` to ensure the previous integrated build still parses and passes.
- Confirm every inline script in `admin.html` parses.
- Render at least one formation with eleven starters; `3-2-3-2` is useful because it exercises narrow central spacing and two forwards.
- Check the `68:88.5` cropped-pitch ratio, absence of the opponent goal/boxes, adjusted halfway line, stripes, own penalty-area lines, shirts, numbers, roles, names, captain badge, and field-edge clipping.
- Check Numbers Only and a TEMP player when those behaviors change.
- Check a populated bench and enough substitution/Potential Position content to force export-height growth when layout code changes.
- Confirm preview and PNG/JPG paths both call `buildGameplanSvg()`.
