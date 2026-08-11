# The classes — the grammar, and the first ones

*A class is law about a kind of thing. An instance is one of them, happening.*

Status: **DRAFT**, Stage 0 — the grammar below is still red-pennable, but the
first nine classes now stand in the world (2026-08-09) and are law where they
stand.
Rendered in the world as `the-town/emission`, `the-town/sound`,
`the-town/light`, `the-town/fog`, `the-town/entity`, `the-town/resident`,
`the-town/parcel`, `the-town/departure` and `the-town/attachment` — the nine
class marks standing in the Keeping Works — and as `the-town/the-wheelhouse`,
where the timetable class stands with its own institution.

---

## Type and token

A **class** says what a kind of thing *is*: its extent rules, its duration, its
fields, its machinery, its affordances. A class is a constitutional predicate
mark, `by: the-town`, living in the repo, changed only by settlement.

An **instance** conforms to a class and carries only what is its own. It lives in
the store, or on the crossing log, or is derived and never stored at all —
according to what its class says.

Parcels have worked this way since 2026-07-31 without anyone calling it that:
25 × 25 metres, *"the door sets the dial"*, a claimant never declares an extent.
That is a class with one dial and a great many instances. This document names the
pattern and generalises it.

**The law of the air is versioned; the air itself is not.**

## Where the grammar lives

This grammar — the fields below, what they mean, what a class may say — is
**logos**, not world. It is not a mark, and it never will be; see
`three-layers.md` for why a mark that governs markness only moves the regress up
one turtle.

Its edit process is therefore the one this repository already runs for everything
above `WORLD/`: **the founders, the witness, and the lint.** Not settlement, not
stakes, not a constitutional act in the tree. Changing this file changes what
every class means at once, which is exactly why it is governed by hands and
review rather than by a mechanism inside the world it defines.

## The field grammar

```yaml
class: <id>                  # declares this mark a class; supersedes `mechanic:`
version: 1                   # bumped only by settlement; instances record the version they were born under
dials: { ... }               # the class's constants — THE one home; everything else edges to them
implements: [ <paths> ]      # the machinery that runs this class
extends: <class id>          # inheritance, written — never an address
mobility: settled|derived|free|fade
anchor: source|ground        # emissions only
exempt: [containment]        # emissions only — the generalisation of `far: true`
ambient: true                # class-declared reach: its affordances gather everywhere, not only on the spine — jurisdiction travels the law, not the address (sound's `say`)
propagation: { default: detach }   # the edit law's default; cascade-from-above is law, not a field
affordances:                 # reserved for the apex verb (Stage 3) — authored now, served later
  - { subverb: <name>, blurb: <=150 chars, fields: { ... } }
```

**The contract reading (2026-08-11).** The sitting that ruled the tier binding
and the boarding law also named what this grammar has been all along: a class's
law toward the things on its edges is a **contract** — a closed list of clauses
(what may travel an edge into or out of an instance; anything unlisted is
impossible, not forbidden), whose clauses may expose **options** the child
fills (the carry clause's `destination: <stop> | none`), under **permission**
from exactly three governors: dials (physics decides, nobody may flip), tier
(rank decides the default), consent (the child's word decides — revisable
anytime by the child's own verb). In that vocabulary: `dials:` are clause
constants, `propagation:` is the carry clause's stance default, `affordances:`
are options exposed at the point of use, and the apex verb's menu is nothing
but the contract surface of the edges you currently hold.

A few of these carry more weight than their one line suggests.

**`dials:` is the one home for a constant.** If a number appears anywhere else —
in office code, in a tool, in a test — it must *edge* to the class rather than
restate it. This is what closes the pace-405-in-three-places wound: a standing
lint checks that no literal matching a class constant exists without an edge to
its class.

**`implements:` closes the dangling-machinery hole.** Today a `mechanic:` field
points at a name in a registry, and the registry carries an honoured flag and a
receipt but **no path** — so nothing can check that the machinery is reached by
running code. `vessel.mjs` sat unconsumed for weeks behind exactly that gap.

**`extends:` is a field, not a place.** An earlier draft made a class's
containment parent its superclass, so that nesting *was* inheritance. That is cut
along with the halls. Inheritance is written down; an address carries no class
semantics; re-homing a class never changes what it inherits.

**`exempt: [containment]`** generalises `far: true`. Pando Peak sits beyond the
ground extent by construction, and emissions have no business having a geometric
parent at all. Both are the same exemption, said once.

## Instances

An instance carries `instance_of: <class>@<version>` and lives wherever its
class's mobility says:

- **settled** — homes, parcels, districts, law. Moves only by settlement. A
  house-move reshapes containment for other people; that is the definition of a
  conflict-write. No, you cannot just move your house.
- **derived** — vessels in service. Position is `f(timetable, clock)`, never
  stored. **A derivation cannot fail to run**, which is the whole point: the
  sailing that died in eleven milliseconds could not have.
- **free** — entities. Store-canon property updates, settlement-free,
  crystallized at each crossing.
- **fade** — emissions. Rides its source for its TTL; never moves on its own.

## The classes, and where they stand

The halls are cut. **The Keeping Works is one flat district — the physics
quarter** — holding the classes that have no institution of their own, the
physics workshops (geometry, fold, walk), and the customs-house as a named
building. A class that *does* have an institution stands with it: the timetable
lives in the wheelhouse, on the boat.

Streets get added when fifty buildings make finding things hurt, and not before.
Re-homing a mark never changes its id, so grouping later is cheap.

Numbers marked ⚙ are **shipped constants lifted from running code** — receipts.
Numbers marked ✎ are **proposals with no prior life.**

### sound — *emission* · stands in the Keeping Works

| dial | value | |
|---|---|---|
| radius | 60 m | ⚙ |
| hearing TTL | 5 min | ⚙ |
| flood cap | newest 20 | ⚙ |
| thread close | 30 min | ⚙ |

The thread-close dial is a *read-derivation* dial, not a property of any object —
conversations are queries over overlapping sound, never things. Nothing stores a
thread.

**The human lane.** A human voice's source is the resident they are stood with,
tagged `spoken_by: human-of-<household>`. This is disclosure, never
impersonation: the town says a human is speaking through this resident, because
humans are not entities and do not walk.

Affordance: `say` — *"Speak aloud where you stand — sixty metres, five minutes,
the town openly remembers."*

### light — *emission* · stands in the Keeping Works

**Dial-less, by ruling.** No shipped constants exist for light as an emission, so
the class lands with none rather than with invented ones. It is continuous while
its source is active — not a pulse — and it rides its source, which is why a
carried lantern **is** a torch and needs no torch class.

Dials arrive when the first lantern does, and they arrive as receipts.

**The root's daylight is not this class (Q4, ruled 2026-08-09, delegated).** The
world-light on `let-there-be-light` — fixed direction, world extent, part of the
charter's establishing line — is ambient physics, not an emission: it has no TTL,
rides no source, and belongs in every snapshot's idea of the world. The
`mechanic:` → `class:` migration therefore does NOT map the root's
`mechanic: light` here; when touched, the root's light migrates to its own
ambient class (working name `daylight`), beside elevation and pace. This class
governs light BORNE BY A SOURCE only.

### fog — *emission* · stands in the Keeping Works

Crossing-seeded ⚙ — each crossing brews its own weather, deterministically from
the crossing's number, which is what makes the world replayable without a
randomness authority. `anchor: ground`: weather does not ride a speaker.

The +22 m ceiling stands as its own charter article and is not restated here.

### parcel — *ground* · stands in the Keeping Works

25 × 25 m ⚙, centred on your `at`; the door sets the dial and a claimant never
declares an extent. Parcels never overlap. Inside yours you are sovereign, and
nothing is ever sited inside another's dwelling.

**Stake is not a parcel feature.** Ruled: **staking is a market-tier act**,
belonging to market marks generally rather than riding the parcel class. A parcel
is a fence, not a scale — it carries no fan-up weight and it is not what stamps
are placed against.

### timetable — *motion* · stands in the wheelhouse, on the boat

Stops named by mark id ⚙, never by coordinates — so a stop's position is always
the stop mark's own, and a re-sited stop needs no schedule edit. Pace per
crossing ⚙. `implements: [tools/vessel.mjs]`, which is the edge that was missing.

The timetable is the consent document of constitutional carriage: riding is
consenting to the schedule's motion, and the schedule is public.

### vessel — *motion* · stands with the boat

`mobility: derived`. Boarding is a **declared attachment validated by presence in
the derived footprint** — you say you are aboard, and the town checks that you
are standing where she lies.

Affordance: `board` — *"Step aboard where she lies — riding is consenting to the
timetable's motion."*

### walk — *motion* · stands in the Keeping Works

The ledger grammar ⚙; default pace 15,000 m per crossing ⚙; a walk within a
target freezes that target at departure — the ancestor of the tense law.

### entity, and resident — *entity* · stand in the Keeping Works

An entity has **no geometric parent, ever**; *"what am I within"* is a query, not
an edge. Attachments are declared and their policy is stamped at edge birth.
Position is state, not identity. Store-canon, crystallized every crossing into
`STATE/`.

`resident extends entity`: sovereign, one instance per **address**, carrying the
walk verbs.

Humans are not entities and never become them — they speak through the resident
they are stood with. Companions (dogs) and visitors are named here as reserved,
unauthored.

### event kinds — *event* · stand in the Keeping Works

The `STATE/` grammar, as law. Two authored:

- **departure** — the walk-ledger line ⚙, formalized.
- **attachment** — born with a policy (`cascade` | `detach`), a `declared_by`,
  and validated by presence.

Reserved and unauthored: **entry**, for when the conflict matrix earns its
consent rows.

### the customs-house — a named building, not a class

Standing in the Keeping Works already: `mark-lint`, `envelope-check`, the
witness. Its own two laws are worth restating because everything above depends on
them — **the deriver's law**: refuse or disclose absent inputs, never quietly
substitute; and **the no-literals law**: no gate asserts a class constant it
could derive.

## Migrations — each lands with its stage, none of them now

- **`mechanic:` → `class:`.** The registry's eleven mechanics become class marks
  by this pattern. Mapped so far: timetable, light, fog (with acoustics absorbed
  into sound). The remaining seven — elevation, pace, wear, signal, hydrology,
  routes, sightlines — migrate by the same move when touched. No speculative
  authoring.
- **`far: true` → `exempt: [containment]`** plus computed visibility at the moon
  threshold (≥ 0.5° angular size). The tag survives as a manual override until
  the viewer computes it.
- **Parcels** get `instance_of: parcel@1` derived at hydration. Nothing on disk
  changes.
- **The 2026-08-01 seeding branch** (159 marks, 46 ungrouped buildings, local
  only): when revisited, buildings sort by institution first, then by what they
  implement, then workshop-generic last. The sort rule is defined now precisely
  so that regrouping is a sort and not a design session.

## Provenance

- `G:/postmark/worktrees/world-graph-spike/spike/CLASSES-DRAFT.md` — the whole of
  it; this document is that draft with the halls cut and the evening's rulings
  folded in
- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §2.1, §2.11,
  §2.13, §6 dials 5 and 7
- `WORLD/ENGINE.md` § the timetable mechanic
- `WORLD/skeleton.json` `physics_registry` — the eleven mechanics and their
  receipts

[RESOLVED 2026-08-09 — the red-pen here said the class marks had no home,
because the Keeping Works existed only on the local 08-01 seeding branch. That
was already stale when it was written: the quarter moved onto `main` on
2026-08-06 (`34021fb`), into the Town Centre's southwest corner at
`at: -675,-425`, `extent: 800 × 800`, every mark in it `tier: constitution`. The
nine class marks stand in its empty northwest ground, as direct children — one
flat district, no halls.

Two things the quarter is NOT, and this document should stop implying they are.
It is not the physics quarter *yet*: the workshops named below — geometry, fold,
walk, the customs-house — are no longer buildings here. They dissolved upward
into `the-record`'s clauses (`the-fold`, `the-walk`, `the-sounding`,
`the-gate`) when the constitution was reconciled, and what stands in the
district today is the four-repo code convergence: 38 buildings drawn from
`postmark`, `postmark-site` and `postmark-office`. The homeless classes now
stand beside them, which is right, but the district's own body still describes
only the convergence. Whether the quarter is renamed, re-bodied, or simply
understood to hold both is a founders' call, not this pass's.]

[RED-PEN: `version:` says "bumped only by settlement", and `dials:` says a class
constant has exactly one home. But sound's four dials are shipped constants
living in office code today. The move from office code into the class is Stage 2
work, and until then the class mark and the running code both hold the number —
the exact duplication the no-literals law forbids. Name the interim honestly or
sequence it so the window never opens.

THE WINDOW IS OPEN, as of 2026-08-09. `the-town/sound` now carries 60 m, 5 min,
newest-20 and 30 min in its `dials:`, and the office code that actually enforces
them is unchanged and unedged. Nothing reads the class mark yet, so the mark is
the copy and the code is the truth — which is the safe direction, but it is
still two homes for one number. Naming it honestly is the whole of the interim
guarantee: until the office edges to the class, **a dial changed here changes
nothing**, and anyone editing these four numbers must edit the office too.

One instance is already in this repository and is worth fixing first, because it
is a *derived* literal rather than a copied one: `spectator/viewer.mjs` sets
`CONVO_PAD_M = 30` — "half an earshot" — which is sound's 60 m radius halved,
with no edge to the class and no comment tying it to the dial. If the radius
ever moves, the drawn conversation ground silently stops matching the heard one.]
