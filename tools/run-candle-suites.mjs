#!/usr/bin/env node
// run-candle-suites.mjs — the candle's gate.
//
// RULED 2026-09-14 (Keemin; brief amended by Wright the same day, issue #2790):
// behaviour gates the candle, text gates the pull request. The grain is the
// TEST, not the file: a test whose assertions read a source file as text —
// a readFileSync of a .mjs, a regex or a count over that text — carries the
// title prefix "[pin] ". This runner hands every suite to node --test with
// those tests skipped. `npm test` still runs all of them, and the pull-request
// workflow is where the pins now live.
//
// WHY IT REFUSES ON ZERO. The marker is a convention, not a type. Strip the
// prefixes, or mistype the pattern, and `--test-skip-pattern` quietly matches
// nothing: every pin is back on the candle and the run still passes green —
// the exact failure this issue exists to end (the S70 crossing, 05:45Z, held
// 29 marks back behind a test that had never watched a camera move). So the
// runner measures how many test titles the marker matches, on the same files
// it is about to hand to node, and refuses to gate when that number is zero.
// It is a gate: it says what it measured, and it can fail.

import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ONE constant, used both to measure and to act, so the count below can never
// describe a different pattern from the one node is given.
export const PIN_PATTERN = "^\\[pin\\] ";
const PIN_RE = new RegExp(PIN_PATTERN);

// every test/it title declared at the top of a line, with its quote style
const TITLE_RE = /^\s*(?:test|it)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*)\1/;

export function suiteFiles(toolsDir = HERE) {
  return readdirSync(toolsDir)
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .map((f) => join(toolsDir, f));
}

export function countPinned(files) {
  let pinned = 0, total = 0;
  for (const f of files) {
    // latin1: one suite carries NUL bytes, and this only ever reads titles
    for (const line of readFileSync(f, "latin1").split("\n")) {
      const m = line.match(TITLE_RE);
      if (!m) continue;
      total++;
      if (PIN_RE.test(m[2])) pinned++;
    }
  }
  return { pinned, total };
}

export function refusal(files, counts) {
  if (files.length === 0) {
    return "the candle has no suites to run: tools/*.test.mjs matched nothing. " +
      "A gate over an empty set passes everything; refusing instead.";
  }
  if (counts.pinned === 0) {
    return `the pin marker matched none of the ${counts.total} tests in ${files.length} suites. ` +
      `Either every source-pin test lost its "[pin] " title prefix, or the pattern ${PIN_PATTERN} no longer ` +
      "matches it. Both mean the candle is still gating on source text, which is what this gate exists to " +
      "prevent — so it refuses rather than passing green.";
  }
  return null;
}

function main() {
  const files = suiteFiles();
  const counts = countPinned(files);

  const no = refusal(files, counts);
  if (no) {
    console.error("candle gate REFUSED: " + no);
    process.exit(2);
  }

  // "test titles", not "tests": this counts declared titles, which is what the
  // marker can be read off. node's own summary counts subtests too and will
  // report a larger number — a different thing, honestly named.
  console.log(
    `candle: ${files.length} suites, ${counts.total} test titles; ` +
    `${counts.pinned} withheld as source pins (titles matching ${PIN_PATTERN}), ` +
    `${counts.total - counts.pinned} gating the crossing.`
  );
  console.log("the withheld tests still run in `npm test`, which is what the pull request gates on.\n");

  const run = spawnSync(
    process.execPath,
    ["--test", `--test-skip-pattern=${PIN_PATTERN}`, ...files],
    { stdio: "inherit", cwd: dirname(HERE) }
  );
  if (run.error) {
    console.error("candle gate REFUSED: node --test could not be started: " + run.error.message);
    process.exit(2);
  }
  process.exit(run.status ?? 1);
}

/**
 * Is this file the one node was asked to run?
 *
 * MEASURED on the fleet's own box, 2026-09-14: under a Windows junction node
 * hands `process.argv[1]` the junction spelling while `import.meta.url` resolves
 * through it, so a strict `===` between them is FALSE and `main()` never runs.
 * The gate would then exit 0 having tested NOTHING — the same quiet pass this
 * whole file exists to prevent, and the fleet's pooled trees are full of
 * junctions. Real paths on both sides are equal in both cases.
 */
export function sameFile(a, b) {
  if (!a || !b) return false;
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
}

if (sameFile(process.argv[1], fileURLToPath(import.meta.url))) main();
