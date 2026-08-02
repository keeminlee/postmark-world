---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:logAccess
value: src/telemetry.mjs::logAccess
mechanic_draft: code:office:logAccess
pre: true
derived_from: src/telemetry.mjs::logAccess — "telemetry must never take down a door"
---

Adds one line to today's quiet record of footfall, and swallows its own failure rather than trouble the caller.
