// region-column-reads-the-door.test.mjs — the region column reads the office's
// region page, and falls back to the mark when there is none (2026-09-13).
//
// ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
//
// #52 made the region column paint the MARK'S body and say so in the byline,
// because at release/2026-w38 no door served REGION.md whole. Office
// release/2026-w38.1 serves `GET /regions/{slug}` uncapped. Measured on prod
// before a line was written:
//
//   /regions/the-threshold-district  200, description 3,650 chars
//   /regions/the-headland            200, description ""
//   /regions/no-such-region          404
//
// Those are the three cases below, in that order, and they are the whole of the
// behaviour: the page when there is one, the mark when there is not, the mark
// when the office cannot be reached — and never an error where prose should be.
//
// ── WHY IT DRIVES THE PAGE ─────────────────────────────────────────────────
//
// The prose swap happens in three places at once: `regionColumnView` chooses a
// source, `createHomeColumn.open` rebuilds only when the view's KEY changes, and
// the fetch lands after the column is already on screen. A unit test of any one
// of them passes while the reader still sees the mark's words. So the rig taps
// a region on the real map and reads the mounted column, the way
// tools/town-ground-page.test.mjs does for the ground.
//
// THE REGION IS FOUND, NOT NAMED. Most regions sit under a house or a parcel and
// a tap on them raises the "which one?" chooser instead of selecting — measured,
// 8 of 10 in this fixture. Pinning the one that happens to be clear today would
// be a test about the fold's current geometry. Instead the rig taps each region
// in turn and uses the first that opens its column, and says so plainly if none
// does.
//
// ── THE CAN-FAIL FLIP ──────────────────────────────────────────────────────
//
// In `regionColumnView`, ignore the door:
//
//     const page = null;
//
// The first test reds: the column keeps the mark's words and the byline still
// says "from the mark". Run receipt in the lane report.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));

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

// Prose that cannot be confused with anything in the fold, so "the column is
// showing the door's words" is a fact about the source and not a coincidence of
// wording.
const DOOR_PROSE = "STUB DOOR PROSE, which appears in no mark body anywhere in the record.";
const DOOR_NAME = "The Stub Region Page";

// The stub's answer is switched per test; `asked` is the office's own record of
// being consulted, which is what the empty and unreachable cases wait on.
let mode = "page";
let asked = [];

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (req.method !== "OPTIONS") asked.push(url.pathname);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (url.pathname.startsWith("/regions/")) {
      const slug = url.pathname.slice("/regions/".length);
      if (mode === "missing") {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "bounce", defect: "no such region" }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        slug, name: mode === "empty" ? slug : DOOR_NAME, founder: "limen", style: null,
        // the empty case is a real 200 from the office: the region exists and
        // nobody has written its page
        description: mode === "empty" ? "" : `# ${DOOR_NAME}\n\n${DOOR_PROSE}`,
        assets: [], residents: [], residents_total: 3,
      }));
    }
    // every other door is legitimately absent in this rig
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}

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
    proc.stdout.on("data", (b) => { if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port };
}

let chromium = null, rig = null, office = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const booted = await Promise.all([bootRig(), bootStubOffice()]);
  rig = booted[0];
  office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/** open the page, tap the first region whose column opens, and read it */
async function openARegionColumn() {
  asked = [];
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll(".wv-far-art-hit[data-id]").length > 0,
    null, { timeout: 60_000 }).catch(() => {});

  const ids = await page.evaluate(() => [...document.querySelectorAll(".wv-far-art-hit[data-id]")].map((e) => e.getAttribute("data-id")));
  let opened = null;
  for (const id of ids) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const at = await page.evaluate((i) => {
      const e = document.querySelector(`.wv-far-art-hit[data-id="${CSS.escape(i)}"]`);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, id);
    if (!at) continue;
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const isOpen = await page.evaluate(() => {
      const col = document.querySelector(".wv-homecol");
      return !!col && !col.hidden && col.querySelector(".wv-homecol-kicker")?.textContent?.trim() === "Region";
    });
    if (isOpen) { opened = id; break; }
  }
  // the door read is fired the first time the view is built, so by now the stub
  // has either answered or refused; give the repaint its beat either way
  await page.waitForTimeout(2500);
  const read = await page.evaluate(() => {
    const col = document.querySelector(".wv-homecol");
    const txt = (s) => col?.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      open: !!col && !col.hidden,
      kicker: txt(".wv-homecol-kicker"),
      title: txt(".wv-homecol-title"),
      meta: txt(".wv-homecol-meta"),
      byline: txt(".wv-homecol-byline"),
      body: (col?.querySelector(".wv-homecol-body")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      note: txt(".wv-homecol-note"),
    };
  });
  await page.close();
  const mark = SERVED.marks.find((m) => m?.id === opened) ?? null;
  return { opened, mark, ...read, errors, asked: [...asked] };
}

const skipReason = "playwright is absent, so the region column's THREE SOURCES go unguarded: "
  + "the office's region page, the mark's body when no page is written, and the mark's body when "
  + "the office cannot be reached. No unit test can see which of them the reader is shown.";

test("THE REGION'S OWN PAGE WINS — the door's prose, and the byline drops 'from the mark'", async (t) => {
  if (!chromium) return t.skip(skipReason);
  mode = "page";
  const seen = await openARegionColumn();

  assert.ok(seen.opened,
    "no region column could be opened at all: every region tap raised the chooser or selected nothing,"
    + " so nothing below was measured");
  assert.ok(seen.asked.some((p) => p.startsWith("/regions/")),
    "the column never asked the office for the region page: " + JSON.stringify(seen.asked));

  assert.ok(seen.body.includes(DOOR_PROSE),
    "the column is not showing the door's prose — it shows: " + JSON.stringify(seen.body.slice(0, 160)));
  const markBody = String(seen.mark?.body ?? "").trim();
  if (markBody) {
    assert.ok(!seen.body.includes(markBody.slice(0, 40)),
      "the mark's body is still on screen beside the region's page: " + JSON.stringify(markBody.slice(0, 60)));
  }
  assert.ok(!seen.byline.includes("from the mark"),
    "the words are the region's own page now, so the byline must stop hedging: " + JSON.stringify(seen.byline));
  assert.ok(/own words/.test(seen.byline), "the byline lost its attribution: " + JSON.stringify(seen.byline));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

test("NO PAGE WRITTEN — a 200 with an empty description keeps the mark's words, and says so", async (t) => {
  if (!chromium) return t.skip(skipReason);
  mode = "empty";
  const seen = await openARegionColumn();
  assert.ok(seen.opened, "no region column could be opened at all");
  assert.ok(seen.asked.some((p) => p.startsWith("/regions/")), "the door was never asked");

  assert.ok(!seen.body.includes(DOOR_PROSE), "the door said nothing, so its prose cannot be here");
  const markBody = String(seen.mark?.body ?? "").trim();
  if (markBody) {
    assert.ok(seen.body.includes(markBody.slice(0, 40)),
      "the mark's words should have stood in: " + JSON.stringify(seen.body.slice(0, 160)));
  }
  assert.ok(seen.byline.includes("from the mark"),
    "an unwritten page must not be passed off as the region's own words: " + JSON.stringify(seen.byline));
  // an empty page is not a failure and must not read as one
  assert.ok(!/did not answer/.test(seen.note + seen.body),
    "an unwritten region page was painted as an office failure: " + JSON.stringify(seen.note));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

test("THE OFFICE REFUSES — a 404 falls back to the mark, and paints no error", async (t) => {
  if (!chromium) return t.skip(skipReason);
  mode = "missing";
  const seen = await openARegionColumn();
  assert.ok(seen.opened, "no region column could be opened at all");
  assert.ok(seen.asked.some((p) => p.startsWith("/regions/")), "the door was never asked");

  assert.ok(!seen.body.includes(DOOR_PROSE), "a refused door cannot have supplied prose");
  const markBody = String(seen.mark?.body ?? "").trim();
  if (markBody) {
    assert.ok(seen.body.includes(markBody.slice(0, 40)),
      "a 404 must leave the reader the mark's words, not an empty column: " + JSON.stringify(seen.body.slice(0, 160)));
  }
  assert.ok(seen.byline.includes("from the mark"), "the byline must name the mark: " + JSON.stringify(seen.byline));
  // THE POINT OF THIS CASE. A reader who never asked for a region page must not
  // be shown the office's plumbing when it is missing.
  assert.ok(!/did not answer|404|error/i.test(seen.note),
    "the column painted the office's refusal at the reader: " + JSON.stringify(seen.note));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});
