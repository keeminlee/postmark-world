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
test('GATE B: "New marks are filed by identity — WORLD/marks/<household>/<slug>/" — a mark born after the freeze anywhere else is FLAGGED (advisory; see mark-lint §6 gate B for why, and how to flip it)', () => {
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
    // ASSERTION 1 OF 2 THAT NAME GATE B'S SEVERITY. Advisory, not refused — the
    // office door still writes every sited draft at the fossil root, so a hard
    // gate here would refuse 33 in-flight drafts nobody mis-filed. The finding,
    // its wording and its named seat are identical either way; `warn(` vs `err(`
    // in mark-lint §6 and this line are the whole difference.
    assert.equal(out.code, 0, "advisory while the office door still files at the fossil root");
    const found = out.findings.find((f) => f.sev === "WARN" && /the-cairn/.test(f.file));
    assert.ok(found, `the finding names the new mark:\n${JSON.stringify(out.findings, null, 2)}`);
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
    // ASSERTION 2 OF 2. Reads EVERY finding, not only the errors: gate B's
    // severity is the founder's to set, and a check over `errorsOf` would go
    // vacuously true the moment it is advisory — which is exactly when this
    // claim, that one record never gets two contradictory instructions, matters
    // most.
    const msgs = out.findings.map((f) => f.msg).join("\n");
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

// ═══════════════════════════════════════════════════════════════════════════
// WHAT THE FREEZE MOVED OFF THE TREE — the readers that used to ask a directory
// ═══════════════════════════════════════════════════════════════════════════
//
// "Containment lives only in the derived fold, emitted as an artifact each
// settlement." Three readers asked the directory instead, and each was correct
// only while the repealed lint forced the directory to equal the geometry. Each
// test below files its subject AT ITS ID — the layout the freeze creates — and
// asserts the reader still answers about the GROUND. All three are red against
// the directory-reading code and green against the map-reading code.

import { fold, loadMarks } from "./marks-fold.mjs";

test("CONFERRAL survives id filing: a guest welcomed onto a neighbour's ground is at home there wherever the file sits", () => {
  // The 2026-08-12 conferred-sovereignty ruling, met by the freeze. Own-ground
  // sovereignty was never at risk — `_sovereign` is geometric and answers at hop
  // 0 — but being WELCOMED requires the standing walk to climb to the holder's
  // parcel and read the word there, and that climb used to be the directory.
  const build = ({ ownPath, guestPath }) => {
    const w = world([
      THE_ROOT,
      { path: `${R}/carys-parcel`, fm: { kind: "parcel", by: "carys", date: "2026-08-11", at: { x: 1000, y: 1000 }, extent: { w: 25, h: 25 } } },
      { path: ownPath, fm: { kind: "sited", by: "carys", date: "2026-08-25", at: { x: 1000, y: 1000 }, extent: { w: 4, h: 4 } } },
      { path: `${R}/bram-parcel`, fm: {
        kind: "parcel", by: "bram", date: "2026-08-11", at: { x: 2000, y: 2000 }, extent: { w: 25, h: 25 },
        consent: `{"dara/the-guest": "welcomed"}`,
      } },
      { path: guestPath, fm: { kind: "sited", by: "dara", date: "2026-08-25", at: { x: 2000, y: 2000 }, extent: { w: 4, h: 4 } } },
    ], null);
    try {
      const state = fold({ marks: loadMarks(w.marks), terrain: null, stakes: [], prev: null, tick: 0 });
      return Object.fromEntries(state.marks.map((m) => [m.id, m]));
    } finally { rmSync(w.dir, { recursive: true, force: true }); }
  };

  const fossil = build({ ownPath: `${R}/carys-parcel/the-hearth`, guestPath: `${R}/bram-parcel/the-guest` });
  const byIdPath = build({ ownPath: "carys/the-hearth", guestPath: "dara/the-guest" });

  // THE CAN-FAIL ONE. Red before the fold carried the containment answer: the
  // guest read `market`, having lost the word its holder spoke over it.
  assert.equal(byIdPath["dara/the-guest"].tier, "home",
    "a welcomed guest filed at its id is still at home on the ground that welcomed it");
  assert.equal(byIdPath["dara/the-guest"].placementParent, "bram/bram-parcel",
    "…because the store carries the ground's answer, which is what the standing walk climbs");

  // THE REGRESSION GUARD, labelled as one: this arm passed before the change
  // too. `sovereign` is geometric already, so own-ground standing never depended
  // on the filing — worth pinning precisely because it is easy to assume it did.
  assert.equal(byIdPath["carys/the-hearth"].tier, "home");
  assert.equal(byIdPath["carys/the-hearth"].sovereign, true);

  // AND THE TWO FILINGS AGREE, which is the whole claim of a static tree: where
  // a mark's file sits is not a fact about the world.
  for (const id of ["carys/the-hearth", "dara/the-guest"]) {
    assert.equal(byIdPath[id].tier, fossil[id].tier, `${id}: standing is the same under both filings`);
    assert.equal(byIdPath[id].sovereign, fossil[id].sovereign, `${id}: sovereignty is the same under both filings`);
    assert.equal(byIdPath[id].placementParent, fossil[id].placementParent, `${id}: containment is the same under both filings`);
  }
});

test("A BOUNTY NOTICE filed at its id is ON the board — the board is ground, not a directory", () => {
  const works = { path: `${R}/the-keeping-works`, fm: {
    kind: "sited", by: "the-town", tier: "constitution", date: "2026-08-11", at: { x: 0, y: 0 }, extent: { w: 200, h: 200 } } };
  const bountyClass = { path: `${R}/the-keeping-works/bounty`, fm: {
    kind: "class", by: "the-town", tier: "constitution", date: "2026-08-11", class: "bounty" } };
  const board = { path: `${R}/the-bounty-board`, fm: {
    kind: "sited", by: "the-town", tier: "constitution", date: "2026-08-11", at: { x: 5000, y: 5000 }, extent: { w: 100, h: 100 } } };
  const notice = { kind: "sited", by: "jetto", date: "2026-08-25", at: { x: 5000, y: 5000 }, extent: { w: 2, h: 2 },
    class: "bounty", ask: "find the thing", reward: 3, status: "open" };

  // No --freeze manifest: this fixture is about the board clause, and holding a
  // synthetic tree to this repo's fossil would refuse it for a different reason.
  const offBoard = (records) => withWorld(records, null, ({ marks }) =>
    runLint(marks).findings.filter((f) => /off the board/.test(f.msg)));

  assert.deepEqual(offBoard([THE_ROOT, works, bountyClass, board, { path: "jetto/a-notice", fm: notice }]), [],
    "filed at its id and standing on the board's ground: on the board");
  assert.deepEqual(offBoard([THE_ROOT, works, bountyClass, board, { path: `${R}/the-bounty-board/a-notice`, fm: notice }]), [],
    "and filed inside the board's directory: still on the board, same answer");

  // THE FLIP: a notice that genuinely stands somewhere else is still told so.
  const elsewhere = offBoard([THE_ROOT, works, bountyClass, board,
    { path: "jetto/a-notice", fm: { ...notice, at: { x: 9000, y: 9000 } } }]);
  assert.equal(elsewhere.length, 1, "a notice standing off the board is warned, wherever it is filed");
});

test("CONSENT speaks for what stands inside your mark — by ground, not by directory", () => {
  const house = { path: `${R}/the-house`, fm: {
    kind: "sited", by: "alice", date: "2026-08-11", at: { x: 1000, y: 1000 }, extent: { w: 100, h: 100 },
    consent: `{"bob/the-shed": "welcomed"}` } };
  const shed = { kind: "sited", by: "bob", date: "2026-08-25", at: { x: 1000, y: 1000 }, extent: { w: 4, h: 4 } };

  const refusals = (records) => withWorld(records, null, ({ marks }) =>
    runLint(marks).findings.filter((f) => f.sev === "ERROR" && /you may speak for your own parcel/.test(f.msg)));

  // THE CAN-FAIL ONE: red before the re-key. Alice's word about a shed standing
  // inside her own house was refused because the shed's FILE was elsewhere.
  assert.deepEqual(refusals([THE_ROOT, house, { path: "bob/the-shed", fm: shed }]), [],
    "a mark standing inside your mark is yours to speak about, wherever its file sits");
  assert.deepEqual(refusals([THE_ROOT, house, { path: `${R}/the-house/the-shed`, fm: shed }]), [],
    "and the directory-filed twin answers identically");

  // THE FLIP: a word about a mark standing somewhere else is still refused.
  const outside = refusals([THE_ROOT, house,
    { path: "bob/the-shed", fm: { ...shed, at: { x: 9000, y: 9000 } } }]);
  assert.equal(outside.length, 1, "a word about ground that is not yours is still refused");
});
