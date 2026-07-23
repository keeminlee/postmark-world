#!/usr/bin/env node
// migrate-marks-v2.mjs — one-shot: re-home the v1 marks into the schema-v2 spatial
// tree. PHASE 1: every v1 `WORLD/marks/<household>/<slug>/…` subtree moves under
// the root, `WORLD/marks/let-there-be-light/<slug>/…`, with `by: <household>`
// injected into each record's frontmatter. Authorship leaves the path and becomes
// the `by:` field; the leaf slug (and therefore the id `by/slug`) is unchanged —
// zero renames, stakes stay attached. Nesting is preserved (sub-marks stay under
// their home). PHASE 2 (re-home under region marks) runs after the region fleet
// lands, and is FREE because id ≠ path.
//
//   node tools/migrate-marks-v2.mjs           # migrate
//   node tools/migrate-marks-v2.mjs --dry     # report only
//
// Deterministic, collision-checked: a target dir that already exists (two authors
// wanting the same top-level slug) is refused loudly, never overwritten.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MARKS = join(ROOT, "WORLD/marks");
const ROOT_DIR = join(MARKS, "let-there-be-light");
const DRY = process.argv.includes("--dry");

if (!existsSync(ROOT_DIR)) { console.error("run tools/world-root-gen.mjs first — the root mark must exist"); process.exit(1); }

// inject `by: <household>` into a mark.md's frontmatter (idempotent; never touches body)
function withBy(text, household) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  if (/^by:\s/m.test(m[1])) return text; // already has by
  return text.replace(/^---\r?\n/, `---\nby: ${household}\n`);
}

let moved = 0, records = 0, nested = 0;
const problems = [];

// read a mark.md's at/extent for the containment check (centered rects)
function rectOf(markMd) {
  const t = readFileSync(markMd, "utf8");
  const a = t.match(/at:\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+)\s*\}/);
  const e = t.match(/extent:\s*\{\s*w:\s*(-?[\d.]+),\s*h:\s*(-?[\d.]+)\s*\}/);
  if (!a) return null;
  return { x: +a[1], y: +a[2], w: e ? +e[1] : 1, h: e ? +e[2] : 1 };
}
const contains = (outer, inner) => outer && inner
  && Math.abs(inner.x - outer.x) + inner.w / 2 <= outer.w / 2 + 1e-6
  && Math.abs(inner.y - outer.y) + inner.h / 2 <= outer.h / 2 + 1e-6;

// recursively copy srcDir -> dstDir, injecting `by` into every mark.md
function migrateTree(srcDir, dstDir, household) {
  if (!DRY) mkdirSync(dstDir, { recursive: true });
  for (const e of readdirSync(srcDir)) {
    const sp = join(srcDir, e), dp = join(dstDir, e);
    const st = statSync(sp);
    if (st.isDirectory()) migrateTree(sp, dp, household);
    else if (e === "mark.md") {
      const injected = withBy(readFileSync(sp, "utf8"), household);
      if (injected == null) { problems.push(`${sp}: no frontmatter — left in place`); continue; }
      if (!DRY) writeFileSync(dp, injected);
      records++;
    } else if (!DRY) writeFileSync(dp, readFileSync(sp)); // carry any sidecar files verbatim
  }
}

for (const hh of readdirSync(MARKS)) {
  if (hh === "let-there-be-light") continue;
  const hhDir = join(MARKS, hh);
  let st; try { st = statSync(hhDir); } catch { continue; }
  if (!st.isDirectory()) continue;
  // each child of the household dir is a top-level mark that re-homes directly under root
  for (const child of readdirSync(hhDir)) {
    const src = join(hhDir, child);
    if (!statSync(src).isDirectory()) continue;
    let dst = join(ROOT_DIR, child);
    if (existsSync(dst)) {
      // same top-level slug, different author (e.g. finn/the-still-reach vs the
      // terrain the-still-reach). Legal by id (by+leaf); resolve the PATH by
      // nesting under the existing mark IF it geometrically contains this one.
      const outer = rectOf(join(dst, "mark.md")), inner = rectOf(join(src, "mark.md"));
      if (contains(outer, inner)) { dst = join(dst, child); nested++; }
      else { problems.push(`COLLISION: ${hh}/${child} → let-there-be-light/${child} exists and does not contain it (needs a containing region — phase 2)`); continue; }
    }
    migrateTree(src, dst, hh);
    moved++;
  }
  if (!DRY && problems.every((p) => !p.includes(`${hh}/`))) rmSync(hhDir, { recursive: true, force: true });
}

console.log(`migrate-marks-v2${DRY ? " (dry run)" : ""}: ${moved} top-level marks re-homed under the root, ${records} records rewritten with by:`);
if (problems.length) { console.log("\nPROBLEMS:"); for (const p of problems) console.log("  " + p); process.exitCode = problems.some((p) => p.startsWith("COLLISION")) ? 1 : 0; }
else console.log("no collisions — clean.");
