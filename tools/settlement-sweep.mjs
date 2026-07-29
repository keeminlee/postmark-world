#!/usr/bin/env node
// settlement-sweep.mjs — ruling 9, Worldkeeper chain steps 4 + 7.
//
// From a clean main checkout:
//   node tools/settlement-sweep.mjs --stakes <town-derived-stakes.json> [--json]
//
// The sweep publishes eligible draft marks into main, returns zero-escrow
// settlement-published commons to their household sketchbooks, then rebases
// every draft/* branch on the new main. It never pushes, tags, pins, or deploys.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { markClass as classifyMark } from "./mark-class.mjs"; // the ONE class rule
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fold, loadMarks, parseRecord } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const REGISTRY_REL = "WORLD/settlement-publications.json";
const MARKS_PREFIX = "WORLD/marks/";

function git(repo, args, options = {}) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: options.env ?? process.env,
  });
}

function hasObject(repo, object) {
  try {
    git(repo, ["cat-file", "-e", object]);
    return true;
  } catch {
    return false;
  }
}

function readAt(repo, ref, path) {
  return git(repo, ["show", `${ref}:${path.replace(/\\/g, "/")}`]);
}

function archiveRef(repo, ref) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-settlement-view-"));
  const archive = join(dir, "world.tar");
  git(repo, [
    "archive",
    "--format=tar",
    `--output=${archive}`,
    ref,
    "--",
    "WORLD/marks",
    "WORLD/skeleton.json",
    "WORLD/world-state.json",
  ]);
  // GNU tar reads a colon in an archive argument as host:path, so an absolute
  // Windows drive path looks remote. Extract from the temp directory instead.
  execFileSync("tar", ["-xf", "world.tar"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  return dir;
}

function stakesFrom(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.stakes ?? parsed.positions ?? [];
  if (!Array.isArray(rows)) throw new Error("--stakes must be a JSON array (or {stakes:[...]})");
  return rows.map((row) => ({
    holder: row.holder,
    mark: row.mark,
    n: Number(row.n ?? 0),
    weight: Number.isFinite(Number(row.weight)) ? Number(row.weight) : Number(row.n ?? 0),
    tick: Number(row.tick ?? 0),
  }));
}

function escrowIndex(stakes) {
  const out = new Map();
  for (const row of stakes) out.set(row.mark, (out.get(row.mark) ?? 0) + row.n);
  return out;
}

function foldRef(repo, ref, stakes) {
  const dir = archiveRef(repo, ref);
  try {
    const marks = loadMarks(join(dir, "WORLD", "marks"));
    const markIds = new Set(marks.map((mark) => mark.id));
    const terrain = JSON.parse(readFileSync(join(dir, "WORLD", "skeleton.json"), "utf8"));
    const prevPath = join(dir, "WORLD", "world-state.json");
    const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : null;
    const state = fold({
      marks,
      terrain,
      stakes: stakes.filter((stake) => markIds.has(stake.mark)),
      prev,
      tick: Math.max(1, Number(prev?.tick ?? 0) + 1),
    });
    if (state.errors?.length)
      throw new Error(`${ref} folds with ${state.errors.length} error(s): ${JSON.stringify(state.errors[0])}`);
    return state;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function draftBranches(repo) {
  const local = new Set(
    git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads/draft/"])
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  const remote = git(repo, [
    "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/draft/",
  ]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const remoteBranch of remote) {
    const branch = remoteBranch.replace(/^origin\//, "");
    if (local.has(branch)) continue;
    git(repo, ["branch", "--track", branch, remoteBranch]);
    local.add(branch);
  }
  return [...local].sort();
}

function markDelta(repo, main, branch) {
  const parts = git(repo, [
    "diff", "--name-status", "--no-renames", "-z", main, branch, "--", "WORLD/marks",
  ]).split("\0").filter(Boolean);
  const out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i];
    const path = parts[i + 1].replace(/\\/g, "/");
    if (!path.startsWith(MARKS_PREFIX) || !path.endsWith("/mark.md")) continue;
    out.push({ status, path });
  }
  return out;
}

function recordAt(repo, ref, path) {
  const record = parseRecord(readAt(repo, ref, path), path);
  const slug = basename(dirname(path));
  return { ...record, slug, id: `${record.by}/${slug}` };
}

function publicationRegistry(repo, mainRef) {
  if (!hasObject(repo, `${mainRef}:${REGISTRY_REL}`)) return { version: 1, published: {} };
  const parsed = JSON.parse(readAt(repo, mainRef, REGISTRY_REL));
  return {
    version: 1,
    published: parsed?.published && typeof parsed.published === "object" ? parsed.published : {},
  };
}

function writeRepoFile(repo, path, content) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function rollbackBeforeCommit(repo, touched) {
  for (const path of [...new Set(touched)]) {
    if (hasObject(repo, `HEAD:${path}`)) {
      try { git(repo, ["restore", "--staged", "--worktree", "--", path]); } catch { /* best effort */ }
    } else {
      rmSync(join(repo, path), { recursive: true, force: true });
    }
  }
}

function commit(repo, paths, message) {
  git(repo, ["add", "-A", "--", ...paths]);
  const staged = git(repo, ["diff", "--cached", "--name-only"]).trim();
  if (!staged) return git(repo, ["rev-parse", "HEAD"]).trim();
  git(repo, [
    "-c", `user.name=${process.env.BOT_NAME ?? "Postmark Worldkeeper"}`,
    "-c", `user.email=${process.env.BOT_EMAIL ?? "worldkeeper@postmark.invalid"}`,
    "commit", "--quiet", "-m", message,
  ]);
  return git(repo, ["rev-parse", "HEAD"]).trim();
}

function rebaseDrafts(repo, mainBranch, branches, returnedByHousehold, resettable) {
  const receipts = [];
  for (const branch of branches) {
    const household = branch.slice("draft/".length);
    const returned = returnedByHousehold.get(household) ?? [];
    const mainSha = git(repo, ["rev-parse", mainBranch]).trim();

    // A sketchbook with no tree delta at the start of the crossing carries no
    // resident commits to replay. Move its ref straight to settled main: the
    // cost of a crossing then scales with active drafters, not household count.
    // A branch receiving an unpublished commons mark still needs a checkout so
    // the return commit has somewhere to be written.
    if (resettable.has(branch) && returned.length === 0) {
      git(repo, ["branch", "-f", branch, mainSha]);
      receipts.push({
        branch,
        head: git(repo, ["rev-parse", branch]).trim(),
        rebased_onto: mainSha,
        mode: "reset",
        returned: [],
        return_commit: null,
      });
      continue;
    }

    const wtParent = mkdtempSync(join(tmpdir(), "postmark-draft-rebase-"));
    const wt = join(wtParent, "worktree");
    git(repo, ["worktree", "add", "--quiet", wt, branch]);
    try {
      try {
        git(wt, ["rebase", mainBranch], {
          env: { ...process.env, GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" },
        });
      } catch (error) {
        try { git(wt, ["rebase", "--abort"]); } catch { /* preserve original branch */ }
        throw new Error(`${branch} did not rebase cleanly: ${String(error.stderr ?? error.message ?? error).slice(0, 240)}`);
      }

      for (const item of returned) writeRepoFile(wt, item.path, item.content);
      const returnCommit = returned.length
        ? commit(wt, returned.map((item) => item.path), `settlement: return ${returned.length} zero-escrow commons to ${branch}`)
        : null;

      const base = git(repo, ["merge-base", mainBranch, branch]).trim();
      if (base !== mainSha) throw new Error(`${branch} is not rebased on ${mainBranch}`);
      receipts.push({
        branch,
        head: git(repo, ["rev-parse", branch]).trim(),
        rebased_onto: mainSha,
        mode: "rebase",
        returned: returned.map((item) => item.id),
        return_commit: returnCommit,
      });
    } finally {
      try { git(repo, ["worktree", "remove", "--force", wt]); } catch { /* temp path only */ }
      rmSync(wtParent, { recursive: true, force: true });
    }
  }
  return receipts;
}

export function settlementSweep({
  repo = ROOT,
  stakesPath,
  mainBranch = "main",
} = {}) {
  repo = resolve(repo);
  stakesPath = resolve(stakesPath ?? "");
  if (!existsSync(stakesPath)) throw new Error(`missing --stakes input: ${stakesPath}`);
  if (git(repo, ["branch", "--show-current"]).trim() !== mainBranch)
    throw new Error(`settlement sweep must run from ${mainBranch}`);
  const dirt = git(repo, ["status", "--porcelain"]).trim();
  if (dirt) throw new Error(`settlement sweep needs a clean checkout: ${dirt.split(/\r?\n/)[0]}`);

  const stakes = stakesFrom(stakesPath);
  const escrow = escrowIndex(stakes);
  const branches = draftBranches(repo);
  const mainTree = git(repo, ["rev-parse", `${mainBranch}^{tree}`]).trim();
  const resettable = new Set(branches.filter(
    (branch) => git(repo, ["rev-parse", `${branch}^{tree}`]).trim() === mainTree,
  ));
  const registry = publicationRegistry(repo, mainBranch);
  const published = [];
  const leftDrafted = [];
  const touched = [];

  for (const branch of branches) {
    const household = branch.slice("draft/".length);
    const state = foldRef(repo, branch, stakes);
    const folded = new Map(state.marks.map((mark) => [mark.id, mark]));
    for (const delta of markDelta(repo, mainBranch, branch)) {
      if (delta.status === "D") {
        leftDrafted.push({ household, id: null, path: delta.path, reason: "resident deletion is not a settlement admission" });
        continue;
      }
      const record = recordAt(repo, branch, delta.path);
      const view = folded.get(record.id);
      // ONE class rule (tools/mark-class.mjs): the parent-chain walk reaches
      // predicated laws with no coordinates, which the fold's geometric
      // `sovereign` flag structurally misses (Keemin's S1 live-debug catch).
      const cls = classifyMark(view ?? record, folded);
      const markClass = cls === "market" ? "commons" : cls;
      const n = escrow.get(record.id) ?? 0;
      const eligible = markClass !== "commons" || n > 0;
      if (!eligible) {
        leftDrafted.push({ household, id: record.id, path: delta.path, class: markClass, escrow: n, reason: "commons needs escrow > 0" });
        continue;
      }
      published.push({
        household,
        id: record.id,
        path: delta.path,
        class: markClass,
        escrow: n,
        content: readAt(repo, branch, delta.path),
      });
    }
  }

  // Only marks previously admitted by this sweep are candidates for unpublish.
  // Anything absent from the registry is founding estate and stays published.
  const unpublished = [];
  for (const [id, entry] of Object.entries(registry.published)) {
    if (entry.class !== "commons" || (escrow.get(id) ?? 0) > 0) continue;
    if (!hasObject(repo, `${mainBranch}:${entry.path}`)) continue;
    unpublished.push({
      household: entry.household,
      id,
      path: entry.path,
      class: "commons",
      escrow: escrow.get(id) ?? 0,
      content: readAt(repo, mainBranch, entry.path),
    });
  }

  try {
    for (const item of published) {
      writeRepoFile(repo, item.path, item.content);
      touched.push(item.path);
      registry.published[item.id] = {
        household: item.household,
        path: item.path,
        class: item.class,
      };
    }
    for (const item of unpublished) {
      rmSync(join(repo, item.path), { force: true });
      touched.push(item.path);
      delete registry.published[item.id];
    }
    writeRepoFile(repo, REGISTRY_REL, `${JSON.stringify(registry, null, 2)}\n`);
    touched.push(REGISTRY_REL);

    execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], {
      cwd: repo, stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs"), "--stakes", stakesPath], {
      cwd: repo, stdio: ["ignore", "pipe", "pipe"],
    });
    touched.push("WORLD/world-state.json", "WORLD/INDEX.md");
  } catch (error) {
    rollbackBeforeCommit(repo, touched);
    throw error;
  }

  const mainCommit = commit(repo, [
    "WORLD/marks",
    REGISTRY_REL,
    "WORLD/world-state.json",
    "WORLD/INDEX.md",
  ], `settlement: sweep ${published.length} published, ${unpublished.length} unpublished`);

  const returnedByHousehold = new Map();
  for (const item of unpublished) {
    if (!returnedByHousehold.has(item.household)) returnedByHousehold.set(item.household, []);
    returnedByHousehold.get(item.household).push(item);
    const branch = `draft/${item.household}`;
    if (!branches.includes(branch)) {
      git(repo, ["branch", branch, mainBranch]);
      branches.push(branch);
    }
  }
  branches.sort();
  const rebased = rebaseDrafts(repo, mainBranch, branches, returnedByHousehold, resettable);

  return {
    main: mainCommit,
    stakes_rows: stakes.length,
    published: published.map(({ content, ...item }) => item),
    left_drafted: leftDrafted,
    unpublished: unpublished.map(({ content, ...item }) => item),
    rebased,
  };
}

function parseCli(argv) {
  const opt = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  return {
    repo: opt("--repo", ROOT),
    stakesPath: opt("--stakes"),
    mainBranch: opt("--main", "main"),
    json: argv.includes("--json"),
  };
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseCli(process.argv.slice(2));
    if (!options.stakesPath) throw new Error("usage: settlement-sweep.mjs --stakes <stakes.json> [--repo <world>] [--json]");
    const report = settlementSweep(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`settlement sweep: ${report.published.length} published · ${report.left_drafted.length} left drafted · ${report.unpublished.length} unpublished · ${report.rebased.length} draft branch(es) rebased`);
      for (const row of report.published) console.log(`PUBLISH\t${row.household}\t${row.id}\t${row.class}\tescrow=${row.escrow}`);
      for (const row of report.left_drafted) console.log(`KEEP\t${row.household}\t${row.id ?? row.path}\t${row.reason}`);
      for (const row of report.unpublished) console.log(`UNPUBLISH\t${row.household}\t${row.id}\tescrow=${row.escrow}`);
    }
  } catch (error) {
    console.error(`settlement sweep refused: ${String(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}
