# the works portal — a demo slice

**This is exploration scaffolding. Nothing here ships, and this branch may never
merge.** It exists so the Keeping Works can be *looked at* as a graph before
anyone rules on how it should be drawn. It plants no law, cites no law, and
changes no engine, fold or lint behaviour — every file it adds is under `demo/`.

## Run it

```
node demo/serve.mjs          # → http://localhost:4890
```

`PORT=…` moves it. There is no build step, no network call, and no write path:
every response is computed fresh off this worktree's `WORLD/marks`, so editing a
mark and reloading the page shows the edit.

## The walkthrough

1. **The map.** The town centre around the Keeping Works, drawn from the real
   record — the quarter's own rooms are the marks that stand in it. The works is
   outlined in gold and carries a breathing portal.
2. **Cross in.** Click the works or its portal. The map recedes into the
   portal's light and class-space blooms through it. Your feet do not move —
   the map is still there, underneath, and comes back exactly as it was.
3. **The interior**, three ways, switchable live (or press `1` `2` `3`):
   - **tree** — the `extends:` lattice as a top-down dendrogram.
   - **radial** — depth reads as distance from the centre; the class-nodes that
     are outside the lattice entirely get their own outer ring, labelled.
   - **nested** — boxes are the **directory on disk**; the arrows are the
     lattice. Where an arrow leaves its own box, the two disagree.
4. **Ask a node something.** Hover for its body; click for the whole record —
   dials, standing, actions, every edge with its type, and the file it came
   from. At rest the works stays quiet: name and kind only.
5. **The edge switcher** (footer). Click a type to drop it. Turning everything
   off but `residue` is worth doing once — it is a different works.
6. **Cross out.** "← leave the works", or `Esc`.

## What it reads, and how

`demo/works-graph.mjs` derives the graph using the fold's own `loadMarks` from
`tools/marks-fold.mjs` — the same records the world reads, so the demo cannot
drift from the tree by keeping its own copy. The node set is three rules, not a
list: every `kind: class` mark standing in the works; anything a class-space edge
names that resolves to a real mark (this is what pulls the logos quarter's `node`
and `edge` in); and every predicated descendant of those, transitively.

Six edge types are drawn and every one is labelled on the line:

| type | read off |
|---|---|
| `extends` | frontmatter `extends:`, resolved by class name |
| `implements` | frontmatter `implements:`, where the target resolves to a mark |
| `slot` | a predicated child nested under the node it describes |
| `residue` | `actions[].residue` — what an act leaves behind |
| `registry` | one class-node's directory inside another's, with no `extends:` |
| `portal` | the works' portal predicate, naming where the read roots |

`implements:` targets that are **source files** rather than marks are not edges;
they show on the node's detail panel, because they are real and are not marks.

**Placement** (who sits under whom) uses the first available of portal, extends,
implements, registry, slot. That is a drawing decision and nothing else — every
edge is still drawn and labelled by its own type regardless.

## Checking it

```
node demo/falsifiers.mjs     # the brief's four checks (demo must be serving)
node demo/qa-shots.mjs       # → G:/Postmark/qa-shots/works-portal-demo
npm test                     # the world suite, untouched by this branch
```

`falsifiers.mjs` plants a class-node in the tree, watches it arrive in the graph
with its edge, deletes it, and watches the counts return — then counts every
`extends:` on disk against every `extends` edge in **both** directions, and
drives a browser through the crossing to prove the map comes back byte-identical.
