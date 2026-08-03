// mark-lint.test.mjs — rung 1 acceptance: the gate quotes the law.
// A refusal must cite the clause mark it enforces — id + body verbatim — so a
// bounced writer holds an investigable handle and the exact law, never a
// paraphrase. The fixture is a minimal tree carrying the REAL the-record
// clauses (copied from WORLD/marks), plus deliberate violations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT = join(HERE, "mark-lint.mjs");
const REAL = join(HERE, "..", "WORLD", "marks", "let-there-be-light");

function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), "marklint-"));
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "the-record"), join(root, "the-record"), { recursive: true });
  return { dir, root };
}

function runLint(marksDir) {
  try { return execFileSync("node", [LINT, "--marks-dir", marksDir], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
}

test("a sited intruder under a predicate bounces citing the-continuation, body verbatim", () => {
  const { dir, root } = fixtureTree();
  const bad = join(root, "the-record", "the-one-claim", "the-intruder");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "mark.md"),
    "---\nkind: sited\nby: testerhh\ndate: 2026-08-02\nat: { x: 5, y: 5 }\nextent: { w: 2, h: 2 }\n---\n\nA shed where no shed can stand.\n");
  const out = runLint(dir);
  assert.match(out, /the-town\/the-continuation/, "the clause id is cited");
  assert.match(out, /its own children may only be predicates in turn/, "the clause body is quoted verbatim");
  assert.match(out, /a clause of the-town\/the-record/, "the crown is named — the second id of the two-id citation");
});

test("an over-cap body bounces citing the-one-claim", () => {
  const { dir, root } = fixtureTree();
  const bad = join(root, "the-windbag");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "mark.md"),
    "---\nkind: sited\nby: testerhh\ndate: 2026-08-02\nat: { x: 40, y: 40 }\nextent: { w: 2, h: 2 }\n---\n\n" + "A very long claim indeed. ".repeat(10) + "\n");
  const out = runLint(dir);
  assert.match(out, /the-town\/the-one-claim/, "the clause id is cited");
  assert.match(out, /What needs more sentences needs more marks/, "the clause body is quoted");
});

test("a stray .md bounces citing the-one-file", () => {
  const { dir, root } = fixtureTree();
  writeFileSync(join(root, "the-record", "notes.md"), "# stray notes\n");
  const out = runLint(dir);
  assert.match(out, /the-town\/the-one-file/, "the clause id is cited");
  assert.match(out, /anything else worth\s+keeping must be a full mark/, "the clause body is quoted");
});

test("the gate never blocks on its own law's absence — missing clause degrades to an honest lookup-failed", () => {
  // a tree WITHOUT the-record: violations still refuse, with the lookup named
  const dir = mkdtempSync(join(tmpdir(), "marklint-bare-"));
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  const bad = join(root, "the-windbag");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "mark.md"),
    "---\nkind: sited\nby: testerhh\ndate: 2026-08-02\nat: { x: 40, y: 40 }\nextent: { w: 2, h: 2 }\n---\n\n" + "A very long claim indeed. ".repeat(10) + "\n");
  const out = runLint(dir);
  assert.match(out, /\[ERROR\].*the cap is 150/, "the refusal itself still fires");
  assert.match(out, /clause not found in the record/, "and the failed lookup is named, not hidden");
});
