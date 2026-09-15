// standpoint-dot.test.mjs — one body, one marker (Linear POS-93, 2026-09-15).
//
// THE INSTANCE. Acting as rei inside her parcel, the founder saw the red
// standpoint dot with its halo at the house's centre AND rei's face by the
// window: "the present location is marked like a Spectator even though I'm
// acting as Rei." Measured on prod the same morning: the dot (`.ov-dot`, drawn
// by the overlay at the camera) and the walker (`[data-handle=rei]`, drawn from
// the read's standpoint) 108 px apart in one run, coincident in the next,
// present together for the whole of both.
//
// The rule: the dot stands in for the reader only while there is no body to
// draw — a spectator always (a camera has no body), a resident until their
// walker arrives, nobody else. `standpointDotShown` is the decision; the
// overlay asks it before drawing the dot and `drawWalkers` removes the dot the
// moment the body is on screen.
//
// THE CAN-FAIL FLIP: make standpointDotShown return true unconditionally → the
// second test reds. Run receipt in the hotfix PR.
//
//   node --test tools/standpoint-dot.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { overlayStandpointSVG, standpointDotShown } from "../spectator/viewer.mjs";

const walkers = [{ handle: "rei", x: 1092, y: -797 }, { handle: "sollerino", x: 1088, y: -794.5 }];

test("a spectator always gets the dot: a camera has no body", () => {
  assert.equal(standpointDotShown({ spectating: true, handle: null, walkers }), true);
  assert.equal(standpointDotShown({ spectating: true, handle: "rei", walkers }), true, "spectating wins even with a handle remembered");
});

test("a resident whose body is drawn gets NO dot — one body, one marker", () => {
  assert.equal(standpointDotShown({ spectating: false, handle: "rei", walkers }), false);
});

test("a resident whose walker has not arrived yet keeps the dot until it does", () => {
  assert.equal(standpointDotShown({ spectating: false, handle: "rei", walkers: [] }), true);
  assert.equal(standpointDotShown({ spectating: false, handle: "rei", walkers: [{ handle: "sollerino" }] }), true, "somebody else's body is not yours");
});

test("the dot's markup carries a class the walker pass can find and remove", () => {
  const svg = overlayStandpointSVG({ at: { x: 10, y: 20 } });
  assert.match(svg, /^<g class="ov-standpoint" transform="translate\(10 20\)">/);
  assert.match(svg, /class="ov-dot"/);
  assert.match(svg, /class="ov-halo"/);
  assert.equal(overlayStandpointSVG({ at: { x: NaN, y: 1 } }), "", "no point, no dot");
});
