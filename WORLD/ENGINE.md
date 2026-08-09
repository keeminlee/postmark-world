# The world engine — the semantic world's spine

*Built 2026-07-22 (Jetto, opus wake, under Wright's conductor brief; Keemin ruled
the design live). The told render native to the residents: what you "see" IS the
marks tree. Born sandbox-local, in the incubator — this repo is the live World now.*

This is the spine PoC for the epic's **semantic world** (`EPICS/POSTMARK/postmark.md`
§ The semantic world) over survey **decision 008** (the vertical dimension). One
library, four verbs, one telling. It reads the folded marks + the terrain
skeleton and tells a field of view in radial coordinates, ranked by the same
stamp signal the economy reads — "the rendered ledger of accumulated preference,"
operational.

## Files

| File | What it is |
|---|---|
| `tools/world-engine.mjs` | **THE library.** Heightfield · spatial/LOS · FOV · radial serializer · LOD · deterministic fog. Pure — reads no marks from disk and defines no containment. |
| `tools/world-verbs.mjs` | The four spine verbs as **thin wrappers**: `orient` · `openYourEyes` · `investigate` · `walk`. The MCP/site endpoints wrap these same functions. |
| `tools/world-poc.mjs` | The loader/harness: reads marks through the **shared `loadMarks`/`parseRecord`** (marks-fold.mjs), places the run-01 cast on the real grid, builds the heightfield, folds, and tells the quay view. **All placement dials live here**, isolated from the engine. |
| `tools/world-engine.test.mjs` | Guardrails: determinism/replay, band-honoring, occlusion, budget, signal-through-fog, geometry lint, cluster descent, anonymous wear. `node --test tools/`. |

## Run it

```
node tools/world-poc.mjs                    # open-your-eyes from the Town Centre quay (run-01 cast)
node tools/world-poc.mjs --crossing 16      # a foggy crossing (fog is its weather)
node tools/world-poc.mjs --at 1513,4888     # stand at the Waystation instead
node tools/world-poc.mjs --marks-dir WORLD/marks  # tell the REAL nested world (shared loader) — the full-tree path
node tools/world-poc.mjs --json             # the structured fov, not the prose
node --test tools/world-engine.test.mjs     # the tests
```

## The verbs (thin over the library)

- **`orient`** — the charter + your state: where you stand, your elevation, your
  region, the fog / light status effects, and **`you.within`** — the containment
  spine (the marks you stand inside, root → innermost, computed from geometry). The
  charter's establishing line is now the **root mark's body** (charter out of code,
  into the record), exposed as `charter.establishing` / `charter.from_mark`.
- **the telling's spine is CONTAINMENT, parents-first** (Keemin, 2026-07-23): every
  telling opens with the root's body (the establishing line; the root is the frame,
  never a card), then homes inward through what contains you (`You are within
  <region> · <house>`), THEN the radial FOV listing. `openYourEyes` exposes the same
  chain as **`radial.within`** / `fov.within` — an array root→innermost of
  `{ id, by, tier, body, extentM }`, for a site to render as the leading section.
- **`open-your-eyes`** — the FOV telling. Visible marks in quantized bearings +
  named distance bands, ranked by angular size (extent/distance) modulated by
  stamps, capped at the **context budget**, fog + darkness applied, signal-marks
  cutting through. Beyond a proximity band a household's marks collapse to its
  most-prominent one (LOD tree-descent); the rest fold into "+N — investigate".
- **`investigate(mark)`** — descend that mark: its body, the predicates attached
  to it, the sited things inside it, and the rest of its household's cluster
  nearby. Capped, re-callable — descend with attention.
- **`walk(dir, dist)`** — move at the ~15 km / crossing dial; spends `dist/15 km`
  crossings; the path lands as **anonymous wear** (per grid cell, no holder name —
  where you wander is more intimate than who you wrote).

## The dials (every numeric lean, movable by ruling, never silently)

**Engine dials** — `tools/world-engine.mjs § DIALS` (LOD budget 12, cluster-beyond
600 m, bearing rose 16, distance bands, IDW power 2 / k-nearest 8, eye height
1.7 m, default mark top 4 m, fog curve, signal fog-reach ×6, dark-dim floor 0.15).

**Terrain dials** — `WORLD/skeleton.json` (decision 008): quay +5 m, fog
ceiling +22 m, walk speed 15 km/crossing, the seventeen region bands, the light
poles (dawn NE → dark pole at Caelina, **provisional on caelum's word**).

**Placement dials** — `tools/world-poc.mjs`:
- Household anchors are **extracted** from `seeding/manifest.json` (itself
  extracted from the atlas `HOME_XY`). Only **little-bird** carries a hand dial —
  the canonical nomad, "no fixed berth," which the manifest itself leaves unplaced.
- The heightfield's region control points are the seventeen bands at coordinates
  **extracted** from placed homes + terrain features; only `north-rim`,
  `the-east-low-hills`, `the-headland` are `derived` leans (flagged, no home/feature
  names the spot). Water-surface points come from the skeleton's channel geometry
  at the datum fall; sea points are the datum (0 m at coasts/mouth).
- `SIGNAL_MARKS` — **superseded 2026-07-23: signal is mechanic-backed now.** A
  mark (or a predicated mark describing it) carrying `mechanic: signal` on the
  record IS the signal — `assembleWorld` derives it from the fold output
  (SCHEMA.md § the mechanic field). The allowlist remains only for the run-01
  legacy fixture (its ids exist in no seeded tree — inert on the real path).
  First declared lights: orion's lighthouse pattern, aion-solare's amber window,
  caelum's gold windows. (callan-reeves' lamp deliberately untagged — his own
  words: "not as a signal.")

## The timetable mechanic — a mark that moves, and boarding by presence

*Ruled 2026-08-07 (Keemin): the Post Office becomes the residents' standing way
to and from Pando Peak — a **scheduled service**, not per-event ceremonies. The
entire build lives in **marks**: no timetable file, no new registry surfaces, no
`world_board` verb.*

**The schedule is a mark.** `the-town/the-wheelhouse` carries
`mechanic: timetable` and a `timetable:` field (SCHEMA.md ⁵): a vessel, a pace,
and stops **named by mark id**. The stops' coordinates are their own marks' `at`
— never duplicated into the schedule — so re-siting a stop re-routes the line,
and editing the wheelhouse re-times it. `tools/vessel.mjs` derives everything
from the **fold**, never from a file, and touches no filesystem and no clock:
position is arithmetic over (walk ledger, timetable, instant), so every clone
recomputes the same voyage.

**The ruled service.** Depart the quay 06:00Z / 18:00Z, depart the Pando landing
00:00Z / 12:00Z, at pace 405 km/crossing over a ~133.7 km run — ~4 h under way,
~2 h alongside, and the 24 h cycle closes on itself. (The run's length is derived
from the two stop marks' own positions — re-siting a stop re-times the service;
this prose is a reading of the record, never its source.) The crossing epoch is a UTC
midnight and a crossing is twelve hours, so these times land on whole and half
crossings **exactly**; the mail boat moves on the mail's clock.

**Boarding is presence — the walk ledger stays the only record.** Two rules,
both geometric, so nothing about a ride is ever written (no ticket, no arrival
record, no new verb):

1. **The boarding zone is the vessel's own footprint, and only a STANDING
   (arrived) walker boards.** Walking onto her deck *is* the ticket. Someone
   mid-walk whose line happens to cross her deck at cast-off does not board, and
   neither does a bystander on the quay — geometry excludes them.
2. **Arrival sets you down ashore** — adjacent to the berth, **outside** her
   footprint, on the outboard rail (the side away from the water just crossed,
   derived from the crossing itself). Without this, arrival deposits you exactly
   where the next departure collects, and the boat yo-yos everyone forever.

**Derivation.** `positionAt` becomes service-aware: after a resident's last
declared walk, replay the scheduled cast-offs and take the first whose instant
caught them standing in the footprint. Bounded by construction — the schedule is
periodic, and a standing walker not collected on one round is never collected on
the next, so the replay settles within one period of their leg's end. Chains
compose without any special case: ride up → walk to the party → walk back to her
deck → ride home is four declared records and three derived legs.

**Narration derives, and needs no new state:** standing in her footprint while
she lies alongside is *aboard, at her mooring — she sails at the next departure*;
under way is *aboard, underway*; after arrival, *ashore at the Pando landing*.
The wheelhouse answers `world_investigate` with its next departures, computed
from its own field.

**The mechanic is general.** Nothing in it is the Post Office's. Any mark that
earns `mechanic: timetable` becomes a moving body by the same arithmetic — a
resident may propose a new line by leaving a mark. This is the first real
instance of the idea-marks → implemented-mechanics loop.

**The boundary** (defended in the sitting): individual **rides are ledger
records, never marks** — movement lives in the movement ledger, and a mark per
trip would spam canon. The **service** is entirely marks. Same grain-split as
parcels-vs-walks.

*Tests: `tools/vessel.test.mjs` — stand-and-board, pass-through-doesn't-board,
deposited-ashore-doesn't-re-board, the full round trip, miss-the-boat, and
schedule-change-via-mark-edit, all derived from the real folded tree.*

## Laws honored

- **Elevation derives from residents' words + the rulings, never drawn pixels.**
  Bands are decision 008's; anchors are extracted home/feature positions.
- **Geometry is the authority; the tree is derived-and-validated.** Enforced
  upstream by `tools/mark-lint.mjs` (07-22 nesting ruling), which shares ONE
  `loadMarks` and ONE `contains` with `marks-fold.mjs` — you cannot lie with an
  edge. The engine reads marks through that same shared loader and never defines
  a second containment; it consumes already-validated, already-folded marks.
- **Deterministic and replayable from any clone.** No wall-clock, no unseeded
  randomness; fog seeds from the crossing number (`fogModel`). Same crossing →
  byte-identical telling (tested).
- **Render cost capped by a context budget, never world size.** Candidates are
  culled to a sight radius, ranked, and carried to the budget; the rest aggregate.

## Two lessons carried (from the budding-friendship build)

- **Retroactive-replay hazard** — a lean that lives in a code *constant* re-decides
  history the day it changes. So the leans that could change a *past* crossing's
  telling (fog model, band thresholds) are dials/config, and fog is a pure function
  of the crossing number: replay of crossing N is byte-identical **by construction**,
  not by a guard. (Same shape as: rungs belong in the dated law line, not constants.)
- **Law-line supersession** — the light axis and Evermoon's west-move are
  "provisional on caelum's word." A superseding ruling must **restate what it
  carries forward** (the poles/anchors), the way a new rules-version restates the
  meep set — it may not silently drop a pole. Light/terrain are read as dated
  config so a supersession is a dated event, not a quiet flip.

## Known leans / open (flagged for the red pen)

- The heightfield is **naive** (k-nearest IDW over control points). It is gentle
  and band-honoring, not a surveyed surface. Region *extents* are single anchors,
  not polygons — good enough for FOV, coarse for anything that needs a boundary.
- Three region anchors (`north-rim`, `the-east-low-hills`, `the-headland`) are
  `derived` leans, not extracted — the map has no home or feature there yet.
- `little-bird`'s berth is the one hand-placed household (the nomad).
- Signal-status is a PoC allowlist; the durable form is a `signal:` mark predicate.
- Mark vertical prominence is a flat 4 m default; a `top_m` per mark is the real
  knob (a lighthouse is tall, a bench is not).
- **run-01 is a pre-nesting-ruling fixture — kept, not migrated (Wright, 07-22).**
  Editing a fixture's semantics to satisfy a new gate is rewriting the archive to
  please the present; its value is precisely that it was written before the ruling.
  It is flat on disk and read by a clearly-labelled *legacy-flat adapter* in
  `world-poc.mjs` that reuses the shared `parseRecord` (no second frontmatter reader
  — only a second directory shape). The production/full-tree path
  (`--marks-dir WORLD/marks`) goes through the shared nested `loadMarks`; verified
  against the fleet's 130 nested marks (0 fold errors, `mark-lint` clean).
  - Its **predicated-on-predicated chains** (caelum's `the-last-flagstone` /
    `the-roads-end-marker` describe a *predicated* mark) are a real datum, not dirt:
    a resident will someday want a property of a property. When one does, that is a
    ruling moment against schema call #4 (predicated/naming are leaves), not a bug —
    the fixture is the receipt that the shape occurs in the wild.
- **Distance-band words are coined, not the town's.** placements.json's
  `band_vocabulary` (quayside/lower-slope/…/the-coast/outskirts) was read and
  checked: it is a POSITION axis (rings from the centre), orthogonal to distance-
  from-the-observer, so it does not map to radial bands. The coined words read as
  reach, never as terrain (the "a field off"→"a fair way off" fix). Far-features
  carry a short `label` ("Pando Peak"); the decision-008 arithmetic stays in the
  `receipt`/dials, out of the sky.
