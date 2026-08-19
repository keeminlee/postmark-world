#!/usr/bin/env node
// walk.test.mjs — the movement ledger's grammar and the derived-position law.
//   node --test tools/walk.test.mjs
//
// What must hold: position is a PURE function of (record, clock). Same inputs,
// same answer, forever, in any clone. Nothing en-route is stored, so these tests
// pass a clock in rather than reading one.

import test from "node:test";
import assert from "node:assert/strict";
import {
  fractionalCrossing, formatDeparture, parseWalkLedger, currentDeparture,
  positionAt, positionsAt, DEPARTURE_RE, publicWalkers,
  WALK_M_PER_CROSSING, CROSSING_EPOCH_UTC, CROSSING_MS,
  WALK_ARRIVALS, WALK_ARRIVAL_DEFAULT, isWalkArrival, extentForArrival,
} from "./walk.mjs";

const D = (o) => ({ iso: "2026-07-27T00:00:00.000Z", targetExtent: null, targetMarkId: null, ...o });

test("the fractional clock's integer part IS the crossing number", () => {
  // The engine's currentCrossing is floor((now - epoch)/12h); ours must agree,
  // or a walker's clock and the world's fog run on different time.
  for (const n of [0, 1, 7, 90]) {
    const t = CROSSING_EPOCH_UTC + n * CROSSING_MS + CROSSING_MS / 3;
    assert.equal(Math.floor(fractionalCrossing(t)), n, `crossing ${n}`);
  }
  assert.equal(fractionalCrossing(CROSSING_EPOCH_UTC), 0);
  assert.equal(fractionalCrossing(CROSSING_EPOCH_UTC + CROSSING_MS / 2), 0.5, "half a crossing");
  assert.equal(fractionalCrossing(CROSSING_EPOCH_UTC - 99999), 0, "before the epoch clamps at 0");
});

test("position is a pure function of record and clock — same inputs, same answer", () => {
  const dep = D({ handle: "jetto-of-starforge", from: { x: 0, y: 0 }, toward: { x: 15000, y: 0 }, at: 10 });
  const a = positionAt(dep, 10.5), b = positionAt(dep, 10.5);
  assert.deepEqual(a, b, "no hidden state, no clock read inside");
  // Half a crossing at 15 km/crossing = 7.5 km along a 15 km leg = halfway.
  assert.equal(a.x, 7500);
  assert.equal(a.y, 0);
  assert.equal(a.arrived, false);
});

test("the pace dial is 15 km per crossing, and interpolation is linear along the leg", () => {
  const dep = D({ handle: "h", from: { x: 0, y: 0 }, toward: { x: 0, y: WALK_M_PER_CROSSING }, at: 0 });
  assert.equal(positionAt(dep, 0).y, 0, "at departure, at the start");
  assert.equal(positionAt(dep, 0.25).y, WALK_M_PER_CROSSING * 0.25);
  assert.equal(positionAt(dep, 1).y, WALK_M_PER_CROSSING, "one crossing = one dial-length");
  assert.equal(positionAt(dep, 1).arrived, true);
});

test("raw-coordinate arrival clamps at the point — never overshoots, needs no record", () => {
  const dep = D({ handle: "h", from: { x: 0, y: 0 }, toward: { x: 1000, y: 0 }, at: 5 });
  const late = positionAt(dep, 500); // absurdly far in the future
  assert.equal(late.x, 1000, "clamped at the destination, not past it");
  assert.equal(late.arrived, true);
  assert.equal(late.remainingM, 0);
  assert.equal(late.etaCrossings, 0);
});

test("mark arrival is containment — stops at the target extent, not its centre", () => {
  const dep = D({
    handle: "h", from: { x: 0, y: 0 }, toward: { x: 1000, y: 0 }, at: 0,
    targetExtent: { w: 200, h: 100 }, targetMarkId: "h/a-parcel",
  });
  const almost = positionAt(dep, 899 / WALK_M_PER_CROSSING);
  assert.equal(almost.arrived, false);
  assert.equal(almost.x, 899);
  assert.equal(almost.remainingM, 1);

  const entered = positionAt(dep, 900 / WALK_M_PER_CROSSING);
  assert.equal(entered.arrived, true, "the west edge at x=900 is inside the target rect");
  assert.equal(entered.x, 900, "arrival clamps at the first contained point");
  assert.equal(entered.legM, 900, "the walked leg ends at the footprint edge");
  assert.equal(entered.remainingM, 0);

  const late = positionAt(dep, 10);
  assert.equal(late.x, 900, "the resident does not keep walking toward the centre after arrival");
});

test("walking to ground you already occupy arrives in place", () => {
  const dep = D({
    handle: "h", from: { x: 950, y: 0 }, toward: { x: 1000, y: 0 }, at: 0,
    targetExtent: { w: 200, h: 100 }, targetMarkId: "h/a-parcel",
  });
  const p = positionAt(dep, 0);
  assert.equal(p.arrived, true);
  assert.equal(p.standing, true);
  assert.deepEqual([p.x, p.y], [950, 0], "containment prevents a needless walk to the centre");
  assert.equal(p.legM, 0);
});

test("a zero-distance departure is 'stand here' — the stop", () => {
  const stop = D({ handle: "h", from: { x: 42, y: -7 }, toward: { x: 42, y: -7 }, at: 3 });
  const p = positionAt(stop, 99);
  assert.equal(p.standing, true);
  assert.equal(p.arrived, true);
  assert.deepEqual([p.x, p.y], [42, -7], "standing where you stopped");
  assert.equal(p.legM, 0, "no leg, so no division by zero");
});

test("supersede is latest-wins, not mutation", () => {
  const one = D({ handle: "h", from: { x: 0, y: 0 }, toward: { x: 10000, y: 0 }, at: 0 });
  const two = D({ handle: "h", from: { x: 5000, y: 0 }, toward: { x: 5000, y: 9000 }, at: 1, iso: "2026-07-27T12:00:00.000Z" });
  const cur = currentDeparture([one, two], "h");
  assert.equal(cur, two, "the last recorded departure governs");
  // The superseding record starts from the derived position at the time — which
  // is why the earlier leg needs no editing or closing.
  assert.equal(positionAt(cur, 1).x, 5000);
  assert.equal(currentDeparture([one, two], "nobody"), null);
});

test("the ledger round-trips: format → parse → identical fields", () => {
  const dep = { handle: "jetto-of-starforge", from: { x: -12.5, y: 3480 }, toward: { x: 615, y: 3150 },
                at: 91.2345, targetExtent: { w: 25, h: 30 },
                targetMarkId: "the-town/the-town-centre", iso: "2026-07-27T22:10:00.000Z" };
  const line = formatDeparture(dep);
  assert.match(line, DEPARTURE_RE, "the line matches its own grammar");
  const { departures, unrecognized } = parseWalkLedger(`# walk ledger\n\n${line}\n`);
  assert.equal(unrecognized.length, 0);
  const p = departures[0];
  assert.equal(p.handle, dep.handle);
  assert.deepEqual(p.from, dep.from);
  assert.deepEqual(p.toward, dep.toward);
  assert.equal(p.at, 91.2345);
  assert.deepEqual(p.targetExtent, { w: 25, h: 30 }, "the arrival rect rides the immutable departure");
  assert.equal(p.targetMarkId, "the-town/the-town-centre", "intent is kept alongside the coords");
});

test("a departure with no mark target round-trips with targetMarkId null", () => {
  const line = formatDeparture({ handle: "h", from: { x: 1, y: 2 }, toward: { x: 3, y: 4 }, at: 1, iso: "2026-07-27T00:00:00.000Z" });
  assert.ok(!line.includes(" · to "), "no trailing intent clause when there was no mark");
  assert.ok(!line.includes(" · within "), "raw coordinates carry no arrival rect");
  assert.equal(parseWalkLedger(line).departures[0].targetExtent, null);
  assert.equal(parseWalkLedger(line).departures[0].targetMarkId, null);
});

test("malformed lines are reported, not silently dropped", () => {
  const good = formatDeparture({ handle: "h", from: { x: 0, y: 0 }, toward: { x: 1, y: 1 }, at: 0, iso: "2026-07-27T00:00:00.000Z" });
  const { departures, unrecognized } = parseWalkLedger(
    `- this is not a departure\n${good}\n- 2026 · h · from x,y · toward 1,1 · at 0\n`);
  assert.equal(departures.length, 1, "the good line parses");
  assert.equal(unrecognized.length, 2, "both bad lines surface rather than vanishing");
});

test("positionsAt gives one position per resident, latest departure only", () => {
  const deps = [
    D({ handle: "a", from: { x: 0, y: 0 }, toward: { x: 15000, y: 0 }, at: 0 }),
    D({ handle: "b", from: { x: 0, y: 0 }, toward: { x: 0, y: 0 }, at: 0 }),
    D({ handle: "a", from: { x: 100, y: 0 }, toward: { x: 200, y: 0 }, at: 1 }),
  ];
  const out = positionsAt(deps, 1);
  assert.deepEqual(Object.keys(out).sort(), ["a", "b"]);
  assert.equal(out.a.x, 100, "a's LATEST departure governs, not the first");
  assert.equal(out.b.standing, true);
});

test("publicWalker is the single writer of the walker vocabulary", () => {
  // The office door and the spectator both publish walkers. When each wrote its
  // own mapping they drifted immediately — the spectator emitted `remainingM`
  // while the office emitted `remaining_m`, so the viewer read undefined and drew
  // a walker with no distance. Both now map through this, and this test pins the
  // words so a rename cannot silently break one reader and not the other.
  const dep = D({ handle: "h", from: { x: 0, y: 0 }, toward: { x: 15000, y: 0 }, at: 10,
                  targetMarkId: "the-town/the-town-centre" });
  const [w] = publicWalkers([dep], 10.5);
  assert.deepEqual(Object.keys(w).sort(),
    ["arrived", "eta_crossings", "handle", "mark_id", "remaining_m", "standing", "toward", "x", "y"],
    "the published vocabulary is snake_case and exactly these keys");
  assert.equal(w.remaining_m, 7500, "half of a 15 km leg remains");
  assert.equal(w.mark_id, "the-town/the-town-centre", "intent is published, not just coordinates");
  assert.deepEqual(w.toward, { x: 15000, y: 0 });
  // and the private/derived shape keeps its own camelCase — the mapping is real
  const raw = positionAt(dep, 10.5);
  assert.equal(raw.remainingM, 7500);
  assert.equal(raw.remaining_m, undefined, "the derived shape is NOT the published shape");
});

test("published numbers are clean — no floating-point tails in the API", () => {
  // etaCrossings was computed as round1(x * 10) / 10, i.e. two divisions, and
  // 107/10/10 is not 1.07 in binary floating point: the walkers API published
  // eta_crossings: 1.0699999999999998. Anything a reader displays must round in
  // one step.
  for (const remaining of [15999, 10749, 8499, 21249, 18999, 7, 1, 14999]) {
    const dep = D({ handle: "h", from: { x: 0, y: 0 }, toward: { x: remaining, y: 0 }, at: 0 });
    const eta = positionAt(dep, 0).etaCrossings;
    assert.equal(eta, Number(eta.toFixed(2)), `eta ${eta} for ${remaining} m must be exact at 2 dp`);
  }
  const [w] = publicWalkers([D({ handle: "h", from: { x: 0, y: 0 }, toward: { x: 15999, y: 0 }, at: 0 })], 0);
  assert.equal(w.eta_crossings, 1.07);
});

test("pace: a departure may carry its own stride — the vessel's law (Keemin, 2026-08-06)", () => {
  // TC (0,0) → Pando Peak (−95458,−95458) ≈ 135 km. The ruling: the boat makes
  // it in 4h = a third of a crossing → pace ≈ 405 km/crossing.
  const line = "- 2026-08-08T18:00:00.000Z · the-post-office · from 0,0 · toward -95458,-95458 · at 200 · within 25,25 · to vermillion/the-pando-peak-parcel · pace 405";
  const { departures, unrecognized } = parseWalkLedger(line);
  assert.equal(unrecognized.length, 0, "a paced line parses");
  const dep = departures[0];
  assert.equal(dep.pace, 405);
  assert.equal(dep.targetMarkId, "vermillion/the-pando-peak-parcel");

  // A third of a crossing later the vessel has covered its ~135 km leg.
  const there = positionAt(dep, 200 + 1 / 3);
  assert.equal(there.arrived, true, "four hours at pace 405 completes TC→Pando");
  // Mid-run it is genuinely en route, far beyond any walker's reach.
  const mid = positionAt(dep, 200 + 1 / 6);
  assert.equal(mid.arrived, false);
  assert.ok(Math.hypot(mid.x, mid.y) > 60000, "two hours in, the boat is ~67 km out");

  // And the town dial is untouched: the same line without pace derives at 15.
  const walker = parseWalkLedger(line.replace(" · pace 405", "")).departures[0];
  assert.equal(walker.pace, null);
  const slow = positionAt(walker, 200 + 1 / 3);
  assert.equal(slow.arrived, false, "a walker does not board by accident");
  assert.ok(Math.hypot(slow.x, slow.y) < 6000, "a third of a crossing on foot is 5 km");
});

// ── to: centre (issue #5 §1) ────────────────────────────────────────────────
// The seam's own arithmetic is the fixture. vermillion/vermillion-view-peak is
// centred (−96858, −95458) with extent 721, so its east edge falls at
// −96858 + 721/2 = −96497.5 — the metre jetto-of-starforge actually landed on,
// twice, and the metre from which any 6 m claim straddles the line.
const VIEW_PEAK = { at: { x: -96858, y: -95458 }, extent: { w: 721, h: 721 } };
const VIEW_PEAK_EAST_EDGE = -96497.5;

test("arrival-on-entry is the default, and it is what puts you on the fence", () => {
  // Not a bug — the documented law, pinned so the centre variant cannot be
  // mistaken for a change to it. Walking in from the east stops at the boundary.
  const dep = D({
    handle: "jetto-of-starforge", from: { x: -90000, y: -95458 }, toward: VIEW_PEAK.at, at: 0,
    targetExtent: VIEW_PEAK.extent, targetMarkId: "vermillion/vermillion-view-peak",
  });
  const there = positionAt(dep, 99);
  assert.equal(there.arrived, true);
  assert.equal(there.x, VIEW_PEAK_EAST_EDGE, "entry arrival lands exactly on the east edge");
  assert.equal(WALK_ARRIVAL_DEFAULT, "rim", "and rim is what a walk gets when nobody asks (renamed from entry, 2026-08-19)");
});

test("to: centre arrives at the target's centre, not its fence (issue #5 §1)", () => {
  // The SAME leg, recorded the centre way: no `within`, so the interpolation
  // runs all the way to `toward` — which is the mark's centre.
  const dep = D({
    handle: "jetto-of-starforge", from: { x: -90000, y: -95458 }, toward: VIEW_PEAK.at, at: 0,
    targetExtent: extentForArrival("centre", VIEW_PEAK.extent),
    targetMarkId: "vermillion/vermillion-view-peak",
  });
  const there = positionAt(dep, 99);
  assert.equal(there.arrived, true);
  assert.equal(there.x, VIEW_PEAK.at.x, "centre arrival lands on the centre");
  assert.equal(there.y, VIEW_PEAK.at.y);
  assert.notEqual(there.x, VIEW_PEAK_EAST_EDGE, "and specifically NOT on the fence");
  // Intent survives the omission: the line still says what was walked to.
  assert.equal(dep.targetMarkId, "vermillion/vermillion-view-peak");
});

test("to: centre lets a resident standing on the fence walk IN — the seam's cost, paid", () => {
  // This is the case entry arrival cannot serve: you are already inside the
  // target's extent, so containment says "arrived" and you never move — which
  // is exactly why a claim left where you stand overhangs the boundary.
  const stuck = D({
    handle: "h", from: { x: VIEW_PEAK_EAST_EDGE, y: -95458 }, toward: VIEW_PEAK.at, at: 0,
    targetExtent: VIEW_PEAK.extent, targetMarkId: "vermillion/vermillion-view-peak",
  });
  const nowhere = positionAt(stuck, 99);
  assert.equal(nowhere.x, VIEW_PEAK_EAST_EDGE, "entry arrival re-arrives you where you already stand");
  assert.equal(nowhere.legM, 0);

  const walkIn = D({
    handle: "h", from: { x: VIEW_PEAK_EAST_EDGE, y: -95458 }, toward: VIEW_PEAK.at, at: 0,
    targetExtent: extentForArrival("centre", VIEW_PEAK.extent), targetMarkId: "vermillion/vermillion-view-peak",
  });
  const arrived = positionAt(walkIn, 99);
  assert.equal(arrived.x, VIEW_PEAK.at.x, "centre walks you off the fence and into the mark");
  assert.equal(arrived.legM, 361, "360.5 m from the east edge to the centre, rounded");
});

test("extentForArrival is the one place that knows what an arrival means", () => {
  assert.deepEqual(extentForArrival("rim", VIEW_PEAK.extent), VIEW_PEAK.extent, "rim freezes the extent");
  assert.equal(extentForArrival("center", VIEW_PEAK.extent), null, "center records no within");
  assert.deepEqual(extentForArrival(undefined, VIEW_PEAK.extent), VIEW_PEAK.extent, "absent means rim");
  assert.equal(extentForArrival("rim", undefined), null, "no mark extent, nothing to freeze");
  // The legacy pair stays VALID — an older office deploy passing "entry"/"centre"
  // against a newer world clone must not bounce (version-skew guard, 2026-08-19).
  assert.deepEqual(extentForArrival("entry", VIEW_PEAK.extent), VIEW_PEAK.extent, "legacy entry = rim");
  assert.equal(extentForArrival("centre", VIEW_PEAK.extent), null, "legacy centre = center");
  assert.deepEqual(WALK_ARRIVALS, ["rim", "center", "entry", "centre"]);
  assert.ok(isWalkArrival("rim") && isWalkArrival("center"), "the canon pair");
  assert.ok(isWalkArrival("entry") && isWalkArrival("centre"), "the legacy pair, still admitted");
  assert.ok(!isWalkArrival("middle"), "an unknown arrival is not silently accepted");
});

test("to: centre changes the ledger's within, never its grammar", () => {
  const common = { handle: "h", from: { x: -90000, y: -95458 }, toward: VIEW_PEAK.at,
                   at: 12.5, targetMarkId: "vermillion/vermillion-view-peak", iso: "2026-08-09T12:00:00.000Z" };
  const entry = formatDeparture({ ...common, targetExtent: extentForArrival("entry", VIEW_PEAK.extent) });
  const centre = formatDeparture({ ...common, targetExtent: extentForArrival("centre", VIEW_PEAK.extent) });
  for (const line of [entry, centre]) assert.match(line, DEPARTURE_RE, "both arrivals are the SAME grammar");
  assert.ok(entry.includes(" · within 721,721"), "an entry walk freezes the target's extent");
  assert.ok(!centre.includes(" · within "), "a centre walk records none — that IS the variant");
  assert.ok(centre.includes(" · to vermillion/vermillion-view-peak"),
    "the departure line's `to` still carries the target either way");
  // And both round-trip to a derivation that agrees with the line.
  assert.equal(positionAt(parseWalkLedger(entry).departures[0], 99).x, VIEW_PEAK_EAST_EDGE);
  assert.equal(positionAt(parseWalkLedger(centre).departures[0], 99).x, VIEW_PEAK.at.x);
});

// ── the invariants worth protecting (issue #5, "not defects") ────────────────
// Named so a later fix cannot quietly cost them. These are jetto-of-starforge's
// list, made falsifiable.

test("INVARIANT position-derives-from-ledger-and-clock: a resumed session is unaffected", () => {
  // "My session was context-compacted mid-walk and it made no difference; I
  // resumed 993 m further along." Nothing en route is stored, so forgetting
  // everything but the ledger text and the clock must reproduce the walk exactly.
  const line = formatDeparture({
    handle: "jetto-of-starforge", from: { x: 0, y: 0 }, toward: { x: 15000, y: 0 },
    at: 100, targetMarkId: null, iso: "2026-08-09T00:00:00.000Z",
  });
  const before = positionAt(parseWalkLedger(line).departures[0], 100.4);
  // …the session dies here. A brand-new reader, holding only the text and a clock:
  const t993 = 100.4 + 993 / WALK_M_PER_CROSSING;
  const after = positionAt(parseWalkLedger(line).departures[0], t993);
  assert.equal(Math.round(after.x - before.x), 993, "the walker advanced exactly what the clock bought");
  assert.equal(after.travelledM - before.travelledM, 993);
  // and re-deriving the ORIGINAL instant still gives the original answer
  assert.deepEqual(positionAt(parseWalkLedger(line).departures[0], 100.4), before,
    "the past is not rewritten by having been read again");
});

test("INVARIANT within-frozen-at-departure: a mark that later resizes cannot rewrite an arrival", () => {
  // "a mark that later moves, resizes, or retires cannot rewrite where someone
  // arrived" (walk.mjs:42-44). The proof that the freeze is real: the SAME
  // toward with a different recorded `within` arrives somewhere else, so arrival
  // is governed by the line's own extent and never by a live lookup.
  const asItWas = D({ handle: "h", from: { x: -90000, y: -95458 }, toward: VIEW_PEAK.at, at: 0,
                      targetExtent: { w: 721, h: 721 }, targetMarkId: "vermillion/vermillion-view-peak" });
  const asItWouldBe = D({ handle: "h", from: { x: -90000, y: -95458 }, toward: VIEW_PEAK.at, at: 0,
                          targetExtent: { w: 100, h: 100 }, targetMarkId: "vermillion/vermillion-view-peak" });
  assert.equal(positionAt(asItWas, 99).x, VIEW_PEAK_EAST_EDGE, "the extent recorded at departure governs");
  assert.equal(positionAt(asItWouldBe, 99).x, -96808, "a different frozen extent is a different arrival");
  // The departure carries its own answer: no marks are in scope in this file at
  // all, and the derivation still resolves. That is the freeze, structurally.
  assert.equal(parseWalkLedger(formatDeparture({ ...asItWas, iso: "2026-08-09T00:00:00.000Z" }))
    .departures[0].targetExtent.w, 721, "the extent rides the line, not a lookup");
});
