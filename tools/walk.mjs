// walk.mjs — the movement ledger's grammar and the derived-position function.
//
// The design law: DECLARATIVE RECORDS + DERIVED STATE. The world never
// simulates; it computes. A departure is recorded once, at the moment it is
// declared. Position is then a pure function of (record, clock) — nothing
// en-route is ever stored, every reader derives it, and any clone recomputes it
// byte-identically. An open tab watches the walker cross the map because the
// clock moved, not because anything was written.
//
// Session-independence falls out of that: the walker arrives whether or not
// anyone is watching. The walker's body is the letter.
//
// Pure: no fs, no engine import. The office pen owns writing; this owns grammar
// and arithmetic.

import { pointInPolygon, pointInRect, polygonOf } from "./geometry.mjs";

// The pace dial — decision 008, movable by ruling, never silently.
// AMENDED by 008b (2026-08-16): the LIVE law is the departure class's own dial
// (the-keeping-works/postmark-node/entity/resident since the 2026-08-22 move — the stride rides the MOVER, never the verb; dials.pace_km_per_crossing, 60 as of the
// ruling), read at act time by the office and stamped per-leg as `· pace <n>`.
// This constant now derives ONLY unstamped legs — every departure declared
// before 008b — and must stay 15 forever so their history never rewrites.
export const WALK_KM_PER_CROSSING = 15;
export const WALK_M_PER_CROSSING = WALK_KM_PER_CROSSING * 1000;

// The same epoch and cadence the engine's currentCrossing() uses. Duplicated as
// a constant rather than imported so this module stays dependency-free; if the
// cadence ever changes it changes in both, and a conformance fixture below pins
// the relationship so a drift fails a test rather than a walker.
export const CROSSING_EPOCH_UTC = Date.UTC(2026, 5, 12); // 2026-06-12T00:00Z
export const CROSSING_MS = 12 * 3600 * 1000;

// Whole crossings plus the fraction through the current one. The integer part is
// exactly currentCrossing(); the fraction is what makes motion continuous.
export function fractionalCrossing(nowMs = Date.now()) {
  return Math.max(0, (nowMs - CROSSING_EPOCH_UTC) / CROSSING_MS);
}

// ── the ledger's grammar ────────────────────────────────────────────────────
//
// One line per departure, append-only, mirroring the town's mail/stamp ledgers:
//
//   - <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional>[ · within <w>,<h>][ · to <mark-id>]
//
// `toward` is ALWAYS coordinates. The optional trailing `to <mark-id>` records
// what was asked for. `within` freezes the target's extent at departure so
// arrival remains a pure function of the line + clock: a mark that later moves,
// resizes, or retires cannot rewrite where someone arrived (CALLS.md C5 + the
// 2026-07-28 arrival ruling).

export const DEPARTURE_RE =
  /^- (\S+) · (\S+) · from (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) · toward (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) · at (\d+(?:\.\d+)?)(?: · within (\d+(?:\.\d+)?),(\d+(?:\.\d+)?))?(?: · to (\S+))?(?: · pace (\d+(?:\.\d+)?))?$/;

export function formatDeparture({ handle, from, toward, at, targetExtent = null, targetMarkId = null, iso = null, pace = null }) {
  const stamp = iso ?? new Date().toISOString();
  const within = targetExtent ? ` · within ${round1(targetExtent.w)},${round1(targetExtent.h)}` : "";
  const intent = targetMarkId ? ` · to ${targetMarkId}` : "";
  // pace (008b): the law as it stood at declaration, stamped so later dial
  // amendments never re-derive this leg. Omitted = pre-008b legacy constant.
  const stride = pace > 0 ? ` · pace ${round1(pace)}` : "";
  return `- ${stamp} · ${handle} · from ${round1(from.x)},${round1(from.y)}`
       + ` · toward ${round1(toward.x)},${round1(toward.y)} · at ${at.toFixed(4)}${within}${intent}${stride}`;
}

const round1 = (n) => Math.round(n * 10) / 10;
// Two decimals in ONE division. round1(n * 10) / 10 divides twice, and 107/10/10
// is not 1.07 in binary floating point — it published 1.0699999999999998 to
// every reader of the walkers API.
const round2 = (n) => Math.round(n * 100) / 100;

export function parseWalkLedger(text) {
  const departures = [];
  const unrecognized = [];
  for (const raw of String(text ?? "").replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.startsWith("- ")) continue;
    const m = raw.match(DEPARTURE_RE);
    if (!m) { unrecognized.push(raw); continue; }
    departures.push({
      iso: m[1], handle: m[2],
      from: { x: +m[3], y: +m[4] },
      toward: { x: +m[5], y: +m[6] },
      at: +m[7],
      targetExtent: m[8] === undefined ? null : { w: +m[8], h: +m[9] },
      targetMarkId: m[10] ?? null,
      // pace: km/crossing for THIS departure (Keemin's ruling 2026-08-06 — the
      // vessel is a walker with a faster stride: TC→Pando in 4h ≈ 405). The
      // door never writes it; only the pen does, so a resident's own walks
      // always derive at the town dial.
      pace: m[11] === undefined ? null : +m[11],
      line: raw,
    });
  }
  return { departures, unrecognized };
}

// The one that governs: a resident's CURRENT departure is their last recorded
// one. Supersede is not a mutation — it is a new departure from the derived
// position, so "latest wins" is the whole rule.
export function currentDeparture(departures, handle) {
  let cur = null;
  for (const d of departures) if (d.handle === handle) cur = d;
  return cur;
}

// ── derived position ────────────────────────────────────────────────────────

function targetRect(departure) {
  const { toward, targetExtent } = departure;
  if (!targetExtent || !Number.isFinite(targetExtent.w) || !Number.isFinite(targetExtent.h)) return null;
  return { x: toward.x, y: toward.y, w: Math.abs(targetExtent.w), h: Math.abs(targetExtent.h) };
}

// The fraction of the centre-bound segment at which it first enters the target
// rect. The centre remains the interpolation target; the walk ends at the first
// point on the target's ground, not at its centre. Exported since 2026-08-09:
// the viewer clips the drawn leg with THIS math, so the dotted line and the
// derivation stop at the same point — one arrival truth, never a second.
export function targetEntryT(from, toward, r) {
  if (pointInRect(from.x, from.y, r)) return 0;
  let enter = 0, exit = 1;
  for (const axis of ["x", "y"]) {
    const start = from[axis], delta = toward[axis] - start;
    const half = (axis === "x" ? r.w : r.h) / 2;
    const lo = r[axis] - half, hi = r[axis] + half;
    if (delta === 0) {
      if (start < lo || start > hi) return 1;
      continue;
    }
    const a = (lo - start) / delta, b = (hi - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  return Math.max(0, Math.min(1, enter <= exit ? enter : 1));
}

// ── where within the target's ground a walk ends ────────────────────────────
//
// Two arrivals, one grammar (issue #5 §1, jetto-of-starforge). ENTRY is the
// default and stays it: the walk ends at the first point on the target's ground,
// because walking "to" a 3.6 km mountain has no business teleporting you to its
// middle. CENTRE is for when the intent is to arrive AT a place rather than
// merely reach it — and it is what lets a resident who landed on a fence walk
// IN, which is the whole cost of the seam: arrival-on-entry leaves you standing
// exactly on the boundary, where any rect you then claim straddles the line and
// nests one level out.
//
// CENTRE NEEDS NO NEW LEDGER TOKEN. `within` is precisely what makes arrival
// mean "the derived point entered the target's extent"; a departure that records
// no `within` interpolates all the way to `toward`, which IS the mark's centre.
// So the variant is expressed in the grammar that already exists — and it is not
// even a new idiom: the vessel has always sailed this way (vessel.mjs records
// `targetExtent: null` with a `targetMarkId` so she lies exactly on her stop).
//
// Nothing is lost by the omission. `to <mark-id>` still records what was asked
// for, so the line says where the walker was headed either way; and the freeze
// that `within` performs for an entry walk has nothing to freeze for a centre
// one, because `toward` is already the frozen point the walk ends at. A later
// move or resize of the target cannot rewrite either arrival.
// RENAMED 2026-08-19 (founder-ruled, the Seven zero-distance confusion): the
// field is `mode:`, the words are `rim` and `center`. "to:" invited mark names
// into an enum slot, and "centre" collided with the Town Centre's own name.
// The legacy pair stays VALID here deliberately — the office imports this file
// from the world clone at runtime, so an older office deploy passing "entry"
// against a newer clone must keep working; the office normalizes legacy → canon
// before anything is recorded or spoken.
export const WALK_ARRIVALS = Object.freeze(["rim", "center", "entry", "centre"]);
export const WALK_ARRIVAL_DEFAULT = "rim";
export const WALK_ARRIVAL_CANON = Object.freeze({ entry: "rim", centre: "center", rim: "rim", center: "center" });
export const isWalkArrival = (v) => WALK_ARRIVALS.includes(v);

// What a mark-targeted departure records as its `within`, given the arrival
// asked for. Callers ask rather than deciding for themselves: one module knows
// what an arrival MEANS, so the office and the pen cannot drift into two answers.
export function extentForArrival(arrival, markExtent) {
  const canon = WALK_ARRIVAL_CANON[arrival] ?? arrival;
  return canon === "center" ? null : (markExtent ?? null);
}

// ── THE RING WINS HERE TOO (founder-ruled 2026-09-11: "ring wins everywhere") ─
//
// A mark's shape is its `points:` ring when it has one and its at/extent box
// otherwise, and every tool that asks WHERE something is or whether a point is
// INSIDE it asks that one shape. `pointWithinMark`, `marksContain` and
// `containmentChain` have preferred the ring since the regions took their true
// shape. The WALK did not, and the gap was not theoretical: wright walked to
// wright/the-trueing-terrace (a 12-point ring inset from its 1834 x 1563 box),
// the rim arrival stopped him at y = -1669 — the box's near edge — and by the
// ring that point stands in rei/the-lanternseed-gardens. The walk desk put him
// on his neighbour's ground and called it arrival.
//
// WHY THE FIX IS A FROZEN POINT AND NOT A RING ON THE LINE. Position is a pure
// function of (record, clock): `positionAt` is handed a parsed ledger line and
// nothing else, and the line's `within <w>,<h>` is a BOX by grammar. Putting a
// twelve-vertex ring on every departure line would be a new field in an
// append-only public record, and re-resolving the mark id at derivation time
// would let a later re-cut of a ring rewrite where somebody already arrived —
// the exact thing `within` was introduced to prevent. So the ring is consulted
// ONCE, at declaration, and what it decides is frozen as the departure's own
// `toward` with no extent beside it.
//
// THIS IS NOT A NEW IDIOM. `src/arena.mjs § arrivalOnGround` already writes a
// mark-targeted departure exactly this way, and its own note carries the
// argument verbatim: "a named point is MORE frozen than a rect, not less (a
// later resize of the room cannot rewrite an arrival that is a coordinate), and
// the target's id still rides the ledger line, so the record says where the
// walker was headed either way." A ring is a re-cut waiting to happen, which
// makes the case here stronger, not weaker.
//
// Nothing downstream changes shape. `targetEntryT`, `positionAt`'s arrival
// predicate, the viewer's leg-clipping and the arena's own entry maths all read
// a rect off the line; a ringed target now puts no rect there, so all four
// simply take the no-extent path they already take for a `center` walk and for
// every vessel sailing. One arrival truth, still — and no second shape function:
// the ring comes from `polygonOf`, the membership test from `pointInPolygon`,
// both the ones geometry.mjs already owns.

// How far past the boundary an arrival stands. ON the ring is not IN it — the
// ray-cast at a vertex is a coin toss and a rect claimed from the line straddles
// it — which is the same seam the `center` mode was invented for, one metre
// wide. A dial, movable by ruling, never silently.
export const RING_ARRIVAL_INSET_M = 1;

/**
 * Where a walk to a RINGED mark ends, or null when the mark carries no ring and
 * the caller should keep the box path it has always used.
 *
 * `rim` — the first point at which the straight road from `from` to the mark's
 * anchor crosses the ring, stepped `inset` metres further along that road. Rim
 * keeps its whole meaning ("stop at the first point of the target's ground");
 * it is only that the ground is now the ring's, not the bounding box's.
 *
 * `center` — the anchor, when the road reaches it: a ring's bbox centre is
 * guaranteed to be the box's middle and NOT guaranteed to be on the mark's own
 * ground, so a concave ring whose anchor falls outside it has no middle to walk
 * to and takes the rim answer instead.
 *
 * Already standing inside the ring is "stand here", which is byte-identical to
 * what a rim walk into a box you are already in has always derived (`entryT`
 * returns 0, the leg is zero-length, `standing: true`).
 */
export function walkTargetFor(mark, from, arrival = WALK_ARRIVAL_DEFAULT) {
  const ring = polygonOf(mark);
  const ax = Number(mark?.at?.x), ay = Number(mark?.at?.y);
  if (!ring || !Number.isFinite(ax) || !Number.isFinite(ay)) return null;
  const fx = Number(from?.x), fy = Number(from?.y);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;

  const canon = WALK_ARRIVAL_CANON[arrival] ?? arrival;
  const anchorInside = pointInPolygon(ax, ay, ring);
  const point = (x, y) => ({ toward: { x: round1(x), y: round1(y) }, targetExtent: null, ringed: true });

  if (canon === "center" && anchorInside) return point(ax, ay);
  if (pointInPolygon(fx, fy, ring)) return point(fx, fy);

  const hit = ringEntryAlong(ring, { x: fx, y: fy }, { x: ax, y: ay }, RING_ARRIVAL_INSET_M);
  if (hit) return point(hit.x, hit.y);
  // The road never met the ring at all (a degenerate ring, or an anchor the
  // road cannot reach). The anchor is still the mark's own ground if it is
  // inside; otherwise this mark has no answer and the caller keeps the box,
  // which is no worse than yesterday and is never silently a lie about a ring.
  return anchorInside ? point(ax, ay) : null;
}

/**
 * The first point the segment `from → anchor` crosses `ring`, stepped `inset`
 * metres further along it, or null if it never crosses.
 *
 * The step can overshoot a stretch of ground thinner than the inset, so the
 * result is CHECKED rather than assumed: if the stepped point is not inside the
 * ring, the answer is the midpoint between this crossing and the next one, which
 * for a simple polygon is inside by construction.
 */
function ringEntryAlong(ring, from, anchor, inset) {
  const dx = anchor.x - from.x, dy = anchor.y - from.y;
  const legM = Math.hypot(dx, dy);
  if (!legM) return null;
  const ts = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const t = segmentT(from, anchor, a, b);
    if (t !== null && t > 0 && t <= 1) ts.push(t);
  }
  if (!ts.length) return null;
  ts.sort((p, q) => p - q);
  const t1 = ts[0];
  const at = (t) => ({ x: from.x + dx * t, y: from.y + dy * t });
  const stepped = at(Math.min(1, t1 + inset / legM));
  if (pointInPolygon(stepped.x, stepped.y, ring)) return stepped;
  const t2 = ts.find((t) => t > t1);
  if (t2 === undefined) return null;
  const mid = at((t1 + t2) / 2);
  return pointInPolygon(mid.x, mid.y, ring) ? mid : null;
}

/** Where along p1→p2 it meets p3→p4, or null when they do not properly cross. */
function segmentT(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return null; // parallel or collinear — the next edge answers
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return u >= 0 && u <= 1 ? t : null;
}

// positionAt(departure, nowFractional) → where the walker is, and whether the
// leg is finished. For a mark/home target, arrival is the containment predicate:
// the derived coordinates have entered the target's recorded extent. Raw
// coordinates — and centre-bound walks, which record no extent — retain point
// arrival. No arrival record exists and nothing is written when it happens.
export function positionAt(departure, nowFractional = fractionalCrossing()) {
  if (!departure) return null;
  const { from, toward, at } = departure;
  const centreM = Math.hypot(toward.x - from.x, toward.y - from.y);

  // A zero-distance departure is "stand here" — the stop. Always arrived.
  if (centreM === 0) {
    return { x: from.x, y: from.y, arrived: true, standing: true,
             legM: 0, travelledM: 0, remainingM: 0, etaCrossings: 0 };
  }

  // A departure may carry its own pace (km/crossing) — the vessel's stride.
  // Absent or non-positive, the town dial governs, as it always has.
  const paceM = departure.pace > 0 ? departure.pace * 1000 : WALK_M_PER_CROSSING;
  const elapsed = Math.max(0, nowFractional - at);
  const travelledM = elapsed * paceM;
  const r = targetRect(departure);
  const entryT = r ? targetEntryT(from, toward, r) : 1;
  const arrivalM = centreM * entryT;
  const candidateT = Math.min(1, travelledM / centreM);
  const candidate = {
    x: from.x + (toward.x - from.x) * candidateT,
    y: from.y + (toward.y - from.y) * candidateT,
  };
  const arrived = r ? pointInRect(candidate.x, candidate.y, r) : travelledM >= centreM;
  const t = arrived ? entryT : candidateT;
  const remainingM = Math.max(0, arrivalM - travelledM);

  return {
    x: round1(from.x + (toward.x - from.x) * t),
    y: round1(from.y + (toward.y - from.y) * t),
    arrived, standing: arrivalM === 0,
    legM: Math.round(arrivalM),
    travelledM: Math.round(Math.min(travelledM, arrivalM)),
    remainingM: Math.round(remainingM),
    etaCrossings: arrived ? 0 : round2(remainingM / paceM),
  };
}

// Every resident with a record, at one instant — the presence layer's input
// (ruling 1). Placed residents with no departure are not here: they have no
// record, so their position is their home, which only the office can resolve.
export function positionsAt(departures, nowFractional = fractionalCrossing()) {
  const byHandle = new Map();
  for (const d of departures) byHandle.set(d.handle, d);
  const out = {};
  for (const [handle, d] of byHandle) out[handle] = { ...positionAt(d, nowFractional), departure: d };
  return out;
}

// A departure's own legs are one hop each: the resident is the pathfinder
// (ruling 4), so there is no path to plan — only the leg they declared.
export function legOf(departure) {
  return departure ? { a: departure.from, b: departure.toward } : null;
}

// ── the public vocabulary ────────────────────────────────────────────────────
// The office door and the spectator both publish walkers, and they must publish
// the SAME words: two hand-written mappings of one concept drift, and the first
// drift already happened (the spectator emitted `remainingM` while the office
// emitted `remaining_m`, so the viewer read undefined). This is the single writer
// of that shape — callers map through it rather than restating it.
export function publicWalker(handle, p) {
  return {
    handle,
    x: p.x, y: p.y,
    arrived: p.arrived, standing: p.standing,
    remaining_m: p.remainingM,
    eta_crossings: p.etaCrossings,
    toward: p.departure?.toward ?? null,
    mark_id: p.departure?.targetMarkId ?? null,
  };
}

// Every walker's public position at a given clock, in one call.
export function publicWalkers(departures, nowFractional = fractionalCrossing()) {
  return Object.entries(positionsAt(departures, nowFractional)).map(([h, p]) => publicWalker(h, p));
}
