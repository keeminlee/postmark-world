---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:buildThreads
value: tools/lib/town.mjs::buildThreads
mechanic_draft: code:site:buildThreads
pre: true
derived_from: tools/lib/town.mjs::buildThreads — "Union-find the reply edges into conversations; roots are letters nobody's thread points from."
---

Ties every letter to its reply-chain into one conversation; a letter answering something missing still finds its group.
