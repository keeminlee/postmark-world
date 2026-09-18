// walk-layer-once.test.mjs — THE WALK LAYER IS WRITTEN ONCE PER DATA CHANGE
// (postmark#2912, Linear POS-113, 2026-09-18).
//
// ── THE INSTANCE ────────────────────────────────────────────────────────────
//
// Keemin, 2026-09-17, prod: the World page's zoom is slow "in Spectator mode in
// general"; a resident act-as is fine. #2910's hoist (world #101) took the
// crossing from 3.9 s to ~0.1 s at 1×, and the POS-109 lane then measured what
// a Vivobook-class machine still pays at a 6× CPU throttle on that page: a
// 1.2–1.9 s freeze at the district crossing and 0.3–0.75 s per wheel tick,
// with the bitmaps swapped for 3 MB changing nothing. The profile put it in
// `drawWalkers`, run THREE times per crossing (the frame pass, the overlay's
// settle rebuild, the 15 s poll), and inside it one containment index per BODY
// per draw, the ledger folded per body, the whole layer torn down and rebuilt
// as new DOM on every wheel tick.
//
// ── WHAT THIS FILE PROVES, one section per commit ───────────────────────────
//
//   (1) the containment index is built ONCE PER DRAW and handed down through
//       walkerPlace → bodyPlace → smallestContainingMark / placeLabel: placing
//       N bodies with one index reads the record a constant number of times,
//       and answers exactly what the per-body build answered.
//   (2) the per-tick helpers are memoised on their DATA, not the frame: the
//       occupancy fold is taken once per ledger (and again only when the clock
//       passes an act, or the ledger is not chronological), the vessel set once
//       per marks array — a second ask iterates neither — and both answer what
//       a fresh fold answers.
//   (3) on the page, a wheel tick with no data change touches no walker DOM
//       (the nodes are the same objects; the layer's camera variable moved),
//       and a walkers answer that moved a body writes the layer exactly once.
//   (4) one draw per crossing: a poll that answers the same rows writes
//       nothing, and a district crossing writes the layer once — on the settle
//       — with the poll after it writing nothing more.
//   (5) the act-as body (Keemin, 2026-09-18): its face at every tier, the far
//       tier included, one class of its own (`is-actor`), the ring the rail's
//       amber at a heavier stroke with a halo; a household sibling keeps
//       `is-mine` and the empty frame; the dot yields to the drawn body.
//
// `markIndex` is not exported, so the count is taken where it is visible: a
// plain array becomes an index only through `marks.filter(...)`, and a Proxy
// over the fixture counts every read of `filter` (the instrument
// containment-index-once.test.mjs already keeps).
//
// Flips: (1) in smallestContainingMark, `const own = ... ? index : ...` →
// `const own = containmentIndex(marks, { insideRoomId })` — the handed index
// is ignored and the reads climb with the bodies. (2) in foldedOccupancy,
// `if (fold && fold.n === n) return fold;` removed — every ask folds again;
// in vesselHandles, `if (known) return known;` removed — every ask scans.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bodyPlace, placeLabel, containmentIndex, smallestContainingMark, WORLD_ROOT_ID,
  standpointOccupancy, vesselHandles, sameWalkers, walkerFrameSVG, townRegionMarks,
} from "../spectator/viewer.mjs";

// a record shaped like the town's: a root, a parcel, a house on it, a room in
// the house, a bench, a carried thing at the point, and a tail of predicated
// marks — some hung off the house (embodied, so NOT ambient), some off the root
function fixture(predicated = 40) {
  const marks = [
    { id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } },
    { id: "town/the-parcel", kind: "parcel", at: { x: 100, y: 100 }, extent: { w: 40, h: 40 } },
    { id: "town/the-house", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 12, h: 12 } },
    { id: "town/the-parlor", kind: "sited", class: "portal-ground", at: { x: 100, y: 97 }, extent: { w: 10, h: 4 } },
    { id: "town/the-bench", kind: "sited", at: { x: 100, y: 100 }, extent: { w: 2, h: 2 } },
    { id: "town/the-top", kind: "sited", class: "thing", at: { x: 100, y: 100 }, extent: { w: 1, h: 1 } },
    { id: "town/the-far-parcel", kind: "parcel", at: { x: 900, y: 900 }, extent: { w: 30, h: 30 } },
  ];
  for (let i = 0; i < predicated; i++) {
    marks.push({
      id: `town/p-${i}`, kind: "predicated",
      parent: i % 2 ? "town/the-house" : WORLD_ROOT_ID,
      at: { x: 100, y: 100 }, extent: { w: 1 + (i % 7), h: 1 + (i % 5) },
    });
  }
  return marks;
}
const countingFilter = (marks) => {
  let reads = 0;
  const proxy = new Proxy(marks, { get(t, k, r) { if (k === "filter") reads += 1; return Reflect.get(t, k, r); } });
  return { proxy, reads: () => reads };
};
const acts = [{ handle: "rei", act: "enters", mark: "town/the-parcel", at: 190.9, word: "neutral" }];
const at = 190.95;
const bodies = [
  { handle: "a", x: 100, y: 100 },                                            // on the bench
  { handle: "b", x: 100, y: 97, mark_id: "town/the-house" },                  // in the parlor, arrived at the house
  { handle: "rei", x: 104, y: 104 },                                          // in the house by coordinates, entered the parcel
  { handle: "c", x: 118, y: 118, mark_id: "town/the-house" },                 // on the parcel, at the door of the house
  { handle: "d", x: 5000, y: 5000 },                                          // open ground
  { handle: "e", x: 900, y: 900, moving: true, remaining_m: 12, eta_crossings: 0.1 },
];

test("(1) one index per draw: placing six bodies with one index reads the record as often as placing none", () => {
  const { proxy, reads } = countingFilter(fixture(600));
  const index = containmentIndex(proxy);
  const perIndex = reads();
  assert.ok(perIndex >= 1 && perIndex <= 3, "the index itself reads the record a handful of times: " + perIndex);
  for (const w of bodies) placeLabel(bodyPlace(w, { marks: proxy, acts, at, index }), proxy, {}, { index });
  assert.equal(reads(), perIndex, "six bodies placed through one index must not read the record again — it was read " + (reads() - perIndex) + " more times");
  // and the old way, for contrast: the same six bodies with no index in hand
  const bare = countingFilter(fixture(600));
  for (const w of bodies) placeLabel(bodyPlace(w, { marks: bare.proxy, acts, at }), bare.proxy, {});
  assert.ok(bare.reads() >= perIndex * bodies.length, "without an index every body pays its own: " + bare.reads());
});

test("(1) the answers are the per-body build's, body for body", () => {
  const marks = fixture(40);
  const index = containmentIndex(marks);
  const expected = [
    ["a", "town/the-bench", null, false, "on The Bench's ground"],
    ["b", "town/the-parlor", null, true, "on The Parlor's ground"],
    ["rei", "town/the-house", "town/the-parcel", false, "in The Parcel"],
    ["c", "town/the-parcel", null, false, "on The Parcel's ground, at the door of The House"],
    ["d", null, null, false, "on open ground"],
    ["e", "town/the-far-parcel", null, false, "12 m to go, ETA ≈ 1 h 12 m"],
  ];
  for (const [i, w] of bodies.entries()) {
    const withIndex = bodyPlace(w, { marks, acts, at, index });
    const without = bodyPlace(w, { marks, acts, at });
    assert.deepEqual(withIndex, without, `${w.handle}: the index changed the place`);
    assert.equal(placeLabel(withIndex, marks, {}, { index }), placeLabel(without, marks, {}), `${w.handle}: the index changed the sentence`);
    const [handle, inside, entered, arrived, label] = expected[i];
    assert.equal(w.handle, handle);
    assert.equal(withIndex.inside, inside, `${handle}: inside`);
    assert.equal(withIndex.entered, entered, `${handle}: entered`);
    assert.equal(withIndex.arrived, arrived, `${handle}: arrived`);
    assert.equal(placeLabel(withIndex, marks, {}, { index }), label, `${handle}: the sentence`);
  }
});

test("(1) an index built for another room is not used — the answer is still the room's own", () => {
  const marks = fixture(40);
  const outdoors = containmentIndex(marks);
  // asked inside the house with an OUTDOOR index in hand: the room and what
  // encloses it must still stand aside, so the index is rebuilt, not trusted
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { insideRoomId: "town/the-house", index: outdoors }), null,
    "inside the house, off the bench and the parlor: nothing answers — the outdoor index must not leak the house back in");
  const indoors = containmentIndex(marks, { insideRoomId: "town/the-house" });
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { insideRoomId: "town/the-house", index: indoors }), null);
  assert.equal(smallestContainingMark({ x: 100, y: 100 }, marks, { insideRoomId: "town/the-house", index: indoors }), "town/the-bench");
  assert.equal(smallestContainingMark({ x: 104, y: 104 }, marks, { index: outdoors }), "town/the-house", "…and outdoors the same point is the house");
});

// ── (2) the helpers memoised on their data ──────────────────────────────────

// an instrument over ITERATION: the fold walks the acts with for..of and the
// vessel scan walks the marks the same way, so counting Symbol.iterator reads
// counts the folds and the scans, not the calls
const countingIteration = (list) => {
  let walks = 0;
  const proxy = new Proxy(list, { get(t, k, r) { if (k === Symbol.iterator) walks += 1; return Reflect.get(t, k, r); } });
  return { proxy, walks: () => walks };
};
const ledger = [
  { handle: "rei", act: "enters", mark: "town/the-parcel", at: 190.9, word: "neutral" },
  { handle: "rei", act: "enters", mark: "town/the-house", at: 190.92, word: "neutral" },
  { handle: "wright", act: "enters", mark: "town/the-parcel", at: 191.1, word: "neutral" },
  { handle: "rei", act: "exits", mark: "town/the-house", at: 191.3, word: "neutral" },
];

test("(2) the occupancy fold is taken once per ledger: seventy bodies asked at one clock walk the acts once", () => {
  const { proxy, walks } = countingIteration(ledger);
  const first = standpointOccupancy({ acts: proxy, at: 190.95, handle: "rei" });
  assert.deepEqual(first.entered, ["town/the-parcel", "town/the-house"]);
  assert.equal(first.insideOf, "town/the-house");
  const afterOne = walks();
  assert.ok(afterOne >= 1, "the first ask folds");
  for (let i = 0; i < 70; i++) standpointOccupancy({ acts: proxy, at: 190.95 + i * 1e-6, handle: i % 2 ? "rei" : "wright" });
  assert.equal(walks(), afterOne, "seventy more asks inside the same act window must not fold again — the acts were walked " + (walks() - afterOne) + " more times");
  // the same clock, a different handle: the fold is shared, the handle's view is not
  const wright = standpointOccupancy({ acts: proxy, at: 190.95, handle: "wright" });
  assert.deepEqual(wright.entered, [], "wright has not entered yet at 190.95");
  assert.deepEqual(wright.manifest.get("town/the-parcel"), ["rei"]);
});

test("(2) …and folds again exactly when the clock passes an act, forwards or back, answering what a fresh fold answers", () => {
  const { proxy, walks } = countingIteration(ledger);
  const fresh = (at, handle) => standpointOccupancy({ acts: [...ledger], at, handle });
  const clocks = [190.95, 191.0, 191.2, 191.35, 191.0, 190.0, 195];
  let folds = 0;
  for (const at of clocks) {
    const before = walks();
    const memo = standpointOccupancy({ acts: proxy, at, handle: "rei" });
    if (walks() > before) folds += 1;
    const plain = fresh(at, "rei");
    assert.deepEqual(memo.entered, plain.entered, `at ${at}: entered`);
    assert.equal(memo.insideOf, plain.insideOf, `at ${at}: insideOf`);
    assert.deepEqual([...memo.manifest], [...plain.manifest], `at ${at}: the manifest`);
  }
  // 190.95 (2 acts) · 191.0 (same) · 191.2 (3) · 191.35 (4) · 191.0 (3) · 190.0 (0) · 195 (4)
  assert.equal(folds, 6, "one fold per distinct admitted prefix, none for a clock inside the same window: folded " + folds);
});

test("(2) a ledger that is not chronological is folded on every ask — the prefix rule is checked, never assumed", () => {
  const shuffled = [ledger[2], ledger[0], ledger[3], ledger[1]];
  const { proxy, walks } = countingIteration(shuffled);
  const a = standpointOccupancy({ acts: proxy, at: 190.95, handle: "rei" });
  const n1 = walks();
  const b = standpointOccupancy({ acts: proxy, at: 190.95, handle: "rei" });
  assert.ok(walks() > n1, "an unordered ledger must not be trusted to a prefix: it was not walked again");
  assert.deepEqual(a.entered, b.entered);
  assert.deepEqual(a.entered, standpointOccupancy({ acts: [...shuffled], at: 190.95, handle: "rei" }).entered, "the answer is the plain fold's — the parcel is admitted, the house's entry at 190.92 too");
});

test("(2) the vessel set is scanned once per marks array, and a fresh array is scanned afresh", () => {
  const marks = [
    ...fixture(10),
    { id: "harbour/the-evening-line", kind: "predicated", mechanic: "timetable", timetable: { vessel: "harbour/the-evening-lantern" } },
    { id: "harbour/the-tide-line", kind: "predicated", mechanic: "timetable", timetable: { vessel: "bare-handle" } },
  ];
  const { proxy, walks } = countingIteration(marks);
  const first = vesselHandles(proxy);
  assert.deepEqual([...first].sort(), ["bare-handle", "the-evening-lantern"]);
  assert.equal(walks(), 1);
  for (let i = 0; i < 20; i++) assert.equal(vesselHandles(proxy), first, "the same array answers the same Set");
  assert.equal(walks(), 1, "twenty more asks of one array must not scan it again — scanned " + walks() + " times");
  const again = countingIteration([...marks]);
  assert.deepEqual([...vesselHandles(again.proxy)].sort(), [...first].sort());
  assert.equal(again.walks(), 1, "a fresh array is a fresh scan");
});

// ── (3) ON THE PAGE: a wheel tick touches no walker DOM; a walkers answer writes it once ──
//
// The page rig standpoint-dot-culled.test.mjs keeps: the repo's own spectator
// server serving this tree, a stub atlas sheet, the Spectator path (no key), the
// walkers from `/api/walks` — routed here so the answer can be CHANGED under the
// page. Skips loudly without Playwright.
//
// Flip (3): in frameWork, put `drawWalkers();` back beside drawConversations()
// → the tick writes the layer and every node is new.
import { after, before } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttp } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");
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

async function bootStubAtlas() {
  const port = await freePort();
  const SHEET = '<!doctype html><html><body>'
    + '<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 2400">'
    + '<rect x="0" y="0" width="1500" height="2400" fill="#101418"/>'
    + '</svg></body></html>';
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
    cwd: ROOT, env: { ...process.env, PORT: String(port), ATLAS_ORIGIN: "http://127.0.0.1:" + atlasPort },
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

// the walkers the page is served: a dozen standing residents on real parcels
// (so their places name real ground) and one on the road
const SERVED = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const parcels = (SERVED.marks ?? []).filter((m) => m?.kind === "parcel" && m?.at && m?.household).slice(0, 12);
const walkersAnswer = (moved = 0) => ({
  at: 200.5, now: 200.5,
  walkers: [{ handle: "the-walker", x: 300 + moved, y: 300, moving: true, toward: { x: 900, y: 900 }, remaining_m: 800 - moved, eta_crossings: 0.05, mark_id: null, source: "walk" }],
  standing: parcels.map((p) => ({ handle: p.household, x: p.at.x, y: p.at.y, moving: false, standing: true, source: "parcel" })),
  departures: 1, unrecognized: 0,
});

let chromium = null, rig = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  const atlas = await bootStubAtlas();
  rig = await bootRig(atlas.port);
  browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
  CLEANUP.push(() => browser.close());
});

async function openSpectator() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  const answer = { moved: 0 };
  await page.route("**/api/walks*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(walkersAnswer(answer.moved)) }));
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-minimap svg", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => (document.querySelector("#wv-walk-layer")?.children.length ?? 0) > 0, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  return { page, errors, answer };
}
// the layer as it stands: how many writes so far, its nodes (held by reference
// on the page), the camera's scale variable, and where one body is drawn
const snapshot = (page) => page.evaluate(() => {
  const layer = document.querySelector("#wv-walk-layer");
  window.__held = [...layer.children];
  return {
    writes: window.__pmViewer.walkDraws().layerWrites,
    nodes: layer.children.length,
    mk: layer.style.getPropertyValue("--wv-mk"),
    bodies: document.querySelectorAll("#wv-walk-layer [data-handle]").length,
    walkerAt: document.querySelector('#wv-walk-layer [data-handle="the-walker"]')?.parentElement?.parentElement?.getAttribute("transform") ?? null,
  };
});
const compare = (page) => page.evaluate(() => {
  const layer = document.querySelector("#wv-walk-layer");
  const now = [...layer.children];
  const same = now.length === window.__held.length && now.every((n, i) => n === window.__held[i]);
  return {
    writes: window.__pmViewer.walkDraws().layerWrites,
    nodes: now.length,
    identical: same,
    mk: layer.style.getPropertyValue("--wv-mk"),
    bodies: document.querySelectorAll("#wv-walk-layer [data-handle]").length,
    walkerAt: document.querySelector('#wv-walk-layer [data-handle="the-walker"]')?.parentElement?.parentElement?.getAttribute("transform") ?? null,
  };
});
// one notch of the wheel at the pane's centre, INTO the painting: the tier is
// unchanged and the view stays inside the drawn box, so nothing about the
// walkers' data has moved — only the camera
const wheelNotch = (page, deltaY) => page.evaluate((dy) => {
  const svg = document.querySelector("#map-svg");
  const b = svg.getBoundingClientRect();
  svg.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, cancelable: true }));
  return svg.getAttribute("viewBox");
}, deltaY);

const skipReason = "playwright is absent, so the page half of 'the walk layer is written once per data change' goes unguarded: only the unit halves above are running.";

test("(3) ON THE PAGE: a wheel tick with no data change touches no walker DOM — the nodes are the same objects, the camera variable moved", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openSpectator();
  const before = await snapshot(page);
  assert.ok(before.bodies >= 10, "the fixture must draw bodies for this to mean anything: " + JSON.stringify(before));
  const vb0 = await wheelNotch(page, -120);
  await page.waitForTimeout(600);           // past the 140 ms settle, with room
  const vb1 = await wheelNotch(page, -120);
  await page.waitForTimeout(600);
  const after = await compare(page);
  await page.close();
  t.diagnostic(`before ${JSON.stringify(before)} · after ${JSON.stringify(after)} · viewBox ${vb0} → ${vb1}`);
  assert.notEqual(vb0, vb1, "the wheel must have moved the camera");
  assert.equal(after.writes, before.writes, "two wheel ticks wrote the walk layer " + (after.writes - before.writes) + " times — a tick with no data change must write nothing");
  assert.equal(after.identical, true, "the walk layer's nodes must be the SAME objects after a tick: it was rebuilt");
  assert.notEqual(after.mk, before.mk, "the camera's scale variable on the layer must have moved — that is how the bodies are sized now");
  assert.equal(after.bodies, before.bodies);
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("(3) ON THE PAGE: a walkers answer that moved a body writes the layer ONCE, and the body moved with it", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors, answer } = await openSpectator();
  const before = await snapshot(page);
  answer.moved = 40;                        // the next poll answers a body 40 m along
  // the poll is on a 15 s interval; wait for one to land
  await page.waitForFunction((w) => window.__pmViewer.walkDraws().layerWrites > w, before.writes, { timeout: 20_000 });
  await page.waitForTimeout(1500);          // and let anything that follows it settle
  const after = await compare(page);
  await page.close();
  t.diagnostic(`before ${JSON.stringify(before)} · after ${JSON.stringify(after)}`);
  assert.equal(after.writes, before.writes + 1, "one walkers answer must write the layer exactly once: " + (after.writes - before.writes));
  assert.equal(after.identical, false, "a written layer is new nodes");
  assert.notEqual(after.walkerAt, before.walkerAt, "the moved body is drawn where the answer put it");
  assert.equal(after.bodies, before.bodies);
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

// ── (4) one draw per crossing: neither the poll nor the settle rewrites an unchanged layer ──
//
// Flip (4a): in takeWalkers, `if (sameWalkers(rows, walkState.walkers))` →
// `if (false)` — every poll writes the layer. Flip (4b): in writeWalkLayer,
// `if (markup !== walkState.lastMarkup)` → `if (true)` — the settle after a
// crossing and the poll after it each write it again.

test("(4) sameWalkers: the same rows in the same order are the same answer; a moved body, a new row, a lost row are not", () => {
  const a = [{ handle: "rei", x: 1, y: 2, moving: false }, { handle: "wright", x: 3, y: 4, moving: true, toward: { x: 9, y: 9 } }];
  const b = a.map((r) => ({ ...r, toward: r.toward ? { ...r.toward } : r.toward }));
  assert.equal(sameWalkers(a, a), true);
  assert.equal(sameWalkers(a, b), true, "fresh objects with the same fields are the same answer");
  assert.equal(sameWalkers(a, [b[0], { ...b[1], x: 3.5 }]), false, "a moved body");
  assert.equal(sameWalkers(a, [b[0], { ...b[1], toward: { x: 10, y: 9 } }]), false, "a changed leg");
  assert.equal(sameWalkers(a, [b[0]]), false, "a lost row");
  assert.equal(sameWalkers(a, [...b, { handle: "jetto", x: 0, y: 0 }]), false, "a new row");
  assert.equal(sameWalkers(a, [b[1], b[0]]), false, "reordered rows are a different answer (a redraw, never a stale layer)");
  assert.equal(sameWalkers([], []), true);
  assert.equal(sameWalkers(null, []), false);
});

test("(4) ON THE PAGE: a poll that answers the same rows writes nothing — the nodes are the same objects a poll later", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openSpectator();
  await page.waitForTimeout(3000);           // let the boot's late arrivals (the ledger, the faces) land first
  const before = await snapshot(page);
  const polls0 = await page.evaluate(() => window.__pmViewer.walkDraws().pollsUnchanged);
  await page.waitForFunction((n) => window.__pmViewer.walkDraws().pollsUnchanged > n, polls0, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  const after = await compare(page);
  await page.close();
  t.diagnostic(`before ${JSON.stringify(before)} · after ${JSON.stringify(after)}`);
  assert.equal(after.writes, before.writes, "an unchanged answer wrote the layer " + (after.writes - before.writes) + " times");
  assert.equal(after.identical, true, "the nodes must be the same objects after an unchanged poll");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

test("(4) ON THE PAGE: a district crossing writes the layer ONCE — on the settle — and the poll that lands after it does not write again", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openSpectator();
  await page.waitForTimeout(3000);
  const before = await snapshot(page);
  const near0 = await page.evaluate(() => document.querySelectorAll("#wv-walk-layer .wv-walker-near").length);
  assert.equal(near0, 0, "the page must open at the far tier (empty frames) for a crossing to mean anything");
  // one wheel from the opening width to 874 — inside the district tier
  const dy = await page.evaluate(() => {
    const vb = document.querySelector("#map-svg").getAttribute("viewBox").split(/\s+/).map(Number);
    return Math.log(874 / vb[2]) / Math.log(1.0015);
  });
  await wheelNotch(page, dy);
  await page.waitForTimeout(1500);           // the settle is 140 ms; the faces are drawn on it
  const crossed = await compare(page);
  const near1 = await page.evaluate(() => document.querySelectorAll("#wv-walk-layer .wv-walker-near").length);
  assert.ok(near1 > 0, "the crossing must have drawn faces: " + near1);
  assert.equal(crossed.writes, before.writes + 1, "the crossing wrote the layer " + (crossed.writes - before.writes) + " times — once, on the settle");
  // …and through the next poll
  const polls0 = await page.evaluate(() => window.__pmViewer.walkDraws().pollsUnchanged);
  await page.waitForFunction((n) => window.__pmViewer.walkDraws().pollsUnchanged > n, polls0, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  const later = await compare(page);
  await page.close();
  t.diagnostic(`before ${JSON.stringify(before)} · crossed ${JSON.stringify(crossed)} · later ${JSON.stringify(later)} · faces ${near0} → ${near1}`);
  assert.equal(later.writes, crossed.writes, "the poll after the crossing wrote the layer again");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});

// ── (5) the body you are acting as: its face at every tier, a gold ring, one class ──
//
// Keemin, 2026-09-18: "highlight your Act As resident (pinning it with full
// profile dot even at far) and make the border gold instead of green and a bit
// more prominent, to make it super apparent where you're at."
//
// Flip (5): in drawWalkers' far branch, `actor` → `false` (or drop `is-actor`
// from walkerFrameSVG) → the page test reds: the actor's body is the empty
// frame again and carries no class of its own.

test("(5) walkerFrameSVG: the actor carries is-actor and a halo behind the face; nobody else does; the ring is the stylesheet's one rule, amber, heavier, after is-found", () => {
  const actor = walkerFrameSVG({ at: { x: 10, y: 20 }, handle: "rei", mine: true, actor: true, art: { monogram: "R", color: "#123456" } });
  assert.match(actor, /<g class="wv-walker-near is-mine is-actor" data-handle="rei"/, "the actor is filled, yours, and marked as the actor");
  assert.match(actor, /<circle cx="0" cy="0" r="16" class="wv-walker-halo"\/>/, "a halo disc five units beyond the near frame's rim (11 + 5)");
  assert.ok(actor.indexOf("wv-walker-halo") < actor.indexOf("wv-walker-mono"), "the halo is drawn BEHIND the face");
  assert.ok(actor.indexOf("wv-walker-hit") < actor.indexOf("wv-walker-halo"), "…and inside the hit disc, which stays first");
  const sibling = walkerFrameSVG({ at: { x: 10, y: 20 }, handle: "wright", mine: true, art: { monogram: "W", color: "#123456" } });
  assert.ok(!/is-actor|wv-walker-halo/.test(sibling), "another household handle is yours, not the actor: no class, no halo");
  const stranger = walkerFrameSVG({ at: { x: 10, y: 20 }, handle: "nyx" });
  assert.ok(!/is-actor|wv-walker-halo|is-mine/.test(stranger));
  // the ring: one rule, the rail's amber token (not a new colour), heavier than the found body's 3.5
  const rule = SOURCE.match(/\.wv-walker-far\.is-actor > \.wv-walker-frame,\n\.wv-walker-near\.is-actor > \.wv-walker-frame \{ stroke:var\(--amber\); stroke-width:([\d.]+); \}/);
  assert.ok(rule, "the actor's ring is one stylesheet rule on var(--amber)");
  assert.ok(Number(rule[1]) >= 4 && Number(rule[1]) <= 5, "at a heavier stroke, 4–5: " + rule[1]);
  assert.ok(SOURCE.indexOf(".wv-walker-near.is-found > .wv-walker-frame {") < SOURCE.indexOf(".wv-walker-near.is-actor > .wv-walker-frame {"),
    "stated after .is-found, so a found actor keeps the actor's ring");
  assert.match(SOURCE, /\.wv-walker-halo \{ fill:var\(--amber\); fill-opacity:\.\d+; stroke:none; pointer-events:none; \}/, "the halo is a soft disc of the same amber, never a target");
  // the motion language stays where it was: the legs (and the walk leg) go pink when moving; the actor's ring does not
  assert.match(SOURCE, /\.moving > \.wv-walker-frame, \.moving > \.wv-walker-leg \{ stroke:#e0507a; \}/, "the ruling's pink on a moving body is untouched");
  assert.ok(!/\.is-actor[^\n{]*\.moving|\.moving[^\n{]*\.is-actor/.test(SOURCE), "no stylesheet rule ties the actor's ring to motion — the legs carry it");
});

// the resident path: a stub office whose reader is acting as `near-reader` and
// whose present door puts a household sibling and a stranger beside them
const HOUSEHOLD = ["near-reader", "far-reader"];
async function bootStubOffice() {
  const port = await freePort();
  const at = { x: 221, y: 95.5 };
  const read = {
    handle: "near-reader",
    standpoint: { ...at, stance: "embodied", name: "the rig's standpoint" },
    within: [], nearby: [],
    records: Object.fromEntries([...townRegionMarks(SERVED.marks)].map((m) => [m.id, m])),
    telling: "The rig's air is clear.",
    present: { residents: [] },
  };
  const present = { at: 200, residents: [
    { handle: "far-reader", at: { x: 300, y: 160 }, standing: true, moving: false, aboard: false },
    { handle: "stranger", at: { x: 380, y: 220 }, standing: true, moving: false, aboard: false },
  ] };
  const srv = createHttp((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:" + port);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const send = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (url.pathname === "/ops/whoami") return send({ principal: "rig", handles: HOUSEHOLD });
    if (url.pathname === "/world/my-marks")
      return send({ drafts: [], docket: [], published: [], backed: [], counts: { drafts: 0, docket: 0, published: 0, backed: 0 }, complete: true });
    if (url.pathname === "/world/apex") return send(read);
    if (url.pathname.startsWith("/homes/")) return send({ world: { sited: true, x: at.x, y: at.y, mark_id: null } });
    if (url.pathname === "/world/present") return send(present);
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bounce", defect: "no such door in the rig" }));
  });
  await new Promise((resolve) => srv.listen(port, "127.0.0.1", resolve));
  CLEANUP.push(() => srv.close());
  return { port };
}
async function openActingAs(handle) {
  const office = await bootStubOffice();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.route("**/WORLD/walk-ledger.md", (route) => route.fulfill({ status: 200, contentType: "text/markdown", body: "# empty\n" }));
  await page.addInitScript(([base, h]) => {
    try {
      localStorage.setItem("pm.office.base", base);
      localStorage.setItem("pm_key", "rig-key-not-a-secret");
      localStorage.setItem("pm.world.act_as", h);
    } catch {}
  }, ["http://127.0.0.1:" + office.port, handle]);
  await page.goto("http://localhost:" + rig.port + "/", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-walk-layer [data-handle]").length >= 3, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  return { page, errors };
}
const readBodies = (page) => page.evaluate(() => {
  const body = (h) => {
    const g = document.querySelector(`#wv-walk-layer [data-handle="${CSS.escape(h)}"]`);
    if (!g) return null;
    return {
      classes: g.getAttribute("class"),
      face: !!g.querySelector("image.wv-walker-face, .wv-walker-mono"),
      halo: !!g.querySelector(".wv-walker-halo"),
      stroke: getComputedStyle(g.querySelector(".wv-walker-frame")).strokeWidth,
      colour: getComputedStyle(g.querySelector(".wv-walker-frame")).stroke,
    };
  };
  const vb = (document.querySelector("#map-svg")?.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  return {
    viewW: vb[2],
    far: document.querySelectorAll("#wv-walk-layer .wv-walker-far").length,
    near: document.querySelectorAll("#wv-walk-layer .wv-walker-near").length,
    dots: document.querySelectorAll("#wv-overlay .ov-standpoint").length,
    actor: body("near-reader"), sibling: body("far-reader"), stranger: body("stranger"),
  };
});

test("(5) ON THE PAGE, at the far tier: the act-as body wears its face, is-actor and the amber ring; a household sibling wears is-mine and the empty frame; the dot yields to the drawn body", async (t) => {
  if (!chromium) return t.skip(skipReason);
  const { page, errors } = await openActingAs("near-reader");
  const seen = await readBodies(page);
  await page.close();
  t.diagnostic(JSON.stringify(seen));
  assert.ok(seen.viewW > 1047, "the page must open at the far tier for this to mean anything: viewBox width " + seen.viewW);
  assert.ok(seen.actor && seen.sibling && seen.stranger, "all three bodies must be drawn: " + JSON.stringify(seen));
  assert.match(seen.actor.classes, /\bis-actor\b/, "the act-as body carries is-actor");
  assert.match(seen.actor.classes, /\bwv-walker-near\b/, "…and is FILLED at the far tier");
  assert.equal(seen.actor.face, true, "…with its face (a monogram here — the local rig serves no faces)");
  assert.equal(seen.actor.halo, true, "…and the halo");
  assert.equal(seen.actor.stroke, "4.5px", "the ring is the heavier stroke");
  assert.equal(seen.actor.colour, "rgb(232, 197, 106)", "…in the rail's amber (#e8c56a)");
  assert.match(seen.sibling.classes, /\bis-mine\b/, "the household sibling is yours");
  assert.doesNotMatch(seen.sibling.classes, /\bis-actor\b/, "…but not the actor");
  assert.match(seen.sibling.classes, /\bwv-walker-far\b/, "…and keeps the far tier's empty frame");
  assert.equal(seen.sibling.face, false);
  assert.equal(seen.sibling.stroke, "3px", "is-mine's stroke stays as it was");
  assert.doesNotMatch(seen.stranger.classes, /\bis-mine\b|\bis-actor\b/);
  assert.equal(seen.stranger.stroke, "2px");
  assert.equal(seen.dots, 0, "one body, one marker: the drawn actor takes the dot's place (POS-93)");
  assert.deepEqual(errors, [], "the page threw: " + errors.join(" | "));
});
