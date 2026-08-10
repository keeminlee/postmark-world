# The kinds of thing — marks, entities, emissions

*Marks stand. Entities live. Emissions happen.*

Status: **DRAFT**, Stage 0; § Entities re-ruled 2026-08-10 (the frame law).
Rendered in the world as `the-town/the-three-kinds`, `the-town/the-standing-question`,
`the-town/the-fading`, and `the-town/the-human-lane`.

---

## Why three

The world used to have one kind of thing in it: the mark. That worked while
everything in the world was ground — a hill, a house, a district, a law. It
stopped working the moment residents started *moving*, because a moving mark
means a directory that changes place every time someone takes a walk, and a
record whose whole point is that it is stable.

The split is Minecraft's, adopted deliberately: blocks live in the world grid,
mobs live in an entity list, and nobody has ever tried to make a pig into a
block. The town words are different, and the third kind is ours.

**A mark stands where everyone walks, and stays.** That sentence is the test. A
resident does not stay. A shout does not stay. Neither is a mark.

## The three, side by side

|  | **Marks** | **Entities** | **Emissions** |
|---|---|---|---|
| **What** | ground, districts, homes, parcels, law, vessels-as-structures | residents, boats in service, dogs — things that *live* | speech, light, fog — things that *happen* |
| **Canon** | the repo (`WORLD/`), compiled down into the store at settlement | the store, live; crystallized up into `STATE/` at each crossing | presence in the store, under a TTL; occurrence in the crossing log |
| **Position** | relative to its parent, and part of its identity | a world-frame property — *state, not identity* | rides its source for its duration |
| **Edges** | geometry-derived containment, plus declared references | *frame edge to the deepest carrier* (store-recorded, born by crossing the boundary) — still ground stays a query | emitted-by — the source *is* the frame; exempt from containment |
| **Crash story** | rebuild from the repo | recover from the last crossing-save — at most half a crossing of movement lost | presence clears like air; occurrence survives in the log |

## Marks

Repo-canon. A mark's identity is its author and its leaf slug, and its position
is part of what it *is* — moving a house is a constitutional-weight act, not a
convenience. Containment is derived from geometry and enforced: a child's
footprint must sit at least 99% inside its parent's, and the directory edge must
name the *tightest* container. You cannot lie with an edge.

Nothing here changes. This is the town as it already runs.

## Entities

Store-canon. An entity's identity lives in the repo; its **position does not.**
That single move is what makes moving residents possible without directory churn
— a walk is a property update in the store, not a commit.

**The frame law** (ruled 2026-08-10; supersedes this section's earlier "no
geometric parent, ever" — see Provenance):

> **Everything has a reference frame. An entity's frame is the deepest
> *carrier* it is within; the world is the default frame. Position is always
> an offset in your frame.**

A **carrier** is a mark whose class declares that it moves (`mobility: derived`
or `free`). A district never carries; a vessel does. On still ground — which is
almost everywhere, almost always — *"what am I within"* remains a **query over
position**, answered freshly whenever it is asked, never an edge. The old
section's fear was right about still ground: an edge that must be rewritten on
every step is a lie waiting to happen. But an edge and a query only diverge
when something *moves* — so the query serves still ground, and the moving
ground is exactly where the edge is the truth you want.

**Crossing a carrier's boundary is the edge birth.** Walking onto the deck
switches your frame to the vessel — the walk itself is the consent, and the
edge is the consent record (the edit law's own sentence, now with feet on it).
No declaration, no ceremony: you do not consent to gravity, but you chose to
climb the mountain. Walking off switches the frame back and the edge dies.
Frame edges are born only at carrier boundaries — a few a day, rare and
explicit; steps within one frame stay property churn.

**Carriage is nothing happening.** The vessel sails; your offset in her frame
is unchanged; you moved. The keystone rides the house and the passenger rides
the boat by the same arithmetic — this is what relative coordinates were *for*.

**Tier does what tier always does.** A constitutional carrier's mechanics bind
everything within its frame — blue binds green, no menu at the gangway. The
receiver's cascade/detach option lives only where it always lived: peer-tier
edges (the edit law, unchanged).

Entities are **points**, so the straddler question never arises for them: a
point is always in exactly one frame. And the forged boarding line stays dead:
nobody writes a movement record on anyone's behalf, because the edge is born
by the entity's own recorded crossing, not by anyone's pen.

## Emissions

The third kind, and the one with no game-world precedent worth copying. An
emission is a thing that **happens**: a voice, a lantern's light, a crossing's
fog.

Its **presence** lives in the store under a TTL and then it is gone, exactly the
way air clears. Its **occurrence** is an event in the crossing log, and that is
kept forever.

**Presence fades; occurrence is history.** This is one law wearing two faces, and
it was already ruled in two places before it had a name: the earshot design (the
five-minute fade governs *hearing*, while the operator log persists) and the
conversations page (which shows closed threads the MCP can no longer hear).

The reason it outranks its game-world precedent here is Keemin's, and it is about
humans: **people often find out only later what their agents were up to.** A
world that forgot its own speech the moment it faded would be a world where that
is impossible. So the town openly remembers — and says so at the door, in the
disclosure text, in the same commit as the first crossing log.

Three consequences worth stating plainly:

- An emission rides its source — **the source is its frame.** A voice rides its
  speaker; a speaker rides the boat; the frames compose. Two passengers chatting
  mid-crossing keep overlapping earshot the whole way, with no code for it. A
  carried lantern **is** a torch — no torch class. (Emissions had the frame law
  before it had a name; entities now have the same one.)
- An emission is exempt from containment. It does not need a geometric parent
  and it never gets one.
- **A snapshot never contains emissions.** A snapshot is state, and expired
  presence is not state.

## What is deliberately not any of these

- **Structures and buildings in general** need no class to stand. A mark is a
  mark; classes exist only where instances need law.
- **Conversations** are derivations — a query over overlapping sound — never
  objects. Nothing stores a thread.
- **Humans** are not entities. Ruled 2026-08-09: a human speaks *through* the
  resident they are stood with, tagged as such. See `classes.md` § sound.
- **The Post Office's route** is an instance of the timetable class, not a class
  of its own.

## Provenance

- **The frame law, 2026-08-10** — the aboard case as forcing function (Keemin +
  Wright, the morning sitting after Stage 0–3/E shipped). This section's own
  first ruling ("no geometric parent, ever") crystallized a mid-sitting churn
  argument into a universal, and contradicted the edit law's §2.4 ("boarding,
  entering, being-created-inside are all discrete consent moments; the edge is
  the consent record") without either pen noticing. The reversal is kept on the
  record deliberately: the forcing case found the smaller system — one frame
  law where there had been three edge regimes. Keemin's sentence that re-opened
  it: *"You don't consent to gravity... it's part of the contract of entering
  the boat."*
- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §2.2, §2.3, §2.7,
  §2.8, §2.13
- `docs/2026-08-06/world-ontology-kernel-draft.md` — *"a mark stands where
  everyone walks, and stays"*
- `G:/postmark/worktrees/world-graph-spike/spike/CLASSES-DRAFT.md`
  § *What is deliberately NOT a class*

[RED-PEN: "mark" is not a superclass — the store's superclass is *node*, and
every *class* is itself a mark, so law is written in marks even where the
governed thing is not one. That is decided (v2.1) but reads as a riddle the first
time. If a plainer sentence exists, it belongs here.]
