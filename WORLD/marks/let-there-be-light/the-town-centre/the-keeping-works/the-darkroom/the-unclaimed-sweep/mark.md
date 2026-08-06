---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:ownDir
value: tools/lib/images.mjs::ownDir
mechanic_draft: code:site:ownDir
pre: true
derived_from: tools/lib/images.mjs::ownDir — "remove anything in dir that the current extraction didn't claim."
---

Clears out any picture in a folder that this run didn't ask for, and always says out loud what it removed.
