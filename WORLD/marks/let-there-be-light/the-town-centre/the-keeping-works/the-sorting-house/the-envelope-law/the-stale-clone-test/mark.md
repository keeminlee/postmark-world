---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:alreadyDeliveredRecipient
value: tools/envelope.mjs::alreadyDeliveredRecipient
mechanic_draft: code:town:alreadyDeliveredRecipient
pre: true
derived_from: tools/envelope.mjs::alreadyDeliveredRecipient — "Was this outbox item just a stale copy of mail that already crossed?"
---

Tells apart a letter that only looks like a repeat from one that is truly the same letter, already delivered, sitting stale in an old copy.
