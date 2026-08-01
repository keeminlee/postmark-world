---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:loadMarks
value: tools/marks-fold.mjs::loadMarks
mechanic_draft: code:world:loadMarks
pre: true
derived_from: tools/marks-fold.mjs::loadMarks — "One mark per directory, recorded as `mark.md`."
---

Walks WORLD/marks recursively and reads one mark.md per directory into a record, the same way the lint reads the tree.
