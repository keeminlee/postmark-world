// first-paint-boot-shape.test.mjs — what a signed-in boot actually asks the
// office for, counted in a browser (POS-87, postmark#2845, 2026-09-17).
//
// Two claims, and they are not the same kind of claim.
//
// ── 1. THE PORTFOLIO ARRIVES IN ONE WAVE (this lane's fix) ────────────────
//
// `tools/portfolio-one-wave.test.mjs` proves the walk itself against a stub
// door. This proves the VIEWER calls it — that `loadMineMarks` in the mount
// closure really hands its pages to `walkMinePages` and really overlaps them,
// through a real boot, a real fetch and a real event loop. An extracted
// function can be correct and unreached; that is the class this file closes.
//
// ── 2. THE PALETTE IS FETCHED ONCE (a premise corrected, not a fix) ───────
//
// #2845 records the palette being fetched TWICE per load, measured on prod on
// 2026-09-15, and the brief asked for an in-flight cache to stop it. On world
// main today the viewer does not do it. `loadActionPalette` has exactly two
// callers: `resolveIdentity`, which boot runs once, and `selectActor`, which is
// reached only from a click handler AND returns at its first line when the
// handle has not changed ("pressing the face you are already wearing does
// nothing", 2026-08-29). So there is no second call in a boot to dedupe, and a
// cache keyed on an unchanged handle would have no case that reaches it.
//
// THIS TEST IS THEREFORE A PIN, NOT A GUARD. It does not protect a fix — it
// records, in a form a reviewer can run, the measurement that says the fix was
// not needed here. It fails if a second palette fetch ever enters the boot,
// which is exactly what prod was reported to be doing.
//
// ── THE FLIPS (each restored byte-identical against the commit) ───────────
//
//   viewer.mjs § walkMinePages — `await fetchPage(offset)` in place of the
//     `pending.shift()` arm            → "ONE WAVE, THROUGH THE VIEWER" reds
//   viewer.mjs § resolveIdentity — a second `loadActionPalette().catch(…)`
//     beside the first                 → "THE PALETTE IS ASKED FOR ONCE" reds
//   viewer.mjs § walkMinePages — the wave pushed as thunks and called at the
//     shift (`pending.push(() => fetchPage(o))`, `await (pending.shift())()`)
//                                      → "ONE WAVE, THROUGH THE VIEWER" reds
//
// THE THIRD FLIP IS THERE BECAUSE THE FIRST ONE IS NOT ENOUGH. Restoring the
// serial await leaves the wave launched as well, so the request COUNT goes
// wrong and the offsets assertion fires before the ordering assertion is ever
// reached — which would leave the ordering claim, the one this file exists for,
// a probe nobody had seen fail. The lazy flip asks for the same six offsets in
// the same order, one at a time, so the offsets assertion stays green and only
// the ordering one reds.
//
// ── NO WALL CLOCK IN THE WAVE'S ARM (postmark#2977) ───────────────────────
//
// This file's wave claim was a margin — the six requests within
// `MY_MARKS_DELAY` of each other, read off request events delivered to node
// over CDP. Its sibling on the unit side carried the same shape and cost the
// keeper an hour's hold on a settlement's bless when a 30 ms bar read 40 ms
// under an operator's 82 GB delete on the same drive. Both arms are now an
// ORDER the rig's own office witnesses: every page of the wave reached the
// office while the office had answered exactly once. The office is used rather
// than the browser's events because a CDP event is timed when node receives
// it, which would leave the harness's scheduling inside the instrument.
//
// Run receipts in docs/2026-09-17/jetto-pos-87-first-paint-report.md.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townRegionMarks, MINE_PAGE_SIZE } from "../spectator/viewer.mjs";

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

const ACTOR = "berthillon";
const STANDPOINT = { x: 221, y: 95.5 };

// 110 published marks, which is six pages of twenty and the household size the
// brief names. They are placed near the standpoint so `residentMineMarks` keeps
// them (a position past the sentinel magnitude is dropped, correctly, and a
// dropped row would make the merged count mean something else here).
const MINE = Array.from({ length: 110 }, (_, i) => ({
  id: `${ACTOR}/rig-parcel-${String(i).padStart(3, "0")}`,
  by: ACTOR, kind: "parcel", tier: 3, body: "a parcel the rig owns",
  at: { x: STANDPOINT.x + (i % 10) * 4, y: STANDPOINT.y + Math.floor(i / 10) * 4 },
  stamps: 0, weight: 0,
}));
const COUNTS = { drafts: 0, docket: 0, published: MINE.length, backed: 0 };
const MY_MARKS_DELAY = 120;   // every page is held open this long — see the header

// `markPage` as the office writes it (src/world.mjs), clamp and all.
function markPage(rows, offset = 0) {
  const start = Math.min(Math.max(Number(offset) || 0, 0), Math.max(rows.length - 1, 0));
  const page = rows.slice(start, start + MINE_PAGE_SIZE);
  const rest = [...rows.slice(0, start), ...rows.slice(start + page.length)].map((m) => m.id);
  return { page, rest };
}

const READ = {
  handle: ACTOR,
  standpoint: { ...STANDPOINT, name: "the rig's standpoint" },
  within: [], nearby: [],
  records: Object.fromEntries(townRegionMarks(SERVED.marks).filter(Boolean).map((m) => [m.id, m])),
  telling: "The rig's air is clear.",
  present: { residents: [] },
  actions: [{ action: "walk", label: "Walk" }],
};

/**
 * The rig's office, which keeps its own book of the portfolio door.
 *
 * `portfolio` records, per `/world/my-marks` request THE OFFICE RECEIVED, how
 * many such requests it had already ANSWERED at that moment. It is the same
 * instrument `tools/portfolio-one-wave.test.mjs` uses on the unit side and it
 * is here for the same reason (postmark#2977): the claim is an order of events,
 * and the office is the one place in this rig that witnesses both halves of it
 * directly. Reading the order off request/response events delivered to node
 * over CDP instead would put the harness's own scheduling in the instrument.
 */
async function bootStubOffice() {
  const port = await freePort();
  const portfolio = { asks: [], answered: 0 };
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: [ACTOR] });
    if (url.pathname === "/world/my-marks") {
      const offset = Number(url.searchParams.get("offset")) || 0;
      const p = markPage(MINE, offset);
      portfolio.asks.push({ offset, answeredWhenAsked: portfolio.answered });
      // held open, so a serial walk and a wave cannot look alike
      return setTimeout(() => {
        portfolio.answered += 1;
        send({
          drafts: [], docket: [], published: p.page, backed: [],
          counts: COUNTS, complete: p.rest.length === 0,
        });
      }, MY_MARKS_DELAY);
    }
    if (url.pathname === "/world/apex") return send(READ);
    if (url.pathname === "/world/present" || url.pathname === "/world/walkers") return send({ residents: [] });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  // the book is per boot, and this office serves several
  const forget = () => { portfolio.asks.length = 0; portfolio.answered = 0; };
  return { port, portfolio, forget };
}

async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body>'
    + '<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400">'
    + '<rect x="0" y="0" width="1500" height="2400" fill="#101418"/></svg></body></html>';
  const srv = createHttp((req, res) => {
    if (req.url.startsWith("/atlas/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(SHEET); }
    res.writeHead(404); res.end("");
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}

async function bootRig(atlasPort) {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort },
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
  const atlas = await bootStubAtlas();
  const booted = await Promise.all([bootRig(atlas.port), bootStubOffice()]);
  rig = booted[0]; office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/** One signed-in boot, with every office request timed. */
async function bootAndWatch() {
  office.forget();   // this office serves every boot; the portfolio book is this one's
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const asked = [];      // { url, at } — WHAT the boot asked for; the office keeps the ORDER
  page.on("request", (r) => asked.push({ url: r.url(), at: Date.now() }));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port);
  await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
  await page.addInitScript((who) => { try { localStorage.setItem("pm.world.act_as", who); } catch {} }, ACTOR);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.waitForTimeout(6000);   // past the walk and everything the boot trails
  await page.close();
  return { asked };
}

const offsetOf = (url) => Number(new URL(url).searchParams.get("offset")) || 0;

const skipReason = "playwright is absent, so the boot's request shape goes unmeasured: "
  + "no unit test can tell one wave from six serial round trips through the real viewer, "
  + "nor count what a boot asks the office for.";

test("ONE WAVE, THROUGH THE VIEWER: the portfolio's pages overlap in a real boot", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { asked } = await bootAndWatch();

  const pages = asked.filter((r) => r.url.includes("/world/my-marks"))
    .map((r) => ({ offset: offsetOf(r.url), at: r.at }))
    .sort((a, b) => a.offset - b.offset);

  assert.deepEqual(pages.map((p) => p.offset), [0, 20, 40, 60, 80, 100],
    "the boot did not ask for exactly the six pages 110 published marks imply");

  // THE CLAIM, AS AN ORDER RATHER THAN A CLOCK (postmark#2977). This block used
  // to assert that the wave's six requests fell within `MY_MARKS_DELAY` of wall
  // clock. That is true of the viewer and also true of the box: the same margin
  // on the unit side read 40 ms under a 30 ms bar and held a settlement's bless
  // for an hour while an operator deleted 82 GB on the keeper's drive. So the
  // rig's office keeps the count instead, and the assertion is an equality with
  // no threshold in it: every page of the wave reached the office while the
  // office had answered EXACTLY ONCE — page one, whose `counts` sized the wave.
  //
  //   more than 1  the pages are waiting on each other; the boot is serial
  //   less than 1  the wave went out before the counts came back, so it was not
  //                sized from them
  //
  // Read at the office and not off the browser's request events, because those
  // reach this process over CDP and arrive on node's event loop — which would
  // put the harness's own scheduling inside the instrument, the exact fault
  // being removed.
  const book = office.portfolio.asks;
  assert.deepEqual(book.map((a) => a.offset).sort((a, b) => a - b), [0, 20, 40, 60, 80, 100],
    "the office did not receive exactly the six pages the browser was seen to ask for");

  for (const ask of book.filter((a) => a.offset >= 20))
    assert.equal(ask.answeredWhenAsked, 1,
      `the page at offset ${ask.offset} reached the office after it had answered ${ask.answeredWhenAsked} times, not once: `
      + (ask.answeredWhenAsked > 1
        ? "the boot is still walking the portfolio serially"
        : "the wave went out before the door's counts arrived, so it was not sized from them"));
});

test("THE PALETTE IS ASKED FOR ONCE IN A BOOT", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { asked } = await bootAndWatch();

  // the palette's own shape: the handle, and nothing else. The resident read
  // asks the same door with `crossing` and `telling=true` and is a different
  // question; counting both together is what makes "twice" easy to believe.
  const palette = asked.filter((r) => {
    if (!r.url.includes("/world/apex")) return false;
    const q = new URL(r.url).searchParams;
    return !!q.get("handle") && q.get("telling") !== "true";
  });

  assert.equal(palette.length, 1,
    `the boot asked the apex for the palette ${palette.length} times — #2845 reports two on prod, and this is the pin that says the viewer on main asks once`);
});
