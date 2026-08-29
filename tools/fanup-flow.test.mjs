#!/usr/bin/env node
// fanup-flow.test.mjs — the conserved-flow fan-up (fanup: "flow"; gold plan
// postmark-world-view-system R9/R11, ruled + greenlit 2026-08-17 night).
// Run: node --test tools/fanup-flow.test.mjs
//
// The four laws under test:
//   R9  unit conductance — a mark's outbound lending splits over its PRESENT
//       upward channels, coefficients summing to exactly 1; a lone-channel
//       mark conducts its full unit (Keemin's greenlight caveat).
//   R11 the skip rule — absent-word cross-household containment skips the
//       non-consenting rung to the first consenting ancestor; town-owned
//       consents implicitly by legality.
//   conservation — Σ staked weight === Σ totals at sinks, exactly.
//   legacy parity — fanup defaults to "legacy" and stays byte-identical.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "./marks-fold.mjs";

const terrain = { features: [] };
const sited = (id, by, x, y, w, h, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "sited", tier: by === "the-town" ? "constitution" : "market",
  at: { x, y }, extent: { w, h }, date: "2026-08-10", body: id, ...extra,
});
const stake = (holder, mark, n) => ({ holder, mark, n, weight: n, tick: 0 });
const w = (state, id) => state.marks.find((m) => m.id === id)?.weight;

// A miniature town: the root, the works quarter with one class declaration,
// a stranger's district, and a resident's staked instance standing on the
// stranger's ground.
const WORLD = () => [
  sited("let-there-be-light", "the-town", 0, 0, 100000, 100000),
  sited("the-town-centre", "the-town", -500, -500, 2000, 2000),
  sited("the-keeping-works", "the-town", -600, -350, 800, 800),
  sited("bicycle", "the-town", -600, -350, 50, 40, { class: "bicycle" }),   // the declaration, in the works
  sited("the-district", "stranger", 5000, 5000, 3000, 3000),               // a stranger's ground
  sited("my-bicycle", "rider", 5000, 5000, 2, 1, { class: "bicycle" }),    // the staked instance, on it
];

test("legacy stays the default and the stranger still harvests nothing", () => {
  const state = fold({ marks: WORLD(), terrain, tick: 1, stakes: [stake("s", "rider/my-bicycle", 8)] });
  assert.equal(state.fanup, undefined, "no flow receipts under the default");
  assert.equal(w(state, "stranger/the-district"), 0);
  assert.equal(w(state, "the-town/bicycle"), 0, "legacy has no instance channel");
});

test("R9 unit conductance: two present channels split the unit; conservation holds to the sink", () => {
  const state = fold({ marks: WORLD(), terrain, tick: 1, stakes: [stake("s", "rider/my-bicycle", 8)], fanup: "flow" });
  // the instance has TWO channels: contains (skipping the stranger, R11) and
  // instance-of → each carries exactly half the unit
  assert.equal(w(state, "the-town/bicycle"), 4, "the class receives the instance-of half");
  assert.equal(w(state, "stranger/the-district"), 0, "the non-consenting rung is skipped, never enriched");
  // the containment half lands on the first town-owned ancestor (the root —
  // the district was skipped and nothing else contains the bicycle); the class
  // half then flows on up the works' own chain, so the root re-unites the unit
  assert.equal(w(state, "the-town/let-there-be-light"), 8, "the apex receives exactly 1× the stake, both paths summed");
});

test("R9 present-channels-only: a lone-channel mark conducts its full unit", () => {
  const marks = [
    sited("let-there-be-light", "the-town", 0, 0, 100000, 100000),
    sited("shed", "rider", 300, 300, 10, 10),           // no class, no predicate — contains only
  ];
  const state = fold({ marks, terrain, tick: 1, stakes: [stake("s", "rider/shed", 5)], fanup: "flow" });
  assert.equal(w(state, "the-town/let-there-be-light"), 5, "nothing is reserved for channels that do not exist");
});

test("R11: same-household and welcomed rungs still take the carry; only the wordless stranger is skipped", () => {
  const marks = WORLD().concat([
    sited("riders-yard", "rider", 5000, 5000, 40, 40),  // the rider's own ground around the bicycle, inside the stranger's district
  ]);
  const state = fold({ marks, terrain, tick: 1, stakes: [stake("s", "rider/my-bicycle", 8)], fanup: "flow" });
  assert.equal(w(state, "rider/riders-yard"), 4, "the household's own rung takes the containment half");
  assert.equal(w(state, "stranger/the-district"), 0, "and the stranger above it is still skipped");
  assert.equal(w(state, "the-town/let-there-be-light"), 8, "conservation survives the extra rung");
});

test("conservation over the whole fixture: Σ stakes === the apex, with receipts naming every flow", () => {
  const stakes = [stake("a", "rider/my-bicycle", 8), stake("b", "the-town/bicycle", 3)];
  const state = fold({ marks: WORLD(), terrain, tick: 1, stakes, fanup: "flow" });
  assert.equal(w(state, "the-town/let-there-be-light"), 11, "every staked stamp reaches the apex exactly once");
  assert.ok(Array.isArray(state.fanup.flows) && state.fanup.flows.length > 0, "the flows are receipted");
  const instanceFlow = state.fanup.flows.find((f) => f.channel === "instance-of");
  assert.ok(instanceFlow && instanceFlow.from === "rider/my-bicycle" && instanceFlow.to === "the-town/bicycle");
  assert.ok(state.fanup.skips.some((s) => s.skipped.includes("stranger/the-district")), "the skip is receipted by name");
});

// ── the conservation falsifier: presence is NOT attention (R14's priced guard) ─
//
// DEMO SLICE (step 5, jetto/enter-exit-demo). R14 makes occupancy a LITERAL
// `contains` edge with an entity child, which puts a walker into the same
// taxonomy the fan-up runs on. Tee (iii) of the consent handshake holds the
// boundary deliberately: `within` edges join the world graph but NOT the fold's
// channel set in v0 — presence-as-attention is the tabled economy coupling, and
// the upward channels stay contains/describes/instance-of until that is ruled.
//
// So the falsifier is one sentence: FAN-UP TOTALS MUST NOT MOVE WHEN A WALKER
// ENTERS. It ships with its own positive control, because a conservation test
// whose comparison cannot detect movement is a test that passes for the wrong
// reason — and this one is measuring a NON-effect, which is exactly the shape
// that rots into vacuous green.

import { occupancyAt, parseEnterExitLedger, formatEnterExit, isMark, containsEdges } from "./enter-exit.mjs";
import { attachOccupancy } from "./world-verbs.mjs";

const totalsOf = (state) => Object.fromEntries(state.marks.map((m) => [m.id, m.weight ?? 0]));
const crossings = (lines) => parseEnterExitLedger(lines.join("\n")).acts;

// a walker boards the shed and a second one boards the stranger's district
const BOARDED = () => occupancyAt(crossings([
  formatEnterExit({ handle: "rider", act: "enters", mark: "stranger/the-district", at: 1, word: "neutral" }),
  formatEnterExit({ handle: "rider", act: "enters", mark: "rider/my-bicycle", at: 1, word: "welcomed" }),
  formatEnterExit({ handle: "stranger", act: "enters", mark: "stranger/the-district", at: 1, word: "welcomed" }),
]), 1);

for (const mode of ["legacy", "flow"]) {
  test(`the conservation falsifier (${mode}): fan-up totals do not move when a walker enters`, () => {
    const stakes = [stake("a", "rider/my-bicycle", 8), stake("b", "the-town/bicycle", 3)];
    const empty = { marks: WORLD(), terrain };
    const before = totalsOf(fold({ marks: empty.marks, terrain, tick: 1, stakes, fanup: mode }));

    const occupancy = BOARDED();
    assert.ok(occupancy.get("rider")?.length, "the walker really did cross — an unentered world proves nothing");
    const peopled = attachOccupancy(empty, occupancy);
    assert.equal(peopled.containsEdges.length, 3, "and the entries really did derive contains edges");
    assert.ok(peopled.containsEdges.every((e) => e.childKind === "entity"));

    const after = totalsOf(fold({ marks: peopled.marks, terrain, tick: 1, stakes, fanup: mode }));
    assert.deepEqual(after, before, "occupancy is in the world graph and out of the fold's channel set");
  });
}

test("the falsifier's positive control: the same harness DOES see a mark child arrive", () => {
  const stakes = [stake("a", "rider/my-bicycle", 8)];
  const before = totalsOf(fold({ marks: WORLD(), terrain, tick: 1, stakes, fanup: "flow" }));
  // a MARK child inside the district, staked — the movement the falsifier above
  // would have to be able to see for its silence to mean anything
  const withMark = WORLD().concat([sited("a-staked-shed", "stranger", 5000, 5000, 20, 20)]);
  const after = totalsOf(fold({ marks: withMark, terrain, tick: 1, stakes: [...stakes, stake("c", "stranger/a-staked-shed", 4)], fanup: "flow" }));
  assert.notDeepEqual(after, before, "if this ever passes, the comparison above has stopped measuring anything");
  assert.equal(after["the-town/let-there-be-light"], before["the-town/let-there-be-light"] + 4);
});

test("entity children never reach a consumer that means area", () => {
  const occupancy = BOARDED();
  const peopled = attachOccupancy({ marks: WORLD(), terrain }, occupancy);
  assert.equal(peopled.marks.every(isMark), true, "the fold's input is marks only, by construction");
  assert.equal(containsEdges(occupancy).some((e) => isMark({ kind: e.childKind })), false,
    "every derived edge's child fails the predicate the area readers gate on");
  // and the derived edges are not a channel the fold has ever heard of
  const state = fold({ marks: peopled.marks, terrain, tick: 1, stakes: [stake("a", "rider/my-bicycle", 8)], fanup: "flow" });
  const channels = new Set(state.fanup.flows.map((f) => f.channel));
  assert.deepEqual([...channels].sort(), ["contains", "instance-of"], "no `within` channel appeared in the receipts");
});
