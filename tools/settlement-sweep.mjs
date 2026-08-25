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
import { markStanding as classifyMark, townOwned } from "./mark-standing.mjs"; // the ONE standing rule
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  fold, loadMarks, parseRecord, WORLD_ROOT_SLUG,
  // The frame arithmetic (worldToFile / ringToFile / declaredCoords / standingRank)
  // left with the re-home pass on 2026-08-25: re-framing a mark's numbers was
  // something only a MOVE ever needed, and the settlement no longer moves one.
  admissionBase, admitDelta,   // §4: the delta admission, in place of a fold per sketchbook
} from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const REGISTRY_REL = "WORLD/settlement-publications.json";
// the named door a refusal leaves by, so a receipt never has to guess which
// stderr line was the cause
export const REFUSAL_SENTINEL = "SETTLEMENT-SWEEP-REFUSAL";
const MARKS_PREFIX = "WORLD/marks/";

function git(repo, args, options = {}) {
  // THE SECOND METER. Part 2 removed 23 whole-world folds (176.7 s -> 12.1 s on
  // the live record) and the settlement's WALL TIME barely moved, which means
  // the fold was never where most of the time went. It goes here: this function
  // spawns a process, and the sweep calls it once per supersession row (4501 of
  // them on the live record) plus once per rebase. Counting it is how the next
  // lane finds that out from a receipt instead of from a stopwatch.
  foldMeter.gitCalls++;
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

// A refusal the receipt can find. The box builds its public detail from the
// sweep's stderr, and a crossing that journals as it works will have pushed the
// terminal cause off the front of that stream long before it returns nonzero
// (2026-08-23: fifteen skipped-commit warnings and one already-standing line
// buried `cannot rebase`). The cause therefore also leaves by a named door.
function refusal(message, fields = {}) {
  return Object.assign(new Error(message), fields);
}

// ── the eol boundary ───────────────────────────────────────────────────────
// `*.mjs text eol=lf` in .gitattributes is a law about blobs, and a blob
// committed before that law can violate it. Git then reports the file modified
// forever: checkout writes LF, the blob holds CRLF, and NO working-tree content
// can make the two agree — the file is dirty by construction until someone
// commits a normalization. A crossing that walks into this dies at a clean
// check over a diff of zero readable bytes.
//
// The sweep must tell that apart from a resident's real uncommitted edit. The
// discrimination is the whole fix: clearing dirt blindly would silently discard
// somebody's work, and refusing blindly wedges every crossing after an
// attribute change.

// CR dropped only where it precedes LF. A lone CR is data, not a line ending,
// and a file carrying one is not eol-only dirt.
function stripCr(buffer) {
  const out = Buffer.allocUnsafe(buffer.length);
  let n = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 13 && buffer[i + 1] === 10) continue;
    out[n++] = buffer[i];
  }
  return out.subarray(0, n);
}

function indexSha(repo, path) {
  const line = git(repo, ["ls-files", "-s", "--", path]).trim();
  return line ? line.split(/\s+/)[1] : null;
}

function indexBlob(repo, path) {
  const sha = indexSha(repo, path);
  return sha ? git(repo, ["cat-file", "blob", sha], { encoding: "buffer" }) : null;
}

// What git would store if it took the file as it stands — the clean filter's
// own answer, asked without going through the index's stat cache. This is the
// comparison git makes when it calls a file modified, and the only reliable way
// to ask it immediately after a checkout has rewritten that cache.
function cleanedSha(repo, path) {
  return git(repo, ["hash-object", "--path", path, "--", join(repo, path)]).trim();
}

function blobAt(repo, ref, path) {
  const line = git(repo, ["ls-tree", ref, "--", path]).trim();
  return line ? line.split(/\s+/)[2] : null;
}

function worktreeDirt(repo) {
  const fields = git(repo, ["status", "--porcelain", "-z", "--untracked-files=all"]).split("\0");
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    const [x, y] = field;
    // a rename/copy spends a second NUL field on its source path
    if (x === "R" || x === "C") i += 1;
    rows.push({ x, y, path: field.slice(3), entry: field });
  }
  return rows;
}

// Tracked, modified in the working tree only, and byte-identical to its own
// index blob once CRLF is read as LF on both sides. Anything else — staged,
// untracked, deleted, unmerged, or one changed character — is real.
function isEolOnlyDirt(repo, row) {
  if (row.x !== " " || row.y !== "M") return false;
  let blob;
  let disk;
  try {
    blob = indexBlob(repo, row.path);
    disk = readFileSync(join(repo, row.path));
  } catch {
    return false;
  }
  if (!blob) return false;
  return stripCr(blob).equals(stripCr(disk));
}

function classifyDirt(repo) {
  const eolOnly = [];
  const real = [];
  for (const row of worktreeDirt(repo)) {
    if (isEolOnlyDirt(repo, row)) eolOnly.push(row.path);
    else real.push(row);
  }
  return { eolOnly, real };
}

// Two different faults wear the same status line. If the blob obeys the
// declared law and only the file on disk drifted, `git checkout --` genuinely
// clears it. If the BLOB is the violator, no checkout can — the same LF comes
// back every time — so that path is named as irreconcilable rather than
// re-cleared in a loop.
function clearEolOnlyDirt(repo) {
  const before = classifyDirt(repo);
  const cleared = [];
  const irreconcilable = [];
  for (const path of before.eolOnly) {
    try { git(repo, ["checkout", "--", path]); } catch { /* the compare below is the verdict */ }
    // Ask git what it would store, not `git status`. A checkout leaves the index
    // holding the stat of the file it just wrote, so status takes its fast path
    // and can call a wrong blob clean — which would report a path cleared while
    // it is still dirty by construction, and hide the boundary from the receipt.
    // (Checkout is no cure by itself: with eol=lf git writes the CRLF blob back
    // out VERBATIM and converts on the way in, so the round trip never closes.)
    let settled = false;
    try { settled = cleanedSha(repo, path) === indexSha(repo, path); } catch { /* refused = not settled */ }
    (settled ? cleared : irreconcilable).push(path);
  }
  return { cleared, irreconcilable, real: before.real };
}

// Safe to carry across the boundary: the two sides of the replay hold the SAME
// blob for this path, so the rebase has nothing to say about it and marking it
// inert cannot lose a write. A path the sketchbook actually touched never
// qualifies, whatever its line endings.
function inertAcross(repo, path, mainBranch, branch) {
  const onMain = blobAt(repo, mainBranch, path);
  return Boolean(onMain) && onMain === blobAt(repo, branch, path);
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

// The offending row, dug out of the fold's own error text so the journal can
// name it. Best-effort by construction: the message is the fold's to phrase, so
// a shape this does not recognise yields null and the full detail still rides
// the report. Never throws — a quarantine must not itself be able to fail.
function firstStakeRowIn(message) {
  const m = String(message ?? "").match(/\{"stake":(\{.*?\})/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// THE METER. A perf slice cannot be reported without one, and the number this
// counts is §4's own claim: "~28 whole-world O(m²) folds per settlement". It is
// reset per sweep and rides the report, so before-and-after is a receipt rather
// than a stopwatch somebody remembers holding.
export const foldMeter = { whole: 0, wholeMs: 0, delta: 0, deltaMs: 0, marks: 0, gitCalls: 0 };
export function resetFoldMeter() { foldMeter.whole = 0; foldMeter.wholeMs = 0; foldMeter.delta = 0; foldMeter.deltaMs = 0; foldMeter.marks = 0; foldMeter.gitCalls = 0; }

export function foldRef(repo, ref, stakes) {
  const t0 = performance.now();
  try { return foldRefInner(repo, ref, stakes); }
  finally { foldMeter.whole++; foldMeter.wholeMs += performance.now() - t0; }
}

function foldRefInner(repo, ref, stakes) {
  const dir = archiveRef(repo, ref);
  try {
    const marks = loadMarks(join(dir, "WORLD", "marks"));
    const markIds = new Set(marks.map((mark) => mark.id));
    const terrain = JSON.parse(readFileSync(join(dir, "WORLD", "skeleton.json"), "utf8"));
    const prevPath = join(dir, "WORLD", "world-state.json");
    const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : null;
    const hhPath = join(dir, "WORLD", "households.json");
    const households = existsSync(hhPath) ? (JSON.parse(readFileSync(hhPath, "utf8")).households ?? null) : null;
    foldMeter.marks = Math.max(foldMeter.marks, marks.length);
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

export function draftBranches(repo) {
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

function markRows(out) {
  const parts = out.split("\0").filter(Boolean);
  const rows = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i];
    const path = parts[i + 1].replace(/\\/g, "/");
    if (!path.startsWith(MARKS_PREFIX) || !path.endsWith("/mark.md")) continue;
    rows.push({ status, path });
  }
  return rows;
}

// ── the three readings one sketchbook needs (§ supersession, #1697) ──────────
//
// `main..branch` is the CANDIDATE set: the paths where publishing would actually
// change main. It was the sweep's ONLY reading until this, and on its own it
// cannot say WHO moved a path — a mark MAIN amended after the branch was cut
// reads there exactly like a change the BRANCH is making. That is the whole
// mechanism of both recorded instances: fox-hearth's resurrected coordinates,
// and the-town/berth's silently widened grant on 2026-08-18.
//
// The other two readings answer it, and both are taken against the branch's own
// MERGE-BASE: what the sketchbook changed since it was cut, and what main
// changed since that same instant. A candidate the sketchbook never touched is
// main's amendment showing through a stale sketchbook and nothing else — so
// supersession falls out by construction rather than by policy, and a mark the
// resident genuinely edited is still their delta and still publishes.
export function markDelta(repo, main, branch) {
  const diff = (from, to) => markRows(git(repo, [
    "diff", "--name-status", "--no-renames", "-z", from, to, "--", "WORLD/marks",
  ]));
  // A sketchbook sharing NO history with main has no base to read against, and
  // `merge-base` exits non-zero rather than answering. That must not refuse the
  // whole crossing over one household's orphan branch, so it is treated as
  // contested throughout: every candidate takes the both-sides-moved path
  // below, whose advice — reseat and say it again — is exactly right for a
  // branch that was never cut from this world.
  let base = null;
  try { base = git(repo, ["merge-base", main, branch]).trim(); } catch { /* no common ancestor */ }
  const rows = diff(main, branch);
  if (!base) return rows.map((row) => ({ ...row, branchTouched: true, mainTouched: true }));
  const paths = (rows) => new Set(rows.map((row) => row.path));
  const byBranch = paths(diff(base, branch));
  const byMain = paths(diff(base, main));
  return rows.map((row) => ({
    ...row,
    branchTouched: byBranch.has(row.path),
    mainTouched: byMain.has(row.path),
  }));
}

/**
 * The id of the mark whose directory ENCLOSES this path — the loader's own
 * containment edge, recovered from the path rather than from a tree walk.
 *
 * `loadMarks` sets `_parentMarkId` while walking directories; the delta path
 * never builds that tree, so the edge is read here from the nearest ancestor
 * `mark.md`. The branch first (a family crossing together names its own
 * parent), then main. An id is `<by>/<slug>`, so the ancestor's own record
 * supplies the `by` and its directory supplies the slug.
 *
 * Null at the root, which is correct: a mark on open ground is enclosed by
 * nothing, and the standing walk stopping immediately is the honest answer.
 */
export function enclosingMarkId(repo, branch, mainBranch, path) {
  const parts = String(path).replace(/\\/g, "/").split("/");
  // parts: WORLD marks let-there-be-light [ …dirs… ] <slug> mark.md
  for (let depth = parts.length - 2; depth > 3; depth--) {
    const ancestor = `${parts.slice(0, depth).join("/")}/mark.md`;
    for (const ref of [branch, mainBranch]) {
      if (!hasObject(repo, `${ref}:${ancestor}`)) continue;
      const rec = recordAt(repo, ref, ancestor);
      if (rec?.id) return rec.id;
    }
  }
  return null;
}

export function recordAt(repo, ref, path) {
  const record = parseRecord(readAt(repo, ref, path), path);
  const slug = basename(dirname(path));
  return { ...record, slug, id: `${record.by}/${slug}` };
}

// A name for a row the crossing is only ever going to REPORT. It must not be
// able to fail the sweep: an unreadable record on a ref the resident is not
// publishing from is a journal line missing its id, not a refusal.
function idAt(repo, ref, path) {
  try { return recordAt(repo, ref, path).id; } catch { return null; }
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

// ── THE RE-HOME PASS IS GONE (the freeze, 2026-08-25) ───────────────────────
//
// What stood here moved directories. An outranking mark whose edge had stopped
// naming its tightest geometric container was re-filed by the save, on the
// author's behalf, with its numbers re-framed under a double round-trip check.
// It was careful machinery and it is deleted, because the founder repealed the
// law it enforced (LOGOS/state-and-time.md § The freeze):
//
//   "The re-home pass is DELETED from the settlement save. The settlement writes
//    a mark once; nothing moves it after. (This retires the publish+re-home
//    wedge — #1862's class — by removing the mover.)"
//
// Removing the mover is the whole repair. Every path-keyed reader in this world
// was correct until something moved a path; nothing moves a path now.
//
// The gate itself stays exactly where it was: the crossing still runs the lint
// and still refuses a tree that does not pass it.
function lintFindings(repo) {
  const r = spawnSync(process.execPath, [join(repo, "tools", "mark-lint.mjs"), "--json"], {
    cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) throw new Error(`the lint could not be run: ${r.error.message}`);
  // 0 clean · 1 refused. (There was a 3 — REPAIR NEEDED — and it went with the
  // re-home pass; the gate has no repair to ask for now.) Anything else is the
  // lint itself failing, which is never something to interpret as a verdict on
  // the tree.
  if (![0, 1].includes(r.status))
    throw new Error(`mark-lint exited ${r.status}: ${String(r.stderr || r.stdout).trim().slice(0, 400)}`);
  try { return JSON.parse(r.stdout); }
  catch { throw new Error(`mark-lint did not answer in JSON (exit ${r.status}): ${String(r.stdout || r.stderr).trim().slice(0, 400)}`); }
}

const relative_ = (repo, p) => relative(repo, p).replace(/\\/g, "/");
const samePoint = (a, b) => a.x === b.x && a.y === b.y;

// ── the-already-standing (the-town/the-already-standing, 2026-08-23) ─────────
//
//   "A parked copy of a mark already standing in canon, identical but for its
//    frame and its hour, is the drain's to drop — nothing moves, nothing
//    refuses."
//
// The door parks every sited draft at the root (the-town/the-parked). A
// sketchbook cut before its own mark was filed re-offers that parked copy every
// crossing: the publish writes it back at the root, and without this drain the
// crossing refuses over paper naming a mark that has not moved. (The S45 class;
// the worldkeeper's 2026-08-23 daily is the derivation.)
//
// ITS TRIGGER CHANGED WITH THE FREEZE, AND ONLY ITS TRIGGER. Until 2026-08-25 the
// drain read the re-home findings — a parked copy always produced one, so the
// list of parked copies came free with the list of re-homes. "The re-home pass is
// DELETED from the settlement save", so the drain now asks the law's own question
// directly: which ids stand twice, with one of the two parked at the root. That
// is the better question anyway. It names a parked copy because it IS one, not
// because some other machinery happened to notice it on the way past.
//
// The frame is `at`/`points`/`coords`; the hour is `date`. Everything else must
// match to the character — authorship, kind, tier, extent, image, body, and any
// field a later schema adds, which is why the comparison walks the keys rather
// than listing them. The position is compared in the WORLD frame, which the
// loader composed for both copies out of the fold's own conversion; nothing is
// re-derived here. A difference in ANY of it is a real edit against a real
// seat, and it refuses exactly as it always has. This drops copies, never
// conflicts.
const FRAME_AND_HOUR = new Set(["at", "points", "coords", "date"]);
const LOADER_ADDED = new Set(["slug", "id", "body", "household"]);

function identicalButForFrameAndHour(parked, standing) {
  if (parked._error || standing._error) return false;
  if (parked.id !== standing.id || parked.by !== standing.by) return false;
  if (parked.body !== standing.body) return false;
  if (!parked.at || !standing.at || !samePoint(parked.at, standing.at)) return false;
  if (JSON.stringify(parked.points ?? null) !== JSON.stringify(standing.points ?? null)) return false;
  const named = (rec) => Object.keys(rec)
    .filter((k) => !k.startsWith("_") && !FRAME_AND_HOUR.has(k) && !LOADER_ADDED.has(k))
    .sort();
  const a = named(parked);
  const b = named(standing);
  if (a.join(" ") !== b.join(" ")) return false;
  return a.every((k) => JSON.stringify(parked[k]) === JSON.stringify(standing[k]));
}

function dropAlreadyStanding(repo) {
  const marks = loadMarks(join(repo, "WORLD", "marks"));
  const root = marks.find((mark) => mark.slug === WORLD_ROOT_SLUG);
  const rootId = root?.id ?? null;
  // PARKED means filed at the world root, and nothing else. The root is the one
  // seat the draft door ever chooses on an author's behalf (the-town/the-parked),
  // so it is the one seat a copy can occupy without its author having said
  // anything about where it belongs.
  const parkedAtRoot = (mark) => mark !== root && (mark._parentMarkId == null || mark._parentMarkId === rootId);

  const copiesById = new Map();
  for (const mark of marks) {
    if (mark._error || mark.id == null) continue;
    if (!copiesById.has(mark.id)) copiesById.set(mark.id, []);
    copiesById.get(mark.id).push(mark);
  }

  const dropped = [];
  for (const [id, copies] of copiesById) {
    if (copies.length < 2) continue;
    const parked = copies.filter(parkedAtRoot);
    const standing = copies.filter((mark) => !parkedAtRoot(mark));
    // Exactly one of each, or this is not the shape the law describes. Two
    // parked copies or two standing seats is a genuine collision about a real
    // id, and the gate below refuses it by name rather than the drain guessing
    // which one the town meant.
    if (parked.length !== 1 || standing.length !== 1) continue;
    const [copy] = parked;
    const [seat] = standing;
    if (!identicalButForFrameAndHour(copy, seat)) continue; // a real edit against a real seat, refused below
    const file = relative_(repo, copy._dir);
    // Nothing may be riding on the parked copy. Dropping a seat with a mark
    // inside it would MOVE something, and this law moves nothing.
    if (marks.some((mark) => mark !== copy && relative_(repo, mark._dir).startsWith(`${file}/`))) continue;
    if (hasObject(repo, `HEAD:${file}/mark.md`)) git(repo, ["rm", "-r", "-q", "--", file]);
    else rmSync(join(repo, file), { recursive: true, force: true });
    const to = relative_(repo, seat._dir);
    // Paths are the mark.md the rest of the crossing speaks in — the registry
    // row this restores names a file, and every other journal row does too.
    dropped.push({ mark: id, file, from_path: `${file}/mark.md`, standing_path: `${to}/mark.md`, to_parent: seat._parentMarkId ?? null });
    console.error(`[the-already-standing] dropped ${id} parked at ${file}/mark.md — already standing at ${to}/mark.md, identical but for its frame and its hour`);
  }
  return dropped;
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
        eol_crossed: [],
      });
      continue;
    }

    const wtParent = mkdtempSync(join(tmpdir(), "postmark-draft-rebase-"));
    const wt = join(wtParent, "worktree");
    git(repo, ["worktree", "add", "--quiet", wt, branch]);
    const crossed = [];
    const tipBefore = git(repo, ["rev-parse", branch]).trim();
    let normalizedTip = null;
    try {
      const replay = () => {
        // -X theirs — in a rebase, "theirs" is the commit being REPLAYED: the
        // sketchbook's own writes. The reseat is pure transport of a sketchbook
        // whose only readable truth is its final tree (markDelta and recordAt
        // both read final state), so a replay conflict is a transport
        // artifact, not a finding — and it resolves toward the sketchbook's own
        // word. The case that forced this (2026-08-11, draft/FluffUPando): a
        // record ADDED in one commit and REVISED in a later one; the sweep
        // publishes the FINAL blob to main, then the replay hits the earlier
        // add against that published version — add/add, different content —
        // one commit before the revise that makes them identical. Any
        // resident who edits their own draft before admission creates the
        // same shape. Main is never written by this step, and a sketchbook whose
        // final word genuinely differs from main simply carries that delta to
        // the next crossing, where the gate judges it as always.
        git(wt, ["rebase", "-X", "theirs", mainBranch], {
          env: { ...process.env, GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" },
        });
      };
      const refuseReplay = (error, fields = {}) => refusal(
        `${branch} did not rebase cleanly: ${String(error.stderr ?? error.message ?? error).slice(0, 240)}`,
        { phase: "rebase", branch, ...fields },
      );

      // ── the boundary, shape one: the sketchbook's OWN tree declares the law
      // and breaks it, so the fresh checkout is dirty BEFORE the replay begins.
      // Nothing can be marked inert here — main holds a different (trued) blob
      // for that path, and git will not move HEAD over a file it thinks has
      // local changes. Bring the paths into agreement with main and commit it
      // on the throwaway. The proof that this loses nothing is the sha: the
      // renormalized blob must be MAIN'S OWN, so the only thing the sketchbook
      // gives up is line endings it never chose. The rebase then drops the
      // commit as empty against a main that already obeys, and the reseated
      // branch carries no trace of it.
      {
        const dirt = clearEolOnlyDirt(wt);
        if (dirt.real.length)
          throw refusal(`${branch} checked out with uncommitted changes: ${dirt.real[0].entry}`,
            { phase: "rebase", branch, real_dirt: dirt.real.map((row) => row.entry) });
        if (dirt.irreconcilable.length) {
          const settled = [];
          for (const path of dirt.irreconcilable) {
            git(wt, ["add", "--renormalize", "--", path]);
            if (indexSha(wt, path) === blobAt(wt, mainBranch, path)) settled.push(path);
            else git(wt, ["reset", "--quiet", "HEAD", "--", path]);
          }
          if (settled.length !== dirt.irreconcilable.length)
            throw refusal(
              `${branch} carries line endings ${mainBranch} does not share: ${dirt.irreconcilable.find((p) => !settled.includes(p))}`,
              { phase: "rebase", branch, eol_dirt: dirt.irreconcilable },
            );
          normalizedTip = commit(wt, settled, `settlement: normalize ${settled.length} path(s) to ${mainBranch}'s line-ending law`);
          crossed.push(...settled);
        }
      }

      try {
        replay();
      } catch (error) {
        // ── the boundary, shape two: MAIN's own blob is the violator, and the
        // sketchbook meets it only when the replay moves HEAD onto main while
        // building its todo list. Read the dirt BEFORE aborting — the abort
        // restores the branch tip, the old .gitattributes comes back with it,
        // and the boundary un-crosses itself, taking the evidence with it.
        const dirt = clearEolOnlyDirt(wt);
        const inert = dirt.irreconcilable.filter((path) => inertAcross(repo, path, mainBranch, branch));
        try { git(wt, ["rebase", "--abort"]); } catch { /* preserve original branch */ }

        // Every stopper must be eol-only AND inert across the replay. One real
        // modification among the phantoms, or one eol-dirty path the sketchbook
        // actually wrote, and the crossing refuses by name exactly as before.
        const normalizable = !dirt.real.length
          && inert.length === dirt.irreconcilable.length
          && (inert.length > 0 || dirt.cleared.length > 0);
        if (!normalizable) {
          throw refuseReplay(error, {
            real_dirt: dirt.real.map((row) => row.entry),
            eol_dirt: dirt.irreconcilable,
          });
        }

        // Here — and ONLY here — the path holds the same blob on both sides of
        // the replay, so the checkout onto main never has to rewrite the file
        // and git can be told to stop looking at it for the length of the
        // rebase. (Shape one cannot use this: there the blobs differ, and git
        // refuses to move HEAD over a file it will not touch.) The blob is
        // still wrong; a normalization commit on main is what actually retires
        // it, and the receipt says so out loud.
        crossed.push(...inert);
        if (inert.length) git(wt, ["update-index", "--assume-unchanged", "--", ...inert]);
        try {
          replay();
        } catch (retry) {
          try { git(wt, ["rebase", "--abort"]); } catch { /* preserve original branch */ }
          throw refuseReplay(retry);
        } finally {
          if (inert.length) git(wt, ["update-index", "--no-assume-unchanged", "--", ...inert]);
        }
      }

      for (const item of returned) writeRepoFile(wt, item.path, item.content);
      const returnCommit = returned.length
        ? commit(wt, returned.map((item) => item.path), `settlement: return ${returned.length} zero-escrow commons to ${branch}`)
        : null;

      const base = git(repo, ["merge-base", mainBranch, branch]).trim();
      if (base !== mainSha) throw refusal(`${branch} is not rebased on ${mainBranch}`, { phase: "rebase", branch });
      receipts.push({
        branch,
        head: git(repo, ["rev-parse", branch]).trim(),
        rebased_onto: mainSha,
        mode: "rebase",
        returned: returned.map((item) => item.id),
        return_commit: returnCommit,
        // named, never silent: a path whose committed blob still violates main's
        // own eol law and had to be carried inert across this replay
        eol_crossed: crossed,
      });
    } catch (error) {
      // The shape-one normalization is a real commit, and it advanced the
      // sketchbook's ref before the replay was known to work. A crossing that
      // ends up refusing must leave that ref exactly where it found it — the
      // same rule the gate follows. Only rewind what nothing else has moved.
      if (normalizedTip && git(repo, ["rev-parse", branch]).trim() === normalizedTip) {
        try { git(wt, ["reset", "--hard", "--quiet", tipBefore]); } catch { /* named in the refusal either way */ }
      }
      throw error;
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
  resetFoldMeter();
  repo = resolve(repo);
  stakesPath = resolve(stakesPath ?? "");
  if (!existsSync(stakesPath)) throw new Error(`missing --stakes input: ${stakesPath}`);
  if (git(repo, ["branch", "--show-current"]).trim() !== mainBranch)
    throw refusal(`settlement sweep must run from ${mainBranch}`, { phase: "clean-check" });
  // A fresh clone of a main that declares eol=lf over a CRLF blob is dirty the
  // moment it is created, and no operator action makes it clean. That is a
  // repo defect to name, not a reason to refuse a crossing — but a real
  // uncommitted edit still stops everything, by name.
  // Judge before touching: a crossing about to refuse leaves the tree exactly
  // as it found it, so the operator reads their own uncommitted work back.
  const seen = classifyDirt(repo);
  if (seen.real.length)
    throw refusal(
      `settlement sweep needs a clean checkout: ${seen.real[0].entry}${seen.real.length > 1 ? ` (+${seen.real.length - 1} more)` : ""}`,
      { phase: "clean-check", real_dirt: seen.real.map((row) => row.entry) },
    );
  const gate = clearEolOnlyDirt(repo);
  for (const path of gate.irreconcilable)
    console.error(`[the-eol-boundary] ${path}: the committed blob violates ${mainBranch}'s own eol law — dirty by construction until a normalization commit lands`);

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
  const withdrawn = []; // the revision family's terminal half (ruled 2026-08-19)
  // ONE POISONED SKETCHBOOK MUST NOT REFUSE THE WHOLE TOWN (founder, 2026-08-20).
  // Until now foldRef threw straight out of the loop below, so a single ref that
  // folded with errors refused the ENTIRE settlement — every other household's
  // work held hostage by one malformed row. Reopening makes that likely rather
  // than theoretical: many first settlements is exactly when a malformed row
  // arrives. A one-sketchbook quarantine beats a whole-town refusal — but only if it
  // SHOUTS, which is what this list is for.
  const quarantined = [];
  const touched = [];
  // `rehomed` was a channel here until 2026-08-25. It is gone rather than left
  // permanently empty: a report that always says zero is a state with no receipt,
  // and a reader still asking for it should fail loudly rather than learn nothing.
  // "The re-home pass is DELETED from the settlement save."
  const dropped = []; // § the-already-standing — the crossing's journal for a copy that was never a conflict

  // ── §4 · ONE WHOLE-WORLD FOLD, then k cheap checks per sketchbook ─────────
  //
  // "Target: fold main ONCE; per sketchbook, validate only its delta against
  // that folded state — O(k·m) per branch; keep ONE full fold of the merged
  // result as the final gate."
  //
  // Measured on a throwaway clone of the live record before this landed: 24
  // whole-world folds of 940 marks, 176.7 s of a 363.7 s settlement, to
  // adjudicate 37 delta rows. Per sketchbook the fold was only ~60% of the
  // cost — archive and loadMarks were the other 40% — and the delta path
  // retires all three, because validating k records needs no branch tree at
  // all, only k reads at the ref.
  const mainState = foldRef(repo, mainBranch, stakes);
  const admitBase = admissionBase(mainState, { households: wallRegistry.households, stakes });
  const mainFolded = new Map(mainState.marks.map((mark) => [mark.id, mark]));

  for (const branch of branches) {
    const household = branch.slice("draft/".length);
    const deltas = markDelta(repo, mainBranch, branch);

    // THE CANDIDATES — read at the ref, k of them, no tree materialized. Only
    // the rows this household is actually PUBLISHING: a deletion withdraws and
    // carries no record, and a row the sketchbook never touched is main's own
    // amendment showing through a stale copy (the supersession reading below).
    const candidates = [];
    for (const delta of deltas) {
      if (delta.status === "D" || !delta.branchTouched) continue;
      const rec = recordAt(repo, branch, delta.path);
      if (rec) candidates.push({
        ...rec,
        // THE DIRECTORY EDGE, which `recordAt` does not carry because it reads
        // one file and `loadMarks` gets this from walking a tree. Without it the
        // standing walk has nowhere to climb, and a mark standing on its
        // author's own parcel folds "market" instead of "home" — part 1's
        // finding 4, arriving from the other side. Resolved from the path
        // itself, at depth-many reads per candidate rather than a tree.
        _parentMarkId: enclosingMarkId(repo, branch, mainBranch, delta.path),
        // REPLACING is about the MARK, not the file: a mark canon already
        // holds is being revised at whatever path it now sits at — the
        // already-standing shape moves a parked copy from the root to its
        // re-homed seat and is emphatically not a second claim. Asking "is this
        // PATH on main" instead quarantined exactly that case (the devadavisson
        // falsifier caught it).
        //
        // The case this no longer catches — one branch tree holding one id at
        // TWO paths — is a composition fact, and §4 keeps the merged fold as the
        // final gate precisely so composition surfaces there.
        _replacing: mainFolded.has(rec.id),
      });
    }

    // THE QUARANTINE, and it is deliberately the FIRST thing in the sketchbook,
    // exactly as when it was a whole-tree fold: nothing is read, published,
    // withdrawn or touched until the sketchbook is known admissible, so the
    // conservative direction is preserved by skipping BEFORE any of that rather
    // than by unwinding after.
    //
    // WHAT CHANGED, and it is law rather than an optimization's side effect
    // (founder, 2026-08-24): "the crossing judges what a household publishes,
    // not what its stale tree happens to contain." The whole-tree fold
    // quarantined a household over any malformed row anywhere in its copy of
    // the world — including rows it was not publishing, and including rows that
    // are simply many crossings stale. Only the candidates are judged now. A
    // household whose PUBLISHED delta is bad still refuses, by name and in the
    // fold's own error grammar.
    const admitted = admitDelta(candidates, admitBase);
    if (admitted.errors.length) {
      // LOUD. The ref, the reason, and the row that poisoned it, so the
      // crossing's journal says whose sketchbook was set aside and what to fix.
      const first = admitted.errors[0];
      const detail = `${branch} publishes ${admitted.errors.length} inadmissible row(s): ${JSON.stringify(first)}`;
      quarantined.push({
        household, ref: branch,
        reason: "this sketchbook's own published rows could not be admitted, so it was set aside and the rest of the town settled without it",
        detail: detail.slice(0, 400),
        row: firstStakeRowIn(detail),
      });
      continue;
    }

    // The world this sketchbook is judged in: canon's fold, with its own
    // candidates laid over. Cross-household composition is NOT decided here and
    // never was — it surfaces at the merged fold below, exactly as §4 says.
    const folded = new Map(mainFolded);
    for (const [id, view] of admitted.views) folded.set(id, view);

    for (const delta of deltas) {
      // SUPERSESSION. The sketchbook has not touched this path since it was cut,
      // so the difference between them is main's own amendment read through a
      // stale sketchbook. Publishing it would revert main to what the sketchbook
      // remembers, which is the defect this whole reading exists to make
      // impossible. The row is reported rather than skipped: the crossing's
      // journal should say why main's word won.
      if (!delta.branchTouched) {
        leftDrafted.push({
          household,
          id: idAt(repo, delta.status === "D" ? mainBranch : branch, delta.path),
          path: delta.path,
          reason: "supersession: main amended this mark after this sketchbook's base, and the sketchbook carries no change to it",
        });
        continue;
      }
      if (delta.status === "D") {
        // WITHDRAWAL (founder-ruled 2026-08-19 — edit-law's revision family):
        // a branch-touched deletion of a household's own published mark is the
        // terminal supersession, and the settlement executes it: the record
        // leaves canon, its whole life stays in the log. The guards mirror
        // publish — town wall, authorship wall — plus the two a withdrawal
        // owns: escrow anchors (staked stamps must come back first; the door
        // checks the ledger too, this is the crossing's own belt) and no
        // stranded children (main must hold nothing inside the mark's ground —
        // orphan re-homing is arithmetic this lane does not do yet).
        const record = recordAt(repo, mainBranch, delta.path);
        const wid = idAt(repo, mainBranch, delta.path);
        if (!record || !wid) {
          leftDrafted.push({ household, id: null, path: delta.path, reason: "deletion of a path main does not hold — nothing to withdraw" });
          continue;
        }
        if (townOwned(record)) {
          leftDrafted.push({ household, id: wid, path: delta.path, reason: "the town wall: town-signed records never withdraw from a sketchbook" });
          continue;
        }
        const authorHh = wallRegistry.households[record.by] ?? null;
        const branchHh = branchHouseholdOf(branch);
        if (authorHh && branchHh && authorHh !== branchHh) {
          leftDrafted.push({ household, id: wid, path: delta.path, reason: `authorship: "${record.by}" is not this sketchbook's to withdraw` });
          continue;
        }
        if ((escrow.get(wid) ?? 0) > 0) {
          leftDrafted.push({ household, id: wid, path: delta.path, reason: `escrow anchors the mark (${escrow.get(wid)}✦ staked) — stamps come back before a withdrawal` });
          continue;
        }
        const dirPrefix = delta.path.replace(/\/mark\.md$/, "/");
        const inside = git(repo, ["ls-tree", "-r", mainBranch, "--name-only", "--", dirPrefix])
          .split(/\r?\n/).filter((l) => l.trim().endsWith("mark.md") && l.trim() !== delta.path);
        if (inside.length) {
          leftDrafted.push({ household, id: wid, path: delta.path, reason: `${inside.length} mark(s) still stand inside it on main — withdraw or move them first` });
          continue;
        }
        withdrawn.push({ household, id: wid, path: delta.path });
        continue;
      }
      const record = recordAt(repo, branch, delta.path);
      // THE TOWN WALL. It stands ahead of the authorship wall because the
      // authorship wall's courtesy — an author the registry cannot bind is left
      // to the status quo — is exactly what let a sketchbook's copy of the
      // berth's grant reach main: `the-town` is bound to no household by
      // construction, so it passed as an unverifiable stranger. Nothing signed
      // by the town publishes from a sketchbook, whatever the registry knows.
      if (townOwned(record)) {
        leftDrafted.push({ household, id: record.id, path: delta.path,
          reason: `the town wall: "${record.by}" writes the town's own record, which a founder's pen rules onto main and no sketchbook admits` });
        continue;
      }
      // the authorship wall: a registered author on a branch the registry binds
      // to a DIFFERENT household never publishes from it
      const authorHousehold = wallRegistry.households[record.by] ?? null;
      const branchHousehold = branchHouseholdOf(branch);
      if (authorHousehold && branchHousehold && authorHousehold !== branchHousehold) {
        leftDrafted.push({ household, id: record.id, path: delta.path,
          reason: `authorship: "${record.by}" is ${authorHousehold}'s resident; this sketchbook is ${branchHousehold}'s` });
        continue;
      }
      // BOTH SIDES MOVED IT. Neither copy is stale and the crossing has no way
      // to know which is meant, so it picks no winner: the reseat below brings
      // the sketchbook current, and a resident who still means their edit makes
      // it again on top of main's and publishes next crossing.
      if (delta.mainTouched) {
        leftDrafted.push({ household, id: record.id, path: delta.path,
          reason: "supersession: main amended this mark since your sketchbook's base — rebase and re-affirm" });
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

  // § the ground-closure hold (2026-08-21, the goodie-bag crossing): a mark
  // publishes only onto ground that is already canon or crossing WITH it. The
  // eligible set was not ancestor-closed, so one staked child under a drafted
  // parent crossed alone — its filing orphaned, its frame resolved past the
  // missing mark into the lake, and every settlement since 08-20 17:45Z
  // refused at the gate over it. The family crosses together or the child
  // waits, loudly — the quarantine's own grammar, one level down.
  for (let held = true; held;) {
    held = false;
    const crossing = new Set(published.map((item) => item.path.replace(/\\/g, "/")));
    for (let i = published.length - 1; i >= 0; i--) {
      const item = published[i];
      const parts = item.path.replace(/\\/g, "/").split("/");
      // `depth > 3` — the same floor `enclosingMarkId` walks to, and the two must
      // agree about what an ancestor IS or the hold guards an edge nobody reads.
      // parts: WORLD marks <first> [ …dirs… ] <slug> mark.md, and that <first>
      // segment is never a mark's parent: under the fossil tree it is the world
      // root (always canon, so the old floor only ever reached it to skip it),
      // and under the id-keyed layout the freeze introduced it is a HOUSEHOLD
      // namespace with no mark.md in it at all. At the old floor of 2 every mark
      // filed at its id — "New marks are filed by identity — WORLD/marks/
      // <household>/<slug>/" — was held forever, waiting on ground that is a
      // directory rather than a mark and can therefore never cross.
      for (let depth = parts.length - 2; depth > 3; depth--) {
        const ancestorDir = parts.slice(0, depth).join("/");
        const ancestor = `${ancestorDir}/mark.md`;
        if (!ancestor.startsWith(MARKS_PREFIX)) break;
        if (crossing.has(ancestor)) continue;                       // crossing together
        if (hasObject(repo, `${mainBranch}:${ancestor}`)) continue; // already canon
        published.splice(i, 1);
        leftDrafted.push({ household: item.household, id: item.id, path: item.path, class: item.class, escrow: item.escrow,
          reason: `held: its ground ${ancestorDir.slice(MARKS_PREFIX.length)} is still drafted — the family crosses together (stake the ground, or the child waits)` });
        held = true;
        break;
      }
    }
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
    for (const item of withdrawn) {
      // the child guard held, so mark.md is the directory's only record —
      // remove the whole seat; the id may predate the registry (founding
      // estate), so the delete is unconditional and harmless when absent.
      rmSync(join(repo, dirname(item.path)), { recursive: true, force: true });
      touched.push(item.path);
      delete registry.published[item.id];
    }
    writeRepoFile(repo, REGISTRY_REL, `${JSON.stringify(registry, null, 2)}\n`);
    touched.push(REGISTRY_REL);

    // § the-already-standing — the one pass left between the publish and the
    // gate, and it DROPS rather than moves. Nothing moved, so the crossing
    // publishes nothing for a dropped copy and the registry goes on naming the
    // seat that stands. The publish above had already overwritten the row with
    // the parked copy's root path; leaving that would point the ledger at a
    // directory the drain just took away.
    for (const item of dropAlreadyStanding(repo)) {
      touched.push(item.from_path);
      const i = published.findIndex((row) => row.id === item.mark);
      const row = i >= 0 ? published[i] : null;
      if (i >= 0) published.splice(i, 1);
      dropped.push({
        household: row?.household ?? null,
        id: item.mark,
        path: item.from_path,
        standing_path: item.standing_path,
        reason: "the-already-standing: identical to the mark already standing in canon but for its frame and its hour — the drain dropped the parked copy; nothing moved",
      });
      const entry = registry.published[item.mark];
      if (entry) entry.path = item.standing_path;
    }
    if (dropped.length) writeRepoFile(repo, REGISTRY_REL, `${JSON.stringify(registry, null, 2)}\n`);

    // Now the gate, and it wants a CLEAN tree: an error refuses as it always
    // has. There is no second arm any more — the re-home that used to survive
    // its own pass cannot exist, because "the settlement writes a mark once;
    // nothing moves it after."
    const verdict = lintFindings(repo);
    if (verdict.errors)
      throw new Error(`the crossing does not lint clean: ${verdict.errors} error(s), first — ${verdict.findings.find((f) => f.sev === "ERROR")?.msg?.slice(0, 240)}`);
    // WHAT THE CROSSING LET THROUGH, on the journal, by name. An advisory nobody
    // reads is not an advisory — and gate B is advisory on purpose right now
    // (mark-lint §6), so the marks it flags would otherwise cross in silence and
    // the town would learn the id-keyed layout had not arrived only when someone
    // went looking. Warnings never fail a crossing; they are said out loud.
    for (const f of verdict.findings ?? [])
      if (f.sev === "WARN") console.error(`[lint-advisory] ${f.file}: ${f.msg}`);

    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs"), "--stakes", stakesPath], {
      cwd: repo, stdio: ["ignore", "pipe", "inherit"], // stderr -> the journal: the fanup-shadow lines are FOR the reader (S39-era fix; "pipe" was swallowing them)
    });
    // The fold writes THREE files now, not two: the heads-up list became
    // fold-derived state (tools/region-outsiders.mjs) so that a settlement
    // cannot leave it stale. All three must be tracked here — a file the fold
    // writes and the sweep does not stage is left dirty in the working tree,
    // and the next crossing refuses at checkout for a mess the sweep made.
    touched.push("WORLD/world-state.json", "WORLD/INDEX.md",
      "WORLD/region-outsiders.json", "WORLD/region-outsiders.md",
      // the containment map, fold-derived since the freeze: "the fold emits the
      // containment map beside world-state.json every settlement."
      "WORLD/containment.json");
  } catch (error) {
    rollbackBeforeCommit(repo, touched);
    throw error;
  }

  // THE PRE-COMMITS ARE GONE with the pass that needed them. Each re-home used
  // to land as its own commit, ahead of the settlement, so that a directory move
  // was readable in the history rather than buried inside a sweep commit. There
  // are no moves to make readable now: "the settlement writes a mark once;
  // nothing moves it after."
  const mainCommit = commit(repo, [
    "WORLD/marks",
    REGISTRY_REL,
    "WORLD/world-state.json",
    "WORLD/INDEX.md",
    "WORLD/region-outsiders.json",
    "WORLD/region-outsiders.md",
    "WORLD/containment.json",
  ], `settlement: sweep ${published.length} published, ${unpublished.length} unpublished${withdrawn.length ? `, ${withdrawn.length} withdrawn` : ""}`);

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
    // named in the sweep's own answer, not only in a log — the operator reading
    // the crossing must see that a sketchbook was set aside without going looking
    quarantined,
    unpublished: unpublished.map(({ content, ...item }) => item),
    withdrawn,
    dropped,
    rebased,
    // the crossing's own word on the line-ending law it had to work around
    eol_boundary: gate.irreconcilable,
    // §4's own number, measured rather than asserted.
    fold_stats: { ...foldMeter },
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
      console.log(`settlement sweep: ${report.published.length} published · ${report.left_drafted.length} left drafted · ${report.unpublished.length} unpublished · ${report.dropped.length} dropped · ${report.rebased.length} draft branch(es) rebased`);
      for (const row of report.published) console.log(`PUBLISH\t${row.household}\t${row.id}\t${row.class}\tescrow=${row.escrow}`);
      for (const row of report.left_drafted) console.log(`KEEP\t${row.household}\t${row.id ?? row.path}\t${row.reason}`);
      for (const row of report.unpublished) console.log(`UNPUBLISH\t${row.household}\t${row.id}\tescrow=${row.escrow}`);
      for (const row of report.dropped) console.log(`DROP\t${row.id}\t${row.path} -> already standing at ${row.standing_path}\tthe-town/the-already-standing`);
    }
  } catch (error) {
    console.error(`settlement sweep refused: ${String(error?.message ?? error)}`);
    // The cause, on its own named line, LAST. A receipt builder that slices the
    // first N bytes of stderr reads journal progress and calls it the reason —
    // which is how a successful already-standing drop came to stand in for
    // `cannot rebase` on 2026-08-23. Grep the sentinel instead of the head.
    console.error(`${REFUSAL_SENTINEL} ${JSON.stringify({
      cause: String(error?.message ?? error),
      phase: error?.phase ?? "unknown",
      ...(error?.branch ? { branch: error.branch } : {}),
      ...(error?.real_dirt?.length ? { real_dirt: error.real_dirt } : {}),
      ...(error?.eol_dirt?.length ? { eol_dirt: error.eol_dirt } : {}),
    })}`);
    process.exitCode = 1;
  }
}
