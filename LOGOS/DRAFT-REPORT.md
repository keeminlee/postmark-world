# Stage 0 — LOGOS/ and the charter articles: draft report

> **HISTORICAL RECORD — stamped 2026-08-19 (the tri-survey's C9, founder-ruled).**
> The verdicts and citations below are UNSAFE TO CITE AS CURRENT: evidence this
> audit cites has since been rewritten out of the docs it names, and addresses it
> proposes shipped under different names (`the-record/` became `logos/`). Kept
> whole as the 2026-08-09 stage's working record; superseded by the 2026-08-19
> tri-surface ontology survey in the founder's day docs.

Branch `stage0/logos`, worktree `G:/postmark/worktrees/stage0-logos`.
Committed locally, never pushed. **Everything here is a draft for the founders'
red pen; nothing lands on `main` from this hand.**

Author: Wright, 2026-08-09.

---

## 1 · Docs inventory and reference sweep

Every doc at the repo root, in `docs/`, and in `WORLD/`, swept against the whole
repository and against `G:/postmark/office/src` (read-only), plus a spot-check of
`G:/postmark/site`.

| doc | who cites it | verdict |
|---|---|---|
| `README.md` | itself (`:120`, the furniture map). No code reads it. | **must stay** — repo front door |
| `READS.md` | `WRITES.md:16`, and nothing else — the front door never points at it | **stay with pointer** — free to move, no reason to |
| `WRITES.md` | `.github/workflows/lane.yml` ×4 (resident-facing PR bounce text), `docs/told-world-reference.html` ×3, `README.md:17`, `READS.md:8,91,103`, `tools/lane-wall.mjs:2`, `tools/settlement-sweep.mjs:268`, `WORLD/marks/SCHEMA.md:30` (live relative link `../../WRITES.md`) | **must stay** — CI quotes its name at residents; SCHEMA.md links to it |
| `WORLD/marks/SCHEMA.md` | `tools/mark-lint.mjs:5,199,**206**`, `README.md:122`, `READS.md:31`, `WORLD/ENGINE.md:81,95`, `WORLD/TEMPLATE-mark.md:11`, told-world-reference ×3, office `world-hydrate.mjs:250,472,515` · `world-lints.mjs:155` · `world-store.mjs:115` | **must stay** — `mark-lint.mjs:206` **hardcodes the filename** as the one-file law's single exception at depth 0 |
| `WORLD/ENGINE.md` | **read at runtime by path**: office `world-hydrate.mjs:495`, `world-lints.mjs:65`. Plus `README.md:124`, `tools/world-engine.mjs:27`, `tools/world-terrain-gen.mjs:78,81`, `WORLD/skeleton.json` receipts, `SCHEMA.md:183` (relative link), told-world-reference ×3 | **must stay** — the office reads this exact path in any world clone; moving it silently degrades the hydrator's doctrine gate to `gateAbsent` |
| `WORLD/FURNISHING.md` | **a published URL**: office `world.mjs:495` hands residents `raw.githubusercontent.com/…/main/WORLD/FURNISHING.md`; the live site hardlinks the GitHub blob URL from ~every `site/dist-town/data/doorstep/*.md` and the daily page. Plus `README.md:14,123`, `READS.md:32`, `WRITES.md:13`, `tools/place-mark.mjs:47` | **must stay, hard** — moving breaks a URL already handed to residents and baked into published pages |
| `WORLD/TEMPLATE-mark.md` | **read by path**: `tools/place-mark.mjs:102`. Plus `WRITES.md:33` | **must stay** |
| `WORLD/walk-ledger.md` | **read by path**: office `walk-exec.mjs:28` · `world-hydrate.mjs:548` · `world.mjs:198`; `spectator/server.mjs:115`; `tools/return-sweep.mjs:30` · `sail.mjs:29` · `walk-demo-seed.mjs:24`. Plus README, READS, told-world-reference | **must stay** — data, and dial 4 freezes it with honour at Stage D |
| `WORLD/INDEX.md` | written by `tools/marks-fold.mjs` each fold | **must stay** — derived |
| `docs/told-world-reference.html` | `README.md:134`; and it states its own path at `:54` | **stay with pointer** — free to move (2 edits) but it self-describes its location and may be externally linked |
| `docs/the-keeping-works-seeding-README-2026-08-01.md` | **nothing, anywhere** | **safe to move** — the only genuinely free doc; left in `docs/` because it documents a live local branch, not a retired surface |
| `MARKS.md`, `ECONOMY.md` | `tools/mark-lint.mjs:2,108,111`, `tools/marks-fold.mjs:4,44,102,233,268`, `tools/world-engine.mjs:22`, `tools/water-shapes-gen.mjs:292`, `WORLD/marks/SCHEMA.md:6`, `README.md:73`, told-world-reference:83 | **absent from this repo** — see §3.3 |

### What moved

**Nothing.** No doc was relocated. `LOGOS/` was created new at the repo root and
points at everything in place.

The sweep found no doc where moving was free *and* worth doing. Six are read by
path at runtime or hardcoded by name; one is a published URL on the live site;
two are cited by resident-facing CI text; one is generated. The single
zero-reference doc (`docs/the-keeping-works-seeding-README-2026-08-01.md`) has no
reason to move.

### What was added or edited

- `LOGOS/` — new, 10 files (§2).
- `README.md` — one line in the furniture-map tree block, per its own rule:
  *"this front door — the map (update it in the commit that changes the
  furniture)."*

---

## 2 · LOGOS/

```
LOGOS/
  INDEX.md                  the thin map — one line per doc, pointing, never restating
  three-layers.md           logos / world / state; why logos is never a mark
  kinds.md                  marks stand, entities live, emissions happen
  tiers.md                  blue, green, yellow, gray, and the migration from three
  edit-law.md               creation, mutation, deletion; consent stamped at edge birth
  conflict-matrix.md        what an overlap means; the unruled-pair bounce
  classes.md                the class field grammar and the first classes
  state-and-time.md         the crossing-save, replay, mobility, the tense law
  reads-and-affordances.md  the apex verb; what a read costs (lands with Stage 3)
  DRAFT-REPORT.md           this file
```

**Two hands wrote this folder.** `state-and-time.md`, `reads-and-affordances.md`
and the body of `INDEX.md` came from a parallel agent working the same brief in
this same worktree; the six law docs, the five articles and this report are mine.
See § 8 — it was a collision, not a plan, and the merge is worth a reading eye.

`INDEX.md` follows the furniture law: one line per doc, every line a pointer, no
paraphrase of what it points at. I corrected two dead pointers in it (`../ENGINE.md`
does not exist — it is `../WORLD/ENGINE.md`; `../MARKS.md` does not exist at all)
and replaced its "moving them waits on a reference sweep" note with the sweep's
actual verdict, since the sweep is done and the answer is that they must not move.

`classes.md` has no charter article, deliberately: the class-of-classes grammar
is logos, not town-facing law, and its edit process is the founders, the witness
and the lint — not settlement.

---

## 3 · The three findings the sweep turned up

### 3.1 `the-kinds` and `the-tiers` are already taken — BLOCKING

The brief asked for articles at `WORLD/marks/let-there-be-light/the-kinds/` and
`.../the-tiers/`. **Both slugs already exist**, as clauses of `the-record`:

- `the-record/the-kinds` — *"Four kinds only: sited things stand somewhere,
  parcels are sovereign squares, predicates describe their parent, namings give a
  name."*
- `the-record/the-tiers` — *"Constitution binds without stamps and cannot be
  rivaled; sovereignty needs no stamps on your own ground; market binds only when
  staked."*

A mark's id is `by` + leaf slug regardless of path (`the-record/the-re-homing`:
*directories move; ids never do*), so authoring them at the root would produce
`duplicate id "the-town/the-kinds"` — a hard lint **error**, not a warning
(`mark-lint.mjs:91`). Both names are additionally cited by name in the lint's own
refusal messages (`cite("the-town/the-kinds")` ×4, `cite("the-town/the-tiers")`
×1), so repointing them is a code change too.

**What I did:** authored them as `the-three-kinds` and `the-tier-lattice`, at the
root as briefed, and left the existing clauses untouched.

**What the founders need to decide.** Three options, in my order of preference:

1. **Keep the new slugs** (what is drafted). Cheapest, and honest: the existing
   `the-kinds` really is about the four kinds of *mark*, which is a different law
   from the three kinds of *thing*.
2. **Rename the incumbents** — `the-record/the-kinds` → `the-mark-kinds`,
   `the-record/the-tiers` → something — and let the new articles take the plain
   names. This is arguably more correct now that "mark" is no longer the
   superclass, but it costs five `cite()` edits in `mark-lint.mjs` and changes two
   ids that other things may reference.
3. **Amend in place** rather than adding. See §3.2 — this is the real question for
   tiers.

### 3.2 The tier article contradicts the standing tiers clause — NEEDS A CALL

This is the one I would not decide alone.

`the-record/the-tiers` says there are three tiers. The new `the-tier-lattice`
says there are four. Both are `tier: constitution`, both are `by: the-town`, both
ride every spine, and **nothing in the tree can see that they disagree** — which
is precisely the failure class this whole design exists to delete: *copies
without channels; written down but not traversable.*

I did not edit the standing clause, because amending live constitutional law is a
founders' act and my lane is drafts. But leaving both as they are is not a
resting state.

Two coherent resolutions:

- **Amend `the-record/the-tiers` in the same commit** so it names four tiers and
  stops contradicting. The lattice *is* that clause, grown. Proposed replacement
  body (147 chars):

  > Blue binds everyone without stamps, green is sovereign on its own ground,
  > yellow binds only when staked, and gray is written down but binds no one.

  …with `value: blue binds, green is yours, yellow contests, gray drafts` — at
  which point the separate root article is redundant and should not be created at
  all.
- **Keep both**, with the root article as the lattice and the record's clause
  narrowed to something it still uniquely says. I cannot see what that would be.

My read: the first. The lattice is an amendment wearing a new name, and Stage 0's
dial 2 already calls it *"one settlement commit + PSA; the constitutional act
lands with Stage 0."* But it is Keemin's pen, so the draft leaves both standing
and flags it here.

### 3.3 `WORLD/marks/SCHEMA.md` links to a `MARKS.md` that is not in the repo

`SCHEMA.md:6` reads: `` [`MARKS.md`](../../MARKS.md) is the law; this is its file
format. `` From `WORLD/marks/`, `../../MARKS.md` resolves to the repository root.
**There is no `MARKS.md` there.** The link is dead, and has been since the file
was moved out of the sandbox on 2026-08-01.

`MARKS.md` and `ECONOMY.md` live at `G:/Postmark/`, on one machine, versioned
nowhere. Ten places in this repository — including `mark-lint.mjs`, which cites
`MARKS.md` in the bounce text a resident sees when their body exceeds 150
characters — name it as the law they enforce.

`docs/told-world-reference.html:83` already flags this: *"⚑ still not versioned
in any pushed repo — an in-repo home remains the open question."* It is recorded
here because Stage 0 is the moment the town starts asserting that its law is
traversable, and the most-cited law document in the repo is a dangling edge.

Not fixed in this branch — finding it a home is a Keemin call, and `LOGOS/` may
or may not be that home.

---

## 4 · The five charter articles — the bodies, for red pen

All five are `kind: predicated`, `by: the-town`, `tier: constitution`,
`date: 2026-08-09`, standing directly on `let-there-be-light`, each carrying a
`source:` field. Slots are unique among the root's predicates (which currently
hold `elevation`, `fog`, `record`, `pace`, `wear`).

### `the-town/the-three-layers` · slot `layers` · source `LOGOS/three-layers.md`
> value: **the word, the world, the living**
>
> Three layers: the word that makes marks possible, the world the marks make,
> and the living that moves through it. Only the middle one is a mark.

*(144 chars)*

### `the-town/the-three-kinds` · slot `things` · source `LOGOS/kinds.md`
> value: **marks stand, entities live, emissions happen**
>
> Marks stand and stay, entities live and move, emissions happen and fade — kept
> in the record, saved each crossing, remembered after the air clears.

*(147 chars)*

### `the-town/the-tier-lattice` · slot `lattice` · source `LOGOS/tiers.md`
> value: **blue binds, green is yours, yellow contests, gray drafts**
>
> Blue binds everyone without stamps, green is sovereign on its own ground,
> yellow binds only when staked, and gray is written down but binds no one.

*(147 chars)*

### `the-town/the-edit-law` · slot `editing` · source `LOGOS/edit-law.md`
> value: **consent is stamped when the edge is made**
>
> Law above you binds you; a peer moves you only if you said so when the edge was
> made, and the default is to stay. Deleting never takes the children.

*(148 chars)*

### `the-town/the-conflict-rows` · slot `conflict` · source `LOGOS/conflict-matrix.md`
> value: **geometry detects, the class-pair rules**
>
> Overlap is not a verdict — what it means depends on what met. Ground shares,
> claims contest by stake, dwellings never, and an unruled pair bounces.

*(147 chars)*

---

## 5 · Lint verdict

```
$ node tools/mark-lint.mjs
Linted 587 mark(s) under WORLD/marks.

CLEAN — every mark is well-formed and no edge lies.
```

Also green: `node tools/marks-fold.mjs --no-write --json` folds with
`"errors": []`, and `npm test` passes 173/173.

### Does the lint accept `source:`?

**Yes — silently, and that is the problem.**

`parseRecord` (`tools/marks-fold.mjs:57`) has no field allowlist: it takes every
`key: value` line into the record. `mark-lint.mjs` only reacts to two unknown
fields (`household` and `mark`, the legacy pair) and ignores the rest. So
`source:` parses into `rec.source`, nothing objects, and nothing checks it. It
also does not collide with anything: no tool reads `.source` off a mark record,
and the office reuses the world's own `parseRecord`.

The drafts keep the field, as instructed. But *silently accepted* is not *known*,
and the whole point of a rendered article is that it **cannot lie**. That
guarantee needs a lint extension that does not exist:

- **L-source-1** — a `source:` must name a path that exists in the repo. A
  charter article pointing at a deleted doc is a dangling edge, exactly the class
  §1.5 of the proposal names.
- **L-source-2** — only `tier: constitution`, `by: the-town` marks may carry
  `source:`. A resident mark claiming to render logos law is a
  privilege-escalation shape, however benign it looks.
- **L-source-3** — the fidelity check itself: the article's claim must still be
  found in its source. This is L5 generalized and it is the hard one; §2.10's
  version-and-freshness arithmetic ("what has an edge into this doc and predates
  its current version") is the tractable first cut.

Until at least L-source-1 ships, `source:` is decoration. Recommend L-source-1
and L-source-2 land with Stage 0 — both are a dozen lines — and L-source-3 with
the store.

---

## 6 · Open questions for the pen

1. **The tiers contradiction** (§3.2) — the one blocking call.
2. **`the-kinds` / `the-tiers` naming** (§3.1) — keep the new slugs, or rename the
   incumbents and pay the `cite()` edits.
3. **Root or under `the-record`?** All five articles are drafted at the root, as
   briefed and as the two-channel ruling says. But `the-record` already holds
   `the-kinds`, `the-tiers`, `the-gate`, `the-rivalry`, `the-sovereign-interior` —
   the new five are their obvious siblings, and splitting kindred law across two
   homes is the kind of thing that reads fine today and confuses everyone in six
   months. Binding-wise the two placements are identical (`the-record` is itself
   predicated on the root, and the continuation law gives it the root's extent
   whole). This is a legibility call, not a legal one.
4. **Amber or yellow?** `README.md` and `spectator/viewer.mjs` say **amber**; dial
   2 says **yellow**. One vocabulary, two words.
5. **Does `tier:` on disk become a colour?** `mark-lint.mjs` accepts exactly
   `constitution | sovereignty | market`. Renaming the values is a full-tree
   rewrite plus a lint change plus every reader; keeping them and treating the
   colours as the lattice's names is nearly free. The dial says "one settlement
   commit," which fits either. Unresolved pending receipt.
6. **Gray vs. the sketchbook.** Draft-as-a-place carries a *privacy* guarantee
   (`the-record/the-sketchbook`) that draft-as-a-tier does not. Promoting draft to
   a tier must not quietly trade privacy for non-bindingness.
7. **Who may set a propagation policy other than the default, and may it change
   later?** "Stamped at edge birth" implies never; nothing says so.
8. **How is the conflict matrix indexed** — by class-pair, by tier-pair, or both
   with the stricter winning? The four v0 rows mix the two.
9. **Where do the class marks stand?** The Keeping Works is named as the physics
   quarter but exists only on the local 2026-08-01 seeding branch, not on `main`.
   Stage 0's articles do not need it; the class marks do.
10. **`MARKS.md` has no home** (§3.3).
11. **The article-fidelity lint does not exist** (§5). Everything in
    `three-layers.md` § *Two kinds of world-law* is written in the present tense
    about a guarantee that is currently aspirational.

---

## 7 · One thing I chose not to do

I did not touch `the-record/the-tiers`, `mark-lint.mjs`, or any existing mark.
Amending live constitutional law and editing the gate that enforces it are both
founders' acts, and the brief's lane is drafts. Where doing the briefed thing
would have produced a lint error or a contradiction in the tree, I drafted the
nearest honest thing and wrote the collision down here rather than deciding it.

---

## 8 · Two agents, one worktree — logged

**A second agent was working this same brief, on this same branch, in this same
worktree, at the same time.** I did not know that until after the fact, and it
cost real work.

What I saw: partway through, tracked edits reverted and untracked files vanished.
`git reflog` showed a `reset: moving to HEAD` I never issued, and my five mark
directories plus six `LOGOS/` docs were gone — which takes a `git clean` as well
as a reset. I ruled out the office's leased worktree pool (`world-pool.mjs` does
hard-reset and clean on lease, its rule 3, but its slots are `wt-N` under
`<clone>-pool`, which does not exist on this box), rewrote everything from
context, and committed immediately.

What actually happened, visible only once the commit landed: commit `8de11b1`,
*"LOGOS: the word above the world — nine docs"*, authored 18:27:21 by the same
git identity I commit under. It swept up my six rewritten law docs together with
two docs of its own (`state-and-time.md`, `reads-and-affordances.md`) and its own
`INDEX.md`, which replaced mine. My commit `7876f81` then added what was left.

So the branch is a merge of two hands that never spoke. It reads coherently —
the two extra docs are good and fill real gaps (state/time and the apex verb) —
but nobody reconciled them, and the seam showed up as two dead pointers in
`INDEX.md` that neither of us would have shipped alone.

Three things worth taking from it:

- **A commit survives `reset --hard HEAD` and `clean`; a working tree does not.**
  Commit early when other hands may be near.
- **Whoever dispatched two agents at one branch should know it happened.** The
  merged result needs one reading eye over it, because no author saw the whole.
- If more Stage 0 work is coming, give each agent its own branch. Nothing here
  needed to be shared.
