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
// fingerprint of the OUTDOOR render — which layers exist, in what order, what the
// camera is, how the overlay is built, and WHERE each mark is placed — and writes
// it to a baseline. Re-run after the extraction and diff: any difference is a red
// until explained.
//
// Deliberately STRUCTURAL rather than a screenshot. A pixel diff on a live world
// is noise; what must not move is the SHAPE.
//
//   node tools/qa/town-fingerprint.mjs            # print
//   node tools/qa/town-fingerprint.mjs --save     # write the baseline
//   node tools/qa/town-fingerprint.mjs --check    # diff against the baseline
//   …--save --out <path> / --check --against <path>   # a before/after pair in scratch
//
// ── TWO THINGS THIS FILE LEARNED THE HARD WAY (2026-08-20) ──────────────────
//
// (1) THE CAPTURE MUST BE REPRODUCIBLE, OR IT IS NOT A CONTROL. The pips are the
// radial's BUDGETED set, and the budget is scored from the standpoint. The
// standpoint is derived client-side from the walk ledger AND THE WALL CLOCK, so
// the same commit rendered on two different days — or in two worktrees, since
// demo/state is git-ignored and each seeds its own — legitimately draws a
// different dozen marks. The first baseline was red against its own commit in a
// second pair of hands: five pips swapped, nothing wrong with the tree. So the
// clock is PINNED here, and the pin is written into the baseline and checked
// before any diff. A baseline is a photograph; this records the exposure.
//
// (2) IT WAS BLIND TO THE MOVE IT EXISTS TO CATCH. It read cx/cy off the pip.
// Every pip's cx/cy is 0,0 — the position lives one level up, on the placement
// group `#wv-overlay > g[transform]` that holds each mark's `g.ov-s`. So "the
// extraction moved the town's marks", the likeliest symptom of a bad extraction,
// could not turn this net red. Placement is now captured where it actually lives.
import { chromium } from "file:///G:/Wright-HQ/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "town-fingerprint.baseline.json");
const PORT = process.env.PORT ?? "4881";
const argOf = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const mode = process.argv.includes("--save") ? "save" : process.argv.includes("--check") ? "check" : "print";
const outPath = argOf("--out") ?? BASELINE;
const againstPath = argOf("--against") ?? BASELINE;

// THE EXPOSURE. Any instant would do; what matters is that every capture uses the
// SAME one, so the standpoint, the radial's budget slice and the occupancy read
// are the same question each time. Overridable so a red can be re-shot under the
// baseline's own conditions rather than argued about.
const PIN_ISO = process.env.FINGERPRINT_PIN ?? "2026-08-20T12:00:00.000Z";
const VIEWPORT = { width: 1600, height: 1000 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
// Date is fixed; timers still run, so rAF and the settle behave normally.
await page.clock.setFixedTime(new Date(PIN_ISO));
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
  const ov = document.querySelector("#wv-overlay");
  const round = (n) => Math.round(Number(n) * 100) / 100;
  // WHERE A MARK IS PLACED. Walk up from the pip to the overlay and take the
  // transform that actually carries position — the placement group. Captured
  // verbatim (rounded), because a mark that moves by a pixel moved.
  const placeOf = (el) => {
    let n = el;
    while (n && n.parentElement !== ov) n = n.parentElement;
    const tf = n?.getAttribute("transform") ?? null;
    return tf ? tf.replace(/-?\d+(\.\d+)?/g, (d) => String(round(d))) : null;
  };
  const pips = [...document.querySelectorAll("#wv-overlay .ov-pip")]
    .map((el) => ({
      id: el.dataset.id,
      place: placeOf(el),
      r: round(el.getAttribute("r")), cls: el.getAttribute("class"),
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    // WHICH LAYERS EXIST AND IN WHAT ORDER — paint order is meaning in SVG, and
    // the extraction is exactly the kind of change that reshuffles it
    svgChildren: [...(svg?.children ?? [])].map((c) => c.id || c.getAttribute("class") || c.tagName),
    viewBox: svg?.getAttribute("viewBox"),
    // HOW THE OVERLAY IS BUILT — the brief-3 shape: a placement group per mark,
    // a scale hook inside it, and one CSS variable carrying the marker scale
    overlayStructure: (() => {
      const g = document.querySelector("#wv-overlay > g");
      return g ? { outer: g.getAttribute("transform")?.replace(/[\d.-]+/g, "#"), inner: g.firstElementChild?.getAttribute("class") } : null;
    })(),
    markerVar: getComputedStyle(ov).getPropertyValue("--wv-mk").trim(),
    pipCount: pips.length,
    pips,
    // the standpoint dot and its halo
    dot: (() => { const d = document.querySelector(".ov-dot"); return d ? { r: d.getAttribute("r") } : null; })(),
    halo: (() => { const h = document.querySelector(".ov-halo"); return h ? { r: h.getAttribute("r") } : null; })(),
    // the chrome that must still be there outdoors
    chrome: ["#wv-overlay", "#wv-hl-layer", "#wv-walk-layer", ".wv-mapctl", ".wv-bubbles"]
      .map((sel) => `${sel}:${document.querySelector(sel) ? "present" : "ABSENT"}`),
    isInside: document.querySelector(".wv-minimap")?.classList.contains("is-inside") ?? null,
  };
});
await browser.close();

const conditions = { pin: PIN_ISO, viewport: VIEWPORT };
const record = { conditions, fingerprint, errs };
if (errs.length) console.error("PAGE ERRORS:", errs);

if (mode === "save") {
  writeFileSync(outPath, JSON.stringify(record, null, 1), "utf8");
  console.log(`baseline written: ${outPath}`);
  console.log(`  pinned  : ${PIN_ISO}`);
  console.log(`  layers  : ${fingerprint.svgChildren.join(" > ")}`);
  console.log(`  pips    : ${fingerprint.pipCount}`);
  console.log(`  viewBox : ${fingerprint.viewBox}`);
} else if (mode === "check") {
  if (!existsSync(againstPath)) { console.error(`no baseline at ${againstPath} — run with --save first`); process.exit(2); }
  const base = JSON.parse(readFileSync(againstPath, "utf8"));
  // A DIFF ACROSS DIFFERENT EXPOSURES IS NOT A DIFF. Refuse rather than report
  // colour, so nobody reads a clock difference as a regression — or, worse, files
  // a real regression under "the record moves".
  if (JSON.stringify(base.conditions ?? null) !== JSON.stringify(conditions)) {
    console.error(`BASELINE CONDITIONS DIFFER — this diff would be meaningless.\n    baseline ${JSON.stringify(base.conditions ?? "(none recorded — pre-pin baseline)")}\n    now      ${JSON.stringify(conditions)}`);
    process.exit(2);
  }
  const diffs = [];
  const a = base.fingerprint, b = fingerprint;
  const cmp = (k, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`${k}:\n    was ${JSON.stringify(x)}\n    now ${JSON.stringify(y)}`); };
  cmp("svgChildren", a.svgChildren, b.svgChildren);
  cmp("viewBox", a.viewBox, b.viewBox);
  cmp("overlayStructure", a.overlayStructure, b.overlayStructure);
  cmp("markerVar", a.markerVar, b.markerVar);
  cmp("dot", a.dot, b.dot);
  cmp("halo", a.halo, b.halo);
  cmp("chrome", a.chrome, b.chrome);
  cmp("isInside", a.isInside, b.isInside);
  // pips: compare the SET and their geometry, not the count alone — with the clock
  // pinned the set is a fixed question, so a genuinely new mark in the record is
  // still only a note, but a mark that VANISHED or MOVED is a red
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
  console.log(`town render UNCHANGED against ${againstPath} — the extraction did not move the main page`);
} else {
  console.log(JSON.stringify(record, null, 1));
}
