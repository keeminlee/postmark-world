// frames-adapter.test.mjs — the migration read-half, proven against tonight's
// real shapes (rung 8). Each case is the actual 2026-08-22 state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFrameGraph } from "./frames-adapter.mjs";
import { composeWorldPosition } from "./frames.mjs";

test("THE TOP, FIXED: a held thing composes to its holder — the bug that started rung 8", () => {
  // wright at the archway, holding the top. Today the top's mark sits at its own
  // `at` (home). Through the frame graph, the top is framed on wright and reads
  // at the archway with him.
  const { nodes } = buildFrameGraph({
    marks: [{ id: "wright/a-trued-spinning-top-for-little-m", at: { x: 574, y: -2601 }, extent: { w: 1, h: 1 } }],
    walkers: { wright: { x: -1360, y: -2410 } },
    holdings: [{ thing: "wright/a-trued-spinning-top-for-little-m", holder: "wright" }],
  });
  assert.equal(nodes["wright/a-trued-spinning-top-for-little-m"].frame, "wright");
  assert.deepEqual(composeWorldPosition("wright/a-trued-spinning-top-for-little-m", nodes), { x: -1360, y: -2410 },
    "the top is with wright at the archway, not stranded at home");
});

test("AN ABOARD RIDER composes to the vessel — the case the flat model band-aided with a flag", () => {
  const { nodes } = buildFrameGraph({
    walkers: { rei: { x: 1005, y: 2003 } },       // last stood on the deck
    aboard: { rei: "the-town/post-office" },
    vessels: { "the-town/post-office": { x: 5000, y: 2000 } },  // she has since sailed
  });
  assert.equal(nodes.rei.frame, "the-town/post-office");
  assert.deepEqual(nodes.rei.local, { x: 0, y: 0 }, "today's carriage snaps the rider to the vessel (no deck offset tracked)");
  assert.deepEqual(composeWorldPosition("rei", nodes), { x: 5000, y: 2000 },
    "rei rides the boat's frame — moves with it, no aboard-flag needed");
});

test("STALE OCCUPANCY is DISCLOSED, and the frame keeps the walk position", () => {
  // wright's live 08-20 bug: occupancy says inside the trueing house, walk says
  // out on the road. The graph trusts the walk (never the stale one) and names
  // the disagreement rather than silently placing him in a house he left.
  const { nodes, disclosures } = buildFrameGraph({
    marks: [{ id: "wright/the-trueing-house", at: { x: 575, y: -2600 }, extent: { w: 12, h: 12 } }],
    walkers: { wright: { x: -204, y: -2521 } },   // on the road, far from the house
    occupancy: { wright: ["wright/the-trueing-house"] },
  });
  const stale = disclosures.find((d) => d.kind === "stale-occupancy" && d.handle === "wright");
  assert.ok(stale, "the walk/occupancy disagreement is surfaced, not swallowed");
  assert.deepEqual(composeWorldPosition("wright", nodes), { x: -204, y: -2521 },
    "he reads where he walked, not in the house his occupancy still claims");
});

test("an entity genuinely inside a mark reads correctly, no disclosure", () => {
  const { nodes, disclosures } = buildFrameGraph({
    marks: [{ id: "sol/grove", at: { x: -1375, y: -2625 }, extent: { w: 300, h: 300 } }],
    walkers: { nyx: { x: -1375, y: -2625 } },     // truly in the grove
    occupancy: { nyx: ["sol/grove"] },
  });
  assert.equal(nodes.nyx.frame, "sol/grove");
  assert.deepEqual(nodes.nyx.local, { x: 0, y: 0 }, "at the grove's centre → local origin");
  assert.deepEqual(composeWorldPosition("nyx", nodes), { x: -1375, y: -2625 });
  assert.equal(disclosures.length, 0, "agreement is silent");
});

test("a dangling holder is disclosed, never a wrong placement", () => {
  const { disclosures } = buildFrameGraph({
    holdings: [{ thing: "wright/top", holder: "ghost" }],
  });
  assert.ok(disclosures.find((d) => d.kind === "dangling-holder"));
});
