// atlas-look.test.mjs — the three look constants (2026-09-09): the Atlas's
// identity the sheet carries without a hand, each ON by default, each off
// returning the ground to exactly the 09-08 sheet.
//
// Every assertion is on what townGround EMITS, and each has a can-fail arm:
// the element is present with the constant on AND absent with it off, so a
// constant that does nothing reds here in one direction or the other.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GROUND_FRAME, PAPER_GRAIN, REGION_FOUNDER_LINE, regionFounderLine, townGround, townRegionMarks,
} from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const world = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const SOURCE = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
const om = String(skeleton._grid?.origin ?? "").match(/\((\d+)\s*,\s*(\d+)\)/);
const sm = String(skeleton._grid?.scale ?? "").match(/(\d+(?:\.\d+)?)\s*m per atlas px/);
const originPx = { x: +om[1], y: +om[2] }, mPerPx = +sm[1];
const ground = (opts = {}) => townGround(world.marks, skeleton, { originPx, mPerPx, ...opts }).svgText;
const regions = townRegionMarks(world.marks);

// the Atlas's own values, read from render-town.mjs / town.html @ town 715eb65f
const ATLAS = {
  grainFilter: /<feTurbulence type="fractalNoise" baseFrequency="0\.85" numOctaves="2" seed="7" stitchTiles="stitch" result="noise"\/><feColorMatrix in="noise" type="matrix" values="0 0 0 0 0\.25  0 0 0 0 0\.2  0 0 0 0 0\.12  0 0 0 0\.05 0"\/>/,
  frameStroke: /\.wv-tg-frame \{[^}]*stroke:#5a4c33;/,
  founderType: /\.wv-tg-region-founder \{ font:italic 12px Georgia,[^}]*fill:#4a3f2a;/,
};

test("THE DEFAULTS ARE ON — the sitting's word", () => {
  assert.equal(PAPER_GRAIN, true);
  assert.equal(GROUND_FRAME, true);
  assert.equal(REGION_FOUNDER_LINE, true);
});

test("PAPER_GRAIN: the Atlas's paperGrain filter and a grain rect over the paper — present on, absent off", () => {
  const on = ground({ grain: true }), off = ground({ grain: false });
  assert.match(on, ATLAS.grainFilter, "the filter is the Atlas's, to the byte");
  assert.match(on, /<rect class="wv-tg-paper"[^>]*\/><rect class="wv-tg-grain"[^>]*filter="url\(#wv-tg-grain\)"\/><rect class="wv-tg-rule"/,
    "the grain lies directly over the paper and under the rule");
  assert.ok(!/wv-tg-grain/.test(off), "off: no grain rect and no filter");
  assert.ok(!/feTurbulence/.test(off));
});

test("GROUND_FRAME: the Atlas's .mapwrap border on the sheet's edge, last on the ground — present on, absent off", () => {
  const on = ground({ frame: true }), off = ground({ frame: false });
  const m = on.match(/<rect class="wv-tg-frame" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="4"\/>/);
  assert.ok(m, "the frame rect is drawn");
  const vb = on.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  assert.ok(Math.abs(Number(m[1]) - (vb[0] + 1)) < 0.01 && Math.abs(Number(m[3]) - (vb[2] - 2)) < 0.01, "inset one unit inside the viewBox so the stroke is not clipped");
  assert.ok(on.indexOf('class="wv-tg-frame"') > on.lastIndexOf('class="wv-tg-region-label"'), "above the names — the last thing on the ground");
  assert.match(SOURCE, ATLAS.frameStroke, "stroked in the Atlas's border colour");
  assert.ok(!/wv-tg-frame/.test(off), "off: no frame");
});

test("REGION_FOUNDER_LINE: under every region's name, 18 units down, the mark's own by: — present on, absent off", () => {
  const on = ground({ founderLine: true }), off = ground({ founderLine: false });
  for (const m of regions) {
    const label = on.match(new RegExp(`<text class="wv-tg-region-label" data-src="mark:${m.id}" x="([^"]+)" y="([^"]+)"`));
    assert.ok(label, `${m.id}: its name is on the ground`);
    const line = on.match(new RegExp(`<text class="wv-tg-region-founder" data-src="mark:${m.id}" x="([^"]+)" y="([^"]+)" text-anchor="middle">([^<]*)</text>`));
    assert.ok(line, `${m.id}: its founder line is on the ground`);
    assert.equal(line[1], label[1], "centred on the name");
    assert.ok(Math.abs(Number(line[2]) - Number(label[2]) - 18) < 0.01, "18 units under it — the Atlas's own offset");
    assert.equal(line[3], regionFounderLine(m), `${m.id}: the line is the record's`);
    assert.ok(line[3].length > 0);
  }
  assert.ok(!/wv-tg-region-founder/.test(off), "off: no founder line");
  assert.match(SOURCE, ATLAS.founderType, "set in the Atlas's .region-founder type");
});

test("the founder line is the RECORD's: a resident's region says who founded it; the town's own says the Atlas's doctrine line; no by, no line", () => {
  assert.equal(regionFounderLine({ by: "caelum" }), "founded by caelum");
  assert.equal(regionFounderLine({ by: "the-town" }), "tended, never owned");
  assert.equal(regionFounderLine({}), "");
  const evermoon = regions.find((m) => m.id === "caelum/evermoon");
  assert.equal(regionFounderLine(evermoon), "founded by caelum");
});

test("ALL THREE OFF → the sheet is the 09-08 ground, element for element (the wash layer aside)", () => {
  const off = ground({ grain: false, frame: false, founderLine: false, washes: false });
  assert.ok(!/wv-tg-grain|wv-tg-frame|wv-tg-region-founder/.test(off));
  // and every drawn element on it is one the 09-08 falsifiers already know: paper, rule, light, region, water, feature, label
  const classes = new Set([...off.matchAll(/<(?:rect|polygon|polyline|circle|ellipse|line|text) class="([^"]+)"/g)].map((m) => m[1].split(/\s+/)[0]));
  for (const c of classes) assert.match(c, /^wv-tg-(paper|rule|daylight|night|region|water|water-line|feature|region-label)$/, `${c} is a 09-08 class`);
});
