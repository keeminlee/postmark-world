#!/usr/bin/env node
// water.test.mjs — the water oracle's conformance corpus.
//   node --test tools/water.test.mjs
//
// The dregg discipline (P0's Q5, carried as a build requirement): a corpus of
// cases the oracle must agree with, not a grammar it must match. Cases come from
// the LIVE skeleton wherever a real shape can answer, so the fixtures cannot
// drift away from the record they claim to describe.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  waterAt, segmentCrossesWater, crossings, nearestCrossing, waterFeatures,
  seaGated, WATER_SAMPLE_STEP_M, crossingAt, crossingReachM, crossingsOnSegment,
} from "./water.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SK = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));

const feat = (id) => SK.features.find((f) => f.id === id);

test("the record still carries the shapes ruling 4 requires (fixture guard)", () => {
  // If this fails the oracle is not wrong — the record moved, and the corpus
  // below is describing a world that no longer exists. Fail loudly here first.
  const ch = feat("the-main-channel");
  assert.ok(Array.isArray(ch?.centerline_m) && ch.centerline_m.length > 2, "channel has a polyline");
  assert.ok(ch.centerline_m.every((p) => Number.isFinite(p.w_m)), "every channel point carries w_m");
  const lake = feat("the-lochan");
  assert.ok(Number.isFinite(lake?.rx_m) && Number.isFinite(lake?.ry_m), "the lochan is a true ellipse");
  assert.equal(waterFeatures(SK).length, 5, "five inland water bodies: channel, reach, inlet, two lakes");
});

test("a lake is an ellipse, not its bounding box", () => {
  const l = feat("the-lochan"); // center 2575,-1160 · rx 300 · ry 210
  assert.equal(waterAt(l.center_m, SK), "the-lochan", "the centre is water");
  // On-axis, just inside each radius
  assert.equal(waterAt({ x: l.center_m.x + 295, y: l.center_m.y }, SK), "the-lochan");
  assert.equal(waterAt({ x: l.center_m.x, y: l.center_m.y + 205 }, SK), "the-lochan");
  // Just outside each radius
  assert.equal(waterAt({ x: l.center_m.x + 305, y: l.center_m.y }, SK), null);
  assert.equal(waterAt({ x: l.center_m.x, y: l.center_m.y + 215 }, SK), null);
  // THE DISCRIMINATING CASE: the bbox corner is dry ground. A rectangle oracle
  // would call this water; the ellipse does not.
  assert.equal(waterAt({ x: l.center_m.x + 290, y: l.center_m.y + 200 }, SK), null,
    "the near-corner of the bounding box is NOT in the ellipse");
});

test("a centreline is a capsule chain with per-point width", () => {
  const ch = feat("the-main-channel");
  const p0 = ch.centerline_m[0];                       // -2295,-3900 · w 200
  assert.equal(waterAt({ x: p0.x, y: p0.y }, SK), "the-main-channel", "on the centreline");
  // Just inside / outside the half-width, perpendicular-ish at the first point
  assert.equal(waterAt({ x: p0.x, y: p0.y - 95 }, SK), "the-main-channel");
  assert.equal(waterAt({ x: p0.x, y: p0.y - 400 }, SK), null);
  // Width VARIES along the river: the widest point is far wider than the first.
  const widest = ch.centerline_m.reduce((a, b) => (b.w_m > a.w_m ? b : a));
  assert.ok(widest.w_m >= 400, "the channel really does widen (guards the fixture)");
  assert.equal(waterAt({ x: widest.x, y: widest.y }, SK), "the-main-channel");
  // A single mean width would misjudge one end or the other — this is why the
  // oracle interpolates rather than averaging.
  assert.notEqual(widest.w_m, p0.w_m, "widths differ, so averaging would be wrong somewhere");
});

test("round ends: past the last point is dry, beside it is wet", () => {
  const r = feat("the-still-reach");                   // round_end: true
  const last = r.centerline_m[r.centerline_m.length - 1];
  assert.equal(waterAt({ x: last.x, y: last.y }, SK), "the-still-reach", "the end point itself");
  assert.equal(waterAt({ x: last.x, y: last.y + (last.w_m / 2) - 5 }, SK), "the-still-reach", "within the cap");
  assert.equal(waterAt({ x: last.x + 5000, y: last.y }, SK), null, "well past the end is dry");
});

test("segmentCrossesWater catches a leg over the channel and names it", () => {
  const ch = feat("the-main-channel");
  const mid = ch.centerline_m[Math.floor(ch.centerline_m.length / 2)];
  const a = { x: mid.x - 3000, y: mid.y };
  const b = { x: mid.x + 3000, y: mid.y };
  const hit = segmentCrossesWater(a, b, SK);
  assert.ok(hit, "the leg is refused");
  assert.equal(hit.feature, "the-main-channel", "the bounce can NAME the water");
  assert.ok(Number.isFinite(hit.at.x) && Number.isFinite(hit.at.y), "and where it hit");
});

test("a dry leg is not refused, and endpoints are always sampled", () => {
  // A short leg entirely on dry ground far from any inland water.
  const dry = { x: 20000, y: 20000 };
  assert.equal(waterAt(dry, SK), null, "fixture ground really is dry");
  assert.equal(segmentCrossesWater(dry, { x: dry.x + 10, y: dry.y + 10 }, SK), null);
  // A leg SHORTER than one sample step that starts in water is still caught,
  // because both endpoints are sampled unconditionally.
  const l = feat("the-lochan");
  const inWater = { x: l.center_m.x, y: l.center_m.y };
  const hit = segmentCrossesWater(inWater, { x: inWater.x + 1, y: inWater.y + 1 }, SK);
  assert.ok(hit && hit.feature === "the-lochan", "a 1.4 m leg inside a lake is refused");
});

test("the sample step cannot miss the narrowest inland water", () => {
  const widths = waterFeatures(SK)
    .flatMap((f) => (f.centerline_m ?? []).map((p) => p.w_m))
    .filter(Number.isFinite);
  const narrowest = Math.min(...widths);
  assert.ok(narrowest / WATER_SAMPLE_STEP_M >= 3,
    `narrowest inland water ${narrowest}m must be several samples wide at ${WATER_SAMPLE_STEP_M}m`);
});

test("the sea is NOT gated, and says so", () => {
  assert.equal(seaGated(), false);
  const sea = feat("the-sea");
  assert.ok(sea && !sea.centerline_m && !sea.center_m, "the sea genuinely has no edge geometry");
  // Far out where the sea is, the oracle reports dry — the named v1 exception.
  assert.equal(waterAt({ x: -40000, y: 40000 }, SK), null,
    "v1 gates inland water only; walking into the sea is possible and named");
});

test("crossings are found by kind, and the nearest is named with a distance", () => {
  const cs = crossings(SK);
  const ids = cs.map((c) => c.id);
  assert.ok(ids.includes("blackwater-bend-footbridge"), "the footbridge is a crossing");
  assert.ok(ids.includes("blackwater-bend-stone-path"), "the stepping stones are a crossing");
  assert.ok(cs.every((c) => Number.isFinite(c.at.x) && Number.isFinite(c.at.y)),
    "every crossing has a point to walk to (the stone path uses its midpoint)");
  const near = nearestCrossing({ x: 600, y: 3100 }, SK);
  assert.equal(near.id, "blackwater-bend-footbridge", "nearest to Blackwater Bend is the footbridge");
  assert.ok(near.distM >= 0);
});

// ── crossings are how you get over ───────────────────────────────────────────
// These exist because the draft's first cut gated water with no exemption at
// all, which made the bounce's own advice impossible to follow: the bridge point
// itself reads as water, so you could neither reach a crossing nor walk over one.
// Water being an obstacle (ruling 4) is not water being impassable.

test("a crossing exempts the water it stands on — you can walk over a bridge", () => {
  const bridge = crossings(SK).find((c) => c.kind === "narrow-footbridge");
  assert.ok(bridge, "the record has a footbridge");
  // the bridge point sits IN the water — that is exactly why the exemption is needed
  assert.ok(waterAt(bridge.at, SK), "the footbridge stands in the channel");
  assert.equal(crossingAt(bridge.at, SK), bridge.id, "and standing on it is exempt");

  // a leg aimed through the bridge crosses, and the answer names the bridge
  const a = { x: bridge.at.x, y: bridge.at.y - 400 }, b = { x: bridge.at.x, y: bridge.at.y + 400 };
  assert.equal(segmentCrossesWater(a, b, SK), null, "a leg through the crossing is permitted");
  assert.deepEqual(crossingsOnSegment(a, b, SK), [bridge.id], "and it reports which crossing carried it");
});

test("the exemption does NOT open the water generally — the control", () => {
  // The same manoeuvre, on the same channel, far from any crossing: still refused.
  // Without this the previous test would pass just as well on a broken gate.
  const channel = waterFeatures(SK).find((f) => f.id === "the-main-channel");
  const cs = crossings(SK);
  let far = null;
  for (const p of channel.centerline_m) {
    const d = Math.min(...cs.map((c) => Math.hypot(p.x - c.at.x, p.y - c.at.y)));
    if (!far || d > far.d) far = { d, p };
  }
  assert.ok(far.d > 2000, `the control point should be well clear of any crossing (is ${Math.round(far.d)} m)`);
  const a = { x: far.p.x, y: far.p.y - far.p.w_m }, b = { x: far.p.x, y: far.p.y + far.p.w_m };
  const hit = segmentCrossesWater(a, b, SK);
  assert.ok(hit, "open channel is still refused");
  assert.equal(hit.feature, "the-main-channel");
  assert.deepEqual(crossingsOnSegment(a, b, SK), [], "and no crossing is claimed");
});

test("a crossing reaches ACROSS its water, not merely onto it", () => {
  // The crossings in the record are not centred in the water: the footbridge sits
  // ~228 m off the spine of a 470 m channel. A reach of only the half-width would
  // cover the near bank and stop short of the far one.
  const bridge = crossings(SK).find((c) => c.kind === "narrow-footbridge");
  const channel = waterFeatures(SK).find((f) => f.id === "the-main-channel");
  let nearest = null;
  for (const p of channel.centerline_m) {
    const d = Math.hypot(p.x - bridge.at.x, p.y - bridge.at.y);
    if (!nearest || d < nearest.d) nearest = { d, p };
  }
  const reach = crossingReachM(bridge, SK);
  assert.ok(reach >= nearest.p.w_m / 2 + nearest.d,
    `reach ${Math.round(reach)} m must span from the crossing to the far bank ` +
    `(${Math.round(nearest.d)} m off-spine + ${nearest.p.w_m / 2} m half-width)`);
});

test("a crossing that stands on dry land keeps a modest reach", () => {
  // The stepping-stone path is recorded on dry ground; it must not inherit some
  // other water's width and silently open a channel it has nothing to do with.
  const stone = crossings(SK).find((c) => c.kind === "stepping-stone");
  if (!stone) return; // record-dependent; the guard above covers the wet case
  if (waterAt(stone.at, SK)) return;
  assert.ok(crossingReachM(stone, SK) <= 100, "a dry crossing does not claim a river's span");
});
