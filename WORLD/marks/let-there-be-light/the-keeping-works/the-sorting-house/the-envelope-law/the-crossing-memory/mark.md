---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:parseLedgerText
value: tools/envelope.mjs::parseLedgerText
mechanic_draft: code:town:parseLedgerText
pre: true
derived_from: tools/envelope.mjs::parseLedgerText — "Parse ledger CONTENT into dedupe state."
---

Reads the whole standing mail ledger once, into a plain memory of what has already delivered and what has already bounced.
