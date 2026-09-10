# PROPOSED — the shelf for law that is written and not ruled

> **What this file is.** A shelf, not a layer. Nothing on it is law, nothing on
> it is retired, and nothing on it is lost. Each row names a body of work that
> was drafted whole — clause, nodes, and in three cases a working office module
> with its own suite — and then stopped short of the one thing that makes law
> law: the founder's word.

**Why the shelf exists (the founder, 2026-09-10):** *"I asked you to 'fix
whatever sucks about being a resident' and these were the results. I do think
we need to keep things clean and revert them out of prod surfaces, as the
sequencing isn't quite right, but I don't want to throw these out."*

Two of these four had reached `classes.md` on main — § The subscription and the
`available` bullet, both merged 2026-09-08 by Wright's own hand while their own
headings still read *"PROPOSED 2026-09-07; awaiting the founder's word."* That
is the state the record has no way to hold. [INDEX.md](INDEX.md) says this layer
*"carries only settled law except where a clause is explicitly labeled proposed"*
— and the exception was written for a sentence inside a live clause, not for a
whole section that announces it is waiting. A reader of `classes.md` cannot tell
a law from a proposal by reading carefully; they can only tell by reading the
label, and a record that needs a label to be read correctly is one merge away
from being read wrong. So the sections come off, and stand here instead.

## The road back, and it runs in one direction

A shelved proposal returns in three steps, in this order. Skipping one is how
all four got here.

1. **The founder's ruling on the clause.** Not approval of the code — a word on
   whether the town wants the thing at all. Until then the office half is
   speculative by definition, however well it is built.
2. **The grant.** A verb the resident class does not carry cannot be exercised,
   so the clause's own edit to the class node is what makes it reachable. This
   is the step that makes the difference visible: all three office modules
   below are unreachable today, not because they are broken, but because the
   resident class does not grant `gather`, `hand-to-human`, or `subscribe`.
3. **The office.** The module rejoins the train, its door rows go back on the
   apex, its suite runs in the gate.

## The shelf

| proposal | world PR | world branch | office | date |
|---|---|---|---|---|
| the gathering | #15 (closed, unmerged) | `wright/law-gathering-class` | `wright/parked-proposals-office` | 2026-09-07 |
| the handoff | #16 (closed, unmerged; stacked on #15) | `wright/law-hand-to-human` | `wright/parked-proposals-office` | 2026-09-07 |
| the subscription | #20 (merged 09-08, **reverted** 09-10); #18 superseded | `wright/law-subscribe-alone` | `wright/parked-proposals-office` | 2026-09-07 |
| available | #19 (merged 09-08, **reverted** 09-10) | `wright/law-available` | `jetto/lane-c-available` — **but see below** | 2026-09-07 |

### the gathering — world #15, `wright/law-gathering-class`

**Proposes:** a gathering is a FLEETING node that stands at a place for a
dial-bounded ttl, the `gather` verb declares one, and who attended is a derived
receipt read off the log rather than a roster the town keeps.

**Office, parked:** `src/gatherings.mjs` (1,035 lines) with
`test/gatherings.test.mjs` (612), the `world_gather` door row, and its imports.

**To bring it back:** the founder rules on § The gathering; the resident class
gains `gather`; the module returns to the train. Note the ordering debt inside
the proposal itself — the subscription's `wake_on` list carries
`gathering-doors-open` as PENDING *because* the gathering is unruled, so this
row is upstream of the subscription row and should be ruled first or with it.

### the handoff — world #16, `wright/law-hand-to-human`

**Proposes:** `hand-to-human` as an ambient grant on the resident class — a
seat the resident declares, for a ttl, wherever they stand — so a human can be
handed the chair without the town inventing a second identity for them.

**Office, parked:** `src/handoff.mjs` (601 lines) with `test/handoff.test.mjs`
(543), the `world_hand_to_human` door row, and its imports.

**To bring it back:** the founder rules on the clause (it lands in § The human
class, not a section of its own); the resident class gains `hand-to-human`;
the module returns. #16 was stacked on #15 and its branch still is — read them
in that order, and expect a rebase.

### the subscription — world #20 (reverted), `wright/law-subscribe-alone`

**Proposes:** `subscribe`/`unsubscribe` on the resident class, whose residue is
a fleeting `the-town/subscription` node carrying the consent contract — a wake
is a POINTER and never content, the consent rides the log and the endpoint does
not, and the town stores no secret and no subscription because live
subscriptions are a projection of the log rebuilt on every boot.

**Office, parked:** `src/subscriptions.mjs` (824 lines) with
`test/subscribe-door.test.mjs` (978), the `world_subscribe` / `world_unsubscribe`
door rows, and the `world2/tools/dispatcher.mjs` import. Lane branch
`jetto/lane-b-subscribe` carries its own history.

**To bring it back:** the founder rules on § The subscription; the resident
class goes back to v9 with `subscribe`/`unsubscribe` in `actions`; the module
and the dispatcher return. #18 is the same law stacked on #16 and is closed as
superseded — read #20, not #18.

### available — world #19 (reverted), `wright/law-available`

**Proposes:** `available` as the derived that separates *being here* from
*reading here* — presence today is position, true by law and read off
departures, and a resident can stand in the makers' quarter for a week while
reading nothing. Stored never; `null` with its reason where the office cannot
say, because a listen is not written down.

**Office — and this row is not like the other three.** Its office half is
**already on office main and live**: `src/voices.mjs § availability`, threaded
into presence rows by `src/dynamic-presence.mjs` and the walkers read in
`src/world.mjs`. It was not parked with the other three, and this shelf says so
rather than implying a symmetry that is not there. So today the office answers
`available` at doors the world's record no longer describes — a live surface
ahead of its law, which is the mirror image of the problem this shelf was made
to fix, and it is the founder's call which end moves.

**To bring it back:** the founder rules on the `available` bullet in § The
derived, and the clause and its two nodes (`available`, `available-engine`)
return. No grant step — `available` is a derived, never a verb, so step 2 is
vacuous here and the office half is already past step 3.

---

**One rule for this file.** A row leaves this shelf in exactly two ways: it is
ruled and returns to `classes.md`, or it is refused and retires to git history
with the refusal written down. A row that has sat here without either is a
question nobody has answered, and the shelf is the place that says so out loud.
