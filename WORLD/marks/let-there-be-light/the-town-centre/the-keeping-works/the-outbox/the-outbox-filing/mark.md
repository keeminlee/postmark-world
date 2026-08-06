---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:enqueueLetter
value: src/write.mjs::enqueueLetter
mechanic_draft: code:office:enqueueLetter
pre: true
derived_from: src/write.mjs::enqueueLetter — "Validate + write + commit. Returns { letter_id, commit, expected_crossing }"
---

Checks a letter's envelope against the ferry's own rules, then files it in the sender's outbox to await the next crossing.
