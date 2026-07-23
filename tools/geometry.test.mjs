#!/usr/bin/env node
// geometry.test.mjs — guardrails for the ONE geometry module, now that it carries
// coverage cell-sets alongside the analytic rect primitives. Run: node --test tools/
//
// The hard gate (Keemin's ruling): rect-vs-rect stays byte-identical for the whole
// current record — the analytic `contains`/`overlapArea` are untouched, and the
// mark-aware `marksContain`/`marksOverlapArea` delegate to them when both parties
// are regular. Coverage cell-sets kick in ONLY for irregular marks (a polygon ring
// or a resolved feature polyline). These tests prove both halves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rect, overlapArea, contains,
  coverage, marksContain, marksOverlapArea, isIrregular, polygonOf, COVERAGE_CELL_M,
} from "./geometry.mjs";
import { fold, loadMarks } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ───────────────────────── the byte-identical hard gate ─────────────────────
test("the analytic primitives are untouched (rect/overlapArea/contains unchanged)", () => {
  const house = { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } };
  const inside = { at: { x: 2, y: 2 }, extent: { w: 1, h: 1 } };
  const faraway = { at: { x: 900, y: 900 }, extent: { w: 1, h: 1 } };
  assert.equal(contains(rect(house), rect(inside)), true);
  assert.equal(contains(rect(house), rect(faraway)), false);
  assert.equal(overlapArea(rect(house), rect(inside)), 1);
  // the 0.99 boundary the fold relies on: an inner just barely inside vs just out
  const edgeIn = { at: { x: 4.5, y: 0 }, extent: { w: 1, h: 10 } };   // fully inside 10×10
  const edgeOut = { at: { x: 5.05, y: 0 }, extent: { w: 1, h: 10 } }; // >1% pokes out
  assert.equal(contains(rect(house), rect(edgeIn)), true);
  assert.equal(contains(rect(house), rect(edgeOut)), false);
});

test("marksContain on regular marks IS the analytic contains (byte-identical delegation)", () => {
  const house = { at: { x: 0, y: 0 }, extent: { w: 100, h: 100 } };
  const cases = [
    { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } },
    { at: { x: 45, y: 45 }, extent: { w: 8, h: 8 } },
    { at: { x: 49.6, y: 0 }, extent: { w: 1, h: 1 } },   // near the edge
    { at: { x: 60, y: 0 }, extent: { w: 20, h: 20 } },   // pokes out
    { at: { x: 500, y: 500 }, extent: { w: 4, h: 4 } },  // far away
  ];
  for (const inner of cases)
    assert.equal(marksContain(house, inner), contains(rect(house), rect(inner)), `pair ${JSON.stringify(inner.at)}`);
});

test("the real record folds unchanged (0 errors, stable count, deterministic)", () => {
  const marks = loadMarks(join(ROOT, "WORLD/marks"));
  const terrain = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  const a = fold({ marks, terrain, stakes: [], tick: 1 });
  const b = fold({ marks, terrain, stakes: [], tick: 1 });
  assert.equal(a.errors.length, 0, "the current record folds with zero errors");
  assert.equal(a.marks.length, 213, "mark count is stable at 213");
  assert.equal(JSON.stringify(a), JSON.stringify(b), "fold is deterministic (byte-identical replay)");
  // and every real (regular) mark pair agrees between marksContain and the analytic
  // contains — no record is irregular yet, so the coverage branch is never taken
  const sited = a.marks.filter((m) => m.at && (m.kind === "sited" || m.kind === "parcel")).slice(0, 40);
  for (const o of sited) for (const i of sited.slice(0, 10))
    assert.equal(marksContain(o, i), contains(rect(o), rect(i)), `${o.id} ⊇ ${i.id}`);
});

// ───────────────────────── coverage: the rect rasterizer ────────────────────
test("rect coverage is the box's cells (center-sampled at the dial)", () => {
  const m = { at: { x: 50, y: 50 }, extent: { w: 40, h: 40 } }; // [30,70]×[30,70]
  const cov = coverage(m, { cell: 10 });
  // cell centers at 35,45,55,65 fall inside [30,70] → 4×4 = 16 cells
  assert.equal(cov.size, 16);
  assert.ok(cov.has("5,5"), "cell (5,5) center (55,55) is inside");
  assert.ok(!cov.has("2,2"), "cell (2,2) center (25,25) is outside");
});

test("a map-scale rect refuses to rasterize (returns null → caller stays analytic)", () => {
  const huge = { at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } };
  assert.equal(coverage(huge, { cell: COVERAGE_CELL_M }), null);
  // marksContain with a huge irregular-ish party still answers via analytic fallback
  const inner = { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 }, points: [[-5, -5], [5, -5], [5, 5], [-5, 5]] };
  assert.equal(typeof marksContain(huge, inner), "boolean");
});

// ───────────────────────── coverage: the polygon (points-ring) rasterizer ────
test("a points-ring honors concavity: contains in the arm, excludes in the notch", () => {
  // an L-shape: horizontal arm [0,60]×[0,20] ∪ vertical arm [0,20]×[0,60].
  // its bounding box is [0,60]² — a plain rect would (wrongly) contain the notch.
  const L = { at: { x: 30, y: 30 }, extent: { w: 60, h: 60 },
    points: [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]] };
  assert.ok(isIrregular(L), "a marks with a ≥3-vertex ring is irregular");
  assert.ok(polygonOf(L), "polygonOf reads the ring");
  const inArm = { at: { x: 10, y: 10 }, extent: { w: 10, h: 10 } };   // horizontal arm
  const inNotch = { at: { x: 40, y: 40 }, extent: { w: 10, h: 10 } }; // the notch (inside bbox, outside L)
  assert.equal(marksContain(L, inArm, { cell: 5 }), true, "a mark in the arm is contained");
  assert.equal(marksContain(L, inNotch, { cell: 5 }), false, "a mark in the notch is NOT contained (coverage, not bbox)");
  // prove the distinction is real: the analytic bbox rule would have said yes
  assert.equal(contains(rect(L), rect(inNotch)), true, "the old bbox rule wrongly contains the notch mark");
});

// ───────────────────────── coverage: the feature polyline+width rasterizer ───
test("a feature polyline+width covers along the line, not the bounding box", () => {
  const feature = { line: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 20 }; // half-width 10
  const channelMark = { at: { x: 50, y: 0 }, extent: { w: 100, h: 100 } }; // coarse claim box
  assert.ok(isIrregular(channelMark, feature), "a mark with a resolved feature line is irregular");
  const cov = coverage(channelMark, { cell: 5, feature });
  // length 100 × width 20 / 25 ≈ 80 cells, plus rounded end caps — a sane band
  assert.ok(cov.size >= 60 && cov.size <= 140, `polyline swath is a sane band, got ${cov.size}`);
  assert.ok(cov.has("10,0"), "a cell centred on the line (52.5,2.5) is covered");
  assert.ok(!cov.has("10,8"), "a cell far off the line (52.5,42.5) is not covered");
  // containment: a mark ON the line is inside the channel; one OFF it (but in the
  // bbox) is not — the swath, not the box
  const onLine = { at: { x: 50, y: 0 }, extent: { w: 10, h: 10 } };
  const offLine = { at: { x: 50, y: 40 }, extent: { w: 10, h: 10 } };
  assert.equal(marksContain(channelMark, onLine, { cell: 5, outerFeature: feature }), true);
  assert.equal(marksContain(channelMark, offLine, { cell: 5, outerFeature: feature }), false);
});

test("polyline half-width interpolates per-vertex (the channel's w_m)", () => {
  // widens 20→40 (half 10→20) along the run
  const feature = { line: [{ x: 0, y: 0, w_m: 20 }, { x: 100, y: 0, w_m: 40 }] };
  const mark = { at: { x: 50, y: 0 }, extent: { w: 120, h: 60 } };
  const cov = coverage(mark, { cell: 5, feature });
  // near the wide end a cell 15 m off-axis is covered; near the narrow end it is not
  assert.ok(cov.has(cellAt(90, 15, 5)), "wide end: 15 m off-axis is within the ~19 m half-width");
  assert.ok(!cov.has(cellAt(10, 15, 5)), "narrow end: 15 m off-axis exceeds the ~11 m half-width");
});

// ───────────────────────── overlap + irregular detection ────────────────────
test("marksOverlapArea delegates analytic when regular, cell-counts when irregular", () => {
  const a = { at: { x: 0, y: 0 }, extent: { w: 20, h: 20 } };
  const b = { at: { x: 10, y: 0 }, extent: { w: 20, h: 20 } };
  assert.equal(marksOverlapArea(a, b), overlapArea(rect(a), rect(b)), "regular pair is analytic");
  // irregular: two overlapping polygons share a measurable area (> 0)
  const p1 = { at: { x: 0, y: 0 }, extent: { w: 40, h: 40 }, points: [[-20, -20], [20, -20], [20, 20], [-20, 20]] };
  const p2 = { at: { x: 20, y: 0 }, extent: { w: 40, h: 40 }, points: [[0, -20], [40, -20], [40, 20], [0, 20]] };
  const ov = marksOverlapArea(p1, p2, { cell: 5 });
  assert.ok(ov > 0 && ov < 40 * 40, `overlapping polygons share area, got ${ov}`);
});

test("isIrregular: plain rect is regular; points or a feature line is irregular", () => {
  assert.equal(isIrregular({ at: { x: 0, y: 0 }, extent: { w: 5, h: 5 } }), false);
  assert.equal(isIrregular({ points: [[0, 0], [1, 0], [1, 1]] }), true);
  assert.equal(isIrregular({ at: { x: 0, y: 0 } }, { line: [{ x: 0, y: 0 }, { x: 9, y: 0 }] }), true);
  assert.equal(isIrregular({ points: [[0, 0], [1, 0]] }), false, "a 2-vertex 'ring' is not a shape");
});

// helper: the cell key for a world point at a given cell size
function cellAt(x, y, cell) { return Math.floor(x / cell) + "," + Math.floor(y / cell); }
