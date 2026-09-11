// town-ground-page.test.mjs — the falsifier that DRIVES THE PAGE.
//
// ── WHY THIS FILE EXISTS, AND IT IS NOT A FLATTERING REASON ────────────────
//
// `tools/town-ground.test.mjs` has ten tests and every one of them hands
// `townGround` its marks BY HAND. So when this lane's first call site passed
// `data.marks` — a property that does not exist on `data` — all ten stayed
// green while the live page drew a ground with the entire mark record missing:
// no region washes at all, and six water features silently falling back to
// their centrelines. It painted. It looked like a map from across the room.
//
// I then added a source-text assertion that reads the call site out of the
// viewer's own bytes, and thought that closed it. It does not. The fresh
// reviewer kept the call site exactly as written, DISCARDED THE ANSWER, mounted
// a blank sheet in its place — and all 754 tests stayed green. A regex over the
// source proves a line was typed, never that its value reaches the screen. It is
// also brittle in the other direction: reordering `mountScene`'s arguments reds
// it while nothing about the page has changed.
//
// The only assertion that cannot be satisfied by well-typed dead code is one
// that reads the mounted DOM. So: boot the real rig, open the real page with the
// atlas UNREACHABLE, and count what is actually on the ground.
//
// ── AND IT GUARDS A SECOND, OLDER CLASS ────────────────────────────────────
//
// `.wv-ph-extent` is asserted here for a reason beyond the town's own look.
// Every existing test of the furnishing pass — `tools/map-art-default.test.mjs`,
// `tools/viewer-interior.test.mjs` — calls `placeholderExtentSVG` directly with
// a hand-built full mark. NOT ONE of them drives `drawOverlay`'s SET
// CONSTRUCTION, which is where this lane's second bug lived: the set is built
// from `overlayMarks(radial)`, whose entries carry `id`, `at`, `distM` and
// `bearing`, while `isEmbodiedMark` asks for `kind` and `extent` — so the filter
// answered no to every mark and the pass furnished nothing at all. Forty-eight
// green scene tests could not see it, because none of them ever asked the page.
//
// (A correction to the review that prompted this file, and the record should
// carry it: the pass was NOT dead in rooms. `composeInterior` resolves its
// radial through `things.map((t) => byId.get(t.id) ?? t)` and says in its own
// comment why — "investigate SHAPES its children for a reader … and drops extent
// and image on the way. A floor needs both." The TOWN's radial, from
// `openYourEyes`, has no such resolve, so the town was the only broken scene.
// The CLASS the reviewer named is real and open all the same: no test drove that
// set construction, which is why nobody could tell the two cases apart.)
//
// ── THE CAN-FAIL FLIP, WHICH IS THE REVIEWER'S OWN ─────────────────────────
//
// In `loadMinimap`, keep the call and throw the answer away:
//
//     const ground = townGround(world.marks, data.skeleton, { originPx, mPerPx });
//     const doc = new DOMParser().parseFromString(
//       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
//       "image/svg+xml");                       // ← blank sheet, answer discarded
//
// Every source-text guard in this repo stays green. This file reds on the first
// assertion. Run receipt in the lane report.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townRegionMarks } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// what the rig SERVES — WORLD/world-state.json off this clone's disk, which is
// the same file the page fetches. The expected region count comes from here so
// the assertion is a relation and not a number somebody has to remember to bump.
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const expectedRegions = townRegionMarks(SERVED.marks).length;

// Playwright is not a dependency of this package and must not become one — the
// world is browser-pure and its suite runs anywhere node does. It is resolved
// the same way tools/qa/scene-qa.mjs and tools/qa/town-fingerprint.mjs resolve
// it, and when it is absent this file SKIPS WITH ITS REASON SAID OUT LOUD.
//
// A skip is not a pass and must never read as one: the message names exactly
// what goes unguarded, because a page-driven falsifier that quietly disappears
// on the machine that matters is the same false green this file was written to
// end. The two source-text regexes in tools/town-ground.test.mjs remain as a
// cheap second guard for that case — labelled there as exactly that, a guard
// that proves a line was typed and nothing more.
const PLAYWRIGHT_PATHS = ["playwright", "file:///G:/Wright-HQ/node_modules/playwright/index.mjs"];
async function loadChromium() {
  for (const spec of PLAYWRIGHT_PATHS) {
    try { return (await import(spec)).chromium; } catch { /* try the next */ }
  }
  return null;
}

/** a port nothing is listening on, handed back before the rig claims it */
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

/**
 * The real rig, on an ephemeral port, WITH THE ATLAS UNREACHABLE.
 *
 * `ATLAS_ORIGIN` is read at spectator/server.mjs:39 and defaults to
 * https://postmark.town; pointing it at a dead port is what makes this a proof
 * rather than a demonstration. On the base commit the page cannot paint a ground
 * at all in this condition — it writes "the painting didn't load (atlas HTTP
 * 502)" into the pane — so every count below is zero. The env key was read out
 * of the server's own source before being used, and the rig echoes it on boot.
 */
async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => {
      if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); }
    });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error(`the rig exited ${code} before serving`)); });
  });
  return { port, proc };
}

let chromium = null, rig = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  rig = await bootRig();
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/** what the mounted ground actually contains, counted in the page.
 *
 *  `zoomToNear` (2026-09-11) drives the camera DOWN to street width before
 *  counting. The spectator's tier gates turn the furnishing pass off at town
 *  width on purpose, so the pass's own guard below has to be taken at a zoom
 *  where the pass runs — otherwise this file would report the gate working as
 *  the pass being dead, which is precisely the confusion it exists to end.
 *
 *  Driven with real wheel events on the map, never by writing the viewBox: the
 *  question is what the DRAWING CODE does at a zoom, and setting the viewBox
 *  moves the picture without asking it. */
async function readGround({ zoomToNear = false, stopAtTier = "near", tellingOpen = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // ⚑ `tellingOpen` EXISTS BECAUSE A GATE NOBODY CAN SEE IS A GATE NOBODY CAN
  // TEST (2026-09-11). Painting-only is the page's DEFAULT (readPaintingOnly
  // returns true for an unset key), and it already suppresses every `<title>` on
  // the overlay — so an assertion that the far tier draws no tooltips passes on
  // a page that has no tooltips at any tier, whatever the label gate does. That
  // is a falsifier that cannot fail, and it was one until a flip proved it.
  // Opening the Telling turns the tooltips back on, and the assertion starts
  // meaning what it says.
  if (tellingOpen)
    await page.addInitScript(() => { try { localStorage.setItem("pm_world_painting_only", "0"); } catch {} });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${rig.port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  // the ground is mounted asynchronously; wait for the thing under test rather
  // than for a duration, so a slow box cannot turn a real red into a flake
  await page.waitForFunction(() => !!document.querySelector(".wv-minimap > svg"), null, { timeout: 60_000 })
    .catch(() => { /* absence is a real answer here — the base commit's answer */ });

  // ── A DURATION IS NOT AN EVENT (2026-09-11, after a gate red) ──────────
  //
  // This file waited 2,500 ms for the overlay and 900 ms after the last wheel
  // step. Alone on an idle box that is generous; inside the full gate, with
  // ~800 other tests and three other Chromium instances running beside it, it is
  // not — "THE PICTURE WAITS FOR THE GROUND" took 19,216 ms and red under the
  // gate while passing 6/6 three times in a row alone on the same scratch. A
  // load-dependent timeout, not the rule.
  //
  // So both waits now watch the thing under test and stop when it stops moving:
  // the overlay's own `data-tier`, the drawn card count and the drawn picture
  // count — which are exactly the three numbers every assertion below reads.
  // The ceilings are sized for a loaded box; a page that genuinely never settles
  // still fails, and says which of "never drew" and "never stopped redrawing" it
  // was.
  const drawState = () => page.evaluate(() => {
    const ov = document.getElementById("wv-overlay");
    return [
      ov?.getAttribute("data-tier") ?? "-",
      document.querySelectorAll("#wv-overlay [data-id]").length,
      document.querySelectorAll("#wv-overlay .ov-home").length,
      document.querySelectorAll("#wv-overlay .ov-home image").length,
      document.querySelectorAll("#wv-overlay .ov-glyph").length,
    ].join("/");
  });
  /** wait until the drawing stops changing, or say why it never did */
  const settleDrawing = async (holdMs = 900, ceilingMs = 45_000) => {
    let last = await drawState(), held = 0, waited = 0;
    while (held < holdMs && waited < ceilingMs) {
      await page.waitForTimeout(150);
      waited += 150;
      const now = await drawState();
      held = now === last ? held + 150 : 0;
      last = now;
    }
    return { settled: held >= holdMs, waited, state: last };
  };
  // the overlay arrives after the fold; wait for it to have drawn ANYTHING, then
  // for it to stop. (Nothing drawn is a real answer on the base commit, so a
  // timeout here is not a throw.)
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  const firstSettle = await settleDrawing();
  let zoomSettle = null;

  if (zoomToNear) {
    // ZOOM IN ON WHERE THE READER STANDS, not on the middle of the sheet. The
    // overlay is cut by the STANDPOINT — fog, sight, the context budget — so the
    // marks this pass has to furnish are the ones around the reader's own dot.
    // Wheeling at the sheet's centre lands the camera on ground the telling
    // never named, and the pass would correctly furnish nothing there.
    const at = await page.evaluate(() => {
      const dot = document.querySelector("#wv-overlay .ov-dot");
      const box = (dot ?? document.querySelector(".wv-minimap > svg"))?.getBoundingClientRect();
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    });
    if (at) {
      // ── STEER BY THE CAMERA, ASSERT ON THE DRAWING (2026-09-11) ─────────
      //
      // This loop used to wheel until `data-tier` said the word it wanted. That
      // is steering by the OUTPUT: `data-tier` is written by drawOverlay, which
      // runs on the settle-debounced rebuild 140 ms after the camera moves, so
      // under load the attribute lags the camera and the loop wheels again — and
      // one extra step at the mid/near boundary lands in `near`. Reproduced by
      // running this file six ways at once: "the camera stopped at district
      // width (tier: near)". It reads as a flake and is not one; it is a
      // control loop reading its own stale answer.
      //
      // The viewBox is written synchronously by applyView, so it is the honest
      // input. zoomK = full.w / view.w, and the tier boundaries are metres
      // across the viewport over that ratio: the painting is 7,500 m wide, so
      // far/mid is k = 1.5 and mid/near is k = 7.5. The loop aims at the MIDDLE
      // of the wanted band, which no single wheel step can overshoot.
      const vbW = () => page.evaluate(() => {
        const m = document.querySelector(".wv-minimap > svg");
        return m ? Number((m.getAttribute("viewBox") ?? "").split(/[\s,]+/)[2]) : NaN;
      });
      const w0 = await vbW();                    // the opening view: zoomK 1, the whole painting
      const wantK = stopAtTier === "mid" ? 3 : 15;
      for (let i = 0; i < 60; i++) {
        const w = await vbW();
        if (!Number.isFinite(w) || !Number.isFinite(w0) || w0 / w >= wantK) break;
        // re-aim every step: the wheel zooms toward the cursor, so the dot stays
        // put on screen, but a settle-driven rebuild can move what is under it
        await page.mouse.move(at.x, at.y);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(60);
      }
      // NOW wait for the drawing to catch up with the camera, and for it to stop
      // moving. The attribute is the thing under test, so it is waited ON here
      // and asserted by the caller — never used to decide when to stop wheeling.
      await page.waitForFunction((want) =>
        document.getElementById("wv-overlay")?.getAttribute("data-tier") === want,
        stopAtTier, { timeout: 45_000 }).catch(() => { /* the assertion says it better */ });
      zoomSettle = await settleDrawing();
    }
  }
  const seen = await page.evaluate(() => {
    const svg = document.querySelector(".wv-minimap > svg");
    const q = (s) => (svg ? svg.querySelectorAll(s).length : 0);
    return {
      mounted: !!svg,
      pane: (document.querySelector(".wv-minimap .loading")?.textContent ?? null),
      sourced: q("[data-src]"),
      regions: q(".wv-tg-region"),
      labels: q(".wv-tg-region-label"),
      water: q(".wv-tg-water, .wv-tg-water-line"),
      features: q(".wv-tg-feature"),
      furnished: q(".wv-ph-extent, .wv-scene-mark-art"),
      // the spectator's parcel pass, counted three ways: the far glyph, the
      // card, and the picture inside the card — which are the three answers the
      // tier gate picks between
      glyphs: document.querySelectorAll("#wv-overlay .ov-glyph").length,
      cards: document.querySelectorAll("#wv-overlay .ov-home").length,
      pictures: document.querySelectorAll("#wv-overlay .ov-home image").length,
      labels2: document.querySelectorAll("#wv-overlay .ov-home-label").length,
      titles: document.querySelectorAll("#wv-overlay title").length,
      // which of the spectator's three paintings this was counted in — read off
      // the drawing itself, never recomputed here from the zoom
      tier: document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? null,
      atlasImages: svg ? [...svg.querySelectorAll("image")]
        .filter((i) => (i.getAttribute("href") ?? "").includes("/atlas/")).length : 0,
    };
  });
  await page.close();
  // the settle evidence rides with the counts, so a surprising row can be told
  // apart from a row taken before the page had finished drawing
  return { ...seen, errors, firstSettle, zoomSettle };
}

test("THE PAGE DRAWS THE WORLD — with the atlas unreachable, the mounted ground is the record's", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent, so the ONLY page-driven guard on the town's ground is not running: "
    + "nothing here would notice townGround's answer being discarded, the mark record failing to reach it, "
    + "or the furnishing pass going dead again. tools/town-ground.test.mjs's two source-text regexes are all "
    + "that remains, and they prove a line was typed, not that its value reached the screen.");

  const g = await readGround();
  assert.equal(g.pane, null, "the pane carries no failure message");
  assert.ok(g.mounted, "a ground is mounted in .wv-minimap");
  // ≥ 40, not = 43: the record grows. A region founded tomorrow must not red
  // this file, but the whole record going missing must.
  assert.ok(g.sourced >= 40, `every drawn shape names its source: ${g.sourced} carry data-src (want >= 40)`);
  // THE COUNT IS READ OFF THE SERVED RECORD, never typed. The roster went from
  // twelve to thirteen on 2026-09-08 the moment the founder ruled the Headland a
  // region, and a test carrying the literal 12 would have gone red on its own for
  // a founding — the failure mode of every calendar-pinned control. What must
  // hold is the RELATION: the page draws every region the record it is served
  // actually holds. (Which is why this is also the assertion that will notice the
  // settlement publishing the Headland: the served count moves and the drawn
  // count must move with it.)
  assert.equal(g.regions, expectedRegions,
    `the page draws every region the served record holds (${expectedRegions})`);
  assert.equal(g.labels, expectedRegions, "and each one wears its own name");
  assert.ok(g.water >= 6, `the inland water and the sea: ${g.water}`);
  assert.ok(g.features >= 6, `the skeleton's terrain: ${g.features}`);
  assert.equal(g.atlasImages, 0, "nothing on the ground is served out of /atlas/");
  assert.deepEqual(g.errors, [], "and the page threw nothing getting there");
});

test("THE FURNISHING PASS IS ALIVE — drawOverlay's SET is built from full marks, not thin radial entries", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent: the furnishing pass's set construction is unguarded. Every other test of that pass "
    + "(map-art-default, viewer-interior) calls placeholderExtentSVG directly with a hand-built mark, which is "
    + "exactly why the pass could furnish nothing at all while 48 scene tests stayed green.");

  // ⚑ COUNTED AT STREET WIDTH (2026-09-11). The opening view is `far`, where the
  // spectator draws no furniture at all — by design, and asserted as such in the
  // test below. Taking THIS count there would read the gate as the defect.
  const g = await readGround({ zoomToNear: true });
  assert.equal(g.tier, "near",
    `the camera reached street width before counting (tier: ${g.tier}) — a count taken at any other `
    + `tier is a count of a gate, not of the pass`);
  // The town runs the same pass a room runs (SCENES.md #6, retired 2026-09-08),
  // so this one assertion now guards the set construction for BOTH scenes. It is
  // the assertion that was missing when `overlayMarks`' thin entries met
  // `isEmbodiedMark`'s demand for `kind` and `extent`.
  assert.ok(g.furnished > 0,
    `art-clad and art-less marks in view are furnished under the pips: ${g.furnished} `
    + `(zero means the set was built from radial entries that carry no extent — the 2026-09-08 defect)`);
});

// ── THE CULL, ON THE PAGE (2026-09-11) ─────────────────────────────────────
//
// The unit file proves the cull BOX is the right rectangle. Only the page can
// prove the overlay is cut by it, that a pan which leaves the drawn margin
// rebuilds, and that nothing lands outside — and "the page proves it" is this
// file's whole argument.
test("THE CULL IS A CULL — what the camera is over decides what is drawn, and nothing is drawn off the margin", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent: the spectator's viewport cull is unguarded on the page. Nothing else in the suite "
    + "drives drawOverlay's drawn set against a moving camera, which is the half a pure bounds test cannot reach.");

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${rig.port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!document.querySelector(".wv-minimap > svg"), null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const drawnIds = () => page.evaluate(() =>
    [...document.querySelectorAll("#wv-overlay [data-id]")].map((n) => n.dataset.id).sort());
  const tier = () => page.evaluate(() =>
    document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? null);

  // down to a zoom where the cull has something to cut: at town width the whole
  // painting plus a viewport of margin is on screen and a correct cull removes
  // nothing, which would make this test pass while doing nothing.
  const box = await page.locator(".wv-minimap > svg").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (let i = 0; i < 40 && (await tier()) !== "near"; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1000);
  assert.equal(await tier(), "near", "the camera reached street width");
  const before = await drawnIds();
  assert.ok(before.length > 0, `something is drawn to begin with: ${before.length}`);

  // TRAVEL THREE SCREENS, IN THREE DRAGS. One drag can only ever cross one
  // viewport — the hand cannot leave the window — and one viewport is exactly
  // the drawn margin, which a correct cull absorbs without rebuilding anything.
  // That is the property being protected, not a failure, so this test has to go
  // further than it on purpose. (Measured on this rig: a 1,388 px drag across a
  // 1,388 px map moves the viewBox 1.008 viewports.)
  for (let drag = 0; drag < 3; drag++) {
    await page.mouse.move(cx + box.width * 0.45, cy + box.height * 0.45);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(cx + box.width * 0.45 - i * (box.width * 0.9 / 30),
        cy + box.height * 0.45 - i * (box.height * 0.9 / 30));
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
  // WAIT FOR THE DRAWING, NOT FOR A DURATION. The settle rebuild is debounced on
  // purpose (a drag must not rebuild sixty times a second), so there is a window
  // in which the overlay still describes the camera's PREVIOUS position — and
  // under a loaded box running the whole suite that window is wider than any
  // number this test could hardcode. Asserting inside it reads a stale draw as a
  // cull failure, which is a flake wearing a real red's clothes.
  //
  // So: poll until the drawn set has held still, and fail with the reason if it
  // never does. A rebuild that genuinely never arrives still reds here, which is
  // the failure this is protecting.
  let after = await drawnIds(), stableFor = 0;
  for (let waited = 0; waited < 12_000 && stableFor < 700; waited += 250) {
    await page.waitForTimeout(250);
    const now = await drawnIds();
    stableFor = now.join("|") === after.join("|") ? stableFor + 250 : 0;
    after = now;
  }
  assert.ok(stableFor >= 700, "the overlay settled after the pan rather than rebuilding forever");

  assert.notDeepEqual(after, before,
    `the drawn set follows the camera (${before.length} over the standpoint, ${after.length} a few screens away) `
    + `— an identical set means the overlay is not culled by the viewport at all`);

  // AND WHAT IS DRAWN IS BOUNDED — by TWO viewports, which is the bound the
  // design actually gives and not the one it is tempting to assert.
  //
  // The derivation, because a margin number nobody can derive is a number that
  // will be tightened by somebody in good faith and red for a week: the overlay
  // is drawn with ONE viewport of margin, and it is rebuilt only once the
  // camera has LEFT that box — so a camera that has travelled almost a full
  // viewport since the last draw is still legitimately looking at a drawing
  // centred one viewport away. Worst case: one viewport of drift plus one
  // viewport of margin. (Asserting one viewport here reds under load on a
  // perfectly correct draw, which this test did, three times, before the bound
  // was derived instead of guessed.)
  //
  // Two viewports is nine screens of area against a town of any size — the
  // property being protected is that the drawn set is bounded by the CAMERA and
  // not by N, and nine screens is bounded.
  //
  // ⚑ PARCELS, NOT EVERY PIP, AND THE EXEMPTION IS THE POINT. A mark is culled
  // by its GROUND, never by its centre — the threshold district is 2,325 m
  // across, so a reader standing inside it at street width has its ground under
  // their feet and its centre 2.33 viewports off the top of the screen
  // (measured on this rig). Culling that would delete the ground they are
  // standing on, and the off-screen highlight arrow exists precisely because a
  // mark in view can have its marker out of it. A parcel is 25 m, so its pip and
  // its ground are the same place, and it has no such excuse.
  const strays = await page.evaluate(() => {
    const svg = document.querySelector(".wv-minimap > svg");
    const m = svg.getBoundingClientRect();
    const lim = { l: m.left - m.width * 2, r: m.right + m.width * 2,
      t: m.top - m.height * 2, b: m.bottom + m.height * 2 };
    return [...document.querySelectorAll("#wv-overlay .ov-pip.ov-pip-home")].filter((n) => {
      const b = n.getBoundingClientRect();
      return b.right < lim.l || b.left > lim.r || b.bottom < lim.t || b.top > lim.b;
    }).map((n) => n.dataset.id).slice(0, 8);
  });
  assert.deepEqual(strays, [],
    "no drawn parcel lies further than two viewports from the camera — one of margin, one of drift");
  assert.deepEqual(errors, [], "and the page threw nothing getting there");
  await page.close();
  // ⚑ THE FLIP: make drawnBounds() return null in viewer.mjs (the cull off) and
  //   the notDeepEqual reds — the same set is drawn wherever the camera is.
});

// ── THE GATE ITSELF, ON THE PAGE (2026-09-11) ──────────────────────────────
//
// The unit tests can prove `tierFor` returns the word "far". Only the page can
// prove the word reached the drawing — which is this file's entire argument,
// and the same argument the furnishing pass needed a page to settle.
test("THE FAR TIER DRAWS NO FURNITURE — the spectator opens on the town, not on the contact sheet", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent: the spectator's zoom gates are unguarded on the page. tools/viewer-spectator-tiers.test.mjs "
    + "proves tierFor and the markup builders in isolation, which is exactly the kind of proof that stayed green "
    + "while the furnishing pass drew nothing at all.");

  const g = await readGround();
  assert.equal(g.tier, "far", `the opening view is the whole town (tier: ${g.tier})`);
  assert.equal(g.furnished, 0,
    `no furniture is drawn at town width: ${g.furnished} (the 09-09 record put 11,961 marks through this pass)`);
  // THE HOUSES ARE GLYPHS, NOT CARDS. This is the pass that made the contact
  // sheet: a card is a clipped photograph, a frame, a name and a pip, and there
  // is one per parcel whatever the zoom. At town width they are one filled
  // roofline each.
  assert.ok(g.glyphs > 0, `the town's houses are drawn as glyphs: ${g.glyphs}`);
  assert.equal(g.cards, 0, `and not one of them is a card: ${g.cards}`);
  assert.equal(g.pictures, 0, `no pictures at town width: ${g.pictures}`);
  assert.equal(g.labels2, 0, `no names under the houses: ${g.labels2}`);
  // (the tooltips are asked for separately, below, on a page where they exist)
  // and the ground is still the ground — the gate cuts the furniture, never the floor
  assert.equal(g.regions, expectedRegions, "the region rings are NOT culled or tiered away");
  assert.deepEqual(g.errors, [], "and the page threw nothing getting there");
  // ⚑ THE FLIP: drop the `tier` argument at homeCard's two call sites in
  //   drawOverlay (so it never sees "far") and `cards`/`labels2` red while the
  //   furniture assertion above stays green — the two gates are independent and
  //   this proves the parcel one separately.
});

// ── THE LABEL GATE, ON A PAGE THAT HAS LABELS (2026-09-11) ─────────────────
//
// This test exists in this shape because its first shape was a lie. It asserted
// "no tooltips at town width" against the page's DEFAULT, which is painting-only
// — and painting-only suppresses every tooltip at every tier, so the assertion
// was green with the label gate deleted. The flip proved it, which is the only
// reason this note can be written at all.
//
// So the Telling is opened first, the tooltips exist, and the gate is asked a
// question it can answer wrongly.
test("THE NAMES STAND DOWN AT TOWN WIDTH — and the gate is a gate, not an off switch", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent: the label gate is unguarded. Its unit-level twin does not exist — the gate is one "
    + "boolean inside drawOverlay and there is nothing pure to ask.");

  const far = await readGround({ tellingOpen: true });
  assert.equal(far.tier, "far");
  assert.equal(far.titles, 0,
    `no names are carried at town width: ${far.titles} tooltips (890 of them would be a grey band, `
    + `and the hover box — one node, raised on demand — is how a reader asks at this zoom)`);

  // AND THE SAME PAGE NAMES THINGS WHEN THE CAMERA COMES DOWN. Without this the
  // test above is satisfied by a viewer that never names anything, which is a
  // different bug wearing this one's green.
  const near = await readGround({ tellingOpen: true, zoomToNear: true });
  assert.equal(near.tier, "near");
  assert.ok(near.titles > 0, `and it names them at street width: ${near.titles} tooltips`);
  // ⚑ THE FLIP: `const named = !state.paintingOnly;` (the tier dropped from the
  //   gate) and the far assertion reds while the near one stays green.
});

// ── THE HOUSE IS THE TARGET, ON THE PAGE (Keemin, 2026-09-11) ──────────────
//
// "make parcels more clickable (match their drawn size)". The pure ranking is
// proved in tools/viewer-axes.test.mjs, and that is the weaker half: it asserts
// that a box in an array beats a distance, not that the box under a reader's
// cursor is the one the overlay actually drew. Only the page can say whether
// `getBoundingClientRect` on the drawn group, resolved at the moment of the
// gesture, lands where the house is.
//
// HOW THE MARK IS IDENTIFIED, AND WHY NOT BY ITS PIP. The obvious test hovers
// the pip, remembers the name, then hovers the corner and compares. It does not
// survive contact with the town: a walker wins the hover over the ground they
// stand on (the person is what you were pointing at, ruled 2026-08-04), and on
// this rig BOTH houses in view at street width have a resident standing on them
// — the pip said "histor-reeves" and the corner said "The Gauge House Parcel",
// and the comparison read a working box test as a failure.
//
// So the card identifies itself by its own EDGE instead. Two points inside the
// box, far apart and both outside the snap circle, must raise the SAME name;
// a point just outside the box must raise a different one. That is the box
// being the target, stated without needing to know what the card is called.
test("THE HOUSE IS THE TARGET — the card's own edge decides what a hover reaches", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent: the drawn-box hit test is unguarded on the page. The ranking is proved in "
    + "viewer-axes, which cannot tell a box that is measured from a box that is measured in the right place.");

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  // the Telling open, because painting-only suppresses the hover label and the
  // label is how this test learns WHICH mark answered
  await page.addInitScript(() => { try { localStorage.setItem("pm_world_painting_only", "0"); } catch {} });
  await page.goto(`http://localhost:${rig.port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!document.querySelector(".wv-minimap > svg"), null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  // down to a zoom where parcels are drawn as CARDS rather than glyphs, aiming
  // at the reader's own standpoint — the overlay is cut by the standpoint, so
  // that is where the houses are
  const tier = () => page.evaluate(() =>
    document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? null);
  const aim = await page.evaluate(() => {
    const dot = document.querySelector("#wv-overlay .ov-dot");
    const b = (dot ?? document.querySelector(".wv-minimap > svg"))?.getBoundingClientRect();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  });
  // ── STEER BY THE CAMERA, NOT BY THE TIER ATTRIBUTE ──────────────────
  //
  // Same correction as readGround's, for the same reason and found the same way
  // (six concurrent runs of this file). `data-tier` is written by drawOverlay on
  // the settle-debounced rebuild, so stopping the instant it says "near" stops
  // at whatever depth the lag happened to allow — and a shallow near has the
  // cards crowded and mostly off screen, so no card passes the filters and the
  // test reds on its own setup rather than on the rule. The viewBox is written
  // synchronously by applyView, so it is what the loop reads.
  const vbW = () => page.evaluate(() => {
    const m = document.querySelector(".wv-minimap > svg");
    return m ? Number((m.getAttribute("viewBox") ?? "").split(/[\s,]+/)[2]) : NaN;
  });
  const w0 = await vbW();                      // the opening view: zoomK 1
  const zoomTo = async (wantK) => {
    for (let i = 0; i < 60; i++) {
      const w = await vbW();
      if (!Number.isFinite(w) || !Number.isFinite(w0) || w0 / w >= wantK) break;
      await page.mouse.move(aim.x, aim.y);
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() =>
      document.getElementById("wv-overlay")?.getAttribute("data-tier") === "near",
      null, { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(700);
  };
  await zoomTo(15);
  assert.equal(await tier(), "near", "the camera reached a zoom where parcels wear cards");

  // A CARD ON SCREEN, CLEAR OF ITS NEIGHBOURS. Two filters, each learned here:
  //   ON SCREEN  the overlay draws one viewport of MARGIN beyond the viewBox, so
  //              cards exist in the DOM at negative screen coordinates and a
  //              hover aimed at one lands on nothing. Measured: of 23 cards
  //              drawn at street width, 21 were off screen.
  //   ISOLATED   cards overlap; a point inside a NEIGHBOUR's box would make this
  //              test about which of two houses answered.
  const findClearCard = () => page.evaluate(() => {
    const map = document.querySelector(".wv-minimap > svg").getBoundingClientRect();
    const inMap = (x, y) => x >= map.left + 4 && x <= map.right - 4 && y >= map.top + 4 && y <= map.bottom - 4;
    const boxes = [...document.querySelectorAll("#wv-overlay .ov-home[data-id]")]
      .map((g) => ({ g, b: g.getBoundingClientRect() }));
    const walkers = [...document.querySelectorAll("#wv-walk-layer circle")]
      .map((n) => n.getBoundingClientRect())
      .map((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));
    const clear = (pt) => inMap(pt.x, pt.y) && !walkers.some((w) => Math.hypot(w.x - pt.x, w.y - pt.y) <= 24);
    const inAnyOther = (pt, self) => boxes.some(({ g: o, b: ob }) => o !== self
      && pt.x >= ob.left && pt.x <= ob.right && pt.y >= ob.top && pt.y <= ob.bottom);
    for (const { g, b } of boxes) {
      if (b.width < 30 || b.height < 30) continue;
      if (!inMap(b.left, b.top) || !inMap(b.right, b.bottom)) continue;
      // two points INSIDE, far apart, and one just OUTSIDE past the same corner
      const topLeft = { x: b.left + 3, y: b.top + 3 };
      const bottomRight = { x: b.right - 3, y: b.bottom - 3 };
      const beyond = { x: b.left - 14, y: b.top - 14 };
      if ([topLeft, bottomRight, beyond].some((pt) => !clear(pt) || inAnyOther(pt, g))) continue;
      const pipEl = [...document.querySelectorAll("#wv-overlay .ov-pip")].find((p) => p.dataset.id === g.dataset.id);
      if (!pipEl) continue;
      const p = pipEl.getBoundingClientRect();
      return {
        id: g.dataset.id, topLeft, bottomRight, beyond,
        pip: { x: p.x + p.width / 2, y: p.y + p.height / 2 },
        w: Math.round(b.width), h: Math.round(b.height),
      };
    }
    return null;
  });

  // AND IF NONE QUALIFIES, GO DEEPER RATHER THAN GIVE UP. Zooming spreads the
  // cards apart: the same town at half the width has half as many houses on
  // screen and twice the ground between them. A bounded climb, so a page that
  // genuinely never draws a usable card still fails and says so.
  let target = await findClearCard();
  for (let deeper = 1; deeper <= 4 && !target; deeper++) {
    await zoomTo(15 * (1 + deeper));
    target = await findClearCard();
  }
  assert.ok(target, "a card is drawn on screen, clear of its neighbours, with room outside it");

  // ⚑ THE ASSERTION THAT MAKES THIS TEST MEAN ANYTHING. Both inside points must
  //   be OUTSIDE the 18 px snap circle, or the old code would have hit them too
  //   and this would pass just as well without the change.
  const reach = (pt) => Math.hypot(pt.x - target.pip.x, pt.y - target.pip.y);
  assert.ok(reach(target.topLeft) > 18 && reach(target.bottomRight) > 18,
    `both points are outside the 18 px snap circle (${reach(target.topLeft).toFixed(1)} px and `
    + `${reach(target.bottomRight).toFixed(1)} px from the pip; the card is ${target.w}x${target.h} px `
    + `on screen, which is the whole complaint)`);

  const hoverName = async (pt) => {
    await page.mouse.move(pt.x - 60, pt.y - 60);   // leave, so a stale label cannot read as a fresh one
    await page.waitForTimeout(200);
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(400);
    return page.evaluate(() =>
      document.querySelector("#wv-hl-layer .wv-hl-label text")?.textContent ?? null);
  };

  const atTopLeft = await hoverName(target.topLeft);
  const atBottomRight = await hoverName(target.bottomRight);
  const justOutside = await hoverName(target.beyond);

  assert.ok(atTopLeft, `the card's top-left corner raises a name: ${JSON.stringify(atTopLeft)}`);
  assert.equal(atBottomRight, atTopLeft,
    `and its opposite corner raises the same one (${JSON.stringify(atBottomRight)}) — one house, `
    + `answering across its whole drawn body`);
  assert.notEqual(justOutside, atTopLeft,
    `while fourteen pixels further out, past the card's edge, something else answers `
    + `(${JSON.stringify(justOutside)}) — which is what the reader got everywhere on the house before this`);
  assert.deepEqual(errors, [], "and the page threw nothing getting there");
  await page.close();
  // ⚑ THE FLIP: drop the `mark?.box &&` branch from rankMarksAtPoint, or return
  //   no box from screenMarkCandidates, and both inside points fall through to
  //   containment — the same answer as the point outside, and the notEqual reds.
});

// ── THE PIXEL RULE, ON THE PAGE (2026-09-11) ───────────────────────────────
//
// `footprintPx` is proved arithmetically in tools/viewer-spectator-tiers.test.mjs
// and that proof is worth exactly nothing until the number reaches a decision a
// reader can see. A parcel is 25 m of ground: across a district it is thirteen
// screen pixels and has no room for a photograph; down at street width it is
// ninety and does.
test("THE PICTURE WAITS FOR THE GROUND — a home card wears its art only where its parcel has room", async (t) => {
  if (!chromium) return t.skip(
    "playwright is absent: the picture gate is unguarded on the page. The arithmetic is tested in isolation, "
    + "which cannot tell a rule that is computed from a rule that is read.");

  const near = await readGround({ zoomToNear: true });
  // ⚑ THE SETTLE IS ASSERTED, NOT ASSUMED. This case red under the full gate at
  //   19,216 ms while passing in about a second alone — a load-dependent timeout
  //   reading as a broken rule. Every count below is only meaningful if the
  //   drawing had stopped moving when it was taken, so that is said out loud and
  //   a failure names which of the two things went wrong.
  assert.ok(near.zoomSettle?.settled,
    `the drawing settled at street width before it was counted `
    + `(waited ${near.zoomSettle?.waited} ms, last state ${near.zoomSettle?.state})`);
  assert.equal(near.tier, "near");
  assert.ok(near.cards > 0, `cards are drawn at street width: ${near.cards}`);
  assert.ok(near.pictures > 0,
    `and they wear their pictures there: ${near.pictures} of ${near.cards} cards `
    + `(a parcel is 25 m, which is ~90 px at this zoom — well past the 40 px dial)`);
  assert.ok(near.labels2 > 0, `and their households' names: ${near.labels2}`);

  const far = await readGround();
  assert.equal(far.tier, "far");
  assert.equal(far.pictures, 0, "and not one picture at town width, where a parcel is under a pixel");

  // ── AND THE RULE'S OWN RED IS AT DISTRICT WIDTH ──────────────────────────
  //
  // `far` draws a glyph and never reaches the picture rule at all, so the far
  // assertion above proves the PARCEL gate and not this one. At `mid` the card
  // is drawn and the rule decides: a 25 m parcel across a ~1,300 px map showing
  // 1,000–5,000 m is 6–32 screen pixels, every one of them under the 40 px dial,
  // so the frames and the names are drawn and the photographs are not.
  const mid = await readGround({ zoomToNear: true, stopAtTier: "mid" });
  assert.ok(mid.zoomSettle?.settled,
    `the drawing settled at district width before it was counted `
    + `(waited ${mid.zoomSettle?.waited} ms, last state ${mid.zoomSettle?.state})`);
  assert.equal(mid.tier, "mid", `the camera stopped at district width (tier: ${mid.tier})`);
  assert.ok(mid.cards > 0, `cards are drawn at district width: ${mid.cards}`);
  assert.ok(mid.labels2 > 0, `wearing their households' names: ${mid.labels2}`);
  assert.equal(mid.pictures, 0,
    `and none of them wears a photograph: ${mid.pictures} (a 25 m parcel is under 33 px here, `
    + `and the dial asks for 40 — this is the number that killed "half the town's pictures overlap at N=20")`);
  // ⚑ THE FLIP: force `room = true` in homeCard (the picture gate off) and the
  //   MID assertion reds while far and near stay green — which is right, and is
  //   why the mid half had to be written: far draws a glyph and never reaches
  //   the rule, near passes it honestly, and only district width can tell a rule
  //   that is consulted from a rule that is ignored.
});
