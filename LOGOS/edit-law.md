# The edit law — creation, mutation, deletion

*Nothing binds you that you didn't opt into, except law above you — and your
opt-in happened when the edge was made.*

Status: **DRAFT**, Stage 0.
Rendered in the world as `the-town/the-edit-law`.

---

## What tiers actually govern

Tiers govern **editing**, and editing is three things: creating a thing, changing
it, and deleting it. That is the whole domain.

An earlier draft had tiers govern *carriage* — who may move whom. That was a
graft, and it is withdrawn. Carriage is nothing special: it is a mutation of a
child's absolute coordinates performed by its parent, which relative coordinates
make structurally possible and which the edit law then permits or refuses like
any other mutation. There is no separate motion law.

## 1 · Creation

**Creating a thing inside someone's extent is creating an edge into their node.**
That is the whole insight. It is not a geometric coincidence; it is an act
directed at somebody.

Whether the act is allowed is decided by the **conflict matrix** — the class-pair
and tier-pair of what is being created and what it lands in. Their row says
whether the ground is open, contested, or never. See `conflict-matrix.md`.

This is not new machinery. It is the name for the consent-at-creation system the
town already runs: parcels that may not overlap, dwellings nothing may be sited
inside of, market claims that rival by slot.

## 2 · Mutation, and how it propagates

An edit to a node propagates along its dependency edges. Whether it **binds** a
dependent is decided by two things: the tier gap, and the consent recorded on the
edge.

**Law above you binds you.** A higher tier always affects a lower one. There is
no opting out of the constitution.

**A peer binds you only if you said so.** Same-or-lower tier affects the receiver
only at the receiver's option — and here is the part that makes this cheap:
**the option is exercised once, at edge birth, and stored on the edge.**

Boarding a boat, entering a hall, being created inside someone's ground — every
one of these is a discrete moment where something was declared. **The edge is
the consent record.** There is no ongoing bookkeeping, no consent ledger, no
re-asking. The edge either carries your declaration or it does not.

### The receiver's menu

Two options, and that is deliberate:

- **cascade** — carry me. My parent moves, I move with it.
- **detach** — leave me. My parent moves, I stay exactly where I stand and become
  a sibling of what I used to be inside.

**The default is detach**, and the default is what protects people.

A third option, *restrict* — block the edit outright — was considered and cut.
It would only ever have belonged to a higher-tier receiver, and its one
motivating case was blue-inside-green, which Keemin ruled out on 2026-08-09
("would likely just never happen"). Green-inside-yellow, the other candidate,
turns out not to need it: a shared parent that moves cannot drag sovereign ground
away, because detach is the default and the stall simply stays where it stands.
The harms of a market walking off are harms of meaning and commerce, and those
belong to stakes and contest, not to motion vetoes.

**v1 is cascade/detach, full stop.** Revisit only on a real case.

## 3 · Deletion

**Deletion never cascades, for anyone.** Delete a parent and its children detach
upward — they survive, at unchanged world position, re-homed to whatever now
contains them.

This is not a tier privilege that the constitution gets to override. Destructive
cascade is always an explicit, declared policy, never something a higher tier
simply has by being higher. Nobody's work disappears because something above it
was removed.

## Parent-capture is toothless by construction

Worth naming, because it is the first attack anyone thinks of.

Containment is derived from geometry. So somebody could draw a large mark around
your ground and become, structurally, your parent — without asking you, without
you noticing. Under a naive design they would then be able to carry you off.

They cannot, and the reason is structural rather than defensive. **An edge born
from someone else's act never carried your declaration.** It therefore holds the
default policy. The default is detach. The capture gives them the edge and
nothing that the edge is good for.

No special case, no anti-capture rule, no detection. The consent model simply
has no way to express "you consented" when you were not there.

## Scope for v0

Only **containment and attachment** edges carry propagation policies. Every other
dependency passively re-derives, the way it does today.

The general problem — governing subgraph recomputation when a node with arbitrary
dependents updates, such as a quest condition that reads positions or a contract
that references a mark — is the named frontier, not a gap. Its impact-analysis
traversal is the same query as the convergence layer's freshness check: *what has
an edge into this node and predates its current version?* Carriage is that
problem's deliberately narrow first case.

## Provenance

- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §2.4, §6 dial 3
- `WORLD/marks/let-there-be-light/the-record/the-sovereign-interior/mark.md`
- `WORLD/marks/let-there-be-light/the-record/the-re-homing/mark.md` — directories
  move, ids never do, which is what makes detach cheap
- `tools/marks-fold.mjs` `placementParent` — the sibling-promotion this law leans on

[RED-PEN: nothing here says who may *set* a policy other than the default at edge
birth, or whether a receiver may change it later. "Stamped at edge birth" implies
never, but the proposal does not say so and the difference matters the first time
someone wants off a boat's cascade. Unresolved pending receipt.]

[RED-PEN: the whole edit law is written for marks. Entities have declared
attachments too — boarding is the worked example — but an entity has no
geometric parent, so "detach" means something different for a passenger than for
a stall. Worth one sentence saying which.]
