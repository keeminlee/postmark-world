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
async function readGround({ zoomToNear = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${rig.port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  // the ground is mounted asynchronously; wait for the thing under test rather
  // than for a duration, so a slow box cannot turn a real red into a flake
  await page.waitForFunction(() => !!document.querySelector(".wv-minimap > svg"), null, { timeout: 60_000 })
    .catch(() => { /* absence is a real answer here — the base commit's answer */ });
  await page.waitForTimeout(2500);
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
      const tier = () => page.evaluate(() =>
        document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? null);
      for (let i = 0; i < 40 && (await tier()) !== "near"; i++) {
        // re-aim every step: the wheel zooms toward the cursor, so the dot stays
        // put on screen, but a settle-driven rebuild can move what is under it
        await page.mouse.move(at.x, at.y);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(900);
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
  return { ...seen, errors };
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
  await page.waitForTimeout(1600);   // the settle rebuild is debounced, on purpose
  const after = await drawnIds();

  assert.notDeepEqual(after, before,
    `the drawn set follows the camera (${before.length} over the standpoint, ${after.length} a few screens away) `
    + `— an identical set means the overlay is not culled by the viewport at all`);

  // AND NOTHING SMALL IS DRAWN OFF THE MARGIN. Measured in screen space against
  // the map's own box grown by one viewport on each side, which is what the cull
  // dial says it keeps.
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
    const lim = { l: m.left - m.width, r: m.right + m.width, t: m.top - m.height, b: m.bottom + m.height };
    return [...document.querySelectorAll("#wv-overlay .ov-pip.ov-pip-home")].filter((n) => {
      const b = n.getBoundingClientRect();
      return b.right < lim.l || b.left > lim.r || b.bottom < lim.t || b.top > lim.b;
    }).map((n) => n.dataset.id).slice(0, 8);
  });
  assert.deepEqual(strays, [], "no drawn parcel lies outside the viewBox plus one viewport of margin");
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
  assert.equal(g.titles, 0, `and no tooltips standing in for the names: ${g.titles}`);
  // and the ground is still the ground — the gate cuts the furniture, never the floor
  assert.equal(g.regions, expectedRegions, "the region rings are NOT culled or tiered away");
  assert.deepEqual(g.errors, [], "and the page threw nothing getting there");
  // ⚑ THE FLIP: drop the `tier` argument at homeCard's two call sites in
  //   drawOverlay (so it never sees "far") and `cards`/`labels2` red while the
  //   furniture assertion above stays green — the two gates are independent and
  //   this proves the parcel one separately.
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
  assert.equal(near.tier, "near");
  assert.ok(near.cards > 0, `cards are drawn at street width: ${near.cards}`);
  assert.ok(near.pictures > 0,
    `and they wear their pictures there: ${near.pictures} of ${near.cards} cards `
    + `(a parcel is 25 m, which is ~90 px at this zoom — well past the 40 px dial)`);
  assert.ok(near.labels2 > 0, `and their households' names: ${near.labels2}`);

  const far = await readGround();
  assert.equal(far.tier, "far");
  assert.equal(far.pictures, 0, "and not one picture at town width, where a parcel is under a pixel");
  // ⚑ THE FLIP: force `room = true` in homeCard (the picture gate off) and the
  //   far assertion here stays green — the FAR tier draws a glyph, not a card,
  //   so it never reaches the rule. The rule's own red is at `mid`, which the
  //   10x measurement in the lane report takes: with the dial at 40 px a 25 m
  //   parcel is 13.9 px across a district and draws nothing, and with the dial
  //   at 0 the pictures come back. Both numbers are in the report.
});
