#!/usr/bin/env node
// parcel-image-pointer — plant the household's HOME picture on the PARCEL mark,
// as a POINTER (`image:`), never as bytes.
//
// THE RULING THIS SERVES (Keemin, 2026-09-09, the atlas sitting): "the parcel
// mark is a resident's home … the home image is the parcel mark's image,
// uploaded through the media door like any mark image" — and the correction
// the same hour: "build less: the mark carries POINTERS; `world_investigate`
// and the site RESOLVE the pointer." This supersedes, for the parcel, the
// 08-21 placement that hung the same picture on the HOME mark
// (tools/home-image-backfill.mjs: "the image rides the DWELLING, never the
// parcel"). Both states are on the record; this tool does not remove the
// dwelling's copy — a second surface reading the home mark keeps working.
//
// THE FIELD IS THE PRECEDENT, NOT A NEW ONE. `image:` is the media-shelf
// pointer the record already has (tools/mark-lint.mjs §2.5, 2026-08-15) with
// a full chain of readers: the lint, marks-fold → WORLD/world-state.json, the
// engine's investigate (tools/world-verbs.mjs), the office's world_investigate,
// and spectator/viewer.mjs. SCHEMA.md's reserved `slot: face` predicate names
// the same idea with zero instances and zero readers; a value planted there
// would be the value-with-no-reader class.
//
// WHAT READS THE VALUE THIS WRITES: marks-fold.mjs carries `image` into
// world-state.json; spectator/viewer.mjs § the parcel-art layer draws it at
// the parcel (parcelArtSVG); the office resolves it (world_investigate
// with_pointers). Name the reader or do not write the value.
//
// THE SHELF IS THE ONLY MINT (law 4 of the home-images lane, kept): a URL the
// office's shelf did not issue refuses the whole run before a single file is
// touched. A RESIDENT-HUNG IMAGE IS NEVER OVERWRITTEN (law 3, kept): a parcel
// already carrying `image:` is left exactly as it is, silently — the same rule
// makes a second run a no-op, which is the idempotence.
//
// THE JOIN IS THE PARCEL'S OWN AUTHOR. The frame says the parcel IS that
// resident's home, so the picture is the parcel author's own HOME lead image
// (tools/home-image-select.mjs names it) and never a housemate's: a house of
// five residents has five parcels and five pictures, not one picture five
// times. A parcel whose author has no lead image is NAMED and skipped.
//
// Input: a JSON map { <parcel id>: <shelf url> } — or the join file this lane
// writes ({ rows: [{ parcel, pointer }] }).
//
//   node tools/parcel-image-pointer.mjs --pointers <file.json> [--dry]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { SHELF_URL, withImageField } from "./home-image-backfill.mjs";

/** The offenders, so the caller refuses the RUN rather than the row. */
export function nonShelfPointers(pointers) {
  return Object.entries(pointers).filter(([, u]) => !SHELF_URL.test(String(u ?? "").trim()));
}

/** Read either input shape into { parcelId: url }. */
export function pointersFrom(doc) {
  if (Array.isArray(doc?.rows)) {
    const out = {};
    for (const r of doc.rows) if (r?.parcel && r?.pointer && !r.existing_image) out[r.parcel] = r.pointer;
    return out;
  }
  return Object.fromEntries(Object.entries(doc ?? {}).filter(([, v]) => typeof v === "string"));
}

export function planPointers(pointers, marks) {
  const byId = new Map(marks.map((m) => [m.id, m]));
  const write = [], keep = [], notParcel = [], missing = [];
  for (const id of Object.keys(pointers).sort()) {
    const m = byId.get(id);
    if (!m) { missing.push(id); continue; }
    if (m.kind !== "parcel") { notParcel.push({ id, kind: m.kind }); continue; }
    if (m.image != null && String(m.image).trim()) { keep.push({ id, image: m.image }); continue; }
    write.push({ id, dir: m._dir, url: pointers[id] });
  }
  return { write, keep, notParcel, missing };
}

/** The write, re-reading the FILE so a stale fold can never overwrite a real image. */
export function applyPointers(write, { dry = false, read = readFileSync, save = writeFileSync } = {}) {
  const wrote = [], keptAtWrite = [];
  for (const row of write) {
    const path = join(row.dir, "mark.md");
    const next = withImageField(read(path, "utf8"), row.url);
    if (next === null) { keptAtWrite.push(row.id); continue; }
    if (!dry) save(path, next);
    wrote.push(row.id);
  }
  return { wrote, keptAtWrite };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const DRY = argv.includes("--dry");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const FILE = opt("--pointers", null);
  if (!FILE) { console.error("usage: node tools/parcel-image-pointer.mjs --pointers <file.json> [--dry]"); process.exit(2); }
  const pointers = pointersFrom(JSON.parse(readFileSync(FILE, "utf8")));
  const bad = nonShelfPointers(pointers);
  if (bad.length) {
    console.error(`REFUSING THE RUN: ${bad.length} pointer(s) are not the town's own shelf — the shelf is the only mint:`);
    for (const [id, u] of bad) console.error(`  ✗ ${id}  ${JSON.stringify(String(u).slice(0, 120))}`);
    process.exit(1);
  }
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const plan = planPointers(pointers, marks);
  const { wrote, keptAtWrite } = applyPointers(plan.write, { dry: DRY });
  console.log(`${DRY ? "[dry] " : ""}${wrote.length} parcel marks ${DRY ? "would take" : "took"} their household's HOME picture as a pointer:`);
  for (const row of plan.write) if (wrote.includes(row.id)) console.log(`  ✓ ${row.id}\n      ${row.url}\n      ${relative(ROOT, join(row.dir, "mark.md")).split("\\").join("/")}`);
  console.log(`\nalready carrying an image — untouched (${plan.keep.length + keptAtWrite.length}):`);
  for (const row of plan.keep) console.log(`  · ${row.id}  ${row.image}`);
  for (const id of keptAtWrite) console.log(`  · ${id}  (the file carries one the fold did not show)`);
  if (plan.notParcel.length) { console.log(`\nnot a parcel — refused (${plan.notParcel.length}):`); for (const r of plan.notParcel) console.log(`  ✗ ${r.id}  kind: ${r.kind}`); }
  if (plan.missing.length) console.log(`\nno such mark (${plan.missing.length}): ${plan.missing.join(", ")}`);
  console.log(`\nnext: node tools/mark-lint.mjs && node tools/marks-fold.mjs && node --test "tools/*.test.mjs"`);
}
