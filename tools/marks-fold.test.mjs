#!/usr/bin/env node
// marks-fold.test.mjs — Rung 2 of coverage-geometry: the fold + lint honor true
// shape. The parser reads a `points:` ring, and nesting containment now flows
// through marksContain (coverage when a party carries a ring; analytic bbox
// otherwise — and feature geometry is never passed, so feature marks stay
// claim-based). Run: node --test tools/

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, parseRecord } from "./marks-fold.mjs";

test("parseRecord reads a points ring — bracket-array and SVG-attribute forms", () => {
  const bracket = parseRecord("---\nkind: sited\nby: t\npoints: [[0,0],[60,0],[60,20]]\n---\nbody", "x");
  assert.ok(Array.isArray(bracket.points) && bracket.points.length === 3, "bracket form parses to an array");
  assert.deepEqual(bracket.points[1], [60, 0]);
  const svg = parseRecord("---\nkind: sited\nby: t\npoints: 0,0 60,0 60,20 20,20\n---\nbody", "x");
  assert.ok(Array.isArray(svg.points) && svg.points.length === 4, "SVG points-attribute form parses to an array");
  assert.deepEqual(svg.points[1], [60, 0]);
  // a record with no ring is untouched (the byte-identical guarantee for today's tree)
  const plain = parseRecord("---\nkind: sited\nby: t\nat: {x: 1, y: 2}\nextent: {w: 4, h: 4}\n---\nb", "x");
  assert.equal(plain.points, undefined, "no points: → no ring, nothing invented");
  assert.deepEqual(plain.at, { x: 1, y: 2 }, "other frontmatter parses as before");
});

test("the fold's nesting honors a points: ring — a child in the notch does NOT fan up", () => {
  // an L-shape container (points:), one staked child in the ARM (inside the L),
  // one in the NOTCH (inside the L's bounding box, outside the L itself).
  const L = { id: "t/l", by: "t", household: "t", kind: "sited", tier: "market",
    at: { x: 30, y: 30 }, extent: { w: 60, h: 60 },
    points: [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]], body: "the L" };
  const arm = { id: "t/arm", by: "t", household: "t", kind: "sited", tier: "market",
    at: { x: 10, y: 10 }, extent: { w: 10, h: 10 }, body: "in the arm" };
  const notch = { id: "t/notch", by: "t", household: "t", kind: "sited", tier: "market",
    at: { x: 40, y: 40 }, extent: { w: 10, h: 10 }, body: "in the notch" };
  const stakes = [
    { tick: 0, holder: "h", mark: "t/arm", n: 5 },
    { tick: 0, holder: "h", mark: "t/notch", n: 7 },
  ];
  const state = fold({ marks: [L, arm, notch], terrain: { features: [] }, stakes, tick: 1 });
  const w = (id) => state.marks.find((m) => m.id === id)?.weight;
  // fan-up: L = own(0) + arm(5). The notch child is NOT contained (coverage, not
  // bbox), so its 7 stakes never reach L. Under the old bbox rule L would be 12.
  assert.equal(w("t/l"), 5, "the L fans up only the arm child's stake (coverage-honest containment)");
  assert.equal(w("t/notch"), 7, "the notch child stands alone — not a child of the L");
  assert.notEqual(w("t/l"), 12, "the bbox rule would have wrongly folded the notch child in");
});

test("with a rectangular container the fold is unchanged (analytic delegation)", () => {
  // same geometry, but the container is a plain rect (no points:) — both children
  // are inside its box, so both fan up: the analytic path, byte-identical to before.
  const box = { id: "t/box", by: "t", household: "t", kind: "sited", tier: "market",
    at: { x: 30, y: 30 }, extent: { w: 60, h: 60 }, body: "the box" };
  const arm = { id: "t/arm", by: "t", household: "t", kind: "sited", tier: "market", at: { x: 10, y: 10 }, extent: { w: 10, h: 10 }, body: "a" };
  const notch = { id: "t/notch", by: "t", household: "t", kind: "sited", tier: "market", at: { x: 40, y: 40 }, extent: { w: 10, h: 10 }, body: "b" };
  const stakes = [{ tick: 0, holder: "h", mark: "t/arm", n: 5 }, { tick: 0, holder: "h", mark: "t/notch", n: 7 }];
  const state = fold({ marks: [box, arm, notch], terrain: { features: [] }, stakes, tick: 1 });
  assert.equal(state.marks.find((m) => m.id === "t/box")?.weight, 12, "a rect container folds up both children");
});
