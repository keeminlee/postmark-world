// frames-audit.test.mjs — the census, proven on fixtures. No live data: known
// marks, ledger-derived shapes, and attachment acts go in; the counted census
// comes out. Each case pins one split-brain the live audit is meant to find.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  foldHoldings, categorize, auditCensus, summarize,
  loadHoldings, loadWalkers, loadOccupancy,
} from "./frames-audit.mjs";

// ── foldHoldings: latest act per target wins ─────────────────────────────────

test("foldHoldings: a cascade with no later detach is a current holding", () => {
  const holdings = foldHoldings([
    { entity: "wright", target: "wright/top", policy: "cascade", born_at: "2026-08-22T19:44:00.000Z" },
  ]);
  assert.deepEqual(holdings, [{ thing: "wright/top", holder: "wright" }]);
});

test("foldHoldings: a later detach releases the thing — nobody holds it", () => {
  const holdings = foldHoldings([
    { entity: "sable", target: "sable/beetle", policy: "cascade", born_at: "2026-08-21T23:55:00.000Z" },
    { entity: "sable", target: "sable/beetle", policy: "detach", born_at: "2026-08-21T23:57:00.000Z" },
  ]);
  assert.equal(holdings.length, 0, "the beetle was set down");
});

test("foldHoldings: the last hand to touch a target holds it", () => {
  // little-m attaches the jar, then hal attaches it after — hal holds it now.
  const holdings = foldHoldings([
    { entity: "little-m", target: "grove/jar", policy: "cascade", born_at: "2026-08-15T21:52:24.000Z" },
    { entity: "hal", target: "grove/jar", policy: "cascade", born_at: "2026-08-15T21:52:30.000Z" },
  ]);
  assert.deepEqual(holdings, [{ thing: "grove/jar", holder: "hal" }]);
});

// ── categorize: things apart from furniture ──────────────────────────────────

test("categorize splits class:thing from world furniture", () => {
  const { things, furniture } = categorize([
    { id: "a/top", class: "thing", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 } },
    { id: "a/house", class: null, at: { x: 0, y: 0 }, extent: { w: 12, h: 12 } },
  ]);
  assert.equal(things.length, 1);
  assert.equal(furniture.length, 1);
  assert.equal(things[0].id, "a/top");
});

// ── auditCensus: the split-brains, each counted ──────────────────────────────

test("STALE OCCUPANCY is counted: a walker outside the mark their occupancy claims", () => {
  const census = auditCensus({
    marks: [{ id: "sol/grove", at: { x: -1375, y: -2625 }, extent: { w: 300, h: 300 } }],
    walkers: { sable: { x: 575, y: -1500 } },      // far from the grove
    occupancy: { sable: ["sol/grove"] },
  });
  assert.equal(census.stale_occupancy.count, 1);
  assert.equal(census.stale_occupancy.cases[0].handle, "sable");
  assert.equal(census.stale_occupancy.cases[0].occupies, "sol/grove");
});

test("agreement is silent: a walker truly inside the mark is not stale", () => {
  const census = auditCensus({
    marks: [{ id: "sol/grove", at: { x: -1375, y: -2625 }, extent: { w: 300, h: 300 } }],
    walkers: { nyx: { x: -1375, y: -2625 } },      // at the grove centre
    occupancy: { nyx: ["sol/grove"] },
  });
  assert.equal(census.stale_occupancy.count, 0);
});

test("OCCUPANCY WITHOUT POSITION is counted: entered a mark but has no walk record", () => {
  const census = auditCensus({
    marks: [{ id: "the-town/town-centre", at: { x: 0, y: 0 }, extent: { w: 500, h: 500 } }],
    walkers: {},                                    // illuminator has no departure
    occupancy: { illuminator: ["the-town/town-centre"] },
  });
  assert.equal(census.occupancy_without_position.count, 1);
  assert.equal(census.occupancy_without_position.cases[0].handle, "illuminator");
  // and it is disclosed, not silently dropped
  assert.ok(census.disclosures.find((d) => d.kind === "occupancy-without-position" && d.handle === "illuminator"));
});

test("HELD THINGS compose to their holder when the holder is placed", () => {
  const census = auditCensus({
    marks: [{ id: "wright/top", at: { x: 574, y: -2601 }, extent: { w: 1, h: 1 } }],
    walkers: { wright: { x: -1360, y: -2410 } },    // wright at the archway
    holdings: [{ thing: "wright/top", holder: "wright" }],
  });
  assert.equal(census.held_things.count, 1);
  assert.equal(census.held_things.composing, 1);
  assert.equal(census.held_things.stuck, 0);
  const c = census.held_things.cases[0];
  assert.equal(c.composes, true);
  assert.deepEqual(c.holder_pos, { x: -1360, y: -2410 }, "the top reads with wright, not stranded at home");
});

test("A DANGLING HOLDER is a stuck held-thing, and a fault", () => {
  const census = auditCensus({
    holdings: [{ thing: "wright/top", holder: "ghost" }],   // ghost is in no source
  });
  assert.equal(census.held_things.count, 1);
  assert.equal(census.held_things.composing, 0);
  assert.equal(census.held_things.stuck, 1);
  assert.equal(census.held_things.cases[0].fault, "dangling-holder");
  assert.equal(census.faults.dangling_holders.length, 1);
});

test("totals count entities, things, and furniture apart", () => {
  const census = auditCensus({
    marks: [
      { id: "a/top", class: "thing", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 } },
      { id: "a/house", class: null, at: { x: 10, y: 10 }, extent: { w: 12, h: 12 } },
    ],
    walkers: { wright: { x: 0, y: 0 }, rei: { x: 5, y: 5 } },
  });
  assert.equal(census.totals.entities, 2);
  assert.equal(census.totals.things, 1);
  assert.equal(census.totals.marks, 1);
});

test("summarize renders every section without throwing", () => {
  const census = auditCensus({
    marks: [{ id: "sol/grove", at: { x: -1375, y: -2625 }, extent: { w: 300, h: 300 } }],
    walkers: { sable: { x: 575, y: -1500 } },
    occupancy: { sable: ["sol/grove"], ghost: ["sol/grove"] },
    holdings: [{ thing: "t", holder: "sable" }],
  });
  const text = summarize(census, { at: "now", worldRoot: "fixture", now: 1 });
  assert.match(text, /STALE OCCUPANCY: 1/);
  assert.match(text, /OCCUPANCY WITHOUT POSITION: 1/);
  assert.match(text, /HELD THINGS: 1/);
});

// ── loaders over fixture files (io half, no live data) ───────────────────────

test("loadHoldings reads an attachments JSON snapshot and folds it", () => {
  const p = join(tmpdir(), `fa-att-${process.pid}.json`);
  writeFileSync(p, JSON.stringify([
    { entity: "wright", target: "wright/top", policy: "cascade", born_at: "2026-08-22T19:44:00.000Z" },
    { entity: "sable", target: "sable/beetle", policy: "cascade", born_at: "2026-08-21T23:55:00.000Z" },
    { entity: "sable", target: "sable/beetle", policy: "detach", born_at: "2026-08-21T23:57:00.000Z" },
  ]));
  try {
    const { holdings, disclosure } = loadHoldings({ jsonPath: p });
    assert.equal(disclosure, null);
    assert.deepEqual(holdings, [{ thing: "wright/top", holder: "wright" }]);
  } finally { rmSync(p, { force: true }); }
});

test("loadHoldings discloses when no custody store is reachable", () => {
  const { holdings, disclosure } = loadHoldings({});
  assert.equal(holdings.length, 0);
  assert.equal(disclosure.kind, "holdings-unsourced");
});

test("loadWalkers derives positions and loadOccupancy derives stacks from ledger text", () => {
  const walkP = join(tmpdir(), `fa-walk-${process.pid}.md`);
  const thrP = join(tmpdir(), `fa-thr-${process.pid}.md`);
  // a stopped (zero-distance) departure so the derived position is exact regardless of clock
  writeFileSync(walkP, "# Walk ledger\n- 2026-08-22T00:00:00.000Z · wright · from 100,200 · toward 100,200 · at 100.0000\n");
  writeFileSync(thrP, "# Threshold ledger\n- 2026-08-22T00:00:00.000Z · wright · enters a/house · at 100.0000 · word neutral\n");
  try {
    const { walkers } = loadWalkers(walkP);
    const { occupancy } = loadOccupancy(thrP);
    assert.deepEqual(walkers.wright, { x: 100, y: 200 });
    assert.deepEqual(occupancy.wright, ["a/house"]);
  } finally { rmSync(walkP, { force: true }); rmSync(thrP, { force: true }); }
});
