---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:currentDeparture
value: tools/walk.mjs::currentDeparture
mechanic_draft: code:world:currentDeparture
pre: true
derived_from: tools/walk.mjs::currentDeparture — "a resident's CURRENT departure is their last recorded one."
---

A resident's current position is always their last recorded departure — latest wins, with no other rule.
