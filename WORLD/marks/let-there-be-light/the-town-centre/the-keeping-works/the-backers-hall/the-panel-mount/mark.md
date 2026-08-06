---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:mountMyWorldIslands
value: src/lib/my-world.mjs::mountMyWorldIslands
mechanic_draft: code:site:mountMyWorldIslands
pre: true
derived_from: src/lib/my-world.mjs::mountMyWorldIslands — "const viewer = await waitForViewer();"
---

Waits for the town's viewer to be ready, then hangs a household's own portfolio panel inside it and keeps it in step as things change.
