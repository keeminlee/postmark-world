// vessel.mjs — the timetable mechanic: a mark that carries a schedule becomes a
// body that moves on a clock, and boarding is AGREED.
//
// The design law is walk.mjs's, carried one step further. A walk is a DECLARED
// record and position is derived from it; a scheduled crossing is a DECLARED
// MARK and position is derived from that. Position is a pure function of
// (walk ledger, timetable, agreements, clock), so every clone recomputes the
// same voyage.
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
//
// RULED 2026-08-11 (Keemin) — BOARDING-IS-PRESENCE IS RETIRED. Edges are physics
// and always form; what an edge may DO is contract plus permission. An entity is
// moved by a mark only BY ITS OWN AGREEMENT — "a peer moves you only if you said
// so when the edge was made." So a ride is now the one thing about this mechanic
// that IS written: an agreement, declared at the door, severed by its own terms.
// Everything else — where she is, where you are, where she sets you down — stays
// derived from it and the clock, exactly as before.
//
// What that costs and what it buys. The 08-07 law let the water take whoever
// happened to be standing on her deck at the hour, which read as generous and
// was in fact a peer moving you without your having said anything at all. Under
// the new law standing on her deck is standing on her deck: she sails, you do
// not, and the deck was never a promise. Nothing about a ride is INFERRED any
// more; the whole of it is in the agreement's own words.

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
    fail(id, `vessel ${tt.vessel} has no extent — a body with no footprint has no deck to stand on and no rail to be set down beyond, so she must have one`);

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

// Her footprint, wherever she is lying: her own extent about a point. Since the
// agreement law it is a fact about geometry only — her deck, for saying who is
// standing on it. It is no longer a boarding zone: nobody is collected by being
// inside it, and nobody is refused for being outside it.
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

// ── agreements: the one written thing about a ride ──────────────────────────
//
// An agreement is a row, not a geometry: `{ entity, target, policy, born_at,
// severed_at? }`. `target` names the vessel — either her mark id or her ledger
// handle, because the world half cannot know which naming the office chose and
// both name one body without ambiguity. `born_at` and `severed_at` may be given
// as fractional crossings (this module's own clock) or as ISO instants, and are
// normalized here so no caller has to convert and get the units wrong.
//
// TWO POLICIES, and the difference is only WHERE IT ENDS.
//
//   bound:<stop-id>   she carries you through every intermediate arrival with
//                     no deposit and no turns, and sets you down at the named
//                     stop — where the agreement ends by its own terms.
//   riding            she carries you and sets you down never. The ring is the
//                     whole of it; you go ashore by saying so.
//
// SEVERANCE IS DERIVED WHERE ITS TERMS ARE WRITTEN. Reaching the bound stop
// ends the agreement because the agreement SAYS that stop — nothing has to be
// written for it to be over, in the same way nothing is written when a walk
// arrives. `severed_at` is for the other kind of ending: a withdrawal declared
// before the terms ran out. The office appends that as its own event and never
// deletes the row, so the record of a ride keeps both of its ends.

export const BOUND_PREFIX = "bound:";
export const RIDING_POLICY = "riding";

/** The stop a `bound:<stop-id>` policy names, or null for any other policy. */
export const boundStopOf = (policy) =>
  String(policy ?? "").startsWith(BOUND_PREFIX) ? String(policy).slice(BOUND_PREFIX.length) : null;

/** Is this a PASSENGER policy at all — one that can move an entity by carriage? */
export const isPassengerPolicy = (policy) =>
  policy === RIDING_POLICY || Boolean(boundStopOf(policy));

// A number is already this module's clock; a string is an instant to convert.
const asFc = (v) => (v == null ? null : (typeof v === "number" ? v : fractionalCrossing(Date.parse(v))));

const namesVessel = (service, target) =>
  target === service.vessel.markId || target === service.vessel.handle;

/**
 * The agreement governing a ride at an instant: the latest one with this vessel
 * that had been born and not yet severed. Latest-wins is the ledger's own rule,
 * so two agreements never argue — the newer statement is the standing one.
 */
export function agreementAt(agreements, service, fractional) {
  let cur = null;
  for (const a of agreements ?? []) {
    if (!namesVessel(service, a.target)) continue;
    if (!isPassengerPolicy(a.policy)) continue;
    const born = asFc(a.born_at);
    if (born === null || born > fractional) continue;
    const severed = asFc(a.severed_at);
    if (severed !== null && severed <= fractional) continue;
    if (!cur || born >= cur.born) cur = { born, severed, policy: a.policy, row: a };
  }
  return cur;
}

// ── where a resident is, with the service running ───────────────────────────
//
// THE CARRY CONDITION IS EDGE **AND** PERMISSION. A walker is carried on a
// sailing if and only if BOTH hold at her cast-off:
//
//   the EDGE        they are STANDING inside her footprint — presence, which
//                   is physics and forms whether anyone meant it to
//   the PERMISSION  an unsevered agreement with this vessel — which is theirs
//                   alone to give, and is the whole of what changed
//
// Neither half alone moves anyone, and the two failures read differently on
// purpose. Presence without permission is the retired law and she sails without
// you (vermillion's case). Permission without presence rides nothing today —
// and rides the next cast-off you stand for, because the agreement keeps
// standing while you are not on her deck.
//
// THAT IS WHY THERE IS NO CANCELLATION RULE. Changing your mind is walking
// away: no edge at the hour, no ride, nothing to revoke. `world_agree
// withdraw` exists to end the permission on the record and for the case where
// you are already aboard — it is not the only way out, and it never was the
// way out for someone standing on a quay.
//
// Chains still compose, and cost less than they did: ride up, walk to the
// party, walk back, ride home is a walk and an agreement each way — the
// intermediate calls are carried through, so the round trip that used to need a
// re-board hop at every stop now needs none. Once aboard the edge holds itself:
// a passenger's position IS the vessel's, so they are inside her footprint at
// every later cast-off without doing anything.

export function positionAt(departure, fractional = fractionalCrossing(), service = null, agreements = []) {
  const own = walkPositionAt(departure, fractional);
  if (!departure || !service) return own && { ...own, aboard: null, boundFor: null, onDeckAt: null, ashoreAt: null };

  const held = agreementAt(agreements, service, fractional)
    // An agreement that ENDED before now still governs the voyage it covered —
    // where she set you down is where you are standing. So the search falls back
    // to the last one to have existed at all.
    ?? lastAgreementBefore(agreements, service, fractional);
  if (!held) return { ...own, aboard: null, boundFor: null, onDeckAt: onDeckOf(service, own, fractional), ashoreAt: null };

  const ride = rideFrom(departure, service, held, fractional, own);
  // AGREED, AND SHE HAS NOT TAKEN THEM. Either she has not cast off since, or
  // she has and they were not standing on her deck for it. Both read the same
  // from here: they are exactly where their own record puts them, with the
  // permission still standing and the answer still naming where they are bound.
  // The next cast-off they stand for is the one that takes them.
  if (!ride) return {
    ...own, aboard: null,
    boundFor: held.severed === null ? boundStopOf(held.policy) : null,
    onDeckAt: onDeckOf(service, own, fractional), ashoreAt: null,
  };

  // ASHORE — the agreement ran out at a named stop, or the walker declared a
  // walk while aboard and chose the next arrival as their way off.
  if (ride.ashore) {
    const a = ashoreOf(service, ride.ashore);
    // A walk declared while aboard resumes FROM THE DEPOSIT POINT: she puts you
    // down, and the leg you asked for starts there and then. Nothing about it
    // was written twice — the same declared record, read from where it can
    // actually begin.
    if (ride.walkResumesFrom !== null) {
      const resumed = walkPositionAt(
        { ...departure, from: a, at: ride.walkResumesFrom }, fractional);
      // `ashoreAt` names WHERE YOU ARE, not where you once were — so it holds
      // only while they are still standing on the stones she left them on. A
      // walker a kilometre inland is not ashore at the landing, and a field that
      // went on saying so would be the read surface lying about a position.
      return {
        ...resumed, aboard: null, boundFor: null, onDeckAt: null,
        ashoreAt: resumed.travelledM === 0 ? ride.ashore.to.markId : null,
      };
    }
    return {
      x: a.x, y: a.y, arrived: true, standing: true,
      legM: 0, travelledM: 0, remainingM: 0, etaCrossings: 0,
      aboard: null, boundFor: null, onDeckAt: null, ashoreAt: ride.ashore.to.markId,
    };
  }

  // ABOARD — under way, or lying alongside on a call she carries you through.
  // `arrived` stays false for the whole passage, including the calls: a
  // passenger has not arrived anywhere until she sets them down, and a berthed
  // boat with a through-rider aboard is a pause in one voyage, not the end of
  // it. `onDeckAt` is the stop she is lying at, when she is lying at one.
  const v = vesselPositionAt(service, fractional);
  return {
    x: v.x, y: v.y, arrived: false, standing: false,
    legM: 0, travelledM: 0, remainingM: 0, etaCrossings: 0,
    aboard: service.vessel.handle,
    boundFor: boundStopOf(held.policy),
    onDeckAt: v.berthed ? v.atStop : null,
    ashoreAt: null,
  };
}

/** The last agreement with this vessel to have been born at all, severed or not. */
function lastAgreementBefore(agreements, service, fractional) {
  let cur = null;
  for (const a of agreements ?? []) {
    if (!namesVessel(service, a.target) || !isPassengerPolicy(a.policy)) continue;
    const born = asFc(a.born_at);
    if (born === null || born > fractional) continue;
    if (!cur || born >= cur.born) cur = { born, severed: asFc(a.severed_at), policy: a.policy, row: a };
  }
  return cur;
}

/**
 * Replay the voyage one agreement bought, checking BOTH halves at every
 * cast-off she makes while it stands.
 *
 * Returns `{ ashore }` — the sailing whose arrival set them down — or `{}` while
 * they are still being carried, or null when the agreement has bought nothing:
 * she has not cast off since it was made, or she has and they were not standing
 * on her deck for it.
 *
 * `walkResumesFrom` is the instant a walk declared WHILE ABOARD begins ashore.
 */
function rideFrom(departure, service, held, fractional, own) {
  const bound = boundStopOf(held.policy);

  // WHEN THE QUESTION SETTLES. Their own leg ends once; after it they are
  // stationary until they declare another, so one full schedule period past the
  // later of (that end, the agreement's birth) is enough to know whether she
  // ever collects them. The timetable repeats and she calls at every stop each
  // round, so a standing walker who was in no footprint on one round is in none
  // on the next. This is the 08-07 law's own bounding argument, and it comes
  // back with the edge it was always about.
  const legEndFc = departure.at + (own.arrived ? own.travelledM : own.legM) /
    ((departure.pace > 0 ? departure.pace : WALK_M_PER_CROSSING / 1000) * 1000);
  const settleBy = Math.max(legEndFc, held.born) + DAY_CROSSINGS;

  // GOING ASHORE IS A WALK DECLARED FROM HER DECK MID-CHANNEL, and only that.
  //
  // Two things are true at once here. First, the evidence: this function is
  // handed ONE governing record, so the cast-off that collected them is often
  // older than it, and replaying that cast-off against this record would ask
  // where a walker was before the walk existed. The record answers for itself
  // instead — nobody stands on open water, so a `from` that is her position
  // while she is under way was written by a passenger.
  //
  // Second, and this is why the rule needs no wider reach: a walk declared while
  // she is ALONGSIDE needs no deposit at all. They simply walk off her deck, and
  // the edge check at her next cast-off finds them gone. Only mid-channel does
  // anyone need setting down, because only there can you not leave on your own
  // feet — which was Keemin's 08-08 ruling (nobody jumps off the boat) all along.
  //
  // The earlier draft read this as "any walk declared after the agreement", and
  // that wrongly caught a walk TOWARD her: a resident walking down to the quay to
  // take the passage they had already arranged was treated as choosing to leave
  // it, and got deposited at the far end mid-stride.
  const goingAshore = departure.at > held.born && declaredAtSeaAboard(departure, service);

  // A passage with no ending in it cannot be ended by replaying more of it, so
  // once she has them the replay stops. Without this a `riding` agreement
  // re-walks every sailing since it was made on every single read.
  const endless = !bound && !goingAshore;

  const scanFrom = goingAshore ? held.born : Math.max(held.born, departure.at);

  let aboard = goingAshore;
  for (const sailing of sailingsBetween(service, scanFrom - 1e-9, fractional)) {
    if (sailing.departFc < held.born) continue;                       // she left before they agreed
    if (held.severed !== null && held.severed <= sailing.departFc) break; // withdrawn before this cast-off

    if (!aboard) {
      // THE EDGE, for a walker not yet aboard: are they STANDING inside her
      // footprint at this cast-off? Permission alone rides nothing.
      if (sailing.departFc > settleBy) break;                         // she is never going to collect them
      const p = walkPositionAt(departure, sailing.departFc);
      if (!p.arrived) continue;                                       // mid-stride — the water leaves you
      if (!pointInRect(p.x, p.y, footprintOf(service, sailing.from.at))) continue; // not on her deck
      aboard = true;                                                  // both halves, so she takes them
    }
    // Aboard, the edge holds itself: their position IS hers, so they are inside
    // her footprint at every later cast-off without doing anything.

    if (sailing.arriveFc > fractional) return { aboard: true };       // still at sea on this leg
    if (endless) break;                                               // nothing later can end it
    // ASHORE AT THE FIRST ARRIVAL THAT ENDS IT: the stop the agreement named,
    // or — for a walker who declared a walk while aboard — the next one she
    // makes after they said so.
    if (bound && sailing.to.markId === bound)
      return { ashore: sailing, walkResumesFrom: goingAshore ? sailing.arriveFc : null };
    if (goingAshore && sailing.arriveFc >= departure.at)
      return { ashore: sailing, walkResumesFrom: sailing.arriveFc };
    // Otherwise she calls, lies alongside, and casts off again with them still
    // aboard — through-riding, zero turns.
  }
  return aboard ? { aboard: true } : null;
}

/** Was this record written by someone standing on her deck while she was at sea? */
function declaredAtSeaAboard(departure, service) {
  const v = vesselPositionAt(service, departure.at);
  if (!v || v.berthed) return false;
  return pointInRect(departure.from.x, departure.from.y, footprintOf(service, { x: v.x, y: v.y }));
}

// Standing on her deck while she lies alongside, with NO agreement — a fact
// about where someone is standing and nothing more. Under the 08-07 law this
// meant "she sails at the next departure"; it no longer promises anything,
// which is why it is no longer called a mooring. She will sail without them.
function onDeckOf(service, p, fractional) {
  if (!p?.arrived) return null;
  const v = vesselPositionAt(service, fractional);
  if (!v?.berthed) return null;
  return pointInRect(p.x, p.y, footprintOf(service, v.sailing.to.at)) ? v.atStop : null;
}

// Every resident at one instant, the service running — the presence layer's
// input, mirroring walk.mjs's positionsAt. `agreementsOf(handle)` yields that
// resident's own agreements; absent, nobody rides, which is the correct answer
// for a caller that has not learned to read them yet.
export function positionsAt(departures, fractional = fractionalCrossing(), service = null, agreementsOf = null) {
  const byHandle = new Map();
  for (const d of departures) byHandle.set(d.handle, d);
  const out = {};
  for (const [handle, d] of byHandle)
    out[handle] = { ...positionAt(d, fractional, service, agreementsOf ? agreementsOf(handle) ?? [] : []), departure: d };
  return out;
}
