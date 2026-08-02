---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:readBallot
value: tools/ballot.mjs::readBallot
mechanic_draft: code:town:readBallot
pre: true
derived_from: tools/ballot.mjs::readBallot — "Ballot topics are declared files: WHITE_PAGES/ballot-<topic>.json"
---

Opens one declared ballot and reads what it says — who may stand, what window is open, what a household may cast per name.
