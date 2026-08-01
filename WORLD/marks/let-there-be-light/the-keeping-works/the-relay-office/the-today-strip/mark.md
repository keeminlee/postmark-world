---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:buildStats
value: tools/lib/fetch-town-data.mjs::buildStats
mechanic_draft: code:site:buildStats
pre: true
derived_from: "tools/lib/fetch-town-data.mjs::buildStats — \"residents: metrics?.totals?.residents ?? town?.counts?.residents ?? residents.length,\""
---

Works out today's totals for the front door — arrivals, deliveries, bounces — trusting the freshest count it can find.
