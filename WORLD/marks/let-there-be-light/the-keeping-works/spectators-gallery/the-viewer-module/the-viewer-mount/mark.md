---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:mountViewer
value: spectator/viewer.mjs::mountViewer
mechanic_draft: code:world:mountViewer
pre: true
derived_from: spectator/viewer.mjs::mountViewer — "the host page is a thin shell that calls `mountViewer(appEl)`."
---

Mounts the one told-world viewer into a host element — the same implementation the local build and postmark.town both serve.
