#!/usr/bin/env node
// world-root-gen.test.mjs — THE TRANSFERRED-GROUND GATE.
//   node --test tools/world-root-gen.test.mjs
//
// Founder ruling, 2026-09-10: "the inlet is terrain; everything else is just a
// mark, and belongs to the resident/household." A terrain mark can leave the
// town's hand by the DEC-16 transfer act while its SURVEY — the skeleton entry
// this generator extracts from — stays the town's. The generator must not then
// rewrite the household's claim in the town's name.
//
// WHY THIS FILE EXISTS AT ALL. The failure it guards is invisible and delayed.
// world-root-gen is DORMANT on the live tree today: it refuses on the v3
// relative-frame guard before it writes anything. So a transfer arms the trap
// and whoever teaches the generator the frame, months later, springs it — and
// it prints success either way. The fixtures below are therefore v2 (no
// `coords:` line on the root), which is the one shape that lets the generator
// run at all, and they are the shape the real tree will have when the frame is
// taught.
//
// Three cases, and the third is the point:
//
//   1. CONTROL      — every mark the town's. The nested one is rewritten where
//                     it lives and no flat twin is created. (This is the
//                     pre-existing location-aware behaviour, pinned so case 2
//                     is a change in one variable.)
//   2. THE GATE     — one mark transferred, its `feature:` link kept. Nothing
//                     is written for that feature, its file is byte-identical
//                     afterwards, no twin exists — AND the untransferred
//                     features are still generated, so the gate is
//                     discriminating rather than merely silent.
//   3. THE FLIP     — the same transferred mark with its `feature:` line
//                     REMOVED. The twin appears. This is what makes case 2's
//                     assertions able to fail, and it is the receipt for
//                     SCHEMA's ruling that the link survives a transfer: the
//                     link is the only handle the gate has.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ── the fixture world ────────────────────────────────────────────────────────
// Two features, chosen so the two failure shapes are both reachable: a grove
// whose mark sits directly at the root (the OVERWRITE shape) and a footbridge
// whose mark is NESTED under the inlet (the TWIN shape). A third feature is
// left entirely alone as the control that the generator still does its job.
const SKELETON = {
  _law: "a fixture world",
  _grid: { m_per_px: 5 },
  elevation: { fog_ceiling_m: 300, walk_speed_m_per_crossing: 20000 },
  light: {},
  physics_registry: [{ id: "light" }, { id: "fog" }, { id: "elevation" }, { id: "pace" }, { id: "wear" }],
  features: [
    { id: "fixture-inlet", kind: "still-inlet", centerline_m: [{ x: 0, y: 100, w_m: 50 }, { x: 200, y: 100, w_m: 50 }], receipt: "the fixture inlet." },
    { id: "fixture-footbridge", kind: "narrow-footbridge", at_m: { x: 100, y: 100 }, receipt: "a crossing at the fixture inlet." },
    { id: "fixture-grove", kind: "grove", trees_m: [{ x: 500, y: 500 }, { x: 540, y: 520 }], receipt: "the fixture grove." },
  ],
  far_features: [],
};

const markText = (fm, body = "A record in a fixture.") =>
  ["---", ...fm, "---", "", body, ""].join("\n");

// The root is written WITHOUT a `coords:` line: a v2 tree, which is the only
// kind this generator will run against (see the header).
const ROOT_MARK = markText([
  "kind: sited", "by: the-town", "tier: constitution", "date: 2026-07-22",
  "at: { x: 0, y: 0 }", "extent: { w: 320000, h: 320000 }", "mechanic: light",
], "Let there be light.");

const townMark = (feature, at) => markText([
  "kind: sited", "by: the-town", "tier: constitution", "date: 2026-07-22",
  `at: { x: ${at.x}, y: ${at.y} }`, "extent: { w: 100, h: 100 }", `feature: ${feature}`,
], `${feature} — the town's own.`);

// A transferred mark: `by:` moved, the asserted `tier:` line dropped (a resident
// may not write one), the `feature:` link kept — exactly the shape the 2026-09-10
// commit gives merrick's three marks.
const transferredMark = (feature, at, { link = true } = {}) => markText([
  "kind: sited", "by: merrick-nocturne", "date: 2026-07-22",
  `at: { x: ${at.x}, y: ${at.y} }`, "extent: { w: 100, h: 100 }",
  ...(link ? [`feature: ${feature}`] : []),
], `${feature} — merrick's own.`);

// A scratch repo: the generator resolves its ROOT from its own file location, so
// the tools it needs are copied in and it is run from inside the scratch.
function scratch(footbridgeMark) {
  const dir = mkdtempSync(join(tmpdir(), "world-root-gen-"));
  cpSync(join(ROOT, "tools"), join(dir, "tools"), { recursive: true });
  const marks = join(dir, "WORLD/marks/let-there-be-light");
  mkdirSync(marks, { recursive: true });
  writeFileSync(join(dir, "WORLD/skeleton.json"), JSON.stringify(SKELETON, null, 2));
  writeFileSync(join(marks, "mark.md"), ROOT_MARK);
  for (const [rel, text] of [
    ["fixture-inlet", townMark("fixture-inlet", { x: 100, y: 100 })],
    ["fixture-grove", townMark("fixture-grove", { x: 520, y: 510 })],
    ["fixture-inlet/fixture-footbridge", footbridgeMark],
  ]) {
    mkdirSync(join(marks, ...rel.split("/")), { recursive: true });
    writeFileSync(join(marks, ...rel.split("/"), "mark.md"), text);
  }
  return dir;
}

const run = (dir) => execFileSync(process.execPath, [join(dir, "tools/world-root-gen.mjs")], { encoding: "utf8" });
const at = (dir, ...rel) => join(dir, "WORLD/marks/let-there-be-light", ...rel, "mark.md");
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

const TWIN = ["fixture-footbridge"];              // the flat path at the root
const NESTED = ["fixture-inlet", "fixture-footbridge"];

test("CONTROL: the town's own nested terrain is rewritten WHERE IT LIVES, and no flat twin appears", () => {
  const dir = scratch(townMark("fixture-footbridge", { x: 100, y: 100 }));
  try {
    const out = run(dir);
    assert.match(read(at(dir, ...NESTED)), /^by: the-town$/m, "the nested record is still the town's");
    assert.match(read(at(dir, ...NESTED)), /^feature: fixture-footbridge$/m, "and still carries its link");
    assert.equal(read(at(dir, ...TWIN)), null,
      "no twin at the root — this is indexExistingDirs() doing its job, and the precondition for the next test");
    assert.doesNotMatch(out, /SPOKEN FOR/, "nothing is spoken for while everything is the town's");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("THE GATE: a transferred terrain mark is left alone, and the rest of the world is still generated", () => {
  const dir = scratch(transferredMark("fixture-footbridge", { x: 100, y: 100 }));
  try {
    const before = read(at(dir, ...NESTED));
    const out = run(dir);

    // the household's record is untouched, to the byte
    assert.equal(read(at(dir, ...NESTED)), before,
      "merrick's footbridge is byte-identical — the generator did not rewrite a claim that is not the town's");
    assert.match(before, /^by: merrick-nocturne$/m, "…and it is still merrick's");

    // and no twin was planted anywhere
    assert.equal(read(at(dir, ...TWIN)), null,
      "no town-authored twin at the root — the trap this gate exists to disarm");

    // THE DISCRIMINATION: the gate must skip THIS feature and nothing else. A
    // generator that wrote nothing at all would pass every assertion above.
    assert.match(read(at(dir, "fixture-inlet")), /^by: the-town$/m, "the inlet is still generated");
    assert.match(read(at(dir, "fixture-grove")), /^by: the-town$/m, "the grove is still generated");
    assert.match(read(at(dir)), /^mechanic: light$/m, "and the root itself is still written");
    assert.match(out, /SPOKEN FOR/, "the run says out loud what it declined to write");
    assert.match(out, /fixture-footbridge -> merrick-nocturne\/fixture-footbridge/,
      "…and names the feature and the household it belongs to");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("THE FLIP: strip the `feature:` link and the twin comes back — which is why the link survives a transfer", () => {
  // Same transferred mark, one line removed. The gate keys on the link, so
  // without it the transfer is invisible to the generator: the mark drops out of
  // indexExistingDirs() (it is not the town's) AND out of the transferred index
  // (it names no feature), and writeMarkRaw falls back to the flat root path.
  //
  // This is the can-fail proof for the test above — its two central assertions
  // are made to fail here on purpose — and it is the receipt for SCHEMA's ruling
  // that `feature:` is the ground's field, not the town's, and goes with the
  // mark when the mark changes hands.
  const dir = scratch(transferredMark("fixture-footbridge", { x: 100, y: 100 }, { link: false }));
  try {
    const before = read(at(dir, ...NESTED));
    const out = run(dir);
    assert.equal(read(at(dir, ...NESTED)), before, "merrick's own file is still not rewritten (it is not where the generator writes)");
    const twin = read(at(dir, ...TWIN));
    assert.ok(twin, "THE TWIN: a second footbridge record now stands at the root");
    assert.match(twin, /^by: the-town$/m, "…authored by the town, beside merrick's copy");
    assert.doesNotMatch(out, /SPOKEN FOR/, "and the run never noticed — it prints success");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
