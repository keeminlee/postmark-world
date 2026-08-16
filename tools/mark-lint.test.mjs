// mark-lint.test.mjs — rung 1 acceptance: the gate quotes the law.
// A refusal must cite the clause mark it enforces — id + body verbatim — so a
// bounced writer holds an investigable handle and the exact law, never a
// paraphrase. The fixture is a minimal tree carrying the REAL logos
// clauses (copied from WORLD/marks), plus deliberate violations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, copyFileSync } from "node:fs";
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
  cpSync(join(REAL, "logos"), join(root, "logos"), { recursive: true });
  return { dir, root };
}

function runLint(marksDir) {
  try { return execFileSync("node", [LINT, "--marks-dir", marksDir], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
}

test("a sited intruder under a predicate bounces citing the-continuation, body verbatim", () => {
  const { dir, root } = fixtureTree();
  const bad = join(root, "logos", "the-one-claim", "the-intruder");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "mark.md"),
    "---\nkind: sited\nby: testerhh\ndate: 2026-08-02\nat: { x: 5, y: 5 }\nextent: { w: 2, h: 2 }\n---\n\nA shed where no shed can stand.\n");
  const out = runLint(dir);
  assert.match(out, /the-town\/the-continuation/, "the clause id is cited");
  assert.match(out, /its own children may only be predicates in turn/, "the clause body is quoted verbatim");
  assert.match(out, /a clause of the-town\/logos/, "the crown is named — the second id of the two-id citation");
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
  writeFileSync(join(root, "logos", "notes.md"), "# stray notes\n");
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

// ── the two-way channel (2026-08-09: L-source-1, L-source-2) ──────────────────
//
// `source:` was parsed and read by nothing, so a charter article could point at
// a document that had been deleted, renamed, or rewritten out from under it, and
// the gate had no opinion. These tests hold both directions: the clause names the
// document, and the document names the clause back.
//
// The fixture is a REPOSITORY, not just a tree — LOGOS/ and the cited documents
// travel with the whole marks tree, because the channel is a fact about a repo
// read whole. The lint is pointed at it with --repo.
//
// The tree must be WHOLE, not just logos. The doc → clause direction reads
// every Rendered line in LOGOS/ and demands the mark it names; a fixture that
// carries all the documents but only some of the marks makes honest documents
// look like liars, and the failure lands on the lint rather than on the fixture
// that caused it. (It did, the day the class marks landed outside logos.)

function fidelityRepo() {
  const repo = mkdtempSync(join(tmpdir(), "fidelity-"));
  const REPO_SRC = join(HERE, "..");
  mkdirSync(join(repo, "WORLD"), { recursive: true });
  cpSync(join(REPO_SRC, "LOGOS"), join(repo, "LOGOS"), { recursive: true });
  copyFileSync(join(REPO_SRC, "WRITES.md"), join(repo, "WRITES.md"));
  copyFileSync(join(REPO_SRC, "WORLD", "skeleton.json"), join(repo, "WORLD", "skeleton.json"));
  cpSync(join(REPO_SRC, "WORLD", "marks"), join(repo, "WORLD", "marks"), { recursive: true });
  return repo;
}

const runRepoLint = (repo) => {
  try { return execFileSync("node", [LINT, "--repo", repo], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
};
const editFile = (repo, rel, from, to) => {
  const p = join(repo, rel);
  const before = readFileSync(p, "utf8");
  assert.ok(before.includes(from), `fixture edit found nothing to replace in ${rel}: ${from}`);
  writeFileSync(p, before.replace(from, to));
};

test("the channel is clean as it stands — every rendering and its source name each other", () => {
  const out = runRepoLint(fidelityRepo());
  assert.match(out, /CLEAN/, `the standing pairs must pass, got:\n${out}`);
});

test("L-source-1: a source: pointing at no file bounces, citing the fidelity clause", () => {
  const repo = fidelityRepo();
  editFile(repo, "WORLD/marks/let-there-be-light/logos/the-gate/the-fidelity/mark.md",
    "source: LOGOS/three-layers.md", "source: LOGOS/the-vanished-doc.md");
  const out = runRepoLint(repo);
  assert.match(out, /\[ERROR\].*source: LOGOS\/the-vanished-doc\.md names no readable file/, "the dangling citation is named");
  assert.match(out, /the-town\/the-fidelity/, "the clause id is cited");
  assert.match(out, /may say less than its source says — never other/, "the clause body is quoted verbatim");
});

test("L-source-1: a source: climbing out of the repo bounces before it is ever read", () => {
  const repo = fidelityRepo();
  editFile(repo, "WORLD/marks/let-there-be-light/logos/the-tense/mark.md",
    "source: LOGOS/state-and-time.md", "source: ../../elsewhere/state-and-time.md");
  assert.match(runRepoLint(repo), /\[ERROR\].*must be a path inside this repository/, "a word outside the repo is a word nobody here can check");
});

test("L-source-2: a document that stops naming its rendering goes red in BOTH directions", () => {
  const repo = fidelityRepo();
  editFile(repo, "LOGOS/tiers.md", "`the-town/the-tiers`", "`the-town/some-other-clause`");
  const out = runRepoLint(repo);
  assert.match(out, /\[ERROR\] LOGOS\/tiers\.md: Rendered line names "the-town\/some-other-clause", which is no mark in the tree/,
    "document → clause: a rendering claimed by nobody");
  assert.match(out, /\[ERROR\].*logos\/the-tiers: source: LOGOS\/tiers\.md renders .* — not "the-town\/the-tiers"/,
    "clause → document: the citation is no longer returned");
});

test("L-source-2: a document naming a mark that does not cite it back is half a channel", () => {
  const repo = fidelityRepo();
  // the-one-claim is a real clause carrying no source: at all
  editFile(repo, "LOGOS/edit-law.md", "`the-town/the-standing-children`", "`the-town/the-one-claim`");
  const out = runRepoLint(repo);
  assert.match(out, /\[ERROR\] LOGOS\/edit-law\.md: Rendered line names "the-town\/the-one-claim", but that mark's source: is absent/,
    "a document may not conscript a clause that never cited it");
});

test('"Rendered in the world: not yet" is an honest declaration — tolerated, until a clause claims it', () => {
  const clean = fidelityRepo();
  assert.match(runRepoLint(clean), /CLEAN/, "reads-and-affordances.md declares not-yet and passes untouched");
  const repo = fidelityRepo();
  editFile(repo, "WORLD/marks/let-there-be-light/logos/the-gate/the-fidelity/mark.md",
    "source: LOGOS/three-layers.md", "source: LOGOS/reads-and-affordances.md");
  assert.match(runRepoLint(repo), /\[ERROR\].*says "Rendered in the world: not yet" — either this clause is early or that line is stale/,
    "a clause rendering a document that says it has no rendering yet");
});

test("the doc → clause direction stays silent on a borrowed tree — the lane must never bounce a stale sketchbook", () => {
  // main's documents, judging a tree that is a crossing behind them: here, a
  // sketchbook so stale that none of logos has reached it yet. Every
  // Rendered line in LOGOS/ names a clause this tree does not have.
  const dir = mkdtempSync(join(tmpdir(), "marklint-stale-"));
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  const out = runLint(dir); // --marks-dir only: not this repo's own tree
  assert.doesNotMatch(out, /Rendered line names/, "no resident is bounced for a clause that has not reached their branch");
});

test("the gate never blocks on its own law's absence — missing clause degrades to an honest lookup-failed", () => {
  // a tree WITHOUT logos: violations still refuse, with the lookup named
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

test("image: only the town's own media shelf hangs on a mark (2026-08-15)", () => {
  const { dir, root } = fixtureTree();
  const good = join(root, "the-postcard");
  mkdirSync(good, { recursive: true });
  writeFileSync(join(good, "mark.md"),
    "---\nkind: sited\nby: testerhh\ndate: 2026-08-15\nat: { x: 40, y: 40 }\nextent: { w: 2, h: 2 }\nimage: https://media.postmark.town/media/testerhh/abc123.png\n---\n\nA postcard pinned to a post.\n");
  const bad = join(root, "the-smuggled-poster");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "mark.md"),
    "---\nkind: sited\nby: testerhh\ndate: 2026-08-15\nat: { x: 44, y: 44 }\nextent: { w: 2, h: 2 }\nimage: https://evil.example/x.png\n---\n\nA poster from nowhere the office ever saw.\n");
  const out = runLint(dir);
  assert.match(out, /the-smuggled-poster[\s\S]*?image: must be one https:\/\/media\.postmark\.town/, "the off-shelf URL is refused by name");
  assert.doesNotMatch(out, /the-postcard\b[^\n]*image:/, "the shelf's own URL passes");
});
