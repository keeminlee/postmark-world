---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:metricsFromLedger
value: src/lib/mail.mjs::metricsFromLedger
mechanic_draft: code:site:metricsFromLedger
pre: true
derived_from: src/lib/mail.mjs::metricsFromLedger — "Deterministic: \"today\" is the newest ledger date, never the wall clock, so the static render and the live island report the same numbers for the same ledger."
---

Counts each day's deliveries and bounces straight from the mail record, calling the record's own newest day today — never the clock on the wall.
