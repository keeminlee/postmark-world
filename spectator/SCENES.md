# Scenes — one engine, one render, different grounds

> The founder's ruling, 2026-08-20, verbatim in substance: *"ONE ENGINE, ONE
> RENDER, DIFFERENT SCENES. ALL assets should look IDENTICAL to the main world.
> The ONLY unique thing to entered-state scenes should be the white placeholder
> image of the BACKGROUND, replaced when the entered mark has an image, overlaid
> with an SVG — treat the white bg exactly as we do the atlas svg bg of the main
> world. EVERY SINGLE PIECE OF CODE that is different between the main world
> render and the scene needs a JUSTIFICATION for that difference."*
>
> This file IS that justification list. If a render difference between the town
> and a room is not on it, the difference is a defect — replace it with the
> main-world primitive and say so here if a new one is ever earned.

## The model

The world is scenes all the way down. The main world is itself an entered state
on `the-town/let-there-be-light` (always-entered, ruled 2026-08-18) — the
biggest room in the game — and every mark with an inside is a smaller one.
`mountScene({ boxEl, svg, originPx, mPerPx, … })` is the ONE engine: it takes a
GROUND (an svg document) and a REGISTRATION (origin/scale turning world metres
into that svg's units) and mounts the entire painting machinery on it — layers,
overlay, walkers, hover, click precedence, choosers, walk desk, bubbles, camera.

- The town's ground is the atlas (`/atlas/town.html`), registration from the
  skeleton's `_grid`.
- A room's ground is `roomGround(mark)`: the **paper floor** — a full-bleed
  drafting sheet (warm paper, squared with a ruled grid at a round number of
  metres, the room's own boundary drawn as the wall — its POLYGON RING where the
  mark carries one, its at/extent box where it does not, because for a mark that
  is a rectangle the box IS the shape), the mark's own image over
  its footprint when it has one, and an (initially empty) svg art slot — the
  same base-raster-svg structure the atlas has, so the two grounds are the same
  shape all the way down. (The founder's word, revising his own earlier white.)

Entering swaps scenes the way a door works in Pokémon: the town's svg comes out
of the box whole (held aside, listeners alive), the room's ground mounts through
the same `mountScene`, and the module-level `mapCtx` pointer swap carries every
consumer with it. Exiting reverses the swap without a refetch. Lazy per-room
loading later needs nothing rewired: a scene's input is a plain ground +
contents, wherever they came from.

## The complete difference list

Every code-level difference between the town scene and a mark scene, each with
its justification. There are **eight**.

| # | Difference | Justification |
|---|---|---|
| 1 | **Ground source** — atlas fetch vs `roomGround()` (white / mark image / art slot) | The founder's ruling itself: the background is the ONE scene-unique element. Same layer slot, same structure, different src. |
| 2 | **Registration** — the skeleton grid vs a per-room frame (`ROOM_GROUND_UNITS` span) | Keeps the engine in the numeric regime the town tuned it for (zoomK ≈ 1, marker var ≈ 1). A shared frame forced rooms to zoomK 400–600 — past `MAX_ZOOM_IN`, where markers blow out and atlas text drowns the art. Same arithmetic, sane numbers; QA-asserted. |
| 3 | **`zoomOutLimit: 1`** — the wheel's zoom-OUT clamp is the whole room (the town keeps `MAX_ZOOM_OUT`); everything else on the camera — zoom-in, pan, the full `.wv-mapctl` rail (fit, follow, grid, footprints, conversations) — is the town's own, live | The revised camera ruling (founder, 2026-08-20 evening, superseding "a room refuses a camera"): a room HAS a camera, but its outermost state IS the whole room — dive into a corner, toggle the extent outlines, read the talk, and fit brings the floor back; you never drift past the walls into the void. |
| 4 | **`includeMine: false`** — the portfolio union (`state.mineIds`) stays out of the draw-set | The roof. Without it every mark the acting resident owns anywhere in town enters `glyphIds` and stays hit-testable from inside a room (2026-08-20 spike receipt). Refused at the source, not filtered later. |
| 5 | **The exit chrome** — `.wv-scene-exit`, bottom-left of the pane, every view mode | The way out must exist where the reader is. The telling's own exit collapses with the telling in painting-only — the DEFAULT mode — which is how the founder stood in a room with no visible door (the b6 diagnosis). Same `.wv-int-exit-btn` class: one click route, no drift. |
| 6 | **`placeholderExtents: true`** — the scene FURNISHING pass, under the pips, largest first: an art-clad mark hangs its shelf image framed over its extent (the bulletin's promise — the town needs no such pass because the atlas bakes art at sync; a room has no baker); an art-less mark draws its extent as a block in a deterministic per-mark colour at LOW saturation | The founder's word (2026-08-20, replacing always-on footprints): inside a room, furniture without its footprint is a dot pretending to be a table. Distinctness comes from hue, never transparency; the same mark is the same colour for every reader on every load. Drawn by the ONE overlay, gated by the scene; the town keeps its footprint toggle. |
| 7 | **At-rest refit letterboxes** — a contained scene sitting at its full view letterboxes on pane reshape (contains the ground, centred); once zoomed in, the town's keep-width refit takes over | The room-shown-whole guarantee at rest (scene-qa's pip at y=−183 is the receipt), without fighting the hand once a hand exists. One branch on the same `zoomOutLimit` signal as #3. |
| 8 | **`sceneWalkerSet`** — WHICH bodies the walk layer may draw, and nothing else about them: indoors, the room's own manifest (the crossing record's occupants, child rooms included); outdoors, the whole town, unchanged. How a body is drawn and where it stands are untouched — see the walker clause below | The founder's word (fix list 2026-08-29, reaffirmed 2026-08-31): *"resident activity OUTSIDE the interior is visible from interior view."* A room's ground carries its own registration (#2), so every walker in town projected onto it and anyone whose COORDINATES happened to fall inside the footprint was painted on the floor — 81 bodies offered, 2 of the 6 that landed being people the record puts in other rooms entirely. But standing on it is not being in it: coordinates answer `within`, a room is `insideOf`, and `standpointOccupancy`'s own header says the two "routinely disagree." The telling has enforced the crossing answer for its bodies since the room shipped; the floor was never asked the question, and a reader believes what they can see. Refused at the source like #4, so a body outside the room never becomes a glyph and cannot be hit, hovered or chosen either. |

Additionally, the **draw-set source** differs by construction, not by branch:
`drawOverlay` consumes whatever radial the telling hands it. Outdoors that is
the FOV radial from `openYourEyes`; indoors it is `investigate`'s containment
answer dressed in the radial's own grammar (`composeInterior`). One consumer,
two lawful askers — the same seam the telling itself has always had.

**Everything else is byte-identical because it is the same code path**: pips
(`overlayPipSVG` + `markerScale` + the one `--wv-mk` variable), hover snap and
the glance, click precedence (faces → chooser → wash → mark → open ground),
contested-click choosers, the walk desk and leg preview, stake sheets, say,
bubbles, highlight, footprint/grid toggles, walkers (positions from the same
poll — a body the walk ledger places stands there; the plaque, not the floor,
carries ledger-occupancy for the unplaced).

That walker clause stands unamended, and it is worth saying why, because it was
briefly mistaken for the licence behind #8 and it is not one. It answers *where a
body stands* and *who the plaque speaks for*, and both answers survive #8 intact:
a drawn body still stands exactly where the ledger puts it — including outside
the wall, which is why 8 bodies draw in the Protected Grove while only 4 land on
its floor — and an in-room body the ledger never placed is still the plaque's to
carry, not the floor's. **Which** bodies are eligible to be drawn at all is a
different question, one this list simply never asked; #8 is where it is asked now.

## What was deleted

The parallel interior renderer: `interiorSVG`, `interiorThingSVG`,
`interiorBodySVG`, `paperFloorSVG`, `interiorFraming`, `interiorPx`,
`interiorRuleM`, `interiorRecipe`, `labelPlacer`, the `.wv-interior-panel`
overlay and its CSS. A second way to express a mark is a permanent divergence
tax (one-question-one-owner); it is gone, not deprecated.

What survives of the old interior is *chrome and data*, not render: the plaque
(`interiorPlaqueHTML` — the room's own words in the telling), the contents
cards, `interiorFurniture` (the sorted containment answer), and `rimPointOf`
(where the camera lands on exit).

## Labels — resolved as "no difference"

The viewer draws **no labels in either scene**: the town's place-names are the
atlas's OWN baked text (art, not viewer), and names in both scenes ride hover,
bubbles, and cards — identical machinery. The old floor's `labelPlacer` names
were a viewer-side second label system; deleted with it. If room names ever get
baked into a room's ground art, that is ground authorship, the same way the
atlas does it. (Counter-scaling the atlas's own labels at deep zoom remains an
atlas-side unlock, noted in the `MAX_ZOOM_IN` comment — town art work, not
scene work.)

## The controls

- `tools/qa/town-fingerprint.mjs` — the town must not move: structural
  fingerprint (layer identity + paint order, camera, overlay shape, every pip's
  placement transform), clock-pinned, refuses verdicts across mismatched
  exposures. Green at this refactor.
- `tools/qa/scene-qa.mjs` — the room must work: mounts as a scene, white
  ground, roof holds, pips through the one overlay, exit bottom-left in the
  default mode, wheel inert, hover/select/bubble in both view modes, floor
  click arms the real walk desk, stacked exits walk out level by level, town
  remounts whole. 19 checks, green.
