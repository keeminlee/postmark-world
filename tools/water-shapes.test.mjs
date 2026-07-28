#!/usr/bin/env node
// water-shapes.test.mjs — the water marks carry TRUE SHAPE, and containment honors it.
//   node --test tools/water-shapes.test.mjs
//
// Two things are guarded here, both of which were silently wrong before this pass:
//
//  1. A ring TOO BIG TO RASTERIZE must still be answered by the ring. marksContain
//     rasterizes at 5 m and gives up past a cell cap, and it used to fall back to
//     the outer's bounding RECT — so the main channel (3873 x 10425 m, ~1.6M cells)
//     had every containment question answered by its rectangle. Giving the water a
//     true shape changed nothing at all until that fallback was replaced with an
//     analytic point-in-ring test. A silent degradation to the exact wrong answer.
//
//  2. The generated rings must agree with the water ORACLE. The ring is a drawing
//     of waterAt's region; if the drawing and the gate disagree, the record and the
//     mechanic have two different ideas of where the water is.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marksContain, polygonOf, coverage, ringMatchesClaim } from "./geometry.mjs";
import { placementParent } from "./marks-fold.mjs";
import { waterFeatures, waterAt, seaFeature } from "./water.mjs";
import { pointInPolygon } from "./geometry.mjs";

const WORLD = join(dirname(fileURLToPath(import.meta.url)), "..", "WORLD");
const world = JSON.parse(readFileSync(join(WORLD, "world-state.json"), "utf8"));
const skeleton = JSON.parse(readFileSync(join(WORLD, "skeleton.json"), "utf8"));
const mark = (id) => world.marks.find((m) => m.id === id);

test("every inland water feature's mark carries a ring (fixture guard)", () => {
  // If this fails the generator was not run, or the record moved — fail loudly here
  // before the containment tests describe a world that no longer exists.
  for (const f of waterFeatures(skeleton)) {
    const m = world.marks.find((k) => k.feature === f.id);
    assert.ok(m, `${f.id} has a mark`);
    const ring = polygonOf(m);
    assert.ok(ring && ring.length >= 3, `${m.id} carries a points ring`);
    assert.ok(ringMatchesClaim(m), `${m.id}'s ring matches its at/extent claim (the honesty gate)`);
  }
});

test("the channel's ring is too big to rasterize — the case that used to degrade", () => {
  const ch = mark("the-town/the-main-channel");
  assert.ok(polygonOf(ch), "the channel has a ring");
  assert.equal(coverage(ch), null,
    "the channel is past the rasterizer's cell cap — this is the precondition for the bug, " +
    "so if it ever rasterizes this test is no longer guarding anything");
});

test("containment honors the ring even when it cannot be rasterized", () => {
  // The town centre is a 2000 x 1500 district straddling the river. Its bounding
  // rect sits inside the channel's bounding rect, so the OLD rect fallback called
  // it contained; the ring is a ~470 m ribbon and cannot contain it.
  const ch = mark("the-town/the-main-channel");
  const tc = mark("the-town/the-town-centre");
  assert.ok(tc.extent.w > 1000 && tc.extent.h > 1000, "the town centre is district-scale");
  assert.equal(marksContain(ch, tc), false,
    "a 2000x1500 district is not inside a river — if this is true, the rect fallback is back");

  // and the control: something genuinely inside the ribbon IS still contained.
  // The probe sits on a CENTRELINE point read from the skeleton — a ring vertex
  // would be on the boundary, where either answer is defensible.
  const spine = waterFeatures(skeleton).find((f) => f.id === "the-main-channel").centerline_m[10];
  const inside = { id: "t/probe", kind: "sited", at: { x: spine.x, y: spine.y }, extent: { w: 20, h: 20 } };
  assert.ok(waterAt(inside.at, skeleton), "the probe point is on the water (record check)");
  assert.equal(marksContain(ch, inside), true, "a small mark inside the ribbon is contained");
});

test("the channel is no longer the tree parent of the town's dry land", () => {
  // The whole point of the pass. These eight were its children under the rect.
  const ch = mark("the-town/the-main-channel");
  for (const id of ["the-town/the-town-centre", "caelum/evermoon", "spar/the-doubled-coast",
    "the-town/blackwater-bend-grove", "the-town/blackwater-bend-stone-path",
    "the-town/the-harbor-reach", "sol-of-garrison/the-protected-grove"]) {
    const m = mark(id);
    if (!m) continue; // record-dependent; the ones present must all be out
    assert.equal(marksContain(ch, m), false, `${id} is not inside the channel`);
  }
});

test("each generated ring agrees with the water oracle, both directions", () => {
  // over-claim: a point inside the ring must be water at all (any body — the water
  // features genuinely overlap, so identity is the wrong question).
  // under-claim: a point the oracle attributes to THIS feature must be in the ring.
  const GRID = 25, TOL = 0.02;
  for (const f of waterFeatures(skeleton)) {
    const m = world.marks.find((k) => k.feature === f.id);
    const ring = polygonOf(m);
    const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
    let inRing = 0, dry = 0, mine = 0, missed = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += GRID)
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += GRID) {
        const hereRing = pointInPolygon(x, y, ring);
        const hereWater = waterAt({ x, y }, skeleton);
        if (hereRing) { inRing++; if (!hereWater) dry++; }
        if (hereWater === f.id) { mine++; if (!hereRing) missed++; }
      }
    assert.ok(inRing > 0, `${f.id}'s ring encloses area`);
    assert.ok(dry / inRing <= TOL, `${f.id} over-claims ${(100 * dry / inRing).toFixed(1)}% dry land (max ${100 * TOL}%)`);
    if (mine > 0)
      assert.ok(missed / mine <= TOL, `${f.id} under-claims ${(100 * missed / mine).toFixed(1)}% of its own water (max ${100 * TOL}%)`);
  }
});

test("the silhouette span reads the ring and depends on the view direction", () => {
  // The engine's fine-shape silhouette path had never run: no record carried a ring.
  // Extent cannot vary with bearing; a silhouette must.
  const ch = mark("the-town/the-main-channel");
  const span = (dx, dy) => {
    const len = Math.hypot(dx, dy), px = -dy / len, py = dx / len;
    const pr = polygonOf(ch).map((p) => p.x * px + p.y * py);
    return Math.max(...pr) - Math.min(...pr);
  };
  const across = span(1, 0), along = span(0, 1);
  assert.notEqual(Math.round(across), Math.round(along),
    "a river seen along its length subtends a different width than seen across it");
  assert.ok(along < across, "the channel runs north-south, so viewing along it is the narrower span");
});

// ── the sea (extracted from the atlas COASTLINE) ──────────────────────────────

test("the sea is a real mark carrying the atlas coastline", () => {
  const sea = mark("the-town/the-sea");
  assert.ok(sea, "the sea exists as a mark at last — nothing could be 'in the sea' before");
  assert.equal(sea.tier, "constitution");
  assert.equal(sea.by, "the-town");
  assert.equal(sea.feature, "the-sea");
  const ring = polygonOf(sea);
  assert.ok(ring && ring.length >= 20, "it carries the coastline ring");
  assert.ok(ringMatchesClaim(sea), "and the ring matches its claim (the honesty gate)");
});

test("the mark's ring and the skeleton's ring are the SAME geometry", () => {
  // One source: world-terrain-gen extracts the coast into the skeleton, and the
  // shape step copies that onto the mark. If these ever diverge, the record and the
  // oracle disagree about where the sea is — which is the whole failure mode the
  // "generated, never hand-typed" rule exists to prevent.
  const sea = mark("the-town/the-sea");
  const feature = seaFeature(skeleton);
  assert.ok(feature, "the skeleton's sea carries ring_m");
  assert.deepEqual(polygonOf(sea).map((p) => [p.x, p.y]), feature.ring_m.map((p) => [p.x, p.y]),
    "mark ring === skeleton ring, point for point");
});

test("NOTHING is filed under the sea — the largest claim adopts only orphans", () => {
  // The brief said to STOP rather than re-home a resident into the water. Nothing
  // needed re-homing, and the reason is structural rather than lucky:
  // placementParent takes the SMALLEST containing mark, and the sea is the largest
  // claim on the map, so it can only ever be chosen for something that nothing else
  // contains. Orion's seaward marks (a shingle beach, a tidal race, eelgrass coves)
  // sit inside the sea's ring and stay under his own reach, which is ~12x smaller.
  const adopted = world.marks.filter((m) => (m.kind === "sited" || m.kind === "parcel") && m.at
    && placementParent(m, world.marks) === "the-town/the-sea");
  assert.deepEqual(adopted.map((m) => m.id), [], "no mark takes the sea as its tree parent");

  const sea = mark("the-town/the-sea");
  for (const id of ["orion-by-the-fire/eelgrass-coves", "orion-by-the-fire/the-shingle-beach"]) {
    const m = mark(id);
    if (!m) continue;
    assert.equal(marksContain(sea, m), true, `${id} IS geometrically inside the sea (overlap is real)`);
    assert.notEqual(placementParent(m, world.marks), "the-town/the-sea", `${id} still files under its own reach`);
  }
});

test("no resident's HOME is inside the sea", () => {
  // The brief's stop condition, kept as a standing guard: if a future coastline edit
  // ever puts a parcel in the water, this fails instead of silently drowning someone.
  const sea = mark("the-town/the-sea");
  const ring = polygonOf(sea);
  for (const p of world.marks.filter((m) => m.kind === "parcel")) {
    assert.equal(pointInPolygon(p.at.x, p.at.y, ring), false, `${p.id} is not in the sea`);
    assert.equal(marksContain(sea, p), false, `${p.id} is not swallowed by the sea`);
  }
});

test("the sea is at the ROOT — it is top-level, not inside anything", () => {
  const sea = mark("the-town/the-sea");
  assert.equal(placementParent(sea, world.marks), null);
});
