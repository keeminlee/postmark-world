// vessel.mjs — the timetable mechanic: a mark that carries a schedule becomes a
// body that moves on a clock, and boarding is presence.
//
// The design law is walk.mjs's, carried one step further. A walk is a DECLARED
// record and position is derived from it; a scheduled crossing is a DECLARED
// MARK and position is derived from that. Nothing about a ride is ever written:
// no ticket, no board verb, no arrival record. Position is a pure function of
// (walk ledger, timetable, clock), so every clone recomputes the same voyage.
//
// The service is read from the FOLD, never from a file — a timetable is a mark
// like any other, so the world's own canon is its only source. Any mark that
// earns `mechanic: timetable` becomes a moving body by the same arithmetic; the
// Post Office is simply the first one. A resident could propose a new line by
// leaving a mark.
//
// Pure: no fs, no clock read. Callers pass the instant in.
//
// Ruled 2026-08-07 (Keemin): the Post Office is the residents' standing way to
// and from Pando Peak — a scheduled service, not per-event ceremonies; the whole
// build lives in marks; no `world_board` verb.

import { pointInRect } from "./geometry.mjs";
import {
  positionAt as walkPositionAt,
  fractionalCrossing,
  CROSSING_EPOCH_UTC,
  CROSSING_MS,
  WALK_M_PER_CROSSING,
} from "./walk.mjs";

// A day is two crossings, and the crossing epoch is a UTC midnight — so a
// timetable written in UTC times-of-day lands on the crossing clock exactly
// (00:00Z → n.0, 06:00Z → n.5). The schedule is periodic with this period.
export const DAY_CROSSINGS = 2;

// The step from her rail to the stones. Arrival sets you down ADJACENT to the
// berth but OUTSIDE her footprint (Keemin's second boarding rule) — without it,
// arrival deposits you exactly where the next departure collects and the boat
// yo-yos everyone forever.
export const ASHORE_STEP_M = 1;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)Z$/;

// "06:00Z" → 0.5, the offset in crossings within the two-crossing day.
export function parseClockTime(s) {
  const m = TIME_RE.exec(String(s ?? ""));
  if (!m) return null;
  return (Number(m[1]) + Number(m[2]) / 60) / 12;
}

// The wall-clock instant (ms) of a fractional crossing — the inverse of
// fractionalCrossing, for telling a departure in the words a resident reads.
export function instantOf(fractional) {
  return CROSSING_EPOCH_UTC + fractional * CROSSING_MS;
}

// ── the service, read from the fold ─────────────────────────────────────────
//
// A timetable names its stops BY MARK ID. Coordinates are never duplicated into
// the schedule: they are the stop marks' own `at`, read at derivation time, so
// moving a stop's mark moves the service.

const fail = (markId, msg) => { throw new Error(`${markId}: ${msg}`); };

// The ledger handle of a vessel mark is its leaf slug — the id is `<by>/<slug>`
// and the walk ledger writes the slug (the 2026-08-08 sailing manifest files
// `the-post-office` for mark `the-town/the-post-office`).
const handleOf = (markId) => String(markId).split("/").slice(1).join("/");

export function serviceFromFold(state, markId) {
  const byId = new Map((state?.marks ?? []).map((m) => [m.id, m]));
  const mark = byId.get(markId);
  if (!mark) fail(markId, "no such mark in the fold");
  if (mark.mechanic !== "timetable" || mark.timetable === undefined)
    fail(markId, "carries no timetable — a service is a mark with `mechanic: timetable` and a `timetable:` field");
  return buildService(mark, byId);
}

// Every service the world currently runs. Errors are COLLECTED, never swallowed:
// one malformed schedule must not blind a reader to the good ones, and must not
// vanish either (the 2026-08-06 lesson — a generator that shrugs at bad input
// publishes a world with a hole in it).
export function servicesFromFold(state) {
  const byId = new Map((state?.marks ?? []).map((m) => [m.id, m]));
  const services = [], errors = [];
  for (const mark of state?.marks ?? []) {
    if (mark.mechanic !== "timetable" && mark.timetable === undefined) continue;
    try { services.push(buildService(mark, byId)); }
    catch (e) { errors.push({ mark: mark.id, error: e.message }); }
  }
  return { services, errors };
}

function buildService(mark, byId) {
  const id = mark.id;
  const tt = mark.timetable;
  if (tt === null || typeof tt !== "object" || Array.isArray(tt))
    fail(id, `timetable must be a structured record, got ${JSON.stringify(tt)}`);
  if (mark.mechanic !== "timetable")
    fail(id, `carries a timetable but its mechanic is ${JSON.stringify(mark.mechanic)} — a schedule nothing runs`);

  const sited = (ref, what) => {
    const m = byId.get(ref);
    if (!m) fail(id, `${what} names no mark in the fold: ${ref}`);
    if (!m.at || !Number.isFinite(m.at.x) || !Number.isFinite(m.at.y))
      fail(id, `${what} ${ref} is not sited — it has no position to ${what === "vessel" ? "berth at" : "stop at"}`);
    return m;
  };

  const vesselMark = sited(tt.vessel, "vessel");
  if (!vesselMark.extent || !(vesselMark.extent.w > 0) || !(vesselMark.extent.h > 0))
    fail(id, `vessel ${tt.vessel} has no extent — boarding is presence inside her footprint, so she must have one`);

  if (!Array.isArray(tt.stops) || tt.stops.length < 2)
    fail(id, `stops must be a list of at least two marks (got ${JSON.stringify(tt.stops)}) — one stop is not a line`);

  const stops = tt.stops.map((s, i) => {
    const m = sited(s?.mark, `stop ${i}`);
    const departs = (Array.isArray(s.departs) ? s.departs : []).map((t) => {
      const off = parseClockTime(t);
      if (off === null) fail(id, `stop ${s.mark}: "${t}" is not a departure time (HH:MMZ, UTC)`);
      return off;
    });
    if (!departs.length) fail(id, `stop ${s.mark} declares no departure times — a stop no one leaves is not a stop`);
    return { markId: m.id, at: { x: m.at.x, y: m.at.y }, extent: m.extent ?? null, departs: departs.sort((a, b) => a - b) };
  });

  const ids = stops.map((s) => s.markId);
  if (new Set(ids).size !== ids.length) fail(id, `stops repeat a mark (${ids.join(", ")}) — a line visits each stop once per round`);

  if (!(Number.isFinite(tt.pace) && tt.pace > 0))
    fail(id, `pace must be a positive number of km per crossing (got ${JSON.stringify(tt.pace)})`);

  return {
    markId: id,
    vessel: { markId: vesselMark.id, handle: handleOf(vesselMark.id), extent: { w: vesselMark.extent.w, h: vesselMark.extent.h } },
    stops,
    pace: tt.pace,
  };
}

// ── the schedule ────────────────────────────────────────────────────────────

// Her footprint, wherever she is lying: her own extent about a point. This is
// the boarding zone and nothing wider (Keemin's first boarding rule) — a
// bystander on the quay is ashore, however close.
export function footprintOf(service, centre) {
  return { x: centre.x, y: centre.y, w: service.vessel.extent.w, h: service.vessel.extent.h };
}

// One day's cast-offs as offsets, in clock order. Each departure sails to the
// NEXT stop in the ring, so a two-stop line alternates ends by construction.
function offsetsOf(service) {
  const out = [];
  service.stops.forEach((stop, i) => {
    for (const offset of stop.departs) out.push({ i, j: (i + 1) % service.stops.length, offset });
  });
  return out.sort((a, b) => a.offset - b.offset || a.i - b.i);
}

function sailingOf(service, o, departFc) {
  const from = service.stops[o.i], to = service.stops[o.j];
  const legM = Math.hypot(to.at.x - from.at.x, to.at.y - from.at.y);
  return { departFc, arriveFc: departFc + legM / (service.pace * 1000), from, to, legM, pace: service.pace };
}

// Every cast-off in (fromFc, toFc] — the window is half-open at the start so a
// sailing is replayed exactly once when windows are chained.
export function sailingsBetween(service, fromFc, toFc) {
  const out = [];
  if (!(toFc > fromFc)) return out;
  const offs = offsetsOf(service);
  for (let d = Math.floor(fromFc / DAY_CROSSINGS); d <= Math.floor(toFc / DAY_CROSSINGS); d++) {
    for (const o of offs) {
      const departFc = d * DAY_CROSSINGS + o.offset;
      if (departFc > fromFc && departFc <= toFc) out.push(sailingOf(service, o, departFc));
    }
  }
  return out.sort((a, b) => a.departFc - b.departFc);
}

// The sailing she is currently on or last completed — what she is doing now.
export function lastSailingAtOrBefore(service, fractional) {
  const window = sailingsBetween(service, fractional - DAY_CROSSINGS - 1e-9, fractional);
  return window.length ? window[window.length - 1] : null;
}

// The next departures, for the wheelhouse to answer with. `from` narrows to one
// quay — the question a resident standing on it is actually asking.
export function nextDepartures(service, fractional, n = 2, { from = null } = {}) {
  const out = [];
  for (let day = 0; day <= n + 1 && out.length < n; day++) {
    for (const s of sailingsBetween(service, fractional + day * DAY_CROSSINGS, fractional + (day + 1) * DAY_CROSSINGS)) {
      if (from && s.from.markId !== from) continue;
      out.push(s);
      if (out.length >= n) break;
    }
  }
  return out;
}

// ── where she is ────────────────────────────────────────────────────────────

// Her own leg is berth to berth: she lies exactly on her stop's mark between
// sailings, so the dwell is whatever the schedule leaves over. The interpolation
// is walk.mjs's — one motion law in the world, not two.
function vesselOnSailing(sailing, fractional) {
  return walkPositionAt(
    { from: sailing.from.at, toward: sailing.to.at, at: sailing.departFc,
      targetExtent: null, targetMarkId: sailing.to.markId, pace: sailing.pace },
    fractional);
}

export function vesselPositionAt(service, fractional = fractionalCrossing()) {
  const sailing = lastSailingAtOrBefore(service, fractional);
  if (!sailing) return null;
  const p = vesselOnSailing(sailing, fractional);
  return { ...p, berthed: p.arrived, atStop: p.arrived ? sailing.to.markId : null, sailing };
}

// Where the service sets you down: adjacent to the berth, outside her footprint.
// The side is derived from the crossing itself — you step off on the OUTBOARD
// rail, away from the water you just crossed — so nothing about the landing has
// to be stored, and it is the same answer in every clone.
export function ashoreOf(service, sailing) {
  const berth = sailing.to.at;
  const dx = berth.x - sailing.from.at.x, dy = berth.y - sailing.from.at.y;
  const d = Math.hypot(dx, dy);
  const [ux, uy] = d > 0 ? [dx / d, dy / d] : [1, 0];
  const { w, h } = service.vessel.extent;
  const exit = Math.min(
    ux === 0 ? Infinity : (w / 2) / Math.abs(ux),
    uy === 0 ? Infinity : (h / 2) / Math.abs(uy));
  const step = exit + ASHORE_STEP_M;
  return { x: round1(berth.x + ux * step), y: round1(berth.y + uy * step) };
}

const round1 = (n) => Math.round(n * 10) / 10;

// ── where a resident is, with the service running ───────────────────────────
//
// Boarding is presence and the walk ledger is the only record. After a
// resident's last declared walk, replay the scheduled cast-offs: any whose
// instant caught them STANDING inside her footprint carried them. Chains
// compose — ride up, walk to the party, walk back to her deck, ride home — and
// every leg between the declared records is derived, never written.

const RIDE_STATE = (sailing) => ({ kind: "ride", sailing });

export function positionAt(departure, fractional = fractionalCrossing(), service = null) {
  const own = walkPositionAt(departure, fractional);
  if (!departure || !service) return own && { ...own, aboard: null, atMooring: null, ashoreAt: null };

  // Their own leg ends once; after that they are stationary until they declare
  // another walk. So one full schedule period past that end is enough to settle
  // whether the service ever collects them — the timetable repeats, and a
  // standing walker who was not taken on this round is never taken on the next.
  const legEndFc = departure.at + (own.arrived ? own.travelledM : own.legM) /
    ((departure.pace > 0 ? departure.pace : WALK_M_PER_CROSSING / 1000) * 1000);
  const horizon = Math.min(fractional, legEndFc + DAY_CROSSINGS);

  let state = null;
  for (const sailing of sailingsBetween(service, departure.at, horizon)) {
    const p = walkPositionAt(departure, sailing.departFc);
    if (!p.arrived) continue;                                            // still walking — the water leaves you
    if (!pointInRect(p.x, p.y, footprintOf(service, sailing.from.at))) continue; // not on her deck
    state = RIDE_STATE(sailing);
    break;                                                               // aboard; the ride owns them from here
  }
  if (!state) return { ...own, aboard: null, atMooring: mooringOf(service, own, fractional), ashoreAt: null };

  const { sailing } = state;
  const v = vesselOnSailing(sailing, fractional);
  if (!v.arrived) return { ...v, aboard: service.vessel.handle, atMooring: null, ashoreAt: null };

  // Set down ashore, standing — and outside her footprint, so the next
  // departure from this very berth passes over them.
  const a = ashoreOf(service, sailing);
  return {
    x: a.x, y: a.y, arrived: true, standing: true,
    legM: 0, travelledM: 0, remainingM: 0, etaCrossings: 0,
    aboard: null, atMooring: null, ashoreAt: sailing.to.markId,
  };
}

// Standing on her deck while she lies alongside — "aboard, at her mooring; she
// sails at the next departure". Not a ride yet; the narration's own state.
function mooringOf(service, p, fractional) {
  if (!p?.arrived) return null;
  const v = vesselPositionAt(service, fractional);
  if (!v?.berthed) return null;
  return pointInRect(p.x, p.y, footprintOf(service, v.sailing.to.at)) ? v.atStop : null;
}

// Every resident at one instant, the service running — the presence layer's
// input, mirroring walk.mjs's positionsAt.
export function positionsAt(departures, fractional = fractionalCrossing(), service = null) {
  const byHandle = new Map();
  for (const d of departures) byHandle.set(d.handle, d);
  const out = {};
  for (const [handle, d] of byHandle) out[handle] = { ...positionAt(d, fractional, service), departure: d };
  return out;
}
