#!/usr/bin/env node
// consent.test.mjs — the three-word `m` (tools/consent.mjs; ECONOMY.md §9.2).
// Run: node --test tools/consent.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { fold } from "./marks-fold.mjs";

const terrain = { features: [] };
const sited = (id, by, x, y, w, h, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "sited", tier: "market",
  at: { x, y }, extent: { w, h }, date: "2026-08-10", body: id, ...extra,
});
const parcel = (id, by, x, y, extra = {}) => ({
  id: `${by}/${id}`, slug: id, by, household: by, kind: "parcel", tier: "market",
  at: { x, y }, extent: { w: 25, h: 25 }, date: "2026-08-10", body: id, ...extra,
});
const stake = (holder, mark, n) => ({ holder, mark, n, weight: n, tick: 0 });
const w = (state, id) => state.marks.find((m) => m.id === id)?.weight;
const standing = (state, id) => state.marks.some((m) => m.id === id);

// ── the default table ────────────────────────────────────────────────────────

test("cross-household, no word: the mark exists on its own stamps and lends nothing either way", () => {
  const state = fold({
    marks: [sited("terrace", "wright", 0, 0, 1000, 1000), sited("flower", "stranger", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [stake("s", "stranger/flower", 6)],
  });
  assert.equal(w(state, "wright/terrace"), 0, "the terrace does not harvest a stranger's flower");
  assert.equal(w(state, "stranger/flower"), 6, "and the flower keeps every stamp of its own");
});

test("same CREDENTIAL household composes across handles — two handles of one person are not strangers", () => {
  // rei and wright are two handles pinned to one credential household. Before the
  // grain ruling this fold compared HANDLES, so a person's own two marks were
  // cross-household to each other and stopped composing.
  const marks = [sited("terrace", "wright", 0, 0, 1000, 1000), sited("flower", "rei", 0, 0, 10, 10)];
  const stakes = [stake("s", "rei/flower", 6)];
  const together = fold({ marks, terrain, tick: 1, stakes, households: { rei: "gh:1", wright: "gh:1" } });
  assert.equal(w(together, "wright/terrace"), 6, "one household, so the flower composes into the terrace");
  const apart = fold({ marks, terrain, tick: 1, stakes, households: { rei: "gh:1", wright: "gh:2" } });
  assert.equal(w(apart, "wright/terrace"), 0, "two households, so it does not");
});

test("SOVEREIGNTY is credential-grain: a mark inside the household's OTHER handle's parcel is sovereign", () => {
  // The headline: today a person with two handles is a stranger on their own
  // ground — their own mark standing in their own parcel folds as a commons mark.
  const marks = [parcel("home-parcel", "wright", 0, 0), sited("flower", "rei", 0, 0, 4, 4)];
  const one = fold({ marks, terrain, tick: 1, stakes: [], households: { rei: "gh:1", wright: "gh:1" } });
  assert.equal(one.marks.find((m) => m.id === "rei/flower").sovereign, true, "one household: sovereign on its own ground");
  const two = fold({ marks, terrain, tick: 1, stakes: [], households: { rei: "gh:1", wright: "gh:2" } });
  assert.equal(two.marks.find((m) => m.id === "rei/flower").sovereign, false, "two households: a guest, exposed to rivalry");
});

test("class law: a the-town region container takes fan-up from what stands in it; a resident district does not", () => {
  const inner = sited("bench", "stranger", 0, 0, 10, 10);
  const townRegion = fold({
    marks: [sited("centre", "the-town", 0, 0, 2000, 2000, { region_container: true }), inner],
    terrain, tick: 1, stakes: [stake("s", "stranger/bench", 4)],
  });
  assert.equal(w(townRegion, "the-town/centre"), 4, "a region is exactly as real as what stands in it");
  const residentRegion = fold({
    marks: [sited("district", "limen", 0, 0, 2000, 2000), inner], terrain, tick: 1, stakes: [stake("s", "stranger/bench", 4)],
  });
  assert.equal(w(residentRegion, "limen/district"), 0, "a resident district stays neutral until the town converts it");
});

// ── welcomed ─────────────────────────────────────────────────────────────────

test("welcomed: a cross-household edge fans up, and the mark is carried as kept", () => {
  const state = fold({
    marks: [sited("terrace", "wright", 0, 0, 1000, 1000, { consent: { "stranger/flower": "welcomed" } }),
            sited("flower", "stranger", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [stake("s", "stranger/flower", 6)],
  });
  assert.equal(w(state, "wright/terrace"), 6, "the word opens the edge");
  assert.equal(state.marks.find((m) => m.id === "stranger/flower").kept, true, "and the flower is kept, for whoever renders it");
});

test("welcomed does NOT fan DOWN — the lending question is unruled, so it is not built", () => {
  const state = fold({
    marks: [sited("terrace", "wright", 0, 0, 1000, 1000, { consent: { "stranger/flower": "welcomed" } }),
            sited("flower", "stranger", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [stake("s", "wright/terrace", 100)],
  });
  assert.equal(w(state, "stranger/flower"), 0, "a strong parent does not make its guest strong (ECONOMY.md §9.2 concern 2)");
});

// ── opposed: the veto ────────────────────────────────────────────────────────

test("THE STRADDLER: a foreign mark merely OVERLAPPING a parcel answers the parcel's word — no containment, no tree edge", () => {
  // The parcel is 25x25 at the origin. The hall is 100x100 sitting mostly outside
  // it and overlapping 40% of it. It is NOT contained by the parcel, and a parcel
  // is not a tree parent of anything — so a consent rule keyed on containment or
  // on the tree could not reach this mark at all, and the fence would only hold
  // against neighbours polite enough to build entirely inside it.
  const marks = [
    parcel("home", "holder", 0, 0, { consent: { "foreign/hall": "opposed" } }),
    sited("hall", "foreign", 52.5, 0, 100, 100),
  ];
  const state = fold({ marks, terrain, tick: 1, stakes: [] });

  const hall = { x: 52.5, y: 0, w: 100, h: 100 }, fence = { x: 0, y: 0, w: 25, h: 25 };
  const overlap = (Math.min(hall.x + 50, 12.5) - Math.max(hall.x - 50, -12.5)) * 25;
  assert.equal(overlap / (25 * 25), 0.4, "the hall overlaps 40% of the parcel");
  assert.ok(hall.x - 50 > fence.x - fence.w / 2, "and is not contained by it — it hangs out the far side");

  assert.equal(standing(state, "foreign/hall"), false, "the hall is returned");
  assert.equal(state.returned.length, 1);
  assert.equal(state.returned[0].mark, "foreign/hall");
  assert.equal(state.returned[0].returned_from, "holder/home");
  assert.equal(state.returned[0].authority, "parcel (absolute)");
  assert.equal(state.returned[0].state, "returned");

  // the control shot: the same geometry with the word withdrawn
  const consented = fold({ marks: [parcel("home", "holder", 0, 0), marks[1]], terrain, tick: 1, stakes: [] });
  assert.equal(standing(consented, "foreign/hall"), true, "without the word it simply stands");
  assert.equal(consented.returned.length, 0);
});

test("a parcel's word is ABSOLUTE where a commons parent's is EARNED — the same unstaked grantor, two outcomes", () => {
  // Both grantors have staked nothing. On parcel ground that changes nothing: the
  // holder's word stands on its own, and the hall is returned. On a commons edge
  // the identical word moves nothing at all, because there the veto must be earned.
  const hall = sited("hall", "foreign", 0, 0, 100, 100);
  const word = { "foreign/hall": "opposed" };

  const onGround = fold({ marks: [parcel("home", "holder", 0, 0, { consent: word }), hall], terrain, tick: 1, stakes: [] });
  assert.equal(standing(onGround, "foreign/hall"), false, "a parcel holder need not out-stake anyone on their own ground");
  assert.equal(onGround.returned[0].state, "returned");

  const onCommons = fold({ marks: [sited("estate", "holder", 0, 0, 1000, 1000, { consent: word }), hall], terrain, tick: 1, stakes: [] });
  assert.equal(standing(onCommons, "foreign/hall"), true, "the same unstaked word in the commons moves nothing");
});

test("on a COMMONS edge the veto is EARNED: a backed parent turns away a weak child, a weak parent cannot", () => {
  const estate = (consent) => sited("estate", "a", 0, 0, 1000, 1000, { consent });
  const shed = sited("shed", "b", 0, 0, 100, 100);
  const word = { "b/shed": "opposed" };

  const strong = fold({ marks: [estate(word), shed], terrain, tick: 1, stakes: [stake("s", "a/estate", 100)] });
  assert.equal(standing(strong, "b/shed"), false, "a parent at density 1e-4 turns away a child at 0");
  assert.equal(strong.returned[0].authority, "commons edge (earned)");

  const outmatched = fold({ marks: [estate(word), shed], terrain, tick: 1,
    stakes: [stake("s", "a/estate", 100), stake("s", "b/shed", 5)] });
  assert.equal(standing(outmatched, "b/shed"), true, "a child at 5e-4 outweighs the same parent and stands");
});

test("an UNSTAKED parent's veto moves nothing — with nobody backing either side, a word is only a word", () => {
  const state = fold({
    marks: [sited("estate", "a", 0, 0, 1000, 1000, { consent: { "b/shed": "opposed" } }), sited("shed", "b", 0, 0, 100, 100)],
    terrain, tick: 1, stakes: [],
  });
  assert.equal(standing(state, "b/shed"), true, "influence is proportional to backing, and this parent has none");
  assert.equal(state.returned.length, 0);
});

// ── returned, never dropped ──────────────────────────────────────────────────

test("a returned mark takes its subtree, and every member is disclosed by name", () => {
  const marks = [
    parcel("home", "holder", 0, 0, { consent: { "foreign/hall": "opposed" } }),
    sited("hall", "foreign", 0, 0, 100, 100),
    sited("room", "foreign", 0, 0, 10, 10),
    { id: "foreign/warm", slug: "warm", by: "foreign", household: "foreign", kind: "predicated",
      tier: "market", parent: "foreign/hall", slot: "feel", value: "warm", date: "2026-08-10", body: "warm" },
  ];
  const state = fold({ marks, terrain, tick: 1, stakes: [] });

  assert.equal(state.returned.length, 1, "one return, not one per member");
  assert.deepEqual(state.returned[0].subtree.sort(), ["foreign/room", "foreign/warm"]);
  for (const id of ["foreign/hall", "foreign/room", "foreign/warm"]) assert.equal(standing(state, id), false, `${id} left`);

  // never a silent drop: everything missing from the world is named in returned[]
  const disclosed = new Set(state.returned.flatMap((r) => [r.mark, ...r.subtree]));
  const missing = marks.map((m) => m.id).filter((id) => !standing(state, id));
  assert.deepEqual(missing.filter((id) => !disclosed.has(id)), [], "nothing vanished unannounced");
});

test("the ESCROW GUARD: a veto on a mark carrying open stakes records pending-escrow, and the mark stands", () => {
  const marks = [parcel("home", "holder", 0, 0, { consent: { "foreign/hall": "opposed" } }), sited("hall", "foreign", 0, 0, 100, 100)];
  const state = fold({ marks, terrain, tick: 1, stakes: [{ holder: "backer", mark: "foreign/hall", n: 3, weight: 3, tick: 0 }] });
  assert.equal(state.returned[0].state, "pending-escrow", "escrow implies existence — the return waits");
  assert.deepEqual(state.returned[0].open_escrow_on, ["foreign/hall"]);
  assert.equal(standing(state, "foreign/hall"), true, "the mark stands until the stakes unwind");
  assert.equal(w(state, "foreign/hall"), 3, "with its weight intact");
});

test("escrow ANYWHERE in the subtree holds the whole return — a staked child cannot be retired by its parent's eviction", () => {
  const marks = [
    parcel("home", "holder", 0, 0, { consent: { "foreign/hall": "opposed" } }),
    sited("hall", "foreign", 0, 0, 100, 100),
    sited("room", "foreign", 0, 0, 10, 10),
  ];
  const state = fold({ marks, terrain, tick: 1, stakes: [{ holder: "backer", mark: "foreign/room", n: 2, weight: 2, tick: 0 }] });
  assert.equal(state.returned[0].state, "pending-escrow");
  assert.deepEqual(state.returned[0].open_escrow_on, ["foreign/room"]);
  assert.equal(standing(state, "foreign/hall"), true);
  assert.equal(standing(state, "foreign/room"), true);
});

test("a household never consents to itself, and an unknown word is a fold error rather than a silent no-op", () => {
  const own = fold({
    marks: [parcel("home", "holder", 0, 0, { consent: { "holder/shed": "opposed" } }), sited("shed", "holder", 0, 0, 10, 10)],
    terrain, tick: 1, stakes: [],
  });
  assert.equal(standing(own, "holder/shed"), true, "you cannot evict yourself by writing it down");

  const nonsense = fold({
    marks: [parcel("home", "holder", 0, 0, { consent: { "foreign/hall": "maybe" } }), sited("hall", "foreign", 0, 0, 100, 100)],
    terrain, tick: 1, stakes: [],
  });
  assert.equal(nonsense.errors.length, 1, "a word this world does not know is said out loud");
  assert.match(nonsense.errors[0].error, /not a word this world knows/);
  assert.equal(standing(nonsense, "foreign/hall"), true, "and nothing acts on it");
});
