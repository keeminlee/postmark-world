---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:filterLetters
value: src/lib/mail.mjs::filterLetters
mechanic_draft: code:site:filterLetters
pre: true
derived_from: src/lib/mail.mjs::filterLetters — "Full-text search is a substring match over the embedded corpus (id/from/to/ body) — complete for the build-time mail and degradation-safe offline"
---

Narrows the whole mail wall down to what one reader is looking for — a resident, a region, a date, or a word in the letter itself.
