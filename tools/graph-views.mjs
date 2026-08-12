#!/usr/bin/env node
// graph-views.mjs — the convergence instrument. Three readings of one world.
//
// THIS TOOL PRODUCES A PROJECTION. Its output is regenerable from the clone and
// stored as truth by nobody — the lawful kind of artifact under the north star's
// second question (LOGOS/the-north-star.md § the two-question lint). Delete the
// HTML and nothing is lost; run it again and you have it back. It is therefore
// gitignored, and it must never become an input to anything.
//
// Its two questions, answered:
//   Q1 (name your class-node) — n/a: this is a READ, not a write surface. It
//      declares no edge and cites no class, because it changes nothing.
//   Q2 (name your derivation) — every number below is derived at run time from
//      WORLD/marks/**, WORLD/world-state.json, STATE/log/*.jsonl, and
//      WRITE-REGISTRY.md. Nothing is cached, seeded, or hand-kept in here except
//      the MEASURES mapping, which is flagged in its own comment.
//
//   node tools/graph-views.mjs [--repo <world-clone>] [--view practical|ideal|diff]
//                              [--out graph-views.html]
//
// ---------- why three views ----------
// The world is mid-cutover. The machinery holds it one way (records with fields,
// a store that republishes some of them); LOGOS says it is another way (one node
// type, identity plus predicate children, every relation an edge, everything
// derivable derived). Neither picture alone tells the founder how far the
// crossing has got. So: the practical view is what IS, painted with its
// violations; the ideal view is what the law derives, with every place the
// substrate is MISSING rendered as a named hole rather than as invented data;
// and the diff is the two counted against each other, keyed to WRITE-REGISTRY.md
// so the instrument and the registry cannot drift apart in silence.
//
// ---------- the one rule this tool obeys hardest ----------
// IT RE-IMPLEMENTS NOTHING. Standing comes from tools/mark-standing.mjs (whose
// header forbids a second copy of the walk), the tree from marks-fold.mjs's
// loadMarks. Where this file computes something the engine does not — the raw
// frontmatter census, the field partition — it is because the engine genuinely
// has no such notion, and each one says so at its definition.
//
// The engine is imported from the TARGET clone, not from this file's own
// directory: pointing --repo at another world and reading it through this
// world's walk would be a quiet lie about whose law produced the picture.

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

const REPO = opt("--repo", join(HERE, ".."));
const VIEW = opt("--view", "all");
const OUT = opt("--out", join(process.cwd(), "graph-views.html"));

if (!existsSync(join(REPO, "WORLD", "marks"))) {
  console.error(`not a world clone: ${REPO}\n  (looked for WORLD/marks — pass --repo <path-to-postmark-world>)`);
  process.exit(1);
}

// The engine, from the clone being read. See the header.
const engine = (rel) => pathToFileURL(join(REPO, "tools", rel)).href;
const { loadMarks, parseRecord } = await import(engine("marks-fold.mjs"));
const { markStanding } = await import(engine("mark-standing.mjs"));

// ═══════════════════════════════════════════════════════════════════════════
// THE FIELD PARTITION — the law's own placement discipline, applied to a
// frontmatter key. LOGOS/the-north-star.md § the placement discipline says
// where each datum belongs; LOGOS/kinds.md § the node says what is and is not a
// property. This table is that law read as a lookup, and it is the one piece of
// judgment in this file — every classification below cites the clause it comes
// from, so a disagreement is arguable against a text rather than against taste.
//
// NEEDS SYNC: a new frontmatter key appears here as `unclassified`, which the
// views render loudly rather than silently bucketing. That is deliberate — an
// unrecognised field is exactly the thing a shadow grammar arrives as.
// ═══════════════════════════════════════════════════════════════════════════
const FIELD_ROW = {
  // → IDENTITY. "Identity is two atoms: a slug and a class" (kinds.md § the
  // node). The slug is the directory name, so on disk identity is one field.
  kind:      "identity",   // the class atom, in the vocabulary the tree speaks today
  class:     "identity",   // the registered class name, on the eleven class-nodes

  // → EDGES. "relational data — authorship (`by:` is the create-edge, not a
  // field), position and frame (the containment edge plus an offset)" (kinds.md).
  by:          "edge",     // the create-edge, stored as a field
  parent:      "edge",     // the containment edge, authored (predicates only)
  at:          "edge",     // an offset — meaningful only through the containment edge
  extent:      "edge",     // the footprint that offset governs
  points:      "edge",     // a ring of positions; rides the same frame as `at`
  coords:      "edge",     // which frame the numbers are written in
  anchor:      "edge",     // where the offset is measured from
  derived_from:"edge",     // provenance — a citation of a source, which is a relation
  implements:  "edge",     // class → class
  extends:     "edge",     // class → class

  // → NOWHERE. "standing, rank, canon, world position, affordances — derived,
  // stored by no one" (the-north-star.md § the placement discipline).
  tier:      "derived",    // the one walk decides standing; a record cannot assert it
  household: "derived",    // the grain, resolvable from `by` through households.json

  // → THE LOG. "events: {seq, actor, witnesses, class, payload}". A birth date
  // is a fact about the action that made the node, not about the node.
  date:      "log",

  // → PREDICATE. The (slot, value) pair IS a predicate's identity payload —
  // "predicates are the atoms of authorship" (kinds.md § the node). These two
  // keys are the only ones already in lawful shape on disk.
  slot:      "predicate",
  value:     "predicate",

  // → PROPERTY. Genuine authored properties, every one of which should be a
  // predicate child hanging off the node rather than a field inside it.
  source: "property", pre: "property", mechanic: "property", mechanic_draft: "property",
  feature: "property", version: "property", dials: "property", affordances: "property",
  mobility: "property", far: "property", propagation: "property", exempt: "property",
  ambient: "property", timetable: "property", top_m: "property",
  ask: "property", reward: "property", status: "property", threshold: "property",
  consent: "property",  // the welcome word — a property of the ground-holder's record
};

// ═══════════════════════════════════════════════════════════════════════════
// READERS — every one of them read-only. This tool opens exactly one file for
// writing, and it is --out.
// ═══════════════════════════════════════════════════════════════════════════

// The raw frontmatter census — which keys are actually WRITTEN on disk.
//
// This has to exist because loadMarks does not preserve the question: it
// DEFAULTS `tier` to "market" on every record it returns and synthesizes
// `slug`, `id`, `household` (marks-fold.mjs § walkMarks), so by the time a
// record reaches any downstream reader, "the author wrote this down" and "the
// loader supplied it" are indistinguishable. The whole tier cutover is a
// question about the first of those, so the census re-reads the file.
//
// It re-reads it through the loader's OWN `parseRecord`, never a second parser.
// The first draft of this function hand-rolled the frontmatter scan and dropped
// the last key of every CRLF file — nine records, all of them the town's own
// constitution — which is exactly the drift a second parser is for.
function rawFrontmatter(marks) {
  const raw = new Map();
  for (const m of marks) {
    let keys = [], tier = null;
    try {
      const rec = parseRecord(readFileSync(join(m._dir, "mark.md"), "utf8"), m.id);
      keys = Object.keys(rec).filter((k) => k !== "body");
      tier = rec.tier != null ? String(rec.tier) : null;
    } catch { /* a record the loader already flagged with _error; the census skips it */ }
    raw.set(m.id, { keys, tier });
  }
  return raw;
}

// The published store, AS IT SITS ON DISK. Not re-folded — the point of the
// practical view is what the machinery is holding right now, and a store written
// before a ruling is exactly the kind of thing the founder needs to see.
function readStore(repo) {
  const p = join(repo, "WORLD", "world-state.json");
  if (!existsSync(p)) return null;
  try {
    const s = JSON.parse(readFileSync(p, "utf8"));
    return { ...s, _mtime: statSync(p).mtime.toISOString() };
  } catch (e) { return { _error: e.message, marks: [] }; }
}

// The action log — such as it is. STATE/log/<crossing>.jsonl, one JSON record
// per line. This is the nearest thing the world has to the north star's log, and
// reading it is how the ideal view can say what fraction of the graph's edges
// could cite an action at all.
function readLog(repo) {
  const dir = join(repo, "STATE", "log");
  const out = { records: [], crossings: 0, unreadable: 0 };
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".jsonl")) continue;
    out.crossings++;
    for (const line of readFileSync(join(dir, f), "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { out.records.push(JSON.parse(line)); } catch { out.unreadable++; }
    }
  }
  return out;
}

function readLedger(repo) {
  const p = join(repo, "WORLD", "walk-ledger.md");
  if (!existsSync(p)) return { lines: 0 };
  const lines = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => /^- \d{4}-\d{2}-\d{2}T/.test(l));
  return { lines: lines.length };
}

function readHouseholds(repo) {
  const p = join(repo, "WORLD", "households.json");
  if (!existsSync(p)) return { count: 0, generated_at: null };
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return { count: Object.keys(j.households ?? {}).length, generated_at: j.generated_at ?? null };
  } catch { return { count: 0, generated_at: null }; }
}

// WRITE-REGISTRY.md, parsed. The registry is the SOURCE for row names and
// statuses; this tool only counts against it. Parsing is deliberately shallow —
// a markdown table row, first cell is the surface, last cell is the status —
// because a shallow parse that fails loudly beats a clever one that half-works.
// If the registry's shape changes, the section headings and row counts printed
// on the diff tab go wrong in a way a reader notices immediately.
function readRegistry(repo) {
  const p = join(repo, "WRITE-REGISTRY.md");
  if (!existsSync(p)) return { sections: [], missing: true };
  const sections = [];
  let current = null;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { current = { title: h[1].trim(), rows: [] }; sections.push(current); continue; }
    if (!current || !line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;   // the ---|---|--- rule
    if (/^surface$/i.test(cells[0])) continue;              // the header row
    // The status is the first bold run in the LAST cell that opens with a
    // shouted word. Last cell only, because other cells bold their own prose
    // (`**no door exists**`) and a whole-row scan would read that as a verdict;
    // shouted-word-first, because the run's tail is the registry's own spelling
    // and varies — `ADHERES`, `CUTOVER #1`, `VIOLATING by covenant` — so it is
    // captured whole and shown as written rather than normalised into a
    // vocabulary this file would then have to keep in sync.
    const note = cells[cells.length - 1];
    const status = (note.match(/\*\*([A-Z]{3,}[^*]*)\*\*/) ?? [])[1]?.trim() ?? "?";
    current.rows.push({ surface: cells[0], status, note, key: rowKey(cells[0]) });
  }
  return { sections: sections.filter((s) => s.rows.length), missing: false };
}

// A registry row's stable key: the surface name up to its first parenthesis or
// slash-alternative, lowercased. `mark birth (world_leave_mark, PR lane)` →
// `mark birth`. Short enough to be typed into MEASURES by hand, specific enough
// not to collide across the registry's fourteen rows.
function rowKey(surface) {
  return surface.replace(/\(.*?\)/g, "").replace(/`/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MODEL — one pass over the clone, producing everything all three views
// need. Computed once so the three tabs cannot disagree with each other.
// ═══════════════════════════════════════════════════════════════════════════
function buildModel() {
  const marks = loadMarks(join(REPO, "WORLD", "marks"));
  const byId = new Map(marks.map((m) => [m.id, m]));
  const raw = rawFrontmatter(marks);
  const store = readStore(REPO);
  const log = readLog(REPO);
  const ledger = readLedger(REPO);
  const households = readHouseholds(REPO);
  const registry = readRegistry(REPO);

  // Standing, from the ONE walk. Never re-derived anywhere else in this file.
  const standing = new Map(marks.map((m) => [m.id, markStanding(m, byId)]));

  // The registered class-nodes — the closure the north star's first question
  // depends on ("a class not in the graph cannot be addressed").
  // A class-node DECLARES a class (it carries `class:`, and with it the version,
  // dials and implements that make a class a class). Every other node NAMES one
  // — today through `kind:`, whose four words are the older vocabulary and only
  // one of which (`parcel`) has a class-node behind it. The two are counted
  // apart because conflating them would report the registry as its own
  // membership and make the closure look far healthier than it is.
  const classNodes = marks.filter((m) => m.class != null);
  const registered = new Set(classNodes.map((m) => String(m.class)));
  const namesRegistered = (m) => m.class != null || registered.has(String(m.kind ?? ""));
  const citing = marks.filter(namesRegistered).length;
  const unregKinds = new Map();
  for (const m of marks) if (!namesRegistered(m)) unregKinds.set(m.kind ?? "(none)", (unregKinds.get(m.kind ?? "(none)") ?? 0) + 1);
  const unregisteredKinds = [...unregKinds].sort((a, b) => b[1] - a[1]);

  // The field census, partitioned by the law's placement table.
  const census = { identity: 0, edge: 0, derived: 0, log: 0, predicate: 0, property: 0, unclassified: 0 };
  const unclassifiedKeys = new Map();
  const propertyKeys = new Map();
  const keysOnDisk = new Set();
  for (const m of marks) {
    for (const k of raw.get(m.id)?.keys ?? []) {
      keysOnDisk.add(k);
      const row = FIELD_ROW[k] ?? "unclassified";
      census[row]++;
      if (row === "unclassified") unclassifiedKeys.set(k, (unclassifiedKeys.get(k) ?? 0) + 1);
      if (row === "property") propertyKeys.set(k, (propertyKeys.get(k) ?? 0) + 1);
    }
  }

  // The tier field's three populations. The walk reads the field in exactly one
  // case — the town's own constitution, read BELOW the walk because the town is
  // speaking about the town's ground (mark-standing.mjs § the one exception).
  // Every other carrier states nothing, which is what "inert" means here.
  const tierCarriers = marks.filter((m) => raw.get(m.id)?.tier != null);
  const tierRead = tierCarriers.filter((m) => m.by === "the-town" && raw.get(m.id).tier === "constitution");
  const tierInert = tierCarriers.filter((m) => !(m.by === "the-town" && raw.get(m.id).tier === "constitution"));

  // Containment: the constitutive edge, one per node but the root.
  const containment = marks.filter((m) => m._parentMarkId != null);

  // The store, measured against the walk it claims to publish. A disagreement
  // here is not a bug in either — it is the store being older than a ruling.
  const storeById = new Map((store?.marks ?? []).map((m) => [m.id, m]));
  let storeTierDisagrees = 0, storeSeen = 0;
  for (const m of marks) {
    const s = storeById.get(m.id);
    if (!s) continue;
    storeSeen++;
    if (s.tier !== standing.get(m.id)) storeTierDisagrees++;
  }
  const storePlacement = (store?.marks ?? []).filter((m) => m.placementParent).length;

  // The log, read for what the ideal view needs from it: can an edge cite an
  // action? Only if the action is IN the log and addressable by seq.
  const logTypes = {};
  let logWitnessed = 0, logSeq = 0, logClassed = 0;
  for (const r of log.records) {
    logTypes[r.type ?? "?"] = (logTypes[r.type ?? "?"] ?? 0) + 1;
    if (r.witnesses) logWitnessed++;
    if (Number.isFinite(r.seq)) logSeq++;
    const named = r.payload?.class ?? r.type;
    if (registered.has(named)) logClassed++;
  }
  // A mark BIRTH is a git commit, not a log record (WRITE-REGISTRY: "records =
  // log (git)"). Lawful under the north star's floor-of-the-turtle clause, and
  // still the reason no containment edge can name a seq: the two logs do not
  // share an address space.
  const birthsInLog = log.records.filter((r) => r.type === "birth" || r.type === "declare").length;
  const amendments = log.records.filter((r) => ["amend", "withdraw", "respond"].includes(r.type)).length;

  const consentWords = marks.filter((m) => m.consent != null).length;

  return {
    repo: REPO, generatedAt: new Date().toISOString(),
    marks, byId, raw, standing, store, log, ledger, households, registry,
    classNodes, registered, citing, unregisteredKinds, census, unclassifiedKeys, propertyKeys, keysOnDisk,
    tierCarriers, tierRead, tierInert, containment,
    storeSeen, storeTierDisagrees, storePlacement,
    logTypes, logWitnessed, logSeq, logClassed, birthsInLog, amendments, consentWords,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MEASURES — the bridge from a WRITE-REGISTRY.md row to a number this clone can
// actually produce.
//
// NEEDS SYNC WITH WRITE-REGISTRY.md. The registry owns the rows; this owns only
// the counting. The keys below are `rowKey()` of a registry surface name, and
// the diff view reports BOTH directions of drift: a registry row with no measure
// renders as "not measured" with its reason, and a measure whose key matches no
// registry row renders as a loud DRIFT banner. A shallow parse plus a visible
// mismatch was the smaller choice over a clever parse that could silently
// mis-bind a row.
// ═══════════════════════════════════════════════════════════════════════════
const MEASURES = {
  "mark birth": (m) => [
    { label: "nodes in the tree", now: m.marks.length, of: null, target: null, note: "the population, not a violation" },
    { label: "containment edges", now: m.containment.length, of: m.marks.length, target: null, note: "one per node but the root" },
    { label: "births addressable by log seq", now: m.birthsInLog, of: m.marks.length, target: m.marks.length,
      note: "births are git commits; the graph edge cannot name a seq" },
  ],
  "walk": (m) => [
    { label: "departure records in the log", now: m.logTypes.departure ?? 0, of: m.ledger.lines, target: m.ledger.lines,
      note: "the ledger is the older store of the same fact" },
  ],
  "say": (m) => [
    { label: "emission records in the log", now: m.logTypes.emission ?? 0, of: null, target: null, note: "" },
    { label: "log records naming a registered class", now: m.logClassed, of: m.log.records.length, target: m.log.records.length, note: "" },
    { label: "log records carrying witnesses", now: m.logWitnessed, of: m.log.records.length, target: m.log.records.length,
      note: "the north star's log shape is {seq, actor, witnesses, class, payload}" },
  ],
  "stake / unstake": (m) => [
    { label: "households present as nodes", now: 0, of: m.households.count, target: m.households.count,
      note: "the backing edge's source node is not in the graph" },
  ],
  "settlement": (m) => [
    { label: "store records published", now: m.store?.marks?.length ?? 0, of: m.marks.length, target: m.marks.length, note: "" },
  ],
  "tier field on records": (m) => [
    { label: "records carrying a raw tier field", now: m.tierCarriers.length, of: m.marks.length, target: 0, note: "" },
    { label: "of those, inert (no reader has authority)", now: m.tierInert.length, of: m.tierCarriers.length, target: 0,
      note: "the walk reads the field only for the town's own constitution" },
    { label: "store tier disagreeing with the walk", now: m.storeTierDisagrees, of: m.storeSeen, target: 0,
      note: "a stale store is a projection older than a ruling" },
  ],
  "amend / withdraw / respond": (m) => [
    { label: "amend/withdraw/respond actions logged", now: m.amendments, of: null, target: null, note: "no door exists to make one" },
  ],
  "dials": (m) => [
    { label: "class-nodes declaring non-empty dials", now: m.classNodes.filter((c) => c.dials && Object.keys(c.dials).length).length,
      of: m.classNodes.length, target: m.classNodes.length, note: "an empty dials map means the dial is still a code constant" },
  ],
  "fold views": (m) => [
    { label: "store records carrying placementParent", now: m.storePlacement, of: m.store?.marks?.length ?? 0, target: m.store?.marks?.length ?? 0,
      note: "the edge the 2026-08-12 conferred-sovereignty ruling added" },
  ],
  "crossing-save": (m) => [
    { label: "crossings on disk", now: m.log.crossings, of: null, target: null, note: "" },
    { label: "log records across them", now: m.log.records.length, of: null, target: null, note: "" },
  ],
  "movement storage": (m) => [
    { label: "walk-ledger departure lines", now: m.ledger.lines, of: null, target: 0,
      note: "cutover #1 retires the bespoke line grammar into the log" },
  ],
  "identity": (m) => [
    { label: "households in households.json", now: m.households.count, of: null, target: 0,
      note: "a derived registry outside the graph; cutover #2 gives it graph residence" },
    { label: "consent words on disk", now: m.consentWords, of: null, target: null,
      note: "the one conferral the walk honours — nobody has written one yet" },
  ],
  "mail": () => [
    { label: "measured here", now: null, of: null, target: null, note: "mail lives in the town repo, outside this clone and outside the taxonomy by covenant" },
  ],
  "logos amendments": (m) => [
    { label: "amendment actions in the log", now: 0, of: null, target: null, note: "founder commits; the door is not on the map yet" },
  ],
  "the-record renderings": (m) => [
    { label: "nodes under the-record", now: m.marks.filter((x) => x._dir.replace(/\\/g, "/").includes("/the-record/")).length,
      of: null, target: null, note: "" },
  ],
  // The registry row this instrument was asked to answer (WRITE-REGISTRY.md
  // commit 5579baa4: "first machine form ships with the graph-views
  // instrument"). FIELD_ROW at the top of this file IS that form — the
  // trichotomy of LOGOS/kinds.md, written as a lookup a machine can run. It is
  // a WAY STATION, not the destination: the row's destination is payload
  // schemas on class-nodes, and a table in a read-only projection is only the
  // first thing that can be counted.
  "the serialization mapping": (m) => [
    { label: "distinct frontmatter keys mapped by the trichotomy",
      now: Object.keys(FIELD_ROW).filter((k) => m.keysOnDisk.has(k)).length, of: m.keysOnDisk.size, target: m.keysOnDisk.size,
      note: "the machine form is FIELD_ROW in tools/graph-views.mjs; the destination is payload schemas on class-nodes" },
    { label: "field instances whose destination is a predicate child", now: m.census.property, of: null, target: 0, note: "" },
    { label: "field instances whose destination is an edge", now: m.census.edge, of: null, target: 0, note: "" },
    { label: "field instances whose destination is nowhere (derived)", now: m.census.derived, of: null, target: 0, note: "" },
  ],
};

// The measures the ideal view owns outright — they answer to the law rather than
// to any single registry row, so they get their own block instead of being
// forced into one.
function lawMeasures(m) {
  const propertyFields = m.census.property;
  const predicateNodes = m.marks.filter((x) => x.kind === "predicated").length;
  const denom = propertyFields + predicateNodes;
  return [
    { label: "class-nodes in the registry", now: m.classNodes.length, of: null, target: null,
      note: `${[...m.registered].sort().join(", ")} — these ARE the registry, not citations of it` },
    { label: "nodes naming a registered class", now: m.citing, of: m.marks.length, target: m.marks.length,
      note: `the rest speak the older vocabulary — ${m.unregisteredKinds.map(([k, n]) => `kind: ${k} (${n})`).join(", ")} — and a class not in the graph cannot be addressed` },
    { label: "properties expressed as predicate nodes", now: predicateNodes, of: denom, target: denom,
      note: `${propertyFields} genuine properties are still frontmatter fields — commonest: `
        + [...m.propertyKeys].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`).join(", ") },
    { label: "relations expressed as edges", now: 0, of: m.census.edge, target: m.census.edge,
      note: "every relational datum on disk is a field — by:, at:, parent:, derived_from:" },
    { label: "derivables stored on records", now: m.census.derived, of: null, target: 0,
      note: "tier and household, both derivable, both written down" },
    { label: "unclassified frontmatter keys", now: m.census.unclassified, of: null, target: 0,
      note: m.unclassifiedKeys.size ? [...m.unclassifiedKeys.keys()].join(", ") : "none — every key on disk maps into the law's placement table" },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════════
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const excerpt = (s, n = 120) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// The world's own colour vocabulary, lifted from spectator/viewer.mjs's STYLE
// block (Keemin 2026-07-23, draft added 2026-08-04): constitution → blue,
// home/sovereign → green, market → amber, draft → cool grey. Same names, same
// hexes, so a reader who knows the viewer knows this page.
const STANDING_CLASS = { constitution: "s-blue", home: "s-green", market: "s-amber", draft: "s-draft" };

function childrenOf(model) {
  const kids = new Map();
  for (const m of model.marks) {
    const p = m._parentMarkId;
    if (!p) continue;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(m);
  }
  for (const list of kids.values()) list.sort((a, b) => a.slug.localeCompare(b.slug));
  return kids;
}

// ── the practical view: what the machinery holds, violations painted ─────────
function renderPractical(model) {
  const kids = childrenOf(model);
  const roots = model.marks.filter((m) => !m._parentMarkId);
  const storeById = new Map((model.store?.marks ?? []).map((m) => [m.id, m]));

  // Which published fields are derivables the store republishes. Named here
  // rather than inferred, because "derivable" is a claim about the law and the
  // law is a text, not a heuristic.
  const STORED_DERIVABLE = {
    tier: "standing — the one walk decides it",
    weight: "a fold over the stakes",
    stamps: "a sum over the ledger",
    sovereign: "a geometric flag",
    declared_household: "the grain, resolved from the create-edge",
    weight_parts: "the ✦ number's receipt",
  };

  const node = (m, depth) => {
    const st = model.standing.get(m.id);
    const r = model.raw.get(m.id) ?? { keys: [] };
    const s = storeById.get(m.id);
    const flags = [];
    if (r.tier != null) {
      const inert = !(m.by === "the-town" && r.tier === "constitution");
      flags.push(`<span class="f f-tier${inert ? " f-inert" : ""}">tier: ${esc(r.tier)}${inert ? " · inert" : " · read"}</span>`);
    }
    if (s) {
      // Named per node so the founder can see WHICH derivables this record's
      // published row carries; the meaning of each name is in the legend, not
      // in 623 copies of the same tooltip.
      const derived = Object.keys(STORED_DERIVABLE).filter((k) => s[k] !== undefined && s[k] !== null && s[k] !== false && s[k] !== 0);
      if (derived.length) flags.push(`<span class="f f-stored">stored: ${derived.join(", ")}</span>`);
      if (s.tier !== st) flags.push(`<span class="f f-stale">store says ${esc(s.tier)}</span>`);
    } else if (model.store) {
      flags.push(`<span class="f f-stale">not in the store</span>`);
    }
    if (m._parentMarkId) flags.push(`<span class="f f-edge">edge · no action</span>`);
    const kid = kids.get(m.id) ?? [];
    const head = `<span class="dot ${STANDING_CLASS[st] ?? "s-amber"}"></span>`
      + `<code class="id">${esc(m.id)}</code>`
      + `<span class="kind">${esc(m.kind ?? "?")}</span>`
      + (m.class ? `<span class="cls">class: ${esc(m.class)}</span>` : "")
      + flags.join("")
      + (kid.length ? `<span class="count">${kid.length}</span>` : "");
    const body = m.body ? `<div class="body">${esc(excerpt(m.body))}</div>` : "";
    if (!kid.length) return `<li class="leaf">${head}${body}</li>`;
    return `<li><details${depth < 1 ? " open" : ""}><summary>${head}</summary>${body}<ul>`
      + kid.map((c) => node(c, depth + 1)).join("") + `</ul></details></li>`;
  };

  const st = { constitution: 0, home: 0, market: 0 };
  for (const v of model.standing.values()) st[v] = (st[v] ?? 0) + 1;

  const storeNote = model.store
    ? `<p class="note">The published store on disk was written <b>${esc(model.store._mtime)}</b>. Of the ${model.storeSeen} records it shares with the tree, <b class="warn">${model.storeTierDisagrees}</b> carry a <code>tier</code> the one walk no longer agrees with, and <b class="warn">${model.storePlacement}</b> carry the <code>placementParent</code> edge. Nothing here re-folds the world — this is the machinery as it currently holds it, which is the point of this view.</p>`
    : `<p class="note warn">No WORLD/world-state.json in this clone.</p>`;

  return `
<h2>What IS — the machinery's own picture</h2>
<p class="lede">The tree as <code>loadMarks</code> returns it, coloured by the one walk
(<code>tools/mark-standing.mjs</code>, imported — never copied), with every violation painted on the node that carries it.</p>
${statRow([
    ["nodes", model.marks.length], ["containment edges", model.containment.length],
    ["constitution", st.constitution ?? 0, "s-blue"], ["home", st.home ?? 0, "s-green"], ["market", st.market ?? 0, "s-amber"],
    ["raw tier fields", model.tierCarriers.length, "warn"], ["of those inert", model.tierInert.length, "warn"],
  ])}
${storeNote}
<div class="legend">
  <span class="f f-tier">tier: … · read</span> the one exception — the town speaking about the town's own ground.
  <span class="f f-tier f-inert">tier: … · inert</span> the line states nothing: standing is a fact about the ground, not the author's to assert, and no reader has authority to read this field.<br>
  <span class="f f-stored">stored: …</span> derivables the published row republishes — ${Object.entries(STORED_DERIVABLE).map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join("; ")}.<br>
  <span class="f f-stale">store says …</span> the published row disagrees with the one walk.
  <span class="f f-edge">edge · no action</span> the containment edge cites no action: births are git commits, in a different address space from <code>STATE/log</code>.
</div>
<div class="toolbar"><button onclick="allDetails(this,true)">expand all</button><button onclick="allDetails(this,false)">collapse all</button></div>
<ul class="tree">${roots.map((m) => node(m, 0)).join("")}</ul>`;
}

// ── the ideal view: the same world through the law's glasses ─────────────────
function renderIdeal(model) {
  const kids = childrenOf(model);
  const roots = model.marks.filter((m) => !m._parentMarkId);

  const node = (m, depth) => {
    const st = model.standing.get(m.id);
    const r = model.raw.get(m.id) ?? { keys: [] };
    const kid = kids.get(m.id) ?? [];

    // Identity: two atoms, and only two. Everything else is re-read below.
    const head = `<span class="dot ${STANDING_CLASS[st] ?? "s-amber"}"></span>`
      + `<code class="id">${esc(m.slug)}</code>`
      + `<span class="kind">${esc(m.class ?? m.kind ?? "?")}</span>`
      + `<span class="derived" title="derived by the one walk; stored by nobody">${esc(st)}</span>`
      + (kid.length ? `<span class="count">${kid.length}</span>` : "");

    // Edges out, as the law reads them — each named for what it IS, and each
    // carrying the hole where its citing action should be.
    const edges = [];
    if (m.by) edges.push(["create", `${esc(m.by)} → ${esc(m.slug)}`, "the by: field, read as the create-edge"]);
    if (m._parentMarkId) edges.push(["containment", `${esc(m._parentMarkId)} ⊃ ${esc(m.slug)}`, "the constitutive edge; the directory IS the geometry"]);
    if (m.derived_from) edges.push(["provenance", excerpt(m.derived_from, 70), "a citation, which is a relation"]);
    if (Array.isArray(m.implements) && m.implements.length) edges.push(["implements", m.implements.join(", "), "class → class"]);
    if (m.extends) edges.push(["extends", String(m.extends), "class → class"]);

    // Predicate children. The (slot, value) pair is already lawful; every other
    // genuine property is shown as the predicate node it should be, marked so
    // nobody mistakes the projection for the disk.
    const preds = [];
    if (m.slot != null) preds.push([esc(m.slot), esc(excerpt(m.value, 60)), true]);
    for (const k of r.keys) if (FIELD_ROW[k] === "property") preds.push([esc(k), esc(excerpt(typeof m[k] === "object" ? JSON.stringify(m[k]) : m[k], 60)), false]);

    // The "why" for each edge type and each predicate state is in the legend,
    // stated once, rather than in a tooltip repeated 623 times.
    const detail = `<div class="ideal-detail">`
      + (edges.length ? `<div class="grp"><span class="grp-h">edges</span>${edges.map(([t, v]) =>
        `<span class="e"><b>${t}</b> ${v}<i class="hole">⌀</i></span>`).join("")}</div>` : "")
      + (preds.length ? `<div class="grp"><span class="grp-h">predicates</span>${preds.map(([k, v, lawful]) =>
        `<span class="p${lawful ? " p-ok" : " p-would"}"><b>${k}</b> ${v}</span>`).join("")}</div>` : "")
      + `</div>`;

    if (!kid.length) return `<li class="leaf"><details><summary>${head}</summary>${detail}</details></li>`;
    return `<li><details${depth < 1 ? " open" : ""}><summary>${head}</summary>${detail}<ul>`
      + kid.map((c) => node(c, depth + 1)).join("") + `</ul></details></li>`;
  };

  // The holes — where the substrate for a lawful expression simply is not there.
  // Rendered as named absences tied to their registry row, never as fake data:
  // an invented consent word or a made-up action id would make this instrument
  // the very disease it is measuring.
  const holes = [
    ["the unified action log", "WRITE-REGISTRY: amend / withdraw / respond",
      `Every edge above wants to name the action that declared it. ${model.log.records.length} records exist across ${model.log.crossings} crossings, of types ${Object.entries(model.logTypes).map(([k, v]) => `${k} (${v})`).join(", ") || "none"} — none of them a birth or a declaration, and ${model.logWitnessed} of them carrying witnesses. Mark births are git commits in a separate address space, so no containment edge can cite a seq.`],
    ["the consent words", "WRITE-REGISTRY: identity",
      `The one conferral the walk honours is a <code>consent:</code> map on the ground-holder's own record. There are <b>${model.consentWords}</b> on disk, so every cross-household mark standing on someone's ground reads as market by absence, not by refusal.`],
    ["the class registry's reach", "LOGOS north star · Q1 — name your class-node",
      `${model.classNodes.length} class-nodes exist — ${[...model.registered].sort().join(", ")} — and <b>${model.marks.length - model.citing}</b> of ${model.marks.length} nodes name none of them. They carry <code>kind:</code>, the older four-word vocabulary, of which only <code>parcel</code> has a class-node behind it. Closure is a property of addressing, so most of this world is not yet addressable.`],
    ["the shadow grammars", "WRITE-REGISTRY: movement storage",
      `Movement lives in <code>WORLD/walk-ledger.md</code> (${model.ledger.lines} bespoke lines), identity in <code>WORLD/households.json</code> (${model.households.count} households, generated ${esc(model.households.generated_at ?? "—")}), money in the town's sealed ledger. None of the three is in the graph; none can be drawn here without inventing it.`],
  ];

  return `
<h2>What LOGOS derives — one node type, identity plus predicate children</h2>
<p class="lede">The same tree re-read: identity is <b>slug + class</b> and nothing else; authorship and containment are <b>edges</b>;
genuine properties are <b>predicate children</b>; standing is <b>derived</b> and stored by nobody. No raw tier, no stored derivables —
and where the substrate for a lawful expression is missing, a named hole rather than invented data.</p>
${statRow(lawMeasures(model).map((x) => [x.label, x.of != null ? `${x.now} / ${x.of}` : x.now, x.now === x.target ? "s-green" : "warn"]))}
<div class="holes"><h3>The holes — named, not filled</h3>${holes.map(([t, row, txt]) =>
    `<div class="hole-card"><b>${esc(t)}</b> <span class="rowref">${esc(row)}</span><p>${txt}</p></div>`).join("")}</div>
<div class="legend">
  <span class="e"><b>create</b> by → slug</span> <code>by:</code> read as the create-edge.
  <span class="e"><b>containment</b> parent ⊃ slug</span> the constitutive edge; the directory IS the geometry.
  <span class="e"><b>provenance</b> …</span> <code>derived_from:</code>, a citation, which is a relation.<br>
  <span class="p p-ok"><b>slot</b> value</span> already a predicate on disk — the (slot, value) pair is a predicate's own identity payload.
  <span class="p p-would"><b>field</b> value</span> a frontmatter field today; a predicate child under the law.<br>
  <i class="hole">⌀</i> on an edge: the relation exists, but the action that declared it is not addressable — no seq to cite.
</div>
<div class="toolbar"><button onclick="allDetails(this,true)">expand all</button><button onclick="allDetails(this,false)">collapse all</button></div>
<ul class="tree">${roots.map((m) => node(m, 0)).join("")}</ul>`;
}

// ── the diff view: the registry, counted ─────────────────────────────────────
function renderDiff(model) {
  const { registry } = model;
  if (registry.missing) return `<h2>Convergence</h2><p class="warn">No WRITE-REGISTRY.md in this clone — nothing to key the counts to.</p>`;

  const seen = new Set();
  const bar = (now, of) => {
    if (of == null || of === 0 || now == null) return "";
    const pct = Math.max(0, Math.min(100, Math.round((now / of) * 100)));
    return `<span class="bar"><span style="width:${pct}%"></span></span><span class="pct">${pct}%</span>`;
  };
  const cell = (x) => {
    if (x.now == null) return `<td class="num na">—</td>`;
    const good = x.target != null && x.now === x.target;
    return `<td class="num ${good ? "ok" : x.target != null ? "warn" : ""}">${x.now}${x.of != null ? ` <span class="of">of ${x.of}</span>` : ""}${x.target != null ? `<span class="tgt">target ${x.target}</span>` : ""}${bar(x.now, x.of)}</td>`;
  };

  const sections = registry.sections.map((sec) => {
    const rows = sec.rows.map((row) => {
      const fn = MEASURES[row.key];
      if (fn) seen.add(row.key);
      const measures = fn ? fn(model) : null;
      const statusCls = row.status.startsWith("ADHERES") ? "st-ok" : row.status.startsWith("CUTOVER") ? "st-cut" : "st-viol";
      if (!measures) {
        return `<tr><td class="surface">${esc(row.surface)}</td><td><span class="st ${statusCls}">${esc(row.status)}</span></td>
          <td class="mlabel na">not measured from a clone</td><td class="num na">—</td></tr>`;
      }
      return measures.map((x, i) => `<tr>
        ${i === 0 ? `<td class="surface" rowspan="${measures.length}">${esc(row.surface)}</td>
                     <td rowspan="${measures.length}"><span class="st ${statusCls}">${esc(row.status)}</span></td>` : ""}
        <td class="mlabel">${esc(x.label)}${x.note ? `<i>${esc(x.note)}</i>` : ""}</td>
        ${cell(x)}</tr>`).join("");
    }).join("");
    return `<h3>${esc(sec.title)}</h3><table class="diff"><thead><tr><th>surface</th><th>registry says</th><th>measurement</th><th>this clone</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");

  const orphaned = Object.keys(MEASURES).filter((k) => !seen.has(k));
  const drift = orphaned.length
    ? `<div class="drift"><b>DRIFT — ${orphaned.length} measure${orphaned.length > 1 ? "s" : ""} bound to no registry row:</b>
       ${orphaned.map((k) => `<code>${esc(k)}</code>`).join(" ")}.
       The registry is the source; either a row was renamed or a measure is stale. Fix <code>MEASURES</code> in <code>tools/graph-views.mjs</code>.</div>`
    : `<div class="nodrift">Every measure in this instrument binds to a live WRITE-REGISTRY.md row (${seen.size} of ${registry.sections.reduce((n, s) => n + s.rows.length, 0)} rows measured).</div>`;

  const law = lawMeasures(model);

  return `
<h2>Convergence — the registry, counted</h2>
<p class="lede">Every number is derived from this clone at run time and keyed to a row of <code>WRITE-REGISTRY.md</code>,
which owns the row names and statuses. Watch the warn column shrink.</p>
${drift}
<h3>The law's own measures</h3>
<table class="diff"><thead><tr><th colspan="3">measurement</th><th>this clone</th></tr></thead><tbody>
${law.map((x) => `<tr><td class="mlabel" colspan="3">${esc(x.label)}${x.note ? `<i>${esc(x.note)}</i>` : ""}</td>${cell(x)}</tr>`).join("")}
</tbody></table>
${sections}`;
}

function statRow(items) {
  return `<div class="stats">` + items.map(([label, val, cls]) =>
    `<div class="stat ${cls ?? ""}"><b>${esc(val)}</b><span>${esc(label)}</span></div>`).join("") + `</div>`;
}

const CSS = `
:root { color-scheme: dark; }
body { margin:0; background:#14171d; color:#e8e0cf; font:15px/1.5 Georgia,"Times New Roman",serif; }
.wrap { max-width:1180px; margin:0 auto; padding:24px 20px 80px; }
h1 { font-size:1.05rem; letter-spacing:.03em; color:#e8c56a; margin:0 0 4px; font-weight:normal; }
h2 { font-size:1.3rem; margin:22px 0 6px; color:#e8e0cf; font-weight:normal; }
h3 { font-size:.95rem; margin:26px 0 8px; color:#e8c56a; letter-spacing:.02em; font-weight:normal; }
.sub { color:#9a9280; font-size:.8rem; font-family:ui-monospace,Consolas,Menlo,monospace; margin:0 0 18px; }
.lede { color:#c8c0af; max-width:76ch; margin:0 0 14px; }
.note { color:#9a9280; font-size:.86rem; max-width:86ch; border-left:2px solid #2e3542; padding-left:12px; }
code,.id,.mono { font-family:ui-monospace,Consolas,Menlo,monospace; }
b.warn,.warn>b { color:#e8c56a; }
/* the world's own accents — spectator/viewer.mjs STYLE (Keemin 2026-07-23 / 08-04) */
.s-blue{--c:#7ba7e0} .s-green{--c:#84c98f} .s-amber{--c:#e8c56a} .s-draft{--c:#9aa0ab} .warn{--c:#e8c56a} .ok{--c:#84c98f}
nav { display:flex; gap:2px; border-bottom:1px solid #2e3542; margin:18px 0 0; }
nav button { background:#1c2129; color:#9a9280; border:1px solid #2e3542; border-bottom:none; padding:8px 18px;
  font:inherit; font-size:.9rem; cursor:pointer; border-radius:4px 4px 0 0; }
nav button[aria-selected=true] { background:#20262f; color:#e8c56a; }
nav button:focus-visible { outline:2px solid #e8c56a; outline-offset:2px; }
section[hidden] { display:none; }
.stats { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
.stat { background:#1c2129; border:1px solid #2e3542; border-left:3px solid var(--c,#2e3542); border-radius:4px; padding:8px 14px; min-width:96px; }
.stat b { display:block; font-size:1.35rem; color:var(--c,#e8e0cf); font-family:ui-monospace,Consolas,Menlo,monospace; }
.stat span { font-size:.74rem; color:#9a9280; text-transform:lowercase; }
.toolbar { margin:14px 0 6px; display:flex; gap:6px; }
.toolbar button { background:#1c2129; color:#9a9280; border:1px solid #2e3542; border-radius:3px; padding:4px 12px; font:inherit; font-size:.8rem; cursor:pointer; }
ul.tree, ul.tree ul { list-style:none; margin:0; padding:0 0 0 17px; }
ul.tree { padding-left:0; border-left:none; }
ul.tree ul { border-left:1px solid #262c36; }
ul.tree li { margin:1px 0; }
summary, li.leaf { padding:3px 6px; border-radius:3px; cursor:default; display:block; }
summary { cursor:pointer; list-style-position:outside; }
summary:hover, li.leaf:hover { background:#1a1f27; }
summary::marker { color:#5d636e; }
.dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--c,#9aa0ab); margin-right:7px; vertical-align:middle; }
.id { font-size:.82rem; color:#c8c0af; }
.kind,.cls,.derived,.count { font-size:.68rem; font-family:ui-monospace,Consolas,Menlo,monospace; margin-left:7px;
  padding:1px 6px; border-radius:9px; border:1px solid #2e3542; color:#9a9280; }
.cls { color:#7ba7e0; border-color:#3a4a63; }
.derived { color:#84c98f; border-color:#3a5a44; }
.count { color:#5d636e; }
.body { color:#7e7867; font-size:.78rem; padding:0 6px 4px 22px; font-style:italic; }
.f { font-size:.66rem; font-family:ui-monospace,Consolas,Menlo,monospace; margin-left:6px; padding:1px 6px; border-radius:3px; white-space:nowrap; }
.f-tier { background:#2a2418; color:#e8c56a; border:1px solid #4a3f22; }
.f-tier.f-inert { background:#33221f; color:#d98a7a; border-color:#5a3730; }
.f-stored { background:#241f2e; color:#aa8fd8; border:1px solid #3f3550; }
.f-stale { background:#33221f; color:#d98a7a; border:1px solid #5a3730; }
.f-edge { background:#1b2028; color:#6f7683; border:1px solid #2e3542; }
.legend { margin:14px 0; padding:10px 14px; background:#1a1e25; border:1px solid #262c36; border-radius:4px;
  font-size:.76rem; color:#9a9280; line-height:2.1; }
.ideal-detail { padding:2px 6px 8px 22px; }
.grp { margin:3px 0; }
.grp-h { font-size:.64rem; text-transform:uppercase; letter-spacing:.09em; color:#5d636e; margin-right:8px; }
.e,.p { display:inline-block; font-size:.7rem; font-family:ui-monospace,Consolas,Menlo,monospace;
  margin:2px 5px 2px 0; padding:2px 7px; border-radius:3px; border:1px solid #2e3542; background:#1a1f27; color:#9a9280; }
.e b { color:#7ba7e0; font-weight:normal; margin-right:5px; }
.p-ok { border-color:#3a5a44; } .p-ok b { color:#84c98f; font-weight:normal; margin-right:5px; }
.p-would { border-style:dashed; } .p-would b { color:#e8c56a; font-weight:normal; margin-right:5px; }
i.hole { font-style:normal; color:#d98a7a; opacity:.75; margin-left:8px; font-size:.66rem; }
.holes { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:10px; margin:16px 0; }
.holes h3 { grid-column:1/-1; margin:6px 0 0; }
.hole-card { background:#1a1e25; border:1px solid #262c36; border-left:3px solid #d98a7a; border-radius:4px; padding:10px 14px; }
.hole-card b { color:#e8e0cf; }
.hole-card p { margin:6px 0 0; font-size:.82rem; color:#9a9280; }
.rowref { font-size:.64rem; font-family:ui-monospace,Consolas,Menlo,monospace; color:#5d636e; margin-left:6px; }
table.diff { width:100%; border-collapse:collapse; margin:8px 0 18px; font-size:.84rem; }
table.diff th { text-align:left; font-weight:normal; font-size:.68rem; text-transform:uppercase; letter-spacing:.09em;
  color:#5d636e; border-bottom:1px solid #2e3542; padding:6px 10px; }
table.diff td { border-bottom:1px solid #21262e; padding:7px 10px; vertical-align:top; }
td.surface { color:#c8c0af; width:22%; }
td.mlabel { color:#9a9280; width:44%; }
td.mlabel i { display:block; font-size:.74rem; color:#5d636e; font-style:italic; margin-top:2px; }
td.num { font-family:ui-monospace,Consolas,Menlo,monospace; white-space:nowrap; color:var(--c,#c8c0af); }
td.num.na { color:#5d636e; }
.of { color:#5d636e; font-size:.78rem; }
.tgt { display:block; font-size:.68rem; color:#5d636e; }
.bar { display:inline-block; width:70px; height:5px; background:#2a303a; border-radius:3px; overflow:hidden; margin:0 6px 0 8px; vertical-align:middle; }
.bar>span { display:block; height:100%; background:var(--c,#9a9280); }
.pct { font-size:.7rem; color:#5d636e; }
.st { font-size:.66rem; font-family:ui-monospace,Consolas,Menlo,monospace; padding:2px 7px; border-radius:3px; white-space:nowrap; }
.st-ok { background:#1e2a21; color:#84c98f; border:1px solid #3a5a44; }
.st-cut { background:#2a2418; color:#e8c56a; border:1px solid #4a3f22; }
.st-viol { background:#33221f; color:#d98a7a; border:1px solid #5a3730; }
.drift { background:#33221f; border:1px solid #5a3730; border-radius:4px; padding:10px 14px; color:#d98a7a; font-size:.84rem; margin:12px 0; }
.nodrift { background:#1e2a21; border:1px solid #3a5a44; border-radius:4px; padding:10px 14px; color:#84c98f; font-size:.84rem; margin:12px 0; }
footer { margin-top:40px; padding-top:14px; border-top:1px solid #2e3542; color:#5d636e; font-size:.76rem; }
`;

const JS = `
function show(i){document.querySelectorAll('nav button').forEach(function(b,j){b.setAttribute('aria-selected',j===i);});
document.querySelectorAll('main>section').forEach(function(s,j){s.hidden=j!==i;});}
function allDetails(btn,open){btn.closest('section').querySelectorAll('details').forEach(function(d){d.open=open;});}
`;

function renderHtml(model, views) {
  const tabs = views.map((v, i) => `<button aria-selected="${i === 0}" onclick="show(${i})">${v.label}</button>`).join("");
  const secs = views.map((v, i) => `<section${i === 0 ? "" : " hidden"}>${v.html}</section>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Postmark — graph views</title><style>${CSS}</style></head>
<body><div class="wrap">
<h1>POSTMARK · GRAPH VIEWS</h1>
<p class="sub">a projection — regenerable, stored by nobody · ${esc(model.repo)} · generated ${esc(model.generatedAt)} · ${model.marks.length} nodes</p>
<nav>${tabs}</nav>
<main>${secs}</main>
<footer>Generated by <code>tools/graph-views.mjs</code>. Standing is derived by <code>tools/mark-standing.mjs</code> — the one walk, imported.
Row names and statuses are parsed from <code>WRITE-REGISTRY.md</code>, which owns them. This page is a read: it stores nothing and nothing reads it back.</footer>
</div><script>${JS}</script></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
const model = buildModel();
const ALL = [
  { key: "practical", label: "What IS", render: renderPractical },
  { key: "ideal", label: "What LOGOS derives", render: renderIdeal },
  { key: "diff", label: "Convergence", render: renderDiff },
];
const chosen = VIEW === "all" ? ALL : ALL.filter((v) => v.key === VIEW);
if (!chosen.length) {
  console.error(`unknown --view "${VIEW}" — one of: practical, ideal, diff (default: all three, tabbed)`);
  process.exit(1);
}
writeFileSync(OUT, renderHtml(model, chosen.map((v) => ({ label: v.label, html: v.render(model) }))));
const kb = Math.round(statSync(OUT).size / 1024);
console.log(`graph-views: ${model.marks.length} nodes · ${model.containment.length} containment edges · `
  + `${model.tierCarriers.length} raw tier fields (${model.tierInert.length} inert) · `
  + `${model.classNodes.length} class-nodes · ${model.log.records.length} log records · ${model.consentWords} consent words`);
console.log(`wrote ${OUT} (${kb} KB) — open it in a browser; it needs no server.`);
