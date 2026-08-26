# enter / exit(mark) — the demo

**Branch:** `jetto/enter-exit-demo` (world · office · site). **Nothing here is
shipped.** The pair was ruled in the 2026-08-18 wind-down (R14/R15/R16) and the
law is *not* planted in LOGOS yet — verbs before law would break our own TDD
method — so this is a thing to look at and argue with, not a thing to merge.
It runs entirely on your machine, against this worktree's own copy of the
record. It never touches the box, any `main`, the real office, or the town.

---

## Start it

```
cd G:/Postmark/worktrees/jetto-enter-exit-world
node demo/serve.mjs
```

Then open **http://localhost:4880**.

That is the whole cold start. One process, no build, no install, no database.
It prints what it is serving and what it has stubbed; read those four lines
before you start clicking, because one of them is a stub and it matters.

**To start over** at any point: `http://localhost:4880/api/demo/reset`, or stop
the server and `rm -rf demo/state`. Everything the demo writes lives in
`demo/state/` and nowhere else — it is git-ignored, and deleting it is the whole
of "reset".

*If port 4880 is taken:* `PORT=4899 node demo/serve.mjs`.

---

## Walk through it

You are acting as **postmaster**. She lives in the Waiting Room, 450 m from her
own boat.

**1 · Act As → postmaster.**
Look at the **Actions** section, directly under Act As. It says: *within nothing
— walking does not put you inside anything.* She has lived in this town for
weeks and she is inside nothing, because until tonight there was no act that
could put her inside anything. That sentence is the demo.

*A note on that section:* the Actions rail landed on main while this was
building, so the branches were merged and **Enter and Exit are the rail's own
buttons** — minted by its derivation from what the door granted, not written
into the viewer. Exit starts dimmed, because she is within nothing; hovering it
says why. Under the buttons is the part a palette cannot say: which marks she is
inside, what Enter would cross next, and the word that door has already spoken.

The demo office grants the two verbs **as a stub** — there is no world store
here, so no class mark is being read. That is the last honest gap between this
and production, and it is the sitting's to close: plant the grant on a class
mark and the stub deletes itself with no viewer edit at all.

**2 · Find the Post Office.**
Either click the little boat at Ferry's crossing on the painting, or — easier —
click **The Post Office** in the *Lately* rail, on the line where the
illuminator set out for her.

Actions now offers **enter The Post Office**, with the word the boat has already
spoken (`WELCOMED`) and her terms underneath: *aboard when she sails.* The rail
also says the walk comes with it — she is 450 m away and entering from outside
bundles the navigation in, because you cannot cross a threshold you are not
standing at.

**3 · Press enter.**
Nothing is recorded. A **threshold sheet** opens instead: the boat's own words,
the edge she forms back at you (`aboard`), what that edge means, and the reading
law. This is the handshake's second half asking for your first: the door has
terms, so it wants your explicit word, and *declining is free.*

Press **stay outside** and look at Actions: she crossed into the Town Centre and
the Quay Reach on the way, and she is standing at the boat's gangway. A chain of
entries stops where it was asked a question. Press enter again to reopen the
sheet.

**4 · Press "cross — I accept".**

**This is the thing to look at.** The read stops being a point of view and
becomes a place:

- **You are in: The Post Office** · `[exit]` — the chrome, with the chain
  (Town Centre › Quay Reach › The Post Office) under it.
- **what this place says** — the boat's own read, and the terms you are here on.
- **who is here** — *postmaster (you)* and *illuminator*. He crossed her
  threshold two hours ago; he is a child of the boat now, in the same
  containment relation her cabins are, so he renders for free.
- **what is inside** — The Deck, The Gangway, The Mail Hold, The Wheelhouse.

That is the study-read becoming a place. Nothing in the render is new
machinery: it is the containment subtree the whole world already runs on, with
one new kind of child in it.

**5 · The refusal.**
Actions now offers **enter The Wheelhouse**, and the chip beside it already says
`OPPOSED` — the wheelhouse's standing entry law is *the postmaster's own, and
the door does not open to passengers*. Press it anyway.

> The Wheelhouse opposed your entry — you are left standing at its door,
> still within The Post Office.

She is still aboard. The view did not move. **A refusal leaves you at the
threshold, not back where you started** — because the walk half needs no
consent, so it can never be the refused half. And the refusal is *in the
record*: being turned away is a fact about the town.

**6 · Press exit** (on the chrome bar, or in Actions).
The scope restores to the Quay Reach, the derived edge is gone, and Actions
offers the boat again.

---

## Then poke at it

Two more things worth five minutes, if you have them:

- **Walk somewhere and watch the two axes come apart.** With her aboard, click
  open ground on the painting well off the boat and confirm the walk. She is
  now geometrically ashore and legally aboard — a real, representable state
  (the visitor on the deck, inverted) — and the walk desk offers *step out?*
  rather than deciding for her. Walking never enters and never leaves.
- **The record.** `http://localhost:4880/WORLD/enter-exit-ledger.md` is every
  enter and exit, in the walk ledger's own grammar, one line per door.
  `http://localhost:4880/api/world/occupancy` is what derives from it: each
  resident's chain, each mark's manifest, and the literal `contains` edges —
  every one of them with `childKind: "entity"`. **No edge is stored anywhere.**

---

## What is real here, and what is not

**Real** — the same code the town runs:

- the world record: this worktree's `WORLD/world-state.json`, folded by
  `tools/marks-fold.mjs` from the marks tree;
- the field of view, the telling, the containment spine — computed client-side
  by the engine the viewer imports unbundled, exactly as postmark.town does;
- the walk: `tools/walk.mjs`'s own grammar and derived position;
- **enter and exit**: `tools/enter-exit.mjs` and `tools/world-verbs.mjs` — the
  entry law read off the mark, the adjudication, the chain, the refusal, the
  occupancy derivation, the scoped read. All of it.

**Stubbed, and only these:**

- **The identity door.** GitHub OAuth cannot complete headless, so
  `/api/ops/whoami` hands out a demo household (postmaster · illuminator ·
  kilean). Nobody signs in. Same stub shape step 2's QA used; everything behind
  it is the viewer's real code path.
- The stamp balance and the household portfolio (flat fixtures), because the
  viewer's identity gate wants them before it will let anyone act.
- **The demo's walking pace.** Departures here are stamped `pace 10000`
  (km/crossing) instead of the town's 60, so the postmaster's 450 m walk lands
  while you are looking at it instead of six minutes later. It is stamped **on
  the leg**, in the record's own grammar, exactly as the vessel's 405 is — so
  every line says which law derived it and the town's own dial is untouched.
  `DEMO_PACE_KM=60 node demo/serve.mjs` runs it at resident speed if you want to
  watch a real walk.

**Two demo edits to the record**, both in this worktree only, both one line:

- `the-post-office/mark.md` gains
  `entry: {"word": "welcomed", "edge": "aboard", "consequence": "…"}`
- `the-wheelhouse/mark.md` gains `entry: {"word": "opposed", "consequence": "…"}`

Everything else in `WORLD/` is the town's own record, untouched.

---

## What this demo does NOT answer

Named here rather than left to be discovered:

- **Whether any of this is law.** It is not. LOGOS is untouched; the one law
  sentence the pair adds (*a mark child opposed stands with its effect null; an
  entity child opposed is refused at the threshold*) is written in
  `tools/enter-exit.mjs`'s header and in the step-5 notes, and nowhere else.
- **The real sailing.** The carry logic is untouched. Being aboard is still
  geometric snatch-up in production; `enter(ship)` being the ticket is the
  argument this demo exists to make, not a change it makes.
- **Position's source of truth.** The demo still falls back to home when a
  resident has never walked. Seeding `within` at admission is the wind-down's
  own separate thread and is not in here.
- **The economy.** Presence is not attention: fan-up totals do not move when a
  walker enters, and that is a falsifier in the fanup suite
  (`tools/fanup-flow.test.mjs`), with a positive control beside it so it cannot
  pass by measuring nothing.
