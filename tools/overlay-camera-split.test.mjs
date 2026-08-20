// overlay-camera-split.test.mjs — the overlay is written with the RECORD and
// sized by the CAMERA, and this file exists to make the second half impossible
// to undo quietly.
//
// The defect these guard cost 1,335 DOM nodes destroyed and recreated over a
// ninety-frame drag, and about 2.1 ms of script per frame, on a map whose whole
// job is to be dragged. It was not a slow algorithm — it was the right markup
// rebuilt for a question it did not need to be rebuilt to answer, because
// marker size was baked into every `r` as `11 / k`.
//
// The falsifier is structural rather than a timing: these builders take NO
// camera argument, so a change that wants the zoom back in the markup has to
// add a parameter to get it, and the constant radii below fail first.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OVERLAY_DOT_R, OVERLAY_HALO_R, OVERLAY_PIP_R,
  markerScale, overlayPipSVG, overlayStandpointSVG,
} from "../spectator/viewer.mjs";

test("FALSIFIER: a pip's radius is a constant, not a function of zoom", () => {
  const svg = overlayPipSVG({ at: { x: 100, y: -50 }, id: "the-town/x" });
  assert.match(svg, new RegExp(`r="${OVERLAY_PIP_R}"`), "the radius is the authored constant");
  // the shapes a zoom-dependent radius takes: a decimal, or an expression result
  assert.doesNotMatch(svg, /r="[\d.]*\.\d+"/, "a fractional radius means the camera got into the markup");
});

test("FALSIFIER: identical inputs give identical markup at any camera", () => {
  // the builders cannot see the camera, so this is a structural guarantee rather
  // than a lucky one — but if somebody threads zoom in through a module global,
  // this is the probe that notices
  const args = { at: { x: 7, y: 9 }, id: "a/b", classes: "t-home" };
  const a = overlayPipSVG(args);
  for (const zoom of [0.5, 1, 4, 40, 400]) {
    markerScale(zoom);                       // move the camera as far as it goes
    assert.equal(overlayPipSVG(args), a, `markup moved with the camera at zoom ${zoom}`);
  }
});

test("the scale hook is present — without it the CSS variable has nothing to drive", () => {
  assert.match(overlayPipSVG({ at: { x: 0, y: 0 }, id: "a" }), /class="ov-s"/);
  assert.match(overlayStandpointSVG({ at: { x: 0, y: 0 } }), /class="ov-s"/);
});

test("position is an attribute on the outer group, so panning is free", () => {
  const svg = overlayPipSVG({ at: { x: 123, y: -45 }, id: "a" });
  assert.match(svg, /<g transform="translate\(123 -45\)">/,
    "the pip is placed by the painting's own coordinates; the viewBox moves it");
});

test("THE FAN RIDES INSIDE THE SCALED SPACE", () => {
  // it must be a cx/cy on the circle, never folded into the translate — inside
  // the scaled group it stays a constant few panel pixels, which is exactly what
  // dividing it by k used to buy
  const svg = overlayPipSVG({ at: { x: 10, y: 20 }, id: "a", fan: { dx: 3, dy: -4 } });
  assert.match(svg, /<g transform="translate\(10 20\)">/, "the translate is the mark's own place");
  assert.match(svg, /cx="3" cy="-4"/, "and the fan is inside, where the scale reaches it");
});

test("no fan means no offset, not a missing attribute", () => {
  assert.match(overlayPipSVG({ at: { x: 1, y: 2 }, id: "a" }), /cx="0" cy="0"/);
});

test("the standpoint's dot and halo are constants too", () => {
  const svg = overlayStandpointSVG({ at: { x: 0, y: 0 } });
  assert.match(svg, new RegExp(`r="${OVERLAY_DOT_R}"`));
  assert.match(svg, new RegExp(`r="${OVERLAY_HALO_R}"`));
  assert.ok(OVERLAY_HALO_R > OVERLAY_DOT_R, "the halo is around the dot");
});

test("a mark the record cannot place draws nothing rather than NaN", () => {
  for (const at of [null, undefined, {}, { x: NaN, y: 0 }, { x: 1 }])
    assert.equal(overlayPipSVG({ at, id: "a" }), "", `placed nothing for ${JSON.stringify(at)}`);
  assert.equal(overlayStandpointSVG({ at: { x: "nope", y: 0 } }), "");
});

test("markup in an id or a title cannot escape the overlay", () => {
  const svg = overlayPipSVG({ at: { x: 0, y: 0 }, id: '"><script>x</script>', title: "<b>hi</b>" });
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<b>hi<\/b>/);
  assert.match(svg, /&lt;b&gt;hi/);
});

test("a title is omitted entirely when there is none — painting-only says nothing twice", () => {
  assert.doesNotMatch(overlayPipSVG({ at: { x: 0, y: 0 }, id: "a" }), /<title>/);
  assert.match(overlayPipSVG({ at: { x: 0, y: 0 }, id: "a", title: "The Quay" }), /<title>The Quay<\/title>/);
});

// ── the scale itself ────────────────────────────────────────────────────────
test("markerScale still answers what it always answered", () => {
  // the counter-scale the CSS variable carries is 1/markerScale, so this is the
  // one number the whole scheme rests on and it is unchanged by the split
  assert.equal(markerScale(1), 1);
  assert.ok(markerScale(100) > markerScale(4), "closer in means a bigger divisor");
  assert.equal(markerScale(0), 1, "a nonsense zoom is held at 1 rather than dividing by it");
  assert.equal(markerScale(NaN), 1);
  for (const z of [0.1, 1, 10, 1000]) assert.ok(markerScale(z) >= 1, "never below 1");
});
