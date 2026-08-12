#!/usr/bin/env node
// vessel.test.mjs — the timetable mechanic: a mark that carries a schedule
// becomes a body that moves on a clock, and boarding is AGREED.
//   node --test tools/vessel.test.mjs
//
// The law under test (Keemin, 2026-08-11): position = f(walk ledger, timetable,
// agreements, clock). BOARDING-IS-PRESENCE IS RETIRED — an entity is moved by a
// mark only by its own agreement, so a ride is a written record and everything
// else about it stays derived. Every clone recomputes the same voyage from the
// same four inputs, so these tests pass a clock in rather than reading one.
//
// WHAT THE RE-PIN CHANGED, and what it deliberately did not. Every test below
// that used to prove someone was collected now hands `positionAt` an agreement
// and proves the same voyage; every test that used to prove someone was NOT
// collected now proves it for a stronger reason — no agreement — and the
// geometry those refusals leaned on is asserted to be irrelevant rather than
// removed, because the whole content of the ruling is that standing somewhere
// is not consent. The schedule, the run, the deposit point and the wharf grant
// are untouched: this is a change to who may be moved, not to where she goes.
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
  agreementAt, boundStopOf, isPassengerPolicy,
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

// ── the agreements ──────────────────────────────────────────────────────────
//
// One helper, so no test below hand-writes the row shape and they cannot drift
// into disagreeing about what an agreement IS. `born` defaults to a hair before
// the sailing named, which is the ordinary case: you arrange your passage while
// she is lying alongside.
const agree = (entity, policy, born, { severed = null, target = TOWN } = {}) =>
  [{ entity, target, policy, born_at: born, ...(severed === null ? {} : { severed_at: severed }) }];
const boundTo = (stop) => `bound:${stop}`;
// The hair. The door writes an agreement at an instant strictly inside the
// dwell; anchoring on the dwell's own midpoint keeps that true whatever the run
// becomes, in the same way every other instant in this suite is derived.
const agreedDuring = (s) => midDwellBefore(s);

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

// ── the agreement law ───────────────────────────────────────────────────────

test("the policy vocabulary: `riding` and `bound:<stop>` are passages; nothing else is", () => {
  assert.equal(boundStopOf(boundTo(LANDING)), LANDING, "a bound policy names its own stop");
  assert.equal(boundStopOf("riding"), null);
  assert.ok(isPassengerPolicy("riding") && isPassengerPolicy(boundTo(WHARF)));
  // The object policies stay what they were and can never move a resident: an
  // entity carries its own vocabulary and a keystone's `cascade` is not a ticket.
  assert.ok(!isPassengerPolicy("cascade") && !isPassengerPolicy("detach") && !isPassengerPolicy(undefined));

  // Latest-wins, the ledger's own rule, so two agreements never argue.
  const s = nextFrom(TOWN, DAY0);
  const two = [...agree("r", "riding", agreedDuring(s)), ...agree("r", boundTo(WHARF), agreedDuring(s) + 1e-6)];
  assert.equal(agreementAt(two, service, s.departFc).policy, boundTo(WHARF), "the newer statement stands");
  // And a severed one is not held, however recent.
  const gone = agree("r", "riding", agreedDuring(s), { severed: s.departFc - 1e-6 });
  assert.equal(agreementAt(gone, service, s.departFc), null);
});

test("agree-and-board: an agreement made while she lies alongside is the whole ticket", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const ticket = agree("rider", boundTo(LANDING), agreedDuring(outbound));

  const waiting = positionAt(rider, (rider.at + outbound.departFc) / 2, service, ticket);
  assert.deepEqual(at(waiting), site(QUAY), "still standing where he stood; the agreement moved nothing");
  assert.equal(waiting.aboard, null, "not sailing yet");
  assert.equal(waiting.boundFor, LANDING, "…but the answer already says where he is bound");
  assert.equal(waiting.onDeckAt, TOWN, "and that he is on her deck while she lies there");

  const underway = positionAt(rider, midway(outbound), service, ticket);
  assert.equal(underway.aboard, "the-post-office");
  assert.equal(underway.boundFor, LANDING, "the agreement's own words ride the answer");
  assert.equal(underway.arrived, false, "under way is not arrived");
  assert.deepEqual(at(underway), at(vesselPositionAt(service, midway(outbound))),
    "a passenger's position IS the vessel's while she is under way");
});

test("THE FOURTH QUADRANT — permission without presence rides nothing today, and rides the next cast-off you stand for", () => {
  // The half the law would be wrong without. An agreement is not a summons: she
  // does not come and fetch you, and she does not take you off a hillside a
  // kilometre inland. It waits, standing, until you are on her deck at an hour
  // she goes.
  const outbound = nextFrom(TOWN, DAY0);
  const inland = { x: QUAY.x, y: QUAY.y + 1000 };
  assert.ok(!pointInRect(inland.x, inland.y, footprintOf(service, QUAY)),
    "a kilometre off her deck — the point of the test");

  const waiting = D({ handle: "inlander", from: inland, toward: inland, at: midDwellBefore(outbound) });
  const ticket = agree("inlander", boundTo(LANDING), agreedDuring(outbound));

  const missed = positionAt(waiting, midway(outbound), service, ticket);
  assert.equal(missed.aboard, null, "she casts off and leaves them on the hill — permission is not an edge");
  assert.deepEqual(at(missed), site(inland), "exactly where their own record puts them");
  assert.equal(missed.boundFor, LANDING, "…and the passage is still theirs, unspent and still saying where");

  // THEN THEY WALK DOWN. The same unspent agreement, and the first cast-off they
  // are standing for takes them — no re-agreeing, no ceremony.
  const walkDown = D({ handle: "inlander", from: inland, toward: QUAY, at: outbound.arriveFc });
  const next = nextFrom(TOWN, arrivalOf(walkDown));
  assert.equal(positionAt(walkDown, next.departFc - 1e-9, service, ticket).onDeckAt, TOWN,
    "standing on her deck when she casts off");
  assert.equal(positionAt(walkDown, midway(next), service, ticket).aboard, "the-post-office",
    "the next cast-off they stand for is the one that takes them");
  assert.equal(positionAt(walkDown, midDwellAfter(next), service, ticket).ashoreAt, LANDING,
    "and it ends where the agreement always said it would");
});

test("CHANGING YOUR MIND IS WALKING AWAY — there is no cancellation rule because none is needed", () => {
  // The consequence of edge-AND-permission that a reviewer should be able to
  // read off the tests: an agreement made and then walked away from carries
  // nobody, and nothing had to be revoked for that to be true.
  const outbound = nextFrom(TOWN, DAY0);
  const ticket = agree("waverer", boundTo(LANDING), agreedDuring(outbound));

  // Agreed on her deck, then walks off it before she goes.
  const away = { x: QUAY.x, y: QUAY.y + 600 };
  const leaves = D({ handle: "waverer", from: QUAY, toward: away, at: agreedDuring(outbound) + 1e-6 });
  assert.ok(walkPositionAt(leaves, outbound.departFc).arrived, "the walk is finished before she casts off");

  const p = positionAt(leaves, midway(outbound), service, ticket);
  assert.equal(p.aboard, null, "no edge at the hour, so no ride — by feet, with nothing revoked");
  assert.deepEqual(at(p), site(away));

  // Compare: the identical agreement, standing still. THAT rides. The only
  // difference between the two is where the feet were.
  const stays = D({ handle: "waverer", from: QUAY, toward: QUAY, at: agreedDuring(outbound) + 1e-6 });
  assert.equal(positionAt(stays, midway(outbound), service, ticket).aboard, "the-post-office");
});

test("presence without agreement never carries: a walker standing on her deck at cast-off sails nowhere", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const stander = D({ handle: "stander", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });

  const atCastOff = positionAt(stander, outbound.departFc, service, []);
  assert.ok(pointInRect(atCastOff.x, atCastOff.y, footprintOf(service, QUAY)),
    "he really is standing on her deck at the hour — the refusal is not an accident of position");
  assert.equal(atCastOff.arrived, true, "and standing, which used to be the whole ticket");
  assert.equal(atCastOff.aboard, null, "…and she goes without him");

  const later = positionAt(stander, midway(outbound), service, []);
  assert.equal(later.aboard, null);
  assert.deepEqual(at(later), site(QUAY), "he is exactly where he stood; she is half a run away");
});

test("THE EDGE NEEDS STANDING: a line that merely crosses her deck boards nobody, agreement or no agreement", () => {
  // A long walk down the reach whose straight line runs through her footprint at
  // cast-off. Under the retired law he was excluded for not STANDING; the edge
  // half of the new law keeps exactly that, so this is asserted BOTH ways —
  // without a passage and with one. The permission cannot supply the edge.
  const outbound = nextFrom(TOWN, DAY0);
  const REACH_M = 200;
  const crossing = D({ handle: "passer",
                       from: { x: QUAY.x, y: QUAY.y + REACH_M }, toward: { x: QUAY.x, y: QUAY.y - REACH_M },
                       at: outbound.departFc - REACH_M / WALK_M_PER_CROSSING });
  const atCastOff = positionAt(crossing, outbound.departFc, service, []);
  assert.ok(pointInRect(atCastOff.x, atCastOff.y, footprintOf(service, QUAY)), "amidships at the hour");
  assert.equal(atCastOff.arrived, false, "…but mid-stride, which is not standing");
  assert.equal(atCastOff.aboard, null);

  const later = positionAt(crossing, midway(outbound), service, []);
  assert.equal(later.aboard, null);
  assert.equal(later.x, QUAY.x, "he walks on down the reach");
  assert.ok(later.y < QUAY.y);

  // And with a passage in hand he is still not carried: the water takes her and
  // leaves him, and his unspent agreement waits for an hour he stands for.
  const ticket = agree("passer", boundTo(LANDING), crossing.at - 1e-6);
  const withTicket = positionAt(crossing, midway(outbound), service, ticket);
  assert.equal(withTicket.aboard, null, "permission does not make a moving walker present");
  assert.deepEqual(at(withTicket), at(later), "he is exactly where the walk alone puts him");
  assert.equal(withTicket.boundFor, LANDING, "…still bound, still unspent");
});

test("a walk declared while she is ALONGSIDE needs no deposit — you leave on your own feet", () => {
  // The narrow reach of the going-ashore rule, pinned. Setting someone down is
  // only ever needed mid-channel, because only there can they not simply walk
  // off. Declared at a berth, the walk is an ordinary walk and the edge check at
  // her next cast-off finds them gone — no deposit, no severance ceremony.
  const outbound = nextFrom(TOWN, DAY0);
  const ticket = agree("stepper", "riding", agreedDuring(outbound));
  const away = { x: QUAY.x, y: QUAY.y + 400 };
  const stepsOff = D({ handle: "stepper", from: QUAY, toward: away, at: agreedDuring(outbound) + 1e-6 });

  const p = positionAt(stepsOff, midway(outbound), service, ticket);
  assert.equal(p.aboard, null, "she sailed without them");
  assert.equal(p.ashoreAt, null, "and nobody was set down, because nobody was ever picked up");
  assert.deepEqual(at(p), site(away), "they walked where they said they were walking");
});

test("presence without agreement never carries: a bystander a metre off her rail is exactly as unboarded as one on her deck", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const offRail = { x: QUAY.x - (service.vessel.extent.w / 2 + 1), y: QUAY.y };
  assert.ok(!pointInRect(offRail.x, offRail.y, footprintOf(service, QUAY)), "he stands ashore, by a metre");

  const bystander = D({ handle: "watcher", from: offRail, toward: offRail, at: midDwellBefore(outbound) });
  const alongside = positionAt(bystander, (bystander.at + outbound.departFc) / 2, service, []);
  assert.equal(alongside.onDeckAt, null, "off her deck, so the deck field is empty");
  assert.equal(alongside.boundFor, null, "and he has agreed to nothing");

  const p = positionAt(bystander, midway(outbound), service, []);
  assert.equal(p.aboard, null);
  assert.deepEqual(at(p), site(offRail), "he is exactly where he stood");
  // THE METRE NO LONGER DECIDES ANYTHING. Under the retired law this metre was
  // the difference between a voyage and a morning on the quay; now the walker on
  // her deck (the test above) gets precisely the same answer he does.
  const onDeck = D({ handle: "watcher", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  assert.equal(positionAt(onDeck, midway(outbound), service, []).aboard,
               p.aboard, "the metre buys nothing either way");
});

test("VERMILLION'S CASE: standing on the berth centre when she casts off, with no agreement — she sails alone", () => {
  // The named case this ruling was written against, and the one the deploy
  // disclosure names. A resident walks to the landing's own centre — which is
  // exactly where she lies when she is alongside, so they are standing amidships
  // at the hour by doing nothing but arriving at a stop. Under the retired law
  // that collected them and carried them off the mountain they had walked to.
  const southbound = nextFrom(LANDING, fcAt("2026-08-09T11:00:00Z"));
  const walked = D({ handle: "vermillion", from: { x: BERTH.x + 600, y: BERTH.y + 600 },
                     toward: BERTH, at: midDwellBefore(southbound) });

  const standing = positionAt(walked, southbound.departFc, service, []);
  assert.deepEqual(at(standing), site(BERTH), "standing on the berth's own centre");
  assert.ok(pointInRect(standing.x, standing.y, footprintOf(service, BERTH)),
    "which is inside her footprint, because that is where she lies");
  assert.equal(standing.arrived, true, "arrived, standing — the retired law's whole ticket");
  assert.equal(standing.aboard, null, "and she casts off without them");

  const after = positionAt(walked, midway(southbound), service, []);
  assert.equal(after.aboard, null, "she is out on the water and they are not");
  assert.deepEqual(at(after), site(BERTH), "they are still standing on the landing they walked to");
});

test("bound-stop semantics: she sets you down at the stop you named, and the agreement ends there", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const homeward = nextFrom(LANDING, outbound.arriveFc);       // the cast-off from this very berth
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const ticket = agree("rider", boundTo(LANDING), agreedDuring(outbound));

  const landed = positionAt(rider, midDwellAfter(outbound), service, ticket);
  assert.equal(landed.ashoreAt, LANDING, "ashore at the stop the agreement named");
  assert.equal(landed.arrived, true);
  assert.equal(landed.standing, true);
  assert.equal(landed.aboard, null);
  assert.equal(landed.boundFor, null, "the agreement ended by its own terms — nothing is written to end it");

  assert.ok(!pointInRect(landed.x, landed.y, footprintOf(service, BERTH)),
    "set down beyond her rail — the deposit point is unchanged by the ruling");
  const reach = Math.hypot(service.vessel.extent.w, service.vessel.extent.h) / 2 + ASHORE_STEP_M + 0.15;
  assert.ok(Math.hypot(landed.x - BERTH.x, landed.y - BERTH.y) < reach,
    "…but adjacent to the berth, not thrown inland");
  const landingMark = byId.get(LANDING);
  assert.ok(pointInRect(landed.x, landed.y, { ...siteOf(LANDING), ...landingMark.extent }),
    "ashore is the landing, not the water");

  // The agreement is SPENT: the next cast-off from this very berth leaves them
  // standing. Under the retired law the deposit point had to be outside her
  // footprint or she would yo-yo everyone forever; now it is the ended agreement
  // that stops the loop, and the deposit point is merely where the stones are.
  const afterNext = positionAt(rider, midway(homeward), service, ticket);
  assert.equal(afterNext.aboard, null, "she sailed without him — his passage was to here");
  assert.deepEqual(at(afterNext), at(landed), "he has not moved, because he declared no walk");
});

test("THROUGH-RIDING: a bound passage carries you past every intermediate call, with no deposit and no turns", () => {
  // The Garrison call sits between the landing and the quay. A passage bound for
  // the wharf lies alongside AT the landing and casts off again with them still
  // aboard — the ride is one agreement, not one per hop.
  const outbound = nextFrom(TOWN, DAY0);                        // quay → landing
  const rider = D({ handle: "through", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const ticket = agree("through", boundTo(WHARF), agreedDuring(outbound));
  const homeward = nextFrom(LANDING, outbound.arriveFc);         // landing → wharf

  const call = positionAt(rider, midDwellAfter(outbound), service, ticket);
  assert.equal(call.aboard, "the-post-office", "she calls at the landing and he stays aboard");
  assert.equal(call.ashoreAt, null, "NOT deposited — this is the whole of through-riding");
  assert.equal(call.onDeckAt, LANDING, "on her deck, at the stop she is lying at");
  assert.equal(call.boundFor, WHARF, "and still bound for the stop he named");
  assert.deepEqual(at(call), site(BERTH), "his position is hers: she lies on the landing's mark");

  assert.equal(positionAt(rider, midway(homeward), service, ticket).aboard, "the-post-office");

  const arrived = positionAt(rider, midDwellAfter(homeward), service, ticket);
  assert.equal(arrived.ashoreAt, WHARF, "set down at the stop he named, and only there");
  assert.equal(arrived.aboard, null);
});

test("full round-trip: ONE agreement each way — the re-board hop the anti-conveyor rule used to force is gone", () => {
  const h = "traveller";
  const outbound = nextFrom(TOWN, DAY0);
  // UP: one walk to say where he is, one agreement to say where he is going.
  const rideUp = D({ handle: h, from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const upTicket = agree(h, boundTo(LANDING), agreedDuring(outbound));
  const landedFc = midDwellAfter(outbound);
  const ashoreAtPando = positionAt(rideUp, landedFc, service, upTicket);
  assert.equal(ashoreAtPando.ashoreAt, LANDING);

  // …walks up to the party hall (an ordinary walk, at the town's own pace, and
  // no agreement stands, so the schedule cannot touch him)…
  const hall = byId.get("vermillion/party-hall");
  const toParty = D({ handle: h, from: { x: ashoreAtPando.x, y: ashoreAtPando.y },
                      toward: siteOf(hall.id), targetExtent: { ...hall.extent },
                      targetMarkId: hall.id, at: landedFc });
  const atPartyFc = arrivalOf(toParty);
  const atParty = positionAt(toParty, atPartyFc, service, upTicket);
  assert.equal(atParty.arrived, true, "the walk up is a walk, unaffected by any schedule");
  assert.equal(atParty.aboard, null);

  // …then walks back down to the landing…
  const toBerth = D({ handle: h, from: { x: atParty.x, y: atParty.y }, toward: BERTH, at: atPartyFc });
  const backOnDeckFc = arrivalOf(toBerth);

  // …and agrees ONE passage home. The southbound return calls at the Garrison,
  // and he rides straight through it: under the retired law this leg needed a
  // deposit at the wharf and a fresh walk back onto her deck inside the dwell.
  const homeward = nextFrom(LANDING, backOnDeckFc);
  const downTicket = agree(h, boundTo(TOWN), agreedDuring(homeward));

  const waiting = positionAt(toBerth, homeward.departFc - 1e-9, service, downTicket);
  assert.equal(waiting.arrived, true, "standing at the landing when she casts off");
  assert.equal(waiting.boundFor, TOWN, "with his passage home already arranged");

  assert.equal(positionAt(toBerth, midway(homeward), service, downTicket).aboard, "the-post-office");

  const atWharf = positionAt(toBerth, midDwellAfter(homeward), service, downTicket);
  assert.equal(atWharf.ashoreAt, null, "the Garrison call does not put him off — he is bound for the quay");
  assert.equal(atWharf.aboard, "the-post-office");
  assert.equal(atWharf.onDeckAt, WHARF);

  const lastLeg = nextFrom(WHARF, homeward.arriveFc);
  assert.equal(lastLeg.to.markId, TOWN, "her next cast-off from the wharf is the run home");
  const home = positionAt(toBerth, midDwellAfter(lastLeg), service, downTicket);
  assert.equal(home.ashoreAt, TOWN, "set down on the quay side of the reach");
  assert.ok(!pointInRect(home.x, home.y, footprintOf(service, QUAY)), "outside her footprint again");

  // The next one sails without him: the agreement is spent, not standing.
  const after = nextFrom(TOWN, lastLeg.arriveFc);
  assert.equal(positionAt(toBerth, midway(after), service, downTicket).aboard, null);
});

test("RIDING with no destination: she carries you round the whole day's ring and sets you down never", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "roundabout", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const ticket = agree("roundabout", "riding", agreedDuring(outbound));

  // Every sailing of a full day, and every dwell between them: aboard throughout,
  // never deposited, and never bound anywhere because the agreement names nowhere.
  const day = sailingsBetween(service, outbound.departFc - 1e-9, outbound.departFc + DAY_CROSSINGS);
  assert.ok(day.length >= 6, "a full day's ring, so the pass-through is proven at every stop she makes");
  for (const s of day) {
    const sea = positionAt(rider, midway(s), service, ticket);
    assert.equal(sea.aboard, "the-post-office", `still aboard on the ${s.from.markId} → ${s.to.markId} leg`);
    assert.equal(sea.boundFor, null, "riding names no stop — that is the difference from bound");
    assert.deepEqual(at(sea), at(vesselPositionAt(service, midway(s))), "his position is hers");

    const alongside = positionAt(rider, midDwellAfter(s), service, ticket);
    assert.equal(alongside.ashoreAt, null, `not set down at ${s.to.markId} — riding is deposited nowhere`);
    assert.equal(alongside.aboard, "the-post-office");
    assert.equal(alongside.onDeckAt, s.to.markId, "on her deck, at whichever stop she is lying at");
  }

  // And he ends the day where she does, having declared nothing since.
  const aDayOn = outbound.departFc + DAY_CROSSINGS;
  assert.deepEqual(at(positionAt(rider, aDayOn, service, ticket)), at(vesselPositionAt(service, aDayOn)));

  // A FORTNIGHT ON, still riding — and the answer does not depend on how long
  // ago the agreement was made. The replay stops at the cast-off that proved she
  // took him, because nothing later in a passage with no ending can end it; a
  // derivation that re-walked every sailing since would cost more every day it
  // stood, on every read, for every rider.
  for (const days of [7, 14]) {
    const later = outbound.departFc + days * DAY_CROSSINGS + 0.3;
    const p = positionAt(rider, later, service, ticket);
    assert.equal(p.aboard, "the-post-office", `${days} days on and she still has him`);
    assert.deepEqual(at(p), at(vesselPositionAt(service, later)), "wherever she is, that is where he is");
  }
});

test("A WALK DECLARED ABOARD IS THE CHOICE TO GO ASHORE: deposited at her next arrival, and the leg starts there", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "leaver", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const ticket = agree("leaver", "riding", agreedDuring(outbound));
  assert.equal(positionAt(rider, midway(outbound), service, ticket).aboard, "the-post-office");

  // Mid-crossing he declares a walk to the party hall. The walk's `at` is after
  // the agreement's birth and he is aboard, so it means: put me off at the next
  // stop and I will walk from there.
  const hall = byId.get("vermillion/party-hall");
  const declaredFc = midway(outbound);
  // Where the door would write his `from`: mid-channel, because that is where he
  // is. The whole point of the rule is that this point is NOT where the leg runs
  // from — nobody steps off into the water.
  const midChannel = positionAt(rider, declaredFc, service, ticket);
  const goingAshore = D({ handle: "leaver", from: { x: midChannel.x, y: midChannel.y },
                          toward: siteOf(hall.id), targetExtent: { ...hall.extent },
                          targetMarkId: hall.id, at: declaredFc });

  const stillCarried = positionAt(goingAshore, declaredFc + (outbound.arriveFc - declaredFc) / 2, service, ticket);
  assert.equal(stillCarried.aboard, "the-post-office", "declaring it does not put him in the water — she finishes the leg");

  // At her arrival: set down, agreement severed by the choice, walk begins.
  const setDown = positionAt(goingAshore, outbound.arriveFc + 1e-9, service, ticket);
  assert.equal(setDown.ashoreAt, LANDING, "she sets him down at the stop she reached");
  assert.equal(setDown.aboard, null, "and the passage is over — the walk was the severance");
  assert.equal(setDown.arrived, false, "with the declared leg still ahead of him");
  assert.ok(setDown.remainingM > 0);

  // The leg runs from the DEPOSIT POINT, not from wherever he was standing when
  // he declared it — which was out on the water.
  const deposit = ashoreOf(service, outbound);
  assert.deepEqual(at(setDown), [deposit.x, deposit.y], "the walk starts on the stones she left him on");
  assert.ok(Math.hypot(midChannel.x - deposit.x, midChannel.y - deposit.y) > 1000,
    "and those are nowhere near where he declared it — the substitution is doing real work");

  const walkedOn = positionAt(goingAshore, outbound.arriveFc + 0.02, service, ticket);
  assert.equal(walkedOn.ashoreAt, null, "and once he is off the stones the answer stops calling him ashore there");
  assert.ok(Math.hypot(walkedOn.x - deposit.x, walkedOn.y - deposit.y) > 0, "he is walking");

  // He reaches the hall on his own feet, and no later sailing touches him.
  const arrived = positionAt(goingAshore, outbound.arriveFc + 5, service, ticket);
  assert.equal(arrived.arrived, true, "arrived at the hall");
  assert.equal(arrived.aboard, null, "and the spent agreement never picks him up again");
});

// ── the Garrison stop (ruled 2026-08-10, #1596 — case-by-case founder grant) ──

test("the wharf call: southbound she calls at the Garrison's own shore, and a passage BOUND FOR the wharf ends on their stones", () => {
  const southbound = nextFrom(LANDING, fcAt("2026-08-09T11:00:00Z")); // the 12:00Z cast-off
  assert.equal(southbound.to.markId, WHARF, "the southbound sailing calls at the wharf");
  assert.ok(southbound.arriveFc < nextFrom(WHARF, southbound.departFc).departFc,
    "she lies alongside before her own next cast-off — the grant fits the day without moving anyone else's hour");

  const rider = D({ handle: "garrisoner", from: BERTH, toward: BERTH, at: midDwellBefore(southbound) });
  const ticket = agree("garrisoner", boundTo(WHARF), agreedDuring(southbound));
  assert.equal(positionAt(rider, midway(southbound), service, ticket).aboard, "the-post-office");
  const landed = positionAt(rider, midDwellAfter(southbound), service, ticket);
  assert.equal(landed.ashoreAt, WHARF, "set down on the Garrison's shoreline");
  // The wharf is a small stone (10×10) and the step off her rail can land on
  // the bank beside it — ashore-adjacent is the deposit law (see the bound-stop
  // test), containment never was.
  const wharfSite = siteOf(WHARF);
  const reach = Math.hypot(service.vessel.extent.w, service.vessel.extent.h) / 2 + ASHORE_STEP_M + 0.15;
  assert.ok(Math.hypot(landed.x - wharfSite.x, landed.y - wharfSite.y) < reach,
    "ashore beside the wharf's own stone, not thrown up the bank");
});

test("miss-the-boat: agree after she has gone and you ride the NEXT sailing, with the hour to hand", () => {
  // The spirit is unchanged and the mechanism is simpler: an agreement made at
  // 18:06 cannot have existed at the 18:00 cast-off, so the sailing it catches is
  // the following one. Nobody has to walk anywhere to be late any more.
  const evening = nextDepartures(service, fcAt("2026-08-09T12:00:00Z"), 1, { from: TOWN })[0];
  const stander = D({ handle: "latecomer", from: QUAY, toward: QUAY, at: midDwellBefore(evening) });
  const lateFc = evening.departFc + (6 / 60) / 12;              // six minutes after she cast off
  const ticket = agree("latecomer", boundTo(LANDING), lateFc);

  assert.equal(positionAt(stander, lateFc, service, ticket).aboard, null, "she is already away");
  assert.deepEqual(at(positionAt(stander, lateFc, service, ticket)), site(QUAY), "standing on the mooring's own ground");
  assert.equal(positionAt(stander, lateFc, service, ticket).onDeckAt, null, "the berth is empty — nothing to be on the deck of");
  assert.notEqual(vesselPositionAt(service, lateFc).atStop, TOWN, "she is away from this quay");
  assert.equal(positionAt(stander, midway(evening), service, ticket).aboard, null,
    "and the sailing she is on is not his — the agreement did not exist when she went");

  const [next] = nextDepartures(service, lateFc, 1, { from: TOWN });
  assert.equal(new Date(instantOf(next.departFc)).toISOString(), "2026-08-10T06:00:00.000Z",
    "the answer the wheelhouse gives: the next one from this quay");
  assert.equal(next.to.markId, LANDING);

  // The agreement stands through the night and she takes him in the morning.
  assert.equal(positionAt(stander, midway(next), service, ticket).aboard, "the-post-office");
  assert.equal(positionAt(stander, midDwellAfter(next), service, ticket).ashoreAt, LANDING);
});

test("a withdrawal before she goes leaves you on the quay, and the row that recorded it still stands", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "changed-mind", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });
  const withdrawn = agree("changed-mind", boundTo(LANDING), agreedDuring(outbound),
                          { severed: outbound.departFc - 1e-6 });

  assert.equal(positionAt(rider, midway(outbound), service, withdrawn).aboard, null, "she sails without him");
  assert.deepEqual(at(positionAt(rider, midway(outbound), service, withdrawn)), site(QUAY));
  // The severance is a fact about the agreement, not a deletion of it: the row
  // is still in the list handed in, and reading it BEFORE the severance still
  // finds a standing agreement.
  assert.equal(agreementAt(withdrawn, service, agreedDuring(outbound) + 1e-9)?.policy, boundTo(LANDING),
    "before the withdrawal it stood, and the record still says so");
  assert.equal(agreementAt(withdrawn, service, outbound.departFc), null, "after it, it does not");
});

test("an agreement naming another entity's passage is not yours, and an object policy is not a passage", () => {
  const outbound = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(outbound) });

  // positionAt is handed ONE walker's agreements by its caller, so the guard
  // that matters here is the POLICY: a `cascade` edge — a keystone riding a
  // house — can never be read as a ticket, whoever it belongs to.
  const objectEdge = [{ entity: "rider", target: TOWN, policy: "cascade", born_at: agreedDuring(outbound) }];
  assert.equal(positionAt(rider, midway(outbound), service, objectEdge).aboard, null);

  // And an agreement with something that is not this service carries nobody on it.
  const elsewhere = [{ entity: "rider", target: "someone/a-cart", policy: "riding", born_at: agreedDuring(outbound) }];
  assert.equal(positionAt(rider, midway(outbound), service, elsewhere).aboard, null);

  // The vessel answers to either of her two names, because the world half cannot
  // know which the office wrote.
  for (const target of [TOWN, "the-post-office"]) {
    assert.equal(positionAt(rider, midway(outbound), service, agree("rider", "riding", agreedDuring(outbound), { target })).aboard,
      "the-post-office", `${target} names her`);
  }
});

// ── the schedule is a mark, so editing the mark changes the world ────────────

test("schedule-change-via-mark-edit re-derives cleanly — the same walker, the same agreement, a different voyage", () => {
  const ruled = nextFrom(TOWN, DAY0);
  const rider = D({ handle: "rider", from: QUAY, toward: QUAY, at: midDwellBefore(ruled) });
  const ticket = agree("rider", boundTo(LANDING), agreedDuring(ruled));
  assert.equal(positionAt(rider, midway(ruled), service, ticket).aboard, "the-post-office",
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
  assert.equal(positionAt(rider, beforeSheGoes, rescheduled, ticket).aboard, null, "a moment before nine she has not cast off");
  assert.equal(positionAt(rider, beforeSheGoes, rescheduled, ticket).onDeckAt, TOWN, "he waits on her deck for the new hour");
  assert.equal(positionAt(rider, beforeSheGoes, rescheduled, ticket).boundFor, LANDING,
    "and his agreement stands: an edit to the hours re-times a passage, it does not cancel one");
  assert.equal(positionAt(rider, midway(moved), rescheduled, ticket).aboard, "the-post-office",
    "and sails at nine, from the same records, with nothing rewritten");

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
