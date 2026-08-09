# The tiers — blue, green, yellow, gray

*What binds without asking. What is yours. What must be won. What binds no one yet.*

Status: **DRAFT**, Stage 0. Adopting this is a constitutional act — Keemin's pen.
Rendered in the world as `the-town/the-tier-lattice`.

---

## What a tier is

A tier answers one question: **what does it take for this claim to bind
somebody?** Not who wrote it, not how big it is, not where it stands — only what
gives it force over someone who did not write it.

Three tiers have been in the record since the v2 schema, and they work. This
document adds a fourth and gives all four the names the viewer has been painting
them in since the beginning.

## The four

**Blue — constitution. Binds everyone, without stamps, and cannot be rivaled.**
The town's own law. Only `by: the-town` may claim it; the lint refuses any other
hand. A blue mark binds whoever carries it on their ancestor spine, which is why
law meant for everyone sits on the root and rides every spine at once. Nobody
stakes against it; there is no stake that would help.

**Green — sovereignty. Yours, on your own ground, needing nothing from anyone.**
Inside your parcel your word is absolute, and nothing is ever sited inside
another's dwelling. Green needs no stamps because it is not asking anything of
anyone — it governs only the ground its holder already holds.

**Yellow — market. Binds only when staked.** The commons: a claim anyone may
make and anyone may contest. Stamps determine it; withdrawing stamps releases it;
what stays undetermined stays vague, which is a legal way for a claim to rest.
This is the tier where rivalry is not a failure but the whole mechanism.

**Gray — draft. Binds no one, and says so.** Written down, readable, and
deliberately without force. Today "draft" is a *place* — the household's
sketchbook branch — and its non-bindingness is a property of where the file sits.
Gray promotes it to a *tier*, so a mark can be openly provisional on its own
terms.

## The migration from three

| today (on disk) | becomes | what changes |
|---|---|---|
| `tier: constitution` | **blue** | nothing but the name |
| `tier: sovereignty` | **green** | nothing but the name |
| `tier: market` | **yellow** | nothing but the name |
| *(no tier — the sketchbook branch)* | **gray** | new: draft becomes a tier, not only a place |

The first three are renames. **Gray is the only substantive addition**, and it is
the one that needs the founders' attention, because it overlaps something the
record already says.

`the-town/the-sketchbook` currently rules: *"A household's unsettled marks are
its own sketchbook, invisible to every other household until the settlement
publishes them."* Draft-as-a-place is therefore not merely a convention — it is
constitutional, and it carries a **privacy** guarantee that draft-as-a-tier does
not. A gray mark on `main` is public and non-binding; a mark on a sketchbook
branch is private and unpublished. These are different properties, and the
migration must not quietly trade one for the other.

**Ruled (2026-08-09, delegated): both survive, because they are different
instruments.** The sketchbook stays exactly as constitutional and exactly as
private — a household's unsettled marks remain invisible until settlement. Gray
is an ADDITION: a way to stand a mark on `main`, public and openly weightless.
Nothing migrates from the sketchbook automatically; privacy is never traded for
a tier.

## Where the colours come from

They are not new. `spectator/viewer.mjs` has painted the tiers this way since the
viewer existed, and the README states it as the town's one vocabulary: *"blue
binds, green is someone's own ground, amber contests, grey is a household's own
draft."*

So this is less an invention than a promotion: the words the interface already
speaks become the words the law speaks, and one vocabulary covers both. That is
worth having — a resident who has looked at the map already knows the tier
system.

**Resolved (2026-08-09, delegated ruling): yellow**, per dial 2. README trued in
the same commit; the viewer itself never carried the word. Diegetic amber — every
lamp, window, and pane a resident described — is untouched: residents' prose is
theirs.

## Two things this does not settle

**Does the on-disk word change?** `tools/mark-lint.mjs` accepts exactly
`constitution | sovereignty | market`. Adopting the lattice could mean (a) the
colours are the lattice's *names* while the frontmatter keeps its current words,
or (b) `tier:` values become the colours, which is a rewrite of every mark
carrying a tier plus a lint change plus a migration of every reader. The dial
says "one settlement commit + PSA," which fits either reading. **Unresolved
pending receipt.**

[RED-PEN: pick (a) or (b) explicitly. (a) is nearly free and keeps every existing
reader working. (b) is cleaner to explain to a newcomer and costs a full-tree
rewrite. Nothing else in Stage 0 depends on the answer, so this can be decided
late — but it should be decided, not defaulted into.]

**What happens to blue-inside-green and green-inside-yellow?** Both are edit-law
questions, not tier questions, and `edit-law.md` answers them. Short version:
blue-inside-green was ruled out as a case that would never arise, and
green-inside-yellow needs nothing special because the default already protects
the sovereign.

## Provenance

- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §6 dial 2, §2.4
- `WORLD/marks/let-there-be-light/the-record/the-tiers/mark.md` — the standing
  three-tier clause
- `WORLD/marks/let-there-be-light/the-record/the-sketchbook/mark.md` — draft as a
  place
- `tools/mark-lint.mjs` — `TIERS`, and constitution restricted to `by: the-town`
- `README.md` § *The viewer* — the colour vocabulary, already in use
