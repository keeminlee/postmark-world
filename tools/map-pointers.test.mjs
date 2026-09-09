// map-pointers.test.mjs — the map walks the record's pointers (2026-09-09).
//
// The ruling, quoted: "get a version in dev where each part of the Atlas is
// made functional in the World 2.0 (home images, region washes-as-SVG-linked-
// to-region-mark) by walking mark pointers" and "the mark carries POINTERS …
// the site RESOLVE[s] the pointer" (Keemin, 2026-09-09).
//
// The falsifiers, each of which can fail:
//   1. a parcel with a pointer renders its picture (a box, an <image> node);
//   2. a parcel without one renders as today (no box, no node);
//   3. a pointer to a missing resource renders NOTHING — the node leaves with
//      the error — and the page's receipt SAYS SO (no broken-image glyph);
//   4. a wash is a ringed mark's SVG pointer, told from a photograph by the
//      record's own shape, and lies under the marks, above the ground;
//   5. the 08-21 card-figure switch (`mark-art`) is untouched.
//
//   node --test tools/map-pointers.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARCEL_ART_MIN_M, WASH_PRESERVE_ASPECT, isWashPointer, markArtOnMap, mountPointerArt,
  parcelArtBox, pointerReceiptLine, washBox,
} from "../spectator/viewer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

const SHELF_JPG = "https://media.postmark.town/media/fixture/0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff.jpg";
const SHELF_SVG = "https://media.postmark.town/media/fixture/aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999.svg";
const OFF_SHELF = "https://evil.example.test/steal.png";
const RING = [[0, 0], [100, 0], [100, 60], [0, 60]];

const parcel = (extra = {}) => ({ id: "alpha/home-parcel", kind: "parcel", by: "alpha", at: { x: 500, y: -200 }, extent: { w: 25, h: 25 }, ...extra });
const region = (extra = {}) => ({ id: "beta/a-region", kind: "sited", by: "beta", at: { x: 50, y: 30 }, extent: { w: 100, h: 60 }, points: RING, ...extra });
const px = (p) => ({ x: 485 + p.x / 5, y: 760 + p.y / 5 }); // the atlas registration, 5 m/px

// A DOM small enough to read whole: elements remember attributes, children,
// listeners and their parent, and `remove()` detaches. Enough to prove the
// order of operations the real browser depends on.
function fakeDoc() {
  const make = (tag) => {
    const el = {
      tag, attrs: {}, children: [], listeners: {}, parent: null, style: {},
      setAttribute(k, v) { el.attrs[k] = String(v); if (k === "href") el.hrefSetWhenListeners = Object.keys(el.listeners).slice(); },
      getAttribute(k) { return el.attrs[k] ?? null; },
      addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      remove() { if (el.parent) { el.parent.children = el.parent.children.filter((c) => c !== el); el.parent = null; } },
      fire(type) { for (const fn of el.listeners[type] ?? []) fn({ type }); },
    };
    return el;
  };
  return { createElementNS: (_ns, tag) => make(tag), make };
}

test("FALSIFIER 1 — a parcel with a pointer has a box to draw in, never smaller than the one constant", () => {
  const box = parcelArtBox(parcel({ image: SHELF_JPG }));
  assert.ok(box, "a pointered parcel must yield a box");
  assert.deepEqual({ x: box.x, y: box.y }, { x: 500, y: -200 }, "centred on the parcel");
  assert.equal(box.w, PARCEL_ART_MIN_M);
  assert.equal(box.h, PARCEL_ART_MIN_M, "a 25 m parcel draws at the constant, not at five painting units");
  const big = parcelArtBox(parcel({ image: SHELF_JPG, extent: { w: 400, h: 300 } }));
  assert.deepEqual([big.w, big.h], [400, 300], "a parcel larger than the constant draws at its own extent");
  assert.ok(PARCEL_ART_MIN_M > 25, "the constant is the rule; a 25 m parcel is five units on the painting");
});

test("FALSIFIER 2 — a parcel without a pointer renders as today: no box, and no node is mounted", () => {
  assert.equal(parcelArtBox(parcel()), null, "no image: no box");
  assert.equal(parcelArtBox(parcel({ image: OFF_SHELF })), null, "an off-shelf url is not a pointer this page walks");
  assert.equal(parcelArtBox({ ...parcel({ image: SHELF_JPG }), kind: "sited" }), null, "the parcel rule is for parcels");
  const doc = fakeDoc(); const layer = doc.make("g");
  assert.equal(mountPointerArt(doc, layer, { mark: parcel(), box: null, px, cls: "wv-parcel-art" }), null);
  assert.equal(mountPointerArt(doc, layer, { mark: parcel({ image: OFF_SHELF }), box: { x: 0, y: 0, w: 10, h: 10 }, px, cls: "wv-parcel-art" }), null,
    "the shelf gate is the same one every other art surface runs: an off-shelf url never becomes an href");
  assert.equal(layer.children.length, 0);
});

test("FALSIFIER 1 (the node) — the picture is mounted by property assignment, the handlers BEFORE the href, at the box in painting units", () => {
  const doc = fakeDoc(); const layer = doc.make("g");
  const states = [];
  const m = parcel({ image: SHELF_JPG });
  const g = mountPointerArt(doc, layer, { mark: m, box: parcelArtBox(m), px, cls: "wv-parcel-art", onState: (s) => states.push(s) });
  assert.ok(g, "a node was mounted");
  assert.equal(layer.children[0], g);
  assert.equal(g.attrs["data-id"], "alpha/home-parcel");
  const image = g.children[0];
  assert.equal(image.tag, "image");
  assert.equal(image.attrs.href, SHELF_JPG, "the ABSOLUTE shelf url, set as a property — it never touched a markup string");
  assert.deepEqual(image.hrefSetWhenListeners.sort(), ["error", "load"], "both handlers were attached before the href was set");
  // 120 m centred on (500,-200) at 5 m/px → x from 485+(440/5)=573 to 485+(560/5)=597 → 24 units wide
  assert.equal(image.attrs.x, "573.0"); assert.equal(image.attrs.width, "24.0");
  assert.equal(image.attrs.y, (760 + (-260) / 5).toFixed(1)); assert.equal(image.attrs.height, "24.0");
  assert.equal(image.attrs.preserveAspectRatio, "xMidYMid meet", "a picture is fitted, never stretched");
  image.fire("load");
  assert.deepEqual(states, ["drawn"]);
});

test("FALSIFIER 3 — a pointer to a missing resource renders nothing and the receipt says so", () => {
  const doc = fakeDoc(); const layer = doc.make("g");
  const states = [];
  const m = parcel({ image: SHELF_JPG });
  const g = mountPointerArt(doc, layer, { mark: m, box: parcelArtBox(m), px, cls: "wv-parcel-art", onState: (s) => states.push(s) });
  assert.equal(layer.children.length, 1);
  g.children[0].fire("error");
  assert.equal(layer.children.length, 0, "the failed picture took its node with it — no broken-image glyph, no empty frame");
  assert.deepEqual(states, ["missing"]);
  const line = pointerReceiptLine(m, "missing");
  assert.match(line, /alpha\/home-parcel/, "the receipt names the mark");
  assert.match(line, new RegExp(SHELF_JPG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "and the url that did not answer");
  assert.match(line, /nothing drawn/);
  assert.match(pointerReceiptLine(parcel({ image: OFF_SHELF }), "off-shelf"), /not on the town's shelf/);
});

test("FALSIFIER 4 — a wash is a RINGED mark's SVG pointer, told apart by the record's own shape", () => {
  assert.equal(isWashPointer(region({ image: SHELF_SVG })), true, "ring + svg pointer = a wash");
  assert.equal(isWashPointer(region({ image: SHELF_JPG })), false, "ring + photograph = a photograph (the card, as today)");
  assert.equal(isWashPointer(region({ image: SHELF_SVG, points: undefined })), false, "no ring: no wash");
  assert.equal(isWashPointer(region({ image: OFF_SHELF.replace(".png", ".svg") })), false, "an off-shelf svg is never asked for");
  assert.equal(isWashPointer(parcel({ image: SHELF_SVG })), false, "a parcel carries no ring and is a home, not a region");
  const box = washBox(region({ image: SHELF_SVG }));
  assert.deepEqual(box, { x: 50, y: 30, w: 100, h: 60 }, "the wash is the mark's whole extent — the ring's bbox");
  assert.equal(WASH_PRESERVE_ASPECT, "none", "stretched onto the bbox the svg's own viewBox already is");
});

test("THE WIRING — washes under the record, homes over the footprints and under the pips, town scene only, and the 08-21 switch untouched", () => {
  const wash = SOURCE.indexOf('washLayer.setAttribute("id", "wv-wash-layer")');
  const grid = SOURCE.indexOf('gridLayer.setAttribute("id", "wv-grid-layer")');
  const fp = SOURCE.indexOf('fpLayer.setAttribute("id", "wv-fp-layer")');
  const art = SOURCE.indexOf('parcelArtLayer.setAttribute("id", "wv-parcel-art-layer")');
  const convo = SOURCE.indexOf('convoLayer.setAttribute("id", "wv-convo-layer")');
  assert.ok(wash > 0 && grid > wash, "the wash layer is appended BEFORE the grid — the first derived layer above the painting");
  assert.ok(fp > 0 && art > fp && convo > art, "the parcel-art layer sits after the footprints and before the conversations/pips");
  assert.match(SOURCE, /if \(!placeholderExtents\) \{\s*\n\s*const artPx/, "the pointers are walked in the TOWN scene only — a room hangs its art through sceneArtSVG");
  assert.match(SOURCE, /const cardArt = markArtOnMap\(\);/, "the card-figure switch of 2026-08-21 is exactly where it was");
  assert.equal(markArtOnMap(""), false, "and its default is still off");
  assert.match(SOURCE, /image\.setAttribute\("href", url\); \/\/ last, after the handlers/);
  assert.match(SOURCE, /notePointerCounts\(\{ parcels, washes \}\)/, "the receipt is told how many were asked for");
});
