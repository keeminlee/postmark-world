#!/usr/bin/env node
// rehearsal-stakes.mjs — THE STAKE PICTURE THE WORLD ITSELF RECORDS.
//
//   node tools/rehearsal-stakes.mjs [--repo <world>] [--out <stakes.json>] [--json]
//
// WHAT THIS IS FOR, AND WHAT IT IS NOT. `tools/settlement-sweep.mjs` requires
// `--stakes`, and on the box that file is a TOWN READ: the crossing derives it
// either from the store (`world2/tools/fold-input-cli.mjs`, whose answer the
// office reshapes into stake rows) or, on the git path, from
// `tools/world-stake.mjs --escrow --json` run inside a pinned clone of the town.
// A world-repo pull request has neither — a `pull_request` job holds a read
// token scoped to THIS repository and nothing else, so the town is out of
// reach by construction, not by omission.
//
// THIS IS NOT A TOWN READ AND MUST NEVER BE CALLED ONE. It reconstructs the
// stake rows from `WORLD/world-state.json` — the fold the LAST CROSSING
// committed into this very tree. `state.portfolios` is written by the fold as
// `{ household: [{ mark, stamps }] }` (marks-fold.mjs § the portfolio), and
// `state.marks[].stamps` is that same arithmetic summed per mark
// (`stamps: stakeByMark.get(mk.id)`), so the two are the same numbers read two
// ways and the reconstruction can be CHECKED rather than trusted. It is.
//
// WHY A WRONG FILE IS WORSE THAN NO REHEARSAL — AND THE CORRECTION THAT FOUND
// THE REAL SHAPE OF IT.
//
// This header's first draft said that handing the sweep `[]` would sweep clean
// and the harm gate would call it GREEN. THAT WAS WRONG, and the counterfactual
// run — a throwaway clone of e3cf2b37 with all 41 sketchbooks and `--stakes []`
// — disproved it. The wrong sentence is left named here rather than quietly
// swapped, because its shape is the tempting one: the reasoning ran forward
// from `(escrow.get(id) ?? 0) > 0` to the unpublish set to the gate's check 3,
// and never asked whether the fold would write at all.
//
//   SWEEP_EXIT=1
//   REFUSING TO WRITE WORLD/world-state.json — it would strip every stamp the
//   world holds.
//     on disk:    325 mark(s) carrying 1778 stamp(s), across 61 portfolio(s)
//     this fold:  no stakes were loaded, so every mark folds at zero escrow
//
// `marks-fold.mjs` carries a STAMPLESS GUARD, and the sweep dies at its fold
// step long before the gate. The all-empty case was never open.
//
// WHAT IS ACTUALLY TRUE IS NARROWER AND SHARPER, AND IT WAS RUN. That guard is
// a TOTAL, not a per-mark check: a stakes file that is merely WRONG rather than
// EMPTY walks straight past it. Escrow is what holds a settlement-published
// commons mark in the world — `settlement-sweep.mjs` unpublishes every registry
// entry of class `commons` sitting at zero. On e3cf2b37 the registry holds 232
// commons publications and 227 stand above zero, each held there by nothing but
// its stake rows.
//
// So a fifth clone was swept with 385 rows instead of 397 — ten staked commons
// marks' rows dropped, total stamps 1728, comfortably past the stampless guard:
//
//   sweep:     exit 0 · 1 published · 7 UNPUBLISHED
//              rei/the-white-flower-at-wrights-door, rei/the-thyme-thank-you,
//              vermillion/lake-caves, vermillion/mouth-one-seventy,
//              vermillion/party-hall, little-bird/a-bowl-at-the-foot-of-the-steps,
//              little-bird/a-pot-on-the-quay-stones
//              (3 of the 10 were held back by the no-stranded-children gate)
//   harm gate: exit 0 · NO HARM · lint ok · moved ok · lost ok · escrow ok
//              (fold stamps 1728, stake rows on standing marks 385) · parcels ok
//              — base e3cf2b373, 1224 mark(s) before, 1218 AFTER
//
// Six marks left the world and every check was green, because the sweep declared
// each removal and check 3 takes the sweep at its word. That is the failure this
// tool exists to make impossible, and it is a run rather than an argument.
//
// So the load-bearing guard below is NOT the non-empty check. It is the
// PER-MARK RECONCILIATION against `marks[].stamps`, in both directions, which
// catches a dropped row, an added one, and a state file that disagrees with
// itself. The non-empty refusal is kept anyway: the fold's own refusal reaches
// a reader as `Command failed` with `phase: "unknown"`, and a named cause on a
// red check is worth more than a second copy of a guard.
//
// This tool REFUSES rather than emit an empty or unreconciled file. Exit 2 is
// "could not derive", which is never a pass — the same grammar the harm gate
// uses, for the same reason.
//
// WHAT IT REPRODUCES, EXACTLY: `n` — the escrow behind each mark, per holder.
// That is every number the sweep branches on (its only other use of a stake row
// is to copy `weight` through at parse time) and every number the harm gate
// reads (check 4 sums `state.marks[].stamps` and counts stake rows naming
// standing marks).
//
// WHAT IT DOES NOT REPRODUCE, SAID PLAINLY: `weight`. A real stake row's weight
// is `n` plus a BREADTH BONUS the town computes from its own k dial
// (marks-fold.mjs:923, `const bonus = (s.weight ?? s.n) - s.n`), and the fold
// records that bonus per MARK (`weight_parts.breadth`), never per row — so it
// cannot be attributed back to the holders it came from without inventing an
// attribution rule. MEASURED on e3cf2b37: 38 of 1224 marks carry a non-zero
// bonus, 255 weight in total. This tool therefore emits `weight = n` and does
// NOT guess. The consequence is bounded and named where it could bite:
// `tools/rehearsal-posture.test.mjs` holds the harm gate to reading no weight
// at all, so the day someone adds a weight-shaped check, that pin goes red
// and this limit is a finding rather than a silent wrong answer.
//
// THE OTHER HONEST LIMIT: these are the stakes as of the last crossing's fold,
// not the town's live escrow. A stamp placed or withdrawn in the town since
// then is not here. That makes the rehearsal's answer "would this tree have
// harmed anyone at the crossing that produced this state", which is the
// question a pull request can actually be asked before it merges.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The named door a refusal leaves by, so a caller never has to parse prose. */
export const DERIVE_REFUSAL_SENTINEL = "REHEARSAL-STAKES-REFUSAL";

/** The holder a restored balancing row is filed under. Not a handle, and shaped so it can never be read as one. */
export const UNATTRIBUTED_HOLDER = "(dropped-from-the-portfolio-book)";

class DeriveRefusal extends Error {}
const refuse = (message) => { throw new DeriveRefusal(message); };

/**
 * The stake rows a world tree records about itself, with the reconstruction
 * checked against the other reading of the same arithmetic.
 *
 * @param {object} state a parsed WORLD/world-state.json
 * @returns {{rows: Array, checked: number, marksWithEscrow: number, totalN: number}}
 */
export function stakesFromState(state, where = "WORLD/world-state.json") {
  if (!state || typeof state !== "object") refuse(`${where}: not a JSON object`);
  const portfolios = state.portfolios;
  if (!portfolios || typeof portfolios !== "object") {
    refuse(`${where} carries no \`portfolios\` object, so this tree does not record who stakes what. `
      + `The fold writes it on every settlement; a state without it is either pre-portfolio or truncated, `
      + `and deriving stakes from it would hand the sweep an empty escrow — see this file's header for what `
      + `an empty stakes file does to 232 commons publications. Refusing.`);
  }
  const marks = Array.isArray(state.marks) ? state.marks : refuse(`${where} carries no \`marks\` array`);

  const rows = [];
  for (const [holder, portfolio] of Object.entries(portfolios)) {
    if (!Array.isArray(portfolio)) refuse(`${where}: portfolios.${holder} is not an array`);
    for (const row of portfolio) {
      const n = Number(row?.stamps);
      if (!Number.isFinite(n)) refuse(`${where}: portfolios.${holder} carries a row with no numeric \`stamps\` (${JSON.stringify(row).slice(0, 120)})`);
      if (n <= 0) continue;                       // the fold already filters these out; a zero row stakes nothing
      if (!row.mark) refuse(`${where}: portfolios.${holder} carries a row with no \`mark\``);
      // `weight: n` — deliberately not a guess at the breadth bonus. See the header.
      rows.push({ holder, mark: row.mark, n, weight: n, tick: 0 });
    }
  }

  // ── THE CHECK THAT MAKES THIS A DERIVATION AND NOT AN ASSERTION ───────────
  // Two readings of one arithmetic must agree on every mark, including the
  // marks at zero: a portfolio row naming a mark the fold scored at 0, or a
  // mark the fold scored above 0 with no portfolio behind it, is a state file
  // that disagrees with itself, and stakes taken from it would be neither the
  // town's nor this tree's.
  //
  // ── THE ONE DISAGREEMENT THAT IS NOT A DEFECT (found by reading the fold,
  // not by hitting it: zero marks on world main e3cf2b37 carry this shape) ───
  //
  // `portfolios` is written with `.filter(([, n]) => n > 0)` (marks-fold.mjs
  // :1439) — a HOLDER whose net on a mark is zero or negative is dropped from
  // the book entirely. `marks[].stamps` keeps that holder's net, because it is
  // `stakeByMark`, the sum over every row. So one holder unstaking below zero on
  // a mark another holder still backs makes the portfolios sum EXCEED the mark's
  // stamps, honestly, in a town doing nothing wrong. An unstake is a negative
  // row — the suite has a test by that name — so this is reachable law, not a
  // corruption.
  //
  // The excess is exactly the dropped holders' net, and it is recoverable as one
  // balancing row, because NOTHING downstream reads a stake row's holder: the
  // sweep indexes escrow by mark (`escrowIndex`), `admissionBase` nets
  // `netByMark`, and the fold sums `stakeByMark`/`weightByMark` by mark. So the
  // escrow the sweep and the gate read comes out EXACT, and the only thing lost
  // is an attribution nothing asks for. It is emitted under a name that cannot
  // be mistaken for a resident.
  //
  // A DEFICIT is the other direction and stays a refusal: dropping rows can only
  // ever remove non-positive amounts, so portfolios can never sum to LESS than
  // the mark's stamps. If it does, the file disagrees with itself and neither
  // reading can be trusted.
  const derived = new Map();
  for (const row of rows) derived.set(row.mark, (derived.get(row.mark) ?? 0) + row.n);
  const disagreements = [];
  const balanced = [];
  const seen = new Set();
  for (const mark of marks) {
    const recorded = Number(mark?.stamps) || 0;
    const reconstructed = derived.get(mark.id) ?? 0;
    seen.add(mark.id);
    if (recorded === reconstructed) continue;
    if (reconstructed > recorded) {
      // a holder the book dropped, restored as one unattributable negative row
      rows.push({ holder: UNATTRIBUTED_HOLDER, mark: mark.id, n: recorded - reconstructed, weight: recorded - reconstructed, tick: 0 });
      derived.set(mark.id, recorded);
      balanced.push(`${mark.id}: ${reconstructed - recorded} of net unstake dropped from the book, restored`);
      continue;
    }
    disagreements.push(`${mark.id}: marks[].stamps ${recorded}, portfolios sum ${reconstructed} — a DEFICIT, which dropping non-positive holder rows cannot produce`);
  }
  for (const [mark, n] of derived) if (!seen.has(mark)) disagreements.push(`${mark}: portfolios sum ${n}, and no mark in the fold carries that id`);
  if (disagreements.length) {
    refuse(`${where} disagrees with itself on ${disagreements.length} mark(s): the portfolios and the per-mark stamps are `
      + `the same arithmetic written twice and they do not match, so neither can be taken as this tree's escrow. `
      + `First: ${disagreements.slice(0, 5).join(" · ")}${disagreements.length > 5 ? ` … and ${disagreements.length - 5} more` : ""}. Refusing.`);
  }

  const totalN = rows.reduce((a, r) => a + r.n, 0);
  if (!rows.length || totalN === 0) {
    refuse(`${where} records no escrow at all (${rows.length} row(s), ${totalN} stamp(s)). A stakes file of zero rows is `
      + `NOT "a quiet town" to the sweep: every settlement-published commons mark reads as unstaked and becomes an `
      + `unpublish candidate, and the harm gate calls that no harm because the sweep declared it. Refusing rather `
      + `than rehearsing a crossing that empties the commons.`);
  }

  return { rows, checked: marks.length, marksWithEscrow: derived.size, totalN, balanced };
}

export function deriveRehearsalStakes(repo) {
  const statePath = join(repo, "WORLD", "world-state.json");
  if (!existsSync(statePath)) {
    refuse(`${statePath} does not exist — this tree carries no fold, so it records no escrow and no stakes can be `
      + `derived from it. Refusing.`);
  }
  let state;
  try { state = JSON.parse(readFileSync(statePath, "utf8")); }
  catch (e) { refuse(`WORLD/world-state.json is unreadable: ${e.message}`); }
  return stakesFromState(state);
}

function main(argv) {
  const opt = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const repo = resolve(opt("--repo", join(HERE, "..")));
  const out = opt("--out");
  let derived;
  try {
    derived = deriveRehearsalStakes(repo);
  } catch (error) {
    console.error(`rehearsal-stakes: could not derive — ${String(error?.message ?? error)}`);
    console.error(`${DERIVE_REFUSAL_SENTINEL} ${JSON.stringify({ cause: String(error?.message ?? error), repo })}`);
    process.exit(2);
  }
  const text = JSON.stringify(derived.rows, null, 1) + "\n";
  if (out) writeFileSync(resolve(out), text); else if (!argv.includes("--json")) process.stdout.write(text);
  console.error(`rehearsal-stakes: ${derived.rows.length} row(s), ${derived.totalN} stamp(s) across ${derived.marksWithEscrow} mark(s); `
    + `reconciled against all ${derived.checked} mark(s) in the fold. NOT a town read — the stake picture this tree's own last crossing committed.`);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      rows: derived.rows.length, stamps: derived.totalN, marks_with_escrow: derived.marksWithEscrow,
      marks_reconciled: derived.checked, source: "WORLD/world-state.json", town_read: false,
      ...(out ? { out: resolve(out) } : {}),
    }, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2));
