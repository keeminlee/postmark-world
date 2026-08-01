# the-keeping-works — DRAFT district (the great convergence, stage 1)

**Status: DRAFT.** Nothing here is landed law. This whole district exists for
Keemin's daylight judgment (2026-08-01) and can be discarded, reworked, or
ruled whole-cloth without ceremony.

## What this district is

`the-keeping-works` is stage 1 of **the great convergence** — the project of
expressing Postmark's own codebase as places in its own World. This quarter
seeds postmark-world's own machinery (the semantic-world engine, its spine
verbs, the walk ledger, the marks fold, the water/crossing lookups, the
spectator viewer, and the settlement sweep) as buildings, each one citing the
code that keeps it true. The town's record now includes a telling of the
town's own works.

Every mark here is `by: the-town`, carries `pre: true`, and cites its source
with a verbatim `derived_from` quote — same provenance discipline as any other
pre-mark, applied to code instead of a resident's own words.

## The four blocks

`the-keeping-works` is **one district, four blocks** — one block per Postmark
repo, not four separate districts:

| block | repo | status |
|---|---|---|
| **world** | postmark-world (`tools/` + `spectator/`) | **built, stage 1** — everything below |
| **town** | the `postmark` repo's tools | **reserved** — empty ground, stage 2 |
| **site** | postmark-site | **reserved** — empty ground, stage 2 |
| **office** | postmark-office | **reserved** — empty ground, stage 2 |

Three of the four blocks are reserved **geometry** — empty ground awaiting
stage-2 seeding — not reserved buildings, and not the three tool-citing
buildings described below (those are a different, orthogonal kind of
incompleteness; see "granularity pending"). The stage-1 plan agent assigned
`at`/`extent` for all four blocks in its own `blocks[]` layout; that geometry
was not recoverable from inside this seeding pass, so no coordinates are
guessed here — it is geometry per the stage-1 plan, staked when stage 2
actually seeds the town/site/office blocks.

## The world block: 9 buildings

Every building below is `kind: sited`, `by: the-town`, cites its source file in
`derived_from`, and sits inside the world block's ground:

- **lantern-tower** (`world-engine.mjs`) — the engine library (field-of-view)
  and the verbs library (orient, open-your-eyes, investigate, walk).
- **departures-hall** (`walk.mjs`) — the ledger grammar: a departure is a
  declarative record; position is derived, never stored mid-journey.
- **sounding-house** (`water.mjs`) — the water oracle: still water vs.
  crossable, named crossings.
- **spectators-gallery** (`spectator/server.mjs`, functions from
  `spectator/viewer.mjs`) — the read-only told-world viewer.
- **surveyors-hall** (`marks-fold.mjs`, `mark-class.mjs`, `geometry.mjs`) — the
  canon fold, the class rule, the geometry primitives.
- **settlement-house** (`settlement-sweep.mjs`) — where eligible drafts
  publish to main and household sketchbooks rebase behind them.
- **cartographers-workshop** (`world-root-gen.mjs`), **customs-house**
  (`mark-lint.mjs`), **movers-depot** (`migrate-marks-v2.mjs`) — cited and
  sited, but **granularity pending**: this pass did not drill their exported
  functions into nested `predicated` marks. This is not the "reserved" of the
  four blocks above — the buildings exist, the ground isn't empty — it's just
  not yet drilled to function grain. No skipped-function list from a
  seed-writer was visible from inside this task, so this is flagged as
  pending rather than a guess at what such a list would say.

23 exported functions, across 6 of the 9 buildings, are marked at function
grain (`kind: predicated`, `slot: fn:<name>`) — the window law's load-bearing
cut, not the full export surface of every module.

## Draft conventions

Two fields exist here that are **not** part of the landed schema, and are
deliberately built to be invisible to the real machinery until a founding
rules on them:

- **`mechanic_draft: code:world:<functionName>`** — sits on `predicated`
  function marks in place of the real `mechanic:` field. `mark-lint.mjs`
  validates `mechanic:` against the physics registry in `skeleton.json` and
  refuses any id absent from it; `mechanic_draft:` is a different field name
  on purpose, so the lint has nothing to check and nothing to refuse. It reads
  as inert draft data until someone renames it.
- **`CODE_REGISTRY.draft.json`** (this district) — the roster the
  `mechanic_draft:` ids point into: one entry per function, keyed by its
  `code:world:<functionName>` id, carrying its `src` (repo-relative path +
  function name), an `approx_loc`, an `honored` status (currently
  `"unverified-draft"` for every entry — no function here has had its
  behavior checked against its mark), and a `receipt`.

**When ruled:** if a founding adopts this pattern, `mechanic_draft:` becomes
`mechanic:`, `CODE_REGISTRY.draft.json` (trued and probably renamed) becomes
the physics-registry-adjacent lookup the lint validates against, and
`honored:` stops defaulting to `"unverified-draft"` as each function actually
gets checked. Until then, both are draft furniture — real fields to copy from
when the time comes, not fields the world runs on today.

## Count

**40 `mark.md` files** under this district: 1 district root + 16
building/module containers (9 building roots + 7 nested module groupings) +
23 function-grain `predicated` marks. `find … -name mark.md | wc -l` under
this directory is the number that matters if this README and the tree ever
disagree.

## Honesty line

Documents are tellings, marks are the record, and where a mark disagrees with
the code, **the code governs** until the mark is trued. This README, the
registry beside it, and every mark in this district are drafts written for
Keemin to read in daylight — not a claim that any of it is settled.
