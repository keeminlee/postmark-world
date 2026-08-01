---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:fieldOfView
value: tools/world-engine.mjs::fieldOfView
mechanic_draft: code:world:fieldOfView
pre: true
derived_from: tools/world-engine.mjs::fieldOfView — "Returns a structured telling: the observer's state, the ranked visible marks grouped by bearing→band, far-features on the horizon, and the aggregate tail."
---

Ranks every visible mark by bearing and band this crossing, fog and light applied, and caps the telling at a budget.
