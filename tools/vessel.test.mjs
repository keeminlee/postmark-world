#!/usr/bin/env node
// vessel.test.mjs — the timetable mechanic: a mark that carries a schedule
// becomes a body that moves on a clock, and boarding is presence.
//   node --test tools/vessel.test.mjs
//
// The law under test (Keemin, 2026-08-07): position = f(walk ledger, timetable,
// clock). Nothing about a ride is ever written — no ticket, no board verb, no
// arrival record. Every clone recomputes the same voyage from the same three
// inputs, so these tests pass a clock in rather than reading one.
//
// The tree is read ONCE here to build the real folded world; every derivation
// below is a pure function of that object. That is deliberate: the service that
// sails on Sunday is the one these tests derive, not a fixture that resembles it.
//
// THE RULE OF THIS SUITE (2026-08-09): no assertion here contains a stop's
// literal coordinates, nor a leg length or a run time computed from them. The
// landing moved 1216 m onto Porch Hill by ruling, the wheelhouse's timetable did
// not need one edit — and five tests went red anyway, because they carried a
// written-down copy of the coordinate the design refuses to duplicate. A suite
// that reddens on the one operation the mechanic exists to make cheap is
// guarding the wrong thing. So every expected position, leg and duration below
// is READ FROM THE FOLD, and every instant that depends on how long a crossing
// takes is derived from the sailing it belongs to. Re-site a stop and these
// tests re-time themselves.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, fold } from "./marks-fold.mjs";
import {
  fractionalCrossing, positionAt as walkPositionAt,
  WALK_M_PER_CROSSING, WALK_KM_PER_CROSSING,
} from "./walk.mjs";
import { pointInRect } from "./geometry.mjs";
import {
  serviceFromFold, servicesFromFold, vesselPositionAt, positionAt,
  sailingsBetween, lastSailingAtOrBefore, nextDepartures, ashoreOf, footprintOf,
  instantOf, DAY_CROSSINGS, ASHORE_STEP_M,
} from "./vessel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WHEELHOUSE = "the-town/the-wheelhouse";

const STATE = fold({
  marks: loadMarks(join(ROOT, "WORLD/marks")),
  terrain: JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")),
  stakes: [],
});
const service = serviceFromFold(STATE, WHEELHOUSE);

// The crossing clock and the timetable are the same clock: the epoch is a UTC
// midnight and a crossing is twelve hours, so 00:00Z / 06:00Z / 12:00Z / 18:00Z
// land on whole and half crossings exactly. Reading a wall-clock instant here
// keeps the tests legible against the ruled schedule.
const fcAt = (iso) => fractionalCrossing(Date.parse(iso));
const D = (o) => ({ iso: "2026-08-09T00:00:00.000Z", targetExtent: null, targetMarkId: null, pace: null, ...o });
const at = (p) => [p.x, p.y];

const TOWN = "the-town/the-post-office";
const LANDING = "the-town/the-pando-landing";
const WHARF = "sol-of-garrison/grove-wharf"; // the Garrison stop, ruled 2026-08-10 (#1596), granted case-by-case

// ── the record's own numbers ────────────────────────────────────────────────
//
// The stop marks answer for themselves. Nothing below this line is a coordinate
// anyone typed.

const byId = new Map(STATE.marks.map((m) => [m.id, m]));
const siteOf = (id) => {
  const m = byId.get(id);
  if (!m?.at) throw new Error(`${id}: not a sited mark in this fold — this suite reads the world, not a fixture`);
  return { x: m.at.x, y: m.at.y };
};

const QUAY = siteOf(TOWN);          // stop 0, and the vessel's own mark
const BERTH = siteOf(LANDING);      // stop 1
const PACE = byId.get(WHEELHOUSE).timetable.pace;                     // km/crossing, from the schedule itself
const RUN_M = Math.hypot(BERTH.x - QUAY.x, BERTH.y - QUAY.y);         // the run: the two stops' separation
const RUN_FC = RUN_M / (PACE * 1000);                                 // and its duration, in crossings

// The ledger publishes positions to a tenth of a metre; expectations pass
// through the same rounding rather than assuming the marks sit on whole ones.
const r1 = (n) => Math.round(n * 10) / 10;
const site = (p) => [r1(p.x), r1(p.y)];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── instants, derived from the sailings they belong to ──────────────────────

const DAY0 = fcAt("2026-08-09T00:00:00Z");
const nextFrom = (stopId, fc) => nextDepartures(service, fc, 1, { from: stopId })[0];
const midway = (s) => (s.departFc + s.arriveFc) / 2;
// The middle of a lie alongside: after the crossing that brought her, before the
// one she is about to make. However long the run becomes, these instants stay
// inside the dwell they name.
const midDwellBefore = (s) => (lastSailingAtOrBefore(service, s.departFc - 1e-9).arriveFc + s.departFc) / 2;
const midDwellAfter = (s) => (s.arriveFc + nextFrom(s.to.markId, s.arriveFc).departFc) / 2;
// When a declared walk finishes, from the record itself — the leg over the pace,
// with a metre's slack for the rounding the ledger does to whole metres.
const arrivalOf = (d) =>
  d.at + (walkPositionAt(d, d.at).legM + 1) / ((d.pace > 0 ? d.pace : WALK_KM_PER_CROSSING) * 1000);

// ── the service the marks describe ──────────────────────────────────────────

test("the wheelhouse's timetable folds into a service — stops resolved BY MARK, never duplicated coordinates", () => {
  assert.equal(service.markId, WHEELHOUSE);
  assert.equal(service.vessel.handle, "the-post-office", "the ledger handle is the vessel mark's leaf slug");
  assert.deepEqual(service.vessel.extent, byId.get(TOWN).extent, "her footprint is her own mark's extent");
  assert.equal(service.pace, PACE);
  assert.deepEqual(service.stops.map((s) => s.markId), [TOWN, LANDING, WHARF]);

  // The coordinates are the STOP MARKS' own — the timetable names ids only.
  for (const stop of service.stops) {
    assert.deepEqual(stop.at, siteOf(stop.markId), `${stop.markId} takes its position from its own mark`);
  }
  // Move a stop mark and the service moves with it: nothing is copied.
  const ELSEWHERE = { x: BERTH.x - 1000, y: BERTH.y + 1000 };
  const moved = JSON.parse(JSON.stringify(STATE));
  moved.marks.find((m) => m.id === LANDING).at = ELSEWHERE;
  assert.deepEqual(serviceFromFold(moved, WHEELHOUSE).stops[1].at, ELSEWHERE);
});

test("the ruled schedule: quay 06:00Z/18:00Z, landing 00:00Z/12:00Z, the wharf 04:15Z/16:15Z, and the day closes", () => {
  const day = sailingsBetween(service, fcAt("2026-08-09T00:00:00Z") - 1e-9, fcAt("2026-08-09T23:59:00Z"));
  assert.deepEqual(
    day.map((s) => [new Date(instantOf(s.departFc)).toISOString(), s.from.markId, s.to.markId]),
    [
      ["2026-08-09T00:00:00.000Z", LANDING, WHARF],
      ["2026-08-09T04:15:00.000Z", WHARF, TOWN],
      ["2026-08-09T06:00:00.000Z", TOWN, LANDING],
      ["2026-08-09T12:00:00.000Z", LANDING, WHARF],
      ["2026-08-09T16:15:00.000Z", WHARF, TOWN],
      ["2026-08-09T18:00:00.000Z", TOWN, LANDING],
    ],
    "six sailings a day — the wharf call rides the southbound return (ruled 2026-08-10, #1596), so the quay→landing mail run stays one unbroken sailing");

  // A crossing lasts the run over the pace, both read back out of the record:
  // each leg is ITS OWN two stop MARKS' separation and the pace is the
  // schedule's one dial. The ruling that re-sited the landing re-timed the
  // service by 2 min 13 s a leg without anyone editing a duration — and the
  // ruling that added the wharf made the legs unequal without breaking this.
  for (const s of day) {
    const from = siteOf(s.from.markId), to = siteOf(s.to.markId);
    const legM = Math.hypot(to.x - from.x, to.y - from.y);
    assert.equal(s.legM, legM, "the leg is its two stops' separation, never a stored distance");
    assert.ok(near(s.arriveFc - s.departFc, legM / (PACE * 1000), 1e-12),
      `a crossing runs ${((s.arriveFc - s.departFc) * 12).toFixed(4)} h — the run over the pace, and nothing else`);
  }

  // The 24 h cycle closes on itself: every cast-off leaves from where the last
  // one arrived, and she is alongside with time in hand before each one.
  day.forEach((s, i) => {
    const next = day[(i + 1) % day.length];
    const nextDepartFc = i + 1 < day.length ? next.departFc : next.departFc + DAY_CROSSINGS;
    assert.equal(s.to.markId, next.from.markId, "she casts off from the berth the last crossing left her at");
    assert.ok(s.arriveFc < nextDepartFc, "and lies alongside a while first — the cycle closes with room to spare");
  });
});

test("vesselPositionAt: berthed, then under way, then berthed at the other end", () => {
  const outbound = nextFrom(TOWN, DAY0);                    // the 06:00Z, quay → landing

  const moored = vesselPositionAt(service, midDwellBefore(outbound));
  assert.deepEqual(at(moored), site(QUAY), "between crossings she lies exactly on her mooring's mark");
  assert.equal(moored.berthed, true);
  assert.equal(moored.atStop, TOWN);

  const underway = vesselPositionAt(service, midway(outbound));
  assert.equal(underway.berthed, false);
  assert.equal(underway.atStop, null);
  assert.ok(near(Math.hypot(underway.x - QUAY.x, underway.y - QUAY.y), RUN_M / 2, 0.2),
    "half way through the crossing, half the run is behind her");

  const arrived = vesselPositionAt(service, midDwellAfter(outbound));
  assert.deepEqual(at(arrived), site(BERTH), "she lies at the landing, exactly on its mark");
  assert.equal(arrived.berthed, true);
  assert.equal(arrived.atStop, LANDING);

  // Purity: same inputs, same answer, no clock read inside.
  const t = midway(outbound);
  assert.deepEqual(vesselPositionAt(service, t), vesselPositionAt(service, t));
});

// ── the boarding rules ──────────────────────────────────────────────────────

test("stand-and-board: a STANDING walker inside her footprint at cast-off sails with her", () => {
  // The whole ticket: walk onto her deck and still be there when she goes.
  const outbound = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });

  const waiting = positionAt(rider, (rider.at + outbound.departFc) / 2, service);
  assert.deepEqual(at(waiting), site(QUAY));
  assert.equal(waiting.aboard, null, "not sailing yet");
  assert.equal(waiting.atMooring, TOWN, "aboard at her mooring — she sails at the next departure");

  const underway = positionAt(rider, midway(outbound), service);
  assert.equal(underway.aboard, "the-post-office");
  assert.equal(underway.arrived, false, "under way is not arrived");
  assert.deepEqual(at(underway), at(vesselPositionAt(service, midway(outbound))),
    "a passenger's position IS the vessel's while she is under way");
});

test("pass-through-doesn't-board: geometry excludes anyone merely crossing her deck", () => {
  // A long walk down the reach whose straight line runs through her footprint at
  // cast-off. The walker is inside her extent at the instant she goes — and is
  // NOT standing, so the water takes her and leaves him.
  // He leaves upstream at exactly the hour that puts him amidships: one reach
  // length at the town's own dial.
  const outbound = nextFrom(TOWN, DAY0);
  const REACH_M = 200;
  const crossing = D({ handle: "passer",
                       from: { x: QUAY.x, y: QUAY.y + REACH_M }, toward: { x: QUAY.x, y: QUAY.y - REACH_M },
                       at: outbound.departFc - REACH_M / WALK_M_PER_CROSSING });
  const atCastOff = positionAt(crossing, outbound.departFc, service);
  assert.ok(pointInRect(atCastOff.x, atCastOff.y, footprintOf(service, QUAY)),
    "he really is standing on her deck's ground at cast-off — the exclusion is not an accident of position");
  assert.equal(atCastOff.arrived, false, "…but still walking");
  assert.equal(atCastOff.aboard, null, "so he does not board");

  const later = positionAt(crossing, midway(outbound), service);
  assert.equal(later.aboard, null);
  assert.equal(later.x, QUAY.x, "he walks on down the reach; she is half a run away");
  assert.ok(later.y < QUAY.y);
});

test("a bystander on the quay never boards — the boarding zone is her footprint, nothing wider", () => {
  // A metre beyond her rail, which is as close to her as ashore gets.
  const outbound = nextFrom(TOWN, DAY0);
  const offRail = { x: QUAY.x - (service.vessel.extent.w / 2 + 1), y: QUAY.y };
  assert.ok(!pointInRect(offRail.x, offRail.y, footprintOf(service, QUAY)), "he stands ashore, by a metre");

  const bystander = D({ handle: "watcher", from: offRail, toward: offRail, at: midDwellBefore(outbound) });
  const alongside = positionAt(bystander, (bystander.at + outbound.departFc) / 2, service);
  assert.equal(alongside.atMooring, null, "she is lying right there and he is still not aboard of her");

  const p = positionAt(bystander, midway(outbound), service);
  assert.equal(p.aboard, null, "a metre off her rail is ashore");
  assert.equal(p.atMooring, null);
  assert.deepEqual(at(p), site(offRail), "he is exactly where he stood");
});

test("deposited-ashore-doesn't-re-board: arrival sets you down OUTSIDE her footprint", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const homeward = nextFrom(LANDING, outbound.arriveFc);       // the cast-off from this very berth
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });

  const landed = positionAt(rider, midDwellAfter(outbound), service);
  assert.equal(landed.ashoreAt, LANDING);
  assert.equal(landed.arrived, true);
  assert.equal(landed.standing, true);
  assert.equal(landed.aboard, null);

  assert.ok(!pointInRect(landed.x, landed.y, footprintOf(service, BERTH)),
    "set down beyond her rail — this is the whole anti-conveyor rule");
  // …but adjacent: the furthest ashoreOf can put anyone from the berth is her own
  // half-diagonal plus the single step, whatever heading she came in on.
  const reach = Math.hypot(service.vessel.extent.w, service.vessel.extent.h) / 2 + ASHORE_STEP_M + 0.15;
  assert.ok(Math.hypot(landed.x - BERTH.x, landed.y - BERTH.y) < reach,
    "…but adjacent to the berth, not thrown inland");
  // And on the landing's own stones: the step off her rail lands on town ground.
  const landingMark = byId.get(LANDING);
  assert.ok(pointInRect(landed.x, landed.y, { ...siteOf(LANDING), ...landingMark.extent }),
    "ashore is the landing, not the water");

  // The next cast-off from this very berth passes over him — standing still is
  // not a ticket. Without this the boat would yo-yo everyone forever.
  const afterNext = positionAt(rider, midway(homeward), service);
  assert.equal(afterNext.aboard, null, "she sailed without him");
  assert.deepEqual(at(afterNext), at(landed), "he has not moved, because he declared no walk");
});

test("full round-trip: ride up · walk to the party · walk back to her deck · ride home", () => {
  const h = "traveller";
  const outbound = nextFrom(TOWN, DAY0);
  // The chain is four declared records; every ride between them is derived.
  const rideUp = D({ handle: h, from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const landedFc = midDwellAfter(outbound);
  const ashoreAtPando = positionAt(rideUp, landedFc, service);
  assert.equal(ashoreAtPando.ashoreAt, LANDING);

  // …walks up to the party hall (an ordinary walk, at the town's own pace). The
  // hall answers for its own site and extent, like every other mark here…
  const hall = byId.get("vermillion/party-hall");
  const toParty = D({ handle: h, from: { x: ashoreAtPando.x, y: ashoreAtPando.y },
                      toward: siteOf(hall.id), targetExtent: { ...hall.extent },
                      targetMarkId: hall.id, at: landedFc });
  const atPartyFc = arrivalOf(toParty);
  const atParty = positionAt(toParty, atPartyFc, service);
  assert.equal(atParty.arrived, true, "the walk up is a walk, unaffected by any schedule");
  assert.equal(atParty.aboard, null);

  // …then walks back down onto her deck…
  const toBerth = D({ handle: h, from: { x: atParty.x, y: atParty.y }, toward: BERTH, at: atPartyFc });
  const backOnDeckFc = arrivalOf(toBerth);

  // …and rides home on her next cast-off from this landing, whichever one the
  // schedule and the length of the run make that be. Since the wharf ruling the
  // southbound return calls at the Garrison first, so the ride home is TWO hops
  // — the anti-conveyor rule deposits everyone at every stop, and riding on is
  // a fresh walk onto her deck within the dwell.
  const homeward = nextFrom(LANDING, backOnDeckFc);
  const waiting = positionAt(toBerth, homeward.departFc - 1e-9, service);
  assert.equal(waiting.arrived, true, "standing on her deck when she casts off");
  assert.equal(waiting.atMooring, LANDING);

  const homebound = positionAt(toBerth, midway(homeward), service);
  assert.equal(homebound.aboard, "the-post-office");

  const atWharf = positionAt(toBerth, midDwellAfter(homeward), service);
  assert.equal(atWharf.ashoreAt, WHARF, "set down at the Garrison's wharf — the through-ride home is two hops now");

  const reBoard = D({ handle: h, from: { x: atWharf.x, y: atWharf.y }, toward: siteOf(WHARF), at: midDwellAfter(homeward) });
  const lastLeg = nextFrom(WHARF, arrivalOf(reBoard));
  const backAboard = positionAt(reBoard, lastLeg.departFc - 1e-9, service);
  assert.equal(backAboard.arrived, true, "back on her deck inside the wharf dwell");
  assert.equal(backAboard.atMooring, WHARF);

  const home = positionAt(reBoard, midDwellAfter(lastLeg), service);
  assert.equal(home.ashoreAt, TOWN, "set down on the quay side of the reach");
  assert.ok(!pointInRect(home.x, home.y, footprintOf(service, QUAY)), "outside her footprint again");

  // The next one sails without him: the chain ends where he stands, not in a loop.
  const after = nextFrom(TOWN, lastLeg.arriveFc);
  assert.equal(positionAt(reBoard, midway(after), service).aboard, null);
});

// ── the Garrison stop (ruled 2026-08-10, #1596 — case-by-case founder grant) ──

test("the wharf call: southbound she calls at the Garrison's own shore, lies alongside, and a rider from the landing steps off onto their stones", () => {
  const southbound = nextFrom(LANDING, fcAt("2026-08-09T11:00:00Z")); // the 12:00Z cast-off
  assert.equal(southbound.to.markId, WHARF, "the southbound sailing calls at the wharf");
  assert.ok(southbound.arriveFc < nextFrom(WHARF, southbound.departFc).departFc,
    "she lies alongside before her own next cast-off — the grant fits the day without moving anyone else's hour");

  const rider = D({ handle: "garrisoner", from: BERTH, toward: BERTH, at: midDwellBefore(southbound) });
  assert.equal(positionAt(rider, midway(southbound), service).aboard, "the-post-office");
  const landed = positionAt(rider, midDwellAfter(southbound), service);
  assert.equal(landed.ashoreAt, WHARF, "set down on the Garrison's shoreline");
  // The wharf is a small stone (10×10) and the step off her rail can land on
  // the bank beside it — ashore-adjacent is the deposit law (see the
  // deposited-ashore test), containment never was.
  const wharfSite = siteOf(WHARF);
  const reach = Math.hypot(service.vessel.extent.w, service.vessel.extent.h) / 2 + ASHORE_STEP_M + 0.15;
  assert.ok(Math.hypot(landed.x - wharfSite.x, landed.y - wharfSite.y) < reach,
    "ashore beside the wharf's own stone, not thrown up the bank");
});

test("miss-the-boat: reach the mooring after she goes and the berth is empty — with the next departure to hand", () => {
  // A 300 m walk at the town dial (15 km/crossing) takes 0.02 crossings = 14.4
  // min; he sets out six minutes after she casts off and reaches the mooring
  // twenty minutes late.
  const evening = nextDepartures(service, fcAt("2026-08-09T12:00:00Z"), 1, { from: TOWN })[0];
  const APPROACH_M = 300;
  const walk = D({ handle: "latecomer", from: { x: QUAY.x, y: QUAY.y + APPROACH_M }, toward: QUAY,
                   at: evening.departFc + (6 / 60) / 12 });
  assert.equal(positionAt(walk, evening.departFc, service).aboard, null, "he had not even set out");

  const arrivedFc = arrivalOf(walk);
  const arrived = positionAt(walk, arrivedFc, service);
  assert.equal(arrived.arrived, true);
  assert.deepEqual(at(arrived), site(QUAY), "standing on the mooring's own ground");
  assert.equal(arrived.aboard, null, "she is not here to be boarded");
  assert.equal(arrived.atMooring, null, "the berth is empty — nothing to be aboard of");
  assert.notEqual(vesselPositionAt(service, arrivedFc).atStop, TOWN, "she is away from this quay");

  const [next] = nextDepartures(service, arrivedFc, 1, { from: TOWN });
  assert.equal(new Date(instantOf(next.departFc)).toISOString(), "2026-08-10T06:00:00.000Z",
    "the answer the wheelhouse gives: the next one from this quay");
  assert.equal(next.to.markId, LANDING);

  // And standing there through the night, he catches it — presence is the ticket.
  assert.equal(positionAt(walk, midway(next), service).aboard, "the-post-office");
});

// ── the schedule is a mark, so editing the mark changes the world ────────────

test("schedule-change-via-mark-edit re-derives cleanly — the same walker, a different voyage", () => {
  const ruled = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(ruled) });
  assert.equal(positionAt(rider, midway(ruled), service).aboard, "the-post-office",
    "under the ruled schedule, at the middle of her run, he is at sea");

  // Someone edits the wheelhouse mark: the quay's sailings move to 09:00Z/21:00Z.
  const edited = JSON.parse(JSON.stringify(STATE));
  edited.marks.find((m) => m.id === WHEELHOUSE)
    .timetable.stops[0].departs = ["09:00Z", "21:00Z"];
  const rescheduled = serviceFromFold(edited, WHEELHOUSE);

  const moved = nextDepartures(rescheduled, DAY0, 1, { from: TOWN })[0];
  assert.equal(new Date(instantOf(moved.departFc)).toISOString(), "2026-08-09T09:00:00.000Z",
    "the new hour, straight out of the edited mark");
  const beforeSheGoes = moved.departFc - 1e-9;
  assert.equal(positionAt(rider, beforeSheGoes, rescheduled).aboard, null, "a moment before nine she has not cast off");
  assert.equal(positionAt(rider, beforeSheGoes, rescheduled).atMooring, TOWN, "he waits on her deck for the new hour");
  assert.equal(positionAt(rider, midway(moved), rescheduled).aboard, "the-post-office",
    "and sails at nine, from the same record, with nothing rewritten");

  // A slower boat is the same edit in a different field.
  const slowed = JSON.parse(JSON.stringify(STATE));
  slowed.marks.find((m) => m.id === WHEELHOUSE).timetable.pace = 200;
  const slow = serviceFromFold(slowed, WHEELHOUSE);
  assert.equal(vesselPositionAt(slow, ruled.arriveFc).berthed, false,
    "at pace 200 she is still out when the ruled schedule would have her alongside");
});

// ── the mechanic is general, and it fails loudly ────────────────────────────

test("any mark that earns a timetable becomes a moving body — the mechanic is not the Post Office's", () => {
  const cart = { id: "someone/a-cart", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 } };
  const north = { id: "someone/the-north-stop", kind: "sited", at: { x: 0, y: -3000 }, extent: { w: 10, h: 10 } };
  const south = { id: "someone/the-south-stop", kind: "sited", at: { x: 0, y: 3000 }, extent: { w: 10, h: 10 } };
  const state = JSON.parse(JSON.stringify(STATE));
  state.marks.push(cart, north, south,
    { id: "someone/the-cart-line", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 },
      mechanic: "timetable",
      timetable: { vessel: cart.id, pace: 15,
                   stops: [{ mark: north.id, departs: ["08:00Z"] },
                           { mark: south.id, departs: ["20:00Z"] }] } });

  const { services, errors } = servicesFromFold(state);
  assert.deepEqual(errors, []);
  assert.deepEqual(services.map((s) => s.markId).sort(), ["someone/the-cart-line", WHEELHOUSE]);
  const line = services.find((s) => s.markId === "someone/the-cart-line");
  assert.deepEqual(at(vesselPositionAt(line, fcAt("2026-08-09T07:00:00Z"))), site(north.at),
    "waiting at the north stop, on the stop's own ground");
  assert.equal(vesselPositionAt(line, fcAt("2026-08-09T12:00:00Z")).berthed, false, "on the road at noon");
});

test("a malformed timetable is LOUD — the fold never degrades into a service that quietly does not sail", () => {
  // The 08-06 lesson, bronzed: a generator that shrugs at bad input publishes a
  // world with a hole in it. The lint is the door; this is the floor under it.
  const bad = (tt) => {
    const s = JSON.parse(JSON.stringify(STATE));
    s.marks.find((m) => m.id === WHEELHOUSE).timetable = tt;
    return s;
  };
  const ok = { vessel: TOWN, pace: PACE, stops: [{ mark: TOWN, departs: ["06:00Z"] }, { mark: LANDING, departs: ["12:00Z"] }] };

  assert.throws(() => serviceFromFold(bad({ ...ok, stops: [{ mark: "the-town/nowhere", departs: ["06:00Z"] }, ok.stops[1]] }), WHEELHOUSE),
    /the-town\/nowhere/, "a stop naming no mark");
  assert.throws(() => serviceFromFold(bad({ ...ok, vessel: "the-town/quay-steps" }), WHEELHOUSE),
    /quay-steps/, "a vessel that is not sited has no footprint to board");
  assert.throws(() => serviceFromFold(bad({ ...ok, pace: 0 }), WHEELHOUSE), /pace/, "a pace of zero never arrives");
  assert.throws(() => serviceFromFold(bad({ ...ok, stops: [ok.stops[0]] }), WHEELHOUSE), /stops/, "one stop is not a line");
  assert.throws(() => serviceFromFold(bad("06:00Z and 18:00Z"), WHEELHOUSE), /timetable/, "prose is not a schedule");
  assert.throws(() => serviceFromFold(STATE, "the-town/the-deck"), /timetable/, "a mark with no timetable is not a service");

  // servicesFromFold collects rather than throws — one bad schedule must not
  // blind a reader to the good ones, but it is never silently dropped.
  const { services, errors } = servicesFromFold(bad({ ...ok, pace: -1 }));
  assert.deepEqual(services, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /pace/);
  assert.equal(errors[0].mark, WHEELHOUSE);
});

test("the derivation path touches no filesystem — position is arithmetic, not a read", () => {
  // walk.mjs's design law, extended: the office pen owns writing, this owns
  // arithmetic. A fs import here would mean a reader's answer could depend on
  // which clone they hold.
  const src = readFileSync(join(HERE, "vessel.mjs"), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:fs["']/, "no fs in the derivation");
  assert.doesNotMatch(src, /Date\.now\(\)/, "and no clock read — the clock is always passed in");
});

test("ashore is derived from the crossing itself, not a stored landing point", () => {
  const [toPando, toTown] = [nextFrom(TOWN, DAY0), nextFrom(LANDING, DAY0)];
  const a = ashoreOf(service, toPando), b = ashoreOf(service, toTown);
  // You step off on the outboard rail — beyond the berth, along the heading you
  // came in on. The side is a fact about the voyage, so no landing point is
  // stored and no stop's position is written down to check it.
  const outboard = (s, p) =>
    (p.x - s.to.at.x) * (s.to.at.x - s.from.at.x) + (p.y - s.to.at.y) * (s.to.at.y - s.from.at.y) > 0;
  assert.ok(!pointInRect(a.x, a.y, footprintOf(service, toPando.to.at)));
  assert.ok(!pointInRect(b.x, b.y, footprintOf(service, toTown.to.at)));
  assert.ok(outboard(toPando, a), "at Pando you step down away from the water you crossed, toward the grove");
  assert.ok(outboard(toTown, b), "at the quay you step off toward the stones");
});
