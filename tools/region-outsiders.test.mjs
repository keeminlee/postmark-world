#!/usr/bin/env node
// region-outsiders.test.mjs — the heads-up list is a VIEW, and a view has to be
// current or it is a lie with a timestamp.
//
// WHAT BROKE (S45's seventh refusal, 2026-08-24). The list was written by
// tools/region-rings-gen.mjs, hand-run against the atlas. The settlement sweep
// publishes marks and performs re-homes and is not hand-run, so the 13:51Z
// attempt moved the record and left the list where it was — and the
// biconditional every heads-up rests on ("either contained or listed, never
// neither, never both") was false for anything the settlement had touched.
//
// The list is now derived at every fold. These falsifiers hold the property that
// failure taught: not "the list is correct today" but "the list cannot be stale
// after the world changes", which is a claim about WHEN it is written.
//
// Run: node --test tools/region-outsiders.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { loadMarks } from "./marks-fold.mjs";
import { polygonOf, rect, rectInsideRing } from "./geometry.mjs";
import { REGION_SLUGS, occupiesGround } from "./region-outsiders.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A scratch copy of the record and the tools, foldable in isolation. */
function scratchWorld() {
  const dir = mkdtempSync(join(tmpdir(), "pm-outsiders-"));
  cpSync(join(ROOT, "WORLD"), join(dir, "WORLD"), { recursive: true });
  cpSync(join(ROOT, "tools"), join(dir, "tools"), { recursive: true });
  return dir;
}
function fold(dir) {
  const r = spawnSync(process.execPath, [join(dir, "tools/marks-fold.mjs"), "--allow-stampless"],
    { encoding: "utf8", cwd: dir });
  return r.stdout + r.stderr;
}
const listOf = (dir) => JSON.parse(readFileSync(join(dir, "WORLD/region-outsiders.json"), "utf8"));

// ── (a) the fold emits it at all ─────────────────────────────────────────────
test("THE FOLD EMITS THE LIST: deleting it and re-folding brings it back", () => {
  const dir = scratchWorld();
  try {
    rmSync(join(dir, "WORLD/region-outsiders.json"), { force: true });
    rmSync(join(dir, "WORLD/region-outsiders.md"), { force: true });
    const out = fold(dir);
    assert.match(out, /fold: \d+ marks/, `the fold must run (got: ${out.slice(-300)})`);
    assert.ok(existsSync(join(dir, "WORLD/region-outsiders.json")), "the fold writes the json");
    assert.ok(existsSync(join(dir, "WORLD/region-outsiders.md")), "…and the markdown the bulletin reads");
    const list = listOf(dir);
    assert.equal(list.generated_by, "tools/marks-fold.mjs (fold-derived)",
      "the artifact must name the thing that actually wrote it — a stale `generated_by` is how the last one went unnoticed");
    assert.equal(list.count, list.rows.length);
    assert.ok(list.rows.length > 0, "…and it is not empty, or everything below is vacuous");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── (b) THE ONE THAT MATTERS: a settlement cannot outrun it ─────────────────
//
// The failure reproduced. A mark is published under a region, standing outside
// its ring — exactly what the sweep did — and the question is whether the list
// knows about it WITHOUT anyone re-running a tool.
test("A PUBLISH CANNOT STALE IT: a new mark outside its region is on the next fold's list", () => {
  const dir = scratchWorld();
  try {
    const before = listOf(dir);
    const gardens = loadMarks(join(ROOT, "WORLD/marks")).find((m) => m.slug === "the-lanternseed-gardens");
    // far outside any ring, filed under the Gardens, in the Gardens' own frame
    const slug = "the-settlement-published-this";
    const dirPath = join(dir, "WORLD/marks/let-there-be-light/the-lanternseed-gardens", slug);
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, "mark.md"),
      ["---", "kind: sited", "by: rei", "tier: market", "date: 2026-08-24",
       "at: { x: -4000, y: -4000 }", "extent: { w: 10, h: 10 }", "---", "",
       "A mark the settlement published while nobody was re-running the generator.", ""].join("\n"));

    const out = fold(dir);
    assert.match(out, /fold: \d+ marks/, `the fold must run (got: ${out.slice(-300)})`);
    const after = listOf(dir);
    const row = after.rows.find((r) => r.mark === `rei/${slug}`);
    assert.ok(row, "the newly published mark must appear on the list the fold just wrote — this is the S45 failure, and it must not reproduce");
    assert.equal(row.region, gardens.id);
    assert.equal(after.count, before.count + 1, "…and exactly it was added");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── (c) the biconditional, against the fold's own output ────────────────────
test("CONTAINED OR LISTED holds against the freshly folded list", () => {
  const dir = scratchWorld();
  try {
    fold(dir);
    const listed = new Set(listOf(dir).rows.map((r) => r.mark));
    const marks = loadMarks(join(dir, "WORLD/marks"));
    const byId = new Map(marks.map((m) => [m.id, m]));
    const descendants = (id) => marks.filter((m) => {
      const seen = new Set(); let p = m._parentMarkId;
      while (p && !seen.has(p)) { if (p === id) return true; seen.add(p); p = byId.get(p)?._parentMarkId; }
      return false;
    });
    const wrong = [];
    for (const slug of REGION_SLUGS) {
      const region = marks.find((m) => m.slug === slug);
      const ring = region && polygonOf(region);
      if (!ring) continue;
      for (const k of descendants(region.id)) {
        if (!occupiesGround(k)) continue;
        const inside = rectInsideRing(ring, rect(k));
        if (!inside && !listed.has(k.id)) wrong.push(`${k.id} outside ${region.id}, unlisted`);
        if (inside && listed.has(k.id)) wrong.push(`${k.id} inside ${region.id}, listed anyway`);
      }
    }
    assert.deepEqual(wrong, [], "never neither, never both");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── (d) a hand-edited list is OVERWRITTEN, not honoured and not refused ─────
//
// The lawful choice of the three, and the reasoning is what makes it lawful.
// REFUSING would give a derived view the authority of a record: the fold would
// stop — blocking a settlement — because somebody edited a file that is
// regenerated from the tree every time it runs. HONOURING it would be worse; a
// hand-typed heads-up list is a second definition of where the boundaries are,
// which is the exact drift the ring generator's own law forbids. So the fold
// overwrites, silently and every time, because the file has no standing to
// defend. If a name on it is wrong, the record is what to fix.
test("A HAND-EDITED LIST IS OVERWRITTEN — the file is a view, not a record", () => {
  const dir = scratchWorld();
  try {
    fold(dir);
    const real = listOf(dir);
    writeFileSync(join(dir, "WORLD/region-outsiders.json"),
      JSON.stringify({ generated_by: "a person, by hand", count: 1, residents: 1,
        rows: [{ resident: "nobody", mark: "nobody/invented", kind: "sited", region: "rei/the-lanternseed-gardens",
                 region_by: "rei", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 }, overlaps_another_parcel: [] }] }, null, 2));
    const out = fold(dir);
    assert.match(out, /fold: \d+ marks/, "the fold runs rather than refusing — a view has no standing to block a settlement");
    const again = listOf(dir);
    assert.equal(again.generated_by, "tools/marks-fold.mjs (fold-derived)", "the hand-written provenance is gone");
    assert.equal(again.count, real.count, "…and the derived rows are back, exactly");
    assert.equal(again.rows.some((r) => r.mark === "nobody/invented"), false, "the invented row did not survive");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── (e) the generator no longer writes it ───────────────────────────────────
test("ONE WRITER: the ring generator traces rings and does not emit the list", () => {
  const src = readFileSync(join(ROOT, "tools/region-rings-gen.mjs"), "utf8");
  assert.equal(/region-outsiders\.json/.test(src), false,
    "the hand-run tool must not write the list — two writers is how it went stale");
  assert.match(src, /THE OUTSIDER LIST USED TO BE EMITTED HERE/,
    "…and it should say where it went, so the next reader does not put it back");
});
