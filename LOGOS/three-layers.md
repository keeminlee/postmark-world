# The three layers — logos, world, state

*The word, the world, the living.*

Status: **DRAFT**, Stage 0. Ruled by Keemin, 2026-08-09 evening sitting.
Rendered in the world as `the-town/the-three-layers`, `the-town/the-fidelity`
and `the-town/the-binding-channels`.

---

## The problem this solves

Every law the town writes has to live somewhere, and for a while there was only
one shelf: the marks tree. That shelf is wrong for some laws and right for
others, and nobody could say which was which without arguing it fresh each time.
Worse, some law is *about markness itself* — what a mark is, what kinds exist,
what a valid record looks like. Putting that in a mark is circular: the mark
that defines marks would have to be a valid mark under its own definition, and
the check has nowhere to stand.

The answer is that there are three layers, not one, and each thing has exactly
one home.

## The layers

**Logos — the word.** Everything in this repository *above* `WORLD/`: this
directory, `WORLD/marks/SCHEMA.md`, `WORLD/ENGINE.md`, `tools/`. Whatever must
exist *before* a world is possible — the grammar of marks, the kinds of thing,
the fold, the class-of-classes. It already lived here; the ruling names it and
stops trying to move it into the town.

**World — the world.** `WORLD/marks/`: the one tree, rooted at
`let-there-be-light`. Ground, districts, homes, parcels, the charter and its
articles. This is what a resident walks through and writes into. Repo-canon:
git is the truth, and the store is only ever an index of it.

**State — the living.** `STATE/`: what moves. Residents' positions, declared
attachments, the crossing logs. Store-canon while the town is awake,
crystallized up into the repo at each crossing — **the crossing is the save
tick.** This layer does not exist yet; Stage 2 builds it.

## Logos is never a mark

The tempting move is to write one super-root mark that governs all the others —
"the mark that says what marks are." It does not work, and the reason is worth
writing down once so nobody re-proposes it.

A super-root mark only moves the regress up one turtle. That mark would itself
need a kind, a tier, an author, and a well-formed body, and the definitions of
those things would have to come from somewhere — either from itself (circular)
or from a mark above it (the same problem, one level higher). The recursion has
no floor inside the record's grammar.

So the loop closes **outside** the grammar, where it always actually closed:
in files governed by git, by the witness, and by the founders' hands. That is
not a workaround. It is the honest description of what has been true since the
first commit — `mark-lint.mjs` has always been the thing that decides whether a
mark is a mark, and no mark has ever been able to overrule it.

A pleasant consequence: the "genesis exception" stops being an exception. It was
never strange that the machinery precedes its in-world portrait. The portrait is
painted *by* the machinery.

## Two kinds of world-law

Not all law that lives in the world is the same kind of thing, and conflating
them is what made "where does this go?" so hard.

**World-operative law** is first-order law *about things in the world*, and it
actually runs. The precedent is the wheelhouse timetable: a mark carrying
`mechanic: timetable` and a `timetable:` field, whose stops are named by mark id,
consumed by `tools/vessel.mjs` to derive where the boat is. That law is in the
world, it is about a boat, and the code reads it. It belongs where it is.

The concrete classes are this kind: sound's radius, fog's ceiling, a parcel's
25 × 25 metres. Their dials are law about sounds and parcels — not law about
markness. They stand with their institutions where an institution exists (the
timetable in the wheelhouse, on the boat), and in the Keeping Works otherwise.

**World-rendered law** is the charter's articles: **the textbook**. Readable
copies of logos law standing in the town, carrying a `source:` field that names
the logos document they portray. They are never operative — nothing reads them
to decide anything — and they are checked for fidelity by lint rather than
trusted.

This is the part worth being a little pleased about. An article is allowed to be
incomplete. It is never allowed to lie, because the lint compares it to its
source at every hydration. **The town gets what our own universe never had: a
physics book that cannot drift from physics.**

## Where a law goes — the sorting question, answered

Ask three questions in order.

1. **Is it about markness itself** — kinds, tiers, the edit law, the conflict
   matrix, the class grammar? Then it is logos. It lives in this directory, and
   it may have a rendered article in the charter.
2. **Is it about a specific kind of thing in the world** — how loud a voice
   carries, how big a parcel is, when the boat leaves? Then it is world-operative
   law. It lives on a mark, and code reads that mark.
3. **Is it something that moved?** Then it is state, and no mark records it.

## Two binding channels

Placement is not decoration; it is how law reaches the thing it governs. There
are exactly two channels, and they are why the sorting above works.

**Place-law binds via the spine.** A constitution mark binds whoever carries it
on their ancestor spine. So law meant to bind everyone must sit on the root —
which is what the charter articles do, riding every spine at once.

**Kind-law binds via the instance edge.** A class binds its instances through
`instance_of`, wherever the class mark happens to stand. Its jurisdiction travels
the edge, not the geography — which is why a class can stand with its
institution without weakening its reach.

And one placement rule that falls out of both: **machinery stands with its
institution, when the institution stands in the town.** The timetable lives in
the wheelhouse on the boat. Mail and office machinery belongs in the Post
Office's back rooms. Mint machinery belongs at the mint. The Keeping Works is
the *physics quarter* — geometry, fold, vessel, walk, the customs-house, the
homeless classes — never "all code."

Where a building **stands** is spine truth. What it **implements** is an edge.

## What this ruling retired

- **The pattern-hall** — a proposed in-world hall for the meta-law — dissolves
  upward into logos. Its content is this directory.
- **The halls generally** are cut. They had three jobs: carrying law (gone to
  the root and to logos), expressing inheritance (now a written `extends:` field,
  never an address), and grouping (almost nothing left to group once machinery
  stands with its institution). The Keeping Works is one flat district. Streets
  get added when fifty buildings make finding things hurt, and re-homing a mark
  never changes its id, so grouping later is cheap.
- **Nesting-as-subsumption.** An earlier draft made a class's containment parent
  its superclass. Inheritance is now `extends:`, a field. Addresses carry no
  class semantics.

## Provenance

- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §2.1, §2.6, §2.7
- `G:/postmark/worktrees/world-graph-spike/spike/CLASSES-DRAFT.md`
  § *The three layers*, § *The two binding channels*
- `WORLD/ENGINE.md` § the timetable mechanic — the world-operative precedent

[RESOLVED 2026-08-09 — the red-pen here said the fidelity lint did not exist and
an article could drift with nothing to catch it. Two lints now ship in
`tools/mark-lint.mjs` § 9, and the clause they enforce stands in the world as
`the-town/the-fidelity`:

- **L-source-1** — every `source:` names a file that is actually in the repo.
- **L-source-2** — the citation runs both ways: the clause names the document,
  and the document names the clause back by id, on a "Rendered in the world as
  `<id>`" line. A document with nothing in the world yet declares that in the
  same grammar — "Rendered in the world: not yet" — and both directions leave it
  alone.

What is checked is that the pair is real, mutual, and findable. Whether the
clause still *says* what the source says is read by a person, at settlement —
and these two lints are what make that read possible, because the document can
no longer be rewritten by someone with no way of knowing a clause is quoting it.
The stronger claim this document made — that the physics book *cannot* drift —
is true of the citation, and true of the sentence only as far as the pen that
settles it.]
