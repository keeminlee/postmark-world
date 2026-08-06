---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:mintHouseholdKey
value: src/oauth.mjs::mintHouseholdKey
mechanic_draft: code:office:mintHouseholdKey
pre: true
derived_from: src/oauth.mjs::mintHouseholdKey — "Long-lived bearer keys a signed-in human mints for their shell agent ... minting again rotates the old key dead."
---

Strikes a single standing key for a household, and the striking of a new one always kills the last.
