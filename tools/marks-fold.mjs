#!/usr/bin/env node
// marks-fold.mjs — canon is a fold over the marks register + the stake lines.
// Pure function: (WORLD/marks/**, WORLD/skeleton.json, stakes, prevState?) -> world-state.
// Anyone with a clone can recompute the world. See MARKS.md (the law this implements).
//
// Usage:
//   node tools/marks-fold.mjs                      # fold the repo, write WORLD/world-state.json + WORLD/INDEX.md
//   node tools/marks-fold.mjs --stakes f.json      # override stakes source (sims/tests)
//   node tools/marks-fold.mjs --allow-stampless    # write a zero-escrow world on purpose, saying what it drops
//   node tools/marks-fold.mjs --marks-dir d --prev prev.json --tick N --no-write --json
//
// Stakes source: a JSON file of open positions —
// [{ holder, mark, n, weight, tick }], negative n = withdrawal — passed with
// `--stakes`. `n` is raw escrow; `weight` is its town-derived read-side
// contribution (Σ escrow + k·unique-households across a mark). There is NO default
// source and no money or household-identity parser in this repo (write-release
// P3): the stamp ledger and identity pins live in the TOWN repo, which owns their
// grammar and derives this file for us —
//   (town clone)  node tools/world-stake.mjs --escrow --json > stakes.json
// so exactly one parser reads the money lines across the two repos. Without the
// file the world folds with zero escrow, which is honest for a world that holds
// none — and a silent deletion for one that does, so the WRITE refuses rather
// than the fold (see § the stamp gate).
// (The header used to document a `stake:mark:<id>` grammar the mint could never
// produce — a read-side orphan, flagged 2026-07-23, closed by this pass.)

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { markStanding } from "./mark-standing.mjs";   // the ONE standing rule (see § what the rank is READ FROM)

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const has = (name) => args.includes(name);
const MARKS_DIR = opt("--marks-dir", join(ROOT, "WORLD/marks"));
const TERRAIN_PATH = opt("--terrain", join(ROOT, "WORLD/skeleton.json"));
const STAKES_PATH = opt("--stakes", null);
const PREV_PATH = opt("--prev", null);
const TICK = Number(opt("--tick", 0));
const DIALS = {
  determine_pct: 0.50, release_pct: 0.40,      // hysteresis band (MARKS.md)
  parcel_w: 25, parcel_h: 25,
  ...(opt("--dials", null) ? JSON.parse(readFileSync(opt("--dials"), "utf8")) : {}),
};
// `overlap_site_frac: 0.30` used to live here — the fraction of the smaller mark
// two claims had to share to land in one "site slot". It was never ruled, and the
// clustering it drove CHAINED, so one slot could swallow a whole nesting tree and
// score a peak against its own porch. Deleted, not layered over: the contest is
// now geometric and intersection-only (tools/determination.mjs, ECONOMY.md §9.2).

// A mark's date is day-precision (YYYY-MM-DD) OR a full ISO 8601 datetime — the
// world-write path server-stamps a mark to the second at accept, while the seeded
// marks stay day-precise. Shared by the lint (format check) and the office (write
// stamp), so both agree on what a valid mark date is.
export const MARK_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
export const isValidMarkDate = (s) => MARK_DATE_RE.test(String(s ?? ""));

// ---------- tiny frontmatter parser (records are simple; keep it dependency-free) ----------
export function parseRecord(text, file) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no frontmatter block`);
  const fm = {}; const body = m[2].trim();
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, valRaw] = kv; let val = valRaw.trim();
    if (val.startsWith("{")) { // inline object {x: 1, y: 2} — or a JSON record
      // Strict JSON first (quoted keys, nested arrays/objects): the shape a
      // structured field like `timetable:` needs. The bare {x: 1, y: 2} spelling
      // every at/extent uses is NOT valid JSON, so it falls through to the
      // number-pair scan below exactly as before — this branch is additive.
      let json = null;
      try { json = JSON.parse(val); } catch { /* not JSON — the bare spelling */ }
      if (json !== null && typeof json === "object") val = json;
      else {
        const obj = {};
        for (const pair of val.replace(/[{}]/g, "").split(",")) {
          const p = pair.match(/([\w]+)\s*:\s*(-?[\d.]+)/);
          if (p) obj[p[1]] = Number(p[2]);
        }
        val = obj;
      }
    } else if (val.startsWith("[")) { // a points ring, JSON-ish: [[x,y],…] or [{x,y},…]
      try { val = JSON.parse(val); } catch { /* leave as string; a non-array points ring is simply not honored */ }
    } else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    else if (key === "points" && /^-?[\d.]+\s*,\s*-?[\d.]+(\s+-?[\d.]+\s*,\s*-?[\d.]+)+/.test(val)) {
      // SVG points-attribute style ("x1,y1 x2,y2 …") — the way SVGs define polygons
      const ring = val.trim().split(/\s+/).map((t) => t.split(",").map(Number));
      if (ring.length >= 3 && ring.every((a) => a.length === 2 && a.every(Number.isFinite))) val = ring;
    }
    fm[key] = val;
  }
  return { ...fm, body };
}

// ---------- the frame (SCHEMA v3 § The frame, 2026-08-09) ----------
// A mark's `at:` is written in ITS OWN FRAME — as an offset from the centre of
// the mark it sits inside. The world root IS the frame and keeps world numbers;
// everything nested carries its parent's centre implicitly, so moving a
// container carries its contents with it. The directory tree already says what
// contains what; under v3 the coordinates say it too, and the two cannot drift.
//
// The frame is a property of the TREE, not of the tools: the world root declares
// it on its own record (`coords: relative`, written beside the extent it
// governs), so a clone, a sketchbook, or a temp fixture carries its own frame
// with it. A tree that declares nothing is v2 absolute and loads exactly as it
// always did — the composition below is skipped entirely and `at`/`points` keep
// the very objects the parser built.
//
// Composition happens HERE, once, at load. Everything downstream — the fold, the
// lint, the vessel, the walk engine, the verbs — reads `at` in world coordinates
// and cannot tell which frame the files were written in. That is the whole
// point: exactly one function knows, and it is this one.
// ---------- the tier binding (founder ruling, 2026-08-11 evening) ----------
// A PARENT BINDS A CHILD ONLY IF ITS TIER IS EQUAL OR HIGHER. That one sentence
// governs the frame, and it is the difference between a world where the town's
// own river can be dragged by whoever files a meadow around it and one where it
// cannot.
//
// A BOUND child (parent rank >= child rank) is framed by its parent: its `at:`
// is an offset from that parent's centre, and moving the parent carries it —
// the v3 frame, unchanged.
//
// An OUTRANKING child is framed by the WORLD. Nothing its parent does moves it.
// The directory still says what contains what — a constitution reach may well
// sit inside a resident's canopy, and the tree should say so — but containment
// is no longer authority: the paper says where it stands, not who may move it.
// When geometry drifts so the edge stops naming the tightest container, the
// machinery RE-POINTS the edge (mark-lint's REHOME, applied by the settlement
// sweep). Re-pointing an outranking child is pure paper, because its numbers
// never mentioned its parent in the first place.
//
// A PREDICATE is exempt: it is its parent continued (SCHEMA § the continuation
// law), so it can never outrank what it predicates — the lint refuses one that
// tries, rather than framing it somewhere its parent is not.
//
// ---------- what the rank is READ FROM (Keemin's ruling, 2026-08-12) ----------
// THE ONE WALK, NEVER THE FIELD. The binding rule above is unchanged; what
// changed is where it gets a mark's rank. It used to read the `tier:` line the
// record carried, which let a resident DECLARE authority over their own ground
// — and three of them did, writing `tier: sovereignty` on their houses. Under
// the rule above that made each house OUTRANK the parcel it stands on, so its
// own fence could no longer frame it and it anchored to the world instead:
// exactly the mis-binding this replaces. Standing is derived now
// (tools/mark-standing.mjs), and a resident's derived standing is never above
// market, because the point of "your own parcel is yours" is that your house
// BINDS to your ground and rides when you move it. Ranking above your own fence
// is not sovereignty; it is escaping it.
//
// So the ladder has exactly two live rungs on resident ground — draft below,
// everything else at market — and the town's constitution above them. That is
// the whole of the frame's authority question: is this the town's law, or is it
// not. `tierRank` stays exported (the migration's before-side probe imports it,
// and the schema's own vocabulary is still four words) but NOTHING in the
// engine path reads it any more; `standingRank` is the input.
export const TIER_RANK = { constitution: 3, sovereignty: 2, market: 1, draft: 0 };
export const tierRank = (m) => TIER_RANK[m?.tier] ?? TIER_RANK.market;   // a missing tier is market

// standingRank — the frame's rank, derived by the ONE walk. `byId` carries the
// ancestor chain the walk needs; a caller with no map still gets a true answer
// for everything the walk decides at hop 0 (a parcel, a sovereign structure).
//
// `draft` is the one field read left, and it is not a standing: it says which
// BRANCH a record is on, which no walk over the world's ground can know.
export function standingRank(rec, byId) {
  if (!rec) return TIER_RANK.market;
  if (rec.tier === "draft") return TIER_RANK.draft;
  return markStanding(rec, byId) === "constitution" ? TIER_RANK.constitution : TIER_RANK.market;
}

export const COORDS_FIELD = "coords";
export const COORDS_RELATIVE = "relative";
export const COORDS_ABSOLUTE = "absolute";
export const WORLD_ROOT_SLUG = "let-there-be-light";
const WORLD_ORIGIN = { x: 0, y: 0 };

const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const ringPoint = (p) => (Array.isArray(p) ? (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { x: p[0], y: p[1] } : null) : (isPoint(p) ? p : null));
const isRing = (r) => Array.isArray(r) && r.length > 0 && r.every((p) => ringPoint(p) !== null);

// world frame <-> file frame. The migration (tools/migrate-coords.mjs) runs
// these one way and the loader runs them the other, so the rewrite is the
// loader's own arithmetic backwards — which is why it can be checked exactly
// (tools/coords-equivalence.mjs) rather than merely eyeballed.
export const worldToFile = (at, origin) => ({ x: at.x - (origin?.x ?? 0), y: at.y - (origin?.y ?? 0) });
export const fileToWorld = (at, origin) => ({ x: at.x + (origin?.x ?? 0), y: at.y + (origin?.y ?? 0) });
const shiftRing = (points, origin, xf) => points.map((p) => {
  const q = xf(ringPoint(p), origin);
  return Array.isArray(p) ? [q.x, q.y] : { ...p, x: q.x, y: q.y };   // a ring keeps the spelling it was authored in
});
// A `points:` ring is a SET OF POSITIONS, not a size — it rides the same frame
// as `at` and shifts with it. (An `extent:` is a size: it never moves.)
export const ringToFile = (points, origin) => shiftRing(points, origin, worldToFile);
export const ringToWorld = (points, origin) => shiftRing(points, origin, fileToWorld);

// The frame a tree declares, read off the RECORD and never off the tools. The
// root's word governs; a sub-tree loaded on its own (a fixture, a sketchbook)
// may carry the declaration on whichever record it has.
export function declaredCoords(marks) {
  const onRoot = marks.find((m) => m.slug === WORLD_ROOT_SLUG && m[COORDS_FIELD] !== undefined);
  const decl = onRoot ?? marks.find((m) => m[COORDS_FIELD] !== undefined);
  if (!decl) return COORDS_ABSOLUTE;
  const val = String(decl[COORDS_FIELD]).trim();
  // A frame we cannot read is not a record-level defect to flag and carry on
  // with — it is the whole tree's positions in question. Reading `coords: relatve`
  // as absolute would place every nested mark at its offset and print success,
  // so this refuses instead of guessing.
  if (val !== COORDS_RELATIVE && val !== COORDS_ABSOLUTE)
    throw new Error(`${decl.id}: ${COORDS_FIELD}: ${JSON.stringify(val)} is not a frame this loader knows (${COORDS_ABSOLUTE} | ${COORDS_RELATIVE}) — every position in the tree depends on it, so it will not be guessed`);
  return val;
}

// frameMarks — hand every record the centre its numbers are written against
// (`_origin`), keep the file's own numbers verbatim (`_fileAt`), and, when the
// tree declares the relative frame, compose `at`/`points` into world coordinates.
//
// On a v2 (absolute) tree this ADDS those two underscore fields and touches
// nothing else: `at` and `points` keep their exact objects, so every consumer —
// and the fold's JSON — is byte-identical to what it was before this existed.
function frameMarks(out) {
  const relative = declaredCoords(out) === COORDS_RELATIVE;
  const byId = new Map();
  for (const rec of out) {
    if (isPoint(rec.at)) rec._fileAt = { x: rec.at.x, y: rec.at.y };
    if (!byId.has(rec.id)) byId.set(rec.id, rec);   // a duplicate id is the fold's error to report; first wins here
  }
  const root = out.find((m) => m.slug === WORLD_ROOT_SLUG);
  // The root is the frame itself, so its own numbers are world numbers under
  // BOTH schemas — which is what makes it the thing everything else can be
  // relative to. A tree with no root frames open ground on the world origin.
  const rootCentre = root?._fileAt ? { x: root._fileAt.x, y: root._fileAt.y } : WORLD_ORIGIN;

  const centre = new Map();       // rec -> its composed world centre, or null for a record that carries no position
  const resolving = new Set();    // keyed by RECORD, not id: a duplicated id must not hand its centre to its twin

  const worldCentreOf = (rec) => {
    if (centre.has(rec)) return centre.get(rec);
    if (resolving.has(rec)) return null;
    resolving.add(rec);
    const origin = rec === root ? { ...WORLD_ORIGIN } : frameOriginOf(rec);
    rec._origin = origin;
    const c = rec._fileAt
      ? (relative ? fileToWorld(rec._fileAt, origin) : { x: rec._fileAt.x, y: rec._fileAt.y })
      : null;
    centre.set(rec, c);
    return c;
  };

  // The centre a record's numbers are written against: its nearest POSITIONED
  // ancestor THAT BINDS IT (§ the tier binding — rank >= the record's own). A
  // predicate carries no centre of its own — it is its parent continued (SCHEMA
  // § the continuation law) — so the walk steps past it, and anything the chain
  // cannot bind is framed on the root's centre, which is the world's.
  //
  // The two conditions are deliberately separate. An UNPOSITIONED ancestor is
  // stepped past because it has no centre to offer; an OUTRANKED one is stepped
  // past because it has no authority to offer. Both keep walking; neither is an
  // error here. What the walk can never do is hand a record a centre from a
  // mark that does not bind it.
  const frameOriginOf = (rec) => {
    const continued = rec.kind === "predicated" || rec.kind === "naming";
    const rank = standingRank(rec, byId);
    const walked = new Set([rec]);
    let p = rec._parentMarkId ? byId.get(rec._parentMarkId) : null;
    while (p && !walked.has(p)) {
      walked.add(p);
      const c = worldCentreOf(p);
      if (c && (continued || standingRank(p, byId) >= rank)) return { x: c.x, y: c.y };
      p = p._parentMarkId ? byId.get(p._parentMarkId) : null;
    }
    return { x: rootCentre.x, y: rootCentre.y };
  };

  for (const rec of out) worldCentreOf(rec);
  if (relative) for (const rec of out) {
    const c = centre.get(rec);
    if (c) rec.at = c;
    if (isRing(rec.points)) rec.points = ringToWorld(rec.points, rec._origin);
  }
  return out;
}

// ---------- load marks (07-22 nesting ruling) ----------
// One mark per directory, recorded as `mark.md`. The directory IS the identity
// and the edge: <household> is the top dir; <slug> is the mark's own dir (unique
// per household); a mark nested inside another mark's dir is contained-by (sited)
// / predicated-on (predicated|naming) that enclosing mark — you cannot lie with
// an edge (MARKS.md). Identity is the leaf slug, not the path, so re-nesting a
// mark never changes its id (stakes stay attached). Shared with mark-lint.mjs so
// both read the world from disk the same way. Bad frontmatter is flagged on the
// record (_error), never thrown, so one bad file can't blind the whole fold/lint.
//
// Every record comes back in WORLD coordinates whatever frame the files are
// written in (see § the frame above) — `at` is world, `_fileAt` is what the file
// says, `_origin` is the centre those file numbers are written against.
export function loadMarks(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    walkMarks(p, null, out); // v2: no household from the path; `by` comes from each mark's frontmatter
  }
  return frameMarks(out);
}

function walkMarks(nodeDir, parentMarkId, out) {
  const entries = readdirSync(nodeDir);
  let thisId = parentMarkId;
  if (entries.includes("mark.md")) {
    const slug = basename(nodeDir);
    let rec;
    try {
      rec = parseRecord(readFileSync(join(nodeDir, "mark.md"), "utf8"), `${slug}/mark.md`);
    } catch (e) {
      rec = { _error: e.message, body: "" };
    }
    const by = rec.by;                                     // v2: authorship is frontmatter, not the path
    const stray = { household: rec.household, mark: rec.mark }; // legacy fields the tree no longer owns
    rec.by = by;
    rec.household = by;                                     // back-compat: fold parcel/sovereignty logic keys on household
    rec.tier = rec.tier ?? "market";                       // constitution | sovereignty | market (default)
    rec.slug = slug;
    rec.id = by != null ? `${by}/${slug}` : `?/${slug}`;   // id = by + leaf; a missing `by` is a lint error
    rec._dir = nodeDir;
    rec._parentMarkId = parentMarkId; // the enclosing mark, if any
    rec._stray = stray;
    rec._explicitParent = rec.parent; // as-authored (expected only for terrain refs at top level)
    // predicated/naming take their parent from the enclosing mark dir when nested;
    // at the top level they must name a terrain feature explicitly (terrain:<id>).
    if (rec.kind === "predicated" || rec.kind === "naming") {
      if (parentMarkId) rec.parent = parentMarkId;
    } else {
      delete rec.parent; // sited/parcel never carry an authored parent; containment is geometry
    }
    thisId = rec.id;
    out.push(rec);
  }
  for (const e of entries) {
    if (e === "mark.md") continue;
    const p = join(nodeDir, e);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walkMarks(p, thisId, out);
  }
}

// ---------- load stakes ----------
function loadStakes() {
  if (STAKES_PATH) {
    const j = JSON.parse(readFileSync(STAKES_PATH, "utf8"));
    return j.map(s => ({
      tick: s.tick ?? 0,
      holder: s.holder,
      mark: s.mark,
      n: s.n,
      weight: Number.isFinite(s.weight) ? s.weight : s.n,
    }));
  }
  // No money parser lives here, on purpose (write-release P3).
  //
  // This used to read `WHITE_PAGES/stamp-ledger.md` under the WORLD root for a
  // `stake:mark:<id>` grammar — two things wrong with that, both now closed:
  //   1. The stamp ledger is in the TOWN repo (keeminlee/postmark), not this one, so
  //      the path never existed here and every mark's ✦weight was silently 0.
  //   2. `stake:mark:<id>` was never a line the mint could produce — a read-side
  //      orphan (flagged 2026-07-23). The real class, ruled 2026-07-27 and built in
  //      the town as `stake:world-mark/<mark-id>`, is what carries escrow now.
  //
  // The town OWNS the ledger grammar and hands the world a derived artifact:
  //   (in a town clone)  node tools/world-stake.mjs --escrow --json > stakes.json
  //   (here)             node tools/marks-fold.mjs --stakes stakes.json
  // One parser of the money lines across the two repos, which is why this function
  // no longer knows what a stamp line looks like. A world without that file folds
  // with zero escrow — honest, not broken: no stakes yet means no weight yet. What
  // is NOT honest is publishing that fold over a world-state.json that already
  // carries stamps, so the stamp gate below stands between this and the write.
  return [];
}

// ---------- geometry (the ONE definition now lives in geometry.mjs — pure and
// browser-safe. Imported here for the fold's internal use, and RE-EXPORTED so
// mark-lint.mjs's `import { … rect, contains } from "./marks-fold.mjs"` is
// unchanged. rects are centered on at, sized by extent) ----------
export { rect, overlapArea, contains, marksContain, polygonOf, ringMatchesClaim } from "./geometry.mjs";
import { rect, overlapArea, contains, marksContain } from "./geometry.mjs";
import { carve } from "./determination.mjs";
import { resolveConsent } from "./consent.mjs";

// placementParent(claim, marks) — the geometry-decides-the-parent primitive the
// world-write path (world_leave_mark) calls to DECIDE the directory a new mark
// lands in: the DEEPEST existing mark that contains the new claim. It tests with
// the SAME `marksContain` the lint and fold enforce — coverage-honest when a
// `points:` ring is present (the ring is part of the claim, per the honesty gate),
// bbox-analytic otherwise. NO LONGER a no-op: the five inland water marks carry
// rings, so containment is coverage-based for them (was true of no mark
// carries a ring today). Placement is not a preview — it IS the asserted
// containment edge, so the placer and the enforcer must agree, or a ring-notch
// write would bounce at the lint gate for a writer who did nothing wrong. Bbox
// area still ranks candidates (strictly larger; smallest containing wins).
// Returns the container id, or null when only the world-root contains it
// (null → root). `claim` is any { at, extent, points? }.
export function placementParent(claim, marks, { worldScaleM = 50000 } = {}) {
  const claimArea = rect(claim).w * rect(claim).h;
  let best = null, bestArea = Infinity;
  for (const m of marks) {
    if ((m.kind !== "sited" && m.kind !== "parcel") || !m.at) continue;
    const mr = rect(m), area = mr.w * mr.h;
    if (Math.max(mr.w, mr.h) >= worldScaleM) continue; // the world-root is the frame, never a parent → null means root
    if (area <= claimArea) continue;                    // a parent is strictly larger than its child (the fold's rule)
    if (marksContain(m, claim) && area < bestArea) { best = m; bestArea = area; }
  }
  return best ? best.id : null;
}

// ---------- the fold ----------
// The parcel-claim cap (Keemin's ruling, 2026-07-30): a HOUSEHOLD may CLAIM at
// most 3 parcels. Forward law — holdings dated on/before the law date stand as
// prior estate (the Reeves' four, the founder household's five), they simply
// cannot claim more. Grain note: `household` on a mark is the by: handle; the
// household groups handles by the town's DECLARED registry (see § the household
// grain). A handle absent from the registry is its own household.
export const PARCEL_CLAIM_CAP = 3;
export const PARCEL_CAP_LAW_DATE = "2026-07-30"; // claims dated strictly after this are gated
// Prior estate granted by founder word (the mechanism the refusal text names).
// A mark in this map passes the cap gate: its claim predates the law IN FACT
// but wears a later date — the drain queue dates a parcel at seating, not at
// asking. Case-by-case, dated, quoted; this map is the record.
export const PARCEL_CAP_EXCEPTIONS = new Map([
  ["caelum-reeves/the-still-house-parcel",
    "2026-08-10 Keemin: “They have 4 parcels, it was an early exception before we made the 3 max rule.” — the comment above always said the Reeves' four stand; the still-house is that fourth, dated late by the drain backlog"],
]);
// The parcel dial (MARKS.md § Parcels; locked at the door 2026-07-31, Keemin:
// "the resident should not even have to declare an extent"). Seeded prior
// estate at other sizes stands; the door writes only this.
export const PARCEL_EXTENT_M = 25;

export function fold({ marks, terrain, stakes, prev = null, tick = 0, dials = DIALS, households = null }) {
  const errors = [];
  const terrainIds = new Set((terrain?.features ?? []).map(f => "terrain:" + f.id));
  const byId = new Map();
  for (const mk of marks) {
    if (mk._error) { errors.push({ mark: mk.id, error: mk._error }); continue; }
    if (byId.has(mk.id)) { errors.push({ mark: mk.id, error: "duplicate id" }); continue; }
    byId.set(mk.id, mk);
  }

  // ---------- the household grain (Keemin's rulings, 2026-08-07 + 2026-08-10) ----------
  // A mark's `by:` is a resident HANDLE. A household is the HUMAN behind it:
  // `1 human = 1 household = N residents = up to N GitHub accounts`. Every CONFLICT
  // rule in this fold scopes to the HOUSEHOLD — sovereignty, rivalry, consent —
  // because a conflict between two of one person's own residents is not a conflict
  // at all. Exactly one rule stays at handle grain, by written law:
  //
  //   "every resident-handle may hold one parcel"  — MARKS.md § Parcels
  //
  // so one-parcel-per keeps counting handles while the claim cap (3) and
  // everything downstream count households. `by`/`household` on a record stay the
  // handle — that is what a resident is called, and what the telling says out loud
  // ("+3 more of vermillion's") — and the resolved household rides beside it as
  // `_cred`, published as `declared_household` so a reader can see the grain (the value is a
  // declared slug like `starforge` or `cadaeic.space`, never a credential id).
  //
  // THE KEY IS THE TOWN'S DECLARED HOUSEHOLD SLUG (`cadaeic.space`, `the-rookery`),
  // projected from the town's own registry by tools/households-project.mjs. It is
  // deliberately NOT the credential id: a household may hold SEVERAL accounts —
  // cadaeic.space holds two — so a credential key files one house's residents as
  // strangers to each other, breaking sovereignty and consent for exactly the
  // families the law exists to serve. A handle in no declared household is its own
  // household (`solo:<handle>`): registry lag never blocks a new resident, it only
  // leaves them ungrouped until the town knows them.
  const credHh = (handle) => households?.[handle] ?? `solo:${handle}`;
  for (const mk of byId.values()) mk._cred = credHh(mk.household);

  // admissibility: parcels never overlap (first-in-order wins), one per handle,
  // and — the claim cap, ruled 2026-07-30 — at most PARCEL_CLAIM_CAP claims per
  // CREDENTIAL household for parcels dated after the law (prior estate stands);
  // predicated/naming must not target terrain with a rival intent (attach-only is fine —
  // rivalry-vs-terrain is refused later since terrain has no slot values to rival).
  const parcels = [];
  const parcelByHh = new Map();
  const parcelsByCred = new Map();
  const parcelRectsByCred = new Map();   // cred -> every parcel rect that household holds
  for (const mk of byId.values()) {
    if (mk.kind !== "parcel") continue;
    const r = rect(mk); r.w = r.w || dials.parcel_w; r.h = r.h || dials.parcel_h;
    if (parcelByHh.has(mk.household)) { errors.push({ mark: mk.id, error: "household already holds a parcel (relocation = replace, not add)" }); continue; }
    const cred = credHh(mk.household);
    const held = parcelsByCred.get(cred) ?? 0;
    if (String(mk.date ?? "") > PARCEL_CAP_LAW_DATE && held >= PARCEL_CLAIM_CAP && !PARCEL_CAP_EXCEPTIONS.has(mk.id)) {
      errors.push({ mark: mk.id, error: `parcel claim capped — this credential household already holds ${held} (cap ${PARCEL_CLAIM_CAP} per household, ruled ${PARCEL_CAP_LAW_DATE}; prior estate stands, new claims wait on the founder's word)` });
      continue;
    }
    const clash = parcels.find(p => overlapArea(p._r, r) > 0);
    if (clash) { errors.push({ mark: mk.id, error: `parcel overlaps ${clash.id} — inadmissible (MARKS.md § Parcels)` }); continue; }
    parcels.push({ id: mk.id, household: mk.household, _r: r });
    parcelByHh.set(mk.household, r);
    parcelsByCred.set(cred, held + 1);
    if (!parcelRectsByCred.has(cred)) parcelRectsByCred.set(cred, []);
    parcelRectsByCred.get(cred).push(r);
  }

  // stakes -> per-mark balances (escrow; negative = withdrawal), effect-next-crossing: tick strictly < current
  const stakeByMark = new Map(); const weightByMark = new Map(); const portfolios = new Map();
  // THE BREADTH SPLIT, for weight_parts. The town bakes the unique-household
  // bonus into the FIRST row of each external household (world-stake.mjs §
  // deriveWorldMarkWeights), so `weight - n` on a row is either 0 or exactly k.
  // Reading breadth back out by difference keeps the stake law with exactly one
  // implementation — the town's — and leaves this repo still knowing nothing
  // about money or household identity. `rawByMark` is the unclamped escrow that
  // actually feeds weight; it is deliberately NOT stakeByMark, which the
  // over-withdrawal guard below clamps to 0 while weight keeps the negative.
  const rawByMark = new Map(); const breadthByMark = new Map();
  for (const s of stakes) {
    if (s.tick >= tick && tick > 0) continue; // not yet effective
    // THE RETIREMENT GATE, and it needed no new machinery — only its right name.
    // Keemin's rule (write-release P0, verbatim): "a mark is not retired until it
    // hits 0 stamps. If any resident has stamps on a mark, that mark still exists."
    // Stated as a checkable invariant that is ESCROW IMPLIES EXISTENCE, and this is
    // the line that enforces it: escrow naming a mark the record no longer holds is
    // a fold error, so retiring a staked mark cannot fold clean. A stake is an
    // existence-anchor, so the anchor's absence is the defect, not the stake's.
    if (!byId.has(s.mark) && !terrainIds.has(s.mark)) {
      errors.push({ stake: s, error: `stake on a mark the record does not hold (${s.mark}) — a staked mark cannot be retired; return the escrow first` });
      continue;
    }
    stakeByMark.set(s.mark, (stakeByMark.get(s.mark) ?? 0) + s.n);
    weightByMark.set(s.mark, (weightByMark.get(s.mark) ?? 0) + (s.weight ?? s.n));
    rawByMark.set(s.mark, (rawByMark.get(s.mark) ?? 0) + s.n);
    const bonus = (s.weight ?? s.n) - s.n;
    if (!breadthByMark.has(s.mark)) breadthByMark.set(s.mark, { bonus: 0, rates: [] });
    const breadth = breadthByMark.get(s.mark);
    breadth.bonus += bonus;
    // One bonus-bearing row IS one external household. Only positive rates count
    // toward the household tally — the count answers "how many others backed
    // this", and a withdrawal is not a negative crowd.
    if (bonus > 0) breadth.rates.push(bonus);
    if (!portfolios.has(s.holder)) portfolios.set(s.holder, new Map());
    const pf = portfolios.get(s.holder);
    pf.set(s.mark, (pf.get(s.mark) ?? 0) + s.n);
  }
  for (const [id, n] of stakeByMark) if (n < 0) { errors.push({ mark: id, error: `net stake negative (${n}) — over-withdrawal` }); stakeByMark.set(id, 0); }

  // sovereignty: sited marks fully inside their OWN household's parcel are
  // sovereign leaves — and "own household" is the CREDENTIAL household, so a mark
  // is sovereign inside ANY parcel the household holds, whichever of its handles
  // authored either one. Before the grain ruling this keyed on the handle, so a
  // person with two handles was a stranger on their own ground: their own mark
  // standing in their own parcel folded as a commons mark, exposed to rivalry.
  for (const mk of byId.values()) {
    if (mk.kind === "sited") {
      const held = parcelRectsByCred.get(mk._cred) ?? [];
      mk._sovereign = held.some((pr) => contains(pr, rect(mk)));
    }
  }

  // containment edges (computed, never authored): sited-in-sited by geometry; predicated/naming by parent ref
  const children = new Map(); const parentOf = new Map();
  const sited = [...byId.values()].filter(mk => mk.kind === "sited");
  for (const a of sited) for (const b of sited) {
    if (a === b) continue;
    const ra = rect(a), rb = rect(b);
    // nesting containment honors TRUE SHAPE — a mark's `points:` ring — via
    // marksContain; feature geometry is NEVER passed, so feature marks stay
    // claim-based (bbox) per the 07-23 ruling. Bbox area still ranks candidate
    // parents. Regular-vs-regular delegates to the analytic contains, so the
    // The water marks now carry rings, so this is live: the channel stopped being
    // the tree parent of eight dry-land marks. See CALLS.md's containment table.
    if (ra.w * ra.h > rb.w * rb.h && marksContain(a, b)) {
      // smallest containing wins as parent
      const cur = parentOf.get(b.id);
      if (!cur || rect(byId.get(cur)).w * rect(byId.get(cur)).h > ra.w * ra.h) parentOf.set(b.id, a.id);
    }
  }
  for (const mk of byId.values()) {
    if ((mk.kind === "predicated" || mk.kind === "naming") && mk.parent) {
      if (!byId.has(mk.parent) && !terrainIds.has(mk.parent)) { errors.push({ mark: mk.id, error: `parent '${mk.parent}' not found` }); continue; }
      parentOf.set(mk.id, mk.parent);
    }
  }
  for (const [c, p] of parentOf) { if (!children.has(p)) children.set(p, []); children.get(p).push(c); }

  // ---------- consent (tools/consent.mjs — the three-word `m`) ----------
  // Who may lend weight to whom, and what a `opposed` costs. The default table is
  // the whole of it for a world that has written no words yet: same credential
  // household composes, the town's own region containers take fan-up from what
  // stands in them, and everything else across a household line is simply
  // uncoupled. Read consent.mjs for the law; this is only where it is asked.
  const consent = resolveConsent({
    byId, credOf: credHh, parcels, ownStamps: weightByMark, parentOf, rectOf: rect,
  });
  errors.push(...consent.errors);
  const returned = consent.returned;
  // A returned mark leaves the fold. It is never dropped silently — it left through
  // `returned[]` above, with its ground, its grantor and every member of its subtree
  // named — but from here down it is not part of the world.
  const gone = consent.dropped;
  // Terrain is the town's ground and binds without stamps (MARKS.md § the terrain
  // tier), so a predicate attached to a terrain feature fans up into it by class,
  // exactly as it does into the world root. Terrain carries no household to compare.
  const allowEdge = (p, c) => !gone.has(c) && !gone.has(p) && (terrainIds.has(p) || consent.allow(p, c));

  // fan-up weight: own + the descendants whose edge consents (memoized DFS)
  const weight = new Map();
  const weightOf = (id, seen = new Set()) => {
    if (weight.has(id)) return weight.get(id);
    if (seen.has(id)) return 0; seen.add(id);
    let w = gone.has(id) ? 0 : (weightByMark.get(id) ?? 0);
    for (const c of children.get(id) ?? []) if (allowEdge(id, c)) w += weightOf(c, seen);
    weight.set(id, w); return w;
  };
  for (const id of [...byId.keys(), ...terrainIds]) weightOf(id);

  // ── weight_parts: the receipt for the ✦ number ────────────────────────────
  // Every telling prints one figure and it is three things added together. A
  // reader who sees ✦17 cannot tell whether seventeen people backed this mark,
  // or one did and its parent is carrying a famous child. This says which.
  //
  // THE INVARIANT, and the whole reason it can be trusted as a display change:
  //     own_escrow + breadth.bonus + Σ fanned[].weight === weight
  // exactly. It holds by construction — own_escrow + bonus is precisely what
  // the stake loop put in weightByMark, and fanned re-reads the same memoized
  // child totals weightOf already summed — and tools/weight-parts.test.mjs
  // re-checks it over the whole real fold rather than trusting the argument.
  //
  // Read AFTER the loop above, never during it: `weight` is only complete for
  // every id once every weightOf has returned, and a decomposition built
  // mid-traversal would quietly report a partial subtree.
  //
  // Shaped so a later term slots in as one more component beside `breadth`
  // (a fan-DOWN share, say) without disturbing the two that exist.
  //
  // EMITTED ONLY WHERE IT EXPLAINS SOMETHING (founder's ruling, 2026-08-10).
  // ABSENT MEANS ALL-ZERO — never "unknown". 566 of the 612 marks carry no
  // escrow and nothing inside them, and a uniform-shape skeleton on those cost
  // 104.5 KB of the 117.4 KB this field added to a world-state.json the browser
  // fetches: 89% of the payload spent saying nothing. A reader wanting the
  // uniform shape reads `mk.weight_parts ?? ZERO_PARTS`; a reader wanting the
  // arithmetic can skip the ones that have none.
  //
  // The gate is `!== 0`, not `> 0`, deliberately: an over-withdrawal folds to a
  // NEGATIVE weight, and that is the case most in need of a receipt.
  const partsOf = (id) => {
    const breadth = breadthByMark.get(id) ?? { bonus: 0, rates: [] };
    const households = breadth.rates.length;
    // k is that mark's OWN rate, reported only when there is a bonus to have a
    // rate for — so `bonus === k × external_households` wherever k is non-null.
    // Mixed rates on one mark would mean the artifact disagrees with itself;
    // say null rather than average them into a number nobody declared.
    const uniform = households > 0 && breadth.rates.every((r) => r === breadth.rates[0]);
    const own = rawByMark.get(id) ?? 0;
    if ((weight.get(id) ?? 0) === 0 && own === 0) return null;
    return {
      own_escrow: own,
      breadth: { k: uniform ? breadth.rates[0] : null, external_households: households, bonus: breadth.bonus },
      // Direct children only, and only the ones that actually carry something:
      // a childless-looking list of forty ✦0 entries buries the one child the
      // reader is looking for, and dropping zeroes cannot break the sum.
      //
      // `allowEdge` is the SAME filter weightOf sums through, and it has to be:
      // a child whose edge does not consent contributes nothing to this mark's
      // weight, so listing it here would print a receipt whose lines do not add
      // up to the total they explain. It is also what drops a RETURNED child,
      // which is not in the world at all. This is the one line that keeps the
      // decomposition honest under the consent law, and nothing shouts when it
      // is missing — the sum simply stops being true on the handful of marks
      // that have a cross-household child (the whole suite stayed green while
      // five real marks disagreed with themselves).
      fanned: (children.get(id) ?? [])
        .filter((c) => allowEdge(id, c))
        .map((c) => ({ id: c, weight: weight.get(c) ?? 0 }))
        .filter((f) => f.weight !== 0)
        .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)),
    };
  };
  // Spread at the emit site so an omitted breakdown leaves no key at all, rather
  // than a `weight_parts: null` that every reader would then have to distinguish
  // from a real absence.
  const partsField = (id) => { const p = partsOf(id); return p ? { weight_parts: p } : {}; };
  // The read-side "backed" number the board's reader (site src/lib/board.mjs)
  // renders as `backed`: raw escrow + the breadth bonus — the same ledger_weight
  // world_stake_read serves, WITHOUT fan-up or terrain, because the board shows
  // what residents put behind a notice, not the world's verdict on it. Same trim
  // rule as weight_parts: zero = absent, `!== 0` so a negative fold keeps its
  // receipt.
  const ledgerWeightField = (id) => {
    const lw = (rawByMark.get(id) ?? 0) + (breadthByMark.get(id)?.bonus ?? 0);
    return lw !== 0 ? { ledger_weight: lw } : {};
  };

  // slots: predicated/naming rivalry = same (parent, slot); sited rivalry = overlapping non-sovereign extents
  const slots = new Map(); // key -> { values: Map(value -> stamps), marks: [] }
  for (const mk of byId.values()) {
    if (gone.has(mk.id)) continue;
    if (mk.kind === "predicated" || mk.kind === "naming") {
      if (terrainIds.has(mk.parent) && mk.slot !== "name" && mk.kind === "naming") { /* naming terrain allowed */ }
      const key = `${mk.parent}::${mk.kind === "naming" ? "name" : mk.slot}`;
      if (!slots.has(key)) slots.set(key, { values: new Map(), marks: [] });
      const slot = slots.get(key);
      slot.marks.push(mk.id);
      const v = String(mk.value ?? "");
      slot.values.set(v, (slot.values.get(v) ?? 0) + (weightByMark.get(mk.id) ?? 0));
    }
  }
  // sited ground: the REGION CARVE (tools/determination.mjs, ECONOMY.md §9.2).
  // Contests are intersection-only and rival densities are compared region by
  // region, so a claim is never scored whole against a claim it merely encloses:
  // a dense pond determines its own cells inside a thin meadow, and the meadow
  // keeps the rest. Constitution-tier marks (the root, the town's terrain-grade
  // ground) bind without stamps and cannot be rivaled, so they stay out of the
  // carve entirely — otherwise the world-spanning root would contest every cell
  // of the world it holds.
  const commonsSited = sited.filter(mk => !mk._sovereign && markStanding(mk, byId) !== "constitution" && !gone.has(mk.id));
  const carved = carve(
    commonsSited.map(mk => ({ id: mk.id, cred: mk._cred, rect: rect(mk), effective: weightOf(mk.id) })),
    { prevCells: prev?.cells ?? null, determine_pct: dials.determine_pct, release_pct: dials.release_pct },
  );

  // determination with hysteresis (prev state carries determined values)
  const prevDet = new Map(Object.entries(prev?.determined ?? {}));
  const determined = {}; const vague = []; const rivalries = [];
  for (const [key, slot] of slots) {
    const total = [...slot.values.values()].reduce((a, b) => a + b, 0);
    const entries = [...slot.values.entries()].sort((a, b) => b[1] - a[1]);
    const [topVal, topN] = entries[0] ?? [null, 0];
    const share = total > 0 ? topN / total : 0;
    const prevVal = prevDet.get(key);
    let det = null;
    if (prevVal !== undefined && slot.values.has(prevVal)) {
      const prevShare = total > 0 ? (slot.values.get(prevVal) ?? 0) / total : 0;
      det = prevShare >= dials.release_pct ? prevVal : null;           // incumbent holds till < release
      if (det === null && share > dials.determine_pct) det = topVal;   // challenger takes only past determine
    } else if (share > dials.determine_pct && total > 0) det = topVal;
    if (entries.length > 1 && entries[1][1] > 0) rivalries.push({ kind: "slot", slot: key, values: entries, total, determined: det });
    if (det !== null) determined[key] = det; else if (total > 0 && entries.length > 1) vague.push(key);
  }
  // ground contests join the slot rivalries — same array, two honest shapes: a
  // slot rivalry is about what a thing IS, a region contest is about whose ground
  // a patch of world is. Both carry `kind` so a reader never has to guess.
  rivalries.push(...carved.contests);

  return {
    tick, dials,
    marks: [...byId.values()].filter(mk => !gone.has(mk.id)).map(mk => ({
      // `tier` here is the DERIVED standing (home | constitution | market), not
      // the line the record carries — the store is a published VIEW of the
      // world, and republishing a resident's own claim about their rank was the
      // drift the 08-12 ruling closed. The field keeps its name because every
      // reader across three repos speaks it; renaming it is a migration, not a
      // rename. `sovereign` beside it is still the fold's geometric flag.
      id: mk.id, kind: mk.kind, by: mk.by ?? mk.household, tier: markStanding(mk, byId), household: mk.household,
      // the resolved grain beside the handle — see § the household grain
      declared_household: mk._cred, date: mk.date,
      at: mk.at, extent: mk.extent, parent: mk.parent, slot: mk.slot, value: mk.value, far: mk.far,
      sovereign: !!mk._sovereign, stamps: stakeByMark.get(mk.id) ?? 0, weight: weight.get(mk.id) ?? 0,
      // the ✦ number's receipt — own escrow, the breadth bonus, and each child
      // it fans up from. Sums to `weight` exactly. ABSENT = all zero, which is
      // the ordinary case; see partsOf above for why it is omitted rather than
      // spelled out.
      ...partsField(mk.id),
      body: mk.body,
      // carried through so the engine/assembly can honor them (07-23): mechanic
      // (the machinery that keeps a mark true — physics-registry id), top_m (a
      // mark's vertical prominence), feature (the two-precision survey link),
      // points (the fine shape ring — the FOV silhouette reads it; undefined for
      // every current record, so world-state.json stays byte-identical).
      // timetable (08-07) rides the same way: the schedule a `mechanic: timetable`
      // mark carries — stops by mark id, departures, pace. tools/vessel.mjs derives
      // the vessel's position from THIS fold, never from a file.
      mechanic: mk.mechanic, top_m: mk.top_m, feature: mk.feature, points: mk.points,
      timetable: mk.timetable,
      // the bounty grammar (the board's notices — founder-ruled 2026-08-11)
      // rides the same carried-through lane: without these five in the store,
      // the board page can never see a notice — letter-posted or door-posted
      // alike, the store is the reader's only source. Undefined on every
      // unclassed mark, so a world with no notices serializes as before.
      class: mk.class, ask: mk.ask, reward: mk.reward, status: mk.status, threshold: mk.threshold,
      // a classed mark's PLACEMENT is half its meaning (a notice is a notice
      // because it stands ON the board), and the store never said where sited
      // marks stood — `parent` rides only on predicated/naming. Disclosed here
      // for classed marks alone, in the reader's own field name, so the other
      // 600 marks serialize byte-identically. Whether every sited mark should
      // carry its placement is a daylight question, not this branch's.
      ...(mk.class !== undefined && mk._parentMarkId ? { placementParent: mk._parentMarkId } : {}),
      ...ledgerWeightField(mk.id),
      // `welcomed` across a household line — carried for renderers so a kept mark
      // can be shown as kept. Undefined for every mark nobody has spoken for, so
      // a world with no consent words serializes exactly as it did before.
      ...(consent.kept.has(mk.id) ? { kept: true } : {}),
    })),
    parcels: parcels.map(p => ({ id: p.id, household: p.household, at: { x: p._r.x, y: p._r.y }, extent: { w: p._r.w, h: p._r.h } })),
    determined, vague, rivalries,
    // The carve, as an OVERLAY. Nobody's claim was edited to produce it: each
    // claim rect is whole on disk, and this says which regions of it the world
    // determines to whom. `cells` is the incumbency map the next fold reads for
    // the hysteresis band — a cell inherits whichever prior cell holds its centre,
    // so re-cutting the grid around a new neighbour never unseats an incumbent.
    determination: carved.determination,
    cells: carved.cells,
    portfolios: Object.fromEntries([...portfolios].map(([h, pf]) => [h, [...pf].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([mark, n]) => ({ mark, stamps: n }))])),
    terrain_weight: Object.fromEntries([...terrainIds].map(id => [id, weight.get(id) ?? 0])),
    errors,
    // beside errors, never inside them: a return is not a malformed record, it is
    // a resident's word being honored. Empty for a world nobody has vetoed in.
    returned,
  };
}

// ---------- INDEX render (the v0 table IS the world) ----------
function renderIndex(state) {
  // ⚔ = this mark is in a live contest, of either shape: named in a slot rivalry,
  // or holding ground another household also claims.
  const inContest = (id) => state.rivalries.some(r =>
    r.kind === "region" ? r.claims.some(([cid]) => cid === id) : String(r.slot).includes(id));
  const rows = state.marks
    .filter(mk => !mk.sovereign)
    .sort((a, b) => b.weight - a.weight)
    .map(mk => `| ${mk.id} | ${mk.kind} | ${mk.at ? `${mk.at.x},${mk.at.y}` : (mk.parent ?? "")} | ${mk.slot ? `${mk.slot}=${mk.value}` : ""} | ${mk.stamps} | ${mk.weight} | ${inContest(mk.id) ? "⚔" : ""} |`);
  return `# WORLD — the marks table (derived; do not edit)

*Regenerated by \`tools/marks-fold.mjs\` each crossing. This table is the world;
every render is a view of it. Sorted by weight (own stamps + everything that
depends on it). ⚔ = live rivalry. Sovereign marks (inside parcels) are not
listed here — they are their households' own.*

| mark | kind | where | asserts | stamps | weight | ⚔ |
|---|---|---|---|---|---|---|
${rows.join("\n")}

**Determined:** ${Object.entries(state.determined).map(([k, v]) => `${k} → ${v}`).join(" · ") || "(nothing contested has resolved)"}
**Vague (contested, unresolved — the resting state):** ${state.vague.join(" · ") || "(none)"}
**Ground contests (intersection-only; densities compared region by region):** ${
  (state.rivalries.filter(r => r.kind === "region")).map(r =>
    `${r.claims.map(([id]) => id).join(" ⚔ ")} → ${r.determined ?? "vague"}`).join(" · ") || "(no two households claim the same ground)"}
**Parcels:** ${state.parcels.map(p => `${p.household} @ ${p.at.x},${p.at.y}`).join(" · ") || "(none)"}
${(state.returned ?? []).length ? `\n**Returned (a resident's word honored, not an error):** ${state.returned.map(r => `${r.mark} ← ${r.returned_from} (${r.state})`).join(" · ")}` : ""}
${state.errors.length ? `\n**⚠ fold errors:** ${state.errors.length} (see world-state.json)` : ""}
`;
}

// ---------- the stamp gate ----------
// Escrow enters this fold through exactly one door — `--stakes <export>`, derived
// in a town clone — so a run without it folds every mark at zero. That is honest
// for a world that holds none and a silent deletion for one that does: the site
// FETCHES world-state.json and does not re-fold (tools/world-build.mjs), so a
// routine "re-fold after editing a mark" from a checkout without the export
// republishes the world with every stamp stripped. Found by doing it:
// spike/TIMETABLE-REPORT.md § 6c, 80 records gone in a run that printed success.
// So the write refuses when it would zero a file that carries stamps. A fresh
// build has nothing to drop and needs no ceremony.
function standingStamps(path) {
  if (!existsSync(path)) return null;                                             // a fresh build drops nothing
  let prev;
  try { prev = JSON.parse(readFileSync(path, "utf8")); } catch { return null; }   // unreadable: the write IS the repair
  const marks = (prev?.marks ?? []).filter(mk => Number(mk.stamps) > 0);
  if (!marks.length) return null;
  return {
    marks: marks.length,
    stamps: marks.reduce((n, mk) => n + Number(mk.stamps), 0),
    holders: Object.keys(prev?.portfolios ?? {}).length,
  };
}

// ---------- main ----------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, "/").replace(/^([a-z]):/i, (s) => s.toUpperCase());
if (isMain || basename(process.argv[1] ?? "") === "marks-fold.mjs") {
  const marks = loadMarks(MARKS_DIR);
  const terrain = existsSync(TERRAIN_PATH) ? JSON.parse(readFileSync(TERRAIN_PATH, "utf8")) : null;
  const stakes = loadStakes();
  const prev = PREV_PATH ? JSON.parse(readFileSync(PREV_PATH, "utf8")) : null;
  // The household registry. Absent = every handle is its own household (solo
  // grain), never an error.
  //
  // ⚠ The DEFAULT path is WORLD/households.json, which is currently the wrong
  // thing on two counts: it is keyed by CREDENTIAL ID rather than by the town's
  // declared household, and nothing refreshes it on a cadence (it carries
  // generated_at 2026-08-07 and predates the 2026-08-08 consolidation harvest).
  // Pass `--households <projection>` from tools/households-project.mjs until that
  // export has a named refresh channel and can be made canon. On today's tree the
  // two grains fold identically, which is checked in world-carve-live.test.mjs —
  // but that is a fact about today's marks, not a property of the key.
  const hhPath = opt("--households", join(MARKS_DIR, "..", "households.json"));
  const households = existsSync(hhPath) ? (JSON.parse(readFileSync(hhPath, "utf8")).households ?? null) : null;
  const state = fold({ marks, terrain, stakes, prev, tick: TICK, households });
  if (has("--json")) console.log(JSON.stringify(state, null, 2));
  if (!has("--no-write")) {
    const outPath = join(ROOT, "WORLD/world-state.json");
    const dropping = state.marks.some(mk => mk.stamps > 0) ? null : standingStamps(outPath);
    if (dropping) {
      const held = `${dropping.marks} mark(s) carrying ${dropping.stamps} stamp(s), across ${dropping.holders} portfolio(s)`;
      if (!has("--allow-stampless")) {
        console.error(`REFUSING TO WRITE ${outPath} — it would strip every stamp the world holds.

  on disk:    ${held}
  this fold:  no stakes were loaded, so every mark folds at zero escrow

The site fetches this file and does not re-fold, so writing it now would publish
the world with its escrow deleted and print success while doing it.

Escrow has one source — the town owns the ledger grammar and derives it for us:
  (town clone)  node tools/world-stake.mjs --escrow --json > stakes.json
  (here)        node tools/marks-fold.mjs --stakes stakes.json

If a world with no escrow is genuinely what you mean, say so and it will name
what it drops:
  node tools/marks-fold.mjs --allow-stampless

To read the fold without writing it at all: --no-write --json`);
        process.exit(1);
      }
      console.error(`--allow-stampless: dropping ${held} from ${outPath} — republishing the world with zero escrow.`);
    }
    mkdirSync(join(ROOT, "WORLD"), { recursive: true });
    writeFileSync(outPath, JSON.stringify(state, null, 2) + "\n");
    writeFileSync(join(ROOT, "WORLD/INDEX.md"), renderIndex(state));
    const ground = state.rivalries.filter(r => r.kind === "region");
    console.log(`fold: ${state.marks.length} marks · ${state.parcels.length} parcels · ${Object.keys(state.determined).length} determined · ${state.vague.length} vague · ${state.rivalries.length - ground.length} slot rivalries · ${ground.length} ground contests · ${state.returned.length} returned · ${state.errors.length} errors`);
  }
}
