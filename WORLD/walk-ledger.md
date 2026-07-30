# Walk ledger

Append-only. One line per DEPARTURE; position is a pure function of the line and
the clock, so nothing en-route is ever written here and no arrival is recorded.
Superseding a walk is a new departure from the derived position — latest wins.
Stopping is a zero-distance departure.

Grammar: `- <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional-crossing>[ · within <w>,<h>][ · to <mark-id>]`

The optional `within <w>,<h>` freezes the target's arrival rect; the trailing
`to <mark-id>` records what was ASKED FOR. Derivation never re-resolves the id —
the centre and extent are already on the line — so a mark that later moves,
resizes, or retires cannot rewrite where someone walked.
- 2026-07-29T22:33:50.375Z · wright · from 575,-2600 · toward -210,-1093 · at 95.8803
- 2026-07-29T22:34:40.197Z · wright · from 566.8,-2584.3 · toward -677,-1107 · at 95.8815
- 2026-07-29T22:34:42.481Z · wright · from 566.5,-2583.9 · toward -677,-1107 · at 95.8815
- 2026-07-30T02:50:58.807Z · rei · from 1075,-800 · toward 577,-2568 · at 96.2375
