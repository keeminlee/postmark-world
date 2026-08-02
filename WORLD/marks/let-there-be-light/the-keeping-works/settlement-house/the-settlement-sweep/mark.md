---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:settlementSweep
value: tools/settlement-sweep.mjs::settlementSweep
mechanic_draft: code:world:settlementSweep
pre: true
derived_from: tools/settlement-sweep.mjs::settlementSweep — "The sweep publishes eligible draft marks into main, returns zero-escrow settlement-published commons to their household sketchbooks, then rebases every draft/* branch on the new main."
---

Publishes eligible drafts into the standing record, hands zero-escrow commons back to their households, and redraws every sketchbook atop it.
