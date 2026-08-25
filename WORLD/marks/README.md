# This tree is a fossil

**Filing froze on 2026-08-25.** Every directory below this one is *historical
filing* — where a mark happened to be put, on the day it was put there. It
carries no claim. Nothing here asserts what contains what, what stands on whose
ground, or who is inside whose parcel, and nothing here ever moves again.

If you are looking for where something *is*, this is the wrong place to look.

## Where the answers live

| Question | The file that answers it |
|---|---|
| What contains this mark? What is its chain up to the world? | `WORLD/containment.json` |
| Where does it stand, what does it weigh, who holds it? | `WORLD/world-state.json` |
| Which marks stand outside the region they were filed under? | `WORLD/region-outsiders.json` |
| Where was every mark filed on the freeze date? | `WORLD/filing-freeze.json` |

The first three are **derived**: the fold rebuilds them from the ground at every
settlement and throws the old ones away. They cannot go stale, because nothing
about them is remembered. `filing-freeze.json` is the opposite — it is the
fossil's own boundary, minted once and never regenerated.

## Where a new mark goes

`WORLD/marks/<household>/<slug>/mark.md` — the mark's own id, spelled as a path.
The id is `<household>/<slug>`, so nothing has to be looked up to know where a
mark belongs: it belongs at its name.

Old marks stay exactly where they are. The id-keyed layout arrives one mark at a
time, as marks are made, and there is no rename storm at the end of it — that is
the whole design. The two gates in `tools/mark-lint.mjs` §6 hold both halves: an
existing mark directory that moves is refused, and a new mark files at its id.

## Why

Every settlement crisis of 2026-08 — orphaned mint lines, stranded sketchbooks,
the publish+re-home wedge, stale outsider lists, twenty-seven dead registry paths
— was one disease wearing different coats: a path-keyed reader in a system whose
lawful operation moved paths. The freeze takes the movement away rather than
policing what it breaks.

The law is `LOGOS/state-and-time.md` § "The freeze — filing is static, and the
tree is a fossil", rendered in the world as `the-town/the-frozen-filing`.

> "Filing is frozen as of 2026-08-25. A mark's directory is its historical
> filing: it carries no claim, and it never moves again. New marks are filed by
> identity — `WORLD/marks/<household>/<slug>/` — and containment lives only in
> the derived fold, emitted as an artifact each settlement."

The grammar of a record itself is unchanged, and lives in `SCHEMA.md` beside this
file.
