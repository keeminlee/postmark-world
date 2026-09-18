// lately-more-on-the-page.test.mjs — the Lately rail's "more" and its kind
// chips, asked of a real page (POS-90, #2846, 2026-09-18).
//
// The arithmetic is proved without a browser in
// `tools/lately-pages-and-filters.test.mjs`, including the `[falsifier]`. This
// file answers the three questions that arithmetic cannot:
//
//   1. does pressing "more" twice actually put 42 rows on the rail, newest
//      first and each of them once — or does the pane re-render from the top,
//      or lose the reader's pages at the next arrival?
//   2. does choosing a kind leave only that kind on the rail?
//   3. when a page runs past a SOURCE's bound rather than the record's, does
//      the page go back to the door with a wider window — or does it tell the
//      reader the town stopped happening a fortnight ago?
//
// The rig is the sibling's, borrowed wholesale: the real viewer served by the
// real `spectator/server.mjs`, a stub office on its own port, the atlas
// unreachable. Its header (`lately-reads-the-store.test.mjs`) carries the
// reasoning for why a page rig is the only thing that can answer a wiring
// question; this file does not restate it.
//
// THE STUB'S WALK DOOR HONOURS `since`, which is the whole of question 3: the
// window is a real filter here, so a page that never widens it can only ever
// see the fortnight's worth of departures.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Where a shot goes when one is asked for. Off the tree by default — session
// paperwork belongs in the day docs, never in the repo (and `SHOT_DIR` is how
// the lane's own run put one there).
const SHOT_DIR = process.env.LATELY_SHOT_DIR ?? "";

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
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* already gone */ } } });

// ── WHAT THE STUB OFFICE HOLDS ─────────────────────────────────────────────

const NOW = new Date();
const ago = (days, hours = 12) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000);

// 60 departures over 40 days, one per handle per day so the ledger's
// latest-per-resident-per-day rule collapses nothing: 20 of them inside a
// fortnight, 40 older. A page that never widens the window can reach 20 walks
// and no more, which is what question 3 is.
const WALKS_INSIDE = 20, WALKS_OLDER = 40;
const ALL_WALKS = Array.from({ length: WALKS_INSIDE + WALKS_OLDER }, (_, i) => {
  const daysBack = i < WALKS_INSIDE ? i * 0.6 : 14.5 + (i - WALKS_INSIDE) * 0.6;
  return {
    iso: ago(daysBack).toISOString(),
    handle: `rig-walker-${String(i).padStart(2, "0")}`,
    from: { x: 0, y: 0 }, toward: { x: 100 + i, y: -200 - i }, at: 100 + i,
    within: null, to: null, pace: null, line: null,
    era: "movement-store", act_id: String(9000 + i), line_derived: true,
  };
});

// 24 stake commits, in the office's `/repo/log` body shape. Only the subjects
// that match `STAKE_SUBJECT` become rows, so two unrelated commits ride along
// to prove the parser is still the parser.
const STAKE_COMMITS = [
  ...Array.from({ length: 24 }, (_, i) => ({
    sha: "s".repeat(7) + i,
    date: ago(1 + i * 0.4, 3).toISOString(),
    author: "rig",
    subject: `stake: rig-backer-${String(i).padStart(2, "0")} -> world-mark/rig-house/mark-${i} · ${2 + i}`,
  })),
  { sha: "nope001", date: ago(2).toISOString(), author: "rig", subject: "settlement: sweep 3 published" },
  { sha: "nope002", date: ago(3).toISOString(), author: "rig", subject: "chore: not a stake at all" },
];

// 8 blessings, so the settlement lane is on the rail too and "all" is genuinely
// four kinds rather than three.
const BLESSINGS = Array.from({ length: 8 }, (_, i) => ({ n: 70 - i, date: ago(i * 1.1, 6).toISOString() }));

/** an office that answers the walk door WITH ITS WINDOW, the stake log and the settlements */
async function bootStubOffice() {
  const port = await freePort();
  const asked = [];
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (req.method !== "OPTIONS") asked.push(url.pathname + url.search);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (body) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/world2/walks") {
      // THE WINDOW IS A REAL FILTER HERE. The live door takes `?since=` as of
      // the w39 train; this stub honours it so that widening the window is the
      // only way the page can see an older departure.
      const since = url.searchParams.get("since") ?? "";
      const walks = ALL_WALKS.filter((w) => w.iso >= since);
      return send({
        what: "the departures the record holds inside the window you asked for, oldest first",
        order: "the record's own append order",
        count: walks.length,
        window: { since, last: null, count_all: ALL_WALKS.length, note: "a window FILTERS; it never re-sorts" },
        evaluated_at: NOW.toISOString(),
        walks,
      });
    }
    if (url.pathname === "/repo/log") {
      // and the door's own clamp, so a page asking for more than 200 is handed 200
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 200);
      return send({ commits: STAKE_COMMITS.slice(0, limit), total: STAKE_COMMITS.length });
    }
    if (url.pathname === "/world/settlements") return send({ current: BLESSINGS[0], recent: BLESSINGS });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port, asked };
}

/** the real viewer, served by the real server, with the atlas unreachable */
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
      if (String(b).includes("localhost:" + port)) { clearTimeout(timer); resolve(); }
    });
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error("the rig exited " + code + " before serving")); });
  });
  return { port, proc };
}

let chromium = null, rig = null, office = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const booted = await Promise.all([bootRig(), bootStubOffice()]);
  rig = booted[0]; office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

// A SPECTATOR, so `allMarks()` is the fold's own marks and the rail carries
// hundreds of rows behind the fourteen. 1500x950 is the width every Lately page
// suite in this repo already reads at.
async function openTheRail() {
  const askedBefore = office.asked.length;
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await page.addInitScript(
    (base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port,
  );
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  // the POS-84 gate: the pane publishes nothing until all three lanes answer
  await page.waitForFunction(() => document.querySelectorAll(".wv-acts .wv-act-line").length > 0,
    null, { timeout: 60_000 });
  return { page, askedSince: () => office.asked.slice(askedBefore) };
}

const readRows = (page) => page.evaluate(() => [...document.querySelectorAll(".wv-acts .wv-act-line")]
  .map((el) => ({
    kind: el.dataset.kind ?? "",
    day: (el.querySelector(".when")?.textContent ?? "").trim(),
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
  })));

async function pressMore(page) {
  await page.waitForSelector(".wv-act-more:not([hidden])", { timeout: 30_000 });
  const before = (await readRows(page)).length;
  await page.click(".wv-act-more");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".wv-acts .wv-act-line").length > n,
    before, { timeout: 30_000 });
}

const skipReason = "playwright is absent, so POS-90's page half goes unguarded: nothing else in this "
  + "repo presses a control in a browser, and `activityFeed` being right says nothing about whether "
  + "the button is wired to it.";

// ═════════════════════════════════════════════════════════════════════════════

test("MORE TWICE IS 42 ROWS — newest first, each of them once", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page } = await openTheRail();

  const first = await readRows(page);
  assert.equal(first.length, 14, "the first page is the fourteen it has always been");

  await pressMore(page);
  assert.equal((await readRows(page)).length, 28, "one press appends a page, it does not widen the cut");

  await pressMore(page);
  const rows = await readRows(page);
  assert.equal(rows.length, 42, "two presses, three pages");

  // THE FIRST FOURTEEN ARE STILL THE FIRST FOURTEEN, in order and word for
  // word. A build that re-renders from the top with a bigger cut can pass the
  // count above and fail this one the moment anything has arrived since.
  assert.deepEqual(rows.slice(0, 14).map((r) => r.text), first.map((r) => r.text),
    "appending must leave the rows the reader is looking at exactly where they were");

  // EACH OF THEM ONCE.
  const seen = rows.map((r) => r.text);
  assert.equal(new Set(seen).size, seen.length,
    "a row was published twice: " + JSON.stringify(seen.filter((t2, i) => seen.indexOf(t2) !== i)));

  // NEWEST FIRST, still — the sort is over the whole list, so a page appended
  // at the foot must never carry a day fresher than the page above it.
  const dayRank = ["today", "yesterday"];
  const rank = (label) => {
    const at = dayRank.indexOf(label);
    if (at >= 0) return at;
    const days = /^(\d+) days ago$/.exec(label);
    return days ? Number(days[1]) : 1000;
  };
  const ranks = rows.map((r) => rank(r.day));
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i] >= ranks[i - 1],
      `row ${i} (${rows[i].day}) is fresher than the row above it (${rows[i - 1].day})`);
  }

  // and every row says which kind it is, which is what the chips filter on
  assert.deepEqual(rows.filter((r) => !r.kind), [], "every row carries its kind");

  if (SHOT_DIR) {
    // Two viewport shots rather than one of the whole section: 42 rows is a
    // 2,400 px element inside a scrolling column, and an element screenshot of
    // it comes back with the unpainted part of the box in it.
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.locator(".wv-activity h2").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOT_DIR, "lately-three-pages-head.png") });
    await page.locator(".wv-act-more").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOT_DIR, "lately-three-pages-foot.png") });
  }
  await page.close();
});

test("A CHOSEN KIND IS THE WHOLE RAIL — and the chips filter before the cut", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page } = await openTheRail();

  const all = await readRows(page);
  // THE PREMISE OF THE TEST, measured rather than assumed: a page of everything
  // is not a page of stakes. If the fixture ever drifts so that the newest
  // fourteen rows ARE the stakes, filtering after the cut would pass too, and
  // this assertion is what says so.
  assert.ok(all.filter((r) => r.kind === "stake").length < 14,
    "the rail's first page is already all stakes — this test cannot tell the two orders apart");

  await page.click('.wv-act-kinds [data-act-kind="stake"]');
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".wv-acts .wv-act-line")];
    return rows.length > 0 && rows.every((el) => el.dataset.kind === "stake");
  }, null, { timeout: 30_000 });

  const stakes = await readRows(page);
  assert.equal(stakes.length, 14, "a page of the chosen kind is a full page of it");
  assert.deepEqual([...new Set(stakes.map((r) => r.kind))], ["stake"]);
  assert.equal(await page.getAttribute('.wv-act-kinds [data-act-kind="stake"]', "aria-pressed"), "true");

  // paging inside a kind: 24 stake commits parse to 24 rows, so one more press
  // is a short second page and the control then goes away
  await pressMore(page);
  const paged = await readRows(page);
  assert.equal(paged.length, 24, "the record's stakes, all of them and no more");
  assert.deepEqual([...new Set(paged.map((r) => r.kind))], ["stake"]);

  // and back to all, which is the reader's way out of a filter
  await page.click('.wv-act-kinds [data-act-kind=""]');
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".wv-acts .wv-act-line")];
    return rows.length === 14 && rows.some((el) => el.dataset.kind !== "stake");
  }, null, { timeout: 30_000 });

  if (SHOT_DIR) {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.click('.wv-act-kinds [data-act-kind="stake"]');
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll(".wv-acts .wv-act-line")];
      return rows.length > 0 && rows.every((el) => el.dataset.kind === "stake");
    }, null, { timeout: 30_000 });
    await page.locator(".wv-activity").screenshot({ path: join(SHOT_DIR, "lately-stakes-only.png") });
  }
  await page.close();
});

test("A PAGE PAST THE FORTNIGHT WIDENS THE WINDOW — it does not report the end of the record", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, askedSince } = await openTheRail();

  // WALKS ONLY, so the rail's total is exactly what the walk door answered and
  // the fortnight's window is the only thing that can stop a page.
  await page.click('.wv-act-kinds [data-act-kind="walk"]');
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".wv-acts .wv-act-line")];
    return rows.length > 0 && rows.every((el) => el.dataset.kind === "walk");
  }, null, { timeout: 30_000 });

  const askedFirst = askedSince().filter((p) => p.startsWith("/world2/walks"));
  assert.ok(askedFirst.length > 0, "the walk door was never asked: " + JSON.stringify(askedSince()));
  const sinceFirst = new URL("http://x" + askedFirst[0]).searchParams.get("since");
  assert.ok(sinceFirst, "the first ask carried no window at all");

  assert.equal((await readRows(page)).length, 14, "a first page of walks");

  // Fourteen shown out of the twenty the fortnight holds: the second page runs
  // past the window, not past the record. A page that answers "there is no
  // more" here is the bug this test exists for.
  await pressMore(page);
  const after = await readRows(page);
  assert.ok(after.length > WALKS_INSIDE,
    `the rail stopped at the window (${after.length} rows, the fortnight holds ${WALKS_INSIDE})`);
  assert.equal(after.length, 28, "and the second page is a full page, from the wider window");
  assert.deepEqual([...new Set(after.map((r) => r.kind))], ["walk"]);

  // THE RECEIPT IS AT THE DOOR: the page went back and asked for an older
  // fortnight. Without this the count above could come from anywhere.
  const askedAll = askedSince().filter((p) => p.startsWith("/world2/walks"));
  const windows = askedAll.map((p) => new URL("http://x" + p).searchParams.get("since"));
  assert.ok(windows.some((w) => w && w < sinceFirst),
    "the walk door was never asked for an older window: " + JSON.stringify(windows));

  // and the stake lane widened to the door's cap in the same press
  const logs = askedSince().filter((p) => p.startsWith("/repo/log"));
  assert.ok(logs.some((p) => /limit=200\b/.test(p)),
    "the stake fetch never reached the door's cap: " + JSON.stringify(logs));

  await page.close();
});
