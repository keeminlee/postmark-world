---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:parseFrontmatter
value: tools/lib/town.mjs::parseFrontmatter
mechanic_draft: code:site:parseFrontmatter
pre: true
derived_from: tools/lib/town.mjs::parseFrontmatter — "Minimal YAML subset: `key: value` lines between --- fences."
---

Lifts the handful of `key: value` lines fenced at the top of a page into a small record, leaving the words beneath as the body.
