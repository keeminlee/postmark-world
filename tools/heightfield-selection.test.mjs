// heightfield-selection.test.mjs — the k-nearest selection that replaced a sort.
//
// buildHeightfield's elevationAt is the floor of the engine: line-of-sight
// samples it along every ray, so it runs tens of thousands of times per pair of
// eyes opened. It used to allocate an object per control point and SORT all of
// them to keep the nearest eight. It now walks them once into a fixed-size beat.
//
// The only thing that makes that trade safe is EXACTNESS, so this file does not
// assert remembered numbers. It carries the original implementation verbatim and
// asserts the two agree bit for bit — on the real control points, on ties, on
// degenerate fields, and on the exact-hit shortcut. If the fast path ever drifts,
// the reference is right here to say by how much.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DIALS, buildHeightfield } from "./world-engine.mjs";
import { assembleWorld } from "./world-build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── THE ORIGINAL, kept verbatim as the oracle ───────────────────────────────
function referenceHeightfield({ controlPoints, power = DIALS.idw_power, k = DIALS.idw_k }) {
  const cps = controlPoints.map((c) => ({ x: c.x, y: c.y, h: c.h, id: c.id ?? null }));
  const K = Math.min(k, cps.length);
  return (x, y) => {
    const near = cps
      .map((c) => ({ c, d2: (x - c.x) ** 2 + (y - c.y) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, K);
    if (near[0].d2 === 0) return near[0].c.h;
    let wsum = 0, hsum = 0;
    for (const { c, d2 } of near) { const w = 1 / Math.pow(d2, power / 2); wsum += w; hsum += w * c.h; }
    return hsum / wsum;
  };
}

const world = assembleWorld({
  worldState: JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8")),
  skeleton: JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")),
});
const REAL_CPS = world.heightfield.controlPoints;

test("the real control points are the fixture, and there are enough to matter", () => {
  assert.ok(REAL_CPS.length > 100, `the town has ${REAL_CPS.length} control points`);
  assert.ok(REAL_CPS.length > DIALS.idw_k, "more points than the field keeps, or selection is a no-op");
});

test("BIT-IDENTICAL to the sort across the whole town", () => {
  const fast = world.heightfield.elevationAt;
  const slow = referenceHeightfield({ controlPoints: REAL_CPS });
  let checked = 0;
  for (let x = -8000; x <= 8000; x += 250) {
    for (let y = -8000; y <= 8000; y += 250) {
      const a = fast(x, y), b = slow(x, y);
      assert.equal(Object.is(a, b), true, `elevation disagreed at ${x},${y}: ${a} vs ${b}`);
      checked += 1;
    }
  }
  assert.ok(checked > 4000, `swept ${checked} points`);
});

test("bit-identical ON the control points themselves — the exact-hit shortcut", () => {
  const fast = world.heightfield.elevationAt;
  const slow = referenceHeightfield({ controlPoints: REAL_CPS });
  // FIRST AT THE COORDINATE WINS, and that is not a tidy invariant — it is the
  // record's own ambiguity, surfaced. 22 coordinates in the town carry more than
  // one control point, and at exactly one of them the two disagree about the
  // height: the-protected-grove says 40 m at (-1400,-2775) while an anonymous
  // point says 7.10 m. Whichever the loader listed first decides the elevation
  // there. Both implementations resolve it identically, so this is not a
  // regression and not this change's to rule on — but a test that asserted
  // `fast(c.x,c.y) === c.h` would fail on the real record, and it should be
  // clear WHY rather than looking like drift.
  const firstAt = new Map();
  for (const c of REAL_CPS) {
    const key = `${c.x},${c.y}`;
    if (!firstAt.has(key)) firstAt.set(key, c);
  }
  for (const c of REAL_CPS) {
    assert.equal(Object.is(fast(c.x, c.y), slow(c.x, c.y)), true, `disagreed on control point ${c.id ?? ""}`);
    assert.equal(fast(c.x, c.y), firstAt.get(`${c.x},${c.y}`).h,
      "standing on a control point returns the height of the first point listed there");
  }
});

test("the record's duplicate control points are still exactly one conflict", () => {
  // A canary, not a rule. If a second conflicting pair ever appears, the town has
  // grown a new place where the ground's height depends on load order, and
  // somebody should decide it on purpose rather than discover it in a profile.
  const heightsAt = new Map();
  for (const c of REAL_CPS) {
    const key = `${c.x},${c.y}`;
    if (!heightsAt.has(key)) heightsAt.set(key, new Set());
    heightsAt.get(key).add(c.h);
  }
  const conflicts = [...heightsAt.entries()].filter(([, hs]) => hs.size > 1).map(([k]) => k);
  assert.deepEqual(conflicts, ["-1400,-2775"],
    `control-point coordinates disagreeing on height: ${JSON.stringify(conflicts)}`);
});

test("TIES KEEP THE EARLIER POINT, exactly as the stable sort did", () => {
  // four points equidistant from the origin, all different heights: which four
  // the field keeps is decided purely by tie-breaking, so any drift shows here
  const controlPoints = [
    { x: 10, y: 0, h: 100, id: "a" }, { x: -10, y: 0, h: 200, id: "b" },
    { x: 0, y: 10, h: 300, id: "c" }, { x: 0, y: -10, h: 400, id: "d" },
    { x: 10, y: 0, h: 999, id: "a-dup" },
  ];
  for (const k of [1, 2, 3, 4, 5]) {
    const fast = buildHeightfield({ controlPoints, k }).elevationAt;
    const slow = referenceHeightfield({ controlPoints, k });
    for (const [x, y] of [[0, 0], [1, 1], [-3, 2], [5, -5]])
      assert.equal(Object.is(fast(x, y), slow(x, y)), true, `k=${k} disagreed at ${x},${y}`);
  }
});

test("bit-identical for every k the dial could hold", () => {
  const controlPoints = REAL_CPS.slice(0, 40);
  for (const k of [1, 2, 3, 8, 17, 40, 80]) {
    const fast = buildHeightfield({ controlPoints, k }).elevationAt;
    const slow = referenceHeightfield({ controlPoints, k });
    for (const [x, y] of [[0, 0], [500, -500], [-2200, 900], [12345, 6789]])
      assert.equal(Object.is(fast(x, y), slow(x, y)), true, `k=${k} disagreed at ${x},${y}`);
  }
});

test("bit-identical for every power the dial could hold", () => {
  const controlPoints = REAL_CPS.slice(0, 40);
  for (const power of [1, 2, 3, 4]) {
    const fast = buildHeightfield({ controlPoints, power }).elevationAt;
    const slow = referenceHeightfield({ controlPoints, power });
    for (const [x, y] of [[0, 0], [300, 300], [-900, 120]])
      assert.equal(Object.is(fast(x, y), slow(x, y)), true, `power=${power} disagreed at ${x},${y}`);
  }
});

test("a single control point is a flat world, and does not divide by nothing", () => {
  const f = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 42 }] }).elevationAt;
  assert.equal(f(0, 0), 42, "standing on it");
  assert.equal(f(1000, -1000), 42, "and anywhere else — one point weights to itself");
});

test("an empty field is still refused", () => {
  assert.throws(() => buildHeightfield({ controlPoints: [] }), /control points/);
});

// ── THE PROBE THAT COULD ONLY PASS IF THE SELECTION IS ACTUALLY CHEAP ───────
//
// A correctness test cannot tell a fast implementation from a slow one, and the
// whole point of the change was the cost. This is deliberately loose — a shared
// machine under load must not turn a perf win into a red suite — but the margin
// it guards is enormous (the sort was ~14× dearer here and ~45× at 10× marks),
// so a regression to sorting would blow through it many times over.
test("elevationAt is fast enough that sorting the world could not pass this", () => {
  const f = world.heightfield.elevationAt;
  const N = 20000;
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < N; i += 1) sink += f((i % 700) * 11 - 3500, (i % 331) * 17 - 2800);
  const ms = performance.now() - t0;
  assert.ok(Number.isFinite(sink), "the samples were real");
  assert.ok(ms < 2000, `${N} samples over ${REAL_CPS.length} control points took ${ms.toFixed(0)}ms — the sort took far longer`);
});
