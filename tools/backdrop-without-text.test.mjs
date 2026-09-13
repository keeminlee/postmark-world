// backdrop-without-text.test.mjs — the World page's ground is a BACKDROP, and a
// backdrop carries no words (Keemin, 2026-09-12, on dev: "the text for the
// regions is quite hard to read. there are a couple of other random phrases like
// 'tended, never owned' and stuff on the map, which don't need to be there…
// for now I think we can just remove those names from the backdrop").
//
//   node --test tools/backdrop-without-text.test.mjs
//
// THE PAGE IS DRIVEN, for the reason tools/town-ground-page.test.mjs sets out at
// length in its own header: a regex over the source proves a line was typed and
// never that it reached the screen. What is asserted here is the MOUNTED DOM.
//
// THE ATLAS IS MADE REACHABLE, which is the inversion of the trick next door.
// town-ground-page points ATLAS_ORIGIN at a dead port to prove the page copes
// when the picture is gone; this file points it at a tiny server of its own
// serving a fixture picture, because the strip only exists on the picture path
// and a page that never loaded one cannot answer for it.
//
// When Playwright is absent this SKIPS AND SAYS WHAT WENT UNGUARDED.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A fixture picture in the shape the real one has: a sheet with words on it,
 *  pictures hung on it by RELATIVE href, and a script the import already
 *  strips. Four <text>, deliberately including the two classes Keemin named. */
const FIXTURE_GROUND = `<!doctype html><html><body>
<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <rect x="0" y="0" width="1000" height="1000" fill="#dfe3ea"/>
  <polygon class="region" points="10,10 400,10 400,400 10,400" fill="#cfe0cf"/>
  <text class="region-label" x="100" y="100">Evermoon</text>
  <text class="region-founder" x="100" y="120">tended, never owned — illuminator</text>
  <text class="open-ground-label" x="600" y="600">upstream — open ground</text>
  <text x="600" y="640">the far bank —</text>
  <image href="assets/one.jpg" x="20" y="500" width="60" height="60"/>
  <image href="assets/two.jpg" x="120" y="500" width="60" height="60"/>
  <script>window.__atlasRan = true;</script>
</svg>
</body></html>`;

const PLAYWRIGHT_PATHS = ["playwright", "file:///G:/Wright-HQ/node_modules/playwright/index.mjs"];
async function loadChromium() {
  for (const spec of PLAYWRIGHT_PATHS) {
    try { return (await import(spec)).chromium; } catch { /* next */ }
  }
  return null;
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createNetServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* gone */ } } });

/** the tiny origin the viewer will fetch its picture from */
async function serveFixtureAtlas() {
  const port = await freePort();
  const server = createServer((req, res) => {
    if ((req.url ?? "").startsWith("/atlas/ground.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "access-control-allow-origin": "*" });
      res.end(FIXTURE_GROUND);
      return;
    }
    res.writeHead(404); res.end("");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  CLEANUP.push(() => server.close());
  return port;
}

async function bootRig(atlasOrigin) {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: atlasOrigin },
    stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c} before serving`)); });
  });
  return port;
}

let chromium = null, browser = null, withAtlas = null, withoutAtlas = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const atlasPort = await serveFixtureAtlas();
  withAtlas = await bootRig(`http://127.0.0.1:${atlasPort}`);
  withoutAtlas = await bootRig("http://127.0.0.1:1");   // the atlas unreachable, as next door
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function readGround(port) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!document.querySelector(".wv-minimap > svg"), null, { timeout: 60_000 })
    .catch(() => { /* absence is a real answer */ });
  await page.waitForTimeout(2500);
  const read = await page.evaluate(() => {
    const svg = document.querySelector(".wv-minimap > svg");
    if (!svg) return { mounted: false };
    const VIEWER_LAYERS = "#wv-overlay, #wv-grid-layer, #wv-fp-layer, #wv-convo-layer, #wv-hl-layer,"
      + " #wv-walk-layer, #wv-walk-preview-layer, #wv-convo-hover-layer, #wv-mist-layer, #wv-placed-art-layer";
    return {
      mounted: true,
      ground: svg.getAttribute("data-ground"),
      // TEXT ON THE BACKDROP, not text on the page. The viewer appends its own
      // layers INTO this same svg, so a bare querySelectorAll("text") counts 141
      // house names and walker initials and answers a question nobody asked. The
      // backdrop is what is left when the viewer's own layers are excluded.
      texts: [...svg.querySelectorAll("text")].filter((t) => !t.closest(VIEWER_LAYERS)).length,
      backdropTextSample: [...svg.querySelectorAll("text")].filter((t) => !t.closest(VIEWER_LAYERS))
        .map((t) => (t.getAttribute("class") ?? "(no class)") + ": " + (t.textContent ?? "").slice(0, 40)).slice(0, 6),
      viewerTexts: [...svg.querySelectorAll("text")].filter((t) => t.closest(VIEWER_LAYERS)).length,
      images: svg.querySelectorAll("image").length,
      scripts: svg.querySelectorAll("script").length,
      hrefs: [...svg.querySelectorAll("image")].map((im) => im.getAttribute("href")),
      atlasScriptRan: !!window.__atlasRan,
      generatedRegionLabels: svg.querySelectorAll(".wv-tg-region-label").length,
    };
  });
  await page.close();
  return { ...read, errors };
}

test("THE BACKDROP CARRIES NO WORDS — and everything else on the picture survives", async (t) => {
  if (!chromium) {
    t.skip("NO PLAYWRIGHT — the strip, the surviving pictures and the rebased hrefs went UNGUARDED. "
      + "Nothing else in this file covers them.");
    return;
  }
  const g = await readGround(withAtlas);
  assert.equal(g.mounted, true, "a ground mounted at all");
  assert.deepEqual(g.errors, [], "…without the page throwing");
  assert.equal(g.ground, "atlas", "and it is THE PICTURE, not the generated fallback — the strip only lives on this path");

  assert.equal(g.texts, 0,
    `no words on the backdrop: the fixture's four <text> are gone (left: ${g.backdropTextSample.join(" | ")})`);
  assert.ok(g.viewerTexts > 0,
    `…and the viewer's OWN labels are untouched and still there (${g.viewerTexts}), so a zero above is the strip and not an empty page`);

  // …and the strip took nothing with it. Each of these was true before the line
  // was added, and is asserted so the line cannot have moved it.
  assert.equal(g.images, 2, "both pictures survive");
  assert.equal(g.scripts, 0, "the script strip is unchanged");
  assert.equal(g.atlasScriptRan, false, "…and the stripped script never ran");
  assert.deepEqual(g.hrefs, ["/atlas/assets/one.jpg", "/atlas/assets/two.jpg"],
    "relative hrefs are still rebased under /atlas/");
  // ⚑ THE FLIP: drop the `svg.querySelectorAll("text")` line and `texts` reads 4
  //   while every other assertion here stays green.
});

test("the generated fallback keeps its region names — the strip is on the picture", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the fallback's names went UNGUARDED."); return; }
  // Whether a region should say its name at far is a separate conversation, and
  // this proves the piece did not quietly settle it. With the atlas unreachable
  // the page draws its own ground, and that ground still names its regions.
  const g = await readGround(withoutAtlas);
  assert.equal(g.mounted, true, "the generated ground mounted");
  assert.equal(g.ground, "generated", "…and it IS the fallback, so the next line is about the fallback");
  // THE RELATION, NOT THE REMEMBERED NUMBER. The brief said twelve; the fallback
  // actually draws thirteen on this record, and a test pinned to twelve would
  // red the next time a region is founded while saying nothing about the strip.
  // What must hold is that the fallback still names its regions at all.
  assert.ok(g.generatedRegionLabels > 0,
    `the generated ground still names its regions (${g.generatedRegionLabels})`);
  assert.equal(g.texts, g.generatedRegionLabels,
    "and every one of its words is a region name — the strip never reached this path");
});
