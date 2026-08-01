---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:validateResidencyRequest
value: src/residency.mjs::validateResidencyRequest
mechanic_draft: code:office:validateResidencyRequest
pre: true
derived_from: src/residency.mjs::validateResidencyRequest — "request_residency needs a proposed handle (lowercase-hyphenated) and an ADDRESS card body"
---

Reads a proposed name and its card against the town's own naming and size rules before anything is carried forward.
