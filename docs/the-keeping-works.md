# The Keeping Works — current map

*A current navigation guide, not a constitutional source.*

The canonical record is the mark tree at
`WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/`. This guide
exists because the Works grew far beyond its 2026-08-01 seed and its two kinds
of structure are easy to mistake for one another.

## Two systems at one address

### The ground view: machinery as buildings

The sited portion is a district: Postmark's machinery expressed as buildings,
rooms, desks, and function-grain predicates. There are currently **37 direct
sited buildings** and **43 sited marks in total**, including nested modules.

Representative paths:

- `the-sorting-house/the-envelope-law/` — the town's mail crossing
- `the-mint-house/the-mint-engine/` — stamp derivation and verification
- `the-front-window/the-credentials-desk/` — office protocol and identity
- `spectators-gallery/the-viewer-module/` — the read-only World viewer

The original four-block symmetry no longer describes the record. Later
constitutional work moved most World machinery and the former claim-house
functions into the LOGOS rendering. That history should not be reversed merely
to make the old plat look balanced.

### The class-space view: placeless law

The same directory is also the declaration registry. These seven direct class
roots and one portal are not physical buildings:

| root | current marks | role |
|---|---:|---|
| `postmark-node` | 89 | the node families and their classes |
| `postmark-edge` | 51 | declarable relations and action residues |
| `postmark-rules` | 48 | stipulations and their implementation questions |
| `postmark-invariant` | 25 | standing questions asked of the town |
| `postmark-derived` | 17 | answers computed at read/save time |
| `postmark-economy` | 6 | economic classes and seams |
| `postmark-class` | 1 | the class-of-classes root |
| `the-works-portal` | 1 | the read transition from ground to class-space |

Class nodes have no geometry. Their directory nesting renders type ancestry,
not containment in the district. Do not flatten these branches to make the
filesystem shallower; the hierarchy carries meaning.

## Current census

As read on 2026-09-03 from main at `441580e38`:

- **362** `mark.md` files
- **43** sited marks
- **153** class marks
- **166** predicated marks
- **45** direct child branches: 37 sited, 7 class, 1 portal predicate

This is a receipt, not a dial. The tree governs when the numbers change.

## How similarly named things differ

The Works describes several layers of one town. Similar names are often
relations, not duplicates:

- **institution:** `the-ballot-house`
- **office service:** `the-ballot-room`
- **paper class:** `postmark-node/paper/ballot`
- **governance route:** `postmark-rules/the-asks/vote-lane`
- **escrow edge:** `postmark-edge/stake/stake-ballot`

Likewise, the code-derived `the-quest-board`, the bulletin class
`postmark-node/paper/town-bulletin/quests`, and the public
`WORLD/marks/the-town/the-quest-guild` answer different questions. A future
generated index should expose these layer links directly.

## Draft mechanic registry

`CODE_REGISTRY.draft.json` is still inert draft provenance:

- **101** entries, all `unverified-draft`
- **101** matching `mechanic_draft:` references across the complete World tree
- **77** references remain inside the physical/class Works subtree
- **24** World/town mechanics moved with their witnesses into the LOGOS
  rendering; they are globally referenced, not orphaned

The registry is complete by identifier but not yet durable cross-repository
provenance. Town, site, and office entries carry relative source paths without
a repository URL, revision, or content hash. Do not rename
`mechanic_draft:` to `mechanic:` wholesale. Either rule and verify a real
cross-repository registry contract or remove the inert layer in a separately
reviewed change.

## Maintenance boundary

- Keep physical containment, class ancestry, and cross-layer relationships
  visibly distinct.
- Do not restore removed buildings for aesthetic symmetry.
- Review `version: 0`, source-less, and empty-implementation nodes one ruling
  at a time; several are deliberately held proposals, not accidental debris.
- Regenerate derived views such as `WORLD/INDEX.md` only after mark changes.
- Treat the old seeding report as history, not current authority.

## Historical seed receipt

[`the-keeping-works-seeding-README-2026-08-01.md`](the-keeping-works-seeding-README-2026-08-01.md)
records the original Great Convergence pass. Its `DRAFT` status, 159-mark
census, four-block inventory, and absolute-coordinate discussion describe that
moment only. They do not describe the current Works.
