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
// The heart of it is the edge check: a mark nested inside another's directory
// asserts an edge — contained-by (sited) or predicated-on (predicated|naming).
// For a nested SITED mark the enclosing mark must GEOMETRICALLY contain it, by
// the very same `contains` the fold uses. You cannot lie with an edge.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, placementParent, polygonOf, ringMatchesClaim, isValidMarkDate, rect, overlapArea } from "./marks-fold.mjs";
import { consentMap, CONSENT_WORDS, CONSENT_FIELD, REGION_CONTAINER_FIELD, REGION_CONTAINER_AUTHOR, isRegionContainer } from "./consent.mjs";

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

const KINDS = new Set(["sited", "predicated", "naming", "parcel"]);
const TIERS = new Set(["constitution", "sovereignty", "market", "draft"]); // v2 protection tiers + draft (gray, 2026-08-09)
const TOWN = "the-town"; // the town-tier author; only it may claim constitution
const CONTAINERS = new Set(["sited", "parcel"]); // only extented things contain or carry
const WORLD_ROOT = "the-town/let-there-be-light"; // placementParent returns null for this frame
const BODY_MAX = 150; // chars (07-22 ruling)
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const findings = [];
const at = (rec) => (rec._dir ? rec._dir.replace(/\\/g, "/").replace(/^.*\/WORLD\//, "WORLD/") : rec.id ?? "?");
const err = (rec, msg) => findings.push({ sev: "ERROR", file: at(rec), msg });
const warn = (rec, msg) => findings.push({ sev: "WARN", file: at(rec), msg });

// terrain ids the tier exposes for `parent: terrain:<id>` attachment
const terrain = existsSync(TERRAIN_PATH) ? JSON.parse(readFileSync(TERRAIN_PATH, "utf8")) : { features: [], far_features: [] };
const TERRAIN_IDS = new Set([...(terrain.features ?? []), ...(terrain.far_features ?? [])].map((f) => f.id));
// the mechanics roster a mark's `mechanic:` may point at (07-23 field)
const REGISTRY = terrain.physics_registry ?? {};

const num = (v) => typeof v === "number" && Number.isFinite(v);
const hasGeom = (rec) => rec.at && num(rec.at.x) && num(rec.at.y) && rec.extent && num(rec.extent.w) && num(rec.extent.h);

const marks = loadMarks(MARKS_DIR);

// the gate quotes the law (rung 1, 2026-08-02): a refusal cites the clause of
// the-town/the-record it enforces — id + body verbatim, so the bounce hands the
// writer an investigable handle and the exact law, never a paraphrase. The
// clauses live in the very tree this gate lints; if a cited clause is missing
// the gate still refuses, and says its own lookup failed (the law never blocks
// on its own absence).
const LAW = new Map(marks.map((m) => [m.id, String(m.body ?? "").trim().replace(/\s+/g, " ")]));
const cite = (clauseId) => {
  const body = LAW.get(clauseId);
  return body
    ? ` — the law: ${clauseId} (a clause of the-town/the-record): "${body}"`
    : ` — the law: ${clauseId} (clause not found in the record; the gate's law lookup failed)`;
};
const byId = new Map();
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
  if (!rec.date || !isValidMarkDate(rec.date)) warn(rec, `date should be YYYY-MM-DD or a full ISO 8601 datetime (got ${JSON.stringify(rec.date)})`);

  // 2. stray legacy fields the tree no longer owns (authorship is `by:` now)
  if (rec._stray?.household != null)
    warn(rec, `legacy household "${rec._stray.household}" — authorship is the by: field now (drop household)`);
  if (rec._stray?.mark != null && rec._stray.mark !== rec.slug)
    warn(rec, `frontmatter mark "${rec._stray.mark}" disagrees with the directory "${rec.slug}" (the directory is the slug — drop the field)`);
  if (rec.stamps !== undefined) warn(rec, `stamps are ledger-derived, never stored in the record — drop the field`);

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
  }
}

// 6. the nesting edge itself — tree = geometry, exactly.
//
// Mere containment is too weak: a house filed under its district passes even
// when its own parcel is the tightest container. Compare the directory edge to
// placementParent, the same smallest-container function the write door uses.
// Parcels are covered too; a parcel directory can lie just as quietly as a
// sited mark's.
for (const rec of marks) {
  if (rec._error || (rec.kind !== "sited" && rec.kind !== "parcel") || !rec.at) continue;
  if (rec.far) continue; // a horizon object (Pando) sits beyond the ground extent by construction (decision 008)
  const actual = rec._parentMarkId === WORLD_ROOT ? null : rec._parentMarkId ?? null;
  const expected = placementParent(rec, marks);
  if (actual !== expected)
    err(rec, `directory parent is "${actual ?? "(root)"}", but placementParent is "${expected ?? "(root)"}" — the edge must name the tightest geometric container (re-home the directory)${cite("the-town/the-gate")}`);
}

// 7. the one-file law (2026-08-02): the only .md inside the record is a mark's
// own mark.md (SCHEMA.md at the top level is the grammar's one exception).
// Anything else must be a full mark in its own directory — everything is a mark.
{
  const walk = (dir, depth) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, depth + 1);
      else if (/\.md$/i.test(name) && name !== "mark.md" && !(depth === 0 && name === "SCHEMA.md"))
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
  const HOUSEHOLDS_PATH = join(REPO, "WORLD/households.json");
  const households = existsSync(HOUSEHOLDS_PATH)
    ? (JSON.parse(readFileSync(HOUSEHOLDS_PATH, "utf8")).households ?? {}) : {};
  const credOf = (handle) => households[handle] ?? `solo:${handle}`;

  for (const rec of marks) {
    if (rec._error) continue;

    // the class-law marker. The ruling grants it to the world root and the town's
    // own region containers; a resident district that could set it would be
    // granting itself fan-up from every neighbour who ever built inside it.
    if (rec[REGION_CONTAINER_FIELD] !== undefined) {
      if (!isRegionContainer(rec))
        err(rec, `${REGION_CONTAINER_FIELD}: must be true or absent (got ${JSON.stringify(rec[REGION_CONTAINER_FIELD])}) — it is a declaration, not a dial`);
      else if (rec.by !== REGION_CONTAINER_AUTHOR)
        err(rec, `${REGION_CONTAINER_FIELD} is the town's — only by: ${REGION_CONTAINER_AUTHOR} may claim it. It takes fan-up from everything sited within, so a resident-authored district declaring it would be granting itself a share of every neighbour's work${cite("the-town/the-tiers")}`);
      else if (rec.kind !== "sited")
        err(rec, `${REGION_CONTAINER_FIELD} belongs on a sited mark — a region is an extent, and "everything sited within" needs a within`);
    }

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
console.log(`Linted ${scopedMarks} mark(s)${scopeRel ? ` under ${scopeRel}` : ` under ${MARKS_DIR.replace(/\\/g, "/").replace(/^.*\/(WORLD\/marks)$/, "$1")}`}.\n`);
if (!reported.length) console.log("CLEAN — every mark is well-formed and no edge lies.");
else {
  for (const f of reported) console.log(`[${f.sev}] ${f.file}: ${f.msg}`);
  const e = reported.filter((f) => f.sev === "ERROR").length;
  const w = reported.filter((f) => f.sev === "WARN").length;
  console.log(`\n${e} error(s), ${w} warning(s).`);
}
process.exit(reported.some((f) => f.sev === "ERROR") ? 1 : 0);
