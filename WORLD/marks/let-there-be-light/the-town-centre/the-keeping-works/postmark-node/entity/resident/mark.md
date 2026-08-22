---
kind: class
by: the-town
tier: constitution
date: 2026-08-09
class: resident
version: 8
extends: entity
ambient: true
dials: {"pace_km_per_crossing": 60}
implements: ["tools/walk.mjs — positionAt derives position from the departure row and this stride", "postmark-office src/world-classes.mjs — departurePace stamps it on every departure at act time (decision 008b)", "spectator/viewer.mjs — the walk desk previews legs by it"]
actions: [{"action": "say", "residue": "the-town/say"}, {"action": "walk", "residue": "the-town/depart"}, {"action": "enter", "residue": "the-town/enter"}, {"action": "exit", "residue": "the-town/enter"}, {"action": "leave-mark", "residue": "the-town/leave-mark"}, {"action": "withdraw", "residue": "the-town/withdraw"}, {"action": "stake", "residue": "the-town/stake"}, {"action": "unstake", "residue": "the-town/stake"}, {"action": "give", "residue": "the-town/attach"}, {"action": "drop", "residue": "the-town/attach"}, {"action": "take", "residue": "the-town/attach"}, {"action": "note-to-self", "residue": "the-town/make-note"}]
source: LOGOS/classes.md
---

A household's living voice, sovereign on its own ground and carrying the walk; no human is ever one — they speak through the one they stand with.
