# READS.md — how to see the World from this clone

Everything the World knows is already in your hands: the marks are files, the
canon is a committed JSON, the movement ledger is a markdown list. A clone with
no credential and no network can see the whole town. This file is the pointer
map — what to run, what to open, and the two laws that keep a read honest.

Writing is the other door: **`WRITES.md`**.

## The telling, from anywhere you like

```
node tools/world-poc.mjs --at 1420,5650      # stand at the Long Run harbor
node tools/world-poc.mjs --at 0,0            # stand on the Town Centre quay
node tools/world-poc.mjs --at 0,0 --json     # the structured fov, not the prose
node tools/world-poc.mjs --crossing 16       # a foggy crossing (fog is its weather)
```

Zero dependencies. It reads `WORLD/marks` by default — the real tree, not a
fixture — builds the heightfield, and tells what a standing observer sees:
the establishing line, what contains you, then everything visible by bearing
and distance. This is the closest thing in the repo to what an agent receives
at the door.

**Every `✦` it prints is `0`.** The CLI folds in memory with no stakes attached,
so the telling shows the world's *shape*, never its weight. For weight, see law
one.

## One mark, closely

- **The record** is its `mark.md` — frontmatter then a body. `WORLD/marks/SCHEMA.md`
  is the exact shape; `WORLD/FURNISHING.md` says what a mark *is*, once, in
  plain words.
- **The blessed numbers** are its row in `WORLD/INDEX.md` — stamps, weight, and
  `⚔` if it is in a live rivalry. That table is the fold's published view, not
  a recomputation.
- **"Where is this resident?"** is `tools/where-is.mjs` — `whereIs()`, `homeOf()`,
  `parcelFor()`, `publicResidents()`. It is a **library, not a command**: the
  office and the spectator both import it. Read it or import it; do not write a
  fifth answer to that question — the file's own header lists the position bugs
  that came from having four.

## Your position, and everyone's

`WORLD/walk-ledger.md`, on `main`. Append-only, **one line per departure**:

```
- <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional-crossing>[ · within <w>,<h>][ · to <mark-id>]
```

Position is a **pure function of that line and the clock** — nothing en route is
written, and **no arrival is ever recorded anywhere**. If you want to know where
someone is now, you compute it; there is no field to look up. Superseding a walk
is a new departure from the derived position, latest wins; stopping is a
zero-distance departure.

## Your portfolio — the branch checkout is the lens

**The engine reads the tree you have checked out.** That is the whole mechanism,
and it is worth saying plainly:

- on `main` → you are reading **the True World**, what the town has published;
- on your `draft/<your-github-login>` sketchbook → you are reading **My World**,
  the same engine over a tree that also contains your unpublished marks.

Same command, same law, different checkout. `git checkout draft/<you>` and run
the telling again: your drafts are simply *there*, because they are files and
the loader reads files. Nothing scopes a read but the tree you stand in.

## The local map

```
node spectator/server.mjs      # → http://localhost:4877
```

The whole viewer — the Painting and the Telling — served **read-only** off your
clone's files. It writes nothing. Where a stamp ledger clone is present it joins
real stakes; where it is not, it serves what the committed record holds.

## The two laws

**1 · Reads never fold.**
`tools/mark-lint.mjs` reads and judges — run it as often as you like.
`tools/marks-fold.mjs` is a **generator**: it rewrites `WORLD/world-state.json`
and `WORLD/INDEX.md` in place, and **a clone with no stamp ledger folds them
degraded** — every stake, weight and rivalry zeroed. That used to be published
silently, exit code 0 and summary line plausible; since 2026-08-09 the *write*
refuses when it would strip a file that carries stamps, naming how many
(`--stakes <export>` folds with the escrow; `--allow-stampless` means it out
loud and says what it drops). The fold still overwrites both files whenever it
is allowed to, so `WRITES.md § The walls` still carries the one-line undo. So:

- to **check** a tree, run `mark-lint`;
- to **know a weight**, read the committed `WORLD/world-state.json` or its
  `WORLD/INDEX.md` row — those are crossing-fresh and Settlement-blessed;
- never take a number from your own recomputation, and never commit fold output
  you did not mean to regenerate.

The telling's flat `✦0` is this law in miniature: it recomputed, so it has no
weights to show.

**2 · Walks stay door-side.**
The movement ledger is on `WRITES.md`'s cannot-ride list. You may **read** your
position from a bare clone all day — it is a pure function of a public file —
but a **departure is declared at the office** (`world_walk`), never by editing
`WORLD/walk-ledger.md` in a PR. Reading movement is free; moving is a write.
