#!/usr/bin/env node
// region-wash-gen.mjs — a REGION'S WASH, traced from its own ring.
//
//   node tools/region-wash-gen.mjs                       # report only, writes nothing
//   node tools/region-wash-gen.mjs --write               # stage the SVGs + manifest, plant the pointers
//   node tools/region-wash-gen.mjs --write --wall <login>   # the shelf wall the conductor will upload under
//
// THE RULING THIS SERVES (Keemin, 2026-09-09, the atlas sitting): "the goal
// should be to try to replicate the visuals of World 1.0 [the Atlas]" — and
// the sitting's word for regions: region washes as SVG, linked to the region
// mark by a POINTER; nothing invented for a region that has no ring.
//
// AGREEMENT BY CONSTRUCTION. The wash is not drawn and then fitted to the
// region; it IS the region's ring, in world metres, coloured. The SVG's viewBox
// is the ring's bounding box and its polygon is the ring vertex for vertex, so
// any reader that hangs the picture over the mark's extent (the lint holds a
// ringed mark's extent equal to its ring's bbox; measured true for all 13 on
// 2026-09-09) lands it exactly, and a ring that moves makes a wash that no
// longer matches — which tools/region-wash.test.mjs reads back from the file.
//
// THE PALETTE IS THE ATLAS'S OWN, one hex per region, read out of the town's
// renderer (PROJECTS/build-the-town/atlas/render-town.mjs @ town 715eb65f:
// REGION_LAYOUT[*].wash, THRESHOLD_WASH, TOWN_CENTRE_WASH, and the Headland's
// provisional block) and confirmed as the two `fill="…"` values inside each
// region group of the frozen drawing (site jetto/atlas-l4-retire @ 3720b724,
// md5 f74fd90c…). The treatment is the Atlas's `regionWashLayer` translated
// from px to metres: a soft inner blob over a flat outer, and a hairline.
//
// THE OUTER EDGE IS HARD AND IT IS THE RING. The Atlas blurred both blobs and
// let the outer one spill 8% past the layout ellipse; an SVG hung in an
// <image> is clipped to its viewBox, so a blur at the edge would clip flat at
// the four tangent points where the ring touches its bbox. So the outer polygon
// is the ring itself, unblurred, at the Atlas's outer opacity — the wash's
// edge is the region's legal edge — and the softness lives on the INNER blob,
// the ring shrunk about its centroid so its blur stays inside the frame.
//
// THE POINTER IS THE PRECEDENT'S FIELD. `image:` (tools/mark-lint.mjs § 2.5;
// the media-shelf pointer) is the one pointer shape with readers on both rails
// — fold → world-state.json, world_investigate, spectator/viewer.mjs — and the
// media door is "THE ONE DOOR THAT TAKES SVG" (office src/media.mjs, the SVG
// ruling of 2026-08-20). The door keys an object by the sha256 of its bytes
// (media/<wall>/<sha256>.svg), so the URL is known before the upload: the
// pointer is planted against the staged file's own hash, and it answers the
// day the conductor runs the town's upload route. Until then it is a dangling
// pointer, which the viewer's wash layer treats as "nothing drawn, named in
// the page's receipt" — never a broken glyph.
//
// WHAT READS THE VALUE THIS WRITES: marks-fold.mjs carries `image` into
// world-state.json; spectator/viewer.mjs § the wash layer (regionWashSVG,
// inside townGround) draws it; the office's world_investigate returns it.
//
// A REGION ALREADY WEARING AN IMAGE IS LEFT ALONE (the 08-21 backfill's law 3,
// kept): a resident-hung picture is never overwritten, and that same rule is
// what makes a second run a no-op.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { REGION_SLUGS } from "./region-outsiders.mjs";
import { withImageField } from "./home-image-backfill.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** where the staged washes live in this repo (assets for the shelf, kept here so the hash is reviewable) */
export const WASH_DIR = join(ROOT, "spectator", "washes");
export const MANIFEST = join(WASH_DIR, "manifest.json");
export const SHELF_HOST = "https://media.postmark.town";
/** the town's own wall — the Atlas's washes are the town's drawing of a region (Iris's hand), not the holder's;
 *  `the-town` has no household of its own and its marks' images already sit on this wall */
export const DEFAULT_WALL = "keeminlee";

/** the Atlas's wash hex per region slug — render-town.mjs @ town 715eb65f, and the frozen drawing's own fills */
export const ATLAS_WASH = Object.freeze({
  "the-town-centre": "#c8a86a",          // TOWN_CENTRE_WASH — "lamplit amber"
  "the-trueing-terrace": "#7d8f86",
  "the-lanternseed-gardens": "#7a9c5a",
  "the-threshold-district": "#6b7a8c",   // THRESHOLD_WASH — the four terraces' fog-grey
  "the-long-run": "#a8895a",
  "the-protected-grove": "#4a7d5f",
  "the-doubled-coast": "#8f7a9c",        // "the crystal's twilight violet"
  "aelyria": "#b3985c",                  // "sun-gold"
  "the-reach": "#5f7a72",
  "the-east-window-district": "#c6a184", // "between gold and rose"
  "the-high-ground": "#9c9178",
  "evermoon": "#3d4a6b",                 // "moonlit-indigo"
  "the-headland": "#7c8b9c",             // the provisional wash
});

// the Atlas's own numbers (regionWashLayer), in metres at 5 m per atlas px
export const WASH_OUTER_OPACITY = 0.16;
export const WASH_INNER_OPACITY = 0.20;
export const WASH_LINE_OPACITY = 0.35;
export const WASH_INNER_SCALE = 0.94;   // the inner blob, shrunk about the centroid so its blur stays inside the frame
export const WASH_BLUR_M = 30;          // softWash stdDeviation 6 px × 5 m
export const WASH_LINE_M = 5;           // the Atlas hairline, 1 px

const n = (v) => Number(v).toFixed(1);
const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });

/** the ring in {x,y}, or null */
export function ringOf(mark) {
  if (!Array.isArray(mark?.points) || mark.points.length < 3) return null;
  const ring = mark.points.map(pt);
  return ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? ring : null;
}

export function bboxOf(ring) {
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function centroidOf(ring) {
  return ring.reduce((s, p) => ({ x: s.x + p.x / ring.length, y: s.y + p.y / ring.length }), { x: 0, y: 0 });
}

/** The wash: one SVG in WORLD METRES whose frame is the ring's bbox. Deterministic bytes. */
export function washSVG(mark, hex) {
  const ring = ringOf(mark);
  if (!ring) throw new Error(`${mark?.id}: no ring — a region without a ring gets no wash`);
  if (!/^#[0-9a-f]{6}$/.test(String(hex))) throw new Error(`${mark.id}: wash colour must be a #rrggbb hex (got ${hex})`);
  const b = bboxOf(ring);
  const c = centroidOf(ring);
  const outer = ring.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
  const inner = ring.map((p) => `${n(c.x + (p.x - c.x) * WASH_INNER_SCALE)},${n(c.y + (p.y - c.y) * WASH_INNER_SCALE)}`).join(" ");
  const slug = String(mark.id).split("/").pop();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(b.minX)} ${n(b.minY)} ${n(b.w)} ${n(b.h)}" width="${n(b.w)}" height="${n(b.h)}">`
    + `<title>${slug} — the region's wash, traced from ${mark.id}</title>`
    + `<!-- world metres; the frame is the ring's bbox; the outer polygon is the ring, vertex for vertex (${ring.length}); colour ${hex} from the Atlas -->`
    + `<defs><filter id="w" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${WASH_BLUR_M}"/></filter></defs>`
    + `<polygon class="outer" points="${outer}" fill="${hex}" fill-opacity="${WASH_OUTER_OPACITY}"/>`
    + `<polygon class="inner" points="${inner}" fill="${hex}" fill-opacity="${WASH_INNER_OPACITY}" filter="url(#w)"/>`
    + `<polygon class="line" points="${outer}" fill="none" stroke="${hex}" stroke-opacity="${WASH_LINE_OPACITY}" stroke-width="${WASH_LINE_M}" stroke-linejoin="round"/>`
    + `</svg>\n`;
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** the URL the media door will answer with for these bytes on that wall — media.mjs: media/<household>/<sha256>.<ext> */
export const washPointer = (bytes, wall = DEFAULT_WALL) => `${SHELF_HOST}/media/${wall}/${sha256(bytes)}.svg`;

/** every region on the roster: its mark from the TREE (a wash is planted where the mark stands), or the reason it has none */
export function planWashes(marks, { slugs = REGION_SLUGS, palette = ATLAS_WASH, wall = DEFAULT_WALL } = {}) {
  const rows = [];
  for (const slug of slugs) {
    const mark = marks.find((m) => String(m?.id ?? "").split("/")[1] === slug && ringOf(m));
    const hex = palette[slug];
    if (!mark) { rows.push({ slug, state: "no-ring", why: "no mark on the record carries a ring under this slug — nothing drawn (the sitting's question 1)" }); continue; }
    if (!hex) { rows.push({ slug, id: mark.id, state: "no-colour", why: "the Atlas never painted this region — no hex to trace with" }); continue; }
    const svg = washSVG(mark, hex);
    const bytes = Buffer.from(svg, "utf8");
    const sha = sha256(bytes);
    const pointer = washPointer(bytes, wall);
    const existing = typeof mark.image === "string" && mark.image.trim() ? mark.image.trim() : null;
    rows.push({
      slug, id: mark.id, by: mark.by, vertices: ringOf(mark).length, hex, bytes: bytes.length, sha256: sha, pointer, wall,
      file: join(WASH_DIR, `${slug}.svg`), dir: mark._dir, mark,
      state: existing ? (existing === pointer ? "planted" : "kept") : "plant",
      existing,
    });
  }
  return rows;
}

export function applyWashes(rows, { dry = false, read = readFileSync, save = writeFileSync } = {}) {
  const staged = [], planted = [], kept = [];
  if (!dry && !existsSync(WASH_DIR)) mkdirSync(WASH_DIR, { recursive: true });
  for (const row of rows) {
    if (!row.pointer) continue;
    const svg = washSVG(row.mark, row.hex);
    if (!dry) save(row.file, svg);
    staged.push(row.slug);
    if (row.state === "kept") { kept.push(row.slug); continue; }
    const path = join(row.dir, "mark.md");
    const next = withImageField(read(path, "utf8"), row.pointer);
    if (next === null) { kept.push(row.slug); continue; }   // the file carries one the fold did not show
    if (!dry) save(path, next);
    planted.push(row.slug);
  }
  return { staged, planted, kept };
}

export function manifestOf(rows, { wall = DEFAULT_WALL } = {}) {
  return {
    _readme: "the region washes staged for the town's media shelf — one SVG per region ring, traced by tools/region-wash-gen.mjs; the pointer on each region mark is media/<wall>/<sha256>.svg and answers once the conductor uploads the file through the town's route (upload_media / POST /media). Regenerate, never hand-edit.",
    generated_by: "tools/region-wash-gen.mjs",
    wall,
    washes: rows.filter((r) => r.pointer).map((r) => ({ slug: r.slug, mark: r.id, by: r.by, vertices: r.vertices, hex: r.hex, bytes: r.bytes, sha256: r.sha256, pointer: r.pointer, file: `spectator/washes/${r.slug}.svg` })),
    without_a_ring: rows.filter((r) => !r.pointer).map((r) => ({ slug: r.slug, why: r.why })),
  };
}

// `realpathSync` on both sides is what makes a junction-invoked run still run
// (the 09-08 CLI-guard class): argv[1] keeps the path as typed, import.meta.url
// is the real one.
const isMain = Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const WRITE = argv.includes("--write");
  const wall = opt("--wall", DEFAULT_WALL);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(wall)) { console.error(`FATAL: --wall ${JSON.stringify(wall)} is not a shelf login`); process.exit(2); }
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const rows = planWashes(marks, { wall });
  const { staged, planted, kept } = applyWashes(rows, { dry: !WRITE });
  if (WRITE) writeFileSync(MANIFEST, JSON.stringify(manifestOf(rows, { wall }), null, 2) + "\n");
  console.log(`${WRITE ? "" : "[dry] "}${staged.length} washes ${WRITE ? "staged" : "would be staged"} under ${relative(ROOT, WASH_DIR)} on wall ${wall}:`);
  for (const r of rows) {
    if (!r.pointer) { console.log(`  ✗ ${r.slug.padEnd(26)} ${r.state}: ${r.why}`); continue; }
    const mark = planted.includes(r.slug) ? (WRITE ? "✓ planted" : "✓ would plant") : kept.includes(r.slug) ? "· kept (already wears an image)" : "✓";
    console.log(`  ${mark.padEnd(34)} ${r.slug.padEnd(26)} ${r.id.padEnd(44)} ${r.vertices} vertices  ${r.hex}  ${r.bytes} B  sha256 ${r.sha256.slice(0, 12)}…`);
    console.log(`      ${r.pointer}`);
  }
  console.log(`\npending upload: ${rows.filter((r) => r.pointer).length} files → the conductor runs the town's upload route on the box; the pointers answer then.`);
  console.log(`next: node tools/mark-lint.mjs && node --test tools/region-wash.test.mjs`);
}
