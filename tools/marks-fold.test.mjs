#!/usr/bin/env node
// marks-fold.test.mjs — Rung 2 of coverage-geometry: the fold + lint honor true
// shape. The parser reads a `points:` ring, and nesting containment now flows
// through marksContain (coverage when a party carries a ring; analytic bbox
// otherwise — and feature geometry is never passed, so feature marks stay
// claim-based). Run: node --test tools/

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, parseRecord, isValidMarkDate, placementParent } from "./marks-fold.mjs";

test("isValidMarkDate accepts day precision AND full ISO 8601 datetime (world-write rung)", () => {
  for (const ok of ["2026-07-23", "2026-07-23T14:30:00", "2026-07-23T14:30:00Z",
    "2026-07-23T14:30:00.123Z", "2026-07-23T14:30:00+05:30", "2026-07-23T14:30:00.5-04:00"])
    assert.equal(isValidMarkDate(ok), true, `should accept ${ok}`);
  for (const bad of ["2026-7-23", "07-23-2026", "2026-07-23 14:30", "yesterday", "", null, "2026-07-23T14:30"])
    assert.equal(isValidMarkDate(bad), false, `should reject ${JSON.stringify(bad)}`);
  // and a mark stamped with an ISO datetime folds clean and carries it through
  const m = { id: "t/now", by: "t", household: "t", kind: "sited", tier: "market",
    at: { x: 0, y: 0 }, extent: { w: 4, h: 4 }, date: "2026-07-23T14:30:00Z", body: "b" };
  const s = fold({ marks: [m], terrain: { features: [] }, stakes: [], tick: 1 });
  assert.equal(s.marks[0].date, "2026-07-23T14:30:00Z", "the ISO datetime survives the fold");
});

test("placementParent finds the DEEPEST containing claim (bbox), null when only the root holds it", () => {
  const root = { id: "the-town/let-there-be-light", kind: "sited", by: "the-town", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } };
  const region = { id: "t/region", kind: "sited", by: "t", at: { x: 0, y: 0 }, extent: { w: 4000, h: 4000 } };
  const yard = { id: "t/yard", kind: "sited", by: "t", at: { x: 100, y: 100 }, extent: { w: 200, h: 200 } };
  const naming = { id: "t/name", kind: "naming", by: "t", value: "x" }; // not a container, ignored
  const marks = [root, region, yard, naming];
  // a small claim inside the yard → the yard (deepest), not the region or root
  assert.equal(placementParent({ at: { x: 110, y: 110 }, extent: { w: 5, h: 5 } }, marks), "t/yard");
  // a claim inside the region but outside the yard → the region
  assert.equal(placementParent({ at: { x: 1500, y: 1500 }, extent: { w: 5, h: 5 } }, marks), "t/region");
  // a claim out in open ground (only the world-root contains it) → null (→ root)
  assert.equal(placementParent({ at: { x: 100000, y: 100000 }, extent: { w: 5, h: 5 } }, marks), null);
  // a claim as big as the yard is NOT a child of the yard (parent must be strictly larger)
  assert.equal(placementParent({ at: { x: 100, y: 100 }, extent: { w: 200, h: 200 } }, marks), "t/region");
});

test("placementParent matches the enforcer on a ring container — no notch-bounce (marksContain, not bbox)", () => {
  // an L-shape container (the notch is inside its bbox, outside its coverage). The
  // placer must NOT put a notch claim inside it, or the lint gate would bounce it.
  const root = { id: "the-town/let-there-be-light", kind: "sited", by: "the-town", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } };
  const L = { id: "t/l", kind: "sited", by: "t", at: { x: 30, y: 30 }, extent: { w: 60, h: 60 },
    points: [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]] };
  const marks = [root, L];
  // a claim in the L's ARM → placed inside the L (coverage contains it)
  assert.equal(placementParent({ at: { x: 10, y: 10 }, extent: { w: 6, h: 6 } }, marks), "t/l");
  // a claim in the L's NOTCH → NOT the L (bbox would say yes; coverage says no) → root
  assert.equal(placementParent({ at: { x: 40, y: 40 }, extent: { w: 6, h: 6 } }, marks), null);
});

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

test("the fold carries a points: ring through to the output mark (the FOV silhouette reads it)", () => {
  const m = { id: "t/poly", by: "t", household: "t", kind: "sited", tier: "market",
    at: { x: 0, y: 0 }, extent: { w: 20, h: 20 }, points: [[-10, -10], [10, -10], [10, 10], [-10, 10]], body: "poly" };
  const state = fold({ marks: [m], terrain: { features: [] }, stakes: [], tick: 1 });
  const out = state.marks.find((x) => x.id === "t/poly");
  assert.deepEqual(out.points, [[-10, -10], [10, -10], [10, 10], [-10, 10]], "points survive the fold output projection");
  // a mark with no ring serializes without a points key — world-state.json stays byte-identical
  const plain = { id: "t/plain", by: "t", household: "t", kind: "sited", tier: "market", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 }, body: "b" };
  const s2 = fold({ marks: [plain], terrain: { features: [] }, stakes: [], tick: 1 });
  assert.equal("points" in JSON.parse(JSON.stringify(s2.marks[0])), false, "no ring → no points key after serialization");
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
