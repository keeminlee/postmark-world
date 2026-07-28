# RESULT — water true-shape pass, v0 gate-off, and the sea

Three passes now, stacked on `walk-p2-draft-jetto` in both clones. Local branches
only; nothing pushed, no box, no pin, no deploy. `CALLS.md` carries all 30 calls —
C16–C22 the true-shape pass, C23–C30 the sea.

## State

- `G:/postmark/postmark-world-jetto` — `walk-p2-draft-jetto`, base `origin/main` `7226607`
- `G:/postmark/office-jetto` — `walk-p2-draft-jetto`, base `origin/main` `31a98e1`

Gates, all green: **lint CLEAN at 244 marks** (`ringMatchesClaim` included), **fold
0 errors**, **world suite 73/73**, **office suite 120/120**, and the FOV silhouette
path exercised against the first real ring in the record.

## 1 · The water true-shape pass

`tools/water-shapes-gen.mjs` generates each water mark's `points:` ring by
polygonizing the geometry `tools/water.mjs` already formalizes — it imports that
module's feature selection and half-width rather than restating them, so the ring is
the outline of one definition of water rather than a second one. Five marks ringed
(main channel, still reach, blackwater bend inlet, the lochan, the garrison lake).
`at`/`extent` are recomputed as the bbox of the **rounded** ring, so
`ringMatchesClaim` holds exactly instead of spending its tolerance.

The generator validates itself against the oracle in both directions (over-claim:
is everything inside the ring water? under-claim: is all of this feature's water
inside the ring?), now committed as `tools/water-shapes.test.mjs` at 2% tolerance.
Every ring is within 1.1% both ways.

### The containment table — 13 marks re-homed

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

The channel loses all 8 of its children; the still reach 3, the lochan 1, the inlet
1. Eleven land at the root, which is the honest answer — the town centre and
Evermoon are top-level districts that were only ever filed under the river because
its rectangle reached them.

Telling changes, as pre-ruled correct: the Trueing Terrace and the Lanternseed
Gardens both lose "within the-main-channel". Ferry's crossing keeps it, correctly —
it genuinely sits on the water.

### The painting draws it, too

Keemin's complaint was visual, and the record having a true shape does not make the
painting show it. Two footprint renderers existed and only Grid-true honored rings;
the painting's `buildFpLayer` drew rects unconditionally, so the same record read as
a river in one view and a slab in the other — and the rectangle was the view he
looks at. The painting now draws the ring (verified by eye: 5 polygons, the channel
from all 80 vertices, land marks still rects). `syncWithin` also had to widen from
`rect[data-id]` to `[data-id]`, or the water marks — the ones you are most often
*within* — would never take the containment highlight.

## 2 · v0 gate-off

The water refusal is removed from the walk door (one site in `walkViaOffice`).
Removed the **check**, not the capability: `tools/water.mjs` and its corpus stay,
still exercised by their tests and by the shape generator. Verified end to end — a
leg into the middle of the channel is now permitted. A leg still *reports* the
crossings it passes over, because that is telling rather than gating.

C8 goes dormant (no bounce to attach to). **C10's disc problem is MOOTED, not
solved** — the record still cannot say where a crossing spans, and that returns
intact the moment the gate does.

I also corrected the `world_walk` tool description, which still advertised "a leg
that crosses water is refused."

## The three findings worth your attention

**The pass nearly did nothing, silently (C17).** Writing the rings moved only 6
marks, and the channel — the entire reason for the request — lost 1 of 8 children.
`marksContain` rasterizes at 5 m, `coverage()` returns null past a cell cap, and the
code then fell back to the outer's **bounding rect**. The channel's ring is ~1.6M
cells, so the true shape was discarded for exactly the mark whose rectangle was the
problem: the bigger and more wrongly-shaped the claim, the more certainly its shape
was ignored. Fixed by testing cell centres against the ring analytically when it
cannot be rasterized, with an early bail so the fold still runs in ~2 s. **This is
the third silent-fallback defect on this branch** (the fold not publishing
`parcels`, `loadStakes()` reading a path that never existed, and this).

**25 marks are mis-filed, 22 of them still are (C19).** Lint went red on three 12×12
houses nested inside water — invisible to my diff because `placementParent` says
*their parcel* both before and after, so nothing changed; the directory was the
liar. They had passed lint for the whole parcel era because lint asks "does my
directory parent contain me", not "is it the smallest container". I fixed the three
my pass broke (into their own parcels). The survey then showed the pattern is
systemic: nearly every house is filed under its district while geometry says its
parcel. I did not re-home the other 22 — it restructures most resident trees, isn't
what was asked, and predates this pass. My recommendation is the second follow-up:
**strengthen lint to compare the directory parent against `placementParent`**, which
would have caught all 25 the day parcels landed.

**My own self-check was the bug once, and my own diff tool lied once.** The
generator's first check asserted `waterAt(p) === featureId` and reported 26 of 48
failures for a mathematically exact ellipse — the water bodies overlap and `waterAt`
returns the first match, so the oracle names the channel at the lake's own centre. A
failing check is a claim about two things and the checker is one of them. Separately,
`containment-diff` reported four marks as `(absent)` because `tree[id] ?? "(absent)"`
collapses "parent is null (the root)" into "not in the tree" — on a table you read,
`(absent)` means *the mark vanished*.

## Residue

- The quay-reach is **not** ringed: no `feature:` field, no skeleton feature, so
  there is nothing to generate from. Ringing it would mean *authoring* a shape,
  which is Keemin's call, not a generator's.
- Two marks (`pando-peak`, `the-town-centre-crossing`) name skeleton features that
  **do not exist** (C20). Pre-existing, untouched. It also means the town-centre
  crossing is not a crossing the oracle knows.
- The mitre join trades 0 over-claim for 0.4–1.0%, in exchange for dropping
  under-claim from 6.7% to ~1%. Small in both directions beats zero in one.
- `WORLD/walk-ledger.md` remains uncommitted demo data (`--rm` on the seed clears it).

---

# 3 · The sea (extracted from the atlas COASTLINE)

`world-terrain-gen.mjs` now extracts `COASTLINE` beside the water constants it
already pulled from the atlas, so the skeleton's sea feature carries `ring_m` and the
new mark `the-town/the-sea` (constitution, by the-town, at root) carries the same ring
as its `points:`. **One geometry, one source** — a guard asserts mark-ring ===
skeleton-ring point for point. The closure is the atlas's own: `renderSea()` fills the
coast closed with `L(MAP_W+5,MAP_H) L(-5,MAP_H) Z`, and the extractor reproduces
exactly that. 51 coast points + 2 corners = 53, `7550 × 5000 m` at `1325,5700`.

Gates: **lint CLEAN at 245 marks**, **fold 0 errors**, **world suite 80/80**.

## The stop-condition did not fire, and not by luck

Checked before writing: **all 26 parcels are clear** of the ring, orion's house and
parcel included. Three marks ARE inside it — all orion's, all seaward features
(`eelgrass-coves`, `the-shingle-beach`, `the-tidal-race`) — and **none of them take
the sea as a tree parent**, because `placementParent` picks the smallest container and
they sit inside his own reach, ~12× tighter than the sea.

The property worth keeping: **the sea is the largest claim on the map, so the
smallest-container rule guarantees it can only ever adopt an orphan.** A very large
mark is *safe* in a tree that keys on smallest-container — the opposite of the
intuition. The channel's rectangle was dangerous because it was big AND wrongly
shaped. Both facts are standing guards now, so a coastline edit that ever does drown
a parcel fails a test rather than quietly re-filing a home.

Containment diff for this step: one row, `the-town/the-sea` → (root).

## No bay, and the atlas ruled it rather than me

Keemin left the bay to my judgment. The atlas answers it in its own words: the
one-shore-one-sea design exists *because* an earlier version had "a west_sea blob, a
rectangular southern sea, **and a bay cut in afterwards**", and it was replaced "so
the map cannot develop a seam between them". The coastline runs *through* the bay as
one continuous shore; a bay mark needs a mouth chord across the horns, and the atlas
never drew that line. Drawing it would be authoring, not extracting. Residents may
name it — the shape Keemin set for the rest of the coast anyway.

## The mouth: overlap, per ruling 6

The channel's mouth is inside the sea's ring and no boundary is authored. Verified as
a guard, not asserted: the channel's last centreline point returns `inSea() === true`.
The one thing overlap forces is an ordering, since `waterAt` returns one id — it
answers `the-main-channel`, because the inland body is the specific claim and the sea
the surrounding one. An ordering, not a boundary.

## Visual acceptance

The sea polygon traces the painting's painted coast — read by eye on the spectator
with footprints on, panned south and zoomed onto the bay's arm. They are not
identical and should not be: the atlas draws `smoothPath(roughen(COASTLINE, "coast",
8))`, so the art carries up to **8 atlas px ≈ 40 m** of deliberate hand-drawn jitter
while the ring is the raw canon. Extracting the roughened path would have baked a
rendering flourish into the record and made the sea's shape depend on a seeded noise
function.

## Residue

- **C3's exception has closed:** `seaGated()` is now true and a committed test had to
  invert. It does NOT mean the door refuses you — the v0 gate is off (C21), so
  `seaGated()` reports what the oracle knows, not what the door enforces.
- **`waterFeatures()` still means INLAND water.** The sea is reached via
  `seaFeature()`/`inSea()` because three callers depend on the old meaning; widening
  it would have changed all three to fix one.
- **The atlas clone I read was 55 commits stale** and `render-town.mjs` had changed on
  origin. I read the current file from the fetched ref and then checked: the COASTLINE
  hashes identically across both, 51 points either way. The staleness would not have
  bitten — but only the comparison told me that.
- I verified the generator reproduces the committed `skeleton.json` content-identically
  before letting it rewrite the file, so `ring_m` is its only change.
