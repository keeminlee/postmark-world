// settlement-freeze.test.mjs — the falsifier is the one that matters: the
// frozen read must NOT change when the source repo's tip moves. That is the
// entire claim of pinned-read custody (#1718), so the test moves the tip and
// looks.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "settlement-freeze.mjs");

const sh = (cwd, cmd, args) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const git = (repo, args) => sh(repo, "git", ["-C", repo, ...args]);
const runTool = (args) => sh(HERE, process.execPath, [TOOL, ...args]);

function scratchTown() {
  const repo = mkdtempSync(join(tmpdir(), "freeze-test-town-"));
  git(repo, ["init", "--quiet", "-b", "main"]);
  git(repo, ["config", "user.name", "test"]);
  git(repo, ["config", "user.email", "test@test"]);
  writeFileSync(join(repo, "ledger.md"), "line one\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "--quiet", "-m", "genesis"]);
  return repo;
}

test("the frozen read holds while the tip moves — pinned-read custody by construction", () => {
  const town = scratchTown();
  const out = JSON.parse(runTool(["--town", town, "--ref", "HEAD", "--no-fetch", "--json"]));
  assert.match(out.town_sha, /^[0-9a-f]{40}$/);
  assert.ok(existsSync(join(out.frozen_path, "ledger.md")));
  assert.equal(readFileSync(join(out.frozen_path, "ledger.md"), "utf8").replace(/\r/g, ""), "line one\n");

  // The town keeps living: a clock refresh, a PSA, somebody's letter.
  writeFileSync(join(town, "ledger.md"), "line one\nline two\n");
  git(town, ["commit", "--quiet", "-am", "the town moved mid-sweep"]);

  // The freeze does not care. This is the assertion S30 was refused over.
  assert.equal(readFileSync(join(out.frozen_path, "ledger.md"), "utf8").replace(/\r/g, ""), "line one\n");
  assert.equal(git(out.frozen_path, ["rev-parse", "HEAD"]), out.town_sha);

  // Cleanup removes the worktree and its bookkeeping.
  runTool(["--cleanup", out.frozen_path, "--town", town]);
  assert.ok(!existsSync(out.frozen_path));
  rmSync(town, { recursive: true, force: true });
});

test("the freeze pins the named ref's commit, read from rev-parse, never typed", () => {
  const town = scratchTown();
  const first = git(town, ["rev-parse", "HEAD"]);
  writeFileSync(join(town, "ledger.md"), "second\n");
  git(town, ["commit", "--quiet", "-am", "second"]);

  const out = JSON.parse(runTool(["--town", town, "--ref", first, "--no-fetch", "--json"]));
  assert.equal(out.town_sha, first);
  assert.equal(readFileSync(join(out.frozen_path, "ledger.md"), "utf8").replace(/\r/g, ""), "line one\n");

  runTool(["--cleanup", out.frozen_path, "--town", town]);
  rmSync(town, { recursive: true, force: true });
});

test("a non-repo town dies loudly; cleanup of an absent path is a fine end state", () => {
  const notRepo = mkdtempSync(join(tmpdir(), "freeze-test-notrepo-"));
  assert.throws(() => runTool(["--town", notRepo, "--no-fetch", "--json"]));
  const town = scratchTown();
  const gone = join(tmpdir(), "freeze-test-never-existed");
  const msg = runTool(["--cleanup", gone, "--town", town]);
  assert.match(msg, /already-absent/);
  rmSync(town, { recursive: true, force: true });
  rmSync(notRepo, { recursive: true, force: true });
});
