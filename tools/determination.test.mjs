#!/usr/bin/env node
// ── CARVE-DISABLED-2026-08-22 ──────────────────────────────────────────────
// EVERY TEST IN THIS FILE IS SKIPPED. The carve it asserts is commented out in
// tools/marks-fold.mjs (same marker) by Keemin's word on 2026-08-22, the morning
// after the world outage: the carve is the fold's most expensive stage and its
// output is write-only — no live surface reads `determination`, `cells`,
// `vague`, `determined` or the ground half of `rivalries`.
//
// These assertions are NOT wrong and nothing here was deleted. They are the law
// of a stage that is currently switched off. Restore them and the carve call
// together — `grep -rn CARVE-DISABLED-2026-08-22` finds every piece — or not at all: a half-restored
// carve is a world that disagrees with its own tests.

// determination.test.mjs — the region carve (tools/determination.mjs, ECONOMY.md
// §9.2). The first test is §9.2's own sentence, used as the specification it is.
// Run: node --test tools/determination.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "./marks-fold.mjs";

const terrain = { features: [] };
const sited = (id, by, x, y, w, h, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "sited", tier: "market",
  at: { x, y }, extent: { w, h }, date: "2026-08-10", body: id, ...extra,
});
const ground = (state) => state.rivalries.filter((r) => r.kind === "region");
const areaOf = (rs) => rs.reduce((a, r) => a + r.w * r.h, 0);

test.skip("§9.2 verbatim: a dense pond determines its own cells inside a thin meadow; the meadow keeps the rest", () => {
  // meadow: 1000x1000 backed by 100 → density 1e-4.  pond: 100x100 backed by 100 → density 1e-2.
  // The pond is a HUNDRED times denser, and it is wholly inside the meadow, so a
  // whole-claim comparison (the mechanism this replaces) would have scored 100 vs
  // 100 and resolved nothing at all.
  const meadow = sited("meadow", "a", 0, 0, 1000, 1000);
  const pond = sited("pond", "b", 0, 0, 100, 100);
  const state = fold({
    marks: [meadow, pond], terrain, tick: 1,
    stakes: [{ holder: "a", mark: "a/meadow", n: 100, weight: 100, tick: 0 },
             { holder: "b", mark: "b/pond", n: 100, weight: 100, tick: 0 }],
  });

  const d = state.determination;
  // the pond determines its own cells — all 10,000 m² of them
  assert.equal(d["b/pond"].held_area, 100 * 100, "the pond holds every cell it covers");
  assert.equal(d["b/pond"].lost_area, 0, "the pond loses nothing");
  // the meadow keeps the rest — and exactly the rest
  assert.equal(d["a/meadow"].held_area, 1000 * 1000 - 100 * 100, "the meadow keeps the rest");
  assert.equal(d["a/meadow"].lost_area, 100 * 100, "and loses exactly the pond's footprint");
  assert.equal(d["a/meadow"].lost.every((r) => r.to === "b/pond"), true, "lost to the pond, by name");
});

test.skip("contests are INTERSECTION-ONLY — the meadow's ground outside the pond is never in dispute", () => {
  const state = fold({
    marks: [sited("meadow", "a", 0, 0, 1000, 1000), sited("pond", "b", 300, 300, 100, 100)], terrain, tick: 1,
    stakes: [{ holder: "a", mark: "a/meadow", n: 100, weight: 100, tick: 0 },
             { holder: "b", mark: "b/pond", n: 100, weight: 100, tick: 0 }],
  });
  const g = ground(state);
  assert.equal(g.length, 1, "one contest");
  // the contested region IS the intersection: the pond's own 100x100, nothing more
  assert.equal(g[0].area, 100 * 100, "the contest covers the intersection and not one square metre more");
  assert.deepEqual(g[0].regions, [{ x: 300, y: 300, w: 100, h: 100 }]);
});

test.skip("the carve is DERIVED — a claim that loses ground keeps its rect whole", () => {
  const meadow = sited("meadow", "a", 0, 0, 1000, 1000);
  const state = fold({
    marks: [meadow, sited("pond", "b", 0, 0, 100, 100)], terrain, tick: 1,
    stakes: [{ holder: "a", mark: "a/meadow", n: 1, weight: 1, tick: 0 },
             { holder: "b", mark: "b/pond", n: 100, weight: 100, tick: 0 }],
  });
  const out = state.marks.find((m) => m.id === "a/meadow");
  assert.deepEqual(out.at, { x: 0, y: 0 }, "the meadow did not move");
  assert.deepEqual(out.extent, { w: 1000, h: 1000 }, "the meadow was not shrunk to what it holds");
  assert.equal(state.determination["a/meadow"].lost_area, 10000, "it lost the ground in the overlay, and only there");
});

test.skip("rect-minus-rect is an L — the meadow's held ground tiles its claim minus the pond", () => {
  const state = fold({
    marks: [sited("meadow", "a", 0, 0, 1000, 1000), sited("pond", "b", -450, -450, 100, 100)], terrain, tick: 1,
    stakes: [{ holder: "a", mark: "a/meadow", n: 1, weight: 1, tick: 0 },
             { holder: "b", mark: "b/pond", n: 100, weight: 100, tick: 0 }],
  });
  const held = state.determination["a/meadow"].held;
  assert.ok(held.length >= 2, "a corner bite cannot be described by one rect — it takes a list");
  assert.equal(areaOf(held), 1000 * 1000 - 100 * 100, "the rects tile the claim minus the bite, with no overlap and no gap");
});

test.skip("one household's own nesting is NOT a contest — the pseudo-contest class, killed", () => {
  // A peak, its porch, and a tree inside the porch: one person's composition. The
  // deleted site-cluster mechanism chained all three into a single slot and scored
  // them against each other; nothing here was ever in dispute.
  const state = fold({
    marks: [sited("peak", "v", 0, 0, 3600, 3600), sited("porch", "v", 100, 100, 300, 300), sited("tree", "v", 100, 100, 20, 20)],
    terrain, tick: 1,
    stakes: [{ holder: "v", mark: "v/peak", n: 10, weight: 10, tick: 0 },
             { holder: "v", mark: "v/porch", n: 5, weight: 5, tick: 0 },
             { holder: "v", mark: "v/tree", n: 1, weight: 1, tick: 0 }],
  });
  assert.equal(ground(state).length, 0, "one household's marks do not rival each other");
  assert.equal(state.vague.length, 0, "and nothing is left permanently vague");
  // the composition is still described: the densest claim holds each cell
  assert.equal(state.determination["v/tree"].held_area, 400, "the tree still holds its own ground");
  assert.equal(state.determination["v/peak"].held_area, 3600 * 3600 - 300 * 300, "the peak keeps everything but the porch");
});

test.skip("hysteresis holds per cell: an incumbent between release and determine keeps its seat, and falls below release", () => {
  const marks = [sited("meadow", "a", 0, 0, 100, 100), sited("pond", "b", 0, 0, 100, 100)];
  const stakes = (an, bn) => [{ holder: "a", mark: "a/meadow", n: an, weight: an, tick: 0 },
                              { holder: "b", mark: "b/pond", n: bn, weight: bn, tick: 0 }];
  // a takes it outright (70%)
  const first = fold({ marks, terrain, tick: 1, stakes: stakes(70, 30) });
  assert.equal(ground(first)[0].determined, "a/meadow");
  // a slips to 45% — past determine, still above release: the incumbent holds
  const held = fold({ marks, terrain, tick: 2, stakes: stakes(45, 55), prev: first });
  assert.equal(ground(held)[0].determined, "a/meadow", "incumbent holds between release and determine");
  // a slips to 35% — below release: it falls, and b is not yet past determine…
  const fell = fold({ marks, terrain, tick: 3, stakes: stakes(35, 65), prev: first });
  assert.equal(ground(fell)[0].determined, "b/pond", "…unless the challenger is past determine, which at 65% it is");
});

test.skip("vague is a real resting state: a fallen incumbent with no challenger past determine leaves the ground to nobody", () => {
  // Three claims on one patch. The incumbent drops to 38% (below release) and the
  // best challenger is only at 42% (below determine) — so the cell resolves to
  // NOBODY rather than to whoever happens to be ahead. Contested-and-unresolved is
  // the honest answer, and MARKS.md calls it the resting state.
  const marks = [sited("one", "a", 0, 0, 100, 100), sited("two", "b", 0, 0, 100, 100), sited("three", "c", 0, 0, 100, 100)];
  const at = (an, bn, cn) => [{ holder: "a", mark: "a/one", n: an, weight: an, tick: 0 },
                              { holder: "b", mark: "b/two", n: bn, weight: bn, tick: 0 },
                              { holder: "c", mark: "c/three", n: cn, weight: cn, tick: 0 }];
  const seated = fold({ marks, terrain, tick: 1, stakes: at(80, 10, 10) });
  assert.equal(ground(seated)[0].determined, "a/one");
  const fallen = fold({ marks, terrain, tick: 2, stakes: at(38, 42, 20), prev: seated });
  assert.equal(ground(fallen)[0].determined, null, "nobody holds it");
  assert.ok(fallen.determination["b/two"].vague_area > 0, "and every claimant is told the ground is vague, not lost");
});

test.skip("incumbency survives a RE-CUT of the grid — a new neighbour must not unseat a sitting winner by bookkeeping", () => {
  const meadow = sited("meadow", "a", 0, 0, 100, 100), pond = sited("pond", "b", 0, 0, 100, 100);
  const stakes = [{ holder: "a", mark: "a/meadow", n: 45, weight: 45, tick: 0 },
                  { holder: "b", mark: "b/pond", n: 55, weight: 55, tick: 0 }];
  const seated = fold({ marks: [meadow, pond], terrain, tick: 1,
    stakes: [{ holder: "a", mark: "a/meadow", n: 70, weight: 70, tick: 0 }, ...stakes.slice(1)] });
  assert.equal(ground(seated)[0].determined, "a/meadow");
  // a third claim arrives and re-cuts the compression: every cell key changes.
  const recut = fold({ marks: [meadow, pond, sited("shed", "c", 40, 40, 20, 20)], terrain, tick: 2, stakes, prev: seated });
  const cell = ground(recut).find((r) => r.claims.some(([id]) => id === "a/meadow"));
  assert.equal(cell.determined, "a/meadow", "the incumbent keeps its seat across a re-cut grid");
});

test.skip("an overlap nobody has backed is not a contest — ⚔ means two households are pushing, not that two rectangles touch", () => {
  const state = fold({
    marks: [sited("one", "a", 0, 0, 100, 100), sited("two", "b", 50, 50, 100, 100)], terrain, tick: 1, stakes: [],
  });
  assert.equal(ground(state).length, 0, "no stamps anywhere, so nothing to compare");
  assert.ok(state.determination["a/one"].vague_area > 0, "but the overlay still says the shared ground is undetermined");
});

test.skip("a sovereign mark and a constitution mark never enter the carve", () => {
  const state = fold({
    marks: [
      sited("district", "a", 0, 0, 1000, 1000),
      { id: "b/b-parcel", slug: "b-parcel", by: "b", household: "b", kind: "parcel", tier: "market", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 }, date: "2026-08-10", body: "p" },
      sited("house", "b", 0, 0, 10, 10),                          // sovereign: inside b's own parcel
      sited("record", "the-town", 0, 0, 500, 500, { tier: "constitution" }),
    ],
    terrain, tick: 1,
    stakes: [{ holder: "a", mark: "a/district", n: 5, weight: 5, tick: 0 },
             { holder: "b", mark: "b/house", n: 50, weight: 50, tick: 0 }],
  });
  const named = new Set(ground(state).flatMap((r) => r.claims.map(([id]) => id)));
  assert.equal(named.has("b/house"), false, "a household's own ground is not the commons' to contest");
  assert.equal(named.has("the-town/record"), false, "constitution binds without stamps and cannot be rivaled");
});
