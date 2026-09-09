#!/usr/bin/env node
// region-wash-svg.mjs — one SVG wash per REGION mark, traced from the ring the
// world holds, in the colour the frozen atlas drew it.
//
// WHY THE RING AND NOT THE DRAWING'S PATH. The region marks' `points:` rings
// were themselves sampled off the atlas renderer's wash path
// (tools/region-rings-gen.mjs, 2026-08-21/22: "use polygons to represent the
// regions so they fit based on the atlas") — so the ring IS the drawing's wash,
// already in the record's frame (grid metres) and already what the fold's
// containment reads (the 27-of-111 region-line question is a question about
// these rings). Extracting the drawing's path a second time would be a second
// definition of the same shape in a retired pixel frame. The COLOUR is the
// drawing's own: render-town.mjs REGION_LAYOUT[id].wash / TOWN_CENTRE_WASH /
// THRESHOLD_WASH at town 715eb65f, pinned in the table below with the source.
//
// THE SVG'S FRAME IS THE MARK'S BBOX. viewBox = the ring's bounding box in
// metres, polygon vertices relative to it — so a reader that hangs this over the
// mark's at/extent (which tools/mark-lint.mjs holds equal to the ring's bbox)
// with preserveAspectRatio="none" lands the wash exactly on the ground the ring
// claims. The wash carries no blur filter (the drawing's softWash): a filter's
// margins bleed past the bbox the pointer is hung on.
//
// WHAT READS THE OUTPUT. The SVG bytes go through the media door (the one door
// that takes SVG, 2026-08-20) and come back as a shelf URL; that URL is planted
// as `image:` on the region mark (the pointer precedent, tools/parcel-image-
// pointer.mjs says why); spectator/viewer.mjs § the wash layer draws an SVG
// pointer on a ringed mark UNDER the marks, above the ground (isWashPointer).
// Nothing here uploads: bytes are not record, and the upload is a credentialed
// act (src/media.mjs in the office).
//
// Regions the world holds NO ring for are NOT invented here: they are listed in
// the report file this writes, and the list is the sitting's question.
//
//   node tools/region-wash-svg.mjs --out <dir>        # writes <dir>/<by>--<slug>.svg + <dir>/regions.json

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks } from "./marks-fold.mjs";

// The twelve holders of the frozen atlas (town.json `regions[]` at 715eb65f) and
// their wash, read off render-town.mjs at the same sha. The Headland is drawn
// there (HEADLAND_COAST, provisional 2026-07-21) and has no mark in the world.
export const REGION_WASH = Object.freeze({
  "the-town/the-town-centre": "#c8a86a",                      // TOWN_CENTRE_WASH — "lamplit amber"
  "wright/the-trueing-terrace": "#7d8f86",                     // REGION_LAYOUT
  "rei/the-lanternseed-gardens": "#7a9c5a",
  "limen/the-threshold-district": "#6b7a8c",                   // THRESHOLD_WASH — drawn as three terraces, one colour
  "carta/the-long-run": "#a8895a",
  "sol-of-garrison/the-protected-grove": "#4a7d5f",
  "spar/the-doubled-coast": "#8f7a9c",
  "aion-solare/aelyria": "#b3985c",
  "orion-by-the-fire/the-reach": "#5f7a72",
  "east-facing-window/the-east-window-district": "#c6a184",
  "sage-reeves/the-high-ground": "#9c9178",
  "caelum/evermoon": "#3d4a6b",
});
export const DRAWN_WITHOUT_A_MARK = Object.freeze([
  { id: "the-headland", wash: "#7c8b9c", why: "drawn in the frozen atlas from HEADLAND_COAST (provisional, 2026-07-21); no mark in the world" },
]);
// The drawing's own three passes (regionWashLayer): fill .16 + .20 over the same
// shape, stroke .35. Flattened here to one fill at their sum and the same stroke.
export const WASH_FILL_OPACITY = 0.36;
export const WASH_STROKE_OPACITY = 0.35;

export function ringOf(mark) {
  const ring = Array.isArray(mark?.points) && mark.points.length >= 3 ? mark.points : null;
  return ring ? ring.map((v) => (Array.isArray(v) ? { x: Number(v[0]), y: Number(v[1]) } : { x: Number(v.x), y: Number(v.y) })) : null;
}

/** The SVG text for one ringed mark in one colour, or null where the mark has no ring. */
export function washSVGFor(mark, wash) {
  const pts = ringOf(mark);
  if (!pts) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX).toFixed(2), h = (maxY - minY).toFixed(2);
  const poly = pts.map((p) => `${(p.x - minX).toFixed(2)},${(p.y - minY).toFixed(2)}`).join(" ");
  const strokeW = (Math.max(Number(w), Number(h)) / 400).toFixed(2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" data-region="${mark.id}" data-wash="${wash}">\n`
    + `<polygon points="${poly}" fill="${wash}" fill-opacity="${WASH_FILL_OPACITY}"/>\n`
    + `<polygon points="${poly}" fill="none" stroke="${wash}" stroke-opacity="${WASH_STROKE_OPACITY}" stroke-width="${strokeW}"/>\n`
    + `</svg>\n`;
  return { svg, bbox: { minX, minY, w: Number(w), h: Number(h) }, vertices: pts.length };
}

export function washReport(marks, table = REGION_WASH) {
  const byId = new Map(marks.map((m) => [m.id, m]));
  const rows = [];
  for (const [id, wash] of Object.entries(table)) {
    const m = byId.get(id);
    if (!m) { rows.push({ id, wash, ring: false, why: "no mark in the world" }); continue; }
    const made = washSVGFor(m, wash);
    if (!made) { rows.push({ id, wash, ring: false, why: "mark carries no points: ring" }); continue; }
    rows.push({ id, wash, ring: true, vertices: made.vertices, bbox: made.bbox, at: m.at, extent: m.extent, image: m.image ?? null, svg: made.svg });
  }
  for (const d of DRAWN_WITHOUT_A_MARK) rows.push({ ...d, ring: false });
  return rows;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const OUT = opt("--out", join(ROOT, ".region-wash-staging"));
  mkdirSync(OUT, { recursive: true });
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const rows = washReport(marks);
  for (const r of rows) {
    if (!r.ring) continue;
    r.file = join(OUT, r.id.replace("/", "--") + ".svg");
    writeFileSync(r.file, r.svg);
    r.bytes = Buffer.byteLength(r.svg);
  }
  writeFileSync(join(OUT, "regions.json"), JSON.stringify(rows.map(({ svg, ...rest }) => rest), null, 1));
  for (const r of rows) console.log(r.ring
    ? `  ✓ ${r.id}  ring ${r.vertices} vtx · bbox ${r.bbox.w}×${r.bbox.h} m · ${r.bytes} b · ${r.image ? "pointer already planted" : "no pointer yet"}`
    : `  ✗ ${r.id}  NO RING — ${r.why}`);
  console.log(`\n${rows.filter((r) => r.ring).length} washes written to ${OUT}; ${rows.filter((r) => !r.ring).length} drawn region(s) without a ring, listed in regions.json — the sitting's, not this tool's.`);
}
