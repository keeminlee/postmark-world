---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:keyIdForToken
value: src/bouncer.mjs::keyIdForToken
mechanic_draft: code:office:keyIdForToken
pre: true
derived_from: "src/bouncer.mjs::keyIdForToken — \"export const keyIdForToken = (token) =>\""
---

Turns a caller's key into a short, one-way mark for the ledgers, so no bucket ever has to write down the key itself.
