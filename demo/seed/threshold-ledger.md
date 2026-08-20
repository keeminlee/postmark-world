# Threshold ledger — the crossings

Append-only. One line per CROSSING; occupancy is a pure function of these lines,
so no edge is ever written here and no departure is (that is the walk ledger's,
beside this one, in the same grammar). Walking is not entering: a walk never
appears here, and a crossing never moves anyone.

Grammar: `- <iso> · <handle> · enters <mark-id> · at <fractional-crossing> · word <welcomed|neutral|opposed>`
         `- <iso> · <handle> · exits <mark-id> · at <fractional-crossing>`

The `word` is the MARK's side of the handshake — its automatic response from
its standing entry law, stamped as it stood at the crossing (the walk ledger's
`pace` precedent) so amending a law never re-derives a crossing already made.
The walker's side is the row's authorship. `opposed` on an entity child is a
refusal at the threshold: the act stands in the record, the occupancy does not.

DEMO SEED (jetto/enter-exit-demo): the two crossings below put the illuminator
aboard the Post Office before the demo starts, so the postmaster has somebody to
find when she steps on. They are the demo's furniture, not the town's record.

- 2026-08-18T02:00:00.000Z · illuminator · enters the-town/the-quay-reach · at 133.0000 · word neutral
- 2026-08-18T02:01:00.000Z · illuminator · enters the-town/the-post-office · at 133.0010 · word welcomed
