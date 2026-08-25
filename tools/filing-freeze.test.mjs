// filing-freeze.test.mjs — THE FREEZE, held from both sides.
//
// The law, verbatim (LOGOS/state-and-time.md § "The freeze — filing is static,
// and the tree is a fossil"; the founder, 2026-08-25; rendered in the world as
// `the-town/the-frozen-filing`):
//
//   "Filing is frozen as of 2026-08-25. A mark's directory is its historical
//    filing: it carries no claim, and it never moves again. New marks are filed
//    by identity — WORLD/marks/<household>/<slug>/ — and containment lives only
//    in the derived fold, emitted as an artifact each settlement."
//
//   "The lint's old dir-equals-placementParent check dies with it; in its place
//    stand two gates that enforce the freeze itself: *an existing mark directory
//    that moves is refused*, and *a new mark files at its id*."
//
// Every test below runs the REAL gate as a subprocess against a tree it can
// actually refuse, and every one of them has a lawful twin — a gate that only
// ever passes is not a gate, and a gate that only ever fails is not one either.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");
const FREEZE = join(ROOT, "WORLD/filing-freeze.json");

// ── fixtures ─────────────────────────────────────────────────────────────────
// A spec is { path, fm }; the path under WORLD/marks IS the filing. The manifest
// is written beside the tree, and passed with --freeze — a synthetic world was
// never in this repo's freeze, so it brings its own boundary or none.
const R = "let-there-be-light";
const THE_ROOT = {
  path: R,
  fm: { kind: "sited", by: "the-town", tier: "constitution", date: "2026-08-11", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } },
};

function world(records, frozen) {
  const dir = mkdtempSync(join(tmpdir(), "filing-freeze-"));
  const marks = join(dir, "WORLD", "marks");
  for (const { path, fm } of records) {
    const d = join(marks, ...path.split("/"));
    mkdirSync(d, { recursive: true });
    const lines = Object.entries(fm).map(([k, v]) => {
      if (k === "at") return `at: { x: ${v.x}, y: ${v.y} }`;
      if (k === "extent") return `extent: { w: ${v.w}, h: ${v.h} }`;
      return `${k}: ${v}`;
    });
    writeFileSync(join(d, "mark.md"), `---\n${lines.join("\n")}\n---\n\nA record in a fixture.\n`);
  }
  const freezePath = join(dir, "WORLD", "filing-freeze.json");
  if (frozen) writeFileSync(freezePath, JSON.stringify({ frozen_at: "2026-08-25", count: Object.keys(frozen).length, marks: frozen }, null, 2) + "\n");
  return { dir, marks, freezePath: frozen ? freezePath : null };
}

const withWorld = (records, frozen, fn) => {
  const w = world(records, frozen);
  try { return fn(w); } finally { rmSync(w.dir, { recursive: true, force: true }); }
};

function runLint(marksDir, freezePath) {
  const r = spawnSync(process.execPath,
    [LINT, "--marks-dir", marksDir, ...(freezePath ? ["--freeze", freezePath] : []), "--json"],
    { encoding: "utf8" });
  return { code: r.status, ...JSON.parse(r.stdout) };
}
const errorsOf = (out) => out.findings.filter((f) => f.sev === "ERROR");

// ── GATE A: an existing mark directory that moves is refused ─────────────────
test('GATE A: "A mark\'s directory is its historical filing: it carries no claim, and it never moves again" — a manifest id found at another path is REFUSED', () => {
  const HOUSE = { path: `${R}/the-house`, fm: { kind: "sited", by: "t", date: "2026-08-11", at: { x: 500, y: 500 }, extent: { w: 100, h: 100 } } };
  const frozen = {
    "the-town/let-there-be-light": "WORLD/marks/let-there-be-light",
    "t/the-house": "WORLD/marks/let-there-be-light/the-house",
  };

  // THE LAWFUL TWIN, first — so a refusal below is about the move and not about
  // the fixture being malformed in some way the gate happens to catch.
  withWorld([THE_ROOT, HOUSE], frozen, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 0, JSON.stringify(errorsOf(out), null, 2));
    assert.equal(out.findings.length, 0, "a fossil standing where the fossil says is simply clean");
  });

  // THE FLIP: the same mark, same id, same body, one directory to the left.
  // This is exactly the move the deleted re-home pass used to perform.
  const YARD = { path: `${R}/the-yard`, fm: { kind: "sited", by: "t", date: "2026-08-11", at: { x: 400, y: 400 }, extent: { w: 900, h: 900 } } };
  const MOVED = { ...HOUSE, path: `${R}/the-yard/the-house` };
  withWorld([THE_ROOT, YARD, MOVED], { ...frozen, "t/the-yard": "WORLD/marks/let-there-be-light/the-yard" }, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 1, "refused");
    const found = errorsOf(out).find((f) => /the-house/.test(f.file));
    assert.ok(found, `the refusal names the mark that moved:\n${JSON.stringify(out.findings, null, 2)}`);
    assert.match(found.msg, /it never moves again/, "and quotes the law it is enforcing, verbatim");
    assert.match(found.msg, /the frozen filing names WORLD\/marks\/let-there-be-light\/the-house/,
      "…and names the seat the fossil holds it to, so the fix needs no interpretation");
  });

  // NOT A MOVE: a mark the manifest names that is simply GONE. A withdrawal
  // removes a seat rather than moving one, and the gate must not confuse the
  // two — this arm is the reason gate A is asked of records rather than of rows.
  withWorld([THE_ROOT], frozen, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 0, "a withdrawn mark is not a moved mark");
  });
});

// ── GATE B: a new mark files at its id ───────────────────────────────────────
test('GATE B: "New marks are filed by identity — WORLD/marks/<household>/<slug>/" — a mark born after the freeze anywhere else is REFUSED', () => {
  const frozen = { "the-town/let-there-be-light": "WORLD/marks/let-there-be-light" };
  const CAIRN = { kind: "sited", by: "carys", date: "2026-08-25", at: { x: 1010, y: 990 }, extent: { w: 4, h: 4 } };

  // THE LAWFUL TWIN: filed at its own id, which is all its id ever was.
  withWorld([THE_ROOT, { path: "carys/the-cairn", fm: CAIRN }], frozen, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 0, JSON.stringify(errorsOf(out), null, 2));
  });

  // THE FLIP: the same record, filed the old way — inside the tree, under the
  // world root. Nothing about the record changed; only where it was put.
  withWorld([THE_ROOT, { path: `${R}/the-cairn`, fm: CAIRN }], frozen, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 1, "refused");
    const found = errorsOf(out).find((f) => /the-cairn/.test(f.file));
    assert.ok(found, `the refusal names the new mark:\n${JSON.stringify(out.findings, null, 2)}`);
    assert.match(found.msg, /New marks are filed by identity — WORLD\/marks\/<household>\/<slug>\//,
      "and quotes the law it is enforcing, verbatim");
    assert.match(found.msg, /A new mark files at its id: WORLD\/marks\/carys\/the-cairn/,
      "…and names the seat, which is the id spelled as a path and needs no lookup");
  });
});

// ── the scope of gate B, and the reason it has one ───────────────────────────
//
// ⚠ THE GATE'S READING of a sentence the law states without this qualification,
// flagged rather than buried: gate B binds the kinds whose directory was ever a
// CONTAINMENT claim — sited and parcel. A predicated / naming / class mark is
// its parent CONTINUED (the-town/the-continuation), carries no footprint, and
// takes its subject from the mark it is nested inside. That nesting is
// authorship, not a claim about ground.
//
// The second arm is why this is not a preference. It shows the collision the
// unqualified reading produces: bind a naming mark to its id path and §4 bounces
// it, because a top-level predicate can only attach to TERRAIN. Both rules
// cannot hold it at once, so under the unqualified reading no predicate, name,
// or class instance could ever attach to a mark again.
test("GATE B binds the kinds whose filing was a containment claim — a predicate still nests under what it continues, and could not be filed at its id if it wanted to", () => {
  const frozen = {
    "the-town/let-there-be-light": "WORLD/marks/let-there-be-light",
    "t/the-house": "WORLD/marks/let-there-be-light/the-house",
  };
  const HOUSE = { path: `${R}/the-house`, fm: { kind: "sited", by: "t", date: "2026-08-11", at: { x: 500, y: 500 }, extent: { w: 100, h: 100 } } };
  const NAME = { kind: "naming", by: "jetto", date: "2026-08-25", value: "The Probe" };

  // nested under what it describes — born after the freeze, and clean
  withWorld([THE_ROOT, HOUSE, { path: `${R}/the-house/the-name`, fm: NAME }], frozen, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 0, JSON.stringify(errorsOf(out), null, 2));
  });

  // filed at its id instead: §4 refuses it, and gate B is silent — the two rules
  // would otherwise both bind the same record with opposite instructions
  withWorld([THE_ROOT, HOUSE, { path: "jetto/the-name", fm: NAME }], frozen, ({ marks, freezePath }) => {
    const out = runLint(marks, freezePath);
    assert.equal(out.code, 1, "refused — by the continuation law, not by the freeze");
    const msgs = errorsOf(out).map((f) => f.msg).join("\n");
    assert.match(msgs, /a top-level naming mark must declare parent: terrain:<id>, or be nested under the mark it describes/,
      "the continuation law is what stops it");
    assert.equal(/A new mark files at its id/.test(msgs), false,
      "and the freeze does not ALSO demand the seat that bounce came from — one record, one instruction");
  });
});

// ── the manifest itself ──────────────────────────────────────────────────────
test("the fossil's boundary is present, covers the tree as it stood, and every row it names is a real filing", () => {
  assert.ok(existsSync(FREEZE),
    "WORLD/filing-freeze.json IS the freeze — without it the gates do not run at all, and the record is held to nothing");
  const frozen = JSON.parse(readFileSync(FREEZE, "utf8"));
  assert.equal(frozen.frozen_at, "2026-08-25");
  const rows = Object.entries(frozen.marks);
  assert.equal(rows.length, frozen.count, "the stated count is the row count");
  assert.ok(rows.length >= 900, `the whole tree as it stood at the freeze (${rows.length} rows)`);

  // Every row names a path that is (or was) a mark directory. A row may go
  // absent — a withdrawal removes a seat — but a row that names a path holding
  // something OTHER than a mark was never a filing, and would silently pin a
  // mark to a seat it could never occupy.
  const wrong = [];
  for (const [id, path] of rows) {
    if (!/^WORLD\/marks\//.test(path)) { wrong.push(`${id}: ${path} is not under WORLD/marks/`); continue; }
    const dir = join(ROOT, path);
    if (!existsSync(dir)) continue;                       // withdrawn since the freeze — lawful
    if (!existsSync(join(dir, "mark.md"))) wrong.push(`${id}: ${path} holds no mark.md`);
  }
  assert.deepEqual(wrong, [], "every standing row names a real filing");

  // …and the id is spelled by the row's own leaf, which is what makes gate B's
  // "the path IS the id" true of the fossil too, wherever it happens to sit.
  const mismatched = rows.filter(([id, path]) => path.split("/").pop() !== id.split("/").pop());
  assert.deepEqual(mismatched, [], "a row's leaf directory is the mark's slug — the leaf is the identity, wherever the filing is");
});

test("NEVER REGENERATED: no tool in the repo writes the fossil's boundary", () => {
  // The manifest is the one file here that must not be derivable. A regenerator
  // would re-bless whatever the tree said on the day it ran, which is precisely
  // what the freeze exists to prevent — "the existing tree stands exactly as
  // filed on the freeze date (a fossil, labeled as such)".
  const writers = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.mjs$/.test(name)) continue;
      const text = readFileSync(p, "utf8");
      // a write is a write CALL naming the file, not a mention of its path
      if (/write(File)?Sync\([^)]*filing-freeze/.test(text)) writers.push(`${name}: writes filing-freeze.json`);
    }
  };
  walk(join(ROOT, "tools"));
  assert.deepEqual(writers, [],
    "nothing regenerates the boundary; it was minted once, on 2026-08-25, and is committed history from then on");
});
