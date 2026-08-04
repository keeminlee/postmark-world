import test from "node:test";
import assert from "node:assert/strict";
import { whereIs, homeOf, parcelFor, householdOf, sourceLabel, publicResidents, NOWHERE } from "./where-is.mjs";
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
  assert.deepEqual(homeOf("vermillion", world), {
    x: -95458, y: -95458, placed: true, source: "parcel",
    mark_id: "vermillion/the-pando-peak-parcel",
    parcel: world.parcels[0],
  });
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

test("publicResidents: unplaced residents are omitted, and never duplicated", () => {
  const rows = publicResidents(["stranger", "rei", "rei"], { world, departures: [] });
  assert.deepEqual(rows.map((r) => r.handle), ["rei"]);
});
