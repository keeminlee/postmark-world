---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:positionAt
value: tools/walk.mjs::positionAt
mechanic_draft: code:world:positionAt
becomes: position
pre: true
derived_from: tools/walk.mjs::positionAt — "positionAt(departure, nowFractional) → where the walker is, and whether the leg is finished."
---

Where a walker stands right now is computed purely from their departure record and the clock — nothing en-route is ever stored.
