// viewer-camera-bounds.test.mjs — the camera's two housekeeping laws.
//
// Both were reported by the founder on 2026-08-21, and both were measured in a
// browser before they were fixed (the numbers are in the branch's handback):
//
//   "there's a bug where hitting 'step outside' for some reason locks the min
//    zoom of your camera to its current state"
//   "we should also lock pan to the edges of the max zoom"
//
// The camera itself lives inside a mounted scene's closure and needs a DOM, so
// what is pinned here is the arithmetic it delegates to, plus the source-level
// claim that it is the ONE place each rule is applied. A regression has to
// either change the arithmetic — which these notice — or route around the one
// owner, which the last two tests notice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clampViewToBounds, frameWidthFor, frameHeightFor } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");
const PAINTING = { x: 0, y: 0, w: 1500, h: 2400 };   // the town's own viewBox, as it stands

// ── #4, the pan fence ───────────────────────────────────────────────────────

test('LOCK PAN TO THE EDGES: a view inside the painting is left alone, and one dragged past an edge is put back on it', () => {
  const inside = { x: 400, y: 900, w: 200, h: 320 };
  assert.deepEqual(clampViewToBounds(inside, PAINTING), { x: 400, y: 900 }, "a lawful view is not moved");

  // measured on main before the fix: forty hard drags took the camera to
  // y = -740, seven hundred metres of viewBox off the top of the painting
  assert.deepEqual(clampViewToBounds({ x: 44, y: -740, w: 25, h: 40 }, PAINTING), { x: 44, y: 0 },
    "dragged off the top, the camera comes back to the top edge");
  assert.deepEqual(clampViewToBounds({ x: -600, y: 100, w: 25, h: 40 }, PAINTING), { x: 0, y: 100 });
  assert.deepEqual(clampViewToBounds({ x: 9000, y: 9000, w: 25, h: 40 }, PAINTING), { x: 1475, y: 2360 },
    "and off the far corner, back to the far corner — the view's own size is what it stops short by");
});

test("a view larger than the painting is CENTRED in it, not refused — the letterbox case", () => {
  assert.deepEqual(clampViewToBounds({ x: 12345, y: -999, w: 3000, h: 4800 }, PAINTING), { x: -750, y: -1200 },
    "twice the painting, centred on it, wherever the caller thought it was");
  // exactly the painting is the boundary between the two arms and must be stable
  assert.deepEqual(clampViewToBounds({ x: 0, y: 0, w: 1500, h: 2400 }, PAINTING), { x: 0, y: 0 });
  // a room's own fence is its own ground, and the same rule serves it
  const room = { x: 0, y: 0, w: 960, h: 960 };
  assert.deepEqual(clampViewToBounds({ x: -400, y: 2000, w: 240, h: 240 }, room), { x: 0, y: 720 });
});

test("THE FENCE HAS ONE OWNER: every camera write goes through applyView, and applyView clamps", () => {
  // wheel, drag, tween, setView and refit all end in applyView — so clamping
  // there is what makes the fence unroutable-around. A regression that clamps
  // in the drag handler instead would pass the arithmetic tests above and let
  // the wheel walk straight off the edge.
  assert.match(SOURCE, /function applyView\(\)\s*\{[\s\S]{0,400}?clampView\(\)/,
    "applyView must clamp before it writes the viewBox");
  // THE FENCE IS THE ZOOM WINDOW, NOT THE PAINTING (founder, 2026-08-22:
  // "let-there-be-light's pan window needs to be unlimited, or set to its
  // giant dimensions" — the painting-extent fence made Pando Peak and the far
  // country unreachable by hand). Outdoors the fence is `full` scaled by
  // zoomOutLimit (60× the town painting); a room passes zoomOutLimit 1, so its
  // fence is still its own walls — the room ruling stands, byte-for-byte.
  assert.match(SOURCE, /const fence = zoomOutLimit > 1\s*\?[\s\S]{0,300}?w: full\.w \* zoomOutLimit, h: full\.h \* zoomOutLimit[\s\S]{0,60}?: full;/,
    "the fence is the painting scaled by zoomOutLimit outdoors, and the painting itself for a room");
  assert.match(SOURCE, /const clampView = \(\) => Object\.assign\(view, clampViewToBounds\(view, fence\)\)/,
    "and the scene's clamp must be the shared arithmetic, over that fence");
});

// ── #3, the zoom the reader keeps when they step outside ────────────────────

test('STEP OUTSIDE MUST NOT SHRINK THE VIEW: "locks the min zoom of your camera to its current state"', () => {
  // the lock-on rule, unchanged: being shown a thing takes you to it
  assert.equal(frameWidthFor({ viewW: 1200, fullW: 1500 }), 375, "a wide view tightens to a quarter of the painting");
  assert.equal(frameWidthFor({ viewW: 200, fullW: 1500 }), 200, "an already-tight view is not widened");

  // the exit rule: the reader did not ask to be taken anywhere
  assert.equal(frameWidthFor({ viewW: 1200, fullW: 1500, keepZoom: true }), 1200);
  assert.equal(frameWidthFor({ viewW: 1236.48, fullW: 960, keepZoom: true }), 1236.48,
    "leaving a room whose ground is narrower than the view still keeps the view");

  // THE MEASURED CASE. On main, stepping out of wright/the-trueing-house — a
  // dwelling nested inside his terrace — took the view from 1236.5 to 240,
  // a fifth of what it was, inside a scene capped at its own walls. With the
  // exit framing it keeps what it had.
  assert.ok(frameWidthFor({ viewW: 1236.48, fullW: 960 }) < 1236.48 / 4,
    "the old rule really did land the reader under a quarter of where they were");
  assert.equal(frameWidthFor({ viewW: 1236.48, fullW: 960, keepZoom: true }) / 1236.48, 1);
});

test("THE EXIT IS THE ONLY CALLER THAT KEEPS ITS ZOOM — lock-on and follow still take you to the thing", () => {
  assert.match(SOURCE, /frameOn\(rim, \{ keepZoom: true \}\)/,
    "stepping outside frames the door without changing the zoom");
  assert.equal((SOURCE.match(/keepZoom: true/g) ?? []).length, 1,
    "and it is the ONLY caller that keeps its zoom — a second one would need its own reason");
  assert.match(SOURCE, /const target = mapCtx\.frameOn\(\);/,
    "lock-on still asks for the default framing, which takes you to the thing");
  // and the warm-the-painting fix rides at the two places the town is parked,
  // not in the exit path — the reader is coming back, so the art is fetched
  // while they are indoors instead of all at once on the way out
  assert.equal((SOURCE.match(/warmTownArt\(/g) ?? []).length, 3,
    "warmTownArt: declared once, and called at BOTH places the town is set aside — stashed when a room mounts over it, and parked when the painting lands while a room is already up. Only the second fires for a reader who arrives already indoors, which is the common case.");
  assert.doesNotMatch(SOURCE, /async function stepOutside[\s\S]{0,2500}warmTownArt/,
    "and never from the exit path — by then the reader is already waiting");
});

// ── #6, the labels that shrank on an inside→outside switch ──────────────────
//
// Founder, 2026-08-21: "when you switch from one entered resident to one
// outside resident, the labels get tiny. if you close and reopen the Telling
// the labels are back to normal."
//
// SAME ROOT AS #3, which is why it lives in this file: both are frameOn handing
// back a view that was not derived for the rectangle it is about to be shown
// in. #3 was the width; this is the height.

test('LABELS DO NOT SHRINK ON A RESIDENT SWITCH: a framed view takes its height from the PANE, not the painting', () => {
  // the measured case, same 760x1000 pane throughout: the switch recentred with
  // a painting-shaped height of 600 where the pane wanted 493.4, and every
  // atlas place-name — set in painting units, so it scales with the view —
  // rendered at 30 px instead of 37
  const PAINTING = { w: 1500, h: 2400 };   // aspect 1.60
  const PANE = { w: 760, h: 1000 };        // aspect 1.32
  const w = 375;
  assert.equal(frameHeightFor({ w, fullW: PAINTING.w, fullH: PAINTING.h, paneW: PANE.w, paneH: PANE.h }),
    375 * (1000 / 760), "the pane's shape decides");
  assert.ok(Math.abs(frameHeightFor({ w, fullW: PAINTING.w, fullH: PAINTING.h, paneW: PANE.w, paneH: PANE.h }) - 493.42) < 0.01);
  // the old rule, kept only as the fallback for a pane that has not laid out
  assert.equal(frameHeightFor({ w, fullW: PAINTING.w, fullH: PAINTING.h, paneW: 0, paneH: 0 }), 600,
    "with no pane to measure, the painting's aspect is the only thing left to ask");
  assert.equal(frameHeightFor({ w, fullW: PAINTING.w, fullH: PAINTING.h, paneW: NaN, paneH: 1000 }), 600);

  // and the two answers really do differ by the ratio the founder saw
  const painted = frameHeightFor({ w, fullW: PAINTING.w, fullH: PAINTING.h, paneW: 0, paneH: 0 });
  const paned = frameHeightFor({ w, fullW: PAINTING.w, fullH: PAINTING.h, paneW: PANE.w, paneH: PANE.h });
  assert.ok(painted / paned > 1.2, `the stale height was ${(painted / paned).toFixed(2)}x too tall, which is the shrink`);
});

test("ONE ROOT, ONE OWNER: frameOn asks the pane for its height and the shared rule for its width", () => {
  assert.match(SOURCE, /const h = frameHeightFor\(\{ w, fullW: full\.w, fullH: full\.h, paneW: paneBox\.width, paneH: paneBox\.height \}\)/,
    "frameOn derives its height through the shared rule, from the measured pane");
  assert.doesNotMatch(SOURCE, /h = w \* \(full\.h \/ full\.w\)/,
    "and nothing still takes a framed height straight off the painting");
  assert.match(SOURCE, /const w = frameWidthFor\(\{ viewW: view\.w, fullW: full\.w, keepZoom \}\)/,
    "the width comes through its own shared rule — the two halves of the same defect");
});
