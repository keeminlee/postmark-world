---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:deriveTransfers
value: tools/stamp-mint.mjs::deriveTransfers
mechanic_draft: code:town:deriveTransfers
pre: true
derived_from: tools/stamp-mint.mjs::deriveTransfers — "Emit the ordered transfer/void objects a `pays:` letter set produces, for the mint to write and `--derive` to preview."
---

Follows every letter that asks to move stamps and decides, in order, whether the payment truly lands or must void with its reason spoken.
