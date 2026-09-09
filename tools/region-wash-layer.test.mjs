// region-wash-layer.test.mjs — the falsifiers for the viewer's WASH LAYER.
//
// The brief's four (2026-09-09): a region with a pointer draws its wash; one
// without draws nothing and the page's receipt names it; a dangling pointer
// draws nothing, no broken glyph; the layer off → no washes, everything else
// unchanged. Each is asserted on what townGround EMITS and on what
// hydrateRegionWashes DOES to real-enough nodes — never on pixels, and never by
// re-deriving the answer and comparing it to itself.
//
// A fifth guards the rule the emitter keeps: THE URL NEVER TOUCHES THE STRING.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGION_WASH_LAYER, hydrateRegionWashes, regionWashPointer, regionWashWhyNot, townGround, townRegionMarks, washReceiptText,
} from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const world = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const SOURCE = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
const om = String(skeleton._grid?.origin ?? "").match(/\((\d+)\s*,\s*(\d+)\)/);
const sm = String(skeleton._grid?.scale ?? "").match(/(\d+(?:\.\d+)?)\s*m per atlas px/);
const originPx = { x: +om[1], y: +om[2] }, mPerPx = +sm[1];
const ground = (marks, opts = {}) => townGround(marks, skeleton, { originPx, mPerPx, ...opts });

const SHELF = "https://media.postmark.town/media/keeminlee/";
const SVG_URL = `${SHELF}${"a".repeat(64)}.svg`;
const JPG_URL = `${SHELF}${"b".repeat(64)}.jpg`;

/** the served record with every region's pointer replaced as the test says — a deep-enough copy */
function withPointers(edit) {
  return world.marks.map((m) => (m.points && townRegionMarks([m]).length ? { ...m, ...edit(m) } : m));
}

const images = (svg) => [...svg.matchAll(/<image class="wv-tg-wash"([^>]*)\/>/g)].map((m) => m[1]);
const polygons = (svg) => [...svg.matchAll(/<polygon class="wv-tg-region"([^>]*)\/>/g)].map((m) => ({ attrs: m[1] }));

test("A REGION WITH A POINTER DRAWS ITS WASH: an <image> over its ring's bbox, under the marks, and its polygon gives up its paint", () => {
  const marks = withPointers(() => ({ image: SVG_URL }));
  const regions = townRegionMarks(marks);
  const g = ground(marks);
  const imgs = images(g.svgText);
  assert.equal(imgs.length, regions.length, `one wash per ringed region (${regions.length})`);
  for (const m of regions) {
    const img = imgs.find((a) => a.includes(`data-src="mark:${m.id}"`));
    assert.ok(img, `${m.id}: its wash names it in data-src`);
    // the box is the ring's bbox, in sheet units — back-projected to metres it is the ring's own extremes
    const xs = m.points.map((p) => (Array.isArray(p) ? p[0] : p.x)), ys = m.points.map((p) => (Array.isArray(p) ? p[1] : p.y));
    const at = (k) => Number(img.match(new RegExp(`\\b${k}="([^"]*)"`))[1]);
    const mx = (at("x") - originPx.x) * mPerPx, my = (at("y") - originPx.y) * mPerPx;
    assert.ok(Math.abs(mx - Math.min(...xs)) <= 0.6 && Math.abs(my - Math.min(...ys)) <= 0.6, `${m.id}: the image's corner is the ring's min corner (${mx},${my})`);
    assert.ok(Math.abs(at("width") * mPerPx - (Math.max(...xs) - Math.min(...xs))) <= 0.6, `${m.id}: the image's width is the ring's`);
    assert.match(img, /preserveAspectRatio="none"/, "stretched to the box, never fitted — the SVG's own viewBox is that box");
    const poly = polygons(g.svgText).find((p) => p.attrs.includes(`data-src="mark:${m.id}"`));
    assert.ok(poly.attrs.includes(`data-wash-of="${m.id}"`), `${m.id}: the polygon names the wash it stands under (the class stays the literal the 09-08 falsifiers read)`);
    assert.match(poly.attrs, /fill="none"/, "and its paint is withdrawn");
  }
  // LAYER ORDER: the wash sits after the paper and the light and before the water — under the marks by construction (the overlay is a later layer)
  const first = g.svgText.indexOf('<image class="wv-tg-wash"'), paper = g.svgText.indexOf('class="wv-tg-paper"'), water = g.svgText.indexOf('class="wv-tg-water"');
  assert.ok(paper < first && first < water, "paper, then the wash, then the water");
  assert.equal(g.washes.filter((w) => w.state === "asked").length, regions.length, "and the receipt counts every wash asked for");
});

test("THE URL NEVER TOUCHES THE STRING: the emitted <image> carries no href at all — the pointer is hung on the real node", () => {
  const marks = withPointers(() => ({ image: SVG_URL }));
  const g = ground(marks);
  assert.ok(!g.svgText.includes("href="), "no href in the ground's markup");
  assert.ok(!g.svgText.includes("media.postmark.town"), "no shelf url in the ground's markup");
  assert.match(SOURCE, /image\.addEventListener\("error"[\s\S]{0,200}image\.setAttribute\("href", url\)/, "the error handler is attached BEFORE the href");
});

test("A REGION WITHOUT A POINTER DRAWS NOTHING OF A WASH, keeps today's hue, and the receipt names it with why", () => {
  const g = ground(world.marks.map((m) => ({ ...m, image: undefined })));   // the record as it stood before the sitting
  assert.equal(images(g.svgText).length, 0, "no wash images");
  for (const p of polygons(g.svgText)) {
    assert.ok(!/data-wash-of=/.test(p.attrs), "no polygon wears a wash");
    assert.match(p.attrs, /fill="hsl\(\d+ 24% 62%\)"/, "the hue fill of 09-08 is exactly what it was");
  }
  assert.ok(g.washes.length >= 12 && g.washes.every((w) => w.state === "no-pointer"), "every region is on the receipt as having no pointer");
  const { summary, lines } = washReceiptText(g.washes);
  assert.match(summary, /0 region washes asked for · 0 drawn · \d+ without a wash/);
  assert.ok(lines.some((l) => /^Evermoon: no wash pointer on the record$/.test(l)), `Evermoon is named with the reason (${lines[0]})`);
  // and the three other reasons, each its own word
  assert.equal(regionWashWhyNot({ image: "https://elsewhere.example/x.svg", points: [[0, 0], [1, 0], [0, 1]] }), "off-shelf");
  assert.equal(regionWashWhyNot({ image: JPG_URL, points: [[0, 0], [1, 0], [0, 1]] }), "not-svg");
  assert.equal(regionWashPointer({ image: JPG_URL, points: [[0, 0], [1, 0], [0, 1]] }), null, "a photograph on a ringed mark is not a wash");
  assert.equal(regionWashPointer({ image: SVG_URL }), null, "an SVG on a mark with no ring is not a wash either");
});

/** just enough DOM for the hydrator: elements with attributes, listeners, a parent, and a class list */
function fakeSvg({ ids, pointerOf }) {
  const els = [];
  const el = (tag, attrs) => {
    const node = {
      tag, attrs: { ...attrs }, listeners: {}, removed: false, classes: new Set((attrs.class ?? "").split(/\s+/).filter(Boolean)),
      getAttribute(k) { return this.attrs[k] ?? null; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      fire(type) { for (const fn of this.listeners[type] ?? []) fn(); },
      remove() { this.removed = true; },
      classList: { remove: (c) => node.classes.delete(c), contains: (c) => node.classes.has(c) },
    };
    els.push(node);
    return node;
  };
  for (const id of ids) {
    el("image", { class: "wv-tg-wash", "data-src": `mark:${id}`, "data-wash-for": id });
    el("polygon", { class: "wv-tg-region", "data-src": `mark:${id}`, "data-wash-of": id, "data-hue": "120", fill: "none", stroke: "none" });
  }
  return {
    els,
    querySelectorAll: (sel) => (sel.startsWith("image") ? els.filter((e) => e.tag === "image" && !e.removed && e.attrs["data-wash-for"] !== undefined) : []),
    querySelector: (sel) => { const id = sel.match(/data-wash-of="([^"]*)"/)?.[1]; return els.find((e) => e.tag === "polygon" && e.attrs["data-wash-of"] === id) ?? null; },
    resolve: (id) => ({ id, points: [[0, 0], [1, 0], [0, 1]], image: pointerOf(id) }),
  };
}

test("A DANGLING POINTER DRAWS NOTHING AND NO BROKEN GLYPH: the failed image leaves the tree, the ring gets its hue back, the receipt says 'did not answer'", () => {
  const svg = fakeSvg({ ids: ["a/one", "b/two"], pointerOf: () => SVG_URL });
  const states = [];
  const asked = hydrateRegionWashes(svg, svg.resolve, { onState: (id, s) => states.push([id, s]) });
  assert.equal(asked, 2, "both were asked for");
  const [img1, poly1, img2] = svg.els;
  assert.equal(img1.attrs.href, SVG_URL, "the href was hung on the node — and only after the handlers");
  assert.equal(img1.attrs["data-wash-for"], undefined, "hydrated once");
  img1.fire("error");                                    // the shelf does not answer (the pending-upload case)
  assert.equal(img1.removed, true, "the failed image is gone — nothing to draw a broken glyph with");
  assert.equal(poly1.attrs.fill, "hsl(120 24% 62%)", "and the ring polygon under it has its hue back");
  assert.equal(poly1.attrs["data-wash-of"], undefined, "and no longer names a wash");
  img2.fire("load");
  assert.deepEqual(states, [["a/one", "missing"], ["b/two", "drawn"]]);
  const { summary, lines } = washReceiptText([{ id: "a/one", state: "missing" }, { id: "b/two", state: "drawn" }]);
  assert.match(summary, /^2 region washes asked for · 1 drawn · 1 did not answer$/);
  assert.deepEqual(lines, ["One: its pointer did not answer — nothing drawn"]);
  // and a pointer the record no longer carries at hydrate time is not asked for at all
  const svg2 = fakeSvg({ ids: ["c/three"], pointerOf: () => undefined });
  const st2 = [];
  assert.equal(hydrateRegionWashes(svg2, svg2.resolve, { onState: (id, s) => st2.push([id, s]) }), 0);
  assert.equal(svg2.els[0].removed, true);
  assert.equal(svg2.els[0].attrs.href, undefined, "no href was ever set");
  assert.deepEqual(st2, [["c/three", "no-pointer"]]);
});

test("THE LAYER OFF → no washes, and everything else byte-identical to the ground drawn before the sitting", () => {
  assert.equal(REGION_WASH_LAYER, true, "the default is ON (the sitting's word)");
  const marks = withPointers(() => ({ image: SVG_URL }));
  const off = ground(marks, { washes: false });
  assert.equal(images(off.svgText).length, 0, "no wash images");
  assert.ok(!off.svgText.includes("data-wash-of="), "no polygon wears one");
  assert.ok(off.washes.every((w) => w.state === "layer-off"));
  assert.equal(washReceiptText(off.washes).summary, "region washes: off");
  // the 09-08 ground, drawn from a record with no pointers at all, is the same sheet
  const before = ground(world.marks.map((m) => ({ ...m, image: undefined })));
  const strip = (s) => s.replace(/ data-hue="\d+"/g, "");   // the one attribute the layer adds to every polygon regardless
  assert.equal(strip(off.svgText), strip(before.svgText), "layer off == the ground as it was, to the byte (data-hue aside)");
  // and can fail: the layer ON over the same pointered record is NOT the same sheet
  assert.notEqual(strip(ground(marks).svgText), strip(before.svgText), "the layer on changes the sheet");
});
