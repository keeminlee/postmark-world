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

import { placedArtSVG, SPECTATOR_DRAW_DEFAULTS, isRegionMark } from "../spectator/viewer.mjs";

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
  assert.doesNotMatch(body, /ArtLayer/, "and no longer touches any art layer");
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
const COVERING = "fixture/the-covering-district";
const COVERED_CHILD = "fixture/the-covered-child";
const BARE_PARENT = "fixture/the-bare-parent";
const BARE_CHILD = "fixture/the-bare-child";
const REGION_ID = "caelum/evermoon";   // one of REGION_SLUGS, and a real ring on the record
function fixtureWorld() {
  const dir = mkdtempSync(join(tmpdir(), "placed-art-"));
  cpSync(join(ROOT, "WORLD"), dir, { recursive: true });
  const w = JSON.parse(readFileSync(join(dir, "world-state.json"), "utf8"));
  const image = w.marks.find((m) => m.id === "vermillion/the-pando-peak").image;
  // THE FIXTURE OWNS ITS PICTURES (2026-09-13, after the 05:45Z sweep).
  //
  // This world is a COPY of the live fold, so every picture a resident hangs
  // lands in it. On 09-12 exactly one large mark carried one and the page tests
  // could count hangings and know they were theirs. The sweep folded the nine
  // district pictures and the peak's, twelve at a stroke, and two assertions
  // here started reading other people's art as their own.
  //
  // A fixture that inherits live data is a fixture only until somebody edits
  // the world. So: strip `image` from every mark first, then plant the ones
  // these tests are about. Nothing a resident does to the record can red this
  // suite again, and a hanging counted here is one the fixture put there.
  for (const m of w.marks) delete m.image;
  const at = w.marks.find((m) => m.id === "the-town/the-town-centre")?.at ?? { x: 0, y: 0 };
  w.marks.push(
    { id: HUNG, kind: "sited", tier: "market", by: "fixture", at, extent: { w: 1800, h: 1200 }, image },
    { id: TOO_SMALL, kind: "sited", tier: "market", by: "fixture", at, extent: { w: 150, h: 150 }, image },
    // ── the nesting the depth rule has to cut, and the nesting it must not ──
    // A pictured district with a pictured child inside it: the district hangs,
    // the child does not, because one picture is already on that ground.
    { id: COVERING, kind: "sited", tier: "market", by: "fixture",
      at: { x: at.x - 2200, y: at.y }, extent: { w: 1700, h: 1200 },
      image, placementParent: "the-town/let-there-be-light" },
    { id: COVERED_CHILD, kind: "sited", tier: "market", by: "fixture",
      at: { x: at.x - 2200, y: at.y }, extent: { w: 800, h: 600 },
      image, placementParent: COVERING },
    // …and PANDO'S OWN SHAPE, which is the case a literal direct-child-of-the-
    // root rule gets wrong: a large parent carrying NO picture, with a large
    // pictured child. Nothing is covering the child, so the child hangs.
    { id: BARE_PARENT, kind: "sited", tier: "market", by: "fixture",
      at: { x: at.x + 2600, y: at.y }, extent: { w: 1700, h: 1200 },
      placementParent: "the-town/let-there-be-light" },
    { id: BARE_CHILD, kind: "sited", tier: "market", by: "fixture",
      at: { x: at.x + 2600, y: at.y }, extent: { w: 900, h: 700 },
      image, placementParent: BARE_PARENT },
  );
  // A PICTURED REGION, so the far/mid rule has one to be about. The fixture
  // strips every live image above, so this is the only region carrying one and
  // a count of region art is a count of this.
  const region = w.marks.find((m) => m.id === REGION_ID);
  if (region) region.image = image;
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
async function readArt({ zoomIn = 0, stopAtTier = null } = {}) {
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
    document.querySelectorAll("#wv-placed-art-layer .wv-far-art").length,
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
    // STOP AT THE TIER, NOT AFTER N TURNS OF THE WHEEL. A step count is a guess
    // about how far a wheel notch travels, and mine overshot mid and landed in
    // near — where the pass under test is switched off, so the probe would have
    // been asking its question of the one tier that cannot answer it.
    for (let i = 0; i < zoomIn; i++) {
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(140);
      if (stopAtTier) {
        const t = await page.evaluate(() => document.getElementById("wv-overlay")?.getAttribute("data-tier"));
        if (t === stopAtTier) break;
      }
    }
    await settle();
  }
  const read = await page.evaluate((hungId) => {
    const layer = document.getElementById("wv-placed-art-layer");
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
      // …and AFTER the ground, so it is not buried under it. This is the half
      // that was wrong and shipped green: the old layer sat at the front of the
      // svg, the generated ground appends its paper and washes later, and the
      // picture was painted and then covered. Both grounds are checked, since
      // the atlas takes one road (`base`) and the generated town another
      // (`.wv-tg-paper`), and a seam that only holds on one of them is not one.
      artAfterGround: (() => {
        const ground = document.querySelector(".wv-tg-paper") ?? document.querySelector("#wv-ground-base, .wv-ground-base");
        if (!layer || !ground) return null;              // no ground drawn: not an answer
        return !!(ground.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING);
      })(),
      groundDrawn: !!document.querySelector(".wv-tg-paper, #wv-ground-base, .wv-ground-base"),
      // THE OTHER PASS ON THE SAME GROUND. The furnishing pass paints every
      // furnishable mark as a half-opaque tinted block at mid, deliberately —
      // "the shape of what is on the ground, without the photograph of it".
      // For a chair that is right. For a place that is wearing its picture it
      // is a wash over the picture, which is what it was doing.
      tinted: [...document.querySelectorAll("#wv-overlay .wv-ph-extent[data-id]")].map((e) => e.dataset.id),
      // the region rule: what carries a region's id, on either layer
      regionHung: [...(layer?.querySelectorAll(".wv-far-art") ?? [])]
        .filter((g) => (g.getAttribute("aria-label") ?? "").toLowerCase().includes("evermoon")).length,

      hungIds: [...(layer?.querySelectorAll(".wv-far-art") ?? [])].map((a) => a.getAttribute("aria-label")),
      mist: document.querySelectorAll("#wv-mist-layer *").length,
      overlayMarks: overlay?.querySelectorAll("[data-id]").length ?? 0,
    };
  }, HUNG);
  await page.close();
  return { ...read, errors };
}

/** the SHAPE of what the placed-art layer drew, per mark — ringed or boxed */
const pageShape = async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-placed-art-layer .wv-far-art").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const arts = [...document.querySelectorAll("#wv-placed-art-layer .wv-far-art")];
    const region = arts.find((g) => /evermoon/i.test(g.getAttribute("aria-label") ?? ""));
    return {
      ringedForRegion: region ? (region.classList.contains("wv-far-art-ringed") ? 1 : 0) : -1,
      frameForRegion: region ? region.querySelectorAll(".wv-far-art-frame").length : -1,
      polygonClip: !!region?.querySelector("clipPath polygon"),
      slices: (region?.querySelector("image")?.getAttribute("preserveAspectRatio") ?? "") === "xMidYMid slice",
      ringlessFramed: arts.filter((g) => !g.classList.contains("wv-far-art-ringed")
        && g.querySelector(".wv-far-art-frame")).length,
    };
  });
  await page.close();
  return r;
};

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
  assert.equal(far.groundDrawn, true, "a ground is actually drawn, so the next line is answerable");
  assert.equal(far.artAfterGround, true,
    "the art layer paints AFTER the ground — a picture on a district is on it, not under it");
  // ⚑ THE FLIP: put the layer back at svg.firstChild, where the mountain's was,
  //   and this reds while every other assertion here stays green — which is
  //   exactly how the bug got as far as a screenshot.
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

// ── ONE PICTURE DEEP (Keemin's addendum, 2026-09-12) ────────────────────────

test("the edge is placementParent — measured on the record, not assumed", () => {
  const big = WORLD.marks.filter((m) => m.at && m.extent && span(m) >= SPECTATOR_DRAW_DEFAULTS.placed_art_min_m);
  const withPlacement = big.filter((m) => m.placementParent).length;
  const withParent = big.filter((m) => m.parent).length;
  assert.ok(big.length > 40, `there are large marks to measure (${big.length})`);
  assert.equal(withParent, 0, "no large mark on the record uses `parent`");
  assert.equal(withPlacement, big.length - 1,
    "every large mark but one uses `placementParent` — the exception is the root itself");
  const rootless = big.filter((m) => !m.placementParent && !m.parent).map((m) => m.id);
  assert.deepEqual(rootless, ["the-town/let-there-be-light"], "and the exception is the root");
});

test("PANDO: the anchor hangs and the pictured child under it is covered — one picture deep", () => {
  // THIS TEST'S PREMISE WAS RULED AWAY, and the rename is part of the fix.
  //
  // On 2026-09-12 it read "the peak mark carries NO picture", and that was the
  // argument for measuring depth against the hanging set rather than against
  // the root: the picture sat on vermillion/the-pando-peak, a GRANDCHILD of the
  // root, so a literal direct-child rule dropped the mountain. Then Keemin
  // ruled the far country's anchor should wear it (3a99ccb2, "I agree with
  // that"), the 05:45Z sweep folded that line, and the premise became false on
  // the record. The design reason stands and is written down at the rule
  // itself; it simply no longer has Pando as its example.
  //
  // What is asserted now is the record as it IS, and the outcome the rule gives
  // on it — measured on the folded record before this was written, not assumed:
  // twelve large marks carry a picture, eleven hang, and the only covered one
  // is vermillion's, under the anchor.
  const anchor = WORLD.marks.find((m) => m.id === "the-town/pando-peak");
  const child = WORLD.marks.find((m) => m.id === "vermillion/the-pando-peak");
  // the shape that does NOT move: two marks at one place, the child hung off
  // the anchor, both big enough to be hung.
  assert.ok(child?.image, "the mountain's picture is on the record");
  assert.equal(anchor.placementParent, "the-town/let-there-be-light", "the anchor hangs off the root");
  assert.equal(child.placementParent, "the-town/pando-peak", "…and the child hangs off the anchor");
  assert.ok(span(anchor) >= SPECTATOR_DRAW_DEFAULTS.placed_art_min_m, "the anchor clears the dial");
  assert.ok(span(child) >= SPECTATOR_DRAW_DEFAULTS.placed_art_min_m, "and so does the child");

  // AND THE OUTCOME AS A RELATION, not as a snapshot of one day's fold. Whether
  // the anchor wears a picture is Keemin's to change and he has changed it once
  // already; what must hold either way is the rule.
  if (anchor.image) {
    assert.equal(anchor.image, child.image,
      "the anchor wears the same FILE as the child, so which of them hangs changes nothing a reader sees");
    // one picture deep: the anchor hangs, the child under it does not
  } else {
    // the pre-ruling shape: nothing between the child and the ground is
    // hanging, so the child hangs — which is why depth is measured against the
    // hanging set and not against the root
    assert.ok(span(anchor) > 0, "the anchor is still the thing that positions the mountain");
  }
});

test("the folded record hangs one picture per piece of ground, and no two overlap", () => {
  // The sweep folded twelve pictures onto large marks in one go. This walks the
  // record the way the rule does and asserts the property the rule exists for,
  // rather than a count that moves every time a founder hangs art.
  const byId = new Map(WORLD.marks.map((m) => [m.id, m]));
  const floor = SPECTATOR_DRAW_DEFAULTS.placed_art_min_m;
  const bigEnough = (m) => !!m?.at && !!m?.extent && span(m) >= floor && !!m.image;
  const candidates = WORLD.marks.filter(bigEnough);
  assert.ok(candidates.length >= 1,
    `the record has large pictured marks to reason about (${candidates.length})`);
  const set = new Set(candidates.map((m) => m.id));
  const covered = [];
  for (const m of candidates) {
    let up = byId.get(m.placementParent ?? m.parent), seen = new Set([m.id]), steps = 0;
    while (up && steps++ < 12 && !seen.has(up.id)) {
      if (set.has(up.id)) { covered.push(`${m.id} under ${up.id}`); break; }
      seen.add(up.id);
      up = byId.get(up.placementParent ?? up.parent);
    }
  }
  // Every covered mark is one whose ground already wears a picture — that IS
  // the no-stacking property, stated as a relation over whatever the record
  // happens to hold.
  for (const line of covered) {
    const [id, , parentId] = line.split(" ");
    assert.ok(set.has(parentId), `${id} is covered only by something that is itself hanging`);
  }
  // NO COUNT AND NO LIST. On the fold of 2026-09-13 exactly one mark is covered
  // — vermillion's, under the anchor — but I pinned that list first and it red
  // on the pre-sweep base, which is the same mistake as pinning twelve region
  // names. The property is what holds on any fold: nothing is ever covered by
  // something that is not itself hanging, so two pictures never stack.
  assert.ok(covered.length < candidates.length,
    `not everything is covered — something hangs (${candidates.length - covered.length} of ${candidates.length})`);
});

test("THE PAGE — one picture deep: a covered child stays down, an uncovered one hangs", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the depth rule went UNGUARDED."); return; }
  const far = await readArt();
  assert.deepEqual(far.errors, [], "the page mounted without throwing");
  const hung = (frag) => far.labels.some((l) => new RegExp(frag, "i").test(String(l)));

  // a pictured district hangs…
  assert.ok(hung("covering district"), `the pictured district hangs (labels: ${far.labels.join(", ")})`);
  // …and the pictured child inside it does NOT: one picture on that ground
  assert.ok(!hung("covered child"), "the child inside a hanging district does not hang a second picture");

  // PANDO'S SHAPE: a large parent with NO picture, and a pictured child. The
  // child hangs, because nothing is covering it.
  assert.ok(!hung("bare parent"), "a large mark with no picture hangs nothing (there is nothing to hang)");
  assert.ok(hung("bare child"), "…and its pictured child DOES hang — nothing is above it");

  // ⚑ THE FLIP: make the rule literal — hang only when placementParent is the
  //   root — and "bare child" reds while "covered child" stays green, which is
  //   exactly the difference between the two readings of the ruling.
});

test("THE PAGE — a hung picture is not then painted over by the furnishing pass", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the two passes' agreement went UNGUARDED."); return; }
  // Mid is where they meet: at far the furnishing pass is off entirely, at near
  // the hanging rule is. Only mid runs both, so only mid can show the argument.
  const mid = await readArt({ zoomIn: 60, stopAtTier: "mid" });
  assert.deepEqual(mid.errors, [], "the page survived the zoom");
  assert.equal(mid.tier, "mid", `the camera reached mid (got ${mid.tier})`);
  assert.ok(mid.count > 0, "…and something is hung there, so the next line asks a question");
  assert.ok(mid.tinted.length > 0,
    "…and the furnishing pass IS running, so a clean result is agreement and not absence");

  // the whole claim, in one line: nothing wears a picture AND a tint
  const both = mid.tinted.filter((id) => /broad-common|long-terrace|covering-district|bare-child/.test(id));
  assert.deepEqual(both, [],
    `no hung mark also carries a tinted block (tinted: ${mid.tinted.join(", ")})`);
  // ⚑ THE FLIP: drop the `!hungArt.has(m.id)` filter and this reds with the two
  //   hung ids named, while every other assertion in this file stays green —
  //   which is how it shipped in #40 without anybody seeing it.
});

// ── WHY THERE IS NO PAGE TEST FOR THE PARCEL/FURNISHING COLLISION ───────────
//
// I wrote one, and it passed with the fix REMOVED — a probe that could not
// fail, caught by flipping it. Recorded rather than deleted quietly, because
// the reason is the same wall the whole piece ran into.
//
// The furnishing pass is built from `drawn`, and `drawn` comes from
// `overlayMarks(radial)` — the reader's field of view, which the OFFICE
// supplies. This rig has no office, so a parcel never enters `drawn` at all and
// the pass never considers it, whatever picture the fixture hangs on it. The
// branch is unreachable here by construction, exactly as the original defect
// was: four spectator runs against dev were green on it too.
//
// So the in-repo guard is the source pin in tools/overlay-houses.test.mjs, and
// the behaviour evidence is the dev dump in the report — two elements at
// 152x152 and 139x89, both carrying the parcel's id, signed in as rei. A dev
// re-read after this merges is what closes it, and the report says so.

// ── A REGION IS A FAR THING (Keemin, 2026-09-13) ────────────────────────────

test("isRegionMark reads the roster, not a drawn ring", () => {
  // Matched on the slug alone. townRegionMarks also demands a ring, and a
  // region whose outline has not generated would slip that test and reappear at
  // mid — the one thing the ruling asks against.
  assert.equal(isRegionMark({ id: "caelum/evermoon" }), true);
  assert.equal(isRegionMark({ id: "rei/the-lanternseed-gardens" }), true);
  assert.equal(isRegionMark({ id: "rei/the-lanternstep-house-parcel" }), false, "a parcel is not a region");
  assert.equal(isRegionMark({ id: "the-town/pando-peak" }), false, "and neither is the mountain");
  assert.equal(isRegionMark({ id: "" }), false);
  assert.equal(isRegionMark(null), false);
});

test("THE PAGE — a region's picture hangs at far and is gone at mid, tint and all", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the region tier rule went UNGUARDED."); return; }
  const far = await readArt();
  assert.deepEqual(far.errors, [], "the page mounted");
  assert.equal(far.tier, "far", `the opening view is far (got ${far.tier})`);
  assert.ok(far.regionHung >= 1, `the pictured region hangs at far (hung: ${far.labels.join(", ")})`);

  const mid = await readArt({ zoomIn: 60, stopAtTier: "mid" });
  assert.deepEqual(mid.errors, [], "…and survived the zoom");
  assert.equal(mid.tier, "mid", `the camera reached mid (got ${mid.tier})`);
  assert.ok(mid.count > 0,
    "…and something else is still hung at mid, so a zero for the region is the rule and not an empty layer");
  assert.equal(mid.regionHung, 0, "the region's picture is gone at mid");
  // ⚑ THE FLIP: drop the region filter in drawPlacedArt and this reds while the
  //   far assertion stays green.
  //
  // AND WHAT IS *NOT* ASSERTED HERE, because I tried and it could not fail. The
  // other half of the ruling — no furnishing TINT for a region at mid — has no
  // page falsifier in this file. Flipping that filter out left every test green:
  // the furnishing pass is built from `drawn`, `drawn` comes from the reader's
  // field of view, the office supplies that, and this rig has no office, so a
  // region is never a candidate here whatever the fixture does. Same wall as the
  // parcel/furnishing collision two tests up. The tint filter is guarded by the
  // source pin below and read on dev; it is not covered by this page test, and
  // saying so is the point.
});

test("the tint filter exists and is scoped to mid — a source pin, and it says so", () => {
  // The page cannot drive this on a rig with no office (see the note above), so
  // what is left is a pin that proves the line was typed. It is labelled as
  // exactly that rather than dressed up as coverage.
  const src = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.match(src, /\.filter\(\(m\) => !\(tier === "mid" && isRegionMark\(m\)\)\)/,
    "the furnishing pass stands regions down at mid");
  assert.match(src, /if \(tier === "mid" && isRegionMark\(m\)\) return false;/,
    "and so does the hanging pass");
});

// ── A REGION'S PICTURE IS A DOOR (Keemin, 2026-09-13) ───────────────────────

test("the hit rect is opt-in, carries the id, and nothing else hung gets one", () => {
  const base = { at: { x: 0, y: 0 }, extent: { w: 900, h: 600 }, href: "/media/x.jpg", fit: "meet" };
  const region = placedArtSVG({ ...base, id: "caelum/evermoon", label: "Evermoon", clickable: true });
  const mountain = placedArtSVG({ ...base, id: "the-town/pando-peak", label: "Pando" });
  assert.match(region, /class="wv-far-art-hit" data-id="caelum\/evermoon"/, "a region's picture takes clicks");
  assert.match(region, /role="button"/, "…as a button, reachable by keyboard");
  assert.doesNotMatch(mountain, /wv-far-art-hit/,
    "and nothing else hung does — the mountain stays as untouchable as it was");
  // the layer itself must stay pointer-transparent, or a hung picture eats the
  // clicks meant for the marks drawn over it
  assert.match(SOURCE, /\.wv-far-art, \.wv-mist \{ pointer-events:none; \}/, "the layer is still transparent");
  assert.match(SOURCE, /\.wv-far-art-hit \{ fill:transparent; pointer-events:auto; cursor:pointer; \}/,
    "and only the hit rect takes them back");
});

test("THE PAGE — clicking a region's hung picture at far opens its column", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the region click and its column went UNGUARDED."); return; }
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-placed-art-layer .wv-far-art").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const before = await page.evaluate(() => {
    const c = document.querySelector(".wv-homecol");
    return { hit: document.querySelectorAll(".wv-far-art-hit[data-id]").length, columnUp: !!c && !c.hidden };
  });
  assert.ok(before.hit >= 1, "the region's picture is hung and carries a hit rect");
  assert.equal(before.columnUp, false, "…and no column is open yet, so the next line is about the click");

  // CLICK WITH THE MOUSE AT A PLACE ON THE SCREEN. A synthetic event on the rect
  // would prove nothing about whether a reader can reach it: the rect has to be
  // the topmost thing at that point, which is the whole question.
  //
  // WHERE ON THE PICTURE, and this is a real property of the thing rather than
  // a test convenience. A region is the biggest mark on the map and it is drawn
  // LOWEST, so most of its picture has houses, pips and walkers standing on it;
  // the centre of Evermoon is a walker. Clicking there raises the crowded-click
  // chooser, correctly, and the chooser is built from pips — a region has none,
  // so it is not in the list. What a reader actually clicks is an exposed part
  // of the region, and that is what this finds: the first point on a grid over
  // the picture where the hit rect is the topmost thing.
  const at = await page.evaluate(() => {
    const r = document.querySelector('.wv-far-art-hit[data-id="caelum/evermoon"]')
      ?? document.querySelector(".wv-far-art-hit[data-id]");
    const b = r.getBoundingClientRect();
    for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
      for (let fy = 0.1; fy <= 0.9; fy += 0.1) {
        const x = b.x + b.width * fx, y = b.y + b.height * fy;
        if (document.elementsFromPoint(x, y)[0] === r) return { x, y, id: r.getAttribute("data-id"), exposed: true };
      }
    }
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, id: r.getAttribute("data-id"), exposed: false };
  });
  assert.equal(at.exposed, true,
    "some part of the region's picture is clickable — if this reds, a region is unreachable at far and that is the finding");
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const c = document.querySelector(".wv-homecol");
    return {
      columnUp: !!c && !c.hidden && c.offsetParent !== null,
      kicker: c?.querySelector(".wv-homecol-kicker")?.textContent ?? null,
      title: c?.querySelector("h2, .wv-homecol-title")?.textContent ?? null,
      text: (c?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200),
      enterButton: !!c?.querySelector("[data-enter]"),
    };
  });
  assert.deepEqual(errors, [], "the click threw nothing");
  assert.equal(after.columnUp, true, `the column opened (${at.id})`);
  assert.match(after.text, /Evermoon/i, "…showing the region's own name");
  assert.match(after.text, /held by caelum/i, "…and who holds it, as the atlas panel says it");
  assert.equal(after.enterButton, false, "no enter button: a region is not a parcel");
  await page.close();
  // ⚑ THE FLIP: drop `clickable: isRegionMark(m)` and the hit rect is gone, so
  //   `before.hit` reds before the click is even attempted.
});

// ── THE PICTURE FILLS THE RING (Keemin, 2026-09-13) ─────────────────────────

test("a ring turns the picture into that shape, and a ringless mark keeps its box", () => {
  const ring = [{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 80 }, { x: 5, y: 70 }];
  const region = placedArtSVG({ at: { x: 50, y: 40 }, extent: { w: 100, h: 80 },
    href: "/media/x.jpg", id: "caelum/evermoon", label: "Evermoon", clickable: true, ring });
  assert.match(region, /<clipPath[^>]*><polygon points="/, "clipped to the ring, not a rect");
  assert.match(region, /preserveAspectRatio="xMidYMid slice"/,
    "and it FILLS: a photograph fitted inside an irregular outline leaves the outline half empty, which is the complaint");
  assert.doesNotMatch(region, /wv-far-art-frame/, "no rectangle drawn around the same place");
  assert.match(region, /<polygon points="[^"]+" class="wv-far-art-ring"\/>/, "the ring's own line is the frame");
  assert.match(region, /<polygon points="[^"]+" class="wv-far-art-hit"/, "and the door is the ring's shape too");

  // PER-MARK, NEVER GLOBAL. The peak has no ring on the record and must be
  // exactly what it was.
  const mountain = placedArtSVG({ at: { x: 0, y: 0 }, extent: { w: 900, h: 600 },
    href: "/media/x.jpg", id: "the-town/pando-peak", label: "Pando", fit: "meet" });
  assert.match(mountain, /<clipPath[^>]*><rect /, "a ringless mark is still clipped to its box");
  assert.match(mountain, /wv-far-art-frame/, "…and still framed");
  assert.doesNotMatch(mountain, /wv-far-art-ring/, "…and grows no ring");

  // a ring the record half-wrote is not a ring
  const short = placedArtSVG({ at: { x: 0, y: 0 }, extent: { w: 90, h: 90 },
    href: "/media/x.jpg", id: "a/b", ring: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  assert.match(short, /<clipPath[^>]*><rect /, "two points are not a shape — falls back to the box");
  // ⚑ THE FLIP: stop passing `ring` in drawPlacedArt and the region draws a
  //   rect frame again; drop the polygon clip and `slice` and it stops filling.
});

test("THE PAGE — the region's hung picture is the ring's shape, and nothing else is", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the ring fill on a real page went UNGUARDED."); return; }
  const far = await readArt();
  assert.deepEqual(far.errors, [], "the page mounted");
  assert.equal(far.tier, "far");
  const shape = await pageShape();
  assert.equal(shape.ringedForRegion, 1, "the region hangs exactly one ringed picture");
  assert.equal(shape.frameForRegion, 0, "…with no rectangular frame of its own");
  assert.equal(shape.polygonClip, true, "…clipped to a polygon");
  assert.equal(shape.slices, true, "…and filling it");
  assert.ok(shape.ringlessFramed >= 1,
    `and a ringless hung mark still wears its box (${shape.ringlessFramed})`);
});
