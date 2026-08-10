#!/usr/bin/env node
// migrate-coords.mjs — one-shot: rewrite WORLD/marks from absolute coordinates
// (SCHEMA v2) to relative ones (SCHEMA v3, § The frame, 2026-08-09).
//
// Every nested mark's `at:` becomes its offset from its PARENT'S CENTRE, and a
// `points:` ring — a set of positions, not a size — is shifted with it. The root
// is the world frame and keeps its own numbers; a top-level mark is framed on the
// root's centre, which is the origin, so ITS numbers do not change either. Only
// the nested records move, and they move only on paper.
//
//   node tools/migrate-coords.mjs --dry     # the plan, nothing written
//   node tools/migrate-coords.mjs           # rewrite, then declare the frame
//
// It does not compute the frame itself. `loadMarks` already walks the chain and
// hands every record the centre it is written against (`_origin`), so the
// migration is the loader's own arithmetic run backwards — one direction of the
// same function the fold uses forwards, which is why it can be checked exactly
// (tools/coords-equivalence.mjs).
//
// Refuses a tree that already declares the relative frame: subtracting twice
// would look like success and quietly fold the world in on itself.
//
// THE REWRITE IS PERISHABLE; THE LOADER IS NOT. This world commits continuously
// — every walk lands on main — so a rewrite commit goes stale the moment a new
// positioned mark arrives. Merged stale, those newcomers sit in world
// coordinates inside a tree that reads every nested number as an offset, and
// they land wherever their parent's centre happens to put them. The refusal
// above means you cannot simply re-run over the merged tree either.
//
// So landing is: carry the LOADER commit onto current main, drop the old
// rewrite, and run this again over the whole tree —
//
//   git rebase origin/main            # keep the loader commit, drop the rewrite
//   node tools/migrate-coords.mjs
//   node tools/coords-equivalence.mjs --ref origin/main
//
// The one-shot is cheap and its result is exactly checkable; hand-patching the
// newcomers is neither. (Proved 2026-08-10 against main at cdc5235: 324/324.)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, worldToFile, ringToFile, COORDS_FIELD, COORDS_RELATIVE } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MARKS_DIR = opt("--marks-dir", join(ROOT, "WORLD/marks"));
const DRY = args.includes("--dry");
const WORLD_ROOT_SLUG = "let-there-be-light";

const die = (msg, fix) => { console.error(`migrate-coords: ${msg}${fix ? `\n  ${fix}` : ""}`); process.exit(1); };

if (!existsSync(MARKS_DIR)) die(`no marks tree at ${MARKS_DIR}`);
const marks = loadMarks(MARKS_DIR);
if (!marks.length) die(`no marks under ${MARKS_DIR}`);

const declared = marks.find((m) => m[COORDS_FIELD] !== undefined);
if (declared && String(declared[COORDS_FIELD]).trim() === COORDS_RELATIVE)
  die(`this tree already declares the relative frame (${declared.id}: ${COORDS_FIELD}: ${COORDS_RELATIVE})`,
    "the rewrite has already run — running it again would subtract every offset a second time.");

const root = marks.find((m) => m.slug === WORLD_ROOT_SLUG);
if (!root) die(`no world root (${WORLD_ROOT_SLUG}) in this tree`, "the root is the frame; without it there is nothing to be relative TO.");

const broken = marks.filter((m) => m._error);
if (broken.length) die(`${broken.length} unreadable record(s) — a rewrite over a tree it cannot fully read is a guess`,
  broken.map((m) => `${m.id}: ${m._error}`).join("\n  "));

// ── the plan ─────────────────────────────────────────────────────────────────
// Computed against the loaded (absolute) tree in full before a byte is written,
// so no record is ever read back through a frame the previous write just changed.
const AT_RE = /^at: .*$/m;
const POINTS_RE = /^points: .*$/m;
const num = (n) => String(n);
const ringText = (ring) => ring.map((p) => (Array.isArray(p) ? `${num(p[0])},${num(p[1])}` : `${num(p.x)},${num(p.y)}`)).join(" ");

const plan = [];
const problems = [];
for (const rec of marks) {
  if (!rec._fileAt) continue;               // predicated/naming carry no position
  const file = join(rec._dir, "mark.md");
  let text = readFileSync(file, "utf8");
  const before = text;

  const offset = worldToFile(rec.at, rec._origin);
  if (!AT_RE.test(text)) { problems.push(`${rec.id}: record carries at ${rec.at.x},${rec.at.y} but has no "at:" line to rewrite`); continue; }
  text = text.replace(AT_RE, `at: { x: ${num(offset.x)}, y: ${num(offset.y)} }`);

  if (Array.isArray(rec.points) && rec.points.length) {
    if (!POINTS_RE.test(text)) { problems.push(`${rec.id}: carries a ring but has no "points:" line`); continue; }
    text = text.replace(POINTS_RE, `points: ${ringText(ringToFile(rec.points, rec._origin))}`);
  }

  if (text !== before) plan.push({ rec, file, text, offset });
}

// the frame declaration — one line, on the one mark that IS the frame. It rides
// inside the tree so it travels with a sketchbook or another clone, and it sits
// beside the extent it governs.
const rootFile = join(root._dir, "mark.md");
let rootText = readFileSync(rootFile, "utf8");
if (!/^extent: .*$/m.test(rootText)) die(`the root record has no extent: line to declare the frame beside`, rootFile);
const rootDecl = rootText.replace(/^(extent: .*)$/m, `$1\n${COORDS_FIELD}: ${COORDS_RELATIVE}`);
const already = plan.find((p) => p.file === rootFile);
if (already) already.text = already.text.replace(/^(extent: .*)$/m, `$1\n${COORDS_FIELD}: ${COORDS_RELATIVE}`);
else plan.push({ rec: root, file: rootFile, text: rootDecl, offset: root._fileAt, declaresFrame: true });

if (problems.length) die(`${problems.length} record(s) cannot be rewritten`, problems.join("\n  "));

// ── report, then write ───────────────────────────────────────────────────────
const rel = (p) => p.replace(/\\/g, "/").replace(/^.*\/(WORLD\/marks\/)/, "$1");
const positioned = marks.filter((m) => m._fileAt);
const moved = plan.filter((p) => !p.declaresFrame);
console.log(`${positioned.length} positioned mark(s); ${moved.length} record(s) change frame, ${positioned.length - moved.length} keep their exact numbers (the root and everything standing on open ground).\n`);
for (const p of plan.slice(0, 12))
  console.log(`  ${rel(p.file)}\n    ${p.rec.at.x},${p.rec.at.y} (world)  ->  ${p.offset.x},${p.offset.y}  from ${p.rec._parentMarkId ?? "(the world origin)"}`);
if (plan.length > 12) console.log(`  … and ${plan.length - 12} more`);

if (DRY) { console.log(`\n--dry: nothing written.`); process.exit(0); }
for (const p of plan) writeFileSync(p.file, p.text);
console.log(`\nwrote ${plan.length} record(s); ${root.id} now declares ${COORDS_FIELD}: ${COORDS_RELATIVE}.
Prove it moved nothing:  node tools/coords-equivalence.mjs --ref HEAD`);
