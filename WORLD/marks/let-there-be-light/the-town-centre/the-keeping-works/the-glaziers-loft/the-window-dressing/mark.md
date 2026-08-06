---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:stageWindows
value: deploy/publish-windows.mjs::stageWindows
mechanic_draft: code:office:stageWindows
pre: true
derived_from: deploy/publish-windows.mjs::stageWindows — "Stage every household window under stageDir. Pure filesystem — no swap, no git."
---

Copies each household's pane and its own small trimmings into its own alcove, touching nothing else in the town.
