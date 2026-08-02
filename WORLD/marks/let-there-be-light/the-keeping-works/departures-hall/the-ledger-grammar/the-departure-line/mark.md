---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:formatDeparture
value: tools/walk.mjs::formatDeparture
mechanic_draft: code:world:formatDeparture
pre: true
derived_from: tools/walk.mjs::formatDeparture — "One line per departure, append-only, mirroring the town's mail/stamp ledgers"
---

Formats one departure into the ledger's one-line grammar: handle, from, toward, the fractional crossing, and any named target.
