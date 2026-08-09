# WORLD/marks — the on-disk schema (v2: the one spatial tree, 07-22-night ruling)

*The exact shape of a mark on disk. This is the one definition the seeding fleet
writes to, `tools/mark-lint.mjs` enforces, and `tools/marks-fold.mjs` reads —
they cannot drift, because the lint and the fold share one loader and one
`contains`. [`MARKS.md`](../../MARKS.md) is the law; this is its file format.*

Pre-flight anything before it lands: **`node tools/mark-lint.mjs`** (a gate — it
exits non-zero on any error, with the exact fix).

---

## The one tree: directories are spatial containment, rooted at the light

```
WORLD/marks/let-there-be-light/mark.md                         the root — the whole world
WORLD/marks/let-there-be-light/<terrain>/mark.md               terrain, on open ground under the root
WORLD/marks/let-there-be-light/<slug>/mark.md                  a mark on open ground
WORLD/marks/let-there-be-light/<container>/<slug>/mark.md      nested = spatially INSIDE the container
```

The directory tree **is the containment tree**. It is rooted at the world-root
mark **`let-there-be-light`**; every directory is a mark; nesting means the child
sits **geometrically inside** the parent; and the path from the root is the spine
a telling walks. There is one root and everything is under it.

**Authorship left the path.** `WORLD/marks/<household>/` was write-scoping in the
tree. The scoping is real — it just does not live here: the PR door writes into
per-household `draft/<login>` sketchbooks, and its gate checks every path and
every `by:` in the diff against the author ([`WRITES.md`](../../WRITES.md)). Who
*made* a mark is the **`by:`** frontmatter field (validated at both doors, not
path-enforced). Where a mark *is* is the path.

## Identity = `by` + leaf slug

- **`<slug>`** — the mark's own directory name. Lowercase-hyphenated. Unique **per
  author** (per `by`), at any depth.
- **id = `<by>/<slug>`** — the author and the leaf, never the path. This
  reproduces every pre-v2 `household/slug` id exactly: **zero renames, the ledger
  identity scheme is untouched.** Re-nesting a mark (moving it under a region) does
  not change its id — stakes stay attached.
- Two `the-lamp`s stay legal: same leaf, different `by` → different ids. Their
  **paths** differ because they sit in different places (different containers).

**Nesting is the only hand-drawn edge**, and you cannot lie with it: a nested
**`sited`** mark must be **geometrically contained** by its parent (the fold's own
`contains`; the child's footprint ≥99% inside the parent's). A nested
**`predicated`/`naming`** mark *describes* its parent — its parent is implicit, so
**write no `parent:` field**.

## Protection tiers

Every mark carries a **`tier:`** (default `market`):

| tier | what it means | who |
|---|---|---|
| **constitution** | binds without stamps; cannot be rivaled or determined against; changes are constitutional acts | **`by: the-town` only** |
| **sovereignty** | inside your own parcel; yours absolutely, no stamps needed | a resident, in their parcel |
| **market** | contestable, load-bearing only when staked | the default, anyone |
| **draft** | openly provisional; binds no one and says so (gray) | anyone |

The lint refuses `tier: constitution` from anyone but `the-town` — a market mark
cannot bind without stamps. Fan-up (a parent's weight = its own + all
descendants') flows through every tier of SITED marks — a parcel is a fence, not a scale: it never parents and never accumulates (the fold's own rule) — and the root carrying the world's total weight
is accepted (a dial-class ruling, movable).

## The root and terrain are generated, not hand-typed

`tools/world-root-gen.mjs` writes the root mark and one mark per terrain feature
(river, seas, lochan, garrison lake, locks, coasts, upward falls, Pando, ferry's
route) **by extraction from `WORLD/skeleton.json`** — `by: the-town`,
`tier: constitution`. Do not hand-edit them; re-run the generator.

- **The root `let-there-be-light`** — `extent` = the whole world (it contains
  everything, horizon included); `body` = the charter establishing line.
- **Two-precision geometry.** A terrain mark carries a **coarse bounding `at`/
  `extent`** as its *claim*, and a **`survey: terrain:<id>`** pointer; the precise
  geometry stays in `skeleton.json` beneath, the survey layer. The mark is the
  claim; the skeleton is the measurement.
- **`far: true`** marks (Pando) are horizon objects, not ground (decision 008) —
  exempt from the containment check by construction.

## Frontmatter, by kind

Every record is `---` frontmatter then a body. The **path owns nothing but
containment**; everything else is a field.

| field | sited | parcel | predicated | naming |
|---|---|---|---|---|
| `kind` | required | required | required | required |
| `by` (author handle) | required | required | required | required |
| `tier` (default market) | opt | opt | opt | opt |
| `date` (`YYYY-MM-DD` or ISO 8601⁴) | required | required | required | required |
| `at: { x, y }` (grid m) | required | required | — | — |
| `extent: { w, h }` (m) | required | opt (def 25×25) | — | — |
| `slot` | — | — | required | opt (implicitly `name`) |
| `value` | — | — | required | required (the name) |
| `points` (reserved²) | opt | opt | — | — |
| `far` (horizon object) | opt (the-town) | — | — | — |
| `feature: <skeleton-id>` | opt (the-town) | — | — | — |
| `mechanic: <registry-id>`³ | opt | opt | opt | opt |
| `timetable`⁵ | opt | opt | opt | opt |
| `pre` / `derived_from` | provenance¹ | provenance¹ | provenance¹ | provenance¹ |

¹ **Provenance (office / seeding-fleet pre-marks).** A pre-mark translates a
resident's *own words*, so it carries `pre: true` and `derived_from: <source
path> — "the verbatim words this translates"`. Resident hand-marks omit both.

⁴ **`date` — day precision OR full ISO 8601 datetime.** `YYYY-MM-DD` (the seeded
marks) and `YYYY-MM-DDTHH:MM:SS[.sss][Z|±HH:MM]` are both valid. The world-write
path (`world_leave_mark`) server-stamps the datetime to the second at accept; a
hand-authored mark may stay day-precise. Validated by `marks-fold.mjs`
`isValidMarkDate` (the one definition the lint and the office share).

A `sited`/`parcel` mark **never** authors a `parent:` — containment is geometry.
A top-level `predicated`/`naming` mark may still name a terrain feature with an
explicit `parent: terrain:<id>` (ids from `skeleton.json`), but nesting under the
mark it describes is preferred.

**² `points:` — reserved, coarsely honored.** A mark may carry `points:` — an
optional polygon (an SVG-polygon-style list of grid-meter vertices, a closed
ring) — ALONGSIDE `at`/`extent`, to declare its true shape today. **v1 honoring
is deliberately coarse:** the lint validates containment against the polygon's
**bounding box only**, and the fold/engine treat the mark as its `at`/`extent`
(which must equal that bounding box). Fine-grain coverage — marks as grid-cell
sets, irregular shapes, FOV and fan-up over them — is a **filed PULSE follow-up**,
not tonight. A mark that carries `points:` today gains fine honoring later with
**no record change**.

**`feature:` — the two-precision link.** A terrain mark carries
`feature: <skeleton-feature-id>` so the claim (the coarse mark) and the survey
(the precise geometry in `skeleton.json`) are joined by a field, not a
convention. The engine can follow it to the precise geometry later; nothing
consumes it tonight.

**³ `mechanic:` — diegesis points at its machinery (2026-07-23, Keemin-ruled).**
EVERYTHING diegetic is a mark in the tree; where a mark's truth is *kept true by
machinery* (the fog by the crossing-seeded fog model, a declared light by the
signal path, the land's fall by the heightfield), the mark carries
`mechanic: <id>` naming that machinery. Ids come from the **physics registry**
(`skeleton.json § physics_registry` — the roster of mechanics that exist); the
lint refuses a mechanic that is absent or not honored, so a mark can never point
at machinery the world doesn't run. This replaces flag-lists in code (the old
`SIGNAL_MARKS` allowlist): the record declares, the engine reads the record. On
a `predicated` mark, the mechanic applies to the mark it describes (a
`mechanic: signal` predicate makes its parent the signal). The world-law
predicates on the root (`the-fog`, `the-fall-of-the-land`, `the-walking-pace`,
`the-wear`) are generated from the skeleton's own numbers by
`world-root-gen.mjs` — extraction, never hand-copy.

**The river is segmented, not one mark** — each reach the skeleton names is its
own constitution mark with its own `feature:` link. Finer named-reach enrichment
(the residents' own words for Blackwater Bend, the Still Reach pool, the harbor
reach) is part of the filed coverage follow-up, not tonight.

**⁵ `timetable:` — a schedule, and the mark that carries one moves (2026-08-07,
Keemin-ruled).** A mark with `mechanic: timetable` **and** a `timetable:` field
is a scheduled service: a body that moves between stops on a clock. Both halves
are required — the mechanic is the pointer, the field is the schedule, and the
lint refuses either alone. The value is a **one-line JSON record** (the same
lane `points:` rides — the frontmatter reader takes strict JSON for `[…]` and
`{…}` values; the bare `{ x: 1, y: 2 }` spelling is unaffected):

```yaml
mechanic: timetable
timetable: {"vessel": "the-town/the-post-office", "pace": 405, "stops": [{"mark": "the-town/the-post-office", "departs": ["06:00Z", "18:00Z"]}, {"mark": "the-town/the-pando-landing", "departs": ["00:00Z", "12:00Z"]}]}
```

- **`vessel`** — the mark that *is* the moving body. Sited, with an extent: her
  footprint is the boarding zone, and her leaf slug is her walk-ledger handle.
- **`stops`** — **at least two marks, named by id**, each with UTC `departs`
  times (`HH:MMZ`). **Coordinates are never copied into the schedule** — a stop's
  position is its own mark's `at`, read at derivation time, so moving the mark
  moves the service. Each departure sails to the next stop in the list, cyclically.
- **`pace`** — km per crossing for this line (the vessel's stride, not the town's
  15 km dial).

The lint is strict about all of it (`mark-lint.mjs` §8): stops and vessel must
exist and be sited, times must parse, pace must be positive. The mechanic is
**general** — any mark that earns a timetable becomes a moving body by the same
arithmetic (`tools/vessel.mjs`), so a resident may propose a new line by leaving
a mark. Boarding is **presence, not a verb**: stand inside her footprint when she
casts off and you sail; arrival sets you down ashore, outside it. See
[`ENGINE.md`](../ENGINE.md) § the timetable mechanic.

## The grid

`at`/`extent` are **grid meters**, centered on `at`. Origin = **Ferry's crossing**
(the center of the Town Centre; atlas 485,760 at 5 m/px). **x grows east, y grows
south.** Sub-meter is legal.

## The body

A present-tense observation, **≤ 150 characters**. It is the mark's face in every
view — write it like a sentence read aloud.

## Regions (forming)

Regions are ordinary marks — a region mark (`by:` a founder or the town) sited over
an extent, with child claim-marks nested inside it. The seeding fleet lands them
from founders' own words after this schema; residents' homes re-home under the
region that contains them (id unchanged — the ledger doesn't move).

## Amendment — the continuation law (2026-08-02, Keemin-ruled)

- **A predicate is its parent continued.** A predicated mark inherits its
  parent's extent completely — its locus is the nearest sited/parcel ancestor,
  whole. Depth adds specificity, never location. (This restores the original
  definition; the promotion-lifecycle reading — predicates maturing into sited
  marks by stamp thresholds — is retired. Predicates describe; sited marks
  place; one never becomes the other.)
- **Predicates may carry children, and their children must be predicates**
  (`predicated` or `naming`). A sited/parcel mark never nests under a
  predicate — geometry needs a geometric parent. Naming marks carry none.
- **The one-file law.** The only `.md` inside the record is a mark's own
  `mark.md` (this file, at the top level, is the grammar's one exception).
  Everything else must be a full mark in its own directory.
- **`imports:` is reserved, not built** — the ruled design (persisted
  investigations: marks whose context auto-injects when building on or under
  the declaring mark) awaits its machinery. Do not author the field yet.
- **The law lives in the record itself:** `let-there-be-light/the-record` —
  the conditions of the World as constitution-tier predicates of the root,
  each clause sized to be quoted whole by the gate that enforces it. This
  schema remains the enforced spelling; where prose and record disagree, that
  is a defect to true, not a fork to keep.

---

*v2 landed 2026-07-22 night (Jetto, on Wright's tasking; Keemin ruled the one-tree
redesign live). Supersedes the v1 nesting schema (`<household>/` write-scoping):
the tree is now spatial containment rooted at the light, authorship is `by:`, id is
`by`+leaf (every v1 id preserved), and protection tiers are explicit. Sibling
authorities: `MARKS.md` (the law), `tools/marks-fold.mjs` (canon is what it
computes), `tools/mark-lint.mjs` (this schema, enforced), `tools/world-root-gen.mjs`
(the root + terrain, by extraction).*
