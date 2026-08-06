---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:tokenIsFresh
value: src/lib/auth.mjs::tokenIsFresh
mechanic_draft: code:site:tokenIsFresh
pre: true
derived_from: src/lib/auth.mjs::tokenIsFresh — "A stored token is usable if present and not past its access lifetime."
---

Checks whether a visitor's proof of who they are is still good, or whether they'll need to prove it again.
