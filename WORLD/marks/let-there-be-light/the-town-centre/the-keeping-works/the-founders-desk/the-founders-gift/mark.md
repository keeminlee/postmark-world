---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:giftViaOffice
value: src/ops.mjs::giftViaOffice
mechanic_draft: code:office:giftViaOffice
pre: true
derived_from: src/ops.mjs::giftViaOffice — "mint a founder gift to a resident ... Runs gift-exec.mjs as a subprocess under the ferry's flock"
---

Hands a resident a founder's gift of stamps, under the same lock every other minting hand at this office must wait for.
