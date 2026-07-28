#!/usr/bin/env node
// water-shapes-gen.mjs — give the water marks their TRUE SHAPE.
//
//   node tools/water-shapes-gen.mjs            # report only, writes nothing
//   node tools/water-shapes-gen.mjs --write    # write `points:` into the records
//
// Why this exists: a water mark's claim is a bounding RECT, and the main channel's
// rect is 4060 × 10090 m — it swallows the town centre, Evermoon, both coasts and
// the grove as "inside the channel". The record already supports true shape
// (`points:`), so the fix is to draw the water rather than box it.
//
// GENERATED, NEVER HAND-TYPED. A hand-typed ring is a second definition of where
// the water is, and it would drift from the skeleton the moment either moved. This
// polygonizes the SAME geometry tools/water.mjs formalizes, importing that
// module's feature selection and half-width so there is one definition of water
// and this is merely its outline:
//
//   centreline features → offset each side by the interpolated half-width and cap
//                         the ends with arcs (a polyline buffer)
//   lakes               → an ellipse polygon from rx_m / ry_m
//
// Honest about the approximation: waterAt() is the UNION OF PER-SEGMENT CAPSULES,
// and this ring uses averaged joint normals, so the two differ slightly at bends —
// outside corners cut the joint arc, and a sharp enough inside corner could pinch.
// The generator therefore CHECKS ITSELF against the oracle (see --write output):
// it samples the ring's own vertices and interior and reports any disagreement,
// so the drawing is validated against the formalization rather than trusted.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { waterFeatures, waterAt, halfWidthAtIndex } from "./water.mjs";
import { pointInPolygon } from "./geometry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

// Arc resolution: modest on purpose. A ring is a claim a human may read in the
// record, and 8 segments per end cap / 48 per ellipse is smooth at map scale
// without turning a mark file into a wall of numbers.
const CAP_SEGMENTS = 8;
const ELLIPSE_SEGMENTS = 48;

const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));

// ── ring construction ────────────────────────────────────────────────────────

function ellipseRing(f) {
  const cx = f.center_m?.x ?? 0, cy = f.center_m?.y ?? 0;
  const out = [];
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const th = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    out.push({ x: cx + Math.cos(th) * f.rx_m, y: cy + Math.sin(th) * f.ry_m });
  }
  return out;
}

const unit = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const leftNormal = (d) => ({ x: -d.y, y: d.x });

// Unit normal at point i, averaged across the joint so the two offset sides meet.
function normalAt(pts, i) {
  const prev = pts[i - 1], next = pts[i + 1], here = pts[i];
  const ns = [];
  if (prev) ns.push(leftNormal(unit({ x: here.x - prev.x, y: here.y - prev.y })));
  if (next) ns.push(leftNormal(unit({ x: next.x - here.x, y: next.y - here.y })));
  const sum = ns.reduce((a, n) => ({ x: a.x + n.x, y: a.y + n.y }), { x: 0, y: 0 });
  return unit(sum);
}

// MITER LENGTH at a joint. Offsetting along the averaged normal by r lands SHORT of
// the true outer corner — the ring pinches at every bend, and the oracle-agreement
// check measured the cost: 3.2% of the still reach and 6.7% of the inlet fell
// outside their own rings. The corner sits at r / cos(half-turn), and for unit
// normals |n1 + n2| = 2cos(half-turn), so the factor is just 2 / |n1 + n2|.
//
// Clamped, because the factor diverges as a bend approaches a hairpin and one
// runaway spike would wreck both the claim bbox and the silhouette. At the clamp
// the joint reads as a bevel — under-claiming a sliver, which is the safe side.
const MITER_LIMIT = 2.5;

function miterFactor(pts, i) {
  const prev = pts[i - 1], next = pts[i + 1], here = pts[i];
  if (!prev || !next) return 1; // an end point is capped by an arc, not mitred
  const n1 = leftNormal(unit({ x: here.x - prev.x, y: here.y - prev.y }));
  const n2 = leftNormal(unit({ x: next.x - here.x, y: next.y - here.y }));
  const mag = Math.hypot(n1.x + n2.x, n1.y + n2.y);
  if (mag < 1e-9) return 1; // a full reversal; the cap logic owns that shape
  return Math.min(2 / mag, MITER_LIMIT);
}

// A half-circle cap at an end point, swept from the +normal side to the -normal
// side around the outward direction, so the ring closes smoothly.
function capRing(end, outward, normal, r) {
  const out = [];
  const a0 = Math.atan2(normal.y, normal.x);
  const sweep = Math.sign(outward.x * normal.y - outward.y * normal.x) || 1;
  for (let i = 1; i < CAP_SEGMENTS; i++) {
    const th = a0 - sweep * (i / CAP_SEGMENTS) * Math.PI;
    out.push({ x: end.x + Math.cos(th) * r, y: end.y + Math.sin(th) * r });
  }
  return out;
}

function centrelineRing(f) {
  const pts = f.centerline_m ?? f.line_m ?? [];
  if (pts.length < 2) return null;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const n = normalAt(pts, i), r = halfWidthAtIndex(f, i) * miterFactor(pts, i);
    left.push({ x: pts[i].x + n.x * r, y: pts[i].y + n.y * r });
    right.push({ x: pts[i].x - n.x * r, y: pts[i].y - n.y * r });
  }
  const last = pts.length - 1;
  const dirEnd = { x: pts[last].x - pts[last - 1].x, y: pts[last].y - pts[last - 1].y };
  const dirStart = { x: pts[0].x - pts[1].x, y: pts[0].y - pts[1].y };
  return [
    ...left,
    ...capRing(pts[last], dirEnd, normalAt(pts, last), halfWidthAtIndex(f, last)),
    ...right.reverse(),
    ...capRing(pts[0], dirStart, { x: -normalAt(pts, 0).x, y: -normalAt(pts, 0).y }, halfWidthAtIndex(f, 0)),
  ];
}

const ringFor = (f) => (f.rx_m != null ? ellipseRing(f) : centrelineRing(f));

// ── the claim the ring implies ───────────────────────────────────────────────
// Round FIRST, then take the bbox off the rounded ring, so `at`/`extent` describe
// exactly the points written to the record and ringMatchesClaim holds with no
// tolerance spent. Metres are the record's unit; sub-metre water is not a thing.
function claimOf(ring) {
  const r = ring.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const xs = r.map((p) => p.x), ys = r.map((p) => p.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs);
  const miny = Math.min(...ys), maxy = Math.max(...ys);
  return {
    ring: r,
    at: { x: (minx + maxx) / 2, y: (miny + maxy) / 2 },
    extent: { w: maxx - minx, h: maxy - miny },
  };
}

// ── self-check against the oracle, BOTH directions ───────────────────────────
// The ring is a DRAWING of waterAt's region, so the drawing is validated against
// the formalization rather than trusted. Two independent questions, because one
// alone is not a check:
//
//   over-claim  — is every point inside the ring actually water?
//   under-claim — is every point the oracle calls THIS water inside the ring?
//
// A ring can pass either one alone while being badly wrong (a huge ring passes
// under-claim; a tiny one passes over-claim).
//
// The test asks "is this water at all", NOT "is this feature": waterAt returns the
// FIRST matching feature, and the water bodies genuinely overlap — the garrison
// lake sits inside the channel's region, so the oracle answers "the-main-channel"
// at the lake's own centre. An identity test here reported 26 of 48 failures for a
// mathematically exact ellipse. Overlap is a fact about the record, not a defect.
const GRID_M = 25;

function selfCheck(featureId, ring) {
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];

  let inRing = 0, inRingDry = 0;
  let oracleMine = 0, oracleMineMissed = 0;
  for (let x = x0; x <= x1; x += GRID_M) {
    for (let y = y0; y <= y1; y += GRID_M) {
      const hereRing = pointInPolygon(x, y, ring);
      const hereWater = waterAt({ x, y }, skeleton);
      if (hereRing) { inRing++; if (!hereWater) inRingDry++; }
      // under-claim is only measurable where the oracle names THIS feature, since
      // an overlapped interior is attributed to whichever body comes first
      if (hereWater === featureId) { oracleMine++; if (!hereRing) oracleMineMissed++; }
    }
  }
  return { inRing, inRingDry, oracleMine, oracleMineMissed };
}

// ── apply to the records ─────────────────────────────────────────────────────

// Walk the record rather than shelling to `git grep`: the working tree is CRLF on
// Windows, so a `$`-anchored git-grep pattern silently matches NOTHING (the line
// ends in \r before the anchor). Reading the field and trimming is flavour-proof.
function markFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) markFiles(full, out);
    else if (e.name === "mark.md") out.push(full);
  }
  return out;
}

let _files = null;
function recordPathFor(featureId) {
  _files ??= markFiles(join(ROOT, "WORLD/marks"));
  const hits = _files.filter((f) => {
    const m = /^feature:\s*(.+?)\s*$/m.exec(readFileSync(f, "utf8"));
    return m && m[1] === featureId;
  });
  if (hits.length !== 1) return { error: `expected exactly one record for feature ${featureId}, found ${hits.length}` };
  return { path: hits[0], rel: hits[0].slice(ROOT.length + 1).replace(/\\/g, "/") };
}

const fmt = (ring) => ring.map((p) => `${p.x},${p.y}`).join(" ");

function applyToRecord(path, claim) {
  let text = readFileSync(path, "utf8");
  const atLine = `at: { x: ${claim.at.x}, y: ${claim.at.y} }`;
  const exLine = `extent: { w: ${claim.extent.w}, h: ${claim.extent.h} }`;
  if (!/^at: .*$/m.test(text) || !/^extent: .*$/m.test(text)) return "no at/extent line to replace";
  text = text.replace(/^at: .*$/m, atLine).replace(/^extent: .*$/m, exLine);
  text = /^points: .*$/m.test(text)
    ? text.replace(/^points: .*$/m, `points: ${fmt(claim.ring)}`)
    // the ring goes directly under the claim it refines
    : text.replace(/^(extent: .*)$/m, `$1\npoints: ${fmt(claim.ring)}`);
  writeFileSync(path, text, "utf8");
  return null;
}

// ── run ──────────────────────────────────────────────────────────────────────

const features = waterFeatures(skeleton);
console.log(`${features.length} inland water features (the same set tools/water.mjs gates)\n`);

let wrote = 0, problems = 0;
for (const f of features) {
  const ring = ringFor(f);
  if (!ring) { console.log(`  ${f.id}: NO GEOMETRY — skipped`); problems++; continue; }
  const claim = claimOf(ring);
  const chk = selfCheck(f.id, claim.ring);
  const found = recordPathFor(f.id);

  const oldMark = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"))
    .marks.find((m) => m.feature === f.id);
  const before = oldMark ? `${oldMark.extent.w}×${oldMark.extent.h} at ${oldMark.at.x},${oldMark.at.y}` : "(no mark)";

  console.log(`  ${f.id} (${f.kind})`);
  console.log(`    record   : ${found.rel ?? "!! " + found.error}`);
  console.log(`    claim    : ${before}  ->  ${claim.extent.w}×${claim.extent.h} at ${claim.at.x},${claim.at.y}`);
  console.log(`    ring     : ${claim.ring.length} points`);
  const overPct = chk.inRing ? (100 * chk.inRingDry / chk.inRing) : 0;
  const underPct = chk.oracleMine ? (100 * chk.oracleMineMissed / chk.oracleMine) : 0;
  console.log(`    over-claim : ${chk.inRingDry}/${chk.inRing} points inside the ring are DRY (${overPct.toFixed(1)}%)`);
  console.log(`    under-claim: ${chk.oracleMineMissed}/${chk.oracleMine} points the oracle calls this water are OUTSIDE the ring (${underPct.toFixed(1)}%)`);
  if (overPct > 2 || underPct > 2) { console.log(`    ** above the 2% tolerance — the drawing disagrees with the oracle **`); problems++; }

  if (WRITE && found.path) {
    const err = applyToRecord(found.path, claim);
    if (err) { console.log(`    !! ${err}`); problems++; } else { console.log(`    written`); wrote++; }
  }
  console.log("");
}

console.log(WRITE ? `wrote ${wrote} records` : "report only — pass --write to apply");
if (problems) { console.log(`${problems} problem(s) above`); process.exitCode = 1; }
