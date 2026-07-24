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
import { loadMarks } from "./marks-fold.mjs";
import { rect, contains, overlapArea } from "./geometry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DRY = process.argv.includes("--dry");
const DATE = "2026-07-24"; // the ruling day — a seed is an event, not a wall-clock
const MARGIN = 12;         // metres of ground beyond the house, each dimension
const MIN = 25;            // the schema's parcel default

const manifest = JSON.parse(readFileSync(join(ROOT, "seeding/manifest.json"), "utf8"));
const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
const byId = new Map(marks.map((m) => [m.id, m]));
const sited = marks.filter((m) => m.kind === "sited" && m.at && !m.far);

const cap150 = (s, what) => {
  if (s.length > 150) throw new Error(`${what} body ${s.length} chars > 150: ${s}`);
  return s;
};
const boxOf = (at, ext) => rect({ at, extent: ext });

const seeded = [], skipped = [], shrunk = [], planned = [];
const households = new Set();

for (const h of manifest.homes) {
  const id = `${h.household}/${h.home_id}`;
  const home = byId.get(id);
  if (!home) { skipped.push(`${id} — no mark in the tree`); continue; }
  if (home.far) { skipped.push(`${id} — far: horizon object, no ground to claim`); continue; }
  if (households.has(h.household)) { skipped.push(`${id} — household already holds a parcel this run`); continue; }

  const hr = rect(home);
  const parent = home._parentMarkId ? byId.get(home._parentMarkId) : null;
  const tryExt = [
    { w: Math.max(hr.w + MARGIN, MIN), h: Math.max(hr.h + MARGIN, MIN) },
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
at: { x: ${p.at.x}, y: ${p.at.y} }
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
  if (!DRY) {
    if (existsSync(join(p.dir, "mark.md"))) { skipped.push(`${p.id} — already exists, untouched`); continue; }
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
