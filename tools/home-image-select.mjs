#!/usr/bin/env node
// home-image-select — read the town's own record and name each household's
// LEAD home image, the one the resident already chose.
//
// The legacy that earns this tool (the home-images ruling, Keemin 2026-08-21):
// residents hung art on their HOME pages long before the world had a media
// shelf, and "simply mailing residents to reupload images to our media is not
// an option." So the town's record — WHITE_PAGES/<handle>/HOME/ — is the
// source, and the office's shelf is where those bytes are minted into URLs a
// mark may carry (see office/tools/backfill-home-shelf.mjs, Leg 2).
//
// WHAT THIS TOOL DECIDES, AND WHAT IT REFUSES TO DECIDE. It decides ONE thing:
// which file in a HOME dir is the household's lead image. It reads that off the
// resident's own ordering, never off a judgment of its own:
//
//   (a) the first markdown image embed in HOME.md's body that resolves to a
//       file inside the HOME dir — a resident who put a picture in their prose
//       has already said which one leads;
//   (b) else the first `assets:` frontmatter entry that exists as an image
//       file — the same statement, made in the frontmatter's ordering;
//   (c) else the first image file in the dir, by name — the only rung where
//       nobody said anything, so the tie-break is alphabetical and stable.
//
// It refuses to decide anything else. It does not resize (an over-cap file is
// NAMED and skipped, never re-encoded — the art is the resident's). It does not
// substitute a second file when the lead is unusable (that would hang a picture
// the resident did not choose). It does not upload, and it is not a validation
// lane: the office's upload door re-checks every byte it is handed, and its
// answer is the only one that admits anything. The size and format notes below
// exist so a run is READABLE — a file this tool passes can still bounce there,
// and that is correct.
//
// Deterministic and re-run safe: same town clone in, byte-identical manifest
// and staging dir out.
//
// Run from the world repo root:
//   node tools/home-image-select.mjs --town <town-clone> [--out <dir>]
// Default --out is .home-image-staging/ (gitignored — bytes are not record).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// A MIRROR OF THE SHELF'S CEILING, NOT A SECOND COPY OF THE LAW. The one
// authority is office/src/edit.mjs `MAX_IMAGE = 1.5 * 1024 * 1024`, checked at
// the upload door on the decoded bytes. This constant exists so a run can SAY
// "carta's lock-house.png is 3.0 MB, it will not fit" instead of staging two
// megabytes that bounce on the box an hour later. If the door's ceiling ever
// moves, this becomes a stale hint and nothing worse: the door still decides.
export const SHELF_MAX_BYTES = 1.5 * 1024 * 1024;

// The shelf's formats (office/src/edit.mjs SHELF_FORMATS = raster + svg), by
// extension. Same standing as the ceiling above: a hint for the report, never
// the gate — the door sniffs magic bytes and does not care what a file is
// called.
const IMAGE_EXT = /\.(jpe?g|png|webp|svg)$/i;

const norm = (p) => p.split(sep).join("/");

// ── the resident's own ordering, read off their own file ─────────────────────

// Markdown image embeds in document order: ![alt](target "title").
// Reference-style embeds (![alt][ref]) are deliberately not followed — the
// indirection is rare in these files and following it would be this tool
// guessing at a link table, which is the judgment it does not do.
export function embedTargets(body) {
  return [...String(body ?? "").matchAll(/!\[[^\]]*\]\(\s*<?([^)>\s]+)>?[^)]*\)/g)].map((m) => m[1]);
}

// `assets:` in the frontmatter, in the two shapes the town's HOME.md files
// actually wear: an inline array (quoted or bare — iris's reads
// `assets: [the-arc-house.jpg]`) and a YAML block list. Order is the resident's.
export function assetEntries(frontmatter) {
  const fm = String(frontmatter ?? "");
  const inline = fm.match(/^assets:[ \t]*\[([\s\S]*?)\]/m);
  if (inline) {
    return inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  }
  const block = fm.match(/^assets:[ \t]*\r?\n((?:[ \t]*-[^\n]*\r?\n?)+)/m);
  if (block) {
    return block[1].split(/\r?\n/)
      .map((line) => (line.match(/^[ \t]*-[ \t]*(.*)$/) || [])[1] ?? "")
      .map((s) => s.trim().replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  }
  return [];
}

export function splitFrontmatter(raw) {
  const m = String(raw ?? "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? { frontmatter: m[1], body: String(raw).slice(m[0].length) } : { frontmatter: "", body: String(raw ?? "") };
}

// A reference inside a resident's own file names a file inside their own HOME
// dir, or it names nothing this tool will touch. An absolute URL, a path that
// climbs out with `..`, a directory — all answer null, and the caller reports
// them rather than swallowing them.
export function resolveWithinHome(homeDir, ref) {
  const raw = String(ref ?? "").trim();
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || raw.startsWith("/")) return null;
  const cleaned = raw.split("#")[0].split("?")[0].replace(/^\.\//, "");
  if (!cleaned) return null;
  let decoded = cleaned;
  try { decoded = decodeURIComponent(cleaned); } catch { /* a literal % is a filename, not an escape */ }
  const full = resolve(homeDir, decoded);
  const rel = relative(resolve(homeDir), full);
  if (rel.startsWith("..") || rel === "") return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

// THE LADDER, and the whole of it. Returns { file, rung, notes } — notes carry
// every reference that was looked at and did not answer, so a surprising pick
// can be read back to the file it came from.
export function selectLeadImage(homeDir, { readFile = readFileSync, listDir = readdirSync } = {}) {
  const notes = [];
  const files = listDir(homeDir, { withFileTypes: true })
    .filter((d) => d.isFile()).map((d) => d.name).sort();
  const images = files.filter((f) => IMAGE_EXT.test(f));

  const homeMd = join(homeDir, "HOME.md");
  let frontmatter = "", body = "";
  if (existsSync(homeMd)) ({ frontmatter, body } = splitFrontmatter(readFile(homeMd, "utf8")));
  else notes.push("no HOME.md");

  for (const ref of embedTargets(body)) {
    const full = resolveWithinHome(homeDir, ref);
    if (full && IMAGE_EXT.test(full)) return { file: full, rung: "embed", notes };
    notes.push(`embed did not resolve to an image in HOME/: ${ref}`);
  }
  for (const ref of assetEntries(frontmatter)) {
    const full = resolveWithinHome(homeDir, ref);
    if (full && IMAGE_EXT.test(full)) return { file: full, rung: "assets", notes };
    notes.push(`assets entry did not resolve to an image in HOME/: ${ref}`);
  }
  if (images.length) return { file: join(homeDir, images[0]), rung: "first-by-name", notes };
  return { file: null, rung: "none", notes };
}

// The bytes' own answer to "what is this", by magic number — the same four
// signatures office/src/edit.mjs `imageFormat` reads, asked here only so the
// report can say "these bytes are not a picture" out loud. The door's copy is
// the one that admits or refuses.
export function sniffFormat(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (!bytes.includes(0x00) && /^\s*(?:<\?xml[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[\s\S]*?>\s*|﻿)*<svg[\s/>]/.test(bytes.toString("utf8").slice(0, 4096))) return "svg";
  return null;
}

// ── the run ──────────────────────────────────────────────────────────────────

export function selectHomeImages(townClone) {
  const wp = join(townClone, "WHITE_PAGES");
  const handles = readdirSync(wp, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith(".") && d.name !== "TEMPLATE")
    .map((d) => d.name).sort();

  const images = {};                       // handle -> { file, sha256, bytes, format, rung }
  const skipped = { noHomeDir: [], noImage: [], overCap: [], unreadable: [] };
  const notes = {};                        // handle -> [strings]

  for (const handle of handles) {
    const homeDir = join(wp, handle, "HOME");
    if (!existsSync(homeDir) || !statSync(homeDir).isDirectory()) { skipped.noHomeDir.push(handle); continue; }
    const pick = selectLeadImage(homeDir);
    if (pick.notes.length) notes[handle] = pick.notes;
    if (!pick.file) { skipped.noImage.push(handle); continue; }

    const rel = norm(relative(townClone, pick.file));
    const bytes = readFileSync(pick.file);
    // Over the ceiling is a NAMED skip, never a resize: the file is the
    // resident's art and re-encoding it would put the office's hand on it.
    if (bytes.length > SHELF_MAX_BYTES) {
      skipped.overCap.push({ handle, file: rel, bytes: bytes.length, rung: pick.rung });
      continue;
    }
    const format = sniffFormat(bytes);
    // No substitution here either: the lead is the lead. Bytes that are not a
    // picture are named and the household is passed over, so a mind can look.
    if (!format) { skipped.unreadable.push({ handle, file: rel, bytes: bytes.length, rung: pick.rung }); continue; }
    // A filename is a label; the bytes are the fact. Three of the town's leads
    // are JPEGs wearing a .png name, and the shelf will key them by what they
    // ARE (office/src/edit.mjs imageFormat sniffs magic bytes and ignores the
    // name), so the disagreement is worth SAYING rather than silently fixing.
    const declared = (rel.match(/\.([A-Za-z0-9]+)$/) || [])[1]?.toLowerCase();
    const declaredNorm = declared === "jpeg" ? "jpg" : declared;
    if (declaredNorm && declaredNorm !== format)
      (notes[handle] ??= []).push(`named .${declared} but the bytes are ${format} — the shelf keys it as ${format}`);
    images[handle] = {
      file: rel, sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length, format, rung: pick.rung,
    };
  }
  return { handles, images, skipped, notes };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const TOWN = resolve(opt("--town", process.env.TOWN_CLONE ?? ""));
  const OUT = resolve(opt("--out", ".home-image-staging"));
  if (!opt("--town", process.env.TOWN_CLONE ?? "") || !existsSync(join(TOWN, "WHITE_PAGES"))) {
    console.error(`--town must name a town clone holding WHITE_PAGES/ (got: ${TOWN || "(nothing)"})`);
    process.exit(2);
  }

  const { handles, images, skipped, notes } = selectHomeImages(TOWN);

  // The staging dir is rebuilt from scratch every run: a stale file from a
  // previous town state, sitting next to a fresh manifest that no longer names
  // it, is exactly the kind of quiet divergence the box leg would upload.
  rmSync(join(OUT, "files"), { recursive: true, force: true });
  mkdirSync(join(OUT, "files"), { recursive: true });
  for (const [handle, rec] of Object.entries(images))
    writeFileSync(join(OUT, "files", `${handle}.${rec.format}`), readFileSync(join(TOWN, rec.file)));

  const manifest = {
    _note: "DERIVED from a town clone by tools/home-image-select.mjs — each household's lead HOME image, the file the resident's own page already leads with. Bytes for these entries are staged beside this file in files/<handle>.<format>. Consumed by office/tools/backfill-home-shelf.mjs (the shelf mint) and then tools/home-image-backfill.mjs (the parcel write).",
    generated_from: norm(TOWN),
    counts: {
      handles: handles.length, selected: Object.keys(images).length,
      noHomeDir: skipped.noHomeDir.length, noImage: skipped.noImage.length,
      overCap: skipped.overCap.length, unreadable: skipped.unreadable.length,
    },
    images, skipped, notes,
  };
  writeFileSync(join(OUT, "home-image-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const c = manifest.counts;
  console.log(`selected ${c.selected} lead images from ${c.handles} handles → ${norm(OUT)}`);
  for (const [handle, rec] of Object.entries(images))
    console.log(`  ✓ ${handle}  ${rec.file}  (${rec.format}, ${rec.bytes} b, via ${rec.rung})`);
  console.log(`\nno HOME/ dir (${skipped.noHomeDir.length}): ${skipped.noHomeDir.join(", ") || "(none)"}`);
  console.log(`HOME/ but no image (${skipped.noImage.length}): ${skipped.noImage.join(", ") || "(none)"}`);
  console.log(`over the ${(SHELF_MAX_BYTES / 1024 / 1024).toFixed(1)} MB shelf cap — NAMED, never resized (${skipped.overCap.length}):`);
  for (const s of skipped.overCap) console.log(`  ✗ ${s.handle}  ${s.file}  ${(s.bytes / 1024 / 1024).toFixed(2)} MB (via ${s.rung})`);
  console.log(`bytes that are not a picture (${skipped.unreadable.length}):`);
  for (const s of skipped.unreadable) console.log(`  ✗ ${s.handle}  ${s.file}  ${s.bytes} b (via ${s.rung})`);
  const noted = Object.entries(notes);
  if (noted.length) {
    console.log(`\nnotes — references passed over, and names that disagree with their bytes (${noted.length} households):`);
    for (const [handle, list] of noted) for (const n of list) console.log(`  · ${handle}: ${n}`);
  }
  if (!c.selected) { console.error("nothing selected — refusing to call that success"); process.exit(1); }
}
