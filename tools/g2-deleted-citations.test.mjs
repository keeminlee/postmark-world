// g2-deleted-citations.test.mjs — the G2 deletion's closing rule, on the world half.
//
// The runbook's deletion receipt 2 and its closing rule, verbatim: "`grep -rn` for
// each deleted module name returns nothing in `src/`" and "after this deletion, grep
// the citations. Every comment citing repealed machinery is a written-down now-false
// premise."
//
// THE DISTINCTION, the same one the office half draws: a deleted tool may still be
// NAMED in prose that records its removal, and that record is worth keeping. What may
// not survive is a citation in something that RUNS, or a comment that tells a reader
// to run it. So there are two sweeps — one for the name in executable files, one for
// the IMPERATIVE anywhere. The second is the sharper of the pair and the reason this
// file exists: four comments told a caller to run `households-project.mjs`.
//
// It can fail, and it failed before the commits that added it: at the world train tip
// `2714f92d` both tools existed and all four instructions were live.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

// The G2 rows this branch deletes, with the row number the list gives them.
const DELETED = [
  { row: "P-128", path: "tools/settlement-freeze.mjs" },
  { row: "P-128", path: "tools/settlement-freeze.test.mjs" },
  { row: "P-145", path: "tools/households-project.mjs" },
  { row: "P-145", path: "tools/households-project.test.mjs" },
];

// P-145's output OUTLIVES its generator, and that is the deletion's cost. The fixture
// is now unregenerable from this repo, so the one thing that must not happen quietly
// is it going missing too — a stale answer is a known quantity, an absent one silently
// re-grains the fold onto WORLD/households.json's CREDENTIAL key, which files one
// household's two accounts as strangers to each other.
const FROZEN_PROJECTION = "WORLD/fixtures/households-declared-2026-08-10.json";

const CODE_EXT = new Set([".mjs", ".js", ".sh", ".json"]);
const SKIP_DIR = new Set(["node_modules", ".git", "STATE", "WORLD"]);

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else {
      const dot = entry.lastIndexOf(".");
      if (dot !== -1 && CODE_EXT.has(entry.slice(dot))) out.push(full);
    }
  }
  return out;
};

const rel = (f) => relative(REPO, f).split(sep).join("/");
// This file names the deleted tools on purpose — it IS the deletion's receipt.
const codeFiles = () => walk(REPO).filter((f) => f !== fileURLToPath(import.meta.url));

test("G2: the deleted world tools are gone from the tree", () => {
  for (const { row, path } of DELETED) {
    assert.equal(existsSync(join(REPO, ...path.split("/"))), false,
      `${path} is on G2 row ${row} and must not be on disk`);
  }
});

// The needles carry their extension on purpose: `settlement-sweep.test.mjs` names a
// TEMP DIRECTORY "postmark-settlement-freeze-", a string that reads like the tool and
// is not a reference to it.
const NEEDLES = [...new Set(DELETED.map((d) => d.path.split("/").pop()))];
// A line RECORDS a deletion rather than citing a live tool when it carries the row
// number or the word beside the name. ±1 line, because a comment wraps.
const MARKER = /\b(?:deleted|DELETED|G2|P-145|P-128)\b/;

test("G2: nothing that RUNS reaches for a deleted world tool (the runbook's receipt 2)", () => {
  // Reaching means importing it, shelling it, or naming its path as an argument —
  // not mentioning it in a comment, which the next test governs.
  const reaches = (line, n) => new RegExp(
    String.raw`(?:from\s*["'][^"']*|import\s*\(\s*["'][^"']*|node\s+\S*|["'][^"']*)` + n.replace(".", "\\."),
  ).test(line) && !/^\s*(?:\/\/|\*|#)/.test(line);
  const offenders = [];
  for (const file of codeFiles()) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    text.split(/\r?\n/).forEach((line, i) => {
      for (const n of NEEDLES) if (reaches(line, n)) offenders.push(`${rel(file)}:${i + 1} -> ${n}`);
    });
  }
  assert.deepEqual(offenders, [],
    "a deleted tool is still reached for by something that runs");
});

test("G2: every surviving mention of a deleted tool RECORDS the deletion", () => {
  // The rule the office half's markdown carve made informal, made mechanical here,
  // because on this side the surviving mentions are in `.mjs` comments and a flat
  // name-grep cannot tell "this was removed" from "run this". A mention without its
  // marker is the written-down now-false premise the runbook's closing rule is about.
  const offenders = [];
  for (const file of codeFiles()) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const n of NEEDLES) {
        if (!line.includes(n)) continue;
        const window = [lines[i - 1] ?? "", line, lines[i + 1] ?? ""].join("\n");
        if (!MARKER.test(window)) offenders.push(`${rel(file)}:${i + 1} -> ${n}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    "a deleted tool is named without saying it is gone — the next reader carries that away as knowledge");
});

test("G2: no comment tells a reader to RUN a deleted tool", () => {
  // Sharper than the sweep above, and the reason this file exists: a citation that
  // RECORDS history is fine, an INSTRUCTION is not. `marks-fold.mjs` said "Pass
  // --households <projection> from tools/households-project.mjs"; a reader following
  // that today would reach for a file that is not there.
  const imperative = /(?:^|[^\w])(?:node|run|Run|Pass|pass|invoke)\b[^\n]{0,80}households-project\.mjs/;
  const offenders = [];
  for (const file of codeFiles()) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (imperative.test(line)) offenders.push(`${rel(file)}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], "a comment still instructs a reader to run a tool G2 deleted");
});

test("G2 · P-145: the frozen projection survives its deleted generator", () => {
  const path = join(REPO, ...FROZEN_PROJECTION.split("/"));
  assert.equal(existsSync(path), true,
    `${FROZEN_PROJECTION} is the last declared-grain answer this repo can produce — its generator is deleted, so nothing here can make another`);
  const proj = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(proj.key, "declared household slug",
    "the fixture must still be keyed by the DECLARED slug, never by credential id");
  const map = proj.households ?? proj.map ?? proj.declared ?? null;
  assert.ok(map && Object.keys(map).length > 0,
    "the projection must carry handles — an empty one re-grains the fold silently");
});
