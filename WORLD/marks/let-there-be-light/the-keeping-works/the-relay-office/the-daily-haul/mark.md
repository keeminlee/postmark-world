---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:buildOfficeData
value: tools/lib/fetch-town-data.mjs::buildOfficeData
mechanic_draft: code:site:buildOfficeData
pre: true
derived_from: tools/lib/fetch-town-data.mjs::buildOfficeData — "ledger.json preserved from committed snapshot: office has metrics but no event-level ledger endpoint yet"
---

Gathers everything the site needs from the town's front counter in one pass, and keeps an honest list of what it couldn't get fresh.
