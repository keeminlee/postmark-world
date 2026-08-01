> **ARCHIVED 2026-08-01** — working log, retired in the solidification pass.
> Settled calls live in the shipped code + root README; open at archive time:
> C10, C13, C20 (held for Keemin — see `_archived/README.md`). Do not edit.

# CALLS — walk P2 rough draft

Every judgment the rulings did not cover. **All of it is PROVISIONAL by
construction** — Keemin adjudicates from this ledger. Each entry: what I chose,
what else was on the table, why, and how reversible it is.

Branches: `postmark-world-jetto` / `office-jetto`, both `walk-p2-draft-jetto`.
Nothing pushed to any main. No box, no pin, no deploy.

**Read C21 first if you are reading C3/C4/C8/C10:** the water gate is OFF for v0 by
Keemin's ruling, so those four describe a mechanic that is present and correct but
not currently consulted by the walk door.

**C3's sea exception has since CLOSED** (C25) — the sea carries extracted geometry and
the oracle is whole. C3 still describes why it was open.

---

## C1 · Retiring the `slot: home` predicates — delete the mark, don't tombstone it

**Chose:** removed the 26 predicate directories outright from `WORLD/marks/`.
**Considered:** (a) an `_archived/` tombstone per the Starforge furniture law,
(b) leaving them with a `retired: true` field, (c) delete.

Went with delete because the *record* is the world's state, not its history — the
fold recomputes everything from `WORLD/marks/`, so a tombstone would either fold
into the world (defeating retirement) or need a new "ignore me" field the fold
must learn. Git holds the 26 files exactly as they were; that is the archive.
**Reversible:** one `git revert`.

**Near-miss worth naming:** a naive `grep -rl "slot: home"` matches **27** files
— the 27th is `aelyria/wild-architecture` carrying `slot: home-style`, a
character predicate that must survive. I matched `^slot: home$` anchored. A
substring match here would have silently eaten an unrelated mark.

Receipts: fold 270 → 244 marks, **26 parcels intact, 0 errors**; `mark-lint`
CLEAN at 244; engine suite 37/37.

## C2 · `homeCoords` resolves to the parcel's CENTRE

**Chose:** handle → household parcel → the parcel rect's centre point (`at`),
which is what `world-state.json` already stores per parcel.
**Considered:** the parcel centroid (identical for a rect), a named "door" point
on the footprint edge, or keeping the house mark's own `at`.

Ruling 7 says the null walk-target is "the parcel footprint". A footprint is an
area and a walk needs a point, so something must pick one. The centre is the only
choice that needs no new authored data and is stable under the parcel moving.
**Consequence to notice:** for the 26 placed households the centre is within
12.5 m of the old house coordinate (parcels are 25×25 centred on their houses
after ruling 6's revert), so this is a sub-metre-scale change in practice, not a
relocation. **Reversible:** one function.

**Open for Keemin:** arriving at a home probably wants to mean "on the ground",
not "at the exact centre pixel" — an arrival tolerance is C6.

## C3 · Water oracle geometry — capsules and ellipses, sea excluded

**Chose:** `waterAt(x,y)` is true when the point is inside any of:
- a **capsule chain** for `centerline_m` features (`channel`, `still-water`,
  `still-inlet`): for each consecutive pair, distance to the segment ≤ the width
  interpolated between the two endpoints' `w_m`, halved. Round joins fall out of
  using per-segment capsules, which also matches `round_end: true`.
- an **ellipse** for `lake` (`center_m` + `rx_m`/`ry_m`), normalised radius ≤ 1.

`the-sea` is **excluded** — it has no edge geometry (its own note says the
shoreline lives in the atlas COASTLINE). Ruling 4 names this as the v1 exception;
the gate covers inland water only. **A walker can therefore walk into the sea in
this draft.** Named, not hidden.

**Considered:** rasterising to a grid (rejected — the design law is pure
functions, and a raster is a second source of truth that can drift from the
skeleton), or per-point widths as a single mean width (rejected — the channel
varies 200→495 m, so a mean would both over- and under-gate).

**Reversible:** the module is additive and consumed only by the walk gate.

## C4 · `segmentCrossesWater` — sampled, not analytic

**Chose:** sample the leg at a fixed step (**25 m**, and always both endpoints)
and report a crossing if any sample is in water.
**Considered:** exact analytic intersection against every capsule and ellipse.

Analytic is the "right" answer and I did not build it, deliberately: the exact
version is a page of segment-capsule and segment-ellipse intersection with its
own edge cases, and this is a rough draft whose job is to make the gate legible.
25 m against a minimum water width of 110 m (the inlet's narrowest `w_m`) cannot
miss a crossing of inland water — the narrowest thing in the record is 4.4
samples wide. **Where it is wrong:** it can miss a *tangential clip* of a
water body's very tip, and it costs O(length/25) work per leg.

**Reversible:** same signature, swap the body. The step is a named constant.
**For Keemin:** if the gate ever needs to be legally exact rather than
practically exact, this is the line to replace.

## C5 · Movement ledger format and location

**Chose:** `WORLD/walk-ledger.md` in the world repo — an append-only markdown
file, one line per departure, mirroring the town's mail-ledger register:

```
- <iso-utc> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional-crossing>[ · to <mark-id>]
```

**Considered:** JSON Lines (`.jsonl`), a JSON array in `world-state.json`, or a
per-resident file.

Markdown-with-a-grammar because it is the town's existing idiom for append-only
records (mail ledger, stamp ledger), a resident can read it without tooling, and
a regex parse is the proven shape here. JSON array was rejected outright: it
requires a read-modify-write of a shared file, which is exactly the concurrency
the append-only line avoids. Per-resident files fragment the derivation.

`toward` carries **coordinates always**, and the optional trailing `to <mark-id>`
records *what was asked for* — so the record keeps intent without making
derivation depend on resolving a mark id later (a mark could move or retire).
**Reversible:** the file is new; nothing reads it yet but the derivation.

## C6 · Fractional crossing, and what "arrived" means

**Chose:** `fractionalCrossing(nowMs)` = whole crossings elapsed plus the
fraction of the way through the current one, from the same epoch the engine's
`currentCrossing()` already uses. Position = linear interpolation from `from`
toward `toward` by `(nowFractional − departedAt) × 15 km` clamped at the
destination. **Arrived = the clamp engages** (elapsed distance ≥ leg length);
there is no arrival event and nothing is written on arrival.

**Considered:** an explicit arrival record written by a cron or the next reader
(rejected — it makes position stateful and gives the ledger a second writer,
against the design law), or an arrival *tolerance* radius.

**Deliberately unresolved and flagged:** whether standing at a home should mean
"within the parcel footprint" rather than "at the centre point" (see C2). The
draft says at-the-point; the moment arrival needs to read as *being somewhere*
rather than *at a coordinate*, footprint containment is the better rule and the
parcel rect is already the right shape for it.

## C7 · Extent cap for mark targets (ruling 3 left the threshold to build)

**Chose:** refuse a mark target whose `max(extent.w, extent.h) ≥ 2000 m`.
**Considered:** a fraction of world scale, an area cap, or per-tier caps.

Reasoning from the record rather than taste: the ruling's intent is "you cannot
walk to something so large that the destination is meaningless." Sorted by
extent, the record has a clean gap — houses and benches are tens of metres,
districts run 1,725–2,325 m, and then `let-there-be-light` is 320,000 m. 2,000 m
admits every house, grove and terrace, and excludes the district-scale marks
where "walk to it" has no single answer. **It is a filter on a continuum, so it
will be wrong at the margin by construction** — that is why it is one named
constant, `WALK_TARGET_MAX_EXTENT_M`.

**For Keemin:** the honest alternative is *no* cap plus walking to the nearest
boundary point, which is the deferred walk-to-region bronze. The cap is the
cheap stand-in until that lands.

## C8 · Nearest crossing named in the bounce

**Chose:** on a water refusal, compute the nearest crossing by straight-line
distance from the **departure point** and name it with its coordinates.
**Considered:** nearest to the blocked sample, nearest to the destination, or
listing all three.

From the departure point, because the bounce's job is "go here first" and the
resident is standing at the departure. **Known wrong case:** for a long leg
blocked near its far end, the crossing nearest the *start* may be a detour
backwards — nearest-to-the-blocked-sample would advise better. I chose the
simpler rule for the draft and am naming the flaw rather than hiding it.

Crossings are read from the skeleton by kind (`narrow-footbridge`,
`stepping-stone`, and any feature whose id ends `-crossing`), so a seeded Town
Centre crossing is picked up without a code change.

## C9 · The demo dot — a scrubbable clock, no new office endpoint

**Chose:** the local spectator serves `GET /api/walks?at=<fractional-crossing>`
(derived positions for every departure on record, computed server-side), and the
viewer draws them on the painting, polling every 15 s while live.
**Considered:** deriving in the browser from a served ledger (rejected — it
duplicates the clock and interpolation in a second language, exactly the drift
the design law forbids), or a websocket (gold-plating a draft).

Deliberately **not** a new office door: P3 owns the real overlays, and the
spectator is read-only-by-construction, so a derived-read endpoint there costs
nothing at the office and can be thrown away.

**The `?at=` scrub is not a nicety — without it the demo cannot be judged.**
15 km per 12-hour crossing is about **0.35 m/s**, so on a live clock the dot is
visually motionless and a viewer cannot tell a working walk from a broken one.
Scrubbing is not simulation: derivation is pure, so a scrubbed frame is exactly
what that instant will really hold. The panel labels the scrub so nobody mistakes
a projected frame for now.

**Reversible:** spectator-only, additive, not on the office's surface at all.

---

# Calls made *during* the build (found by probing, not by reading)

These six came out of running the thing rather than designing it. Four are
defects the draft had and no longer has; two are gaps I could not close.

## C10 · Crossings are how you get over — and the record cannot yet say where

**The defect:** the first cut of the water gate had no crossing exemption at all,
which made water **absolutely impassable**. Worse, it made the bounce's own advice
impossible to follow: the hint says "cross at `blackwater-bend-footbridge`, then
walk onward", but the bridge point *itself* reads as water, so a walker could
neither reach a crossing nor step over one. Bridges were furniture. Ruling 4 says
water is an **obstacle**; it does not say water is impassable.

**Chose:** a water sample is walkable if it falls within a recorded crossing's
*reach*, where reach = (crossing's distance to the water's spine) + (the water's
local half-width) + 40 m margin. Derived from the water, not a magic constant — a
bridge spans the water it stands on.
**Considered:** a fixed radius (rejected — pure invention), or exempting only the
exact crossing point (useless, since a 25 m sample step steps straight over it).

**The gap I could not close, and it is a record gap, not a code gap:** a crossing
is recorded as a **bare point with no span and no orientation**, while the water
it crosses runs 110–550 m wide. That is not enough geometry to model a bridge. So
the exemption is a **disc, and a disc over-permits**: any leg through water within
the reach counts as having used the crossing, even one that never approaches it.
**Observed in the probe:** a 695 m leg passing 300 m south of the footbridge
"crosses at" it without going near it.

**What would fix it properly:** give a crossing two endpoints (a span), so the
exemption becomes a **corridor** and "cross at the bridge" means what it says.
That is an authored-record change. Until then the disc is a stand-in, and it is
strictly better than water nobody can ever cross.

**For Keemin:** this is the one call in this ledger I would not ship to residents
as-is. It is honest as a draft and wrong as a rule.

## C11 · The fold must publish parcels — a silent fallback hid a total failure

**The defect:** ruling 7's `homeCoords` read `world.parcels` off the assembled
fold. `assembleWorld` published `marks, terrain, heightfield, light, fogCeilingM`
and **never published parcels**, so the lookup returned null for everyone and
*every walker in the town silently started at the quay* instead of on their own
ground. A comment I wrote asserting the fold "already publishes parcels" was
simply false.

**Why it hid, which is the part worth keeping:** `homeCoords` has a legitimate
"no ground yet → the quay" branch, so complete failure was indistinguishable from
ordinary behaviour for an unplaced resident. Nothing looked wrong. It surfaced
only because a water-gate probe reported a distance that implied the wrong origin.

**Chose:** `assembleWorld` publishes `parcels` (a pass-through of the record).
**Considered:** having the office read `w._raw.worldState.parcels` (rejected — it
reaches around the fold and makes the office depend on raw JSON shape rather than
the engine's published contract; ruling 7 makes the parcel first-class, so the
fold is where it belongs). The spectator gets parcels for free either way.

**The lesson encoded in `tools/parcels-fold.test.mjs`:** when a fallback is
indistinguishable from success, the contract feeding it needs a test that can fail
loudly. Nothing tested `assembleWorld`'s output shape at all — that is why. I
verified the guard by removing the fix: 4 of 5 tests fail without it.

## C12 · One writer of the walker vocabulary

**The defect:** the office door and the spectator each hand-wrote the mapping from
derived position to published walker, and they drifted **immediately** — the
spectator emitted `remainingM` while the office emitted `remaining_m`, so the
viewer read `undefined` and drew walkers with no distance or ETA.

**Chose:** `publicWalker` / `publicWalkers` in `tools/walk.mjs` are the single
writer of that shape; both readers map through them. A test pins the exact key
set, so a rename cannot silently break one reader and not the other.
**Considered:** fixing the casing in both places (rejected — that fixes the
instance and leaves the class; two hand-written mappings of one concept will drift
again).

## C13 · The door reads the wall clock, with no injection point — a testability gap

`walkViaOffice` calls `fractionalCrossing()` directly. That is right for
production (a departure happens *now*) but it means **no multi-leg journey can be
exercised without waiting real hours**: a 5.5 km leg takes 0.37 of a crossing,
about 4.5 hours, and the next leg legitimately departs from the *derived*
position, which is still a metre from the start.

I probed around it by backdating a ledger line by hand, which proved the chain
works — arrival at the staging point, then a 695 m leg that crossed at the
footbridge and named it. But that is a probe, not a test.

**Not fixed, deliberately:** the fix is a seam (an optional `at` the door ignores
unless a test passes it), and adding a clock override to a **credentialed write
path** is exactly the kind of thing that wants review before it exists, not after.
Flagged rather than built.

## C14 · Demo data is local-only and must never be committed

`tools/walk-demo-seed.mjs` writes `WORLD/walk-ledger.md` so the spectator has
something to draw, and `--rm` deletes it. **I did not commit the file it writes.**

The reasoning matters more than the choice: the ledger is a **real record** in
production, and the seeded lines name real residents who never declared those
departures. A fabricated line in a real record is a lie about what someone did.
Committing convenient demo data into a record surface is the kind of thing that is
harmless right up until someone reads it as true. The header the seed writes says
so in the file itself.

Two demo-shaping calls, both of which failed on the first attempt and were fixed
by looking at the page rather than the code:
- **Legs must be long.** 3 km legs finish in 0.2 of a crossing, so the first seed
  produced a map where everyone had already arrived — nothing to watch.
- **Legs must stay inside the painting.** The second seed picked the farthest dry
  leg it could find (up to 22 km) and put **6 of 7 walkers off-screen**, even
  after "fit". It now takes the farthest dry leg that still lands within the
  inhabited bounds.

## C15 · Published numbers round in one step

`etaCrossings` was `round1(remainingM / 15000 * 10) / 10` — two divisions — and
`107/10/10` is not `1.07` in binary floating point. The walkers API was
publishing `eta_crossings: 1.0699999999999998`. Now a single `round2`. Trivial,
but it was going out of a public door, and a test pins it.

---

## What the probe proved, and what it did not

**Proved end to end**, against the live record through `walkViaOffice`: home
resolves to the walker's own parcel; a mark target resolves, and bounces when it
is unsited, constitution-tier, over the extent cap, or absent; a departure appends
one line and commits; position derives and advances; `world_walkers` publishes it;
a scope violation 403s; open water refuses and names the water; a leg through a
crossing is permitted and names the bridge; a control leg across the same channel
7.6 km from any crossing still refuses.

**Not proved:** anything on the box (nothing was deployed); the office's own
`homeCoords` under test (the office suite pins `WORLD_CLONE` to a nonexistent path
by design, so ruling 7's resolution is guarded in the world repo instead —
`tools/parcels-fold.test.mjs` — and not in the office suite where the function
lives); a real elapsed-time journey (C13); the sea (C3).

**A correction I owe this ledger:** I twice reported a "defect" from reading only
the tail of a probe's output, and once nearly reported three door bugs that did
not exist — my probe was calling `to:`/`toward:`/`stop:` while the declared schema
is `mark_id`/`x`/`y`/`handle`, and `additionalProperties: false` would have
rejected my keys at the MCP layer. Reader and schema agreed all along. Checking
the declared contract before believing my own probe is the habit that caught it.

---

# The water true-shape pass, and the v0 gate-off

Two Keemin-directed items stacked on the walk draft. **The containment table below
is the pass's real content and the thing to adjudicate** — everything else serves it.

## C16 · The rings are GENERATED, and validated against the oracle

`tools/water-shapes-gen.mjs` polygonizes the same geometry `tools/water.mjs`
formalizes: centreline features become a polyline buffer (each side offset by the
interpolated half-width, ends capped with arcs), lakes become ellipse polygons. It
imports that module's feature selection and half-width rather than restating them,
so there is one definition of where the water is and the ring is merely its outline.
A hand-typed ring would be a second definition, drifting the moment either moved.

**Chose:** generate, write `points:` into the record, and recompute `at`/`extent` as
the bbox of the ROUNDED ring — round first, then measure, so `ringMatchesClaim`
holds exactly rather than spending its 0.5 m tolerance.

**The check that made this trustworthy, and it is the part worth keeping:** the
generator validates the drawing against the oracle in BOTH directions —

- *over-claim*: is every point inside the ring actually water?
- *under-claim*: is every point the oracle attributes to this feature inside the ring?

Either alone is worthless (a huge ring passes under-claim; a tiny one passes
over-claim). It is now a committed test, `tools/water-shapes.test.mjs`, at a 2%
tolerance in each direction.

**Two things the check caught that reasoning had waved past:**

1. **My first self-check was the bug, not the rings.** It asserted `waterAt(p) ===
   featureId` and reported 26 of 48 failures for the garrison lake — a
   mathematically exact ellipse. The water bodies genuinely OVERLAP, and `waterAt`
   returns the FIRST match, so the oracle answers "the-main-channel" at the lake's
   own centre. The right question is "is this water at all", not "is this feature".
   *A failing check is a claim about two things, and the checker is one of them.*
2. **Averaged joint normals pinch at bends.** Under-claim measured 6.7% of the inlet
   and 3.2% of the still reach falling outside their own rings. Fixed with a mitre
   (the corner sits at `r / cos(half-turn)`, and for unit normals `|n1+n2| =
   2cos(half-turn)`, so the factor is `2/|n1+n2|`), clamped at 2.5 so a near-hairpin
   cannot throw a spike into the claim bbox. Result: every ring now within 1.1% in
   both directions, at the cost of 0.4–1.0% over-claim where it had been 0.
   **Small in both beats zero in one and 6.7% in the other.**

**The quay-reach is NOT ringed, and that is not a preference.** It carries no
`feature:` field and the skeleton has no `the-quay-reach` feature, so there is no
geometry to polygonize — nothing to draw from, rather than a choice not to draw.
Ringing it would mean AUTHORING a shape, which is a different act from generating
one and is Keemin's to direct.

## C17 · Too big to RASTERIZE is not too big to ANSWER — the pass nearly did nothing

**The defect, and it would have swallowed the entire pass:** writing the rings
changed the tree by only 6 marks, and the channel — the whole reason Keemin asked —
lost just 1 of its 8 children. The town centre, a 2000×1500 m district, still
reported as "inside" a ~470 m-wide river.

`marksContain` rasterizes at 5 m cells and `coverage()` returns null past a cell
cap. The channel's ring spans 3873 × 10425 m — about **1.6 million cells** — so
coverage returned null and the code did this:

```js
if (!outerCells) return contains(rect(outer), rect(inner)); // ← the bounding RECT
```

It fell back to the rectangle. **Giving the water a true shape was silently
discarded for exactly the mark whose rectangle was the problem** — the bigger and
more wrongly-shaped a claim, the more certainly its true shape was ignored.

**Chose:** when the outer carries a ring but cannot be rasterized, test the inner's
cell centres against the ring analytically. Same predicate, no raster, no cap. Plus
an early bail once the miss count exceeds the tolerance, because `placementParent`
asks this of every candidate parent for every mark — the fold still runs in ~2 s.
**Considered:** raising the cell cap (moves the cliff, doesn't remove it) and an
adaptive cell size for large marks (a second accuracy regime keyed on size).

With it, the channel loses all 8 children and the diff becomes 13.

**This is the third silent-fallback defect in this branch** — the fold not
publishing `parcels`, `loadStakes()` reading a path that never existed, and now
this. All three degraded to a plausible answer with no signal. The shelf line: *when
a fallback is indistinguishable from success, the contract feeding it needs a test
that can fail loudly* — and the guard here asserts the precondition too (`coverage`
of the channel MUST still be null), so the test cannot quietly stop guarding.

## C18 · The containment table — 13 marks re-homed

`tools/containment-diff.mjs` computes each mark's `placementParent` from the record
before and after, so this is derived from the same function the fold and the placer
use, not read off directory names. `tools/rehome-plan.mjs` executes the moves.

| mark | parent before | parent after |
|---|---|---|
| `the-town/the-town-centre` | `the-town/the-main-channel` | (root) |
| `caelum/evermoon` | `the-town/the-main-channel` | (root) |
| `spar/the-doubled-coast` | `the-town/the-main-channel` | (root) |
| `sol-of-garrison/the-protected-grove` | `the-town/the-main-channel` | (root) |
| `the-town/the-harbor-reach` | `the-town/the-main-channel` | (root) |
| `the-town/blackwater-bend-inlet` | `the-town/the-main-channel` | (root) |
| `the-town/blackwater-bend-grove` | `the-town/the-main-channel` | (root) |
| `the-town/blackwater-bend-stone-path` | `the-town/the-main-channel` | (root) |
| `the-town/the-old-course` | `the-town/the-still-reach` | (root) |
| `finn/the-still-reach-parcel` | `the-town/the-still-reach` | (root) |
| `jetto-of-starforge/the-waystation-parcel` | `the-town/the-still-reach` | `carta/the-long-run` |
| `lysander/the-jetty` | `the-town/the-lochan` | (root) |
| `merrick-nocturne/the-house-at-blackwater-bend-parcel` | `the-town/blackwater-bend-inlet` | (root) |

Leaving: the main channel **loses 8**, the still reach 3, the lochan 1, the inlet 1.

**Eleven of thirteen land at the ROOT**, which is the honest consequence: districts
like the town centre and Evermoon are top-level things that were only ever filed
under the river because its rectangle reached them. Nothing else contains them.

**Order was the difficulty, not the moves.** A directory move takes its children
with it, and merrick's house parcel sat *inside* the inlet while both were leaving —
moving the inlet first would have carried the parcel along and re-homed it wrongly
while looking clean. The planner sorts deepest-path-first and recomputes each
destination from the parent's location *at the moment of the move*.

**My own diff tool reported four of these as `(absent)`** — `tree[id] ?? "(absent)"`
collapses "parent became null (the root)" into "the mark is not in the tree", and
`(absent)` on a table Keemin reads means *the mark vanished*. Fixed with an explicit
`Object.hasOwn` check. *A nullish default erases the difference between "the value is
null" and "there is no value", and those are different facts.*

### The telling changes, as ruled correct

Standing where the old rectangle reached but the water does not:

| standpoint | before | after |
|---|---|---|
| the Trueing Terrace (575,−2600) | within the-main-channel | **not** |
| the Lanternseed Gardens (1150,−1400) | within the-main-channel | **not** |
| Ferry's crossing (−190,0) | within the-main-channel | within the-main-channel |

The third is not a failure: Ferry's crossing genuinely sits *on* the water, so the
line correctly persists there. The town centre's *district* left the channel's tree;
a standpoint in the middle of the crossing is still standing on the river.

### The FOV silhouette path, exercised for the first time

No record had ever carried a ring, so `markSilhouetteSpan` had never run. It does
now, and it is direction-dependent as designed: the channel subtends **10425 m**
viewed across and **3873 m** viewed along — where extent-as-width gave 10425
regardless of where you stood.

## C19 · Three houses were already mis-filed, and 22 more still are

Lint went red on three marks my diff had not predicted: `finn/the-still-reach`,
`jetto-of-starforge/the-waystation` (my own house) and
`merrick-nocturne/the-house-at-blackwater-bend` — 12×12 m houses whose directories
nested them inside WATER.

They were invisible to the diff because `placementParent` answers *their parcel*
both before and after, so nothing changed; the DIRECTORY was the thing that lied.
And they had passed lint for the whole parcel era because **lint asks "does my
directory parent contain me", not "is my directory parent the smallest container"** —
a house inside its district is contained by its district, so the edge told no
detectable lie. Only when the water stopped containing them did it surface.

**Chose:** move those three into their own parcel directories, which is what the
geometry says. They are the three my pass broke, so they are mine to fix.

**Then the survey, which is the real finding: 25 marks have directory-parent ≠
geometry parent, and the pattern is systemic** — nearly every house in the town is
filed under its district or region while `placementParent` says it belongs inside
its own parcel. The parcels landed and the houses were never re-homed under them.

**NOT fixed, deliberately.** Re-homing 22 more directories restructures most
resident trees, is not what Keemin asked for, and would bury this pass's 13-row
table in noise. It is also not caused by this pass — it predates it. Two follow-ups
for Keemin, and I would take the second:

- re-home all 25 so the tree matches geometry (a large, mechanical, reviewable diff), or
- **strengthen lint** to compare the directory parent against `placementParent`
  rather than mere containment, which would have caught all 25 the day parcels
  landed. A gate that only detects the *loudest* form of a lie lets the quiet form
  accumulate for weeks.

Also noted while there: **lint's nesting check only covers `kind === "sited"`**, so
mis-filed *parcels* raise no error at all — which is why lint flagged 6 while the
containment diff found 13.

## C20 · Two marks name features the skeleton does not have

`the-town/pando-peak` carries `feature: pando-peak` and
`the-town/the-town-centre-crossing` carries `feature: the-town-centre-crossing`, and
**neither id exists in `WORLD/skeleton.json`**. Nothing validates a `feature:`
reference, so these are dangling. Pre-existing, unrelated to this pass, untouched —
but worth knowing, because a dangling `feature:` reads as "this mark has real
geometry" to anyone who checks the field and not the skeleton.

It also means the town-centre crossing is **not** a crossing the water oracle knows
(`crossings()` reads the skeleton), which softens the C8 claim that a seeded Town
Centre crossing would be picked up without a code change: it needs a skeleton
FEATURE, not a mark.

## C21 · v0: the water gate is OFF

Keemin: *"walking on water is fine for v0 lol."* The refusal is removed from the
walk door — one check site in the office's `walkViaOffice`.

**Removed the CHECK, not the capability.** `tools/water.mjs` and its conformance
corpus stay in the world repo, still exercised by their own tests and now also by
the shape generator that draws the record's rings from them. The oracle keeps being
true about where the water is while nothing refuses you for entering it; turning the
gate back on is restoring one block, not rebuilding the maths.

What survives, because it is telling rather than gating: a leg still reports the
crossings it passes over (`via_crossings`).

**Two earlier calls go dormant with it, and the distinction matters:**

- **C8** (which crossing a bounce should name) has no bounce to attach to.
- **C10's disc problem is MOOTED, not SOLVED.** The record still cannot say where a
  crossing spans — a crossing is a bare point, the water is 110–550 m wide — and
  that gap returns intact the moment the gate does. The ruling removed the
  consequence, not the cause.

I also corrected the `world_walk` tool description, which still advertised "a leg
that crosses water is refused". A door describing a gate it no longer has is worse
than no description: it is the kind of stale promise a caller builds against.

## C22 · The painting had to be taught the ring too

Keemin's complaint was VISUAL — *"tired of the gigantic main channel rectangle"* —
and the record having a true shape does not make the painting show it.

Two footprint renderers existed and only one honored rings. Grid-true already drew a
`points:` ring as a `<polygon>`; the painting's own footprint layer
(`buildFpLayer`) drew `<rect>` unconditionally. So after the whole pass the same
record rendered as a river in one view and a **slab over half the town** in the
other, and the view Keemin looks at was the rectangle one. The pass would have been
correct and invisible.

**Chose:** the painting draws the ring when a mark carries one, matching grid-true.
Verified with my own eyes: 5 polygons, the channel from all 80 vertices, land marks
still rects.

**One thing that came with it:** `syncWithin` selected `rect[data-id]` to weight the
marks a standpoint stands inside — so a ringed mark could never receive it. The water
marks are exactly the ones you are most often *within*, so the containment highlight
would have silently skipped the only marks that changed shape. Now `[data-id]`.

**The general shape, and it is the fourth of this family on the branch:** *a
capability added to a record is not added to its readers.* The ring existed in the
record, the engine's silhouette path read it, grid-true read it, containment (after
C17) read it — and the painting did not. Each reader is its own contract.

---

# The sea enters the record (extracted from the atlas COASTLINE)

## C23 · Extracted, not authored — and the extractor is where the coast already lived

`world-terrain-gen.mjs` gained `COASTLINE` extraction beside the water constants it
already pulls from the atlas's own `render-town.mjs`, and the sea feature now carries
`ring_m`. The mark's `points:` is a copy of that same ring, so **one geometry from
one source**: edit the coast in the atlas, re-run the generator, and both the
skeleton and the record move with it. A guard asserts mark-ring === skeleton-ring
point for point, because the failure mode worth preventing is the record and the
oracle disagreeing about where the sea is.

The closure is the atlas's own, not mine: `renderSea()` fills the coast path closed
with `L(MAP_W+5, MAP_H) L(-5, MAP_H) Z`, and the extractor reproduces exactly that
rather than inventing a second definition of "out to the map's edges". 51 coastline
points + 2 closing corners = a 53-point ring, `7550 × 5000 m` at `1325,5700`.

`ring_m` is a **third geometry vocabulary** beside `centerline_m` (channels) and
`center_m`/`rx_m` (lakes): a closed area, because that is what a sea is.

**A note the old record left for exactly this moment, now spent:** the sea feature's
note said *"shoreline geometry lives in the atlas's COASTLINE — extract when the
heightfield needs it."* The walk mechanic needed it before the heightfield did.

## C24 · `waterFeatures()` still means INLAND water — the sea is reached separately

The obvious move was to add `sea` to the kinds `waterFeatures()` returns. I did not,
because **three callers depend on that function meaning inland water**: the shape
generator rings exactly those marks, the sample-step proof reasons about their
widths, and the corpus counts them ("five inland water bodies"). Widening the set
would have quietly changed all three to fix one, and the fixture guard would have
gone red for a reason unrelated to what it guards.

So `seaFeature()` / `inSea()` sit alongside, and `waterAt()` consults both. Cheap,
and every existing contract holds unchanged.

**`waterAt` checks the sea LAST**, which is a decision and not an accident — see C26.

## C25 · C3's named exception has closed, and a test had to invert

C3 recorded the gap honestly: *"`the-sea` has no edge geometry — a walker can
therefore walk into the sea in this draft."* It has geometry now, so `seaGated()`
answers **true** and the oracle is whole.

That inverted a committed test. `"the sea is NOT gated, and says so"` asserted
`seaGated() === false` and that the sea carried no geometry — correct when written,
false now. **A test that pins a known gap has to be rewritten when the gap closes,
and that is the test working rather than breaking.** It now asserts the ring exists,
that open water south of the coast reads as `the-sea`, and that the northern uplands
still read dry.

**What closing the oracle's gap does NOT mean:** the v0 walk gate is off (C21), so
nothing refuses you for entering the sea either way. `seaGated()` reports what the
ORACLE knows, not what the door enforces. Those were the same claim while the gate
was on and are two claims now.

## C26 · The mouth is both river and sea — ruling 6, zero boundary authored

**Ruling 6: overlap is not conflict.** The channel's mouth lies inside the sea's
ring; both are constitution marks; no line is drawn between them, and none should
be. Verified as a committed guard rather than asserted: the last centreline point of
`the-main-channel` returns `inSea() === true` — the overlap is real, not notional.

The one decision the overlap forces: `waterAt` returns a single feature id, so when
a point is in both, **something has to answer first.** It answers `the-main-channel`,
because the inland bodies are the SPECIFIC claim and the sea is the surrounding one —
the general body should not swallow the named one. That is an ordering, not a
boundary; nothing is carved, and a future naming mark can still celebrate the mouth
as both, exactly as the ruling anticipates.

## C27 · No bay carved out — the atlas already ruled it, in its own words

Keemin's "maybe the bay for the Doubled Coast" was left to my judgment: seed it if
the coastline data makes it legible, ledger it if carving is authoring rather than
extraction.

**The atlas answers this itself, and the receipt is decisive.** The current
one-shore-one-sea design exists *because* of an earlier version that had a bay:

> This replaces what used to be three separate things that had to be kept agreeing
> with each other by hand — a west_sea blob, a rectangular southern sea, **and a bay
> cut in afterwards**. There is now one shore and one body of water, so the map
> cannot develop a seam between them.

Seeding the bay as its own ring would reintroduce precisely the seam that rule was
written to eliminate. The coastline runs *through* the bay (north up the western arm,
round the head, back down the eastern arm) as one continuous shore; a bay mark would
need a mouth chord across the horns, and **the atlas never drew that line.** Drawing
it would be authoring.

**So: not seeded, and residents may name it** — which is the shape Keemin set for
everything else on the coast anyway (item 3: residents fill in the rest). If the bay
should become a mark, its ring wants to be *drawn in the atlas first* and extracted
after, like every other shape here.

## C28 · Nothing re-homed into the water, and the reason is structural

The brief said: if the sea's ring swallows someone's home, **STOP and surface** rather
than re-home a resident into the water. Checked before writing anything:

- **All 26 parcels clear.** No resident's home is inside the ring or swallowed by it.
  Orion's own house and parcel sit at `-1725,4840`, outside.
- Three marks ARE geometrically inside it, all orion's and all **seaward features** —
  `eelgrass-coves`, `the-shingle-beach`, `the-tidal-race`. A shingle beach is the
  waterline and a tidal race is water; being in the sea is what they are.
- **Yet nothing takes the sea as its tree parent.** `placementParent` picks the
  SMALLEST containing mark, and those three sit inside `orion-by-the-fire/the-reach`
  (3 Mm²) which is ~12× tighter than the sea (37.75 Mm²).

**The general property, worth keeping:** the sea is the largest claim on the map, so
the smallest-container rule guarantees **it can only ever adopt an orphan** — something
nothing else contains. A very large mark is therefore *safe* to add to a record whose
tree keys on smallest-container, which is the opposite of the intuition that a big
claim swallows things. The channel's rectangle was dangerous because it was big AND
wrongly shaped; the sea is big and correctly shaped.

Both facts are now standing guards, so a future coastline edit that does drown a
parcel fails a test instead of quietly re-filing someone's home.

The containment diff for this step is one row: `the-town/the-sea` → **(root)**. It is
top-level, as Keemin specified.

## C29 · The ring is the canon; the art is roughened

Visual acceptance was "the sea polygon should trace the painting's own painted coast."
It does — verified by eye on the spectator with the footprints toggle, panned south
and zoomed onto the bay's arm.

They are not *identical*, and should not be: the atlas draws the coast as
`smoothPath(roughen(COASTLINE, "coast", 8))`, so the painted line carries up to
**8 atlas px ≈ 40 m** of deliberate hand-drawn jitter. I extracted `COASTLINE` raw.
**The jitter is the drawing's; the canon is the data's** — extracting the roughened
path would have baked a rendering flourish into the record and made the sea's shape
depend on a seeded noise function. The observed offset is that jitter and nothing
else.

## C30 · The town clone I read the atlas from was 55 commits stale

`render-town.mjs` — the file the coastline comes from — **had changed on origin**. I
read the current version out of the fetched ref rather than the working tree, and then
checked whether it mattered: the extracted COASTLINE hashes **identically** across
both, 51 points either way. The staleness would not have bitten this time.

Recorded because the check earning nothing is the point: *"the file changed"* was
true and *"the coast changed"* was false, and only comparing told me which. The
office's `town-clone` drifting stale is already on the shelf; this is the first time
it sat directly upstream of authored geometry.

I also verified the generator is faithful before trusting it to rewrite the skeleton:
regenerating from the current atlas reproduces the committed `skeleton.json`
**content-identically** (bytes differ only by line endings), so the sea's `ring_m` is
the only change it introduced.
