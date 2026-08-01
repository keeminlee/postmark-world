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

## The four blocks

The quarter divides into four blocks. One is populated by this registry; three
are reserved — cited as buildings, but deliberately left undrilled below the
building level in stage 1 (the window law: exported functions only, and these
three tools' own exports weren't part of this pass's registry):

1. **The registry block (populated)** — `departures-hall` (the walk ledger:
   `walk.mjs`), `lantern-tower` (the engine + spine verbs: `world-engine.mjs`,
   `world-verbs.mjs`), `surveyors-hall` (the marks fold + geometry:
   `marks-fold.mjs`, `mark-class.mjs`, `geometry.mjs`), `sounding-house` (water
   and crossings: `water.mjs`), `spectators-gallery` (the viewer:
   `viewer.mjs`), and `settlement-house` (the settlement sweep:
   `settlement-sweep.mjs`) — 23 function marks total, every one keyed in
   `CODE_REGISTRY.draft.json`.
2. **`cartographers-workshop` (reserved)** — cites `world-root-gen.mjs`
   ("generate the root mark + the terrain marks, BY EXTRACTION from
   `WORLD/skeleton.json`"). No function-level marks yet.
3. **`customs-house` (reserved)** — cites `mark-lint.mjs` ("the pre-flight
   gate for `WORLD/marks/`"). No function-level marks yet.
4. **`movers-depot` (reserved)** — cites `migrate-marks-v2.mjs` ("one-shot:
   re-home the v1 marks into the schema-v2 spatial tree"). No function-level
   marks yet.

The three reserved blocks are honest placeholders, not omissions: their
buildings stand and cite real tools, but drilling them to their own exported
functions is future work, not this stage's.

## Count

**40 `mark.md` files** under this district (1 district root + 8 building
roots + 31 nested predicated/naming marks, by directory count — the loose
figure to check is `find … -name mark.md | wc -l`, which is the number that
matters).

## Honesty line

Documents are tellings, marks are the record, and where a mark disagrees with
the code, **the code governs** until the mark is trued. This README, the
registry beside it, and every mark in this district are drafts written for
Keemin to read in daylight — not a claim that any of it is settled.
