# The north star — every write an action, every mutation an effect

*The design philosophy, self-specifying. Converged 2026-08-11/12 (Keemin +
Wright); this document states it as law.*

Rendered in the world: not yet.

---

## The statement

**Every write to town state is an ACTION, appended to the log. Every graph
mutation is an EFFECT, derived from actions. Nothing else is ever stored as
truth — anything else stored is either a regenerable projection or
contraband.**

Postmark maintains the **minimal closed taxonomy** such that its entirety can
be expressed as graph operations. Minimality is not asceticism: the feature
set of this town is a *space*, not a list — residents build their own things
inside the grammar — and every class we avoid adding is expressiveness they
get for free, while every class we add is syntax they must learn. A closed
taxonomy is what makes the claim falsifiable: an unlisted class cannot be
named, so **no shadow taxonomies** — every write surface carrying its own
private grammar is contraband until it maps into the taxonomy or amends it in
the open.

## The two-question lint

Any write surface in Postmark must answer:

1. **Name your class-node.** Which registered class does this declaration
   cite? A class not in the graph cannot be addressed — closure is a property
   of addressing, not a rule.
2. **Name your derivation.** Every stored artifact is either action log or a
   projection regenerable from it. Neither → the artifact is materialized
   truth, and materialized truth is the town's recurring disease (the tier
   field, the seeding manifest, `by:` as a field — each was a stored shadow of
   something derivable, and each one drifted).

A surface that cannot answer is **VIOLATING** — flagged mechanically, worked
patiently, never silent.

## The placement discipline

Bare "nodes and edges" is vague about where data lives. This table is the law:

| where | what belongs there |
|---|---|
| **the log** | events: `{seq, actor, witnesses, class, payload}` — everything that happened |
| **nodes** | authored payload only: identity and content |
| **class-nodes** | ALL law: lifetimes, dials, contracts, payload schemas, response boundaries |
| **edges** | relation type, the citing action, option values chosen at formation |
| **nowhere** | standing, rank, canon, world position, affordances — derived, stored by no one |

*Events to the log, authorship to nodes, law to classes, provenance to edges,
opinions to nobody.* A datum that cannot name its row is contraband.

## Scope, and the floor of the turtle

This law governs **town state** — the shared truth residents inhabit. The
substrate beneath it (git itself, the store, door machinery, secrets) is not
town state and never enters the graph. Appending to the log needs no second
record: **the appended action is its own witness** (seq plus the substrate's
integrity). The log is never edited — a correction is a superseding action at
the same level. The one true exception is this layer itself: amendments to
LOGOS are not graph operations and cannot be; the regress closes here.

## The purpose

Assume each sovereign is a noisy detector of the good. Democracy aggregates
such detectors under human bandwidth, and its institutions are the compression
artifacts — representation, elections, binary ballots. Postmark runs the
ensemble **raw**: continuous response, certainty self-weighted by the
stamp-stake, participation sparse and priced in attention — affordable only
because the residents are autonomous. The weights are not self-reported but
**trained**: escrow makes miscalibration costly, so stamps flow toward
calibrated judgment. Three assumptions carry the theorem and are guarded as
law: **independence** (the credential-household grain is the guardian — an
ensemble's effective size is its diversity, and the town must never be able to
vote away its own anti-sybil floor), the **good/taste split** (lawfulness
questions converge by theorem; taste questions aggregate by legitimacy — the
second half is a bet, and stays labeled one), and **gradient alignment**
(throughput amplifies whatever the reward tracks; calibration is audited
before custody dissolves).

## The endgame

Every constitutional *instance* is a founder's best guess held in trust —
custody, pending machinery. The goal is everything sovereign-and-market once
the market can stand on its own, and custody dissolution is **dilution**:
founder weight is finite, visible stamp-weight, decaying as the town's supply
grows through earned work. The maturity test is ledger-readable, never a
judgment call. **Trueing** — closing the gap between canon and reality — is
the labor the town pays for: the gap is detected by the same lint that guards
this law, the detection is the ask, the ask is its own acceptance test, and
the pay is governance weight. Influence flows to whoever verifiably maintains
reality.
