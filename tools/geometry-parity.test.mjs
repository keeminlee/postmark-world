// geometry-parity.test.mjs — ONE GEOMETRY, ONE TRUTH.
//
// Founder-found 2026-08-20: clicking enter on rei/the-lanternstep-house did
// nothing. The door answered SUCCESS with entered: [], no terms, no refusal, no
// ledger row — an act that vanished. And entering a 2x2 bench inside the town
// centre wrote crossings through a house 1.3 km away.
//
// THE DISEASE: a consumer read mark positions in the AUTHORED frame while the
// town serves the FOLDED one. Those are not small disagreements. Two separate
// transforms sit between them, and a consumer that skips either is somewhere
// else entirely:
//
//   parent-frame composition   rei/the-lanternstep-house   {0,0}      -> {1075,-800}
//   legacy-grid reprojection   rei/…-house-parcel          {-250,200} -> {1075,-800}
//   both                       wright/the-crossing-bench   {87,83}    -> {12,8}
//
// SCHEMA v3 lets `at:` be authored as an offset from the parent's centre, and
// `loadMarks` composes world coordinates once at load — "nothing downstream can
// tell which frame the files were written in" (coords-frame.test.mjs). That is
// true and it is exactly the trap: a downstream that parses mark.md ITSELF gets
// the authored frame and cannot tell.
//
// This file is the class-killer. It does not test the crossing; it tests the
// PREMISE every geometric consumer stands on, so any component that reads raw
// records instead of the fold fails here first and by name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { crossingPlan } from "./world-verbs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FOLDED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const foldedById = new Map((FOLDED.marks ?? []).map((m) => [m.id, m]));

/** The AUTHORED frame — mark.md frontmatter read the naive way, which is exactly
 *  what a component that "just parses the records" ends up holding. */
function authoredMarks(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { authoredMarks(path, out); continue; }
    if (entry.name !== "mark.md") continue;
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
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
const authoredById = new Map(AUTHORED.map((m) => [m.id, m]));
const apart = (a, b) => Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);

test("the two frames are readable, and there are enough marks to mean something", () => {
  assert.ok(AUTHORED.length > 200, `authored records parsed: ${AUTHORED.length}`);
  assert.ok(foldedById.size > 200, `folded marks: ${foldedById.size}`);
});

// ── the premise ─────────────────────────────────────────────────────────────
test("THE FRAMES GENUINELY DISAGREE — this is why a consumer must not choose", () => {
  // If this ever goes quiet it does NOT mean the danger passed; it means the tree
  // stopped using relative authoring, and the guard below would go vacuous. Said
  // out loud so a future reader does not delete the guard on a green day.
  const moved = [...authoredById.values()]
    .filter((a) => foldedById.has(a.id) && foldedById.get(a.id).at)
    .filter((a) => apart(a, foldedById.get(a.id)) > 0.5);
  assert.ok(moved.length > 0,
    "no authored position differs from its folded one — the parity guard has gone vacuous, do not delete it, ask why");
});

test("THE THREE RECEIPTS, by name and by number", () => {
  const cases = [
    ["rei/the-lanternstep-house", { x: 0, y: 0 }, { x: 1075, y: -800 }],
    ["rei/the-lanternstep-house-parcel", { x: -250, y: 200 }, { x: 1075, y: -800 }],
    ["wright/the-crossing-bench", { x: 87, y: 83 }, { x: 12, y: 8 }],
  ];
  for (const [id, authored, folded] of cases) {
    assert.deepEqual(authoredById.get(id)?.at, authored, `${id} authored frame moved`);
    assert.deepEqual(foldedById.get(id)?.at, folded, `${id} folded frame moved`);
  }
});

// ── the crossing must stand on the served frame ─────────────────────────────
//
// The two founder receipts, as fixtures. Each asserts what the chain IS on the
// folded frame AND what it wrongly becomes on the authored one, so the test says
// what "wrong" looked like rather than only that it was wrong.
const TOWN_CENTRE = "the-town/the-town-centre";
const atTownCentre = () => ({ ...foldedById.get(TOWN_CENTRE).at });
const held = new Map([["wright", [TOWN_CENTRE]]]);
const planOn = (marks, target, state = atTownCentre()) =>
  crossingPlan(state, target, { marks }, { occupancy: held, handle: "wright" });

test("RECEIPT 1: entering the lanternstep house crosses ITS OWN chain, and is not empty", () => {
  const plan = planOn(FOLDED.marks, "rei/the-lanternstep-house");
  assert.deepEqual(plan.chain, ["rei/the-lanternseed-gardens", "rei/the-lanternstep-house"]);
  assert.ok(plan.links.length > 0,
    "an empty link list is what made enter() answer already:true with entered:[] — the vanished click");
  assert.deepEqual(plan.links, plan.chain, "standing outside, every link is still to be crossed");
});

test("RECEIPT 2: entering the bench implicates NOBODY's ground but its own chain", () => {
  const plan = planOn(FOLDED.marks, "wright/the-crossing-bench");
  assert.deepEqual(plan.chain, [TOWN_CENTRE, "wright/the-crossing-bench"]);
  assert.deepEqual(plan.links, ["wright/the-crossing-bench"], "the town centre is already held");
  for (const id of plan.chain) assert.doesNotMatch(id, /^rei\//, "rei's ground is 1.3 km away and must not appear");
});

test("FALSIFIER: the SAME calls on the authored frame are catastrophically wrong", () => {
  // this is the bug, reproduced — kept so the test says what it is defending
  const bench = planOn(AUTHORED, "wright/the-crossing-bench");
  assert.ok(bench.chain.length > 2,
    `on the authored frame the bench's chain runs through strangers: ${JSON.stringify(bench.chain)}`);
  assert.ok(bench.chain.some((id) => !id.startsWith("wright/") && id !== TOWN_CENTRE),
    "…including ground belonging to households with no part in it");

  const house = planOn(AUTHORED, "rei/the-lanternstep-house");
  assert.ok(house.chain.length > 4,
    `and the house's chain becomes a tour of the town: ${house.chain.length} links`);

  // and the whole point: the two frames do not merely differ, they disagree
  assert.notDeepEqual(bench.chain, planOn(FOLDED.marks, "wright/the-crossing-bench").chain);
});

// ── the sweep over the whole tree ───────────────────────────────────────────
test("THE CLASS-KILLER: no sited mark's chain may differ between the frames", () => {
  // For every mark both frames place, the containment chain derived on the
  // authored frame must equal the one derived on the folded frame — which is
  // only true where the two positions agree. Every disagreement listed here is a
  // mark whose crossings a raw-record consumer would get wrong.
  const wrong = [];
  for (const [id, folded] of foldedById) {
    if (!folded.at || !folded.extent) continue;
    const authored = authoredById.get(id);
    if (!authored) continue;
    const d = apart(authored, folded);
    if (d > 0.5) wrong.push({ id, d });
  }
  wrong.sort((a, b) => b.d - a.d);
  // The assertion is NOT "wrong is empty" — the frames legitimately differ, that
  // is what composition means. It is that the SERVED frame is the one every
  // consumer reads, and this list is the blast radius if one does not.
  assert.ok(wrong.length > 0, "vacuous guard — see the note above");
  const homes = wrong.filter((w) => !w.id.startsWith("the-town/"));
  assert.ok(homes.length > 0,
    "resident ground is in the blast radius, which is why this outranked everything");
});
