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
import { polygonOf, polygonBBox, ringMatchesClaim, rect, rectInsideRing, ringsDisjoint, marksContain } from "./geometry.mjs";

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


// ── FALSIFIER (c): THE RINGS TILE ────────────────────────────────────────────
// The founder, 2026-08-24: "the issue is the regions are still overlapping lol,
// like lanternseed and town centre. because whatever that house on the bottom
// left corner is is clearly geometrically in the town centre."
//
// The first commit took region-on-region overlap from 495,875 m2 to 74,950 m2
// and zeroed four pairs; ONE pair survived, and this is the law that ends it.
// It asks all sixty-six pairs rather than the pairs anyone has noticed, because
// a law that only holds where someone looked is not a law — and because the
// bend that mints an overlap can be planted by any future resident arriving
// anywhere.
//
// Asked as DISJOINTNESS, not as an area under some tolerance: two rings either
// share ground or they do not. `ringsDisjoint` is geometry.mjs's, the same
// primitive the generator enforces with, so this cannot pass by grading the
// record against a softer definition than the one that produced it.
test("THE DISJOINT LAW: no two region rings share any ground, across every pair", () => {
  const rings = RINGED.map((slug) => ({ slug, ring: polygonOf(bySlug(slug)) }));
  const overlaps = [];
  let pairs = 0;
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      pairs++;
      if (!ringsDisjoint(rings[i].ring, rings[j].ring)) overlaps.push(`${rings[i].slug} x ${rings[j].slug}`);
    }
  }
  assert.equal(pairs, 66, "twelve rings make sixty-six pairs — if this number drops, the roster shrank and the law got easier");
  assert.deepEqual(overlaps, [], "a region standing on another region's ground is the overlap ruling unrelitigated");
});

// ── FALSIFIER (d): the ground goes to whoever lives on it ────────────────────
// The disjoint law above says the rings do not overlap; it does not say the cut
// went the right way. This does. The Town Centre receded off the Lanternseed
// Gardens rather than the other way round, and the reason is in the record: the
// shared ground had the Gardens' own residents standing on it.
//
// THE HOUSE THE FOUNDER WAS POINTING AT. His words were "whatever that house on
// the bottom left corner is" — it is illuminator's looking room, at (503,-302),
// which stood inside BOTH rings. (Not sable's crooked gate, which the first
// commit's bend already resolved cleanly: sable is at (528,-1502), inside the
// Gardens and nowhere near the Centre.) These are named so that a later reader
// re-deriving the seam knows which houses decided it.
test("THE SEAM: the shared ground went to the Gardens, because the Gardens' residents stand on it", () => {
  const centre = bySlug("the-town-centre"), gardens = bySlug("the-lanternseed-gardens");
  const C = polygonOf(centre), G = polygonOf(gardens);
  assert.ok(ringsDisjoint(C, G), "the pair that survived the first commit is settled");

  for (const id of ["illuminator/the-looking-room-parcel", "illuminator/the-looking-room", "rei/the-low-lanterns"]) {
    const m = byId.get(id);
    assert.ok(m, `${id} is in the record`);
    assert.ok(groundUnder(gardens.id).some((k) => k.id === id), `${id} stands in the Gardens' subtree`);
    assert.ok(rectInsideRing(G, rect(m)), `${id} stands inside the Gardens' ring — its own region holds it`);
    assert.equal(rectInsideRing(C, rect(m)), false, `${id} must NOT also stand inside the Town Centre — that was the overlap`);
  }
  // and the house the founder actually saw is where he saw it
  const looking = rect(byId.get("illuminator/the-looking-room"));
  assert.equal(Math.round(looking.x), 503, "the looking room has not been moved to resolve the seam — the ring moved, the house did not");
  assert.equal(Math.round(looking.y), -302);
});

// ── FALSIFIER (e): the Threshold's east flank is not spiky ───────────────────
// The founder, same breath: "I think threshold district can just be smoothed out
// a bit on the right side so it's not so spiky."
//
// "Spiky" measured rather than eyeballed: a notch is a vertex whose radius sits
// BELOW the straight line its two neighbours draw in (bearing, radius) space,
// and its depth is how far below. The terrace sweep left the east flank with
// notches 260 m deep — bearings that fell between two terraces took a near
// crossing while their neighbours took a far one. After smoothing the deepest is
// 68 m, and the ring carries five fewer vertices.
//
// The bound is 120 m: comfortably below what the flank had and comfortably above
// what it has, so this fails if the smoothing is removed and does not fail on
// the next resident's bend. The vertex cap is the same shape of statement.
test("SMOOTHED: the Threshold's east flank carries no deep notch, and fewer vertices than it did", () => {
  const t = bySlug("the-threshold-district");
  const ring = polygonOf(t);
  const c = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
  const wrap = (a) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const pol = ring.map((p) => ({ th: Math.atan2(p.y - c.y, p.x - c.x), r: Math.hypot(p.x - c.x, p.y - c.y) }));
  const east = (th) => Math.cos(th) > 0.30;

  let deepest = 0, where = null;
  for (let i = 0; i < pol.length; i++) {
    const v = pol[i], a = pol[(i - 1 + pol.length) % pol.length], b = pol[(i + 1) % pol.length];
    if (!east(v.th) || !east(a.th) || !east(b.th)) continue;
    const span = wrap(b.th - a.th);
    if (span <= 1e-9) continue;
    const u = wrap(v.th - a.th) / span;
    if (!(u > 0 && u < 1)) continue;
    const dip = (a.r + (b.r - a.r) * u) - v.r;
    if (dip > deepest) { deepest = dip; where = (v.th * 180 / Math.PI + 360) % 360; }
  }
  assert.ok(deepest < 120,
    `the east flank's deepest notch is ${deepest.toFixed(0)} m below its own chord${where === null ? "" : ` at bearing ${where.toFixed(0)}deg`} — it was 260 m before smoothing and must stay well under it`);
  assert.ok(ring.length <= 26, `${ring.length} vertices — the sweep left 29 and smoothing is supposed to take some away, not add`);
  assert.ok(ring.length >= 8, "…without flattening the district into a box");
});

// ── FALSIFIER (f): smoothing bought its shape with nobody else's ground ──────
// Two ways a flank can be smoothed dishonestly: by reaching into a neighbour,
// and by growing the claim. The first is covered by the disjoint law above. The
// second is this, and it is the one with teeth a reader would not guess: a
// region's at/extent IS its ring's bbox, a bound child's numbers are offsets
// from that centre, so ENLARGING a region moves its frame and every resident
// travels with it. Unclamped, this smoothing widened the Threshold 228 m and
// carried sixty marks 72.5 m east — tidying a coastline by relocating limen's
// terraces, hal's green lamp house, iris, nyx, wren and the rest.
//
// So the Threshold's claim must be exactly what the terrace sweep gives it. The
// numbers are the record's own from before this round.
test("THE FRAME DID NOT MOVE: smoothing left the Threshold's claim exactly where it was", () => {
  const t = bySlug("the-threshold-district");
  assert.deepEqual(rect(t), { x: 1446.5, y: 1806, w: 1649, h: 2292 },
    "the Threshold's claim is unchanged by the smoothing — a boundary may be redrawn, but redrawing it must not walk fifty houses across the map");
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
