// home-image-select.test — the selector's falsifiers.
//
// Each test names the law sentence it asserts, quoted verbatim from the gold
// plan (PULSE/gold-plans/postmark-home-images/postmark-home-images.md, "The
// law"). A test that paraphrases its law is a test that drifts from it.

import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectHomeImages, selectLeadImage, embedTargets, assetEntries, resolveWithinHome, sniffFormat, SHELF_MAX_BYTES } from "./home-image-select.mjs";

// ── fixtures: real bytes, because a sniff on fake bytes proves nothing ───────

const crc32 = (buf) => {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
// a real 1×1 PNG (signature, IHDR, IDAT, IEND) — the office's imageFormat
// checks the signature AND that the file reaches its own IEND
function tinyPng(pad = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour
  const raw = Buffer.concat([Buffer.from([0]), Buffer.from([1, 2, 3])]);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw))];
  // padding rides as a tEXt chunk so a "large" fixture is still a real PNG
  if (pad > 0) parts.push(chunk("tEXt", Buffer.concat([Buffer.from("pad\0", "ascii"), Buffer.alloc(pad, 0x61)])));
  parts.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
// a JPEG by the office's own reading: SOI at the front, EOI at the back
const tinyJpg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);

function town(spec) {
  const root = mkdtempSync(join(tmpdir(), "home-image-select-"));
  for (const [handle, home] of Object.entries(spec)) {
    if (home === null) { mkdirSync(join(root, "WHITE_PAGES", handle), { recursive: true }); continue; }
    const dir = join(root, "WHITE_PAGES", handle, "HOME");
    mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of Object.entries(home))
      writeFileSync(join(dir, name), typeof bytes === "string" ? bytes : bytes);
  }
  return root;
}

// ── law 2 ────────────────────────────────────────────────────────────────────

test('THE LEAD IS THE RESIDENT\'S OWN: "A household\'s HOME art is its parcel\'s canonical default image. The town\'s own record (WHITE_PAGES/<handle>/HOME/) is the source"', () => {
  // The dir also holds an alphabetically-earlier image. The body embeds the
  // other one. The resident's prose is the record of which picture leads, so
  // the alphabet must not win — a "first file by name" pick here would hang a
  // picture the resident did not choose on their own ground.
  const root = town({
    resident: {
      "a-first-by-name.png": tinyPng(),
      "b-the-lead.jpg": tinyJpg(),
      "HOME.md": "---\nassets: [\"a-first-by-name.png\"]\n---\n\nThe room, at dusk.\n\n![the lead](b-the-lead.jpg)\n",
    },
  });
  try {
    const { images } = selectHomeImages(root);
    assert.equal(images.resident.file, "WHITE_PAGES/resident/HOME/b-the-lead.jpg",
      "the body's embed is the resident's chosen lead — it outranks both the assets list and the alphabet");
    assert.equal(images.resident.rung, "embed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the ladder's lower rungs, in order: assets: frontmatter beats the alphabet, and the alphabet is the last resort", () => {
  const root = town({
    "by-assets": {
      "a-first.png": tinyPng(),
      "z-chosen.jpg": tinyJpg(),
      "HOME.md": "---\nassets: [\"z-chosen.jpg\", \"a-first.png\"]\n---\n\nno embeds here\n",
    },
    "by-name": { "a-first.png": tinyPng(), "z-other.jpg": tinyJpg(), "HOME.md": "---\ntitle: x\n---\n\nno embeds, no assets\n" },
    "no-home-md": { "only.png": tinyPng() },
  });
  try {
    const { images } = selectHomeImages(root);
    assert.equal(images["by-assets"].file, "WHITE_PAGES/by-assets/HOME/z-chosen.jpg");
    assert.equal(images["by-assets"].rung, "assets");
    assert.equal(images["by-name"].file, "WHITE_PAGES/by-name/HOME/a-first.png");
    assert.equal(images["by-name"].rung, "first-by-name");
    assert.equal(images["no-home-md"].rung, "first-by-name");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── the over-cap rule (plan § Tests: "an over-cap file is REPORTED, never
//    uploaded, never silently dropped from the report") ──────────────────────

test("AN OVER-CAP FILE IS REPORTED, NEVER UPLOADED, NEVER SILENTLY DROPPED — and never resized, and never swapped for a sibling", () => {
  const big = tinyPng(Math.ceil(SHELF_MAX_BYTES) + 1024);
  assert.ok(big.length > SHELF_MAX_BYTES, "the fixture must actually exceed the shelf cap");
  const root = town({
    carta: {
      "lock-house.png": big,
      "a-small-sibling.jpg": tinyJpg(),   // present, under cap, and NOT the lead
      "HOME.md": '---\nassets: ["lock-house.png"]\n---\n\nthe lock house\n',
    },
  });
  try {
    const { images, skipped } = selectHomeImages(root);
    assert.equal(images.carta, undefined, "an over-cap lead is not selected");
    const row = skipped.overCap.find((r) => r.handle === "carta");
    assert.ok(row, "the household is REPORTED in the over-cap list — never silently dropped");
    assert.equal(row.file, "WHITE_PAGES/carta/HOME/lock-house.png", "the report NAMES the file, so a mind can act on it");
    assert.equal(row.bytes, big.length, "the report carries the real size, unresized");
    // the sibling is the trap: substituting it would hang art the resident
    // never led with, which is the one judgment this tool does not make
    assert.ok(!Object.values(images).some((r) => r.file.endsWith("a-small-sibling.jpg")),
      "an under-cap sibling is NOT quietly substituted for the resident's own lead");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bytes that are not a picture are named, not substituted — and dirs with no image at all are named too", () => {
  const root = town({
    "not-a-picture": { "notes.png": "this is prose wearing a .png name", "real.jpg": tinyJpg(), "HOME.md": '---\nassets: ["notes.png"]\n---\n\nx\n' },
    "empty-home": { "HOME.md": "---\ntitle: x\n---\n\nno art yet\n" },
    "no-home-dir": null,
  });
  try {
    const { images, skipped } = selectHomeImages(root);
    assert.equal(images["not-a-picture"], undefined);
    assert.deepEqual(skipped.unreadable.map((r) => r.file), ["WHITE_PAGES/not-a-picture/HOME/notes.png"]);
    assert.deepEqual(skipped.noImage, ["empty-home"]);
    assert.deepEqual(skipped.noHomeDir, ["no-home-dir"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── determinism (the plan's "Deterministic; re-run safe") ────────────────────

test("deterministic: the same town clone answers with the same manifest, twice", () => {
  const root = town({
    b: { "one.png": tinyPng(), "HOME.md": "---\n---\n\n![x](one.png)\n" },
    a: { "two.jpg": tinyJpg(), "HOME.md": "---\n---\n\nx\n" },
  });
  try {
    assert.equal(JSON.stringify(selectHomeImages(root)), JSON.stringify(selectHomeImages(root)));
    assert.deepEqual(Object.keys(selectHomeImages(root).images), ["a", "b"], "handles are walked in sorted order");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── the reading bits, asked directly ─────────────────────────────────────────

test("embed and assets parsing reads the shapes the town's own HOME.md files wear", () => {
  assert.deepEqual(embedTargets("![a](one.jpg) text ![b](./two.png 'title')"), ["one.jpg", "./two.png"]);
  assert.deepEqual(assetEntries('assets: ["a.jpg", "b.png"]'), ["a.jpg", "b.png"]);
  // iris's HOME.md really reads `assets: [the-arc-house.jpg]` — bare, unquoted
  assert.deepEqual(assetEntries("assets: [the-arc-house.jpg]"), ["the-arc-house.jpg"]);
  assert.deepEqual(assetEntries("assets:\n  - a.jpg\n  - 'b.png'\n"), ["a.jpg", "b.png"]);
  assert.deepEqual(assetEntries("title: x\n"), []);
});

test("a reference reaches only INSIDE the household's own HOME dir", () => {
  const root = town({ r: { "in.png": tinyPng(), "HOME.md": "---\n---\n" } });
  const home = join(root, "WHITE_PAGES", "r", "HOME");
  try {
    assert.ok(resolveWithinHome(home, "in.png"));
    assert.ok(resolveWithinHome(home, "./in.png"), "a ./ prefix is the same file");
    assert.equal(resolveWithinHome(home, "https://example.com/x.png"), null, "an off-town URL is not the town's own record");
    assert.equal(resolveWithinHome(home, "../../other/HOME/in.png"), null, "a path that climbs out reaches nobody else's art");
    assert.equal(resolveWithinHome(home, "missing.png"), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the format is the BYTES' answer, never the filename's — three town leads are JPEGs wearing .png", () => {
  const root = town({ r: { "looks-like.png": tinyJpg(), "HOME.md": "---\n---\n\n![x](looks-like.png)\n" } });
  try {
    const { images, notes } = selectHomeImages(root);
    assert.equal(images.r.format, "jpg", "the shelf keys a file by what it is");
    assert.ok(notes.r?.some((n) => /named \.png but the bytes are jpg/.test(n)), "and the disagreement is SAID, not silently fixed");
  } finally { rmSync(root, { recursive: true, force: true }); }
  assert.equal(sniffFormat(Buffer.from("not an image at all")), null);
  assert.equal(sniffFormat(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')), "svg");
});
