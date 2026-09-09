// region-wash-svg.test.mjs — the washes are traced from the world's own rings,
// in the frozen drawing's colours, and a region without a ring is listed, not
// invented.
//
//   node --test tools/region-wash-svg.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAWN_WITHOUT_A_MARK, REGION_WASH, WASH_FILL_OPACITY, ringOf, washReport, washSVGFor } from "./region-wash-svg.mjs";

const ring = [[10, 20], [110, 20], [110, 80], [60, 100], [10, 80]];
const mark = { id: "beta/a-region", kind: "sited", at: { x: 60, y: 60 }, extent: { w: 100, h: 80 }, points: ring };

test("the wash's frame IS the ring's bbox, and the vertices are the ring's own, relative to it", () => {
  const made = washSVGFor(mark, "#7a9c5a");
  assert.ok(made);
  assert.deepEqual(made.bbox, { minX: 10, minY: 20, w: 100, h: 80 });
  assert.match(made.svg, /viewBox="0 0 100\.00 80\.00"/, "viewBox = bbox, so a reader hangs it on at/extent with preserveAspectRatio none");
  assert.match(made.svg, /points="0\.00,0\.00 100\.00,0\.00 100\.00,60\.00 50\.00,80\.00 0\.00,60\.00"/, "every vertex is the ring's, shifted by the bbox origin — nothing re-derived from cx/rx");
  assert.match(made.svg, new RegExp(`fill="#7a9c5a" fill-opacity="${WASH_FILL_OPACITY}"`));
  assert.match(made.svg, /data-region="beta\/a-region"/);
  assert.doesNotMatch(made.svg, /<script|<foreignObject|href=/i, "a wash is a polygon and nothing else — inert by construction as well as by <image> mode");
  assert.equal(made.vertices, 5);
});

test("a mark without a ring yields no wash — the extent rect is not a wash shape", () => {
  assert.equal(washSVGFor({ ...mark, points: undefined }, "#000000"), null);
  assert.equal(washSVGFor({ ...mark, points: [[0, 0], [1, 1]] }, "#000000"), null, "two points are a line, not a ring");
  assert.equal(ringOf({ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] })?.length, 3, "object vertices ride the same lane as pairs");
});

test("the report lists every holder, draws those with a ring, and names the drawn region that has no mark", () => {
  const holders = Object.keys(REGION_WASH);
  assert.equal(holders.length, 12, "the twelve holders of the frozen atlas (town.json regions[] at 715eb65f)");
  for (const [id, wash] of Object.entries(REGION_WASH)) assert.match(wash, /^#[0-9a-f]{6}$/, `${id}: a wash is one hex colour read off render-town.mjs`);
  const marks = [
    { ...mark, id: "rei/the-lanternseed-gardens" },
    { id: "carta/the-long-run", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } }, // no ring
  ];
  const rows = washReport(marks);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId["rei/the-lanternseed-gardens"].ring, true);
  assert.match(byId["rei/the-lanternseed-gardens"].svg, /fill="#7a9c5a"/, "the Gardens wear the drawing's own green");
  assert.equal(byId["carta/the-long-run"].ring, false);
  assert.match(byId["carta/the-long-run"].why, /no points: ring/);
  assert.equal(byId["wright/the-trueing-terrace"].ring, false);
  assert.match(byId["wright/the-trueing-terrace"].why, /no mark in the world/);
  assert.equal(byId["the-headland"].ring, false, "the Headland is drawn in the atlas and has no mark — listed for the sitting, never traced here");
  assert.equal(DRAWN_WITHOUT_A_MARK.length, 1);
  assert.equal(rows.length, 13);
});
