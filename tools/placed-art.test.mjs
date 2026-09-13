// placed-art.test.mjs — a large mark hangs its own picture on its own ground
// (Keemin, 2026-09-12, watching the mountain do it: "oh yes that's beautiful.
// let's do that").
//
//   node --test tools/placed-art.test.mjs
//
// WHAT THIS REPLACES. `drawFarCountry` hung ONE picture from a URL typed into
// viewer.mjs (`PANDO_ART_URL`), found by asking the record for the single mark
// with `far` and `feature === "pando-peak"`. Everything about it was a special
// case except the idea. The idea is now a rule: any mark big enough to be a
// PLACE rather than a thing standing in one, carrying a picture on the record,
// wears it over the ground it covers, at `far` and `mid`.
//
// THE THRESHOLD IS ASSERTED AGAINST THE RECORD, NOT REMEMBERED. The first test
// below recomputes both facts the dial was chosen from — every parcel is 25 m,
// the districts start at 300 m — out of WORLD/world-state.json on each run. If
// the town's shape moves under it, this reds and says so, instead of quietly
// keeping a number that used to be between two things.
//
// AND THE PAGE IS DRIVEN, for the same reason tools/town-ground-page.test.mjs
// exists and says so at length: the rule lives in a closure, and a regex over
// the source proves a line was typed, never that a picture reached the screen.
// The tier gate, the cull, the DOM seam and the Pando swap are all read off a
// mounted page. When Playwright is absent this file SKIPS AND SAYS WHAT WENT
// UNGUARDED — a skip is not a pass.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { placedArtSVG, SPECTATOR_DRAW_DEFAULTS } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");
const WORLD = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const span = (m) => Math.max(Number(m?.extent?.w) || 0, Number(m?.extent?.h) || 0);

// ── the threshold, recomputed from the town it was read off ─────────────────

test("the dial sits in the gap the record actually has, between a parcel and a district", () => {
  const parcels = WORLD.marks.filter((m) => m.kind === "parcel" && m.extent);
  assert.ok(parcels.length > 50, `the town has parcels to measure (${parcels.length})`);
  const parcelSpans = [...new Set(parcels.map(span))];
  assert.deepEqual(parcelSpans, [25], "every parcel in the town is 25 m across");

  const floor = SPECTATOR_DRAW_DEFAULTS.placed_art_min_m;
  assert.ok(floor > Math.max(...parcelSpans),
    `the dial (${floor} m) is above every parcel, so a house is never hung by this rule`);

  // The districts: the market-tier place marks a reader zooms out to see. What
  // has to clear the dial is their SPAN, because that is what the rule reads —
  // deliberately, so a 300 x 2,200 strip qualifies as the place it is rather
  // than being disqualified for being narrow.
  const districts = WORLD.marks.filter((m) => m.extent && span(m) >= 1000 && m.tier === "market");
  assert.ok(districts.length >= 8, `the district-sized marks are there to measure (${districts.length})`);
  const smallest = Math.min(...districts.map(span));
  assert.ok(floor < smallest,
    `the dial (${floor} m) is below the smallest district span (${smallest} m)`);
  // The narrow sides run much thinner than the districts do — the record's long
  // thin places (a worn path, a run) are 30 m across and 1,700 m long. They pass
  // this rule, on their length, and that is the intended answer: a path IS a
  // place. Written down because "300 m on the narrow side" is the figure the
  // dial was proposed from, and it is not the figure the rule reads.
  const narrowest = Math.min(...districts.map((m) => Math.min(m.extent.w, m.extent.h)));
  assert.ok(narrowest < floor,
    `the record does hold long thin places (narrowest side ${narrowest} m), and they qualify on span`);
  // ⚑ THE FLIP: move placed_art_min_m to 10 and the parcel assertion reds; to
  //   4000 and the district one does.
});

test("the dial is a dial — Keemin can move it with a finger, not a pull request", () => {
  assert.match(SOURCE, /\{ key: "placed_art_min_m", label: "[^"]+", min: \d+, max: \d+, step: \d+ \}/,
    "it has a row in DRAW_DIALS beside art_min_px");
});

// ── the drawing: the mark's own extent, never squared ───────────────────────

test("a picture hung on a place keeps that place's shape", () => {
  // 300 x 2,200 is limen/the-descending-terraces, off the record. Squaring it —
  // which is what the mountain's call does, correctly, for a square peak — hangs
  // a 2,200 m picture over a 300 m strip.
  const strip = { at: { x: 0, y: 0 }, extent: { w: 300, h: 2200 }, href: "/media/a.jpg", id: "t" };
  const meet = placedArtSVG({ ...strip, fit: "meet" });
  assert.match(meet, /width="300" height="2200"/, "meet keeps the extent the record wrote");
  assert.match(meet, /preserveAspectRatio="xMidYMid meet"/, "and shows the whole picture");
  assert.doesNotMatch(meet, /width="2200" height="2200"/, "it is not squared");

  const sliced = placedArtSVG(strip);
  assert.match(sliced, /width="2200" height="2200"/, "the default is still square…");
  assert.match(sliced, /preserveAspectRatio="xMidYMid slice"/, "…and still slices");
  // ⚑ THE FLIP: default `fit` to "meet" and the two `sliced` assertions red —
  //   which is the check that the mountain's old call was left alone.
});

test("the whitelist is still the only road for a placed URL", () => {
  for (const bad of ["javascript:alert(1)", "https://elsewhere.example/x.jpg", "//host/x.jpg", ""])
    assert.equal(placedArtSVG({ at: { x: 0, y: 0 }, extent: { w: 900, h: 900 }, href: bad, fit: "meet" }), "",
      `refused: ${String(bad)}`);
});

// ── the one-off is gone ─────────────────────────────────────────────────────

test("the mountain's picture is no longer typed into the viewer", () => {
  assert.doesNotMatch(SOURCE, /PANDO_ART_URL/, "the constant is gone");
  assert.doesNotMatch(SOURCE, /vermillion-pando-peak-the-true-mountain-card/,
    "and so is the file name it held");
  // the mark that carries the picture is on the record, and it is a large mark
  // with an image like any other — which is the whole point
  const pando = WORLD.marks.find((m) => m.id === "vermillion/the-pando-peak");
  assert.ok(pando?.image, "vermillion/the-pando-peak carries its own image on the record");
  assert.ok(span(pando) >= SPECTATOR_DRAW_DEFAULTS.placed_art_min_m,
    "and it clears the dial by being large, not by being the mountain");
});

test("the mist stayed behind — it is the corridor's weather, not a mark's picture", () => {
  const far = SOURCE.slice(SOURCE.indexOf("function drawFarCountry()"));
  const body = far.slice(0, far.indexOf("\n  }"));
  assert.match(body, /mistLayer\.innerHTML = mistBandSVG\(/, "drawFarCountry still lays the mist");
  assert.doesNotMatch(body, /farArtLayer/, "and no longer touches the art layer");
});

test("the rule reads the whole record and is bounded by the viewport, not the radial", () => {
  const fn = SOURCE.slice(SOURCE.indexOf("function drawPlacedArt("));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert.match(body, /tier === "near"/, "near draws none of it");
  assert.match(body, /allMarks\(\)/, "a landmark is not field-of-view furniture");
  assert.match(body, /markInDrawnBounds\(m, bounds\)/, "the viewport cull is what bounds the work");
  assert.match(body, /markImagePath\(m\)/, "through the same shelf gate as every other picture");
  assert.match(body, /fit: "meet"/, "hung over the extent, never cropped to a square");
});

// ── and now the page, because the above only proves lines were typed ────────

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

/** This clone's WORLD, plus two marks that do not exist in the town: one large
 *  enough to be hung, one deliberately just under the dial. Both stand ON the
 *  town centre so a mid-zoom camera has them in frame — the mountain is 135 km
 *  out and cannot answer a question about the mid tier. */
const HUNG = "fixture/the-broad-common";
const TOO_SMALL = "fixture/the-small-yard";
function fixtureWorld() {
  const dir = mkdtempSync(join(tmpdir(), "placed-art-"));
  cpSync(join(ROOT, "WORLD"), dir, { recursive: true });
  const w = JSON.parse(readFileSync(join(dir, "world-state.json"), "utf8"));
  const image = w.marks.find((m) => m.id === "vermillion/the-pando-peak").image;
  const at = w.marks.find((m) => m.id === "the-town/the-town-centre")?.at ?? { x: 0, y: 0 };
  w.marks.push(
    { id: HUNG, kind: "sited", tier: "market", by: "fixture", at, extent: { w: 1800, h: 1200 }, image },
    { id: TOO_SMALL, kind: "sited", tier: "market", by: "fixture", at, extent: { w: 150, h: 150 }, image },
  );
  writeFileSync(join(dir, "world-state.json"), JSON.stringify(w));
  return dir;
}

const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

let chromium = null, port = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), WORLD_DIR: fixtureWorld() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/** open the page, settle the drawing, and read the art layer */
async function readArt({ zoomIn = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  const state = () => page.evaluate(() => [
    document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? "-",
    document.querySelectorAll("#wv-far-art-layer .wv-far-art").length,
    document.querySelectorAll("#wv-overlay [data-id]").length,
  ].join("/"));
  const settle = async () => {
    let last = await state(), held = 0, waited = 0;
    while (held < 900 && waited < 40_000) {
      await page.waitForTimeout(150); waited += 150;
      const now = await state();
      held = now === last ? held + 150 : 0; last = now;
    }
  };
  await settle();
  if (zoomIn) {
    // ZOOM ONTO THE FIXTURE MARK ITSELF, never the middle of the pane. Wheeling
    // at the centre walks the camera off the mark, and then "no art at near" is
    // the cull answering, not the gate.
    const at = await page.evaluate((hungId) => {
      const el = document.querySelector(`#wv-overlay [data-id="${hungId}"]`);
      const b = (el ?? document.querySelector("#wv-map"))?.getBoundingClientRect();
      return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 700, y: 450 };
    }, HUNG);
    for (let i = 0; i < zoomIn; i++) {
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(140);
    }
    await settle();
  }
  const read = await page.evaluate((hungId) => {
    const layer = document.getElementById("wv-far-art-layer");
    const overlay = document.getElementById("wv-overlay");
    const arts = [...(layer?.querySelectorAll(".wv-far-art") ?? [])];
    return {
      // IS THE MARK EVEN ON SCREEN? Without this the near assertion below is a
      // falsifier that cannot fail: at near the camera may simply have left the
      // mark behind, and "no art" would mean "culled", not "gated". Proved by
      // flipping the gate off and watching this test stay green — it did.
      hungOnScreen: !!overlay?.querySelector(`[data-id="${hungId}"]`),
      tier: overlay?.getAttribute("data-tier") ?? "-",
      count: arts.length,
      labels: arts.map((a) => a.getAttribute("aria-label")),
      hrefs: arts.map((a) => a.querySelector("image")?.getAttribute("href") ?? ""),
      boxes: arts.map((a) => { const r = a.querySelector("image"); return `${r?.getAttribute("width")}x${r?.getAttribute("height")}`; }),
      fits: arts.map((a) => a.querySelector("image")?.getAttribute("preserveAspectRatio")),
      // the layer must paint BEFORE the overlay, so the picture is under the glyphs
      artBeforeOverlay: !!(layer && overlay
        && (layer.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING)),
      mist: document.querySelectorAll("#wv-mist-layer *").length,
      overlayMarks: overlay?.querySelectorAll("[data-id]").length ?? 0,
    };
  }, HUNG);
  await page.close();
  return { ...read, errors };
}

test("THE PAGE — a large mark with a picture hangs it; a small one does not; near hangs none", async (t) => {
  if (!chromium) {
    t.skip("NO PLAYWRIGHT — the tier gate, the cull, the DOM seam and the Pando swap went UNGUARDED. "
      + "The source pins above prove the lines were typed and nothing more.");
    return;
  }
  const far = await readArt();
  assert.deepEqual(far.errors, [], "the page mounted without throwing");
  assert.equal(far.tier, "far", "the opening view is the far tier");
  assert.ok(far.overlayMarks > 0, "…and the overlay actually drew, so a zero below means something");

  // the fixture mark is hung, over its own 1800 x 1200 ground, whole
  const i = far.labels.findIndex((l) => /broad common/i.test(String(l)));
  assert.ok(i >= 0, `the 1,800 m mark hangs its picture at far (labels: ${far.labels.join(", ")})`);
  // The box is in PAINTING UNITS, not metres — the caller divides the record's
  // extent by the scale, as the mountain's call always did. So what is asserted
  // is the SHAPE: 1,800 x 1,200 is 3:2, and 3:2 is what must survive. A squared
  // box would be 1:1 here and the ratio is the thing the old call destroyed.
  const [bw, bh] = far.boxes[i].split("x").map(Number);
  assert.ok(bw > 0 && bh > 0, `the picture has a box (${far.boxes[i]})`);
  assert.ok(Math.abs(bw / bh - 1800 / 1200) < 0.001,
    `over the extent the record wrote, not a square — got ${far.boxes[i]}`);
  assert.notEqual(bw, bh, "explicitly: not squared");
  assert.equal(far.fits[i], "xMidYMid meet", "and the whole picture is shown");
  assert.match(far.hrefs[i], /^\/shelf\//, "through the shelf route, like every other picture");

  // the 150 m mark is under the dial and is not
  assert.ok(!far.labels.some((l) => /small yard/i.test(String(l))),
    "the 150 m mark hangs nothing — it is a thing in a place, not a place");

  // no parcel is hung, though several carry pictures on the record
  const parcelWithArt = WORLD.marks.filter((m) => m.kind === "parcel" && m.image).length
    + WORLD.marks.filter((m) => span(m) === 25 && m.image).length;
  assert.ok(parcelWithArt > 0, "the record does have 25 m marks wearing pictures to be tempted by");
  assert.ok(far.count < parcelWithArt + 5, "and they are not in the art layer");

  // THE SEAM: under the glyphs, over the ground
  assert.equal(far.artBeforeOverlay, true, "the art layer paints before the overlay");
  assert.ok(far.mist > 0, "and the mist is still laid along the corridor");

  // …and the mountain's own picture now comes off its mark
  assert.ok(far.hrefs.every((h) => !/vermillion-pando-peak-the-true-mountain-card/.test(h)),
    "nothing is drawn from the old hard-coded file");
});

test("THE PAGE — zooming in to near takes the placed art off the ground", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the near gate went UNGUARDED."); return; }
  const near = await readArt({ zoomIn: 34 });
  assert.deepEqual(near.errors, [], "the page survived the zoom without throwing");
  if (near.tier !== "near") {
    // say what happened rather than pass quietly on a camera that did not arrive
    assert.fail(`the camera reached ${near.tier}, not near — the gate went unread`);
  }
  assert.equal(near.hungOnScreen, true,
    "the 1,800 m mark is STILL ON SCREEN at near — so a zero below is the gate, not the cull");
  assert.equal(near.count, 0, "no placed art at near: the cards and the furnishing pass say it better");
  // ⚑ THE FLIP: drop the `tier === "near"` guard and this reds while every
  //   far assertion above stays green.
});
