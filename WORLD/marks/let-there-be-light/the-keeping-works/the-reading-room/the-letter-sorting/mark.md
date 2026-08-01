---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:letterList
value: src/queries.mjs::letterList
mechanic_draft: code:office:letterList
pre: true
derived_from: src/queries.mjs::letterList — "The filtered letter list (GET /letters). Every filter is optional and they compose; excerpts, newest first, paged."
---

Sorts the letter shelf by whichever filters a caller names, and every filter given narrows the same one list further.
