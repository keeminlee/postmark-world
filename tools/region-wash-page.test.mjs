// region-wash-page.test.mjs — the wash layer, DRIVEN THROUGH THE PAGE.
//
// tools/region-wash-layer.test.mjs hands townGround its marks by hand and hands
// hydrateRegionWashes a fake svg. That proves the emitter and the hydrator; it
// does not prove the page CALLS them with the served record, or that a real
// browser's <image> answers the way the fake did. The compute-and-throw-away
// flip — keep `mountRegionWashes(svg, boxEl, ground.washes)` typed and make it
// do nothing — leaves every unit test green. Only the mounted DOM can see it.
//
// So: boot the real rig on an ephemeral port, open the real page, and read the
// ground twice — once with the town's shelf ANSWERING (Playwright's route serves
// each pointer's sha256 from spectator/washes/, the same bytes the conductor
// uploads), once with the shelf DEAD (the route aborts, which is exactly the
// pending-upload state on 2026-09-09) — and count what is on the ground and
// what the receipt says. Playwright is resolved the way the sibling
// town-ground-page test resolves it, and its absence SKIPS OUT LOUD.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { regionWashPointer, townRegionMarks } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const REGIONS = townRegionMarks(SERVED.marks);
// what the served record asks for — a relation, never a typed number
const POINTERED = REGIONS.filter((m) => regionWashPointer(m));
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "spectator/washes/manifest.json"), "utf8"));
const fileFor = (url) => {
  const sha = url.match(/\/([0-9a-f]{64})\.svg$/)?.[1];
  const row = MANIFEST.washes.find((w) => w.sha256 === sha);
  return row ? join(ROOT, row.file) : null;
};

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

async function bootRig() {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
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

/** open the page with the shelf answering (served from the staged files) or dead (aborted), and read the ground */
export async function readWashes({ shelf }) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], asked = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.route("https://media.postmark.town/**", (route) => {
    asked.push(route.request().url());
    if (shelf !== "answers") return route.abort();
    const file = fileFor(route.request().url());
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: "no such object" });
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: readFileSync(file) });
  });
  await page.goto(`http://localhost:${rig.port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => !!document.querySelector(".wv-minimap > svg"), null, { timeout: 60_000 }).catch(() => {});
  // wait for the receipt to SETTLE — no wash still "loading" — rather than for a duration
  await page.waitForFunction(() => {
    const sum = document.querySelector(".wv-tg-wash-sum")?.textContent ?? "";
    return sum && !/loading/.test(sum);
  }, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => {
    const svg = document.querySelector(".wv-minimap > svg");
    const q = (s) => (svg ? svg.querySelectorAll(s).length : 0);
    const imgs = svg ? [...svg.querySelectorAll("image.wv-tg-wash")] : [];
    return {
      mounted: !!svg,
      regions: q("polygon.wv-tg-region"),
      washes: imgs.length,
      washesWithHref: imgs.filter((i) => (i.getAttribute("href") ?? "").startsWith("https://media.postmark.town/")).length,
      washesUnhydrated: q("image.wv-tg-wash[data-wash-for]"),
      polygonsWearing: q("polygon.wv-tg-region[data-wash-of]"),
      polygonsHued: [...(svg ? svg.querySelectorAll("polygon.wv-tg-region") : [])].filter((p) => /^hsl\(/.test(p.getAttribute("fill") ?? "")).length,
      summary: document.querySelector(".wv-tg-wash-sum")?.textContent ?? null,
      lines: [...document.querySelectorAll(".wv-tg-wash-receipt li")].map((li) => li.textContent),
    };
  });
  await page.close();
  return { ...seen, errors, asked };
}

const SKIP = "playwright is absent, so the wash layer is unproven THROUGH THE PAGE: nothing here would notice "
  + "mountRegionWashes being typed and discarded, or a real <image> answering differently from the fake. "
  + "tools/region-wash-layer.test.mjs proves the emitter and the hydrator by hand and nothing more.";

test("THE SHELF ANSWERS → every pointered region's wash is on the ground, hung on a real node, and the receipt counts them drawn", async (t) => {
  if (!chromium) return t.skip(SKIP);
  assert.ok(POINTERED.length >= 12, `the served record carries a wash pointer on the twelve at least (${POINTERED.length})`);
  const g = await readWashes({ shelf: "answers" });
  assert.ok(g.mounted, "a ground is mounted");
  assert.deepEqual(g.errors, [], "the page threw nothing");
  assert.equal(g.regions, REGIONS.length, `every served region is on the ground (${REGIONS.length})`);
  assert.equal(g.washes, POINTERED.length, `one wash <image> per pointered region (${POINTERED.length})`);
  assert.equal(g.washesWithHref, POINTERED.length, "each hung with its shelf url on the real node");
  assert.equal(g.washesUnhydrated, 0, "and none left un-hydrated");
  assert.equal(g.polygonsWearing, POINTERED.length, "each ring polygon names the wash standing on it, paint withdrawn");
  assert.equal(g.polygonsHued, REGIONS.length - POINTERED.length, "and only the pointerless keep the hue");
  assert.equal(g.asked.length, POINTERED.length, `the page asked the shelf exactly once per wash (${g.asked.length})`);
  for (const m of POINTERED) assert.ok(g.asked.includes(regionWashPointer(m)), `${m.id}: its own pointer was fetched`);
  assert.match(g.summary ?? "", new RegExp(`^${POINTERED.length} region washes asked for · ${POINTERED.length} drawn`), `the receipt: ${g.summary}`);
  assert.deepEqual(g.lines, [], "and names nothing as missing");
});

test("THE SHELF IS DEAD (the pending-upload state) → no wash on the ground, no broken glyph, every ring keeps its hue, and the receipt names each one", async (t) => {
  if (!chromium) return t.skip(SKIP);
  const g = await readWashes({ shelf: "dead" });
  assert.ok(g.mounted, "a ground is mounted");
  assert.deepEqual(g.errors, [], "the page threw nothing");
  assert.equal(g.regions, REGIONS.length, "every served region is still on the ground");
  assert.equal(g.washes, 0, "not one wash <image> survives a pointer that did not answer");
  assert.equal(g.polygonsWearing, 0, "no polygon still claims a wash");
  assert.equal(g.polygonsHued, REGIONS.length, "every ring has its hue back — the ground is the 09-08 ground");
  assert.equal(g.asked.length, POINTERED.length, "the page did ask, once per wash");
  assert.match(g.summary ?? "", new RegExp(`^${POINTERED.length} region washes asked for · 0 drawn · ${POINTERED.length} did not answer`), `the receipt: ${g.summary}`);
  assert.equal(g.lines.length, POINTERED.length, "and each is named");
  assert.ok(g.lines.every((l) => /: its pointer did not answer — nothing drawn$/.test(l)), g.lines[0]);
  assert.ok(g.lines.some((l) => /^Evermoon:/.test(l)), "by its own name");
});
