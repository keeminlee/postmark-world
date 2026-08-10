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
import { backingButton, effectiveWeight, investigateNameLine, stakeBackersHTML } from '../spectator/viewer.mjs';

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
//
// TWO OBLIGATIONS, because the breakdown is now emitted only where it explains
// something. Present: it must re-add to weight exactly. Absent: the mark must
// genuinely have nothing — weight 0 AND no escrow of its own. An omission that
// is merely convenient rather than true would hide exactly the marks a reader
// most wants explained, so absence is checked against the derive, not trusted.
function assertPartsReconstructWeight(state) {
  for (const mk of state.marks) {
    if (mk.weight_parts) {
      assert.equal(partsSum(mk.weight_parts), mk.weight,
        `${mk.id}: parts sum ${partsSum(mk.weight_parts)} ≠ weight ${mk.weight}`);
      continue;
    }
    assert.equal(mk.weight, 0, `${mk.id}: weight ${mk.weight} but no weight_parts to explain it`);
    assert.equal(mk.stamps, 0, `${mk.id}: holds ${mk.stamps} escrow but no weight_parts`);
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

test('a mark with nothing to explain carries NO weight_parts, and that reads as zero', () => {
  // The founder's trim: 566 of 612 marks were carrying an all-zero skeleton that
  // cost 104.5 KB of a browser-fetched file to say nothing. Absent is the
  // ordinary case and means all-zero — it must never come to mean "unknown".
  const state = fold({ marks: marks(), terrain, stakes: [] });
  for (const mk of state.marks) {
    assert.equal(mk.weight_parts, undefined, `${mk.id} should carry no breakdown`);
    assert.equal(mk.weight, 0);
  }
  assert.ok(!('weight_parts' in byId(state).get('rei/the-low-lanterns')),
    'omitted entirely — not present-and-null, which a reader would have to tell apart from absence');
});

test('a mark that carries something KEEPS its breakdown while its neighbours drop theirs', () => {
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-keystone', n: 3, weight: 8 },
  ] });
  const m = byId(state);
  // the staked leaf and every ancestor it fans through keep theirs
  for (const id of ['wright/the-keystone', 'wright/the-room', 'wright/the-trueing-house'])
    assert.ok(m.get(id).weight_parts, `${id} carries weight and must explain it`);
  // the far-off bench, touched by none of it, drops its
  assert.equal(m.get('rei/the-low-lanterns').weight_parts, undefined);
  assertPartsReconstructWeight(state);
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
  // because they add zero. Here the house has one staked descendant and one
  // silent sibling branch: only the loud one is named.
  const state = fold({ marks: marks(), terrain, stakes: [
    { tick: 0, holder: 'dot', mark: 'wright/the-room', n: 2, weight: 2 },
  ] });
  const house = byId(state).get('wright/the-trueing-house');
  assert.deepEqual(house.weight_parts.fanned, [{ id: 'wright/the-room', weight: 2 }]);
  assert.equal(byId(state).get('wright/the-keystone').weight_parts, undefined,
    'the unstaked keystone inside the room contributes nothing and says nothing');
  assert.equal(partsSum(house.weight_parts), house.weight);
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

// ── the chip and the popover are one number ──────────────────────────────────
// THE PROBE THAT WOULD HAVE CAUGHT THE MISS. The stranded reader was
// loadStakeBackers: it headlined the door's raw `escrow` while the chip that
// opens it showed raw too, so they agreed by accident. Making the chip
// effective broke that accident on 16 live marks. The sweep that missed it
// searched for the field NAME that changed (`.stamps`); this reader displays the
// same CONCEPT under a different name (`.escrow`). So the probe is written
// against the concept: whatever these two surfaces show, they show the same.

const chipLabel = (html) => html.match(/✦ [\d,]+/)?.[0] ?? null;

test('the backing chip and the popover it opens never disagree', () => {
  // pando-peak's real shape: 8 staked on it, 10 breadth, 90 fanning up = ✦108.
  // Before the fix the chip read ✦108 and this popover read ✦8.
  const mark = {
    id: 'the-town/pando-peak', weight: 108, stamps: 8,
    weight_parts: {
      own_escrow: 8, breadth: { k: 5, external_households: 2, bonus: 10 },
      fanned: [{ id: 'vermillion/the-pando-peak', weight: 90 }],
    },
  };
  const chip = chipLabel(backingButton(mark.id, effectiveWeight(mark)));
  const popover = chipLabel(stakeBackersHTML({
    weight: effectiveWeight(mark), weightParts: mark.weight_parts,
    holders: [{ holder: 'vermillion', amount: 5 }, { holder: 'gael-renton', amount: 3 }],
    liveEscrow: 8,
  }));
  assert.equal(chip, '✦ 108');
  assert.equal(popover, chip, 'the headline must be the number on the chip that opened it');
});

test('the popover shows every lane that built the number, and the holders under the escrow', () => {
  const html = stakeBackersHTML({
    weight: 108,
    weightParts: {
      own_escrow: 8, breadth: { k: 5, external_households: 2, bonus: 10 },
      fanned: [{ id: 'vermillion/the-pando-peak', weight: 90 }],
    },
    holders: [{ holder: 'vermillion', amount: 5 }, { holder: 'gael-renton', amount: 3 }],
    liveEscrow: 8,
  });
  assert.match(html, /staked on it<\/span><span class="amount">✦ 8</);
  assert.match(html, /2 other households backing it<\/span><span class="amount">✦ 10</);
  assert.match(html, /1 mark inside it<\/span><span class="amount">✦ 90</);
  assert.match(html, /vermillion/);
  assert.doesNotMatch(html, /Settlement/, 'nothing is pending when live escrow already matches the settled figure');
});

test('a mark with no breakdown still headlines its own number, and says no one yet', () => {
  const html = stakeBackersHTML({ weight: 0, weightParts: null, holders: [], liveEscrow: 0 });
  assert.equal(chipLabel(html), '✦ 0');
  assert.match(html, /no one yet/);
  assert.match(html, /staked on it<\/span><span class="amount">✦ 0</, 'absent parts read as zero, not as unknown');
});

test('escrow laid since the last Settlement is named as pending, not silently reconciled', () => {
  // A resident who staked this morning must not read a stale ✦ as a refusal.
  const html = stakeBackersHTML({
    weight: 5, weightParts: { own_escrow: 5, breadth: { k: null, external_households: 0, bonus: 0 }, fanned: [] },
    holders: [{ holder: 'dot', amount: 9 }], liveEscrow: 9,
  });
  assert.equal(chipLabel(html), '✦ 5', 'the headline still agrees with the chip, which is settled');
  assert.match(html, /✦ 9 is staked on it now — the difference lands at the next Settlement\./);
});

export { assertPartsReconstructWeight, partsSum };
