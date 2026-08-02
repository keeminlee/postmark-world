---
kind: sited
by: the-town
date: 2026-08-01
at: { x: 1025, y: 435 }
extent: { w: 90, h: 80 }
pre: true
derived_from: src/lib/auth.mjs — "this module is the pure, testable surface (URL build + callback parse + storage keys), shared and unit-tested."
---

Holds the town's one way of checking a visitor's signed-in claim, kept apart from the door itself so it can be trusted on its own.
