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
import { basename, dirname, join, relative, resolve } from "node:path";
import { markStanding as classifyMark } from "./mark-standing.mjs"; // the ONE standing rule
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  fold, loadMarks, parseRecord, standingRank, worldToFile, ringToFile, ringToWorld, fileToWorld,
  declaredCoords, COORDS_RELATIVE, WORLD_ROOT_SLUG,
} from "./marks-fold.mjs";

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
    // the whole WORLD/ dir, not named files: a pathspec absent from an older
    // ref (a sketchbook not yet rebased over households.json) fails the whole
    // archive, and the sweep must never trip on a branch's age.
    "WORLD",
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
    const hhPath = join(dir, "WORLD", "households.json");
    const households = existsSync(hhPath) ? (JSON.parse(readFileSync(hhPath, "utf8")).households ?? null) : null;
    const state = fold({
      marks,
      terrain,
      stakes: stakes.filter((stake) => markIds.has(stake.mark)),
      prev,
      tick: Math.max(1, Number(prev?.tick ?? 0) + 1),
      households,
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

// ── the re-home pass (§ the tier binding; mark-lint.mjs §6) ──────────────────
//
// The gate below judges the crossing. This runs first and REPAIRS the one class
// of finding that is nobody's mistake: an outranking mark whose directory edge
// has stopped naming its tightest container, usually because somebody else's
// claim grew around it. Such a mark is framed by the world, so its file numbers
// never mentioned the parent it is filed under — re-pointing the edge is paper.
//
// Identity is `by` + the LEAF slug, so a directory move changes no id, and no
// stake, vote or letter that names the mark notices anything at all.
function lintFindings(repo) {
  const r = spawnSync(process.execPath, [join(repo, "tools", "mark-lint.mjs"), "--json"], {
    cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) throw new Error(`the lint could not be run: ${r.error.message}`);
  // 0 clean · 1 refused · 3 repair needed. Anything else is the lint itself
  // failing, which is never something to interpret as a verdict on the tree.
  if (![0, 1, 3].includes(r.status))
    throw new Error(`mark-lint exited ${r.status}: ${String(r.stderr || r.stdout).trim().slice(0, 400)}`);
  try { return JSON.parse(r.stdout); }
  catch { throw new Error(`mark-lint did not answer in JSON (exit ${r.status}): ${String(r.stdout || r.stderr).trim().slice(0, 400)}`); }
}

const AT_RE = /^at: .*$/m;
const POINTS_RE = /^points: .*$/m;
const relative_ = (repo, p) => relative(repo, p).replace(/\\/g, "/");
const numText = (n) => String(n);
const ringText = (ring) => ring.map((p) => (Array.isArray(p) ? `${numText(p[0])},${numText(p[1])}` : `${numText(p.x)},${numText(p.y)}`)).join(" ");
const samePoint = (a, b) => a.x === b.x && a.y === b.y;

function applyRehomes(repo, rehomes) {
  const marksRoot = join(repo, "WORLD", "marks");
  const marks = loadMarks(marksRoot);
  const byId = new Map();
  for (const mark of marks) if (!byId.has(mark.id)) byId.set(mark.id, mark);
  const root = marks.find((mark) => mark.slug === WORLD_ROOT_SLUG);
  if (!root) throw new Error("re-home: this tree has no world root to file against");
  const relative = declaredCoords(marks) === COORDS_RELATIVE;

  // ORDER IS THE WHOLE DIFFICULTY, and it bit twice building this.
  //
  // Deepest first, because moving a container takes its children with it: a
  // shallow move made first would carry away a mark that was itself about to
  // leave, and file it somewhere nobody chose. (tools/rehome-plan.mjs learned
  // that one in the open.)
  //
  // And deepest-first alone is not enough, because a mark can be re-homed INTO
  // a directory that then moves itself — the final tree is right, but every
  // path recorded before that second move is stale, and staging a commit
  // against a stale path fails on a pathspec that matches nothing. So no path
  // is ever read off the loaded record twice: `dirNow` is the live answer to
  // "where is this mark right now", and every move rewrites it for the mark
  // AND for everything the move carried.
  const dirNow = new Map();
  for (const mark of marks) if (!dirNow.has(mark.id)) dirNow.set(mark.id, mark._dir);
  const relocate = (fromDir, toDir) => {
    for (const [id, d] of dirNow) {
      if (d === fromDir) dirNow.set(id, toDir);
      else if (d.startsWith(`${fromDir}\\`) || d.startsWith(`${fromDir}/`)) dirNow.set(id, join(toDir, d.slice(fromDir.length + 1)));
    }
  };

  const order = [...rehomes].sort((a, b) => (byId.get(b.mark)?._dir ?? "").length - (byId.get(a.mark)?._dir ?? "").length);
  const done = [];
  for (const item of order) {
    const rec = byId.get(item.mark);
    if (!rec) throw new Error(`re-home names ${item.mark}, which is not a mark in this tree`);
    const parent = item.to === null || item.to === undefined ? root : byId.get(item.to);
    if (!parent) throw new Error(`re-home sends ${item.mark} to ${item.to}, which is not a mark in this tree`);

    // The frame the mark will be read in once it is filed under its new parent:
    // the nearest positioned ancestor OF THAT PARENT (the parent included) whose
    // tier ranks at or above this mark's. The chain above the new parent is
    // untouched by the move — a container strictly encloses what it takes in, so
    // it can never be a descendant of the mark entering it.
    const rank = standingRank(rec, byId);
    let origin = { x: root.at?.x ?? 0, y: root.at?.y ?? 0 };
    const seen = new Set([rec.id]);
    for (let p = parent; p && !seen.has(p.id); p = p._parentMarkId ? byId.get(p._parentMarkId) : null) {
      seen.add(p.id);
      if (p.at && standingRank(p, byId) >= rank) { origin = { x: p.at.x, y: p.at.y }; break; }
    }

    const srcDir = dirNow.get(rec.id);
    const destDir = join(dirNow.get(parent.id), basename(srcDir));
    const from = relative_(repo, srcDir);
    const to = relative_(repo, destDir);
    if (existsSync(destDir)) throw new Error(`re-home: ${to} already exists — refusing to file ${item.mark} over something`);
    git(repo, ["mv", from, to]);
    relocate(srcDir, destDir);

    // The move is only free if the numbers still compose to the same place. A
    // mark leaving a market parcel for a constitution reach becomes BOUND where
    // it was world-framed, and then the very same digits mean somewhere else —
    // so they are re-written here, by the loader's own arithmetic backwards,
    // and checked for an exact double round-trip before anything is believed.
    let reframed = null;
    if (relative && rec._fileAt) {
      const at = worldToFile(rec.at, origin);
      if (!samePoint(fileToWorld(at, origin), rec.at))
        throw new Error(`re-home: ${item.mark} at ${rec.at.x},${rec.at.y} does not survive re-framing on ${origin.x},${origin.y} in doubles — refusing to move a mark by rounding`);
      if (!samePoint(at, rec._fileAt)) {
        const file = join(destDir, "mark.md");
        let text = readFileSync(file, "utf8");
        if (!AT_RE.test(text)) throw new Error(`re-home: ${item.mark} carries a position but has no "at:" line to re-write`);
        text = text.replace(AT_RE, `at: { x: ${numText(at.x)}, y: ${numText(at.y)} }`);
        if (Array.isArray(rec.points) && rec.points.length) {
          const ring = ringToFile(rec.points, origin);
          if (JSON.stringify(ringToWorld(ring, origin)) !== JSON.stringify(rec.points))
            throw new Error(`re-home: ${item.mark}'s ring does not survive re-framing on ${origin.x},${origin.y} in doubles`);
          if (!POINTS_RE.test(text)) throw new Error(`re-home: ${item.mark} carries a ring but has no "points:" line`);
          text = text.replace(POINTS_RE, `points: ${ringText(ring)}`);
        }
        writeFileSync(file, text);
        reframed = { origin, at, was: { x: rec._fileAt.x, y: rec._fileAt.y } };
      }
    }

    done.push({
      mark: item.mark,
      from_parent: item.from ?? null,
      to_parent: item.to ?? null,
      // The path the crossing FOUND it at, which is what the commit has to
      // stage the removal of. `to_path` is filled in below, after every move
      // has happened, because a later one may still carry this mark further.
      from_path: relative_(repo, rec._dir),
      to_path: null,
      world: rec.at ? { x: rec.at.x, y: rec.at.y } : null,
      reframed,
    });
  }
  for (const item of done) item.to_path = relative_(repo, dirNow.get(item.mark));
  return done;
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
        // -X theirs — in a rebase, "theirs" is the commit being REPLAYED: the
        // sketchbook's own writes. The reseat is pure transport of a drawer
        // whose only readable truth is its final tree (markDelta and recordAt
        // both read final state), so a replay conflict is a transport
        // artifact, not a finding — and it resolves toward the drawer's own
        // word. The case that forced this (2026-08-11, draft/FluffUPando): a
        // record ADDED in one commit and REVISED in a later one; the sweep
        // publishes the FINAL blob to main, then the replay hits the earlier
        // add against that published version — add/add, different content —
        // one commit before the revise that makes them identical. Any
        // resident who edits their own draft before admission creates the
        // same shape. Main is never written by this step, and a drawer whose
        // final word genuinely differs from main simply carries that delta to
        // the next crossing, where the gate judges it as always.
        git(wt, ["rebase", "-X", "theirs", mainBranch], {
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
  // The authorship wall (the PR lane, WRITES.md). Until 2026-08-05 the sweep
  // trusted branch names blindly — safe solely because the office pen was the
  // only writer of draft branches. With households holding their own pens, the
  // final publisher verifies what the door used to make inexpressible: a mark
  // whose registered author belongs to a DIFFERENT household than the branch
  // stays drafted. Both sides resolve through main's own registry
  // (households.json: handles + logins, one resolver); a handle or branch the
  // registry cannot bind is left alone — unverifiable is the status quo, never
  // a new refusal (registry lag must not strand the pen's own writes).
  let wallRegistry = { households: {}, logins: {} };
  try { const r = JSON.parse(readAt(repo, mainBranch, "WORLD/households.json")); wallRegistry = { households: r.households ?? {}, logins: r.logins ?? {} }; }
  catch { /* no registry on main → the wall stands down entirely */ }
  const branchHouseholdOf = (branchName) =>
    wallRegistry.logins[branchName.slice("draft/".length).toLowerCase()] ?? null;
  const mainTree = git(repo, ["rev-parse", `${mainBranch}^{tree}`]).trim();
  const resettable = new Set(branches.filter(
    (branch) => git(repo, ["rev-parse", `${branch}^{tree}`]).trim() === mainTree,
  ));
  const registry = publicationRegistry(repo, mainBranch);
  const published = [];
  const leftDrafted = [];
  const touched = [];
  let rehomed = [];

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
      // the authorship wall: a registered author on a branch the registry binds
      // to a DIFFERENT household never publishes from it
      const authorHousehold = wallRegistry.households[record.by] ?? null;
      const branchHousehold = branchHouseholdOf(branch);
      if (authorHousehold && branchHousehold && authorHousehold !== branchHousehold) {
        leftDrafted.push({ household, id: record.id, path: delta.path,
          reason: `authorship: "${record.by}" is ${authorHousehold}'s resident; this sketchbook is ${branchHousehold}'s` });
        continue;
      }
      const view = folded.get(record.id);
      // ONE standing rule (tools/mark-standing.mjs): the parent-chain walk reaches
      // predicated laws with no coordinates, which the fold's geometric
      // `sovereign` flag structurally misses (Keemin's S1 live-debug catch).
      // The registry's own word for the verdict stays `class` — it is written on
      // disk in every published row, and renaming a field is a migration, not a
      // rename (RECONCILIATION § 9 Q2 ruled the vocabulary, not the ledger).
      const cls = classifyMark(view ?? record, folded);
      const rowClass = cls === "market" ? "commons" : cls;
      const n = escrow.get(record.id) ?? 0;
      const eligible = rowClass !== "commons" || n > 0;
      if (!eligible) {
        leftDrafted.push({ household, id: record.id, path: delta.path, class: rowClass, escrow: n, reason: "commons needs escrow > 0" });
        continue;
      }
      published.push({
        household,
        id: record.id,
        path: delta.path,
        class: rowClass,
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

    // § the re-home pass — repair before the gate judges, so a resident is
    // never bounced for paper the machinery is allowed to move itself.
    const pending = lintFindings(repo);
    if (pending.rehomes.length) {
      rehomed = applyRehomes(repo, pending.rehomes);
      for (const item of rehomed) touched.push(item.from_path, item.to_path);
    }

    // Now the gate, and it wants a CLEAN tree: an error refuses as it always
    // has, and a re-home that survived the pass refuses too — the pass either
    // makes the paper true or it is not a repair, and shipping a crossing whose
    // own lint still asks for one would make the finding advisory by habit.
    const verdict = lintFindings(repo);
    if (verdict.errors)
      throw new Error(`the crossing does not lint clean: ${verdict.errors} error(s), first — ${verdict.findings.find((f) => f.sev === "ERROR")?.msg?.slice(0, 240)}`);
    if (verdict.rehomes.length)
      throw new Error(`${verdict.rehomes.length} re-home(s) survived the re-home pass: ${verdict.rehomes[0].mark} still wants ${verdict.rehomes[0].from ?? "(root)"} -> ${verdict.rehomes[0].to ?? "(root)"}`);

    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs"), "--stakes", stakesPath], {
      cwd: repo, stdio: ["ignore", "pipe", "inherit"], // stderr -> the journal: the fanup-shadow lines are FOR the reader (S39-era fix; "pipe" was swallowing them)
    });
    touched.push("WORLD/world-state.json", "WORLD/INDEX.md");
  } catch (error) {
    rollbackBeforeCommit(repo, touched);
    throw error;
  }

  // The repairs land FIRST and one at a time, ahead of the settlement they made
  // room for. `git mv` staged them all together, so each pair is unstaged and
  // re-staged on its own: a re-home nobody can read back in the history is a
  // silent move, which is the thing this whole law exists to prevent.
  // A path git can be asked about: one HEAD knows, or one that is on disk now.
  // A mark PUBLISHED and re-homed in the same crossing has an old path that is
  // in neither — it never existed anywhere but this working tree, for the few
  // seconds between the write and the move — and naming it in a pathspec fails
  // the whole `git add`.
  const stageable = (item) => [item.from_path, item.to_path]
    .filter((p) => hasObject(repo, `HEAD:${p}`) || existsSync(join(repo, p)));
  for (const item of rehomed) {
    const paths = stageable(item);
    if (paths.length) git(repo, ["reset", "--quiet", "--", ...paths]);
  }
  for (const item of rehomed) {
    const paths = stageable(item);
    item.commit = paths.length
      ? commit(repo, paths, `re-home: ${item.mark} from ${item.from_parent ?? "(root)"} to ${item.to_parent ?? "(root)"} — the paper moved, the ground did not`)
      : null;
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
    rehomed,
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
      console.log(`settlement sweep: ${report.published.length} published · ${report.left_drafted.length} left drafted · ${report.unpublished.length} unpublished · ${report.rehomed.length} re-homed · ${report.rebased.length} draft branch(es) rebased`);
      for (const row of report.published) console.log(`PUBLISH\t${row.household}\t${row.id}\t${row.class}\tescrow=${row.escrow}`);
      for (const row of report.left_drafted) console.log(`KEEP\t${row.household}\t${row.id ?? row.path}\t${row.reason}`);
      for (const row of report.unpublished) console.log(`UNPUBLISH\t${row.household}\t${row.id}\tescrow=${row.escrow}`);
      for (const row of report.rehomed) console.log(`REHOME\t${row.mark}\t${row.from_parent ?? "(root)"} -> ${row.to_parent ?? "(root)"}${row.reframed ? `\tre-framed on ${row.reframed.origin.x},${row.reframed.origin.y}` : ""}`);
    }
  } catch (error) {
    console.error(`settlement sweep refused: ${String(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}
