// room-hover.test.mjs — the entered room stops answering every pixel of its own
// floor (Linear POS-91 box 1; the port of 8d0eb580 half b, lost in the birthday
// dungeon rollback).
//
// THE INSTANCE, twice. 2026-08-29, the founder in the candle vault: "right now
// EVERYWHERE you put your mouse, the candle vault's mark-card noisily fills the
// center of the screen." 2026-09-15, the founder again: "the mark you have
// ENTERED still showing in the center wherever you hover (which is bad)."
//
// The mechanism: `paintingMarkAtPoint` snaps to a pip first and otherwise asks
// `smallestContainingMark` — and a mounted room's extent is the whole floor of
// its interior, so containment answered with the room at every pixel. The rule:
// with `insideRoomId` set, the room and everything ENCLOSING it never answer
// containment; things inside still do; pips are untouched. Dropping only the
// room is not enough (the ladder falls through to the region around it), which
// is why the enclosers go too.
//
// THE CAN-FAIL FLIP: in smallestContainingMark, make `encloses` return false →
// the first test reds (the room answers again). Run receipt in the hotfix PR.
//
//   node --test tools/room-hover.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { paintingMarkAtPoint, smallestContainingMark } from "../spectator/viewer.mjs";

// a district around a parcel around a house, with a bench inside the house
const district = { id: "limen/the-threshold-district", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 1000, h: 1000 } };
const parcel = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 } };
const house = { id: "rei/the-lanternstep-house", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 12, h: 12 } };
const bench = { id: "rei/the-reading-nook", kind: "sited", at: { x: 3, y: 3 }, extent: { w: 2, h: 2 } };
const lantern = { id: "rei/the-pocket-lantern-for-hal", kind: "sited", class: "thing", at: { x: -3, y: -3 }, extent: { w: 0.2, h: 0.2 } };
const marks = [district, parcel, house, bench, lantern];

test("inside the house, a hover on bare floor answers NOTHING — not the house, not the parcel, not the district", () => {
  const bareFloor = { x: -4, y: 4 };   // inside the house, on no thing
  assert.equal(smallestContainingMark(bareFloor, marks), house.id, "without the option the room answers (the bug, stated)");
  assert.equal(smallestContainingMark(bareFloor, marks, { insideRoomId: house.id }), null,
    "with the room mounted, its floor is not a mark you are pointing at");
});

test("inside the house, a hover on the reading nook still answers the nook", () => {
  assert.equal(smallestContainingMark({ x: 3, y: 3 }, marks, { insideRoomId: house.id }), bench.id);
});

test("a thing is still not ground, mounted room or not", () => {
  assert.equal(smallestContainingMark({ x: -3, y: -3 }, marks, { insideRoomId: house.id }), null,
    "the lantern rides at its holder's feet and never answers where you are");
});

test("inside the PARCEL (not the house), the house inside it still answers, and the parcel and district do not", () => {
  assert.equal(smallestContainingMark({ x: 0, y: 0 }, marks, { insideRoomId: parcel.id }), house.id);
  assert.equal(smallestContainingMark({ x: 11, y: 11 }, marks, { insideRoomId: parcel.id }), null, "bare parcel ground");
});

test("paintingMarkAtPoint threads the room through: a pip still wins, the floor answers nothing", () => {
  const glyphs = [{ id: bench.id, x: 500, y: 500 }];
  assert.equal(paintingMarkAtPoint({ screenPoint: { x: 503, y: 503 }, worldPoint: { x: -4, y: 4 }, glyphs, marks, insideRoomId: house.id }), bench.id,
    "the pip within the snap radius is an aimed act");
  assert.equal(paintingMarkAtPoint({ screenPoint: { x: 100, y: 100 }, worldPoint: { x: -4, y: 4 }, glyphs, marks, insideRoomId: house.id }), null,
    "off the pip, the floor is silent");
  assert.equal(paintingMarkAtPoint({ screenPoint: { x: 100, y: 100 }, worldPoint: { x: -4, y: 4 }, glyphs, marks }), house.id,
    "outdoors (no room mounted) containment answers as it always did");
});
