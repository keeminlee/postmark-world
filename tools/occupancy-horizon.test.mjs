// occupancy-horizon.test.mjs — the live clock is never behind the record it
// is reading (Linear POS-96, 2026-09-15).
//
// THE INSTANCE. rei pressed "step outside" in the Lanternseed Gardens. The exit
// landed: `2026-09-15T11:29:01.995Z · rei · exits rei/the-lanternseed-gardens ·
// ferry 190.9569`. The page re-read the ledger and rendered once, at that
// instant, asking occupancyAt what was true at fractionalCrossing() — this
// BROWSER's clock. The stamp is the OFFICE's clock, floored to four places
// (0–4.3 s behind the office's instant); measured 2026-09-15 the box runs about
// 1–1.5 s ahead of the founder's PC, so whenever the floor shaves less than
// that skew the act sits a breath AHEAD of the browser's now. The honest answer
// at that instant: still inside. Nothing re-rendered afterwards, so the reader
// stood outside on the record and kept looking at the floor.
//
// Two pure functions answer it. `occupancyHorizon` lifts the clock to the
// newest act within SKEW of now (an act the record holds has happened); acts
// further ahead are left alone (a reader scrubbed into the past is asking what
// was true THEN, and that path takes the override anyway).
//
// THE CAN-FAIL FLIP: make occupancyHorizon return `now` unchanged → the first
// test reds (the reader is still inside at the moment the page renders). Run
// receipt in the hotfix PR.
//
//   node --test tools/occupancy-horizon.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { OCCUPANCY_SKEW, occupancyHorizon, standpointOccupancy } from "../spectator/viewer.mjs";

const ROOM = "rei/the-lanternseed-gardens";
const enter = (at) => ({ handle: "rei", act: "enters", mark: ROOM, at, word: "neutral" });
const exit = (at) => ({ handle: "rei", act: "exits", mark: ROOM, at });

test("an exit stamped a breath AHEAD of the browser's clock puts the reader outside at the very render after the act", () => {
  const now = 190.95687;            // this browser's fractionalCrossing() at the render
  const acts = [enter(190.9235), exit(190.9569)];   // the office's stamps, floored to four places
  // the bug, stated by the pure functions: asked at the raw clock, the exit has not happened yet
  assert.equal(standpointOccupancy({ acts, at: now, handle: "rei" }).insideOf, ROOM,
    "at the raw clock the record still says inside — this is the moment the page rendered on 09-15");
  // the rule: the clock is never behind the record it is reading
  const at = occupancyHorizon(acts, now);
  assert.equal(at, 190.9569, "the horizon is the newest act within skew of now");
  assert.equal(standpointOccupancy({ acts, at, handle: "rei" }).insideOf, null,
    "asked at the horizon, the reader is outside — the view can follow the act it just made");
});

test("an act far ahead of now is NOT pulled in: the horizon is bounded by SKEW", () => {
  const now = 190.95687;
  const acts = [enter(190.9235), exit(now + OCCUPANCY_SKEW * 3)];   // six minutes ahead — not a rounding, a different question
  assert.equal(occupancyHorizon(acts, now), now, "an act beyond the skew leaves the clock alone");
  assert.equal(standpointOccupancy({ acts, at: occupancyHorizon(acts, now), handle: "rei" }).insideOf, ROOM,
    "and the reader is still inside, because that exit has not happened as of now");
});

test("acts behind now, or none at all, leave the clock exactly where it was", () => {
  const now = 190.95687;
  assert.equal(occupancyHorizon([enter(190.9235), exit(190.9483)], now), now);
  assert.equal(occupancyHorizon([], now), now);
  assert.equal(occupancyHorizon([{ handle: "rei", at: "not a number" }], now), now, "an unparseable stamp is ignored, never NaN");
});

test("the skew is two minutes of crossing, and small enough that a rounding cannot reach the next crossing", () => {
  assert.equal(OCCUPANCY_SKEW, 120 / (12 * 3600));
  assert.ok(OCCUPANCY_SKEW < 0.01);
});
