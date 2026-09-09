#!/usr/bin/env node
// unstaked-return — the 2026-09-16 move, on the GIT record.
//
// THE LAW. Town PSA of 2026-09-09, which enforces town #1990 and the founder's
// ruling of 2026-08-28, quoted so this file carries the sentence it is:
//
//   "On 2026-09-16, at the morning crossing (05:45Z, 01:45 ET), every commons
//    mark with no stake behind it returns to its household's drafts. Nothing is
//    deleted and nothing is judged: a draft is yours, the town no longer sees
//    it, and it comes back the moment you stake it."
//
//   "A further 150 stand on residents' OWN ground, a home or a parcel; the law
//    lets your own ground carry a zero, and those stand."
//
//   "The town's own ground is the town's to stake."
//
// THE SET, in the fold's own terms:  S = { m : m.by !== "the-town"
//                                            AND NOT m.sovereign
//                                            AND m.stamps === 0
//                                            AND m.weight  === 0 }
// `sovereign` is the fold's geometric flag (marks-fold.mjs § sovereignty: a
// sited mark fully inside its OWN household's parcel). It is not a field anyone
// writes, which is why this tool re-derives it rather than reading it.
//
// THE SET IS RE-MEASURED, NEVER READ FROM A LIST. Residents will stake between
// the announcement and the crossing; the whole point of the week is that the
// set shrinks. So this tool folds the tree at run time and takes S from that
// fold. There is no stored manifest and there must never be one.
//
// ── WHAT THIS TOOL DOES NOT DO, AND WHY ─────────────────────────────────────
//
// IT DOES NOT MOVE A MARK'S DIRECTORY. `WORLD/marks/` is a PLACEMENT tree, not
// a household tree: `aion-solare/aelyria` lives at
// `WORLD/marks/let-there-be-light/aelyria/` because it is placed inside the
// town's world-root region, and its children sit inside it. Measured at
// origin/main d38a5f7: 79 of the marks in S have descendants that are NOT in S
// — 276 of them, including town-owned region rings and staked marks. Moving a
// directory would carry every one of those off main. So the move is FILE-level:
// the mark's own files leave, its child directories stay exactly where they are.
//
// IT REFUSES TO GUESS A DESTINATION BRANCH. The sketchbooks on origin are named
// `draft/<github-login>` (`draft/Darkelf381`, `draft/lupi-agent`), while the
// fold's household is a town slug (`lupi`, `keith`). The two vocabularies are
// nearly disjoint: of the 75 households in S at d38a5f7, exactly one matches a
// branch by name. The map that joins them is `WORLD/households.json`
// (`households`: slug -> gh:<id>|login:<name>; `logins`: login -> gh:<id>), and
// this tool walks it. Where it cannot, the household is SKIPPED and named in the
// receipt — never guessed, and never silently dropped.
//
// ── THE GATE THAT MATTERS MOST ──────────────────────────────────────────────
//
// WITHOUT A STAKES FILE EVERY COMMONS MARK LOOKS UNSTAKED. `marks-fold.mjs`
// folds with zero escrow when no `--stakes` is given — honest for a world that
// holds none, catastrophic here: the set would swell from 270 to every
// non-sovereign commons mark in the world. This tool therefore REFUSES to run
// without `--stakes`, and `--allow-stampless` is the only way past it, for
// tests that mean it. The stakes file is the town's, derived by the town's own
// parser:
//
//   (in a town clone)  node tools/world-stake.mjs --escrow --json > stakes.json
//   (here)             node tools/unstaked-return.mjs --stakes stakes.json
//
// ── CONSUMERS (who reads what this changes) ─────────────────────────────────
//
//   tools/marks-fold.mjs        — the fold; drops the moved marks next run
//   WORLD/world-state.json      — the artifact the site's world page reads
//   the doorstep's standing segment — "what you hold on the World"
//   the keeper's crossing receipt — settlement-auto.sh's six channels
//   the store crossing          — world2/tools/unstaked-return-store.mjs (office)
//
// Usage:
//   node tools/unstaked-return.mjs --stakes stakes.json            # dry run
//   node tools/unstaked-return.mjs --stakes stakes.json --apply
//   node tools/unstaked-return.mjs --stakes stakes.json --receipt r.json
//   flags: --allow-stampless  fold with zero escrow on purpose (tests only)
//          --allow-reparent   proceed despite silent re-parenting (below)
//          --marks-dir <d>    fold a different tree (rehearsal clones)
//          --json             print the receipt to stdout instead of prose
//
// ── THE RE-PARENT HAZARD ────────────────────────────────────────────────────
//
// `walkMarks` gives a nested predicated/naming/class mark its parent FROM THE
// ENCLOSING DIRECTORY. Remove a parent's `mark.md` and the directory still
// exists, so its predicated children bind to the GRANDPARENT instead — silently,
// with no error, still standing, now predicating something their author never
// named. One mark is in this position at d38a5f7
// (`sol-of-garrison/rootlight-den-welcome`, under `lupi/the-rootlight-den-parcel`).
// The tool names every such mark and refuses without `--allow-reparent`.
//
// Sited/parcel children are not exposed to this: their parent is geometric, so
// they keep standing and only their `placementParent` re-computes (101 marks at
// d38a5f7). That is a fold output changing, not a mark changing hands, and it is
// reported rather than gated.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, realpathSync, rmSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { loadMarks, fold, rect, contains } from "./marks-fold.mjs";
import { REGION_SLUGS } from "./region-outsiders.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** The set predicate, in one place, so the falsifiers read the same rule the
 *  move does. Exported, which is why it must be reachable WITHOUT running the
 *  tool — hence the CLI guard at the tail rather than a bare script body. */
export const isUnstakedCommons = (m) =>
  m.by !== "the-town" && !m.sovereign && !(m.stamps > 0) && !(m.weight > 0);

/**
 * THE FOUNDER'S TWO EXEMPTIONS (Keemin, 2026-09-09, after the PSA).
 * Returns the receipt's skip reason, or null if the mark is not exempt.
 *
 *   (1) "constitution tier marks need no stamps" — every mark whose record
 *       carries `tier: constitution` (the LOGOS class/law nodes and the
 *       predicated law rows under them, WHOEVER OWNS THEM) is never in the set.
 *   (2) The town mints 77 stamps onto every region ring before 09-16, so the
 *       thirteen rings are never in the set either — resident-founded or not.
 *
 * ── WHY THE AUTHORED TIER AND NOT THE MARK'S OWN `tier` FIELD ───────────────
 *
 * The fold's published `tier` is the DERIVED STANDING, not the line the record
 * carries — marks-fold.mjs says so where it builds the projection — and
 * `markStanding` returns "constitution" ONLY when `by === the-town`:
 *
 *     if ((mark.by ?? mark.household) === TOWN && mark.tier === "constitution")
 *       return "constitution";
 *
 * Everything else walks the ground chain and comes out "home" or "market". So
 * reading the projected field would make exemption (1) a rule that can NEVER
 * FIRE for the exact case the ruling names — a resident-authored law node —
 * while looking correct on every town-owned row, which the town rule already
 * excluded anyway. The authored tier is passed in from the loaded record.
 *
 * ── WHY THE REGION ROSTER IS IMPORTED AND NOT LISTED ────────────────────────
 *
 * `REGION_SLUGS` in region-outsiders.mjs is the thirteen, already frozen and
 * already the roster the atlas and the outsiders view read. A second copy here
 * would be a fourteenth region waiting to happen.
 */
export function exemptionFor(mark, { authoredTier = undefined } = {}) {
  const tier = authoredTier !== undefined ? authoredTier : mark?.authored_tier;
  if (tier === "constitution") return "constitution-tier: law needs no stake";
  const leaf = String(mark?.id ?? "").split("/").slice(1).join("/");
  if (REGION_SLUGS.includes(leaf)) return "region: the town's founding stake";
  return null;
}

// ── the CLI guard (the realpath idiom, wright/cli-guard-sweep) ──────────────
// An entry path that reaches this file through a Windows junction realpaths in
// the ESM loader and does not in `argv[1]`, so a URL compare alone makes a tool
// exit 0 having done nothing. Compare real paths; the URL compare is only the
// fallback for an argv[1] that cannot be realpath'd.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch {
    try { return pathToFileURL(process.argv[1]).href === import.meta.url; }
    catch { return basename(process.argv[1] ?? "") === "unstaked-return.mjs"; }
  }
})();
if (!isMain) { /* imported for `isUnstakedCommons` — the move does not run */ }
else main();

function main() {

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(n);

const APPLY = has("--apply");
const JSON_OUT = has("--json");
const ALLOW_STAMPLESS = has("--allow-stampless");
const ALLOW_REPARENT = has("--allow-reparent");
const HOLD_OCCUPIED = has("--hold-occupied-parcels");
const MARKS_DIR = opt("--marks-dir", join(ROOT, "WORLD/marks"));
const TERRAIN = opt("--terrain", join(ROOT, "WORLD/skeleton.json"));
const HOUSEHOLDS = opt("--households", join(ROOT, "WORLD/households.json"));
const STAKES = opt("--stakes", null);
const RECEIPT = opt("--receipt", null);
const REPO = opt("--repo", ROOT);

const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
// `stdio: pipe` on the quiet form so a probe for a ref that does not exist stays
// a probe: without it every "Needed a single revision" from a household that has
// no sketchbook yet prints to the console and reads as 49 failures during a run
// that is working exactly as intended.
const gitQ = (...a) => {
  try { return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim(); }
  catch { return null; }
};

// ── the stamp gate ──────────────────────────────────────────────────────────
if (!STAKES && !ALLOW_STAMPLESS) {
  console.error(
    "unstaked-return: refusing to run without --stakes.\n" +
    "  A fold with no stakes file reads EVERY commons mark as unstaked, so the\n" +
    "  return set would swell from the marks that truly carry nothing to every\n" +
    "  non-sovereign commons mark in the world. Derive the file in a town clone:\n" +
    "    node tools/world-stake.mjs --escrow --json > stakes.json\n" +
    "  --allow-stampless is for tests that mean a zero-escrow world.");
  process.exit(2);
}

// ── re-measure: fold the tree as it stands right now ────────────────────────
const loaded = loadMarks(MARKS_DIR);
const dirOf = new Map();
// The AUTHORED tier, kept from the record before the fold projects over it —
// see `exemptionFor` for why the published `tier` is the wrong field to read.
const authoredTier = new Map();
for (const rec of loaded) if (rec.id != null) { dirOf.set(rec.id, rec._dir); authoredTier.set(rec.id, rec.tier); }

const stakes = STAKES ? JSON.parse(readFileSync(STAKES, "utf8")).map((s) => ({
  tick: s.tick ?? 0, holder: s.holder, mark: s.mark, n: s.n,
  weight: Number.isFinite(s.weight) ? s.weight : s.n,
})) : [];
const terrain = existsSync(TERRAIN) ? JSON.parse(readFileSync(TERRAIN, "utf8")) : null;
const households = existsSync(HOUSEHOLDS) ? JSON.parse(readFileSync(HOUSEHOLDS, "utf8")) : {};
// THE GRAIN THE FOLD WANTS IS THE INNER OBJECT, and the difference is not
// cosmetic. `marks-fold.mjs`'s own CLI reads `JSON.parse(...).households ?? null`
// (§ the household registry); handing it the whole FILE instead makes every
// handle its own household, which changes the credential a parcel is held
// under — so sovereignty and the breadth term both come out wrong. Measured on
// this tree: the whole-file form moved three marks that the canonical fold
// keeps (`sage-reeves/the-high-ground` and `sol-of-garrison/vanguards-watchtower`
// carry weight with no stamps of their own — the breadth bonus — and
// `rook-of-garrison/vanguards-watchtower` folds sovereign). One vocabulary,
// read the way the fold reads it.
const state = fold({ marks: loaded, terrain, stakes, households: households.households ?? null });

const all = state.marks ?? [];
const byId = new Map(all.map((m) => [m.id, m]));

// ── THE PARCEL CASCADE, and the flag that answers it ────────────────────────
//
// A parcel IS the ground the fold's sovereignty is measured against: a mark is
// sovereign because it sits fully inside its own household's parcel. So a
// parcel that returns to drafts takes that ground with it, and every mark that
// was standing on it becomes a commons mark at zero — swept by this very move
// on the NEXT crossing.
//
// Measured on the rehearsal at 91b4b5e5: 74 of the 270 marks in the set are
// parcels; returning them re-folds 141 previously-sovereign marks straight into
// the set. That is the PSA's own promise — "a further 150 stand on residents'
// OWN ground ... and those stand" — coming apart one crossing later.
//
// 73 of those 74 parcels carry sovereign marks; exactly one is empty. So this
// is a founder's call, not a tuning knob, and the tool does not make it: the
// DEFAULT stays faithful to the law as written (an unstaked commons mark
// returns, parcel or not) and the cascade is REPORTED loudly every run.
// `--hold-occupied-parcels` is the other answer, ready for the day it is ruled:
// a parcel returns only if nothing of its household's still stands on it.
const held = [];
if (HOLD_OCCUPIED) {
  for (const p of all) {
    if (p.kind !== "parcel" || !isUnstakedCommons(p)) continue;
    const standing = all.filter((m) => m.id !== p.id && m.household === p.household
      && m.sovereign && contains(rect(p), rect(m)));
    if (standing.length) held.push({ parcel: p.id, household: p.household, standing: standing.length });
  }
}
const heldIds = new Set(held.map((h) => h.parcel));
const exemptOf = (m) => exemptionFor(m, { authoredTier: authoredTier.get(m.id) });
const S = all.filter((m) => isUnstakedCommons(m) && !heldIds.has(m.id) && !exemptOf(m));
const Sids = new Set(S.map((m) => m.id));

// ── destination branches: households.json is the only map, and it is walked ──
const keyOfHousehold = households.households ?? {};
const keyOfLogin = households.logins ?? {};
const loginsOfKey = new Map();
for (const [login, key] of Object.entries(keyOfLogin)) {
  if (!loginsOfKey.has(key)) loginsOfKey.set(key, []);
  loginsOfKey.get(key).push(login);
}
const existingBranches = new Set(
  (gitQ("for-each-ref", "--format=%(refname:short)", "refs/heads/draft", "refs/remotes/origin/draft") ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => l.replace(/^origin\//, "").replace(/^draft\//, "")));

function branchFor(household) {
  const key = keyOfHousehold[household];
  if (key) {
    const cands = key.startsWith("login:") ? [key.slice("login:".length)] : (loginsOfKey.get(key) ?? []);
    for (const c of cands) if (existingBranches.has(c)) return { branch: c, how: "registry", existed: true };
    if (cands.length) return { branch: cands[0], how: "registry", existed: false };
  }
  if (existingBranches.has(household)) return { branch: household, how: "name", existed: true };
  // No login for this household anywhere in the registry. The drain names a
  // sketchbook after a GITHUB LOGIN and this household has none, so there is no
  // honest name to create one under either.
  return null;
}

// ── the move plan ───────────────────────────────────────────────────────────
const moved = [], skipped = [], reparents = [], shifts = [];

let exemptCount = 0;
for (const m of all) {
  if (Sids.has(m.id)) continue;
  // The founder's exemptions are read FIRST, so a law node or a region ring is
  // named in the receipt as what it is rather than as "town-owned" or "staked",
  // which would be true of some of them and would hide the ruling behind a
  // coincidence.
  const ex = exemptOf(m);
  if (ex) { skipped.push({ mark: m.id, household: m.household, why: ex }); exemptCount++; continue; }
  if (m.by === "the-town") skipped.push({ mark: m.id, household: m.household, why: "town-owned — the town's own ground is the town's to stake" });
  else if (m.sovereign) skipped.push({ mark: m.id, household: m.household, why: "sovereign — on the household's own ground, where the law lets a zero stand" });
  else skipped.push({ mark: m.id, household: m.household, why: `staked — stamps ${m.stamps ?? 0}, weight ${m.weight ?? 0}` });
}

const dirRel = (d) => relative(ROOT, d).split("\\").join("/");

for (const m of S) {
  const dir = dirOf.get(m.id);
  if (!dir) { skipped.push({ mark: m.id, household: m.household, why: "no directory in the tree — the fold saw it, the tree does not" }); continue; }
  const dest = branchFor(m.household);
  if (!dest) {
    skipped.push({ mark: m.id, household: m.household, why: "no sketchbook branch and no login in WORLD/households.json to name one after" });
    continue;
  }
  // the mark's OWN files: everything in its directory that is not a directory.
  const own = readdirSync(dir).filter((e) => !statSync(join(dir, e)).isDirectory())
    .map((e) => `${dirRel(dir)}/${e}`);
  // children that STAY, and what happens to them
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (!statSync(p).isDirectory()) continue;
    const child = loaded.find((r) => r._dir === p);
    if (!child || Sids.has(child.id)) continue;      // it leaves too, or holds no mark
    const cm = byId.get(child.id);
    if (!cm) continue;
    if (cm.kind === "predicated" || cm.kind === "naming" || cm.kind === "class") {
      reparents.push({ child: cm.id, kind: cm.kind, by: cm.by, losing: m.id, path: dirRel(p) });
    } else {
      shifts.push({ child: cm.id, kind: cm.kind, losing: m.id });
    }
  }
  moved.push({
    mark: m.id, household: m.household, kind: m.kind, why: "unstaked-commons",
    dir: dirRel(dir), files: own, branch: `draft/${dest.branch}`,
    branch_existed: dest.existed, branch_how: dest.how,
  });
}

// ── the cascade, measured rather than assumed ───────────────────────────────
// Fold the tree again WITHOUT the marks that are leaving and ask what the set
// looks like then. Anything newly in it was standing before this move and is
// not standing after — the ground it stood on left with the move. This is the
// check that can fail: if the move were self-contained the answer is an empty
// list, and on today's tree it is not.
const movedIds = new Set(moved.map((m) => m.mark));
let cascade = [];
if (movedIds.size) {
  const after = fold({
    marks: loaded.filter((r) => !movedIds.has(r.id)),
    terrain, stakes, households: households.households ?? null,
  });
  // A HELD parcel is deliberately left in the set-but-not-moved, so it is not a
  // consequence of the move and must not be reported as one — without this the
  // hold flag "discovers" the 73 parcels it just chose to keep. A mark EXEMPT by
  // the founder's ruling is the same shape of false positive: the six unstaked
  // region rings read as a cascade of six the move did not cause, which is how
  // this was found (140 -> 146 the moment the exemptions landed).
  cascade = (after.marks ?? []).filter((m) => isUnstakedCommons(m)
      && !movedIds.has(m.id) && !Sids.has(m.id) && !heldIds.has(m.id) && !exemptOf(m))
    .map((m) => ({
      mark: m.id, household: m.household, kind: m.kind,
      was: byId.get(m.id)?.sovereign ? "sovereign — it stood on its household's own ground"
        : `standing with weight ${byId.get(m.id)?.weight ?? 0}`,
    }));
}

const receipt = {
  tool: "unstaked-return", record: "git", law: "town PSA 2026-09-09; town #1990; founder's ruling 2026-08-28",
  measured_at: new Date().toISOString(),
  repo_head: gitQ("rev-parse", "HEAD"),
  marks_dir: dirRel(MARKS_DIR),
  stakes_file: STAKES, stampless: !STAKES,
  totals: {
    marks_folded: all.length,
    returning: moved.length,
    returning_households: new Set(moved.map((m) => m.household)).size,
    skipped: skipped.length,
    set_size_before_branch_resolution: S.length,
    reparent_hazards: reparents.length,
    placement_parent_shifts: shifts.length,
    parcels_held_occupied: held.length,
    cascade_next_crossing: cascade.length,
    exempt_by_ruling: exemptCount,
    exempt_constitution: skipped.filter((s) => s.why.startsWith("constitution-tier")).length,
    exempt_region: skipped.filter((s) => s.why.startsWith("region:")).length,
  },
  moved, skipped, reparents, shifts, held, cascade,
  applied: false,
};

// ── the gate on silent re-parenting ─────────────────────────────────────────
if (reparents.length && !ALLOW_REPARENT) {
  if (JSON_OUT) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.error(`unstaked-return: ${reparents.length} mark(s) would silently change parent and keep standing:`);
    for (const r of reparents) console.error(`  ${r.child} (${r.kind}, ${r.by}) loses ${r.losing} and binds to its grandparent — ${r.path}`);
    console.error("Each is a mark still on the commons that would begin predicating something its author never named.");
    console.error("Settle them first, or pass --allow-reparent having decided that is the right answer.");
  }
  if (RECEIPT) writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  process.exit(3);
}

// ── apply ───────────────────────────────────────────────────────────────────
if (APPLY) {
  const byBranch = new Map();
  for (const mv of moved) {
    if (!byBranch.has(mv.branch)) byBranch.set(mv.branch, []);
    byBranch.get(mv.branch).push(mv);
  }
  const head = git("rev-parse", "HEAD");
  const stamp = new Date().toISOString();
  const receiptNote = RECEIPT ? ` Receipt: ${RECEIPT}.` : "";

  // 1. each sketchbook gains the marks, built with plumbing so no checkout is
  //    needed and no working tree is ever left half-moved.
  for (const [branch, items] of byBranch) {
    const ref = `refs/heads/${branch}`;
    const base = gitQ("rev-parse", "--verify", `${ref}^{commit}`)
      ?? gitQ("rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`);
    const idx = join(REPO, ".git", `unstaked-return-index-${branch.replace(/[^A-Za-z0-9]/g, "_")}`);
    const env = { ...process.env, GIT_INDEX_FILE: idx };
    const g = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", env, maxBuffer: 1 << 28 }).trim();
    g("read-tree", base ? `${base}^{tree}` : "--empty");
    for (const mv of items) {
      for (const f of mv.files) {
        const blob = git("hash-object", "-w", f);
        g("update-index", "--add", "--cacheinfo", `100644,${blob},${f}`);
      }
    }
    const tree = g("write-tree");
    const msg = `unstaked return 2026-09-16: ${items.length} mark(s) come home to drafts\n\n` +
      `A mark on the commons stands only with a stake behind it (town #1990; the\n` +
      `founder's ruling of 2026-08-28; the PSA of 2026-09-09). These carried\n` +
      `nothing at the crossing, so they return here — nothing is deleted, and a\n` +
      `stake brings any of them back.\n\n` +
      items.map((i) => `  ${i.mark} (${i.kind})`).join("\n") + "\n" + receiptNote + "\n\n" +
      `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\n` +
      `Claude-Session: https://claude.ai/code/session_01PDJ7RsS1Mykj4YMnBhphy4\n`;
    const commit = base
      ? execFileSync("git", ["-C", REPO, "commit-tree", tree, "-p", base, "-m", msg], { encoding: "utf8" }).trim()
      : execFileSync("git", ["-C", REPO, "commit-tree", tree, "-m", msg], { encoding: "utf8" }).trim();
    git("update-ref", ref, commit);
  }

  // 2. main loses exactly the mark files, and nothing else.
  const files = moved.flatMap((m) => m.files);
  if (files.length) {
    const idx = join(REPO, ".git", "unstaked-return-index-main");
    const env = { ...process.env, GIT_INDEX_FILE: idx };
    const g = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", env, maxBuffer: 1 << 28 }).trim();
    g("read-tree", `${head}^{tree}`);
    for (const f of files) g("update-index", "--force-remove", f);
    const tree = g("write-tree");
    const hh = new Set(moved.map((m) => m.household));
    const msg = `unstaked return 2026-09-16: ${moved.length} commons mark(s) across ${hh.size} household(s) return to drafts\n\n` +
      `The town's economy law has said it since #1990 and the founder ruled it\n` +
      `plainly on 2026-08-28: a mark on the commons stands only with a stake\n` +
      `behind it. The founding era published marks at zero and they stood that\n` +
      `way; the PSA of 2026-09-09 gave the town a week's notice that at this\n` +
      `crossing they come home.\n\n` +
      `Nothing is deleted. Each mark's files now live on its household's\n` +
      `sketchbook branch and a stake puts it back on the commons, which is the\n` +
      `same act as any new mark.\n\n` +
      `Marks on residents' own ground stand (the fold's sovereign flag), and the\n` +
      `town's own ground is the town's to stake — both excluded by the predicate,\n` +
      `both counted in the receipt.\n\n` +
      `Child directories were left where they are: WORLD/marks is a placement\n` +
      `tree, and a directory move would have carried marks that are staying.\n` +
      receiptNote + "\n\n" +
      `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\n` +
      `Claude-Session: https://claude.ai/code/session_01PDJ7RsS1Mykj4YMnBhphy4\n`;
    const commit = execFileSync("git", ["-C", REPO, "commit-tree", tree, "-p", head, "-m", msg], { encoding: "utf8" }).trim();
    git("update-ref", "HEAD", commit, head);
    // The REAL index still holds the old tree — the commit above was built in a
    // scratch one — so without this `git status` reports 246 deletions that have
    // already been committed, and the next hand to touch the repo sees a dirty
    // tree it did not make.
    git("read-tree", commit);

    // 3. THE WORKING TREE FOLLOWS THE COMMIT, and this step is not tidiness.
    //    The move above is pure plumbing — it writes trees and refs and never
    //    touches a file on disk. The SET IS RE-MEASURED BY FOLDING THE TREE ON
    //    DISK, so a run that leaves those files sitting there re-measures the
    //    same marks on the next run and moves them a second time. That is what
    //    happened on the first rehearsal: two applies, 246 marks moved twice,
    //    and a "second dry run reports 0" check that would have read 246.
    //    Deleting them here is what makes the tool idempotent and what makes the
    //    idempotence check able to fail.
    for (const f of files) { try { rmSync(join(REPO, f), { force: true }); } catch { /* already gone */ } }
    // A directory that is now completely empty was the mark and nothing else, so
    // it goes. One that still holds child directories STAYS — those are other
    // marks' homes and the whole point of the file-level move.
    for (const mv of moved) {
      const d = join(REPO, mv.dir);
      try { if (existsSync(d) && readdirSync(d).length === 0) rmSync(d, { recursive: true, force: true }); } catch { /* leave it */ }
    }
  }
  receipt.applied = true;
  receipt.applied_at = stamp;
  receipt.new_head = gitQ("rev-parse", "HEAD");
}

if (RECEIPT) writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");

if (JSON_OUT) { console.log(JSON.stringify(receipt, null, 2)); process.exit(0); }

const t = receipt.totals;
console.log(`unstaked-return · ${APPLY ? "APPLIED" : "dry run"} · ${receipt.marks_dir} @ ${(receipt.repo_head ?? "").slice(0, 8)}`);
console.log(`  folded ${t.marks_folded} marks with ${stakes.length} stake row(s)${STAKES ? "" : "  ⚠ ZERO ESCROW"}`);
console.log(`  returning to drafts: ${t.returning} mark(s) across ${t.returning_households} household(s)`);
console.log(`  set before branch resolution: ${t.set_size_before_branch_resolution}`);
console.log(`  staying: ${t.skipped} (town-owned, sovereign, or staked — each named in the receipt)`);
console.log(`  exempt by the founder's ruling of 2026-09-09: ${t.exempt_by_ruling} (${t.exempt_constitution} constitution-tier, ${t.exempt_region} region rings)`);
if (t.placement_parent_shifts) console.log(`  ${t.placement_parent_shifts} sited/parcel child(ren) keep standing with a re-computed placementParent`);
if (t.parcels_held_occupied) console.log(`  ${t.parcels_held_occupied} parcel(s) HELD by --hold-occupied-parcels — marks of their household still stand on them`);
if (t.cascade_next_crossing) {
  console.log(`  ⚠ CASCADE: ${t.cascade_next_crossing} mark(s) standing today would enter the set once this move lands.`);
  const sov = cascade.filter((c) => c.was.startsWith("sovereign")).length;
  if (sov) console.log(`     ${sov} of them are sovereign now — their household's parcel is returning, so their ground goes with it.`);
  console.log(`     The PSA promises those marks stand. --hold-occupied-parcels is the other reading; this is a founder's call.`);
}
if (t.reparent_hazards) console.log(`  ⚠ ${t.reparent_hazards} re-parent hazard(s) allowed through by --allow-reparent`);
const noBranch = skipped.filter((s) => s.why.startsWith("no sketchbook branch"));
if (noBranch.length) console.log(`  ⚠ ${noBranch.length} mark(s) have no nameable sketchbook and did NOT move`);
if (RECEIPT) console.log(`  receipt: ${RECEIPT}`);
if (!APPLY) console.log("  (dry run — nothing was written; pass --apply to perform the move)");

}   // main

