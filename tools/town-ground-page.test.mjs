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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

/** what the mounted ground actually contains, counted in the page */
async function readGround() {
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
  assert.equal(g.regions, 12, "the twelve regions are washes on the ground, from their own rings");
  assert.equal(g.labels, 12, "and each one wears its own name");
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

  const g = await readGround();
  // The town runs the same pass a room runs (SCENES.md #6, retired 2026-09-08),
  // so this one assertion now guards the set construction for BOTH scenes. It is
  // the assertion that was missing when `overlayMarks`' thin entries met
  // `isEmbodiedMark`'s demand for `kind` and `extent`.
  assert.ok(g.furnished > 0,
    `art-clad and art-less marks in view are furnished under the pips: ${g.furnished} `
    + `(zero means the set was built from radial entries that carry no extent — the 2026-09-08 defect)`);
});
