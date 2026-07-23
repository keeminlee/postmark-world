// world-build.mjs — assemble the `world` object world-verbs consumes, from
// ALREADY-PARSED data. Pure and browser-safe: it takes the fold's world-state
// (marks with weights, as WORLD/world-state.json carries) and the terrain
// skeleton (as WORLD/TERRAIN/skeleton.json carries), and returns
// { marks, terrain, heightfield, light, fogCeilingM }.
//
// WHY IT EXISTS: the site fetches world-state.json + skeleton.json from the
// public repo (raw.githubusercontent, CORS-open) and computes the field of view
// client-side — read-only by construction, no keys, no disk. The heightfield
// control points and placement dials used to live in world-poc.mjs behind
// node:fs; they live here now so BOTH the browser and the disk PoC assemble the
// world the same way — one assembly, two data sources, no drift.
//
// The browser does NOT re-fold: world-state.json already carries the folded
// marks with their weights. FOV is the render; recomputing the fold stays the
// clone's job (marks-fold.mjs, which keeps its node:fs loader out of this graph).
//
// Browser-purity: this imports ONLY world-engine.mjs (pure). No node:*, no
// marks-fold. All numeric leans are dials, movable by ruling.

import { buildHeightfield } from "./world-engine.mjs";

// ───────────────────────── dials (moved from world-poc, verbatim) ───────────
// Signal-marks (Orion's announce-yourself law made mechanics, decision 008): the
// navigational / self-luminous marks whose light cuts through fog. FORWARD: a
// `signal:` predicate on the mark is the durable mechanism; this allowlist is the
// stand-in until marks carry it. (These ids are run-01's; the seeded world
// declares none yet — correctly, no keeper has tended a signal.)
export const SIGNAL_MARKS = {
  "orion-by-the-fire/the-reach-light-the-lighthouse-as-a-charted-navi": "a charted navigation light, Fl(3) 15s",
  "orion-by-the-fire/the-still-here-light-orion-s-home-a-lighthouse": "a lighthouse; the lamp turns once every nine seconds, eleven nautical miles out",
  "limen/the-amber-porch-light-of-the-threshold-house-nav": "an amber porch light that never goes out — 'Ferry knows it … how you find the house'",
  "claude-of-dregg/the-hatched-shell-at-the-water-s-edge": "glows from the inside; from across the water it reads as a lamp",
  "little-bird/little-bird-the-turning-mark": "a spar buoy marking where the channel turns",
};

// The heightfield's region control points — decision 008's seventeen rows at a
// representative grid coordinate carrying its band-midpoint height. Coordinate is
// EXTRACTED where possible (a placed home / a terrain feature), DERIVED only where
// no home or feature names the spot. Height is the band midpoint — never a pixel.
export const REGION_ANCHORS = [
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
export const SEA_DATUM = [
  { at: { x: 1200, y: 6500 }, h: 0, src: "the mouth (channel exits ~1200,6150)" },
  { at: { x: -500, y: 6600 }, h: 0, src: "the south sea" },
  { at: { x: 4200, y: 6000 }, h: 0, src: "the SE sea, seaward of Aelyria" },
  { at: { x: -2600, y: 1600 }, h: 0, src: "the west sea" },
  { at: { x: -2600, y: 4200 }, h: 0, src: "the west sea, off the Reach" },
];

// ───────────────────────── pure control-point derivations ───────────────────
// Water-surface control points from the skeleton's own channel/still-water/locks
// geometry. Height follows decision 008's fall (~+8 m upstream → 0 at the mouth).
// The water is a strong LOW constraint that carves the quay/river corridor.
export function waterControlPoints(skeleton) {
  const wet = (skeleton.features ?? []).filter((f) => ["channel", "still-water", "still-inlet", "locks"].includes(f.kind));
  const pts = [];
  for (const f of wet) {
    const line = f.centerline_m ?? (f.at_m ?? []);
    for (const p of (Array.isArray(line) ? line : [line])) if (p) pts.push(p);
  }
  if (!pts.length) return [];
  const ys = pts.map((p) => p.y);
  const yN = Math.min(...ys), yMouth = Math.max(...ys);
  const H_UP = 8; // dial: upstream water surface
  return pts.map((p) => {
    const t = (p.y - yN) / Math.max(1, yMouth - yN);
    return { x: p.x, y: p.y, h: Math.max(0, H_UP * (1 - t)), id: null };
  });
}

// Marks-derived home densification — the browser-safe path (no manifest). Every
// sited mark contributes a control point at the band-height of its NEAREST region
// anchor, so a low region holds its corridor down instead of the hills bleeding
// in. The disk PoC overrides this with the manifest's declared-region points
// (see assembleWorld's homeControlPoints), which is why run-01 stays byte-exact.
export function deriveHomeControlPoints(marks) {
  const pts = [];
  for (const m of marks) {
    if (m.kind !== "sited" || !m.at) continue;
    let best = null, bd = Infinity;
    for (const r of REGION_ANCHORS) {
      const d = (m.at.x - r.at.x) ** 2 + (m.at.y - r.at.y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    if (best) pts.push({ x: m.at.x, y: m.at.y, h: best.h, id: best.id });
  }
  return pts;
}

// ───────────────────────── the assembly ─────────────────────────────────────
// worldState: the fold output (has .marks with id/kind/at/extent/weight/body/…).
// skeleton:   the terrain skeleton (features, elevation, light, far_features).
// homeControlPoints: optional override for the home densification (the disk PoC
//   passes the manifest's declared-region points; the browser passes null and the
//   points are derived from the marks). Control-point ORDER is preserved so a
//   given (points, skeleton) pair yields a byte-identical heightfield.
export function assembleWorld({ worldState, skeleton, homeControlPoints = null } = {}) {
  const marks = (worldState.marks ?? []).map((m) => ({ ...m, signal: !!SIGNAL_MARKS[m.id] }));
  const homePts = homeControlPoints ?? deriveHomeControlPoints(marks);
  const controlPoints = [
    ...REGION_ANCHORS.map((r) => ({ x: r.at.x, y: r.at.y, h: r.h, id: r.id })),
    ...homePts,
    ...SEA_DATUM.map((s) => ({ x: s.at.x, y: s.at.y, h: s.h, id: null })),
    ...waterControlPoints(skeleton),
  ];
  const heightfield = buildHeightfield({ controlPoints });
  return {
    marks,
    terrain: skeleton,
    heightfield,
    light: skeleton.light,
    fogCeilingM: skeleton.elevation.fog_ceiling_m,
  };
}
