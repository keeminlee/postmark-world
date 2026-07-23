#!/usr/bin/env node
// regions-manifest-gen.mjs — generate seeding/regions-manifest.json for the
// region pre-mark fleet: every region from the live atlas, with a bounding
// extent derived by extraction from the renderer's own REGION_LAYOUT washes —
// never hand-copied (sibling of seed-manifest-gen.mjs; fix the class).
//
// Extents are ATLAS-SEEDED CLAIMS at 5 m/px (the ruled invitation mechanics:
// "extents seeded from the ratified atlas"), coarse by construction — a wash
// ellipse's bounding rect. The pre-mark is an invitation; the founder may
// reshape it. Drawn width remains not-survey-data for PLACEMENT disputes; for
// the invitation extent it is exactly the ruled seed.
//
// Usage: node tools/regions-manifest-gen.mjs [--atlas <dir>] [--pages <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const ATLAS = argOf("--atlas", null);
if (!ATLAS) throw new Error("--atlas <dir> required (point at the live clone's atlas dir)");
const PAGES_ROOT = argOf("--pages", resolve(ATLAS, "../../.."));
console.log("atlas source:", ATLAS);
console.log("white-pages root:", PAGES_ROOT);

const K = 5; // m per atlas px (RULED 2026-07-17)

const rtSrc = readFileSync(join(ATLAS, "render-town.mjs"), "utf8");
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
const LAYOUT = extractObjMultiline("REGION_LAYOUT");
const ORIGIN = extractObjInline("CENTRE_XY");

// Two regions are drawn by dedicated code, not the layout table — extracted
// from their own constants (the renderer's text, same law):
// the Centre's single wash spanning the crossing, and the Threshold's four
// descending terraces (bounding box of all four).
const centreShape = extractObjInline("TOWN_CENTRE_SHAPE");
LAYOUT["the-town-centre"] = { cx: centreShape.cx, cy: centreShape.cy, rx: centreShape.rx, ry: centreShape.ry };
function extractArr(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!m) throw new Error(`extraction failed: const ${name} not found`);
  return new Function("return " + m[1])();
}
const terraces = extractArr("THRESHOLD_TERRACES");
{
  const xs = terraces.flatMap((t) => [t.cx - t.rx, t.cx + t.rx]);
  const ys = terraces.flatMap((t) => [t.cy - t.ry, t.cy + t.ry]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  LAYOUT["the-threshold-district"] = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
}
console.log(`extracted: ${Object.keys(LAYOUT).length} region layouts (incl. 2 bespoke), origin (${ORIGIN.x},${ORIGIN.y})`);

const town = JSON.parse(readFileSync(join(ATLAS, "town.json"), "utf8"));
const regions = town.regions ?? [];
if (!regions.length) throw new Error("no regions in town.json — wrong atlas source?");

const m = (px, py) => ({ x: Math.round((px - ORIGIN.x) * K), y: Math.round((py - ORIGIN.y) * K) });

// The Centre is the one region that belongs to everyone — "tended, never
// owned" (its own charter). Its pre-mark authors as the town, not a household.
const TOWN_TIER = { "the-town-centre": "tended, never owned (its own charter) — authors as by: the-town, not the keeper's household" };

const entries = [];
const problems = [];
for (const r of regions) {
  const lay = LAYOUT[r.id];
  if (!lay) { problems.push(`region "${r.id}" (${r.holder}) has NO layout in REGION_LAYOUT`); continue; }
  const regionMd = join("WHITE_PAGES", r.holder, "HOME", "REGION.md");
  const sources = { town_json_body: true, region_md: null, regions_md: "PROJECTS/build-the-town/atlas/REGIONS.md" };
  if (existsSync(join(PAGES_ROOT, regionMd))) sources.region_md = regionMd.replaceAll("\\", "/");
  entries.push({
    region_id: r.id,
    name: r.name,
    holder: r.holder,
    status: r.status,
    style: r.style ?? null,
    home_ids: r.home_ids ?? [],
    author_note: TOWN_TIER[r.id] ?? null,
    atlas_wash: { cx: lay.cx, cy: lay.cy, rx: lay.rx, ry: lay.ry },
    grid_m: { at: m(lay.cx, lay.cy), extent: { w: Math.round(2 * lay.rx * K), h: Math.round(2 * lay.ry * K) } },
    sources,
  });
}
if (problems.length) {
  console.error("MANIFEST REFUSED — regions missing layouts:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
const unmatched = Object.keys(LAYOUT).filter((id) => !regions.some((r) => r.id === id));
if (unmatched.length) console.log("layouts with no roster region (info — provisional/renderer-only ground stays out):", unmatched.join(", "));

const manifest = {
  _note: "Region pre-mark fleet input. Extents are atlas-seeded bounding rects of the drawn washes at 5 m/px (the ruled invitation seed) — coarse claims the founder may reshape; the extent binds nobody at ✦0. Bodies translate the FOUNDER'S OWN WORDS (town.json region charter + their REGION.md).",
  _derived: {
    atlas_source: String(ATLAS).replaceAll("\\", "/"),
    origin_atlas_px: ORIGIN,
    m_per_px: K,
    generated_by: "tools/regions-manifest-gen.mjs",
  },
  regions: entries,
};
mkdirSync(join(ROOT, "seeding"), { recursive: true });
const out = join(ROOT, "seeding", "regions-manifest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${out}: ${entries.length} regions`);
for (const e of entries)
  console.log(`  ${e.region_id.padEnd(26)} ${e.holder.padEnd(20)} at(${e.grid_m.at.x},${e.grid_m.at.y}) extent(${e.grid_m.extent.w}x${e.grid_m.extent.h})${e.sources.region_md ? "" : "  [no REGION.md]"}`);
