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
import { buildHeightfield } from "./world-engine.mjs";
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

// Signal-marks (Orion's announce-yourself law made mechanics, decision 008): the
// navigational / self-luminous marks whose light cuts through fog. Derived from
// the corpus's own words. FORWARD: a `signal:` predicate on the mark is the
// durable mechanism; this allowlist is the PoC stand-in until the run-01 fixtures
// carry it. Flagged as a dial.
const SIGNAL_MARKS = {
  "orion-by-the-fire/the-reach-light-the-lighthouse-as-a-charted-navi": "a charted navigation light, Fl(3) 15s",
  "orion-by-the-fire/the-still-here-light-orion-s-home-a-lighthouse": "a lighthouse; the lamp turns once every nine seconds, eleven nautical miles out",
  "limen/the-amber-porch-light-of-the-threshold-house-nav": "an amber porch light that never goes out — 'Ferry knows it … how you find the house'",
  "claude-of-dregg/the-hatched-shell-at-the-water-s-edge": "glows from the inside; from across the water it reads as a lamp",
  "little-bird/little-bird-the-turning-mark": "a spar buoy marking where the channel turns",
};

// The heightfield's region control points. Each of decision 008's seventeen rows,
// at a representative grid coordinate, carrying its band-midpoint height. The
// coordinate is EXTRACTED where possible (a placed home's grid position or a
// terrain feature), DERIVED only where no home or feature names the spot. Height
// is the band midpoint from decision 008 — never a drawn pixel. All dials.
//  src: "home" = placed-home centroid (seeding manifest), "terrain" = skeleton
//       feature, "derived" = a reasoned lean between known anchors (flagged).
const REGION_ANCHORS = [
  { id: "the-town-centre",                  at: { x: 0, y: 0 },      h: 5,    src: "terrain: origin, Ferry's crossing quay (+5, ruled)" },
  { id: "the-lanternseed-gardens",          at: { x: 1075, y: -800 }, h: 15,  src: "home: rei" },
  { id: "the-trueing-terrace",              at: { x: 888, y: -2320 }, h: 37,  src: "home: wright, ethan-thorne (centroid)" },
  { id: "north-rim",                        at: { x: 700, y: -3600 }, h: 60,  src: "derived: N of the trueing terrace toward the map's north edge" },
  { id: "the-high-ground",                  at: { x: 2544, y: 175 },  h: 35,  src: "home: the reeves household (centroid)" },
  { id: "the-threshold-district",           at: { x: 1358, y: 1821 }, h: 2.5, src: "home: limen, hal, liv, noe (centroid)" },
  { id: "the-still-reach-and-blackwater",   at: { x: 1900, y: 3900 }, h: 3,   src: "terrain: the-still-reach centreline" },
  { id: "the-long-run",                     at: { x: 1513, y: 4888 }, h: 2.5, src: "home: carta, jetto-of-starforge (centroid); the locks" },
  { id: "the-east-low-hills",               at: { x: 2800, y: 900 },  h: 20,  src: "derived: the East Window District's western wall" },
  { id: "the-east-window-district",         at: { x: 3125, y: 1675 }, h: 8,   src: "home: east-facing-window" },
  { id: "evermoon",                         at: { x: -1900, y: 2150 }, h: 17, src: "home: caelum (== the dark pole; Evermoon moved WEST 07-22)" },
  { id: "the-protected-grove",              at: { x: -1375, y: -2550 }, h: 40, src: "home: sol-of-garrison; the garrison lake" },
  { id: "the-lochan",                       at: { x: 2575, y: -1160 }, h: 25, src: "terrain: the-lochan closed basin" },
  { id: "the-reach",                        at: { x: -1725, y: 4840 }, h: 15, src: "home: orion-by-the-fire" },
  { id: "the-headland",                     at: { x: -2300, y: 4200 }, h: 15, src: "derived: raised promontory seaward of the Reach" },
  { id: "the-doubled-coast",                at: { x: -258, y: 5033 }, h: 4,   src: "home: claude-of-dregg, gael-renton, spar (centroid)" },
  { id: "aelyria",                          at: { x: 4075, y: 5050 }, h: 7.5, src: "home: aion-solare; the aelyria cliffs" },
];
// Sea datum points: sea = 0 at the coasts and the mouth (decision 008 datum).
// They pull the naive field down to sea level at the edges. Dials.
const SEA_DATUM = [
  { at: { x: 1200, y: 6500 }, h: 0, src: "the mouth (channel exits ~1200,6150)" },
  { at: { x: -500, y: 6600 }, h: 0, src: "the south sea" },
  { at: { x: 4200, y: 6000 }, h: 0, src: "the SE sea, seaward of Aelyria" },
  { at: { x: -2600, y: 1600 }, h: 0, src: "the west sea" },
  { at: { x: -2600, y: 4200 }, h: 0, src: "the west sea, off the Reach" },
];

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

// Water-surface control points from the skeleton's channel/still-water/locks.
// Height follows decision 008's fall: ~+8 m at the upstream (northmost) reach
// down to 0 at the mouth (southmost). The water is a strong LOW constraint —
// it keeps the quay basin and river corridor low without sculpting.
function waterControlPoints(terrain) {
  const wet = (terrain.features ?? []).filter((f) => ["channel", "still-water", "still-inlet", "locks"].includes(f.kind));
  const pts = [];
  for (const f of wet) {
    const line = f.centerline_m ?? (f.at_m ?? []);
    for (const p of (Array.isArray(line) ? line : [line])) if (p) pts.push(p);
  }
  if (!pts.length) return [];
  const ys = pts.map((p) => p.y);
  const yN = Math.min(...ys), yMouth = Math.max(...ys);         // north (upstream) → south (mouth)
  const H_UP = 8;                                               // dial: upstream water surface
  return pts.map((p) => {
    const t = (p.y - yN) / Math.max(1, yMouth - yN);
    return { x: p.x, y: p.y, h: Math.max(0, H_UP * (1 - t)), id: null };
  });
}

// ───────────────────────── build the world ─────────────────────────────────
// buildWorld — default: the run-01 legacy fixture, placed onto the real grid.
// nested: point at a nested marks tree (WORLD/marks or the fleet's output) read
// through the SHARED loadMarks; those marks are already in real coordinates, so
// no placement or per-household anchor translation is applied.
export function buildWorld({ crossing = DEFAULT_CROSSING, marksDir = null, stakesPath = null } = {}) {
  const terrain = JSON.parse(readFileSync(join(ROOT, "WORLD/TERRAIN/skeleton.json"), "utf8"));
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

  // attach signal flags + carry the placed `at`/body through to the world marks
  const bodyById = new Map(placed.map((m) => [m.id, m.body]));
  const marks = state.marks.map((m) => ({ ...m, body: bodyById.get(m.id) ?? m.body, signal: !!SIGNAL_MARKS[m.id] }));

  // heightfield control points: the seventeen region rows + sea datum + the
  // WATER SURFACE. The water is genuinely low (it is the drainage) and it carves
  // the low quay/river corridors that the sparse region anchors miss. Terrain-
  // derived (the skeleton's own channel geometry), datum-following (h falls N→S
  // to 0 at the mouth), not invented drama — open ground between stays gentle.
  const controlPoints = [
    ...REGION_ANCHORS.map((r) => ({ x: r.at.x, y: r.at.y, h: r.h, id: r.id })),
    ...homeBandControlPoints(),   // every placed home at its region's band height (densifies the naive field)
    ...SEA_DATUM.map((s) => ({ x: s.at.x, y: s.at.y, h: s.h, id: null })),
    ...waterControlPoints(terrain),
  ];
  const heightfield = buildHeightfield({ controlPoints });

  return {
    marks, terrain, heightfield,
    light: terrain.light,
    fogCeilingM: terrain.elevation.fog_ceiling_m,
    foldErrors: state.errors,
  };
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
