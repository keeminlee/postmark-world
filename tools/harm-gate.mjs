#!/usr/bin/env node
// harm-gate.mjs — THE CROSSING'S REFUSING GATE.
//
// Founder, 2026-09-16 (the day two crossings refused, one for twelve marks that
// would have moved and one for a test's ledger of an August path): "A failed
// settlement should be a crisis. Under that definition we face crises almost
// every day. That's dangerous because that dilutes the urgency of a real
// crisis." So a crossing REFUSES only for what it did to residents, and
// everything else in the suite is a warning and a pull request.
//
// Five checks, all data-shaped. Each compares the tree the sweep produced (the
// working tree, HEAD once the sweep has committed) with the tree it started from
// (`--base`, the main the crossing was measured against), and reads the sweep's
// own report as the list of declared acts. Nothing here compares today's world
// with August's, so nothing here needs a hand list, and nothing here decays:
//
//   1. lint      — mark-lint reports no error.
//   2. moved     — no standing mark's world position changed, unless the sweep
//                  published it this crossing (its author's edit). A mark the
//                  reparent verb re-expressed must NOT have moved: keeping world
//                  is the verb's whole claim, and this is where it is held.
//   3. lost      — no mark left the tree, unless the sweep says it unpublished or
//                  withdrew it. And the sweep's word is held to the tree both
//                  ways: a mark it says it published stands, a mark it says it
//                  removed is gone.
//   4. escrow    — the fold ran with the town's stakes and reported no error, and
//                  it did not fold stampless (stake rows naming standing marks,
//                  and every mark at zero stamps — the 09-16 scratch-fold class).
//   5. parcels   — no two standing parcels overlap.
//
// A red names the marks, so no isolation pass is needed to attribute it. Exit 0
// is no harm; 1 is harm, named; 2 is "could not gate" — a report or a tree it
// could not read — which is never a pass.
//
//   node tools/harm-gate.mjs --repo <sweep clone> --sweep <sweep.json> --base <ref> [--stakes <file>] [--json]

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, rect, overlapArea } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
const ringKey = (r) => (Array.isArray(r) && r.length ? JSON.stringify(r.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]))) : null);

/** The marks at a ref, read from a scratch extraction of WORLD/ — the sweep's own discipline. */
function marksAt(repo, ref) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-harm-gate-"));
  try {
    const archive = join(dir, "world.tar");
    execFileSync("git", ["-C", repo, "archive", "--format=tar", `--output=${archive}`, ref, "--", "WORLD"], { stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("tar", ["-xf", "world.tar"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    return byId(loadMarks(join(dir, "WORLD", "marks")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function byId(marks) {
  const out = new Map();
  for (const m of marks) if (!m._error && !out.has(m.id)) out.set(m.id, m);
  return out;
}

/** The base the crossing was measured against: HEAD's parent when HEAD is a settlement commit, else HEAD. */
export function defaultBase(repo) {
  let subject = "";
  try { subject = git(repo, ["log", "-1", "--format=%s", "HEAD"]); } catch { return "HEAD"; }
  return /^settlement: /.test(subject) ? "HEAD~1" : "HEAD";
}

const ids = (rows) => new Set((Array.isArray(rows) ? rows : []).map((r) => r?.id).filter(Boolean));

export function harmGate({ repo, sweep = {}, base = null, stakes = null, lint = true } = {}) {
  const baseRef = base ?? defaultBase(repo);
  const before = marksAt(repo, baseRef);
  const after = byId(loadMarks(join(repo, "WORLD", "marks")));
  const published = ids(sweep.published), unpublished = ids(sweep.unpublished), withdrawn = ids(sweep.withdrawn);
  const checks = [];
  const check = (name, rows, note = null) => { checks.push({ name, ok: rows.length === 0, count: rows.length, rows: rows.slice(0, 40), ...(note ? { note } : {}) }); };

  // 1 · lint
  if (lint) {
    const r = spawnSync(process.execPath, [join(repo, "tools", "mark-lint.mjs"), "--json"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.error || ![0, 1].includes(r.status)) throw new Error(`could not gate: mark-lint ${r.error ? r.error.message : `exited ${r.status}`}: ${String(r.stderr || r.stdout).trim().slice(0, 300)}`);
    let verdict; try { verdict = JSON.parse(r.stdout); } catch { throw new Error(`could not gate: mark-lint did not answer in JSON: ${String(r.stdout).trim().slice(0, 300)}`); }
    const findings = Array.isArray(verdict.findings) ? verdict.findings : [];
    const errors = findings.filter((f) => String(f.sev ?? f.severity ?? "").toUpperCase() === "ERROR");
    const count = Number.isFinite(verdict.errors) ? verdict.errors : errors.length;
    check("lint", count ? (errors.length ? errors.map((f) => `${f.file ?? f.id ?? "?"}: ${String(f.msg ?? f.message ?? "").slice(0, 160)}`) : [`${count} error(s)`]) : []);
  } else {
    checks.push({ name: "lint", ok: true, count: 0, rows: [], note: "not run (--no-lint)" });
  }

  // 2 · moved
  {
    const rows = [];
    for (const [id, was] of before) {
      const now = after.get(id);
      if (!now || !was.at || !now.at) continue;
      if (published.has(id)) continue;                       // the author's own edit this crossing
      if (!same(was.at, now.at) || ringKey(was.points) !== ringKey(now.points)) {
        rows.push(`${id}: ${was.at.x},${was.at.y} -> ${now.at.x},${now.at.y}${sweep.reframed?.some((r) => r.id === id) ? " (re-expressed by the verb, and it moved — the verb's claim is broken)" : " (no act names it)"}`);
      }
    }
    check("moved", rows);
  }

  // 3 · lost, and the sweep's word held to the tree both ways
  {
    const rows = [];
    for (const id of before.keys()) if (!after.has(id) && !unpublished.has(id) && !withdrawn.has(id)) rows.push(`${id}: gone, and no act names it`);
    for (const id of published) if (!after.has(id)) rows.push(`${id}: the sweep says it published this mark, and it does not stand`);
    for (const id of [...unpublished, ...withdrawn]) if (after.has(id)) rows.push(`${id}: the sweep says it removed this mark, and it still stands`);
    check("lost", rows);
  }

  // 4 · escrow — the fold's own errors, and the stampless fold
  {
    const statePath = join(repo, "WORLD", "world-state.json");
    if (!existsSync(statePath)) throw new Error("could not gate: no WORLD/world-state.json — the fold did not run, so escrow cannot be read");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const rows = (Array.isArray(state.errors) ? state.errors : []).map((e) => `fold error: ${typeof e === "string" ? e : JSON.stringify(e).slice(0, 160)}`);
    const stamps = (state.marks ?? []).reduce((a, m) => a + (Number(m.stamps) || 0), 0);
    let stakeRows = null;
    if (stakes) {
      const parsed = JSON.parse(readFileSync(stakes, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed?.stakes ?? []);
      stakeRows = list.filter((s) => (Number(s.n) || 0) > 0 && after.has(s.mark)).length;
      if (stakeRows > 0 && stamps === 0) rows.push(`${stakeRows} stake row(s) name standing marks and the fold carries 0 stamps — it folded stampless`);
    }
    check("escrow", rows, `fold stamps ${stamps}${stakeRows == null ? "" : `, stake rows on standing marks ${stakeRows}`}`);
  }

  // 5 · parcels
  {
    const parcels = [...after.values()].filter((m) => m.kind === "parcel" && m.at && m.extent);
    const rows = [];
    for (let i = 0; i < parcels.length; i++) {
      for (let j = i + 1; j < parcels.length; j++) {
        const a = overlapArea(rect(parcels[i]), rect(parcels[j]));
        if (a > 0) rows.push(`${parcels[i].id} x ${parcels[j].id}: ${a.toFixed(1)} m² of shared ground`);
      }
    }
    check("parcels", rows, `${parcels.length} standing parcel(s)`);
  }

  return { ok: checks.every((c) => c.ok), base: baseRef, before: before.size, after: after.size, checks };
}

function main(argv) {
  const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const repo = opt("--repo", join(HERE, ".."));
  const sweepPath = opt("--sweep");
  if (!sweepPath) { console.error("harm-gate: could not gate — no --sweep <sweep.json>: the sweep's report is the list of declared acts"); process.exit(2); }
  let sweep; try { sweep = JSON.parse(readFileSync(sweepPath, "utf8")); } catch (e) { console.error(`harm-gate: could not gate — ${sweepPath} unreadable: ${e.message}`); process.exit(2); }
  let out;
  try { out = harmGate({ repo, sweep, base: opt("--base"), stakes: opt("--stakes"), lint: !argv.includes("--no-lint") }); }
  catch (e) { console.error(`harm-gate: ${e.message}`); process.exit(2); }
  for (const c of out.checks) console.error(`harm-gate: ${c.ok ? "ok  " : "HARM"} ${c.name}${c.note ? ` (${c.note})` : ""}${c.count ? ` — ${c.count}:` : ""}${c.rows.slice(0, 5).map((r) => `\n    ${r}`).join("")}${c.count > 5 ? `\n    … and ${c.count - 5} more` : ""}`);
  console.error(`harm-gate: ${out.ok ? "NO HARM" : "HARM NAMED"} — base ${out.base}, ${out.before} mark(s) before, ${out.after} after`);
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2));
