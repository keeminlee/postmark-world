---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:worldEngineIsland
value: town/scripts/world-engine-island.mjs::worldEngineIsland
mechanic_draft: code:site:worldEngineIsland
pre: true
derived_from: town/scripts/world-engine-island.mjs::worldEngineIsland — "This integration makes them serve at `/world-engine/**` on the town, WITHOUT copying any engine source into this repo's tracked tree (no drift)"
---

Serves the world's own viewer and its engine at one address on the site, borrowed whole from the one true copy, never duplicated.
