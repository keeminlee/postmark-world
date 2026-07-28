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

// The pace dial — decision 008, movable by ruling, never silently.
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
//   - <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional>[ · to <mark-id>]
//
// `toward` is ALWAYS coordinates. The optional trailing `to <mark-id>` records
// what was asked for, so the record keeps intent without making derivation
// depend on re-resolving a mark that may later move or retire (CALLS.md C5).

export const DEPARTURE_RE =
  /^- (\S+) · (\S+) · from (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) · toward (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) · at (\d+(?:\.\d+)?)(?: · to (\S+))?$/;

export function formatDeparture({ handle, from, toward, at, targetMarkId = null, iso = null }) {
  const stamp = iso ?? new Date().toISOString();
  const tail = targetMarkId ? ` · to ${targetMarkId}` : "";
  return `- ${stamp} · ${handle} · from ${round1(from.x)},${round1(from.y)}`
       + ` · toward ${round1(toward.x)},${round1(toward.y)} · at ${at.toFixed(4)}${tail}`;
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
      targetMarkId: m[8] ?? null,
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

// positionAt(departure, nowFractional) → where the walker is, and whether the
// leg is finished. Arrival is the CLAMP engaging — no arrival record exists and
// nothing is written when it happens (CALLS.md C6).
export function positionAt(departure, nowFractional = fractionalCrossing()) {
  if (!departure) return null;
  const { from, toward, at } = departure;
  const legM = Math.hypot(toward.x - from.x, toward.y - from.y);

  // A zero-distance departure is "stand here" — the stop. Always arrived.
  if (legM === 0) {
    return { x: from.x, y: from.y, arrived: true, standing: true,
             legM: 0, travelledM: 0, remainingM: 0, etaCrossings: 0 };
  }

  const elapsed = Math.max(0, nowFractional - at);
  const travelledM = elapsed * WALK_M_PER_CROSSING;
  const arrived = travelledM >= legM;
  const t = arrived ? 1 : travelledM / legM;
  const remainingM = Math.max(0, legM - travelledM);

  return {
    x: round1(from.x + (toward.x - from.x) * t),
    y: round1(from.y + (toward.y - from.y) * t),
    arrived, standing: false,
    legM: Math.round(legM),
    travelledM: Math.round(Math.min(travelledM, legM)),
    remainingM: Math.round(remainingM),
    etaCrossings: arrived ? 0 : round2(remainingM / WALK_M_PER_CROSSING),
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
