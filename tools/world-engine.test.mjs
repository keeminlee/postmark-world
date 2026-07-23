#!/usr/bin/env node
// world-engine.test.mjs — the spine's guardrails. Run: node --test tools/
//
// Covers the laws that bind (Wright's brief): determinism/replay, band-honoring
// elevation, FOV occlusion, the LOD budget cap, signal-through-fog, the geometry
// lint ("you cannot lie with an edge"), cluster tree-descent, and anonymous wear.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHeightfield, fieldOfView, fogModel, lightLevelAt, lodScore,
  bearingDeg, quantizeBearing, distanceBand, DIALS,
} from "./world-engine.mjs";
import { walk, investigate, orient, openYourEyes } from "./world-verbs.mjs";
import { buildWorld } from "./world-poc.mjs";
import { contains, rect } from "./geometry.mjs";

// a tiny flat world helper
const flatHF = buildHeightfield({ controlPoints: [{ x: 0, y: 0, h: 5 }, { x: 10000, y: 0, h: 5 }, { x: 0, y: 10000, h: 5 }, { x: -10000, y: 0, h: 5 }] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
function worldOf(marks, terrain = { far_features: [], features: [], elevation: {} }) {
  return { marks, terrain, heightfield: flatHF, light, fogCeilingM: 22 };
}

test("fog is a pure function of the crossing number (deterministic, replayable)", () => {
  assert.equal(fogModel(19).thickness, fogModel(19).thickness);
  assert.deepEqual(fogModel(7), fogModel(7));
  assert.notEqual(fogModel(16).thickness, fogModel(20).thickness); // weather varies by crossing
  for (const c of [0, 1, 16, 99, 1000]) { const t = fogModel(c).thickness; assert.ok(t >= 0 && t <= 1); }
});

test("open-your-eyes replays byte-identical at the same crossing (no wall-clock)", () => {
  const w = buildWorld({ crossing: 20 });
  const a = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20 });
  const b = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("heightfield honors the region bands (elevation ≈ band midpoint at an anchor)", () => {
  // grove anchor +40; quay +5 — the field returns each near its own control value
  const hf = buildHeightfield({ controlPoints: [
    { x: 0, y: 0, h: 5, id: "quay" }, { x: -1375, y: -2550, h: 40, id: "grove" }, { x: 4075, y: 5050, h: 7.5, id: "aelyria" },
  ] });
  assert.equal(hf.elevationAt(0, 0), 5);
  assert.equal(hf.elevationAt(-1375, -2550), 40);
  assert.ok(Math.abs(hf.elevationAt(4075, 5050) - 7.5) < 0.01);
});

test("FOV occludes a low mark behind a tall hill, but a hill-top mark clears", () => {
  // a ridge at x=500 rising to 80 m between observer (0,0,+5) and a target at x=1000
  const hf = buildHeightfield({ controlPoints: [
    { x: 0, y: 0, h: 5 }, { x: 500, y: 0, h: 80 }, { x: 1000, y: 0, h: 5 }, { x: 2000, y: 0, h: 5 },
  ] });
  const w = { marks: [
    { id: "hh/low", kind: "sited", household: "hh", at: { x: 1000, y: 0 }, extent: { w: 2, h: 2 }, weight: 0, top_m: 0 },
    { id: "hh/tall", kind: "sited", household: "zz", at: { x: 1000, y: 0 }, extent: { w: 2, h: 2 }, weight: 0, top_m: 200 },
  ], terrain: { far_features: [], features: [] }, heightfield: hf, light, fogCeilingM: 22 };
  const fov = fieldOfView({ x: 0, y: 0 }, w, { crossing: 0 });
  const ids = fov.carried.map((m) => m.id);
  assert.ok(!ids.includes("hh/low"), "low mark behind the 80 m ridge must be occluded");
  assert.ok(ids.includes("hh/tall"), "a 200 m-tall mark clears the ridge");
});

test("LOD respects the context budget (render cost capped, not world-proportional)", () => {
  const marks = [];
  for (let i = 0; i < 100; i++) marks.push({ id: `hh${i}/m`, kind: "sited", household: `hh${i}`, at: { x: 100 + i, y: 50 }, extent: { w: 4, h: 4 }, weight: i });
  const fov = fieldOfView({ x: 0, y: 0 }, worldOf(marks), { crossing: 0, budget: 5 });
  assert.ok(fov.carried.length <= 5, "carried never exceeds the budget");
  assert.ok(fov.counts.visible > 5, "there was more in view than the budget — the rest aggregate");
  assert.ok(fov.aggregate.hidden_by_budget >= 0);
});

test("a signal-mark cuts through fog where a plain mark at the same range does not", () => {
  const far = 6000; // beyond a thick-fog reach, within a signal's multiplied reach
  const marks = [
    { id: "a/plain", kind: "sited", household: "a", at: { x: 0, y: far }, extent: { w: 4, h: 4 }, weight: 5, signal: false, top_m: 4 },
    { id: "b/beacon", kind: "sited", household: "b", at: { x: 1, y: far }, extent: { w: 4, h: 4 }, weight: 5, signal: true, top_m: 4 },
  ];
  // pick a genuinely foggy crossing (thick enough that reach < far but a signal's ×mult reaches)
  let foggy = 1, best = 0;
  for (let c = 1; c < 200; c++) { const t = fogModel(c).thickness; if (t > best) { best = t; foggy = c; } }
  assert.ok(best > 0.4, `expected some crossing with thick fog, got max ${best}`);
  const fov = fieldOfView({ x: 0, y: 0 }, worldOf(marks), { crossing: foggy });
  const ids = fov.carried.map((m) => m.id);
  assert.ok(ids.includes("b/beacon"), "the beacon's light carries through fog");
  assert.ok(!ids.includes("a/plain"), "the plain mark is lost to the same fog");
});

test("the light axis dims a non-signal mark at the dark pole", () => {
  assert.ok(lightLevelAt(5000, -5000, light) > 0.9, "dawn pole is bright");
  assert.ok(lightLevelAt(-5000, 5000, light) < 0.1, "dark pole is dark");
});

test("containment uses the ONE shared `contains` (no engine-local geometry)", () => {
  // the geometry gate is tools/mark-lint.mjs (its own suite); the engine and verbs
  // consume the shared contains, so a child inside a parent registers and a distant
  // one does not — by the very definition the fold and lint share.
  const house = { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } };
  const inside = { at: { x: 2, y: 2 }, extent: { w: 1, h: 1 } };
  const faraway = { at: { x: 900, y: 900 }, extent: { w: 1, h: 1 } };
  assert.equal(contains(rect(house), rect(inside)), true);
  assert.equal(contains(rect(house), rect(faraway)), false);
});

test("household cluster collapses at distance and investigate re-opens it", () => {
  const w = buildWorld({ crossing: 20 });
  const fov = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20 });
  const hal = fov.carried.find((m) => m.id.startsWith("hal/"));
  assert.ok(hal && hal.clusteredCount > 0, "hal's distant marks collapse to one rep with a count");
  const inv = investigate(hal.id, w, { budget: 12 });
  assert.ok(inv.alongside.length >= hal.clusteredCount, "investigate re-opens the collapsed cluster");
});

test("walk spends crossings at the ~15 km dial and records wear WITHOUT names", () => {
  const w = buildWorld({ crossing: 20 });
  const res = walk({ x: 0, y: 0, name: "someone" }, "NW", 30000, w);
  assert.equal(res.crossings, 2, "30 km / 15 km per crossing = 2 crossings");
  assert.ok(res.wearDelta.length > 0);
  for (const cell of res.wearDelta) {
    assert.deepEqual(Object.keys(cell).sort(), ["wear", "x", "y"], "wear carries only place + count — never a holder name");
  }
});

test("radial helpers: bearings and named bands are stable", () => {
  assert.equal(quantizeBearing(bearingDeg(0, -100)), "N");   // due north (─y)
  assert.equal(quantizeBearing(bearingDeg(100, 0)), "E");    // due east (+x)
  assert.equal(quantizeBearing(bearingDeg(0, 100)), "S");    // due south (+y)
  assert.equal(distanceBand(5), "underfoot");
  assert.equal(distanceBand(100000), "on the horizon");
});

test("orient returns the charter root and your standing state", () => {
  const w = buildWorld({ crossing: 20 });
  const o = orient({ x: 0, y: 0, name: "quay agent" }, w, { crossing: 20 });
  assert.equal(o.charter.root, "let-there-be-light");
  assert.equal(o.you.region, "the-town-centre");
  assert.ok(o.you.groundElevM >= 4 && o.you.groundElevM <= 6, "the quay is ~+5 m");
});

test("a passed dials override defaulting to DIALS is byte-identical (dev-pane safety)", () => {
  // the dev pane threads an optional `dials` param; passing the module DIALS
  // through must change nothing — determinism/replay is law.
  const w = buildWorld({ crossing: 20 });
  const base = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20 });
  const same = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20, dials: DIALS });
  assert.equal(JSON.stringify(base), JSON.stringify(same), "dials=DIALS must be a no-op");
  // and through the verb wrapper the same holds
  const e0 = openYourEyes({ x: 0, y: 0 }, w, { crossing: 20 });
  const e1 = openYourEyes({ x: 0, y: 0 }, w, { crossing: 20, dials: DIALS });
  assert.equal(e0.tell(), e1.tell(), "openYourEyes dials=DIALS renders identically");
});

test("a dev-pane dial override actually changes the telling (threaded, not mutated)", () => {
  const w = buildWorld({ crossing: 20 });
  const wide = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20, budget: 20 });
  const tight = fieldOfView({ x: 0, y: 0 }, w, { crossing: 20, budget: 3, dials: { ...DIALS, context_budget: 3 } });
  assert.ok(tight.carried.length <= 3, "a tightened budget carries fewer marks");
  assert.ok(wide.carried.length > tight.carried.length, "widening the budget carries more");
  // a raised dark-dim floor lifts a dark-pole mark's visibility without touching module state
  const darkMark = [{ id: "z/dusk", kind: "sited", household: "z", at: { x: -4800, y: 4800 }, extent: { w: 4, h: 4 }, weight: 0, top_m: 4 }];
  const dim = fieldOfView({ x: -4700, y: 4700 }, worldOf(darkMark), { crossing: 0 });
  const lit = fieldOfView({ x: -4700, y: 4700 }, worldOf(darkMark), { crossing: 0, dials: { ...DIALS, dark_dim_floor: 1 } });
  const dDim = dim.carried.find((m) => m.id === "z/dusk");
  const dLit = lit.carried.find((m) => m.id === "z/dusk");
  assert.ok(dDim && dLit, "the dusk mark is in view both ways");
  assert.ok(dLit.dim > dDim.dim, "raising dark_dim_floor un-dims a dark-pole mark — the override threaded through");
  // module DIALS is untouched by the override (no mutation)
  assert.equal(DIALS.dark_dim_floor, 0.15, "module DIALS.dark_dim_floor is unchanged");
});
