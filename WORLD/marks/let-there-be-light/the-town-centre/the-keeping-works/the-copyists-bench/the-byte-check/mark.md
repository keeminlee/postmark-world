---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:byteMirror
value: tools/lib/mirror.mjs::byteMirror
mechanic_draft: code:site:byteMirror
pre: true
derived_from: "tools/lib/mirror.mjs::byteMirror — \"byte-compare copy. Returns \\\"wrote\\\" | \\\"kept\\\" | \\\"missing\\\".\""
---

Copies a file over only when its contents have actually changed, so an untouched page never gets rewritten for nothing.
