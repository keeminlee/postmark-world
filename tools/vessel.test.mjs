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

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, fold } from "./marks-fold.mjs";
import { fractionalCrossing } from "./walk.mjs";
import { pointInRect } from "./geometry.mjs";
import {
  serviceFromFold, servicesFromFold, vesselPositionAt, positionAt,
  sailingsBetween, nextDepartures, ashoreOf, footprintOf, instantOf,
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

// ── the service the marks describe ──────────────────────────────────────────

test("the wheelhouse's timetable folds into a service — stops resolved BY MARK, never duplicated coordinates", () => {
  assert.equal(service.markId, WHEELHOUSE);
  assert.equal(service.vessel.handle, "the-post-office", "the ledger handle is the vessel mark's leaf slug");
  assert.deepEqual(service.vessel.extent, { w: 9, h: 26 }, "her footprint is her own mark's extent");
  assert.equal(service.pace, 405);
  assert.deepEqual(service.stops.map((s) => s.markId), [TOWN, LANDING]);

  // The coordinates are the STOP MARKS' own — the timetable names ids only.
  const byId = new Map(STATE.marks.map((m) => [m.id, m]));
  for (const stop of service.stops) {
    assert.deepEqual(stop.at, { x: byId.get(stop.markId).at.x, y: byId.get(stop.markId).at.y },
      `${stop.markId} takes its position from its own mark`);
  }
  // Move a stop mark and the service moves with it: nothing is copied.
  const moved = JSON.parse(JSON.stringify(STATE));
  moved.marks.find((m) => m.id === LANDING).at = { x: -50000, y: -50000 };
  assert.deepEqual(serviceFromFold(moved, WHEELHOUSE).stops[1].at, { x: -50000, y: -50000 });
});

test("the ruled schedule: quay 06:00Z/18:00Z, landing 00:00Z/12:00Z, and the day closes", () => {
  const day = sailingsBetween(service, fcAt("2026-08-09T00:00:00Z") - 1e-9, fcAt("2026-08-09T23:59:00Z"));
  assert.deepEqual(
    day.map((s) => [new Date(instantOf(s.departFc)).toISOString(), s.from.markId, s.to.markId]),
    [
      ["2026-08-09T00:00:00.000Z", LANDING, TOWN],
      ["2026-08-09T06:00:00.000Z", TOWN, LANDING],
      ["2026-08-09T12:00:00.000Z", LANDING, TOWN],
      ["2026-08-09T18:00:00.000Z", TOWN, LANDING],
    ],
    "four sailings a day, alternating ends — she is always where her next cast-off needs her");

  // ~4 h under way at pace 405, ~2 h alongside: the 24 h cycle closes on itself.
  for (const s of day) {
    const hours = (s.arriveFc - s.departFc) * 12;
    assert.ok(hours > 3.99 && hours < 4.0, `a crossing runs ${hours.toFixed(4)} h — the ruled four`);
  }
});

test("vesselPositionAt: berthed, then under way, then berthed at the other end", () => {
  const moored = vesselPositionAt(service, fcAt("2026-08-09T05:00:00Z"));
  assert.deepEqual(at(moored), [-30, 40], "an hour before cast-off she is on her mooring");
  assert.equal(moored.berthed, true);
  assert.equal(moored.atStop, TOWN);

  const underway = vesselPositionAt(service, fcAt("2026-08-09T08:00:00Z"));
  assert.equal(underway.berthed, false);
  assert.equal(underway.atStop, null);
  assert.ok(Math.hypot(underway.x + 30, underway.y - 40) > 60000, "two hours out she is ~67 km gone");

  const arrived = vesselPositionAt(service, fcAt("2026-08-09T10:30:00Z"));
  assert.deepEqual(at(arrived), [-95430, -95430], "she lies at the landing, exactly on its mark");
  assert.equal(arrived.atStop, LANDING);

  // Purity: same inputs, same answer, no clock read inside.
  const t = fcAt("2026-08-09T08:17:00Z");
  assert.deepEqual(vesselPositionAt(service, t), vesselPositionAt(service, t));
});

// ── the boarding rules ──────────────────────────────────────────────────────

test("stand-and-board: a STANDING walker inside her footprint at cast-off sails with her", () => {
  // The whole ticket: walk onto her deck and still be there when she goes.
  const rider = D({ handle: "rider", from: { x: -30, y: 40 }, toward: { x: -30, y: 40 },
                    at: fcAt("2026-08-09T05:00:00Z") });

  const waiting = positionAt(rider, fcAt("2026-08-09T05:30:00Z"), service);
  assert.deepEqual(at(waiting), [-30, 40]);
  assert.equal(waiting.aboard, null, "not sailing yet");
  assert.equal(waiting.atMooring, TOWN, "aboard at her mooring — she sails at the next departure");

  const underway = positionAt(rider, fcAt("2026-08-09T08:00:00Z"), service);
  assert.equal(underway.aboard, "the-post-office");
  assert.equal(underway.arrived, false, "under way is not arrived");
  assert.deepEqual(at(underway), at(vesselPositionAt(service, fcAt("2026-08-09T08:00:00Z"))),
    "a passenger's position IS the vessel's while she is under way");
});

test("pass-through-doesn't-board: geometry excludes anyone merely crossing her deck", () => {
  // A long walk whose straight line runs through her footprint at 06:00Z. The
  // walker is inside her extent at the instant she casts off — and is NOT
  // standing, so the water takes her and leaves him.
  // He leaves upstream at exactly the hour that puts him amidships at 06:00Z:
  // 160 m down the reach at the town's own 15 km/crossing.
  const crossing = D({ handle: "passer", from: { x: -30, y: 200 }, toward: { x: -30, y: -200 },
                       at: fcAt("2026-08-09T06:00:00Z") - 160 / 15000 });
  const atCastOff = positionAt(crossing, fcAt("2026-08-09T06:00:00Z"), service);
  assert.ok(pointInRect(atCastOff.x, atCastOff.y, footprintOf(service, { x: -30, y: 40 })),
    "he really is standing on her deck's ground at 06:00Z — the exclusion is not an accident of position");
  assert.equal(atCastOff.arrived, false, "…but still walking");
  assert.equal(atCastOff.aboard, null, "so he does not board");

  const later = positionAt(crossing, fcAt("2026-08-09T09:00:00Z"), service);
  assert.equal(later.aboard, null);
  assert.equal(later.x, -30, "he walks on down the reach; she is 100 km away");
  assert.ok(later.y < 40);
});

test("a bystander on the quay never boards — the boarding zone is her footprint, nothing wider", () => {
  const bystander = D({ handle: "watcher", from: { x: -20, y: 40 }, toward: { x: -20, y: 40 },
                        at: fcAt("2026-08-09T05:00:00Z") });
  const p = positionAt(bystander, fcAt("2026-08-09T09:00:00Z"), service);
  assert.equal(p.aboard, null, "ten metres off her rail is ashore");
  assert.equal(p.atMooring, null);
  assert.deepEqual(at(p), [-20, 40], "he is exactly where he stood");
});

test("deposited-ashore-doesn't-re-board: arrival sets you down OUTSIDE her footprint", () => {
  const rider = D({ handle: "rider", from: { x: -30, y: 40 }, toward: { x: -30, y: 40 },
                    at: fcAt("2026-08-09T05:00:00Z") });
  const landed = positionAt(rider, fcAt("2026-08-09T10:30:00Z"), service);
  assert.equal(landed.ashoreAt, LANDING);
  assert.equal(landed.arrived, true);
  assert.equal(landed.standing, true);
  assert.equal(landed.aboard, null);

  const berth = { x: -95430, y: -95430 };
  assert.ok(!pointInRect(landed.x, landed.y, footprintOf(service, berth)),
    "set down beyond her rail — this is the whole anti-conveyor rule");
  assert.ok(Math.hypot(landed.x - berth.x, landed.y - berth.y) < 12, "…but adjacent to the berth, not thrown inland");
  // And on the landing's own stones: the step off her rail lands on town ground.
  const landingMark = STATE.marks.find((m) => m.id === LANDING);
  assert.ok(pointInRect(landed.x, landed.y, { x: landingMark.at.x, y: landingMark.at.y, ...landingMark.extent }),
    "ashore is the landing, not the water");

  // The 12:00Z cast-off from this very berth passes over him — standing still is
  // not a ticket. Without this the boat would yo-yo everyone forever.
  const afterNext = positionAt(rider, fcAt("2026-08-09T14:00:00Z"), service);
  assert.equal(afterNext.aboard, null, "she sailed at 12:00Z without him");
  assert.deepEqual(at(afterNext), at(landed), "he has not moved, because he declared no walk");
});

test("full round-trip: ride up · walk to the party · walk back to her deck · ride home", () => {
  const h = "traveller";
  // The chain is four declared records; every ride between them is derived.
  const ashoreAtPando = positionAt(
    D({ handle: h, from: { x: -30, y: 40 }, toward: { x: -30, y: 40 }, at: fcAt("2026-08-09T05:00:00Z") }),
    fcAt("2026-08-09T10:15:00Z"), service);
  assert.equal(ashoreAtPando.ashoreAt, LANDING);

  // …walks up to the party hall (an ordinary walk, at the town's own pace)…
  const toParty = D({ handle: h, from: { x: ashoreAtPando.x, y: ashoreAtPando.y },
                      toward: { x: -95794, y: -95206 }, targetExtent: { w: 220, h: 220 },
                      targetMarkId: "vermillion/party-hall", at: fcAt("2026-08-09T10:15:00Z") });
  const atParty = positionAt(toParty, fcAt("2026-08-09T10:45:00Z"), service);
  assert.equal(atParty.arrived, true, "the walk up is a walk, unaffected by any schedule");
  assert.equal(atParty.aboard, null);

  // …then walks back down onto her deck before 12:00Z…
  const toBerth = D({ handle: h, from: { x: atParty.x, y: atParty.y },
                      toward: { x: -95430, y: -95430 }, at: fcAt("2026-08-09T11:00:00Z") });
  const waiting = positionAt(toBerth, fcAt("2026-08-09T11:45:00Z"), service);
  assert.equal(waiting.arrived, true, "standing on her deck with a quarter-hour to spare");
  assert.equal(waiting.atMooring, LANDING);

  // …and rides home on the 12:00Z, which is Sunday's maiden scheduled run.
  const homebound = positionAt(toBerth, fcAt("2026-08-09T14:00:00Z"), service);
  assert.equal(homebound.aboard, "the-post-office");

  const home = positionAt(toBerth, fcAt("2026-08-09T16:30:00Z"), service);
  assert.equal(home.ashoreAt, TOWN, "set down on the quay side of the reach");
  assert.ok(!pointInRect(home.x, home.y, footprintOf(service, { x: -30, y: 40 })), "outside her footprint again");

  // The 18:00Z sails without him: the chain ends where he stands, not in a loop.
  assert.equal(positionAt(toBerth, fcAt("2026-08-09T20:00:00Z"), service).aboard, null);
});

test("miss-the-boat: arrive at 18:20 and the berth is empty — with the next departure to hand", () => {
  // A 300 m walk at the town dial (15 km/crossing) takes 0.02 crossings = 14.4
  // min; set out at 18:06Z and you reach the mooring at ~18:20Z, twenty minutes
  // after she left.
  const walk = D({ handle: "latecomer", from: { x: -30, y: 340 }, toward: { x: -30, y: 40 },
                   at: fcAt("2026-08-09T18:06:00Z") });
  const atCastOff = positionAt(walk, fcAt("2026-08-09T18:00:00Z"), service);
  assert.equal(atCastOff.aboard, null, "he had not even set out");

  const arrived = positionAt(walk, fcAt("2026-08-09T18:30:00Z"), service);
  assert.equal(arrived.arrived, true);
  assert.deepEqual(at(arrived), [-30, 40], "standing on the mooring's own ground");
  assert.equal(arrived.aboard, null, "she is not here to be boarded");
  assert.equal(arrived.atMooring, null, "the berth is empty — nothing to be aboard of");
  assert.equal(vesselPositionAt(service, fcAt("2026-08-09T18:30:00Z")).berthed, false, "she is half an hour out");

  const [next] = nextDepartures(service, fcAt("2026-08-09T18:30:00Z"), 1, { from: TOWN });
  assert.equal(new Date(instantOf(next.departFc)).toISOString(), "2026-08-10T06:00:00.000Z",
    "the answer the wheelhouse gives: the next one from this quay");
  assert.equal(next.to.markId, LANDING);

  // And standing there through the night, he catches it — presence is the ticket.
  assert.equal(positionAt(walk, fcAt("2026-08-10T08:00:00Z"), service).aboard, "the-post-office");
});

// ── the schedule is a mark, so editing the mark changes the world ────────────

test("schedule-change-via-mark-edit re-derives cleanly — the same walker, a different voyage", () => {
  const rider = D({ handle: "rider", from: { x: -30, y: 40 }, toward: { x: -30, y: 40 },
                    at: fcAt("2026-08-09T05:00:00Z") });
  const noon = fcAt("2026-08-09T08:00:00Z");
  assert.equal(positionAt(rider, noon, service).aboard, "the-post-office", "under the ruled schedule he is at sea");

  // Someone edits the wheelhouse mark: the quay's sailings move to 09:00Z/21:00Z.
  const edited = JSON.parse(JSON.stringify(STATE));
  edited.marks.find((m) => m.id === "the-town/the-wheelhouse")
    .timetable.stops[0].departs = ["09:00Z", "21:00Z"];
  const rescheduled = serviceFromFold(edited, WHEELHOUSE);

  assert.equal(positionAt(rider, noon, rescheduled).aboard, null, "at 08:00Z she now has not cast off");
  assert.equal(positionAt(rider, noon, rescheduled).atMooring, TOWN, "he waits on her deck for the new hour");
  assert.equal(positionAt(rider, fcAt("2026-08-09T11:00:00Z"), rescheduled).aboard, "the-post-office",
    "and sails at nine, from the same record, with nothing rewritten");

  // A slower boat is the same edit in a different field.
  const slowed = JSON.parse(JSON.stringify(STATE));
  slowed.marks.find((m) => m.id === "the-town/the-wheelhouse").timetable.pace = 200;
  const slow = serviceFromFold(slowed, WHEELHOUSE);
  assert.equal(vesselPositionAt(slow, fcAt("2026-08-09T10:30:00Z")).berthed, false,
    "at pace 200 she is still an hour out when the ruled schedule would have her alongside");
});

// ── the mechanic is general, and it fails loudly ────────────────────────────

test("any mark that earns a timetable becomes a moving body — the mechanic is not the Post Office's", () => {
  const state = JSON.parse(JSON.stringify(STATE));
  state.marks.push(
    { id: "someone/a-cart", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 } },
    { id: "someone/the-north-stop", kind: "sited", at: { x: 0, y: -3000 }, extent: { w: 10, h: 10 } },
    { id: "someone/the-south-stop", kind: "sited", at: { x: 0, y: 3000 }, extent: { w: 10, h: 10 } },
    { id: "someone/the-cart-line", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 },
      mechanic: "timetable",
      timetable: { vessel: "someone/a-cart", pace: 15,
                   stops: [{ mark: "someone/the-north-stop", departs: ["08:00Z"] },
                           { mark: "someone/the-south-stop", departs: ["20:00Z"] }] } });

  const { services, errors } = servicesFromFold(state);
  assert.deepEqual(errors, []);
  assert.deepEqual(services.map((s) => s.markId).sort(), ["someone/the-cart-line", WHEELHOUSE]);
  const cart = services.find((s) => s.markId === "someone/the-cart-line");
  assert.deepEqual(at(vesselPositionAt(cart, fcAt("2026-08-09T07:00:00Z"))), [0, -3000], "waiting at the north stop");
  assert.equal(vesselPositionAt(cart, fcAt("2026-08-09T12:00:00Z")).berthed, false, "on the road at noon");
});

test("a malformed timetable is LOUD — the fold never degrades into a service that quietly does not sail", () => {
  // The 08-06 lesson, bronzed: a generator that shrugs at bad input publishes a
  // world with a hole in it. The lint is the door; this is the floor under it.
  const bad = (tt) => {
    const s = JSON.parse(JSON.stringify(STATE));
    s.marks.find((m) => m.id === WHEELHOUSE).timetable = tt;
    return s;
  };
  const ok = { vessel: TOWN, pace: 405, stops: [{ mark: TOWN, departs: ["06:00Z"] }, { mark: LANDING, departs: ["12:00Z"] }] };

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
  const [toPando, toTown] = [
    sailingsBetween(service, fcAt("2026-08-09T05:00:00Z"), fcAt("2026-08-09T07:00:00Z"))[0],
    sailingsBetween(service, fcAt("2026-08-09T11:00:00Z"), fcAt("2026-08-09T13:00:00Z"))[0],
  ];
  // You step off on the outboard rail — the side away from the water you crossed.
  const a = ashoreOf(service, toPando), b = ashoreOf(service, toTown);
  assert.ok(!pointInRect(a.x, a.y, footprintOf(service, toPando.to.at)));
  assert.ok(!pointInRect(b.x, b.y, footprintOf(service, toTown.to.at)));
  assert.ok(a.x < -95430 && a.y < -95430, "at Pando you step down toward the grove");
  assert.ok(b.x > -30 && b.y > 40, "at the quay you step off toward the stones");
});
