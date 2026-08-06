---
kind: predicated
by: the-town
tier: constitution
date: 2026-08-01
slot: fn:processImage
value: tools/lib/images.mjs::processImage
mechanic_draft: code:site:processImage
pre: true
derived_from: "tools/lib/images.mjs::processImage — \"resize + flatten + jpeg, byte-compare write. Returns \\\"wrote\\\" | \\\"kept\\\".\""
---

Resizes a picture, sets it against the town's night sky, and only actually saves it if the result is genuinely different.
