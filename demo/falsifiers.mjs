#!/usr/bin/env node
// DEMO falsifiers — the four checks the brief asks for, each written so it can
// actually FAIL. Run with the demo serving:  node demo/falsifiers.mjs
//
// Nothing here ships and nothing here asserts law. These test the DEMO's claims
// about itself: that its graph is derived rather than kept, that every edge it
// draws says what kind of edge it is, and that crossing out puts the map back.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { buildWorksGraph } from "./works-graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WORKS = join(ROOT, "WORLD", "marks", "let-there-be-light", "the-town-centre", "the-keeping-works");
const PORT = Number(process.env.PORT ?? 4890);
const PW = process.env.PW ?? "G:/Wright-HQ/node_modules/playwright/index.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

// ---------------------------------------------------------------- F1
// The graph is derived from the tree, not kept in a list. Plant a class-node in
// the worktree, re-derive, and it must arrive WITH its extends edge; remove it
// and it must leave. If any node list were hand-maintained this cannot pass.
console.log("\nF1 — the graph follows the tree");
const FIXTURE = join(WORKS, "postmark-node", "falsifier-probe");
try {
  const before = buildWorksGraph();
  mkdirSync(FIXTURE, { recursive: true });
  writeFileSync(join(FIXTURE, "mark.md"), `---
kind: class
by: the-town
tier: constitution
date: 2026-08-18
class: falsifier-probe
version: 1
extends: postmark-node
dials: {}
implements: []
source: LOGOS/classes.md
---

A demo falsifier's fixture node. It exists for one process lifetime and is deleted by the check that made it.
`);
  const during = buildWorksGraph();
  const id = "the-town/falsifier-probe";
  const present = during.nodes.some((n) => n.id === id);
  const edged = during.edges.some((e) => e.from === id && e.to === "the-town/postmark-node" && e.type === "extends");
  ok("a planted class-node appears", present, `${before.counts.nodes} → ${during.counts.nodes} nodes`);
  ok("and it arrives carrying its extends edge", edged, `${before.counts.byEdgeType.extends} → ${during.counts.byEdgeType.extends} extends edges`);

  rmSync(FIXTURE, { recursive: true, force: true });
  const after = buildWorksGraph();
  ok("removing it removes the node", !after.nodes.some((n) => n.id === id), `${during.counts.nodes} → ${after.counts.nodes} nodes`);
  ok("and the counts return exactly", after.counts.nodes === before.counts.nodes && after.counts.edges === before.counts.edges,
    `nodes ${before.counts.nodes}=${after.counts.nodes}, edges ${before.counts.edges}=${after.counts.edges}`);
} finally {
  rmSync(FIXTURE, { recursive: true, force: true });
}
ok("the fixture left no trace on disk", !existsSync(FIXTURE));

// ---------------------------------------------------------------- F2
// Every `extends:` under the works appears in the graph, counted BOTH ways, and
// every edge the graph holds carries a type.
console.log("\nF2 — every extends on disk is an edge, and every edge has a type");
const g = buildWorksGraph();
const grep = execFileSync("git", ["grep", "-l", "^extends:", "--", "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works"], { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
const onDisk = new Set(grep.map((f) => {
  const txt = readFileSync(join(ROOT, f), "utf8");
  const slug = f.split("/").slice(-2)[0];
  const by = (txt.match(/^by:\s*(.+)$/m) ?? [])[1]?.trim();
  return `${by}/${slug}`;
}));
const inGraph = new Set(g.edges.filter((e) => e.type === "extends").map((e) => e.from));
const missing = [...onDisk].filter((id) => !inGraph.has(id));
const extra = [...inGraph].filter((id) => !onDisk.has(id));
ok("disk → graph: no extends is lost", missing.length === 0, `${onDisk.size} on disk${missing.length ? `; missing ${missing.join(", ")}` : ""}`);
ok("graph → disk: no extends is invented", extra.length === 0, `${inGraph.size} in graph${extra.length ? `; extra ${extra.join(", ")}` : ""}`);
const typed = g.edges.every((e) => e.type && Object.keys(g.edgeTypes).includes(e.type));
ok("every edge carries a declared type", typed, `${g.edges.length} edges across ${Object.keys(g.counts.byEdgeType).filter((k) => g.counts.byEdgeType[k]).length} types`);
ok("no edge points outside the drawn node set", g.edges.every((e) => g.nodes.some((n) => n.id === e.from) && g.nodes.some((n) => n.id === e.to)));
ok("nothing was silently dropped", g.counts.unresolved === 0, `${g.counts.unresolved} unresolved`);

// ---------------------------------------------------------------- F3 + F2b
// Rendered, in a browser: the map after the return is byte-identical to the map
// before entry, and every drawn edge has a visible type label.
console.log("\nF3 — the crossing is lossless, and the drawn edges are labelled");
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#map .m-works", { state: "visible" });
  const mapBefore = await page.locator("#map").innerHTML();

  await page.locator("#map .m-portal-hit").click();
  await page.waitForSelector("#works-layer.is-open");
  await page.waitForTimeout(900);

  // every drawn edge has a label element with matching type text
  // (tree/radial retired 2026-08-19 — nested is THE view; the loop keeps the shape)
  for (const layout of ["nested"]) {
    await page.click(`[data-layout="${layout}"]`);
    await page.waitForTimeout(320);
    const r = await page.evaluate(() => {
      const paths = [...document.querySelectorAll("#graph path.edge")];
      const labels = [...document.querySelectorAll("#graph text.e-label")];
      const types = new Set(paths.map((p) => [...p.classList].find((c) => c.startsWith("t-"))?.slice(2)));
      const labelled = paths.length === labels.length && labels.every((l) => l.textContent.trim().length > 0);
      const visible = labels.every((l) => l.getAttribute("visibility") !== "hidden");
      return { paths: paths.length, labels: labels.length, labelled, visible, types: [...types] };
    });
    ok(`${layout}: every drawn edge has a non-empty visible type label`, r.labelled && r.visible,
      `${r.paths} edges, ${r.labels} labels, types: ${r.types.join("/")}`);
  }

  await page.click("#leave");
  await page.waitForSelector("#map-layer.is-open");
  await page.waitForTimeout(900);
  const mapAfter = await page.locator("#map").innerHTML();
  ok("the map after the return is identical to before the crossing", mapBefore === mapAfter,
    mapBefore === mapAfter ? `${mapBefore.length} chars unchanged` : `${mapBefore.length} → ${mapAfter.length} chars`);
  ok("the works is standing there to be crossed again", await page.locator("#map .m-portal-hit").isVisible());
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- F4
console.log("\nF4 — the world suite (run separately: npm test)");
console.log("  this file deliberately does not run it; see the notes for the counts");

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
