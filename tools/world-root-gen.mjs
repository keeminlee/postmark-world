#!/usr/bin/env node
// world-root-gen.mjs — generate the root mark + the terrain marks, BY EXTRACTION
// from WORLD/TERRAIN/skeleton.json (never hand-typed; sibling of
// world-terrain-gen.mjs). Deterministic and idempotent: re-running rewrites the
// same records. These are committed as records — the constitution tier of the
// one spatial tree (schema v2, 07-22-night ruling).
//
//   node tools/world-root-gen.mjs            # write WORLD/marks/let-there-be-light/**
//   node tools/world-root-gen.mjs --dry      # print what it would write
//
// RULINGS THIS OBEYS:
// - The root mark is `let-there-be-light`: by: the-town, tier: constitution,
//   extent = the whole world, body = the charter establishing line.
// - Terrain features become marks UNDER it (river, seas, lochan, garrison lake,
//   locks, coasts, upward falls, Pando, ferry's route), by: the-town, tier:
//   constitution. Two-precision geometry: the mark carries a COARSE bounding
//   rect as the CLAIM; skeleton.json remains beneath as the precise survey.
// - `by: the-town` is the town-tier author (flagged reviewable — Wright's call).
// - Pando is a horizon object, not heightfield ground (decision 008): its mark
//   carries `far: true`, and the containment check exempts it (it sits beyond
//   the world's ground extent by construction).

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DRY = process.argv.includes("--dry");
const SKELETON = join(ROOT, "WORLD/TERRAIN/skeleton.json");
const MARKS_ROOT = join(ROOT, "WORLD/marks/let-there-be-light");
const TODAY = "2026-07-22"; // the ruling date — deterministic, not wall-clock

const skeleton = JSON.parse(readFileSync(SKELETON, "utf8"));

// ---- coarse bounding rect from a feature's own geometry (the CLAIM) ----------
function pointsOf(f) {
  const pts = [];
  const push = (p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push(p); };
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []); // at_m is an array (locks) or an object (a point)
  for (const p of arr(f.centerline_m)) push(p);
  for (const p of arr(f.line_m)) push(p);
  for (const p of arr(f.at_m)) push(p);
  for (const p of arr(f.trees_m)) push(p);
  if (f.center_m) push(f.center_m);
  return pts;
}
function boundingRect(f) {
  const pts = pointsOf(f);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // widen by the feature's own width band + a small pad so the claim covers the body
  const wPad = Math.max(...(pts.map((p) => p.w_m ?? 0)), f.rx_m ? f.rx_m * 2 : 0, 40);
  const hPad = Math.max(f.ry_m ? f.ry_m * 2 : 0, 40);
  return {
    at: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) },
    extent: { w: Math.max(2, Math.round(maxX - minX + wPad)), h: Math.max(2, Math.round(maxY - minY + hPad)) },
  };
}

// ---- short claim body (<=150), never the long survey receipt -----------------
function claimBody(f) {
  const first = String(f.receipt ?? f.note ?? f.id).split(/[.;—]/)[0].replace(/\s+/g, " ").trim();
  const body = `${niceName(f.id)} — ${first}`;
  return body.length <= 148 ? body : body.slice(0, 147).replace(/\s+\S*$/, "") + "…";
}
const niceName = (id) => id.replace(/^the-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const written = [];

// ---- 1. the root mark --------------------------------------------------------
// extent covers the whole world INCLUDING the horizon (Pando at ~135 km), so
// every mark and terrain feature nests within it. A bounding claim, not drama.
const worldExtent = 320000; // ~±160 km: contains the on-map world and the far horizon
if (!DRY && existsSync(MARKS_ROOT)) {
  // idempotent: clear only the-town-authored terrain children, never resident marks
  for (const f of allFeatures()) { const d = join(MARKS_ROOT, f.id); if (existsSync(d)) rmSync(d, { recursive: true, force: true }); }
}
writeRootAndTerrain();

function allFeatures() {
  return [...(skeleton.features ?? []), ...(skeleton.far_features ?? [])];
}

function writeRootAndTerrain() {
  // root
  writeMarkRaw("", {
    kind: "sited", by: "the-town", tier: "constitution", date: TODAY,
    at: { x: 0, y: 0 }, extent: { w: worldExtent, h: worldExtent },
  }, "Let there be light. Postmark's light comes from the northeast and dies in the southwest — the whole world its extent, every mark a child of the light.");

  // terrain marks, one per feature, directly under root
  for (const f of skeleton.features ?? []) {
    const box = boundingRect(f);
    if (!box) continue; // route/sea with no point geometry: skip point-claim (survey carries them)
    writeMarkRaw(f.id, {
      kind: "sited", by: "the-town", tier: "constitution", date: TODAY,
      at: box.at, extent: box.extent, survey: `terrain:${f.id}`,
    }, claimBody(f));
  }
  // far features (Pando): horizon object, exempt from ground containment
  for (const f of skeleton.far_features ?? []) {
    const proj = projectHorizon(f);
    writeMarkRaw(f.id, {
      kind: "sited", by: "the-town", tier: "constitution", date: TODAY, far: true,
      at: proj, extent: { w: 4000, h: 4000 }, survey: `terrain:${f.id}`,
    }, claimBody(f));
  }
}

// project a far feature onto a coarse horizon coordinate from bearing + distance
function projectHorizon(f) {
  const U = { N: [0, -1], NE: [0.7071, -0.7071], E: [1, 0], SE: [0.7071, 0.7071], S: [0, 1], SW: [-0.7071, 0.7071], W: [-1, 0], NW: [-0.7071, -0.7071] };
  const u = U[f.bearing] ?? [0, -1];
  return { x: Math.round(u[0] * (f.distance_m ?? 0)), y: Math.round(u[1] * (f.distance_m ?? 0)) };
}

// writeMarkRaw — build the mark.md text with the exact inline-object frontmatter
// the shared parseRecord reads ({ x: .., y: .. } / { w: .., h: .. }).
function writeMarkRaw(relDir, fm, body) {
  const dir = relDir ? join(MARKS_ROOT, relDir) : MARKS_ROOT;
  const L = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v == null) continue;
    if (k === "at") L.push(`at: { x: ${v.x}, y: ${v.y} }`);
    else if (k === "extent") L.push(`extent: { w: ${v.w}, h: ${v.h} }`);
    else L.push(`${k}: ${v}`);
  }
  L.push("---", "", body, "");
  const text = L.join("\n");
  written.push({ path: join("let-there-be-light", relDir, "mark.md").replace(/\\/g, "/"), text });
  if (!DRY) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "mark.md"), text); }
}

// ---- report ------------------------------------------------------------------
console.log(`world-root-gen: ${written.length} record(s) ${DRY ? "(dry run)" : "written"} under WORLD/marks/let-there-be-light/`);
for (const w of written) console.log(`  ${w.path}`);
