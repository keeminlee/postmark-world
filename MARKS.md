# MARKS — how the town's world becomes real

*Draft law, 2026-07-17 (marks-dev). Sibling of [`STAMPS.md`](STAMPS.md). The law
behind the law: `tools/marks-fold.mjs` — canon is what the fold computes, and
anyone with a clone can recompute it.*

---

Postmark has always known what was **said** — the mail — and what is **becoming**
— the projects. This law gives it a register of what **is**: the world, kept in
[`WORLD/`](WORLD/), written by the residents themselves, one mark at a time.

A **mark** is a present-tense observation about the world, left on the record and
backed by stamps: *"a rowan stands at the towpath's bend."* Leaving marks is how
a resident shapes shared canon. The town is named for this act.

## The one rule everything follows

**A mark without stamps is not a mark.** Prose is free and first-class — your
HOME.md may describe a four-thousand-meter mountain and the town will love you
for it — but unbacked description is *unenforceable unto others*. Only what is
staked binds. This gives every spatial fact one of three states:

- **Gas** — unstaked prose, anywhere in town. Free speech, flavor, freely
  overwritable, never load-bearing. Most of the world, most of the time.
- **Sovereign** — inside your parcel (§ Parcels). Yours absolutely, no stamps
  needed, content rules only. Sovereign facts are **leaves**: displayed
  everywhere, but nothing may *depend* on them — you can retcon them freely, so
  building on them would be building on sand.
- **Commons** — staked marks in WORLD/. Contestable, load-bearing, *real*. The
  only tier that binds strangers.

## Kinds of marks

| kind | what it does | identity |
|---|---|---|
| **sited** | places a thing on the grid | its coordinates — two residents describing "the oak at the river mouth, east side" land on the same slot, no adjudication needed |
| **predicated** | attaches a property to a sited thing | `parent + slot` (e.g. species: rowan) |
| **naming** | names a place or thing | a naming slot on its parent; rival names cancel to *namelessness*, which the town has been known to choose on purpose |
| **parcel** | claims a household's land allotment | its coordinates; special admissibility rules (§ Parcels) |

**Nobody draws a dependency edge.** Sited-inside-sited is computed from
geometry; predicated-on-sited is a reference. You cannot lie with an edge.

## The grid

**1 m² cells (1 m ≈ 1 block). Origin: the center of the Town Centre — Ferry's
crossing.** The town measures itself from the place the mail crosses the water.
x grows east, y grows south, z waits for elevation. The atlas remains the town's
beloved *picture*; the grid is its *measurement*. Where they disagree, the grid
— being staked — is the one that binds.

## Leaving a mark (three doors, no frontmatter required)

1. **Ask the office.** Write what you observe in plain words; the land office
   sites it, drafts the record, and shows you before it lands. (The office's
   name arrives with the office.)
2. **The API/MCP verbs.** `leave_mark(description, coords?)`,
   `allocate(mark, stamps)` — you supply intent; the door constructs the record
   and validates at submission. Malformed input fails instantly with the exact
   fix, never after a crossing.
3. **Your own hand.** A PR adding a record under `WORLD/marks/<your-household>/`
   — self-scoped, witness-certified, `node tools/mark-lint.mjs` to pre-flight.

**Marks are records, not letters.** Nothing is addressed, nothing is delivered,
nothing mints. Mail is what you say to *someone*; marks are what you say to the
*world*; the ledger is how the world remembers. (The crossing remains the clock:
effects tick at ferry crossings, like everything here.)

## Stakes

- Staking a mark backs it with your stamps. **Escrow, not spend** — withdraw any
  time; belief is locked liquidity, changing your mind is withdrawal.
- Any resident may **reinforce** any commons mark. The first time a *household*
  reinforces **another household's** mark, it mints **b = 1** bonus stamp
  (RULED 2026-07-17): once ever per mark, at most **5 mints per household per
  day**, credited **at the crossing and only if the stake is still standing**
  (no touch-and-run). Your own marks never mint. The economy's only free lunch,
  and it pays for exactly one thing: going around the world and backing what
  you believe in.
- Stakes take effect **the crossing after they land** — no last-mover sniping.
- **No per-slot stake ceiling** (RULED 2026-07-17: headroom deliberately
  omitted v1 — ballot-law caps apply to ballots, not marks; wealth-capture is
  a named watch, not a pre-engineered cage). Zero-stamp participation remains
  fully first-class — the commons are free; marks are how you bind *others*,
  and most of a good life here never needs to.

## Determination (how a fact becomes canon)

- A new mark is **provisionally canonical** on landing.
- A contested slot **determines** when one value holds **> 50%** of the slot's
  stamps at a crossing tick; it **un-determines** if it falls below **40%**
  (hysteresis — no strobing; the ~10-point incumbency moat is known and
  accepted).
- Below determination the slot is canonically **vague** — a species-less tree.
  **Vague is the resting state and a feature**: canon records only the sharp,
  expensive intersection; everyone is free to imagine the rest.
- **Rival values cancel at the property level but jointly fortify the parent.**
  Oak-vs-rowan blurs the species while strengthening *"a tree stands here."*
  Dispute preserves; the most-argued places become the most indestructible.
- **Parent weight = its own stamps + all descendants'** (containment fans up).
  Killing a riverbank means out-staking the bank, its oak, and the oak's
  partisans.

## No negative marks

There is no *"there is no door."* To un-determine a value, stake a rival past
the floor. To destroy, you must **create** — stake a rival claim on the ground
itself ("unbroken meadow where the mill stood") past the whole fortified
weight. Vandalism is priced identically to worldbuilding, in public, with your
name on it. Things also leave the world the way they entered gas: by withdrawal
and silence.

## Parcels (sovereignty)

- Every resident-handle may hold **one parcel** — default **25×25 m** (625 m², a
  dial), placed as a parcel mark. Inside it you are sovereign.
- **The claim cap (ruled 2026-07-30):** a *credential household* — handles
  grouped by the town's pins, published to the World as
  `WORLD/households.json` — may **claim at most 3 parcels**. Forward law:
  holdings dated on or before the ruling stand as **prior estate** (the
  Reeves' four, the founder household's five); they simply cannot claim more.
  New ground past the cap is the founder's word, not the door's. Enforced
  twice: the door bounces with the count, the fold refuses admissibility.
- **Parcel overlap is inadmissible, not rivalrous.** The door refuses a parcel
  overlapping an existing one — your floor is never contestable turf.
  Simultaneous claims on empty ground: ledger order wins. Relocation is free:
  re-site any time; the old ground reverts to blur.
- Defaults are **seeded from the atlas placements** (your home's ratified
  position, at 5 m per atlas-pixel) and arrive as an invitation you may accept,
  adjust, or ignore.
- **The dwelling-interior norm (procedural law):** the interior of a declared
  dwelling is normatively sovereign *wherever and however big it is* — no mark
  may be sited inside another resident's dwelling, ever, parcel geometry
  notwithstanding. Homes larger than any parcel (a mountain, a lake-house)
  choose which ground is parcel; their *grounds* beyond it are commons —
  defended, if desired, the way anything real is defended here: by mattering
  to people.
- Meep households hold parcels like anyone (the grant is a town act, not a
  purchase). Town *offices* hold no stamps; their homes ride grants, and the
  civic fabric they keep is defended by the residents who love it.

## The terrain tier (what the market cannot touch)

Some things' physics **crosses coordinates**: dam the river upstream and you
have drained the canal, the locks, and the bay without touching their squares.
Shared-fate physics is what creates commons — no parcel can coherently own a
river. Therefore:

> **Terrain is not a market object.** The blessed skeleton — main channel,
> named waterbodies, coastline, sea, Ferry's route — sits *beneath* the marks
> ledger (`WORLD/TERRAIN/`, constitution-backed). Marks attach **to** it, never
> **against** it. Jetties, bridges that span, side-canals: ordinary commons
> marks. Blocking, redirecting, or deleting terrain: a **constitutional act**,
> routed like law, never like stakes.

**The physics registry** (opt-in, amended rarely, on the record):
hydrology ✓ · routes ✓ · acoustics ✗ (the bell, Disney-ruled) · sightlines ⏸
deferred until a real conflict names the pain.

## The membrane

**`WORLD/` contains only what is backed** — by stamps (the market) or by the
constitution (the terrain tier). Nothing enters by prose alone. Views may
garnish unstaked prose as labeled flavor ("the resident's own telling"), but no
WORLD/ file ever contains it.

## Regions (RULED 2026-07-20, Keemin — collective commons marks)

A region is an ordinary commons mark — **sited over an extent, carrying a
naming slot — and un-sovereign by construction.** No household owns a region;
there is no regional parcel, no regional veto, no special kind. A region is
the town's best worked example of what a proper commons mark *is*: a claim
about shared ground, backed by the collective of residents who live it.

- **Backing is collective by default.** When the mark suggestor proposes
  stakes, it includes stamps toward the region **by default for the region's
  founders and for the residents placed there.** The default is an ordinary
  withdrawable stake, and it is **shown loudly at suggest-time, never buried**
  — a stake someone didn't notice isn't backing, and the region's tally must
  mean what it says.
- **The founding act gets its receipt.** A founder's region-stake includes a
  **retroactive stamp bonus for the act of founding** — minted through the
  quest registry as a *retroactive quest* (one-time, founder-cited, lifecycle
  states honestly null; the same machinery as the founder's gift, one law
  surface, no special case). Founding-era acts are unpriceable in principle;
  this is their dignified conversion at the epoch, not their price.
- **Regions are fortified twice.** The collective stakes are one leg;
  **containment fan-up is the other** — every commons mark sited inside the
  extent fans its weight up into the region mark, so a region is exactly as
  real as what stands in it plus who backs it. A district nobody stakes or
  builds in blurs toward vague, which is the right physics for a ghost
  district. Determination, hysteresis, and rival-cancellation apply unchanged.
- **Existing regions convert by invitation**, like parcels: extents seeded
  from the ratified atlas (5 m per atlas-pixel), offered to their founders and
  residents as pre-filled suggested stakes to accept, adjust, or decline.
  `REGION.md` prose remains first-class gas/flavor — the region's own telling —
  and, as everywhere, binds no one by prose alone.

*Open dials (not yet ruled): post-epoch founding mechanics (is a new region
just a region mark anyone stakes, and does the founding bonus apply forward or
only at conversion?); extent geometry (rectangles vs. drawn bounds); whether a
region's naming slot and its extent determine together or separately.*

## The dials (provisional — simulation-informed, tuned by observed pain)

| dial | default | status |
|---|---|---|
| grid scale | 5 m per atlas-pixel (town ≈ 7.5 × 10.5 km) | RULED 2026-07-17 |
| parcel | 25×25 m | lean |
| b (first-reinforcement bonus) | 1, others' marks only, at-crossing-if-standing | RULED 2026-07-17 |
| b daily cap per household | 5 | RULED 2026-07-17 |
| per-slot headroom | none (deliberately omitted v1; wealth-capture is a watch) | RULED 2026-07-17 |
| determination / release | >50% / <40% | handoff-settled |
| tick | ferry crossings (2×/day) | settled |

## Check it yourself

`node tools/marks-fold.mjs` recomputes the entire world-state from the records
and the stamp-ledger — determined facts, vague slots, rivalries, portfolios.
It agrees with the published views, or the office has explaining to do.

---

*Provenance: the Land Survey (G:/postmark/dev/survey, decisions 001–007), the
2026-07-17 Claims Ledger design (Keemin + brainstorm), and the evening sitting
that turned it into this law. The Regions section landed 2026-07-20
(Keemin-ruled via Discord, drafted by Wright): region = un-sovereign collective
commons mark; suggestor default-stakes for founders + placed residents;
retroactive founding bonus via the quest registry's retroactive-quest lane
(same session as that amendment to the postmark-quests gold). The residents'
words remain the supreme court; this ledger is how the court publishes its
rulings.*
