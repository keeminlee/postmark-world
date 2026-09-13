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
<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400" width="1500" height="2400">
  <rect x="0" y="0" width="1500" height="2400" fill="#dfe3ea"/>
  <path class="terrain" d="M 20 20 L 300 20 L 300 300 Z" fill="#cfd8c8"/>
  <g class="clickable region" data-id="evermoon" tabindex="0" role="button" aria-label="Evermoon">
    <rect x="40" y="900" width="200" height="300" fill="transparent" pointer-events="all"/>
    <path d="M 60 950 Q 140 920 220 980 Q 200 1120 90 1140 Z" fill="#cfe0cf"/>
    <path d="M 80 1000 Q 130 990 170 1030 Z" fill="#c6dcc6"/>
    <text class="region-label" x="140" y="1050">Evermoon</text>
    <text class="region-founder" x="140" y="1070">tended, never owned — illuminator</text>
    <svg x="150" y="930" width="60" height="60"><image href="assets/evermoon.jpg" width="60" height="60"/></svg>
    <rect x="150" y="930" width="60" height="60" fill="none" stroke="#f5c26b" stroke-width="1.2"/>
  </g>
  <g class="clickable region" data-id="the-reach" tabindex="0" role="button" aria-label="The Reach">
    <rect x="600" y="1500" width="220" height="260" fill="transparent" pointer-events="all"/>
    <ellipse cx="710" cy="1630" rx="100" ry="120" fill="#cdd9e4"/>
    <text class="region-label" x="710" y="1630">The Reach</text>
    <svg x="760" y="1530" width="60" height="60"><image href="assets/the-reach.jpg" width="60" height="60"/></svg>
    <rect x="760" y="1530" width="60" height="60" fill="none" stroke="#f5c26b" stroke-width="1.2"/>
  </g>
  <path class="water" d="M 900 100 L 1200 400 L 900 700 Z" fill="#8fa9c2"/>
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
      // PICTURES ON THE BACKDROP, not pictures on the page — the same exclusion
      // the text count already makes, and I did not apply it here. Since the
      // 05:45Z sweep folded the nine district pictures, the viewer's own
      // placed-art layer hangs them into this same svg, and a bare
      // querySelectorAll("image") counted 8 where the fixture planted 2.
      images: [...svg.querySelectorAll("image")].filter((im) => !im.closest(VIEWER_LAYERS)).length,
      viewerImages: [...svg.querySelectorAll("image")].filter((im) => im.closest(VIEWER_LAYERS)).length,
      tier: document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? "-",
      hungArt: document.querySelectorAll("#wv-placed-art-layer .wv-far-art").length,
      overlayMarks: document.querySelectorAll("#wv-overlay [data-id]").length,
      scripts: svg.querySelectorAll("script").length,
      hrefs: [...svg.querySelectorAll("image")].filter((im) => !im.closest(VIEWER_LAYERS))
        .map((im) => im.getAttribute("href")),
      atlasScriptRan: !!window.__atlasRan,
      generatedRegionLabels: svg.querySelectorAll(".wv-tg-region-label").length,
      // inside the region groups, after the strips
      regionGroups: svg.querySelectorAll("g.region").length,
      inRegionFrames: svg.querySelectorAll('g.region rect[fill="none"]').length,
      inRegionInnerSvgs: svg.querySelectorAll("g.region svg").length,
      inRegionHitRects: svg.querySelectorAll('g.region rect[fill="transparent"]').length,
      inRegionWashes: svg.querySelectorAll("g.region path, g.region ellipse").length,
      // …and what lives OUTSIDE them, which is the picture's actual job
      terrainOutside: [...svg.querySelectorAll("path.terrain, path.water")].filter((e) => !e.closest("g.region")).length,
      // the record's own shapes, transplanted into the picture
      literalPolys: svg.querySelectorAll('g.region polygon.wv-tg-region[data-src^="mark:"]').length,
      literalAnywhere: svg.querySelectorAll('polygon.wv-tg-region[data-src^="mark:"]').length,
      literalSlugs: [...svg.querySelectorAll('polygon.wv-tg-region[data-src^="mark:"]')]
        .map((e) => (e.getAttribute("data-src") ?? "").replace(/^mark:/, "")).slice(0, 4),
      // the ones the picture had no group for: placed beside the groups, at the
      // same depth, never in a layer of their own
      literalOutsideShareTheParent: (() => {
        const groups = [...svg.querySelectorAll("g.region")];
        if (!groups.length) return null;
        const parent = groups[0].parentNode;
        const loose = [...svg.querySelectorAll('polygon.wv-tg-region[data-src^="mark:"]')]
          .filter((e) => !e.closest("g.region"));
        return loose.length === 0 || loose.every((e) => e.parentNode === parent);
      })(),
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
  // THE GUARD THAT A ZERO MEANS THE STRIP AND NOT AN EMPTY PAGE. It was "the
  // viewer's own labels are still there", and that stopped holding the moment
  // the fixture became the picture's real 1500x2400 sheet: at that scale the
  // viewer draws no labels, so the guard read zero and red. The third time one
  // of my own changes has quietly invalidated one of my own guards, and the
  // same fix each time — assert what holds at any scale, which is that the map
  // is drawn at all.
  assert.ok(g.overlayMarks > 0,
    `the map is populated (${g.overlayMarks} marks, ${g.viewerTexts} of the viewer's own labels), so a zero above is the strip`);

  // …and the strip took nothing with it. Each of these was true before the line
  // was added, and is asserted so the line cannot have moved it.
  // FLIPPED 2026-09-13 (Keemin: "still see the art as squares baked into the
  // html"). This asserted that the backdrop's two pictures SURVIVED, and that
  // was right while the backdrop was the only place a region had art. The
  // viewer now hangs the record's own picture in the region's ring, so a baked
  // square is the same place said twice.
  assert.equal(g.images, 0,
    `no pictures left on the backdrop (viewer's own, still hung: ${g.viewerImages})`);
  // THE GUARD THAT A ZERO MEANS THE STRIP AND NOT AN EMPTY MAP. It cannot be
  // "the viewer's own hung pictures are still there": this rig opens at MID,
  // and since regions stand down at mid there is nothing hung to count — my own
  // rule, two commits earlier, would have made this read as a pass on a blank
  // page. What holds at any tier is that the map is drawn at all.
  assert.ok(g.overlayMarks > 0,
    `the map is populated (${g.overlayMarks} marks, ${g.viewerTexts} of the viewer's own labels), so a zero above is the strip`);
  assert.equal(g.scripts, 0, "the script strip is unchanged");
  assert.equal(g.atlasScriptRan, false, "…and the stripped script never ran");
  assert.deepEqual(g.hrefs, [],
    "…and no hrefs to rebase, because no pictures are left to carry one");
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

test("THE REGION GROUPS LOSE THEIR FRAMES — and the picture's own art is untouched", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the frame strip went UNGUARDED."); return; }
  // Keemin, 2026-09-13: "we still have the region image borders baked into the
  // background map." The words went yesterday, the thumbnails this morning, and
  // what was left was an amber rectangle framing a photograph that is not there.
  const g = await readGround(withAtlas);
  assert.equal(g.mounted, true);
  assert.equal(g.ground, "atlas", "it is the picture — the strip only lives on this path");
  assert.equal(g.regionGroups, 2, "the fixture's two region groups are still there");

  assert.equal(g.inRegionFrames, 0, "no amber frame rects left inside a region group");
  assert.equal(g.inRegionInnerSvgs, 0, "no empty inner <svg> wrappers either");
  assert.equal(g.inRegionHitRects, 0,
    "and no transparent hit rect: the backdrop owns no clicks, the overlay does");

  // THE GUARD THAT THIS IS A STRIP AND NOT A WIPE. The water and terrain live
  // outside the region groups and are the picture's actual job.
  assert.equal(g.terrainOutside, 2, "the terrain and the water outside the groups survive");
  // ⚑ THE FLIP: drop the g.region loop and the three counts above read 2, 2, 2.
});

test("THE WASHES ARE THE RECORD'S OWN POLYGONS, in the groups they replaced", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the wash transplant went UNGUARDED."); return; }
  // Keemin, 2026-09-13: "can we actually correct the background map html's
  // region washes to use the literal polygons of the marks instead of the old
  // approximations?" Measured before building: the generated ring's centroid
  // and the picture's wash centroid are 2–11 px apart across the twelve region
  // groups, 33 for the town centre. Tens, not hundreds.
  const g = await readGround(withAtlas);
  assert.equal(g.ground, "atlas", "the picture path — the transplant only lives here");
  assert.equal(g.inRegionWashes, 0, "not one hand-drawn blob left inside a region group");
  assert.ok(g.literalPolys >= 1,
    `the record's polygons are in the groups instead (${g.literalPolys}: ${g.literalSlugs.join(", ")})`);
  // THE RECORD HOLDS MORE REGIONS THAN THE PICTURE DREW GROUPS FOR, and the
  // fixture makes that the common case rather than the edge: two groups, and the
  // record's thirteen regions. The eleven with no group of their own are placed
  // beside the groups at the same depth — not dropped, and not lifted into a new
  // layer where they would paint over the water.
  assert.ok(g.literalAnywhere >= g.literalPolys,
    `every region the record holds is drawn (${g.literalAnywhere}), including the ${g.literalAnywhere - g.literalPolys} the picture had no group for`);
  assert.equal(g.literalOutsideShareTheParent, true,
    "…and those sit at the region groups' own depth, not in a layer of their own");
  assert.equal(g.terrainOutside, 2, "the water and the terrain outside the groups are untouched");
  // ⚑ THE FLIP: drop the transplant and `inRegionWashes` reads 3 while
  //   `literalPolys` reads 0.
});

test("the generated ground is untouched by any of it", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the fallback went UNGUARDED."); return; }
  // The transplant READS the generated ground and must not consume it: with the
  // atlas unreachable the page still draws its own, whole.
  const g = await readGround(withoutAtlas);
  assert.equal(g.ground, "generated");
  assert.ok(g.generatedRegionLabels > 0,
    `the fallback still names its regions (${g.generatedRegionLabels})`);
  assert.ok(g.literalAnywhere > 0,
    `…and still draws them (${g.literalAnywhere} polygons)`);
});
