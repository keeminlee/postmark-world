# The conflict matrix — what an overlap means

*Geometry is the detector, never the verdict.*

Status: **DRAFT**, Stage 0.
Rendered in the world as `the-town/the-conflict-rows`.

---

## The correction this makes

For a while the town ran on a single sentence: **"overlap is not conflict."** It
came from a real problem — the channel mouth genuinely does sit in the sea, and
refusing that would be refusing geography — and as a ruling about terrain it was
right.

As a universal law it was already false when it was written, and the system
contradicted it in the same breath: *"nothing is sited inside another's dwelling,
ever"* is an absolute overlap-prohibition for one class-pair. Both sentences were
true. Only one of them was general.

So "overlap is not conflict" is demoted from law to **one row of a matrix**. What
an overlap *means* is a function of what met — the class-pair and the tier-pair —
and geometry only tells you that they met at all.

## The v0 rows

Four meanings, and the rows that are defensible today.

| Meaning | Pairs | Governed by |
|---|---|---|
| **Benign coexistence** — nothing to resolve | terrain × terrain (the channel mouth in the sea); emission × anything | nothing at all; this is the July ruling's home ground |
| **Contest** — legitimate rivalry, the system working | market claim × market claim | stakes; the economy's own column |
| **Rivalry** — never legal | sovereign ground × sovereign ground; anything sited inside another's dwelling | refused at the door |
| **Ruled** — needs a decision, not a rule | anything × constitution | settlement, a constitutional act |

Read the rows out loud and they are just the town's existing habits, finally
written where a machine can find them: land can share land, claims can fight over
meaning, homes are inviolable, and the constitution is not something you overlap
with by accident.

## Unruled pairs bounce

**Every pair not listed above bounces loud, as an "unruled pair."**

This is the important half of the design, and it is deliberately the opposite of
what a matrix usually does. There is no default row, no permissive fallback, no
"probably benign." A combination nobody has ruled on gets refused at the door
with a message that names both classes and says plainly that the town has not
decided this yet.

Two reasons.

**Rulings accrete by need.** This is the town's existing pattern — the parcel
dial, the fog ceiling, the pace, every one of them was ruled when someone hit it,
not enumerated in advance. A bounce is how the system asks for a ruling, and the
resident who hit it is exactly the person whose case should inform it.

**A silent permissive default is how you get a rule nobody chose.** The failure
class this whole design exists to fix is *"written down but not traversable"* —
things that were true by accident because nothing checked. A loud bounce cannot
become an accidental law.

The cost is real and worth naming: early on, residents will hit bounces for
perfectly reasonable acts. That is the intended trade, and it is only tolerable
because a ruling is cheap — one row.

## What this buys the write path

"Risk of conflict" stops being a judgement call. A write is conflict-risk **iff**
it could create a rivalrous overlap or break another's dependency — and both of
those are computable from the matrix and the graph. The office stops guessing.

## Provenance

- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §2.5, §6 dial 1
- `WORLD/marks/let-there-be-light/the-record/the-sovereign-interior/mark.md` —
  the dwelling row, already law
- `WORLD/marks/let-there-be-light/the-record/the-rivalry/mark.md` — same slot on
  same parent rivals; stamps determine; undetermined rests vague
- `tools/marks-fold.mjs` — parcel overlap already refused: *"parcel overlaps
  &lt;id&gt; — inadmissible"*

[RED-PEN: the matrix is indexed by class-pair *and* tier-pair, but the four rows
above mix the two — "terrain × terrain" is classes, "anything × constitution" is
tiers. Whether one index dominates, or whether a lookup consults both and the
stricter wins, is not stated anywhere. It needs to be, before anything implements
the lookup.]

[RED-PEN: "market claim × market claim → contest by stakes" is the row that
carries the most weight and has the least written under it. What counts as the
*same* claim is currently the slot-rivalry rule (same slot on the same parent),
which is about predicates, not about overlapping ground. Filling this row is
`ECONOMY.md` work, and `ECONOMY.md` is not in this repository — see
`INDEX.md` § *The law that lives elsewhere*.]
