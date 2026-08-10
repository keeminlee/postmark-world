// weight-parts.test.mjs — a mark's ✦weight, decomposed into where it came from.
//   node --test tools/weight-parts.test.mjs
//
// THE PROBLEM THIS EXISTS FOR: every telling renders `✦<weight>`, and weight is
// three different things added together — the mark's own escrow, the breadth
// bonus the town paid for external households backing it, and everything that
// depends on it fanning up. A reader sees one number and can't tell which.
//
// `weight_parts` is that number's receipt. THE ONE INVARIANT, and the reason
// this file can be trusted as a display change rather than a maths change:
//
//     own_escrow + breadth.bonus + Σ fanned[].weight  ===  weight
//
// exactly, for every mark, with no rounding and no slack. A decomposition that
// does not re-add to the thing it decomposes is a second opinion, not a receipt.
//
// WHERE THE NUMBERS COME FROM. The world has no money and no identity law — the
// town hands it one row per (holder, mark) with raw `n` and a `weight` that has
// the breadth bonus already baked into the first row of each external household
// (see the town's world-stake.mjs § deriveWorldMarkWeights). So the world reads
// breadth back out of the artifact by DIFFERENCE (weight − n per row) rather
// than recomputing it — there is still exactly one implementation of the stake
// law, and it is not this repo's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fold } from './marks-fold.mjs';
import { investigate } from './world-verbs.mjs';
import { effectiveWeight, investigateNameLine } from '../spectator/viewer.mjs';

// A house containing a room containing a shelf, plus a far-off bench: enough
// depth that fan-up has something to fan through, and enough distance that the
// bench is nobody's child.
const marks = () => [
  { id: 'wright/the-trueing-house', kind: 'sited', by: 'wright', household: 'wright',
    at: { x: 0, y: 0 }, extent: { w: 100, h: 100 }, date: '2026-07-01', body: 'a house' },
  { id: 'wright/the-room', kind: 'sited', by: 'wright', household: 'wright',
    at: { x: 10, y: 10 }, extent: { w: 20, h: 20 }, date: '2026-07-02', body: 'a room in the house' },
  { id: 'wright/the-keystone', kind: 'sited', by: 'wright', household: 'wright',
    at: { x: 12, y: 12 }, extent: { w: 2, h: 2 }, date: '2026-07-03', body: 'a keystone in the room' },
  { id: 'rei/the-low-lanterns', kind: 'sited', by: 'rei', household: 'rei',
    at: { x: 900, y: 900 }, extent: { w: 4, h: 4 }, date: '2026-07-04', body: 'lanterns, far off' },
];
const terrain = { features: [], far_features: [] };
const byId = (state) => new Map(state.marks.map((m) => [m.id, m]));
const partsSum = (p) => p.own_escrow + p.breadth.bonus + p.fanned.reduce((n, f) => n + f.weight, 0);

// THE falsifier, run over whatever fold it is handed. Every other test in this
// file is a named instance of it; the real-world run applies it to all 612.
function assertPartsReconstructWeight(state) {
  for (const mk of state.marks) {
    assert.ok(mk.weight_parts, `${mk.id} has no weight_parts`);
    assert.equal(partsSum(mk.weight_parts), mk.weight,
      `${mk.id}: parts sum ${partsSum(mk.weight_parts)} ≠ weight ${mk.weight}`);
  }
}

test('every mark carries weight_parts that re-adds to its weight', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 3, weight: 8 },
    { tick: 0, holder: 'lupi', mark: 'rei/the-low-lanterns', n: 4, weight: 4 },
  ] });
  assert.deepEqual(state.errors, []);
  assertPartsReconstructWeight(state);
});

test('an unstaked, childless mark decomposes to all zeroes — not to nothing', () => {
  const state = fold({ marks: marks(), terrain, stakes: [] });
  const parts = byId(state).get('rei/the-low-lanterns').weight_parts;
  assert.deepEqual(parts, { own_escrow: 0, breadth: { k: null, external_households: 0, bonus: 0 }, fanned: [] });
});

test('own escrow and the breadth bonus separate, and k is read back from the artifact', () => {
  // Two external households on one mark at k=5: raw 2+5=7, bonus 5+5=10, ✦17.
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: 2, weight: 7 },
    { tick: 0, holder: 'lupi', mark: 'rei/the-low-lanterns', n: 5, weight: 10 },
  ] });
  const mk = byId(state).get('rei/the-low-lanterns');
  assert.equal(mk.weight, 17);
  assert.equal(mk.stamps, 7, 'raw escrow stays raw');
  assert.deepEqual(mk.weight_parts.own_escrow, 7);
  assert.deepEqual(mk.weight_parts.breadth, { k: 5, external_households: 2, bonus: 10 });
  assert.deepEqual(mk.weight_parts.fanned, [], 'a leaf fans nothing');
});

test('a second holder from an ALREADY-COUNTED household adds escrow but no breadth', () => {
  // The town gives k to the first row of each external household only, so a
  // second row from that household arrives with weight === n. Breadth must not
  // count it, or the bonus stops meaning "how many others".
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: 2, weight: 7 },
    { tick: 0, holder: 'dot-the-second', mark: 'rei/the-low-lanterns', n: 3, weight: 3 },
  ] });
  const parts = byId(state).get('rei/the-low-lanterns').weight_parts;
  assert.equal(parts.own_escrow, 5);
  assert.deepEqual(parts.breadth, { k: 5, external_households: 1, bonus: 5 });
});

test('fanned names each contributing child by its own fan-up total', () => {
  // The keystone is staked; the room holds the keystone; the house holds the
  // room. Each ancestor's whole weight should be attributed to the child it
  // came through, by name — that is the answer to "why is my house ✦8?".
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 3, weight: 8 },
  ] });
  const m = byId(state);
  assert.equal(m.get('wright/the-trueing-house').weight, 8);
  assert.deepEqual(m.get('wright/the-trueing-house').weight_parts, {
    own_escrow: 0, breadth: { k: null, external_households: 0, bonus: 0 },
    fanned: [{ id: 'wright/the-room', weight: 8 }],
  });
  assert.deepEqual(m.get('wright/the-room').weight_parts.fanned, [{ id: 'wright/the-keystone', weight: 8 }]);
  assert.deepEqual(m.get('wright/the-keystone').weight_parts.fanned, []);
});

test('a mark with BOTH its own escrow and children reports both lanes', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 3, weight: 8 },
    { tick: 0, holder: 'lupi', mark: 'wright/the-trueing-house', n: 4, weight: 9 },
  ] });
  const parts = byId(state).get('wright/the-trueing-house').weight_parts;
  assert.deepEqual(parts, {
    own_escrow: 4, breadth: { k: 5, external_households: 1, bonus: 5 },
    fanned: [{ id: 'wright/the-room', weight: 8 }],
  });
  assert.equal(byId(state).get('wright/the-trueing-house').weight, 17, '4 + 5 + 8');
});

test('a child contributing nothing is left out of fanned, and the sum still closes', () => {
  // Silence is not a component. Listing 40 children at ✦0 would bury the one
  // that matters, and dropping them cannot break the invariant precisely
  // because they add zero.
  const state = fold({ marks: marks(), terrain, stakes: [] });
  const parts = byId(state).get('wright/the-trueing-house').weight_parts;
  assert.deepEqual(parts.fanned, []);
  assert.equal(partsSum(parts), byId(state).get('wright/the-trueing-house').weight);
});

// ── the vocabulary, and the readers that depend on it ────────────────────────
// `stamps` carried `m.weight` on every one of investigate's relation lines until
// 2026-08-10 — the effective figure under the raw figure's name. These pin the
// two words apart, because a mislabel is only ever found by someone comparing
// two surfaces, and by then it has been believed for a while.

const staked = () => fold({ marks: marks(), terrain, stakes: [
  { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 3, weight: 8 },
] });

test('investigate reports raw escrow as stamps and the effective figure as weight', () => {
  const inv = investigate('wright/the-trueing-house', staked(), { budget: 12 });
  assert.equal(inv.stamps, 0, 'the house holds no escrow of its own');
  assert.equal(inv.weight, 8, 'but it carries the keystone fanning up');
  const room = inv.children.find((c) => c.id === 'wright/the-room');
  assert.equal(room.stamps, 0);
  assert.equal(room.weight, 8);
});

test('investigate carries the breakdown on the target, and only there', () => {
  const inv = investigate('wright/the-trueing-house', staked(), { budget: 12 });
  assert.deepEqual(inv.weight_parts, {
    own_escrow: 0, breadth: { k: null, external_households: 0, bonus: 0 },
    fanned: [{ id: 'wright/the-room', weight: 8 }],
  });
  assert.equal(partsSum(inv.weight_parts), inv.weight);
  for (const relative of inv.children) assert.equal(relative.weight_parts, undefined,
    'a relation line is an identity, not a second breakdown');
});

test('the viewer shows the EFFECTIVE figure, not raw escrow', () => {
  // The bug this pins: cells read the fold record's `stamps` while the drilled
  // crumb read investigate's `stamps`, so one mark showed ✦0 in the telling and
  // ✦8 once opened. One mark, one number.
  assert.equal(effectiveWeight({ stamps: 0, weight: 8 }), 8);
  assert.equal(effectiveWeight({ stamps: 3, weight: 3 }), 3);
  assert.equal(effectiveWeight({ stamps: 4 }), 4, 'falls back where no weight was folded');
  assert.equal(effectiveWeight(null), 0);
  assert.equal(effectiveWeight({ weight: -2 }), 0, 'never renders a negative backing');
  assert.match(investigateNameLine({ id: 'wright/the-trueing-house', stamps: 0, weight: 8 }), />✦ 8</,
    'a relation line prints what the mark actually carries');
});

export { assertPartsReconstructWeight, partsSum };
