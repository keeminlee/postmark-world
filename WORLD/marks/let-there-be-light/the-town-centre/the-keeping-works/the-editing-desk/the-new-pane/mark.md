---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:updateWindow
value: src/edit.mjs::updateWindow
mechanic_draft: code:office:updateWindow
pre: true
derived_from: src/edit.mjs::updateWindow — "self-contained — it may CALL only the town's own surfaces" (line 59; enforced at line 74, "a window is self-contained")
---

Hangs a household's whole pane fresh each time, refusing it outright if it reaches for anything beyond the town's own walls.
