// containment-index-once.test.mjs — THE INDEX IS BUILT ONCE PER CONTAINMENT
// QUESTION, NOT ONCE PER MARK (postmark#2910, 2026-09-17).
//
// ── THE INSTANCE, AND THE CAUSE IT DID NOT HAVE ────────────────────────────
//
// #2910: "performance shot down to unusable when zooming in from far to mid
// distance. like ~1 sec tick updates." The issue measured the stall (2.7 s
// crossing into the district tier, 1–2.7 s a wheel tick inside it) and named
// the bitmaps: 26 original uploads, 28 megapixels, re-rasterised through clip
// paths every frame. Reproduced on prod's viewer (world 35f56a92, byte-identical
// to postmark.town/world-engine/spectator/viewer.mjs on 09-17) in a 1600×900
// pane: 3.0–3.8 s at the crossing, 0.85–3.5 s a tick. Then every face and card
// bitmap was answered with ONE 96 px raster, no code change — and the numbers
// did not move. A CPU profile of one tick put 3,856 of its 4,065 ms in the
// filter closure of `smallestContainingMark`.
//
// The chain: drawWalkers → walkerPlace(w) for every drawn body → bodyPlace →
// smallestContainingMark(position, allMarks()) → for EACH of 1,232 marks,
// isAmbientMark(mark, marks) → markIndex(marks), a fresh 1,232-entry Map,
// because it only skips the build when handed a Map. 460 predicated/naming
// marks × a 1,232-entry Map, per body, per zoom frame: 42 bodies ≈ 24 million
// Map insertions a tick. The hover's containment (paintingMarkAtPoint) asks the
// same function on every mousemove.
//
// The fix is the one `nearestEmbodiedAncestor` already made: build the index
// once and hand it down. Measured with it: 83–167 ms at the crossing (167 cold,
// the first decode of 16 MB), 17–97 ms a tick, no long task at idle; the 96 px
// swap on top of it changes nothing (69–95 ms), so the bitmaps cost ~75 ms once
// and nothing per frame. The thumbnails the issue proposed are not built.
//
// ── WHAT THIS FILE PROVES, AND HOW IT CAN FAIL ─────────────────────────────
//
// `markIndex` is not exported, so the count is taken where it is visible: the
// only way a plain array becomes a Map in that helper is `marks.filter(...)`,
// and a Proxy over the fixture counts every read of `filter`. One containment
// question over a record of N predicated marks must read it a CONSTANT number
// of times, not N. Flip: `isAmbientMark(mark, byMarkId)` → `isAmbientMark(mark,
// marks)` in smallestContainingMark, and the count climbs with the fixture.
//
// The answers are pinned in the same file so a hoist that changed WHAT the
// function returns could not pass as a hoist: the ambient chain still excludes,
// the thing still loses, the enclosing room still stands aside, smallest wins.
import { test } from "node:test";
import assert from "node:assert/strict";

import { smallestContainingMark, WORLD_ROOT_ID } from "../spectator/viewer.mjs";

// a record shaped like the town's: a root, a parcel, a house on it, a bench,
// a carried thing at the point, and a long tail of predicated marks — some
// hung off the house (embodied, so NOT ambient), some off the root (ambient)
function fixture(predicated) {
  const marks = [
    { id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } },
    { id: "town/the-parcel", kind: "parcel", at: { x: 100, y: 100 }, extent: { w: 40, h: 40 } },
    { id: "town/the-house", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 12, h: 12 } },
    { id: "town/the-bench", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 2, h: 2 } },
    { id: "town/the-top", kind: "sited", class: "thing", at: { x: 100, y: 100 }, extent: { w: 1, h: 1 } },
  ];
  for (let i = 0; i < predicated; i++) {
    marks.push({
      id: `town/p-${i}`, kind: "predicated",
      parent: i % 2 ? "town/the-house" : WORLD_ROOT_ID,
      at: { x: 100, y: 100 }, extent: { w: 1 + (i % 7), h: 1 + (i % 5) },
    });
  }
  return marks;
}
const countingFilter = (marks) => {
  let reads = 0;
  const proxy = new Proxy(marks, { get(t, k, r) { if (k === "filter") reads += 1; return Reflect.get(t, k, r); } });
  return { proxy, reads: () => reads };
};

test("the answer: smallest non-thing, non-ambient ground containing the point", () => {
  const marks = fixture(40);
  // the bench (2×2) is the smallest ground; the top is a thing; the root is
  // ambient; a predicated mark has no body and never contains a point at all —
  // which is why paying an index per predicated mark was pure waste
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, marks), "town/the-bench");
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, marks.filter((m) => m.id !== "town/the-bench")), "town/the-house");
  // inside the house's interior, the house and what encloses it stand aside
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, marks, { insideRoomId: "town/the-house" }), "town/the-bench");
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { insideRoomId: "town/the-house" }), null,
    "off the bench, inside the house: nothing answers — the room's own floor is not a card");
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks), "town/the-house", "…and outdoors the same point is the house");
  assert.equal(smallestContainingMark({ x: 5000, y: 5000 }, marks), null, "open ground off every parcel is the root, which is ambient");
});

test("FALSIFIER: one containment question reads the record a constant number of times, whatever its size", () => {
  const small = countingFilter(fixture(20));
  const large = countingFilter(fixture(600));
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, small.proxy), "town/the-bench");
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, large.proxy), "town/the-bench");
  // two reads: the index, once, and the containment filter itself. Before the
  // hoist the large fixture read it 2 + 600 times — once per predicated mark.
  assert.equal(small.reads(), 2, "the small record was read " + small.reads() + " times");
  assert.equal(large.reads(), small.reads(),
    "the large record was read " + large.reads() + " times against " + small.reads() + " for the small one: the index is being rebuilt per mark");
});
