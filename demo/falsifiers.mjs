#!/usr/bin/env node
// DEMO falsifiers — the four checks the brief asks for, each written so it can
// actually FAIL. Run with the demo serving:  node demo/falsifiers.mjs
//
// Nothing here ships and nothing here asserts law. These test the DEMO's claims
// about itself: that its graph is derived rather than kept, that every edge it
// draws says what kind of edge it is, and that crossing out puts the map back.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { buildWorksGraph } from "./works-graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WORKS = join(ROOT, "WORLD", "marks", "let-there-be-light", "the-town-centre", "the-keeping-works");
const PORT = Number(process.env.PORT ?? 4890);
const PW = process.env.PW ?? "G:/Wright-HQ/node_modules/playwright/index.mjs";

// Which record did this run judge, and which run was it? Two runs can interleave
// in one worktree — they have — and a line of output that cannot be placed
// against a commit is archaeology nobody can do afterwards. Both are one glance
// and neither can be got back later, so say them first.
const RUN = randomBytes(3).toString("hex");
function provenance() {
  try {
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean).length;
    return `HEAD ${head}${dirty ? ` · ${dirty} uncommitted` : " · clean"}`;
  } catch {
    return "HEAD unknown (no git here)";
  }
}
console.log(`falsifiers · ${provenance()} · run ${RUN} · ${new Date().toISOString()}`);

let pass = 0, fail = 0, moved = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
// A third verdict, for when the ground moved rather than the claim breaking.
// Neither PASS (that would tolerate it silently) nor FAIL (the demo did nothing
// wrong): the run says the tree changed under it, names what changed, and
// declines to judge the check that the change invalidated.
const groundMoved = (name, detail) => {
  moved++;
  console.log(`  MOVED ${name}${detail ? ` — ${detail}` : ""}`);
};

// The map-identity check has failed twice and passed on every rerun, which is
// the worst shape a check can have: real enough to stop a batch, gone before
// anyone can look at it. A length pair names nothing, so when it next fails the
// run says WHERE the two snapshots part and keeps both for reading. #map is
// drawn once at boot and never touched again, so any difference at all is news.
function describeMapDrift(before, after) {
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  const around = (s) => JSON.stringify(s.slice(Math.max(0, i - 70), i + 70));
  const dir = join(ROOT, "qa-shots", "f3-map-drift");
  let kept = "";
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "map-before.html"), before);
    writeFileSync(join(dir, "map-after.html"), after);
    kept = `\n         both snapshots kept: ${dir}`;
  } catch (e) {
    kept = `\n         (could not keep snapshots: ${e.message})`;
  }
  return `${before.length} → ${after.length} chars; they part at index ${i}`
    + `\n         before: ${around(before)}`
    + `\n         after:  ${around(after)}${kept}`;
}

// ---------------------------------------------------------------- F1
// The graph is derived from the tree, not kept in a list. Plant a class-node in
// the worktree, re-derive, and it must arrive WITH its extends edge; remove it
// and it must leave. If any node list were hand-maintained this cannot pass.
console.log("\nF1 — the graph follows the tree");
// The fixture is unique per RUN. It used to be one fixed path, which meant two
// interleaved runs in this worktree planted and deleted the SAME leaf into each
// other's before/during/after reads — one run's rmSync landing between another's
// plant and its check. The suffix is on the directory (the id is `by` + leaf)
// AND on the class name, so neither run's `extends:` can resolve against the
// other's node either.
const PROBE = `falsifier-probe-${RUN}`;
const PROBE_ID = `the-town/${PROBE}`;
const PROBE_HOME = join(WORKS, "postmark-node");
const FIXTURE = join(PROBE_HOME, PROBE);

// A unique fixture buys us safety from the OTHER run and costs us the old
// fixed path's one virtue: a crashed run used to be cleaned up by the next one
// reusing the same leaf. Now an orphan would sit in the tree forever, drawn as
// a real class-node. So sweep old probes — but only ones too old to belong to a
// run still in flight (a run takes about six seconds), or the sweep would
// delete a concurrent run's fixture and re-create the collision it is here to
// prevent.
const ORPHAN_AFTER = 10 * 60 * 1000;
try {
  for (const name of readdirSync(PROBE_HOME)) {
    if (!name.startsWith("falsifier-probe")) continue;
    if (name === PROBE) continue;
    const dir = join(PROBE_HOME, name);
    let age = 0;
    try { age = Date.now() - statSync(dir).mtimeMs; } catch { continue; }
    if (age < ORPHAN_AFTER) continue;
    rmSync(dir, { recursive: true, force: true });
    console.log(`  swept an orphaned probe from a run that died: ${name} (${Math.round(age / 60000)}m old)`);
  }
} catch { /* no probe home yet, or unreadable — the checks below will say so */ }

try {
  const before = buildWorksGraph();
  mkdirSync(FIXTURE, { recursive: true });
  writeFileSync(join(FIXTURE, "mark.md"), `---
kind: class
by: the-town
tier: constitution
date: 2026-08-18
class: ${PROBE}
version: 1
extends: postmark-node
dials: {}
implements: []
source: LOGOS/classes.md
---

A demo falsifier's fixture node (run ${RUN}). It exists for one process lifetime and is deleted by the check that made it.
`);
  const during = buildWorksGraph();
  const id = PROBE_ID;
  const present = during.nodes.some((n) => n.id === id);
  const edged = during.edges.some((e) => e.from === id && e.to === "the-town/postmark-node" && e.type === "extends");
  ok("a planted class-node appears", present, `${before.counts.nodes} → ${during.counts.nodes} nodes`);
  ok("and it arrives carrying its extends edge", edged, `${before.counts.byEdgeType.extends} → ${during.counts.byEdgeType.extends} extends edges`);

  rmSync(FIXTURE, { recursive: true, force: true });
  const after = buildWorksGraph();
  ok("removing it removes the node", !after.nodes.some((n) => n.id === id), `${during.counts.nodes} → ${after.counts.nodes} nodes`);

  // "the counts return exactly" only means anything if nothing ELSE arrived or
  // left while the run was in flight. In a worktree being edited — which this
  // one is, most of the day — a mark landing between the first read and the last
  // makes that check fail for a reason the demo is not responsible for, and it
  // passes on rerun, which is the worst shape a check can have. So: look for
  // drift explicitly, and when the ground has moved, NAME what moved and decline
  // to judge, rather than reporting a failure that is really someone's commit.
  const others = (g) => new Set(g.nodes.map((n) => n.id).filter((x) => x !== id));
  const wasThere = others(before), isThere = others(after);
  const arrived = [...isThere].filter((x) => !wasThere.has(x));
  const departed = [...wasThere].filter((x) => !isThere.has(x));
  const some = (list) => list.length > 4 ? `${list.slice(0, 4).join(", ")}, +${list.length - 4} more` : list.join(", ");

  if (arrived.length || departed.length) {
    groundMoved("the tree moved under the run — the counts check cannot be made",
      [
        arrived.length ? `${arrived.length} arrived (${some(arrived)})` : null,
        departed.length ? `${departed.length} left (${some(departed)})` : null,
        `this run's own fixture was ${id}`,
      ].filter(Boolean).join("; "));
  } else {
    ok("and the counts return exactly", after.counts.nodes === before.counts.nodes && after.counts.edges === before.counts.edges,
      `nodes ${before.counts.nodes}=${after.counts.nodes}, edges ${before.counts.edges}=${after.counts.edges}`);
  }
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
  // The identity check at the foot of this block compares two snapshots — and
  // two EMPTY snapshots are identical. Say the precondition out loud, or a map
  // that never drew at all would sail through the crossing as "lossless".
  ok("the map was drawn before the crossing (the identity check has something to compare)",
    mapBefore.length > 0 && mapBefore.includes("m-works"), `${mapBefore.length} chars`);

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
    mapBefore === mapAfter ? `${mapBefore.length} chars unchanged` : describeMapDrift(mapBefore, mapAfter));
  ok("the works is standing there to be crossed again", await page.locator("#map .m-portal-hit").isVisible());
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- F4
console.log("\nF4 — the world suite (run separately: npm test)");
console.log("  this file deliberately does not run it; see the notes for the counts");

// A run whose ground moved is not a failure and must not exit non-zero — but it
// must not vanish into a green tally either, or the next person to see a
// one-off failure has no way to know the tree was being edited underneath it.
console.log(`\n${pass} passed, ${fail} failed`
  + (moved ? `, ${moved} NOT JUDGED (the tree moved under the run)` : "")
  + ` · run ${RUN}`);
process.exitCode = fail ? 1 : 0;
