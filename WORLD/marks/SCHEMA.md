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

**Authorship left the path.** `WORLD/marks/<household>/` was write-scoping
inherited from a PR door this repo does not have. Who *made* a mark is now the
**`by:`** frontmatter field (office-validated, not path-enforced). Where a mark
*is* is the path.

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

The lint refuses `tier: constitution` from anyone but `the-town` — a market mark
cannot bind without stamps. Fan-up (a parent's weight = its own + all
descendants') flows through every tier; the root carrying the world's total weight
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
| `date` (`YYYY-MM-DD`) | required | required | required | required |
| `at: { x, y }` (grid m) | required | required | — | — |
| `extent: { w, h }` (m) | required | opt (def 25×25) | — | — |
| `slot` | — | — | required | opt (implicitly `name`) |
| `value` | — | — | required | required (the name) |
| `points` (reserved²) | opt | opt | — | — |
| `far` (horizon object) | opt (the-town) | — | — | — |
| `feature: <skeleton-id>` | opt (the-town) | — | — | — |
| `pre` / `derived_from` | provenance¹ | provenance¹ | provenance¹ | provenance¹ |

¹ **Provenance (office / seeding-fleet pre-marks).** A pre-mark translates a
resident's *own words*, so it carries `pre: true` and `derived_from: <source
path> — "the verbatim words this translates"`. Resident hand-marks omit both.

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

**The river is segmented, not one mark** — each reach the skeleton names is its
own constitution mark with its own `feature:` link. Finer named-reach enrichment
(the residents' own words for Blackwater Bend, the Still Reach pool, the harbor
reach) is part of the filed coverage follow-up, not tonight.

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

---

*v2 landed 2026-07-22 night (Jetto, on Wright's tasking; Keemin ruled the one-tree
redesign live). Supersedes the v1 nesting schema (`<household>/` write-scoping):
the tree is now spatial containment rooted at the light, authorship is `by:`, id is
`by`+leaf (every v1 id preserved), and protection tiers are explicit. Sibling
authorities: `MARKS.md` (the law), `tools/marks-fold.mjs` (canon is what it
computes), `tools/mark-lint.mjs` (this schema, enforced), `tools/world-root-gen.mjs`
(the root + terrain, by extraction).*
