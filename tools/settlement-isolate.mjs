// settlement-isolate.mjs — WHOSE MARK REDDENED THE TOWN.
//
// ── THE DEFECT THIS ANSWERS ──────────────────────────────────────────────────
//
// Founder, 2026-08-27, the drain night, defect 4 verbatim:
//
//   "ONE BAD MARK REFUSES THE WHOLE TOWN — the final suite gate is all-or-
//    nothing: tonight vermillion's amend moving the-pando-peak to
//    (-95458,-95458) turned vessel tests red and refused EVERYONE'S settlement;
//    earlier milo/the-purple-door overlapping jack-tully-brannon/the-brannon-
//    lantern did the same via the fold."
//
// Both live cases have the same shape: ONE household's geometry is wrong, and
// every other household in town — who did nothing — does not settle. The
// 03:22:57Z crossing on the 27th lost eleven tests to a single amend:
//
//   not ok 374 - THE FALSIFIER: every mark in the real world composes to EXACTLY …
//   not ok 377 - the ruled schedule: quay 06:00Z/18:00Z, landing 00:00Z/12:00Z …
//   not ok 387 - VERMILLION'S CASE: standing on the berth centre when she casts off …
//   … (the landing stands on that peak, so the whole timetable moved with it)
//
// and published nothing for anybody until a human reverted the amend by hand.
//
// ── WHY IT IS A RE-SWEEP AND NOT TREE SURGERY ────────────────────────────────
//
// The obvious cheap trick is to take the sweep's finished commit and restore the
// suspect paths out of it, regenerate the fold, and re-run the suite. It is
// wrong, and quietly: the sweep does six other things with a published mark —
// the publication registry, the ground-closure hold (a child whose ground is
// held back must be held back WITH it), the already-standing drop, the
// sketchbook rebase. Surgery on the tree reproduces none of that, so the state
// it leaves behind is not a state the sweep can produce, and the settlement
// would push a record no crossing ever computed.
//
// So a trial is a REAL CROSSING, run again with a quarantine list
// (`settlementSweep({ suiteQuarantine })`). The cost is what makes this
// affordable, and it was measured rather than assumed, on the box, at world
// 7378efc7 against 36 live sketchbooks:
//
//   full sweep   1m12s        full grammar suite   1m32s        → ~2m45s a trial
//
// (The 28-minute sweep of the 2026-08-22 salvage note is history; §4's delta
// path retired it.)
//
// ── THE SEARCH ───────────────────────────────────────────────────────────────
//
// Two phases, because the common case and the bad case want different shapes:
//
//   Phase 0  hold back EVERYTHING this crossing published. If the suite is
//            still red, the red is NOT attributable to a candidate — it is a
//            machinery failure, a stale generated file, an infrastructure
//            problem — and the honest answer is to refuse the town exactly as
//            before rather than quarantine an innocent household. This runs
//            FIRST, so a machinery red costs one trial, not log(k) of them.
//
//   Phase 1  bisect. Halve the held-back set while the suite stays green. This
//            finds a single culprit in ~log2(k) trials.
//
//   Phase 2  greedy shrink. Bisection stalls when two candidates redden the
//            suite only together (an overlap between two households is exactly
//            that shape — milo's door and the brannon lantern). Try re-admitting
//            each held-back mark one at a time and keep it out only if the
//            suite goes red without it.
//
// Every phase moves only in the direction of holding back FEWER marks from a
// state already known green, so the invariant holds throughout:
//
//   THE SET THIS RETURNS IS ONE WHOSE REMOVAL MAKES THE GATE GREEN,
//   AND EVERY MARK NOT IN IT PUBLISHED IN A CROSSING THAT PASSED.
//
// No household is ever quarantined on suspicion; each one in the returned set
// was demonstrated necessary by a trial that went red without it.
//
// ── WHAT IT LEAVES BEHIND ────────────────────────────────────────────────────
//
// The repo, on `main`, at the winning crossing's own commit — the same object a
// clean run would have produced, with the held-back marks still standing in
// their sketchbooks and named in the commit message and on the
// `suite_quarantined` channel. settlement-auto.sh pushes it exactly as it would
// push any other green crossing.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { settlementSweep } from "./settlement-sweep.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});

const say = (line) => process.stderr.write(`[settlement-isolate] ${line}\n`);

/**
 * The state a trial starts from, captured by settlement-auto.sh BEFORE the first
 * sweep ran. It cannot be recovered afterwards: the sweep rebases every draft
 * branch onto the main it just wrote, so by the time this file runs the
 * sketchbooks no longer hold the marks whose publication is under test. A
 * re-sweep from the post-sweep refs finds nothing and would report — with total
 * confidence and no candidates — that holding back zero marks makes the gate
 * green.
 */
function readBefore(path) {
  const before = JSON.parse(readFileSync(path, "utf8"));
  if (!before?.main || typeof before.branches !== "object")
    throw new Error(`--before ${path} does not carry {main, branches} — the pre-sweep refs are not recoverable without it`);
  return before;
}

/** Put the clone back exactly as the crossing found it. Every trial starts here. */
function rewind(repo, before, mainBranch) {
  git(repo, ["checkout", "-qf", "-B", mainBranch, before.main]);
  git(repo, ["clean", "-fdq"]);
  for (const [branch, sha] of Object.entries(before.branches)) git(repo, ["branch", "-qf", branch, sha]);
}

/**
 * The gate, run the way settlement-auto.sh runs it — same command, same silence.
 *
 * Injectable (`isolate({ gate })`) for one reason: the real gate is the world's
 * whole 686-test grammar suite against the whole record, and a fixture repo
 * holding four marks cannot run it. A falsifier that cannot make the gate go red
 * on demand cannot test the search at all — it could only assert that a function
 * was called. Nothing in production passes it.
 */
export function npmTestGate(repo) {
  const run = spawnSync("npm", ["test", "--silent"], { cwd: repo, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 128 * 1024 * 1024 });
  return { green: run.status === 0, log: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

/**
 * ONE TRIAL: rewind, re-run the crossing with `held` held back, run the gate.
 * Returns the sweep's own report alongside the verdict, because the winning
 * trial's report IS the crossing's report and the caller has no other way to
 * produce it.
 */
function trial(repo, before, mainBranch, stakesPath, held, label, gate) {
  rewind(repo, before, mainBranch);
  let report;
  try {
    report = settlementSweep({ repo, stakesPath, mainBranch, suiteQuarantine: new Set(held) });
  } catch (error) {
    // A sweep that refuses under a quarantine tells us nothing about the suite,
    // and pretending otherwise would let the search wander. Treated as red with
    // its cause carried, so the caller can say why it gave up.
    say(`${label}: the sweep itself refused — ${String(error?.message ?? error).slice(0, 200)}`);
    return { green: false, report: null, held: [...held], sweepRefused: String(error?.message ?? error) };
  }
  const { green, log } = gate(repo);
  const notOk = log.split(/\r?\n/).filter((l) => l.startsWith("not ok ")).slice(0, 12);
  say(`${label}: holding back ${held.length} → suite ${green ? "GREEN" : `RED (${notOk.length ? notOk[0].slice(0, 90) : "no 'not ok' line"})`}`);
  // `held` rides along so the caller can tell whether the checkout it is looking
  // at is the winning crossing or merely the last one attempted.
  return { green, report, notOk, held: [...held] };
}

export function isolate({
  repo = ROOT,
  sweepPath,
  beforePath,
  stakesPath,
  mainBranch = "main",
  maxTrials = 24,
  gate = npmTestGate,
} = {}) {
  repo = resolve(repo);
  const sweep = JSON.parse(readFileSync(resolve(sweepPath), "utf8"));
  const before = readBefore(resolve(beforePath));

  // The candidate set is what THIS crossing changed about canon: what it
  // published, and what it withdrew. A mark already standing on main is not a
  // candidate — if the suite is red over it, holding back this crossing cannot
  // help, and that is precisely the unattributable case phase 0 detects.
  const candidates = [
    ...(sweep.published ?? []).map((r) => ({ id: r.id, household: r.household, path: r.path })),
    ...(sweep.withdrawn ?? []).map((r) => ({ id: r.id, household: r.household, path: r.path, withdrawal: true })),
  ].filter((c) => c.id);

  if (!candidates.length) {
    return { attributed: false, reason: "this crossing published and withdrew nothing, so the red suite cannot be attributed to any candidate it carried", rounds: 0, quarantined: [] };
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const allIds = candidates.map((c) => c.id);
  let rounds = 0;
  const budget = () => { if (++rounds > maxTrials) { const e = new Error(`isolation exceeded its ${maxTrials}-trial budget`); e.budget = true; throw e; } };

  // ── PHASE 0 · is it attributable at all? ───────────────────────────────────
  budget();
  const clean = trial(repo, before, mainBranch, stakesPath, allIds, `round ${rounds} (phase 0, hold back all ${allIds.length})`, gate);
  if (!clean.green) {
    return {
      attributed: false,
      reason: "the suite is red even with every mark this crossing carried held back — the red is not this crossing's to fix, and no household is quarantined for it",
      rounds,
      not_ok: clean.notOk ?? [],
      sweep_refused: clean.sweepRefused ?? null,
      quarantined: [],
    };
  }

  // ── PHASE 1 · bisect ───────────────────────────────────────────────────────
  let held = allIds;
  let lastGreen = clean;
  let checkoutState = clean;
  for (;;) {
    if (held.length <= 1) break;
    const mid = Math.floor(held.length / 2);
    const left = held.slice(0, mid);
    const right = held.slice(mid);
    budget();
    const a = trial(repo, before, mainBranch, stakesPath, left, `round ${rounds} (phase 1, left half)`, gate);
    checkoutState = a;
    if (a.green) { held = left; lastGreen = a; continue; }
    budget();
    const b = trial(repo, before, mainBranch, stakesPath, right, `round ${rounds} (phase 1, right half)`, gate);
    checkoutState = b;
    if (b.green) { held = right; lastGreen = b; continue; }
    // Neither half alone is enough: the culprits straddle the split. That is the
    // overlap shape (two households' marks are only wrong TOGETHER), and it is
    // what phase 2 is for.
    say("neither half is sufficient alone — the culprits straddle the split; shrinking one at a time");
    break;
  }

  // ── PHASE 2 · greedy shrink ────────────────────────────────────────────────
  // Re-admit one mark at a time from a set already known green. A mark whose
  // re-admission keeps the suite green was never guilty and goes back in; one
  // whose re-admission reddens it has been DEMONSTRATED necessary.
  for (const id of [...held]) {
    if (held.length <= 1) break;
    const attempt = held.filter((x) => x !== id);
    let a;
    try { budget(); a = trial(repo, before, mainBranch, stakesPath, attempt, `round ${rounds} (phase 2, re-admitting ${id})`, gate); }
    catch (e) { if (e.budget) { say(`${e.message} — stopping the shrink and keeping the smallest green set found`); break; } throw e; }
    checkoutState = a;
    if (a.green) { held = attempt; lastGreen = a; }
  }

  // The repo must be left standing on the winning crossing, and the last trial
  // run was not necessarily the winner (phase 2 ends on a red as often as not).
  if (!checkoutState.green || (checkoutState.held ?? []).join(",") !== held.join(",")) {
    budget();
    lastGreen = trial(repo, before, mainBranch, stakesPath, held, `round ${rounds} (final, the winning crossing)`, gate);
    if (!lastGreen.green) throw new Error("the winning set stopped being green on its confirming run — the gate is not deterministic and this must not publish");
  }

  return {
    attributed: true,
    rounds,
    suite_red_before: (sweep.published ?? []).length + (sweep.withdrawn ?? []).length,
    quarantined: held.map((id) => byId.get(id)),
    main: lastGreen.report?.main ?? git(repo, ["rev-parse", mainBranch]).trim(),
    report: lastGreen.report ?? null,
  };
}

// ── the CLI ──────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  try {
    const result = isolate({
      repo: opt("--repo", ROOT),
      sweepPath: opt("--sweep"),
      beforePath: opt("--before"),
      stakesPath: opt("--stakes"),
      mainBranch: opt("--main", "main"),
      maxTrials: Number(opt("--max-trials", "24")),
    });
    const out = opt("--out");
    const body = `${JSON.stringify(result, null, 2)}\n`;
    if (out) writeFileSync(out, body);
    if (argv.includes("--json")) process.stdout.write(body);
    if (!result.attributed) {
      say(`UNATTRIBUTABLE after ${result.rounds} trial(s): ${result.reason}`);
      process.exitCode = 1;
    } else {
      say(`attributed in ${result.rounds} trial(s): ${result.quarantined.map((q) => `${q.id} (${q.household})`).join(", ")}`);
    }
  } catch (error) {
    say(`isolation failed: ${String(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}
