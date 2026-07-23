#!/usr/bin/env node
// mark-lint.mjs — the pre-flight gate for WORLD/marks/ (MARKS.md § Leaving a mark;
// 07-22 nesting ruling). Reads the nested marks the same way the fold does
// (shared loadMarks + the shared `contains`), then holds every record to the
// on-disk schema (WORLD/marks/SCHEMA.md). Deterministic, read-only — it reports,
// it never edits.
//
//   node tools/mark-lint.mjs                 # lint WORLD/marks against the terrain tier
//   node tools/mark-lint.mjs --marks-dir d --terrain t.json
//
// A gate, not a nudge: it exits non-zero on any ERROR (the seeding fleet and the
// hand-authored PR path both pre-flight against it, so a malformed mark fails
// with the exact fix before it ever lands). WARNs are advisory and never fail it.
//
// The heart of it is the edge check: a mark nested inside another's directory
// asserts an edge — contained-by (sited) or predicated-on (predicated|naming).
// For a nested SITED mark the enclosing mark must GEOMETRICALLY contain it, by
// the very same `contains` the fold uses. You cannot lie with an edge.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, rect, contains } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const MARKS_DIR = opt("--marks-dir", join(ROOT, "WORLD/marks"));
const TERRAIN_PATH = opt("--terrain", join(ROOT, "WORLD/skeleton.json"));
// --scope <subtree>: the fleet writes sibling dirs concurrently, so a full-tree
// lint mid-fleet would trip on another agent's half-written dir. Scoped mode
// still LOADS the whole tree (ancestor edges resolve; the-town leaf collisions
// across siblings are still caught) but REPORTS/gates only on marks under the
// scope. e.g. --scope WORLD/marks/let-there-be-light/<region-slug>
const SCOPE = opt("--scope", null);
const scopeRel = SCOPE ? resolve(SCOPE).replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : null;

const KINDS = new Set(["sited", "predicated", "naming", "parcel"]);
const TIERS = new Set(["constitution", "sovereignty", "market"]); // v2 protection tiers
const TOWN = "the-town"; // the town-tier author; only it may claim constitution
const CONTAINERS = new Set(["sited", "parcel"]); // only extented things contain or carry
const BODY_MAX = 150; // chars (07-22 ruling)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const findings = [];
const at = (rec) => (rec._dir ? rec._dir.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : rec.id ?? "?");
const err = (rec, msg) => findings.push({ sev: "ERROR", file: at(rec), msg });
const warn = (rec, msg) => findings.push({ sev: "WARN", file: at(rec), msg });

// terrain ids the tier exposes for `parent: terrain:<id>` attachment
const terrain = existsSync(TERRAIN_PATH) ? JSON.parse(readFileSync(TERRAIN_PATH, "utf8")) : { features: [], far_features: [] };
const TERRAIN_IDS = new Set([...(terrain.features ?? []), ...(terrain.far_features ?? [])].map((f) => f.id));

const num = (v) => typeof v === "number" && Number.isFinite(v);
const hasGeom = (rec) => rec.at && num(rec.at.x) && num(rec.at.y) && rec.extent && num(rec.extent.w) && num(rec.extent.h);

const marks = loadMarks(MARKS_DIR);
const byId = new Map();
const slugsByHousehold = new Map();
const childCount = new Map();
for (const m of marks) {
  if (m._parentMarkId) childCount.set(m._parentMarkId, (childCount.get(m._parentMarkId) ?? 0) + 1);
}

for (const rec of marks) {
  // 0. unreadable frontmatter — nothing else can be trusted
  if (rec._error) { err(rec, `unreadable mark.md: ${rec._error}`); continue; }

  // 1. identity: valid kind, authorship (by), path-safe slug unique per author, tier, date
  if (!KINDS.has(rec.kind)) { err(rec, `kind must be one of ${[...KINDS].join(" | ")} (got ${JSON.stringify(rec.kind)})`); }
  if (rec.by == null) err(rec, `by: <author> is required — in the spatial tree (v2) authorship is frontmatter, not the path`);
  if (!SLUG_RE.test(rec.slug)) err(rec, `slug "${rec.slug}" must be lowercase-hyphenated (it is the directory name and the leaf of the id)`);
  if (byId.has(rec.id)) err(rec, `duplicate id "${rec.id}" — a leaf slug must be unique per author (by)`);
  byId.set(rec.id, rec);
  // tier: valid, and constitution belongs to the town alone
  if (!TIERS.has(rec.tier)) err(rec, `tier must be one of ${[...TIERS].join(" | ")} (got ${JSON.stringify(rec.tier)})`);
  if (rec.tier === "constitution" && rec.by !== TOWN) err(rec, `tier: constitution is the town's — only by: ${TOWN} may claim it (a market mark cannot bind without stamps)`);
  if (!rec.date || !DATE_RE.test(String(rec.date))) warn(rec, `date should be YYYY-MM-DD (got ${JSON.stringify(rec.date)})`);

  // 2. stray legacy fields the tree no longer owns (authorship is `by:` now)
  if (rec._stray?.household != null)
    warn(rec, `legacy household "${rec._stray.household}" — authorship is the by: field now (drop household)`);
  if (rec._stray?.mark != null && rec._stray.mark !== rec.slug)
    warn(rec, `frontmatter mark "${rec._stray.mark}" disagrees with the directory "${rec.slug}" (the directory is the slug — drop the field)`);
  if (rec.stamps !== undefined) warn(rec, `stamps are ledger-derived, never stored in the record — drop the field`);

  // 3. body: present, present-tense, and short (the ruling's 150-char cap)
  const bodyLen = [...String(rec.body ?? "").trim()].length;
  if (bodyLen === 0) warn(rec, `empty body — a mark is an observation; give it one line`);
  else if (bodyLen > BODY_MAX) err(rec, `body is ${bodyLen} chars; the cap is ${BODY_MAX} (MARKS.md 07-22 ruling)`);

  // 3b. provenance: office/fleet pre-marks translate a resident's OWN words, so
  // they must cite the source and quote it (MARKS.md membrane; fleet contract).
  const isPre = rec.pre === true || rec.pre === "true";
  if (isPre) {
    const df = rec.derived_from == null ? "" : String(rec.derived_from).trim();
    if (!df) err(rec, `pre: true marks must carry derived_from: <source path> — "<verbatim quote>"`);
    else if (!/[/.]/.test(df) || !/["“”]|—/.test(df)) warn(rec, `derived_from should name a source path AND a verbatim quote (got: ${df.slice(0, 60)})`);
  } else if (rec.derived_from !== undefined) {
    warn(rec, `derived_from is set but pre is not true — set pre: true or drop derived_from`);
  }

  // 4. kind-specific shape
  if (rec.kind === "sited" || rec.kind === "parcel") {
    if (rec.kind === "sited" && !hasGeom(rec)) err(rec, `sited marks need at {x,y} and extent {w,h} in grid meters`);
    if (rec.kind === "parcel" && rec.at == null) err(rec, `parcel marks need at {x,y} (extent defaults to 25x25)`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `${rec.kind} marks carry no slot/value (those are for predicated/naming)`);
    if (rec._explicitParent) err(rec, `${rec.kind} marks never declare a parent — containment is computed from geometry, not authored`);
  } else if (rec.kind === "predicated" || rec.kind === "naming") {
    if (rec.at !== undefined || rec.extent !== undefined) err(rec, `${rec.kind} marks carry no at/extent — they take their locus from their parent`);
    if (rec.kind === "predicated" && (rec.slot === undefined || rec.value === undefined)) err(rec, `predicated marks need slot and value`);
    if (rec.kind === "naming" && rec.value === undefined) err(rec, `naming marks need value (the name); slot is implicitly "name"`);
    if (rec.kind === "naming" && rec.slot !== undefined && rec.slot !== "name") warn(rec, `naming marks use slot "name" (or omit it); got "${rec.slot}"`);
    // parent source: nested (implicit) XOR explicit terrain — exactly one
    const nested = rec._parentMarkId != null;
    const explicit = rec._explicitParent != null;
    if (nested && explicit) err(rec, `nested marks must not also declare a parent — the enclosing directory is the parent`);
    else if (!nested && !explicit) err(rec, `a top-level ${rec.kind} mark must declare parent: terrain:<id>, or be nested under the mark it describes`);
    if (explicit) {
      if (!/^terrain:/.test(String(rec._explicitParent))) err(rec, `an authored parent may only be a terrain feature (terrain:<id>); to attach to a mark, nest under its directory`);
      else {
        const tid = String(rec._explicitParent).slice("terrain:".length);
        if (!TERRAIN_IDS.has(tid)) err(rec, `parent terrain:${tid} names no terrain feature (WORLD/skeleton.json)`);
      }
    }
  }

  // 5. the edge: a mark that carries children must be a container
  if ((childCount.get(rec.id) ?? 0) > 0 && !CONTAINERS.has(rec.kind))
    err(rec, `a ${rec.kind} mark cannot contain child marks — only sited/parcel marks do (move the children out)`);
}

// 6. the nesting edge itself — "you cannot lie with an edge"
for (const rec of marks) {
  if (rec._error || rec._parentMarkId == null) continue;
  if (rec.far) continue; // a horizon object (Pando) sits beyond the ground extent by construction (decision 008)
  const parent = byId.get(rec._parentMarkId);
  if (!parent) { err(rec, `nested under "${rec._parentMarkId}", which has no readable mark.md`); continue; }
  if (!CONTAINERS.has(parent.kind)) continue; // already reported on the parent (§5)
  if (rec.kind === "sited") {
    if (!contains(rect(parent), rect(rec)))
      err(rec, `the directory nests this inside "${parent.id}", but its footprint is not contained by "${parent.id}" — you cannot lie with an edge (site it inside, or move it out)`);
  }
}

// ---- report (lint.mjs idiom: sort, print, exit non-zero only on ERROR) ----
// scoped mode: the whole tree was loaded (edges + cross-author leaf uniqueness
// still checked), but only findings under the scope are reported/gated.
const reported = scopeRel ? findings.filter((f) => f.file.startsWith(scopeRel)) : findings;
const scopedMarks = scopeRel ? marks.filter((m) => at(m).startsWith(scopeRel)).length : marks.length;
const order = { ERROR: 0, WARN: 1 };
reported.sort((a, b) => (order[a.sev] - order[b.sev]) || a.file.localeCompare(b.file));
console.log(`Linted ${scopedMarks} mark(s)${scopeRel ? ` under ${scopeRel}` : ` under ${MARKS_DIR.replace(/\\/g, "/").replace(/^.*\/(WORLD\/marks)$/, "$1")}`}.\n`);
if (!reported.length) console.log("CLEAN — every mark is well-formed and no edge lies.");
else {
  for (const f of reported) console.log(`[${f.sev}] ${f.file}: ${f.msg}`);
  const e = reported.filter((f) => f.sev === "ERROR").length;
  const w = reported.filter((f) => f.sev === "WARN").length;
  console.log(`\n${e} error(s), ${w} warning(s).`);
}
process.exit(reported.some((f) => f.sev === "ERROR") ? 1 : 0);
