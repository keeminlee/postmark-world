// room-fit.test.mjs — THE FLOOR OF THE WHEEL IS THE WHOLE ROOM, CONTAINED.
//
// Keemin, 2026-09-15 (Linear POS-95 / postmark#2849): "zoom out is also *too*
// heavily constrained in interiors. often you can't even zoom out enough to see
// the whole mark's interior. we should double check the zoom cap logic and also
// just add some padding to it so it's not claustrophobic."
//
// ── the mechanism, measured before it was changed ───────────────────────────
//
// A room mounts with `zoomOutLimit: 1`, and the wheel read that as a multiple
// of `full` — the ground svg's own viewBox:
//
//     const w = Math.min(… : full.w * zoomOutLimit, …)
//
// `refit` meanwhile showed the room WHOLE at rest, letterboxed into the pane.
// Those two are not the same rectangle. In a pane WIDER than the room's ground
// the resting view is `full.h * paneAspect` across — wider than `full.w` — so
// the wheel's floor sat INSIDE the resting view. The first notch of zoom-OUT
// therefore zoomed IN, cropping the room's left and right edges (and the pad,
// which is drawn inside the svg and is cropped with it), and the cap forbade
// widening back out. Only ⌂ fit, which routes through `refit`, could undo it.
//
// A 25 × 25 parcel in a 1600 × 900 pane: the resting view is 1706.7 ground-px
// across and the wheel's floor was 960 — the room lost 44 % of its horizontal
// span the moment the reader touched the wheel, with no way back.
//
// ── the fix ─────────────────────────────────────────────────────────────────
//
// `containFit` is that one question — how wide is the whole ground in THIS pane
// — with one owner. `refit` asks it (it had the arithmetic inline and correct)
// and so does the wheel's floor, times ROOM_ZOOM_OUT_SLACK so the wall is never
// pressed against the pane's edge. `roomGround`'s pad rises 0.12 → 0.25, which
// is the other half of "not claustrophobic": the slack is camera air, the pad
// is drawn floor, and neither substitutes for the other.
//
// The room stays the outermost STATE. Nothing here reaches the town.
//
// ── on this harness, and on its own first failure ───────────────────────────
// The wheel handler lives inside mountViewer's closure and needs a DOM, so what
// is exercised here is the arithmetic it now delegates to — the same call, the
// same numbers — plus [pin]s that BOTH readers really delegate. The suite has
// no dependencies by construction (the CI workflow installs nothing), so there
// is no jsdom to mount the real closure in; the browser pass is the rig's.
//
// ⚑ THE FIRST DRAFT OF THIS FILE PASSED ITS OWN FLIP. Its central assertion
// compared the wheel's floor to the resting view and took BOTH from
// `containFit`, so with that function gutted to `return full` it reduced to
// `1.25 * x >= x` and stayed green. Everything below therefore reasons in
// closed forms — `restWidth`, `widthNeededFor`, `oldFloorWidth` — and exactly
// one test ties the implementation to them. The defect is asserted directly,
// as the two numbers the founder met, rather than as a relation between two
// readings of the same function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  containFit, clampViewToBounds, roomGround,
  ROOM_GROUND_PAD, ROOM_ZOOM_OUT_SLACK,
} from "../spectator/viewer.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

// ── the two panes and the two rooms the issue names ─────────────────────────
const WIDE = { w: 1600, h: 900 };   // the ordinary desktop pane
const TALL = { w: 900, h: 1600 };   // a phone, or the pane with the panel open
const PARCEL = { id: "r/parcel", at: { x: 100, y: -50 }, extent: { w: 25, h: 25 } };
const PORCH = { id: "r/porch", at: { x: 0, y: 0 }, extent: { w: 4, h: 1.6 } };

/** the ground svg's own box, as mountScene reads it off the viewBox */
function fullOf(room) {
  const g = roomGround(room);
  const vb = g.svgText.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  return { full: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }, ground: g };
}

/** the room's own walls, in ground px — what must stay inside the pane */
function wallBox(room, ground) {
  const { at, extent } = room;
  return {
    x: ground.originPx.x + (at.x - extent.w / 2) / ground.mPerPx,
    y: ground.originPx.y + (at.y - extent.h / 2) / ground.mPerPx,
    w: extent.w / ground.mPerPx,
    h: extent.h / ground.mPerPx,
  };
}

// ── THE CLOSED FORMS, so nothing here is checked against itself ────────────
//
// ⚑ THE FIRST DRAFT OF THIS FILE WAS TAUTOLOGICAL AND THE FLIP CAUGHT IT. Both
// sides of "the floor is not inside the resting view" called `containFit`, so
// the assertion reduced to `1.25 * x >= x` and stayed green with the contain-fit
// gutted to `return full`. A probe whose two quantities move together is not a
// probe. So the resting width is written out in closed form below and used
// everywhere, and exactly ONE test ties `containFit` to it — which is the test
// that reds when the contain-fit is dropped.
const restWidth = (full, pane) => Math.max(full.w, full.h * (pane.w / pane.h));
const restHeight = (full, pane) => Math.max(full.h, full.w / (pane.w / pane.h));

/** the widest the wheel may go for a room, as outerViewWidth() computes it */
const roomFloorWidth = (full, pane, zoomOutLimit = 1) =>
  containFit(full, pane).w * zoomOutLimit * ROOM_ZOOM_OUT_SLACK;

/** what the wheel's floor USED to be: a multiple of the ground's own box */
const oldFloorWidth = (full, zoomOutLimit = 1) => full.w * zoomOutLimit;

/** the narrowest view in this pane's shape that still holds the whole wall */
const widthNeededFor = (walls, pane) => Math.max(walls.w, walls.h * (pane.w / pane.h));

/** a view of that width, in the pane's shape, centred — where the wheel lands */
function viewAtWidth(full, pane, w) {
  const h = w * (pane.h / pane.w);
  const centred = { x: full.x + (full.w - w) / 2, y: full.y + (full.h - h) / 2, w, h };
  return { ...centred, ...clampViewToBounds(centred, full) };
}

const contains = (view, box) =>
  view.x <= box.x && view.y <= box.y
  && view.x + view.w >= box.x + box.w && view.y + view.h >= box.y + box.h;

const airAround = (view, box) => ({
  left: box.x - view.x,
  right: (view.x + view.w) - (box.x + box.w),
  top: box.y - view.y,
  bottom: (view.y + view.h) - (box.y + box.h),
});

// ── FALSIFIER 0: containFit really is the contain-fit ──────────────────────
//
// THE ONE PLACE the implementation is tied to the closed form. Everything below
// reasons in the closed form, so if this passes the rest is measuring the real
// function, and if the contain-fit is ever gutted this is what says so.
for (const [name, room] of [["a 25×25 parcel", PARCEL], ["a 4×1.6 porch", PORCH]]) {
  for (const [paneName, pane] of [["a 1600×900 pane", WIDE], ["a 900×1600 pane", TALL]]) {
    test(`FALSIFIER: containFit takes the PANE's shape and holds all of the ground — ${name}, ${paneName}`, () => {
      const { full } = fullOf(room);
      const fit = containFit(full, pane);
      assert.ok(Math.abs(fit.w / fit.h - pane.w / pane.h) < 1e-9,
        `the fit wears the pane's aspect (got ${(fit.w / fit.h).toFixed(4)}, pane ${(pane.w / pane.h).toFixed(4)})`);
      assert.ok(Math.abs(fit.w - restWidth(full, pane)) < 1e-9,
        `…at the closed-form width (got ${fit.w.toFixed(1)}, expected ${restWidth(full, pane).toFixed(1)})`);
      assert.ok(Math.abs(fit.h - restHeight(full, pane)) < 1e-9, "…and the closed-form height");
      assert.ok(contains(fit, full), "…and nothing of the ground is cropped");
    });
  }
}

// ── FALSIFIER 1: THE DEFECT, AS A NUMBER ───────────────────────────────────
//
// The old floor was the ground's own box. Whenever the pane is wider than the
// ground, the resting view is wider than that box — so the floor sat INSIDE the
// resting view and the first notch of zoom-out moved the camera inward. Both
// rooms meet this in the wide pane; the parcel is the severe case, where what
// goes outside the pane is the WALL and not merely the floor around it.
for (const [name, room] of [["a 25×25 parcel", PARCEL], ["a 4×1.6 porch", PORCH]]) {
  test(`FALSIFIER: ${name} in a 1600×900 pane — the old floor sat inside the resting view; the new one does not`, () => {
    const { full } = fullOf(room);
    const rest = restWidth(full, WIDE);
    assert.ok(oldFloorWidth(full) < rest,
      `the defect: the old floor ${oldFloorWidth(full).toFixed(1)} is inside the resting view ${rest.toFixed(1)}`);
    assert.ok(roomFloorWidth(full, WIDE) > rest,
      `the repair: the new floor ${roomFloorWidth(full, WIDE).toFixed(1)} goes one notch PAST ${rest.toFixed(1)}`);
  });
}

test("FALSIFIER: the 25×25 parcel's WALL left the 1600×900 pane under the old floor, and does not under the new", () => {
  const { full, ground } = fullOf(PARCEL);
  const walls = wallBox(PARCEL, ground);
  const needed = widthNeededFor(walls, WIDE);
  assert.ok(oldFloorWidth(full) < needed,
    `the founder's report, as a number: the old floor ${oldFloorWidth(full).toFixed(1)} `
    + `could not hold the wall, which needs ${needed.toFixed(1)} in this pane`);
  assert.ok(roomFloorWidth(full, WIDE) > needed,
    `the new floor ${roomFloorWidth(full, WIDE).toFixed(1)} holds it with room to spare`);
});

// A finding, pinned so it is not re-discovered as a bug: the TALL pane was
// never the broken one. Its resting view is the ground's own width, so the old
// floor already matched it. The issue's flip says the same thing from the other
// side — "the contain-fit dropped reds the WIDE-pane case".
test("the 900×1600 pane was already whole under the old floor — the defect is the wide pane's", () => {
  for (const room of [PARCEL, PORCH]) {
    const { full, ground } = fullOf(room);
    assert.ok(oldFloorWidth(full) >= restWidth(full, TALL) - 1e-9,
      "a pane taller than the ground rests at the ground's own width");
    assert.ok(oldFloorWidth(full) >= widthNeededFor(wallBox(room, ground), TALL),
      "…so the wall was inside it already");
  }
});

// ── FALSIFIER 2: the room is whole, with pad on every side, at rest AND at
//    maximum zoom-out, in both panes ──────────────────────────────────────────
//
// The issue's own falsifier, verbatim: "after mount, and after the maximum
// zoom-out, the room's four corners (or ring extremes) are inside the pane with
// the pad visible on every side".
for (const [name, room] of [["a 25×25 parcel", PARCEL], ["a 4×1.6 porch", PORCH]]) {
  for (const [paneName, pane] of [["a 1600×900 pane", WIDE], ["a 900×1600 pane", TALL]]) {
    test(`FALSIFIER: ${name} in ${paneName} — whole, with air on all four sides, at rest and at the cap`, () => {
      const { full, ground } = fullOf(room);
      const walls = wallBox(room, ground);
      // the yardstick is the wall and the pane, never the function under test
      assert.ok(roomFloorWidth(full, pane) > widthNeededFor(walls, pane),
        "the cap is wider than the narrowest view that would hold the wall");
      for (const [when, view] of [
        ["at rest", viewAtWidth(full, pane, restWidth(full, pane))],
        ["at maximum zoom-out", viewAtWidth(full, pane, roomFloorWidth(full, pane))],
      ]) {
        assert.ok(contains(view, walls),
          `${when}: the room's four corners are inside the pane `
          + `(view ${JSON.stringify(view)} vs walls ${JSON.stringify(walls)})`);
        const air = airAround(view, walls);
        for (const side of ["left", "right", "top", "bottom"])
          assert.ok(air[side] > 0, `${when}: floor is visible ${side} of the wall (got ${air[side].toFixed(2)}px)`);
      }
    });
  }
}

// ── FALSIFIER 3: the room is still the outermost STATE ──────────────────────
//
// The repair must not become a zoom-out into the town. The cap is a multiple of
// the room's own contain-fit and nothing here consults the world frame, so the
// widest view is still bounded by the room's ground and its slack.
test("FALSIFIER: the cap is still the room's own ground — the wheel never reaches the town", () => {
  const { full } = fullOf(PARCEL);
  for (const pane of [WIDE, TALL]) {
    const floor = roomFloorWidth(full, pane);
    const rest = containFit(full, pane);
    assert.equal(floor, rest.w * ROOM_ZOOM_OUT_SLACK, "the cap is the contain-fit and the slack, nothing else");
    assert.ok(ROOM_ZOOM_OUT_SLACK < 2,
      "one notch of air, not a second scene's worth — a room that shows twice itself is a room you have left");
  }
});

// ── the pad, and why it is a bare fraction ─────────────────────────────────
//
// The issue offered "or a floor of a few metres for tiny rooms". It was tried
// and it reddened viewer-interior's numeric-regime test, correctly: a metre
// floor makes a room's share of its own ground a function of the room's SIZE,
// and a 0.5 m shelf would have sat five times further out than a parcel. The
// bare fraction keeps that share identical for every room, which is the regime
// the engine is tuned for — and the camera slack answers the small-room case
// without touching the projection at all.
test("the ground pad is a quarter of the longer side, for every room size", () => {
  assert.equal(ROOM_GROUND_PAD, 0.25, "the founder's 'add some padding' (POS-95)");
  // a parcel: 25 m + 2 × (25 × 0.25) = 37.5 m across, the longer side at 960 px
  const parcel = roomGround(PARCEL);
  assert.ok(Math.abs(parcel.mPerPx - 37.5 / 960) < 1e-9,
    `the parcel's span is the room plus a quarter each side (mPerPx ${parcel.mPerPx})`);
  // a shelf two orders of magnitude smaller: the SAME share, by construction
  const shelf = roomGround({ id: "r/shelf", at: { x: 0, y: 0 }, extent: { w: 1.6, h: 0.4 } });
  assert.ok(Math.abs(shelf.mPerPx - (1.6 * 1.5) / 960) < 1e-9,
    `a 1.6 m shelf takes the same quarter each side (mPerPx ${shelf.mPerPx})`);
  const shareOf = (g, longer) => (longer / g.mPerPx) / 960;
  assert.ok(Math.abs(shareOf(parcel, 25) - shareOf(shelf, 1.6)) < 1e-9,
    "a parcel and a shelf occupy the same share of their own ground");
});

// ── [pin] BOTH readers ask the one owner ───────────────────────────────────
//
// The defect was two rectangles for one question. A regression is not a wrong
// number, it is a SECOND copy of the arithmetic — so these watch the delegation
// rather than the result.
test("[pin] refit asks containFit rather than recomputing the letterbox inline", () => {
  assert.match(SOURCE, /Object\.assign\(view, containFit\(full, \{ w: pane\.width, h: pane\.height \}\)\)/,
    "refit delegates");
  assert.doesNotMatch(SOURCE, /const pa = pane\.width \/ pane\.height, ga = full\.w \/ full\.h;/,
    "the inline copy of the letterbox arithmetic is gone");
});

test("[pin] the wheel's floor is outerViewWidth(), and a room's answer is the contain-fit", () => {
  assert.match(SOURCE, /const w = Math\.min\(outerViewWidth\(\), Math\.max\(full\.w \/ MAX_ZOOM_IN, view\.w \* k\)\)/,
    "the wheel delegates");
  assert.doesNotMatch(SOURCE, /Math\.min\(zoomOutLimit > 1 && worldFrame \? worldFrame\.w : full\.w \* zoomOutLimit/,
    "the old floor — a multiple of the ground's own box — is gone from the wheel");
  assert.match(SOURCE, /containFit\(full, \{ w: pane\.width, h: pane\.height \}\)\.w \* zoomOutLimit \* ROOM_ZOOM_OUT_SLACK/,
    "and a room's floor is the contain-fit, the limit and the slack");
});

test("[pin] outdoors is untouched — the world frame is still the bound", () => {
  assert.match(SOURCE, /if \(zoomOutLimit > 1\) return worldFrame \? worldFrame\.w : full\.w \* zoomOutLimit;/,
    "the town's answer is the same one it had");
});
