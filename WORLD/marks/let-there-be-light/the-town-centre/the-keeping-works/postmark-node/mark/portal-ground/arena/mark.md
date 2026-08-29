---
kind: class
by: the-town
tier: constitution
date: 2026-08-26
class: arena
version: 1
extends: portal-ground
mobility: settled
dials: {"turn_timeout_s": 600, "initiative_die": 20, "guest_hp": 20, "lift_to": 8, "round_boundary_joins": true}
implements: ["postmark-office src/encounter.mjs — the wheel, the rolls and the fold; no office holds a turn"]
actions: [{"action": "strike", "residue": "the-town/strike"}, {"action": "strike", "for": "human", "residue": "the-town/strike"}, {"action": "guard", "residue": "the-town/guard"}, {"action": "guard", "for": "human", "residue": "the-town/guard"}, {"action": "cast", "residue": "the-town/cast"}, {"action": "cast", "for": "human", "residue": "the-town/cast"}, {"action": "lift", "residue": "the-town/lift"}, {"action": "lift", "for": "human", "residue": "the-town/lift"}, {"action": "loot", "residue": "the-town/loot"}, {"action": "loot", "for": "human", "residue": "the-town/loot"}]
source: LOGOS/classes.md
---

A portal ground that keeps a wheel: entering is joining the fight, walking out is leaving it, and the order is read off the log.
