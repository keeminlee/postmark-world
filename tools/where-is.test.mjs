import test from "node:test";
import assert from "node:assert/strict";
import {
  whereIs, homeOf, parcelFor, parcelsFor, householdOf, sourceLabel, publicResidents,
  porchOf, NOWHERE, QUAY_MARK_ID,
} from "./where-is.mjs";
import { parseWalkLedger } from "./walk.mjs";

const world = {
  marks: [
    { id: "vermillion/the-pando-peak", by: "vermillion", household: "vermillion", kind: "sited", at: { x: -95458, y: -95458 } },
    { id: "rei/the-lanternstep-house", by: "rei", household: "rei", kind: "sited", at: { x: 1075, y: -800 } },
  ],
  parcels: [
    { id: "vermillion/the-pando-peak-parcel", household: "vermillion", at: { x: -95458, y: -95458 }, extent: { w: 25, h: 25 } },
    { id: "rei/the-lanternstep-house-parcel", household: "rei", at: { x: 1075, y: -800 }, extent: { w: 25, h: 25 } },
  ],
};

test("homeOf: the parcel is the home (ruling 7), by household not by handle-string", () => {
  const here = homeOf("vermillion", world);
  // The claim this test has always made, unchanged.
  assert.deepEqual(
    { x: here.x, y: here.y, placed: here.placed, source: here.source, mark_id: here.mark_id, parcel: here.parcel },
    { x: -95458, y: -95458, placed: true, source: "parcel", mark_id: "vermillion/the-pando-peak-parcel", parcel: world.parcels[0] },
  );
  // And the stricter one the household-grain ruling adds: the answer now names
  // the grain it resolved at and which of the household's holdings it picked.
  assert.deepEqual({ household: here.household, via: here.via, household_parcels: here.household_parcels },
    { household: "vermillion", via: "own", household_parcels: ["vermillion/the-pando-peak-parcel"] });
});

test("REGRESSION (2026-08-04): a resident absent from any seeding snapshot is still placed", () => {
  // vermillion is in no manifest anywhere — this module never asks one.
  // The old read_home join short-circuited to unplaced here and cost him walking.
  const here = whereIs("vermillion", { world, departures: [] });
  assert.equal(here.placed, true);
  assert.equal(here.x, -95458);
  assert.equal(here.source, "parcel");
});

test("NOWHERE is not the origin — unplaced must be distinguishable from Ferry's crossing", () => {
  const here = whereIs("stranger", { world, departures: [] });
  assert.deepEqual(here, { ...NOWHERE });
  assert.equal(here.x, null, "never 0 — the origin is a real place and would read as the Town Centre");
  assert.equal(here.placed, false);
});

test("whereIs: a declared walk wins over the standing home", () => {
  const ledger = `- 2026-08-04T00:00:00.000Z · rei · from 1075,-800 · toward 1075,-700 · at 100.0000\n`;
  const { departures } = parseWalkLedger(ledger);
  const here = whereIs("rei", { world, departures, at: 200 }); // long since arrived
  assert.equal(here.source, "walk");
  assert.equal(here.y, -700);
  // and with no ledger the same resident falls back to their ground
  assert.equal(whereIs("rei", { world, departures: [] }).source, "parcel");
});

test("whereIs and homeOf answer differently on purpose — living vs standing", () => {
  const ledger = `- 2026-08-04T00:00:00.000Z · rei · from 1075,-800 · toward 5000,5000 · at 100.0000\n`;
  const { departures } = parseWalkLedger(ledger);
  assert.equal(homeOf("rei", world).x, 1075, "home never moves because you walked");
  assert.notEqual(whereIs("rei", { world, departures, at: 200 }).x, 1075);
});

test("household join: a handle whose marks name a household resolves through it", () => {
  const w = {
    marks: [{ id: "agent/hut", by: "agent", household: "the-firm", kind: "sited", at: { x: 5, y: 5 } }],
    parcels: [{ id: "the-firm/yard", household: "the-firm", at: { x: 5, y: 5 }, extent: { w: 25, h: 25 } }],
  };
  assert.equal(householdOf("agent", w), "the-firm");
  assert.equal(parcelFor("agent", w).id, "the-firm/yard");
  assert.equal(homeOf("agent", w).placed, true);
});

test("sourceLabel never describes a camera as a body", () => {
  assert.match(sourceLabel(homeOf("rei", world)), /their ground/);
  assert.match(sourceLabel({ ...NOWHERE }, "wren-winter"), /no ground on the map yet/);
});

test("publicResidents: ONE list, and arrived/standing are the same state", () => {
  const ledger = `- 2026-08-04T00:00:00.000Z · rei · from 1075,-800 · toward 1075,-700 · at 100.0000\n`;
  const { departures } = parseWalkLedger(ledger);
  const rows = publicResidents(["rei", "vermillion"], { world, departures, at: 200 });
  assert.equal(rows.length, 2);
  const rei = rows.find((r) => r.handle === "rei");
  const verm = rows.find((r) => r.handle === "vermillion");
  // rei walked and arrived; vermillion never walked. Same state: not moving.
  assert.equal(rei.moving, false);
  assert.equal(verm.moving, false);
  // the only difference is PROVENANCE, and it lives in data, not in a colour
  assert.equal(rei.source, "walk");
  assert.equal(verm.source, "parcel");
});

test("publicResidents: someone mid-walk is the one genuinely different state", () => {
  const ledger = `- 2026-08-04T00:00:00.000Z · rei · from 0,0 · toward 900000,0 · at 100.0000\n`;
  const { departures } = parseWalkLedger(ledger);
  const [rei] = publicResidents(["rei"], { world, departures, at: 100.5 });
  assert.equal(rei.moving, true);
  assert.ok(rei.remaining_m > 0);
  assert.ok(rei.toward, "a mover has somewhere to be; the still do not");
});

test("publicResidents: a world with no porch still omits the unplaced, and never duplicates", () => {
  // This fixture has no quay mark, so there is no porch to stand on and the
  // pre-2026-08-18 answer is unchanged — which is the property being pinned:
  // the default is READ FROM THE RECORD, not held in this module.
  const rows = publicResidents(["stranger", "rei", "rei"], { world, departures: [] });
  assert.deepEqual(rows.map((r) => r.handle), ["rei"]);
});

// ── household grain (ruled 2026-08-18) ──────────────────────────────────────
//
// The Rook case, from issue #1864: rook-of-garrison holds no parcel and reads
// homeless, while sol-of-garrison holds the-heart-house-parcel and the two are
// one declared household. The defect was that ground resolved at HANDLE grain.

const garrison = {
  households: { "rook-of-garrison": "the-garrison", "sol-of-garrison": "the-garrison" },
  marks: [{ id: "the-town/the-quay", by: "the-town", household: "the-town", kind: "sited", at: { x: 1390, y: 5665 } }],
  parcels: [{
    id: "sol-of-garrison/the-heart-house-parcel", household: "sol-of-garrison",
    at: { x: -1375, y: -2550 }, extent: { w: 25, h: 25 },
  }],
};

test("household grain: a sibling handle reads the family's ground, and SAYS it is the family's", () => {
  const rook = homeOf("rook-of-garrison", garrison);
  assert.equal(rook.placed, true, "rook read homeless while his household held ground — #1864");
  assert.equal(rook.mark_id, "sol-of-garrison/the-heart-house-parcel");
  assert.equal(rook.via, "household", "a resident on a sibling's ground must be able to see that is what happened");
  assert.equal(rook.household, "the-garrison");
  assert.match(sourceLabel(rook), /household's ground/);

  // and the holder's own read is unchanged in every field that decides anything
  const sol = homeOf("sol-of-garrison", garrison);
  assert.equal(sol.via, "own");
  assert.equal(sol.mark_id, "sol-of-garrison/the-heart-house-parcel");
  assert.equal(sol.x, -1375);
});

test("household grain: the handle's OWN parcel wins over the household's, deterministically", () => {
  const w = {
    ...garrison,
    parcels: [
      { id: "sol-of-garrison/the-heart-house-parcel", household: "sol-of-garrison", at: { x: -1375, y: -2550 }, extent: { w: 25, h: 25 } },
      { id: "rook-of-garrison/the-rook-parcel", household: "rook-of-garrison", at: { x: 10, y: 20 }, extent: { w: 25, h: 25 } },
    ],
  };
  const rook = homeOf("rook-of-garrison", w);
  assert.equal(rook.via, "own");
  assert.equal(rook.mark_id, "rook-of-garrison/the-rook-parcel");
  // and the pick is legible: the whole holding is on the answer, own first
  assert.deepEqual(rook.household_parcels, ["rook-of-garrison/the-rook-parcel", "sol-of-garrison/the-heart-house-parcel"]);
  assert.equal(parcelsFor("rook-of-garrison", w).length, 2);
});

test("REGISTRY LAG NEVER BLOCKS: with no projection, both resolve as their own solo households", () => {
  // households-project.mjs's own law. This is the control for the test above —
  // it must go RED if household grain leaks in without a declaration behind it.
  const unregistered = { ...garrison, households: undefined,
    parcels: [{ id: "sol-of-garrison/the-heart-house-parcel", household: "sol-of-garrison", at: { x: -1375, y: -2550 }, extent: { w: 25, h: 25 } }] };
  assert.equal(homeOf("rook-of-garrison", unregistered).placed, false, "an undeclared pair is not a household");
  assert.equal(homeOf("sol-of-garrison", unregistered).placed, true, "the holder is unaffected either way");
  assert.equal(householdOf("rook-of-garrison", unregistered), "rook-of-garrison");
});

test("KEITH'S CASE re-read green: a parcel-holding single-handle household is unchanged", () => {
  const keith = {
    households: { keith: "solo:keith" },
    marks: [],
    parcels: [{ id: "keith/the-shard-house-by-the-basement-door-parcel", household: "keith", at: { x: 3975, y: -400 }, extent: { w: 25, h: 25 } }],
  };
  const here = homeOf("keith", keith);
  assert.equal(here.placed, true);
  assert.equal(here.source, "parcel");
  assert.equal(here.via, "own");
  assert.deepEqual({ x: here.x, y: here.y, mark_id: here.mark_id },
    { x: 3975, y: -400, mark_id: "keith/the-shard-house-by-the-basement-door-parcel" });
  // one solo household must never absorb another's ground
  assert.equal(homeOf("stranger", keith).placed, false);
});

test("the claiming law is untouched: this changes READING, never rights", () => {
  // parcelsFor answers with what a household HOLDS; it never mints a holding.
  // A handle with no household ground gets an empty list, not a borrowed one.
  assert.deepEqual(parcelsFor("outsider", garrison), []);
  assert.equal(parcelFor("outsider", garrison), null);
});

// ── the porch (ruled 2026-08-18) ────────────────────────────────────────────

test("the porch is READ FROM THE RECORD — no quay mark, no default", () => {
  assert.deepEqual(porchOf({ marks: [] }), { ...NOWHERE });
  assert.deepEqual(porchOf({ marks: [{ id: QUAY_MARK_ID, kind: "sited", at: { x: null, y: 3 } }] }), { ...NOWHERE },
    "a quay without a coordinate is an absent input, and absent inputs are disclosed, never substituted for");
});

test("the porch is DECLARED, never smuggled: an unplaced resident is placed AND says why", () => {
  const here = whereIs("adam-rhys", { world: garrison, departures: [] });
  assert.equal(here.placed, true, "a third of the roll was absent from the map with nothing saying so");
  assert.deepEqual({ x: here.x, y: here.y }, { x: 1390, y: 5665 }, "the quay's own coordinate, off the record");
  assert.equal(here.source, "quay", "the field that lets a caller tell a default from a choice");
  assert.equal(here.mark_id, QUAY_MARK_ID);
  assert.match(sourceLabel(here, "adam-rhys"), /porch/);
  // THE PROPERTY NOWHERE EXISTED TO PROTECT, now on a field instead of an absence
  assert.notEqual(here.source, "walk", "a placement is not an act its subject performed");
  assert.notEqual(here.source, "parcel", "the porch is not ground; homeOf still says they hold none");
  assert.equal(homeOf("adam-rhys", garrison).placed, false, "no ground was invented for them");
});

test("the porch is the LAST tier — ground and walks both outrank it", () => {
  assert.equal(whereIs("sol-of-garrison", { world: garrison, departures: [] }).source, "parcel");
  assert.equal(whereIs("rook-of-garrison", { world: garrison, departures: [] }).source, "parcel",
    "household ground outranks the porch — otherwise D2 would be undone by D1");
  const { departures } = parseWalkLedger(`- 2026-08-18T00:00:00.000Z · adam-rhys · from 0,0 · toward 500,500 · at 100.0000\n`);
  assert.equal(whereIs("adam-rhys", { world: garrison, departures, at: 200 }).source, "walk");
});

test("publicResidents: the porch puts the unplaced ON the list, labelled", () => {
  const rows = publicResidents(["sol-of-garrison", "rook-of-garrison", "adam-rhys"], { world: garrison, departures: [] });
  assert.deepEqual(rows.map((r) => r.source), ["parcel", "parcel", "quay"]);
  assert.equal(rows.length, 3, "nobody is dropped in silence");
  assert.ok(rows.every((r) => r.moving === false), "standing is standing however we learned it");
});
