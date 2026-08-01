#!/usr/bin/env node
// world-poc.mjs — the spine proof-of-concept: open-your-eyes anywhere in the
// seeded world, zero deps. Assembles a `world` for world-verbs.mjs from real,
// extracted sources (WORLD/marks + skeleton + manifest), then tells what a
// standing agent sees. This is the README's recompute-it-yourself CLI: same
// loader, same fold, same assembly the office and browser use.
//
// SEPARATION OF CONCERNS: world-engine.mjs is a pure library that consumes
// real-coordinate marks. The heightfield's region control points live HERE,
// as clearly-labelled dials, so the engine stays general and the leans stay
// visible and movable.
//
// EXTRACTION OVER MIRRORS: household placements are read from seeding/manifest.json
// (itself extracted from the atlas's HOME_XY). A future atlas re-derive flows
// through mechanically.
//
// (The run-01 legacy-fixture adapter that once lived here retired with
// `_archived/sims/` in the 2026-08-01 solidification pass.)
//
// Usage:
//   node tools/world-poc.mjs                 # tell the quay view (default crossing)
//   node tools/world-poc.mjs --crossing 19   # a specific crossing (fog is its weather)
//   node tools/world-poc.mjs --json          # dump the structured fov instead of prose
//   node tools/world-poc.mjs --at 1500,4888  # stand somewhere else (e.g. the Waystation)

import { readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, loadMarks } from "./marks-fold.mjs"; // the ONE loader
import { assembleWorld, REGION_ANCHORS } from "./world-build.mjs"; // the ONE assembly (shared with the browser)
import { orient, openYourEyes } from "./world-verbs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d; };
const has = (f) => process.argv.includes(f);

// ───────────────────────── DIALS local to the PoC ──────────────────────────
const DEFAULT_CROSSING = Number(arg("--crossing", 19)); // fog is the crossing's weather; 19 is foggy — see the report

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
// as the homeControlPoints override.
// Default: the seeded canon tree, WORLD/marks, through the SHARED loadMarks.
export function buildWorld({ crossing = DEFAULT_CROSSING, marksDir = null, stakesPath = null } = {}) {
  const terrain = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
  const placed = loadMarks(marksDir ?? join(ROOT, "WORLD/marks")); // SHARED nested loader; real coords
  const stakes = stakesPath ? JSON.parse(readFileSync(stakesPath, "utf8")) : [];

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
