#!/usr/bin/env node
// parcels-fold.test.mjs — the fold publishes parcels, because THE PARCEL IS THE
// HOME (write-release ruling 7).
//   node --test tools/parcels-fold.test.mjs
//
// Why this file exists: nothing tested assembleWorld's output shape, and the
// walk draft's home resolution read `world.parcels` off the fold — which the
// fold did not publish. Every walker silently started at the quay instead of on
// their own ground. It hid because "no parcel → the quay" is also LEGITIMATE
// behaviour for an unplaced resident, so total failure looked ordinary.
//
// The lesson these tests encode: when a fallback is indistinguishable from
// success, the contract that feeds it needs a test that can fail loudly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleWorld } from "./world-build.mjs";

const WORLD = join(dirname(fileURLToPath(import.meta.url)), "..", "WORLD");
const live = () => ({
  worldState: JSON.parse(readFileSync(join(WORLD, "world-state.json"), "utf8")),
  skeleton: JSON.parse(readFileSync(join(WORLD, "skeleton.json"), "utf8")),
});

test("assembleWorld publishes parcels — the contract home resolution reads", () => {
  const w = assembleWorld(live());
  assert.ok(Array.isArray(w.parcels), "the fold must publish a parcels array");
  assert.ok(w.parcels.length > 0, "the live record has parcels; the fold must not drop them");
  for (const p of w.parcels) {
    assert.ok(p.household, `${p.id} carries the household it belongs to`);
    assert.equal(typeof p.at?.x, "number", `${p.id} carries a centre`);
    assert.equal(typeof p.at?.y, "number", `${p.id} carries a centre`);
    assert.ok(p.extent?.w > 0 && p.extent?.h > 0, `${p.id} carries ground with area`);
  }
});

test("the published parcels match the record — pass-through, not re-derivation", () => {
  const { worldState, skeleton } = live();
  const w = assembleWorld({ worldState, skeleton });
  assert.deepEqual(w.parcels, worldState.parcels,
    "the fold hands the parcels through untouched; re-deriving them would be a second source of truth");
});

test("one parcel per household — home resolution can take the first match", () => {
  // homeCoords does `parcels.find(p => p.household === hh)`. That is only correct
  // if a household cannot hold two parcels; if that ever changes, this fails and
  // the office must choose deliberately rather than silently taking the first.
  const w = assembleWorld(live());
  const seen = new Map();
  for (const p of w.parcels) {
    assert.ok(!seen.has(p.household),
      `${p.household} holds both ${seen.get(p.household)} and ${p.id} — find() would pick arbitrarily`);
    seen.set(p.household, p.id);
  }
});

test("a placed household resolves to ground, NOT the quay — the bug this file was written for", () => {
  // The end-to-end shape of the defect: resolve a known placed resident the way
  // the office does and assert the answer is their own ground. Before the fold
  // published parcels this returned the quay (0,0) for every resident alive.
  const w = assembleWorld(live());
  const QUAY = { x: 0, y: 0 };
  const householdOf = (handle) => (w.marks ?? []).find((m) => m.by === handle && m.household)?.household ?? handle;
  const parcelOf = (handle) => (w.parcels ?? []).find((p) => p.household === householdOf(handle)) ?? null;

  const parcel = parcelOf("wright");
  assert.ok(parcel, "wright has ground on the map, so a parcel must resolve");
  assert.notDeepEqual({ x: parcel.at.x, y: parcel.at.y }, QUAY,
    "a placed resident must not fall back to the quay");

  // and the negative: an unplaced handle still legitimately has no ground
  assert.equal(parcelOf("nobody-lives-here-xyz"), null, "an unplaced handle has no parcel — the quay default is correct for them");
});

test("assembleWorld's older keys survive the addition", () => {
  // Adding parcels must not disturb what the spectator and the verbs already read.
  const w = assembleWorld(live());
  for (const k of ["marks", "terrain", "heightfield", "light", "fogCeilingM"])
    assert.ok(k in w, `${k} is still published`);
  assert.ok(w.marks.length > 0);
});
