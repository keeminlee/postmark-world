#!/usr/bin/env node
// coords-equivalence.mjs — THE MIGRATION FALSIFIER for the v2→v3 coordinate
// rewrite (SCHEMA.md § The frame). It answers one question, and it is allowed to
// answer it "no":
//
//   For every mark, is the world position COMPOSED by the new loader over the
//   migrated tree exactly the ABSOLUTE position the old loader read off the old
//   tree?
//
// It does not trust a snapshot taken by the migration itself — a rewrite that
// checks its own arithmetic against its own output proves nothing. It runs TWO
// REAL PROGRAMS OVER TWO REAL TREES: the marks and the tools as they stand at a
// git ref (the pre-migration world, extracted read-only into a temp dir and
// loaded with ITS OWN marks-fold.mjs), against the working tree loaded with this
// one. Both sides are what actually shipped; neither is a transcription.
//
//   node tools/coords-equivalence.mjs                 # working tree vs HEAD
//   node tools/coords-equivalence.mjs --ref HEAD~1    # after the migration commit lands
//   node tools/coords-equivalence.mjs --json
//
// It refuses to run when both sides carry the SAME frame — two absolute trees or
// two relative ones agree trivially, and a green tautology is worse than a red
// failure. Exit 0 only when every mark on both sides matched exactly.

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const REF = opt("--ref", "HEAD");
const JSON_OUT = args.includes("--json");

const run = (cmd, argv, o = {}) => {
  const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: "buffer", ...o });
  if (r.error) return { failed: true, why: `${cmd} could not be run (${r.error.code ?? r.error.message})` };
  if (r.status !== 0) return { failed: true, why: `${cmd} ${argv.join(" ")} exited ${r.status}: ${String(r.stderr ?? "").trim()}` };
  return { failed: false, out: r.stdout };
};

// A refusal unwinds rather than exits, so the temp tree below is always swept —
// process.exit() would skip the finally that removes it.
class Refusal extends Error { constructor(msg, fix) { super(msg); this.fix = fix; } }
const die = (msg, fix) => { throw new Refusal(msg, fix); };

// ── the two trees ────────────────────────────────────────────────────────────
// The ref side is extracted rather than checked out: the repository's own state
// is never touched, so this can be run mid-migration on a dirty working tree.
let scratch = null;
async function loadSide(label, marksDir, toolsDir) {
  const modUrl = pathToFileURL(join(toolsDir, "marks-fold.mjs")).href;
  let mod;
  try { mod = await import(modUrl); }
  catch (e) { die(`the ${label} side has no loadable tools/marks-fold.mjs`, e.message); }
  if (typeof mod.loadMarks !== "function") die(`the ${label} side's marks-fold.mjs exports no loadMarks`);
  const marks = mod.loadMarks(marksDir).filter((m) => !m._error);
  if (!marks.length) die(`the ${label} side loaded no marks from ${marksDir}`, "is the ref right?");
  return marks;
}

// the frame a tree declares — read off the record, not off the tools, because it
// is the TREE's property (the root's `coords:` field; absent = the v2 absolute).
const frameOf = (marks) => {
  const decl = marks.find((m) => m.coords !== undefined);
  return decl ? `${String(decl.coords).trim()} (declared by ${decl.id})` : "absolute (no coords: declaration)";
};

const posOf = (marks) => {
  const out = new Map();
  for (const m of marks) {
    if (!m.at || !Number.isFinite(m.at.x) || !Number.isFinite(m.at.y)) continue;
    out.set(m.id, {
      at: { x: m.at.x, y: m.at.y },
      extent: m.extent ? { w: m.extent.w, h: m.extent.h } : null,
      points: Array.isArray(m.points)
        ? m.points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]))
        : null,
    });
  }
  return out;
};

let code = 2;
try {
  scratch = mkdtempSync(join(tmpdir(), "coords-equiv-"));
  const arch = run("git", ["archive", "-o", join(scratch, "ref.tar"), REF, "WORLD/marks", "tools"]);
  if (arch.failed) die(`could not archive ${REF}`, arch.why);
  // tar runs INSIDE the scratch dir on a bare filename: a Windows absolute path
  // carries a drive colon, and GNU tar reads `C:` as a remote host to connect to.
  const untar = run("tar", ["-xf", "ref.tar"], { cwd: scratch });
  if (untar.failed) die("could not extract the ref tree", `${untar.why}\n  (this probe needs \`tar\` on PATH — Windows 10+ and every unix ship one)`);

  const refMarks = await loadSide(`ref (${REF})`, join(scratch, "WORLD/marks"), join(scratch, "tools"));
  const nowMarks = await loadSide("working tree", join(ROOT, "WORLD/marks"), join(ROOT, "tools"));

  const refFrame = frameOf(refMarks), nowFrame = frameOf(nowMarks);
  if (refFrame === nowFrame)
    die(`both sides carry the same frame — ${refFrame}`,
      `there is nothing to falsify: a tree compared against itself agrees for free.\n  Point --ref at the tree BEFORE the migration (after the commit lands, that is HEAD~1).`);

  // The census first: a rewrite that DROPPED a record would otherwise pass, since
  // a mark with no coordinates has no position to disagree about.
  const censusRef = new Set(refMarks.map((m) => m.id)), censusNow = new Set(nowMarks.map((m) => m.id));
  const lost = [...censusRef].filter((id) => !censusNow.has(id)).sort();
  const gained = [...censusNow].filter((id) => !censusRef.has(id)).sort();

  const A = posOf(refMarks), B = posOf(nowMarks);
  const ids = [...new Set([...A.keys(), ...B.keys()])].sort();
  const eq = (p, q) => p.x === q.x && p.y === q.y;
  const rows = { equal: [], moved: [], onlyRef: [], onlyNow: [], extentChanged: [], ringChanged: [] };
  for (const id of ids) {
    const a = A.get(id), b = B.get(id);
    if (!a) { rows.onlyNow.push(id); continue; }
    if (!b) { rows.onlyRef.push(id); continue; }
    if (eq(a.at, b.at)) rows.equal.push(id);
    else rows.moved.push({ id, was: a.at, now: b.at, dx: b.at.x - a.at.x, dy: b.at.y - a.at.y });
    // extent is a SIZE, not a position — the migration must not have touched it
    if (JSON.stringify(a.extent) !== JSON.stringify(b.extent)) rows.extentChanged.push(id);
    // a points ring is a set of positions and rides the same frame as `at`
    if (JSON.stringify(a.points) !== JSON.stringify(b.points)) rows.ringChanged.push(id);
  }

  const clean = !rows.moved.length && !rows.onlyRef.length && !rows.onlyNow.length
    && !rows.extentChanged.length && !rows.ringChanged.length && !lost.length && !gained.length;

  if (JSON_OUT) {
    console.log(JSON.stringify({ ref: REF, refFrame, nowFrame, records: censusRef.size, compared: ids.length, lost, gained, ...rows, clean }, null, 2));
  } else {
    console.log(`ref  ${REF.padEnd(10)} frame: ${refFrame}`);
    console.log(`work ${"(tree)".padEnd(10)} frame: ${nowFrame}\n`);
    console.log(`${censusRef.size} records at the ref, ${censusNow.size} in the working tree — ${ids.length} of them carry a position.`);
    console.log(`${rows.equal.length}/${ids.length} marks compose to EXACTLY the position the old tree stated.`);
    if (lost.length) console.log(`\n${lost.length} record(s) LOST by the rewrite:\n  ${lost.slice(0, 15).join("\n  ")}`);
    if (gained.length) console.log(`\n${gained.length} record(s) APPEARED:\n  ${gained.slice(0, 15).join("\n  ")}`);
    if (rows.moved.length) {
      console.log(`\n${rows.moved.length} mark(s) MOVED — the migration was not position-preserving:`);
      for (const m of rows.moved.slice(0, 25))
        console.log(`  ${m.id}: ${m.was.x},${m.was.y} -> ${m.now.x},${m.now.y}  (${m.dx >= 0 ? "+" : ""}${m.dx}, ${m.dy >= 0 ? "+" : ""}${m.dy})`);
      if (rows.moved.length > 25) console.log(`  … and ${rows.moved.length - 25} more`);
    }
    for (const [what, list] of [["present only at the ref", rows.onlyRef], ["present only in the working tree", rows.onlyNow],
      ["extent changed (a size is not a position — it must not move)", rows.extentChanged],
      ["points ring changed relative to its claim", rows.ringChanged]])
      if (list.length) console.log(`\n${list.length} ${what}:\n  ${list.slice(0, 15).join("\n  ")}`);
    console.log(clean
      ? `\nEQUIVALENT — every mark's world position, extent and ring survived the rewrite unchanged.`
      : `\nNOT EQUIVALENT — the rewrite changed the world. Do not land it.`);
  }
  code = clean ? 0 : 1;
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  console.error(`coords-equivalence: ${e.message}${e.fix ? `\n  ${e.fix}` : ""}`);
  code = 2;
} finally {
  if (scratch && existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
}
process.exit(code);
