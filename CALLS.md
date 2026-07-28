# CALLS — walk P2 rough draft

Every judgment the rulings did not cover. **All of it is PROVISIONAL by
construction** — Keemin adjudicates from this ledger. Each entry: what I chose,
what else was on the table, why, and how reversible it is.

Branches: `postmark-world-jetto` / `office-jetto`, both `walk-p2-draft-jetto`.
Nothing pushed to any main. No box, no pin, no deploy.

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
