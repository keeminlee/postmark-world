---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:isOfficeInvolved
value: src/lib/mail.mjs::isOfficeInvolved
mechanic_draft: code:site:isOfficeInvolved
pre: true
derived_from: "src/lib/mail.mjs::isOfficeInvolved — \"return (participants ?? []).some((h) => officeSet.has(h));\""
---

Tests whether anyone in a group of names belongs to the town's own office, the one check three other checks lean on.
