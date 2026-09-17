// lately-on-the-resident-path.test.mjs — the Lately pane, asked of a page that
// is actually signed in (2026-09-13).
//
// ── WHY A PAGE RIG, WHEN `recentActivity` IS ALREADY UNIT-TESTED ───────────
//
// `tools/viewer-axes.test.mjs` asks `recentActivity` eight ways and every one of
// them passes on the broken build, because the bug is not in that function. It
// is in what `renderActivity` FEEDS it:
//
//     marks: world?.marks ?? data?.worldState?.marks ?? []
//
// `applyWorldLayer` sets BOTH of those to null on the resident path, by design
// and with its reason written beside it, so a signed-in reader is handed the
// empty array. The settlement rows survive (they come from `settleState.recent`)
// and the "wrote" rows vanish — which is exactly the shape Keemin reported:
// Lately showing settlements and no residents. Measured on dev before its office
// went down: spectator 3 settlements + 11 mark rows, signed in as rei 14
// settlements + 0 mark rows.
//
// A function that is handed the wrong argument cannot be caught by testing the
// function. Only the wiring can be asked, and only a mounted DOM can answer —
// the lesson `tools/town-ground-page.test.mjs` was written after and states at
// length. This is that file's sibling for the resident path, which until now no
// test in this repo has ever driven in a browser. Three bugs of this exact class
// are recorded in the viewer's own comments (the 89-card detour, the stale
// `byId` on the way out, and this one); not one of them was visible to a unit
// test.
//
// ── WHAT MAKES THIS THE RESIDENT PATH AND NOT A COSTUME ────────────────────
//
// `onResidentPath()` is `identityResolved() && !isSpectating() && !!state.handle`,
// so the page has to be genuinely signed in. A stub office answers the three
// doors that takes — `/ops/whoami`, `/world/my-marks`, `/world/apex` — and the
// viewer reaches it through `pm.office.base`, which `officeBase()` reads from
// localStorage. Nothing is mocked inside the page: the real viewer makes real
// requests and the real `loadResidentRead` fills `byId` from the answer.
//
// THE READ CARRIES MARKS THE FOLD DOES NOT. Every record below is invented and
// its id is unmistakable, so the central assertion can be a RELATION rather than
// a count: on the resident path every "wrote" row must name a mark THE READ
// carried. That is unsatisfiable by the fold — before the fix there are no mark
// rows at all, and if a later change ever let the town's 1,218 marks leak back
// onto this path the same assertion reds from the other side. A bare count would
// have missed that second failure entirely.
//
// THE PRECONDITION IS THE OFFICE'S OWN RECORD OF BEING ASKED. Before any claim
// is made about the pane, this file proves the read actually landed AND was
// consumed: `mountWalkers` only reaches `/world/present?x=..&y=..` when the read
// is in the cache and carries a standpoint, and the coordinates in that URL are
// the ones THIS FIXTURE invented. A stub asked for the standpoint it made up is
// not a thing a spectator page, or a resident page whose read failed, can
// produce. A falsifier that cannot tell "the fix is wrong" from "the read never
// arrived" is not measuring the fix — and on the first run of this file that is
// exactly what the precondition caught.
//
// (The first draft waited for a WALKER to be drawn instead. It cannot be: this
// rig runs with the atlas unreachable, `drawWalkers` returns immediately without
// a mounted map, and the wait simply timed out — a precondition that fails for a
// reason unrelated to the thing under test. The office's record needs no map.)
//
// ── THE CAN-FAIL FLIP ──────────────────────────────────────────────────────
//
// In `renderActivity`, restore the old source:
//
//     marks: world?.marks ?? data?.worldState?.marks ?? [],
//
// The signed-in test reds on "showed NO mark rows". Run receipt in
// docs/2026-09-12/jetto-world-page-report.md § Piece 10.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Playwright is not a dependency of this package and must not become one — the
// world is browser-pure and its suite runs anywhere node does. Resolved the same
// way tools/town-ground-page.test.mjs resolves it, and when it is absent this
// file SKIPS WITH ITS REASON SAID OUT LOUD. A skip is not a pass: the message
// names exactly what goes unguarded.
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

// ── THE READ THE STUB OFFICE HANDS BACK ────────────────────────────────────
// Three records with ids that could not have come from anywhere else, dated
// today so they are the most recent thing the pane could possibly show.
const TODAY = new Date().toISOString().slice(0, 10);
const READ_IDS = [
  "rig-resident/the-lamp-that-proves-the-read",
  "rig-resident/the-second-witness",
  "rig-neighbour/a-mark-the-fold-never-had",
];
const RECORDS = Object.fromEntries(READ_IDS.map((id) => [id, {
  id, kind: "sited", by: id.split("/")[0], household: id.split("/")[0],
  tier: "market", at: { x: 10, y: 10 }, extent: { w: 4, h: 4 },
  body: "the body of " + id, weight: 3, date: TODAY + "T12:00:00.000Z",
}]));
const WALKER_HANDLE = "rig-neighbour";
const READ = {
  handle: "rei",
  standpoint: { x: 10, y: 10, name: "the rig's standpoint" },
  within: [{ id: READ_IDS[0] }],
  nearby: READ_IDS.slice(1).map((id) => ({
    id, at: { x: 40, y: 40 }, bearing: "N", distance_m: 40, kind: "sited", tier: "market",
  })),
  records: RECORDS,
  telling: "The rig's air is clear.",
  // who else is about — the precondition signal. Excludes the reader by
  // construction, exactly as the office builds it.
  present: { residents: [{ handle: WALKER_HANDLE, at: { x: 40, y: 40 }, standing: true }] },
};

/** the smallest office that can make `onResidentPath()` true */
async function bootStubOffice() {
  const port = await freePort();
  const asked = [];
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    if (req.method !== "OPTIONS") asked.push(url.pathname + url.search);
    // the page and the office are different origins here, so the browser
    // preflights anything carrying an Authorization header
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (body) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["rei"] });
    if (url.pathname === "/world/my-marks") {
      return send({
        drafts: [], docket: [], published: [], backed: [],
        counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true,
      });
    }
    if (url.pathname === "/world/apex") return send(READ);
    // every other door is legitimately absent here; the viewer treats a miss as
    // silence and the page must still be correct without them
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
  rig = booted[0];
  office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

/** open the page, optionally signed in, and read the Lately pane off the DOM */
async function openAndRead({ signedIn }) {
  const askedBefore = office.asked.length;   // this page's own doors, not the file's
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(
    (base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port,
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
    // THE PRECONDITION, waited on rather than assumed: the office's own record of
    // being asked for the standpoint this fixture invented. Asserted below, where
    // it can say what it means.
    await page.waitForFunction(() => true, null, { timeout: 1_000 }).catch(() => {});
    for (let i = 0; i < 200 && !office.asked.some((p) => p.startsWith("/world/present")); i++) {
      await page.waitForTimeout(150);
    }
    // Under the complete suite's browser load, `/world/present` can be requested
    // before the resident records reach the Lately pane. A quiet fold is not a
    // settled resident render: wait for this fixture's unmistakable row before
    // applying the general "stopped changing" test below. If the resident path
    // is broken, the wait expires and the existing assertions still red.
    for (let i = 0; i < 200; i++) {
      const sawReadMark = await page.evaluate((ids) => [...document.querySelectorAll(".wv-acts .wv-act-line.is-mark [data-id]")]
        .some((e) => ids.includes(e.getAttribute("data-id"))), READ_IDS);
      if (sawReadMark) break;
      await page.waitForTimeout(150);
    }
  }
  // the pane is written on the render spine; wait for it to stop changing
  const shape = () => page.evaluate(() => [
    document.querySelectorAll(".wv-acts .wv-act-line").length,
    document.querySelectorAll(".wv-acts .wv-act-line.is-mark").length,
  ].join("/"));
  let last = await shape(), held = 0, waited = 0;
  while (held < 900 && waited < 45_000) {
    await page.waitForTimeout(150); waited += 150;
    const now = await shape();
    held = now === last ? held + 150 : 0;
    last = now;
  }
  const seen = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".wv-acts .wv-act-line")];
    const subjectOf = (e) => e.querySelector("[data-id]")?.getAttribute("data-id") ?? null;
    return {
      total: rows.length,
      marks: rows.filter((e) => e.classList.contains("is-mark")).length,
      settlements: rows.filter((e) => e.classList.contains("is-settlement")).length,
      walks: rows.filter((e) => e.classList.contains("is-walk")).length,
      // ONLY the "wrote" rows. A walk row also carries a `data-id` — the mark
      // someone set out for — and lumping the two together would assert that
      // the town's own destinations came from this fixture's read, which is
      // neither true nor the claim.
      markSubjects: rows.filter((e) => e.classList.contains("is-mark")).map(subjectOf).filter(Boolean),
    };
  });
  await page.close();
  return { ...seen, errors, askedDuring: office.asked.slice(askedBefore) };
}

const skipReason = "playwright is absent, so the SIGNED-IN Lately pane goes unguarded: "
  + "no other test in this repo drives the resident path in a browser, and the unit tests of "
  + "`recentActivity` stay green on the broken build.";

test("A SIGNED-IN READER'S LATELY SHOWS WHAT THEY WROTE — and every row comes from the read", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndRead({ signedIn: true });

  // THE PRECONDITION FIRST, so a read that never arrived can never be reported
  // as a fix that did not work. `/world/apex` proves the read was fetched;
  // `/world/present` at THIS FIXTURE'S standpoint proves it landed in the cache
  // and was consumed, because that is the only thing that puts those numbers in
  // that URL.
  assert.ok(seen.askedDuring.some((p) => p.startsWith("/world/apex")),
    "the page never asked for a resident read at all, so it was not signed in: "
    + JSON.stringify(seen.askedDuring));
  assert.ok(seen.askedDuring.includes("/world/present?x=10&y=10"),
    "the read never landed — nothing asked the office who was present at the standpoint the read"
    + " carried, so nothing below would mean anything (doors asked: " + JSON.stringify(seen.askedDuring) + ")");

  // THE BUG, stated as the reader meets it
  assert.ok(seen.marks > 0,
    "a signed-in reader's Lately showed NO mark rows: renderActivity was handed the empty array"
    + " (rows " + seen.total + ": settlements " + seen.settlements + ", walks " + seen.walks + ")");

  // and the relation a count alone would miss: the "wrote" rows are the READ's,
  // never the fold's 1,218
  const fromFold = seen.markSubjects.filter((id) => !READ_IDS.includes(id));
  assert.deepEqual(fromFold, [],
    "the resident's pane named marks the read never carried — the fold leaked onto this path: "
    + JSON.stringify(fromFold));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});

test("THE SPECTATOR'S LATELY IS UNTOUCHED — the same pane, no key, still the fold's", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const seen = await openAndRead({ signedIn: false });
  // A page with no key must never take the resident path at all…
  assert.deepEqual(seen.askedDuring.filter((p) => p.startsWith("/world/apex") || p.startsWith("/world/present")), [],
    "a spectator asked the resident doors: " + JSON.stringify(seen.askedDuring));
  // …so none of the rig's invented marks can reach it. This is the half of the
  // fix that must NOT change, asserted from the other side.
  const leaked = seen.markSubjects.filter((id) => READ_IDS.includes(id));
  assert.deepEqual(leaked, [],
    "the rig's invented marks reached a page that never signed in: " + JSON.stringify(leaked));
  assert.deepEqual(seen.errors, [], "the page threw: " + seen.errors.join(" | "));
});
