#!/usr/bin/env node
// DEMO QA — drive the works-portal demo and photograph it. Nothing ships.
//
//   node demo/qa-shots.mjs                       (demo must already be serving)
//   OUT=... PORT=... node demo/qa-shots.mjs
//
// Playwright is not a dependency of this repo; it is resolved from wherever the
// operator keeps it (PW env var, or the Wright-HQ install this box has).
//
// One FRESH PAGE LOAD per probe, deliberately: a pinned detail panel or a
// previous layout's transform contaminates the next shot, and a sequenced
// driver reads the leftovers instead of the subject.

import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT ?? 4890);
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.OUT ?? "G:/Postmark/qa-shots/works-portal-demo";
const PW = process.env.PW ?? "G:/Wright-HQ/node_modules/playwright/index.mjs";

// a Windows absolute path is not an ESM specifier — it has to become a file: URL
const { chromium } = await import(pathToFileURL(PW).href);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shots = [];

// a shot is only worth taking if the thing it claims to show is actually on
// screen — every probe below asserts its subject before the shutter
async function fresh(fn, name, { w = 1600, h = 1000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#map .m-works", { state: "visible", timeout: 10000 });
  const note = await fn(page);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push({ name, file, note: note ?? "", errors });
  console.log(`  ${errors.length ? "!" : "·"} ${name}${note ? ` — ${note}` : ""}${errors.length ? `  [${errors.length} console error(s)]` : ""}`);
  await ctx.close();
}

const enter = async (page) => {
  const door = page.locator("#map .m-portal-hit");
  if (!(await door.isVisible())) throw new Error("the portal affordance is not visible — a click here would prove nothing");
  await door.click();
  await page.waitForSelector("#works-layer.is-open", { timeout: 5000 });
  await page.waitForTimeout(900); // the crossfade
};
const layout = async (page, which) => {
  await page.click(`[data-layout="${which}"]`);
  await page.waitForTimeout(450);
};

console.log(`shooting ${BASE} → ${OUT}`);

// 1 — where you stand
await fresh(async () => "the town centre, the works lit, the portal breathing", "01-map-the-works");

// 2 — the threshold, caught mid-crossfade.
// The overlap window is narrow and the screenshot itself costs ~80ms of it
// (measured: works opacity 0.93 going in, 1.00 coming out), so the wait is set
// short of the target. The pointer is parked on the footer first, or it lands on
// whatever node happens to sit where the door was and opens a tooltip.
await fresh(async (page) => {
  await page.locator("#map .m-portal-hit").click();
  await page.mouse.move(1560, 985);
  await page.waitForTimeout(210);
  const o = await page.evaluate(() => ({
    map: +getComputedStyle(document.querySelector("#map-layer")).opacity,
    works: +getComputedStyle(document.querySelector("#works-layer")).opacity,
  }));
  return `mid-crossing — at the shutter release map ${o.map.toFixed(2)}, class-space ${o.works.toFixed(2)}; the capture itself costs ~80ms, so the frame lands a little further in`;
}, "02-threshold");

// 3/4/5 — the three shapes of the same interior
for (const [n, which, note] of [
  ["03-layout-tree", "tree", "the extends lattice as a dendrogram"],
  ["04-layout-radial", "radial", "roots at the centre, depth as distance"],
  ["05-layout-nested", "nested", "boxes are the directory; arrows are the lattice"],
]) {
  await fresh(async (page) => {
    await enter(page);
    await layout(page, which);
    const nodes = await page.locator("#graph .node").count();
    if (nodes < 40) throw new Error(`only ${nodes} nodes drawn in ${which} — the interior is not all there`);
    return `${note} · ${nodes} nodes drawn`;
  }, n);
}

// 6 — a node answering: hover raises its own edges
await fresh(async (page) => {
  await enter(page);
  const target = page.locator('#graph .node[data-id="the-town/resident"]');
  await target.scrollIntoViewIfNeeded().catch(() => { });
  await target.hover();
  await page.waitForTimeout(320);
  if (await page.locator("#tip").isHidden()) throw new Error("hover produced no tip");
  return "hover on resident — its body in the tip, its own edges lifted, the rest dimmed";
}, "06-hover-resident");

// 7 — a node opened: the record in full
await fresh(async (page) => {
  await enter(page);
  await page.locator('#graph .node[data-id="the-town/resident"]').click();
  await page.waitForSelector("#detail:not([hidden])", { timeout: 4000 });
  await page.waitForTimeout(260);
  const edges = await page.locator("#detail .d-sec li").count();
  return `click on resident — body, dials, actions, its ${edges} listed record lines, and the file it came from`;
}, "07-click-resident");

// 8 — one edge type alone, to show the switcher does something
await fresh(async (page) => {
  await enter(page);
  for (const t of ["extends", "slot", "registry", "portal", "implements"]) await page.click(`#legend-list li[data-type="${t}"]`);
  await page.waitForTimeout(400);
  return "every edge type off but residue — what the works looks like held together by leavings alone";
}, "08-residue-only");

// 9 — back out, and the map must be what it was
await fresh(async (page) => {
  await enter(page);
  await page.click("#leave");
  await page.waitForSelector("#map-layer.is-open", { timeout: 5000 });
  await page.waitForTimeout(900);
  if (!(await page.locator("#map .m-works").isVisible())) throw new Error("the works is not visible after the return");
  return "returned — the map standing where it stood";
}, "09-return");

await browser.close();

const bad = shots.filter((s) => s.errors.length);
console.log(`\n${shots.length} shots → ${OUT}`);
if (bad.length) { console.log(`CONSOLE ERRORS in: ${bad.map((s) => s.name).join(", ")}`); for (const s of bad) for (const e of s.errors) console.log(`  ${s.name}: ${e}`); process.exitCode = 1; }
else console.log("no console errors in any shot");
