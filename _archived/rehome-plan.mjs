#!/usr/bin/env node
// RETIRED 2026-08-25 — THE FREEZE. Do not run this.
//
// This tool moves mark directories to match geometric containment, with a
// --write mode that performs the `git mv`s. The law it served was repealed on
// 2026-08-25 (LOGOS/state-and-time.md § "The freeze — filing is static, and the
// tree is a fossil"):
//
//   "Filing is frozen as of 2026-08-25. A mark's directory is its historical
//    filing: it carries no claim, and it never moves again."
//
// Running --write against the record now would move directories the frozen
// manifest holds in place, and every mark it touched would be refused by
// mark-lint.mjs §6 gate A until it was put back. It is kept here as history —
// the shape of the machinery the town used while the tree was the map — and it
// lives under _archived/ so that reading it is easy and reaching for it is not.
//
// What answers its questions now: WORLD/containment.json, emitted by the fold at
// every settlement. Nothing performs the moves it plans, by design.
//
// rehome-plan.mjs — move directories to match containment (the v2 law: tree = containment).
//
//   node tools/rehome-plan.mjs --against before.json          # print the plan
//   node tools/rehome-plan.mjs --against before.json --write   # git mv it
//   node tools/rehome-plan.mjs --directory-tree                # compare filing to placementParent
//   node tools/rehome-plan.mjs --directory-tree --write        # re-home every mismatch
//
// A mark's id is its frontmatter `by` plus its directory LEAF, and its parent is
// the nearest enclosing directory holding a mark.md. So re-homing is purely a
// directory move: ids survive, bodies survive, only the filing changes.
//
// Order is the whole difficulty. Moving a directory takes its children with it, and
// several marks in this pass are nested inside each other (merrick's house parcel
// sits inside the inlet, and BOTH are leaving). Moving the inlet first would carry
// the house along and quietly re-home a mark to the wrong place. So: deepest path
// first, and every target is recomputed from the parent's CURRENT location at the
// moment of the move.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKS = join(ROOT, "WORLD/marks/let-there-be-light");
const WRITE = process.argv.includes("--write");
const DIRECTORY_TREE = process.argv.includes("--directory-tree");
const WORLD_ROOT = "the-town/let-there-be-light";
const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };

// ── the record's own view: id -> directory ────────────────────────────────────
const byField = (dir) => {
  const m = /^by:\s*(.+?)\s*$/m.exec(readFileSync(join(dir, "mark.md"), "utf8"));
  return m ? m[1] : null;
};

function walk(dir, out = new Map()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const full = join(dir, e.name);
    if (existsSync(join(full, "mark.md"))) {
      const by = byField(full);
      if (by) out.set(`${by}/${basename(full)}`, full);
    }
    walk(full, out);
  }
  return out;
}

const dirs = walk(MARKS);

const against = arg("--against");
if (!against && !DIRECTORY_TREE) {
  console.log("pass --against <before.json> or --directory-tree");
  process.exit(1);
}

const world = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const marks = world.marks ?? [];
const { loadMarks, placementParent } = await import("./marks-fold.mjs");

let before;
if (DIRECTORY_TREE) {
  before = {};
  for (const m of loadMarks(MARKS)) {
    if ((m.kind !== "sited" && m.kind !== "parcel") || !m.at || m.far) continue;
    before[m.id] = m._parentMarkId === WORLD_ROOT ? null : m._parentMarkId ?? null;
  }
} else {
  before = JSON.parse(readFileSync(resolve(ROOT, against), "utf8"));
}

const label = (t, id) => (Object.hasOwn(t, id) ? t[id] : undefined);
const moves = [];
for (const m of marks) {
  if ((m.kind !== "sited" && m.kind !== "parcel") || !m.at) continue;
  const now = placementParent(m, marks);
  const was = label(before, m.id);
  if (was === undefined || was === now) continue;
  const dir = dirs.get(m.id);
  if (!dir) { console.log(`!! no directory found for ${m.id}`); continue; }
  moves.push({ id: m.id, dir, was, to: now, depth: dir.split(/[\\/]/).length });
}

// deepest first: a child leaves before the parent it is sitting inside
moves.sort((a, b) => b.depth - a.depth);

console.log(`${moves.length} directories to re-home\n`);
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

for (const mv of moves) {
  // recompute the destination NOW, so a parent that has itself already moved is
  // followed to its new location rather than its stale one
  const parentDir = mv.to === null ? MARKS : walk(MARKS).get(mv.to);
  if (mv.to !== null && !parentDir) { console.log(`!! parent ${mv.to} has no directory — skipped ${mv.id}`); continue; }
  const dest = join(parentDir, basename(mv.dir));
  mv.dest = dest;

  console.log(`  ${mv.id}`);
  console.log(`    from ${rel(mv.dir)}`);
  console.log(`    to   ${rel(dest)}`);
  console.log(`    (parent ${mv.was ?? "(root)"} -> ${mv.to ?? "(root)"})`);

  if (WRITE) {
    if (existsSync(dest)) { console.log(`    !! destination exists — skipped`); continue; }
    execFileSync("git", ["-C", ROOT, "mv", rel(mv.dir), rel(dest)], { encoding: "utf8" });
    console.log(`    moved`);
  }
  console.log("");
}

console.log(WRITE ? "done — re-fold and lint" : "plan only — pass --write to execute");
