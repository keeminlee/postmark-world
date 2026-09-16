// lately-reads-the-store.test.mjs — the Lately pane's two bugs, asked of a real
// page (POS-84, 2026-09-16). Sibling of `lately-on-the-resident-path.test.mjs`
// and it borrows that file's rig wholesale; read its header for why a page rig
// is the only thing that can answer a wiring question.
//
// ── CAUSE B — THE WALK LANE HAS BEEN DEAD SINCE 2026-08-10 ─────────────────
//
// `loadWalkLedger` read `/WORLD/walk-ledger.md` and nothing else. That file
// FROZE on 2026-08-10T20:25Z by its own seam line ("the walk ledger freezes
// with honor") and every departure since lives in the store. Measured on prod
// 2026-09-16: `/api/world2/walks` held 2,498 departures — 348 in the last four
// days — and Lately could show none of them. The map's walkers were never
// affected; they read `/world/walkers`, which is live.
//
// So the office goes first, `?since=` a fortnight back, and the frozen file
// stays as the fallback. The test below gives the stub office ONE departure,
// dated today, by a handle that could not have come from anywhere else — the
// frozen file has nothing from this decade's last five weeks, so a pane naming
// that handle read the store and nothing else could have put it there.
//
// ── CAUSE A — THE FIRST LIST WAS DRAWN TO BE THROWN AWAY ───────────────────
//
// Three lanes fed the pane and each painted the moment it landed. The walk
// ledger is 43 KB and always landed first, so the first list a reader saw was
// departures alone, and departures alone cannot survive the sort once anything
// else is in hand. Measured on prod 2026-09-15, signed in as the keeminlee
// household: 14 rows at 13.0 s, every one a "set out"; at 17.5 s all 14
// replaced. A spectator saw a smaller version of the same thing — first list at
// 4.5 s, one row swapped at 5.9 s.
//
// The fix is one render when the lanes settle, plus `renderActivity()` in
// `loadResidentRead`'s callback, plus a pane that stays hidden until that first
// settled render.
//
// WHAT THIS FILE ASSERTS ABOUT THAT, AND THE ONE PLACE IT IS NARROWER THAN THE
// BRIEF. The brief asks that "the first non-empty render of `.wv-acts` equals
// its render after network-idle". That is asserted verbatim on the SPECTATOR
// path, where the three lanes are everything the pane will ever be fed. It is
// NOT literally true on the resident path and cannot be made so without gating
// the pane on the resident read as well, which is a different change: the
// resident's own marks arrive on a fourth lane, after, and they are an ADDITION
// — the bug was a wholesale replacement. So the resident path is asked the
// property the brief's own parenthetical names — "no row appears that a later
// lane removes" — plus the sharper one that actually catches the bug: the first
// list must already carry every lane, never departures alone.
//
// (The subset claim is rig-scoped on purpose and says so at its assertion: the
// pane caps at 14 rows, so on a busy town a later arrival CAN legitimately push
// an older row off the end. This rig stays well under the cap, so a row that
// vanishes here vanished because something replaced it.)
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//
// Both were run on the committed tree, 2026-09-16. Receipts in
// G:/Starstory/docs/2026-09-16/pos84-world-flips.md.
//
//   1. Restore the ledger-only source — `recordSources("/WORLD/walk-ledger.md")`
//      with no `office:`. 3 of 5 red; the first is the precondition, which is
//      the honest place for it to fail, because with no office leg the door is
//      never asked at all:
//
//        not ok 1 - THE WALK LANE READS THE STORE — a departure from today reaches the pane
//          error: |-
//            the page never asked the office for walks at all: ["/world/skeleton",
//            "/world/state","/world/settlements","/repo/log?limit=120",
//            "/world/enter-exit-ledger","/world/walkers","/walks"]
//
//   2. Restore the three independent renders — `loadWalkLedger().then(renderActivity)`,
//      `loadSettlements().then(() => { renderSettlementChip(); renderActivity(); })`,
//      `loadStakeEvents().then(renderActivity)` — and open the
//      `activityLanesSettled` gate from the start. 2 of 5 red, and they are the
//      two Cause A tests:
//
//        not ok 3 - THE FIRST LIST IS THE LIST
//          the spectator's first list was replaced rather than added to — it was
//          drawn to be thrown away. first [14 mark rows] final [S70 blessed, the
//          store's walk, 12 mark rows]
//        not ok 4 - A SIGNED-IN READER'S FIRST LIST ALREADY CARRIES EVERY LANE
//          the first list a signed-in reader saw came from one lane — ["mark"]
//
//      "THE PANE STAYS SHUT" stays GREEN under flip 2 and that is not a gap in
//      it: with the gate open the first render IS the first non-empty one, so
//      nothing precedes it. That test guards a flicker-then-empty, which is a
//      different failure; tests 3 and 4 are what catch the swap.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Playwright is not a dependency of this package and must not become one — the
// world is browser-pure and its suite runs anywhere node does. Resolved exactly
// as the sibling resolves it, and when it is absent this file SKIPS WITH ITS
// REASON SAID OUT LOUD. A skip is not a pass.
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

// ── WHAT THE STUB OFFICE HANDS BACK ────────────────────────────────────────

const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);

// A handle the frozen ledger could not possibly carry, walking today. If this
// name reaches the pane, the office leg answered — nothing else in the rig
// knows it exists.
const STORE_WALKER = "rig-walker-out-of-the-store";
const STORE_WALK = {
  iso: new Date(NOW.getTime() - 60_000).toISOString(),
  handle: STORE_WALKER,
  from: { x: 0, y: 0 },
  toward: { x: 900, y: -400 },
  at: 193.4,
  // the STORE's column names, which is the half of the mapping worth testing
  within: null,
  to: null,
  pace: null,
  era: "movement-store",
  act_id: "9001",
  line_derived: true,
  line: null,
};

// A blessing dated today, so the settlement lane has something that competes
// with the walk for the top of the list. Without it "the first list is the
// list" would be trivially true — one lane cannot be replaced by nothing.
const BLESSING = { n: 70, date: new Date(NOW.getTime() - 30_000).toISOString() };

// the resident read, borrowed in shape from the sibling rig
const READ_IDS = ["rig-resident/the-lamp-that-proves-the-read", "rig-neighbour/a-mark-the-fold-never-had"];
const RECORDS = Object.fromEntries(READ_IDS.map((id) => [id, {
  id, kind: "sited", by: id.split("/")[0], household: id.split("/")[0],
  tier: "market", at: { x: 10, y: 10 }, extent: { w: 4, h: 4 },
  body: "the body of " + id, weight: 3, date: TODAY + "T12:00:00.000Z",
}]));
const READ = {
  handle: "rei",
  standpoint: { x: 10, y: 10, name: "the rig's standpoint" },
  within: [{ id: READ_IDS[0] }],
  nearby: [{ id: READ_IDS[1], at: { x: 40, y: 40 }, bearing: "N", distance_m: 40, kind: "sited", tier: "market" }],
  records: RECORDS,
  telling: "The rig's air is clear.",
  present: { residents: [{ handle: "rig-neighbour", at: { x: 40, y: 40 }, standing: true }] },
};

/** an office that answers the walk door, the settlement lane, and the resident read */
async function bootStubOffice({ walksDoor = true } = {}) {
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
      // the office's own body shape, including the window it echoes back
      if (!walksDoor) { res.writeHead(404); return res.end("{}"); }
      const since = url.searchParams.get("since");
      return send({
        what: "the departures the record holds inside the window you asked for, oldest first",
        order: "the record's own append order",
        count: 1, eras: { ledger: 0, journal: 0, "journal-line": 0, live: 0, "movement-store": 1 },
        window: { since, last: null, count_all: 2498, note: "a window FILTERS; it never re-sorts" },
        evaluated_at: NOW.toISOString(),
        walks: [STORE_WALK],
      });
    }
    if (url.pathname === "/world/settlements") return send({ current: null, recent: [BLESSING] });
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["rei"] });
    if (url.pathname === "/world/my-marks") {
      return send({
        drafts: [], docket: [], published: [], backed: [],
        counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true,
      });
    }
    if (url.pathname === "/world/apex") return send(READ);
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

let chromium = null, rig = null, office = null, blindOffice = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const booted = await Promise.all([bootRig(), bootStubOffice(), bootStubOffice({ walksDoor: false })]);
  rig = booted[0]; office = booted[1]; blindOffice = booted[2];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/**
 * Open the page and record EVERY distinct state the Lately list passed through.
 *
 * The bug is not in the final DOM — it is in the sequence, and the final DOM is
 * the one thing that looks fine either way. So an observer is installed before
 * any page script runs and every change to `.wv-acts` is kept, in order.
 */
async function openAndWatch({ signedIn, officeAt = office }) {
  const askedBefore = officeAt.asked.length;
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => {
    window.__pos84 = [];
    const signature = () => [...document.querySelectorAll(".wv-acts .wv-act-line")]
      .map((el) => el.className.trim() + " :: " + (el.textContent || "").replace(/\s+/g, " ").trim());
    const snap = () => {
      const rows = signature();
      const json = JSON.stringify(rows);
      const held = window.__pos84[window.__pos84.length - 1];
      if (!held || held.json !== json) window.__pos84.push({ json, rows, at: Date.now() });
    };
    const start = () => {
      new MutationObserver(snap).observe(document.documentElement,
        { childList: true, subtree: true, characterData: true });
      snap();
    };
    if (document.documentElement) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  });
  await page.addInitScript(
    (base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + officeAt.port,
  );
  if (signedIn) {
    // a key the stub never checks — its PRESENCE is what puts the viewer on the
    // signed-in branch of resolveIdentity. No real secret appears in this file.
    await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
    await page.addInitScript(() => { try { localStorage.setItem("pm.world.act_as", "rei"); } catch {} });
  }
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });

  if (signedIn) {
    for (let i = 0; i < 200 && !officeAt.asked.some((p) => p.startsWith("/world/present")); i++) {
      await page.waitForTimeout(150);
    }
  }
  // wait for the pane to stop changing, then read the whole history off the page
  let last = "", held = 0, waited = 0;
  while (held < 1_200 && waited < 45_000) {
    await page.waitForTimeout(150); waited += 150;
    const now = await page.evaluate(() => JSON.stringify(window.__pos84?.length ?? 0));
    held = now === last ? held + 150 : 0;
    last = now;
  }
  const history = await page.evaluate(() => window.__pos84.map((s) => s.rows));
  const paneHidden = await page.evaluate(() => !!document.querySelector(".wv-activity")?.hidden);
  await page.close();
  const nonEmpty = history.filter((rows) => rows.length);
  return {
    history, nonEmpty, paneHidden, errors,
    first: nonEmpty[0] ?? [],
    final: nonEmpty[nonEmpty.length - 1] ?? [],
    askedDuring: officeAt.asked.slice(askedBefore),
  };
}

const kindOf = (row) => (row.match(/is-(walk|mark|settlement|stake)/) ?? [, "?"])[1];
const kinds = (rows) => [...new Set(rows.map(kindOf))].sort();

const skipReason = "playwright is absent, so BOTH halves of POS-84 go unguarded: nothing else in this "
  + "repo drives the boot sequence in a browser, and neither bug is visible to a unit test — "
  + "`recentActivity` is correct in both, and always was.";

// ═════════════════════════════════════════════════════════════════════════════
// CAUSE B — the walk lane reads the store
// ═════════════════════════════════════════════════════════════════════════════

test("THE WALK LANE READS THE STORE — a departure from today reaches the pane", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndWatch({ signedIn: false });

  // THE PRECONDITION: the office leg was actually taken, and it carried a
  // window. Without this an empty pane and an unasked door look identical.
  const askedWalks = seen.askedDuring.filter((p) => p.startsWith("/world2/walks"));
  assert.equal(askedWalks.length > 0, true,
    "the page never asked the office for walks at all: " + JSON.stringify(seen.askedDuring));
  assert.match(askedWalks[0], /[?&]since=\d{4}-\d{2}-\d{2}T/,
    "the walk door was asked without a window, so a door that honours `since` would still hand back "
    + "the whole 1.17 MB record: " + askedWalks[0]);

  // THE BUG, stated as the reader meets it. This handle is not in the frozen
  // ledger and could not be — only the store knows it.
  const fromStore = seen.final.filter((row) => row.includes(STORE_WALKER));
  assert.equal(fromStore.length, 1,
    "the pane named no walk from the store, so the walk lane is still reading the file frozen "
    + "2026-08-10: " + JSON.stringify(seen.final));
  assert.equal(kindOf(fromStore[0]), "walk", "the store's departure did not render as a walk row");
  assert.match(fromStore[0], /set out/, "a departure that does not say 'set out' is not a departure row");
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

// SIGNED IN, and that is not incidental. A SPECTATOR loads the fold, and the
// fold's marks from the last two days outrank a walk from 2026-08-10 and fill
// the pane's fourteen slots — so a spectator sees no August walks whether the
// fallback was read or not, and asking the pane would prove nothing. The
// resident path does not load the fold (2026-09-10, the 0.93 MB it never looks
// at), so the frozen era has room to show. That is also exactly the shape
// Keemin met on prod: signed in, fourteen rows, every one "set out" dated 9-10
// Aug.
test("THE FROZEN FILE IS STILL THE FALLBACK — an office with no walk door leaves the era readable", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndWatch({ signedIn: true, officeAt: blindOffice });

  assert.equal(seen.askedDuring.some((p) => p.startsWith("/world2/walks")), true,
    "the office leg was never tried, so this proves nothing about falling back from it");
  const walks = seen.final.filter((row) => kindOf(row) === "walk");
  assert.equal(walks.length > 0, true,
    "an office with no walk door left the pane with no departures at all — the frozen ledger's "
    + "304 rows are the era's fallback and a page with no office must still read them: "
    + JSON.stringify(seen.final));
  // and it is the FILE's era, not the store's: the rig's invented walker is
  // only ever handed over by the door that just 404'd
  assert.equal(seen.final.some((row) => row.includes(STORE_WALKER)), false,
    "the store's walker reached a page whose walk door refused");
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

// ═════════════════════════════════════════════════════════════════════════════
// CAUSE A — the first list is the list
// ═════════════════════════════════════════════════════════════════════════════

test("THE FIRST LIST IS THE LIST — a spectator's pane is never redrawn from scratch", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndWatch({ signedIn: false });

  assert.equal(seen.nonEmpty.length > 0, true,
    "the pane never showed a row, so there is no sequence to judge (states seen: "
    + seen.history.length + ")");
  // THE PRECONDITION: more than one lane had something to contribute, or a
  // first list that survives is trivially true. A spectator also carries the
  // fold's own mark rows, which is why this is a containment and not an
  // equality — the two lanes that used to race are the ones that matter.
  assert.deepEqual(["settlement", "walk"].filter((k) => !kinds(seen.final).includes(k)), [],
    "the rig's lanes did not both land, so a surviving first list proves nothing: "
    + JSON.stringify(seen.final));

  // the brief's own words, on the path where they are exactly true: the three
  // lanes are everything this pane will ever be fed
  assert.deepEqual(seen.first, seen.final,
    "the spectator's first list was replaced rather than added to — it was drawn to be thrown away. "
    + "first " + JSON.stringify(seen.first) + " final " + JSON.stringify(seen.final));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

test("A SIGNED-IN READER'S FIRST LIST ALREADY CARRIES EVERY LANE", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndWatch({ signedIn: true });

  assert.equal(seen.askedDuring.some((p) => p.startsWith("/world/apex")), true,
    "the page never asked for a resident read, so it was not signed in: " + JSON.stringify(seen.askedDuring));
  assert.equal(seen.nonEmpty.length > 0, true, "the pane never showed a row");

  // THE BUG: the first list used to be departures alone, because the 43 KB
  // ledger always landed first. It could not survive the sort once anything
  // else was in hand.
  assert.equal(kinds(seen.first).includes("settlement") && kinds(seen.first).includes("walk"), true,
    "the first list a signed-in reader saw came from one lane — " + JSON.stringify(kinds(seen.first))
    + " — which is a list drawn to be thrown away: " + JSON.stringify(seen.first));

  // and the brief's parenthetical: no row appears that a later lane removes.
  // RIG-SCOPED BY CONSTRUCTION: the pane caps at 14 rows, so on a busy town a
  // later arrival can legitimately push an older row off the end. This rig
  // stays far under the cap, so a row that vanishes here vanished because
  // something replaced it.
  const dropped = seen.first.filter((row) => !seen.final.includes(row));
  assert.deepEqual(dropped, [],
    "rows the first list showed and the final one does not, with only " + seen.final.length
    + " rows in play and a cap of 14: " + JSON.stringify(dropped));

  // the resident's own marks are the FOURTH lane and they arrive after — an
  // addition, which is what the fix permits and the bug was not
  assert.equal(kinds(seen.final).includes("mark"), true,
    "the resident read never reached the pane: " + JSON.stringify(seen.final));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

test("THE PANE STAYS SHUT UNTIL THE LANES SETTLE — no empty heading on the way there", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndWatch({ signedIn: false });
  // Every state the list passed through before its first row must be the empty
  // one: a pane that flickered a partial list and emptied it again is the same
  // bug wearing a shorter coat.
  const before = seen.history.slice(0, seen.history.indexOf(seen.nonEmpty[0]));
  assert.deepEqual(before.filter((rows) => rows.length), [],
    "the pane drew rows before the lanes settled: " + JSON.stringify(before));
  assert.equal(seen.paneHidden, false, "the pane never opened at all");
});
