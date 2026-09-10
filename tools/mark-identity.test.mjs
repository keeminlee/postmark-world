// mark-identity.test.mjs — A RULED TRANSFER MUST NEVER RED THE CROSSING THAT
// FIRST CARRIES IT (the class, 2026-09-10).
//
// ── THE INCIDENT ────────────────────────────────────────────────────────────
//
// PR #29 (merged 12:28 EDT) moved `the-town/the-lanternstep-parlor` to
// `wright/the-lanternstep-parlor` — a founder-ruled transfer, done by the book:
// DEC-16 re-identification, `by:` and the slug moving together, the leaf
// untouched. `tools/threshold-furniture.test.mjs` named that mark by a literal
// and looked it up in `WORLD/world-state.json`, which is DERIVED and is refolded
// only at the crossing. So for the hours between the transfer commit and the next
// settlement, the committed file said the old id and a fresh fold said the new
// one, and there was no literal the test could carry that was true on both sides:
// repointing it redded it before the refold, leaving it redded it after. It went
// `not ok 423 / 424`, the isolation pass could not attribute the reds to any
// carried mark, and the 17:45Z settlement REFUSED — 2 published, 330 marks left
// drafted. A lawful act of the town broke the machinery that was carrying it.
//
// The one-id repoint was the instance (#32). This is the class, and the class is
// that a literal in a test is a HANDLE, not a name: it must be RESOLVED against
// the set of records at hand, through the transfer's own declared record.
//
// ── WHAT THIS FILE HOLDS ────────────────────────────────────────────────────
//
// The falsifier is a fixture transfer performed on a scratch copy of the real
// world, refolded, with the real `threshold-furniture.test.mjs` run against it.
// It is built so that BOTH outcomes are reachable and both are checked:
//
//   the transfer WITH its `formerly:` line       →  the suite stays green
//   the same transfer with the line OMITTED      →  the suite REDS, by name
//
// The second half is the point as much as the first. It proves the probe can
// fail, and it proves the resolver does not launder an UNDECLARED re-authorship
// into a transfer — which matters, because a transfer and someone quietly
// rewriting `by:` on a mark that is not theirs look identical in the tree (same
// path, same leaf, a different author). Inferring one from that shape would wave
// the other through, and catching the other is what `tier-frames.test.mjs`'s loss
// clause is for. So the resolver reads only DECLARED rulings, and this file is
// where that refusal is made to happen on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  loadMarks, reIdentifications, currentMarkId, markIdentityChain,
  resolveMarkId, markIndex, loadReIdentifications,
} from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rec = (id, extra = {}) => ({ id, ...extra });

// ── the declared sources, read on their own ─────────────────────────────────

test("A RECORD'S `formerly:` IS A RULING, and it is read as one", () => {
  const hops = reIdentifications([
    rec("wright/the-cellar-door", { formerly: "the-town/the-cellar-door" }),
    rec("rei/the-far-bench"),
  ]);
  assert.deepEqual([...hops], [["the-town/the-cellar-door", "wright/the-cellar-door"]]);
  assert.equal(currentMarkId("the-town/the-cellar-door", hops), "wright/the-cellar-door");
  assert.equal(currentMarkId("rei/the-far-bench", hops), "rei/the-far-bench",
    "a mark that never changed hands is its own current name");
});

test("A FOSSIL IS RE-KEYED IN THE FREEZE MANIFEST INSTEAD, and both sources feed one map", () => {
  // a fossil's PATH never moves (gate A), so its old→new pair cannot live on a
  // record that moved with its id — it is re-keyed in place in the manifest
  const hops = reIdentifications(
    [rec("wright/the-cellar-door", { formerly: "the-town/the-cellar-door" })],
    { re_identified: {
      law: "prose, not a row — and it must not be read as one",
      "2026-09-10": { ruling: "the inlet is terrain", rows: { "the-town/blackwater-bend-grove": "merrick-nocturne/blackwater-bend-grove" } },
    } });
  assert.equal(hops.size, 2, "one from the record, one from the manifest");
  assert.equal(currentMarkId("the-town/blackwater-bend-grove", hops), "merrick-nocturne/blackwater-bend-grove");
});

test("A MARK MAY CHANGE HANDS MORE THAN ONCE, and the chain is walked to its end", () => {
  const hops = reIdentifications([rec("c/x", { formerly: ["a/x", "b/x"] })]);
  assert.equal(currentMarkId("a/x", hops), "c/x");
  assert.equal(currentMarkId("b/x", hops), "c/x");
  assert.deepEqual(markIdentityChain("b/x", hops), ["a/x", "b/x", "c/x"], "the names it has answered to, the current one last");
});

test("A CYCLE IS REFUSED RATHER THAN SPUN", () => {
  const hops = new Map([["a/x", "b/x"], ["b/x", "a/x"]]);
  assert.throws(() => currentMarkId("a/x", hops), /cycle/);
});

test("MALFORMED RULINGS REFUSE, NAMING THE RECORD — a `formerly:` nobody can follow is worse than none", () => {
  assert.throws(() => reIdentifications([rec("a/x", { formerly: "" })]), /a\/x.*says nothing/s);
  assert.throws(() => reIdentifications([rec("a/x", { formerly: "not-an-id" })]), /a\/x.*not a mark id/s);
  assert.throws(() => reIdentifications([rec("a/x", { formerly: "a/x" })]), /names itself/);
  assert.throws(() => reIdentifications([
    rec("b/x", { formerly: "a/x" }), rec("c/x", { formerly: "a/x" }),
  ]), /re-identified twice/);
});

// ── the resolver: a literal is a handle, and it answers in both directions ──

test("THE RESOLVER ANSWERS IN THE NAMES THE SET AT HAND USES — both sides of a transfer are real", () => {
  const hops = reIdentifications([rec("wright/parlor", { formerly: "the-town/parlor" })]);
  const committed = [rec("the-town/parlor")];   // world-state.json, folded BEFORE the transfer
  const fresh = [rec("wright/parlor")];         // the fold the crossing is about to write

  for (const handle of ["the-town/parlor", "wright/parlor"]) {
    assert.equal(resolveMarkId(handle, committed, { hops }), "the-town/parlor",
      `${handle} in the committed world`);
    assert.equal(resolveMarkId(handle, fresh, { hops }), "wright/parlor",
      `${handle} in a fresh fold`);
  }
});

test("A HANDLE THAT NAMES NOTHING IS AN ERROR, NEVER A SKIP — the `if (!m) continue` class", () => {
  // the failure this refuses: a test whose subject has quietly left the world
  // reporting `ok` about nobody, forever
  const hops = reIdentifications([rec("wright/parlor", { formerly: "the-town/parlor" })]);
  assert.throws(
    () => resolveMarkId("nobody/at-all", [rec("wright/parlor")], { hops, where: "a test" }),
    (e) => /a test: "nobody\/at-all" names no mark/.test(e.message) && /formerly: nobody\/at-all/.test(e.message),
    "the refusal names the id and says what would make it resolvable");
  assert.throws(
    () => resolveMarkId("the-town/parlor", [rec("rei/somewhere-else")], { hops }),
    /nor any of its other names: wright\/parlor/,
    "…and when the handle HAS other names, it says it tried them");
});

test("markIndex ANSWERS TO EVERY NAME A RECORD HAS CARRIED, in either direction", () => {
  const hops = reIdentifications([rec("wright/parlor", { formerly: "the-town/parlor" })]);
  const committed = markIndex([rec("the-town/parlor", { n: 1 }), rec("rei/bench", { n: 2 })], { hops });
  assert.equal(committed.get("wright/parlor")?.n, 1, "the new name finds the old row");
  assert.equal(committed.get("the-town/parlor")?.n, 1, "and the old name still finds it");
  assert.equal(committed.get("rei/bench")?.n, 2, "a mark that never moved is untouched");
  assert.equal(committed.get("nobody/at-all"), undefined, "and nothing is invented");

  const fresh = markIndex([rec("wright/parlor", { n: 1 })], { hops });
  assert.equal(fresh.get("the-town/parlor")?.n, 1, "and the same holds from the other side");
});

test("A FORMER NAME A STANDING MARK HAS SINCE TAKEN IS NOT AN ALIAS", () => {
  // two `the-lamp`s under different authors are legal (SCHEMA § Identity), so a
  // vacated name can be claimed again. Answering a question about the wrong mark
  // is worse than not answering it.
  const hops = reIdentifications([rec("wright/parlor", { formerly: "the-town/parlor" })]);
  const idx = markIndex([rec("the-town/parlor", { who: "the new tenant" }), rec("wright/parlor", { who: "the transferred mark" })], { hops });
  assert.equal(idx.get("the-town/parlor").who, "the new tenant", "the live mark keeps its own name");
  assert.equal(idx.get("wright/parlor").who, "the transferred mark");
});

// ── the live record ─────────────────────────────────────────────────────────

test("EVERY DECLARED RE-IDENTIFICATION IN THE LIVE WORLD LANDS ON A STANDING MARK", () => {
  const marks = loadMarks(join(ROOT, "WORLD/marks"));
  const hops = loadReIdentifications();
  assert.ok(hops.size > 0, "the world has changed hands at least once and says so");
  const standing = new Set(marks.map((m) => m.id));
  for (const [was, now] of hops) {
    assert.ok(standing.has(currentMarkId(was, hops)),
      `\`formerly: ${was}\` points at ${now}, which is not in the world — a ruling whose subject is gone`);
    assert.ok(!standing.has(was),
      `${was} was re-identified, yet a mark still stands under that name — one of the two is wrong`);
  }
});

// ── THE FALSIFIER: a fixture transfer, on a scratch, refolded ───────────────

/** A foldable copy of the real world. */
function scratchWorld() {
  const dir = mkdtempSync(join(tmpdir(), "pm-identity-"));
  for (const d of ["WORLD", "tools", "spectator"]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(dir, "package.json"));
  return dir;
}

/** Re-author `wright/the-cellar-door` into a household of its own — the same act
 *  #29 performed on the parlor, on a mark that has already changed hands once, so
 *  the chain (the-town → wright → fixture) is walked and not merely stepped.
 *  `declare: false` performs the move and writes NO ruling: an in-place
 *  re-authorship, indistinguishable from a transfer in the tree. */
function fixtureTransfer(dir, { declare }) {
  const from = join(dir, "WORLD/marks/wright/the-cellar-door/mark.md");
  const toDir = join(dir, "WORLD/marks/threshold-fixture/the-cellar-door");
  const src = readFileSync(from, "utf8");
  assert.match(src, /^by: wright$/m, "the fixture's subject is wright's — if it moved, re-read this test");
  let out = src.replace(/^by: wright$/m, "by: threshold-fixture");
  out = declare
    ? out.replace(/^formerly: .*$/m, "formerly: wright/the-cellar-door")
    : out.replace(/^formerly: .*\n/m, "");
  mkdirSync(toDir, { recursive: true });
  writeFileSync(join(toDir, "mark.md"), out);
  rmSync(dirname(from), { recursive: true, force: true });
  return toDir;
}

/** Refold, so the committed world-state carries the mark's NEW name — this is the
 *  crossing arriving, which is the exact instant the incident happened at. */
function refold(dir) {
  const r = spawnSync(process.execPath, [join(dir, "tools/marks-fold.mjs"), "--allow-stampless"],
    { encoding: "utf8", cwd: dir, timeout: 300000 });
  assert.equal(r.status, 0, `the scratch fold failed: ${(r.stderr || "").slice(-800)}`);
  const state = JSON.parse(readFileSync(join(dir, "WORLD/world-state.json"), "utf8"));
  assert.ok(state.marks.some((m) => m.id === "threshold-fixture/the-cellar-door"),
    "the refold carries the mark under its NEW name — without that this falsifier proves nothing");
  return state;
}

/** `node --test` takes a GLOB, and on Windows an absolute path matches nothing and
 *  exits 0 having run no tests — a silent zero that would read as green forever. So
 *  the path is relative to the scratch, and the run is required to have said
 *  something: a probe that cannot speak cannot be believed either way. */
function runThresholdFurniture(dir) {
  // …and the child must not inherit THIS process's test context, or node answers
  // "run() is being called recursively" and exits 0 having run nothing at all
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ["--test", "tools/threshold-furniture.test.mjs"],
    { encoding: "utf8", cwd: dir, timeout: 300000, env });
  assert.match(String(r.stdout), /^ℹ tests [1-9]/m,
    `the scratch run reported no tests at all — it proves nothing:
${(r.stdout + r.stderr).slice(-800)}`);
  return r;
}

test("THE FALSIFIER: a ruled transfer, refolded, and the test that names the mark stays green", { timeout: 300000 }, () => {
  const dir = scratchWorld();
  try {
    fixtureTransfer(dir, { declare: true });
    refold(dir);
    // threshold-furniture still names the door `wright/the-cellar-door` — the name
    // it carried when that file was written, and the one it no longer has. Before
    // this lane that literal was pinned and this run redded; now it is resolved
    // through the ruling on the record and the file does not notice the transfer.
    const r = runThresholdFurniture(dir);
    assert.equal(r.status, 0,
      `a RULED transfer redded the crossing carrying it — the whole class this lane closes:\n${(r.stdout + r.stderr).slice(-2000)}`);
    assert.match(r.stdout, /pass 3/, "and all three of its tests ran rather than being skipped past");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("AND IT CAN FAIL: the same move with NO ruling written reds, by name", { timeout: 300000 }, () => {
  // the can-fail flip for the test above, and the anti-laundering gate at once.
  // In the tree these two runs are identical — same path, same leaf, a different
  // author. The only difference is whether a ruling was written down, and that
  // difference alone decides whether the world follows the mark.
  const dir = scratchWorld();
  try {
    fixtureTransfer(dir, { declare: false });
    refold(dir);
    const r = runThresholdFurniture(dir);
    assert.notEqual(r.status, 0,
      "an UNDECLARED re-authorship was followed as though it were a ruled transfer — the resolver is inferring, and it must not");
    assert.match(r.stdout + r.stderr, /wright\/the-cellar-door/,
      "…and the refusal names the id that could not be resolved");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
