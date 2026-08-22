// geometry-parity.test.mjs — coords-equivalence, extended into CROSSING-SPACE.
//
// tools/coords-equivalence.mjs proves the v2→v3 migration preserved every mark's
// POSITION. This proves the thing built on top of positions: that the CHAIN a
// crossing derives is the same one, and that it is only the same when the
// derivation stands on the STORE.
//
// Founder-found 2026-08-20: clicking enter on rei/the-lanternstep-house did
// nothing — the door answered success with entered: [], no terms, no refusal, no
// ledger row. And entering a 2×2 bench in the town centre wrote crossings
// through a house 1.3 km away.
//
// ── THE LAW, and there is only ONE transform ────────────────────────────────
//
// SCHEMA v3 § The frame, and marks-fold.mjs states it in its own words: a BOUND
// child (parent tier rank ≥ child rank) is framed by its parent — its `at:` is
// an offset from that parent's CENTRE. An OUTRANKING child is framed by the
// world; its numbers never mentioned its parent. Composition happens once, at
// load, in exactly one function, and "everything downstream reads `at` in world
// coordinates and cannot tell which frame the files were written in".
//
// RECORDS ARE OFFSETS. THE STORE IS ABSOLUTE. Verified by arithmetic against the
// live tree — each line is record + parent-centre = store, exactly:
//
//   rei/the-lanternseed-gardens        {1325,-1000} + {0,0}        = {1325,-1000}
//   rei/…-house-parcel                 {-250,200}   + {1325,-1000} = {1075,-800}
//   rei/the-lanternstep-house          {0,0}        + {1075,-800}  = {1075,-800}
//   wright/the-crossing-bench          {87,83}      + {-75,-75}    = {12,8}
//
// (An earlier version of this file claimed a SECOND "legacy-grid reprojection".
// There is none — the parcel's derived_from grid_m is seeding provenance quoting
// the world position, not another frame. The model is pure rank-based parent
// composition. Corrected before it could become doctrine by repetition.)
//
// So the fault has exactly one shape and one fix: a consumer that parses mark
// records itself holds OFFSETS and treats them as positions. The fix is never to
// reimplement the composition — it is to CONSUME the store.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { enterExitPlan } from "./world-verbs.mjs";
import { loadMarks } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const storeById = new Map((STORE.marks ?? []).map((m) => [m.id, m]));

// THE COMPOSING LOADER — the one function that knows the frame. Its output is
// what the store is made of, so store and loader must agree everywhere.
const COMPOSED = loadMarks(join(ROOT, "WORLD/marks"));
const composedById = new Map(COMPOSED.map((m) => [m.id, m]));

/** The AUTHORED frame: mark.md frontmatter read the naive way — exactly what a
 *  component that "just parses the records" ends up holding. Offsets, mistaken
 *  for positions. */
function authoredMarks(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { authoredMarks(path, out); continue; }
    if (entry.name !== "mark.md") continue;
    const fm = readFileSync(path, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const field = (n) => fm.match(new RegExp(`^${n}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
    const at = field("at")?.match(/x:\s*(-?[\d.]+).*?y:\s*(-?[\d.]+)/);
    const extent = field("extent")?.match(/w:\s*(-?[\d.]+).*?h:\s*(-?[\d.]+)/);
    const by = field("by");
    if (!at || !extent || !by) continue;
    out.push({
      id: `${by}/${dir.split(/[\\/]/).pop()}`, by, kind: field("kind") ?? "sited",
      at: { x: +at[1], y: +at[2] }, extent: { w: +extent[1], h: +extent[2] },
    });
  }
  return out;
}
const AUTHORED = authoredMarks(join(ROOT, "WORLD/marks"));

test("all three readings of the tree are available", () => {
  assert.ok(storeById.size > 200, `store marks: ${storeById.size}`);
  assert.ok(composedById.size > 200, `composed marks: ${composedById.size}`);
  assert.ok(AUTHORED.length > 200, `authored records: ${AUTHORED.length}`);
});

// ── the law, as arithmetic ──────────────────────────────────────────────────
test("RECORDS ARE OFFSETS: record + parent centre = store, exactly", () => {
  const cases = [
    ["rei/the-lanternseed-gardens", "the-town/let-there-be-light", { x: 1325, y: -1000 }],
    ["rei/the-lanternstep-house-parcel", "rei/the-lanternseed-gardens", { x: -250, y: 200 }],
    ["rei/the-lanternstep-house", "rei/the-lanternstep-house-parcel", { x: 0, y: 0 }],
    ["wright/the-crossing-bench", "the-town/the-town-centre", { x: 87, y: 83 }],
  ];
  const authoredById = new Map(AUTHORED.map((m) => [m.id, m]));
  for (const [id, parent, offset] of cases) {
    assert.deepEqual(authoredById.get(id)?.at, offset, `${id}'s RECORD is the offset it was authored as`);
    const parentAt = storeById.get(parent).at;
    const composed = { x: parentAt.x + offset.x, y: parentAt.y + offset.y };
    assert.deepEqual(storeById.get(id).at, composed,
      `${id}: ${JSON.stringify(offset)} + ${JSON.stringify(parentAt)} must be the stored position`);
  }
});

test("THE STORE AND THE COMPOSING LOADER AGREE EVERYWHERE", () => {
  // the store IS the loader's output; if these ever part, the saved world and the
  // live fold are two different towns and every consumer is choosing between them
  const off = [];
  for (const [id, stored] of storeById) {
    if (!stored.at) continue;
    const composed = composedById.get(id);
    if (!composed?.at) continue;
    if (Math.hypot(composed.at.x - stored.at.x, composed.at.y - stored.at.y) > 1e-6) off.push(id);
  }
  assert.deepEqual(off, [], `store and composing loader disagree on: ${off.slice(0, 5).join(", ")}`);
});

// ── enter-exit space: the extension coords-equivalence does not cover ──────
const TOWN_CENTRE = "the-town/the-town-centre";
const held = new Map([["wright", [TOWN_CENTRE]]]);
const chainOn = (marks, target) => {
  const at = storeById.get(TOWN_CENTRE).at;
  const plan = enterExitPlan({ x: at.x, y: at.y }, target, { marks }, { occupancy: held, handle: "wright" });
  return plan.error ? null : plan;
};

test("RECEIPT 1: the lanternstep house crosses ITS OWN chain, and it is not empty", () => {
  const plan = chainOn(STORE.marks, "rei/the-lanternstep-house");
  assert.deepEqual(plan.chain, ["rei/the-lanternseed-gardens", "rei/the-lanternstep-house"]);
  assert.ok(plan.links.length > 0,
    "an empty link list is what made enter() answer already:true with entered:[] — the vanished click");
});

test("RECEIPT 2: the bench implicates nobody's ground but its own chain", () => {
  const plan = chainOn(STORE.marks, "wright/the-crossing-bench");
  assert.deepEqual(plan.chain, [TOWN_CENTRE, "wright/the-crossing-bench"]);
  assert.deepEqual(plan.links, ["wright/the-crossing-bench"], "the town centre is already held");
  for (const id of plan.chain) assert.doesNotMatch(id, /^rei\//, "rei's ground is 1.3 km away");
});

test("THE CROSSING-SPACE EQUIVALENCE: every mark's chain is the same on the store and on the loader", () => {
  // this is coords-equivalence's claim, one level up: not merely that positions
  // survive composition, but that the CONTAINMENT they imply does
  let checked = 0;
  const differ = [];
  for (const [id, mark] of storeById) {
    if (!mark.at || !mark.extent) continue;
    if (!composedById.has(id)) continue;
    const a = chainOn(STORE.marks, id);
    const b = chainOn(COMPOSED, id);
    if (!a || !b) continue;
    checked += 1;
    if (JSON.stringify(a.chain) !== JSON.stringify(b.chain)) differ.push(id);
  }
  assert.ok(checked > 100, `swept ${checked} marks in enter-exit space`);
  assert.deepEqual(differ.slice(0, 5), [],
    `${differ.length} marks derive a different chain from the store than from the loader`);
});

test("FALSIFIER: the AUTHORED frame derives catastrophically different chains", () => {
  // the bug, reproduced — kept so the guard says what it defends
  const bench = chainOn(AUTHORED, "wright/the-crossing-bench");
  assert.ok(bench.chain.length > 2,
    `on records the bench's chain runs through strangers: ${JSON.stringify(bench.chain)}`);
  assert.ok(bench.chain.some((id) => !id.startsWith("wright/") && id !== TOWN_CENTRE),
    "…including ground belonging to households with no part in it");

  const house = chainOn(AUTHORED, "rei/the-lanternstep-house");
  assert.ok(house.chain.length > 4, `and the house's becomes a tour of the town: ${house.chain.length} links`);

  assert.notDeepEqual(bench.chain, chainOn(STORE.marks, "wright/the-crossing-bench").chain);
});

test("THE BLAST RADIUS: how many marks a records-reading consumer would misplace", () => {
  const authoredById = new Map(AUTHORED.map((m) => [m.id, m]));
  const moved = [];
  for (const [id, stored] of storeById) {
    if (!stored.at) continue;
    const authored = authoredById.get(id);
    if (!authored) continue;
    if (Math.hypot(authored.at.x - stored.at.x, authored.at.y - stored.at.y) > 0.5) moved.push(id);
  }
  // NOT "moved is empty" — records are offsets, so of course they differ. The
  // claim is that this list is the damage if a consumer reads them as positions.
  assert.ok(moved.length > 0,
    "no record differs from its stored position — this guard has gone VACUOUS (the tree stopped using relative authoring). Do not delete it; ask why.");
  assert.ok(moved.some((id) => !id.startsWith("the-town/")),
    "resident ground is in the blast radius, which is why this outranked everything");
});
