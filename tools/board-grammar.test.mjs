// board-grammar.test.mjs — the bounty grammar reaches the store, and the gate
// holds it to the law.   node --test tools/board-grammar.test.mjs
//
// THE PROBLEM THIS EXISTS FOR: the board page is not its own database — a
// notice IS a world mark (class: bounty + ask + reward + status), and the
// board's reader (site src/lib/board.mjs) has exactly one source: the fold's
// world-state.json. Before this file's siblings landed, the fold's emission
// whitelist silently STRIPPED those fields, so no notice — letter-posted or
// door-posted — could ever reach the page. These tests are the falsifiers:
// drop the carry and they go red by name.
//
// THE CROSS-REPO CONTRACT (kept in words here, in code over there): the reader
// wants `class`, `ask`, `reward`, `status`, `threshold` (civic only),
// `ledger_weight` (rendered as "backed": raw escrow + breadth bonus, no fan-up,
// no terrain), `stamps`, `parent` (placement decides board membership), `by`,
// `date`, `body`. If board.mjs's grammar moves, this file is the world-side
// half that must move with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { fold, loadMarks } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT = join(HERE, "mark-lint.mjs");
const REAL = join(HERE, "..", "WORLD", "marks", "let-there-be-light");
const MARKS_DIR = join(HERE, "..", "WORLD", "marks");
const BOARD = "the-town/the-bounty-board";

const terrain = { features: [], far_features: [] };

// The board at the Town Centre and one notice pinned to it, world coordinates
// (an in-memory fold takes marks as already framed). The plain bench is the
// control: no grammar, no escrow — it must serialize without a single new key.
const marks = () => [
  { id: BOARD, kind: "sited", by: "the-town", household: "the-town", tier: "constitution",
    at: { x: 250, y: -100 }, extent: { w: 30, h: 20 }, date: "2026-08-11", body: "The Bounty Board, in BETA." },
  { id: "wright/bounty-a-map-of-the-quay", kind: "sited", by: "wright", household: "wright",
    at: { x: 250, y: -100 }, extent: { w: 1, h: 1 }, date: "2026-08-11",
    body: "Pinned to the board.", class: "bounty",
    ask: "Draw the quay as it stands, with every mail-house named.", reward: 12, status: "open" },
  { id: "rei/the-far-bench", kind: "sited", by: "rei", household: "rei",
    at: { x: 900, y: 900 }, extent: { w: 4, h: 4 }, date: "2026-08-11", body: "a bench, far off" },
];

// wright's own 5 raw + rei's 10 raw with the town's breadth bonus of 2 baked
// into the external household's first row (the town's world-stake.mjs shape).
const stakes = () => [
  { tick: 0, holder: "wright", mark: "wright/bounty-a-map-of-the-quay", n: 5, weight: 5 },
  { tick: 0, holder: "rei", mark: "wright/bounty-a-map-of-the-quay", n: 10, weight: 12 },
];

const serialized = (state) => JSON.parse(JSON.stringify(state));
const markOf = (state, id) => state.marks.find((m) => m.id === id);

test("the grammar reaches the store: class/ask/reward/status survive the fold", () => {
  const state = serialized(fold({ marks: marks(), terrain, stakes: stakes() }));
  const n = markOf(state, "wright/bounty-a-map-of-the-quay");
  assert.equal(n.class, "bounty");
  assert.equal(n.ask, "Draw the quay as it stands, with every mail-house named.");
  assert.equal(n.reward, 12);
  assert.equal(n.status, "open");
  // (parent is the write-path's to author — the tree IS containment — so the
  // board-membership half of the contract is asserted in the disk-fixture
  // fold below, where a directory exists to carry it.)
});

test("DISK ROUND-TRIP: a nested notice folds with its grammar and its board parent", () => {
  // records → parseRecord → loadMarks → fold → serialize: the whole real
  // pipeline. The reader's isNotice needs BOTH halves — class AND placement.
  const { dir } = fixtureTree();
  const slug = join(dir, "let-there-be-light", "the-bounty-board", "a-notice");
  mkdirSync(slug, { recursive: true });
  writeFileSync(join(slug, "mark.md"), notice({ status: "done" }));
  const state = serialized(fold({ marks: loadMarks(dir), terrain, stakes: [] }));
  const n = state.marks.find((m) => m.id === "testerhh/a-notice");
  assert.ok(n, "the notice folded");
  assert.equal(n.class, "bounty");
  assert.equal(n.ask, "Draw the quay.");
  assert.equal(n.reward, 12);
  // "done" because absence is the lawful default (the reader reads absent as
  // open) — carriage is only provable with a value that isn't the default.
  assert.equal(n.status, "done");
  // THE SECOND SILENT BREAK this file exists for: the store never carried
  // placement on sited marks (`parent` rides only predicated/naming — checked
  // against the live store, 288 of 612, none sited), so the reader's isNotice
  // could never match. Classed marks now disclose placement in the reader's
  // own field name.
  assert.equal(n.placementParent, "the-town/the-bounty-board", "placement carries board membership");
});

test("ledger_weight is the backed number: raw escrow + breadth bonus, no fan-up", () => {
  const state = serialized(fold({ marks: marks(), terrain, stakes: stakes() }));
  const n = markOf(state, "wright/bounty-a-map-of-the-quay");
  assert.equal(n.stamps, 15, "raw escrow: 5 own + 10 external");
  assert.equal(n.ledger_weight, 17, "15 raw + 2 breadth bonus");
  // and it agrees with the receipt the fold already publishes
  assert.equal(n.ledger_weight, n.weight_parts.own_escrow + n.weight_parts.breadth.bonus);
});

test("a world with no notices serializes without a single new key", () => {
  const state = serialized(fold({ marks: marks(), terrain, stakes: stakes() }));
  const bench = markOf(state, "rei/the-far-bench");
  for (const key of ["class", "ask", "reward", "status", "threshold", "placementParent", "ledger_weight"])
    assert.equal(key in bench, false, `${key} must be absent on an unclassed, unstaked mark`);
});

test("LIVE TREE: every class declaration is a town type mark; no notice fields exist yet", () => {
  // The current world: the Keeping Works class TYPE marks (eleven at writing —
  // bounty among them, the-wheelhouse declaring "timetable") are definitions,
  // not notices. If the notice-fields count goes red because a notice landed,
  // that is the world growing, not a defect. Strays elsewhere: investigate.
  const live = loadMarks(MARKS_DIR);
  const classed = live.filter((m) => m.class !== undefined);
  assert.ok(classed.length >= 11, `expected the Keeping Works roster, found ${classed.length}`);
  for (const m of classed) {
    assert.equal(m.by, "the-town", `${m.id}: only town type marks declare classes today`);
    assert.equal(m.tier, "constitution", `${m.id}: type marks are constitution-tier`);
  }
  assert.ok(classed.some((m) => m.class === "bounty"), "the bounty class stands in the roster");
  assert.equal(live.filter((m) => m.ask !== undefined || m.reward !== undefined || m.status !== undefined || m.threshold !== undefined).length, 0);
});

// ── the gate (mark-lint § 3d), run the way the fleet and the PR lane run it ──

function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), "boardlint-"));
  const root = join(dir, "let-there-be-light");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(REAL, "mark.md"), join(root, "mark.md"));
  cpSync(join(REAL, "the-record"), join(root, "the-record"), { recursive: true });
  // the board, in the root's own frame; the notice at the board's centre (0,0
  // in a relative tree), so the fixture holds in either coordinate regime.
  const board = join(root, "the-bounty-board");
  mkdirSync(board, { recursive: true });
  writeFileSync(join(board, "mark.md"),
    "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-08-11\nat: { x: 250, y: -100 }\nextent: { w: 30, h: 20 }\n---\n\nThe Bounty Board, in BETA.\n");
  // the class TYPE mark, standing where definitions stand — the gate exempts
  // the definition BY PLACEMENT (the Keeping Works), the same way the reader
  // knows a notice by placement (review W-1), so the fixture must model both.
  const works = join(root, "the-keeping-works");
  mkdirSync(works, { recursive: true });
  writeFileSync(join(works, "mark.md"),
    "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-08-11\nat: { x: 400, y: 400 }\nextent: { w: 40, h: 40 }\n---\n\nThe Keeping Works: the class definitions stand here.\n");
  const type = join(works, "bounty");
  mkdirSync(type, { recursive: true });
  writeFileSync(join(type, "mark.md"),
    "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-08-11\nat: { x: 0, y: 0 }\nextent: { w: 5, h: 5 }\nclass: bounty\n---\n\nA bounty is one ask, a reward in stamps, a status: open or done.\n");
  return { dir, root, board };
}

const notice = (fields) => {
  const fm = { kind: "sited", by: "testerhh", date: "2026-08-11", at: "{ x: 0, y: 0 }", extent: "{ w: 1, h: 1 }", class: "bounty", ask: "Draw the quay.", reward: 12, ...fields };
  const lines = Object.entries(fm).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `---\n${lines}\n---\n\nPinned to the board.\n`;
};

function runLint(marksDir) {
  try { return execFileSync("node", [LINT, "--marks-dir", marksDir], { encoding: "utf8" }); }
  catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
}

function lintWithNotice(fields) {
  const { dir, board } = fixtureTree();
  const slug = join(board, "a-notice");
  mkdirSync(slug, { recursive: true });
  writeFileSync(join(slug, "mark.md"), notice(fields));
  return runLint(dir);
}

test("a lawful notice passes the gate", () => {
  const out = lintWithNotice({});
  assert.doesNotMatch(out, /ERROR[^\n]*a-notice/, "the lawful notice must not error");
  assert.doesNotMatch(out, /ask is \d+ chars/);
});

test("the gate names each broken field of a notice", () => {
  assert.match(lintWithNotice({ ask: "x".repeat(151) }), /ask is 151 chars; the cap is 150/);
  assert.match(lintWithNotice({ reward: 0 }), /reward: must be a whole number of stamps ≥ 1/);
  assert.match(lintWithNotice({ reward: undefined }), /reward: must be a whole number of stamps ≥ 1/);
  assert.match(lintWithNotice({ status: "closed" }), /status: is open or done/);
  assert.match(lintWithNotice({ class: "quest" }), /names no class the law knows/);
  assert.match(lintWithNotice({ threshold: 100 }), /threshold: is the town's bar/);
});

test("grammar without a class draws the advisory, never a silent pass", () => {
  const out = lintWithNotice({ class: undefined });
  assert.match(out, /ask\/reward\/status without class: bounty/);
});

// ── review W-1: the gate scopes by what the mark IS, not what it carried ────

test("W-1a: a BARE class:bounty on the board cannot slip the gate", () => {
  const out = lintWithNotice({ ask: undefined, reward: undefined, status: undefined });
  assert.match(out, /a bounty notice needs ask:/);
  assert.match(out, /reward: must be a whole number/);
});

test("W-1b: a predicated class:bounty on the board is named a non-notice", () => {
  const { dir, board } = fixtureTree();
  const slug = join(board, "a-sneaky-predicate");
  mkdirSync(slug, { recursive: true });
  writeFileSync(join(slug, "mark.md"),
    "---\nkind: predicated\nby: testerhh\ndate: 2026-08-11\nslot: sneak\nvalue: yes\nclass: bounty\n---\n\nA predicate wearing the class.\n");
  assert.match(runLint(dir), /a bounty notice is a sited mark/);
});

test("a class:bounty token OFF the board draws the off-board warning", () => {
  const { dir, root } = fixtureTree();
  const slug = join(root, "a-stray-notice");
  mkdirSync(slug, { recursive: true });
  writeFileSync(join(slug, "mark.md"), notice({ at: "{ x: 600, y: 600 }" }));
  assert.match(runLint(dir), /class: bounty off the board/);
});

test("the definition in the Keeping Works stays exempt — no ask demanded of it", () => {
  const { dir } = fixtureTree();
  const out = runLint(dir);
  assert.doesNotMatch(out, /ERROR[^\n]*the-keeping-works\/bounty/);
});

test("the '#' truncation: the lint catches the face it CAN see (review O-1)", () => {
  // Honesty about reach: parseRecord strips from the first '#' BEFORE lint
  // reads the record, so a mid-string hash arrives already truncated and
  // lint-clean — the DOOR's bounce is the real wall (office pin), and the
  // PR lane's human eyes are the belt. What lint does catch is the ask that
  // STARTS with '#': it parses to empty and the needs-ask error fires.
  const { dir, board } = fixtureTree();
  const slug = join(board, "a-hash-headed-notice");
  mkdirSync(slug, { recursive: true });
  writeFileSync(join(slug, "mark.md"), notice({ ask: "#3 map the quay" }));
  assert.match(runLint(dir), /a bounty notice needs ask:/);
});
