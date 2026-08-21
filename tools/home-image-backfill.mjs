#!/usr/bin/env node
// home-image-backfill — hang each household's shelf-minted HOME art on their
// home mark: the dwelling itself.
//
// The third leg of the home-images ruling (Keemin, 2026-08-21), as amended the
// same evening: "ADDRESS = parcel mark, HOME = home mark… put the image on the
// *home* mark, which should be the world-equivalent of HOME.md." The image
// rides the DWELLING, never the parcel. A parcel is the claim — ADDRESS's
// world-side counterpart — and a claim has no face. See LOGOS/classes.md
// § "The tells edges" (address tells parcel · home tells home-mark · profile
// tells resident) and MARKS.md § The home mark.
//
// The world's tools/home-image-select.mjs named each household's lead HOME
// image; the office's tools/backfill-home-shelf.mjs minted those bytes into
// shelf URLs through its own upload door; this writes those URLs onto the
// record.
//
// A RESIDENT-HUNG IMAGE IS NEVER OVERWRITTEN. This tool fills only home marks
// whose `image:` is absent. A mark that already carries one keeps it, and keeps
// it SILENTLY — there is no "would have replaced" warning, because there is no
// world in which the office's guess outranks the resident's own choice. That is
// also what makes the tool idempotent: the second run has nothing left to do,
// by the same rule that protected the resident on the first.
//
// THE JOIN IS THE RECORD'S OWN, AND IT IS ARITHMETIC — see homeMarkFor below
// for why it has four layers and what each one is reading. A handle whose home
// mark cannot be reached is NAMED and skipped, with the candidates it had:
// picking one would be a judgment, and this tool does none.
//
// THE SHELF IS THE ONLY MINT, and this is where that law meets the record: a
// URL in the input that is not one the office's shelf issues stops the whole
// run before a single file is touched. Not a skip — a refusal, loudly, with
// every offender named.
//
// Run from the world repo root:
//   node tools/home-image-backfill.mjs --urls <home-image-urls.json> [--manifest <home-image-manifest.json>] [--dry]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks } from "./marks-fold.mjs";

// THE SHELF'S OWN SHAPE, and deliberately the strict one. tools/mark-lint.mjs
// admits any path under the media host; spectator/viewer.mjs will only RENDER
// the `/media/` shelf the upload door actually issues, and a URL that lints but
// never draws is a picture nobody sees. So the record layer's gate here is the
// renderer's, which is also exactly what src/media.mjs mints.
export const SHELF_URL = /^https:\/\/media\.postmark\.town\/media\/[A-Za-z0-9][A-Za-z0-9/._-]*$/;

const eol = (raw) => (raw.includes("\r\n") ? "\r\n" : "\n");
const isDwellingCandidate = (m) => m.kind === "sited" && m.at && !m.far;

// ── the join ────────────────────────────────────────────────────────────────
//
// "Which mark is this household's dwelling" is answered by the RECORD, in four
// layers, strongest evidence first. Every layer is arithmetic; none is a
// judgment; and where two of them can both answer they are checked against each
// other rather than silently ordered (see the falsifier that asserts they never
// disagree on the live record — 25 of 25 today).
//
//   1. THE PREDICATE. parcel-seed-gen.mjs nests a `slot: home` predicate under
//      each parcel naming the house it grounds. That is the record saying which
//      mark this is, in words, and it wins when it is there. It is there for 26
//      of 58 parcels — the seeder gained it partway through — which is why the
//      layers below exist at all.
//   2. TREE CHILD AND CENTRE TOGETHER. The seeder centres a parcel on its home
//      (`at: home.at`), and the re-homing follow-up moved house dirs INSIDE
//      their parcels. So a sited mark that is both a direct child of the parcel
//      and sits at its exact centre is two independent facts agreeing, and it
//      is what resolves every household whose ground is crowded (rei has 24
//      sited marks and two at the parcel's centre; this picks the house, not
//      the pocket lantern inside it).
//   3. THE SOLE TREE CHILD, where a parcel has exactly one sited child of its
//      holder's.
//   4. THE SOLE MARK AT THE CENTRE, where the tree says nothing.
//
// The seeder's own warning is the one this inherits: "picking one is a
// judgment, not arithmetic." Two candidates and no agreeing evidence is a
// refusal, reported with both names.
export function homeMarkFor(parcel, { marks, byId, sitedByHandle }) {
  const own = sitedByHandle.get(parcel.by) ?? [];
  const at = (m) => m.at.x === parcel.at.x && m.at.y === parcel.at.y;

  const pred = marks.find((m) => m._parentMarkId === parcel.id && m.kind === "predicated" && m.slot === "home");
  if (pred?.value != null && String(pred.value).trim()) {
    const value = String(pred.value).trim();
    const byIdHit = byId.get(`${parcel.by}/${value}`);
    if (byIdHit && isDwellingCandidate(byIdHit)) return { mark: byIdHit, how: "the parcel's slot: home predicate" };
    // the seeder's documented drift: a manifest home_id and a directory leaf can
    // disagree (east-facing-window's home mark is the-cathedral-at-east-window)
    const bySlug = own.filter((m) => m.slug === value);
    if (bySlug.length === 1) return { mark: bySlug[0], how: "the predicate's value, matched by slug" };
  }

  const children = own.filter((m) => m._parentMarkId === parcel.id);
  const both = children.filter(at);
  if (both.length === 1) return { mark: both[0], how: "the parcel's own child, standing at its centre" };
  if (children.length === 1) return { mark: children[0], how: "the parcel's only sited child" };
  const centred = own.filter(at);
  if (centred.length === 1) return { mark: centred[0], how: "the only mark at the parcel's centre" };

  const why = children.length || centred.length
    ? `${children.length} sited child(ren) of the parcel and ${centred.length} at its centre — no single mark both, and picking one is a judgment`
    : "the parcel holds no sited mark of this household's — the dwelling was never planted";
  return { mark: null, how: null, why, candidates: [...new Set([...children, ...centred].map((m) => m.id))].sort() };
}

// Every handle's home mark, read off their parcel. Handles with no parcel at
// all are reported separately from handles whose parcel reaches no dwelling —
// they are different gaps in the record and a caller should be able to tell
// them apart.
export function homeMarksByHandle(marks) {
  const byId = new Map(marks.map((m) => [m.id, m]));
  const sitedByHandle = new Map();
  for (const m of marks) {
    if (!isDwellingCandidate(m) || !m.by) continue;
    if (!sitedByHandle.has(m.by)) sitedByHandle.set(m.by, []);
    sitedByHandle.get(m.by).push(m);
  }
  const homes = new Map(), unreachable = new Map(), manyParcels = new Map();
  const parcels = new Map();
  for (const m of marks) {
    if (m.kind !== "parcel" || !m.by) continue;
    if (parcels.has(m.by)) { manyParcels.set(m.by, [...(manyParcels.get(m.by) ?? [parcels.get(m.by).id]), m.id]); continue; }
    parcels.set(m.by, m);
  }
  for (const [handle, parcel] of parcels) {
    if (manyParcels.has(handle)) continue;
    const found = homeMarkFor(parcel, { marks, byId, sitedByHandle });
    if (found.mark) homes.set(handle, { ...found, parcel: parcel.id });
    else unreachable.set(handle, { parcel: parcel.id, why: found.why, candidates: found.candidates });
  }
  return { homes, unreachable, manyParcels, parcels };
}

// Insert `image:` into a mark's frontmatter, or answer null if one is already
// there. `pre:`/`derived_from:` are a provenance pair and read best last, so
// the new field lands just above them when they exist.
export function withImageField(raw, url) {
  const nl = eol(raw);
  const m = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("no frontmatter block");
  const lines = m[1].split(/\r?\n/);
  if (lines.some((l) => /^image:/.test(l))) return null; // law 3: already hung, silently kept
  const at = lines.findIndex((l) => /^(pre|derived_from):/.test(l));
  const insertAt = at === -1 ? lines.length : at;
  const next = [...lines.slice(0, insertAt), `image: ${url}`, ...lines.slice(insertAt)];
  return `---${nl}${next.join(nl)}${nl}---${String(raw).slice(m[0].length)}`;
}

// Law 4 at the record layer. Answers the offenders, so the caller can refuse
// the RUN rather than the entry: one URL the shelf did not mint means the input
// is not trustworthy, and writing the rest would be the worst of both answers.
export function nonShelfUrls(urls) {
  return Object.entries(urls).filter(([, u]) => !SHELF_URL.test(String(u ?? "").trim()));
}

export function planBackfill(urls, marks) {
  const { homes, unreachable, manyParcels, parcels } = homeMarksByHandle(marks);
  const write = [], keep = [], noParcel = [], noHomeMark = [], ambiguousParcel = [];
  for (const handle of Object.keys(urls).sort()) {
    if (manyParcels.has(handle)) { ambiguousParcel.push({ handle, parcels: manyParcels.get(handle) }); continue; }
    if (!parcels.has(handle)) { noParcel.push(handle); continue; }
    if (unreachable.has(handle)) { noHomeMark.push({ handle, ...unreachable.get(handle) }); continue; }
    const { mark, how, parcel } = homes.get(handle);
    // The folded record's answer and the file's own text must agree before this
    // counts as "already hung"; the write step re-reads the file and refuses
    // again there, so a stale fold can never overwrite a real image.
    if (mark.image != null && String(mark.image).trim()) { keep.push({ handle, home: mark.id, image: mark.image }); continue; }
    write.push({ handle, home: mark.id, parcel, how, dir: mark._dir, url: urls[handle] });
  }
  return { write, keep, noParcel, noHomeMark, ambiguousParcel };
}

// The write, with the fold's verdict checked AGAINST THE FILE one more time.
// `withImageField` answering null here means the record on disk carries an
// image the fold did not show — a stale fold, a hand-edit between the two
// steps — and the file wins, every time. Law 3 has two locks for the same
// reason the shelf's allowlist does: the cheap one runs on data that came from
// somewhere else.
export function applyBackfill(write, { dry = false, read = readFileSync, save = writeFileSync } = {}) {
  const wrote = [], keptAtWrite = [];
  for (const row of write) {
    const path = join(row.dir, "mark.md");
    const next = withImageField(read(path, "utf8"), row.url);
    if (next === null) { keptAtWrite.push(row.handle); continue; }
    if (!dry) save(path, next);
    wrote.push(row.handle);
  }
  return { wrote, keptAtWrite };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const DRY = argv.includes("--dry");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const URLS = opt("--urls", "home-image-urls.json");
  const MANIFEST = opt("--manifest", null);

  const urlsFile = JSON.parse(readFileSync(URLS, "utf8"));
  const urls = urlsFile.urls ?? urlsFile;
  if (urlsFile.dry) console.error(`NOTE: ${URLS} is the output of a DRY shelf run — these URLs describe what a real mint WOULD issue, and nothing is on the shelf yet.`);

  const bad = nonShelfUrls(urls);
  if (bad.length) {
    console.error(`REFUSING THE RUN: ${bad.length} URL(s) are not the town's own shelf — the shelf is the only mint, and a mark may carry no other picture:`);
    for (const [handle, u] of bad) console.error(`  ✗ ${handle}  ${JSON.stringify(String(u).slice(0, 120))}`);
    process.exit(1);
  }

  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const plan = planBackfill(urls, marks);

  const sources = (() => {
    if (!MANIFEST) return {};
    try { return JSON.parse(readFileSync(MANIFEST, "utf8")).images ?? {}; } catch { return {}; }
  })();

  const { wrote, keptAtWrite } = applyBackfill(plan.write, { dry: DRY });

  console.log(`${DRY ? "[dry] " : ""}${wrote.length} home marks ${DRY ? "would take" : "took"} their household's HOME art:`);
  for (const row of plan.write) {
    const src = sources[row.handle]?.file;
    console.log(`  ✓ ${row.handle}  ${row.home}`);
    console.log(`      ${row.url}`);
    console.log(`      joined via ${row.how}  (parcel ${row.parcel})`);
    if (src) console.log(`      from ${src}`);
  }
  console.log(`\nalready carrying an image — untouched (${plan.keep.length + keptAtWrite.length}):`);
  for (const row of plan.keep) console.log(`  · ${row.handle}  ${row.home}  ${row.image}`);
  console.log(`\nNO HOME MARK — named, never guessed (${plan.noHomeMark.length}):`);
  for (const row of plan.noHomeMark) {
    console.log(`  ? ${row.handle}  parcel ${row.parcel}`);
    console.log(`      ${row.why}`);
    if (row.candidates?.length) console.log(`      candidates: ${row.candidates.join(", ")}`);
  }
  console.log(`\nno parcel on the record at all (${plan.noParcel.length}): ${plan.noParcel.join(", ") || "(none)"}`);
  if (plan.ambiguousParcel.length) {
    console.log(`more than one parcel — NOT guessed (${plan.ambiguousParcel.length}):`);
    for (const row of plan.ambiguousParcel) console.log(`  ? ${row.handle}  ${row.parcels.join(", ")}`);
  }
  if (!DRY && wrote.length) {
    console.log(`\nprovenance for the commit (an office pre-act over the town's own record, never a new authorship claim):`);
    for (const row of plan.write) {
      const src = sources[row.handle]?.file;
      console.log(`  ${relative(ROOT, join(row.dir, "mark.md")).split("\\").join("/")}  ←  ${src ?? "(manifest not passed; re-run with --manifest to name the source file)"}`);
    }
  }
  console.log(`\nnext: node tools/mark-lint.mjs && node tools/marks-fold.mjs && node --test "tools/*.test.mjs"`);
}
