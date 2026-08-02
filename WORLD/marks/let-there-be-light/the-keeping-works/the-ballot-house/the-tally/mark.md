---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:tally
value: tools/ballot.mjs::tally
mechanic_draft: code:town:tally
pre: true
derived_from: tools/ballot.mjs::tally — "per-candidate tally + per-household applied for one topic"
---

Adds up what every name has been staked, and by which household, so a ballot's standing can be read at a glance.
