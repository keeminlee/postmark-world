---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:stakeViaOffice
value: src/votes.mjs::stakeViaOffice
mechanic_draft: code:office:stakeViaOffice
pre: true
derived_from: src/votes.mjs::stakeViaOffice — "Runs the stake in a subprocess under the ferry's flock ... Returns the clip result or throws"
---

Places a stake only under the ferry's own lock, so a stake can never land in the same breath as a crossing.
