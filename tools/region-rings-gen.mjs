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
// Claim-honesty (SCHEMA v2, the gate built before the first ring): after
// tracing and bending, each region's `at`/`extent` is RESTATED as the ring's
// bounding box, so the coarse claim never lies about the fine shape.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { polygonBBox, pointInPolygon, rectInsideRing, rectCorners } from "./geometry.mjs";

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
    "\nreturn { washBlob };"
)();

const LAYOUT = extractObjMultiline("REGION_LAYOUT");
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

// The stroked edge of a region wash is the INNER blob (regionWashLayer draws the
// outer at 1.08 as a soft halo and strokes the inner) — so the inner is the
// boundary a reader sees, and the inner is what the ring traces.
const washRing = (cx, cy, rx, ry, seed) => samplePath(atlasFns.washBlob(cx, cy, rx, ry, seed + "inner"));

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
function starHull(rings, n = 16) {
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

function atlasRingFor(id) {
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

// THE BEND — the union of the ring and one mark's rect, taken exactly, in polar
// coordinates about the ring's own centre.
//
// The rect is seen from the centre across one angular span. Inside that span the
// ring's radius is raised to the rect's FAR boundary, and a vertex is planted on
// each of the rect's four corner bearings — which is what makes the union exact
// rather than approximate: between two adjacent corner bearings the rect's far
// boundary IS a straight edge, and a polygon chord between two points on a
// straight line is that line. So the boundary steps out along the house's own
// walls and comes straight back — at most four new vertices, and no ground taken
// beyond the house itself plus `pad`, which keeps the boundary off the wall
// rather than on it. Radii only ever rise and the vertices stay angle-ordered,
// so a star-shaped ring stays a simple polygon.
function bendAround(ring, centre, r, pad) {
  const cs = rectCorners(r);
  const cp = cs.map((p) => polar(p, centre));
  // the minimal angular span holding all four corners
  let start = 0, span = Infinity;
  for (let i = 0; i < 4; i++) {
    let widest = 0;
    for (let j = 0; j < 4; j++) { const d = norm(cp[j].th - cp[i].th); if (d >= 0 && d > widest) widest = d; }
    const covers = cp.every((q) => { const d = norm(q.th - cp[i].th); return d >= -1e-12 && d <= widest + 1e-12; });
    if (covers && widest < span) { span = widest; start = cp[i].th; }
  }
  // A mark that straddles the ring's own centre (limen's terraces and lanterns
  // are 2.2 km bands drawn straight through the Threshold) is seen across every
  // bearing, not across a span.
  const straddles = r.x - r.w / 2 <= centre.x && centre.x <= r.x + r.w / 2 && r.y - r.h / 2 <= centre.y && centre.y <= r.y + r.h / 2;
  if (straddles) { start = -Math.PI; span = 2 * Math.PI; }
  if (!Number.isFinite(span)) throw new Error("bend: could not find the angular span of the mark being included");

  const rectReach = (th) => {
    const dir = { x: Math.cos(th), y: Math.sin(th) };
    let far = 0;
    for (let j = 0; j < 4; j++) {
      const t = raySegment(centre, dir, cs[j], cs[(j + 1) % 4]);
      if (t !== null && t > far) far = t;
    }
    return far;
  };

  const out = ring.map((v) => ({ ...polar(v, centre), atlas: v.atlas }));
  let raised = 0, added = 0, outward = 0;
  for (const v of out) {
    const d = norm(v.th - start);
    if (d < -1e-12 || d > span + 1e-12) continue;
    const reach = rectReach(v.th);
    const need = reach > 0 ? reach + pad : 0;
    if (need > v.r) { outward = Math.max(outward, need - v.r); v.r = need; raised++; }
  }
  const backToRing = (pol) => pol.map((v) => ({ ...cart(v.th, v.r, centre), atlas: v.atlas }));
  for (const q of cp) {
    const need = q.r + pad;
    const here = reachAt(backToRing(out), centre, q.th);
    if (here >= need - 1e-9) continue;
    outward = Math.max(outward, need - here);
    let ins = out.length;
    for (let i = 0; i < out.length; i++) {
      const a = out[i].th, b = out[(i + 1) % out.length].th;
      if (dth(q.th, a) > 0 && dth(b, q.th) > 0) { ins = i + 1; break; }
    }
    out.splice(ins, 0, { th: q.th, r: need, atlas: false });
    added++;
  }
  return { ring: backToRing(out), raised, added, outward };
}

// Drop a BEND-PLANTED vertex whenever the ring still holds every mark it must
// without it. A bend plants generously — four corner bearings whether or not all
// four say anything — and a boundary a resident may read should not carry a
// corner that carries no meaning. Vertices traced from the atlas are never
// dropped: they are the drawing, and thinning them would quietly turn the wash
// into a polygon nobody drew. Removing a vertex from an angle-ordered ring
// leaves it angle-ordered, so star-shapedness survives by construction.
function trimRing(ring, rects) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      if (ring[i].atlas) continue;
      const without = ring.slice(0, i).concat(ring.slice(i + 1));
      if (rects.every((r) => rectInsideRing(without, r))) { ring = without; changed = true; break; }
    }
  }
  return ring;
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

function buildAll(marks) {
  const report = [], edits = [];
  for (const id of REGION_IDS) {
    const regionMark = marks.find((m) => m.slug === id);
    if (!regionMark) throw new Error(`region mark "${id}" is not in WORLD/marks — the roster and the record disagree; reconcile before drawing`);
    let ring = atlasRingFor(id).map((p) => ({ ...toWorld(p), atlas: true }));
    const centre = { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
    assertStarShaped(ring, centre, id);

    const kids = subtreeOf(marks, id);
    const rects = kids.map(markRect);
    const tweaks = [];
    // A pad wide enough that rounding the ring to whole metres can never pull the
    // boundary back onto a wall it was drawn to clear.
    const PAD = 4;
    for (let pass = 0; pass < 8; pass++) {
      const outside = kids.filter((k) => !rectInsideRing(ring, markRect(k)));
      if (!outside.length) break;
      for (const k of outside) {
        const { ring: bent, raised, added, outward } = bendAround(ring, centre, markRect(k), PAD);
        ring = bent;
        if (raised || added) tweaks.push({ mark: k.id, by: k.by, raised, added, outward });
      }
    }
    ring = trimRing(ring, rects);

    const rounded = ring.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    const bb = polygonBBox(rounded);
    const at = { x: (bb.minx + bb.maxx) / 2, y: (bb.miny + bb.maxy) / 2 };
    const extent = { w: bb.maxx - bb.minx, h: bb.maxy - bb.miny };
    const stillOut = kids.filter((k) => !rectInsideRing(rounded, markRect(k)));

    // Ground taken that is NOT this region's: a mark outside the subtree that
    // the ring now holds. The lint refuses that too (its edge would no longer
    // name its tightest container), so a bend that annexes a neighbour is a
    // failure of this generator, not a finding for the reader to shrug at.
    const kidIds = new Set(kids.map((k) => k.id));
    const byId = new Map(marks.map((m) => [m.id, m]));
    const area = (m) => (m.extent?.w ?? 1) * (m.extent?.h ?? 1);
    const mine = extent.w * extent.h;
    const intruders = marks.filter((m) => {
      if (kidIds.has(m.id) || m.id === regionMark.id || !m.at || m.far) return false;
      if (m.kind === "predicated" || m.kind === "naming" || m.kind === "class") return false;
      if (!rectInsideRing(rounded, markRect(m))) return false;
      // Merely standing inside is not annexation: `placementParent` names the
      // TIGHTEST container, so a mark whose own directory parent is smaller than
      // this ring keeps that parent and its edge still tells the truth.
      const p = m._parentMarkId ? byId.get(m._parentMarkId) : null;
      return !p || area(p) >= mine;
    });

    edits.push({ id, at, extent, points: rounded });
    report.push({
      id, by: regionMark.by, vertices: rounded.length,
      was: { at: regionMark.at, extent: regionMark.extent }, now: { at, extent },
      kids: kids.length, stillOut: stillOut.map((k) => k.id), intruders: intruders.map((m) => m.id),
      tweaks,
    });
  }
  return { report, edits };
}

function printReport(report) {
  for (const r of report) {
    console.log(`\n${r.id}  (${r.by})  ${r.vertices} vertices, ${r.kids} marks in subtree`);
    console.log(`  claim: at(${r.was.at.x},${r.was.at.y}) ${r.was.extent.w}x${r.was.extent.h}  ->  at(${r.now.at.x},${r.now.at.y}) ${r.now.extent.w}x${r.now.extent.h}`);
    for (const t of r.tweaks)
      console.log(`  BENT for ${t.mark} (${t.by}): ${t.added} vertices added, ${t.raised} raised, up to +${Math.round(t.outward)} m outward`);
    if (r.stillOut.length) console.log(`  !! STILL OUTSIDE: ${r.stillOut.join(", ")}`);
    if (r.intruders.length) console.log(`  !! ANNEXED (not this region's): ${r.intruders.join(", ")}`);
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

// Restating a region's `at` as its ring's bbox MOVES the region's centre, and a
// bound child's numbers are offsets from that centre — so every resident inside
// travels with it (SCHEMA § the frame: "moving the parent carries it"). Their
// new world positions are what the next ring must hold, so this is a fixpoint,
// not a single pass: write, reload, re-bend, until a pass changes nothing.
const same = (a, b) =>
  a.at.x === b.at.x && a.at.y === b.at.y && a.extent.w === b.extent.w && a.extent.h === b.extent.h &&
  a.points.length === b.points.length && a.points.every((p, i) => p.x === b.points[i].x && p.y === b.points[i].y);

let pass = 0, last = null;
for (; pass < 12; pass++) {
  const { report, edits } = buildAll(loadMarks(MARKS_DIR));
  const settled = last && edits.every((e, i) => same(e, last[i]));
  if (settled || !WRITE) {
    printReport(report);
    if (!WRITE) console.log(`\n(report only, one pass — pass --write to put these rings into the records and settle the frame)`);
    else console.log(`\nsettled after ${pass} write pass(es); ${edits.length} region ring(s) in the record. Run \`node tools/mark-lint.mjs\` and the suite.`);
    break;
  }
  for (const e of edits) writeRegion(e);
  last = edits;
}
if (WRITE && pass >= 12) {
  console.error("REFUSED to settle: twelve passes and the rings are still moving — the bend and the frame are chasing each other; do not commit this state");
  process.exit(1);
}
