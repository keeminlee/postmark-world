# WORLD/marks — the on-disk schema (07-22 nesting ruling)

*The exact shape of a mark on disk. This is the one definition the seeding fleet
writes to, `tools/mark-lint.mjs` enforces, and `tools/marks-fold.mjs` reads —
they cannot drift, because the lint and the fold share one loader and one
`contains`. [`MARKS.md`](../../MARKS.md) is the law; this is its file format.*

Pre-flight anything before it lands: **`node tools/mark-lint.mjs`** (a gate — it
exits non-zero on any error, with the exact fix).

---

## One mark per directory

```
WORLD/marks/<household>/<slug>/mark.md                      a mark on open ground
WORLD/marks/<household>/<parent-slug>/<slug>/mark.md        nested = an edge
```

The **directory carries the identity and the edge** — what used to be
frontmatter:

- **`<household>`** — the top directory under `WORLD/marks/`. The mark's owner.
  It is *not* stored in the record; the directory is the single source of truth.
- **`<slug>`** — the mark's own directory name. Lowercase-hyphenated, and
  **unique within the household across every depth**. The record does not repeat
  it.
- **id** = `<household>/<slug>` (the leaf, not the path). Because identity is the
  leaf, **re-nesting a mark never changes its id** — stakes in the ledger stay
  attached. The flat→nested migration preserved every id.

**Nesting is the only hand-drawn edge.** A mark whose directory sits inside
another mark's directory asserts a relationship to that enclosing mark:

- a **`sited`** mark nested inside another marks *containment* — and the
  enclosing mark must **geometrically contain** it (the fold's own `contains`:
  the child's footprint lies ≥99% inside the parent's). **You cannot lie with an
  edge** — the lint refuses nesting the coordinates deny.
- a **`predicated`** / **`naming`** mark nested inside another marks that it
  *describes* that enclosing mark. Its parent is implicit — **do not write a
  `parent:` field.**

Only **`sited`** and **`parcel`** marks may contain children (they have extent).
A `predicated`/`naming` mark is a leaf.

## Frontmatter, by kind

Every record is `---` frontmatter then a body. Fields the directory owns
(`household`, the slug, and a nested mark's `parent`) are **never written**.

| field | sited | parcel | predicated | naming |
|---|---|---|---|---|
| `kind` | required | required | required | required |
| `date` (`YYYY-MM-DD`) | required | required | required | required |
| `at: { x, y }` (grid m) | required | required | — (no geometry) | — |
| `extent: { w, h }` (m) | required | optional (def 25×25) | — | — |
| `slot` | — | — | required | optional (implicitly `name`) |
| `value` | — | — | required | required (the name) |
| `parent: terrain:<id>` | — | — | top-level only¹ | top-level only¹ |
| `pre` / `derived_from` | provenance² | provenance² | provenance² | provenance² |

¹ **Parent, exactly one source.** A `predicated`/`naming` mark takes its parent
either from the enclosing directory (nested — write no `parent`) **or**, when it
attaches to the terrain tier, from an explicit `parent: terrain:<feature-id>` at
the top level. Never both, never neither. An authored `parent:` may name **only**
a terrain feature — to attach to another *mark*, nest under its directory. Terrain
ids come from `WORLD/TERRAIN/skeleton.json` (`features` + `far_features`).

² **Provenance (office / seeding-fleet pre-marks).** A pre-mark translates a
resident's *own words*, so it must carry:

```
pre: true
derived_from: WHITE_PAGES/<handle>/ADDRESS.md — "the verbatim words this translates"
```

`derived_from` must name a source path **and** quote the span. Resident
hand-marks omit `pre` and need no `derived_from`.

## The grid

`at`/`extent` are **grid meters**. Origin = **Ferry's crossing** (the center of
the Town Centre; atlas 485,760 at 5 m/px). **x grows east, y grows south.** The
fleet emits integer meters; sub-meter is legal. Rects are centered on `at` and
sized by `extent`.

## The body

A present-tense observation, **≤ 150 characters** (the ruling's cap — the lint
errors past it). It is the mark's face in every view; write it like a sentence
read aloud. History needs no marks — the diff log remembers how things came to be.

## Coordinates the schema does **not** yet enforce

The **dwelling-interior norm** (MARKS.md § Parcels — no mark sited inside another
resident's declared dwelling) is an authoring rule the seeding fleet honors, but
`mark-lint` v1 cannot check it: dwelling extents are not yet marks. When dwellings
are sited, a fold/lint check can enforce it. Until then it is honored by the
writer, not the gate. *(Flagged, not silently omitted.)*

## Worked example (the migrated bench)

```
WORLD/marks/wright/the-crossing-bench/mark.md          kind: sited, at {12,8}, extent {2,1}
WORLD/marks/wright/the-crossing-bench/bench-wood/mark.md   kind: predicated, slot material, value "grey oak"
```

`bench-wood` sits inside `the-crossing-bench`'s directory, so it predicates it —
no `parent:` written; the fold resolves `wright/bench-wood`'s parent to
`wright/the-crossing-bench` from the nesting. ids unchanged from the flat era.

---

*Landed 2026-07-22 as the schema half of the marks nesting build (Jetto, on
Wright's tasking; schema shape Jetto's per the division of labor). Sibling
authorities: `MARKS.md` (the law), `tools/marks-fold.mjs` (canon is what it
computes), `tools/mark-lint.mjs` (this schema, enforced).*
