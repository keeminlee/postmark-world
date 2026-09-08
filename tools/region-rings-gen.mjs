#!/usr/bin/env node
// region-rings-gen.mjs — give the REGION marks their TRUE SHAPE, traced from the
// legacy Atlas drawing.
//
//   node tools/region-rings-gen.mjs --atlas <dir>            # report only, writes nothing
//   node tools/region-rings-gen.mjs --atlas <dir> --write    # write at/extent/points into the records
//
// (--atlas points at the town repo's PROJECTS/build-the-town/atlas directory.)
//
// Why this exists (Keemin, 2026-08-21: "region overlap ruling has been
// relitigated ad nauseum. polygons. now."; 2026-08-22: "use polygons to
// represent the regions so they fit based on the atlas"): a region's claim is a
// bounding RECT of its drawn wash, and a rect is the wrong statement — the
// Gardens' rect and the Town Centre's rect overlap ground neither region is
// drawn over, and every overlap argument this town has had was an argument
// about rectangles. The record already supports true shape (`points:`), so the
// fix is to draw the regions rather than box them.
//
// GENERATED, NEVER HAND-TYPED — the sibling law of tools/water-shapes-gen.mjs.
// A hand-traced ring is a second definition of where a region is, and it would
// drift from the Atlas the moment either moved. So this EXTRACTS the atlas
// renderer's own wash geometry (render-town.mjs: washBlob / smoothPath / jitter,
// REGION_LAYOUT, TOWN_CENTRE_SHAPE, THRESHOLD_TERRACES, CENTRE_XY) and samples
// the SVG path the atlas actually draws. The vertices are points ON the drawn
// curve, not an ellipse re-derived from cx/rx — the wash is jittered and the
// jitter is part of the shape a reader sees. Sibling of
// tools/regions-manifest-gen.mjs, which extracts the same constants for the
// coarse rects this replaces; extraction failures REFUSE rather than guess.
//
// The transform is the one the grid already declares (WORLD/skeleton.json
// `_grid.origin`): "Ferry's crossing — center of the Town Centre, atlas
// (485,760); x east, y south" at 5 m per atlas px (RULED 2026-07-17). Both
// anchors are read out of the atlas and the skeleton rather than typed here.
//
// THE INCLUDE-RESIDENTS RULE (Keemin, 2026-08-22: "feel free to tweak the
// polygons a bit if it would otherwise exclude an existing resident of that
// region… I'd love to have sable in the gardens"). A wash drawn before the
// residents arrived does not always cover the residents who arrived. So after
// tracing, every mark already sited in a region's subtree is tested against the
// ring, and where one falls outside the ring is bent outward at that bearing
// until it holds. Every bend is reported: which mark, whose, and how far the
// ring moved.
//
// The test is the WHOLE EXTENT, exactly — every corner inside the ring and no
// ring edge crossing the mark's outline — rather than the record's own
// `marksContain`, which rasterizes the inner at 5 m cells and so answers "not
// contained" for a 1 x 1 m keystone standing squarely in the middle of its
// region, because a mark that small can own no cell centre at all. The exact
// test is strictly stronger: every one of those cell centres lies inside the
// mark, so a mark this generator holds is a mark `marksContain` holds too.
//
// THE DISJOINT LAW — RINGS TILE (Keemin, 2026-08-24: "the issue is the regions
// are still overlapping lol, like lanternseed and town centre"). The bend above
// is pure ADDITION: a ring reaches out to hold its own resident and no ring ever
// gives anything back, so every bend that reaches across a neighbour's drawn
// wash MINTS an overlap. Twelve rings, sixty-six pairs, and after the first
// commit exactly one pair still shared ground.
//
// So the bends are followed by a RECESSION. Where two rings overlap, the ground
// goes to the region whose own resident stands on it, and the other ring pulls
// its boundary back off that ground — radially, in its own polar frame, which is
// the same move the bend makes and therefore keeps the ring star-shaped and
// simple. A resident's ground belongs to its own region's ring EXCLUSIVELY.
//
// The recession UNDER-claims by a metre on purpose, for the reason the sampler
// above under-claims: a polygon chord cannot follow a curve exactly, and if it
// must miss, it must miss on the side that leaves no overlap. Where a recession
// would push a region off one of ITS OWN residents, this refuses out loud rather
// than choosing between two houses — two regions needing one patch of ground is
// a question for the founder, not an arithmetic for a generator.
//
// THE THRESHOLD'S EAST FLANK (same ruling: "threshold district can just be
// smoothed out a bit on the right side so it's not so spiky"). The terrace sweep
// leaves a sawtooth there — the bearings that fall between two terraces take a
// near crossing and the ones that hit a terrace end-on take a far one, so the
// radius alternates by hundreds of metres. Smoothing RAISES the notches to the
// chord between their neighbours and never lowers a radius, which is what makes
// it safe: containment is monotone in radius, so no resident can fall out of a
// ring that only grew. It is clamped so it can never grow INTO a neighbour —
// smoothing a flank must not buy its shape with someone else's ground.
//
// Claim-honesty (SCHEMA v2, the gate built before the first ring): after
// tracing and bending, each region's `at`/`extent` is RESTATED as the ring's
// bounding box, so the coarse claim never lies about the fine shape. Receding
// and smoothing move those boxes again, so the restatement happens after both.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { overlapArea, polygonBBox, pointInPolygon, polygonOf, rect, rectInsideRing, rectCorners, ringsDisjoint } from "./geometry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (flag, dflt = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const WRITE = process.argv.includes("--write");
const ATLAS = argOf("--atlas", null);
if (!ATLAS) throw new Error("--atlas <dir> required (point at the town clone's PROJECTS/build-the-town/atlas)");

// ── extraction from the atlas renderer ───────────────────────────────────────
// Same law as regions-manifest-gen.mjs: if the renderer changed shape, FIX THE
// EXTRACTOR — never fall back to a guess, because a guessed wash is a region
// boundary nobody drew.

const rtSrc = readFileSync(join(ATLAS, "render-town.mjs"), "utf8");

function extractFnSource(name) {
  const start = rtSrc.indexOf("function " + name + "(");
  if (start < 0) throw new Error(`extraction failed: function ${name} not found in render-town.mjs — the renderer changed shape; fix the extractor, do not guess`);
  let i = rtSrc.indexOf("{", start), depth = 0;
  for (; i < rtSrc.length; i++) {
    if (rtSrc[i] === "{") depth++;
    else if (rtSrc[i] === "}" && --depth === 0) return rtSrc.slice(start, i + 1);
  }
  throw new Error(`extraction failed: function ${name} never closes`);
}
function extractObjMultiline(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`extraction failed: const ${name} not found in render-town.mjs — the renderer changed shape; fix the extractor, do not guess`);
  return new Function("return " + m[1])();
}
function extractObjInline(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\{[^;]*\\});`));
  if (!m) throw new Error(`extraction failed: const ${name} not found`);
  return new Function("return " + m[1])();
}
function extractArr(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!m) throw new Error(`extraction failed: const ${name} not found`);
  return new Function("return " + m[1])();
}

// The atlas's OWN wash math, imported as text so the jitter that gives each
// region its hand-washed edge is the same jitter the reader sees on the map.
const atlasFns = new Function(
  [extractFnSource("hash"), extractFnSource("jitter"), extractFnSource("smoothSegment"), extractFnSource("smoothPath"), extractFnSource("washBlob")].join("\n") +
    "\nreturn { washBlob, jitter };"
)();

const LAYOUT = extractObjMultiline("REGION_LAYOUT");
// The Headland's geometry is a COASTLINE, not a layout entry — see atlasRingFor.
const COASTLINE = extractArr("COASTLINE");
const HEADLAND_INLAND = extractArr("HEADLAND_INLAND");
const HEADLAND_COAST = extractObjInline("HEADLAND_COAST");
const ORIGIN_PX = extractObjInline("CENTRE_XY");
const CENTRE_SHAPE = extractObjInline("TOWN_CENTRE_SHAPE");
const TERRACES = extractArr("THRESHOLD_TERRACES");

// The scale, read off the record that declares it rather than typed twice.
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const scaleDecl = String(skeleton._grid?.scale ?? "");
const scaleMatch = scaleDecl.match(/([\d.]+)\s*m per atlas px/);
if (!scaleMatch) throw new Error(`WORLD/skeleton.json _grid.scale does not declare m-per-atlas-px (${JSON.stringify(scaleDecl)}) — the transform will not be guessed`);
const M_PER_PX = Number(scaleMatch[1]);
// The origin anchor is stated in both records; they must agree or the transform
// is undefined. (skeleton: "atlas (485,760)"; renderer: CENTRE_XY.)
const originDecl = String(skeleton._grid?.origin ?? "").match(/atlas \((\d+),\s*(\d+)\)/);
if (!originDecl) throw new Error("WORLD/skeleton.json _grid.origin does not name the atlas anchor pixel — the transform will not be guessed");
if (Number(originDecl[1]) !== ORIGIN_PX.x || Number(originDecl[2]) !== ORIGIN_PX.y)
  throw new Error(`anchor disagreement: skeleton says atlas (${originDecl[1]},${originDecl[2]}), render-town.mjs CENTRE_XY says (${ORIGIN_PX.x},${ORIGIN_PX.y}) — one of them moved; reconcile before drawing regions`);

const toWorld = (p) => ({ x: (p.x - ORIGIN_PX.x) * M_PER_PX, y: (p.y - ORIGIN_PX.y) * M_PER_PX });

// ── sampling the drawn path ──────────────────────────────────────────────────
// washBlob returns the atlas's own `d` string: "M x,y Q cx,cy ex,ey … L x,y".
// The authored blob points are quadratic CONTROL points, so they sit OFF the
// curve; the drawn edge is the curve. So the ring takes the curve's own
// ON-CURVE points — twelve per wash, which is fit rather than tracing noise and
// leaves room in the budget for the bends below. Between two of them the drawn
// curve bows out by roughly 15 m at region scale; the ring cuts that chord, so
// where it differs from the drawing at all it UNDER-claims, which is the side a
// boundary should err on.
const Q_SAMPLES = [0];

function samplePath(d) {
  const tokens = d.match(/[MQLZ][^MQLZ]*/g) ?? [];
  const nums = (s) => (s.match(/-?[\d.]+/g) ?? []).map(Number);
  const out = [];
  let cur = null;
  const push = (p) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-6) out.push(p);
  };
  for (const t of tokens) {
    const cmd = t[0], n = nums(t.slice(1));
    if (cmd === "M" || cmd === "L") { cur = { x: n[0], y: n[1] }; push(cur); }
    else if (cmd === "Q") {
      const c = { x: n[0], y: n[1] }, e = { x: n[2], y: n[3] }, s = cur;
      for (const u of Q_SAMPLES) {
        if (u === 0) continue; // the segment start is already the previous vertex
        const k = (1 - u) * (1 - u), m = 2 * (1 - u) * u, l = u * u;
        push({ x: k * s.x + m * c.x + l * e.x, y: k * s.y + m * c.y + l * e.y });
      }
      push(e);
      cur = e;
    }
  }
  // a closed ring: drop a final vertex that repeats the first
  if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-6) out.pop();
  return out;
}

// ⚠ A SUPERSEDED RULE STOOD HERE UNTIL 2026-09-08, three lines above the ruling
// that overturned it: "the stroked edge of a region wash is the INNER blob … so
// the inner is the boundary a reader sees, and the inner is what the ring
// traces." That was pass 2's rule. The founder overruled it on 2026-08-24 and
// the paragraph below has said so ever since, but the old sentence was never
// deleted — so this file asserted both, in its own voice, and a reader arriving
// at the top of the block got the wrong one first.
//
// It cost something real: the Headland's ring was traced at the inner on 09-08
// and its comment reproduced this reasoning nearly word for word. Removed rather
// than annotated, because a false premise kept for its history is still the
// first thing the next reader believes. The history is in the diff.
//
// THE OUTER BLOB IS THE ONE A READER SEES (the founder, 2026-08-24: "region
// borders are too small. They cut out homes… that are visually clearly WITHIN a
// region's wash"). regionWashLayer draws each region TWICE — an outer blob at
// 1.08x the radii filled at 0.16, and an inner at 1.0x filled at 0.20 and
// stroked — and both are blurred by softWash (feGaussianBlur stdDeviation 6).
//
// Pass 2 traced the INNER path, on the reasoning that the stroked edge is the
// boundary a reader sees. That was wrong about the drawing: the stroke is the
// faintest thing on the layer at 0.35 opacity, and what the eye reads as "the
// region" is the filled wash, whose outer limit is the OUTER blob plus its
// feather. So the ring is cut 8% of its radii inside the colour every time, and
// houses standing in the visible wash fall outside the record — the dreamer's
// anchor and the green-lamp house, by name.
//
// This traces the outer path instead: still the renderer's own geometry, same
// extraction law, no invented offset. The seed matches regionWashLayer's exactly
// (the id with "outer" appended), because a different seed is a different
// jitter and would be a boundary nobody drew.
const WASH_OUTER = 1.08;                       // regionWashLayer's own multiplier
// AND THE FEATHER. Both wash paths are drawn through filter softWash —
// feGaussianBlur stdDeviation 6, in atlas pixels — so the colour does not stop
// at the outer path, it fades from it. At 5 m per atlas pixel that is a 30 m
// sigma, and a Gaussian is still visible to about two of them before it sinks
// under the background: 60 m of ground that reads as inside the region to
// anyone looking at the map.
//
// Two sigma rather than three, and the restraint is the point. Three would add
// another 30 m of ground where the wash is no longer perceptible, and the
// founder's test is what a reader SEES ('visually clearly WITHIN a region's
// wash') — claiming ground the colour does not reach would fail that test in
// the other direction, quietly, and be much harder to notice.
const FEATHER_M = 60;
const washRing = (cx, cy, rx, ry, seed) =>
  samplePath(atlasFns.washBlob(cx, cy, rx * WASH_OUTER, ry * WASH_OUTER, seed + "outer"));

// ── the Threshold's four terraces: one outline round the four ────────────────
// The Threshold District is the one region the atlas draws as four descending
// terrace blobs rather than one wash, so its ring is swept round all four: at
// each of `n` bearings from the terraces' shared centre, the ring takes the
// FARTHEST crossing of any terrace outline.
//
// Stated plainly because it is the one place this generator does not trace the
// drawing exactly: a sweep fills the small concave notches where consecutive
// terraces meet, so the ring claims a little ground between the steps that the
// map washes as two lobes rather than one. That is deliberate. It buys a
// STAR-SHAPED ring — one boundary point per bearing — and star-shapedness is
// what makes the include-residents bend below provably safe: a bend only ever
// raises a vertex's radius, and raising radii on an angle-ordered ring can never
// make its edges cross. A faithful concave union bent the same way produced a
// self-crossing boundary, which is a worse lie about a region than a filled
// notch between two of its own terraces.
function starHull(rings, n = 48) {
  const all = rings.flat();
  const c = { x: all.reduce((s, p) => s + p.x, 0) / all.length, y: all.reduce((s, p) => s + p.y, 0) / all.length };
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const dir = { x: Math.cos(th), y: Math.sin(th) };
    let far = 0;
    for (const ring of rings) for (let j = 0; j < ring.length; j++) {
      const a = ring[j], b = ring[(j + 1) % ring.length];
      const t = raySegment(c, dir, a, b);
      if (t !== null && t > far) far = t;
    }
    if (far === 0) throw new Error("terrace sweep: a bearing crossed no terrace outline — the shape is not star-shaped from its own centre");
    out.push({ x: c.x + dir.x * far, y: c.y + dir.y * far });
  }
  return out;
}
// distance along `dir` from `o` to segment ab, or null if the ray misses it
function raySegment(o, dir, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const den = dir.x * vy - dir.y * vx;
  if (Math.abs(den) < 1e-12) return null;
  const wx = a.x - o.x, wy = a.y - o.y;
  const t = (wx * vy - wy * vx) / den;          // along the ray
  const u = (wx * dir.y - wy * dir.x) / den;    // along the segment
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}

// A ring the bend can safely work on: exactly one boundary point per bearing
// from `c`, i.e. its vertices sweep monotonically round. Every wash this
// generator traces should satisfy it (the atlas jitters a wash radially by at
// most 16%); this refuses rather than bending a shape the bend would tear.
function assertStarShaped(ring, c, id) {
  const th = ring.map((p) => Math.atan2(p.y - c.y, p.x - c.x));
  let turn = 0;
  for (let i = 0; i < th.length; i++) {
    let d = th[(i + 1) % th.length] - th[i];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (d <= 0) throw new Error(`${id}: the traced ring doubles back on itself at vertex ${i} — it is not star-shaped from its own centre, so the include-residents bend cannot be applied to it safely`);
    turn += d;
  }
  if (Math.abs(Math.abs(turn) - 2 * Math.PI) > 1e-6) throw new Error(`${id}: the traced ring does not close once round its centre`);
}

// ── the roster ───────────────────────────────────────────────────────────────
// The thirteen of tools/founding-act.mjs, minus the one that is not drawable:
// vermillion/the-pando-peak is a `far: true` HORIZON object 135 km out
// (skeleton far_features, decision 008) with no atlas wash — a mountain on the
// NW horizon, not ground the map washes — so it keeps its rect and gets no ring.
// the-carried-weight (liv + noe) is founded but deliberately UNDRAWN (#1922, the
// region-topology question on the principal's desk) and is likewise out.
const REGION_IDS = [
  "the-town-centre", "the-trueing-terrace", "the-lanternseed-gardens", "the-threshold-district",
  "the-long-run", "the-protected-grove", "the-doubled-coast", "aelyria", "the-reach",
  "the-east-window-district", "the-high-ground", "evermoon",
];

// ── AND THE THIRTEENTH, WHICH THIS PIPELINE CANNOT PROCESS ──────────────────
//
// the-headland is a region as of 2026-09-08 (the founder's word) and this file
// CAN trace it — see `atlasRingFor` — but it is deliberately NOT in the roster
// above, because everything that happens after the trace assumes a STAR-SHAPED
// ring: the include-residents bend pushes a single boundary point outward along
// a bearing, the recession pulls one back, and `assertStarShaped` refuses
// anything with two boundary points on one bearing rather than tearing it.
//
// A promontory has two. It is a hook: a wedge running out to a point with the
// sea folding back around it, and its own centroid sees parts of its coast
// twice. Run it through the roster and the generator refuses, correctly:
//
//   the-headland: the traced ring doubles back on itself at vertex 0 — it is
//   not star-shaped from its own centre, so the include-residents bend cannot
//   be applied to it safely
//
// THAT REFUSAL IS RIGHT AND IS NOT TO BE LOOSENED. Weakening `assertStarShaped`
// so one region fits would blind the check for the twelve it was written for.
// So the Headland is traced but not BENT, which costs nothing today — the bend
// exists to reach out and hold a region's own sited residents, and nobody is
// sited in the Headland yet. The day someone is, this is the note that says the
// question is open and has to be answered on purpose.
//
// Its ring is reproducible without the pipeline:
//
//   node tools/region-rings-gen.mjs --atlas <dir> --trace the-headland
//
// which prints the mark's own `at` / `extent` / `points`, so the record's copy
// is checkable against the drawing rather than taken on trust.
const TRACE_ONLY = ["the-headland"];

// ── BORDER, NOT ENTER ───────────────────────────────────────────────────────
//
// The founder's 2026-07-21 ruling on the Headland's own neck, quoted in the
// renderer's HEADLAND_INLAND block: the wash closes back across the neck so the
// two regions MEET rather than leaving no-man's ground between them. Meeting is
// not entering, and the twelve do not overlap each other at all — the recession
// above exists to guarantee exactly that ("rings tile").
//
// The traced Headland entered `spar/the-doubled-coast` by 0.87 ha. So the ring
// is CLIPPED at spar's boundary before it is offered as a claim, and the clip
// lives HERE, inside the trace, rather than being applied by hand to the number
// afterwards — otherwise `--trace` would stop reproducing the committed mark and
// the ring would be hand-typed again by the back door.
//
// Why not `recedeFrom`, which is this file's own recession and does exactly this
// job for the twelve: it works in POLAR about the ring's own centre, and that is
// sound only for a star-shaped ring. The Headland is the one region that is not
// (see TRACE_ONLY), so borrowing it would be borrowing an assumption that is
// false here. This clip is purely local instead — plant a vertex where the
// boundaries cross, then push any vertex still inside the neighbour out to the
// neighbour's own edge — which needs no angular assumption at all.
//
// It UNDER-claims by `gap`, the same metre of daylight `GAP` gives the twelve,
// for the same reason: a chord between two pushed-back vertices must still clear
// the curve it is cutting along.
const nearestOnSegment = (p, a, b) => {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return { ...a, d: Math.hypot(p.x - a.x, p.y - a.y) };
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + vx * t, y: a.y + vy * t };
  return { ...q, d: Math.hypot(p.x - q.x, p.y - q.y) };
};
const nearestOnRing = (p, ring) => {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const q = nearestOnSegment(p, ring[i], ring[(i + 1) % ring.length]);
    if (!best || q.d < best.d) best = q;
  }
  return best;
};
const segmentHit = (a, b, c, d) => {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t, t };
};

// the same metre the recession's own GAP uses; stated locally because GAP is
// declared further down the file and a default argument reaching forward for it
// is a temporal-dead-zone trap waiting for the first caller that runs earlier
const CLIP_GAP_M = 1;

function clipRingAgainst(ring, other, gap = CLIP_GAP_M) {
  // DENSIFY, PUSH, THIN — in that order, and deliberately the dull way.
  //
  // The clever version is a boolean difference, and two attempts at one here
  // both left ground behind: planting only the CROSSINGS leaves a straight chord
  // that still swallows a convex corner of the neighbour (0.87 ha -> 0.38 ha),
  // and planting the neighbour's corner as well needs a rule for which side to
  // push it toward — a rule I got backwards twice, because "outward from the
  // neighbour's centre" and "out of the neighbour" are only the same sentence
  // when the neighbour is convex and you are on the far side of it.
  //
  // So: no side reasoning at all. Walk the boundary at a fine step, move every
  // sample that stands inside the neighbour to the neighbour's own edge plus a
  // metre, and then drop the samples that turn out to say nothing. Correctness
  // rests on one fact that needs no geometry — a point either is inside the
  // neighbour or it is not — and the thinning is only allowed to remove a point
  // whose removal keeps that true.
  const STEP_M = 2;

  // 1 · densify. Only where it can matter: an edge is subdivided when either end
  //     is within a step of the neighbour, so the rest of the coast keeps the
  //     vertex count the record has to carry.
  const near = (p) => nearestOnRing(p, other).d <= STEP_M * 2 || pointInPolygon(p.x, p.y, other);
  const dense = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    dense.push({ x: a.x, y: a.y, _original: true });     // the trace itself; never dropped
    if (!near(a) && !near(b)) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(len / STEP_M);
    for (let k = 1; k < n; k++)
      dense.push({ x: a.x + (b.x - a.x) * (k / n), y: a.y + (b.y - a.y) * (k / n), keep: false });
  }

  // 2 · push every sample that stands inside the neighbour out to its edge, plus
  //     the gap. `q - p` points out of the neighbour by construction — q is the
  //     nearest point on its boundary — so no side has to be decided.
  //
  // A PUSHED SAMPLE IS LOAD-BEARING and is marked so. The first version let the
  // thinning below treat it as ordinary, and along a border where the two rings
  // run nearly parallel that is fatal: the drift test passes for almost every
  // one of them, they are all dropped, and the chord springs back inside the
  // neighbour. The overlap barely moved (0.26 ha) and the cause was the pass
  // meant to tidy up after the fix, not the fix.
  const pushed = dense.map((p) => {
    if (!pointInPolygon(p.x, p.y, other)) return p;
    const q = nearestOnRing(p, other);
    if (!(q.d > 1e-9)) return { ...p, _pushed: true };
    const k = (q.d + gap) / q.d;
    return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, _original: p._original, _pushed: true };
  });

  // 3 · thin. A densified sample earns its place only if dropping it would let
  //     the chord across its neighbours re-enter the other region, or would move
  //     the boundary by more than a tenth of a metre. Original vertices are never
  //     dropped: they are the trace, and the trace is what makes this ring
  //     reproducible rather than authored.
  // THE TEST IS THE WHOLE CHORD, not its midpoint. A midpoint test passes for
  // every point along a border where the two rings run nearly parallel, which is
  // most of this one — so it drops the samples that were doing the work and the
  // boundary springs back inside. Walking the chord is what actually asks the
  // question the drop has to answer: does removing this point let the edge
  // re-enter the neighbour anywhere along it?
  //
  // An ORIGINAL vertex is never dropped — those are the trace, and the trace is
  // what makes this ring reproducible instead of authored. A densified one is
  // dropped only when the chord that would replace it stays out of the
  // neighbour AND the point sits within a quarter-metre of that chord, which is
  // far inside the metre of daylight the gap already holds.
  const chordClear = (a, b) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(2, Math.ceil(len / 0.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (pointInPolygon(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, other)) return false;
    }
    return true;
  };
  const out = [];
  for (let i = 0; i < pushed.length; i++) {
    const p = pushed[i];
    if (p.keep && !p._pushed) { out.push(p); continue; }
    if (p._original) { out.push(p); continue; }
    const prev = out[out.length - 1] ?? pushed[(i - 1 + pushed.length) % pushed.length];
    const next = pushed[(i + 1) % pushed.length];
    if (nearestOnSegment(p, prev, next).d <= 0.25 && chordClear(prev, next)) continue;
    out.push(p);
  }
  return out.map((p) => ({ x: p.x, y: p.y }));
}

// BORDER, NOT ENTER — applied in WORLD METRES, against the record's own rings.
//
// The founder's 2026-07-21 ruling on this very neck, quoted in the renderer's
// HEADLAND_INLAND block: the wash closes back across the neck so the two regions
// MEET rather than leaving no-man's ground between them. Meeting is not
// entering, and the twelve do not overlap one another at all — the recession
// exists to guarantee exactly that ("rings tile"). The traced Headland ran 0.87
// ha into spar's ground, which would have been the record's first overlapping
// region pair.
//
// It runs HERE rather than inside the trace for a reason worth keeping: the
// neighbour that matters is the one THE RECORD HOLDS — traced, feathered,
// smoothed and receded — not the raw wash `atlasRingFor` returns. Clipping
// against the raw one leaves twenty of the Headland's vertices inside the real
// spar and the overlap essentially unmoved.
//
// Only the regions that are traced but NOT bent need this: everything in
// REGION_IDS goes through the recession, which already tiles them.
function clipToNeighbours(id, ringM, marks) {
  if (!TRACE_ONLY.includes(id)) return ringM;
  let out = ringM;
  for (const slug of REGION_IDS) {
    const m = marks.find((x) => String(x.id).split("/")[1] === slug && x.points?.length);
    if (!m) continue;
    const other = polygonOf(m);
    if (!other?.length) continue;
    out = clipRingAgainst(out, other);
  }
  return out;
}

function atlasRingFor(id) {
  // THE HEADLAND IS NOT A WASH ELLIPSE, and that is what "provisional" turns out
  // to mean geometrically — the question was asked on 2026-09-08 and this is the
  // answer. The other twelve get `washBlob(cx, cy, rx, ry)` from a REGION_LAYOUT
  // entry. The Headland has no entry, because a provisional region deliberately
  // lives only in the drawing, and its wash is THE PROMONTORY ITSELF. The
  // renderer says why in its own words: "a wedge that is 130px across at the neck
  // and comes to a point cannot be covered by any ellipse that also stays out of
  // the water — size it to reach the tip and it spills off both flanks, size it
  // to the flanks and the point sticks out bare." So it takes the stretch of
  // COASTLINE the promontory occupies, closes it across the neck with
  // HEADLAND_INLAND, and shrinks that polygon about its own centroid.
  //
  // THE RING IS THE INNER (1.02), NOT THE OUTER (1.12) — AND NOT FOR THE REASON
  // THE OVERRULED RULE ABOVE WOULD HAVE GIVEN. "The stroke is the edge a reader
  // sees" is exactly the reasoning the founder overturned on 2026-08-24, and it
  // would not distinguish this case anyway: the twelve's renderer strokes its
  // inner too. The Headland's reason is its own, and it is about WATER. Its outer
  // is deliberately drawn proud of the shore and spills into the sea — "the right
  // fault to have" for a wash, in the renderer's words, because a soft edge over
  // water reads as a boundary while bare coastline reads as an error. A wash may
  // spill into the sea. A RING MAY NOT: a ring is a claim on ground, and out
  // there there is no ground to claim.
  //
  // What that costs is real and is written here rather than left to be found: the
  // ring claims roughly 28% less than the twelve's rule (outer 1.08 plus the 60 m
  // feather) would give it. Nobody is sited in the Headland, so nothing turns on
  // it today; the day someone is, this is the note saying the trade was made on
  // purpose and which way it went.
  if (id === "the-headland") {
    const land = COASTLINE.slice(HEADLAND_COAST.first, HEADLAND_COAST.last + 1).concat(HEADLAND_INLAND);
    const gx = land.reduce((s, p) => s + p.x, 0) / land.length;
    const gy = land.reduce((s, p) => s + p.y, 0) / land.length;
    // the renderer's own jitter, for the same reason this file imports washBlob
    // as text: the edge in the record is the edge the reader sees
    const traced = land.map((p, i) => {
      const j = 1 + atlasFns.jitter("headland-inner", "p" + i) * 0.03;
      return { x: gx + (p.x - gx) * 1.02 * j, y: gy + (p.y - gy) * 1.02 * j };
    });
    // The BORDER-NOT-ENTER clip does NOT happen here, and the reason is a bug
    // this file taught me: `atlasRingFor` returns the raw traced wash in ATLAS
    // PIXELS, before the feather, the smoothing and the recession. Clipping
    // against that clips against a spar 60 m smaller than the one the record
    // actually holds — twenty of the Headland's own vertices were still inside
    // the real spar afterwards, and the overlap barely moved. The neighbour to
    // respect is the one in the RECORD, so the clip runs downstream, in world
    // metres, where that ring can be read. See `clipToNeighbours`.
    return traced;
  }
  if (id === "the-town-centre") {
    const c = CENTRE_SHAPE;
    return washRing(c.cx, c.cy, c.rx, c.ry, "centre");
  }
  if (id === "the-threshold-district")
    return starHull(TERRACES.map((t) => washRing(t.cx, t.cy, t.rx, t.ry, "threshold-" + t.id)));
  const lay = LAYOUT[id];
  if (!lay) throw new Error(`extraction failed: "${id}" has no REGION_LAYOUT entry — the atlas no longer draws this region; reconcile the roster before generating`);
  return washRing(lay.cx, lay.cy, lay.rx, lay.ry, id);
}

// ── the include-residents bend ───────────────────────────────────────────────
const markRect = (mk) => ({ x: mk.at.x, y: mk.at.y, w: mk.extent?.w ?? 1, h: mk.extent?.h ?? 1 });

const polar = (p, c) => ({ th: Math.atan2(p.y - c.y, p.x - c.x), r: Math.hypot(p.x - c.x, p.y - c.y) });
const cart = (th, r, c) => ({ x: c.x + Math.cos(th) * r, y: c.y + Math.sin(th) * r });
const dth = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

const norm = (a) => { while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return a; };

// How far the ring's boundary reaches on one bearing (the ring is star-shaped
// about `c`, so there is exactly one answer).
function reachAt(ring, c, th) {
  const dir = { x: Math.cos(th), y: Math.sin(th) };
  let far = 0;
  for (let i = 0; i < ring.length; i++) {
    const t = raySegment(c, dir, ring[i], ring[(i + 1) % ring.length]);
    if (t !== null && t > far) far = t;
  }
  return far;
}

// ── the recession · rings tile ───────────────────────────────────────────────
//
// `ring` gives up every point it holds inside `other`. Worked radially about the
// ring's own centre, exactly as the bend works: the bend raises radii, this
// lowers them, and both leave an angle-ordered ring angle-ordered.
//
// Two things make it exact enough to satisfy an exact disjointness test. First,
// a vertex is planted on every bearing where the two boundaries cross, so the
// receding edge turns where the neighbour turns instead of cutting a chord
// across it. Second, every radius that must come back comes back to the
// neighbour's boundary MINUS `pad` — the under-claim — so the chord between two
// pulled-back vertices still clears the curve between them.
//
// It returns null when it cannot finish without pushing the region off one of
// its own residents. The caller refuses; it does not pick a house.
function recedeFrom(ring, centre, other, rects, pad) {
  const freeAt = (th) => {
    const dir = { x: Math.cos(th), y: Math.sin(th) };
    let nearest = Infinity;
    for (let i = 0; i < other.length; i++) {
      const t = raySegment(centre, dir, other[i], other[(i + 1) % other.length]);
      if (t !== null && t < nearest) nearest = t;
    }
    return nearest;                            // Infinity = this bearing never meets `other`
  };

  let pol = ring.map((v) => ({ ...polar(v, centre), atlas: v.atlas }));
  const back = (P) => P.map((v) => ({ ...cart(v.th, v.r, centre), atlas: v.atlas }));

  // Plant a vertex on every bearing where the boundaries cross, so the cut can
  // follow the neighbour's own corners rather than chord across them.
  const crossings = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (let j = 0; j < other.length; j++) {
      const c = other[j], d = other[(j + 1) % other.length];
      if (!segsCross(a, b, c, d)) continue;
      crossings.push(polar(c, centre).th, polar(d, centre).th);
    }
  }
  for (const th of crossings) {
    if (pol.some((v) => Math.abs(dth(v.th, th)) < 1e-9)) continue;
    const r = reachAt(back(pol), centre, th);
    if (!(r > 0)) continue;
    let ins = pol.length;
    for (let i = 0; i < pol.length; i++) {
      const a = pol[i].th, b = pol[(i + 1) % pol.length].th;
      if (dth(th, a) > 0 && dth(b, th) > 0) { ins = i + 1; break; }
    }
    pol.splice(ins, 0, { th, r, atlas: false });
  }

  // Pull every radius back off the neighbour, then keep planting midpoints
  // wherever an edge still cuts through, until nothing crosses. Bounded: a
  // boundary that will not come clean is a refusal, never a silent overlap.
  let receded = 0, mostBack = 0;
  for (let pass = 0; pass < 8; pass++) {
    for (const v of pol) {
      const free = freeAt(v.th);
      const cap = Number.isFinite(free) ? free - pad : Infinity;
      if (v.r > cap) { mostBack = Math.max(mostBack, v.r - cap); v.r = Math.max(0, cap); receded++; }
    }
    const now = back(pol);
    if (ringsDisjoint(now, other)) {
      if (!rects.every((r) => rectInsideRing(now, r))) return null;
      return { ring: now, receded, mostBack };
    }
    // still touching: plant a midpoint bearing on every edge that still cuts
    const pts = back(pol);
    const extra = [];
    for (let i = 0; i < pol.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pol.length];
      let hits = false;
      for (let j = 0; j < other.length; j++) if (segsCross(a, b, other[j], other[(j + 1) % other.length])) { hits = true; break; }
      if (!hits) continue;
      const mid = pol[i].th + dth(pol[(i + 1) % pol.length].th, pol[i].th) / 2;
      extra.push({ at: i + 1, th: norm(mid) });
    }
    if (!extra.length) break;
    for (let k = extra.length - 1; k >= 0; k--) {
      const e = extra[k];
      pol.splice(e.at, 0, { th: e.th, r: reachAt(back(pol), centre, e.th), atlas: false });
    }
  }
  return null;
}

// geometry.mjs's segmentsCross, under a local name — the same primitive the
// falsifier uses, never a second opinion about whether two edges meet.
function segsCross(p1, p2, p3, p4) {
  const s2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = s2(p3, p4, p1), d2 = s2(p3, p4, p2), d3 = s2(p1, p2, p3), d4 = s2(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// ── smoothing a whole ring ───────────────────────────────────────────────────
//
// The founder, 2026-08-24: "could we just generally smooth out the polygons for
// the regions (lanternseed included)". So this runs on every ring, not on one
// named flank, and it is deliberately a LOW-PASS rather than a convexifier.
//
// The distinction matters and is easy to get wrong. Lifting every vertex to the
// chord its neighbours draw — the obvious reading of "smooth" — makes the radial
// profile concave, i.e. the ring CONVEX, and twelve convex blobs is not a
// smoothed map, it is a map with the hand-washed edge sanded off. A wash's
// shallow bays are the drawing. What is NOT the drawing is a single vertex
// spiking hundreds of metres off its neighbours, which is a sampling artifact of
// the terrace sweep and of nothing a reader ever saw.
//
// So: three passes of a (1,2,1) kernel on the RADII, in angle order. That is the
// standard smoothing filter, and its property here is exactly the one wanted —
// it attenuates a lone spike hard (a vertex that disagrees with both neighbours
// moves most) and leaves a broad bay almost untouched (neighbours that agree
// with each other barely move it). Curvature relaxes; shape survives.
//
// Two clamps, both stated as refusals rather than preferences:
//   · a smoothed vertex may not leave the bbox the TRACE claimed, so the
//     region's at/extent stays the atlas wash's own box and the frame does not
//     wander for cosmetic reasons;
//   · a smoothed vertex may not enter another ring — smoothing must not buy its
//     shape with a neighbour's ground. (The recession that follows enforces this
//     absolutely; the clamp keeps it from having work to do.)
//
// Then the thinning. A vertex within `flat` metres of the straight line its
// neighbours already draw says nothing that line did not, and after smoothing
// there are many: this is where the count comes down. It drops TRACED vertices
// too, which the bend era never did — and the reason is honest rather than
// convenient: once a vertex has been moved by the filter it is no longer a point
// on the drawn curve, so "never thin the drawing" no longer protects anything.
// The ring is a smoothed trace, and it says so.
function smoothRing(ring, centre, { passes = 3, flat = 12, ceilingAt = () => Infinity } = {}) {
  let pol = ring.map((v) => ({ ...polar(v, centre) }));
  const before = pol.length;
  let mostMoved = 0;

  for (let pass = 0; pass < passes; pass++) {
    const next = pol.map((v, i) => {
      const a = pol[(i - 1 + pol.length) % pol.length], b = pol[(i + 1) % pol.length];
      const want = (a.r + 2 * v.r + b.r) / 4;
      const capped = Math.min(want, ceilingAt(v.th));
      return { th: v.th, r: capped > 0 ? capped : v.r };
    });
    for (let i = 0; i < pol.length; i++) mostMoved = Math.max(mostMoved, Math.abs(next[i].r - pol[i].r));
    pol = next;
  }

  let dropped = 0, changed = true;
  while (changed && pol.length > 8) {
    changed = false;
    for (let i = 0; i < pol.length; i++) {
      const v = pol[i], a = pol[(i - 1 + pol.length) % pol.length], b = pol[(i + 1) % pol.length];
      const A = cart(a.th, a.r, centre), B = cart(b.th, b.r, centre), V = cart(v.th, v.r, centre);
      // distance from V to the segment AB — the only question that matters is
      // whether the edge would pass through where this vertex stands
      const ex = B.x - A.x, ey = B.y - A.y;
      const len2 = ex * ex + ey * ey;
      if (len2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((V.x - A.x) * ex + (V.y - A.y) * ey) / len2));
      const d = Math.hypot(V.x - (A.x + t * ex), V.y - (A.y + t * ey));
      if (d > flat) continue;
      pol = pol.slice(0, i).concat(pol.slice(i + 1));
      dropped++; changed = true; break;
    }
  }

  return {
    ring: pol.map((v) => ({ ...cart(v.th, v.r, centre), atlas: true })),
    before, after: pol.length, dropped, mostMoved,
  };
}

// ── build ────────────────────────────────────────────────────────────────────

const MARKS_DIR = join(ROOT, "WORLD/marks");
const regionDir = (id) => join(MARKS_DIR, "let-there-be-light", id).replaceAll("\\", "/");

// subtree membership straight off the directory tree — the tree IS containment
const subtreeOf = (marks, id) => {
  const prefix = regionDir(id) + "/";
  return marks.filter((m) => {
    const dir = String(m._dir ?? "").replaceAll("\\", "/");
    if (!dir.startsWith(prefix)) return false;
    if (m.kind === "predicated" || m.kind === "naming" || m.kind === "class") return false; // no geometry of their own
    if (m.far) return false;
    return !!m.at;
  });
};

// The recession's own under-claim: a metre of daylight between two rings, so a
// chord between pulled-back vertices still clears the curve it is cutting along.
const GAP = 1;

function buildAll(marks) {
  const built = [];

  // ── phase 1 · trace, and nothing else ──────────────────────────────────────
  // THE BENDS ARE GONE (the founder's pivot, 2026-08-24): "the regions just get
  // drawn to match their atlas renders. And then we can just make a Town
  // Bulletin announcement with a list of names of every resident that is not
  // within the region's bounds anymore." A ring is the wash the atlas draws,
  // smoothed, minus any ground a neighbour's wash also covers — and a resident
  // standing outside it is a HEADS-UP, not a reason to redraw a boundary around
  // them. This knowingly supersedes the 08-22 include-residents word, sable's
  // named case included; that reversal is the founder's, on tonight's record.
  //
  // It also makes the ring independent of where anyone lives, which is why this
  // no longer needs a fixpoint: the trace depends on the atlas, the smoothing on
  // the trace, the recession on the other rings. Residents move when their
  // region's frame moves; the frame never moves back in response.
  for (const id of REGION_IDS) {
    const regionMark = marks.find((m) => m.slug === id);
    if (!regionMark) throw new Error(`region mark "${id}" is not in WORLD/marks — the roster and the record disagree; reconcile before drawing`);
    const traced = atlasRingFor(id).map((p) => ({ ...toWorld(p), atlas: true }));
    const c0 = { x: traced.reduce((s, p) => s + p.x, 0) / traced.length, y: traced.reduce((s, p) => s + p.y, 0) / traced.length };
    // the feather, pushed out along each vertex's own bearing — the rings are
    // star-shaped about their centres, so raising radii keeps them simple
    const ring = traced.map((p) => {
      const d = Math.hypot(p.x - c0.x, p.y - c0.y);
      if (d < 1e-9) return p;
      const k = (d + FEATHER_M) / d;
      return { x: c0.x + (p.x - c0.x) * k, y: c0.y + (p.y - c0.y) * k, atlas: true };
    });
    const centre = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
    assertStarShaped(ring, centre, id);
    built.push({ id, regionMark, ring, centre, traced: polygonBBox(ring), kids: subtreeOf(marks, id), smoothing: null, recessions: [] });
  }

  // ── phase 2 · smooth every ring ────────────────────────────────────────────
  // Ordered BEFORE the recession, and the ordering is forced rather than chosen:
  // smoothing can push a boundary outward, and pushing outward is the only thing
  // that mints an overlap — so the pass that removes overlap has to be the one
  // that runs last. Subtract-then-smooth would hand back ground the subtraction
  // had just taken, and the disjoint law would be false at the end of the run.
  for (const b of built) {
    const others = built.filter((o) => o.id !== b.id).map((o) => o.ring);
    const box = b.traced;
    const bboxLimit = (th) => {
      const dx = Math.cos(th), dy = Math.sin(th);
      let t = Infinity;
      if (dx > 1e-12) t = Math.min(t, (box.maxx - b.centre.x) / dx);
      if (dx < -1e-12) t = Math.min(t, (box.minx - b.centre.x) / dx);
      if (dy > 1e-12) t = Math.min(t, (box.maxy - b.centre.y) / dy);
      if (dy < -1e-12) t = Math.min(t, (box.miny - b.centre.y) / dy);
      return t;
    };
    const ceilingAt = (th) => {
      const dir = { x: Math.cos(th), y: Math.sin(th) };
      let nearest = Infinity;
      for (const o of others) {
        for (let i = 0; i < o.length; i++) {
          const t = raySegment(b.centre, dir, o[i], o[(i + 1) % o.length]);
          if (t !== null && t < nearest) nearest = t;
        }
      }
      const neighbour = Number.isFinite(nearest) ? nearest - GAP : Infinity;
      return Math.min(neighbour, bboxLimit(th));
    };
    const r = smoothRing(b.ring, b.centre, { ceilingAt });
    b.ring = r.ring;
    b.smoothing = { before: r.before, after: r.after, dropped: r.dropped, mostMoved: r.mostMoved };
  }

  // ── phase 3 · the recession · rings tile ───────────────────────────────────
  // Two smoothed washes may still touch where the atlas drew them touching. The
  // ground goes to whoever's resident stands on it; where nobody does, the
  // larger claim yields, deterministically, so the run is repeatable.
  for (let i = 0; i < built.length; i++) {
    for (let j = i + 1; j < built.length; j++) {
      const A = built[i], B = built[j];
      if (ringsDisjoint(A.ring, B.ring)) continue;
      const standing = (owner, ring) => owner.kids.filter((k) => {
        const r = markRect(k);
        return pointInPolygon(r.x, r.y, ring);
      });
      const aIn = standing(A, B.ring), bIn = standing(B, A.ring);
      const areaOf = (o) => { const bb = polygonBBox(o.ring); return (bb.maxx - bb.minx) * (bb.maxy - bb.miny); };
      let keeper, yielder;
      if (aIn.length && !bIn.length) { keeper = A; yielder = B; }
      else if (bIn.length && !aIn.length) { keeper = B; yielder = A; }
      else { keeper = areaOf(A) >= areaOf(B) ? B : A; yielder = areaOf(A) >= areaOf(B) ? A : B; }

      // No containment to protect any more: a region that cannot recede without
      // shedding a resident simply sheds one, onto the outsider list, which is
      // the whole point of the pivot. So the recession is asked without rects.
      const out = recedeFrom(yielder.ring, yielder.centre, keeper.ring, [], GAP);
      if (!out)
        throw new Error(`${yielder.id} cannot recede off ${keeper.id} — the boundary will not come clean. REFUSED; this is a finding, not a state to commit.`);
      yielder.ring = out.ring;
      yielder.recessions.push({ from: keeper.id, receded: out.receded, mostBack: out.mostBack, forMarks: (keeper === A ? aIn : bIn).map((k) => k.id) });
    }
  }

  // ── phase 4 · round, restate the claim ─────────────────────────────────────
  const report = [], edits = [];
  for (const b of built) {
    const rounded = b.ring.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    const bb = polygonBBox(rounded);
    const at = { x: (bb.minx + bb.maxx) / 2, y: (bb.miny + bb.maxy) / 2 };
    const extent = { w: bb.maxx - bb.minx, h: bb.maxy - bb.miny };
    edits.push({ id: b.id, at, extent, points: rounded });
    report.push({
      id: b.id, by: b.regionMark.by, vertices: rounded.length,
      was: { at: b.regionMark.at, extent: b.regionMark.extent }, now: { at, extent },
      kids: b.kids.length,
      outside: b.kids.filter((k) => !rectInsideRing(rounded, markRect(k))).map((k) => k.id),
      smoothing: b.smoothing, recessions: b.recessions,
    });
  }

  const collisions = [];
  for (let i = 0; i < edits.length; i++)
    for (let j = i + 1; j < edits.length; j++)
      if (!ringsDisjoint(edits[i].points, edits[j].points)) collisions.push(`${edits[i].id} x ${edits[j].id}`);
  if (collisions.length)
    throw new Error(`the rings still share ground after the recession: ${collisions.join(", ")} — REFUSED, do not commit this state`);

  return { report, edits };
}

// THE OUTSIDER LIST USED TO BE EMITTED HERE, and is not any more (S45'''s seventh
// refusal, 2026-08-24). This tool is hand-run against the atlas; the settlement
// sweep is not, and it publishes marks and performs re-homes — so a list written
// here went stale the moment a settlement touched the map, and the biconditional
// it feeds went false with it. Once a ring lives in a region'''s own points: the
// list needs no atlas at all, so it moved to where the record is recomputed:
// tools/region-outsiders.mjs, emitted at every fold by marks-fold. This tool
// keeps the job that actually needs the drawing — TRACING RINGS.

function printReport(report) {
  for (const r of report) {
    console.log(`\n${r.id}  (${r.by})  ${r.vertices} vertices, ${r.kids} marks in subtree`);
    console.log(`  claim: at(${r.was.at.x},${r.was.at.y}) ${r.was.extent.w}x${r.was.extent.h}  ->  at(${r.now.at.x},${r.now.at.y}) ${r.now.extent.w}x${r.now.extent.h}`);
    if (r.smoothing) {
      const sm = r.smoothing;
      console.log(`  SMOOTHED: ${sm.before} -> ${sm.after} vertices (${sm.dropped} thinned away), boundary moved at most ${Math.round(sm.mostMoved)} m`);
    }
    for (const rc of r.recessions)
      console.log(`  RECEDED off ${rc.from}: ${rc.receded} radius pullback(s), up to -${Math.round(rc.mostBack)} m — that ground holds ${rc.forMarks.join(", ") || "no resident of either"}`);
    if (r.outside.length) console.log(`  OUTSIDE the ring (heads-up list): ${r.outside.length} — ${r.outside.slice(0, 6).join(", ")}${r.outside.length > 6 ? ", …" : ""}`);
  }
}

console.log(`atlas: ${resolve(ATLAS).replaceAll("\\", "/")}`);
console.log(`transform: world_m = (atlas_px - (${ORIGIN_PX.x},${ORIGIN_PX.y})) x ${M_PER_PX}   [skeleton _grid.origin + render-town CENTRE_XY]`);

// ── write ────────────────────────────────────────────────────────────────────
function writeRegion(e) {
  const file = join(regionDir(e.id), "mark.md");
  const src = readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  if (lines[0].trim() !== "---") throw new Error(`${file}: not a frontmatter record`);
  const close = lines.indexOf("---", 1);
  if (close < 0) throw new Error(`${file}: frontmatter never closes`);
  const at = `at: { x: ${e.at.x}, y: ${e.at.y} }`;
  const extent = `extent: { w: ${e.extent.w}, h: ${e.extent.h} }`;
  const pts = "points: " + e.points.map((p) => `${p.x},${p.y}`).join(" ");
  const head = lines.slice(1, close);
  const iAt = head.findIndex((l) => /^at:/.test(l));
  const iEx = head.findIndex((l) => /^extent:/.test(l));
  const iPt = head.findIndex((l) => /^points:/.test(l));
  if (iAt < 0 || iEx < 0) throw new Error(`${file}: no at:/extent: to restate as the ring's bbox`);
  head[iAt] = at;
  head[iEx] = extent;
  if (iPt >= 0) head[iPt] = pts; else head.splice(iEx + 1, 0, pts);
  writeFileSync(file, [lines[0], ...head, ...lines.slice(close)].join(eol));
}

// ── run ──────────────────────────────────────────────────────────────────────
//
// ONE PASS, and the absence of a loop is the pivot showing through. While the
// rings bent to hold residents, writing a ring moved a frame, which moved the
// residents, which changed what the next ring had to hold — a genuine fixpoint,
// and the generator iterated to it. A traced ring depends on the atlas, its
// smoothing on the trace, and its recession on the other rings; none of them
// depend on where anybody lives. So the answer does not move when the record
// does, and a second pass would have nothing to say.
//
// The frame law still carries the residents once: restating a region's `at` as
// its ring's bbox moves the region's centre, and a bound child travels with it.
// That is why the outsider list is computed from a RELOADED tree — the marks as
// they stand after the write, not as they stood before it.
// ── --trace <id>: the ring, printed, for a region the pipeline cannot bend ──
//
// This is how a hand-planted ring stops being hand-typed. The Headland's mark
// carries numbers; this prints the same numbers from the drawing, so the two can
// be compared instead of believed. It runs the trace and the transform and
// nothing else — no bend, no recession, no smoothing, no write.
const TRACE = argOf("--trace", null);
if (TRACE) {
  if (!TRACE_ONLY.includes(TRACE) && !REGION_IDS.includes(TRACE))
    throw new Error(`--trace ${TRACE}: not a region this file knows how to trace`);
  // trace in atlas pixels, transform to metres, THEN clip against the rings the
  // record actually holds — the order matters and is the whole of the bug that
  // preceded it (see the note in atlasRingFor's the-headland branch)
  const ring = clipToNeighbours(TRACE, atlasRingFor(TRACE).map(toWorld), loadMarks(MARKS_DIR));
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const r = (n) => Math.round(n * 10) / 10;
  const clipped = TRACE_ONLY.includes(TRACE);
  console.log(`${TRACE} — traced from the atlas, ${ring.length} vertices, not bent and not smoothed`
    + `${clipped ? ", clipped at its neighbours' recorded rings (border, not enter)" : ""}\n`);
  console.log(`at: { x: ${r((minX + maxX) / 2)}, y: ${r((minY + maxY) / 2)} }`);
  console.log(`extent: { w: ${r(maxX - minX)}, h: ${r(maxY - minY)} }`);
  console.log(`points: ${ring.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")}`);
  process.exit(0);
}

const { report, edits } = buildAll(loadMarks(MARKS_DIR));
printReport(report);

if (!WRITE) {
  console.log(`\n(report only \u2014 nothing written. Pass --write to put these rings into the records.)`);
} else {
  for (const e of edits) writeRegion(e);
  console.log(`\n${edits.length} region ring(s) written.`);
  console.log(`The heads-up list is NOT written here \u2014 it is fold-derived now. Re-fold to regenerate it:`);
  console.log(`  node tools/marks-fold.mjs --stakes stakes.json`);
  console.log(`Then run \`node tools/mark-lint.mjs\` and the suite.`);
}
