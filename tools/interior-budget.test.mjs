// interior-budget.test.mjs — A ROOM IS NOT A TELLING, AND MUST NOT BE CUT LIKE ONE.
//
// `DIALS.context_budget` (12) is the TELLING's budget: how many marks one look
// across a landscape may carry. It exists because a horizon has no natural end,
// and a reader given the whole world is given nothing.
//
// A room has a natural end — its walls. Everything standing in it is what is in
// it, and there is no editorial judgement to make. But composeInterior read the
// telling's dial, so an interior silently dropped its thirteenth thing. The
// Lanternstep parcel stands at EXACTLY 12/12: the next mark laid in that house
// would have vanished from the floor with no cut anywhere for a reader to see,
// which is the worst shape a budget can take — furniture that is in the room,
// in the record, and not on the floor.
//
// The number was already written down and already unused: interiorFurniture has
// carried `limit = 40` since it was built, dead code because its caller was
// starved upstream. INTERIOR_BUDGET is that number, named once, read by both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { INTERIOR_BUDGET, interiorFurniture } from "../spectator/viewer.mjs";
import { investigate } from "./world-verbs.mjs";
import { DIALS } from "./world-engine.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

// A ROOM WITH THIRTEEN THINGS IN IT — one past the telling's dial, which is the
// smallest world that can tell the two budgets apart.
const ROOM = { id: "t/room", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 }, body: "a room" };
const THINGS = Array.from({ length: 13 }, (_, i) => ({
  id: `t/thing-${String(i).padStart(2, "0")}`, kind: "sited",
  at: { x: -40 + i * 6, y: 0 }, extent: { w: 1, h: 1 }, body: `thing ${i}`,
}));
const world = { marks: [ROOM, ...THINGS] };

test("THE FALSIFIER: a room with thirteen things in it lists all thirteen on the interior path", () => {
  assert.equal(DIALS.context_budget, 12, "the telling's dial is the number this room is one past");
  const found = investigate(ROOM.id, world, { budget: INTERIOR_BUDGET });
  const { things } = interiorFurniture({ room: ROOM, children: found.children });
  assert.equal(things.length, 13,
    `the room holds 13 and the floor drew ${things.length} — the missing one is in the record and not in the room`);
});

test("and the telling's own dial really would have dropped one, so the fix is the budget and not the room", () => {
  // the red, kept as a test: this is exactly what composeInterior used to pass
  const starved = investigate(ROOM.id, world, { budget: DIALS.context_budget });
  assert.equal(starved.children.length, 12, "the telling's budget cuts the thirteenth, silently");
});

test("ONE NUMBER, TWO READERS: interiorFurniture's limit is INTERIOR_BUDGET, not a second opinion", () => {
  // The limit was 40 and the investigate call was 12, so the smaller number won
  // and the larger one was dead code that read like a promise. If these ever
  // part again the floor and the engine are back to disagreeing about how much
  // of a room a room has.
  const { things } = interiorFurniture({ room: ROOM, children: THINGS });
  assert.equal(things.length, 13, "the floor's own limit does not cut a 13-thing room");
  assert.ok(INTERIOR_BUDGET > DIALS.context_budget,
    "an interior budget at or below the telling's dial would leave the starvation in place");
});

test("THE WIRING: composeInterior asks the engine for the interior budget, not the telling's", () => {
  // The pure halves above cannot see which number the caller actually passes,
  // and that caller is the whole defect. Asserted on the wiring, in the style
  // this repo already uses for handler dispatch (terms-door.test.mjs).
  assert.match(SOURCE, /investigate\(roomId, world, \{ occupancy: liveOccupancy\(\), budget: INTERIOR_BUDGET \}\)/,
    "composeInterior's investigate call must carry INTERIOR_BUDGET");
  assert.doesNotMatch(SOURCE, /investigate\(roomId, world, \{ occupancy: liveOccupancy\(\), budget: state\.dials\.context_budget \}\)/,
    "the telling's dial is gone from the interior path");
});
