#!/usr/bin/env node
// world-terrain-gen.mjs — generate WORLD/skeleton.json from the LIVE
// atlas at the ruled scale: 5 m/px, origin = Ferry's crossing (extracted, not
// assumed). One-shot bootstrap tool; the skeleton is thereafter
// constitution-tier data.
//
// RE-DERIVED 2026-07-22 (survey decision 008; Keemin: "land and re-derive").
// The first version hardcoded channel waypoints mirrored from the 07-17
// renderer — and the 07-21/22 atlas-v2 passes (river re-cut, Long Run onto the
// main channel, Still Reach pool, Evermoon west) stranded every mirror. This
// version EXTRACTS the water constants from the atlas's own render-town.mjs
// text and reads its terrain-candidate-A.json, so a future atlas pass either
// flows through mechanically or fails loud here — duplication drifts,
// extraction can't (fix the class, not the instance).
//
// Usage: node tools/world-terrain-gen.mjs [--atlas <dir>]
//   --atlas defaults to this repo's own PROJECTS/build-the-town/atlas copy;
//   point it at the live clone's atlas dir for a fresh derive. The source
//   used is printed loudly either way.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const argIdx = process.argv.indexOf("--atlas");
const ATLAS = argIdx > -1 ? process.argv[argIdx + 1] : join(ROOT, "PROJECTS/build-the-town/atlas");
console.log("atlas source:", ATLAS);

const K = 5; // m per atlas px (RULED 2026-07-17)

// ---- extraction: the renderer's own constants, read as text, never copied
const rtSrc = readFileSync(join(ATLAS, "render-town.mjs"), "utf8");
function extract(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!m) throw new Error(`extraction failed: const ${name} not found in render-town.mjs — the renderer changed shape; fix the extractor, do not guess`);
  return new Function("return " + m[1])();
}
function extractObj(name) {
  const m = rtSrc.match(new RegExp(`const ${name} = (\\{[^;]*\\});`));
  if (!m) throw new Error(`extraction failed: const ${name} not found`);
  return new Function("return " + m[1])();
}
const WATER = extract("WATER_WAYPOINTS");
const STILL_REACH = extract("STILL_REACH");
const LOCKS = extract("LOCKS");
const ORIGIN = extractObj("CENTRE_XY"); // Ferry's crossing — the grid origin
if (WATER.length < 10) throw new Error("suspicious extraction: main channel has <10 waypoints");
console.log(`extracted: ${WATER.length} channel waypoints, ${STILL_REACH.length} still-reach, ${LOCKS.length} locks, origin (${ORIGIN.x},${ORIGIN.y})`);

const candA = JSON.parse(readFileSync(join(ATLAS, "terrain-candidate-A.json"), "utf8"));

const m = (px, py) => ({ x: Math.round((px - ORIGIN.x) * K), y: Math.round((py - ORIGIN.y) * K) });
const mPt = (p) => ({ ...m(p.x, p.y), ...(p.w !== undefined ? { w_m: Math.round(p.w * K) } : {}) });

const skeleton = {
  _law: "WORLD/skeleton.json is the world's survey + physics instrument — the derived measurement beneath the marks tree, NOT a tier. Terrain claims live as constitution marks (by: the-town) in the tree, each linking here via feature:<id>; this file is how the world COMPUTES (precise geometry, hydrology, elevation, light). The test (Keemin, 2026-07-23): if a resident could dispute or enrich it, it's a mark; if it's how the world computes, it's skeleton. Elevation derives from residents' words + survey decisions, NEVER from drawn pixels (decision 008).",
  _grid: { cell_m: 1, scale: "5 m per atlas px (RULED 2026-07-17)", origin: `Ferry's crossing — center of the Town Centre, atlas (${ORIGIN.x},${ORIGIN.y}); x east, y south, z in meters above sea (decision 008)` },
  _derived: "re-derived 2026-07-22 from the LIVE atlas (post atlas-v2 + the Evermoon move, town commit bdb5c93) by extraction from render-town.mjs + terrain-candidate-A.json — see this tool's header",
  physics_registry: {
    hydrology: { honored: true, receipt: "the residents' own invented river system (survey decision 003); locks only mean anything because flow does" },
    routes: { honored: true, receipt: "corpus-ratified — Pando's binding claim is a route claim ('on Ferry's route all the same')" },
    acoustics: { honored: false, receipt: "the bell, Disney-ruled (survey decision 003)" },
    sightlines: { honored: true, receipt: "FLIPPED 2026-07-22 (decision 008): the semantic world's FOV build is the real conflict the deferral was waiting for" },
    light: { honored: true, receipt: "the day-axis (atlas canon 2026-07-21; dark pole tuned to Caelina 07-22, provisional on caelum's word)" },
    // 07-23: the registry doubles as the mechanics roster a mark's `mechanic:`
    // field may point at (lint-enforced) — every diegetic mechanic is a mark in
    // the tree, and the mark points back at the machinery that keeps it true.
    fog: { honored: true, receipt: "decision 008 — the +22 m fog ceiling; each crossing's weather seeds deterministically from the crossing number (ENGINE.md fogModel)" },
    elevation: { honored: true, receipt: "decision 008 — the seventeen ruled bands; the naive heightfield interpolates them, never drawn pixels" },
    pace: { honored: true, receipt: "decision 008 — 15 km per crossing; walk() spends crossings at this dial" },
    wear: { honored: true, receipt: "the walk-ledger — anonymous per-cell wear; where you wander is more intimate than who you wrote (ENGINE.md)" },
    signal: { honored: true, receipt: "Orion's announce-yourself law made mechanics (decision 008); a light declared on the record cuts fog for the whole town" },
  },
  elevation: {
    _ruling: "survey decision 008 (Keemin, 2026-07-22) — all values are dials, movable by ruling, never silently",
    datum: "sea = 0 m at the coasts and the mouth",
    quay_m: 5,
    fog_ceiling_m: 22,
    north_trend: "~1.45% climb, quay to the north rim (~+60 m at the map's edge)",
    open_ground_principle: "unclaimed ground stays gentle and unremarkable until a resident gives it words — height is canon too",
    walk_speed_m_per_crossing: 15000,
    regions: [
      { id: "the-town-centre", band_m: [4, 6], note: "flat quayside, both banks low" },
      { id: "the-lanternseed-gardens", band_m: [10, 20], note: "lower slope" },
      { id: "the-trueing-terrace", band_m: [30, 45], note: "stepped terraces, above fog" },
      { id: "north-rim", band_m: [55, 65], note: "the map's north edge; the mountain itself is off-map (see far_features)" },
      { id: "the-high-ground", band_m: [30, 40], note: "the second rise, east — distinct from the north hill, a saddle between" },
      { id: "the-threshold-district", band_m: [0, 5], note: "four ~3 m steps descending from the Centre to river level; the lower two under the fog ceiling" },
      { id: "the-still-reach-and-blackwater-bend", band_m: [2, 4], note: "floodplain, flat — merrick's inlet sits here" },
      { id: "the-long-run", band_m: [0, 5], note: "banks stepping to 0 through the two locks (~2-3 m each)" },
      { id: "the-east-low-hills", band_m: [15, 25], note: "knolls — the East Window District's western wall" },
      { id: "the-east-window-district", band_m: [5, 12], note: "open field, rolling east" },
      { id: "evermoon", band_m: [10, 25], note: "gentle dark upland on the WEST band (post-move, provisional on caelum's word); shallow twin-mooned lake basin — the night native to the pole" },
      { id: "the-protected-grove", band_m: [30, 50], note: "NW forested upland rising to the corner; Memory Lake basin; the watchtower knoll the local summit" },
      { id: "the-lochan", band_m: [22, 28], note: "NE upland hollow — a CLOSED basin, no inlet, no outlet: 'a lake that belongs to no river' is literally hydrology" },
      { id: "the-reach", band_m: [0, 30], note: "west-coast basalt cliffs +15-30, shingle at 0" },
      { id: "the-headland", band_m: [10, 20], note: "raised promontory, sea on three sides" },
      { id: "the-doubled-coast", band_m: [0, 8], note: "low shore" },
      { id: "aelyria", band_m: [5, 10], note: "LOW cliffs, gentle inland — plus a modest inland scarp so the upward falls has a drop to fall up" },
    ],
  },
  light: {
    _ruling: "day-axis canon (atlas 2026-07-21) + 07-22 recalibration — PROVISIONAL on caelum's word (the Evermoon move reverts wholly at his word)",
    dawn_pole_m: m(1500, 850),
    dark_pole_m: m(105, 1190),
    dark_pole_is: "caelina — the first house beneath the never-setting moon, exactly",
    orthogonality: "the light gradient (E-W) runs roughly orthogonal to the altitude/river gradient (N-S) — the town's two great fields form a coordinate system; every place a (light, altitude) pair (decision 008)",
    night_enclaves: (candA.zones || []).filter(z => z.kind === "night").map(z => ({ id: z.id, center_m: m(z.cx, z.cy), rx_m: z.rx * K, ry_m: z.ry * K, receipt: z.receipt })),
  },
  far_features: [
    { id: "pando-peak", kind: "mountain-horizon", label: "Pando Peak", bearing: "NW", distance_m: 135000, height_m: 4000,
      days_out_on_foot: "4-5", crossings_out: 9,
      receipt: "decision 008: the town's own ~1.45% climb extrapolated to 4,000 m gives ~270 km linear; halved by ruling because a mountain is not a linear incline. DERIVES vermillion's 'days out on foot; on Ferry's route all the same'. A horizon object, not heightfield ground: ~1.7 degrees of NW horizon from town; from its top the whole town subtends ~1.6 degrees — the panorama from Pando is the town as a single mark." },
  ],
  features: [
    { id: "the-main-channel", kind: "channel", centerline_m: WATER.map(mPt),
      receipt: "one water serves the town — river = canal = harbor at different reaches (the-water, settled 2026-07-03); course as re-cut in atlas v2 (2026-07-21): NW corner, through the grove and its lake, the western curve of the northern regions, the quay basin, the Threshold bends, the broad bend, the straightened lower run to the mouth" },
    { id: "the-still-reach", kind: "still-water", centerline_m: STILL_REACH.map(mPt), round_end: true,
      receipt: "finn: 'the main current split off, and what was left settled into still water' — a pool, not a point; nothing in it moves" },
    { id: "the-locks", kind: "locks", at_m: LOCKS.map(p => m(p.x, p.y)),
      receipt: "the two gates on the straightened lower run; carta's lock house stands at the lower (atlas v2). Each steps ~2-3 m of the last drop (decision 008)" },
    ...(candA.lakes || []).map(l => ({ id: l.id || "lake", kind: "lake", center_m: m(l.cx, l.cy), rx_m: l.rx * K, ry_m: l.ry * K, receipt: l.receipt })),
    ...(candA.cliffs || []).map(c => ({ id: c.id, kind: "cliffs", line_m: c.pts.map(mPt), receipt: c.receipt })),
    ...(candA.oddities || []).map(o => ({ id: o.id || "oddity", kind: "oddity", at_m: m(o.x, o.y), receipt: o.receipt })),
    ...(candA.water_offshoots || []).map(w => ({ id: w.id, kind: w.kind, centerline_m: w.pts.map(mPt), round_end: !!w.round_end, receipt: w.receipt })),
    ...(candA.bridges || []).map(b => ({ id: b.id, kind: b.kind, at_m: m(b.x, b.y), angle_deg: b.angle, length_m: Math.round(b.length * K), receipt: b.receipt })),
    ...(candA.tree_clusters || []).map(t => ({ id: t.id, kind: "grove", trees_m: t.trees.map(tr => ({ ...m(tr.x, tr.y), scale: tr.scale })), receipt: t.receipt })),
    ...(candA.paths || []).map(p => ({ id: p.id, kind: p.kind, line_m: p.pts.map(mPt), receipt: p.receipt })),
    { id: "ferrys-route", kind: "route", note: "the mail route — honored physics, geometry derived per-crossing from delivery walk; v0 symbolic (endpoints: the crossing, every doorstep)", receipt: "physics registry: routes" },
    { id: "the-sea", kind: "sea", note: "everything south and west of the drawn coastline, out to the map's own edges (the atlas's one-shore-one-sea rule, 2026-07-21); shoreline geometry lives in the atlas's COASTLINE — extract when the heightfield needs it", receipt: "spar, orion, dregg, tulip, aelyria — the coastal corpus" },
  ],
};

mkdirSync(join(ROOT, "WORLD"), { recursive: true });
writeFileSync(join(ROOT, "WORLD/skeleton.json"), JSON.stringify(skeleton, null, 2) + "\n");
console.log(`WORLD/skeleton.json written: ${skeleton.features.length} features, ${skeleton.elevation.regions.length} elevation rows, ${skeleton.far_features.length} far feature(s), origin Ferry's crossing @ ${K} m/px`);
