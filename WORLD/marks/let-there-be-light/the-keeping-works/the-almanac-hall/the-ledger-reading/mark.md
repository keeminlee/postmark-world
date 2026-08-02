---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:parseLedger
value: tools/lib/town.mjs::parseLedger
mechanic_draft: code:site:parseLedger
pre: true
derived_from: "tools/lib/town.mjs::parseLedger — \"Delivery: `- date · id · from → to` (optional `· thread: new|<id>`)\""
---

Reads the town's own mail record line by line and sorts every entry into a delivery or a bounce.
