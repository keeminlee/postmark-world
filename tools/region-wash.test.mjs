// region-wash.test.mjs — the falsifiers for "a region's wash IS its ring".
//
// The claim tools/region-wash-gen.mjs makes is agreement by construction: the
// staged SVG's frame is the mark's ring bbox and its outer polygon is the ring
// vertex for vertex, in world metres; the pointer on the mark is the sha256 of
// the staged bytes on the shelf the door keys by. None of that is asserted by
// re-running the generator and comparing it to itself — that would be an
// identity. Each test reads the STAGED FILE and the MARK ON DISK as two
// independent things and compares them.
//
// Every one of these can fail, and the flips are in the lane report: a vertex
// moved in the SVG (test 2 reds), a byte changed in the SVG (test 3 reds — the
// pointer no longer names these bytes), a pointer edited on the mark (test 3),
// a hex swapped (test 4), a region that lost its ring (test 1's roster arm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadMarks } from "./marks-fold.mjs";
import { REGION_SLUGS } from "./region-outsiders.mjs";
import { ATLAS_WASH, MANIFEST, ROOT, WASH_DIR, bboxOf, planWashes, ringOf, sha256, washSVG } from "./region-wash-gen.mjs";

const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
const regionMark = (slug) => tree.find((m) => String(m?.id ?? "").split("/")[1] === slug && ringOf(m));
const staged = (slug) => join(WASH_DIR, `${slug}.svg`);
const manifest = () => JSON.parse(readFileSync(MANIFEST, "utf8"));

/** the attribute values of the first element matching `re` in an svg string */
const attr = (svg, re, name) => (svg.match(re)?.[0] ?? "").match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

test("EVERY REGION WITH A RING HAS A STAGED WASH AND A POINTER; a region without a ring has neither", () => {
  const ringed = REGION_SLUGS.filter((s) => regionMark(s));
  assert.ok(ringed.length >= 12, `the twelve at least (${ringed.length})`);
  for (const slug of ringed) {
    assert.ok(existsSync(staged(slug)), `${slug}: staged at spectator/washes/${slug}.svg`);
    const m = regionMark(slug);
    assert.match(String(m.image ?? ""), /^https:\/\/media\.postmark\.town\/media\/[A-Za-z0-9][A-Za-z0-9._-]*\/[0-9a-f]{64}\.svg$/,
      `${slug}: its mark carries a shelf pointer to an SVG (${m.image})`);
  }
  // the roster arm: a slug the record holds no ring for gets NOTHING drawn and nothing planted
  const rows = planWashes(tree, { slugs: [...REGION_SLUGS, "a-region-nobody-founded"] });
  const ghost = rows.find((r) => r.slug === "a-region-nobody-founded");
  assert.equal(ghost.state, "no-ring", "a region with no ring is named, not drawn");
  assert.equal(ghost.pointer, undefined, "and no pointer is minted for it");
  assert.ok(!existsSync(staged("a-region-nobody-founded")), "and nothing was staged for it");
  // and the staged set is exactly the ringed roster — nothing extra was invented
  const files = readdirSync(WASH_DIR).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, "")).sort();
  assert.deepEqual(files, [...ringed].sort(), "one SVG per ringed region, and no others");
});

test("THE WASH IS THE RING — the staged SVG's frame is the ring's bbox and its outer polygon is the ring, vertex for vertex, to 0.1 m", () => {
  for (const slug of REGION_SLUGS) {
    const m = regionMark(slug);
    if (!m) continue;
    const svg = readFileSync(staged(slug), "utf8");
    const ring = ringOf(m), b = bboxOf(ring);
    const vb = attr(svg, /<svg\b[^>]*>/, "viewBox").split(/\s+/).map(Number);
    for (const [i, want] of [b.minX, b.minY, b.w, b.h].entries())
      assert.ok(Math.abs(vb[i] - want) <= 0.1, `${slug}: viewBox[${i}] ${vb[i]} is the ring's bbox ${want}`);
    const drawn = attr(svg, /<polygon class="outer"[^>]*>/, "points").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    assert.equal(drawn.length, ring.length, `${slug}: ${drawn.length} vertices drawn, ${ring.length} on the mark`);
    for (let i = 0; i < ring.length; i++)
      assert.ok(Math.abs(drawn[i][0] - ring[i].x) <= 0.1 && Math.abs(drawn[i][1] - ring[i].y) <= 0.1,
        `${slug} vertex ${i}: drawn (${drawn[i]}) vs the mark's (${ring[i].x},${ring[i].y})`);
    // the extent the viewer hangs the picture over is the same box (the lint's own equality, read back)
    assert.ok(Math.abs(Number(m.extent?.w) - b.w) <= 0.5 && Math.abs(Number(m.extent?.h) - b.h) <= 0.5,
      `${slug}: the mark's extent (${m.extent?.w}×${m.extent?.h}) is its ring's bbox (${b.w}×${b.h}), so the wash lands where the ring is`);
  }
});

test("THE POINTER NAMES THESE BYTES — sha256(staged file) is the hash in the mark's pointer and in the manifest", () => {
  const man = manifest();
  for (const slug of REGION_SLUGS) {
    const m = regionMark(slug);
    if (!m) continue;
    const bytes = readFileSync(staged(slug));
    const sha = sha256(bytes);
    assert.ok(String(m.image).endsWith(`/${sha}.svg`), `${slug}: the mark's pointer ends in the staged file's own sha256 (${sha.slice(0, 12)}…)`);
    const row = man.washes.find((w) => w.slug === slug);
    assert.ok(row, `${slug}: in the manifest`);
    assert.equal(row.sha256, sha, `${slug}: the manifest's hash is the file's`);
    assert.equal(row.pointer, m.image, `${slug}: the manifest's pointer is the mark's`);
    assert.equal(row.bytes, bytes.length, `${slug}: the manifest's byte count is the file's`);
    assert.equal(row.mark, m.id, `${slug}: the manifest names the mark`);
  }
});

test("THE COLOUR IS THE ATLAS'S — each wash carries its region's own hex, and only that hex", () => {
  for (const slug of REGION_SLUGS) {
    const m = regionMark(slug);
    if (!m) continue;
    const svg = readFileSync(staged(slug), "utf8");
    const hexes = [...new Set([...svg.matchAll(/#[0-9a-f]{6}\b/g)].map((x) => x[0]))];
    assert.deepEqual(hexes, [ATLAS_WASH[slug]], `${slug}: painted in ${ATLAS_WASH[slug]} and nothing else (found ${hexes.join(", ")})`);
  }
  // and the palette covers exactly the roster — a region the Atlas never painted would refuse, not guess
  assert.deepEqual(Object.keys(ATLAS_WASH).sort(), [...REGION_SLUGS].sort(), "one hex per roster slug");
});

test("THE DOOR WOULD TAKE IT — each staged file passes the media door's own SVG shape (root <svg>, closes </svg>, no NUL, under 1.5 MB), and carries no script", () => {
  for (const slug of REGION_SLUGS) {
    if (!regionMark(slug)) continue;
    const bytes = readFileSync(staged(slug));
    assert.ok(!bytes.includes(0x00), `${slug}: text, not binary`);
    const text = bytes.toString("utf8");
    assert.ok(text.startsWith("<svg"), `${slug}: the root element is <svg>`);
    assert.match(text, /<\/svg\s*>\s*$/, `${slug}: closes itself`);
    assert.ok(bytes.length < 1.5 * 1024 * 1024, `${slug}: under the door's cap`);
    assert.ok(!/<script|javascript:|\bon[a-z]+=|<foreignObject|href=/i.test(text), `${slug}: inert — no script, handler, foreign object or external reference`);
  }
});

test("…and it can fail: a ring that moves makes a wash that no longer matches (the generator's own output, against a moved mark)", () => {
  const m = regionMark("evermoon");
  const moved = { ...m, points: m.points.map((p, i) => (i === 0 ? (Array.isArray(p) ? [p[0] + 10, p[1]] : { ...p, x: p.x + 10 }) : p)) };
  const before = washSVG(m, ATLAS_WASH.evermoon), after = washSVG(moved, ATLAS_WASH.evermoon);
  assert.notEqual(before, after, "moving one vertex 10 m changes the bytes");
  assert.notEqual(sha256(Buffer.from(before)), sha256(Buffer.from(after)), "and the hash, so the pointer stops naming it");
  assert.throws(() => washSVG({ ...m, points: undefined }, ATLAS_WASH.evermoon), /no ring/, "and a ringless mark is refused, not drawn");
});
