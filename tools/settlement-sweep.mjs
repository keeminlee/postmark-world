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
  fold, loadMarks, parseRecord, standingRank, worldToFile, ringToFile, ringToWorld, fileToWorld,
  declaredCoords, COORDS_RELATIVE, WORLD_ROOT_SLUG,
} from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const REGISTRY_REL = "WORLD/settlement-publications.json";
// the named door a refusal leaves by, so a receipt never has to guess which
// stderr line was the cause
export const REFUSAL_SENTINEL = "SETTLEMENT-SWEEP-REFUSAL";
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
export const foldMeter = { whole: 0, wholeMs: 0, delta: 0, deltaMs: 0, marks: 0 };
export function resetFoldMeter() { foldMeter.whole = 0; foldMeter.wholeMs = 0; foldMeter.delta = 0; foldMeter.deltaMs = 0; foldMeter.marks = 0; }

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

// ── the-already-standing (the-town/the-already-standing, 2026-08-23) ─────────
//
//   "A parked copy of a mark already standing in canon, identical but for its
//    frame and its hour, is the drain's to drop — nothing moves, nothing
//    refuses."
//
// The door parks every sited draft at the root (the-town/the-parked). A
// sketchbook cut before its own mark was filed re-offers that parked copy every
// crossing: the publish writes it back at the root, the re-home pass computes
// the seat it ALREADY occupies, and the collision below refused the whole
// crossing — over paper naming a mark that has not moved. (The S45 class; the
// worldkeeper's 2026-08-23 daily is the derivation.)
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

// The drain, and it runs BEFORE the move loop for a reason the duplicate itself
// forces: the loop is keyed by mark id, and a parked copy shares its twin's id
// exactly (id = by + leaf slug, and the copy carries both). `byId` keeps
// whichever the walk reached first — the twin, in tree order — so the loop was
// never even looking at the parked copy; it computed the standing mark's own
// seat as its destination and refused to file it over itself. The finding names
// the record by FILE, which is the only unambiguous handle here, so the drain
// resolves by file and leaves the tree with no duplicate for the loop to trip on.
function dropAlreadyStanding(repo, rehomes) {
  const marks = loadMarks(join(repo, "WORLD", "marks"));
  const byDir = new Map();
  for (const mark of marks) byDir.set(relative_(repo, mark._dir), mark);
  const byId = new Map();
  for (const mark of marks) if (!byId.has(mark.id)) byId.set(mark.id, mark);
  const root = marks.find((mark) => mark.slug === WORLD_ROOT_SLUG);
  const dropped = [];
  for (const item of rehomes) {
    if (!item.file) continue;                        // a finding naming no seat names nothing to drop
    const parked = byDir.get(item.file);
    if (!parked) continue;
    const parent = item.to === null || item.to === undefined ? root : byId.get(item.to);
    if (!parent) continue;                           // the move loop refuses this one by name
    const to = `${relative_(repo, parent._dir)}/${basename(item.file)}`;
    const standing = byDir.get(to);
    if (!standing || standing === parked) continue;  // no twin: the-parked's ordinary re-home
    if (!identicalButForFrameAndHour(parked, standing)) continue; // a real collision, refused below
    // Nothing may be riding on the parked copy. Dropping a seat with a mark
    // inside it would MOVE something, and this law moves nothing.
    if (marks.some((m) => m !== parked && relative_(repo, m._dir).startsWith(`${item.file}/`))) continue;
    if (hasObject(repo, `HEAD:${item.file}/mark.md`)) git(repo, ["rm", "-r", "-q", "--", item.file]);
    else rmSync(join(repo, item.file), { recursive: true, force: true });
    // Paths are the mark.md the rest of the crossing speaks in — the registry
    // row this restores names a file, and every other journal row does too.
    dropped.push({ mark: parked.id, file: item.file, from_path: `${item.file}/mark.md`, standing_path: `${to}/mark.md`, to_parent: item.to ?? null });
    console.error(`[the-already-standing] dropped ${parked.id} parked at ${item.file}/mark.md — already standing at ${to}/mark.md, identical but for its frame and its hour`);
  }
  return dropped;
}

function applyRehomes(repo, rehomes) {
  const marksRoot = join(repo, "WORLD", "marks");
  const dropped = dropAlreadyStanding(repo, rehomes);
  const live = dropped.length
    ? rehomes.filter((item) => !dropped.some((d) => d.file === item.file))
    : rehomes;
  const marks = loadMarks(marksRoot); // reloaded: the dropped copies are off the tree
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

  const order = [...live].sort((a, b) => (byId.get(b.mark)?._dir ?? "").length - (byId.get(a.mark)?._dir ?? "").length);
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
    // A mark PUBLISHED THIS CROSSING is on disk but not yet in the index (the
    // publish writes files; staging happens in the commit step, after this
    // pass) — and `git mv` refuses an untracked source as "directory is empty".
    // Stage it first: a no-op for the long-tracked marks this pass historically
    // moved, and the difference between moving and refusing for a root-parked
    // draft being filed on its first crossing (the-town/the-parked; found by
    // the shadow rehearsal, 2026-08-22 19:03Z — WOULD REFUSE, hours ahead).
    git(repo, ["add", "--", from]);
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
  return { rehomed: done, dropped };
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
  let rehomed = [];
  const dropped = []; // § the-already-standing — the crossing's journal for a copy that was never a conflict

  for (const branch of branches) {
    const household = branch.slice("draft/".length);
    // THE QUARANTINE, and it is deliberately the FIRST thing in the sketchbook. A ref
    // that cannot be folded cannot be reasoned about at all, so nothing from it
    // is read, nothing is published, nothing is withdrawn, nothing is touched —
    // the conservative direction is preserved by skipping BEFORE any of that,
    // rather than by unwinding after. Nothing half-applies because nothing
    // applies.
    let state;
    try {
      state = foldRef(repo, branch, stakes);
    } catch (error) {
      // LOUD. The ref, the reason, and — where the fold named one — the row that
      // poisoned it, so the crossing's journal says whose sketchbook was set aside
      // and what to fix. A silent drop here would be a household's work quietly
      // vanishing at a settlement, which is worse than the refusal it replaces.
      const detail = String(error?.message ?? error);
      quarantined.push({
        household, ref: branch,
        reason: "this sketchbook could not be folded, so it was set aside and the rest of the town settled without it",
        detail: detail.slice(0, 400),
        row: firstStakeRowIn(detail),
      });
      continue;
    }
    const folded = new Map(state.marks.map((mark) => [mark.id, mark]));
    for (const delta of markDelta(repo, mainBranch, branch)) {
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
      for (let depth = parts.length - 2; depth > 2; depth--) {
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

    // § the re-home pass — repair before the gate judges, so a resident is
    // never bounced for paper the machinery is allowed to move itself.
    const pending = lintFindings(repo);
    if (pending.rehomes.length) {
      const pass = applyRehomes(repo, pending.rehomes);
      rehomed = pass.rehomed;
      for (const item of rehomed) touched.push(item.from_path, item.to_path);
      // § the-already-standing — nothing moved, so the crossing publishes
      // nothing for a dropped copy and the registry goes on naming the seat
      // that stands. The publish above had already overwritten the row with the
      // parked copy's root path; leaving that would point the ledger at a
      // directory the drain just took away.
      for (const item of pass.dropped) {
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
      if (pass.dropped.length) writeRepoFile(repo, REGISTRY_REL, `${JSON.stringify(registry, null, 2)}\n`);
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
    // The fold writes THREE files now, not two: the heads-up list became
    // fold-derived state (tools/region-outsiders.mjs) so that a settlement
    // cannot leave it stale. All three must be tracked here — a file the fold
    // writes and the sweep does not stage is left dirty in the working tree,
    // and the next crossing refuses at checkout for a mess the sweep made.
    touched.push("WORLD/world-state.json", "WORLD/INDEX.md",
      "WORLD/region-outsiders.json", "WORLD/region-outsiders.md");
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
    "WORLD/region-outsiders.json",
    "WORLD/region-outsiders.md",
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
    rehomed,
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
      console.log(`settlement sweep: ${report.published.length} published · ${report.left_drafted.length} left drafted · ${report.unpublished.length} unpublished · ${report.rehomed.length} re-homed · ${report.dropped.length} dropped · ${report.rebased.length} draft branch(es) rebased`);
      for (const row of report.published) console.log(`PUBLISH\t${row.household}\t${row.id}\t${row.class}\tescrow=${row.escrow}`);
      for (const row of report.left_drafted) console.log(`KEEP\t${row.household}\t${row.id ?? row.path}\t${row.reason}`);
      for (const row of report.unpublished) console.log(`UNPUBLISH\t${row.household}\t${row.id}\tescrow=${row.escrow}`);
      for (const row of report.rehomed) console.log(`REHOME\t${row.mark}\t${row.from_parent ?? "(root)"} -> ${row.to_parent ?? "(root)"}${row.reframed ? `\tre-framed on ${row.reframed.origin.x},${row.reframed.origin.y}` : ""}`);
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
