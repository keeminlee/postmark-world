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
//        ^ SUPERSEDED 2026-09-09 18:56 EDT: "exempt all the town's own marks, no
//          mint." The town does not stake its own furniture; it is exempt. The
//          sentence is kept here because the PSA is quoted verbatim and the
//          reversal should be visible, not tidied away — but it is not the law
//          this tool enforces. See `exemptionFor` clause 4.
//
// THE SET, in the fold's own terms:  S = { m : m.by !== "the-town"
//                                            AND NOT m.sovereign
//                                            AND m.stamps === 0
//                                            AND m.weight  === 0
//                                            AND NOT exempt (below) }
// `sovereign` is the fold's geometric flag (marks-fold.mjs § sovereignty: a
// sited mark fully inside its OWN household's parcel). It is not a field anyone
// writes, which is why this tool re-derives it rather than reading it.
//
// THE THREE EXEMPTIONS the founder ruled on 2026-09-09, each carrying its own
// receipt reason and none of them reachable by a flag: constitution-tier law
// nodes, the thirteen region rings, and EVERY PARCEL. See `exemptionFor`.
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
// SINCE PARCELS BECAME EXEMPT that one hazard is gone: it existed only because
// `lupi/the-rootlight-den-parcel` was leaving. The gate stays, because the next
// tree is not this tree.
//
// SITED/PARCEL CHILDREN ARE EXPOSED TO SOMETHING WORSE, and this file said the
// opposite until lap 4. It read: "their parent is geometric, so they keep
// standing and only their placementParent re-computes ... a fold output changing,
// not a mark changing hands". THAT IS FALSE. A nested mark's `at:` is an OFFSET
// from its framing parent's centre, so when the parent leaves the child does not
// merely re-parent — IT MOVES. `rei/the-garden-notebook-tin` travels 250 m east
// and 188 m south and stops being sovereign; under
// `limen/footpath-becomes-a-suggestion`, `hal/the-green-lamp-house` and its
// parcel travel 1,042 m. A mark that stood on its household's own ground one
// crossing and stands on the commons at zero the next HAS changed hands, without
// its author touching it.
//
// SO NOTHING IS HELD AND NOTHING MOVES. The apply rewrites each staying
// descendant's `at:` to the offset from its NEW frame that yields the SAME world
// coordinate — the fold's own arithmetic run backwards. Holding the parents
// instead would have fixed only the sovereignty flip, left the other children
// relocated, and kept unstaked marks standing, which weakens the rule.

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
  !m.sovereign && !(m.stamps > 0) && !(m.weight > 0);
// THE TOWN CLAUSE IS NOT HERE ANY MORE, and its absence is the point. It used to
// sit in this predicate as `m.by !== "the-town"` — an incidental filter that
// happened to be true. The founder ruled it a LAW on 2026-09-09 ("exempt all the
// town's own marks, no mint"), so it lives in `exemptionFor` with the other
// three, where it has a receipt reason of its own and a falsifier that reds when
// it is removed. Left in both places it would be a rule no flip could disprove.

/**
 * THE FOUNDER'S TWO EXEMPTIONS (Keemin, 2026-09-09, after the PSA).
 * Returns the receipt's skip reason, or null if the mark is not exempt.
 *
 *   (1) "constitution tier marks need no stamps" — every mark whose record
 *       carries `tier: constitution` (the LOGOS class/law nodes and the
 *       predicated law rows under them, WHOEVER OWNS THEM) is never in the set.
 *   (2) The town mints 77 stamps onto every region ring before 09-16 (the
 *       founding act at town main e1415f207), so the thirteen rings are never
 *       in the set either — resident-founded or not.
 *   (3) "PARCELS NEED NO STAKING EITHER" (~18:1x EDT). Every mark of kind
 *       `parcel` is exempt. The founder's doctrine of 09-09 affords the first
 *       144 households up to three parcels, and an AFFORDED thing needs no
 *       stake to stand.
 *
 * (3) ARRIVED AS A FLAG AND WAS RULED INTO LAW, which is why there is no flag
 * for it. It was built first as `--hold-parcels` beside `--hold-occupied-parcels`
 * so the founder could choose between three readings; the ruling made the third
 * one the law. A flag that could return a parcel would now be a flag that breaks
 * the law, so both flags are gone rather than defaulted — the difference matters,
 * because a default is something a later hand can pass a flag to undo.
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
export const EXEMPTION_ORDER = Object.freeze(["law", "parcel", "region", "town"]);

export function exemptionFor(mark, { authoredTier = undefined } = {}) {
  // 1 — LAW. The authored tier, never the projection: see the section below.
  const tier = authoredTier !== undefined ? authoredTier : mark?.authored_tier;
  if (tier === "constitution") return "constitution-tier: law needs no stake";
  // 2 — PARCEL. Before region and town, so a household's parcel reads as the
  //     founding privilege rather than borrowing a reason that is about the town.
  if (mark?.kind === "parcel") return "parcel: the founding privilege — needs no stake";
  // 3 — REGION. A true reason: the founding act at town e1415f207 minted 1001 to
  //     the-town and staked 77 onto each of the thirteen rings, thirteen signed
  //     ledger lines. "No mint" answered a different question — whether the
  //     town's OTHER marks get a second issuance — and did not retract this act.
  const leaf = String(mark?.id ?? "").split("/").slice(1).join("/");
  if (REGION_SLUGS.includes(leaf)) return "region: the town's founding stake";
  // 4 — TOWN, last, so this bucket reads what ONLY the town clause protects.
  //     The reason uses the ruling's own words and does NOT say the town stakes,
  //     because "no mint" is precisely the ruling that it does not.
  if ((mark?.by ?? mark?.household) === "the-town")
    return "town: the town's own mark — exempt by the founder's ruling of 2026-09-09";
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
// A flag that could return a parcel would be a flag that breaks the law of
// 2026-09-09, so an old invocation carrying one is refused rather than ignored.
// Silently accepting it would let a hand that learned the earlier shape believe
// it had chosen a reading the town no longer offers.
for (const dead of ["--hold-parcels", "--hold-occupied-parcels", "--return-parcels"]) {
  if (has(dead)) {
    console.error(`unstaked-return: ${dead} is gone. Parcels need no staking (the founder's ruling of ` +
      `2026-09-09) — every parcel is exempt by law, and no flag returns one.`);
    process.exit(2);
  }
}
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

// ── THE PARCEL CASCADE, and why the ruling of 09-09 ends it ─────────────────
//
// A parcel IS the ground the fold's sovereignty is measured against: a mark is
// sovereign because it sits fully inside its own household's parcel. So a
// parcel that returned to drafts took that ground with it, and every mark that
// was standing on it became a commons mark at zero — swept by this very move on
// the NEXT crossing.
//
// This was measured on the rehearsal before the ruling, and it is why the
// question reached the founder at all: 74 of the 270 marks in the set were
// parcels, and returning them re-folded 140 previously-sovereign marks straight
// back into the set. That was the PSA's own promise — "a further 150 stand on
// residents' OWN ground ... and those stand" — coming apart one crossing later.
//
// "PARCELS NEED NO STAKING EITHER" closes it at the root rather than patching
// the symptom: no parcel returns, so no ground is pulled out from under
// anything, so there is no cascade to report. The check below stays, and it
// stays BECAUSE it now reads zero — an instrument that reads zero for a good
// reason is the only kind that can tell you when the reason stops being true.
const exemptOf = (m) => exemptionFor(m, { authoredTier: authoredTier.get(m.id) });

// ── NOTHING IS HELD; NOTHING MOVES ──────────────────────────────────────────
//
// An earlier lap held back every mark that framed a staying sovereign child.
// That was the wrong shape and the conductor was right to send it back: it fixed
// only the SOVEREIGNTY flip and left the other staying children relocated (five
// still moved, the furthest by 392 m), and it kept four unstaked marks standing,
// which weakens the rule this move exists to enforce.
//
// The rule stays whole. Nothing moves either, because the apply rewrites each
// staying descendant's `at:` to the offset from its NEW frame that yields the
// SAME world coordinate — see § the working tree first, then the coordinates.
//
// `preserveFailed` is the only place a hold survives, and it is a genuine
// fallback rather than a policy: a descendant whose `mark.md` cannot be read or
// whose `at:` line cannot be found cannot be given back its coordinate, and the
// receipt says so by name. It is empty on this tree.
const preserved = [], preserveFailed = [];
const S = all.filter((m) => isUnstakedCommons(m) && !exemptOf(m));
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

// THE MATCH IS CASE-FOLDED AND THE EXISTING SPELLING WINS. `households.json`
// lower-cases its logins; the sketchbooks on origin do not. Compared
// case-sensitively the tool creates `draft/aionsolare` beside `draft/AionSolare`
// — five of them (aionsolare, vizarian, seravielle-de-lochan, darkelf381,
// znegil) — landing those residents' returned marks on a brand-new branch
// instead of their sketchbook, and leaving origin with two sketchbooks per
// person that a case-insensitive Windows clone cannot hold as loose refs at all.
// So the registry decides WHICH login and the branch that already exists decides
// how it is SPELLED.
const canonicalBranch = new Map([...existingBranches].map((b) => [b.toLowerCase(), b]));

// ── THE REPO IS THE REPO IT SAYS IT IS ──────────────────────────────────────
//
// `git -C <path>` WALKS UP. Point it at a directory that is not a repository and
// it finds the nearest ancestor that is — so a mistyped `--repo`, or a scratch
// directory under a checkout, silently borrows another repository's refs. This
// tool then reads ITS `draft/*` list (wrong counts, no warning) and, on `--apply`,
// writes sketchbook refs and a commit INTO IT. Found while building the gate
// below: a fixture path in the scratchpad resolved to a real HEAD.
//
// So the repo must be its own top level, and must be the tree being folded.
const topLevel = gitQ("rev-parse", "--show-toplevel");
if (!topLevel) {
  console.error(`unstaked-return: "${REPO}" is not a git repository. Pass --repo <world clone>.`);
  process.exit(2);
}
{
  const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (norm(topLevel) !== norm(REPO)) {
    console.error(
      `unstaked-return: "${REPO}" is not the top of a git repository — git walked up to\n` +
      `  "${topLevel}".\n` +
      "  Refusing rather than reading (and, on --apply, WRITING) another repository's refs.");
    process.exit(2);
  }
}

// ── THE DENOMINATOR GATE ────────────────────────────────────────────────────
//
// The receipt's counts depend silently on which `draft/*` refs this clone can
// see. Measured: the same tree and the same stakes gave 238 movable / 26
// unmovable / cascade 139 before the sketchbook refs were fetched, and
// 240 / 24 / 140 after — with no warning of any kind. A clone that has fetched
// no sketchbooks does not report a smaller move; it reports a WRONG one, and
// every household reads as having no branch.
//
// So zero is a refusal. `--allow-no-sketchbooks` exists for the fixtures, which
// genuinely have none.
if (!existingBranches.size && !has("--allow-no-sketchbooks")) {
  console.error(
    "unstaked-return: this clone can see no draft/* sketchbook refs at all.\n" +
    "  Every household would read as having no branch, and the receipt's counts would be\n" +
    "  wrong rather than merely smaller. Fetch them first:\n" +
    "    git fetch origin 'refs/heads/draft/*:refs/remotes/origin/draft/*'\n" +
    "  (--allow-no-sketchbooks is for fixtures that really have none.)");
  process.exit(2);
}

function branchFor(household) {
  const key = keyOfHousehold[household];
  if (key) {
    const cands = key.startsWith("login:") ? [key.slice("login:".length)] : (loginsOfKey.get(key) ?? []);
    for (const c of cands) {
      const hit = canonicalBranch.get(String(c).toLowerCase());
      if (hit) return { branch: hit, how: "registry", existed: true };
    }
    if (cands.length) return { branch: cands[0], how: "registry", existed: false };
  }
  const own = canonicalBranch.get(String(household).toLowerCase());
  if (own) return { branch: own, how: "name", existed: true };
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
  if (ex) { skipped.push({ mark: m.id, household: m.household, kind: m.kind, why: ex }); exemptCount++; continue; }
  // There is no `by === "the-town"` arm here any more. It was unreachable the
  // moment the town became the fourth clause of `exemptionFor` above — and it
  // carried the sentence the ruling of 18:56 falsifies ("the town's own ground is
  // the town's to stake"). Dead code that states a repealed law is worse than
  // dead code: it is the string a later reader finds when they grep for why.
  if (m.sovereign) skipped.push({ mark: m.id, household: m.household, kind: m.kind, why: "sovereign — on the household's own ground, where the law lets a zero stand" });
  else skipped.push({ mark: m.id, household: m.household, kind: m.kind, why: `staked — stamps ${m.stamps ?? 0}, weight ${m.weight ?? 0}` });
}

// Paths in the receipt and in `update-index` are relative to THE REPO BEING
// WRITTEN, not to the tool's own checkout. They coincide by default (`--repo`
// defaults to the tool's root) and diverge the moment either flag is passed —
// and the divergence is not cosmetic: `git update-index --cacheinfo` refuses an
// absolute path outright, so a run against a separate tree died on its first
// file rather than writing the wrong one.
const dirRel = (d) => relative(REPO, d).split("\\").join("/");

for (const m of S) {
  const dir = dirOf.get(m.id);
  if (!dir) { skipped.push({ mark: m.id, household: m.household, kind: m.kind, why: "no directory in the tree — the fold saw it, the tree does not" }); continue; }
  const dest = branchFor(m.household);
  if (!dest) {
    skipped.push({ mark: m.id, household: m.household, kind: m.kind, why: "no sketchbook branch and no login in WORLD/households.json to name one after" });
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
      && !movedIds.has(m.id) && !Sids.has(m.id) && !exemptOf(m))
    .map((m) => ({
      mark: m.id, household: m.household, kind: m.kind,
      was: byId.get(m.id)?.sovereign ? "sovereign — it stood on its household's own ground"
        : `standing with weight ${byId.get(m.id)?.weight ?? 0}`,
    }));
}

const receipt = {
  tool: "unstaked-return", record: "git", law: "town PSA 2026-09-09; town #1990; founder's ruling 2026-08-28",
  // THE ORDER THE EXEMPTIONS ARE READ IN, on the receipt rather than only in the
  // code, because it decides which bucket a mark that qualifies twice lands in.
  // A town-owned law node is both `law` and `town`; under this order it is `law`,
  // so the TOWN bucket reads what only the town clause protects. Change the order
  // and the same set produces a different receipt.
  exemption_order: EXEMPTION_ORDER,
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
    cascade_next_crossing: cascade.length,
    exempt_by_ruling: exemptCount,
    exempt_constitution: skipped.filter((s) => s.why.startsWith("constitution-tier")).length,
    exempt_region: skipped.filter((s) => s.why.startsWith("region:")).length,
    exempt_parcel: skipped.filter((s) => s.why.startsWith("parcel:")).length,
    exempt_town: skipped.filter((s) => s.why.startsWith("town:")).length,
    coordinates_preserved: preserved.length,
    coordinates_not_preservable: preserveFailed.length,
    stayed_sovereign: skipped.filter((s) => s.why.startsWith("sovereign")).length,
    stayed_staked: skipped.filter((s) => s.why.startsWith("staked")).length,
    staying: skipped.filter((s) => !s.why.startsWith("no sketchbook") && !s.why.startsWith("no directory")).length,
    set_households: new Set([...moved.map((m) => m.household),
      ...skipped.filter((s) => s.why.startsWith("no sketchbook") || s.why.startsWith("no directory"))
        .map((s) => s.household)]).size,
  },
  moved, skipped, reparents, shifts, cascade, preserved, preserve_failed: preserveFailed,
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
    // A NEW SKETCHBOOK IS BUILT FROM MAIN, NEVER AN ORPHAN. The drain's idiom is
    // one line — `git branch -qf draft/<login> <mainSha>`
    // (office src/store-writedown.mjs:770) — and the brief asked for that idiom
    // by name. `read-tree --empty` here would have made a ROOT COMMIT holding
    // only the returned files: 31 of them today, a sketchbook with no history,
    // no shared ancestor with main, and nothing for the drain's own force-reset
    // to fast-forward from. The returned marks would be the only thing the
    // resident's branch had ever contained.
    const base = gitQ("rev-parse", "--verify", `${ref}^{commit}`)
      ?? gitQ("rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`)
      ?? head;
    const idx = join(REPO, ".git", `unstaked-return-index-${branch.replace(/[^A-Za-z0-9]/g, "_")}`);
    const env = { ...process.env, GIT_INDEX_FILE: idx };
    const g = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", env, maxBuffer: 1 << 28 }).trim();
    if (!base) throw new Error(`unstaked-return: no base for ${ref} and no HEAD to build it from`);
    g("read-tree", `${base}^{tree}`);
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
    // Always parented. The parentless spelling is gone rather than guarded: a
    // branch of this shape that could still be created is a branch that will be.
    const commit = execFileSync("git", ["-C", REPO, "commit-tree", tree, "-p", base, "-m", msg], { encoding: "utf8" }).trim();
    git("update-ref", ref, commit);
  }

  // ── 2. THE WORKING TREE FIRST, THEN THE COORDINATES, THEN ONE COMMIT ──────
  //
  // The order here is the whole of the fix for the relocation finding, so it is
  // spelled out. A nested mark's `at:` is an OFFSET from its framing parent's
  // centre; take the parent away and the child re-frames on the grandparent and
  // MOVES. Holding the parent back would have fixed only the sovereignty flip
  // and left the other children relocated — and it would have kept unstaked
  // marks standing, which weakens the rule the whole move exists to enforce.
  //
  // So nothing is held. The rule stays and NOTHING MOVES: each staying
  // descendant's `at:` is rewritten to the offset from its NEW frame that yields
  // THE SAME WORLD COORDINATE. That is the fold's own framing arithmetic run
  // backwards — `at_world = at_file + origin`, so `at_file' = at_world - origin'`.
  //
  // The new origin is not predicted, it is READ: the leaving files come off the
  // disk first, the tree is re-loaded, and each survivor's `_origin` is whatever
  // the fold now says it is. No second implementation of `frameOriginOf` to drift.
  const files = moved.flatMap((m) => m.files);
  if (files.length) {
    // 2a. the files leave the disk
    for (const f of files) { try { rmSync(join(REPO, f), { force: true }); } catch { /* already gone */ } }
    // A directory that is now completely empty was the mark and nothing else, so
    // it goes. One that still holds child directories STAYS — those are other
    // marks' homes and the whole point of the file-level move.
    for (const mv of moved) {
      const d = join(REPO, mv.dir);
      try { if (existsSync(d) && readdirSync(d).length === 0) rmSync(d, { recursive: true, force: true }); } catch { /* leave it */ }
    }

    // 2b/2c. RE-FOLD, REWRITE, REPEAT UNTIL NOTHING MOVES.
    //
    // One pass is not enough and the first rehearsal proved it: fixing a mark's
    // `at:` restores ITS world position, which moves every child framed on it
    // again. A single pass computed each offset against origins read before any
    // rewrite, so parents and children were corrected against each other and the
    // tree came out worse — 11 marks displaced, the furthest by 2,084 m, against
    // 22 before the fix. The frame is a chain, so the correction is a fixpoint.
    //
    // Each round re-folds — the fold's own `frameOriginOf`, never a second
    // implementation — rewrites only the marks that are still off their original
    // world coordinate, and stops when a round finds none. Depth-bounded: the
    // deepest chain in this tree is single digits, and 24 rounds is far past it.
    const wasAt = new Map(all.map((m) => [m.id, m.at]));
    const numOf = (n) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))));
    const AT_LINE = /^at:[ \t]*\{[^}]*\}[ \t]*$/m;
    const movedBy = new Map();          // id -> how far it would have gone, first time we saw it
    let reLoaded = [], rounds = 0;
    for (; rounds < 24; rounds++) {
      reLoaded = loadMarks(MARKS_DIR);
      const reState = fold({ marks: reLoaded, terrain, stakes, households: households.households ?? null });
      const nowById = new Map((reState.marks ?? []).map((m) => [m.id, m]));
      let fixedThisRound = 0;
      for (const rec of reLoaded) {
        const before = wasAt.get(rec.id), now = nowById.get(rec.id);
        if (!before || !now || !rec._fileAt || !rec._origin) continue;
        const dx = (now.at?.x ?? 0) - before.x, dy = (now.at?.y ?? 0) - before.y;
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;     // already where it was
        if (!movedBy.has(rec.id)) movedBy.set(rec.id, Math.hypot(dx, dy));
        const want = { x: before.x - rec._origin.x, y: before.y - rec._origin.y };
        const abs = join(REPO, `${dirRel(rec._dir)}/mark.md`);
        let text; try { text = readFileSync(abs, "utf8"); } catch { text = null; }
        if (!text || !AT_LINE.test(text)) {
          if (!preserveFailed.some((f) => f.mark === rec.id))
            preserveFailed.push({ mark: rec.id, household: rec.by ?? rec.household,
              why: text ? "its mark.md carries no single-line `at:` to rewrite, so the same world coordinate cannot be written back"
                        : "its mark.md could not be read, so the same world coordinate cannot be written back" });
          continue;
        }
        // Only the `at:` line changes. Every other field, and the resident's own
        // words below the frontmatter, are untouched.
        writeFileSync(abs, text.replace(AT_LINE, `at: { x: ${numOf(want.x)}, y: ${numOf(want.y)} }`));
        fixedThisRound++;
      }
      if (!fixedThisRound) break;
    }
    receipt.preserve_rounds = rounds;
    // The record of what was put back, taken from the final fold so `now_file_at`
    // is what the file actually says.
    {
      const finalById = new Map(reLoaded.map((r) => [r.id, r]));
      for (const [id, metres] of movedBy) {
        const r = finalById.get(id);
        if (!r || preserveFailed.some((f) => f.mark === id)) continue;
        preserved.push({ mark: id, household: r.by ?? r.household, kind: r.kind,
          world: wasAt.get(id), now_file_at: r._fileAt,
          would_have_moved_m: Math.round(metres) });
      }
    }

    // 2d. ONE commit carrying both the removals and the rewrites
    const idx = join(REPO, ".git", "unstaked-return-index-main");
    const env = { ...process.env, GIT_INDEX_FILE: idx };
    const g = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", env, maxBuffer: 1 << 28 }).trim();
    g("read-tree", `${head}^{tree}`);
    for (const f of files) g("update-index", "--force-remove", f);
    for (const rec of reLoaded) {
      if (!preserved.some((p) => p.mark === rec.id)) continue;
      const f = `${dirRel(rec._dir)}/mark.md`;
      const blob = git("hash-object", "-w", f);
      g("update-index", "--add", "--cacheinfo", `100644,${blob},${f}`);
    }
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

    // The working tree already holds the post-move truth — the files came off in
    // 2a and the coordinates were rewritten in 2c — so there is nothing left to
    // sync here. That ordering is also what makes the move idempotent: the set is
    // re-measured by folding the tree ON DISK, and a run that left the moved
    // files sitting there would move them again next time.
  }
  // The totals were fixed when the receipt object was built, before the apply
  // filled these — so they are set again here, from the arrays themselves.
  receipt.totals.coordinates_preserved = preserved.length;
  receipt.totals.coordinates_not_preservable = preserveFailed.length;
  receipt.applied = true;
  receipt.applied_at = stamp;
  receipt.new_head = gitQ("rev-parse", "HEAD");

  // ── DISPLACEMENT: what the move did to the marks that STAYED ──────────────
  //
  // A nested mark's `at:` is an OFFSET from its framing parent's centre
  // (marks-fold § the frame). Take the parent's mark.md away and the child
  // re-frames against the GRANDPARENT — so it keeps standing and it is somewhere
  // else. Measured on the rehearsal at 9c93b07d: 22 standing marks moved, the
  // furthest by 1,042 m, carrying a household's parcel and the house on it; two
  // lost sovereignty because their new position is outside their own ground.
  //
  // THIS RUNS ONLY AFTER --apply, and that is not a limitation, it is the reason
  // it is trustworthy: the working tree now holds the post-move truth, so this
  // re-folds it and compares, rather than predicting. The `cascade` field above
  // predicts, and it is a LOWER BOUND — it filters the loaded records after
  // `walkMarks` has already assigned parents, so it cannot see re-framing at all.
  try {
    const afterLoad = loadMarks(MARKS_DIR);
    const afterState = fold({ marks: afterLoad, terrain, stakes, households: households.households ?? null });
    const beforeById = new Map(all.map((m) => [m.id, m]));
    const displaced = [];
    for (const a of afterState.marks ?? []) {
      const b = beforeById.get(a.id);
      if (!b) continue;
      const d = Math.hypot((a.at?.x ?? 0) - (b.at?.x ?? 0), (a.at?.y ?? 0) - (b.at?.y ?? 0));
      if (d <= 0.5) continue;
      displaced.push({ mark: a.id, kind: a.kind, household: a.household, metres: Math.round(d),
        from: b.at, to: a.at, was_sovereign: !!b.sovereign, now_sovereign: !!a.sovereign });
    }
    displaced.sort((x, y) => y.metres - x.metres);
    receipt.displaced = displaced;
    receipt.totals.displaced = displaced.length;
    receipt.totals.displaced_lost_sovereignty = displaced.filter((d) => d.was_sovereign && !d.now_sovereign).length;
  } catch (e) {
    receipt.displaced_error = String(e?.message ?? e);
  }
}

if (RECEIPT) writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");

if (JSON_OUT) { console.log(JSON.stringify(receipt, null, 2)); process.exit(0); }

const t = receipt.totals;
console.log(`unstaked-return · ${APPLY ? "APPLIED" : "dry run"} · ${receipt.marks_dir} @ ${(receipt.repo_head ?? "").slice(0, 8)}`);
console.log(`  folded ${t.marks_folded} marks with ${stakes.length} stake row(s)${STAKES ? "" : "  ⚠ ZERO ESCROW"}`);
console.log(`  returning to drafts: ${t.returning} mark(s) across ${t.returning_households} household(s)`);
console.log(`  set before branch resolution: ${t.set_size_before_branch_resolution} across ${t.set_households} household(s)`);
// `skipped` also carries the marks that ARE in the set and simply had nowhere to
// go, so it is not the number that stays. Reporting it as "staying" would count
// those 12 twice — once as unmovable, once as safe.
console.log(`  staying: ${t.staying} (exempt, sovereign, or staked — each named in the receipt)`);
console.log(`  exempt by the founder's rulings of 2026-09-09: ${t.exempt_by_ruling}, read in the order ${EXEMPTION_ORDER.join(" → ")}`);
console.log(`    law ${t.exempt_constitution} · parcel ${t.exempt_parcel} · region ${t.exempt_region} · town ${t.exempt_town}`);
if (t.coordinates_preserved) console.log(`  ${t.coordinates_preserved} staying mark(s) had their at: rewritten so their world position is unchanged (${receipt.preserve_rounds} round(s))`);
if (t.coordinates_not_preservable) console.log(`  ⚠ ${t.coordinates_not_preservable} staying mark(s) could NOT be given their coordinate back — named in the receipt`);
console.log(`  standing on their own ground: ${t.stayed_sovereign} · carrying a stake: ${t.stayed_staked}`);
if (t.placement_parent_shifts) console.log(`  ${t.placement_parent_shifts} sited/parcel child(ren) keep standing with a re-computed placementParent`);
if (t.displaced) {
  console.log(`  ⚠ ${t.displaced} mark(s) that STAYED were moved in the world by this move — furthest ${receipt.displaced[0].metres} m.`);
  console.log(`     A nested mark's position is an offset from its framing parent; when the parent returns, the child re-frames on the grandparent.`);
  if (t.displaced_lost_sovereignty) console.log(`     ${t.displaced_lost_sovereignty} of them left their own ground and are no longer sovereign.`);
}
if (APPLY && !t.displaced) console.log("  no standing mark changed position.");
if (t.cascade_next_crossing) {
  console.log(`  ⚠ CASCADE: ${t.cascade_next_crossing} mark(s) standing today would enter the set once this move lands.`);
  const sov = cascade.filter((c) => c.was.startsWith("sovereign")).length;
  if (sov) console.log(`     ${sov} of them are sovereign now — their household's parcel is returning, so their ground goes with it.`);
  console.log(`     This is a LOWER BOUND: it cannot see re-framing (see displacement above), so the real second pass can be larger.`);
}
if (t.reparent_hazards) console.log(`  ⚠ ${t.reparent_hazards} re-parent hazard(s) allowed through by --allow-reparent`);
const noBranch = skipped.filter((s) => s.why.startsWith("no sketchbook branch"));
if (noBranch.length) console.log(`  ⚠ ${noBranch.length} mark(s) have no nameable sketchbook and did NOT move`);
if (RECEIPT) console.log(`  receipt: ${RECEIPT}`);
if (!APPLY) console.log("  (dry run — nothing was written; pass --apply to perform the move)");

}   // main

