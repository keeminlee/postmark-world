// search-the-town.test.mjs — the search bar: what it finds, and what a hit does
// (2026-09-13).
//
// Keemin: "a search bar as the leftmost top-right button, expanding
// horizontally."
//
// ── WHAT IS WORTH ASSERTING, AND WHAT IS NOT ───────────────────────────────
//
// The ranking is pure and is asked directly. The interesting claims are all
// about the WIRING, and each one is a place a plausible implementation goes
// quietly wrong:
//
//   • a hit calls the same verb a click calls, so a region hit opens the region
//     column and a house hit opens the house column, with no second selection
//     path to drift from the first
//   • a mark with nowhere to go is still selectable — 641 of the record's 1,218
//     marks have no place, and a search that silently dropped them would look
//     complete
//   • a resident hit moves the CAMERA rather than selecting anything
//   • the same query finds a house whether or not anyone is signed in. That is
//     the whole of the townHouses finding: a resident's read carries 29 records,
//     but `loadTownHouses` has already merged all 171 parcels-and-dwellings into
//     `byId`, so houses are findable on both paths. Asserted from both sides
//     rather than believed.
//   • "/" opens the search, and never out of a field somebody is typing in
//
// ── THE CAN-FAIL FLIP ──────────────────────────────────────────────────────
//
// `return [];` at the top of `searchTheTown` — every page test reds, the pure
// test reds first. Run receipt in the lane report.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchTheTown, townRegionMarks } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const markOf = (id) => SERVED.marks.find((m) => m?.id === id);

// ── the pure part ──────────────────────────────────────────────────────────

test("THE ORDER IS THE READER'S LIKELY INTENT, STRONGEST FIRST", () => {
  const marks = [
    { id: "a/lantern-house", name: "The Lantern House", placed: true },
    { id: "b/lanternseed", name: "Lanternseed Gardens", placed: true },
    { id: "c/quiet", name: "A house with lantern in the middle", placed: false },
  ];
  const people = [{ handle: "lantern", name: "Lantern of Somewhere", at: null }];

  // an exact id beats everything, including an exact name
  const exact = searchTheTown({ query: "a/lantern-house", marks, people });
  assert.equal(exact[0].id, "a/lantern-house");
  assert.equal(exact[0].kind, "mark");

  // a name the reader began beats an id they began, which beats a substring
  const begun = searchTheTown({ query: "lantern", marks, people });
  const labels = begun.map((r) => r.kind + ":" + (r.id ?? r.handle));
  assert.ok(labels.indexOf("person:lantern") < labels.indexOf("mark:c/quiet"),
    "a name beginning with the query must outrank a name merely containing it: " + JSON.stringify(labels));
  assert.ok(labels.includes("mark:c/quiet"), "a substring match is still a match");

  // the cap is the cap, and an empty query is not a search
  assert.equal(searchTheTown({ query: "lantern", marks, people, limit: 2 }).length, 2);
  assert.deepEqual(searchTheTown({ query: "   ", marks, people }), []);
  assert.deepEqual(searchTheTown({}), []);

  // a mark with no name at all is still findable by its id — which is the normal
  // case on this record, where ZERO of 1,218 marks carry a name field
  const nameless = searchTheTown({ query: "solo", marks: [{ id: "x/solo", name: "" }], people: [] });
  assert.equal(nameless.length, 1);
  assert.equal(nameless[0].label, "x/solo", "a nameless mark falls back to its id for the label");

  // ties do not reshuffle between keystrokes
  const tied = searchTheTown({ query: "lan", marks: [
    { id: "z/one", name: "Lan Beta" }, { id: "a/two", name: "Lan Alpha" }] , people: [] });
  assert.deepEqual(tied.map((r) => r.label), ["Lan Alpha", "Lan Beta"]);
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

// real ids from the record this rig serves
const HOUSE_Q = "chez-antoine";                       // berthillon/chez-antoine, a parcel
const HOUSE_ID = "berthillon/chez-antoine";
const REGION_ID = "limen/the-threshold-district";
const REGION_Q = "the-threshold-district";
const PLACELESS_ID = "the-town/resident";             // kind class, at null
const PERSON = { handle: "rig-person", x: 1200, y: -800 };
// the skeleton's own registration, the same numbers the viewer parses
const ORIGIN_PX = { x: 485, y: 760 }, M_PER_PX = 5;
const PERSON_PX = { x: ORIGIN_PX.x + PERSON.x / M_PER_PX, y: ORIGIN_PX.y + PERSON.y / M_PER_PX };

const STANDPOINT = { x: 221, y: 95.5 };
const READ = {
  handle: "berthillon",
  standpoint: { ...STANDPOINT, name: "the rig's standpoint" },
  within: [],
  nearby: [],
  // the ground set a real read carries — without it townGround refuses and no
  // map mounts at all (learned the hard way in tools/mine-stands-out.test.mjs)
  records: Object.fromEntries(townRegionMarks(SERVED.marks).map((m) => [m.id, m])),
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
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: ["berthillon"] });
    if (url.pathname === "/world/my-marks") {
      return send({ drafts: [], docket: [], published: [], backed: [],
        counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    }
    if (url.pathname === "/world/apex") return send(READ);
    // one body out today, so the person branch has somebody to centre on
    if (url.pathname === "/world/walkers") {
      return send({ at: 187.5, walkers: [{ handle: PERSON.handle, x: PERSON.x, y: PERSON.y, standing: true }], standing: [] });
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
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
  rig = booted[0];
  office = booted[1];
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function openPage({ signedIn = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
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
  await page.waitForTimeout(4000);
  return { page, errors };
}

/** type a query into the open search and read the rows it offers */
async function search(page, query) {
  await page.click(".wv-search-open");
  await page.fill(".wv-search-input", "");
  await page.type(".wv-search-input", query, { delay: 8 });
  await page.waitForTimeout(700);
  return page.evaluate(() => ({
    open: document.querySelector(".wv-search")?.classList.contains("is-open") ?? false,
    hits: [...document.querySelectorAll(".wv-search-hit")].map((b) => ({
      kind: b.dataset.kind, key: b.dataset.hit,
      label: (b.childNodes[0]?.textContent ?? "").trim(),
    })),
    none: (document.querySelector(".wv-search-none")?.textContent ?? "").trim(),
  }));
}
const clickHit = async (page, key) => {
  await page.click(`.wv-search-hit[data-hit="${key.replace(/"/g, '\\"')}"]`);
  await page.waitForTimeout(1400);
};
const readState = (page) => page.evaluate(() => {
  const col = document.querySelector(".wv-homecol");
  const vb = (document.querySelector(".wv-minimap > svg")?.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  return {
    selected: document.querySelector(".is-mark-selected[data-id]")?.getAttribute("data-id") ?? null,
    columnOpen: !!col && !col.hidden,
    kicker: col?.querySelector(".wv-homecol-kicker")?.textContent?.trim() ?? null,
    title: col?.querySelector(".wv-homecol-title")?.textContent?.trim() ?? null,
    centre: vb.length === 4 ? { x: vb[0] + vb[2] / 2, y: vb[1] + vb[3] / 2 } : null,
    searchOpen: document.querySelector(".wv-search")?.classList.contains("is-open") ?? false,
  };
});

const skipReason = "playwright is absent, so the search bar's whole wiring goes unguarded: "
  + "no unit test can tell which verb a hit called, nor whether a house is findable when signed in.";

test("A HIT DOES WHAT A CLICK DOES — a house opens its column, a region opens the region column", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage();

  const house = await search(page, HOUSE_Q);
  assert.ok(house.hits.some((h) => h.key === HOUSE_ID),
    "the house was not found by name: " + JSON.stringify(house.hits) + " / " + house.none);
  await clickHit(page, HOUSE_ID);
  const afterHouse = await readState(page);
  // ⚑ THE COLUMN, NOT A TELLING CELL. `is-mark-selected` is toggled on CELLS,
  // and the Telling holds 14 of the record's 1,218 marks — so a house with no
  // cell is correctly selected and carries no such class. Asserting on it reds a
  // working hit, which is what the first run of this file did.
  assert.ok(afterHouse.columnOpen, "a house hit must open its column, as a click on it does");
  assert.ok(afterHouse.title, "the column opened on nothing: " + JSON.stringify(afterHouse));
  assert.ok(!afterHouse.searchOpen, "the search stayed open over the thing it just opened");

  // A REGION IS A PLACED MARK LIKE ANY OTHER, so the same verb opens the region
  // column — the reviewer asked for this to be said out loud.
  const region = await search(page, REGION_Q);
  assert.ok(region.hits.some((h) => h.key === REGION_ID),
    "the region was not found: " + JSON.stringify(region.hits));
  await clickHit(page, REGION_ID);
  const afterRegion = await readState(page);
  assert.ok(afterRegion.columnOpen, "a region hit opened no column");
  assert.equal(afterRegion.kicker, "Region", "a region hit must open the REGION column, not a house's");

  await page.close();
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("A MARK WITH NOWHERE TO GO IS STILL FOUND, AND STILL SELECTABLE", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage();
  const before = await readState(page);
  const found = await search(page, PLACELESS_ID);
  assert.ok(found.hits.some((h) => h.key === PLACELESS_ID),
    "641 of this record's marks have no place; a search that drops them looks complete and is not: "
    + JSON.stringify(found.hits));
  await clickHit(page, PLACELESS_ID);
  const after = await readState(page);
  assert.equal(after.selected, PLACELESS_ID, "a placeless mark was found but could not be selected");
  assert.ok(!after.columnOpen, "a placeless mark has no house column to open");
  assert.deepEqual(after.centre, before.centre, "selecting a placeless mark moved the camera to nowhere");
  await page.close();
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("A RESIDENT HIT MOVES THE CAMERA TO THEIR BODY", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage();
  const before = await readState(page);
  const found = await search(page, PERSON.handle);
  assert.ok(found.hits.some((h) => h.kind === "person" && h.key === PERSON.handle),
    "the resident the office says is out today was not offered: " + JSON.stringify(found.hits));
  await clickHit(page, PERSON.handle);
  const after = await readState(page);
  assert.notDeepEqual(after.centre, before.centre, "a resident hit did not move the camera at all");
  // where they actually are, in the painting's own units
  assert.ok(Math.abs(after.centre.x - PERSON_PX.x) < 2 && Math.abs(after.centre.y - PERSON_PX.y) < 2,
    `the camera moved somewhere else: ${JSON.stringify(after.centre)} wanted ${JSON.stringify(PERSON_PX)}`);
  assert.equal(after.selected, null, "centring on a person must not select a mark");
  assert.ok(!after.columnOpen, "centring on a person must not open somebody's column");
  await page.close();
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("THE SAME HOUSE IS FOUND SIGNED IN — the read is 29 records, the houses are all there", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage({ signedIn: true });
  const found = await search(page, HOUSE_Q);
  assert.ok(found.hits.some((h) => h.key === HOUSE_ID),
    "a signed-in reader could not find a house the town has: this is the townHouses claim failing, "
    + "and it means search is only as wide as the read. offered: " + JSON.stringify(found.hits)
    + " / " + found.none);
  await clickHit(page, HOUSE_ID);
  const after = await readState(page);
  assert.ok(after.columnOpen && after.title,
    "the house was found signed in but the hit did not open it: " + JSON.stringify(after));
  await page.close();
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("SLASH OPENS THE SEARCH, AND NEVER OUT OF SOMEBODY'S SENTENCE", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openPage();

  // from the painting, "/" opens it
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("/");
  await page.waitForTimeout(400);
  assert.ok((await readState(page)).searchOpen, "\"/\" did not open the search from the painting");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  assert.ok(!(await readState(page)).searchOpen, "Escape did not close the search");

  // …and from inside a field it does not. The field is injected because the
  // guard is about ANY focused input and this rig has no say box open; what is
  // being asserted is the rule, which reads `document.activeElement`.
  await page.evaluate(() => {
    const i = document.createElement("input");
    i.id = "rig-someones-sentence";
    document.body.appendChild(i);
    i.focus();
  });
  await page.keyboard.press("/");
  await page.waitForTimeout(400);
  const after = await readState(page);
  assert.ok(!after.searchOpen, "\"/\" yanked the cursor out of a field someone was typing in");
  const typed = await page.evaluate(() => {
    const i = document.getElementById("rig-someones-sentence");
    const v = i.value; i.remove(); return v;
  });
  assert.equal(typed, "/", "the slash must reach the field the reader was typing in");
  await page.close();
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});
