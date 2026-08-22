// sweep-quarantine.test.mjs — one poisoned sketchbook must not refuse the whole town.
//
// Until 2026-08-20, foldRef threw straight out of the sweep's branch loop: a
// single ref that folded with errors refused the ENTIRE settlement, holding every
// other household's work hostage to one malformed row. Founder's ship-word after
// the forecast fix uncovered the same class: quarantine the sketchbook, settle the
// town.
//
// The bar, and each of these is a test below:
//   LOUD          — the ref and the reason ride the sweep's own answer, never a
//                   silent drop. A household's work vanishing quietly at a
//                   settlement is worse than the refusal it replaces.
//   CONSERVATIVE  — nothing from a failing ref half-applies. The skip happens
//                   BEFORE anything in that sketchbook is read, so nothing applies
//                   at all rather than being unwound afterwards.
//   THE REST SETTLE — the whole point.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const record = ({ kind = "sited", by, tier, at, extent, body }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), "date: 2026-08-20"];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

/** A town with two sketchbooks. `poison` names a stake row on a mark that exists
 *  ONLY on that household's branch — which is exactly the shape that killed the
 *  forecast: a publication in transit. On its own branch the mark is present, so
 *  the sweep's markIds filter does NOT drop it; the fold is handed a row it can
 *  refuse, and the sketchbook becomes unfoldable. */
function town(t, { poisonRef = null } = {}) {
  const repo = mkdtempSync(join(tmpdir(), "postmark-quarantine-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (p, text) => { const f = join(repo, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  const has = (ref, p) => { try { git("cat-file", "-e", `${ref}:${p}`); return true; } catch { return false; } };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame" }));
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's parcel" }));
  put("WORLD/marks/let-there-be-light/bob-parcel/mark.md", record({
    kind: "parcel", by: "bob", at: { x: 400, y: 400 }, extent: { w: 100, h: 100 }, body: "bob's parcel" }));
  put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: {} }) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=f", "-c", "user.email=f@t.invalid", "commit", "-q", "-m", "published main");

  const sketch = (household, by, path, at) => {
    git("switch", "-q", "main");
    git("switch", "-q", "-c", `draft/${household}`);
    put(path, record({ by, at, extent: { w: 10, h: 10 }, body: `${by}'s sketch` }));
    git("add", "WORLD/marks");
    git("-c", "user.name=f", "-c", "user.email=f@t.invalid", "commit", "-q", "-m", `${household} sketches`);
  };
  const aPath = "WORLD/marks/let-there-be-light/alice-parcel/alice-shed/mark.md";
  const bPath = "WORLD/marks/let-there-be-light/bob-parcel/bob-shed/mark.md";
  sketch("house-a", "alice", aPath, { x: 110, y: 110 });
  sketch("house-b", "bob", bPath, { x: 410, y: 410 });
  git("switch", "-q", "main");

  // the stake book. A row on a DRAFT-ONLY mark poisons exactly the ref that holds
  // it: present there, so unfiltered; absent everywhere else, so filtered away.
  const stakes = [{ holder: "alice", mark: "alice/alice-parcel", n: 3, weight: 3, tick: 0 }];
  // AN OVER-WITHDRAWAL on a mark that exists only in house-a's sketchbook. It passes
  // the sweep's markIds filter THERE (the mark is present on that ref) and is
  // filtered away everywhere else, so it poisons exactly one sketchbook — which is
  // the shape a quarantine has to survive.
  if (poisonRef === "house-a") stakes.push({ holder: "alice", mark: "alice/alice-shed", n: -5, weight: -5, tick: 0 });
  // OUTSIDE the repo: the sweep refuses to run on a dirty checkout, and a stakes
  // file sitting in the tree is exactly that
  const stakesPath = join(mkdtempSync(join(tmpdir(), "postmark-stakes-")), "stakes.json");
  writeFileSync(stakesPath, JSON.stringify(stakes));
  return { repo, git, has, stakesPath, aPath, bPath };
}

test("the control: with no poisoned row, nothing is quarantined and both sketchbooks settle", (t) => {
  const { repo, stakesPath } = town(t);
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });
  assert.deepEqual(out.quarantined, [], "a clean town quarantines nothing");
  assert.ok(out.published.length >= 1, "and the sweep still does its work");
});

test("FALSIFIER: a poisoned ref is QUARANTINED while the other sketchbooks settle", (t) => {
  const { repo, stakesPath, has } = town(t, { poisonRef: "house-a" });
  // before this change, the line below threw and the whole settlement refused
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });

  assert.equal(out.quarantined.length, 1, "exactly the one bad sketchbook");
  const q = out.quarantined[0];
  assert.equal(q.household, "house-a");
  assert.equal(q.ref, "draft/house-a");

  // THE REST SETTLED — the whole point of the change
  assert.ok(out.published.some((p) => String(p.id ?? "").includes("bob")),
    `bob's work settled anyway: ${JSON.stringify(out.published.map((p) => p.id))}`);
});

test("LOUD: the report names the ref, the reason, and the row that poisoned it", (t) => {
  const { repo, stakesPath } = town(t, { poisonRef: "house-a" });
  const q = settlementSweep({ repo, stakesPath, mainBranch: "main" }).quarantined[0];
  assert.match(q.reason, /set aside/, "it says what happened to the sketchbook");
  assert.match(q.reason, /rest of the town settled/, "and what happened to everyone else");
  assert.ok(q.detail && q.detail.length > 10, "the fold's own words are carried for the operator");
  assert.match(q.detail, /draft\/house-a/, "the detail names the ref");
  // the offending row, dug out of the fold's message so the journal can name it
  // the fold names the MARK for an over-withdrawal rather than quoting the row,
  // so the detail carries it and row is null — best-effort by construction
  assert.ok(q.detail.includes("alice/alice-shed"), "the offending mark is named for the operator");
});

test("CONSERVATIVE: nothing from the quarantined sketchbook half-applies", (t) => {
  const { repo, stakesPath, has, aPath } = town(t, { poisonRef: "house-a" });
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });
  // its mark reaches neither main nor any of the sweep's other channels
  assert.equal(has("main", aPath), false, "the unfoldable sketchbook published nothing to main");
  for (const channel of ["published", "left_drafted", "unpublished", "withdrawn", "rehomed"])
    assert.ok(!JSON.stringify(out[channel] ?? []).includes("alice-shed"),
      `alice-shed leaked into ${channel} — a quarantined sketchbook must not be half-read`);
});

test("a quarantine is not a silence: the sketchbook is still THERE afterwards", (t) => {
  const { repo, stakesPath, git } = town(t, { poisonRef: "house-a" });
  settlementSweep({ repo, stakesPath, mainBranch: "main" });
  const branches = git("for-each-ref", "--format=%(refname:short)", "refs/heads/draft/");
  assert.match(branches, /draft\/house-a/,
    "setting a sketchbook aside must not delete it — the household fixes it and the next crossing takes it");
});
