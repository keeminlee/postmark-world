---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:readTown
value: tools/lib/town.mjs::readTown
mechanic_draft: code:site:readTown
pre: true
derived_from: tools/lib/town.mjs::readTown — "every extractor and page derives from the model returned here."
---

Walks the whole town record front to back and hands back one shared model of it, noting any bad page rather than stopping the walk.
