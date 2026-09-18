// thumbnails-follow-the-drawn-size.test.mjs — the viewer asks for the size it
// draws (postmark#2940, Keemin 2026-09-18).
//
//   node --test tools/thumbnails-follow-the-drawn-size.test.mjs
//
// THE RULE. The media door puts two small copies beside each raster original
// (-96, a square; -256, the home card's 52:58) at names derived from the
// original's. A face or a card asks for the SMALLEST COPY THAT COVERS THE BOX
// IT WILL OCCUPY IN DEVICE PIXELS — the glyph's authored units × the pane's px
// per painting unit ÷ the marker counter-scale × devicePixelRatio — and the
// original when neither does, so nothing pixelates when a reader zooms in. A
// copy is asked for on the door's own grammar only: the site's own
// /media/<handle>-avatar-card.jpg faces and any other href pass through.
//
// THE FALLBACK. An <image> whose copy is not there fires `error`; the layer's
// capturing listener swaps in the original the element carries in `data-orig`
// and remembers the miss, so the next draw asks for the original directly —
// once, never a loop, and NOTHING extra on the happy path. The pure half of
// that is held here; the page half (a real Chromium, a real 404, the request
// count) is at the bottom and skips loudly without Playwright.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  THUMB_VARIANTS, THUMB_SIZES, thumbHref, thumbSizeFor, glyphScreenPx, noteThumbMissing, forgetThumbMisses,
  armThumbFallback, walkerFrameSVG, overlayHomeCardSVG, WALKER_FRAME, HOME_CARD, MINE_GLYPH_SCALE, markerScale,
} from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHELF = `/shelf/AionSolare/${SHA}.jpg`;
const HOST = `https://media.postmark.town/media/Ra-Valentine/${SHA}.png`;
const imageTag = (svg) => svg.match(/<image[^>]*>/)?.[0] ?? "";
const attr = (tag, name) => tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? null;

// ── the table is the office's ────────────────────────────────────────────────

test("two copies, the face a square and the card the home card's own shape — the office's table, spelled the same", () => {
  assert.deepEqual(THUMB_SIZES, [96, 256]);
  assert.deepEqual(THUMB_VARIANTS[96], { w: 96, h: 96 });
  assert.deepEqual(THUMB_VARIANTS[256], { w: 256, h: 286 });
  // 256:286 IS the card: 52 wide by 44+14 tall, to the pixel the office cuts
  const cardH = Math.round(256 * (HOME_CARD.h + HOME_CARD.roof) / HOME_CARD.w);
  assert.equal(cardH, 286, "HOME_CARD moved and the office's copy no longer has the card's shape — change both, together");
});

// ── the name is derived, on the door's grammar only ─────────────────────────

test("a shelf raster's href becomes the copy's, on both roads the shelf travels", () => {
  assert.equal(thumbHref(SHELF, 96), `/shelf/AionSolare/${SHA}-96.jpg`);
  assert.equal(thumbHref(SHELF, 256), `/shelf/AionSolare/${SHA}-256.jpg`);
  assert.equal(thumbHref(HOST, 256), `https://media.postmark.town/media/Ra-Valentine/${SHA}-256.png`);
  assert.equal(thumbHref(`/shelf/x-y.z/${SHA}.webp`, 96), `/shelf/x-y.z/${SHA}-96.webp`, "a household with a dot and a dash");
});

test("anything that is not a shelf raster passes through untouched — nothing is asked for that nobody minted", () => {
  for (const href of [
    "/media/alden-avatar-card.jpg",                       // the site's own face cards
    `/shelf/AionSolare/${SHA}.svg`,                        // a vector mints no copy
    "https://media.postmark.town/m/d849fa0eb84fc1399cb1.jpg", // an older grammar
    `/shelf/AionSolare/${SHA.slice(0, 40)}.jpg`,          // not a sha
    `https://evil.example/media/x/${SHA}.jpg`,            // not the host
    "", null, undefined,
  ]) assert.equal(thumbHref(href, 96), String(href ?? ""), `untouched: ${href}`);
  assert.equal(thumbHref(SHELF, null), SHELF, "null means the original");
  assert.equal(thumbHref(SHELF, 512), SHELF, "a size the office does not cut means the original");
});

// ── the size follows the drawn size ──────────────────────────────────────────

test("the smallest copy that COVERS the box; the original past both; the original when the box cannot be measured", () => {
  assert.equal(thumbSizeFor({ w: 50, h: 50 }), 96);
  assert.equal(thumbSizeFor({ w: 96, h: 96 }), 96, "the edge is inclusive");
  assert.equal(thumbSizeFor({ w: 97, h: 50 }), 256, "one side past 96 is past 96");
  assert.equal(thumbSizeFor({ w: 118, h: 132 }), 256, "the card at its largest on a 1× pane");
  assert.equal(thumbSizeFor({ w: 236, h: 263 }), 256, "the card at its largest on a 2× pane — the card's shape is why 286, not 256");
  assert.equal(thumbSizeFor({ w: 236, h: 287 }), null, "a hair taller than the copy: the original, never an upscale");
  assert.equal(thumbSizeFor({ w: 300, h: 300 }), null);
  for (const bad of [{}, { w: NaN, h: 3 }, { w: 0, h: 0 }, { w: -1, h: 5 }, null]) assert.equal(thumbSizeFor(bad), null, `unmeasurable → the original: ${JSON.stringify(bad)}`);
});

test("glyphScreenPx is the box the glyph occupies: units × px per unit ÷ the marker counter-scale × the accent × the pixel ratio", () => {
  // a 1360 px pane over a 1500-unit painting, at k = 1: 0.907 px a unit, no counter-scale
  const cam = (zoomK, extra = {}) => ({ zoomK, viewW: 1500 / zoomK, panePx: 1360, ...extra });
  assert.ok(Math.abs(glyphScreenPx(22, cam(1)) - 22 * 1360 / 1500) < 1e-9);
  // at k = 6.25 the counter-scale is k / 2.5 and the size stops moving: 22 × 0.907 × 2.5
  const capped = 22 * (1360 / 1500) * 2.5;
  assert.ok(Math.abs(glyphScreenPx(22, cam(6.25)) - capped) < 1e-9);
  assert.ok(Math.abs(glyphScreenPx(22, cam(15)) - capped) < 1e-9, "past the cap the box is constant — the tier's face size");
  assert.ok(Math.abs(glyphScreenPx(22, cam(15, { dpr: 2 })) - capped * 2) < 1e-9, "device pixels, not CSS pixels");
  assert.ok(Math.abs(glyphScreenPx(22, cam(15, { mine: true })) - capped * MINE_GLYPH_SCALE) < 1e-9, "your own accent grows the box");
  assert.ok(Math.abs(glyphScreenPx(22, cam(3)) - 22 * (1360 / 1500) * 3 / markerScale(3)) < 1e-9, "the same counter-scale .ov-s applies");
  for (const bad of [{ zoomK: 2, viewW: 0, panePx: 1360 }, { zoomK: 2, viewW: 750, panePx: NaN }, {}])
    assert.ok(Number.isNaN(glyphScreenPx(22, bad)), "a camera that cannot be read is NaN, which thumbSizeFor reads as the original");
});

test("THE WHOLE RULE, on a 1360 px pane: a face is the 96 copy at 1×; a card grows from the 96 into the 256 and stays there at 2×; your own card at 2× is the original", () => {
  const face = (k, dpr = 1, mine = false) => thumbSizeFor({
    w: glyphScreenPx(WALKER_FRAME.near, { zoomK: k, viewW: 1500 / k, panePx: 1360, dpr, mine }),
    h: glyphScreenPx(WALKER_FRAME.near, { zoomK: k, viewW: 1500 / k, panePx: 1360, dpr, mine }),
  });
  const card = (k, dpr = 1, mine = false) => thumbSizeFor({
    w: glyphScreenPx(HOME_CARD.w, { zoomK: k, viewW: 1500 / k, panePx: 1360, dpr, mine }),
    h: glyphScreenPx(HOME_CARD.h + HOME_CARD.roof, { zoomK: k, viewW: 1500 / k, panePx: 1360, dpr, mine }),
  });
  for (const k of [1.5, 3, 7.5, 15, 40]) {
    assert.equal(face(k), 96, `a face at k=${k} on a 1× pane is ≤ 50 px: the 96 copy`);
    assert.equal(card(k, 2), 256, `a card at k=${k} on a 2× pane is ≤ 236×263: the 256 copy, because it is 286 tall`);
  }
  // the card FOLLOWS the size: 58×64 at the mid tier's far edge fits the 96
  // square; 118×132 at near needs the 256 — the same card, two copies, by zoom
  assert.equal(card(1.5), 96, "a card at k=1.5 on a 1× pane is 58×64: the 96 copy covers it");
  assert.equal(card(3), 96, "a card at k=3 is 82×91: still inside the 96");
  assert.equal(card(6.25), 256, "a card at k=6.25 is 118×132: the 256");
  assert.equal(card(40), 256, "and past the marker cap it stays 118×132");
  assert.equal(face(15, 2), 256, "a face at 100 device px is past the 96 copy: the 256");
  assert.equal(card(15, 2, true), null, "your own card at 2× is 318 wide: the original, never a stretched copy");
});

// ── the glyphs carry the copy and the original beside it ────────────────────

test("a face with a shelf href renders the -96 name and carries the original in data-orig; a card renders the -256", () => {
  forgetThumbMisses();
  const face = imageTag(walkerFrameSVG({ at: { x: 1, y: 2 }, handle: "aion", art: { avatar: SHELF }, thumb: 96 }));
  assert.equal(attr(face, "href"), `/shelf/AionSolare/${SHA}-96.jpg`);
  assert.equal(attr(face, "data-orig"), SHELF);
  const card = imageTag(overlayHomeCardSVG({ at: { x: 1, y: 2 }, id: "aion/the-house", image: SHELF, thumb: 256 }));
  assert.equal(attr(card, "href"), `/shelf/AionSolare/${SHA}-256.jpg`);
  assert.equal(attr(card, "data-orig"), SHELF);
});

test("no thumb, or a face that is not on the shelf, renders exactly what it did before — no data-orig, no copy", () => {
  forgetThumbMisses();
  const before = imageTag(walkerFrameSVG({ at: { x: 1, y: 2 }, handle: "aion", art: { avatar: SHELF } }));
  assert.equal(attr(before, "href"), SHELF);
  assert.equal(attr(before, "data-orig"), null);
  const site = imageTag(walkerFrameSVG({ at: { x: 1, y: 2 }, handle: "alden", art: { avatar: "/media/alden-avatar-card.jpg" }, thumb: 96 }));
  assert.equal(attr(site, "href"), "/media/alden-avatar-card.jpg");
  assert.equal(attr(site, "data-orig"), null);
  const orig = imageTag(overlayHomeCardSVG({ at: { x: 1, y: 2 }, id: "p", image: SHELF, thumb: null }));
  assert.equal(attr(orig, "href"), SHELF);
  assert.equal(attr(orig, "data-orig"), null);
});

// ── the fallback, once ───────────────────────────────────────────────────────

/** a stand-in for an SVG <image> the listener can act on */
function fakeImage(href, orig) {
  const attrs = { href, ...(orig ? { "data-orig": orig } : {}) };
  return { attrs, getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
}

test("an href with no copy falls back ONCE: the swap, the memory, and the next draw asks for the original directly", () => {
  forgetThumbMisses();
  const listened = [];
  const layer = { addEventListener: (type, fn, capture) => listened.push({ type, capture }) };
  const onError = armThumbFallback(layer);
  assert.deepEqual(listened, [{ type: "error", capture: true }], "capturing — error does not bubble");
  const el = fakeImage(`/shelf/AionSolare/${SHA}-96.jpg`, SHELF);
  onError({ target: el });
  assert.equal(el.attrs.href, SHELF, "the original is hung");
  assert.equal(el.attrs["data-orig"], undefined, "and the fallback is spent");
  onError({ target: el });
  assert.equal(el.attrs.href, SHELF, "a second error (the original itself) changes nothing — no loop");
  // the miss is remembered: the next draw writes the original with no copy to fail
  const next = imageTag(walkerFrameSVG({ at: { x: 1, y: 2 }, handle: "aion", art: { avatar: SHELF }, thumb: 96 }));
  assert.equal(attr(next, "href"), SHELF);
  assert.equal(attr(next, "data-orig"), null);
  // but only THAT copy: the 256 of the same original is still asked for
  assert.equal(thumbHref(SHELF, 256), `/shelf/AionSolare/${SHA}-256.jpg`);
  forgetThumbMisses();
  assert.equal(thumbHref(SHELF, 96), `/shelf/AionSolare/${SHA}-96.jpg`, "forgotten, it is asked for again");
});

test("an <image> with no data-orig is not the fallback's business; a target with no attributes is ignored", () => {
  const onError = armThumbFallback(null);
  const plain = fakeImage(SHELF);
  onError({ target: plain });
  assert.equal(plain.attrs.href, SHELF);
  onError({ target: null });
  onError({});
  noteThumbMissing(null); // a nothing is not remembered
});

// ── the page: a real Chromium, a real 404, the request count ────────────────
//
// The listener above is proven on a stand-in; the browser's part — that an
// SVG <image> fires `error` on a 404, that the swap re-requests the original,
// and that a copy that IS there costs exactly one request — is proven here on
// the real module served to a real page. The rig: a static server for the
// repo (the page imports spectator/viewer.mjs itself) that answers 200 to the
// original and to ONE copy, 404 to the other, and counts what was asked.

const PLAYWRIGHT_PATHS = ["playwright", "file:///G:/Wright-HQ/node_modules/playwright/index.mjs"];
async function loadChromium() {
  for (const spec of PLAYWRIGHT_PATHS) {
    try { return (await import(spec)).chromium; } catch { /* try the next */ }
  }
  return null;
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

// a 1×1 PNG, the same bytes at every name that answers
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const HAS_COPY = `/shelf/has/${SHA}.png`;
const NO_COPY = `/shelf/none/${SHA}.png`;
const PAGE = `<!doctype html><html><body>
<svg id="map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200"><g id="layer"></g></svg>
<script type="module">
  import { armThumbFallback, walkerFrameSVG, overlayHomeCardSVG } from "/spectator/viewer.mjs";
  const layer = document.getElementById("layer");
  armThumbFallback(layer);
  layer.innerHTML = walkerFrameSVG({ at: { x: 60, y: 60 }, handle: "has", art: { avatar: ${JSON.stringify(HAS_COPY)} }, thumb: 96 })
    + overlayHomeCardSVG({ at: { x: 200, y: 100 }, id: "none/house", image: ${JSON.stringify(NO_COPY)}, thumb: 256 });
  window.__thumbRigReady = true;
</script></body></html>`;

let chromium = null, browser = null, rig = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const port = await freePort();
  const asked = [];
  const MIME = { ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    asked.push(url.pathname);
    if (url.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(PAGE); }
    if (url.pathname.startsWith("/shelf/")) {
      // the original always; the copy only for the `has` household
      const isCopy = /-(?:96|256)\.png$/.test(url.pathname);
      if (!isCopy || url.pathname.startsWith("/shelf/has/")) { res.writeHead(200, { "content-type": "image/png" }); return res.end(PNG); }
      res.writeHead(404); return res.end("");
    }
    const file = join(ROOT, url.pathname);
    if (existsSync(file) && file.startsWith(ROOT)) { res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }); return res.end(readFileSync(file)); }
    res.writeHead(404); res.end("");
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
  rig = { port, asked };
});

const skipReason = "playwright is absent, so the browser's half goes unmeasured: that an SVG <image> fires `error` on a 404, "
  + "that the swap re-requests the original, and that a copy that is there costs one request and never two.";

test("IN A REAL PAGE: a copy that is there costs one request; one that is not costs the 404 and the original, then stands", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${rig.port}/`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => window.__thumbRigReady === true, null, { timeout: 30_000 });
  // let the image loads settle: the 404, the swap, the original
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("image")];
    return imgs.length === 2 && imgs.every((i) => !i.hasAttribute("data-orig") || i.getAttribute("href").includes("/has/"));
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const hrefs = await page.$$eval("image", (imgs) => imgs.map((i) => [i.getAttribute("href"), i.getAttribute("data-orig")]));
  const shelf = rig.asked.filter((p) => p.startsWith("/shelf/"));
  await page.close();
  assert.deepEqual(hrefs[0], [`/shelf/has/${SHA}-96.png`, HAS_COPY], "the face keeps the copy it asked for");
  assert.deepEqual(hrefs[1], [NO_COPY, null], "the card fell back to its original and spent its fallback");
  assert.deepEqual(shelf.filter((p) => p.startsWith("/shelf/has/")), [`/shelf/has/${SHA}-96.png`], "the happy path is ONE request — the copy, and never the original beside it");
  assert.deepEqual(shelf.filter((p) => p.startsWith("/shelf/none/")), [`/shelf/none/${SHA}-256.png`, NO_COPY], "the miss is the 404 and then the original, once");
});
