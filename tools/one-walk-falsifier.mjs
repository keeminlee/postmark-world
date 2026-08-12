#!/usr/bin/env node
// one-walk-falsifier.mjs — did the one-walk tier truth (Keemin's ruling,
// 2026-08-12) move the world?
//
//   node tools/one-walk-falsifier.mjs [--ref <commit>]     # default: origin/main
//
// The ruling changed where the frame's rank comes from: the `tier:` line a
// record carries, which a resident could write, is no longer read — standing is
// derived by the one walk (tools/mark-standing.mjs). A change to what frames
// what is allowed to move every mark in the town, so it does not get to assert
// that it didn't.
//
// The discipline is tools/coords-equivalence.mjs's and tier-frames.test.mjs's:
// TWO REAL PROGRAMS OVER TWO REAL TREES. The before-side is the tree AND the
// loader at `--ref`, extracted read-only; the after-side is this working tree
// loaded with these tools. Neither side is a transcription of the other, and
// neither is a snapshot the change took of itself.
//
// It checks the two halves of "nothing moved", because either alone can pass
// while the world is wrong:
//   POSITION      — every composed world centre, extent and ring, identical.
//   CONTAINMENT   — placementParent's answer for every mark, identical. A
//                   record re-framed onto the wrong origin can still land its
//                   centre in the right spot by luck; its footprint would then
//                   sit in a different container, and only this notices.
//
// Exit 0 says the world held still. Exit 1 prints what moved.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, placementParent } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const i = args.indexOf("--ref");
// The ref LOCATES ITSELF — the parent of the commit that introduced
// `standingRank` — so this keeps meaning the same thing after the branch
// merges, rather than quietly comparing the tree against itself once main moves
// on. Before that commit exists there is nothing to locate, so it falls back to
// the branch point.
const located = (() => {
  try {
    const hits = execFileSync("git", ["-C", ROOT, "log", "--format=%H", "-S", "export function standingRank", "--", "tools/marks-fold.mjs"],
      { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
    return hits.length ? `${hits[hits.length - 1]}^` : null;
  } catch { return null; }
})();
const REF = i >= 0 ? args[i + 1] : (located ?? "origin/main");

const scratch = mkdtempSync(join(tmpdir(), "one-walk-falsifier-"));
let failed = false;
try {
  execFileSync("git", ["-C", ROOT, "archive", "-o", join(scratch, "ref.tar"), REF, "WORLD/marks", "tools"]);
  execFileSync("tar", ["-xf", "ref.tar"], { cwd: scratch });
  const old = await import(pathToFileURL(join(scratch, "tools/marks-fold.mjs")).href);

  // A before-side that already knows the rule agrees with the after-side for
  // free, which is not a check — it is a tautology wearing a check's clothes.
  if (old.standingRank !== undefined) {
    console.error(`the loader at ${REF} already derives standing — there is no before-side to read.`);
    console.error(`  point --ref at a commit from before the ruling landed.`);
    process.exit(2);
  }

  const A = old.loadMarks(join(scratch, "WORLD/marks")).filter((m) => !m._error);
  const B = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  console.log(`before: ${A.length} records at ${REF} (${old.tierRank ? "reads the tier field" : "pre-tier-binding loader"})`);
  console.log(`after:  ${B.length} records in the working tree (derives standing)\n`);

  // The census first: a change that DROPPED a record would otherwise pass,
  // because a mark that is not there has no position to disagree about.
  const idsA = new Set(A.map((m) => m.id)), idsB = new Set(B.map((m) => m.id));
  const lost = [...idsA].filter((x) => !idsB.has(x));
  const gained = [...idsB].filter((x) => !idsA.has(x));
  const bById = new Map(B.map((m) => [m.id, m]));

  const posOf = (m) => ({
    at: m.at ? `${m.at.x},${m.at.y}` : null,
    extent: JSON.stringify(m.extent ?? null),
    points: JSON.stringify(m.points ?? null),
  });
  const moved = [], extentChanged = [], ringChanged = [];
  let positioned = 0;
  for (const a of A) {
    const b = bById.get(a.id);
    if (!b) continue;
    const pa = posOf(a), pb = posOf(b);
    if (pa.at !== null) positioned++;
    if (pa.at !== pb.at) moved.push(`${a.id}: ${pa.at} -> ${pb.at}`);
    if (pa.extent !== pb.extent) extentChanged.push(a.id);   // a size is not a position; it must not move
    if (pa.points !== pb.points) ringChanged.push(a.id);     // a ring IS a set of positions and rides with `at`
  }

  const reparented = [];
  for (const a of A) {
    const b = bById.get(a.id);
    if (!b) continue;
    const before = old.placementParent(a, A);
    const after = placementParent(b, B);
    if (before !== after) reparented.push(`${a.id}: ${before ?? "(root)"} -> ${after ?? "(root)"}`);
  }

  const line = (label, list) => {
    const ok = list.length === 0;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${list.length}`);
    for (const x of list.slice(0, 25)) console.log(`        ${x}`);
    if (list.length > 25) console.log(`        … +${list.length - 25} more`);
  };
  console.log(`checked ${positioned} positioned record(s) of ${A.length}\n`);
  line("records lost", lost);
  line("records appeared", gained);
  line("WORLD POSITIONS MOVED", moved);
  line("extents changed", extentChanged);
  line("rings changed", ringChanged);
  line("PLACEMENT PARENTS CHANGED", reparented);
  console.log(`\n${failed ? "THE WORLD MOVED." : "the world held still: zero positions moved, zero placement parents changed."}`);
} finally {
  if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
