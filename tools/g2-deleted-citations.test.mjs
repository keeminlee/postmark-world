// g2-deleted-citations.test.mjs — the G2 deletion's closing rule, on the world half.
//
// The runbook's deletion receipt 2 and its closing rule, verbatim: "`grep -rn` for
// each deleted module name returns nothing in `src/`" and "after this deletion, grep
// the citations. Every comment citing repealed machinery is a written-down now-false
// premise."
//
// THE DISTINCTION, the same one the office half draws: a deleted tool may still be
// NAMED in prose that records its removal, and that record is worth keeping. What may
// not survive is a citation in something that RUNS. So the sweep is scoped to
// executable files — a `.md` may say a tool was deleted; a `.mjs` may not import it.
//
// It can fail, and it failed before the commit that added it: at the world train tip
// `2714f92d` the tool it names was on disk.
//
// WHAT IS DELIBERATELY NOT HERE, so the next reader does not go looking. This file
// once carried three more checks, for `households-project.mjs` (P-145) — a mention
// rule, an imperative rule, and a guard on the frozen projection the tool generates.
// **Wright HELD P-145 on 2026-09-08** (deleting a generator whose output nothing can
// regenerate), so that commit came off this branch and its checks went with it. They
// stand at `jetto/g2-p145-held` and want re-adding in the same commit that ever
// deletes the tool — the imperative rule especially, because four comments in this
// repo still tell a reader to RUN it, and today that instruction is TRUE.

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
];

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
const codeFiles = () => walk(REPO).filter((f) => f !== fileURLToPath(import.meta.url));

test("G2: the deleted world tools are gone from the tree", () => {
  for (const { row, path } of DELETED) {
    assert.equal(existsSync(join(REPO, ...path.split("/"))), false,
      `${path} is on G2 row ${row} and must not be on disk`);
  }
});

test("G2: no executable file cites a deleted world tool (the runbook's receipt 2)", () => {
  // The basename without extension, so `settlement-freeze.mjs` and its test are one
  // needle. `settlement-sweep.test.mjs` names a TEMP DIRECTORY "postmark-settlement-
  // freeze-…", which is not a citation of the tool — the needle carries the extension
  // to keep that out.
  const needles = [...new Set(DELETED.map((d) => d.path.split("/").pop()))];
  const offenders = [];
  for (const file of codeFiles()) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const n of needles) if (text.includes(n)) offenders.push(`${rel(file)} → ${n}`);
  }
  assert.deepEqual(offenders, [],
    "a deleted tool is still named in something that runs — a written-down now-false premise");
});
