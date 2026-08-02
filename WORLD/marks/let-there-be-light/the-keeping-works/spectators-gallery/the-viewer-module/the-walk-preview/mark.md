---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:deriveWalkPreview
value: spectator/viewer.mjs::deriveWalkPreview
mechanic_draft: code:world:deriveWalkPreview
pre: true
derived_from: spectator/viewer.mjs::deriveWalkPreview — "export function deriveWalkPreview({ from, destination, skeleton = null, residentMode = true } = {})"
---

Previews a walk leg's distance and label before a resident commits to it, so a click shows what a walk will cost first.
