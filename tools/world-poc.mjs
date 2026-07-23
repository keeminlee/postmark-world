#!/usr/bin/env node
// world-poc.mjs — the spine proof-of-concept: open-your-eyes from the Town
// Centre quay with the run-01 cast. Assembles a `world` for world-verbs.mjs from
// real, extracted sources, then tells what an agent standing on the quay sees.
//
// SEPARATION OF CONCERNS: world-engine.mjs is a pure library that consumes
// real-coordinate marks. All the PLACEMENT (turning the run-01 sim's local marks
// into real grid marks) and the heightfield's region control points live HERE,
// as clearly-labelled dials, so the engine stays general and the leans stay
// visible and movable.
//
// EXTRACTION OVER MIRRORS: household placements are read from seeding/manifest.json
// (itself extracted from the atlas's HOME_XY). Only little-bird — the canonical
// nomad, "no fixed berth" — carries a hand dial, matching the manifest's own
// honest "not placed". A future atlas re-derive flows through mechanically.
//
// Usage:
//   node tools/world-poc.mjs                 # tell the quay view (default crossing)
//   node tools/world-poc.mjs --crossing 19   # a specific crossing (fog is its weather)
//   node tools/world-poc.mjs --json          # dump the structured fov instead of prose
//   node tools/world-poc.mjs --at 1500,4888  # stand somewhere else (e.g. the Waystation)

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, loadMarks, parseRecord } from "./marks-fold.mjs"; // the ONE loader + frontmatter parser
import { assembleWorld, REGION_ANCHORS } from "./world-build.mjs"; // the ONE assembly (shared with the browser)
import { orient, openYourEyes } from "./world-verbs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const has = (f) => process.argv.includes(f);

// ───────────────────────── DIALS local to the PoC ──────────────────────────
const DEFAULT_CROSSING = Number(arg("--crossing", 19)); // fog is the crossing's weather; 19 is foggy — see the report

// little-bird has no atlas anchor (the manifest's honest "not placed": a skiff,
// "no fixed berth"). Placed for the PoC near Orion's light, from its own words
// ("not far off Orion's light … close enough to hear the lamplight at Limen's
// edge"). THE ONE non-extracted placement — a dial, flagged loudly.
const LITTLE_BIRD_DIAL = { x: -1425, y: 4640, _source: "DIAL: nomad, no atlas anchor; placed near orion from little-bird's own words" };

// The dials that assemble the world (SIGNAL_MARKS, REGION_ANCHORS, SEA_DATUM,
// waterControlPoints, assembleWorld) now live in world-build.mjs, shared with the
// browser page — one assembly, no drift. What stays HERE is only what needs disk:
// reading the marks/manifest and folding. `homeBandControlPoints` reads the
// manifest and is passed to assembleWorld as the disk override (keeping run-01
// byte-exact); the browser derives the same densification from the marks instead.

// ───────────────────────── mark loading + placement ─────────────────────────
// LEGACY-FIXTURE ADAPTER (run-01 only). run-01 predates the 07-22 nesting ruling:
// its marks are flat `<household>/<slug>.md` and it carries predicated-on-
// predicated chains the new schema forbids, so it cannot go through the shared
// nested `loadMarks`. This adapter reads that flat shape ONLY — but it reuses the
// shared `parseRecord` for the frontmatter, so there is no second frontmatter
// reader, only a second directory shape. Nested/production reads (WORLD/marks,
// the seeding fleet, the full-tree check) go through the shared `loadMarks`.
function loadLegacyFlatMarks(dir) {
  const out = [];
  for (const hh of readdirSync(dir)) {
    const hhDir = join(dir, hh);
    if (!statSync(hhDir).isDirectory()) continue;
    for (const f of readdirSync(hhDir)) {
      if (!f.endsWith(".md")) continue;
      const rec = parseRecord(readFileSync(join(hhDir, f), "utf8"), `${hh}/${f}`); // SHARED parser
      rec.household = rec.household ?? hh;
      rec.slug = rec.mark ?? basename(f, ".md");
      rec.id = `${rec.household}/${rec.slug}`;
      out.push(rec);
    }
  }
  return out;
}
// Household anchors: extracted from the seeding manifest; little-bird is the dial.
function loadAnchors() {
  const M = JSON.parse(readFileSync(join(ROOT, "seeding/manifest.json"), "utf8"));
  const anchors = {};
  for (const h of M.homes) anchors[h.household] = { x: h.grid_m.x, y: h.grid_m.y, _source: `manifest: ${h.home_id}` };
  anchors["little-bird"] = LITTLE_BIRD_DIAL;
  return anchors;
}
// Translate each household's LOCAL sim marks onto the real grid by its anchor.
// (The run-01 sim authored every parcel at local 0,0; the anchor carries them to
// their real place, which also separates households that were stacked at origin.)
function placeMarks(marks, anchors) {
  return marks.map((mk) => {
    const a = anchors[mk.household];
    if (!a || !mk.at || typeof mk.at !== "object") return mk;
    return { ...mk, at: { x: a.x + (mk.at.x ?? 0), y: a.y + (mk.at.y ?? 0) }, _localAt: mk.at, _anchor: { x: a.x, y: a.y } };
  });
}

// Every placed home as a heightfield control point at its REGION's band-midpoint
// height (decision 008). Real inhabited positions at ruled heights — this
// densifies the naive field so a low region (e.g. the four threshold homes) holds
// its corridor down instead of the surrounding hills bleeding in. Homes in
// regions outside the seventeen rows (open-ground / null) are left to gentle
// interpolation, per the open-ground principle. Pure extraction, no hand-tuning.
function homeBandControlPoints() {
  const M = JSON.parse(readFileSync(join(ROOT, "seeding/manifest.json"), "utf8"));
  const bandH = new Map(REGION_ANCHORS.map((r) => [r.id, r.h]));
  const alias = { "the-still-reach-and-blackwater": "the-still-reach-and-blackwater" }; // reserved for future region-name drift
  const pts = [];
  for (const h of M.homes) {
    const rid = alias[h.region] ?? h.region;
    if (!bandH.has(rid)) continue;                 // open-ground / null / off-rows: leave gentle
    pts.push({ x: h.grid_m.x, y: h.grid_m.y, h: bandH.get(rid), id: rid });
  }
  return pts;
}

// ───────────────────────── build the world ─────────────────────────────────
// buildWorld — the DISK path. Reads + folds the marks, then hands the folded
// world-state and the skeleton to the shared assembleWorld (world-build.mjs) —
// the same function the browser calls. The manifest home densification is passed
// as the homeControlPoints override, so run-01 stays byte-exact.
// Default: the run-01 legacy fixture, placed onto the real grid.
// nested (--marks-dir): a nested tree read through the SHARED loadMarks.
export function buildWorld({ crossing = DEFAULT_CROSSING, marksDir = null, stakesPath = null } = {}) {
  const terrain = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  let placed;
  if (marksDir) {
    placed = loadMarks(marksDir);                          // SHARED nested loader; real coords already
  } else {
    const rawMarks = loadLegacyFlatMarks(join(ROOT, "sims/run-01/world/marks"));
    placed = placeMarks(rawMarks, loadAnchors());          // run-01 is parcel-local; anchor it
  }
  const stakes = stakesPath ? JSON.parse(readFileSync(stakesPath, "utf8"))
    : marksDir ? [] : JSON.parse(readFileSync(join(ROOT, "sims/run-01/stakes.json"), "utf8"));

  // fold at this crossing (stakes take effect the crossing after they land)
  const state = fold({ marks: placed, terrain, stakes, tick: crossing + 1 });

  // one assembly, disk data source: the manifest densification is the override
  const world = assembleWorld({ worldState: state, skeleton: terrain, homeControlPoints: homeBandControlPoints() });
  world.foldErrors = state.errors;
  return world;
}

// ───────────────────────── the sample telling ──────────────────────────────
function main() {
  const crossing = DEFAULT_CROSSING;
  const marksDir = arg("--marks-dir", null); // point at a nested tree (e.g. WORLD/marks) for the full-tree check
  const atArg = arg("--at", "0,0").split(",").map(Number);
  // name without coords — the opening line supplies the coordinate once (no duplication)
  const observer = { x: atArg[0], y: atArg[1], name: atArg[0] === 0 && atArg[1] === 0 ? "An agent on the Town Centre quay" : "An agent" };

  const world = buildWorld({ crossing, marksDir });
  if (world.foldErrors?.length) {
    console.error(`⚠ fold errors (${world.foldErrors.length}):`);
    for (const e of world.foldErrors.slice(0, 10)) console.error("  ", JSON.stringify(e));
  }

  const eyes = openYourEyes(observer, world, { crossing });
  if (has("--json")) { console.log(JSON.stringify(eyes.fov, null, 2)); return; }

  const o = orient(observer, world, { crossing });
  console.log("═══ orient ═══");
  console.log(`charter: ${o.charter.light}`);
  console.log(`you: ${o.you.name} @ (${o.you.at.x},${o.you.at.y}) · ${o.you.groundElevM} m · region ${o.you.region} · light ${o.you.light.level} · fog(crossing ${o.you.fog.crossing}) ${o.you.fog.thickness} ${o.you.fog.inFog ? "[in-fog]" : o.you.fog.aboveFog ? "[above-fog]" : "[clear]"}${o.you.light.inDarkness ? " [in-darkness]" : ""}`);
  if (o.you.standingOn) console.log(`standing on/near: ${o.you.standingOn.feature} (${o.you.standingOn.distM} m)`);
  console.log("\n═══ open-your-eyes ═══");
  console.log(eyes.tell());
}

if (fileURLToPath(import.meta.url) === (process.argv[1] || "").replace(/\\/g, "/").replace(/^([a-z]):/i, (s) => s.toUpperCase())
    || basename(process.argv[1] ?? "") === "world-poc.mjs") {
  main();
}
