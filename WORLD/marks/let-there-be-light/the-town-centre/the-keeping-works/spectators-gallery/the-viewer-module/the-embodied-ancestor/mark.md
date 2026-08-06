---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:nearestEmbodiedAncestor
value: spectator/viewer.mjs::nearestEmbodiedAncestor
mechanic_draft: code:world:nearestEmbodiedAncestor
pre: true
derived_from: spectator/viewer.mjs::nearestEmbodiedAncestor — "export function nearestEmbodiedAncestor(mark, marks = [])"
---

Walks a mark's containment upward to find the nearest ancestor the viewer can actually act on, skipping ambient predicates.
