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
  world_scale_extent_m: 50000,      // a mark this big is the FRAME (the world-root) — its body is the establishing line, never a list item
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
  // THE K NEAREST, WITHOUT SORTING THE WORLD TO FIND THEM.
  //
  // This function is the floor of the whole engine: line-of-sight samples it
  // along every ray, so opening one pair of eyes calls it tens of thousands of
  // times. It used to answer by building an object for EVERY control point,
  // sorting all of them, and keeping the first eight — O(n log n) work and n
  // allocations to select a constant 8. Profiling put 91% of openYourEyes in
  // here, and it was quietly superlinear in the size of the town, because the
  // control points are extracted from the marks: a town with 5× the marks has
  // 8× the control points, so every sample got dearer at the same time as there
  // were more samples to take. 743 marks → 1.3 s; 3,830 marks → 4.5 MINUTES.
  //
  // A fixed-size insertion beat is the whole fix. K is 8, so the inner shuffle
  // is a handful of moves and never grows; the scratch is hoisted out of the
  // call because allocating it per sample was a large share of the cost on its
  // own (the profiler's GC line). Answers are BIT-IDENTICAL to the sort — same
  // points, same order, same summation — and a test pins that against the
  // original implementation rather than against a remembered number.
  //
  // Ties keep the earlier control point, which is what the stable sort did: the
  // comparisons below are strict, so an equal-distance latecomer never displaces
  // the point that was already holding the seat.
  const bestD2 = new Float64Array(K);
  const bestH = new Float64Array(K);
  function elevationAt(x, y) {
    let n = 0;
    for (let i = 0; i < cps.length; i += 1) {
      const c = cps[i];
      const dx = x - c.x, dy = y - c.y;
      const d2 = dx * dx + dy * dy;
      if (n === K && !(d2 < bestD2[K - 1])) continue;   // cannot beat the worst held
      let j = n < K ? n : K - 1;
      while (j > 0 && d2 < bestD2[j - 1]) { bestD2[j] = bestD2[j - 1]; bestH[j] = bestH[j - 1]; j -= 1; }
      bestD2[j] = d2; bestH[j] = c.h;
      if (n < K) n += 1;
    }
    if (bestD2[0] === 0) return bestH[0];       // exactly on a control point
    let wsum = 0, hsum = 0;
    for (let i = 0; i < n; i += 1) { const w = 1 / Math.pow(bestD2[i], power / 2); wsum += w; hsum += w * bestH[i]; }
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
export function lineOfSight({ from, to, heightfield, eyeH = DIALS.eye_height_m, targetTopM = 0, step = DIALS.los_step_m, clearanceM = DIALS.los_clearance_m }) {
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
  const visible = minClear >= clearanceM;
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
    // A PARCEL RENDERS IN THE WORLD LIKE ANY OTHER MARK (the home-images
    // ruling, Keemin 2026-08-21: "make sure parcels render in the World like
    // any other mark. We removed them but that makes no sense if they get the
    // home image"). This lane used to skip `kind: parcel` as "a land-claim
    // boundary is not scenery you see" — true of an empty 25×25 survey square,
    // and false the moment that square carries a household's own home art. The
    // gold plan (Starstory PULSE/gold-plans/postmark-home-images) retires the
    // exclusion rather than gating it on `image:`, because a kind-gated hole in
    // the DEFAULT mark lane is the thing that made the art invisible in the
    // first place: parcels are marks, and the telling tells marks.
    if (mk.far) continue;                                   // a far:true mark is a horizon object (told below), never ground scenery
    if (markExtent(mk) >= dials.world_scale_extent_m) continue; // the world-root is the frame — establishing line, not a list item
    const dx = mk.at.x - observer.x, dy = mk.at.y - observer.y;
    const distM = Math.hypot(dx, dy);
    if (distM > dials.max_sight_m) continue;                // compute cull (bounds cost)
    if (distM < 1e-6) continue;                             // standing on it — orient() covers "here"
    // angular size uses the mark's true SILHOUETTE span (its visible width from
    // here) when it carries a fine shape; a plain rect falls back to max(w,h) —
    // byte-identical for every current record (none carry a points: ring).
    const extentM = markSilhouetteSpan(mk, dx, dy) ?? markExtent(mk);
    const targetH = heightfield.elevationAt(mk.at.x, mk.at.y);
    const isSignal = !!mk.signal;

    // fog reach: signal marks cut much further through fog
    const reach = isSignal ? clearReach * dials.signal_fog_reach_mult : clearReach;
    const fogHidden = distM > reach;

    // darkness dimming: a non-signal, non-luminous mark at the dark end is dim
    const tgtLight = lightLevelAt(mk.at.x, mk.at.y, light);
    const dark = tgtLight < 0.25 && !isSignal;
    const dimming = dark ? lerp(1, dials.dark_dim_floor, (0.25 - tgtLight) / 0.25) : 1;

    // terrain occlusion (the FOV over the heightfield) — every lean honored from
    // `dials` so a dev-pane override changes the sightline too, not just the ranking
    const los = lineOfSight({ from: observer, to: mk.at, heightfield, eyeH: dials.eye_height_m, targetTopM: markTop(mk, dials), step: dials.los_step_m, clearanceM: dials.los_clearance_m });

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
  // Rendered FROM the far:true MARKS — every claim in the UI is a mark-cell, so the
  // card's identity is the mark's id (the-town/pando-peak), and the precise numbers
  // (bearing, distance, height) come from the skeleton feature its `feature:` link
  // names — the two-precision split (the mark is the claim; the skeleton is the
  // measurement). Seen on any clear sightline (decision 008): above fog always, or
  // when this crossing's fog is thin enough.
  const farSeen = [];
  const clearHorizon = self.aboveFog || fog.thickness < 0.5;
  const farFeatureById = new Map((terrain?.far_features ?? []).map((f) => [f.id, f]));
  for (const mk of marks) {
    if (!mk.far || !mk.at) continue;
    const ff = farFeatureById.get(mk.feature) ?? farFeatureById.get(String(mk.id).split("/").pop());
    const dx = mk.at.x - observer.x, dy = mk.at.y - observer.y;
    farSeen.push({
      id: mk.id, kind: "far-feature", far: true,
      bearing: ff?.bearing ?? quantizeBearing(bearingDeg(dx, dy), dials.bearing_points),
      band: "on the horizon",
      distM: ff?.distance_m ?? Math.round(Math.hypot(dx, dy)),
      heightM: ff?.height_m ?? markTop(mk, dials),
      label: ff?.label ?? null, body: mk.body ?? ff?.receipt,
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
// Callers that need containment import `contains`/`rect` from geometry.mjs.

// ───────────────────────── small pure helpers ──────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function markExtent(mk) {
  if (mk.extent?.w || mk.extent?.h) return Math.max(mk.extent.w ?? 1, mk.extent.h ?? 1);
  return DEFAULT_EXTENT[mk.kind] ?? 2;
}
// Vertical prominence: declared, else a modest default for a thing standing on
// the ground.
//
// THE SECOND HALF OF THE PARCEL EXCLUSION (home-images ruling, 2026-08-21).
// This read `mk.kind === "sited"`, and while fieldOfView skipped parcels
// outright that gate cost nothing. It is not free now, and it is not a
// different rule: a target with zero prominence has its sightline aimed at its
// own dirt, so the last sample before it always grazes — `clear` comes out at
// (eyeH / n), which SHRINKS with distance. A flat mark is therefore reported
// occluded by the ground it sits on, and more so the further off it is, which
// is the artifact backwards. Retiring the `continue` alone left 2 of 58 real
// parcels tellable; the rest were "occluded" by nothing.
//
// So a parcel gets the same modest default a house gets. That is not a claim
// that a land-claim is a building — it is the claim that there is something
// standing there to see, which is true by construction: a parcel is seeded
// around a placed home, and the viewer has always drawn its footprint at that
// spot. Terrain still occludes it exactly as it occludes anything else.
function markTop(mk, dials = DIALS) {
  if (mk.top_m != null) return mk.top_m;
  return (mk.kind === "sited" || mk.kind === "parcel") ? dials.default_mark_top_m : 0;
}
// The mark's SILHOUETTE span — its visible width from the observer — when it
// carries a fine shape (a `points:` ring). Projects every ring vertex onto the
// axis perpendicular to the view bearing; the span (max−min) is what the eye
// actually subtends, replacing extent-as-width. Null for a plain rect, so the
// caller keeps analytic max(w,h) — byte-identical for every current record. The
// engine reads only the mark's own points (no geometry import, no disk).
function markSilhouetteSpan(mk, dx, dy) {
  const ring = Array.isArray(mk.points) && mk.points.length >= 3 ? mk.points : null;
  if (!ring) return null;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;                  // unit vector perpendicular to the bearing
  let min = Infinity, max = -Infinity;
  for (const p of ring) {
    const vx = Array.isArray(p) ? p[0] : p.x, vy = Array.isArray(p) ? p[1] : p.y;
    const proj = vx * px + vy * py;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return max - min;
}
const DEFAULT_EXTENT = { sited: 4, parcel: 25 };
