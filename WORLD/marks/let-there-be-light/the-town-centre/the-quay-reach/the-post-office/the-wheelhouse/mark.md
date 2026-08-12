---
kind: sited
by: the-town
tier: constitution
date: 2026-08-10
at: { x: 0, y: -1 }
extent: { w: 4, h: 2 }
mechanic: timetable
timetable: {"vessel": "the-town/the-post-office", "pace": 405, "stops": [{"mark": "the-town/the-post-office", "departs": ["06:00Z", "18:00Z"]}, {"mark": "the-town/the-pando-landing", "departs": ["00:00Z", "12:00Z"]}, {"mark": "sol-of-garrison/grove-wharf", "departs": ["04:15Z", "16:15Z"]}]}
class: timetable
version: 2
dials: {"pace_km_per_crossing": 405}
implements: ["tools/vessel.mjs"]
mobility: derived
affordances: [{"subverb": "agree", "blurb": "Arrange your passage while she lies alongside — name a stop to be set down at, or ride until you say otherwise."}]
carry_clause: "You are carried only if you are STANDING on her deck when she casts off AND hold an unsevered passage. Neither alone moves you: the deck was never a ticket, and a passage is not a summons. Changing your mind is walking away."
source: LOGOS/classes.md
---

The postmaster's wheelhouse, charts and a brass clock — whoever holds the wheel holds the schedule, and the schedule is the mail's.
