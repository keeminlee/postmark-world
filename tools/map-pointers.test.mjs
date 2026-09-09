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
//   4. the walker carries NO wash arm — a region's wash is the ground's own
//      (townGround, the regions lane; ruled 2026-09-09) — and only parcels are walked;
//   5. the 08-21 card-figure switch (`mark-art`) is untouched.
//
//   node --test tools/map-pointers.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as viewer from "../spectator/viewer.mjs";
import {
  PARCEL_ART_MIN_M, PARCEL_LABEL_M, markArtOnMap, mountPointerArt, parcelArtBox, parcelFrameSVG,
  parcelLabel, parcelReadThrough, parcelReadThroughRow, pointerReceiptLine,
} from "../spectator/viewer.mjs";

// ── THE PARCEL IS FIRST-CLASS (Keemin, 2026-09-09: "they have higher significance now") ──
// Three rules: (1) outline + a label naming the resident, always on; (2) the
// picture regardless of the mark-art toggle; (3) the read-through to the
// resident's home page — a parcel without one says so, a non-parcel opens nothing.

test("RULE 1 — every parcel gets its frame: the outline at its extent and a label naming the resident, whether or not it has a picture", () => {
  const pxf = (p) => ({ x: 485 + p.x / 5, y: 760 + p.y / 5 });
  const bare = { id: "alpha/home-parcel", kind: "parcel", by: "alpha", at: { x: 500, y: -200 }, extent: { w: 25, h: 25 } };
  const meta = { name: "Alpha of the Reach" };
  assert.deepEqual(parcelLabel(bare, meta), { handle: "alpha", text: "Alpha of the Reach" }, "the shown name where the roster knows one");
  assert.deepEqual(parcelLabel(bare, null), { handle: "alpha", text: "alpha" }, "the handle where it does not");
  assert.equal(parcelLabel({ ...bare, kind: "sited" }, meta), null, "a bench is not labelled as a home");
  const svg = parcelFrameSVG(bare, pxf, parcelLabel(bare, meta));
  assert.match(svg, /<rect class="wv-parcel-outline" x="582\.5" y="717\.5" width="5\.0" height="5\.0"\/>/, "the outline is the TRUE extent, five painting units for a 25 m parcel");
  assert.match(svg, /<text class="wv-parcel-label"[^>]*>Alpha of the Reach<\/text>/, "the label names the resident");
  assert.match(svg, new RegExp(`font-size="${(PARCEL_LABEL_M / 5).toFixed(1)}"`), "the label's height is the one constant, in painting units");
  const y = Number(svg.match(/<text[^>]* y="([0-9.]+)"/)[1]);
  assert.ok(y > 720 + PARCEL_ART_MIN_M / 10, "the label sits below the picture's box, never across it");
  assert.equal(parcelFrameSVG({ ...bare, kind: "sited" }, pxf, null), "", "no frame for a non-parcel");
  const hostile = parcelFrameSVG({ ...bare, id: 'x/"><script>' }, pxf, { handle: "x", text: "<b>&" });
  assert.doesNotMatch(hostile, /<script>|<b>/, "every value is escaped — the frame is a string, so it must be");
});

test("RULE 2 — the picture hangs regardless of the 08-21 card-figure switch", () => {
  assert.equal(markArtOnMap(""), false, "the switch is off");
  assert.ok(parcelArtBox({ id: "a/p", kind: "parcel", by: "a", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 }, image: SHELF_JPG }), "and the parcel still has its box");
  const walker = SOURCE.slice(SOURCE.indexOf("if (walkPointers) {"), SOURCE.indexOf("svg.insertBefore(frameLayer, parcelArtLayer);"));
  assert.ok(walker.length > 100, "the walker block was found");
  assert.doesNotMatch(walker, /markArtOnMap|cardArt/, "the walker never consults the switch");
});

test("RULE 3 — the read-through: a parcel opens its resident's home page; a parcel without one says so; a non-parcel opens nothing", () => {
  const p = { id: "alpha/home-parcel", kind: "parcel", by: "alpha", at: { x: 0, y: 0 } };
  assert.deepEqual(parcelReadThrough(p, { meta: { name: "Alpha" }, rosterLoaded: true }), { href: "/residents/alpha/", name: "Alpha" });
  assert.deepEqual(parcelReadThrough(p, { meta: null, rosterLoaded: false }), { href: "/residents/alpha/", name: "alpha" }, "a roster that has not loaded is not 'no page'");
  const missing = parcelReadThrough(p, { meta: null, rosterLoaded: true });
  assert.equal(missing.href, null); assert.match(missing.why, /no resident page for alpha/);
  const odd = parcelReadThrough({ ...p, by: "Not A Handle" }, { rosterLoaded: false });
  assert.equal(odd.href, null); assert.match(odd.why, /not a handle/);
  assert.equal(parcelReadThrough({ ...p, kind: "sited" }, { meta: { name: "Alpha" }, rosterLoaded: true }), null, "a bench opens nothing");
  assert.match(parcelReadThroughRow(p, { meta: { name: "Alpha" }, rosterLoaded: true }), /<a href="\/residents\/alpha\/">Read Alpha's home page →<\/a>/);
  assert.match(parcelReadThroughRow(p, { meta: null, rosterLoaded: true }), /wv-quiet.*no resident page for alpha/);
  assert.equal(parcelReadThroughRow({ ...p, kind: "sited" }, {}), "", "no row on a non-parcel's card");
  assert.match(SOURCE, /\$\{parcelReadThroughRow\(full, \{ meta: residentsMeta\.get\(full\.by\) \?\? null, rosterLoaded: residentsRosterLoaded \}\)\}/, "the row rides the mark cell, in the byline's own idiom");
  assert.match(SOURCE, /if \(entries\.length\) \{ residentsMeta = new Map\(entries\); residentsRosterLoaded = true; \}/, "and 'loaded' means the roster actually answered");
});

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

test("FALSIFIER 4 — the walker carries NO wash arm: a ringed mark's SVG pointer is the ground's business, and only parcels are walked", () => {
  for (const name of ["isWashPointer", "washBox", "WASH_PRESERVE_ASPECT"])
    assert.equal(name in viewer, false, `${name} must not exist — the wash layer lives in townGround (the regions lane), not in this walker`);
  assert.equal(parcelArtBox(region({ image: SHELF_SVG })), null, "a ringed sited mark wearing an svg pointer is not a parcel and gets no box");
  assert.equal(parcelArtBox(region({ image: SHELF_JPG })), null, "nor with a photograph");
  assert.doesNotMatch(SOURCE, /wv-wash-layer/, "no wash layer is mounted by this walker");
  assert.match(SOURCE, /for \(const m of world\.marks \?\? \[\]\) \{\s*\n\s*if \(m\.kind !== "parcel"\) continue;/, "the walk is parcels only, decided at the top of the loop");
});

test("THE WIRING — homes over the footprints and under the pips, town scene only, the receipt names its source, and the 08-21 switch untouched", () => {
  // THE APPEND ORDER, not the declaration order: what a reader sees is which
  // node was appended after which (a flip that moved only the appendChild left
  // a declaration-order check green — the check must read the behaviour it names).
  const fp = SOURCE.indexOf("svg.appendChild(fpLayer);");
  const art = SOURCE.indexOf("svg.appendChild(parcelArtLayer);");
  const convo = SOURCE.indexOf("svg.appendChild(convoLayer);");
  for (const [name, i] of Object.entries({ fp, art, convo })) assert.ok(i > 0, `${name} layer is appended exactly once, by name`);
  assert.equal(SOURCE.split("svg.appendChild(parcelArtLayer);").length, 2, "the parcel-art layer is appended once");
  assert.ok(fp > 0 && art > fp && convo > art, "the parcel-art layer sits after the footprints and before the conversations/pips");
  assert.match(SOURCE, /notePointerCounts\(\{ parcels, source: state\.dataSource \?\? null \}\)/, "the receipt is told which record the page drew from (office-first read)");
  assert.match(SOURCE, /record read from \$\{pointerCounts\.source\}/, "and prints it");
  assert.match(SOURCE, /renders from the white pages, the free tier's bedrock/, "a home without a parcel is the free tier's bedrock, said in the receipt's own words");
  assert.match(SOURCE, /if \(walkPointers\) \{\s*\n\s*const artPx/, "the pointers are walked when the scene says so");
  assert.match(SOURCE, /walkPointers = true \}\) \{/, "and the town says so by default");
  assert.match(SOURCE, /placeholderExtents: true,[^\n]*\n\s*walkPointers: false,/, "a room does not — its ground hangs its own art through sceneArtSVG");
  assert.doesNotMatch(SOURCE, /if \(!placeholderExtents\) \{\s*\n\s*const artPx/, "the walk is NOT gated on placeholderExtents — the town has run that pass too since 2026-09-08, and a first spelling gated on it walked nothing");
  assert.match(SOURCE, /const cardArt = markArtOnMap\(\);/, "the card-figure switch of 2026-08-21 is exactly where it was");
  assert.equal(markArtOnMap(""), false, "and its default is still off");
  assert.match(SOURCE, /image\.setAttribute\("href", url\); \/\/ last, after the handlers/);
});
