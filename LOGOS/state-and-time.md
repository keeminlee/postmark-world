# State and time — the log, the witnesses, the epochs

*Structure is relative; history is absolute. Marks ride their frames; the
past rides nothing.*

Rendered in the world as `the-town/the-witnessed-instant` (named `the-tense`
until the homonym ruling, 2026-08-19 — the word "tense" now belongs solely to
`the-town/the-tenses`, the read-against-the-standpoint law) and
`the-town/the-two-clocks`; the save grammar stands as `the-town/the-save`
(planted 2026-08-18); the log's witness rule as `the-town/the-witnessed-line`
the sketchbook's phases as `the-town/the-live` and `the-town/the-settled`,
and the drain's atomicity as `the-town/the-atomic-drain`;
the record's shape as `the-town/the-record-shape` (planted 2026-08-25)
(planted 2026-08-22, the ladder audit).

---

## The log is the only stored truth

Everything that ever happened is an action record —
`{seq, actor, witnesses, class, payload}` — in one of the **two lawful
substrates**: git commits (structure acts) and the STATE log (dynamic acts).
Which substrate a class writes is a class param, never an instance's choice.
The log is append-only and self-witnessing: an appended record needs no
second record to prove it, and it is never edited — corrections are
superseding actions at the same level, **latest appended wins** (file order
is the tiebreaker the era seam taught us to honor; instants can lie about
order, appends cannot).

A substrate may keep a **cold shelf**: records moved to external storage
under a content-addressed manifest line kept in the substrate itself (URI and
digest) remain that substrate's records — the repo still answers, only the
bytes sleep elsewhere. The manifest is law; the warehouse is furniture.
(Ruled 2026-08-22, the ladder audit — the R2 shelf.)

The graph — every node, every edge, every standing — is a pure function of
the log. Same log, same derivation, same world, on any clone, forever.

## The witnesses

Every action stamps its witnesses at write time: absolute position, and the
innermost containment at that instant. Witnesses exist because **derivations
read current law, and law moves** — you cannot re-derive where someone *was*
from a world that has since changed. The stamp is what the world answered
then. Stored-versus-derived divergence anywhere else is always a finding.

## Crossings are epochs

The world advances on the settlement's clock: twice a day, claims are
evaluated by the response function
([the-response-function.md](the-response-function.md)), canon takes its next
state ([conflict-matrix.md](conflict-matrix.md)), and every sketchbook is
rebased onto it. Declarations land in the author's sovereign space instantly;
the town sees them at the crossing. Classes whose claims cannot conflict
canonize trivially and read as continuous — the fleeting kinds live at
conversation speed without any second clock.

The tense law stands: every write target has a tense. A genesis surface
speaks from creation; a current-truth surface speaks from now; confusing the
two is how a timetable edit once re-derived a voyage already ridden. The
retroactivity that remains — per-instant law for derivations that read
schedules — is an **open cell, named, awaiting design** (#1672); this
document does not pretend it closed.

## The crossing-save

The STATE substrate crystallizes on the same epochs — the save is a
checkpoint of derived state for cheap resumption, a projection like any
other: regenerable, never truth. Replay from the log is the constitutional
guarantee; the save is its convenience. The drain's write-down and the
journal's truncate are one act — a crash between them eats no draft
(rendered as `the-town/the-atomic-drain`, 2026-08-22).

## The record's shape — history is stored, geography is derived

Ruled 2026-08-25 (the founder's word at the release-2026-w35 review, closing
the diagnosis of the freeze night; provenance:
`Starstory PULSE/silver-draft/wright-2026-08-24-postmark-record-shape-store-history-derive-geography.md`
and the census draft `Starstory docs/2026-08-24/the-whole-machine.html`).

**History is stored; geography is derived; no reader ever stores a path.**

- *History* — who did what, what was paid, what was published, when — cannot
  be re-derived, and is therefore stored: the log, the ledgers. Losing it is
  losing it. This bookkeeping is legitimate and permanent.
- *Geography* — where a thing now sits, what contains it, who stands where —
  is always re-derivable from the record, and is therefore never stored: any
  stored copy is a cached answer that rots at the next move. Render it,
  derive it, throw the derivation away.
- **The mark's id is the identity everywhere; filing is a view.** A surface
  that keys on a path is a defect from birth, whatever it is called.

The receipts behind the law: every settlement crisis of 2026-08 — orphaned
mint lines, stranded sketchbooks, the publish+re-home wedge, stale outsider
lists, twenty-seven dead registry paths — was one disease wearing different
coats: a path-keyed reader in a system whose lawful operation moves paths.
Each was patched as an instance until the class was named; this law is the
class, closed. The provenance registry it retires is deleted with the sweep
era's machinery.

### The freeze — filing is static, and the tree is a fossil

The sitting the paragraph above deferred was called the next morning (the
founder, 2026-08-25, the Q&A that found the load-bearing property: *"static
is the way to go"* — staticness, not flatness, is what every receipt of
friction demanded, and flatness is only the layout under which staticness is
trivially true).

**Filing is frozen as of 2026-08-25. A mark's directory is its historical
filing: it carries no claim, and it never moves again. New marks are filed by
identity — `WORLD/marks/<household>/<slug>/` — and containment lives only in
the derived fold, emitted as an artifact each settlement.**

What this repeals and what it keeps:

- The directory-matches-containment law is REPEALED — the tree's paths make
  no assertion, so nothing about them can become false. The lint's old
  dir-equals-placementParent check dies with it; in its place stand two gates
  that enforce the freeze itself: *an existing mark directory that moves is
  refused*, and *a new mark files at its id*.
- The re-home pass is DELETED from the settlement save. The settlement writes
  a mark once; nothing moves it after. (This retires the publish+re-home
  wedge — #1862's class — by removing the mover.)
- "The tree is the map" moves to where derived views live: the fold emits the
  containment map beside `world-state.json` every settlement. The browsable
  truth is generated; the source files rest.
- Zero migration, by design: the existing tree stands exactly as filed on the
  freeze date (a fossil, labeled as such), and the id-keyed layout arrives
  organically through every mark filed after it. No rename storm, ever.

Rendered in the world as `the-town/the-frozen-filing` (planted 2026-08-25).
