---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:isPrincipal
value: src/ops.mjs::isPrincipal
mechanic_draft: code:office:isPrincipal
pre: true
derived_from: src/ops.mjs::isPrincipal — "Principal = the request's VERIFIED GitHub id matches the pinned PRINCIPAL_GH_ID."
---

Checks a caller's own verified signature against the one pinned founder — no one else ever answers to this seat.
