// room-on-the-resident-path.test.mjs — a resident who boots ENTERED gets a room,
// not a dead telling.
//
// 2026-09-11, on dev: rei is home inside rei/the-lanternstep-house. A cold boot
// as rei (the standpoint remembered, no Spectator first) never loads the fold,
// so `world` is null; the crossing record says entered, the room mounts, and
// composeInterior called `investigate(roomId, world, …)` — whose first line is
// `world.marks.map(…)`. The telling failed with "Cannot read properties of null
// (reading 'marks')" and the overlay drew nothing at all. Wright, who stands
// outside, never hit it; a page that had been a Spectator first still held the
// fold and never hit it either — which is why it hid for a day.
//
// The rule: the room is asked of the marks the page holds — the fold when there
// is one, else the read's own index.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worldForRoom } from "../spectator/viewer.mjs";
import { investigate } from "./world-verbs.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

const ROOM = { id: "rei/the-lanternstep-house", kind: "sited", tier: "home", by: "rei", at: { x: 1088, y: -794 }, extent: { w: 20, h: 20 }, body: "home" };
const CHAIR = { id: "rei/the-reading-chair", kind: "sited", tier: "home", by: "rei", parent: ROOM.id, at: { x: 1090, y: -796 }, extent: { w: 1, h: 1 }, body: "a chair" };
const FAR = { id: "wright/the-trueing-terrace", kind: "sited", tier: "home", by: "wright", at: { x: 967, y: -2450 }, extent: { w: 900, h: 900 }, body: "far away" };
const READ_INDEX = new Map([ROOM, CHAIR, FAR].map((m) => [m.id, m]));

test("with no fold in hand, the room is asked of the read's own index — and the engine answers", () => {
  const w = worldForRoom(null, [...READ_INDEX.values()]);
  assert.deepEqual(w.marks.map((m) => m.id), [ROOM.id, CHAIR.id, FAR.id]);
  const found = investigate(ROOM.id, w, { occupancy: new Map() });
  assert.ok(!found?.error, `investigate ran on the read's index: ${JSON.stringify(found?.error ?? null)}`);
  const ids = (found.children ?? []).map((c) => c.id);
  assert.ok(ids.includes(CHAIR.id), `the chair is in the room: ${ids}`);
  assert.ok(!ids.includes(FAR.id), "the terrace is not");
  // ⚑ THE FLIP: make worldForRoom return `world` unconditionally → investigate(ROOM.id, null) throws
  //   "Cannot read properties of null (reading 'marks')" — the dev symptom, verbatim.
  assert.throws(() => investigate(ROOM.id, null, { occupancy: new Map() }), /reading 'marks'/, "the symptom this file exists for");
});

test("with the fold in hand, the fold is what is asked — untouched, terrain and all", () => {
  const fold = { marks: [ROOM, CHAIR], terrain: { features: [] }, light: {} };
  assert.equal(worldForRoom(fold, []), fold, "the same object, not a copy");
  assert.equal(worldForRoom(fold, [FAR]), fold, "and the index is ignored while the fold is there");
  const w = worldForRoom(null, READ_INDEX);
  assert.equal(w.marks.length, 3, "a Map index is accepted as well as a list");
  assert.equal(w.terrain, null, "no fold, no terrain — investigate reads it optionally");
});

test("composeInterior asks investigate through worldForRoom, never with the bare closure world", () => {
  assert.match(SOURCE, /investigate\(roomId, worldForRoom\(world, allMarks\(\)\), \{ occupancy: liveOccupancy\(\)/, "the room mount");
  assert.doesNotMatch(SOURCE, /investigate\(roomId, world,/, "no call hands the engine a world that may be null");
});
