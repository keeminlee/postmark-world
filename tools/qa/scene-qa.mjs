// scene-qa.mjs — THE ROOM SCENE, exercised through the one engine.
//
// Companion to town-fingerprint.mjs: that control proves the TOWN did not move;
// this one proves the ROOM actually works — mounted as its own scene, rendered
// by the same machinery, with the founder's conditions (painting-only default)
// as the baseline state. Run against the demo rig:
//
//   PORT=4881 node demo/serve.mjs &
//   node tools/qa/scene-qa.mjs [--shots DIR]
//
// NOTE: the exit falsifier CONSUMES the rig's entered-resident fixture (its
// exits are real acts against the rig's own state). Re-runs need a fresh seed:
//   rm -rf demo/state   (the serve re-seeds on start)
//
// Exits 1 on the first failed assertion, 0 with a receipt table when green.
// The rig's own WORLD record is the fixture: rei stands inside the Lanternstep
// House on the threshold ledger this branch carries.
import { chromium } from "file:///G:/Wright-HQ/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? "4881";
const shotDirArg = process.argv.indexOf("--shots");
const SHOTS = shotDirArg > -1 ? process.argv[shotDirArg + 1] : join(HERE, "..", "..", "qa-shots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) { console.log("\nRED — stopping at the first falsifier that failed."); process.exit(1); }
};

const browser = await chromium.launch();
// PAINTING-ONLY DEFAULT ON PURPOSE: no localStorage seeding. This is the site's
// real condition and the one that hid the exit from the founder (b6 lesson).
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90000 });
await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
await page.waitForTimeout(1200);

// ── into the room: act as whichever resident the RIG's own record puts inside
// (the demo seeds its own git-ignored state, so the cast varies by worktree —
// the fixture is found, not assumed; jetto-scene's reproducibility lesson)
const roster = await page.evaluate(() =>
  [...document.querySelectorAll("[data-act-as]")].map((x) => x.dataset.actAs).filter((h) => h !== "__spectator__"));
let actor = null;
for (const handle of roster) {
  await page.evaluate((h) => {
    const b = [...document.querySelectorAll("[data-act-as]")].find((x) => x.dataset.actAs === h);
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, handle);
  await page.waitForTimeout(2200);
  if (await page.evaluate(() => document.querySelector(".wv-minimap")?.classList.contains("is-scene-mark"))) {
    actor = handle; break;
  }
}
check("the rig offers an entered resident as the fixture", !!actor, actor ?? `roster: ${roster.join(", ")}`);

const inside = await page.evaluate(() => {
  const box = document.querySelector(".wv-minimap");
  const svg = box?.querySelector("svg");
  const exit = box?.querySelector(".wv-scene-exit .wv-int-exit-btn");
  const eb = exit?.getBoundingClientRect();
  const bb = box?.getBoundingClientRect();
  return {
    sceneMark: !!box?.classList.contains("is-scene-mark"),
    ground: !!svg?.querySelector(".wv-scene-ground"),
    paper: !!svg?.querySelector("#wv-scene-rule-pat") && !!svg?.querySelector(".wv-scene-wall"),
    placeholders: (() => {
      const blocks = [...(svg?.querySelectorAll("#wv-overlay .wv-ph-extent") ?? [])];
      const fills = new Set(blocks.map((b) => b.getAttribute("fill")));
      return { count: blocks.length, distinctFills: fills.size,
        lowSat: [...fills].every((f) => /hsl\(\d+ 22% 76%\)/.test(f ?? "")) };
    })(),
    atlasContent: !!svg?.querySelector("image[href*='atlas'], #the-water, .region-founder"),
    pips: svg?.querySelectorAll("#wv-overlay [data-id]").length ?? 0,
    exitInViewport: eb ? eb.width > 0 && eb.y > 0 && eb.y < 1000 && eb.x >= 0 : false,
    // bottom-left OF THE WORLD PANE — measured against the pane's own rect
    exitBottomLeft: eb && bb ? (eb.x - bb.x) < 60 && (bb.bottom - eb.bottom) < 60 : false,
    mapctlHidden: !box?.querySelector(".wv-mapctl") || getComputedStyle(box.querySelector(".wv-mapctl")).display === "none",
    viewBox: svg?.getAttribute("viewBox") ?? null,
    markerVar: svg?.querySelector("#wv-overlay")?.style.getPropertyValue("--wv-mk") || null,
  };
});
await page.screenshot({ path: join(SHOTS, "scene-a-inside.png") });
check("the scene mounts for an entered standpoint", inside.sceneMark);
check("the ground is the scene's own (placeholder present)", inside.ground);
check("…and it is the PAPER floor: squared rule + the room's wall", inside.paper);
check("art-less marks stand in as placeholder extents", inside.placeholders.count >= 1, `${inside.placeholders.count} blocks`);
check("placeholders are DISTINCT by hue and low-saturation by word",
  inside.placeholders.lowSat && (inside.placeholders.count < 2 || inside.placeholders.distinctFills >= 2),
  `${inside.placeholders.distinctFills} distinct fills`);
check("THE ROOF: no atlas content inside the room's svg", !inside.atlasContent);
check("the room's things draw as pips through the ONE overlay", inside.pips >= 1, `${inside.pips} pips`);
check("THE WAY OUT is on the pane in the DEFAULT view mode", inside.exitInViewport);
check("…at the bottom left (the founder's word)", inside.exitBottomLeft);
check("camera chrome absent in a mark scene", inside.mapctlHidden);
check("the numeric regime is the town's own (marker var ≈ 1)",
  inside.markerVar === null || Math.abs(Number(inside.markerVar) - 1) < 0.7, `--wv-mk=${inside.markerVar}`);

// ── the camera is refused: a wheel over the room changes nothing ────────────
const vbBefore = inside.viewBox;
await page.mouse.move(1000, 500);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(400);
const vbAfter = await page.evaluate(() => document.querySelector(".wv-minimap svg")?.getAttribute("viewBox"));
check("FALSIFIER: the wheel does not zoom a room", vbBefore === vbAfter, `${vbBefore} == ${vbAfter}`);

// ── hover: the glance rides the same machinery ──────────────────────────────
const hover = await page.evaluate(() => {
  const pip = document.querySelector(".wv-minimap #wv-overlay [data-id]");
  if (!pip) return { pip: false };
  const r = pip.getBoundingClientRect();
  return { pip: true, x: r.x + r.width / 2, y: r.y + r.height / 2, id: pip.dataset.id };
});
check("floor pips exist to hover", hover.pip);
await page.mouse.move(hover.x, hover.y);
await page.waitForTimeout(600);
const glanced = await page.evaluate(() =>
  !!document.querySelector(".wv-bubbles .wv-bubble") || !!document.querySelector("#wv-hl-layer *"));
await page.screenshot({ path: join(SHOTS, "scene-b-hover.png") });
check("hovering a room thing raises the same glance/highlight the town raises", glanced);

// ── click a thing: the same selection, in BOTH view modes ───────────────────
// The demo rig runs telling-open, where a selection lands on the CELL (the
// bubble is deliberately the painting-only affordance) — identical to the town.
await page.mouse.click(hover.x, hover.y);
await page.waitForTimeout(800);
const selected = await page.evaluate(() => document.querySelector(".is-mark-selected")?.dataset?.id ?? null);
check("clicking a room thing selects it (cell lights, telling-open mode)", selected === hover.id, `${selected}`);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
// …and in painting-only (the SITE's default), the same click raises the bubble
await page.evaluate(() => {
  document.querySelector(".wv-telling-toggle")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(800);
const hover2 = await page.evaluate(() => {
  const pip = document.querySelector(".wv-minimap #wv-overlay [data-id]");
  if (!pip) return null;
  const r = pip.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: pip.dataset.id };
});
check("pips survive the telling toggle", !!hover2);
await page.mouse.click(hover2.x, hover2.y);
await page.waitForTimeout(800);
const bubble = await page.evaluate(() => {
  // ANY pinned bubble is the pass: a mark's card, a walker's mini-card, or the
  // chooser are all correct outcomes of the town's own click precedence (a face
  // wins the click — that is parity, not a miss)
  const el = document.querySelector(".wv-bubble.is-pinned");
  return el && !el.hidden && el.innerHTML.length > 40 ? { over: true } : { over: false };
});
await page.screenshot({ path: join(SHOTS, "scene-c-thingclick.png") });
check("in painting-only, the same click opens the real pinned bubble over the floor", bubble.over);
await page.keyboard.press("Escape");
await page.evaluate(() => {
  document.querySelector(".wv-telling-toggle")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(600);

// ── click open floor: the walk desk arms, same verb as open ground ──────────
const floorSpot = await page.evaluate(() => {
  const svg = document.querySelector(".wv-minimap svg");
  const r = svg.getBoundingClientRect();
  return { x: r.x + r.width * 0.62, y: r.y + r.height * 0.25 };
});
await page.mouse.click(floorSpot.x, floorSpot.y);
await page.waitForTimeout(800);
const desk = await page.evaluate(() => {
  const d = document.querySelector(".wv-walkdesk");
  return d && !d.hidden && d.offsetParent !== null;
});
await page.screenshot({ path: join(SHOTS, "scene-d-floorclick.png") });
check("an open-floor click arms the walk desk (chooseWalkPoint, unchanged)", !!desk);

// ── out: the exit swaps scenes back — one level per crossing ────────────────
// A stacked entrant (the rig seeds one) exits INTO the outer room first: each
// exit is one threshold, and the scene follows the ledger level by level. The
// falsifier is that the LAST exit lands the town whole.
for (let level = 0; level < 4; level++) {
  const stillIn = await page.evaluate(() =>
    document.querySelector(".wv-minimap")?.classList.contains("is-scene-mark"));
  if (!stillIn) break;
  await page.evaluate(() => {
    document.querySelector(".wv-scene-exit .wv-int-exit-btn")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(4000);
}
const outside = await page.evaluate(() => {
  const box = document.querySelector(".wv-minimap");
  const svg = box?.querySelector("svg");
  return {
    sceneMark: !!box?.classList.contains("is-scene-mark"),
    atlasBack: !!svg?.querySelector("image"),
    exitGone: !box?.querySelector(".wv-scene-exit"),
    pips: svg?.querySelectorAll("#wv-overlay [data-id]").length ?? 0,
  };
});
await page.screenshot({ path: join(SHOTS, "scene-e-outside.png") });
check("FALSIFIER: exiting remounts the town scene whole", !outside.sceneMark && outside.atlasBack, `pips=${outside.pips}`);
check("the exit chrome leaves with the room", outside.exitGone);

check("zero page errors across the whole pass", errs.length === 0, errs[0] ?? "");
await browser.close();
console.log(`\nGREEN — ${results.length} checks. Shots in ${SHOTS}`);
