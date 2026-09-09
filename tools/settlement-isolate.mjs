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

/** The record's own prefix, spelled once — `settlement-sweep.mjs` uses the same string. */
const MARKS_PREFIX = "WORLD/marks/";

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
 * WHAT A TRIAL COULD NOT HOLD BACK (G1, 2026-09-08).
 *
 * A trial does not undo the crossing — it REWINDS and RE-RUNS it with `held`
 * quarantined. So everything the crossing does that is not a candidate happens
 * again on every trial: the `unpublished` channel still removes files, and the
 * fold still rewrites `WORLD/world-state.json` and its siblings. Holding back
 * every candidate therefore does NOT return the tree to where it started.
 *
 * In the git era that gap was small enough to ignore. A crossing publishes a
 * handful of marks and unpublishes almost none — S63 published 2 — so "held back
 * everything I carried" was very nearly "held back everything I changed", and
 * phase 0's sentence was true in practice.
 *
 * A STORE CROSSING BREAKS THAT. Measured 2026-09-08 on a scratch: a store fold
 * over the standing set published 434 and UNPUBLISHED 75, and the world-state
 * rewrite spans the whole town. Phase 0 held back all 434, the suite stayed red,
 * and the isolator reported "the red is not this crossing's to fix" — over a
 * crossing whose own baseline at S63 was measured green (742/728/0). The red was
 * entirely the crossing's. The refusal was right; the reason sent the operator to
 * another lane's door at 05:45Z.
 *
 * So phase 0 now asks a second question it can actually answer, and the answer
 * changes the sentence rather than the verdict.
 */
function unheldChanges(repo, before, mainBranch, candidates) {
  const candidatePaths = new Set(candidates.map((c) => c.path).filter(Boolean));
  let changed = [];
  try {
    changed = git(repo, ["diff", "--name-only", before.main, mainBranch])
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    // A diff this cannot take is not evidence either way, and inventing an empty
    // answer here would restore exactly the false sentence this exists to end.
    return null;
  }
  // ── ONLY MARK FILES, AND THE FIRST DRAFT OF THIS WAS WRONG ─────────────────
  //
  // Written first as "every path that differs", which measured as non-empty on
  // EVERY crossing — the git-era control test reddened on
  // `WORLD/settlement-publications.json`, because the sweep records the crossing
  // in the registry whether it published anything or not. A signal that fires on
  // every crossing is not a signal, and shipping it would have replaced one
  // always-wrong sentence with another.
  //
  // The question phase 0 is actually asking is whether some RECORD changed that
  // no candidate covers. The registry and the derived world-state family are
  // bookkeeping the fold rewrites either way; where they change because a mark
  // left, the mark's own file is in this set already and says so directly.
  return changed.filter((p) => p.startsWith(MARKS_PREFIX) && !candidatePaths.has(p));
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

  // ── WHAT A REWIND COULD ACTUALLY PUT BACK (2026-09-09, the store-era
  // sentence pass) ──────────────────────────────────────────────────────────
  //
  // `rewind` restores two things and no others: `before.main`, and every
  // sketchbook in `before.branches`. In the git era that is the whole of what a
  // crossing reads from — EVERY candidate, published or withdrawn, is a delta
  // read off a `draft/*` branch (see the sweep's `draftBranches`) — so a trial
  // genuinely re-runs the crossing from where it started.
  //
  // A STORE CROSSING CARRIES CANDIDATES OUT OF NO SKETCHBOOK. `before.branches`
  // is written by `deploy/settlement-auto.sh` from `refs/heads/draft/*`; with
  // the record in the store there are none, and the rewind restores nothing the
  // candidates came from. The re-run then does not start where the crossing
  // did, and whatever the crossing wrote outside this tree was never held back
  // — so phase 0's leftover red cannot be read as canon's.
  //
  // Measured, not assumed: candidates in hand AND nothing to rewind is a state
  // the git era cannot produce, so on a git crossing this number is > 0 and
  // phase 0's sentence below is today's, byte for byte.
  const rewindableSketchbooks = Object.keys(before.branches ?? {}).length;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const allIds = candidates.map((c) => c.id);
  let rounds = 0;
  const budget = () => { if (++rounds > maxTrials) { const e = new Error(`isolation exceeded its ${maxTrials}-trial budget`); e.budget = true; throw e; } };

  // ── PHASE 0 · is it attributable at all? ───────────────────────────────────
  budget();
  const clean = trial(repo, before, mainBranch, stakesPath, allIds, `round ${rounds} (phase 0, hold back all ${allIds.length})`, gate);
  if (!clean.green) {
    // THE THREE CASES PHASE 0 USED TO PRINT AS ONE. All refuse the town, and the
    // refusal is right in all of them. They send an operator to different doors.
    const unheld = unheldChanges(repo, before, mainBranch, candidates);
    const couldNotHoldBack = unheld === null ? null : unheld;
    const reason = unheld === null
      ? "the suite is red with every mark this crossing carried held back, and this could not read what else the "
        + "crossing changed — so it cannot say whether the red belongs to this crossing or to canon. Treat it as "
        + "unattributed, not as somebody else's."
      : unheld.length === 0
        ? (rewindableSketchbooks > 0
          ? "the suite is red even with every mark this crossing carried held back, and holding them back returned the "
            + "tree to where the crossing started — so the red is not this crossing's to fix, and no household is "
            + "quarantined for it"
          // THE THIRD CASE. Nothing outside the candidate set moved in the TREE,
          // and the tree is no longer the whole of what a crossing writes. With
          // no sketchbook to rewind, the trial never restored what these
          // candidates came out of, so "the tree came back" is not "the crossing
          // was undone" and the leftover red may still be the crossing's own.
          : `the suite is red with every mark this crossing carried held back, and no mark file outside its candidate `
            + `set changed in the tree — BUT this crossing carried ${candidates.length} candidate(s) out of no `
            + `sketchbook this trial can rewind, so the re-run did not start where the crossing started. Whatever it `
            + `wrote outside this tree was never held back, and this is NOT evidence that the red belongs to canon.`)
        : `the suite is red with every mark this crossing carried held back, BUT ${unheld.length} path(s) this `
          + `crossing changed are not candidates and cannot be held back (first: ${unheld[0]}) — so this is NOT `
          + "evidence that the red belongs to canon. The unattributable set is larger than the candidate set: what "
          + "the sweep UNPUBLISHES removes files that are nobody's candidate, and the fold rewrites the world-state "
          + "beside them. Read the paths below before looking upstream.";
    return {
      attributed: false,
      reason,
      // NAMED, not counted. The whole defect was a sentence that could not be
      // checked against anything; a count would be a second one.
      could_not_hold_back: couldNotHoldBack === null ? null : couldNotHoldBack.slice(0, 40),
      could_not_hold_back_total: couldNotHoldBack === null ? null : couldNotHoldBack.length,
      // The evidence for the sentence above, the same way `could_not_hold_back`
      // is: how many sketchbooks the trial's rewind could actually restore. A
      // zero here beside candidates in hand is what makes "the re-run did not
      // start where the crossing started" a measurement rather than a mood.
      rewound_sketchbooks: rewindableSketchbooks,
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
      // The paths, in the unit's journal beside the sentence that names them.
      // An operator reading `journalctl -u postmark-settlement` at 05:45Z has
      // this and the receipt; a list only in the JSON is a list behind a door.
      if (result.could_not_hold_back?.length) {
        say(`could not hold back ${result.could_not_hold_back_total} path(s): ${result.could_not_hold_back.slice(0, 12).join(", ")}${result.could_not_hold_back_total > 12 ? ` … and ${result.could_not_hold_back_total - 12} more` : ""}`);
      }
      // The other half of the same evidence, in the same journal: a rewind that
      // restored no sketchbook did not put the crossing's sources back, and the
      // sentence above says so. Printed only when it is the finding.
      if (result.rewound_sketchbooks === 0) {
        say("rewound 0 sketchbook(s): this trial restored main and nothing else, so the crossing's own sources were never put back");
      }
      process.exitCode = 1;
    } else {
      say(`attributed in ${result.rounds} trial(s): ${result.quarantined.map((q) => `${q.id} (${q.household})`).join(", ")}`);
    }
  } catch (error) {
    say(`isolation failed: ${String(error?.message ?? error)}`);
    process.exitCode = 1;
  }
}
