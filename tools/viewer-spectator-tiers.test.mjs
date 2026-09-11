// viewer-spectator-tiers.test.mjs — the spectator's three distances, the pixel
// rule, the cull box and the far crowd, each asked of the pure function that
// decides it.
//
// ── WHAT THIS FILE CAN AND CANNOT PROVE ────────────────────────────────────
//
// It can prove that `tierFor` returns the right word, that the word moves when
// a dial moves, and that the markup builders emit what they claim. It CANNOT
// prove that any of it reached the drawing — which is exactly the false green
// `tools/town-ground-page.test.mjs` was written after: forty-eight scene tests
// stayed green while the furnishing pass drew nothing at all, because every one
// of them called the builder directly and none of them asked the page.
//
// So the gates have a page-driven twin over there ("THE FAR TIER DRAWS NO
// FURNITURE", "THE CULL IS A CULL"), and this file is the vocabulary underneath
// it. Neither is sufficient alone and the pair is named in both directions on
// purpose.
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//
// Each block names the edit that reds it. They were run, and their output is in
// docs/2026-09-11/jetto-spectator-10x-report.md rather than described here.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPECTATOR_DRAW_DEFAULTS,
  tierFor,
  metresAcross,
  footprintPx,
  viewportWorldBounds,
  markInDrawnBounds,
  pointInDrawnBounds,
  walkerFrameSVG,
  WALKER_FRAME,
  overlayHouseGlyphSVG,
  overlayHomeCardSVG,
  placeholderExtentSVG,
  OVERLAY_PIP_R,
  townHouseMarks,
} from "../spectator/viewer.mjs";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

// The painting is 1500 atlas units at 5 m each (WORLD/skeleton.json), so the
// whole sheet is 7,500 m across. Written as the product rather than as 7500 so
// the relation is visible: if the skeleton's scale ever moves, what this file
// says about metres stops being a coincidence that happens to still hold.
const PAINTING_W_M = 1500 * 5;

test("THE THREE DISTANCES — one zoom, one word, and the word comes from metres across the viewport", () => {
  // the opening view: the whole painting on screen
  assert.equal(tierFor(1, PAINTING_W_M), "far", "7,500 m across is the town");
  // a district
  assert.equal(tierFor(3, PAINTING_W_M), "mid", "2,500 m across is a district");
  // a street
  assert.equal(tierFor(15, PAINTING_W_M), "near", "500 m across is a street");
  // and the arithmetic underneath, stated once so the three above are readable
  assert.equal(metresAcross(1, PAINTING_W_M), 7500);
  assert.equal(metresAcross(3, PAINTING_W_M), 2500);
  assert.equal(metresAcross(15, PAINTING_W_M), 500);
});

test("THE BOUNDARIES ARE THE DIALS' — a dial moves and the boundary moves with it", () => {
  // 2,500 m across. Under the defaults (far > 5,000) that is `mid`.
  assert.equal(tierFor(3, PAINTING_W_M), "mid");
  // drop the far threshold under it and the SAME camera is now looking at a town
  assert.equal(
    tierFor(3, PAINTING_W_M, { ...SPECTATOR_DRAW_DEFAULTS, tier_far_m: 2000 }), "far",
    "far beyond 2,000 m puts a 2,500 m view in the far tier");
  // raise the near threshold over it and the SAME camera is looking at a street
  assert.equal(
    tierFor(3, PAINTING_W_M, { ...SPECTATOR_DRAW_DEFAULTS, tier_near_m: 3000 }), "near",
    "near below 3,000 m puts a 2,500 m view in the near tier");
  // ⚑ THE FLIP: hardcode the comparison in tierFor —
  //       if (across > 5000) return "far";
  //       if (across < 1000) return "near";
  //   — and both assertions above red while the first test stays green. That is
  //   the whole point of this block: a gate that ignores its dial is a constant
  //   buried in a pass, which is the thing the 09-10 proposal's open calls exist
  //   to prevent, and the default-value test cannot see it.
});

test("A CAMERA IT CANNOT READ DRAWS EVERYTHING — the safe direction is toward the town, never away", () => {
  // THE TWO UNREADABLE THINGS ARE NOT THE SAME. A zoom that will not parse is
  // recoverable — 1× is what the camera opens at and what `markerScale` already
  // assumes — so it answers with the tier for the whole painting. A PAINTING
  // with no width is not recoverable: there is no "metres across" to be had, and
  // the answer is `near`, today's painting, everything drawn.
  //
  // That asymmetry is the rule, not an accident of the code: the failure mode of
  // guessing `far` is a blank map, which looks like a broken page and would be;
  // the failure mode of guessing `near` is a slow one that is plainly the town.
  assert.equal(tierFor(NaN, PAINTING_W_M), "far", "an unparseable zoom is the opening view, 7,500 m across");
  assert.equal(metresAcross(NaN, PAINTING_W_M), PAINTING_W_M);
  assert.equal(tierFor(1, undefined), "near", "a painting with no width draws everything");
  assert.equal(tierFor(undefined, undefined), "near");
  assert.ok(Number.isNaN(metresAcross(1, 0)));
});

test("THE PIXEL RULE — a picture is worth drawing when the ground under it can hold one", () => {
  const parcel = { id: "a/p", kind: "parcel", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 } };
  // 25 m of ground across a 700 px pane showing 500 m: 35 px. Under the 40 px
  // dial, so no picture.
  assert.equal(Math.round(footprintPx(parcel, { across: 500, panePx: 700 })), 35);
  // the same parcel at street width: 175 px, and it wears its picture
  assert.equal(Math.round(footprintPx(parcel, { across: 100, panePx: 700 })), 175);
  // at town width it is a third of a pixel
  assert.ok(footprintPx(parcel, { across: 7500, panePx: 700 }) < 3);
  // THE RULE DOES NOT DEPEND ON N. This is the property the 09-10 proposal
  // claimed for it and the reason it is a pixel rule rather than a count: the
  // same parcel at the same zoom answers the same whether the town holds 89
  // parcels or 890, so crowding cannot creep back in by growth.
  assert.equal(
    footprintPx(parcel, { across: 500, panePx: 700 }),
    footprintPx({ ...parcel, id: "b/p" }, { across: 500, panePx: 700 }));
  // a mark with no extent has no footprint, and a camera with no pane has no
  // answer — both are 0, which reads as "no picture" and never as a picture of
  // unknown size
  assert.equal(footprintPx({ id: "x" }, { across: 500, panePx: 700 }), 0);
  assert.equal(footprintPx(parcel, { across: 0, panePx: 700 }), 0);
  assert.equal(footprintPx(parcel, { across: 500, panePx: 0 }), 0);
});

test("THE CULL BOX — the viewBox in metres, plus one viewport of margin on each side", () => {
  // a 100 px viewBox at 10 m/px is 1,000 m of ground; the origin is at px 0, so
  // painting px and world metres share a zero here and the arithmetic is legible
  const view = { x: 0, y: 0, w: 100, h: 100 };
  const reg = { originPx: { x: 0, y: 0 }, mPerPx: 10 };
  const tight = viewportWorldBounds({ view, ...reg, margin: 0 });
  assert.deepEqual(tight, { minX: 0, maxX: 1000, minY: 0, maxY: 1000 });
  // one viewport of margin: a screen of ground on every side, so the box is 3×3
  // screens with the viewBox in the middle
  const margined = viewportWorldBounds({ view, ...reg, margin: 1 });
  assert.deepEqual(margined, { minX: -1000, maxX: 2000, minY: -1000, maxY: 2000 });
  // THE MARGIN IS WHAT KEEPS A PAN FREE. A mark one whole screen off the edge is
  // still drawn, which is why dragging a screen's width touches no DOM.
  const offEdge = { id: "a/off", kind: "sited", at: { x: 1500, y: 500 }, extent: { w: 10, h: 10 } };
  assert.equal(markInDrawnBounds(offEdge, tight), false, "outside the viewBox itself");
  assert.equal(markInDrawnBounds(offEdge, margined), true, "inside the drawn margin");
  // two screens out is out under either
  const wayOff = { id: "a/way", kind: "sited", at: { x: 9000, y: 500 }, extent: { w: 10, h: 10 } };
  assert.equal(markInDrawnBounds(wayOff, margined), false);
  // A NULL BOX DRAWS EVERYTHING — the resident path, and any camera that cannot
  // be read. Never a reason to stop painting the town.
  assert.equal(markInDrawnBounds(wayOff, null), true);
  assert.equal(viewportWorldBounds({ view, originPx: { x: 0, y: 0 }, mPerPx: 0 }), null);
  // walkers are points, not marks
  assert.equal(pointInDrawnBounds({ x: 500, y: 500 }, tight), true);
  assert.equal(pointInDrawnBounds({ x: 1500, y: 500 }, tight), false);
  assert.equal(pointInDrawnBounds({ x: 1500, y: 500 }, margined), true);
  assert.equal(pointInDrawnBounds({ x: 1500, y: 500 }, null), true);
  // ⚑ THE FLIP: return `{ minX: -Infinity, … }` from viewportWorldBounds and
  //   every "outside" assertion above reds — which is the cull being off.
});

test("A MARK IS CULLED BY ITS GEOMETRY, NOT BY ITS CENTRE — a district straddling the edge stays drawn", () => {
  // the East Window District is 2,325 m across. Its centre can sit well outside
  // a street-width viewBox while the reader is standing inside it, and a cull
  // that asked only about `at` would delete the ground under their feet.
  const district = { id: "the/district", kind: "sited", at: { x: 2000, y: 500 }, extent: { w: 2325, h: 2325 } };
  const view = { x: 0, y: 0, w: 100, h: 100 };
  const tight = viewportWorldBounds({ view, originPx: { x: 0, y: 0 }, mPerPx: 10, margin: 0 });
  assert.equal(pointInDrawnBounds(district.at, tight), false, "its CENTRE is outside the box");
  assert.equal(markInDrawnBounds(district, tight), true, "and its GROUND is inside it");
  // this is the same question the off-screen highlight arrow already asks
  // (markGeometryIntersectsViewport), asked one layer earlier, so the overlay
  // and the arrow can never disagree about what is on screen
});

test("THE WALKER IS A FRAME WITH LEGS — empty at town width, no picture, no clip path, fixed where they stand", () => {
  const svg = walkerFrameSVG({ at: { x: 100, y: 200 }, k: 2, handle: "rei" });
  assert.match(svg, /^<g class="wv-walker-far" data-handle="rei"/, "one group, named by the handle");
  assert.equal((svg.match(/wv-walker-frame/g) ?? []).length, 1, "one frame");
  assert.equal((svg.match(/<line /g) ?? []).length, 2, "a little pair of legs");
  assert.ok(!/<image|clip-path|wv-walker-mono/.test(svg), "empty: no picture, no clip path, no monogram — the frame is the whole icon");
  assert.match(svg, /wv-walker-hit/, "and a hit disc");
  // THE FRAME IS ROUND (founder, 2026-09-11): one circle, no square anywhere in it
  const r = Number(svg.match(/<circle cx="100" cy="200" r="([\d.]+)" class="wv-walker-frame"\/>/)[1]);
  assert.equal(r * 2, WALKER_FRAME.far / 2, "marker space: at k=2 the frame is half its k=1 size");
  assert.ok(!/<rect/.test(svg), "no square anywhere in it");
  // …and the legs, untouched in stance and length, start where they meet the rim
  const size = WALKER_FRAME.far / 2, legTop = 200 + Math.sqrt((size / 2) ** 2 - (size * 0.22) ** 2);
  const legs = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  for (const [x1, y1, , y2] of legs) {
    assert.ok(Math.abs(y1 - legTop) < 1e-9, `a leg starts on the rim: ${y1} vs ${legTop}`);
    assert.ok(Math.abs(Math.abs(x1 - 100) - size * 0.22) < 1e-9, "the same stance as before");
    assert.ok(Math.abs((y2 - y1) - WALKER_FRAME.legFar / 2) < 1e-9, "the same length as before");
  }
  assert.match(walkerFrameSVG({ at: { x: 0, y: 0 }, moving: true }), /class="wv-walker-far moving"/);
  assert.equal(walkerFrameSVG({ at: { x: NaN, y: 1 } }), "", "an unplaced walker draws nothing");
  // ⚑ THE FLIP: drop one <line> from walkerFrameSVG and the legs count reds.
});

test("THE FRAME FILLS IN nearer in — the picture clipped to the frame, or the monogram on the household's colour — at the house card's own size step", () => {
  const pic = walkerFrameSVG({ at: { x: 10, y: 20 }, k: 1, handle: "rei", art: { avatar: "/shelf/rei.jpg" } });
  assert.match(pic, /^<g class="wv-walker-near" data-handle="rei"/, "the filled frame is the walker proper");
  assert.match(pic, /<clipPath id="wv-face-rei"><circle cx="10" cy="20" r="11"\/>/, "the picture is clipped to the FRAME — which is round (founder, 2026-09-11)");
  assert.match(pic, /<image href="\/shelf\/rei.jpg"[^>]*class="wv-walker-face"/);
  assert.equal((pic.match(/<line /g) ?? []).length, 2, "legs stay");
  const r = Number(pic.match(/r="([\d.]+)" class="wv-walker-frame"/)[1]);
  assert.equal(r * 2, WALKER_FRAME.near, "filled, the frame is the near size");
  assert.ok(WALKER_FRAME.near > WALKER_FRAME.far, "and larger than the empty one");
  const mono = walkerFrameSVG({ at: { x: 10, y: 20 }, handle: "nyx", art: { monogram: "N", color: "#123456" } });
  assert.match(mono, /wv-walker-mono" fill="#123456"/, "no picture: the household's colour fills the frame");
  assert.match(mono, /class="wv-walker-initial"[^>]*>N</, "with the monogram on it");
  assert.ok(!/<image/.test(mono));
  // ⚑ THE FLIP: clip to a <rect> instead of the frame's <circle> → the clipPath assertion reds.
});

test("THE FAR HOUSE — the card's own roofline, no picture, no clip, no name, and the pip stays", () => {
  const glyph = overlayHouseGlyphSVG({ at: { x: 10, y: 20 }, id: "jack/the-lantern-parcel", classes: "t-home" });
  assert.match(glyph, /class="ov-glyph"/, "the house is drawn");
  assert.doesNotMatch(glyph, /<image/, "no picture at town width");
  assert.doesNotMatch(glyph, /<clipPath/, "and therefore no clip path either");
  assert.doesNotMatch(glyph, /<text/, "no name");
  assert.doesNotMatch(glyph, /<title/, "and no tooltip standing in for one");
  // THE PIP IS NOT OPTIONAL. It is the hover anchor, the hit target and the fan's
  // seat (screenMarkCandidates reads mapCtx.glyphIds and snaps to `.ov-pip`), so
  // a glyph without it would make every house at town width unclickable — which
  // is the zoom a reader arrives at.
  assert.match(glyph, new RegExp(`r="${OVERLAY_PIP_R}" class="ov-pip ov-pip-home t-home" data-id="jack/the-lantern-parcel"`));
  // and it is CHEAPER than the card, which is the entire reason it exists
  const card = overlayHomeCardSVG({
    at: { x: 10, y: 20 }, id: "jack/the-lantern-parcel", label: "jack",
    image: "/shelf/jack/abc.png", title: "the lantern",   // overlayHomeCardSVG takes a PATH, already gated
  });
  const nodes = (s) => (s.match(/<[a-zA-Z]/g) ?? []).length;
  assert.ok(nodes(glyph) < nodes(card) / 2,
    `the far house is under half the card's nodes (${nodes(glyph)} vs ${nodes(card)})`);
  assert.equal(overlayHouseGlyphSVG({ at: { x: NaN, y: 0 }, id: "x" }), "", "a mark with no place draws nothing");
});

test("THE PLACEHOLDER BLOCK IS HALF PRESENT — the ground reads through it (founder, 2026-09-11, revising 08-20's 'no transparency games')", () => {
  assert.match(SOURCE, /\.wv-ph-extent \{ [^}]*opacity:\.5;/, "50%, on the element, so the edge fades with the fill");
  const svg = placeholderExtentSVG({ id: "a/b", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 } }, (p) => p);
  assert.match(svg, /class="wv-ph-extent"/, "the block is still the block");
  assert.doesNotMatch(svg, /opacity/, "the half is the stylesheet's, not the markup's — one place");
  // ⚑ THE FLIP: delete `opacity:.5;` from the .wv-ph-extent rule → reds.
});

test("THE MID FURNITURE — a mark's shape without its photograph", () => {
  const px = (p) => ({ x: p.x, y: p.y });
  const withArt = {
    id: "a/thing", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 },
    // a real shelf URL: markImagePath refuses anything that is not one, so a
    // made-up path would make this test pass for the wrong reason
    image: "https://media.postmark.town/media/a/deadbeef.png",
  };
  // the default refusal stands for every caller that had it: a tinted block
  // under a photograph is a smudge, and a room hangs the photograph
  assert.equal(placeholderExtentSVG(withArt, px), "", "art-clad marks are still skipped by default");
  // …and the district-width spectator asks for the shape anyway
  const shape = placeholderExtentSVG(withArt, px, { ignoreArt: true });
  assert.match(shape, /class="wv-ph-extent"/);
  assert.doesNotMatch(shape, /<image/, "the shape, never the picture");
  // an art-LESS mark is unchanged either way, which is what makes this additive
  const bare = { id: "a/bare", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } };
  assert.equal(placeholderExtentSVG(bare, px), placeholderExtentSVG(bare, px, { ignoreArt: true }));
});

// ── PICTURES AT MID, and the margin that pays for them (founder, 2026-09-11) ──
//
// Keemin: "I think pictures should appear at mid zoom … I do want to hear what
// the performance side of the story is." The story: the `<image>` count is
// bounded by the cull box, so the margin came down with the picture rule.
// Both are asked as RELATIONS against the town's own record, never as the
// numbers themselves (a pinned 6 or 0.5 would be a calendar).

const TOWN = JSON.parse(readFileSync(new URL("../WORLD/world-state.json", import.meta.url), "utf8"));
const PANE_PX = 1360;   // the painting's width on a laptop, the same figure the 10x report measured with

test("PICTURES AT MID: at the mid tier's widest, the smallest parcel in the town still earns its picture", () => {
  const parcels = TOWN.marks.filter((m) => m.kind === "parcel" && m.extent);
  assert.ok(parcels.length > 0, "the record carries parcels");
  const smallest = parcels.reduce((a, b) => (Math.max(b.extent.w, b.extent.h) < Math.max(a.extent.w, a.extent.h) ? b : a));
  const across = SPECTATOR_DRAW_DEFAULTS.tier_far_m;   // any wider is `far`, which draws glyphs
  assert.equal(tierFor(PANE_PX / across, PANE_PX), "mid", "the widest mid view is still mid");
  const px = footprintPx(smallest, { across, panePx: PANE_PX });
  assert.ok(px >= SPECTATOR_DRAW_DEFAULTS.art_min_px,
    `a ${Math.max(smallest.extent.w, smallest.extent.h)} m parcel at ${across} m across is ${px.toFixed(1)} px — under art_min_px ${SPECTATOR_DRAW_DEFAULTS.art_min_px}, so mid would draw initials, not pictures`);
  // flip: art_min_px back to 40 → this reds (7 px < 40)
});

test("THE MARGIN IS HALF A VIEWPORT: the cull box at the default margin is twice the viewBox, not three times", () => {
  const view = { x: 0, y: 0, w: 1000, h: 500 };
  const box = viewportWorldBounds({ view, originPx: { x: 0, y: 0 }, mPerPx: 1, margin: SPECTATOR_DRAW_DEFAULTS.cull_margin });
  const w = box.maxX - box.minX;
  assert.ok(w <= 2 * view.w + 1e-9, `drawn width ${w} m for a ${view.w} m view — more than twice the viewport is drawn`);
  assert.ok(w > view.w, "some margin remains, or a pan tears");
  // flip: cull_margin back to 1 → this reds (3000 > 2000)
});

// ── THE TOWN'S HOUSES, as a set (2026-09-11, Keemin: "just the marks") ──

test("townHouseMarks hands over every parcel and the dwelling sited on it — preferring the pictured one — and nothing else", () => {
  const marks = [
    { id: "nyx/the-night-room-parcel", kind: "parcel", by: "nyx", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 } },
    { id: "nyx/the-night-room", kind: "sited", tier: "home", placementParent: "nyx/the-night-room-parcel", by: "nyx" },
    { id: "nyx/the-night-room-2", kind: "sited", tier: "home", placementParent: "nyx/the-night-room-parcel", by: "nyx", image: "night.jpg" },
    { id: "liv/the-kept-light-parcel", kind: "parcel", by: "liv", at: { x: 9, y: 9 }, extent: { w: 25, h: 25 } },
    { id: "liv/a-lantern", kind: "sited", tier: "market", placementParent: "liv/the-kept-light-parcel", by: "liv" },
    { id: "limen/the-threshold-district", kind: "sited", tier: "market", by: "limen", points: [[0, 0], [1, 0], [1, 1]] },
  ];
  const out = townHouseMarks(marks).map((m) => m.id);
  assert.deepEqual(out, ["nyx/the-night-room-parcel", "nyx/the-night-room-2", "liv/the-kept-light-parcel"],
    "parcels in record order, each followed by its pictured dwelling; a parcel with no dwelling rides alone; furniture and regions stay out");
  assert.deepEqual(townHouseMarks([]), []);
  assert.deepEqual(townHouseMarks(null), []);
  // flip: drop the `homeMarkOfParcel` line → the night room's dwelling goes missing → red
});

test("townHouseMarks on the town's own record: one dwelling per parcel at most, and every parcel present", () => {
  const out = townHouseMarks(TOWN.marks);
  const parcels = TOWN.marks.filter((m) => m.kind === "parcel").length;
  assert.equal(out.filter((m) => m.kind === "parcel").length, parcels, "every parcel is handed over");
  assert.ok(out.length <= 2 * parcels, "at most one dwelling rides with each parcel");
  assert.ok(out.every((m) => m.kind === "parcel" || (m.kind === "sited" && m.tier === "home")), "nothing but parcels and dwellings");
});
