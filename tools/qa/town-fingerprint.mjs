// town-fingerprint.mjs — THE CONTROL FOR THE SCENE EXTRACTION.
//
// The interior is being rebuilt as a second INSTANCE of the painting's engine,
// which means the engine comes out of loadMinimap's closure and gets
// scene-parameterized. The danger in that refactor is not the room. It is the
// TOWN: an extraction that quietly changes the outdoor render is a live
// regression on the main page, and it would be invisible to every test that only
// looks at the room.
//
// So this is the net, built BEFORE the wall comes down. It captures a structural
// fingerprint of the OUTDOOR render as a spectator — the case with no identity,
// no occupancy and no interior anywhere near it — and writes it to a baseline.
// Re-run after the extraction and diff: any difference is a red until explained.
//
// Deliberately STRUCTURAL rather than a screenshot. A pixel diff on a live world
// is noise (the record moves, the clock moves, walkers move); what must not move
// is the SHAPE — which layers exist, in what order, what the camera is, how the
// overlay is built, and which marks are drawn where.
//
//   node tools/qa/town-fingerprint.mjs            # print
//   node tools/qa/town-fingerprint.mjs --save     # write the baseline
//   node tools/qa/town-fingerprint.mjs --check    # diff against the baseline
import { chromium } from "file:///G:/Wright-HQ/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "town-fingerprint.baseline.json");
const PORT = process.env.PORT ?? "4881";
const mode = process.argv.includes("--save") ? "save" : process.argv.includes("--check") ? "check" : "print";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90000 });
const skip = await page.$(".wv-tour-skip");
if (skip && await skip.isVisible()) { await skip.click(); await page.waitForSelector(".wv-tour-scrim", { state: "hidden", timeout: 20000 }); }
await page.waitForFunction(() => document.querySelectorAll("#wv-overlay .ov-pip").length > 0, { timeout: 90000 });
await page.waitForTimeout(2500);

const fingerprint = await page.evaluate(() => {
  const svg = document.querySelector(".wv-minimap > svg");
  const round = (n) => Math.round(Number(n) * 100) / 100;
  const pips = [...document.querySelectorAll("#wv-overlay .ov-pip")]
    .map((el) => ({
      id: el.dataset.id,
      cx: round(el.getAttribute("cx")), cy: round(el.getAttribute("cy")),
      r: round(el.getAttribute("r")), cls: el.getAttribute("class"),
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    // WHICH LAYERS EXIST AND IN WHAT ORDER — paint order is meaning in SVG, and
    // the extraction is exactly the kind of change that reshuffles it
    svgChildren: [...(svg?.children ?? [])].map((c) => c.id || c.getAttribute("class") || c.tagName),
    viewBox: svg?.getAttribute("viewBox"),
    // HOW THE OVERLAY IS BUILT — the brief-3 shape: translate groups, a scale
    // hook, constant radii, and one CSS variable carrying the camera
    overlayStructure: (() => {
      const g = document.querySelector("#wv-overlay > g");
      return g ? { outer: g.getAttribute("transform")?.replace(/[\d.-]+/g, "#"), inner: g.firstElementChild?.getAttribute("class") } : null;
    })(),
    markerVar: getComputedStyle(document.querySelector("#wv-overlay")).getPropertyValue("--wv-mk").trim(),
    pipCount: pips.length,
    pips,
    // the standpoint dot and its halo
    dot: (() => { const d = document.querySelector(".ov-dot"); return d ? { r: d.getAttribute("r") } : null; })(),
    halo: (() => { const h = document.querySelector(".ov-halo"); return h ? { r: h.getAttribute("r") } : null; })(),
    // the chrome that must still be there for a spectator outdoors
    chrome: ["#wv-overlay", "#wv-hl-layer", "#wv-walk-layer", ".wv-mapctl", ".wv-bubbles"]
      .map((sel) => `${sel}:${document.querySelector(sel) ? "present" : "ABSENT"}`),
    isInside: document.querySelector(".wv-minimap")?.classList.contains("is-inside") ?? null,
  };
});
await browser.close();

const record = { fingerprint, errs };
if (errs.length) console.error("PAGE ERRORS:", errs);

if (mode === "save") {
  writeFileSync(BASELINE, JSON.stringify(record, null, 1), "utf8");
  console.log(`baseline written: ${BASELINE}`);
  console.log(`  layers  : ${fingerprint.svgChildren.join(" > ")}`);
  console.log(`  pips    : ${fingerprint.pipCount}`);
  console.log(`  viewBox : ${fingerprint.viewBox}`);
} else if (mode === "check") {
  if (!existsSync(BASELINE)) { console.error("no baseline — run with --save first"); process.exit(2); }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  const diffs = [];
  const a = base.fingerprint, b = fingerprint;
  const cmp = (k, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`${k}:\n    was ${JSON.stringify(x)}\n    now ${JSON.stringify(y)}`); };
  cmp("svgChildren", a.svgChildren, b.svgChildren);
  cmp("overlayStructure", a.overlayStructure, b.overlayStructure);
  cmp("dot", a.dot, b.dot);
  cmp("halo", a.halo, b.halo);
  cmp("chrome", a.chrome, b.chrome);
  cmp("isInside", a.isInside, b.isInside);
  // pips: compare the SET and their geometry, not the count alone — the record
  // can legitimately grow, so a new mark is reported rather than failed
  const byId = (list) => Object.fromEntries(list.map((p) => [p.id, p]));
  const A = byId(a.pips), B = byId(b.pips);
  for (const id of Object.keys(A)) {
    if (!B[id]) { diffs.push(`pip GONE: ${id}`); continue; }
    if (JSON.stringify(A[id]) !== JSON.stringify(B[id]))
      diffs.push(`pip MOVED/RESHAPED: ${id}\n    was ${JSON.stringify(A[id])}\n    now ${JSON.stringify(B[id])}`);
  }
  const added = Object.keys(B).filter((id) => !A[id]);
  if (added.length) console.log(`note: ${added.length} pip(s) new since the baseline (the record moves): ${added.slice(0, 5).join(", ")}`);
  if (diffs.length) { console.error(`TOWN RENDER MOVED — ${diffs.length} difference(s):\n  ` + diffs.join("\n  ")); process.exit(1); }
  console.log("town render UNCHANGED against the baseline — the extraction did not move the main page");
} else {
  console.log(JSON.stringify(record, null, 1));
}
