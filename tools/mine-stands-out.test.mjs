// mine-stands-out.test.mjs — your parcels and your people, told louder than the
// rest of the town (2026-09-13).
//
// Keemin: "we need YOUR residents and their parcels to stand out on the page,
// even at far zoom. let's make them bigger than the others and always 'pinned'
// as if they are clicked (need a similar thing for residents — walk paths
// visible too, from any distance)."
//
// ── THE THREE CLAIMS, AND THE ONE THAT IS EASY TO FAKE ─────────────────────
//
//   1. your parcels draw their CARD at town width, where the town draws beads
//   2. a mark you merely BACKED is not yours and stays a bead
//   3. your household's unfinished walks are drawn, clipped to the painting
//
// (2) is the one a careless implementation gets wrong and no eye would catch:
// `state.mineIds` — the set that decides what is DRAWN — includes backed marks,
// correctly, because a mark you staked is one you should be able to see. It is
// not one you own. Measured on dev: rei backs 22 marks, 19 of them placed. So
// there is a second, narrower set, and this file asserts the difference from
// both sides at once — the owned parcel loud, the backed parcel ordinary, in the
// same page, in the same frame.
//
// ── WHY THE WALK IS SEEDED AND NOT WAITED FOR ──────────────────────────────
//
// Measured on dev while designing this: the office reports 50 walkers out and
// ZERO moving. A test that waits for a real walk waits forever. So the rig
// intercepts `/WORLD/walk-ledger.md` — same-origin by law, `record-sources.mjs`
// gives it no office route — and serves two departures of its own.
//
// Both are dated at a crossing the clock has not reached. That is deliberate and
// it is the only deterministic way to hold a walk in progress: `positionAt`
// takes `elapsed = max(0, now - at)`, so an unreached departure puts the walker
// at its origin with the whole leg ahead and `arrived` false, and it stays that
// way whatever day this test is run. A departure timed in the past would arrive
// within the hour and the file would rot.
//
// The second departure starts at (-94570, -94570) — the real origin the seeding
// gave 28 residents, 133,749 m from a painting 7,500 m across. It is here as the
// ugliest case the clip has to survive, at the reviewer's request.
//
// ── THE CAN-FAIL FLIPS ─────────────────────────────────────────────────────
//
//   `const mine = false;` in homeCard          → claims 1 and 2's first half red
//   `state.ownIds = state.mineIds;`            → claim 2 reds (backed goes loud)
//   `return "";` at the top of walkPathsSVG    → claim 3 reds
//
// Run receipts in docs/2026-09-12/jetto-world-page-report.md.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clipSegmentToBox, MINE_GLYPH_SCALE, townRegionMarks } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));

// Two real parcels from the record this rig serves, both near the town centre so
// both are inside the opening view. One is given to the household as PUBLISHED,
// the other only as BACKED, and the whole of claim 2 is the difference.
const OWNED_ID = "berthillon/chez-antoine";
const BACKED_ID = "histor-reeves/the-gauge-house-parcel";
const markOf = (id) => SERVED.marks.find((m) => m?.id === id);

// ── the pure part, which needs no browser ──────────────────────────────────

test("THE CLIP KEEPS WHAT IS ON THE SHEET AND NOTHING ELSE", () => {
  const box = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  // wholly inside: handed back unchanged
  const inside = clipSegmentToBox({ x: -10, y: -10 }, { x: 10, y: 10 }, box);
  assert.deepEqual(inside, { from: { x: -10, y: -10 }, to: { x: 10, y: 10 } });
  // in from far away: the visible part starts at the edge, not 94 km out
  const crossing = clipSegmentToBox({ x: -94570, y: 0 }, { x: 0, y: 0 }, box);
  assert.equal(Math.round(crossing.from.x), -100, "a walk from off the sheet starts at the sheet's edge");
  assert.equal(Math.round(crossing.to.x), 0);
  // the diagonal the seeding actually recorded, against a painting-shaped box
  const seeded = clipSegmentToBox({ x: -94570, y: -94570 }, { x: -30, y: 40 }, box);
  assert.ok(seeded, "the seeded arrival leg does cross the painting and must be drawn");
  for (const p of [seeded.from, seeded.to]) {
    assert.ok(p.x >= box.minX - 1e-6 && p.x <= box.maxX + 1e-6, "clipped x is on the sheet: " + p.x);
    assert.ok(p.y >= box.minY - 1e-6 && p.y <= box.maxY + 1e-6, "clipped y is on the sheet: " + p.y);
  }
  // wholly outside is a clean nothing, never a degenerate line at the corner
  assert.equal(clipSegmentToBox({ x: -500, y: -500 }, { x: -400, y: -400 }, box), null);
  // a point is not a path
  assert.equal(clipSegmentToBox({ x: 0, y: 0 }, { x: 0, y: 0 }, box), null);
  // nonsense in, nothing out — never NaN coordinates into the markup
  assert.equal(clipSegmentToBox({ x: NaN, y: 0 }, { x: 1, y: 1 }, box), null);
  assert.equal(clipSegmentToBox({ x: 0, y: 0 }, { x: 1, y: 1 }, null), null);
});

test("YOURS IS BIGGER THAN THEIRS, AND NOT BY SO MUCH THAT IT SWALLOWS THEM", () => {
  // the reviewer's constraint, as a number the file can be held to
  assert.ok(MINE_GLYPH_SCALE > 1, "there is no point to a scale that is not a scale");
  assert.ok(MINE_GLYPH_SCALE <= 1.5,
    "a card at town width must not swallow its neighbours — " + MINE_GLYPH_SCALE + " is past an accent");
});

// ── the page ───────────────────────────────────────────────────────────────

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

const MY_HANDLES = ["berthillon", "rig-arrival"];
// A crossing the clock has not reached — see the header. `within` is the
// target's extent, which is what makes arrival a rect entry rather than a point.
const LEDGER = [
  "# the rig's walk ledger",
  "",
  "- 2026-08-09T12:00:00.000Z · berthillon · from 221,95.5 · toward 2600,1900 · at 99999.0000 · within 40,40 · to the-town/the-post-office · pace 15",
  "- 2026-08-09T12:00:00.000Z · rig-arrival · from -94570,-94570 · toward -30,40 · at 99999.0000 · within 9,26 · to the-town/the-post-office · pace 405",
  "",
].join("\n");

// The neighbourhood the read reports, taken from the record this rig serves
// rather than invented: the standpoint's own parcel, the one the household only
// backs, and eight real neighbours so there ARE beads to be louder than. A read
// with an empty `nearby` draws nothing at all, which would make every assertion
// below vacuous — the first run of this file proved that by timing out.
const NEIGHBOURS = [
  "berthillon/chez-antoine",
  "histor-reeves/the-gauge-house-parcel",
  "postmaster/the-waiting-room-parcel",
  "illuminator/the-looking-room-parcel",
  "levi-kieran-ackerman/levi-kieran-ackerman-parcel",
  "kilean/the-east-facing-apartment-parcel",
  "vertas-marginalia/la-lanterne-parcel",
  "jack-astra/the-signal-box-parcel",
  "rei/the-lanternstep-house-parcel",
  "limen/the-threshold-house-parcel",
];
const STANDPOINT = { x: 221, y: 95.5 };
const nearbyRows = NEIGHBOURS.map((id) => markOf(id)).filter(Boolean).map((m) => ({
  id: m.id, at: m.at, kind: m.kind, tier: m.tier,
  distance_m: Math.round(Math.hypot(m.at.x - STANDPOINT.x, m.at.y - STANDPOINT.y)),
  bearing: "N",
}));
const READ = {
  handle: "berthillon",
  standpoint: { ...STANDPOINT, name: "the rig's standpoint" },
  within: [],
  nearby: nearbyRows,
  // ── AND THE GROUND SET, BECAUSE A REAL READ CARRIES IT ──────────────────
  //
  // `townGround` builds the painting's floor from `allMarks()`, which on the
  // resident path IS the read's records — and it refuses a set with no region
  // rings in it: "not one of the record's 13 regions carries a ring in the marks
  // handed in (5 marks)". That is what the first runs of this file hit, and the
  // page said so plainly in the minimap box while every assertion here read an
  // empty DOM. The office's own read carries the rings for exactly this reason,
  // so the fixture carries them too, taken from the record the rig serves.
  records: Object.fromEntries([
    ...townRegionMarks(SERVED.marks),
    ...NEIGHBOURS.map((id) => markOf(id)),
  ].filter(Boolean).map((m) => [m.id, m])),
  telling: "The rig's air is clear.",
  present: { residents: [] },
};

async function bootStubOffice() {
  const port = await freePort();
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: MY_HANDLES });
    if (url.pathname === "/world/my-marks") {
      // the whole of "yours": one parcel published, one merely backed
      return send({
        drafts: [], docket: [],
        published: [markOf(OWNED_ID)].filter(Boolean),
        backed: [markOf(BACKED_ID)].filter(Boolean),
        counts: { drafts: 0, docket: 0, published: 1, backed: 1 }, complete: true,
      });
    }
    if (url.pathname === "/world/apex") return send(READ);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}

// ── THE ATLAS IS A STUB SHEET HERE, NOT A DEAD PORT (2026-09-13) ───────────
//
// tools/town-ground-page.test.mjs points ATLAS_ORIGIN at a closed port on
// purpose, because its subject is the GENERATED ground and an unreachable atlas
// is what forces it. That is exactly wrong for this file, and the first run
// proved it: the generated ground is built from `world.marks`, and on the
// RESIDENT path there is no fold and therefore no `world` — so with the atlas
// also dead the map never mounted at all, no overlay existed, and every
// assertion here was measuring an empty page. (On dev the real atlas answers,
// which is why the same page draws 81 cards there.)
//
// So the rig serves a sheet of its own: the smallest document `fetchAtlasGround`
// accepts — an `svg#map-svg` with the painting's own 1500x2400 viewBox — and
// nothing else. It carries no text, no images and no regions, so nothing in it
// can satisfy an assertion below by accident.
async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body>'
    + '<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400">'
    + '<rect x="0" y="0" width="1500" height="2400" fill="#101418"/>'
    + '</svg></body></html>';
  const srv = createHttp((req, res) => {
    if (req.url.startsWith("/atlas/")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(SHEET);
    }
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
  rig = booted[0];
  office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function openPage({ signedIn }) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  // the ledger is same-origin by law, so the fixture is served here
  await page.route("**/WORLD/walk-ledger.md", (route) =>
    route.fulfill({ status: 200, contentType: "text/markdown", body: LEDGER }));
  await page.addInitScript((base) => { try { localStorage.setItem("pm.office.base", base); } catch {} },
    "http://127.0.0.1:" + office.port);
  if (signedIn) {
    await page.addInitScript(() => { try { localStorage.setItem("pm_key", "rig-key-not-a-secret"); } catch {} });
    await page.addInitScript(() => { try { localStorage.setItem("pm.world.act_as", "berthillon"); } catch {} });
  }
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(6000);
  return { page, errors };
}

const read = (page, owned, backed) => page.evaluate(([own, back]) => {
  const svg = document.querySelector(".wv-minimap > svg");
  const vb = (svg?.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const q = (id, sel) => document.querySelector(`#wv-overlay ${sel}[data-id="${CSS.escape(id)}"]`);
  const scaleGroupOf = (id) => {
    const el = q(id, ".ov-home") ?? q(id, ".ov-glyph");
    return el ? (el.closest(".ov-s")?.getAttribute("class") ?? "(no ov-s)") : null;
  };
  const paths = [...document.querySelectorAll("#wv-walk-layer .wv-walk-path")].map((l) => ({
    handle: l.getAttribute("data-handle"),
    x1: Number(l.getAttribute("x1")), y1: Number(l.getAttribute("y1")),
    x2: Number(l.getAttribute("x2")), y2: Number(l.getAttribute("y2")),
  }));
  return {
    tier: document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? "-",
    viewBox: vb,
    ownedCard: !!q(own, ".ov-home"), ownedGlyph: !!q(own, ".ov-glyph"), ownedScale: scaleGroupOf(own),
    backedCard: !!q(back, ".ov-home"), backedGlyph: !!q(back, ".ov-glyph"), backedScale: scaleGroupOf(back),
    totalCards: document.querySelectorAll("#wv-overlay .ov-home").length,
    totalGlyphs: document.querySelectorAll("#wv-overlay .ov-glyph").length,
    mineGroups: document.querySelectorAll("#wv-overlay .ov-s.ov-mine").length,
    paths,
  };
}, [owned, backed]);

const skipReason = "playwright is absent, so the whole of 'yours stands out' goes unguarded: "
  + "no unit test can tell a card drawn at town width from a bead, nor an owned parcel from a backed one.";

test("YOUR PARCEL IS PINNED AT TOWN WIDTH — and the one you only BACKED is not", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage({ signedIn: true });
  const seen = await read(page, OWNED_ID, BACKED_ID);
  await page.close();

  assert.equal(seen.tier, "far", "the page must open at town width for this to mean anything");
  assert.ok(seen.totalGlyphs > 0,
    "no house is drawn as a bead at all, so 'yours is not a bead' is unfalsifiable here");

  // CLAIM 1 — yours keeps its card where the town keeps beads
  assert.ok(seen.ownedCard, "your own parcel is not drawing its card at town width");
  assert.ok(!seen.ownedGlyph, "your own parcel is still a bead");
  assert.match(String(seen.ownedScale), /\bov-mine\b/, "your own parcel is not marked as yours");

  // CLAIM 2 — a stake is not ownership, asserted in the same frame
  assert.ok(seen.backedGlyph, "a parcel you only BACKED was promoted: it should still be a bead");
  assert.ok(!seen.backedCard, "a parcel you only BACKED is drawing a card");
  assert.ok(!/\bov-mine\b/.test(String(seen.backedScale)),
    "a parcel you only BACKED is marked as yours: " + seen.backedScale);

  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("YOUR HOUSEHOLD'S WALK IS DRAWN AT TOWN WIDTH, AND STAYS ON THE SHEET", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage({ signedIn: true });
  const seen = await read(page, OWNED_ID, BACKED_ID);
  await page.close();

  assert.ok(seen.paths.length > 0,
    "no walk path was drawn at all, though the ledger the rig served has two unfinished walks");
  const mine = seen.paths.find((p) => p.handle === "berthillon");
  assert.ok(mine, "your own walk is missing: " + JSON.stringify(seen.paths.map((p) => p.handle)));

  // THE CLIP, on the ugliest leg the record actually contains.
  //
  // ⚑ AGAINST THE SHEET, NOT THE VIEWBOX. The svg's `viewBox` is the CAMERA —
  // at this viewport it is 1500x1106 of a 1500x2400 painting, letterboxed to the
  // window — and a route is clipped to the PAINTING, which is the right rule: a
  // path may legitimately run off the top of the screen and still be on the
  // sheet. Asserting against the viewBox reds a correct clip, which is what the
  // first run of this did. The sheet below is the one this rig serves, so the
  // bound is the fixture's own and not a number remembered from somewhere.
  const sheet = { minX: 0, minY: 0, maxX: 1500, maxY: 2400 };
  assert.ok(seen.viewBox.every(Number.isFinite), "the painting never mounted a viewBox at all");
  for (const p of seen.paths) {
    for (const [cx, cy] of [[p.x1, p.y1], [p.x2, p.y2]]) {
      assert.ok(Number.isFinite(cx) && Number.isFinite(cy),
        "a walk path was drawn with a non-finite endpoint: " + JSON.stringify(p));
      assert.ok(cx >= sheet.minX - 1 && cx <= sheet.maxX + 1,
        `${p.handle}'s path leaves the painting sideways at ${cx} (sheet ${sheet.minX}..${sheet.maxX})`);
      assert.ok(cy >= sheet.minY - 1 && cy <= sheet.maxY + 1,
        `${p.handle}'s path leaves the painting vertically at ${cy} (sheet ${sheet.minY}..${sheet.maxY})`);
    }
  }
  // and the seeded 133,749 m arrival leg is the one that proves it: drawn raw it
  // would start 94 km off the sheet
  const arrival = seen.paths.find((p) => p.handle === "rig-arrival");
  assert.ok(arrival, "the off-sheet arrival walk was dropped entirely rather than clipped");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("A SPECTATOR GETS NONE OF IT — no pinned cards, no marked pips, no paths", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage({ signedIn: false });
  const seen = await read(page, OWNED_ID, BACKED_ID);
  await page.close();

  // ⚑ NOT VACUOUSLY. Every assertion below is an ABSENCE, and absences are all
  // true of a page that drew nothing at all — which is exactly the state this
  // rig was in for three runs while the read fixture was incomplete. So the
  // spectator page must first be shown to have drawn a town.
  assert.ok(seen.totalGlyphs + seen.totalCards > 0,
    "the spectator page drew no houses at all, so every absence below is vacuous");

  assert.equal(seen.mineGroups, 0, "a page with no key marked " + seen.mineGroups + " pips as somebody's own");
  assert.equal(seen.paths.length, 0, "a spectator was shown a household's walk paths");
  assert.ok(!seen.ownedCard,
    "the parcel is pinned for a reader who is not signed in — 'yours' leaked to everyone");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});
