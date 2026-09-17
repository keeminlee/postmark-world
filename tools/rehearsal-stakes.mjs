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
// WHY A FAKED FILE IS WORSE THAN NO REHEARSAL. The obvious shortcut — hand the
// sweep `[]` — is the trap this tool exists to close. Escrow is what holds a
// settlement-published commons mark in the world: `settlement-sweep.mjs`
// unpublishes every registry entry of class `commons` sitting at zero
// (`(escrow.get(id) ?? 0) > 0` → continue). MEASURED on world main e3cf2b37:
// the registry holds 232 commons publications, of which 5 stand at zero under
// the real stakes and 232 stand at zero under an empty file. And the harm gate
// would call that GREEN: the sweep DECLARES those unpublishes, so check 3
// (`lost`) is satisfied by its own word, and check 4 (`escrow`) skips its
// stampless arm because zero stake rows name a standing mark. A rehearsal that
// fakes the stakes does not merely mis-measure; it reports no harm while
// modelling the removal of 227 marks that no one asked to remove.
//
// So this tool REFUSES rather than emit an empty or unverifiable file. Exit 2
// is "could not derive", which is never a pass — the same grammar the harm
// gate uses, for the same reason.
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
  const derived = new Map();
  for (const row of rows) derived.set(row.mark, (derived.get(row.mark) ?? 0) + row.n);
  const disagreements = [];
  const seen = new Set();
  for (const mark of marks) {
    const recorded = Number(mark?.stamps) || 0;
    const reconstructed = derived.get(mark.id) ?? 0;
    seen.add(mark.id);
    if (recorded !== reconstructed) disagreements.push(`${mark.id}: marks[].stamps ${recorded}, portfolios sum ${reconstructed}`);
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

  return { rows, checked: marks.length, marksWithEscrow: derived.size, totalN };
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
