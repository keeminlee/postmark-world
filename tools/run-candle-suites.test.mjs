// run-candle-suites.test.mjs — the candle gate's own falsifiers.
//
// The law being tested (Keemin, 2026-09-14, issue #2790, as amended the same
// day): "behaviour suites gate the candle; source-pin and text-reading suites
// gate the pull request", at the grain of the TEST — "Every test whose assertion
// reads a source file as text ... gets the prefix `[pin] ` on its title", and
// the runner "prints the skipped count and refuses to gate if that count is
// zero".
//
// Every probe here is written so it CAN fail: each refusal is shown against a
// control that does not refuse, and the marker probe is run against a fixture
// with the marker stripped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { PIN_PATTERN, suiteFiles, countPinned, refusal, sameFile } from "./run-candle-suites.mjs";
import { npmTestGate } from "./settlement-isolate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function fixture(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-candle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, "utf8");
  return dir;
}

const PINNED = 'test("[pin] the source says so", () => {});\n';
const PLAIN = 'test("the camera moves", () => {});\n';

test("THE FILE LIST IS EVERY SUITE, and nothing that is not one", (t) => {
  const dir = fixture(t, {
    "a.test.mjs": PLAIN,
    "b.test.mjs": PINNED,
    "helper.mjs": "export const x = 1;\n",      // a module, not a suite
    "notes.md": "not a suite\n",
  });
  const names = suiteFiles(dir).map((f) => basename(f));
  assert.deepEqual(names, ["a.test.mjs", "b.test.mjs"], "suites only, sorted");
});

test("THE COUNT IS OF TEST TITLES, pinned against the total", (t) => {
  const dir = fixture(t, { "a.test.mjs": PLAIN + PINNED + PLAIN, "b.test.mjs": PINNED });
  assert.deepEqual(countPinned(suiteFiles(dir)), { pinned: 2, total: 4 });
});

test("IT REFUSES AN EMPTY LIST — a gate over no suites would pass everything", (t) => {
  const empty = fixture(t, {});
  const files = suiteFiles(empty);
  assert.equal(files.length, 0);
  const no = refusal(files, countPinned(files));
  assert.match(String(no), /no suites to run/, "it refuses, and says why");
});

test("IT REFUSES WHEN THE MARKER MATCHES NOTHING — the quiet-failure case this gate exists for", (t) => {
  // the same fixture twice: once marked, once with the prefix stripped. Only
  // the stripped one may refuse, which is what makes this probe able to fail.
  const marked = fixture(t, { "a.test.mjs": PLAIN + PINNED });
  const stripped = fixture(t, { "a.test.mjs": (PLAIN + PINNED).replace("[pin] ", "") });

  const mf = suiteFiles(marked), sf = suiteFiles(stripped);
  assert.equal(refusal(mf, countPinned(mf)), null, "THE CONTROL: a marked tree gates normally");

  const no = refusal(sf, countPinned(sf));
  assert.match(String(no), /matched none of the 2 tests/, "and an unmarked tree refuses, counting what it read");
  assert.match(String(no), /still gating on source text/, "naming the consequence, not just the symptom");
});

test("THE PATTERN THAT IS MEASURED IS THE PATTERN THAT IS PASSED TO NODE", () => {
  // one constant, so the printed count can never describe a different pattern
  // from the one the run is given.
  assert.equal(PIN_PATTERN, "^\\[pin\\] ");
  assert.ok(new RegExp(PIN_PATTERN).test("[pin] a source pin"));
  assert.ok(!new RegExp(PIN_PATTERN).test("a behaviour test"));
  assert.ok(!new RegExp(PIN_PATTERN).test("the word [pin] in the middle"), "it anchors at the start");
});

test("THE ISOLATE'S GATE RUNS test:candle, not the whole suite (the spy)", () => {
  const calls = [];
  const spy = (cmd, args) => (calls.push([cmd, ...args]), { status: 0, stdout: "", stderr: "" });
  const out = npmTestGate("/some/clone", spy);

  assert.equal(out.green, true);
  assert.equal(calls.length, 1, "one command, not two");
  const line = calls[0].join(" ");
  assert.match(line, /^npm run test:candle\b/, "the crossing gates on the candle set");
  assert.doesNotMatch(line, /^npm test\b/, "and not on every suite — the S70 refusal is what that cost");
});

test("FALSIFIER — the spy would catch the old command, so the probe above can fail", () => {
  const calls = [];
  const spy = (cmd, args) => (calls.push([cmd, ...args]), { status: 0, stdout: "", stderr: "" });
  // the pre-ruling gate, written out here on purpose
  spy("npm", ["test", "--silent"]);
  assert.doesNotMatch(calls[0].join(" "), /^npm run test:candle\b/,
    "if npmTestGate still ran `npm test`, the assertion above would not hold");
});

test("THE RUN GUARD SEES THROUGH A LINK — or the gate would exit 0 having tested nothing", (t) => {
  // MEASURED 2026-09-14 on the fleet's box: under a Windows junction, argv[1]
  // keeps the junction spelling while import.meta.url resolves through it. The
  // old guard compared those with === and would have skipped main() entirely,
  // passing the crossing green on an empty run. The pooled trees are full of
  // junctions, so this is the live case, not a hypothetical.
  const dir = mkdtempSync(join(tmpdir(), "postmark-candle-link-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const real = join(dir, "runner.mjs");
  const link = join(dir, "through-a-link.mjs");
  writeFileSync(real, "export const x = 1;\n");
  try {
    symlinkSync(real, link, "file");
  } catch {
    t.skip("this platform will not make a link without privileges");
    return;
  }

  assert.notEqual(real, link, "two spellings, so === would say no");
  assert.ok(sameFile(real, link), "and one file underneath, which is what the guard must see");
  assert.ok(!sameFile(real, join(dir, "someone-else.mjs")),
    "THE CONTROL: a path that is not this file is still not this file");
  assert.ok(!sameFile(undefined, real), "and a missing argv[1] is not a match");
});

test("[pin] THE INSTANCE IS MARKED BY NAME — the test that refused S70 carries the prefix", () => {
  // Falsifier 3, as amended. This is a claim about a TITLE, so it reads the
  // suite as text — which makes it a pin itself, and it carries the prefix so
  // the candle does not gate on it. It gates the pull request instead, which is
  // exactly where a change to a test's name belongs.
  const src = readFileSync(join(HERE, "viewer-camera-bounds.test.mjs"), "utf8");
  assert.match(src, /^test\("\[pin\] THE EXIT AND THE SEARCH'S ARRIVAL ARE THE ONLY CALLERS THAT KEEP THEIR ZOOM/m,
    "the camera pin that held 29 marks back on 2026-09-14 is withheld from the crossing");
  assert.match(src, /^test\('LOCK PAN TO THE EDGES/m,
    "and the behaviour tests in the same file are NOT marked — those still gate the crossing");
});
