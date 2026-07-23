#!/usr/bin/env node
// seed-manifest-gen.mjs — generate seeding/manifest.json for the pre-mark
// seeding fleet: every PLACED home from the live atlas, with grid coordinates
// derived by extraction from the renderer's own HOME_XY anchors — never
// hand-copied (fix the class, not the instance; sibling of world-terrain-gen.mjs).
//
// The manifest is a BUILD INTERMEDIATE for the seeding fleet, not world canon —
// it lives in seeding/, outside WORLD/ (the membrane: WORLD/ contains only what
// is backed). The fleet translates residents' OWN words into 0-stamp pre-marks;
// this file just tells it who is placed, where, and which files to read.
//
// Usage: node tools/seed-manifest-gen.mjs [--atlas <dir>] [--pages <dir>]
//   --atlas  defaults to this repo's own PROJECTS/build-the-town/atlas copy;
//            point at the live clone's atlas dir for a fresh derive.
//   --pages  root containing WHITE_PAGES/ for source-path existence checks;
//            defaults to the atlas dir's repo root (atlas/../../..).
// The sources used are printed loudly either way.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const ATLAS = argOf("--atlas", join(ROOT, "PROJECTS/build-the-town/atlas"));
const PAGES_ROOT = argOf("--pages", resolve(ATLAS, "../../.."));
console.log("atlas source:", ATLAS);
console.log("white-pages root:", PAGES_ROOT);

const K = 5; // m per atlas px (RULED 2026-07-17)

// ---- extraction: the renderer's own constants, read as text, never copied
const rtSrc = readFileSync(join(ATLAS, "render-town.mjs"), "utf8");
function extractObjMultiline(name) {
  // object literal ending with "};" at column 0 (comments inside are fine)
  const m = rtSrc.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!m) throw new Error(`extraction failed: const ${name} not found in render-town.mjs — the renderer changed shape; fix the extractor, do not guess`);
  return new Function("return " + m[1])();
}
function extractObjInline(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\{[^;]*\\});`));
  if (!m) throw new Error(`extraction failed: const ${name} not found`);
  return new Function("return " + m[1])();
}
const HOME_XY = extractObjMultiline("HOME_XY");
const ORIGIN = extractObjInline("CENTRE_XY"); // Ferry's crossing — the grid origin
console.log(`extracted: ${Object.keys(HOME_XY).length} home anchors, origin (${ORIGIN.x},${ORIGIN.y})`);

const town = JSON.parse(readFileSync(join(ATLAS, "town.json"), "utf8"));
const homes = (town.homes || []).filter((h) => h.state === "placed");
if (!homes.length) throw new Error("no placed homes found in town.json — wrong atlas source?");

const m = (px, py) => ({ x: Math.round((px - ORIGIN.x) * K), y: Math.round((py - ORIGIN.y) * K) });

// Placed things that deliberately have no point anchor. Not silent drops —
// each carries its receipt and lands in manifest.special_cases for hand-seeding.
const SPECIAL_CASES = {
  "the-post-office": {
    reason: "the post office is the BOAT (Keemin, 2026-07-21) — it rides Ferry's route, not a point; its pre-mark attaches to terrain:ferrys-route",
    handling: "hand-seed by office/Worldkeeper, NOT the per-home fleet",
  },
  "the-pando-peak": {
    reason: "the HOME_XY anchor is the INSET (survey decision 006, the Alaska-style box) — a drawing convention, not geography. Decision 008: Pando stands ~135 km NW of the crossing, 4,000 m up, off-map — a far-features horizon object, not heightfield ground. Converting the inset pixel would site vermillion 4 km EAST.",
    handling: "pre-marks attach to terrain:pando-peak (already in the terrain tier); hand-seed with the far_features entry as the coordinate authority, NOT the per-home fleet",
  },
};

const entries = [];
const problems = [];
const specials = [];
for (const h of homes) {
  const special = SPECIAL_CASES[h.id];
  if (special) {
    specials.push({ household: h.resident, home_id: h.id, title: h.title, ...special });
    continue;
  }
  const xy = HOME_XY[h.id];
  if (!xy) {
    problems.push(`placed home "${h.id}" (${h.resident}) has NO anchor in HOME_XY`);
    continue;
  }
  const pagesDir = join("WHITE_PAGES", h.resident);
  const homeDir = join(pagesDir, "HOME");
  const addr = join(pagesDir, "ADDRESS.md");
  const srcNotes = [];
  if (!existsSync(join(PAGES_ROOT, homeDir))) srcNotes.push("no HOME/ dir");
  if (!existsSync(join(PAGES_ROOT, addr))) srcNotes.push("no ADDRESS.md");
  entries.push({
    household: h.resident,
    home_id: h.id,
    title: h.title,
    region: h.region,
    bearing: h.bearing,
    band: h.band,
    placement_status: h.status,
    style: h.style ?? null,
    atlas_px: { x: xy.x, y: xy.y },
    grid_m: m(xy.x, xy.y),
    sources: { address: addr.replaceAll("\\", "/"), home_dir: homeDir.replaceAll("\\", "/"), notes: srcNotes },
  });
}
// no silent drops: a placed home without an anchor is a DEFECT, not a skip
if (problems.length) {
  console.error("MANIFEST REFUSED — placed homes missing anchors:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
// unmatched anchors are informational (insets like the-pando-peak are expected)
const unmatched = Object.keys(HOME_XY).filter((id) => !homes.some((h) => h.id === id));
if (unmatched.length) console.log("anchors with no placed home (info, expected for insets):", unmatched.join(", "));

const manifest = {
  _note: "Seeding-fleet input: placed homes only (the unplaced join when the Illuminator confirms them — Keemin, 2026-07-22). Grid meters derived by extraction from render-town.mjs HOME_XY at 5 m/px, origin = Ferry's crossing (CENTRE_XY). Build intermediate, not world canon — the membrane keeps WORLD/ to backed content only.",
  _derived: {
    atlas_source: ATLAS.replaceAll("\\", "/"),
    origin_atlas_px: ORIGIN,
    m_per_px: K,
    generated_by: "tools/seed-manifest-gen.mjs",
  },
  homes: entries,
  special_cases: specials,
};
mkdirSync(join(ROOT, "seeding"), { recursive: true });
const out = join(ROOT, "seeding", "manifest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${out}: ${entries.length} placed homes, ${specials.length} special case(s)`);
for (const s of specials) console.log(`  SPECIAL: ${s.home_id} — ${s.reason}`);
for (const e of entries) {
  const flag = e.sources.notes.length ? `  [${e.sources.notes.join("; ")}]` : "";
  console.log(`  ${e.household.padEnd(22)} ${e.home_id.padEnd(28)} grid(${e.grid_m.x},${e.grid_m.y})${flag}`);
}
