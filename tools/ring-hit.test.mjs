// ring-hit.test.mjs — a hung picture's click follows its ring, not its box
// (Linear POS-86, 2026-09-15).
//
// THE INSTANCE (Keemin, 09-15): "the threshold district is selectable from
// beyond its ring (suspect the bbox is a rect)." It was. The far tier hangs a
// district's picture clipped to the record's twenty-point ring, and the click
// element IS that ring — but the hit candidate carried only the element's
// getBoundingClientRect(), and the chooser tested that box as a rectangle. The
// Threshold District's box is 1652 × 2418 m; its ring covers well under half of
// it, so every click in the box's corners opened the district.
//
// The rule: a candidate may carry `contains(x, y)`, the shape's own containment
// in screen space (on the live page: the pointer mapped into the polygon's user
// space and asked of isPointInFill). When it does, the chooser asks it and never
// the box; when it does not, the box is what it always was. The box stays for
// ranking, because two overlapping cards still order by which centre the
// reader was nearer.
//
// THE CAN-FAIL FLIP: in rankMarksAtPoint, ignore `contains` and test the box →
// the first test reds (the corner click opens the district). Run receipt in the
// hotfix PR.
//
//   node --test tools/ring-hit.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { rankMarksAtPoint, snappedMarkAtPoint } from "../spectator/viewer.mjs";

// A ringed district in screen px: a diamond inscribed in a 400 × 400 box. The
// diamond covers half the box; its corners are outside the ring.
const box = { left: 100, right: 500, top: 100, bottom: 500 };
const centre = { x: 300, y: 300 };
const inDiamond = (x, y) => Math.abs(x - centre.x) + Math.abs(y - centre.y) <= 200;
const district = { id: "limen/the-threshold-district", x: centre.x, y: centre.y, box, contains: inDiamond };
const card = { id: "rei/the-lanternstep-house-parcel", x: 900, y: 900, box: { left: 880, right: 920, top: 880, bottom: 920 } };

test("a click inside the district's BOX but outside its RING opens nothing", () => {
  const corner = { x: 120, y: 120 };            // inside the box, outside the diamond
  assert.equal(inDiamond(corner.x, corner.y), false, "the fixture's corner really is outside the ring");
  assert.equal(snappedMarkAtPoint(corner, [district, card]), null);
  assert.deepEqual(rankMarksAtPoint(corner, [district, card]), []);
});

test("a click inside the ring opens the district, ranked by its box's centre as before", () => {
  const inside = { x: 300, y: 420 };            // inside the diamond, 120 px from its centre
  const ranked = rankMarksAtPoint(inside, [district, card]);
  assert.equal(ranked[0]?.id, district.id);
  assert.equal(ranked[0]?.tier, 1);
  assert.equal(ranked[0]?.distancePx, 120);
});

test("a rectangular card with no `contains` keeps the box rule it always had", () => {
  assert.equal(snappedMarkAtPoint({ x: 885, y: 915 }, [district, card]), card.id, "inside the card's box");
  assert.equal(snappedMarkAtPoint({ x: 925, y: 915 }, [district, card]), null, "outside it");
});

test("the snap radius still wins over any shape: a pip near the pointer beats the ring it sits in", () => {
  // the pointer sits inside the ring but well off the district's own centre
  // (a candidate whose centre is within the snap radius is tier 0 by the rule
  // that predates this file, and that rule is not under test here)
  const pip = { id: "limen/water-against-stone", x: 383, y: 383 };
  const ranked = rankMarksAtPoint({ x: 380, y: 380 }, [district, pip]);
  assert.equal(ranked[0]?.id, pip.id, "tier 0 first");
  assert.equal(ranked[1]?.id, district.id, "the ring second");
});
