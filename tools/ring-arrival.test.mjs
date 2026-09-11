#!/usr/bin/env node
// ring-arrival.test.mjs — RING WINS EVERYWHERE, at the walk desk.
//   node --test tools/ring-arrival.test.mjs
//
// Founder-ruled 2026-09-11: "a mark's shape is its `points:` ring when it has
// one and its at/extent box otherwise, and every tool that asks WHERE something
// is or whether a point is INSIDE something asks that one shape."
//
// THE LAW THIS FALSIFIES, VERBATIM, is `walk.mjs`'s own sentence about what the
// default arrival means: "the walk ends at the first point on the target's
// GROUND, not at its centre." A ring inset from its bounding box makes "its
// ground" and "its box" two different places, and the box's edge is somebody
// else's ground — which is not a hypothetical:
//
//   wright walked to wright/the-trueing-terrace (a 12-point ring inset from its
//   1834 x 1563 box). The rim arrival stopped him at (1022.3, -1669), the box's
//   near edge. By the ring that point is OUTSIDE the terrace and INSIDE
//   rei/the-lanternseed-gardens — his neighbour's field. The walk desk called it
//   arrival and the map drew him there.
//
// The fixture is HIS CASE, with the two rings copied from the record as it stood
// at world 0dce31ce, so this test keeps failing for the right reason after the
// record moves on.

import test from "node:test";
import assert from "node:assert/strict";
import { walkTargetFor, positionAt, formatDeparture, parseWalkLedger, RING_ARRIVAL_INSET_M } from "./walk.mjs";
import { pointWithinMark, containmentChain } from "./world-verbs.mjs";
import { polygonOf, ringMatchesClaim } from "./geometry.mjs";

// ── the fixture: wright's case, from WORLD/world-state.json @ 0dce31ce ───────
const TERRACE = {
  id: "wright/the-trueing-terrace", kind: "sited", tier: "market", by: "wright",
  at: { x: 967, y: -2450.5 }, extent: { w: 1834, h: 1563 },
  points: [[1884, -2400], [1568, -1876], [1109, -1809], [681, -1669], [291, -1817], [50, -2214],
           [55, -2607], [247, -2951], [668, -3226], [1211, -3232], [1643, -3025], [1884, -2625]],
};
const GARDENS = {
  id: "rei/the-lanternseed-gardens", kind: "sited", tier: "market", by: "rei",
  at: { x: 1338, y: -994.5 }, extent: { w: 1854, h: 1637 },
  points: [[2265, -1001], [2025, -439], [1554, -176], [1084, -199], [691, -465], [432, -821],
           [411, -1197], [619, -1558], [1100, -1805], [1555, -1813], [2019, -1562], [2238, -1193]],
};
const FRAME = {
  id: "the-town/let-there-be-light", kind: "sited", tier: "constitution", by: "the-town",
  at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
};
const MARKS = [FRAME, GARDENS, TERRACE];
const FROM = { x: -34.5, y: 35.5 };          // where wright stood when he declared the walk
const BOX_ARRIVAL = { x: 1022.3, y: -1669 }; // where the box's edge put him

test("the fixture is the record's own shape — the rings are honest about their boxes", () => {
  // If this fails the fixture has drifted from the schema the lint enforces, and
  // every assertion below is about a mark the town would refuse.
  for (const m of [TERRACE, GARDENS]) {
    assert.equal(polygonOf(m).length, 12, `${m.id} carries its 12-point ring`);
    assert.ok(ringMatchesClaim(m), `${m.id}'s ring bbox IS its declared at/extent`);
  }
});

test("THE BUG, MEASURED: the box's edge is the neighbour's ground", () => {
  // The arrival a box-shaped rim walk produced, judged by the ONE shape.
  assert.equal(pointWithinMark(BOX_ARRIVAL, TERRACE), false,
    "by its ring, the box's near edge is not on the terrace at all");
  assert.equal(pointWithinMark(BOX_ARRIVAL, GARDENS), true,
    "it is inside the lanternseed gardens — which is why the walk desk said 'From The Lanternseed Gardens'");
  assert.deepEqual(containmentChain(BOX_ARRIVAL, MARKS).map((m) => m.id),
    ["the-town/let-there-be-light", "rei/the-lanternseed-gardens"],
    "the spine names the gardens, not the terrace");
});

test("RING WINS: a rim walk to a ringed mark ends INSIDE the ring", () => {
  const target = walkTargetFor(TERRACE, FROM, "rim");
  assert.ok(target, "a ringed mark gets a ring answer");
  assert.equal(target.targetExtent, null,
    "the arrival is a frozen point, so no box rides the line to be re-judged");

  // THE WHOLE POINT, and the assertion the founder's sentence reduces to.
  assert.equal(pointWithinMark(target.toward, TERRACE), true,
    "the walk ends on the terrace's own ground");
  assert.equal(pointWithinMark(target.toward, GARDENS), false,
    "and not on his neighbour's");
  assert.deepEqual(containmentChain(target.toward, MARKS).map((m) => m.id),
    ["the-town/let-there-be-light", "wright/the-trueing-terrace"],
    "the spine names the terrace");

  // RIM STILL MEANS RIM. The arrival is on the near edge of the ring, not in its
  // middle — walking to a 1.8 km region still has no business teleporting you.
  const toAnchor = Math.hypot(TERRACE.at.x - target.toward.x, TERRACE.at.y - target.toward.y);
  assert.ok(toAnchor > 300, `a rim arrival stays off the anchor (${Math.round(toAnchor)} m from it)`);
  // ...and it is genuinely on the boundary, within the inset the dial declares.
  const stepBack = { x: target.toward.x - (target.toward.x - FROM.x) * (2 * RING_ARRIVAL_INSET_M / toAnchor),
                     y: target.toward.y - (target.toward.y - FROM.y) * (2 * RING_ARRIVAL_INSET_M / toAnchor) };
  assert.equal(pointWithinMark(stepBack, TERRACE), false,
    "a couple of metres back down the road is outside — this is the ring's edge, not its interior");
});

test("the derived position of that departure is the arrival — one arrival truth", () => {
  const target = walkTargetFor(TERRACE, FROM, "rim");
  const line = formatDeparture({
    handle: "wright", from: FROM, toward: target.toward, at: 100,
    targetExtent: target.targetExtent, targetMarkId: TERRACE.id, pace: 60,
    iso: "2026-09-11T12:00:00.000Z",
  });
  const { departures, unrecognized } = parseWalkLedger(line);
  assert.equal(unrecognized.length, 0, "the line is the grammar that already exists — no new token");
  assert.equal(/ · within /.test(line), false, "a ringed target records no frozen box");

  const dep = departures[0];
  const done = positionAt(dep, 999);            // long arrived
  assert.equal(done.arrived, true);
  assert.deepEqual({ x: done.x, y: done.y }, target.toward,
    "positionAt lands exactly where the ring said, so the map and the door read one point");
  assert.equal(pointWithinMark(done, TERRACE), true, "and that point is on the terrace");

  // Mid-leg is still the road: the endpoint moved, the straight line did not.
  const half = positionAt(dep, 100 + (done.legM / 2) / 60000);
  assert.equal(half.arrived, false);
  assert.ok(Math.abs(half.x - (FROM.x + (target.toward.x - FROM.x) / 2)) < 1,
    "halfway along the leg is halfway along the same road");
});

test("center still means center, and a mark with no ring is untouched", () => {
  const mid = walkTargetFor(TERRACE, FROM, "center");
  assert.deepEqual(mid.toward, { x: TERRACE.at.x, y: TERRACE.at.y },
    "the anchor, because the road reaches it — it is inside the terrace's own ring");
  assert.equal(pointWithinMark(mid.toward, TERRACE), true);

  const boxOnly = { id: "x/y", kind: "sited", at: { x: 10, y: 10 }, extent: { w: 20, h: 20 } };
  assert.equal(walkTargetFor(boxOnly, FROM, "rim"), null,
    "no ring, no answer — the caller keeps the box path it has always used");
});

test("standing inside the ring already is 'stand here', as a box walk always derived", () => {
  const inside = { x: TERRACE.at.x, y: TERRACE.at.y + 200 };
  assert.equal(pointWithinMark(inside, TERRACE), true);
  const target = walkTargetFor(TERRACE, inside, "rim");
  assert.deepEqual(target.toward, inside);
  const p = positionAt({ from: inside, toward: target.toward, at: 100, targetExtent: null, targetMarkId: TERRACE.id }, 100);
  assert.equal(p.standing, true);
  assert.equal(p.legM, 0);
});
