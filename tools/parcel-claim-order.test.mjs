#!/usr/bin/env node
// parcel-claim-order.test.mjs — THE CAP REFUSES THE SAME PARCEL WHATEVER ORDER
// THE MARKS ARRIVE IN, AND A STALE REGISTRY REFUSES THE CROSSING.
//
//   node --test --test-timeout=180000 tools/parcel-claim-order.test.mjs
//
// ── WHAT IS UNDER TEST ──────────────────────────────────────────────────────
//
// The cap refuses a parcel when its household ALREADY HOLDS the cap, so which
// parcel is refused is decided by the order the loop runs in. That order was
// `byId`'s insertion order, which is `loadMarks`' `readdirSync` walk — the
// filesystem's directory listing. It FAILS OPEN as well as arbitrarily: a
// post-law parcel walked before its household's pre-law ones is admitted at a
// count of zero and the pre-law ones follow ungated, which is how the Reeves
// came to hold five under a cap of three.
//
// It was unreachable while `WORLD/households.json` was 33 days stale, because a
// stale registry files a family's handles as strangers and no household is over
// the cap at all. It becomes reachable the moment the registry is refreshed —
// which is the office lane this travels with.
//
// ── THE LAW, VERBATIM (tools/marks-fold.mjs, the cap's own comment) ──────────
//
//   "The parcel-claim cap (Keemin's ruling, 2026-07-30): a HOUSEHOLD may CLAIM
//    at most 3 parcels. Forward law — holdings dated on/before the law date
//    stand as prior estate (the Reeves' four, the founder household's five),
//    they simply cannot claim more."
//
// Both halves of that sentence are about WHEN, so the order the gate reads them
// in is the order they were claimed. What this file asserts is that the verdict
// is a function of the record: shuffle the array and the SAME parcel is refused.
//
// ── AND THE SECOND CONSTRUCTION (founder, 2026-09-09) ───────────────────────
//
//   "please make sure this incident cannot happen again by construction."
//
// `refuseStaleHouseholds` is that construction: handed the crossing's own pinned
// town sha, a fold or a sweep REFUSES a registry derived from any other tree,
// and refuses an unstamped one. F10 and F11 drive it, unit and crossing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  fold, admitDelta, admissionBase,
  compareClaimOrder, parcelsInClaimOrder, candidatesInClaimOrder, refuseStaleHouseholds,
  PARCEL_CLAIM_CAP, PARCEL_CAP_LAW_DATE, PARCEL_CAP_EXCEPTIONS,
} from "./marks-fold.mjs";
import { settlementSweep } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** A parcel at a distinct x so nothing overlaps and only the cap can refuse. */
const P = (id, by, x, date) => ({
  id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y: 0 }, extent: { w: 25, h: 25 }, date, body: "b",
});

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
const otherErrors = (state) => state.errors.filter((e) => !/parcel claim capped/.test(e.error));

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

test("F2 · REVERSE date order, named because it is the shape that hid the defect", () => {
  // The reviewer's fixture: four post-law parcels in one household handed in
  // reverse date order. Arrival order refuses the FIRST claim; claim order
  // refuses the last. Called out on its own rather than left inside F1's 24
  // because it is the permutation that reads as correct while being wrong.
  const reversed = [...CLAIMS].reverse();
  const state = fold({ marks: reversed, terrain: { features: [] }, stakes: [], tick: 1, households: HOUSEHOLDS });
  assert.deepEqual(capErrors(state), [REFUSED],
    "handed newest-first, the cap must still refuse the NEWEST and never the oldest");
  assert.equal(state.parcels.find((p) => p.id === "ha/first") !== undefined, true,
    "and the oldest claim, which arrival order would have taken, stands");
});

test("F3 · prior estate is counted in claim order too, and the gate no longer FAILS OPEN", () => {
  // The Reeves' shape, and the one the walk got wrong on the real tree: four
  // pre-law parcels and one post-law claim. Pre-law claims are never refused but
  // they are COUNTED, so the post-law one is over the cap — and it must be over
  // the cap whether the walk reaches it first or last. Reached first, the old
  // order admitted it at a count of zero and then let all four pre-law ones
  // through ungated: five parcels under a cap of three, and no error anywhere.
  const estate = ["ra", "rb", "rc", "rd"].map((h, i) => P(`${h}/estate`, h, i * 100, "2026-07-24"));
  const late = P("re/late", "re", 900, "2026-09-08T04:12:17.104Z");
  const households = Object.fromEntries([...estate.map((p) => p.household), "re"].map((h) => [h, "gh:77"]));

  for (const marks of [[...estate, late], [late, ...estate], [estate[0], late, ...estate.slice(1)]]) {
    const state = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households });
    assert.deepEqual(capErrors(state), ["re/late"],
      `arrival order ${marks.map((m) => m.id).join(" ")} — the post-law claim must be the refusal, never a pre-law one`);
    assert.equal(state.parcels.length, 4, "prior estate stands whole");
  }
  assert.ok(estate.every((p) => String(p.date) <= PARCEL_CAP_LAW_DATE),
    "and the law's own words hold: nothing dated on or before the law date is ever the refusal");
});

test("F4 · THE FLIP — the ordering the fold used before this change answers differently on the same fixture", () => {
  // The control. Without it, F1 and F2 are assertions that might be satisfied by
  // any implementation at all, including the one that was there.
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

  const byId = new Map(asGiven.map((m) => [m.id, m]));
  assert.deepEqual(parcelsInClaimOrder(byId).map((m) => m.id),
    ["ha/first", "hb/second", "hc/third", "hd/fourth"]);
});

test("F5 · the order is an INSTANT comparison, so a UTC offset is not read as a later claim", () => {
  // `isValidMarkDate` accepts `2026-07-23T14:30:00+05:30`, whose instant is
  // 09:00Z — EARLIER than `2026-07-23T10:00:00Z`, and a string comparison puts
  // it later. This is the one case where lexicographic order is not merely
  // arbitrary but wrong, and it would arrive silently on somebody's deed.
  const offset = P("ha/offset", "ha", 0, "2026-08-01T14:30:00+05:30");   // 09:00Z
  const utc = P("hb/utc", "hb", 100, "2026-08-01T10:00:00Z");            // 10:00Z
  assert.ok(compareClaimOrder(offset, utc) < 0, "the offset claim is EARLIER and must sort first");
  assert.ok(String(offset.date).localeCompare(String(utc.date)) > 0,
    "…and a string comparison says the opposite, which is what makes this test worth having");

  // and it decides a real refusal: three earlier claims plus these two, cap 3.
  const marks = [
    P("hc/one", "hc", 200, "2026-07-31T00:00:00Z"),
    P("hd/two", "hd", 300, "2026-07-31T01:00:00Z"),
    P("he/three", "he", 400, "2026-07-31T02:00:00Z"),
    utc, offset,
  ];
  const households = Object.fromEntries(["ha", "hb", "hc", "hd", "he"].map((h) => [h, "gh:55"]));
  const state = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households });
  assert.deepEqual(capErrors(state).sort(), ["ha/offset", "hb/utc"].sort(),
    "both over-cap claims are refused here, so the ordering is proven by F5's comparator assertions above");
  assert.ok(compareClaimOrder(offset, utc) < 0);
});

test("F6 · ties break on the whole id, so the verdict is a function of the record and of nothing else", () => {
  const same = "2026-08-05T00:00:00Z";
  const marks = [
    P("ha/one", "ha", 0, "2026-08-01T00:00:00Z"),
    P("hb/two", "hb", 100, "2026-08-02T00:00:00Z"),
    P("hc/zulu", "hc", 200, same),
    P("hd/alpha", "hd", 300, same),
  ];
  // The tie breaks on the WHOLE id, handle included — `hd/alpha` sorts after
  // `hc/zulu` because `hd` sorts after `hc`, and the slug never gets a say. That
  // is worth writing down rather than leaving to be rediscovered: a reader who
  // assumes the slug decides will predict the wrong parcel, which is exactly the
  // mistake this assertion caught when it was first written the other way round.
  const first = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households: HOUSEHOLDS_5() });
  const shuffled = fold({ marks: [...marks].reverse(), terrain: { features: [] }, stakes: [], tick: 1, households: HOUSEHOLDS_5() });
  assert.deepEqual(capErrors(first), ["hd/alpha"],
    "`hd/alpha` sorts last by id among the tied claims, so it is the fourth by the record and it is the refusal");
  assert.deepEqual(capErrors(shuffled), capErrors(first), "and reversing the array does not move it");
});
function HOUSEHOLDS_5() {
  return Object.fromEntries(["ha", "hb", "hc", "hd"].map((h) => [h, "gh:99"]));
}

test("F7 · the OVERLAP rule rides the same loop, and claim order gives it to the earlier claim", () => {
  // Trap (a) from the reviewer: the overlap check is decided by this same loop,
  // so re-ordering it re-decides who wins a collision. Two households, two
  // parcels on the same ground. Under claim order the EARLIER claim stands and
  // the later one is the overlap refusal, whichever way the array is handed in —
  // which is the same answer the cap gives, and the reason they move together.
  const early = P("xa/early", "xa", 0, "2026-08-01T00:00:00Z");
  const late = P("xb/late", "xb", 0, "2026-08-09T00:00:00Z");   // same x: they overlap
  const households = { xa: "gh:1", xb: "gh:2" };
  for (const marks of [[early, late], [late, early]]) {
    const state = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households });
    assert.deepEqual(state.parcels.map((p) => p.id), ["xa/early"],
      `handed ${marks.map((m) => m.id).join(" ")}, the earlier claim must be the one that stands`);
    assert.equal(state.errors.length, 1);
    assert.match(state.errors[0].error, /overlaps/);
    assert.equal(state.errors[0].mark, "xb/late");
  }
  // AND THE CONTROL: arrival order really can answer the other way, or this
  // test is asserting a property no ordering could fail.
  assert.ok(compareClaimOrder(late, early) > 0);
});

test("F8 · the Reeves' cap exception means a refreshed registry refuses none of theirs", () => {
  // The founder, 2026-09-09: "let's let the reeves have their fifth." The entry
  // is in PARCEL_CAP_EXCEPTIONS; this reproduces their shape with their real ids
  // and asserts the fold refuses nothing of theirs.
  assert.ok(PARCEL_CAP_EXCEPTIONS.has("histor-reeves/the-gauge-house-parcel"),
    "the entry must be in the map, or the rest of this test is about a fixture");
  assert.match(PARCEL_CAP_EXCEPTIONS.get("histor-reeves/the-gauge-house-parcel"),
    /2026-09-09 Keemin: .let's let the reeves have their fifth\./,
    "and it must carry the founder's own words, dated — that is what the map is a record of");

  const reeves = [
    P("sage-reeves/the-clear-house-parcel", "sage-reeves", 0, "2026-07-24"),
    P("lumen-reeves/the-clearing-parcel", "lumen-reeves", 100, "2026-07-24"),
    P("isaiah-reeves/the-fieldstone-study-parcel", "isaiah-reeves", 200, "2026-07-24"),
    P("callan-reeves/the-keeping-room-parcel", "callan-reeves", 300, "2026-07-24"),
    P("histor-reeves/the-gauge-house-parcel", "histor-reeves", 400, "2026-09-08T04:12:17.104Z"),
  ];
  const households = Object.fromEntries(reeves.map((p) => [p.household, "gh:276169629"]));
  for (const marks of [reeves, [...reeves].reverse()]) {
    const state = fold({ marks, terrain: { features: [] }, stakes: [], tick: 1, households });
    assert.deepEqual(state.errors, [], "the Reeves lose nothing, in any arrival order");
    assert.equal(state.parcels.length, 5, "all five of theirs stand");
  }
  // THE CONTROL: without the entry the fifth WOULD be refused, or the exception
  // is a line that changes nothing and this test cannot fail.
  const notExcepted = reeves.map((p) => (p.id.startsWith("histor-reeves/")
    ? { ...p, id: "histor-reeves/some-other-parcel" } : p));
  const control = fold({ marks: notExcepted, terrain: { features: [] }, stakes: [], tick: 1, households });
  assert.deepEqual(capErrors(control), ["histor-reeves/some-other-parcel"],
    "the same shape with an id the map does not name IS refused — the exception is what saves theirs");
});

test("F12 · deva's household keeps all five, and a SIXTH claim is still refused", () => {
  // The founder, 2026-09-09 ~18:2x EDT: "for deva's household, we should special
  // case and allow them to keep their already established parcels", and ~20:0x
  // EDT, asked to confirm the count: "YES. deva keeps 5. that is what I meant."
  //
  // `gh:314022791` is the login `devadavisson` and the town groups five handles
  // under it. Every one of these was claimed while the registry was 33 days
  // stale and filed those five as strangers, so the cap had never applied.
  const DEVA = [
    ["spark-the-builder/the-workshop-on-the-terrace-parcel", "spark-the-builder", "2026-08-09"],
    ["will-the-sailor/the-sloop-at-anchor-parcel", "will-the-sailor", "2026-08-23T22:19:07.991Z"],
    ["current-the-reader/the-keepers-flat", "current-the-reader", "2026-08-24T00:12:29.839Z"],
    ["berthillon/chez-antoine", "berthillon", "2026-08-26T04:01:59.409Z"],
    ["little-pica/the-nest-on-the-middle-terrace-parcel", "little-pica", "2026-09-01"],
  ];
  for (const [id] of DEVA)
    assert.ok(PARCEL_CAP_EXCEPTIONS.has(id), `${id} must be named in the map, or the ruling is not in the tree`);
  assert.match(PARCEL_CAP_EXCEPTIONS.get("berthillon/chez-antoine"),
    /YES\. deva keeps 5\. that is what I meant\./,
    "and the entries must carry the founder's own words, dated — that is what the map is a record of");

  const marks = DEVA.map(([id, by, date], i) => P(id, by, i * 100, date));
  const households = Object.fromEntries(DEVA.map(([, by]) => [by, "gh:314022791"]));
  for (const arrival of [marks, [...marks].reverse()]) {
    const state = fold({ marks: arrival, terrain: { features: [] }, stakes: [], tick: 1, households });
    assert.deepEqual(state.errors, [], "deva loses nothing, in any arrival order");
    assert.equal(state.parcels.length, 5, "all five stand");
  }

  // ── AND THE FORWARD LAW IS UNTOUCHED ──────────────────────────────────────
  // "3 parcels max" (the founder, ~17:5x the same day) still bites a SIXTH,
  // because `held` counts the five whether they are excepted or not. An
  // exception that quietly bought this household unlimited ground would be a
  // different ruling from the one he gave.
  const sixth = P("berthillon/a-sixth-parcel", "berthillon-two", 900, "2026-09-09T12:00:00Z");
  const withSixth = fold({
    marks: [...marks, sixth], terrain: { features: [] }, stakes: [], tick: 1,
    households: { ...households, "berthillon-two": "gh:314022791" },
  });
  assert.deepEqual(capErrors(withSixth), ["berthillon/a-sixth-parcel"],
    "a sixth claim is refused — the exception grants the five, never the cap");

  // THE CONTROL: the same five under ids the map does not name ARE capped, or
  // the entries are lines that change nothing.
  const renamed = marks.map((m) => ({ ...m, id: m.id.replace(/\/.*/, "/unnamed-parcel-" + m.at.x) }));
  const control = fold({ marks: renamed, terrain: { features: [] }, stakes: [], tick: 1, households });
  assert.equal(capErrors(control).length, 2,
    "unnamed, the two latest of the five fall — which is what the exception is saving them from");
});

test("F9 · admitDelta orders its candidates too, so one sketchbook's several parcels are not decided by arrival", () => {
  // The reviewer: required at BOTH loops. This one counts from the fold's own
  // admitted total, so the standing estate is already deterministic; what was
  // not is a delta carrying several parcels at once.
  const standing = [
    P("ha/one", "ha", 0, "2026-08-01T00:00:00Z"),
    P("hb/two", "hb", 100, "2026-08-02T00:00:00Z"),
  ];
  const households = Object.fromEntries(["ha", "hb", "hc", "hd"].map((h) => [h, "gh:99"]));
  // `admissionBase(state, { households })` takes a FOLDED state and the registry
  // as a second argument — handing it a fold-shaped options object silently
  // yields `solo:` grain and a cap that never engages, which is how the first
  // draft of this test passed while proving nothing about ordering.
  const standingState = fold({ marks: standing, terrain: { features: [] }, stakes: [], tick: 1, households });
  const base = admissionBase(standingState, { households });
  assert.equal(base.credOf("hc"), "gh:99", "the base must resolve the household, or the cap cannot engage");
  assert.equal(base.parcelsByCred.get("gh:99"), 2, "…and it must already count the two standing parcels");
  const early = P("hc/early", "hc", 200, "2026-08-03T00:00:00Z");
  const late = P("hd/late", "hd", 300, "2026-08-04T00:00:00Z");
  for (const candidates of [[early, late], [late, early]]) {
    const { errors } = admitDelta(candidates, base);
    const capped = errors.filter((e) => /parcel claim capped/.test(e.error)).map((e) => e.mark);
    assert.deepEqual(capped, ["hd/late"],
      `handed ${candidates.map((c) => c.id).join(" ")}, the delta must refuse the LATER claim`);
  }
  assert.deepEqual(candidatesInClaimOrder([late, early]).map((c) => c.id), ["hc/early", "hd/late"],
    "and the order itself is the record's");
});

test("F10 · refuseStaleHouseholds — the unit both readers share", () => {
  const PIN = "a".repeat(40);
  const fresh = { town_sha: PIN, households: {} };
  assert.equal(refuseStaleHouseholds(fresh, PIN), null, "a matching stamp passes");
  assert.equal(refuseStaleHouseholds(fresh, null), null, "no pin, no construction — a hand-run still works");
  assert.equal(refuseStaleHouseholds(null, null), null);

  const other = refuseStaleHouseholds({ town_sha: "b".repeat(40) }, PIN);
  assert.match(String(other), /derived from town b{40}/);
  assert.match(String(other), new RegExp(`pinned town ${PIN}`), "and it NAMES BOTH shas, which is the whole point");

  const unstamped = refuseStaleHouseholds({ households: {} }, PIN);
  assert.match(String(unstamped), /UNSTAMPED/,
    "an absent stamp refuses too — that is the pre-2026-09-09 file exactly, and its absence must stop being invisible");
});

test("F11 · a crossing handed a stale registry REFUSES, and names both shas", (t) => {
  // The construction where it matters: the sweep, on a real fixture repo.
  const repo = mkdtempSync(join(tmpdir(), "postmark-registry-freshness-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const stakesPath = join(repo, "stakes.json");

  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (p, text) => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), text); };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md",
    "---\nkind: sited\nby: the-town\ntier: constitution\nat: { x: 0, y: 0 }\nextent: { w: 320000, h: 320000 }\ndate: 2026-07-01\n---\n\nthe frame\n");
  writeFileSync(stakesPath, JSON.stringify([]));

  const PINNED = "c".repeat(40);
  const STALE = "d".repeat(40);
  put("WORLD/households.json", `${JSON.stringify({ town_sha: STALE, households: {}, logins: {} }, null, 2)}\n`);
  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=f@test.invalid", "commit", "-q", "-m", "canon");

  assert.throws(
    () => settlementSweep({ repo, stakesPath, townSha: PINNED }),
    (e) => {
      assert.match(String(e.message), new RegExp(`derived from town ${STALE}`), "the refusal names the registry's own sha");
      assert.match(String(e.message), new RegExp(`pinned town ${PINNED}`), "and the one the crossing pinned");
      return true;
    },
    "a crossing folding a registry derived from a town it did not pin must REFUSE, not group quietly",
  );

  // THE FLIP, and it is the reason to believe the assertion above: the same
  // crossing with a matching stamp must NOT refuse for this reason.
  put("WORLD/households.json", `${JSON.stringify({ town_sha: PINNED, households: {}, logins: {} }, null, 2)}\n`);
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=f@test.invalid", "commit", "-q", "-m", "registry refreshed");
  const report = settlementSweep({ repo, stakesPath, townSha: PINNED });
  assert.ok(report, "a fresh registry crosses");

  // AND with no pin at all, the old behaviour: an unstamped registry crosses.
  put("WORLD/households.json", `${JSON.stringify({ households: {}, logins: {} }, null, 2)}\n`);
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=f@test.invalid", "commit", "-q", "-m", "unstamped");
  assert.ok(settlementSweep({ repo, stakesPath }), "no pin means the construction is not armed, so a hand-run still works");
  assert.throws(() => settlementSweep({ repo, stakesPath, townSha: PINNED }), /UNSTAMPED/,
    "…but a pinned crossing refuses the unstamped file, which is the 2026-08-07 state exactly");
});
