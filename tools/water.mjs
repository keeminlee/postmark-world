// water.mjs — the water oracle. Pure functions over the SKELETON's true shapes.
//
// The walk gate needs one question answered honestly: is this ground water, and
// does this leg cross it? Ruling 4 (2026-07-27) fixes where the answer comes
// from: the skeleton's own geometry, NEVER a mark's `extent` rectangle. The
// channel and the reaches carry `centerline_m` polylines with a per-point width;
// the lakes are true ellipses. A bounding box around a river is not a river.
//
// Scope is the walk gate ONLY. Parcel admissibility no longer consults water
// (ruling 6: parcels block parcels, full stop), so nothing else imports this.
//
// THE SEA IS NOT GATED. `the-sea` carries no edge geometry — its own note says
// the shoreline lives in the atlas COASTLINE and is a seeding item. Ruling 4
// names this as the v1 exception, so v1 gates inland water and a walker CAN walk
// into the sea. Deliberately visible rather than silently absent: `seaGated()`
// returns false and callers may say so.
//
// Pure: no fs, no clock, no engine import. Browser-safe.

// A leg is sampled rather than intersected analytically (CALLS.md C4). 25 m
// against the narrowest water in the record (110 m) is 4.4 samples across, so an
// inland crossing cannot slip between samples. Exported because it is the knob
// that trades cost against tangential-clip accuracy.
export const WATER_SAMPLE_STEP_M = 25;

const WATER_KINDS = new Set(["channel", "still-water", "still-inlet"]);
const LAKE_KINDS = new Set(["lake"]);

// Crossings are the ground you MAY cross water on. Read by kind so a seeded
// Town Centre crossing is picked up without touching this file.
const CROSSING_KINDS = new Set(["narrow-footbridge", "stepping-stone", "ford", "bridge"]);

export function isCrossingFeature(f) {
  return CROSSING_KINDS.has(f?.kind) || /-crossing$/.test(f?.id ?? "");
}

// ── geometry ────────────────────────────────────────────────────────────────

// Distance from p to segment ab, plus how far along ab the closest point sits
// (0..1) — the parameter is what lets width interpolate along the segment.
function distToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return { d: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;                     // clamp = capsule, not infinite line
  const cx = a.x + t * vx, cy = a.y + t * vy;
  return { d: Math.hypot(p.x - cx, p.y - cy), t };
}

// A centreline feature is a chain of capsules: each segment's radius grows from
// half its start width to half its end width. Clamping t gives round joins and
// round ends for free, which is what `round_end: true` asks for.
// How p sits against one water feature: its distance to the water's spine and the
// water's local half-width there. Crossing reach is derived from these rather
// than from a magic radius — a bridge spans the water it stands on.
// EXPORTED so the shape generator draws from this definition rather than a second
// copy of it: half-width comes from the same `w_m` / `rx_m` the gate reads, so a
// generated ring and the oracle's answer cannot disagree about how wide water is.
export function halfWidthAtIndex(feature, i) {
  const pts = feature.centerline_m ?? feature.line_m ?? [];
  const w = pts[i]?.w_m ?? feature.width_m ?? 0;
  return w / 2;
}

function localWaterMetricsAt(p, feature) {
  if (LAKE_KINDS.has(feature.kind)) {
    const dx = p.x - (feature.center_m?.x ?? 0), dy = p.y - (feature.center_m?.y ?? 0);
    const r = Math.max(feature.rx_m ?? 0, feature.ry_m ?? 0);
    return { d: Math.hypot(dx, dy), halfWidth: r };
  }
  const pts = feature.centerline_m ?? feature.line_m ?? [];
  let best = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const { d, t } = distToSegment(p, a, b);
    const wa = a.w_m ?? feature.width_m ?? 0, wb = b.w_m ?? feature.width_m ?? wa;
    const halfWidth = (wa + (wb - wa) * t) / 2;
    if (!best || d < best.d) best = { d, halfWidth };
  }
  return best;
}

function inCentreline(p, feature) {
  const pts = feature.centerline_m ?? feature.line_m ?? [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const { d, t } = distToSegment(p, a, b);
    const wa = a.w_m ?? feature.width_m ?? 0, wb = b.w_m ?? feature.width_m ?? wa;
    const halfWidth = (wa + (wb - wa) * t) / 2;
    if (d <= halfWidth) return true;
  }
  return false;
}

function inLake(p, feature) {
  const c = feature.center_m; if (!c) return false;
  const rx = feature.rx_m ?? 0, ry = feature.ry_m ?? 0;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (p.x - c.x) / rx, dy = (p.y - c.y) / ry;
  return dx * dx + dy * dy <= 1;
}

// ── the oracle ──────────────────────────────────────────────────────────────

export function waterFeatures(skeleton) {
  return (skeleton?.features ?? []).filter(
    (f) => WATER_KINDS.has(f.kind) || LAKE_KINDS.has(f.kind),
  );
}

// Is `the-sea` gated? No — see the header. Callers may report this honestly.
export function seaGated() { return false; }

// waterAt(point, skeleton) → the water feature's id, or null. Returns the ID
// rather than a boolean so a bounce can name what it refused to cross.
export function waterAt(p, skeleton) {
  for (const f of waterFeatures(skeleton)) {
    const hit = LAKE_KINDS.has(f.kind) ? inLake(p, f) : inCentreline(p, f);
    if (hit) return f.id;
  }
  return null;
}

// ── crossings are how you get over ───────────────────────────────────────────
// Ruling 4 makes water an OBSTACLE with no pathfinding. It does not make water
// impassable: the skeleton records named crossings, and a bridge nobody can walk
// over is furniture. Without this exemption the gate refused every leg over a
// footbridge — and refused the leg TO the bridge as well, since the bridge point
// itself sits in the water — so the bounce's own advice ("cross at X, then walk
// onward") could not be followed by anyone.
//
// PROVISIONAL, and the honest part: a crossing is recorded as a bare POINT with
// no span and no orientation, while the water it crosses is 110–550 m wide. That
// is not enough geometry to model a bridge truthfully. The reach below is at
// least derived from the WATER rather than invented as a constant — a bridge
// spans the water it stands on — but it is a DISC, and a disc over-permits: any
// leg passing through water within the reach counts as having used the crossing,
// even one that never goes near the crossing point. Observed: a 695 m leg 300 m
// south of the footbridge "crosses at" it without approaching it.
//
// The fix is a record change, not a code change — a crossing wants two endpoints
// (a span), so the exemption becomes a CORRIDOR and "cross at the bridge" means
// what it says. Until then this is a stand-in that keeps bridges usable, which
// is strictly better than water nobody can ever cross. CALLS.md C10.
export const CROSSING_MARGIN_M = 40;

// A crossing reaches ACROSS the water it stands on: far enough to touch the far
// bank from wherever the record put it. These points are not centred in the
// water (the footbridge sits 228 m off a 470 m channel's spine, near one bank),
// so a reach measured only as half-width would cover the near bank and stop
// short of the far one — leaving a bridge you can step onto but not walk over.
export function crossingReachM(crossing, skeleton) {
  for (const f of waterFeatures(skeleton)) {
    const m = localWaterMetricsAt(crossing.at, f);
    if (!m || m.halfWidth <= 0) continue;
    if (m.d > m.halfWidth) continue;         // this crossing does not stand on this water
    return m.d + m.halfWidth + CROSSING_MARGIN_M;
  }
  return CROSSING_MARGIN_M;
}

// The crossing whose reach covers p, or null. This is what makes a water sample
// walkable — never a mark, never a route, only a recorded crossing.
export function crossingAt(p, skeleton) {
  for (const c of crossings(skeleton)) {
    const reach = crossingReachM(c, skeleton);
    if (Math.hypot(p.x - c.at.x, p.y - c.at.y) <= reach) return c.id;
  }
  return null;
}

// segmentCrossesWater(a, b, skeleton) → null when the leg is walkable, else
// { feature, at } naming the water and the first sampled point inside it.
// Endpoints are always sampled, so a departure or destination standing in water
// is caught even on a leg shorter than one step.
export function segmentCrossesWater(a, b, skeleton, { step = WATER_SAMPLE_STEP_M } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const feature = waterAt(p, skeleton);
    if (!feature) continue;
    // water, but on a crossing — that is what the crossing is for
    if (crossingAt(p, skeleton)) continue;
    return { feature, at: { x: Math.round(p.x), y: Math.round(p.y) } };
  }
  return null;
}

// Which crossings a permitted leg actually walks over, in the order met. Purely
// for the telling — the gate above has already decided. Naming the bridge in the
// answer is how a walker learns the crossings exist.
export function crossingsOnSegment(a, b, skeleton, { step = WATER_SAMPLE_STEP_M } = {}) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  const used = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!waterAt(p, skeleton)) continue;
    const c = crossingAt(p, skeleton);
    if (c && !used.includes(c)) used.push(c);
  }
  return used;
}

// The crossings the world actually holds, with a point to walk to. A footbridge
// carries `at_m`; a stepping-stone path carries `line_m` (its midpoint is the
// honest "go here" answer for a chain of stones).
export function crossings(skeleton) {
  const out = [];
  for (const f of skeleton?.features ?? []) {
    if (!isCrossingFeature(f)) continue;
    let at = f.at_m ?? f.center_m ?? null;
    if (!at && Array.isArray(f.line_m) && f.line_m.length) {
      const mid = f.line_m[Math.floor(f.line_m.length / 2)];
      at = { x: mid.x, y: mid.y };
    }
    if (at) out.push({ id: f.id, kind: f.kind, at });
  }
  return out;
}

// Nearest crossing to `from` (CALLS.md C8 records why from the DEPARTURE point,
// and what that gets wrong).
export function nearestCrossing(from, skeleton) {
  let best = null, bd = Infinity;
  for (const c of crossings(skeleton)) {
    const d = Math.hypot(c.at.x - from.x, c.at.y - from.y);
    if (d < bd) { bd = d; best = { ...c, distM: Math.round(d) }; }
  }
  return best;
}
