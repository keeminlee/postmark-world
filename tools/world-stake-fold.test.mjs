// world-stake-fold.test.mjs — escrow becomes ✦weight, and the retirement gate.
//   node --test tools/world-stake-fold.test.mjs
//
// The world half of write-release P3. The town owns the ledger grammar and hands
// this repo a derived escrow artifact (one row per holder/mark), so these tests
// feed the fold the same shape `--stakes` reads. What is under test here is what
// the WORLD does with escrow once it has it:
//
//   • a stake raises the staked mark's own ✦stamps
//   • weight fans UP the containment tree (a stake on a room lifts the house)
//   • escrow on a mark the record does not hold is an ERROR — which is Keemin's
//     retirement rule ("a staked mark cannot retire") stated as an invariant
//   • a net-negative position cannot dim a mark below zero

import test from 'node:test';
import assert from 'node:assert/strict';
import { fold } from './marks-fold.mjs';

// A minimal world: a house containing a room, plus a far-off bench.
// (extent is metres; the fold derives containment from geometry, so the room's
// rect must sit inside the house's for the fan-up to apply.)
const marks = () => [
  { id: 'wright/the-trueing-house', kind: 'sited', by: 'wright', household: 'wright',
    at: { x: 0, y: 0 }, extent: { w: 100, h: 100 }, date: '2026-07-01', body: 'a house' },
  { id: 'wright/the-keystone', kind: 'sited', by: 'wright', household: 'wright',
    at: { x: 5, y: 5 }, extent: { w: 2, h: 2 }, date: '2026-07-02', body: 'a keystone in the house' },
  { id: 'rei/the-low-lanterns', kind: 'sited', by: 'rei', household: 'rei',
    at: { x: 900, y: 900 }, extent: { w: 4, h: 4 }, date: '2026-07-03', body: 'lanterns, far off' },
];
const terrain = { features: [], far_features: [] };
const byId = (state) => new Map(state.marks.map((m) => [m.id, m]));

test('a stake raises the staked mark\'s own ✦stamps', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: 4 },
  ] });
  assert.deepEqual(state.errors, []);
  assert.equal(byId(state).get('rei/the-low-lanterns').stamps, 4);
  assert.equal(byId(state).get('rei/the-low-lanterns').weight, 4, 'a leaf\'s weight is its own stamps');
  assert.equal(byId(state).get('wright/the-keystone').stamps, 0, 'an unstaked mark stays at zero');
});

test('weight fans UP: staking the keystone lifts the house that holds it', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 3 },
  ] });
  assert.deepEqual(state.errors, []);
  const m = byId(state);
  assert.equal(m.get('wright/the-keystone').stamps, 3);
  assert.equal(m.get('wright/the-trueing-house').stamps, 0, 'the house holds no stamps of its own');
  assert.equal(m.get('wright/the-trueing-house').weight, 3, 'but it carries its descendant\'s weight');
});

test('two holders on one mark sum into one escrow', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: 2 },
    { tick: 0, holder: 'wright', mark: 'rei/the-low-lanterns', n: 5 },
  ] });
  assert.deepEqual(state.errors, []);
  assert.equal(byId(state).get('rei/the-low-lanterns').stamps, 7);
});

test('an unstake is a negative row and lowers the weight it raised', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: 5 },
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: -3 },
  ] });
  assert.deepEqual(state.errors, []);
  assert.equal(byId(state).get('rei/the-low-lanterns').stamps, 2);
});

test('THE RETIREMENT GATE: escrow naming a mark the record does not hold is an error', () => {
  // This is what retiring a staked mark looks like from the fold's side — the mark
  // file is gone, the escrow is not. Keemin's rule, as an invariant the fold checks.
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-retired-porch', n: 2 },
  ] });
  assert.equal(state.errors.length, 1);
  assert.match(state.errors[0].error, /cannot be retired/);
  assert.match(state.errors[0].error, /wright\/the-retired-porch/);
});

test('the gate does not fire while the mark is still there', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 2 },
  ] });
  assert.deepEqual(state.errors, [], 'a staked mark that still exists is simply lawful');
});

test('a net-negative position cannot dim a mark below zero', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: 2 },
    { tick: 0, holder: 'dot', mark: 'rei/the-low-lanterns', n: -5 },
  ] });
  assert.equal(byId(state).get('rei/the-low-lanterns').stamps, 0, 'clamped, not negative');
  assert.equal(state.errors.some((e) => /over-withdrawal/.test(e.error ?? '')), true,
    'and it is reported rather than silently clamped');
});

test('no stakes at all folds clean with every weight at zero', () => {
  const state = fold({ marks: marks(), terrain, stakes: [] });
  assert.deepEqual(state.errors, []);
  for (const m of state.marks) assert.equal(m.weight, 0);
});
