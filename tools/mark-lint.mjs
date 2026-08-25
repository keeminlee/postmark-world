#!/usr/bin/env node
// mark-lint.mjs — the pre-flight gate for WORLD/marks/ (MARKS.md § Leaving a mark;
// 07-22 nesting ruling). Reads the nested marks the same way the fold does
// (shared loadMarks + the shared `contains`), then holds every record to the
// on-disk schema (WORLD/marks/SCHEMA.md). Deterministic, read-only — it reports,
// it never edits.
//
//   node tools/mark-lint.mjs                 # lint WORLD/marks against the terrain tier
//   node tools/mark-lint.mjs --marks-dir d --terrain t.json
//
// A gate, not a nudge: it exits non-zero on any ERROR (the seeding fleet and the
// hand-authored PR path both pre-flight against it, so a malformed mark fails
// with the exact fix before it ever lands). WARNs are advisory and never fail it.
//
// THE FREEZE (founder-ruled 2026-08-25; LOGOS/state-and-time.md § "The freeze —
// filing is static, and the tree is a fossil"):
//
//   "Filing is frozen as of 2026-08-25. A mark's directory is its historical
//    filing: it carries no claim, and it never moves again."
//
// The directory-matches-containment law is REPEALED, and this gate's old
// dir-equals-placementParent check died with it — "the tree's paths make no
// assertion, so nothing about them can become false." In its place stand the two
// gates the law names (§6, below): *an existing mark directory that moves is
// refused*, and *a new mark files at its id*. Containment is no longer asked of
// the tree at all; it is derived at the fold and emitted as WORLD/containment.json.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMarks, polygonOf, ringMatchesClaim, isValidMarkDate, rect, overlapArea,
  standingRank, fileToWorld, declaredCoords, COORDS_RELATIVE, WORLD_ROOT_SLUG,
} from "./marks-fold.mjs";
import { markStanding } from "./mark-standing.mjs";
import { consentMap, CONSENT_WORDS, CONSENT_FIELD } from "./consent.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
// --repo <dir>: the repository a `source:` path is resolved against (§9). Defaults
// to this tool's own repo, which is what every caller wants: the lane runs MAIN's
// tools, so the documents a rendering is checked against are main's too.
const REPO = resolve(opt("--repo", ROOT));
const MARKS_DIR = opt("--marks-dir", join(REPO, "WORLD/marks"));
const TERRAIN_PATH = opt("--terrain", join(REPO, "WORLD/skeleton.json"));
// --scope <subtree>: the fleet writes sibling dirs concurrently, so a full-tree
// lint mid-fleet would trip on another agent's half-written dir. Scoped mode
// still LOADS the whole tree (ancestor edges resolve; the-town leaf collisions
// across siblings are still caught) but REPORTS/gates only on marks under the
// scope. e.g. --scope WORLD/marks/let-there-be-light/<region-slug>
const SCOPE = opt("--scope", null);
const scopeRel = SCOPE ? resolve(SCOPE).replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : null;
// --freeze <file>: the frozen filing manifest (§6). Defaults to this repo's own
// WORLD/filing-freeze.json, and ONLY when the tree being linted is this repo's
// own — a fixture tree is a synthetic world that never lived through the freeze,
// and holding one to this repo's fossil would refuse every fixture mark for
// standing somewhere the fossil never named. A fixture that means to exercise the
// freeze plants its own manifest and passes it here.
const OWN_TREE = resolve(MARKS_DIR) === resolve(join(REPO, "WORLD/marks"));
const FREEZE_PATH = opt("--freeze", OWN_TREE ? join(REPO, "WORLD/filing-freeze.json") : null);
// --json: the whole finding list as one machine-readable record, so a caller
// (the settlement sweep) can read the verdict instead of scraping the prose.
// Same findings, same exit code; only the rendering differs.
const JSON_OUT = args.includes("--json");

const KINDS = new Set(["sited", "predicated", "naming", "parcel", "class"]);
const TIERS = new Set(["constitution", "sovereignty", "market", "draft"]); // v2 protection tiers + draft (gray, 2026-08-09)
const TOWN = "the-town"; // the town-tier author; only it may claim constitution
// The world root, kept as a name rather than as a check: the freeze repealed the
// containment question this gate used to ask of the tree (§6), so nothing here
// reads placementParent any more. The fold answers containment now.
const BODY_MAX = 150; // chars (07-22 ruling)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const findings = [];
const at = (rec) => (rec._dir ? rec._dir.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : rec.id ?? "?");
const err = (rec, msg) => findings.push({ sev: "ERROR", file: at(rec), msg });
const warn = (rec, msg) => findings.push({ sev: "WARN", file: at(rec), msg });
// THE THIRD SEVERITY IS GONE. `REHOME` named work for the MACHINERY rather than
// for the writer — a directory edge that had stopped naming its tightest
// geometric container, which the settlement sweep re-pointed on the author's
// behalf. The freeze repealed the law that made such an edge wrong ("the tree's
// paths make no assertion, so nothing about them can become false") and deleted
// the mover ("The re-home pass is DELETED from the settlement save"), so there is
// no repair left for this gate to ask for. Two exit codes now: 0 and 1.

// terrain ids the tier exposes for `parent: terrain:<id>` attachment
const terrain = existsSync(TERRAIN_PATH) ? JSON.parse(readFileSync(TERRAIN_PATH, "utf8")) : { features: [], far_features: [] };
const TERRAIN_IDS = new Set([...(terrain.features ?? []), ...(terrain.far_features ?? [])].map((f) => f.id));
// the mechanics roster a mark's `mechanic:` may point at (07-23 field)
const REGISTRY = terrain.physics_registry ?? {};

const num = (v) => typeof v === "number" && Number.isFinite(v);
const hasGeom = (rec) => rec.at && num(rec.at.x) && num(rec.at.y) && rec.extent && num(rec.extent.w) && num(rec.extent.h);

const marks = loadMarks(MARKS_DIR);

// The class roster: a class NAME is lawful exactly when the town's own
// constitution-tier TYPE mark declares it FROM THE KEEPING WORKS. The position
// clause is the law's own sentence (LOGOS/classes.md § Instantiation:
// declarations stand "constitution-tier, standing in the Keeping Works") and
// it is what tells a DECLARATION from an INSTANCE that happens to be
// town-authored — the three harbor charters carry `class: town` and declare
// nothing; before this clause they read as three extra declarations of a
// class the works already declares (Keemin's ruling, 2026-08-17 night: make
// IS-the-class vs INSTANCE-of-the-class explicit). Ancestry, never direct
// parent: `household/human` nests under a class mark and is still of the
// works. This still reads the class VALUE, never the slug. A record naming a
// class outside the roster is a lie about the world's vocabulary, same shape
// as a mechanic outside the registry.
const _byIdForWorks = new Map(marks.map((m) => [m.id, m]));
const standsInTheWorks = (rec) => {
  let cur = rec, hops = 0;
  while (cur && hops++ < 64) {
    if (cur.id === "the-town/the-keeping-works") return true;
    cur = cur._parentMarkId ? _byIdForWorks.get(cur._parentMarkId) : null;
  }
  return false;
};
const isClassDeclaration = (m) =>
  m.by === "the-town" && m.tier === "constitution" && m.class !== undefined && standsInTheWorks(m);
const CLASS_ROSTER = new Set(marks.filter(isClassDeclaration).map((m) => String(m.class)));

// the gate quotes the law (rung 1, 2026-08-02): a refusal cites the clause of
// the-town/logos it enforces — id + body verbatim, so the bounce hands the
// writer an investigable handle and the exact law, never a paraphrase. The
// clauses live in the very tree this gate lints; if a cited clause is missing
// the gate still refuses, and says its own lookup failed (the law never blocks
// on its own absence).
const LAW = new Map(marks.map((m) => [m.id, String(m.body ?? "").trim().replace(/\s+/g, " ")]));
const cite = (clauseId) => {
  const body = LAW.get(clauseId);
  return body
    ? ` — the law: ${clauseId} (a clause of the-town/logos): "${body}"`
    : ` — the law: ${clauseId} (clause not found in the record; the gate's law lookup failed)`;
};
const byId = new Map();
// The standing walk needs the WHOLE tree, and `byId` above is filled as the
// record loop validates — so a rule inside that loop would ask about a chain
// only half indexed. This map is complete before the first check runs, and is
// the only one any standing question is asked against. (Duplicate ids are the
// loop's own error to report; first wins here, as in the loader.)
const standingIndex = new Map();
for (const m of marks) if (!standingIndex.has(m.id)) standingIndex.set(m.id, m);
const rankOf = (m) => standingRank(m, standingIndex);
const standingOf = (m) => markStanding(m, standingIndex);
const slugsByHousehold = new Map();
const childCount = new Map();
for (const m of marks) {
  if (m._parentMarkId) childCount.set(m._parentMarkId, (childCount.get(m._parentMarkId) ?? 0) + 1);
}

for (const rec of marks) {
  // 0. unreadable frontmatter — nothing else can be trusted
  if (rec._error) { err(rec, `unreadable mark.md: ${rec._error}`); continue; }

  // 1. identity: valid kind, authorship (by), path-safe slug unique per author, tier, date
  if (!KINDS.has(rec.kind)) { err(rec, `kind must be one of ${[...KINDS].join(" | ")} (got ${JSON.stringify(rec.kind)})${cite("the-town/the-kinds")}`); }
  if (rec.by == null) err(rec, `by: <author> is required — in the spatial tree (v2) authorship is frontmatter, not the path${cite("the-town/the-own-hand")}`);
  if (!SLUG_RE.test(rec.slug)) err(rec, `slug "${rec.slug}" must be lowercase-hyphenated (it is the directory name and the leaf of the id)`);
  if (byId.has(rec.id)) err(rec, `duplicate id "${rec.id}" — a leaf slug must be unique per author (by)${cite("the-town/the-own-hand")}`);
  byId.set(rec.id, rec);
  // tier: valid, and constitution belongs to the town alone
  if (!TIERS.has(rec.tier)) err(rec, `tier must be one of ${[...TIERS].join(" | ")} (got ${JSON.stringify(rec.tier)})`);
  if (rec.tier === "constitution" && rec.by !== TOWN) err(rec, `tier: constitution is the town's — only by: ${TOWN} may claim it (a market mark cannot bind without stamps)${cite("the-town/the-tiers")}`);
  // B's rule, made structural (residue stripped 2026-08-13): standing is the
  // one walk's verdict, so an AUTHORED tier: is residue the moment it lands —
  // refused at the gate now. The loader's default hides authorship, so this
  // reads the file: the walk's one exception stays writable (the town's own
  // constitution), and `draft` stays (branch-state, not standing — the one
  // field standingRank still reads).
  if (rec._dir) {
    let rawTier = null;
    try {
      const raw = readFileSync(join(rec._dir, "mark.md"), "utf8");
      rawTier = ((raw.match(/^---\r?\n[\s\S]*?\r?\n---/) || [""])[0].match(/^tier:\s*(\S+)/m) || [])[1] ?? null;
    } catch { /* unreadable file already erred above */ }
    if (rawTier && rawTier !== "draft" && !(rec.by === TOWN && rawTier === "constitution"))
      err(rec, `tier: is not a field — standing is derived by the one walk, never asserted (drop the line; the ground decides)${cite("the-town/the-tiers")}`);
  }
  if (!rec.date || !isValidMarkDate(rec.date)) warn(rec, `date should be YYYY-MM-DD or a full ISO 8601 datetime (got ${JSON.stringify(rec.date)})`);

  // 2. stray legacy fields the tree no longer owns (authorship is `by:` now)
  if (rec._stray?.household != null)
    warn(rec, `legacy household "${rec._stray.household}" — authorship is the by: field now (drop household)`);
  if (rec._stray?.mark != null && rec._stray.mark !== rec.slug)
    warn(rec, `frontmatter mark "${rec._stray.mark}" disagrees with the directory "${rec.slug}" (the directory is the slug — drop the field)`);
  if (rec.stamps !== undefined) warn(rec, `stamps are ledger-derived, never stored in the record — drop the field`);

  // 2.5 image: the media-shelf pointer (2026-08-15). A mark may carry ONE
  // image, and only from the town's own shelf — the byte-validated upload
  // door is the sole mint, so the allowlist here is the abuse wall the door
  // relies on holding at the record layer too (a hand-committed mark meets
  // the same law as a door-written one).
  if (rec.image !== undefined &&
      !(typeof rec.image === "string" && /^https:\/\/media\.postmark\.town\/[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(rec.image.trim())))
    err(rec, `image: must be one https://media.postmark.town/… URL from the upload door (got ${JSON.stringify(String(rec.image).slice(0, 80))})`);

  // 3. body: present, present-tense, and short (the ruling's 150-char cap)
  const bodyLen = [...String(rec.body ?? "").trim()].length;
  if (bodyLen === 0) warn(rec, `empty body — a mark is an observation; give it one line`);
  else if (bodyLen > BODY_MAX) err(rec, `body is ${bodyLen} chars; the cap is ${BODY_MAX} (MARKS.md 07-22 ruling)${cite("the-town/the-one-claim")}`);

  // 3b. provenance: office/fleet pre-marks translate a resident's OWN words, so
  // they must cite the source and quote it (MARKS.md membrane; fleet contract).
  const isPre = rec.pre === true || rec.pre === "true";
  if (isPre) {
    const df = rec.derived_from == null ? "" : String(rec.derived_from).trim();
    if (!df) err(rec, `pre: true marks must carry derived_from: <source path> — "<verbatim quote>"`);
    else if (!/[/.]/.test(df) || !/["“”]|—/.test(df)) warn(rec, `derived_from should name a source path AND a verbatim quote (got: ${df.slice(0, 60)})`);
  } else if (rec.derived_from !== undefined) {
    warn(rec, `derived_from is set but pre is not true — set pre: true or drop derived_from`);
  }

  // 3c. mechanic: diegesis may point at machinery, but only machinery that exists
  // and is honored (the physics registry is the roster; a mark pointing at absent
  // or refused machinery is a lie about the world's workings).
  if (rec.mechanic !== undefined) {
    const entry = REGISTRY[rec.mechanic];
    if (!entry) err(rec, `mechanic: "${rec.mechanic}" is not in the physics registry (skeleton.json physics_registry) — a mark may only point at machinery that exists`);
    else if (!entry.honored) err(rec, `mechanic: "${rec.mechanic}" is registered but NOT honored (${entry.receipt}) — diegesis cannot point at refused machinery`);
  }
  // (the `timetable:` a `mechanic: timetable` mark must carry is checked in §8,
  // below — every id inside it must resolve against the whole tree.)

  // 3d. the bounty grammar (the board's notices — founder-ruled 2026-08-11).
  // A notice is class: bounty + one ask ≤150 + a whole-number reward ≥1 +
  // open/done; the board's reader (site src/lib/board.mjs) drops-and-counts a
  // malformed notice rather than rendering it, so this gate owes the writer
  // the exact field. Scoped to notice-shaped records: the class TYPE mark in
  // the Keeping Works carries class: bounty with none of ask/reward/status,
  // and is a definition, not a notice.
  if (rec.class !== undefined && !CLASS_ROSTER.has(String(rec.class)))
    err(rec, `class: ${JSON.stringify(rec.class)} names no class the law knows (the roster: ${[...CLASS_ROSTER].sort().join(", ")})`);
  // Scope by WHAT THE MARK IS, never by whether it bothered to carry the
  // fields (review W-1: a bare `class: bounty` on the board slipped the gate
  // entirely, because the gate looked for the very fields it exists to
  // require). A bounty TOKEN is any class:bounty mark that is not the class
  // DEFINITION — and the definition is known by where it stands (the Keeping
  // Works), exactly how the board reader knows a notice (the board).
  // the ONE definition gate, shared with the roster above (ancestry-walked:
  // a definition nested under a class mark — household/human — is still of
  // the works); the old direct-parent test was this rule's per-bounty prototype
  const isClassDefinition = isClassDeclaration(rec);
  if (rec.class === "bounty" && !isClassDefinition) {
    if (rec._parentMarkId !== "the-town/the-bounty-board")
      warn(rec, `class: bounty off the board — the board reads only notices standing on the-town/the-bounty-board; this mark can never render there`);
    if (rec.kind !== "sited") err(rec, `a bounty notice is a sited mark (got kind: ${JSON.stringify(rec.kind)})`);
    const askLen = [...String(rec.ask ?? "").trim()].length;
    if (askLen === 0) err(rec, `a bounty notice needs ask: — one claim, ≤${BODY_MAX} chars`);
    else if (askLen > BODY_MAX) err(rec, `ask is ${askLen} chars; the cap is ${BODY_MAX}${cite("the-town/the-one-claim")}`);
    if (String(rec.ask ?? "").includes("#"))
      err(rec, `ask carries '#' — the record grammar reads # as a comment; this ask has already been truncated or will be misread`);
    const rwd = Number(rec.reward);
    if (rec.reward === undefined || typeof rec.reward === "boolean" || !Number.isInteger(rwd) || rwd < 1)
      err(rec, `reward: must be a whole number of stamps ≥ 1 (got ${JSON.stringify(rec.reward)})`);
    const st = rec.status === undefined ? "open" : String(rec.status).trim();
    if (st !== "open" && st !== "done") err(rec, `status: is open or done (got ${JSON.stringify(rec.status)})`);
    if (rec.threshold !== undefined && rec.by !== TOWN)
      err(rec, `threshold: is the town's bar — a resident notice carries reward, never threshold`);
  } else if (rec.class === undefined && (rec.ask !== undefined || rec.reward !== undefined || rec.status !== undefined)) {
    warn(rec, `ask/reward/status without class: bounty — the board cannot read this as a notice`);
  }

  // 4. kind-specific shape
  if (rec.kind === "sited" || rec.kind === "parcel") {
    if (rec.kind === "sited" && !hasGeom(rec)) err(rec, `sited marks need at {x,y} and extent {w,h} in grid meters${cite("the-town/the-kinds")}`);
    if (rec.kind === "parcel" && rec.at == null) err(rec, `parcel marks need at {x,y} (extent defaults to 25x25)${cite("the-town/the-kinds")}`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `${rec.kind} marks carry no slot/value (those are for predicated/naming)`);
    if (rec._explicitParent) err(rec, `${rec.kind} marks never declare a parent — containment is computed from geometry, not authored`);
    // 4b. claim-honesty for a points: ring (SCHEMA v2): the ring must be a real
    // shape, and its bounding box must equal the mark's at/extent claim. This gate
    // exists before the first record that carries a ring, so the coarse claim can
    // never lie about the fine shape the FOV silhouette / containment will honor.
    if (rec.points !== undefined) {
      if (!polygonOf(rec)) err(rec, `points: must be a ring of ≥3 vertices ([[x,y],…] or "x1,y1 x2,y2 …")`);
      else if (!ringMatchesClaim(rec)) err(rec, `the points: ring's bounding box must equal the mark's at/extent claim — the claim IS the ring's bbox (SCHEMA v2)`);
    }
  } else if (rec.kind === "predicated" || rec.kind === "naming") {
    if (rec.at !== undefined || rec.extent !== undefined) err(rec, `${rec.kind} marks carry no at/extent — they take their locus from their parent${cite("the-town/the-continuation")}`);
    if (rec.kind === "predicated" && (rec.slot === undefined || rec.value === undefined)) err(rec, `predicated marks need slot and value${cite("the-town/the-kinds")}`);
    if (rec.kind === "naming" && rec.value === undefined) err(rec, `naming marks need value (the name); slot is implicitly "name"`);
    if (rec.kind === "naming" && rec.slot !== undefined && rec.slot !== "name") warn(rec, `naming marks use slot "name" (or omit it); got "${rec.slot}"`);
    // parent source: nested (implicit) XOR explicit terrain — exactly one
    const nested = rec._parentMarkId != null;
    const explicit = rec._explicitParent != null;
    if (nested && explicit) err(rec, `nested marks must not also declare a parent — the enclosing directory is the parent`);
    else if (!nested && !explicit) err(rec, `a top-level ${rec.kind} mark must declare parent: terrain:<id>, or be nested under the mark it describes`);
    if (explicit) {
      if (!/^terrain:/.test(String(rec._explicitParent))) err(rec, `an authored parent may only be a terrain feature (terrain:<id>); to attach to a mark, nest under its directory`);
      else {
        const tid = String(rec._explicitParent).slice("terrain:".length);
        if (!TERRAIN_IDS.has(tid)) err(rec, `parent terrain:${tid} names no terrain feature (WORLD/skeleton.json)`);
      }
    }
  } else if (rec.kind === "class") {
    // THE DE-SITING (2026-08-18): law has no where. A class-node carries no
    // geometry — a rule's extent is its jurisdiction, which is enumerable,
    // never measurable. It stands in a registry by ancestry, not coordinates.
    if (rec.at !== undefined || rec.extent !== undefined) err(rec, `class marks carry no at/extent — a rule's extent is its jurisdiction, not geometry`);
    if (rec.slot !== undefined || rec.value !== undefined) err(rec, `class marks carry no slot/value (those are for predicated/naming)`);
    if (rec.class === undefined) err(rec, `a class mark declares its class: — kind: class with no class: names nothing`);
    if (rec._explicitParent) err(rec, `class marks never declare a parent — their registry standing is the enclosing directory`);
  }

}

// 5. the edge: children must fit their container — sited/parcel marks contain
// anything; a predicated mark's children must all be predicated/naming (the
// continuation law, 2026-08-02: a predicate is its parent continued, so its
// subtree stays predicates all the way down); naming marks carry none.
{
  const kindById = new Map(marks.map((m) => [m.id, m.kind]));
  for (const rec of marks) {
    if (rec._error || !rec._parentMarkId) continue;
    const pk = kindById.get(rec._parentMarkId);
    if (pk === "naming") err(rec, `a naming mark cannot contain child marks (move this out)${cite("the-town/the-continuation")}`);
    else if (pk === "predicated" && rec.kind !== "predicated" && rec.kind !== "naming")
      err(rec, `a ${rec.kind} mark cannot nest under a predicate — a predicate's children must be predicates (the continuation law); geometry needs a geometric parent${cite("the-town/the-continuation")}`);
    else if (pk === "class" && rec.kind !== "class" && rec.kind !== "predicated" && rec.kind !== "naming")
      err(rec, `a ${rec.kind} mark cannot nest under a class-node — class-space holds classes and their predicates; geometry needs a geometric parent`);
    // A predicate that outranks its parent is the one shape the tier binding
    // REFUSES rather than repairs. Everywhere else an outranking child simply
    // stops being framed by its parent and stands on its own world numbers —
    // but a predicate HAS no numbers of its own to stand on. It is its parent
    // continued, so a predicate claiming authority over what it predicates is
    // asking to describe a thing while being immune to it, and there is no
    // re-pointing that makes that true.
    const parent = byId.get(rec._parentMarkId);
    if ((rec.kind === "predicated" || rec.kind === "naming") && parent && rankOf(rec) > rankOf(parent))
      err(rec, `${standingOf(rec)} standing over a parent standing as ${standingOf(parent)} (${parent.id}) — a predicate cannot outrank what it predicates: it is its parent continued${cite("the-town/the-continuation")}`);
  }
}

// THE FRAME LAW, written out here rather than imported from the loader.
// §6b needs a second opinion on what the loader already did — and a check that
// asks the loader whether it agrees with itself proves nothing. This walks
// ALREADY-COMPOSED centres, which is a genuinely different computation from the
// loader's (that one resolves centres recursively and memoizes, with cycle and
// duplicate-id guards threaded through), so the two can disagree. See
// marks-fold.mjs § the tier binding.
//
// The freeze does NOT touch this. A frozen directory still frames the numbers
// written inside it — that is arithmetic about a file, not a claim about the
// world — and the fossil is exactly what keeps it stable: nothing moves, so no
// mark's frame is ever re-derived out from under its digits again.
const ROOT_MARK = marks.find((m) => m.slug === WORLD_ROOT_SLUG);
const WORLD_CENTRE = ROOT_MARK?.at ? { x: ROOT_MARK.at.x, y: ROOT_MARK.at.y } : { x: 0, y: 0 };
// The centre `rec`'s file numbers would be written against if it were filed
// directly inside `start` — the nearest positioned ancestor from `start` up
// (start itself included) whose tier ranks at or above rec's own.
const frameOriginFrom = (rec, start) => {
  const continued = rec.kind === "predicated" || rec.kind === "naming";
  const rank = rankOf(rec);
  const seen = new Set([rec.id]);
  for (let p = start; p && !seen.has(p.id); p = p._parentMarkId ? byId.get(p._parentMarkId) : null) {
    seen.add(p.id);
    if (p.at && (continued || rankOf(p) >= rank)) return { x: p.at.x, y: p.at.y };
  }
  return WORLD_CENTRE;
};
const parentOf = (rec) => (rec._parentMarkId ? byId.get(rec._parentMarkId) : null);

// 6. THE FREEZE — the two gates that replaced the nesting edge.
//
// What stood here until 2026-08-25 was the tightest-container check: the
// directory edge had to name the smallest mark that geometrically contained the
// record, and a drifted edge was either a refusal or a re-home. The founder
// repealed it (LOGOS/state-and-time.md § "The freeze — filing is static, and the
// tree is a fossil"):
//
//   "The directory-matches-containment law is REPEALED — the tree's paths make
//    no assertion, so nothing about them can become false. The lint's old
//    dir-equals-placementParent check dies with it; in its place stand two gates
//    that enforce the freeze itself: *an existing mark directory that moves is
//    refused*, and *a new mark files at its id*."
//
// Every receipt of friction the old check produced — the publish+re-home wedge,
// stranded sketchbooks, stale outsider lists, twenty-seven dead registry paths —
// came from one property: paths that moved under readers. These two gates take
// that property away rather than policing its consequences. Nothing here asks
// where a mark STANDS; that question is the fold's, answered at every settlement
// in WORLD/containment.json.
//
// THE MANIFEST IS THE FOSSIL'S BOUNDARY. WORLD/filing-freeze.json was minted
// once, on the freeze date, mapping every mark then alive to the path it was
// filed at. It is never regenerated: a rebuild would re-bless whatever the tree
// happened to say that day, which is the one thing the freeze exists to prevent.
// An id IN the manifest is a fossil and answers gate A; an id NOT in it was born
// after the freeze and answers gate B, needing no row, because its path is
// derivable from its id.
{
  const MARKS_POSIX = resolve(MARKS_DIR).replace(/\\/g, "/");
  const filedAt = (rec) => "WORLD/marks/" + resolve(rec._dir).replace(/\\/g, "/").slice(MARKS_POSIX.length + 1);

  let frozen = null;
  if (FREEZE_PATH && existsSync(FREEZE_PATH)) {
    const parsed = JSON.parse(readFileSync(FREEZE_PATH, "utf8"));
    frozen = parsed?.marks && typeof parsed.marks === "object" ? parsed.marks : {};
  }

  if (!frozen) {
    // A tree with no manifest declares no freeze, and the gates below have
    // nothing to hold it to. There are two ways to arrive here and they are not
    // the same fact:
    //
    //   a tree that is not this repository's — a fixture, a borrowed checkout —
    //   was never in the freeze's jurisdiction, and saying so on every run would
    //   be noise about a world that does not exist.
    //
    //   THIS repository's own tree with its manifest gone is the loud one. It is
    //   the single condition under which the freeze silently stops being
    //   enforced, so it is said out loud: a reader of a passing report is owed
    //   the reason the gates did not run.
    if (FREEZE_PATH)
      findings.push({
        sev: "WARN",
        file: "WORLD/filing-freeze.json",
        msg: `no frozen filing manifest at ${String(FREEZE_PATH).replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/")} — the freeze gates did not run. "Filing is frozen as of 2026-08-25": a tree that carries no boundary is not held to one`,
      });
  } else for (const rec of marks) {
    if (rec._error || !rec._dir) continue;
    if (rec.by == null) continue;           // an id of the shape "?/slug" is §1's error, not this gate's
    const here = filedAt(rec);
    const was = frozen[rec.id];

    if (was !== undefined) {
      // ── GATE A: an existing mark directory that moves is refused ──────────
      // A mark absent from the tree is NOT this gate's business: the manifest
      // names where a mark WAS filed, and a withdrawal removes a seat rather
      // than moving one. Only a record standing somewhere else answers here.
      if (here !== was)
        err(rec, `this mark is filed at ${here}, but the frozen filing names ${was} — "A mark's directory is its historical filing: it carries no claim, and it never moves again." An existing mark directory that moves is refused (the freeze, 2026-08-25); put the directory back${cite("the-town/the-frozen-filing")}`);
      continue;
    }

    // ── GATE B: a new mark files at its id ─────────────────────────────────
    // "New marks are filed by identity — WORLD/marks/<household>/<slug>/."
    // The id IS <household>/<slug>, so the path is the id and nothing has to be
    // looked up to know it. This is the layout that arrives organically, mark by
    // mark, with no rename storm ever.
    //
    // ── WHOSE FILING THIS BINDS, AND WHY IT IS NOT EVERY MARK ───────────────
    //
    // Only the kinds whose directory was ever a CONTAINMENT claim: sited and
    // parcel. Those are the marks the freeze is about — "the tree's paths make
    // no assertion", so their filing is released from geometry and pinned to
    // identity instead.
    //
    // A predicated / naming / class mark is a different edge entirely. It is its
    // parent CONTINUED (the continuation law, the-town/the-continuation): it
    // carries no at/extent, has no footprint to be contained by anything, and
    // takes its subject from the mark it is nested inside. That nesting is
    // AUTHORSHIP — "this describes that" — not a claim about ground, so the
    // freeze does not repeal it and §4 still requires it: a top-level predicate
    // must name a terrain feature or be nested under what it describes.
    //
    // Binding those kinds to their id path would mean no predicate, name, or
    // class instance could ever attach to a MARK again — only to terrain — which
    // would take the world's whole descriptive layer out with the containment
    // reading it was never part of. Verified rather than assumed: a naming mark
    // filed at `WORLD/marks/<by>/<slug>/` bounces on §4 as "a top-level naming
    // mark must declare parent: terrain:<id>", so the two rules cannot both bind
    // it. ⚠ THIS IS THE GATE'S READING of a sentence the freeze states without
    // this qualification, and it is flagged for the founder rather than buried.
    if (rec.kind !== "sited" && rec.kind !== "parcel") continue;
    const want = `WORLD/marks/${rec.by}/${rec.slug}`;
    if (here !== want)
      err(rec, `this mark was born after the freeze and is filed at ${here} — "New marks are filed by identity — WORLD/marks/<household>/<slug>/". A new mark files at its id: ${want}${cite("the-town/the-frozen-filing")}`);
  }
}


// 6b. the loader and the law agree — a check on the MACHINERY, not on any
// resident. Everything above trusts `loadMarks` to have composed each mark's
// world position correctly; this is the one place that trust is tested. Same
// walk §6 uses, run over the directory chain each record actually has.
if (declaredCoords(marks) === COORDS_RELATIVE) {
  for (const rec of marks) {
    if (rec._error || !rec._fileAt || rec === ROOT_MARK) continue; // the root IS the frame
    const o = frameOriginFrom(rec, parentOf(rec));
    const composed = fileToWorld(rec._fileAt, o);
    if (composed.x !== rec.at.x || composed.y !== rec.at.y)
      err(rec, `the loader placed this mark at ${rec.at.x},${rec.at.y}, but the frame law composes ${rec._fileAt.x},${rec._fileAt.y} on origin ${o.x},${o.y} to ${composed.x},${composed.y} — the two disagree. This is a MACHINERY BUG in tools/marks-fold.mjs, not a defect in this record; do not edit the mark to silence it`);
  }
}

// 7. the one-file law (2026-08-02): the only .md inside the record is a mark's
// own mark.md. Two exceptions, both at the top level and both about the grammar
// rather than about the world: SCHEMA.md, which is the record's own shape, and
// README.md, which is the fossil's label — the tree has been historical filing
// since 2026-08-25 and a browser standing in it is owed that sentence where they
// are standing. Anything else must be a full mark in its own directory.
const TOP_LEVEL_MD = new Set(["SCHEMA.md", "README.md"]);
{
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else if (/\.md$/i.test(name) && name !== "mark.md" && !(depth === 0 && TOP_LEVEL_MD.has(name)))
        findings.push({ sev: "ERROR", file: p.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/"), msg: `stray .md — the only .md in a mark directory is mark.md; everything else must be its own mark (the one-file law)${cite("the-town/the-one-file")}` });
    }
  };
  walk(MARKS_DIR, 0);
}

// 8. timetable: the schedule a `mechanic: timetable` mark carries (2026-08-07 —
// the Post Office as a scheduled service). Checked here rather than in the main
// loop because every id inside it must resolve against the WHOLE tree: stops and
// the vessel are named BY MARK ID and their coordinates are never duplicated
// into the schedule, so the ids are the only thing holding the service together.
//
// Strict by construction. A schedule that names a mark which is not there, or a
// time that does not parse, is not a small mistake — it is a service that
// silently never sails, and the residents standing on the quay are the ones who
// find out.
{
  const DEPART_RE = /^([01]\d|2[0-3]):([0-5]\d)Z$/; // UTC times-of-day, on the crossing clock
  const siteable = (m) => m && m.kind === "sited" && hasGeom(m);
  for (const rec of marks) {
    if (rec._error) continue;
    const declared = rec.timetable !== undefined;
    const claims = rec.mechanic === "timetable";
    if (claims && !declared) {
      err(rec, `mechanic: timetable but no timetable: field — the mechanic is the pointer, the field is the schedule; a service needs both`);
      continue;
    }
    if (!declared) continue;
    if (!claims) {
      err(rec, `timetable: is set but mechanic: is ${JSON.stringify(rec.mechanic)} — a schedule no registered machinery runs (add mechanic: timetable)`);
      continue;
    }
    const tt = rec.timetable;
    if (tt === null || typeof tt !== "object" || Array.isArray(tt)) {
      err(rec, `timetable: must be a structured record on one line — {"vessel": "<mark id>", "pace": <km/crossing>, "stops": [{"mark": "<mark id>", "departs": ["06:00Z"]}, …]} (got ${JSON.stringify(tt)})`);
      continue;
    }

    const vessel = byId.get(tt.vessel);
    if (!vessel) err(rec, `timetable vessel: "${tt.vessel}" names no mark — the vessel is a mark, by id`);
    else if (!siteable(vessel)) err(rec, `timetable vessel: ${tt.vessel} must be a sited mark with at/extent — her footprint IS the boarding zone`);

    if (!Array.isArray(tt.stops) || tt.stops.length < 2) {
      err(rec, `timetable stops: must list at least two stop marks (got ${JSON.stringify(tt.stops)}) — one stop is not a line`);
    } else {
      const seen = new Set();
      tt.stops.forEach((s, i) => {
        const ref = s?.mark;
        const stop = byId.get(ref);
        if (!stop) return err(rec, `timetable stop ${i}: "${ref}" names no mark — stops are marks, and their coordinates are the marks' own`);
        if (!siteable(stop)) err(rec, `timetable stop ${i}: ${ref} is not sited — a stop with no at/extent has nowhere to berth`);
        if (seen.has(ref)) err(rec, `timetable stops: ${ref} appears twice — a line visits each stop once per round`);
        seen.add(ref);
        const departs = s?.departs;
        if (!Array.isArray(departs) || departs.length === 0)
          err(rec, `timetable stop ${ref}: departs must list at least one time — a stop no one leaves is not a stop`);
        else for (const t of departs)
          if (!DEPART_RE.test(String(t))) err(rec, `timetable stop ${ref}: "${t}" is not a departure time — HH:MMZ, UTC (the crossing clock's own)`);
      });
    }

    if (!(typeof tt.pace === "number" && Number.isFinite(tt.pace) && tt.pace > 0))
      err(rec, `timetable pace: must be a positive number of km per crossing (got ${JSON.stringify(tt.pace)}) — at any other pace she never arrives`);
  }
}

// 8b. consent: the three-word `m` (tools/consent.mjs; ECONOMY.md §9.2).
//
// A word is only worth anything if the person saying it owns the ground it is
// about. These lints are all one idea in four shapes: you may speak for your own
// parcel and for the inside of your own mark, about somebody ELSE's mark, using a
// word this world knows, about ground that is actually there.
//
// Checked here rather than in the main loop for the same reason as the timetable:
// every id inside a consent map must resolve against the WHOLE tree, and a
// parcel's authority is geometric, so it needs every mark's rect to answer.
{
  // --households <file>: the handle → household map the gate resolves "your own
  // household" against. Defaults to WORLD/households.json, which today is keyed by
  // CREDENTIAL ID and is stale — the right grain is the town's DECLARED household
  // slug, projected by tools/households-project.mjs. Until that projection has a
  // refresh channel and becomes canon, the flag is how a caller points this gate at
  // the correct grain, exactly as the fold's own --households already does.
  const HOUSEHOLDS_PATH = opt("--households", join(REPO, "WORLD/households.json"));
  const households = existsSync(HOUSEHOLDS_PATH)
    ? (JSON.parse(readFileSync(HOUSEHOLDS_PATH, "utf8")).households ?? {}) : {};
  const credOf = (handle) => households[handle] ?? `solo:${handle}`;

  for (const rec of marks) {
    if (rec._error) continue;

    const map = rec[CONSENT_FIELD];
    if (map === undefined) continue;
    if (!consentMap(rec)) {
      err(rec, `${CONSENT_FIELD}: must be a map from mark id to word on one line — {"<household>/<slug>": "welcomed"} (got ${JSON.stringify(map)})`);
      continue;
    }
    // who may speak at all: a parcel holder (about ground) or a mark's author
    // (about what stands inside it).
    const isParcel = rec.kind === "parcel";
    const speaksFor = new Set(marks.filter((m) => m._parentMarkId === rec.id).map((m) => m.id));

    for (const [target, word] of Object.entries(map)) {
      if (!CONSENT_WORDS.has(word)) {
        err(rec, `${CONSENT_FIELD}: "${target}" → ${JSON.stringify(word)} is not a word this world knows — ${[...CONSENT_WORDS].map((w) => `"${w}"`).join(" or ")}. The third position is silence: say nothing and the mark simply stands on its own stamps`);
        continue;
      }
      const t = byId.get(target);
      if (!t) {
        warn(rec, `${CONSENT_FIELD}: "${target}" names no mark in the tree — a word about a mark that never landed. Harmless, and it does nothing`);
        continue;
      }
      if (!isParcel && !speaksFor.has(target)) {
        err(rec, `${CONSENT_FIELD}: "${target}" is not inside this mark and this is not a parcel — you may speak for your own parcel's ground, or for what stands inside your own mark, and for nothing else${cite("the-town/the-own-hand")}`);
        continue;
      }
      if (credOf(t.household) === credOf(rec.household)) {
        warn(rec, `${CONSENT_FIELD}: "${target}" is your own household's mark — ignored. Ownership already composes; a household never has to ask itself for permission`);
        continue;
      }
      // a word needs ground under it: a parcel's authority runs over whatever
      // OVERLAPS it (a neighbour straddling the fence answers the same law as one
      // sitting wholly inside), so "no overlap at all" is the only empty case.
      if (isParcel) {
        const pr = rect(rec); pr.w = pr.w || 25; pr.h = pr.h || 25;
        if (!t.at || overlapArea(pr, rect(t)) <= 0)
          warn(rec, `${CONSENT_FIELD}: "${target}" does not touch this parcel — a word without ground under it. It does nothing`);
      }
    }
  }
}

// 9. the two-way channel: a rendering and the word it renders name each other.
//
// A charter article carries `source:` — "this clause renders that document."
// Until now the field parsed and nothing read it, so the fidelity promise (a
// rendering may be incomplete, never untrue) had no machinery under it at all.
// Two lints give it one:
//
//   L-source-1  every `source:` names a file that is actually there.
//   L-source-2  the channel runs BOTH WAYS. The clause names the document, and
//               the document names the clause back — by mark id, on its own
//               "Rendered in the world as `<id>`" line. One-way is how drift
//               starts: the document gets rewritten by someone who has no way
//               of knowing a clause downstairs is quoting it.
//
// A document with nothing in the world yet says so in the same grammar —
// "Rendered in the world: not yet" — and both directions leave it alone.
//
// What is NOT here: whether the clause still SAYS what the source says. That one
// wants a reader, not a parser. These two are what make it reviewable by one —
// they guarantee the pair is findable, mutual, and named.
{
  const FIDELITY = "the-town/the-fidelity";
  // a Rendered line: the phrase at the start of a line, running to the end of its
  // sentence (docs wrap). Mid-sentence mentions — a report QUOTING the grammar —
  // are prose about the channel, not a declaration in it.
  const RENDERED = /^Rendered in the world\b/;
  const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const docs = new Map();
  const readDoc = (rel) => {
    if (docs.has(rel)) return docs.get(rel);
    let text = null;
    try { text = readFileSync(join(REPO, rel), "utf8"); } catch { /* missing/unreadable — L-source-1 says so */ }
    let out;
    if (text == null) out = { missing: true };
    else {
      const lines = text.split(/\r?\n/);
      const spans = [];
      for (let i = 0; i < lines.length; i++) {
        if (!RENDERED.test(lines[i])) continue;
        let span = lines[i], j = i + 1;
        while (!/\.\s*$/.test(span) && j < lines.length && lines[j].trim() !== "") span += " " + lines[j++];
        spans.push(span);
      }
      const ids = new Set();
      let notYet = false;
      for (const s of spans) {
        if (/\bnot yet\b/i.test(s)) { notYet = true; continue; }
        for (const m of s.matchAll(/`([^`]+)`/g)) if (ID_SHAPE.test(m[1])) ids.add(m[1]);
      }
      out = { missing: false, declared: spans.length > 0, notYet, ids };
    }
    docs.set(rel, out);
    return out;
  };

  // ── clause → document ──
  const cited = new Set();
  for (const rec of marks) {
    if (rec._error || rec.source === undefined) continue;
    const rel = String(rec.source).trim().replace(/\\/g, "/");
    if (!rel || /^([a-z]:)?\//i.test(rel) || rel.split("/").includes("..") || rel.includes("\0")) {
      err(rec, `source: ${JSON.stringify(rec.source)} must be a path inside this repository, written from its root (e.g. LOGOS/kinds.md) — a word that stands outside the repo is a word nobody here can check${cite(FIDELITY)}`);
      continue;
    }
    const doc = readDoc(rel);
    if (doc.missing) {
      err(rec, `source: ${rel} names no readable file — a rendering points at the document it renders, and that document has to be there${cite(FIDELITY)}`);
      continue;
    }
    cited.add(rel);
    if (!doc.declared)
      err(rec, `source: ${rel} never names this rendering — add a line "Rendered in the world as \`${rec.id}\`." to ${rel}, so the word knows it is being rendered and cannot be rewritten out from under this clause${cite(FIDELITY)}`);
    else if (doc.notYet)
      err(rec, `source: ${rel} says "Rendered in the world: not yet" — either this clause is early or that line is stale; one of the two must move${cite(FIDELITY)}`);
    else if (!doc.ids.has(rec.id))
      err(rec, `source: ${rel} renders ${[...doc.ids].map((i) => `"${i}"`).join(", ") || "(no id)"} — not "${rec.id}"; name this clause on the document's Rendered line, or point the clause at the document that does render it${cite(FIDELITY)}`);
  }

  // ── document → clause ──
  //
  // Only when the tree being linted IS this repository's own. The lane judges a
  // COMPOSED sketchbook with main's tools: main's documents, a tree that may be a
  // crossing behind them. A clause that has not reached the sketchbook yet is not
  // a lying document, and no resident should ever be bounced for one.
  const ownTree = !SCOPE && resolve(MARKS_DIR) === resolve(join(REPO, "WORLD/marks"));
  if (ownTree) {
    const logosDir = join(REPO, "LOGOS");
    const logos = existsSync(logosDir) ? readdirSync(logosDir).filter((n) => /\.md$/i.test(n)).map((n) => `LOGOS/${n}`) : [];
    for (const rel of [...new Set([...logos, ...cited])].sort()) {
      const doc = readDoc(rel);
      if (doc.missing || !doc.declared || doc.notYet) continue;
      for (const id of doc.ids) {
        const mark = byId.get(id);
        const docErr = (msg) => findings.push({ sev: "ERROR", file: rel, msg });
        if (!mark)
          docErr(`Rendered line names "${id}", which is no mark in the tree — either the clause never landed, or it landed under another id; a document may not claim a rendering that is not there${cite(FIDELITY)}`);
        else if (String(mark.source ?? "").trim().replace(/\\/g, "/") !== rel)
          docErr(`Rendered line names "${id}", but that mark's source: is ${mark.source === undefined ? "absent" : JSON.stringify(mark.source)} — the channel runs both ways or it is not a channel${cite(FIDELITY)}`);
      }
    }
  }
}

// ---- report (lint.mjs idiom: sort, print, exit non-zero only on ERROR) ----
// scoped mode: the whole tree was loaded (edges + cross-author leaf uniqueness
// still checked), but only findings under the scope are reported/gated.
const reported = scopeRel ? findings.filter((f) => f.file.startsWith(scopeRel)) : findings;
const scopedMarks = scopeRel ? marks.filter((m) => at(m).startsWith(scopeRel)).length : marks.length;
const order = { ERROR: 0, WARN: 1 };
reported.sort((a, b) => (order[a.sev] - order[b.sev]) || a.file.localeCompare(b.file));
const errors = reported.filter((f) => f.sev === "ERROR");
const warns = reported.filter((f) => f.sev === "WARN");

// TWO EXIT CODES. There used to be three — 3 meant REPAIR NEEDED, a re-home the
// settlement sweep could perform on the author's behalf. The freeze deleted the
// mover ("The re-home pass is DELETED from the settlement save. The settlement
// writes a mark once; nothing moves it after."), so there is no repair for a
// caller to run and no third answer to give.
//   0  nothing to answer for.
//   1  REFUSED — at least one error. A person has to decide something.
const code = errors.length ? 1 : 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    marks: scopedMarks,
    scope: scopeRel,
    errors: errors.length,
    warnings: warns.length,
    findings: reported,
    exit: code,
  }, null, 2));
  process.exit(code);
}

console.log(`Linted ${scopedMarks} mark(s)${scopeRel ? ` under ${scopeRel}` : ` under ${MARKS_DIR.replace(/\\/g, "/").replace(/^.*\/(WORLD\/marks)$/, "$1")}`}.\n`);
if (!reported.length) console.log("CLEAN — every mark is well-formed and every filing stands where the freeze left it.");
else {
  for (const f of reported) console.log(`[${f.sev}] ${f.file}: ${f.msg}`);
  console.log(`\n${errors.length} error(s), ${warns.length} warning(s).`);
}
process.exit(code);
