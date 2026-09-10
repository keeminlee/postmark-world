#!/usr/bin/env node
// world-root-gen.mjs — generate the root mark + the terrain marks, BY EXTRACTION
// from WORLD/skeleton.json (never hand-typed; sibling of
// world-terrain-gen.mjs). Deterministic and idempotent: re-running rewrites the
// same records. These are committed as records — the constitution tier of the
// one spatial tree (schema v2, 07-22-night ruling).
//
//   node tools/world-root-gen.mjs            # write WORLD/marks/let-there-be-light/**
//   node tools/world-root-gen.mjs --dry      # print what it would write
//
// RULINGS THIS OBEYS:
// - The root mark is `let-there-be-light`: by: the-town, tier: constitution,
//   extent = the whole world, body = the charter establishing line.
// - Terrain features become marks UNDER it (river, seas, lochan, garrison lake,
//   locks, coasts, upward falls, Pando, ferry's route), by: the-town, tier:
//   constitution. Two-precision geometry: the mark carries a COARSE bounding
//   rect as the CLAIM and a `feature: <skeleton-feature-id>` link; skeleton.json
//   remains beneath as the precise survey (followable through that link).
// - `by: the-town` is the town-tier author (flagged reviewable — Wright's call)
//   for the features the town still holds. A feature whose MARK has passed to a
//   household is SPOKEN FOR and is not regenerated — see the transferred-ground
//   gate below (founder-ruled 2026-09-10).
// - Pando is a horizon object, not heightfield ground (decision 008): its mark
//   carries `far: true`, and the containment check exempts it (it sits beyond
//   the world's ground extent by construction).

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COORDS_FIELD, COORDS_RELATIVE, parseRecord } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DRY = process.argv.includes("--dry");
const SKELETON = join(ROOT, "WORLD/skeleton.json");
const ALL_MARKS = join(ROOT, "WORLD/marks");
const MARKS_ROOT = join(ROOT, "WORLD/marks/let-there-be-light");
const TODAY = "2026-07-22"; // the ruling date — deterministic, not wall-clock

const skeleton = JSON.parse(readFileSync(SKELETON, "utf8"));

// ---- the frame gate (SCHEMA § The frame) -------------------------------------
// This generator rewrites the root's record wholesale from the field list in
// writeRootAndTerrain(), and writes each terrain mark WHERE IT LIVES — which
// under the relative frame means writing a nested mark's `at:` in its parent's
// frame, not the world's. It knows neither thing yet, so against a v3 tree it
// would (1) drop the root's `coords:` line, silently re-reading every nested
// mark's offset as a world position, and (2) plant relocated terrain at world
// numbers inside a parent's frame. Both would print success. So it stops here
// instead, and says what it would take to let it run.
const ROOT_RECORD = join(MARKS_ROOT, "mark.md");
if (existsSync(ROOT_RECORD)
  && new RegExp(`^${COORDS_FIELD}:\\s*${COORDS_RELATIVE}\\s*$`, "m").test(readFileSync(ROOT_RECORD, "utf8"))) {
  console.error(`world-root-gen: REFUSING — this tree declares ${COORDS_FIELD}: ${COORDS_RELATIVE} and this generator still writes world coordinates.

  Re-running it would rewrite ${ROOT_RECORD.replace(/\\/g, "/").replace(/^.*\/(WORLD\/)/, "$1")}
  without its ${COORDS_FIELD}: line — un-declaring the frame for the whole tree — and
  write every relocated terrain mark's at: in the world's frame inside a parent's.

  To regenerate the root and terrain under the relative frame this tool must
  first learn the transform: load the tree, take each write target's _origin,
  and emit worldToFile(at, _origin). Both live in tools/marks-fold.mjs.`);
  process.exit(1);
}

// ---- location-aware writes (07-23, post-nesting) -----------------------------
// The tree ruling nests marks under their geometric containers, so a terrain
// mark's dir may live anywhere beneath the root (aelyria-cliffs under aelyria's
// canopy; the-locks under the-long-run). Rewrite each mark WHERE IT LIVES; only
// a genuinely new mark is created at the root. Never emit a flat duplicate.
function indexExistingDirs() {
  // Keyed by slug, but ONLY for the-town-authored records — slugs are unique per
  // author, and this generator writes nothing else. (finn/the-still-reach nests
  // inside the-town/the-still-reach with the same leaf name; without the author
  // check the index would point the town's record at finn's house.)
  const bySlug = new Map();
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (!st.isDirectory()) continue;
      const r = rel ? `${rel}/${e}` : e;
      const mp = join(p, "mark.md");
      if (existsSync(mp) && /^by:\s*the-town\s*$/m.test(readFileSync(mp, "utf8")))
        bySlug.set(e, r);
      walk(p, r);
    }
  };
  if (existsSync(MARKS_ROOT)) walk(MARKS_ROOT, "");
  return bySlug;
}
const EXISTING = indexExistingDirs();

// ---- the transferred-ground gate (founder-ruled 2026-09-10) ------------------
// "the inlet is terrain; everything else is just a mark, and belongs to the
// resident/household." A terrain mark may pass out of the town's hand by the
// DEC-16 transfer act: the SURVEY beneath it stays the town's — the skeleton
// entry, its geometry, its kind, everything this file extracts from — but the
// CLAIM over that ground is now a household's record, and this generator has no
// business rewriting it.
//
// WHAT GOES WRONG WITHOUT THIS GATE, measured on the first three (merrick's
// footbridge, stone path and grove, 2026-09-10). indexExistingDirs() above
// indexes ONLY `by: the-town` records, so a transferred mark drops out of it and
// writeMarkRaw() falls back to `relDir` — the bare feature id at the root:
//
//   a mark ALREADY at the root (the grove, the stone path) is silently
//   OVERWRITTEN, the household's record replaced by a town-authored one;
//   a NESTED mark (the footbridge, under the inlet) gets a TWIN planted at the
//   root while the household's copy stays where it is.
//
// Both print success. Neither is visible until someone reads the tree.
//
// KEYED ON THE `feature:` LINK, not on the slug. The link is the join between
// the coarse claim and the precise survey (SCHEMA § the two-precision link), it
// survives a transfer by that section's own ruling, and it is how the other
// generator finds a record too (water-shapes-gen's recordPathFor). A slug key
// could not do this job: `finn/the-still-reach` shares a leaf with the town's
// own reach and would falsely gate it, which is the very confusion the index
// above keeps its author check to avoid.
//
// The walk is over ALL of WORLD/marks, not just the root: a fossil transfer
// leaves the directory in place (the freeze), but a post-freeze terrain mark
// would file at WORLD/marks/<household>/<slug>, outside MARKS_ROOT entirely.
//
// THE FIELD IS READ FROM THE FRONTMATTER, NOT FOUND IN THE FILE (hardened
// 2026-09-10, on review). A `/^feature:.../m` scan over the whole text also
// matches a line in a BODY, and this gate turns that into a refusal to write:
// a passer-by's ordinary mark whose prose happens to contain a line reading
// `feature: blackwater-bend-grove` would make the generator decline to write
// the town's own grove and say the grove was spoken for. So the record is
// parsed and the field is read where the schema puts it. (The same looseness
// still sits in water-shapes-gen's recordPathFor, which this gate is otherwise
// modelled on; it is noted rather than fixed here, being that tool's own.)
//
// AND A FEATURE IS CLAIMED ONCE. recordPathFor refuses on `hits.length !== 1`
// for exactly this reason: two records claiming one survey entry is an
// ambiguous world, and a silent last-wins would pick a winner by directory
// order. Two claims on one feature is the twin condition this gate exists to
// prevent, so meeting one already planted is a refusal, not a shrug.
function indexFeatureClaims() {
  const claims = new Map();                  // feature id -> [{ by, slug, rel }]
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (!st.isDirectory()) continue;
      const mp = join(p, "mark.md");
      if (existsSync(mp)) {
        let rec = null;
        try { rec = parseRecord(readFileSync(mp, "utf8"), mp); } catch { /* malformed: §1's error, not this gate's */ }
        const feat = rec?.feature;
        if (feat != null && rec.by != null) {
          const key = String(feat);
          if (!claims.has(key)) claims.set(key, []);
          claims.get(key).push({ by: String(rec.by), slug: e, rel: p.replace(/\\/g, "/").slice(ROOT.length + 1) });
        }
      }
      walk(p);
    }
  };
  if (existsSync(ALL_MARKS)) walk(ALL_MARKS);
  return claims;
}
const CLAIMS = indexFeatureClaims();
{
  const doubled = [...CLAIMS].filter(([, v]) => v.length > 1);
  if (doubled.length) {
    console.error(`world-root-gen: REFUSING — ${doubled.length} terrain feature(s) are claimed by more than one record. A feature is surveyed once and claimed once; two claims is the twin condition this generator's transferred-ground gate exists to prevent, and picking a winner by directory order would bury it.\n`);
    for (const [feature, recs] of doubled)
      console.error(`  ${feature}\n${recs.map((r) => `    ${r.by}/${r.slug}  (${r.rel})`).join("\n")}`);
    console.error(`\n  Withdraw or re-point the duplicate claim, then re-run.`);
    process.exit(1);
  }
}
// feature id -> "<by>/<slug>", for the features whose one claimant is not the town
const TRANSFERRED = new Map(
  [...CLAIMS].filter(([, v]) => v[0].by !== "the-town").map(([k, v]) => [k, `${v[0].by}/${v[0].slug}`]),
);
const skipped = [];

// ---- coarse bounding rect from a feature's own geometry (the CLAIM) ----------
function pointsOf(f) {
  const pts = [];
  const push = (p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push(p); };
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []); // at_m is an array (locks) or an object (a point)
  for (const p of arr(f.centerline_m)) push(p);
  for (const p of arr(f.line_m)) push(p);
  for (const p of arr(f.at_m)) push(p);
  for (const p of arr(f.trees_m)) push(p);
  if (f.center_m) push(f.center_m);
  return pts;
}
function boundingRect(f) {
  const pts = pointsOf(f);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // widen by the feature's own width band + a small pad so the claim covers the body
  const wPad = Math.max(...(pts.map((p) => p.w_m ?? 0)), f.rx_m ? f.rx_m * 2 : 0, 40);
  const hPad = Math.max(f.ry_m ? f.ry_m * 2 : 0, 40);
  return {
    at: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) },
    extent: { w: Math.max(2, Math.round(maxX - minX + wPad)), h: Math.max(2, Math.round(maxY - minY + hPad)) },
  };
}

// ---- short claim body (<=150), never the long survey receipt -----------------
function claimBody(f) {
  const first = String(f.receipt ?? f.note ?? f.id).split(/[.;—]/)[0].replace(/\s+/g, " ").trim();
  const body = `${niceName(f.id)} — ${first}`;
  return body.length <= 148 ? body : body.slice(0, 147).replace(/\s+\S*$/, "") + "…";
}
const niceName = (id) => id.replace(/^the-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const written = [];

// ---- 1. the root mark --------------------------------------------------------
// extent covers the whole world INCLUDING the horizon (Pando at ~135 km), so
// every mark and terrain feature nests within it. A bounding claim, not drama.
const worldExtent = 320000; // ~±160 km: contains the on-map world and the far horizon
// Idempotent by OVERWRITE, never by rmSync: writeMarkRaw rewrites each terrain
// mark.md in place, so resident marks nested under a terrain mark (e.g. finn's
// home under the-still-reach) are preserved. (A feature removed from the skeleton
// leaves a stale mark.md — a rare manual cleanup, never worth deleting a subtree.)
writeRootAndTerrain();

function allFeatures() {
  return [...(skeleton.features ?? []), ...(skeleton.far_features ?? [])];
}

function writeRootAndTerrain() {
  // root — the light itself; its body is the charter, its mechanic the day-axis
  writeMarkRaw("", {
    kind: "sited", by: "the-town", tier: "constitution", date: TODAY,
    at: { x: 0, y: 0 }, extent: { w: worldExtent, h: worldExtent }, mechanic: "light",
  }, "Let there be light. Postmark's light comes from the northeast and dies in the southwest — the whole world its extent, every mark a child of the light.");

  // world-law predicates on the root (07-23: EVERYTHING diegetic is a mark; the
  // mechanic: field points at the machinery that keeps each law true). Values are
  // EXTRACTED from the skeleton's own numbers — never hand-typed twice.
  const LAW_DATE = "2026-07-23";
  const fogM = skeleton.elevation.fog_ceiling_m;
  const paceKm = Math.round(skeleton.elevation.walk_speed_m_per_crossing / 1000);
  writeMarkRaw("the-fog", {
    kind: "predicated", by: "the-town", tier: "constitution", date: LAW_DATE,
    slot: "fog", value: `settles below ${fogM} m; each crossing seeds its own weather`, mechanic: "fog",
  }, `The fog settles below the ${fogM}-metre line; every crossing brews its own weather, seeded by the crossing's own number.`);
  writeMarkRaw("the-fall-of-the-land", {
    kind: "predicated", by: "the-town", tier: "constitution", date: LAW_DATE,
    slot: "elevation", value: "sea = 0; the land falls from the northern rim to the southern sea", mechanic: "elevation",
  }, "All height falls from the northern rim to the southern sea; the sea is the zero every elevation is measured from.");
  writeMarkRaw("the-walking-pace", {
    kind: "predicated", by: "the-town", tier: "constitution", date: LAW_DATE,
    slot: "pace", value: `${paceKm} km per crossing`, mechanic: "pace",
  }, `A crossing's walking is ${paceKm} kilometres; the world is crossed in days, not clicks.`);
  writeMarkRaw("the-wear", {
    kind: "predicated", by: "the-town", tier: "constitution", date: LAW_DATE,
    slot: "wear", value: "anonymous per-cell wear from walking", mechanic: "wear",
  }, "Where feet repeat, a path appears. The record keeps the wear, never the walker.");

  // terrain marks, one per feature, directly under root
  for (const f of skeleton.features ?? []) {
    if (TRANSFERRED.has(f.id)) { skipped.push([f.id, TRANSFERRED.get(f.id)]); continue; } // spoken for
    const box = boundingRect(f);
    if (!box) continue; // route/sea with no point geometry: skip point-claim (survey carries them)
    writeMarkRaw(f.id, {
      kind: "sited", by: "the-town", tier: "constitution", date: TODAY,
      at: box.at, extent: box.extent, feature: f.id,
    }, claimBody(f));
  }
  // far features (Pando): horizon object, exempt from ground containment
  for (const f of skeleton.far_features ?? []) {
    if (TRANSFERRED.has(f.id)) { skipped.push([f.id, TRANSFERRED.get(f.id)]); continue; } // spoken for
    const proj = projectHorizon(f);
    writeMarkRaw(f.id, {
      kind: "sited", by: "the-town", tier: "constitution", date: TODAY, far: true,
      at: proj, extent: { w: 4000, h: 4000 }, feature: f.id,
    }, claimBody(f));
  }
}

// project a far feature onto a coarse horizon coordinate from bearing + distance
function projectHorizon(f) {
  const U = { N: [0, -1], NE: [0.7071, -0.7071], E: [1, 0], SE: [0.7071, 0.7071], S: [0, 1], SW: [-0.7071, 0.7071], W: [-1, 0], NW: [-0.7071, -0.7071] };
  const u = U[f.bearing] ?? [0, -1];
  return { x: Math.round(u[0] * (f.distance_m ?? 0)), y: Math.round(u[1] * (f.distance_m ?? 0)) };
}

// writeMarkRaw — build the mark.md text with the exact inline-object frontmatter
// the shared parseRecord reads ({ x: .., y: .. } / { w: .., h: .. }).
function writeMarkRaw(relDir, fm, body) {
  // location-aware: if a dir for this slug already exists anywhere in the tree
  // (the nesting ruling moved terrain marks under their containers), write THERE.
  const slug = relDir ? relDir.split("/").pop() : "";
  const found = slug && EXISTING.get(slug);
  const effRel = found ?? relDir;
  const dir = effRel ? join(MARKS_ROOT, effRel) : MARKS_ROOT;
  const L = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v == null) continue;
    if (k === "at") L.push(`at: { x: ${v.x}, y: ${v.y} }`);
    else if (k === "extent") L.push(`extent: { w: ${v.w}, h: ${v.h} }`);
    else L.push(`${k}: ${v}`);
  }
  L.push("---", "", body, "");
  const text = L.join("\n");
  written.push({ path: join("let-there-be-light", effRel, "mark.md").replace(/\\/g, "/"), text });
  if (!DRY) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "mark.md"), text); }
}

// ---- report ------------------------------------------------------------------
console.log(`world-root-gen: ${written.length} record(s) ${DRY ? "(dry run)" : "written"} under WORLD/marks/let-there-be-light/`);
for (const w of written) console.log(`  ${w.path}`);
if (skipped.length) {
  console.log(`\n${skipped.length} feature(s) SPOKEN FOR — the survey stays the town's, the claim is not the town's to write:`);
  for (const [feature, owner] of skipped) console.log(`  ${feature} -> ${owner}`);
}
