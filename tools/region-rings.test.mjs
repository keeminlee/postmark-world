#!/usr/bin/env node
// region-rings.test.mjs — the falsifiers for the region polygons, run against
// THE REAL RECORD (WORLD/marks), not a fixture.
//
// The order these assert (Keemin, founder, two rulings):
//   2026-08-21  "region overlap ruling has been relitigated ad nauseum.
//                polygons. now."
//   2026-08-22  "use polygons to represent the regions so they fit based on the
//                atlas, and give the water marks svgs that match… feel free to
//                tweak the polygons a bit if it would otherwise exclude an
//                existing resident of that region."
//   and on the named case: "I'd love to have sable in the gardens… I think we
//                can draw the polygon to fit around him and include him still."
//
// The rings themselves are generated, never hand-typed — tools/region-rings-gen.mjs
// traces them from the atlas renderer's own wash paths. This file does not
// re-derive them (a second derivation is a second definition); it asserts the
// two laws the record must satisfy whatever produced them.
//
// Run: node --test tools/region-rings.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { polygonOf, polygonBBox, ringMatchesClaim, rect, rectInsideRing, marksContain } from "./geometry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const byId = new Map(marks.map((m) => [m.id, m]));
const bySlug = (slug) => marks.find((m) => m.slug === slug);

// THE ROSTER. tools/founding-act.mjs (town repo) names thirteen founding targets;
// twelve of them are regions the atlas draws a wash for, and those twelve get
// rings. The thirteenth, vermillion/the-pando-peak, does NOT: it is a `far: true`
// horizon object 135 km out (WORLD/skeleton.json far_features, decision 008 —
// "a horizon object, not heightfield ground"), the atlas washes no ground for it,
// and a ring would be a boundary nobody drew. liv + noe's the-carried-weight is
// founded but deliberately UNDRAWN pending the region-topology ruling (#1922),
// so it is not here either. Both exclusions are asserted below rather than left
// as a silence someone later reads as an oversight.
const RINGED = [
  "the-town-centre", "the-trueing-terrace", "the-lanternseed-gardens", "the-threshold-district",
  "the-long-run", "the-protected-grove", "the-doubled-coast", "aelyria", "the-reach",
  "the-east-window-district", "the-high-ground", "evermoon",
];

// Every water feature the skeleton surveys and the record claims as a mark. The
// founder's order names them in the same breath as the regions ("give the water
// marks svgs that match"), and they are held to the same claim-honesty gate.
const WATER = ["the-main-channel", "the-still-reach", "the-lochan", "the-garrison-lake", "blackwater-bend-inlet", "the-sea"];

const descendantsOf = (id) => marks.filter((m) => {
  const seen = new Set();
  let p = m._parentMarkId;
  while (p && !seen.has(p)) { if (p === id) return true; seen.add(p); p = byId.get(p)?._parentMarkId; }
  return false;
});
// the marks a region's ring must hold: everything under it that OCCUPIES ground.
// predicated/naming/class marks carry no geometry of their own (SCHEMA: "The
// predicate carries no geometry"), and a `far: true` horizon object is "exempt
// from the containment check by construction".
const groundUnder = (id) => descendantsOf(id).filter((m) => m.at && !m.far && (m.kind === "sited" || m.kind === "parcel"));

test("the record is live: every region on the roster is a mark, and it carries a ring", () => {
  assert.ok(marks.length >= 600, `the real tree, not a fixture (${marks.length} marks)`);
  for (const slug of RINGED) {
    const m = bySlug(slug);
    assert.ok(m, `${slug} is in WORLD/marks`);
    assert.ok(polygonOf(m), `${slug} carries a points: ring — the founder's order is "polygons. now."`);
  }
});

// ── FALSIFIER (a): the claim IS the ring's bbox ──────────────────────────────
// The law, verbatim from tools/mark-lint.mjs § 4b, which refuses any record that
// breaks it: "the points: ring's bounding box must equal the mark's at/extent
// claim — the claim IS the ring's bbox (SCHEMA v2)". And WORLD/marks/SCHEMA.md,
// on why the gate exists at all: "the lint validates containment against the
// polygon's bounding box only, and the fold/engine treat the mark as its `at`/
// `extent` (which must equal that bounding box)" — a coarse claim that did not
// equal the fine shape would be the record lying to every reader that only looks
// at `at`/`extent`, which is most of them.
test("CLAIM HONESTY: every region ring's bounding box IS that region's at/extent", () => {
  for (const slug of RINGED) {
    const m = bySlug(slug);
    const bb = polygonBBox(polygonOf(m)), r = rect(m);
    assert.ok(ringMatchesClaim(m), `${slug}: ring bbox [${bb.minx},${bb.miny}]..[${bb.maxx},${bb.maxy}] `
      + `must equal at(${r.x},${r.y}) extent(${r.w}x${r.h})`);
    // and the ring is a real shape, drawn rather than boxed: a rect traced as
    // four corners would pass the gate above while saying nothing new
    assert.ok(polygonOf(m).length >= 8, `${slug}: a ring of ${polygonOf(m).length} vertices is a box with opinions, not a drawn wash`);
    assert.ok(polygonOf(m).length <= 40, `${slug}: ${polygonOf(m).length} vertices is tracing noise, not fit`);
  }
});

test("CLAIM HONESTY holds for the water too — the svgs that match", () => {
  for (const slug of WATER) {
    const m = bySlug(slug);
    assert.ok(m, `${slug} is in WORLD/marks`);
    assert.ok(polygonOf(m), `${slug} carries a points: ring — the water is drawn, not boxed`);
    assert.ok(ringMatchesClaim(m), `${slug}: the claim IS the ring's bbox`);
  }
});

// ── FALSIFIER (b): a region holds its own residents ──────────────────────────
// The law, verbatim from WORLD/marks/SCHEMA.md: "Nesting is the only hand-drawn
// edge, and you cannot lie with it: a nested `sited` mark must be geometrically
// contained by its parent". MARKS.md says the same thing shorter: "You cannot
// lie with an edge." Before the rings, a region's claim was the bounding RECT of
// its drawn wash, and the rect held marks the wash never covered; the moment the
// wash itself becomes the claim, every one of those marks is either inside the
// drawing or the record is lying about where it stands. That is the whole reason
// the founder's order carries its own escape clause — "feel free to tweak the
// polygons a bit if it would otherwise exclude an existing resident of that
// region" — and this test is what says the tweaks were actually made.
test("INCLUDE THE RESIDENTS: every mark standing under a ringed region stands inside its ring", () => {
  const failures = [];
  for (const slug of RINGED) {
    const region = bySlug(slug);
    const ring = polygonOf(region);
    const kids = groundUnder(region.id);
    assert.ok(kids.length > 0, `${slug} has marks under it (or this assertion is vacuous)`);
    for (const k of kids) if (!rectInsideRing(ring, rect(k))) failures.push(`${k.id} (${k.by}) stands outside ${region.id}`);
  }
  assert.deepEqual(failures, [], "a region whose ring excludes its own residents is a region lying with its edge");
});

test("…and the record's own containment agrees, so the lint and the fold see it too", () => {
  const failures = [];
  for (const slug of RINGED) {
    const region = bySlug(slug);
    for (const k of groundUnder(region.id)) if (!marksContain(region, k)) failures.push(`${k.id} under ${region.id}`);
  }
  assert.deepEqual(failures, [], "marksContain must hold wherever rectInsideRing does — the two must not disagree");
});

// ── THE NAMED CASE ───────────────────────────────────────────────────────────
// The founder, on sable: "I'd love to have sable in the gardens… I think we can
// draw the polygon to fit around him and include him still." sable is a
// DIFFERENT HOUSEHOLD from rei, who founded the gardens — which is the whole
// point of the ask: the ring bends to hold a neighbour, not just its own author.
test("THE NAMED CASE: sable stands inside rei's lanternseed gardens, and the ring is what puts him there", () => {
  const gardens = bySlug("the-lanternseed-gardens");
  assert.equal(gardens.by, "rei", "the gardens are rei's founding");
  const ring = polygonOf(gardens);

  const parcel = byId.get("sable/the-house-at-the-crooked-gate-parcel");
  assert.ok(parcel, "sable's parcel is in the record");
  assert.equal(parcel.by, "sable", "…and it is sable's, not rei's — a neighbour on another household's ground");
  assert.ok(groundUnder(gardens.id).some((m) => m.id === parcel.id), "…standing in the gardens' subtree");
  assert.ok(rectInsideRing(ring, rect(parcel)), "…and wholly inside the gardens' ring");

  // the-bad-end-workshop, the mark sable was entering when the founder ruled
  // (WORLD/threshold-ledger.md, 2026-08-21T22:47Z): 6.5 x 4.5 m at the gardens
  // frame's {x:-760, y:-510}. It is not in the tree yet, so the ring is checked
  // against the ground it will stand on rather than against a record that would
  // make this assertion pass by being absent.
  const workshop = { x: gardens.at.x - 760, y: gardens.at.y - 510, w: 6.5, h: 4.5 };
  assert.ok(rectInsideRing(ring, workshop),
    `the-bad-end-workshop's ground (${workshop.x},${workshop.y}) must be inside the gardens — "I'd love to have sable in the gardens"`);
});

// ── the two regions that get no ring, and why ────────────────────────────────
test("the undrawn stay undrawn: Pando is a horizon object and the carried weight awaits its ruling", () => {
  const pando = bySlug("pando-peak");
  assert.ok(pando, "Pando is in the record");
  assert.equal(String(pando.far), "true", "…as a far: true horizon object (decision 008), not ground the atlas washes");
  assert.equal(polygonOf(pando), null, "…so it carries no ring; a mountain 135 km out has no drawn boundary to trace");

  assert.equal(marks.some((m) => m.slug === "the-carried-weight"), false,
    "the-carried-weight is founded but deliberately undrawn — its topology is #1922's ruling to make, not this lane's");
});
