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

// ── the timetable gate (2026-08-07: the Post Office as a scheduled service) ──
//
// A timetable holds a service together with mark IDS alone — coordinates are
// never copied into it. So the ids are exactly what can rot, and the gate has to
// be strict about them: a schedule naming a mark that isn't there is a boat that
// silently never comes, and the residents on the quay are the ones who find out.

// A minimal line: a quay, a far stop, a boat, and the clock that schedules her.
// Sited at the root and non-overlapping, so no containment edge is asserted.
function timetableTree(timetableLine, { mechanic = "mechanic: timetable\n" } = {}) {
  const { dir, root } = fixtureTree();
  const put = (slug, fm, body) => {
    mkdirSync(join(root, slug), { recursive: true });
    writeFileSync(join(root, slug, "mark.md"), `---\nkind: sited\nby: testerhh\ndate: 2026-08-07\n${fm}---\n\n${body}\n`);
  };
  put("the-quay", "at: { x: 0, y: 0 }\nextent: { w: 10, h: 10 }\n", "A quay.");
  put("the-far-stop", "at: { x: 0, y: 5000 }\nextent: { w: 10, h: 10 }\n", "A landing far down the water.");
  put("the-boat", "at: { x: 100, y: 0 }\nextent: { w: 4, h: 8 }\n", "A boat.");
  put("the-clock", `at: { x: 200, y: 0 }\nextent: { w: 2, h: 2 }\n${mechanic}${timetableLine}`, "A clock that keeps a schedule.");
  return dir;
}

const GOOD = '{"vessel": "testerhh/the-boat", "pace": 405, "stops": [{"mark": "testerhh/the-quay", "departs": ["06:00Z", "18:00Z"]}, {"mark": "testerhh/the-far-stop", "departs": ["00:00Z", "12:00Z"]}]}';

test("a well-formed timetable passes the gate — the strictness has a door in it", () => {
  const out = runLint(timetableTree(`timetable: ${GOOD}\n`));
  assert.match(out, /CLEAN/, `a valid schedule must lint clean, got:\n${out}`);
});

test("the timetable gate refuses every way a schedule can quietly not sail", () => {
  const bounce = (line, re, why) => {
    const out = runLint(timetableTree(line));
    assert.match(out, re, `${why} — got:\n${out}`);
  };
  bounce(`timetable: ${GOOD.replace("testerhh/the-far-stop", "testerhh/nowhere")}\n`,
    /\[ERROR\].*"testerhh\/nowhere" names no mark/, "a stop naming no mark");
  bounce(`timetable: ${GOOD.replace('"06:00Z"', '"6am"')}\n`,
    /\[ERROR\].*"6am" is not a departure time/, "a time that does not parse");
  bounce(`timetable: ${GOOD.replace('"pace": 405', '"pace": 0')}\n`,
    /\[ERROR\].*pace: must be a positive number/, "a pace of zero");
  bounce(`timetable: ${GOOD.replace('"pace": 405', '"pace": "quick"')}\n`,
    /\[ERROR\].*pace: must be a positive number/, "a pace that is not a number");
  bounce(`timetable: ${GOOD.replace('{"mark": "testerhh/the-far-stop", "departs": ["00:00Z", "12:00Z"]}', "")
                          .replace(", ]", "]")}\n`,
    /\[ERROR\].*at least two stop marks/, "a line with one stop");
  bounce(`timetable: ${GOOD.replace('"vessel": "testerhh/the-boat"', '"vessel": "testerhh/the-ghost"')}\n`,
    /\[ERROR\].*names no mark — the vessel is a mark/, "a vessel that does not exist");
  bounce(`timetable: 06:00Z and 18:00Z\n`,
    /\[ERROR\].*must be a structured record/, "prose where a record belongs");
});

test("the mechanic and the schedule travel together — neither half is a service alone", () => {
  const noField = runLint(timetableTree("", { mechanic: "mechanic: timetable\n" }));
  assert.match(noField, /\[ERROR\].*mechanic: timetable but no timetable: field/,
    "a pointer at machinery with nothing for it to run");
  const noMechanic = runLint(timetableTree(`timetable: ${GOOD}\n`, { mechanic: "" }));
  assert.match(noMechanic, /\[ERROR\].*timetable: is set but mechanic: is undefined/,
    "a schedule no registered machinery runs");
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
