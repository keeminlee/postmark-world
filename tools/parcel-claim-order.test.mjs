#!/usr/bin/env node
// parcel-claim-order.test.mjs — THE CAP REFUSES THE SAME PARCEL WHATEVER ORDER
// THE MARKS ARRIVE IN.
//
//   node --test --test-timeout=180000 tools/parcel-claim-order.test.mjs
//
// ── WHAT IS UNDER TEST ──────────────────────────────────────────────────────
//
// The gate refuses a parcel when its household ALREADY HOLDS the cap, so which
// parcel is refused is decided by the order the loop runs in. That order was
// `byId`'s insertion order, which is `loadMarks`' `readdirSync` walk — the
// filesystem's directory listing. A household over the cap lost whichever of its
// parcels the walk reached fourth, and an unrelated mark added anywhere in the
// tree could move that to a different one on the next crossing.
//
// It was unreachable while `WORLD/households.json` was 33 days stale, because a
// stale registry files a family's handles as strangers and no household is over
// the cap at all. It becomes reachable the moment the registry is refreshed —
// which is the office change this travels with.
//
// ── THE LAW, VERBATIM (tools/marks-fold.mjs, the cap's own comment) ──────────
//
//   "The parcel-claim cap (Keemin's ruling, 2026-07-30): a HOUSEHOLD may CLAIM
//    at most 3 parcels. Forward law — holdings dated on/before the law date
//    stand as prior estate (the Reeves' four, the founder household's five),
//    they simply cannot claim more."
//
// Both halves of that sentence are about WHEN. "Prior estate stands" and "may
// claim at most 3" only mean anything against an order in time, so the order the
// gate reads them in is the order they were claimed. What this file asserts is
// that the verdict is a function of the record: shuffle the array and the SAME
// parcel is refused.
//
// ── THE CAN-FAIL FLIP ───────────────────────────────────────────────────────
//
// F3 is the control. It replays the identical inputs through the ordering the
// fold used BEFORE this change — the array as given — and asserts that ordering
// DOES answer differently on the same fixture. Without it, F1 and F2 are two
// assertions that might both be satisfied by any implementation at all, and a
// permutation test whose fixture cannot expose a permutation is a green light
// wired to nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, parcelsInClaimOrder, PARCEL_CLAIM_CAP, PARCEL_CAP_LAW_DATE } from "./marks-fold.mjs";

/** A parcel at a distinct x so nothing overlaps and only the cap can refuse. */
const P = (id, by, x, date) => ({
  id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y: 0 }, extent: { w: 25, h: 25 }, date, body: "b",
});

// One credential household, four handles, four post-law claims. `d` is the
// FOURTH by date and must be the one refused however the array is shuffled.
const HANDLES = ["ha", "hb", "hc", "hd"];
const HOUSEHOLDS = Object.fromEntries(HANDLES.map((h) => [h, "gh:99"]));
const CLAIMS = [
  P("ha/first", "ha", 0, "2026-08-01T00:00:00Z"),
  P("hb/second", "hb", 100, "2026-08-02T00:00:00Z"),
  P("hc/third", "hc", 200, "2026-08-03T00:00:00Z"),
  P("hd/fourth", "hd", 300, "2026-08-04T00:00:00Z"),
];
const REFUSED = "hd/fourth";

const capErrors = (state) => state.errors.filter((e) => /parcel claim capped/.test(e.error)).map((e) => e.mark);

/** Every permutation of four, so "regardless of order" is asserted and not sampled. */
function permutations(xs) {
  if (xs.length <= 1) return [xs];
  const out = [];
  for (let i = 0; i < xs.length; i += 1)
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)]))
      out.push([xs[i], ...rest]);
  return out;
}

test("F1 · the fourth parcel BY CLAIM DATE is the one refused, in all 24 arrival orders", () => {
  const perms = permutations(CLAIMS);
  assert.equal(perms.length, 24, "the fixture must actually cover every order");
  for (const marks of perms) {
    const state = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households: HOUSEHOLDS });
    assert.deepEqual(capErrors(state), [REFUSED],
      `arrival order ${marks.map((m) => m.id).join(" ")} refused something other than the latest claim`);
    assert.equal(state.parcels.length, PARCEL_CLAIM_CAP, "and exactly the cap stands");
    assert.deepEqual(state.parcels.map((p) => p.id), ["ha/first", "hb/second", "hc/third"],
      "the three that stand are the three earliest, and they stand in claim order");
  }
});

test("F2 · prior estate is counted in claim order too — a post-law claim behind four pre-law ones is refused", () => {
  // The Reeves' shape, and the one the walk got wrong on the real tree: four
  // pre-law parcels and one post-law claim. Pre-law claims are never refused,
  // but they are COUNTED, so the post-law one is over the cap — and it is over
  // the cap whether the walk happens to reach it first or last.
  const estate = ["ra", "rb", "rc", "rd"].map((h, i) => P(`${h}/estate`, h, i * 100, "2026-07-24"));
  const late = P("re/late", "re", 900, "2026-09-08T04:12:17.104Z");
  const households = Object.fromEntries([...estate.map((p) => p.household), "re"].map((h) => [h, "gh:77"]));

  for (const marks of [[...estate, late], [late, ...estate], [estate[0], late, ...estate.slice(1)]]) {
    const state = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households });
    assert.deepEqual(capErrors(state), ["re/late"],
      `arrival order ${marks.map((m) => m.id).join(" ")} — the post-law claim must be the refusal, never a pre-law one`);
    assert.equal(state.parcels.length, 4, "prior estate stands whole");
  }
  // And the law's own words hold: nothing dated on or before the law date is
  // ever the refusal, whatever the count.
  assert.ok(estate.every((p) => String(p.date) <= PARCEL_CAP_LAW_DATE));
});

test("F3 · THE FLIP — the ordering the fold used before this change answers differently on the same fixture", () => {
  // The control. `parcelsInClaimOrder` is what F1 and F2 rest on; this replays
  // the gate over the array AS GIVEN, which is what `byId.values()` yielded
  // before, and asserts that order really can refuse a different parcel. If this
  // passes, F1 proves nothing about ordering — it would be satisfied by any
  // implementation, including the one that was there.
  const asGiven = [CLAIMS[3], CLAIMS[0], CLAIMS[1], CLAIMS[2]];  // the latest claim walked first
  const held = new Map();
  const refusedByArrival = [];
  for (const mk of asGiven) {
    const key = HOUSEHOLDS[mk.household];
    const n = held.get(key) ?? 0;
    if (String(mk.date) > PARCEL_CAP_LAW_DATE && n >= PARCEL_CLAIM_CAP) { refusedByArrival.push(mk.id); continue; }
    held.set(key, n + 1);
  }
  assert.notDeepEqual(refusedByArrival, [REFUSED],
    "if arrival order refuses the same parcel as claim order on this fixture, the fixture cannot expose the defect");
  assert.deepEqual(refusedByArrival, ["hc/third"],
    "arrival order refuses whichever claim the walk reaches fourth — here the EARLIEST of the four");

  // And the sort itself is what closes the gap: the same array, ordered.
  const byId = new Map(asGiven.map((m) => [m.id, m]));
  assert.deepEqual(parcelsInClaimOrder(byId).map((m) => m.id),
    ["ha/first", "hb/second", "hc/third", "hd/fourth"]);
});

test("F4 · ties break on id, so the verdict is a function of the record and of nothing else", () => {
  // Two claims stamped at the same instant. Something has to decide, and it must
  // be something written down — never the directory walk.
  const same = "2026-08-05T00:00:00Z";
  const marks = [
    P("ha/one", "ha", 0, "2026-08-01T00:00:00Z"),
    P("hb/two", "hb", 100, "2026-08-02T00:00:00Z"),
    P("hc/zulu", "hc", 200, same),
    P("hd/alpha", "hd", 300, same),
  ];
  const first = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households: HOUSEHOLDS });
  const shuffled = fold({ marks: [...marks].reverse(), terrain: { features: [] }, stakes: [], tick: 1, households: HOUSEHOLDS });
  // The tie breaks on the WHOLE id, handle included — `hd/alpha` sorts after
  // `hc/zulu` because `hd` sorts after `hc`, and the slug never gets a say. That
  // is worth writing down rather than leaving to be rediscovered: a reader who
  // assumes the slug decides will predict the wrong parcel, which is exactly the
  // mistake this assertion caught when it was first written the other way round.
  assert.deepEqual(capErrors(first), ["hd/alpha"],
    "`hd/alpha` sorts last by id among the tied claims, so it is the fourth by the record and it is the refusal");
  assert.deepEqual(capErrors(shuffled), capErrors(first),
    "and reversing the array does not move it");
});
