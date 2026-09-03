#!/usr/bin/env node
// place-mark.mjs — WHERE does this mark go in the tree? Ask, don't guess.
//
// FILING IS FROZEN (LOGOS/state-and-time.md § The freeze, ruled 2026-08-25;
// rendered as the-town/the-frozen-filing): a mark's directory is historical
// filing, claims nothing, never moves; NEW marks file by identity —
// WORLD/marks/<household>/<slug>/ — and containment lives only in the derived
// fold. The directory-matches-containment law this tool computed is REPEALED.
// What this tool still answers truthfully: WHAT CONTAINS THIS GEOMETRY — the
// same `placementParent` the fold derives containment from — and, until
// postmark#2436 lands, ALSO the path the lane's wall (lane-wall.mjs § 3) still
// checks for: file where this says; the wall refuses an id-keyed path today and
// mark-lint only warns about this one. The cutover (wall § 3 retired, --scaffold
// writing WORLD/marks/<household>/<slug>/) rides that issue; this header retires
// with it.
//
//   node tools/place-mark.mjs --kind sited  --at 120,340 --extent 6,4 --slug my-porch
//   node tools/place-mark.mjs --kind parcel --at 900,1200 --slug my-ground
//   node tools/place-mark.mjs --kind predicated --parent alpha/house --slug color
//   add --scaffold to also create the directory and a TEMPLATE-filled mark.md
//   add --json for machine-readable output
//
// sited/parcel: geometry decides — give --at x,y (grid meters east,south of
//   Ferry's crossing) and, for sited, --extent w,h. A parcel's extent is the
//   town's own dial (25×25) and is filled in for you; passing one is refused,
//   same as at the door.
// predicated/naming: they nest under the mark they describe — give --parent.
//
// Read-only unless --scaffold. Never commits. The gate (mark-lint + the lane
// wall) checks your final path against this same derivation, so running this
// first means the gate has nothing to teach you.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, placementParent, PARCEL_EXTENT_M } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MARKS_DIR = join(ROOT, "WORLD", "marks");
const ROOT_DIR = join(MARKS_DIR, "let-there-be-light");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flag = (name) => args.includes(name);
const die = (defect, hint) => {
  if (flag("--json")) console.log(JSON.stringify({ error: { defect, hint } }));
  else console.error(`refused: ${defect}\n  ${hint}`);
  process.exit(1);
};

const kind = opt("--kind");
if (!["sited", "parcel", "predicated", "naming"].includes(kind ?? ""))
  die("--kind must be sited, parcel, predicated, or naming", "what shape of claim is this? (WORLD/FURNISHING.md explains the four)");

const slug = opt("--slug");
if (slug && !/^[a-z0-9][a-z0-9-]*$/.test(slug))
  die("slug must be kebab-case", `lowercase letters, digits, single hyphens — got "${slug}"`);

const marks = loadMarks(MARKS_DIR);
const byId = new Map(marks.map((m) => [m.id, m]));

let parentId, parentDir;
if (kind === "sited" || kind === "parcel") {
  const at = (opt("--at") ?? "").split(",").map(Number);
  if (at.length !== 2 || !at.every(Number.isFinite))
    die("sited/parcel placement needs --at x,y", "grid meters east,south of Ferry's crossing — where does this mark stand?");
  let extent;
  if (kind === "parcel") {
    if (opt("--extent")) die("a parcel carries no extent — every parcel is the town's 25×25, centred on your at", "drop --extent; the dial is the town's (same refusal the office door gives)");
    extent = { w: PARCEL_EXTENT_M, h: PARCEL_EXTENT_M };
  } else {
    const wh = (opt("--extent") ?? "").split(",").map(Number);
    if (wh.length !== 2 || !wh.every(Number.isFinite) || !(wh[0] || wh[1]))
      die("a sited mark needs --extent w,h", "its footprint in grid meters");
    extent = { w: wh[0], h: wh[1] };
  }
  parentId = placementParent({ at: { x: at[0], y: at[1] }, extent }, marks);
  parentDir = parentId ? byId.get(parentId)?._dir : ROOT_DIR;
  if (!parentDir) die("placement lost its parent", `computed parent ${parentId} has no directory — run mark-lint; the tree may be mis-filed`);
} else {
  parentId = opt("--parent");
  const parent = parentId ? byId.get(parentId) : null;
  if (!parent) die(`no mark "${parentId ?? "(none given)"}" to describe`, "predicated/naming marks nest under the mark they describe — pass --parent <by>/<slug>");
  if (parent.kind !== "sited" && parent.kind !== "parcel")
    die(`"${parentId}" cannot hold a description`, "only sited/parcel marks carry predicated/naming children");
  parentDir = parent._dir;
}

const relParent = relative(MARKS_DIR, parentDir).replace(/\\/g, "/") || "(marks root)";
const dir = slug ? join(parentDir, slug) : null;
const relDir = dir ? relative(ROOT, dir).replace(/\\/g, "/") : null;

if (dir && existsSync(dir))
  die("a mark already sits in that spot", `${relDir} exists — pick another slug, or investigate what is there`);

if (flag("--json")) {
  console.log(JSON.stringify({ kind, parent: parentId ?? null, parent_dir: relParent, dir: relDir }));
} else {
  console.log(parentId
    ? `this ${kind} mark nests under ${parentId}  (${relParent}/)`
    : `this ${kind} mark stands on open ground  (${relParent}/)`);
  if (relDir) console.log(`its record belongs at: ${relDir}/mark.md`);
  else console.log(`add --slug <kebab-case> to get the full path`);
}

if (flag("--scaffold")) {
  if (!dir) die("--scaffold needs --slug", "the directory is <parent>/<slug>/");
  const template = join(ROOT, "WORLD", "TEMPLATE-mark.md");
  const body = existsSync(template) ? readFileSync(template, "utf8") : "---\nkind: \nby: \ntier: market\ndate: \n---\n\n";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mark.md"), body);
  console.log(`scaffolded ${relDir}/mark.md from the template — fill it, then run mark-lint`);
}
