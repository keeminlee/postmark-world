#!/usr/bin/env node
// world-engine.mjs — THE semantic-world library for Postmark.
//
// One library, four capabilities the spine verbs wrap thinly:
//   1. heightfield   — naive elevation over the seventeen ruled region bands
//   2. spatial query — index marks + terrain by position; ray-march the ground
//   3. FOV           — line-of-sight over the heightfield, honoring fog / light
//   4. radial serializer — visible marks as quantized bearings + named bands,
//                          ranked by angular size modulated by stamps (LOD)
//
// This is a PURE library: it consumes already-loaded, already-folded, already-
// lint-validated marks. It reads no marks from disk and defines no containment —
// the ONE loader and ONE `contains` live in marks-fold.mjs (shared with
// mark-lint.mjs, the 07-22 nesting gate). A second reader/geometry here would
// reintroduce the exact drift that design closes.
//
// What you "see" IS the marks tree (the paradigm, epic § The semantic world).
// Render cost is capped by a CONTEXT BUDGET, never proportional to world size:
// the FOV ranks every candidate but the telling carries only the top-budget,
// with the rest collapsed into an aggregate tail.
//
// LAWS THIS OBEYS (Wright's brief, decision 008, MARKS.md):
//   • Elevation derives from residents' words + the rulings, NEVER drawn pixels.
//     The bands are decision 008's; the region anchors are extracted from placed
//     homes + terrain features by the loader, not painted.
//   • Every numeric lean is a DIAL — in DIALS below or in the skeleton/config,
//     movable by ruling, never silently. (See WORLD/ENGINE.md for the table.)
//   • Deterministic and replayable from any clone: no wall-clock, no unseeded
//     randomness. Fog weather seeds from the crossing number (fogModel).
//   • Geometry is the authority; a declared edge that contradicts coordinates is
//     refused upstream by mark-lint.mjs ("you cannot lie with an edge"), which
//     shares the fold's one `contains`. The engine consumes validated marks.
//
// TWO LESSONS CARRIED (Jetto, budding-friendship build, 2026-07-22):
//   • Retroactive-replay hazard: a lean living in a code CONSTANT re-decides
//     history the day the constant changes. So the leans that could change a
//     past crossing's telling (fog model, band thresholds) are DIALS read from
//     config, and fog is a pure function of the crossing number — replay of
//     crossing N is byte-identical by construction, not by a guard.
//   • Law-line supersession: the light axis and Evermoon's west-move are
//     "provisional on caelum's word." A superseding ruling must RESTATE what it
//     carries forward (the anchors), the way a new rules-version restates the
//     meep set — it may not silently drop a pole. The engine reads light/terrain
//     as dated config so a supersession is a dated event, not a quiet flip.
//
// Pure library: no I/O here except reading is done by callers. Import `fold`
// from marks-fold.mjs (the canon computation) upstream; this consumes its output.

// ───────────────────────── DIALS (movable by ruling, never silently) ─────────
export const DIALS = {
  // radial serializer
  bearing_points: 16,               // compass quantization (16-point rose)
  // Named observer-relative distance bands (metres, first match wins). These are
  // COINED, not the town's — checked placements.json `band_vocabulary` first
  // (quayside/lower-slope/…/the-coast/outskirts): that is a POSITION axis (rings
  // from the centre), orthogonal to distance-from-the-observer, so it does not
  // map to radial bands. Words chosen to read as reach, never as terrain.
  distance_bands: [
    { max: 8,      name: "underfoot" },
    { max: 40,     name: "close by" },
    { max: 150,    name: "a stone's throw" },
    { max: 600,    name: "across the way" },
    { max: 2500,   name: "a fair way off" },
    { max: 8000,   name: "far off" },
    { max: Infinity, name: "on the horizon" },
  ],
  // LOD (level of detail) — the scaling law
  context_budget: 12,               // max marks carried in one telling
  cluster_beyond_m: 600,            // past this, a household's marks collapse to its most-prominent (LOD tree-descent)
  max_sight_m: 20000,               // candidate cull radius (bounds compute; ~town diameter)
  weight_lod_k: 0.6,                // how much a mark's stamps lift its visibility
  angular_floor: 1e-5,              // below this angular size a mark is a speck
  // eye + line of sight
  eye_height_m: 1.7,                // observer eye above the ground they stand on
  los_step_m: 25,                   // heightfield sampling step along a sight ray
  los_clearance_m: 0.5,             // ground must clear the sight line by this to occlude
  // fog (status-effect surface, decision 008) — thickness seeds from the crossing
  fog_base: 0.45,                   // mean fog thickness across crossings [0..1]
  fog_swing: 0.45,                  // +/- deterministic swing per crossing
  fog_sight_floor_m: 120,           // thickest-fog sight radius at ground level
  fog_sight_ceiling_m: 20000,       // clear-air sight radius
  above_fog_bonus: 1.6,             // sightline multiplier when the eye is above the ceiling
  signal_fog_reach_mult: 6.0,       // a signal-mark cuts this many times further through fog
  // darkness (the light axis) — the far dark end dims what is not self-lit
  dark_dim_floor: 0.15,             // a non-luminous mark at the dark pole keeps this much visibility
  // heightfield
  idw_power: 2,                     // inverse-distance weighting exponent (naive, gentle)
  idw_k: 8,                         // k-nearest control points that contribute (localizes; hills don't bleed)
  // marks have height — a sited thing is not a flat ground decal; its top can
  // clear a gentle swell. A mark may declare top_m; else this modest default.
  default_mark_top_m: 4,
};

// ───────────────────────── 1. HEIGHTFIELD (naive, band-honoring) ────────────
// controlPoints: [{ x, y, h, id? }] — region band-midpoints + sea datum points,
// built by the loader from decision 008 + extracted anchors. IDW keeps open
// ground gentle and neutral (no drama sculpted between anchors).
export function buildHeightfield({ controlPoints, power = DIALS.idw_power, k = DIALS.idw_k }) {
  if (!controlPoints?.length) throw new Error("heightfield needs control points");
  const cps = controlPoints.map((c) => ({ x: c.x, y: c.y, h: c.h, id: c.id ?? null }));
  const K = Math.min(k, cps.length);
  function elevationAt(x, y) {
    // k-nearest IDW: only the nearest control points contribute, so hills stay
    // local and low corridors stay low — distant regions don't bleed in. This is
    // what keeps the naive field gentle AND faithful (no global averaging pull).
    const near = cps
      .map((c) => ({ c, d2: (x - c.x) ** 2 + (y - c.y) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, K);
    if (near[0].d2 === 0) return near[0].c.h;   // exactly on a control point
    let wsum = 0, hsum = 0;
    for (const { c, d2 } of near) { const w = 1 / Math.pow(d2, power / 2); wsum += w; hsum += w * c.h; }
    return hsum / wsum;
  }
  return { elevationAt, controlPoints: cps };
}

// ───────────────────────── radial helpers ──────────────────────────────────
// grid: x east, y south. Compass: N = -y, E = +x, S = +y, W = -x.
const ROSE16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
export function bearingDeg(dx, dy) {
  const deg = Math.atan2(dx, -dy) * 180 / Math.PI; // 0=N, 90=E
  return (deg + 360) % 360;
}
export function quantizeBearing(deg, points = DIALS.bearing_points) {
  const step = 360 / points;
  const idx = Math.round(deg / step) % points;
  if (points === 16) return ROSE16[idx];
  return `${Math.round(idx * step)}°`;
}
export function distanceBand(m, bands = DIALS.distance_bands) {
  for (const b of bands) if (m <= b.max) return b.name;
  return bands[bands.length - 1].name;
}

// ───────────────────────── the light axis ──────────────────────────────────
// lightLevel: 1 at the dawn pole, 0 at the dark pole, linear along the axis,
// clamped. Provisional on caelum's word (decision 008) — the poles are dated
// config the loader passes in, not constants here.
export function lightLevelAt(x, y, light) {
  const ax = light.dark_pole_m.x - light.dawn_pole_m.x;
  const ay = light.dark_pole_m.y - light.dawn_pole_m.y;
  const len2 = ax * ax + ay * ay || 1;
  const t = ((x - light.dawn_pole_m.x) * ax + (y - light.dawn_pole_m.y) * ay) / len2;
  return Math.max(0, Math.min(1, 1 - t)); // 1 at dawn end, 0 at dark end
}

// ───────────────────────── fog (deterministic per crossing) ─────────────────
// A pure hash of the crossing number → thickness [0..1]. No wall-clock, no
// unseeded randomness: crossing N always yields the same weather, so any clone
// replays the same telling. (Retroactive-replay guard, by construction.)
export function fogModel(crossing, dials = DIALS) {
  let h = (Math.imul((crossing | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  const u = h / 0xffffffff;                       // deterministic [0,1)
  const thickness = Math.max(0, Math.min(1, dials.fog_base + (u - 0.5) * 2 * dials.fog_swing));
  return { crossing: crossing | 0, thickness };
}

// ───────────────────────── status effects at a point ───────────────────────
export function statusAt({ x, y, groundH, eyeH, heightfield, light, fog, fogCeilingM }) {
  const eyeElev = groundH + eyeH;
  const inFog = groundH < fogCeilingM && fog.thickness > 0.02;
  const aboveFog = eyeElev >= fogCeilingM;
  const lightLevel = lightLevelAt(x, y, light);
  const inDarkness = lightLevel < 0.25;
  return { eyeElev, inFog, aboveFog, lightLevel, inDarkness };
}

// ───────────────────────── 3. LINE OF SIGHT over the ground ─────────────────
// Samples the heightfield along the ray; the target is occluded if the ground
// between rises above the straight eye→target sight line. Flat-earth (curvature
// negligible at town scale). Returns clearance in metres (>0 clear, <0 blocked).
export function lineOfSight({ from, to, heightfield, eyeH = DIALS.eye_height_m, targetTopM = 0, step = DIALS.los_step_m }) {
  const gx0 = heightfield.elevationAt(from.x, from.y);
  const gx1 = heightfield.elevationAt(to.x, to.y);
  const eye = gx0 + eyeH;
  const tgt = gx1 + targetTopM;
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < step) return { visible: true, clearance: Infinity, dist };
  let minClear = Infinity, occludeAt = null;
  const n = Math.ceil(dist / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const sx = from.x + dx * t, sy = from.y + dy * t;
    const sightLine = eye + (tgt - eye) * t;     // straight line eye→target top
    const ground = heightfield.elevationAt(sx, sy);
    const clear = sightLine - ground;            // +ve: ground is below the line
    if (clear < minClear) { minClear = clear; occludeAt = { x: Math.round(sx), y: Math.round(sy), ground: +ground.toFixed(1) }; }
  }
  const visible = minClear >= DIALS.los_clearance_m;
  return { visible, clearance: +minClear.toFixed(1), occludeAt: visible ? null : occludeAt, dist };
}

// ───────────────────────── LOD score ───────────────────────────────────────
// angular size (extent / distance) modulated by stamps; fog + darkness dim it
// unless the mark is a signal (a navigational light cuts through). The economy
// and the renderer read the SAME signal (mark.weight) — "the rendered ledger of
// accumulated preference," operational.
export function lodScore({ extentM, distM, weight = 0, dials = DIALS, dimming = 1 }) {
  const angular = Math.max(dials.angular_floor, extentM / Math.max(distM, 1));
  const stamp = 1 + dials.weight_lod_k * Math.log1p(Math.max(0, weight));
  return angular * stamp * dimming;
}

// ───────────────────────── 2+4. FIELD OF VIEW + radial serialize ────────────
// observer: { x, y, name? }
// world:    { marks, terrain, heightfield, light, fogCeilingM } — marks are the
//           FOLDED marks (id, kind, at, extent, weight, body, signal?, household).
// opts:     { crossing, budget }
// Returns a structured telling: the observer's state, the ranked visible marks
// grouped by bearing→band, far-features on the horizon, and the aggregate tail.
export function fieldOfView(observer, world, { crossing = 0, budget = DIALS.context_budget, dials = DIALS } = {}) {
  const { marks, terrain, heightfield, light, fogCeilingM } = world;
  const fog = fogModel(crossing, dials);
  const groundH = heightfield.elevationAt(observer.x, observer.y);
  const self = statusAt({ x: observer.x, y: observer.y, groundH, eyeH: dials.eye_height_m, heightfield, light, fog, fogCeilingM });

  // the observer's own fog-limited sight radius this crossing
  // fog closes the view with a curve, so even moderate fog bites (a low-lying
  // layer you look THROUGH); above the ceiling the sightlines run long.
  const fogT = self.inFog ? fog.thickness : 0;
  const clearReach = self.aboveFog
    ? dials.fog_sight_ceiling_m * dials.above_fog_bonus
    : dials.fog_sight_floor_m + (dials.fog_sight_ceiling_m - dials.fog_sight_floor_m) * Math.pow(1 - fogT, 3);

  const seen = [];
  for (const mk of marks) {
    if (!mk.at) continue;                                   // predicated/naming have no site of their own
    if (mk.kind === "parcel") continue;                     // a land-claim boundary is not scenery you see
    const dx = mk.at.x - observer.x, dy = mk.at.y - observer.y;
    const distM = Math.hypot(dx, dy);
    if (distM > dials.max_sight_m) continue;                // compute cull (bounds cost)
    if (distM < 1e-6) continue;                             // standing on it — orient() covers "here"
    const extentM = markExtent(mk);
    const targetH = heightfield.elevationAt(mk.at.x, mk.at.y);
    const isSignal = !!mk.signal;

    // fog reach: signal marks cut much further through fog
    const reach = isSignal ? clearReach * dials.signal_fog_reach_mult : clearReach;
    const fogHidden = distM > reach;

    // darkness dimming: a non-signal, non-luminous mark at the dark end is dim
    const tgtLight = lightLevelAt(mk.at.x, mk.at.y, light);
    const dark = tgtLight < 0.25 && !isSignal;
    const dimming = dark ? lerp(1, dials.dark_dim_floor, (0.25 - tgtLight) / 0.25) : 1;

    // terrain occlusion (the FOV over the heightfield)
    const los = lineOfSight({ from: observer, to: mk.at, heightfield, eyeH: dials.eye_height_m, targetTopM: markTop(mk) });

    const score = lodScore({ extentM, distM, weight: mk.weight, dials, dimming });
    const visible = !fogHidden && (los.visible || isSignal); // a signal's light is seen even where its footing is occluded
    seen.push({
      id: mk.id, kind: mk.kind, household: mk.household, body: mk.body,
      at: mk.at, distM: Math.round(distM), extentM, weight: mk.weight ?? 0, signal: isSignal,
      bearing: quantizeBearing(bearingDeg(dx, dy), dials.bearing_points),
      band: distanceBand(distM, dials.distance_bands),
      elevM: +targetH.toFixed(1), aboveFogTarget: targetH >= fogCeilingM,
      occluded: !los.visible, occludeAt: los.occludeAt, dim: +dimming.toFixed(2), score,
      visible,
    });
  }

  // far-features on the horizon (Pando): a horizon object, not heightfield ground.
  // Seen on any clear sightline in its bearing (decision 008) — above fog always,
  // or when this crossing's fog is thin enough.
  const farSeen = [];
  for (const ff of terrain?.far_features ?? []) {
    const clearHorizon = self.aboveFog || fog.thickness < 0.5;
    farSeen.push({
      id: `terrain:${ff.id}`, kind: "far-feature", far: true,
      bearing: ff.bearing, band: "on the horizon",
      distM: ff.distance_m, heightM: ff.height_m, label: ff.label ?? null, body: ff.receipt,
      visible: clearHorizon,
    });
  }

  // rank by LOD, then COLLAPSE THE TREE AT DISTANCE: beyond a proximity band a
  // household's cluster shows only its most-prominent mark (its home/beacon), the
  // rest folded into a clusteredCount you `investigate` to open. This is the LOD
  // law — top-level marks at distance, descend with proximity or attention.
  const ranked = seen.filter((s) => s.visible).sort((a, b) => b.score - a.score);
  const repByHh = new Map();
  const collapsed = [];
  for (const s of ranked) {
    const far = s.distM > dials.cluster_beyond_m;
    if (far && s.household && !s.signal) {
      const rep = repByHh.get(s.household);
      if (rep) { rep.clusteredCount = (rep.clusteredCount ?? 0) + 1; continue; }
      repByHh.set(s.household, s);
    }
    collapsed.push(s);
  }
  const carried = collapsed.slice(0, budget);
  const tail = collapsed.slice(budget);
  const tailByBearing = {};
  for (const t of tail) tailByBearing[t.bearing] = (tailByBearing[t.bearing] ?? 0) + 1;

  return {
    observer: {
      ...observer, groundElevM: +groundH.toFixed(1), eyeElevM: +self.eyeElev.toFixed(1),
      lightLevel: +self.lightLevel.toFixed(2), inFog: self.inFog, aboveFog: self.aboveFog, inDarkness: self.inDarkness,
    },
    crossing: fog.crossing, fog: { thickness: +fog.thickness.toFixed(2) }, sightReachM: Math.round(clearReach),
    carried, far: farSeen.filter((f) => f.visible),
    aggregate: { hidden_by_budget: tail.length, by_bearing: tailByBearing },
    counts: {
      candidates: seen.length, visible: ranked.length, shown: carried.length, clustered: collapsed.length - carried.length,
      occluded: seen.filter((s) => s.occluded && !s.signal).length,
      fogHidden: seen.filter((s) => !s.visible && !s.occluded).length,
    },
  };
}

// radialSerialize — group a fieldOfView result into bearing → band → marks, the
// shape a telling reads from. Pure restructure of fieldOfView output.
export function radialSerialize(fov) {
  const byBearing = {};
  for (const m of fov.carried) {
    (byBearing[m.bearing] ??= {});
    (byBearing[m.bearing][m.band] ??= []).push(m);
  }
  for (const f of fov.far) {
    (byBearing[f.bearing] ??= {});
    (byBearing[f.bearing]["on the horizon"] ??= []).push(f);
  }
  return { observer: fov.observer, crossing: fov.crossing, fog: fov.fog, sightReachM: fov.sightReachM, byBearing, aggregate: fov.aggregate, counts: fov.counts };
}

// ───────────────────────── geometry is NOT redefined here ───────────────────
// "You cannot lie with an edge" is enforced upstream by `tools/mark-lint.mjs`,
// which shares ONE `contains` and ONE loader with `tools/marks-fold.mjs` (the
// 07-22 nesting ruling). The engine consumes already-validated, already-folded
// marks — it must never grow a second definition of containment or a second
// mark reader, or the fold's edges and the engine's would be free to drift.
// Callers that need containment import `contains`/`rect` from marks-fold.mjs.

// ───────────────────────── small pure helpers ──────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function markExtent(mk) {
  if (mk.extent?.w || mk.extent?.h) return Math.max(mk.extent.w ?? 1, mk.extent.h ?? 1);
  return DEFAULT_EXTENT[mk.kind] ?? 2;
}
function markTop(mk) {                                  // vertical prominence: declared, else a modest default for sited things
  if (mk.top_m != null) return mk.top_m;
  return mk.kind === "sited" ? DIALS.default_mark_top_m : 0;
}
const DEFAULT_EXTENT = { sited: 4, parcel: 25 };
