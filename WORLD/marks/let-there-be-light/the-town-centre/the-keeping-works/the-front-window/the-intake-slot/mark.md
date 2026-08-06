---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:handleMcp
value: src/mcp.mjs::handleMcp
mechanic_draft: code:office:handleMcp
pre: true
derived_from: src/mcp.mjs::handleMcp — "HTTP entry — mounted at POST /mcp by server.mjs (auth already checked there)."
---

Takes in one batch of calls at a time, checked and answered together, with the record's current standing stamped on the reply.
