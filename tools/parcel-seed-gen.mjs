#!/usr/bin/env node
// parcel-seed-gen — seed one parcel per placed home, BY EXTRACTION from the
// seeding manifest (the world-root-gen pattern: generated, never hand-typed).
//
// The homes ruling (Keemin, 2026-07-24): sovereignty is earned by ground — the
// fold derives `sovereign` from parcel containment, and no parcels existed, so
// the sovereignty tier protected nothing. This tool lands the ground:
//   • one `kind: parcel` mark per placed manifest home (by: the household,
//     centered on the home, home extent + margin, clamped by the checks below),
//     written as a SIBLING of the home's directory (containment is geometric,
//     not tree-positional, for the fold's sovereignty test — re-homing the
//     house dir under its parcel is a follow-up, ids unchanged either way);
//   • one `slot: home` predicate nested under each parcel, naming the house it
//     grounds — home-ness enters the record's own idiom, and the manifest can
//     retire toward build-history.
//
// Checks (fail loud, never silently misclaim):
//   1. tree parent must still contain the parcel (lint's edge law) — else the
//      margin shrinks to the home's own extent;
//   2. a parcel must not overlap any OTHER household's sited mark — a claim is
//      your ground, never a land grab — same fallback;
//   3. parcels never overlap each other and one household holds at most one
//      (the fold's admissibility law, enforced here before it errors there).
//
// Run from the repo root:  node tools/parcel-seed-gen.mjs [--dry]
// Then: node tools/mark-lint.mjs && node tools/marks-fold.mjs && node --test …

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, declaredCoords, COORDS_RELATIVE } from "./marks-fold.mjs";
import { rect, contains, overlapArea } from "./geometry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DRY = process.argv.includes("--dry");
// The ruling day — a seed is an event, not a wall-clock. 2026-07-24 was the
// homes ruling (the original grounding run); pass --date for a later ruling's
// run (2026-08-04: the confirmation-sweep backfill, "seed all the un-seeded").
const dateArgAt = process.argv.indexOf("--date");
const DATE = dateArgAt > -1 ? process.argv[dateArgAt + 1] : "2026-07-24";
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error(`--date wants YYYY-MM-DD, got: ${DATE}`);
// A PARCEL IS 25×25, NO EXCEPTIONS (Keemin, 2026-08-08 — surgery on the
// margin arithmetic that had minted nine 26×25 parcels for 14m-wide houses:
// house+MARGIN outgrew the dial and quietly made two shapes of parcel where
// the 07-31 ruling "a resident declares where, never how big" means one).
// A house that cannot fit inside 25×25 is surfaced loudly for a mind, never
// auto-grown around.
const MIN = 25;            // = PARCEL_EXTENT_M, the one lawful parcel size

const manifest = JSON.parse(readFileSync(join(ROOT, "seeding/manifest.json"), "utf8"));
const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
// The v3 frame (SCHEMA § The frame, 2026-08-09): a bound mark's `at:` is an
// OFFSET from its parent's centre, and loadMarks composes to world. This tool
// predates the frame and wrote the composed WORLD number back into the file —
// every parcel minted into a nested container landed offset by its parent's
// whole centre (ryuu's 08-10 parcel rides ~35 m off its anchor from this seam;
// caught 2026-09-01 when the confirmation-sweep drain resumed). `p.at` stays
// world for every geometry check below; `p.fileAt` is the number the FILE
// carries — parent-relative in a relative tree, world otherwise.
const REL = declaredCoords(marks) === COORDS_RELATIVE;
const byId = new Map(marks.map((m) => [m.id, m]));
const sited = marks.filter((m) => m.kind === "sited" && m.at && !m.far);

const cap150 = (s, what) => {
  if (s.length > 150) throw new Error(`${what} body ${s.length} chars > 150: ${s}`);
  return s;
};
const boxOf = (at, ext) => rect({ at, extent: ext });

const seeded = [], skipped = [], shrunk = [], planned = [];
const households = new Set();

// One question, one owner: "does this household hold a parcel" is answered by
// the RECORD (a kind: parcel mark by that household, wherever it sits in the
// tree) — never by path arithmetic. The old exists-guard checked a computed
// sibling path, and the re-homing follow-up (house dirs moved INSIDE their
// parcels: merrick, aion, …) moved the real parcels out from under it — the
// tool would have double-minted a nested parcel for every re-homed household
// (caught 2026-08-04 on the first honest dry run).
const parcelHolders = new Set(marks.filter((m) => m.kind === "parcel" && m.by).map((m) => m.by));

// Same cure for the lookup: the manifest's home_id and the mark tree's dir
// leaf can drift (east-facing-window's home mark is the-cathedral-at-east-
// window). When the id join misses, fall back to the household's SOLE sited
// mark — sole, because two sited marks make the choice a judgment, and this
// tool does no judgment.
const sitedByHousehold = new Map();
for (const m of sited) {
  if (!sitedByHousehold.has(m.by)) sitedByHousehold.set(m.by, []);
  sitedByHousehold.get(m.by).push(m);
}

for (const h of manifest.homes) {
  const id = `${h.household}/${h.home_id}`;
  if (parcelHolders.has(h.household)) { skipped.push(`${id} — household already holds a parcel on the record`); continue; }
  let home = byId.get(id);
  if (!home) {
    const own = sitedByHousehold.get(h.household) ?? [];
    if (own.length === 1) home = own[0];
    else if (own.length > 1) {
      // Still arithmetic, not judgment: the manifest's confirmed coordinate
      // identifies the home among many sited marks — the atlas anchor IS the
      // house (east-facing-window: home_id drifted from the dir leaf, but her
      // cathedral sits exactly at the manifest grid_m). Exactly one match or
      // we refuse.
      const atSpot = own.filter((m) => m.at && m.at.x === h.grid_m.x && m.at.y === h.grid_m.y);
      if (atSpot.length === 1) home = atSpot[0];
      else { skipped.push(`${id} — id join missed; household holds ${own.length} sited marks and ${atSpot.length} sit at the manifest coordinate; picking one is a judgment, not arithmetic`); continue; }
    }
  }
  if (!home) { skipped.push(`${id} — no mark in the tree`); continue; }
  if (home.far) { skipped.push(`${id} — far: horizon object, no ground to claim`); continue; }
  if (households.has(h.household)) { skipped.push(`${id} — household already holds a parcel this run`); continue; }

  const hr = rect(home);
  const parent = home._parentMarkId ? byId.get(home._parentMarkId) : null;
  if (hr.w > MIN || hr.h > MIN) { skipped.push(`${id} — house ${hr.w}×${hr.h} exceeds the ${MIN}×${MIN} parcel law; needs a mind, not a bigger parcel`); continue; }
  const tryExt = [
    { w: MIN, h: MIN }, // the law: 25×25, no exceptions
    { w: hr.w, h: hr.h }, // fallback: exactly the house's own footprint
  ];

  let chosen = null, why = null;
  for (const ext of tryExt) {
    const box = boxOf(home.at, ext);
    if (parent && !parent.far && !contains(rect(parent), box)) { why = "parent edge"; continue; }
    // a foreign mark that CONTAINS the parcel is a container (region, reach, the
    // world-root) — nesting, not grabbing; only a straddling/inside peer refuses.
    const grab = sited.find((m) => m.by !== h.household && overlapArea(box, rect(m)) > 0 && !contains(rect(m), box));
    if (grab) { why = `foreign mark ${grab.id}`; continue; }
    const clash = planned.find((p) => overlapArea(boxOf(p.at, p.extent), box) > 0);
    if (clash) { why = `parcel clash ${clash.id}`; continue; }
    chosen = ext; break;
  }
  if (!chosen) { skipped.push(`${id} — no admissible parcel (${why})`); continue; }
  if (chosen !== tryExt[0]) shrunk.push(`${id} — margin refused (${why}), parcel = house footprint`);

  households.add(h.household);
  const slug = `${h.home_id}-parcel`;
  planned.push({
    id: `${h.household}/${slug}`, at: home.at, extent: chosen,
    fileAt: (REL && parent && !parent.far) ? { x: home.at.x - parent.at.x, y: home.at.y - parent.at.y } : home.at,
    dir: join(dirname(home._dir), slug),
    household: h.household, home_id: h.home_id, title: h.title || h.home_id,
    status: h.placement_status ?? "placed",
  });
}

for (const p of planned) {
  const parcelMd = `---
by: ${p.household}
kind: parcel
date: ${DATE}
at: { x: ${p.fileAt.x}, y: ${p.fileAt.y} }
extent: { w: ${p.extent.w}, h: ${p.extent.h} }
pre: true
derived_from: seeding/manifest.json — "${p.home_id} at grid_m {x: ${p.at.x}, y: ${p.at.y}} · placement_status: ${p.status}"
---

${cap150(`The ground ${p.title} stands on — ${p.household}'s claim, held on the record.`, p.id)}
`;
  const predMd = `---
by: ${p.household}
kind: predicated
date: ${DATE}
slot: home
value: ${p.home_id}
pre: true
derived_from: seeding/manifest.json — "household: ${p.household} · home_id: ${p.home_id}"
---

${cap150(`This ground is ${p.household}'s home — ${p.title} stands on it.`, p.id + "/home")}
`;
  // The exists-check runs in BOTH modes — a dry run that lists already-standing
  // parcels as "seeded" is a plan that diverges from the act (caught 2026-08-04:
  // the dry list claimed 26 when most already stood).
  if (existsSync(join(p.dir, "mark.md"))) { skipped.push(`${p.id} — already exists, untouched`); continue; }
  if (!DRY) {
    mkdirSync(join(p.dir, "home"), { recursive: true });
    writeFileSync(join(p.dir, "mark.md"), parcelMd);
    writeFileSync(join(p.dir, "home", "mark.md"), predMd);
  }
  seeded.push(`${p.id}  ${p.extent.w}x${p.extent.h} @ (${p.at.x},${p.at.y})`);
}

console.log(`${DRY ? "[dry] " : ""}seeded ${seeded.length} parcels (+${seeded.length} home predicates):`);
for (const s of seeded) console.log("  ✓", s);
if (shrunk.length) { console.log(`shrunk ${shrunk.length}:`); for (const s of shrunk) console.log("  ▾", s); }
if (skipped.length) { console.log(`skipped ${skipped.length}:`); for (const s of skipped) console.log("  ✗", s); }
if (!seeded.length) { console.error("nothing seeded — refusing to call that success"); process.exit(1); }
