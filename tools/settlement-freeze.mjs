#!/usr/bin/env node
// settlement-freeze.mjs — pinned-read town custody, made structural.
// The living-town amendment (#1718; skill § Custody law, 2026-08-13): the
// settlement reads the town as an INPUT — sealed append-only ledgers — so its
// custody question was never "did the town hold still" but "did MY READS stay
// at the frozen sha." This tool makes that true by construction: it resolves
// the freeze sha X, materializes a detached worktree of the town AT X, and
// every ceremony read (money replay, stake artifact, identity registry) runs
// against that frozen path. git guarantees X immutable; the town's tip may
// move as much as the town likes.
//
// The stake artifact is then generated FROM THE FROZEN COPY'S OWN TOOLS:
//   node <frozen>/tools/world-stake.mjs --escrow --json --repo <frozen>
// so tool-version and data pin together — the hydrator's at-the-sha pattern,
// one directory over.
//
// Usage:
//   node tools/settlement-freeze.mjs --town <path> [--ref origin/main] [--no-fetch] [--json]
//   node tools/settlement-freeze.mjs --cleanup <frozen-path> --town <path>
//
// Emits (stdout, JSON with --json, key=value lines without):
//   town_sha     the resolved freeze commit X — the ceremony's town custody fact
//   frozen_path  the detached worktree at X — every town read goes here
//
// Deterministic, side-effect-bounded: touches nothing but the temp worktree it
// creates (and removes on --cleanup). Never pushes, never pulls the caller's
// checkout, never writes the town's working tree.

import { mkdtempSync, existsSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
};
const has = (name) => process.argv.includes(name);

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function die(msg) {
  console.error(`settlement-freeze: ${msg}`);
  process.exit(1);
}

const town = arg("--town");
if (!town) die("--town <path> is required (the cleanup form needs it too — the worktree belongs to the town's git)");
try {
  // --show-toplevel + equality, not bare discovery: git walks UP from -C, so a
  // scratch dir under a repo-ancestored path would silently pass a bare check.
  const top = realpathSync(git(town, ["rev-parse", "--show-toplevel"]));
  if (top.toLowerCase() !== realpathSync(town).toLowerCase()) throw new Error("not toplevel");
} catch {
  die(`--town ${town} is not a git repository (or not its toplevel)`);
}

// ---- cleanup form ----------------------------------------------------------
const cleanup = arg("--cleanup");
if (cleanup) {
  if (!existsSync(cleanup)) {
    // Already gone is a fine end state; prune bookkeeping either way.
    git(town, ["worktree", "prune"]);
    console.log(`already-absent: ${cleanup} (worktrees pruned)`);
    process.exit(0);
  }
  git(town, ["worktree", "remove", "--force", cleanup]);
  console.log(`removed: ${cleanup}`);
  process.exit(0);
}

// ---- freeze form -----------------------------------------------------------
const ref = arg("--ref") ?? "origin/main";
let fetched = false;
if (!has("--no-fetch")) {
  // The freeze pins the REMOTE's truth by default; --no-fetch serves tests and
  // air-gapped reruns, and the emitted record says which happened.
  git(town, ["fetch", "origin", "--quiet"]);
  fetched = true;
}

let townSha;
try {
  townSha = git(town, ["rev-parse", "--verify", `${ref}^{commit}`]);
} catch {
  die(`cannot resolve --ref ${ref} in ${town}`);
}

const frozenPath = mkdtempSync(join(tmpdir(), "postmark-town-frozen-"));
// mkdtemp creates the dir; worktree add wants to create it itself.
rmSync(frozenPath, { recursive: true, force: true });
git(town, ["worktree", "add", "--detach", "--quiet", frozenPath, townSha]);

const record = {
  town_sha: townSha,
  frozen_path: frozenPath,
  ref,
  fetched,
  created_at: new Date().toISOString(),
};

if (has("--json")) {
  console.log(JSON.stringify(record, null, 2));
} else {
  for (const [k, v] of Object.entries(record)) console.log(`${k}=${v}`);
}
