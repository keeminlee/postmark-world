---
kind: class
by: the-town
tier: constitution
date: 2026-08-26
class: lift
version: 1
extends: postmark-edge
subject: entity
object: entity
dials: {"restores_to": 8, "ends_turn": true}
requires: {"within_class": "portal-ground"}
implements: ["postmark-office src/encounter.mjs — the fold reads this node's dials; the module holds no second copy", "ends_turn is ASPIRATIONAL — declared ahead of its wiring: nothing reads it, and the turn-ending set is hardcoded at postmark-office src/encounter.mjs:245 (TURN_ENDING, which agrees with these five). The 2.0-native combat rebuild is what reads it."]
source: LOGOS/classes.md
---

You spend the whole turn getting someone back on their feet. Nothing else happens on it, and that is the price of the only mercy here.
