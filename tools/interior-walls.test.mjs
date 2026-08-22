// interior-walls.test.mjs — a wall is a wall.
//
// Founder, 2026-08-21: "I think we still allow jank behavior with walking
// beyond the borders of the mark you're inside."
//
// While entered, the ground you can walk is the room's ground. A destination
// past it is not a longer walk, it is LEAVING — and leaving is the exit act, a
// crossing the record keeps. Walking through it puts the walker outside the
// walls while the occupancy stack still says inside: two records disagreeing
// about one body, and the walk ledger is the one telling the lie, because a
// crossing never moves anybody (R15) and a walk never un-enters anything.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { interiorWalkVerdict, standpointOccupancy } from "../spectator/viewer.mjs";
import { parseThresholdLedger } from "./thresholds.mjs";
import { loadMarks } from "./marks-fold.mjs";
import { fractionalCrossing } from "./walk.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");
const ROOM = { id: "wright/the-trueing-house", kind: "sited", by: "wright", at: { x: 0, y: 0 }, extent: { w: 12, h: 12 } };

test("ENTERED + A DESTINATION BEYOND THE EXTENT IS REFUSED, and the refusal names the way out", () => {
  const v = interiorWalkVerdict({ point: { x: 40, y: 0 }, room: ROOM, roomName: "the Trueing House" });
  assert.equal(v.ok, false);
  assert.match(v.why, /outside the Trueing House/, "it names the room the reader is actually in");
  assert.match(v.why, /step outside first/, "and offers the act they want instead of just saying no");
});

test("ENTERED + A DESTINATION WITHIN THE EXTENT IS NORMAL — the room is walkable ground", () => {
  for (const point of [{ x: 0, y: 0 }, { x: 2, y: -3 }, { x: 5.9, y: 5.9 }])
    assert.deepEqual(interiorWalkVerdict({ point, room: ROOM }), { ok: true, why: null }, JSON.stringify(point));
  // the boundary itself is inside: a wall you are standing on is not a wall you
  // walked through, and refusing the edge would make the room smaller than the
  // record says it is
  assert.equal(interiorWalkVerdict({ point: { x: 6, y: 6 }, room: ROOM }).ok, true);
});

test("OUTDOORS EVERY GROUND IS WALKABLE — the guard is about being inside, not about distance", () => {
  assert.deepEqual(interiorWalkVerdict({ point: { x: 99999, y: -99999 }, room: null }), { ok: true, why: null });
  assert.deepEqual(interiorWalkVerdict({}), { ok: true, why: null }, "no room and no point is not a refusal");
  // a "room" with no extent is nothing to be inside of, so it fences nothing
  assert.equal(interiorWalkVerdict({ point: { x: 5, y: 5 }, room: { id: "a/b", kind: "predicated" } }).ok, true);
  assert.equal(interiorWalkVerdict({ point: { x: 5, y: 5 }, room: { id: "a/b", kind: "sited", at: { x: 0, y: 0 } } }).ok, true);
});

test("a ringed room is fenced by its RING, not by its bounding box", () => {
  // an L-shaped room: the bbox corner is outside the actual floor
  const ring = { id: "a/l-room", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 20, h: 20 },
    points: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 10 }] };
  assert.equal(interiorWalkVerdict({ point: { x: -5, y: -5 }, room: ring }).ok, true, "inside the L");
  assert.equal(interiorWalkVerdict({ point: { x: 8, y: 8 }, room: ring }).ok, false,
    "the notch is outside the floor even though it is inside the bounding box");
});

test("THE DESK ASKS BEFORE IT ARMS — the guard is wired at the click, not at confirm", () => {
  // Asked at confirm, the reader would arm a destination, see it drawn on the
  // painting, and only then be told they cannot go — and the walk desk would
  // have shown a leg it was never going to walk.
  assert.match(SOURCE, /const walls = interiorWalkVerdict\(\{ point: \{ x, y \}, room, roomName/,
    "chooseWalkPoint asks the walls");
  assert.match(SOURCE, /if \(!walls\.ok\) \{[\s\S]{0,240}showWalkRefusal\(walls\.why\)/,
    "and a refusal is SAID, through the same channel every other refused click uses");
  assert.match(SOURCE, /if \(!walls\.ok\) \{\s*\n\s*walkState\.destination = null;/,
    "with nothing left armed behind it");
});

test("THE LIVE RECORD: someone really is inside a room small enough for this to bite", () => {
  // A guard proven only on fixtures could be fencing a shape the town does not
  // have. rei is inside sable's house on the ledger right now, and that house is
  // a few metres across while the painting is kilometres — so almost every
  // click on the map, from inside, is a click through a wall.
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const byId = new Map(marks.map((m) => [m.id, m]));
  const { acts } = parseThresholdLedger(readFileSync(join(ROOT, "WORLD/threshold-ledger.md"), "utf8"));
  const inside = standpointOccupancy({ acts, at: fractionalCrossing(), handle: "rei" }).insideOf;
  assert.ok(inside, "rei is not inside anything — if that is now true, this test is the thing to re-read");
  const room = byId.get(inside);
  assert.ok(room?.extent?.w > 0, `${inside} has no extent to be inside of`);
  assert.ok(room.extent.w < 100, `${inside} is ${room.extent.w} m across — the case this guards is a small room`);
  // a point a kilometre off is outside it, and the desk now says so
  assert.equal(interiorWalkVerdict({ point: { x: room.at.x + 1000, y: room.at.y }, room }).ok, false);
  assert.equal(interiorWalkVerdict({ point: { x: room.at.x, y: room.at.y }, room }).ok, true);
});
