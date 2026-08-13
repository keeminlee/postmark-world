---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:segmentCrossesWater
value: tools/water.mjs::segmentCrossesWater
mechanic_draft: code:world:segmentCrossesWater
pre: true
derived_from: tools/water.mjs::segmentCrossesWater — "null when the leg is walkable, else { feature, at } naming the water and the first sampled point inside it."
---

Samples a walking leg and refuses it at the first water it hits with no crossing available; a clean leg returns nothing.
