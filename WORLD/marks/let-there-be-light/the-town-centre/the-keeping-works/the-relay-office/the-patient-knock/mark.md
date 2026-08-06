---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:apiGet
value: tools/lib/fetch-town-data.mjs::apiGet
mechanic_draft: code:site:apiGet
pre: true
derived_from: "tools/lib/fetch-town-data.mjs::apiGet — \"if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));\""
---

Knocks on the town's front counter for one answer, waiting a little longer after each unanswered knock before trying again.
