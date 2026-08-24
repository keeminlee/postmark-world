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
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { overlapArea, polygonOf, polygonBBox, ringMatchesClaim, rect, rectInsideRing, ringsDisjoint } from "./geometry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const byId = new Map(marks.map((m) => [m.id, m]));
const bySlug = (slug) => marks.find((m) => m.slug === slug);

// The generated heads-up list, read as an ARTIFACT rather than recomputed here.
// Recomputing it would make these tests agree with themselves: the point is that
// what the generator WROTE matches what the record says, so the file on disk is
// the thing under test.
const OUTSIDERS = JSON.parse(readFileSync(join(ROOT, "WORLD/region-outsiders.json"), "utf8"));

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
// THE SAME SCOPE THE GENERATOR USES, and it has to be: the generator's list and
// this file's biconditional must be about the same set of marks, or a mark can
// be listed by one and invisible to the other. That is not hypothetical — the
// first run of these tests found exactly that gap, with the cathedral canopy and
// the alder listed by the generator and unseen here. The rule is the record's:
// a mark occupies ground if it has a position, is not a far horizon object, and
// is not one of the kinds that carry no geometry of their own (SCHEMA: "The
// predicate carries no geometry").
const OCCUPIES_GROUND = (m) => !!m.at && !m.far && m.kind !== "predicated" && m.kind !== "naming" && m.kind !== "class";
const groundUnder = (id) => descendantsOf(id).filter(OCCUPIES_GROUND);

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

// ── FALSIFIER (b): contained, or on the list — and the list is exact ─────────
//
// THE PIVOT (the founder, 2026-08-24): "the regions just get drawn to match
// their atlas renders. And then we can just make a Town Bulletin announcement
// with a list of names of every resident that is not within the region's bounds
// anymore as a heads up." So the old law — every resident inside their ring,
// bend the ring until they are — is retired, knowingly, along with the 08-22
// sable word it was written for.
//
// What replaces it is not weaker, it is a BICONDITIONAL. "Some marks are
// outside now" would be a licence; this says every mark under a ringed region
// is EITHER inside its ring OR named on the generated list, never neither and
// never both. Neither would be a resident who lost their ground with nobody
// told; both would be a list that cries wolf and trains its readers to ignore
// it. The list is the town's promise to the people it displaces, so it has to
// be exact in both directions.
test("CONTAINED OR LISTED: every mark under a region is one or the other, never neither, never both", () => {
  const listed = new Set(OUTSIDERS.rows.map((r) => r.mark));
  const unlisted = [], doubled = [];
  for (const slug of RINGED) {
    const region = bySlug(slug);
    const ring = polygonOf(region);
    const kids = groundUnder(region.id);
    assert.ok(kids.length > 0, `${slug} has marks under it (or this assertion is vacuous)`);
    for (const k of kids) {
      const inside = rectInsideRing(ring, rect(k));
      if (!inside && !listed.has(k.id)) unlisted.push(`${k.id} (${k.by}) stands outside ${region.id} and nobody is telling them`);
      if (inside && listed.has(k.id)) doubled.push(`${k.id} is inside ${region.id} and on the heads-up list anyway`);
    }
  }
  assert.deepEqual(unlisted, [], "a resident whose ground fell outside their region, with no notice generated, is the town moving a boundary under someone in silence");
  assert.deepEqual(doubled, [], "a list that names people who are fine is a list nobody will read the next time");
});

test("…and the list names nothing that is not a mark under a ringed region", () => {
  // A row names its region by ID (`<by>/<slug>`), not by slug — the first draft
  // of this check looked it up the wrong way and called every row a stray, which
  // is the failure mode a probe should have: loud and obviously about itself.
  const ringedIds = new Set(RINGED.map((slug) => bySlug(slug).id));
  const strays = OUTSIDERS.rows.filter((r) => {
    const m = byId.get(r.mark);
    if (!m || !ringedIds.has(r.region)) return true;
    return !groundUnder(r.region).some((k) => k.id === r.mark);
  });
  assert.deepEqual(strays.map((r) => r.mark), [], "every row must be a real mark standing under the region the row names");
  assert.ok(OUTSIDERS.rows.length > 0, "…and the list is not empty, or everything above is vacuous");
  assert.equal(OUTSIDERS.count, OUTSIDERS.rows.length, "the artifact's own count must match its rows");
});

// ── THE NAMED CASE, INVERTED ─────────────────────────────────────────────────
// It used to read "sable stands inside rei's lanternseed gardens, and the ring
// is what puts him there" — the 08-22 ruling, "I'd love to have sable in the
// gardens… I think we can draw the polygon to fit around him and include him
// still." The founder superseded that tonight in favour of the atlas trace, and
// this is the same case held to the new law rather than quietly deleted: sable
// is the KNOWN displaced resident, so he must appear on the list by name. If
// the pure trace somehow still contains him, this says so, and that is a
// finding worth reading rather than a test worth passing.
test("THE NAMED CASE: sable is on the heads-up list, by name, with his ground unmoved", () => {
  const gardens = bySlug("the-lanternseed-gardens");
  const parcel = byId.get("sable/the-house-at-the-crooked-gate-parcel");
  assert.ok(parcel, "sable's parcel is in the record");
  assert.equal(parcel.by, "sable");
  assert.ok(groundUnder(gardens.id).some((m) => m.id === parcel.id), "…still standing in the gardens' subtree — the tree did not change, the boundary did");

  const row = OUTSIDERS.rows.find((r) => r.mark === parcel.id);
  assert.ok(row, "sable's parcel must be named on the outsider list — he is the known case the old bend was written for");
  assert.equal(row.resident, "sable");
  assert.equal(row.region, gardens.id);
  // The ground is exactly where sable put it. The whole promise of the pivot is
  // that nothing moved except the line on the map.
  assert.deepEqual({ x: rect(parcel).x, y: rect(parcel).y }, { x: row.at.x, y: row.at.y },
    "the list must report the ground where it actually stands, to the half-metre the record keeps");
  assert.equal(rectInsideRing(polygonOf(gardens), rect(parcel)), false, "…and he is genuinely outside the traced ring, which is why he is listed");
});

// ── FALSIFIER (c): THE RINGS TILE ────────────────────────────────────────────
// The founder, 2026-08-24: "the issue is the regions are still overlapping lol,
// like lanternseed and town centre."
//
// Asked as DISJOINTNESS, not as an area under some tolerance: two rings either
// share ground or they do not. `ringsDisjoint` is geometry.mjs's, the same
// primitive the generator enforces with, so this cannot pass by grading the
// record against a softer definition than the one that produced it. All
// sixty-six pairs, not the pairs anyone happened to notice.
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

// ── FALSIFIER (d): smoothed, and smoothed everywhere ─────────────────────────
// "could we just generally smooth out the polygons for the regions (lanternseed
// included)". Measured rather than eyeballed, and measured on EVERY ring: a
// spike is a vertex whose radius disagrees with both its neighbours in the same
// direction, and its size is how far it sits from the line they draw. The
// terrace sweep left the Threshold with a 260 m spike; the traced washes carry
// smaller ones everywhere.
//
// The bound is 190 m, and both numbers behind it are measured. The TRACE ALONE
// reaches 320 m (the Threshold's sawtooth), with six of the twelve rings over
// 180 m; after smoothing the worst ring in the town is 174 m. So 190 sits above
// what the pass achieves and well below what it removes: loose enough that a
// wash's real bay is not a failure — the point was never to convexify the map —
// and tight enough that turning the pass off goes red on six rings at once.
test("SMOOTHED: no ring carries a lone spike, and the Threshold's sawtooth is gone", () => {
  const worst = [];
  for (const slug of RINGED) {
    const ring = polygonOf(bySlug(slug));
    let deepest = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i - 1 + ring.length) % ring.length], v = ring[i], b = ring[(i + 1) % ring.length];
      const ex = b.x - a.x, ey = b.y - a.y;
      const len2 = ex * ex + ey * ey;
      if (len2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((v.x - a.x) * ex + (v.y - a.y) * ey) / len2));
      const d = Math.hypot(v.x - (a.x + t * ex), v.y - (a.y + t * ey));
      if (d > deepest) deepest = d;
    }
    worst.push({ slug, deepest: Math.round(deepest), vertices: ring.length });
  }
  const over = worst.filter((w) => w.deepest > 190);
  assert.deepEqual(over, [], `every ring must be free of lone spikes (trace alone: 320 m worst) — worst per ring: ${worst.map((w) => `${w.slug} ${w.deepest}m`).join(", ")}`);
  // and the count came down where it was highest
  const threshold = worst.find((w) => w.slug === "the-threshold-district");
  assert.ok(threshold.vertices <= 20, `the Threshold carries ${threshold.vertices} vertices — the sweep left 29 and smoothing is supposed to take some away`);
  for (const w of worst) assert.ok(w.vertices >= 8, `${w.slug}: a ring of ${w.vertices} vertices is a box with opinions, not a drawn wash`);
});

// ── FALSIFIER (e): the caution the founder asked the list to carry ───────────
// "just taking care to not declare where someone else's parcel already
// overlaps." A resident reading the list is about to choose new coordinates, so
// the one thing the list must not do is send them onto ground another household
// has already claimed. The field is computed per row; this holds it honest in
// both directions against the record's own parcels.
test("THE CAUTION: every row's overlap flag matches the record's parcels, both ways", () => {
  const parcels = marks.filter((m) => m.kind === "parcel" && m.at && !m.far);
  const wrong = [];
  for (const row of OUTSIDERS.rows) {
    const m = byId.get(row.mark);
    if (!m) continue;
    const truth = parcels
      .filter((p) => p.id !== m.id && String(p.by) !== String(m.by) && overlapArea(rect(p), rect(m)) > 0)
      .map((p) => p.id).sort();
    const said = [...row.overlaps_another_parcel].sort();
    if (JSON.stringify(truth) !== JSON.stringify(said)) wrong.push(`${row.mark}: says [${said}], record says [${truth}]`);
  }
  assert.deepEqual(wrong, [], "the don't-build-here caution must be exactly what the record says, or it is worse than no caution");
  assert.ok(OUTSIDERS.rows.some((r) => r.overlaps_another_parcel.length > 0),
    "…and at least one row actually carries the flag, or this assertion has never been exercised");
});


// ── FALSIFIER (f): the declared-displacement exception, both ways ────────────
//
// THE RULING (Keemin, 2026-08-24): "the outsider list IS a declared act… the
// town already holds the shape for exactly this in REHOMED_BY_DECLARED_ACT —
// displaced by a declared act is not a containment lie."
//
// An exception to a gate is the most dangerous thing to add to a gate, so it is
// held from both sides. EXACT: only the marks the generated list names are
// forgiven, and the forgiveness covers only the tightest-container clause. SELF-
// RETIRING: the list is recomputed from the rings every generation, so a
// resident who moves their ground back inside their region drops off it, and the
// exemption dies with the row — nobody has to remember to revoke it.
//
// This runs the real lint, in a scratch copy of the record, three ways.
test("THE EXCEPTION: listed marks are forgiven, unlisted ones are still refused, and it retires itself", () => {
  const scratch = mkdtempSync(join(tmpdir(), "pm-lint-exc-"));
  cpSync(join(ROOT, "WORLD"), join(scratch, "WORLD"), { recursive: true });
  cpSync(join(ROOT, "tools"), join(scratch, "tools"), { recursive: true });
  const listPath = join(scratch, "WORLD/region-outsiders.json");
  const list = JSON.parse(readFileSync(listPath, "utf8"));
  const runLint = () => {
    const r = spawnSync(process.execPath, [join(scratch, "tools/mark-lint.mjs")], { encoding: "utf8" });
    const m = /(\d+) error\(s\), (\d+) re-home\(s\)/.exec(r.stdout + r.stderr);
    assert.ok(m, `the lint must report a count (got: ${(r.stdout + r.stderr).slice(-300)})`);
    return { errors: Number(m[1]), rehomes: Number(m[2]) };
  };

  // 1 — as generated: the list forgives, and the gate is back to its own
  //     pre-existing errors with nothing pending.
  const asIs = runLint();
  assert.equal(asIs.rehomes, 0, "a displaced mark must not stand as a pending re-home — the founder's ruling is that the resident chooses, not the sweep");

  // 2 — take ONE row away and the gate refuses that mark again. This is the
  //     whole exactness claim: the forgiveness comes from the list, not from
  //     something softer that happens to be true of every outsider.
  const victim = list.rows.find((r) => r.mark.startsWith("sable/")) ?? list.rows[0];
  const without = { ...list, rows: list.rows.filter((r) => r.mark !== victim.mark) };
  writeFileSync(listPath, JSON.stringify(without, null, 2));
  const dropped = runLint();
  assert.ok(dropped.errors + dropped.rehomes > asIs.errors + asIs.rehomes,
    `dropping ${victim.mark} from the list must bring the gate back down on it — an exception that survives its own receipt is not an exception, it is a hole`);

  // 3 — SELF-RETIRING, stated as the thing that actually happens: a mark that
  //     has moved home is not written into the next list, and with the row gone
  //     the exemption is gone. Step 2 IS that mechanism, exercised — so this
  //     pins the other half: the exemption is keyed to the row and to nothing
  //     else, so it cannot outlive it.
  writeFileSync(listPath, JSON.stringify(list, null, 2));
  const restored = runLint();
  assert.deepEqual(restored, asIs, "restoring the row restores the exemption exactly — the row is the whole grant");

  rmSync(scratch, { recursive: true, force: true });
});


// ── FALSIFIER (g): ground and filing are decoupled, and both halves hold ─────
//
// THE LAW THE PIVOT ACTUALLY MADE, stated positively rather than as the absence
// of an error. Before tonight a mark's ground and its filing were one fact: you
// were filed under the region whose ring contained you, and a ring bent until
// that was true. The founder's re-shape broke the coupling on purpose — the
// regions match their atlas renders, and a resident left outside keeps their
// filing while their ground stands where they put it, with the list as the
// notice between the two.
//
// So a listed mark must be BOTH things at once: outside its region's ring, and
// still filed under that region. Asserting only the first would let a silent
// re-home pass as displacement; only the second would let the list name people
// who are actually fine. The loader's own framing law is the authority for the
// filing half — `_parentMarkId` is the directory ancestry the frame walk uses
// ("its nearest POSITIONED ancestor THAT BINDS IT", marks-fold.mjs § frameMarks)
// — so this reads the tree, not the geometry.
test("DECOUPLED: a listed mark stands outside its ring AND is still filed under its region", () => {
  const wrong = [];
  for (const row of OUTSIDERS.rows) {
    const m = byId.get(row.mark);
    if (!m) { wrong.push(`${row.mark}: not in the record at all`); continue; }
    const region = byId.get(row.region);
    if (!rectInsideRing(polygonOf(region), rect(m)))
      ; // the ground half: genuinely outside, which is why it is listed
    else wrong.push(`${row.mark}: listed, but its ground is inside ${row.region}'s ring`);
    // the filing half: the paper did not move. The mark's own ancestry must
    // still lead to the region the row names.
    let p = m._parentMarkId, seen = new Set(), filed = false;
    while (p && !seen.has(p)) { if (p === row.region) { filed = true; break; } seen.add(p); p = byId.get(p)?._parentMarkId; }
    if (!filed) wrong.push(`${row.mark}: listed under ${row.region} but no longer filed there — the pivot moves boundaries, never anyone's paper`);
  }
  assert.deepEqual(wrong, [], "every displaced mark keeps its filing and loses only the ring around it");
  assert.ok(OUTSIDERS.rows.length > 0, "…and there is something to check");
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
