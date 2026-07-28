#!/usr/bin/env node
// containment-diff.mjs — what the true-shape pass does to the TREE.
//
//   node tools/containment-diff.mjs --save before.json
//   node tools/containment-diff.mjs --against before.json
//
// The v2 law is tree = containment: a mark's directory sits under the smallest
// mark that contains it. Water marks have been claiming a bounding RECT, and the
// main channel's rect is 4060 x 10090 m, so it has been the tree PARENT of things
// that are nowhere near the water. Giving the water its true shape drops that
// dry-land containment, `placementParent` answers differently, and directories
// must move to match — the record's shape and its filing are one statement.
//
// This computes each mark's placementParent from the record, so the before/after
// is derived from the same function the fold and the placer use, not from reading
// the directory names. --save before writing rings; --against after.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { placementParent } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };

const world = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const marks = world.marks ?? [];
const placeable = marks.filter((m) => (m.kind === "sited" || m.kind === "parcel") && m.at);

const tree = {};
for (const m of placeable) tree[m.id] = placementParent(m, marks);

const save = arg("--save");
if (save) {
  writeFileSync(resolve(ROOT, save), JSON.stringify(tree, null, 1), "utf8");
  console.log(`saved ${Object.keys(tree).length} parent assignments -> ${save}`);
  process.exit(0);
}

const against = arg("--against");
if (!against) { console.log("pass --save <file> or --against <file>"); process.exit(1); }

const before = JSON.parse(readFileSync(resolve(ROOT, against), "utf8"));
const ids = [...new Set([...Object.keys(before), ...Object.keys(tree)])].sort();

// null means ROOT (the world-root is the frame, never a parent). A missing KEY
// means the mark is not in that tree at all. Those are different facts, and
// `x ?? "(absent)"` collapses them — it reported four marks that had merely moved
// to the root as "(absent)", which reads as "the mark vanished".
const label = (t, id) => (Object.hasOwn(t, id) ? (t[id] === null ? "(root)" : t[id]) : "(absent)");

const moved = [];
for (const id of ids) {
  const b = label(before, id), a = label(tree, id);
  if (b !== a) moved.push({ id, from: b, to: a });
}

console.log(`${ids.length} placeable marks · ${moved.length} change parent\n`);
if (!moved.length) { console.log("no containment change"); process.exit(0); }

// group by the parent they left, since that is the story: which oversized claim
// stopped swallowing things
const byFrom = new Map();
for (const m of moved) {
  if (!byFrom.has(m.from)) byFrom.set(m.from, []);
  byFrom.get(m.from).push(m);
}

console.log("| mark | parent before | parent after |");
console.log("|---|---|---|");
for (const [from, list] of [...byFrom].sort((a, b) => b[1].length - a[1].length))
  for (const m of list)
    console.log(`| \`${m.id}\` | \`${from}\` | \`${m.to}\` |`);

console.log(`\nleaving each parent:`);
for (const [from, list] of [...byFrom].sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${String(from).padEnd(34)} loses ${list.length}`);
