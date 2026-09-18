// walk-layer-once.test.mjs — THE WALK LAYER IS WRITTEN ONCE PER DATA CHANGE
// (postmark#2912, Linear POS-113, 2026-09-18).
//
// ── THE INSTANCE ────────────────────────────────────────────────────────────
//
// Keemin, 2026-09-17, prod: the World page's zoom is slow "in Spectator mode in
// general"; a resident act-as is fine. #2910's hoist (world #101) took the
// crossing from 3.9 s to ~0.1 s at 1×, and the POS-109 lane then measured what
// a Vivobook-class machine still pays at a 6× CPU throttle on that page: a
// 1.2–1.9 s freeze at the district crossing and 0.3–0.75 s per wheel tick,
// with the bitmaps swapped for 3 MB changing nothing. The profile put it in
// `drawWalkers`, run THREE times per crossing (the frame pass, the overlay's
// settle rebuild, the 15 s poll), and inside it one containment index per BODY
// per draw, the ledger folded per body, the whole layer torn down and rebuilt
// as new DOM on every wheel tick.
//
// ── WHAT THIS FILE PROVES, one section per commit ───────────────────────────
//
//   (1) the containment index is built ONCE PER DRAW and handed down through
//       walkerPlace → bodyPlace → smallestContainingMark / placeLabel: placing
//       N bodies with one index reads the record a constant number of times,
//       and answers exactly what the per-body build answered.
//
// `markIndex` is not exported, so the count is taken where it is visible: a
// plain array becomes an index only through `marks.filter(...)`, and a Proxy
// over the fixture counts every read of `filter` (the instrument
// containment-index-once.test.mjs already keeps).
//
// Flips: (1) in smallestContainingMark, `const own = ... ? index : ...` →
// `const own = containmentIndex(marks, { insideRoomId })` — the handed index
// is ignored and the reads climb with the bodies.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bodyPlace, placeLabel, containmentIndex, smallestContainingMark, WORLD_ROOT_ID,
} from "../spectator/viewer.mjs";

// a record shaped like the town's: a root, a parcel, a house on it, a room in
// the house, a bench, a carried thing at the point, and a tail of predicated
// marks — some hung off the house (embodied, so NOT ambient), some off the root
function fixture(predicated = 40) {
  const marks = [
    { id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } },
    { id: "town/the-parcel", kind: "parcel", at: { x: 100, y: 100 }, extent: { w: 40, h: 40 } },
    { id: "town/the-house", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 12, h: 12 } },
    { id: "town/the-parlor", kind: "sited", class: "portal-ground", at: { x: 100, y: 97 }, extent: { w: 10, h: 4 } },
    { id: "town/the-bench", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 2, h: 2 } },
    { id: "town/the-top", kind: "sited", class: "thing", at: { x: 100, y: 100 }, extent: { w: 1, h: 1 } },
    { id: "town/the-far-parcel", kind: "parcel", at: { x: 900, y: 900 }, extent: { w: 30, h: 30 } },
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
const acts = [{ handle: "rei", act: "enters", mark: "town/the-parcel", at: 190.9, word: "neutral" }];
const at = 190.95;
const bodies = [
  { handle: "a", x: 100, y: 100 },                                            // on the bench
  { handle: "b", x: 100, y: 97, mark_id: "town/the-house" },                  // in the parlor, arrived at the house
  { handle: "rei", x: 104, y: 104 },                                          // in the house by coordinates, entered the parcel
  { handle: "c", x: 118, y: 118, mark_id: "town/the-house" },                 // on the parcel, at the door of the house
  { handle: "d", x: 5000, y: 5000 },                                          // open ground
  { handle: "e", x: 900, y: 900, moving: true, remaining_m: 12, eta_crossings: 0.1 },
];

test("(1) one index per draw: placing six bodies with one index reads the record as often as placing none", () => {
  const { proxy, reads } = countingFilter(fixture(600));
  const index = containmentIndex(proxy);
  const perIndex = reads();
  assert.ok(perIndex >= 1 && perIndex <= 3, "the index itself reads the record a handful of times: " + perIndex);
  for (const w of bodies) placeLabel(bodyPlace(w, { marks: proxy, acts, at, index }), proxy, {}, { index });
  assert.equal(reads(), perIndex, "six bodies placed through one index must not read the record again — it was read " + (reads() - perIndex) + " more times");
  // and the old way, for contrast: the same six bodies with no index in hand
  const bare = countingFilter(fixture(600));
  for (const w of bodies) placeLabel(bodyPlace(w, { marks: bare.proxy, acts, at }), bare.proxy, {});
  assert.ok(bare.reads() >= perIndex * bodies.length, "without an index every body pays its own: " + bare.reads());
});

test("(1) the answers are the per-body build's, body for body", () => {
  const marks = fixture(40);
  const index = containmentIndex(marks);
  const expected = [
    ["a", "town/the-bench", null, false, "on The Bench's ground"],
    ["b", "town/the-parlor", null, true, "on The Parlor's ground"],
    ["rei", "town/the-house", "town/the-parcel", false, "in The Parcel"],
    ["c", "town/the-parcel", null, false, "on The Parcel's ground, at the door of The House"],
    ["d", null, null, false, "on open ground"],
    ["e", "town/the-far-parcel", null, false, "12 m to go, ETA ≈ 1 h 12 m"],
  ];
  for (const [i, w] of bodies.entries()) {
    const withIndex = bodyPlace(w, { marks, acts, at, index });
    const without = bodyPlace(w, { marks, acts, at });
    assert.deepEqual(withIndex, without, `${w.handle}: the index changed the place`);
    assert.equal(placeLabel(withIndex, marks, {}, { index }), placeLabel(without, marks, {}), `${w.handle}: the index changed the sentence`);
    const [handle, inside, entered, arrived, label] = expected[i];
    assert.equal(w.handle, handle);
    assert.equal(withIndex.inside, inside, `${handle}: inside`);
    assert.equal(withIndex.entered, entered, `${handle}: entered`);
    assert.equal(withIndex.arrived, arrived, `${handle}: arrived`);
    assert.equal(placeLabel(withIndex, marks, {}, { index }), label, `${handle}: the sentence`);
  }
});

test("(1) an index built for another room is not used — the answer is still the room's own", () => {
  const marks = fixture(40);
  const outdoors = containmentIndex(marks);
  // asked inside the house with an OUTDOOR index in hand: the room and what
  // encloses it must still stand aside, so the index is rebuilt, not trusted
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { insideRoomId: "town/the-house", index: outdoors }), null,
    "inside the house, off the bench and the parlor: nothing answers — the outdoor index must not leak the house back in");
  const indoors = containmentIndex(marks, { insideRoomId: "town/the-house" });
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { insideRoomId: "town/the-house", index: indoors }), null);
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, marks, { insideRoomId: "town/the-house", index: indoors }), "town/the-bench");
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { index: outdoors }), "town/the-house", "…and outdoors the same point is the house");
});
