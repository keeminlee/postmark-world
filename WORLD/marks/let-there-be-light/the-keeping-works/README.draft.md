# the-keeping-works — DRAFT district (the great convergence, stages 1–2)

**Status: DRAFT.** Nothing here is landed law. This whole district exists for
Keemin's daylight judgment (2026-08-01) and can be discarded, reworked, or
ruled whole-cloth without ceremony.

## What this district is

`the-keeping-works` is **the great convergence** — the project of expressing
Postmark's own codebase, across all four of its repos, as places in its own
World. Stage 1 (2026-08-01) seeded postmark-world's own machinery (the
semantic-world engine, its spine verbs, the walk ledger, the marks fold, the
water/crossing lookups, the spectator viewer, and the settlement sweep) as
buildings, each one citing the code that keeps it true. Stage 2 (same day)
seeded the three blocks stage 1 left reserved — **town** (the `postmark`
repo's tools), **site** (`postmark-site`), and **office** (`postmark-office`)
— completing all four blocks of the district. The town's record now includes
a telling of the town's own works, across every repo that makes the town run.

Every mark here is `by: the-town`, carries `pre: true`, and cites its source
with a verbatim `derived_from` quote — same provenance discipline as any other
pre-mark, applied to code instead of a resident's own words.

## The four blocks

`the-keeping-works` is **one district, four blocks** — one block per Postmark
repo, not four separate districts:

| block | repo | status |
|---|---|---|
| **world** | postmark-world (`tools/` + `spectator/`) | **built, stage 1** — 9 buildings, 40 marks |
| **town** | the `postmark` repo's tools | **built, stage 2** — 9 buildings, 40 marks |
| **site** | postmark-site | **built, stage 2** — 14 buildings, 40 marks |
| **office** | postmark-office | **built, stage 2** — 14 buildings, 40 marks |

All four blocks are now seeded. The stage-1 plan agent assigned `at`/`extent`
for all four blocks in its own `blocks[]` layout; that geometry was not
recoverable from inside the stage-1 seeding pass, so no coordinates were
guessed there. Stage 2 recovered it — see "The block plat" below.

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

## The town block: 9 buildings

Seeded stage 2 from the `postmark` repo's `tools/`. Direct children of this
district dir, same as the world block above:

- **the-sorting-house** (`ferry.mjs` + `envelope.mjs` + `envelope-check.mjs` +
  `reconcile.mjs`) — the mail crossing; nested engine `the-envelope-law` with
  5 function marks: the-frontmatter-reader, the-verdict, the-stale-clone-test,
  the-crossing-memory, the-roll-call.
- **the-roll-house** (`lint.mjs` + `whitepages-index.mjs` +
  `pin-github-ids.mjs`) — town consistency/identity upkeep; building only, 0
  exports.
- **the-morning-desk** (`doorstep.mjs` + `board-html.mjs`) — resident-facing
  read surfaces; building only, 0 exports. Renamed from `the-reading-room`
  after a cross-block slug collision — see "Notes on stage 2" below.
- **the-mint-house** (`stamp-mint.mjs` + `stamp-verify.mjs`) — the stamp
  economy; nested engine `the-mint-engine` holding the `the-ledgers-grammar`
  grouping mark + 6 function marks (the-sealing-wax, the-correspondence-fold,
  the-friendship-mint, the-settlement-trace, the-sealed-entry,
  the-balance-fold), plus `the-verifiers-desk` (`verifyStampLedger`) direct
  under the building.
- **the-ballot-house** (`ballot.mjs` + `ballot-pass.mjs`) — the ballot
  vote-stake engine; 6 function marks: the-ballot-reading,
  the-standing-record, the-tally, the-clip-and-cast, the-closing-return,
  the-mailed-ballot-sweep.
- **the-claim-house** (`world-stake.mjs`) — the world-mark stake engine; 5
  function marks: the-standing-claims, the-weight-derivation,
  the-retirement-gate, the-staking-hand, the-unstaking-hand.
- **the-quest-board** (`quest-progress.mjs`) — the quest board; 5 function
  marks: the-days-progress, the-friendship-standing, the-personal-board,
  the-days-leaderboard, the-durable-snapshot.
- **the-witness-stand** (`witness.mjs`) — the PR witness/certifier; building
  only, 0 exports.
- **the-fitting-room** (`rendition-check.mjs` + `rendition-preview.mjs`) —
  resident rendition dev tools; building only, 0 exports.

28 exported functions are marked at function grain, all `mechanic_draft:
code:town:<functionName>`.

## The site block: 14 buildings

Seeded stage 2 from `postmark-site`. Placed as a nested `the-lookout-row`
directory with its own `mark.md`, not as direct children of this district dir
— see "Notes on stage 2" below for the placement discrepancy this creates:

- **the-almanac-hall** (`tools/lib/town.mjs`) — the checkout/town reader; 4
  fns.
- **the-naming-shelf** (`tools/lib/ids.mjs`) — `threadTitle`; 1 fn.
- **the-pressroom** (`tools/extract-town.mjs`) — CLI build script; 0 fns, no
  exports.
- **the-relay-office** (`tools/fetch-town.mjs` + `tools/lib/fetch-town-data.mjs`)
  — office API fetch; 3 fns.
- **the-darkroom** (`tools/lib/images.mjs`) — image pipeline; 3 fns.
- **the-copyists-bench** (`tools/lib/mirror.mjs`) — byte-mirror/ref-rewrite;
  2 fns.
- **the-framers-gallery** (`tools/sync-renditions.mjs`) — rendition
  approval-gate copy; 0 fns, no exports.
- **the-lending-library** (`town/scripts/world-engine-island.mjs`) — served
  viewer/engine; 1 fn.
- **the-signet-office** (`src/lib/auth.mjs`) — OAuth PKCE helpers; 3 fns.
- **the-mail-desk** (`src/lib/mail.mjs`) — mail page logic; 3 fns.
- **the-backers-hall** (`src/lib/my-world.mjs`) — My World household overlay;
  2 fns.
- **the-typesetters-desk** (`src/lib/pm.mjs`) — markdown/date/name render
  helpers; 2 fns.
- **the-ushers-rail** (`src/lib/rail.mjs`) — side-rail scrollspy; 1 fn.
- **the-gatehouse** (`src/layouts/PostmarkLayout.astro`) — sign-in +
  notification bell chrome; 0 fns, anonymous IIFEs.

25 exported functions are marked at function grain, all `mechanic_draft:
code:site:<functionName>`.

## The office block: 14 buildings

Seeded stage 2 from `postmark-office`, written into this same worktree
(`G:/Postmark/dev/the-great-convergence_2026-08-01/world-seeding`, branch
`seeding/the-great-convergence`) — not the `postmark-world` checkout on
`main`, which only has stage 1. Direct children of this district dir, same as
world and town; no `the-clerks-row` mark.md was created (blocks are plan
geometry, not mark dirs, per the stage-1 precedent):

- **the-front-window** — `src/mcp.mjs` + `src/server.mjs` (the office's two
  protocol doors); 1 function mark (the-intake-slot / `handleMcp`).
- **the-front-window/the-credentials-desk** — `src/oauth.mjs`, engine nested
  inside the-front-window (100% contained); 4 function marks
  (the-signature-match / `householdFor`, the-pass-check / `oauthLookup`,
  the-minting-press / `mintHouseholdKey`, the-sign-in-corridor /
  `handleOauth`).
- **the-reading-room** — `src/queries.mjs`, the shared read-verb layer; 4
  function marks (the-doorstep-reading / `doorstep`, the-letter-sorting /
  `letterList`, the-identity-reading / `identityOf`, the-three-tenses /
  `stampsDetail`).
- **the-outbox** — `src/write.mjs`, the mail write spine; 3 function marks,
  all of its exports (the-outbox-filing / `enqueueLetter`, the-pen-stroke /
  `penCommit`, the-next-crossing / `nextCrossing`).
- **the-editing-desk** — `src/edit.mjs`, body-edit write verbs; 2 function
  marks (the-hearth-rewrite / `updateHome`, the-new-pane / `updateWindow`).
- **the-ballot-room** — `src/votes.mjs`, the ballot doors; 2 function marks
  (the-ballot-bundle / `doorstepVotes`, the-locked-stake / `stakeViaOffice`).
- **the-residency-office** — `src/residency.mjs`, the one visitor write verb;
  2 function marks (the-card-check / `validateResidencyRequest`,
  the-request-to-stay / `requestResidency`).
- **the-founders-desk** — `src/ops.mjs`, the principal's gift desk; 2
  function marks (the-founder-check / `isPrincipal`, the-founders-gift /
  `giftViaOffice`).
- **the-world-window** — `src/world.mjs`, the office's thin proxy onto
  postmark-world's own engine; 1 function mark (the-doorway-orientation /
  `worldOrient`).
- **the-two-shelves** — `src/world-branches.mjs`, published-vs-household-draft
  resolution; **granularity pending**, 0 function marks.
- **the-stake-window** — `src/world-stake.mjs`, the world stake/unstake doors
  (law lives in the town engine, imported live); 1 function mark
  (the-held-stamps / `worldStakeRead`).
- **the-index-room** — `src/hydrate.mjs` + `src/schema.mjs`, the rebuildable
  read index; **granularity pending**, 0 function marks (`hydrate.mjs`
  exports nothing, `schema.mjs`'s `SCHEMA` is data, not a function).
- **the-bouncers-booth** — `src/bouncer.mjs`, the three rate-limit layers; 1
  function mark (the-unnamed-key / `keyIdForToken`).
- **the-telemetry-ledger** — `src/telemetry.mjs`, access telemetry; 1
  function mark (the-footfall-line / `logAccess`).
- **the-glaziers-loft** — `deploy/publish-windows.mjs`, the window-pane
  publisher; 1 function mark (the-window-dressing / `stageWindows`).

25 exported functions are marked at function grain, all `mechanic_draft:
code:office:<functionName>`.

## The block plat (recovered)

The stage-1 plan's `blocks[]` geometry, staked on the record now that stage 2
has seeded all four blocks:

| block | ground | rectangle |
|---|---|---|
| world | the-engine-yard | `{x:1175,y:-15}` extent `{w:400,h:400}` |
| office | the-clerks-row | `{x:1575,y:-15}` extent `{w:400,h:400}` |
| site | the-lookout-row | `{x:1175,y:385}` extent `{w:400,h:400}` |
| town | the-toolshed-row | `{x:1575,y:385}` extent `{w:400,h:400}` |

## Notes on stage 2

- **Slug collision, resolved by rename.** The town block's read-surfaces
  building was originally `the-reading-room`, colliding with the office
  block's `the-reading-room` (`src/queries.mjs`) — both would-be direct
  children of the same `the-keeping-works` dir. The town building was renamed
  to `the-morning-desk` to resolve it; the office block kept `the-reading-room`.
- **Site block placement discrepancy.** The site block landed as its own
  `the-lookout-row` directory (with its own `mark.md`) rather than as direct
  children of `the-keeping-works`, unlike town and office. `node
  tools/mark-lint.mjs` flags this as an ERROR — by geometry (its `at`/`extent`
  in `mark.md`), `the-lookout-row`'s tightest container computes to
  `the-town/the-keeping-works`, but its filesystem parent is the district
  root, not `the-keeping-works` — and asks for the directory to be re-homed.
  This assembly pass reports it faithfully
  rather than re-homing it: moving an already-placed 40-mark subtree is a
  structural call for Keemin, not a mechanical formatting fix.

## Draft conventions

Two fields exist here that are **not** part of the landed schema, and are
deliberately built to be invisible to the real machinery until a founding
rules on them:

- **`mechanic_draft: code:<block>:<functionName>`** — sits on `predicated`
  function marks in place of the real `mechanic:` field. `mark-lint.mjs`
  validates `mechanic:` against the physics registry in `skeleton.json` and
  refuses any id absent from it; `mechanic_draft:` is a different field name
  on purpose, so the lint has nothing to check and nothing to refuse. It reads
  as inert draft data until someone renames it. Stage 1 used only
  `code:world:*`; stage 2 added `code:town:*`, `code:site:*`, and
  `code:office:*` — one namespace per block, no collisions between them.
- **`CODE_REGISTRY.draft.json`** (this district) — the roster the
  `mechanic_draft:` ids point into: one entry per function, keyed by its
  `code:<block>:<functionName>` id, carrying its `src` (repo-relative path +
  function name), an `approx_loc`, an `honored` status (currently
  `"unverified-draft"` for every entry — no function here has had its
  behavior checked against its mark), and a `receipt`. 101 entries after
  stage 2's merge: 23 `code:world:*` (stage 1, untouched) + 28 `code:town:*`
  + 25 `code:site:*` + 25 `code:office:*`. Each block's entries arrived as a
  `*.REGISTRY_PART.draft.json` sibling file, merged into this one file and
  deleted by the stage-2 assembly pass.

**When ruled:** if a founding adopts this pattern, `mechanic_draft:` becomes
`mechanic:`, `CODE_REGISTRY.draft.json` (trued and probably renamed) becomes
the physics-registry-adjacent lookup the lint validates against, and
`honored:` stops defaulting to `"unverified-draft"` as each function actually
gets checked. Until then, both are draft furniture — real fields to copy from
when the time comes, not fields the world runs on today.

## Count

**160 `mark.md` files** across the four blocks, 40 per block:

- world (stage 1): 1 district root + 16 building/module containers (9
  building roots + 7 nested module groupings) + 23 function-grain
  `predicated` marks = 40.
- town (`the-toolshed-row`, direct children of this dir): 40.
- office (`the-clerks-row`, direct children of this dir): 40.
- site (`the-lookout-row`, its own nested directory — see "Notes on stage 2"):
  40.

`find … -name mark.md | wc -l` under **this** directory alone returns 120
(district root + world + town + office) — it does not include the site
block, which lives in its own sibling `the-lookout-row` directory (under
`WORLD/marks/let-there-be-light/`, beside `the-keeping-works`, not inside it)
because of the placement discrepancy noted above. Sum both directories for
the district-wide 160. If this README and the tree ever disagree, the tree
governs.

## Honesty line

Documents are tellings, marks are the record, and where a mark disagrees with
the code, **the code governs** until the mark is trued. This README, the
registry beside it, and every mark in this district are drafts written for
Keemin to read in daylight — not a claim that any of it is settled.
