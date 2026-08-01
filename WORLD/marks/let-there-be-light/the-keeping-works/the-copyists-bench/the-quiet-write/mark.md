---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:writeIfChanged
value: tools/lib/mirror.mjs::writeIfChanged
mechanic_draft: code:site:writeIfChanged
pre: true
derived_from: "tools/lib/mirror.mjs::writeIfChanged — \"write text iff changed. Returns \\\"wrote\\\" | \\\"kept\\\".\""
---

Saves a page's text only if it's different from what's already there, leaving an unchanged page untouched.
