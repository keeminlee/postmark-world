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
//   node tools/graph-views.mjs [--repo <world-clone>] [--view practical|ideal|diff|law]
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
import { execFileSync } from "node:child_process";

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
// THE SERIALIZATION MAP — the first machine-readable form of the trichotomy
// that LOGOS/kinds.md § the node holds only as prose.
//
// This table is a TRACKED ARTIFACT, not incidental parsing logic (founder's
// ruling, 2026-08-12; WRITE-REGISTRY.md row "the serialization mapping (field →
// predicate star)"). Before it existed, nothing on disk had a mechanical
// predicate expression — the ideal view could not be drawn at all, because
// there was no statement of which field serializes which part of a node. It is
// written as ONE table so a founder can read it and red-pen it in one sitting.
//
// It is a WAY STATION. The destination is `payload schemas on class-nodes`
// (LOGOS/classes.md names payload schema as a class param), at which point this
// literal is deleted and the map is read from the graph like everything else. A
// lookup table in a read-only projection is merely the first form that can be
// counted.
//
// Read it per class: for each node class, what its frontmatter keys serialize.
//   identity   — an identity atom (kinds.md: "identity is two atoms, a slug and
//                a class"); the slug is the directory name, so on disk identity
//                is one key.
//   relational — NOT a property. Each entry names THE EDGE IT SERIALIZES, as
//                `[edge-type, what the edge relates]` (kinds.md: "`by:` is the
//                create-edge, not a field"; position is "the containment edge
//                plus an offset").
//   derived    — belongs NOWHERE (the-north-star.md § the placement discipline:
//                "standing, rank, canon, world position, affordances — derived,
//                stored by no one"). A key here on disk is TRUE RESIDUE: the
//                map deliberately maps it to nothing, which is a violation, not
//                a gap in this table.
//   log        — belongs to the citing action's record, not to the node.
//   property   — a genuine authored property, given as `[predicate-slot, gloss]`.
//                Its lawful form is a predicate child hanging off the node.
//
// `*` applies to every class; a class block adds to it. A key on disk that this
// table does not place is MAPPING DEBT — rendered loudly as this table's own
// unfinished business, never silently bucketed, because an unrecognised field
// is exactly the shape a shadow grammar arrives in.
// ═══════════════════════════════════════════════════════════════════════════
const SERIALIZATION_MAP = {
  version: "0.1.0",
  authored: "2026-08-12",
  cites: "LOGOS/kinds.md § the node · LOGOS/the-north-star.md § the placement discipline",
  destination: "payload schemas on class-nodes (LOGOS/classes.md § params)",

  // EVERY CLASS
  "*": {
    identity:   { kind: "the class atom, in the four-word vocabulary the tree speaks today" },
    relational: {
      by:           ["create", "author → node — the create-edge, stored as a field"],
      derived_from: ["provenance", "node → the source it was seeded from"],
    },
    derived:    {
      tier:      "standing — decided by the one walk over the ground; not the author's to assert",
      household: "the grain — resolvable from `by` through households.json",
    },
    log:        { date: "the create-action's stamp; a fact about the action, not the node" },
    property:   {
      pre:    ["pre", "seeded before the world opened, rather than authored in play"],
      source: ["source", "the document this record renders"],
    },
  },

  // A SITED MARK — a thing standing somewhere in the world.
  sited: {
    identity:   { class: "the registered class name, on a class-node" },
    relational: {
      at:      ["containment", "an offset from the container's centre — meaningless without the edge"],
      extent:  ["containment", "the footprint that offset governs"],
      points:  ["containment", "a ring of positions; rides the same frame as `at`"],
      coords:  ["containment", "which frame the numbers are written in"],
      anchor:  ["containment", "where the offset is measured from"],
      implements: ["implements", "class → the machinery that honours it"],
      extends:    ["extends", "class → the class it specialises"],
    },
    property: {
      mechanic:    ["mechanic", "the machinery that keeps this mark true"],
      feature:     ["feature", "the two-precision survey link"],
      version:     ["version", "the class's revision"],
      dials:       ["dials", "the class's response boundaries — destined to BE class params"],
      affordances: ["affordances", "what the class offers a resident"],
      mobility:    ["mobility", "whether the mark moves, and how"],
      far:         ["far", "visible from outside its own reach"],
      propagation: ["propagation", "what becomes of what is attached when this moves"],
      exempt:      ["exempt", "held out of a rule, by name"],
      ambient:     ["ambient", "present without being stood upon"],
      timetable:   ["timetable", "the schedule a `mechanic: timetable` mark carries"],
      top_m:       ["top_m", "vertical prominence"],
      ask:         ["ask", "a bounty's one request"],
      reward:      ["reward", "a bounty's stamps"],
      status:      ["status", "a bounty's open/done"],
      threshold:   ["threshold", "the bar a bounty is met at"],
      consent:     ["consent", "the ground-holder's welcome word about what stands on them"],
    },
  },

  // A PARCEL — the ground a household holds.
  parcel: {
    relational: {
      at:     ["containment", "an offset from the container's centre"],
      extent: ["containment", "the footprint that offset governs"],
    },
    property: { consent: ["consent", "the ground-holder's welcome word"] },
  },

  // A PREDICATED MARK — already a predicate. Its (slot, value) pair IS its
  // identity payload: "predicates are the atoms of authorship" (kinds.md). The
  // only two keys on disk already in lawful shape.
  predicated: {
    predicate:  { slot: "the predicate's slot", value: "the predicate's value" },
    relational: { parent: ["containment", "the node this predicates — its parent continued"] },
    property:   {
      mechanic:       ["mechanic", "the machinery that keeps this true"],
      mechanic_draft: ["mechanic_draft", "a mechanic proposed but not registered"],
    },
  },

  // A NAMING — a predicate whose slot is implied by the act of naming.
  naming: {
    predicate:  { value: "the name given" },
    relational: { parent: ["containment", "the node this names"] },
  },
};

// Resolve one (class, key) pair through the map. Returns the row it serializes
// into, the note explaining why, and — for a relation — the edge it becomes.
// `unmapped` is the honest answer for a key the table does not place, and the
// views render it as this table's own debt rather than as a property.
function serializes(kind, key) {
  for (const scope of [SERIALIZATION_MAP[kind], SERIALIZATION_MAP["*"]]) {
    if (!scope) continue;
    for (const row of ["identity", "relational", "derived", "log", "predicate", "property"]) {
      const hit = scope[row]?.[key];
      if (hit === undefined) continue;
      if (row === "relational") return { row: "edge", edge: hit[0], note: hit[1] };
      if (row === "property") return { row: "property", slot: hit[0], note: hit[1] };
      return { row, note: hit };
    }
  }
  return { row: "unmapped", note: "this table does not place this key — mapping debt" };
}

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

// ═══════════════════════════════════════════════════════════════════════════
// THE WINDOW — the office's projection of this same town, consumed as DATA.
//
// The office runs its own graph surface at /ops/graph/ over world.db, with the
// six standing invariants painted onto the picture. That view is RIGHT; it is
// simply framed in the pre-LOGOS-v2 vocabulary and lives behind a server. The
// hub does not reimplement it and does not vendor its renderer — it takes the
// office's payload as an input and draws it here, so one page holds every graph
// this town has under one frame.
//
// The payload is whatever `worldGraphView()` returns (office src/world-graph.mjs).
// Two ways in, both GENERATION-TIME ONLY — the output stays a static file that
// fetches nothing when opened:
//   --window-json <path>   a payload written to disk
//   --window-url  <url>    fetched once, here, while generating
//
// THE COORDINATE CONTRACT IS THE PAYLOAD'S, NOT OURS. The office ships it in
// `payload.coordinates` precisely so a viewer cannot get it wrong silently, and
// world-graph.mjs's header is emphatic about the reason:
//
//   "Y IS NOT NEGATED HERE … The world's y runs SOUTH … Cytoscape's y runs DOWN
//    the screen. South down IS north up, so passing the coordinate through
//    unchanged draws the map the right way round."
//
// This renderer's y also runs down the screen, so y passes through UNCHANGED
// here too. The flip belongs where the viewer is, and this viewer needs none.
// ═══════════════════════════════════════════════════════════════════════════

// The office's three honesty rules, carried VERBATIM from src/world-graph.mjs's
// header. They are the reason its painting can be trusted, and a port that
// restated them in its own words would be quietly claiming a discipline it had
// not inherited. Quoted, attributed, unedited.
const WINDOW_HONESTY_RULES = [
  ["NOTHING IS INFERRED FROM PROSE.", "Every id painted comes from a structured field the lint itself wrote (`carried_by`, `parcel`, `rule`, `hits[].file`), never from parsing a headline. The lints own their findings; this module only addresses them."],
  ["AN ID THAT IS NOT IN THE GRAPH IS REPORTED, NOT DROPPED.", "Each lint's `implicates` block carries an `unmatched` list. A finding about something the store has no node for is itself a finding, and silently swallowing it would make the window agree with the graph by construction."],
  ["A LINT THAT CANNOT BE ADDRESSED SAYS SO.", "L6 is N/A today and names no node; it lands with an empty implication and an explicit `paints: false` rather than being quietly absent from the panel."],
];

async function readWindow(repo) {
  const path = opt("--window-json", null);
  const url = opt("--window-url", null);
  if (!path && !url) return { present: false, how: null };

  let raw, from;
  if (path) {
    from = path;
    if (!existsSync(path)) return { present: true, from, unreadable: `no such file: ${path}` };
    try { raw = JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { return { present: true, from, unreadable: `will not parse: ${e.message}` }; }
  } else {
    from = url;
    try {
      const res = await fetch(url);
      if (!res.ok) return { present: true, from, unreadable: `HTTP ${res.status}` };
      raw = await res.json();
    } catch (e) { return { present: true, from, unreadable: `fetch failed: ${e.message}` }; }
  }

  // The office reports its own failures inside the payload rather than by
  // status code; pass its sentence through rather than inventing one.
  if (raw?.error) return { present: true, from, unreadable: `the office says: ${raw.error}${raw.detail ? ` — ${raw.detail}` : ""}` };
  const nodes = raw?.elements?.nodes, edges = raw?.elements?.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { present: true, from, unreadable: "not a worldGraphView payload — no elements.nodes / elements.edges array" };
  }

  const positioned = nodes.filter((n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));
  const byId = new Map(nodes.map((n) => [n.data?.id, n]));
  const drawable = edges.filter((e) => byId.get(e.data?.source)?.position && byId.get(e.data?.target)?.position);

  // Two framings, because this world genuinely has two clusters: the town at
  // the origin and Pando some 135 km northwest. A single fit renders both as
  // specks with empty ocean between.
  //
  // The second framing is found by DISTANCE FROM THE MEDIAN CENTRE, not by a
  // percentile of x and y. Percentiles fail here for a reason worth keeping:
  // Pando holds about 9% of the positioned nodes, so a 2nd-percentile trim
  // still contains it and the "town" button did nothing. A robust radius —
  // three times the 75th-percentile distance — separates a far cluster at
  // whatever size it happens to be, and the count outside is reported so the
  // framing never quietly hides part of the world.
  const xs = positioned.map((n) => n.position.x), ys = positioned.map((n) => n.position.y);
  const q = (a, p) => { const s = [...a].sort((m, n) => m - n); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
  const box = (xa, ya, xb, yb) => ({ x: xa, y: ya, w: Math.max(1, xb - xa), h: Math.max(1, yb - ya) });
  const pad = (b, f = 0.06) => box(b.x - b.w * f, b.y - b.h * f, b.x + b.w * (1 + f), b.y + b.h * (1 + f));
  const fitTo = (list, f) => list.length
    ? pad(box(Math.min(...list.map((n) => n.position.x)), Math.min(...list.map((n) => n.position.y)),
      Math.max(...list.map((n) => n.position.x)), Math.max(...list.map((n) => n.position.y))), f)
    : box(0, 0, 1, 1);

  const cx = q(xs, 0.5), cy = q(ys, 0.5);
  const dist = positioned.map((n) => Math.hypot(n.position.x - cx, n.position.y - cy));
  const radius = Math.max(1, q(dist, 0.75) * 3);
  const core = positioned.filter((n) => Math.hypot(n.position.x - cx, n.position.y - cy) <= radius);

  return {
    present: true, from, payload: raw, nodes, edges, positioned, drawable,
    lints: Array.isArray(raw.lints) ? raw.lints : [],
    fitAll: fitTo(positioned, 0.06),
    fitDense: fitTo(core, 0.12),
    coreCount: core.length,
  };
}

// Is the office's store looking at the same world this clone holds? Neither
// surface can answer alone — the office has no world repo, the world repo has
// no store — and putting them on one page is what makes the question askable.
//
// Resolved against THE REF THE PAYLOAD NAMES (`as_of.world_ref`, normally
// refs/heads/main), not against HEAD. The hub is generated from a feature
// branch as often as not, and comparing a hydration of main against whatever
// branch happens to be checked out would cry stale on every branch in the
// repo — an alarm that fires constantly is one nobody reads.
// Only a REAL ref name is portable. A hydration run without --ref records its
// world_ref as the literal "HEAD", which names a different commit in every
// checkout and in every worktree — resolving it here compared the office's
// store against whatever branch this generator happened to be sitting on and
// cried stale every time. So anything that is not a `refs/...` path is
// discarded, and where no portable ref resolves the pane makes NO freshness
// claim rather than a confident wrong one.
function worldRefSha(repo, ref) {
  const candidates = [typeof ref === "string" && ref.startsWith("refs/") ? ref : null, "refs/heads/main"];
  for (const target of candidates) {
    if (!target) continue;
    try {
      const sha = execFileSync("git", ["rev-parse", "--verify", "--quiet", target], { cwd: repo, encoding: "utf8" }).trim();
      if (sha) return { sha, ref: target };
    } catch { /* try the next one */ }
  }
  return { sha: null, ref: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE METAMODEL — the law's own anatomy as a graph, authored by the founder pen
// at LOGOS/graph/metamodel.json. This instrument only RENDERS it; it never
// writes it and never invents a placeholder for it. Law content is the pen's,
// never the builder's, so an absent file is reported as absent.
//
// Read defensively. The shape is authoritative from whatever the file actually
// contains, not from what this reader expects:
//   {"nodes":[{"id","class","predicates":{...},"prose":"LOGOS/<doc>.md#<anchor>"}],
//    "edges":[{"from","type","to"}]}
// Anything else at the top level, or any extra key on a node or an edge, is
// COLLECTED AND LISTED rather than dropped or crashed on — an unexpected key is
// the founder having said something this reader has not learned to hear yet,
// and silently discarding it would be the worse failure.
// ═══════════════════════════════════════════════════════════════════════════
function readMetamodel(repo) {
  const path = join(repo, "LOGOS", "graph", "metamodel.json");
  if (!existsSync(path)) return { present: false, path: "LOGOS/graph/metamodel.json" };
  let doc;
  try { doc = JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { return { present: true, unreadable: e.message, path: "LOGOS/graph/metamodel.json" }; }

  const KNOWN_TOP = new Set(["nodes", "edges"]);
  const KNOWN_NODE = new Set(["id", "class", "predicates", "prose"]);
  const KNOWN_EDGE = new Set(["from", "type", "to"]);
  const unknown = { top: [], node: new Set(), edge: new Set() };
  for (const k of Object.keys(doc ?? {})) if (!KNOWN_TOP.has(k)) unknown.top.push(k);

  const nodes = (Array.isArray(doc?.nodes) ? doc.nodes : []).filter((n) => n && n.id != null).map((n) => {
    for (const k of Object.keys(n)) if (!KNOWN_NODE.has(k)) unknown.node.add(k);
    return {
      id: String(n.id), class: n.class != null ? String(n.class) : null,
      predicates: (n.predicates && typeof n.predicates === "object" && !Array.isArray(n.predicates)) ? n.predicates : {},
      prose: n.prose != null ? String(n.prose) : null,
      extra: Object.fromEntries(Object.entries(n).filter(([k]) => !KNOWN_NODE.has(k))),
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edgesAll = (Array.isArray(doc?.edges) ? doc.edges : []).filter((e) => e && e.from != null && e.to != null).map((e) => {
    for (const k of Object.keys(e)) if (!KNOWN_EDGE.has(k)) unknown.edge.add(k);
    return { from: String(e.from), type: e.type != null ? String(e.type) : "—", to: String(e.to) };
  });
  // An edge naming a node the file does not define is kept and reported, never
  // silently dropped: a dangling edge is a fact about the law's draft state.
  const edges = edgesAll.filter((e) => ids.has(e.from) && ids.has(e.to));
  const dangling = edgesAll.filter((e) => !ids.has(e.from) || !ids.has(e.to));

  return {
    present: true, path: "LOGOS/graph/metamodel.json", nodes, edges, dangling,
    unknown: { top: unknown.top, node: [...unknown.node], edge: [...unknown.edge] },
    layout: layoutLayered(nodes, edges),
  };
}

// A layered layout, computed HERE at generation time so the page needs no
// runtime physics. Longest-path layering, then barycentre passes to reduce
// crossings — the small honest version of Sugiyama: enough structure that typed
// edges are readable on a 40-80 node graph, and no simulation loop in the
// browser.
//
// CYCLES ARE EXPECTED. The law's anatomy contains them by nature — `declare`
// produces an `edge` and an `edge` cites its `declare` — and a naive
// longest-path walk over a cycle climbs forever. So back-edges are found first
// by depth-first search and held out of the LAYERING only; every edge is still
// drawn, a back-edge simply pointing leftward, which is the truth about it.
function layoutLayered(nodes, edges) {
  const COL = 230, ROW = 74, PAD = 40, NW = 168, NH = 34;
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from)?.push(e.to);

  // Back-edge detection: a target already on the current DFS stack closes a
  // cycle. Iterative, so a deep law does not overflow the JS stack.
  const back = new Set();
  const state = new Map(nodes.map((n) => [n.id, 0]));   // 0 unseen · 1 on stack · 2 done
  for (const root of nodes) {
    if (state.get(root.id) !== 0) continue;
    const stack = [[root.id, 0]];
    state.set(root.id, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const kids = out.get(frame[0]) ?? [];
      if (frame[1] >= kids.length) { state.set(frame[0], 2); stack.pop(); continue; }
      const next = kids[frame[1]++];
      const s = state.get(next);
      if (s === 1) back.add(`${frame[0]}\t${next}`);
      else if (s === 0) { state.set(next, 1); stack.push([next, 0]); }
    }
  }
  const forward = edges.filter((e) => !back.has(`${e.from}\t${e.to}`));

  // Longest path over the acyclic remainder. The pass cap is belt-and-braces:
  // with back-edges removed it always settles, and it is bounded anyway.
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length + 1; pass++) {
    let moved = false;
    for (const e of forward) {
      const want = layer.get(e.from) + 1;
      if (want > layer.get(e.to)) { layer.set(e.to, want); moved = true; }
    }
    if (!moved) break;
  }

  const byLayer = new Map();
  for (const n of nodes) {
    const L = layer.get(n.id) ?? 0;
    if (!byLayer.has(L)) byLayer.set(L, []);
    byLayer.get(L).push(n.id);
  }
  const inn = new Map(nodes.map((n) => [n.id, []]));
  for (const e of forward) inn.get(e.to)?.push(e.from);

  const order = new Map();
  const layersAsc = [...byLayer].sort((a, b) => a[0] - b[0]);
  for (const [, list] of layersAsc) list.forEach((id, i) => order.set(id, i));
  for (let pass = 0; pass < 3; pass++) {
    for (const [, list] of layersAsc) {
      const bary = (id) => {
        const ups = inn.get(id) ?? [];
        return ups.length ? ups.reduce((s, u) => s + (order.get(u) ?? 0), 0) / ups.length : (order.get(id) ?? 0);
      };
      const keyed = list.map((id) => [id, bary(id)]);
      keyed.sort((a, b) => a[1] - b[1]);
      list.splice(0, list.length, ...keyed.map(([id]) => id));
      list.forEach((id, i) => order.set(id, i));
    }
  }

  // Positions. TOP-DOWN: a layer is a ROW, not a column. Left-to-right runs the
  // graph off the side of the page at any real size — a law of forty concepts
  // is eight layers deep and would be two thousand pixels wide — whereas
  // top-down grows in the direction a page already scrolls.
  //
  // The canvas is measured from the positions themselves rather than from a
  // layer count: the two disagree when layers are sparse, and a viewBox smaller
  // than its contents hides nodes silently, which is how the first draft of
  // this function lost seven of eleven concepts.
  // A LAYER IS NOT ALWAYS ONE ROW. The real metamodel puts 20 root concepts on
  // layer 0 and one node each on layers 7 and 8; laid out flat that is a canvas
  // 4,600px wide in which the single-node rows are centred so far right they
  // leave the opening view entirely. So a wide layer WRAPS into several visual
  // rows, and centring happens against the widest VISUAL row rather than the
  // widest layer.
  const PER_ROW = 6;
  const visual = [];
  for (const [, list] of layersAsc) {
    for (let i = 0; i < list.length; i += PER_ROW) visual.push(list.slice(i, i + PER_ROW));
  }
  const pos = new Map();
  const widest = Math.max(1, ...visual.map((r) => r.length));
  visual.forEach((row, r) => {
    const gap = (widest - row.length) * COL / 2;
    row.forEach((id, i) => pos.set(id, { x: PAD + gap + i * COL, y: PAD + r * ROW }));
  });
  let maxX = 0, maxY = 0;
  for (const p of pos.values()) { maxX = Math.max(maxX, p.x + NW); maxY = Math.max(maxY, p.y + NH); }
  return { pos, width: maxX + PAD, height: maxY + PAD, layers: byLayer.size, rows: visual.length, backEdges: back.size };
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
async function buildModel() {
  const marks = loadMarks(join(REPO, "WORLD", "marks"));
  const byId = new Map(marks.map((m) => [m.id, m]));
  const raw = rawFrontmatter(marks);
  const store = readStore(REPO);
  const log = readLog(REPO);
  const ledger = readLedger(REPO);
  const households = readHouseholds(REPO);
  const registry = readRegistry(REPO);
  const metamodel = readMetamodel(REPO);
  const window_ = await readWindow(REPO);
  const worldRefResolved = worldRefSha(REPO, window_?.payload?.as_of?.world_ref ?? null);

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
  // The field census, run through the serialization map. Three outcomes are
  // deliberately kept apart, because they are three different kinds of problem
  // and collapsing them would hide the one that is nobody's fault but ours:
  //   derived   → TRUE RESIDUE. The map places it nowhere on purpose; the field
  //               on disk is a violation of the law.
  //   unmapped  → MAPPING DEBT. The map has not placed it yet; that is a gap in
  //               SERIALIZATION_MAP, this instrument's own unfinished business.
  //   the rest  → placed, lawfully or awaiting the cutover that moves them.
  const census = { identity: 0, edge: 0, derived: 0, log: 0, predicate: 0, property: 0, unmapped: 0, total: 0 };
  const unmappedKeys = new Map();
  const propertyKeys = new Map();
  const keysOnDisk = new Set();
  for (const m of marks) {
    for (const k of raw.get(m.id)?.keys ?? []) {
      keysOnDisk.add(k);
      const { row } = serializes(m.kind, k);
      census[row]++; census.total++;
      if (row === "unmapped") unmappedKeys.set(`${m.kind}.${k}`, (unmappedKeys.get(`${m.kind}.${k}`) ?? 0) + 1);
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
    marks, byId, raw, standing, store, log, ledger, households, registry, metamodel,
    window: window_, worldRef: worldRefResolved,
    classNodes, registered, citing, unregisteredKinds, census, unmappedKeys, propertyKeys, keysOnDisk,
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
  // instrument"). SERIALIZATION_MAP at the top of this file IS that form.
  "the serialization mapping": (m) => [
    { label: "the mapping's own stage",
      stages: ["prose-only", `machine-readable (this instrument, v${SERIALIZATION_MAP.version})`, "on class-nodes (destination)"],
      at: 1, note: `SERIALIZATION_MAP in tools/graph-views.mjs, authored ${SERIALIZATION_MAP.authored} — a way station; the destination is ${SERIALIZATION_MAP.destination}` },
    { label: "(class, key) pairs the map places", now: m.census.total - m.census.unmapped, of: m.census.total, target: m.census.total,
      note: "everything it does not place is mapping debt, counted on its own row below" },
    { label: "MAPPING DEBT — key instances the map does not place", now: m.census.unmapped, of: null, target: 0,
      note: m.unmappedKeys.size ? [...m.unmappedKeys.keys()].join(", ") : "none — every key on disk has a stated destination" },
    { label: "destination: a predicate child", now: m.census.property, of: null, target: 0, note: "" },
    { label: "destination: an edge", now: m.census.edge, of: null, target: 0, note: "" },
    { label: "destination: nowhere — TRUE RESIDUE, a violation", now: m.census.derived, of: null, target: 0,
      note: "the map places these nowhere on purpose; the field on disk is the violation" },
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
    { label: "TRUE RESIDUE — derivables stored on records", now: m.census.derived, of: null, target: 0,
      note: "tier and household: the map places them nowhere, and they are written down anyway" },
    { label: "MAPPING DEBT — keys the map does not place", now: m.census.unmapped, of: null, target: 0,
      note: m.unmappedKeys.size ? [...m.unmappedKeys.keys()].join(", ") : "none — every key on disk has a stated destination" },
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
    ? `<p class="note">Published store written <b>${esc(model.store._mtime)}</b>. <b class="warn">${model.storeTierDisagrees}</b> of ${model.storeSeen} shared records carry a stale <code>tier</code>; <b class="warn">${model.storePlacement}</b> carry <code>placementParent</code>.</p>`
    : `<p class="note warn">No WORLD/world-state.json in this clone.</p>`;

  return `
<h2>What IS — the town on disk today</h2>
<p class="lede">Every mark, as stored, coloured by standing. Violations are painted on the node that carries them. Expand a node to see its fields.</p>
${statRow([
    ["nodes", model.marks.length], ["containment edges", model.containment.length],
    ["constitution", st.constitution ?? 0, "s-blue"], ["home", st.home ?? 0, "s-green"], ["market", st.market ?? 0, "s-amber"],
    ["raw tier fields", model.tierCarriers.length, "warn"], ["of those inert", model.tierInert.length, "warn"],
  ])}
${storeNote}
<div class="legend">
  <span class="f f-tier">tier: … · read</span> the one tier field still read — the town's own constitution.
  <span class="f f-tier f-inert">tier: … · inert</span> a stored tier no reader uses.<br>
  <span class="f f-stored">stored: …</span> derivables the store republishes — ${Object.entries(STORED_DERIVABLE).map(([k, v]) => `<code>${k}</code> ${esc(v)}`).join("; ")}.<br>
  <span class="f f-stale">store says …</span> the published row disagrees with the walk.
  <span class="f f-edge">edge · no action</span> containment edge with no citable action — births are git commits, outside <code>STATE/log</code>.
</div>
<div class="toolbar"><button onclick="allDetails(this,true)">expand all</button><button onclick="allDetails(this,false)">collapse all</button></div>
<ul class="tree">${roots.map((m) => node(m, 0)).join("")}</ul>`;
}

// The serialization map, rendered so the founder can red-pen it without opening
// the source. Counts come from the live census, so a row that places a key
// nothing on disk carries shows 0 and is visibly speculative.
function renderMappingTable(model) {
  const ROWS = [
    ["identity", "identity", "an identity atom — slug + class, and nothing else"],
    ["relational", "edge", "NOT a property; the entry names the edge it serializes"],
    ["predicate", "predicate", "already lawful on disk — the (slot, value) pair is a predicate's own identity payload"],
    ["property", "property", "a genuine authored property; lawful form is a predicate child"],
    ["derived", "derived", "placed NOWHERE on purpose — a key here on disk is true residue"],
    ["log", "log", "belongs to the citing action's record, not to the node"],
  ];
  const classes = ["*", "sited", "parcel", "predicated", "naming"];

  // How many times each (class-scope, key) pair actually occurs on disk — the
  // scope being whichever block resolved it, so a `*` row counts every class
  // and a class row counts only its own.
  const counted = new Map();
  for (const m of model.marks) {
    for (const k of model.raw.get(m.id)?.keys ?? []) {
      const scope = bucketOf(m.kind, k) ? m.kind : "*";
      counted.set(`${scope}.${k}`, (counted.get(`${scope}.${k}`) ?? 0) + 1);
    }
  }

  const body = classes.flatMap((cls) => {
    const scope = SERIALIZATION_MAP[cls];
    if (!scope) return [];
    return ROWS.flatMap(([bucket, row]) => Object.entries(scope[bucket] ?? {}).map(([k, v]) => {
      const n = counted.get(`${cls}.${k}`) ?? 0;
      const edgeOrSlot = Array.isArray(v) ? v[0] : null;
      const gloss = Array.isArray(v) ? v[1] : v;
      const chip = row === "edge" ? "p-edgey" : row === "derived" ? "p-residue" : row === "property" ? "p-would" : "p-ok";
      return `<tr><td class="mcls">${cls === "*" ? "<i>every class</i>" : esc(cls)}</td>
        <td><code>${esc(k)}</code></td>
        <td><span class="p ${chip}">${esc(row)}</span></td>
        <td>${edgeOrSlot ? `<code>${esc(edgeOrSlot)}</code>` : `<span class="na">—</span>`}</td>
        <td class="mgloss">${esc(gloss)}</td>
        <td class="num ${n ? "" : "na"}">${n || "—"}</td></tr>`;
    }));
  }).join("");

  return `<details class="mapping"><summary><b>The serialization map</b> — v${esc(SERIALIZATION_MAP.version)}, ${esc(SERIALIZATION_MAP.authored)} · what each key serializes</summary>
<p class="note">Per class, what each frontmatter key serializes. Unplaced keys count as mapping debt on the Convergence tab. Destination: ${esc(SERIALIZATION_MAP.destination)}.</p>
<table class="diff maptable"><thead><tr><th>class</th><th>key</th><th>row</th><th>edge / slot</th><th>why</th><th>on disk</th></tr></thead>
<tbody>${body}</tbody></table></details>`;
}

// Which bucket of a class block a key sits in — used only to attribute a count
// to the right row of the rendered table.
function bucketOf(kind, key) {
  for (const b of ["identity", "relational", "derived", "log", "predicate", "property"]) {
    if (SERIALIZATION_MAP[kind]?.[b]?.[key] !== undefined) return b;
  }
  return null;
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

    // Predicate children, and the two things that are NOT predicate children
    // and must not be drawn as if they were. Every key on disk is put through
    // the serialization map, and the three outcomes render distinctly:
    //   predicate/property → the predicate it is or should become
    //   derived            → TRUE RESIDUE, a violation of the law
    //   unmapped           → MAPPING DEBT, this instrument's own gap
    const preds = [], residue = [], debt = [];
    if (m.slot != null) preds.push([esc(m.slot), esc(excerpt(m.value, 60)), true]);
    for (const k of r.keys) {
      const s = serializes(m.kind, k);
      const val = esc(excerpt(typeof m[k] === "object" ? JSON.stringify(m[k]) : m[k], 60));
      if (s.row === "property") preds.push([esc(s.slot), val, false]);
      else if (s.row === "derived") residue.push([esc(k), val]);
      else if (s.row === "unmapped") debt.push([esc(k), val]);
    }

    // The "why" for each edge type and each state is in the legend, stated
    // once, rather than in a tooltip repeated 623 times.
    const detail = `<div class="ideal-detail">`
      + (edges.length ? `<div class="grp"><span class="grp-h">edges</span>${edges.map(([t, v]) =>
        `<span class="e"><b>${t}</b> ${v}<i class="hole">⌀</i></span>`).join("")}</div>` : "")
      + (preds.length ? `<div class="grp"><span class="grp-h">predicates</span>${preds.map(([k, v, lawful]) =>
        `<span class="p${lawful ? " p-ok" : " p-would"}"><b>${k}</b> ${v}</span>`).join("")}</div>` : "")
      + (residue.length ? `<div class="grp"><span class="grp-h">residue</span>${residue.map(([k, v]) =>
        `<span class="p p-residue"><b>${k}</b> ${v}</span>`).join("")}</div>` : "")
      + (debt.length ? `<div class="grp"><span class="grp-h">debt</span>${debt.map(([k, v]) =>
        `<span class="p p-debt"><b>${k}</b> ${v}</span>`).join("")}</div>` : "")
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
      `Edges need an action to cite. The log holds ${model.log.records.length} records over ${model.log.crossings} crossings (${Object.entries(model.logTypes).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}), ${model.logWitnessed} with witnesses. Births are git commits, so containment edges have no seq to cite.`],
    ["the consent words", "WRITE-REGISTRY: identity",
      `The walk honours one conferral: a <code>consent:</code> map on the ground-holder's record. <b>${model.consentWords}</b> exist on disk, so every cross-household mark currently reads as market.`],
    ["the class registry's reach", "LOGOS north star · Q1 — name your class-node",
      `${model.classNodes.length} class-nodes exist (${[...model.registered].sort().join(", ")}). <b>${model.citing}</b> of ${model.marks.length} nodes name one; the rest carry <code>kind:</code>, and only <code>parcel</code> has a class-node behind its kind-string.`],
    ["the shadow grammars", "WRITE-REGISTRY: movement storage",
      `Movement: <code>walk-ledger.md</code> (${model.ledger.lines} lines). Identity: <code>households.json</code> (${model.households.count} households). Money: the sealed stamp ledger. All three live outside the graph.`],
  ];

  return `
<h2>What LOGOS derives — the same town in the target grammar</h2>
<p class="lede">Every record re-read under the law: identity = <b>slug + class</b>; authorship and containment are <b>edges</b>;
properties are <b>predicate children</b>; standing is <b>derived</b>. Missing substrate is listed under holes below.</p>
<p class="tense">Drawn by the serialization map v${esc(SERIALIZATION_MAP.version)} (${esc(SERIALIZATION_MAP.authored)}) — the table below, which states what each field serializes. Destination: ${esc(SERIALIZATION_MAP.destination)}.</p>
${statRow(lawMeasures(model).map((x) => [x.label, x.of != null ? `${x.now} / ${x.of}` : x.now, x.now === x.target ? "s-green" : "warn"]))}
${renderMappingTable(model)}
<div class="holes"><h3>Missing substrate</h3>${holes.map(([t, row, txt]) =>
    `<div class="hole-card"><b>${esc(t)}</b> <span class="rowref">${esc(row)}</span><p>${txt}</p></div>`).join("")}</div>
<div class="legend">
  <span class="e"><b>create</b> by → slug</span> <code>by:</code> is the create-edge.
  <span class="e"><b>containment</b> parent ⊃ slug</span> the directory is the geometry.
  <span class="e"><b>provenance</b> …</span> <code>derived_from:</code> — a citation.<br>
  <span class="p p-ok"><b>slot</b> value</span> already a predicate on disk.
  <span class="p p-would"><b>field</b> value</span> a field today; a predicate child under the law.<br>
  <i class="hole">⌀</i> the edge exists; there is no action id to cite.
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
    // A stage row's measure is a POSITION on a named ladder, not a count. Some
    // of what the founder is watching converge does not have a numerator.
    if (Array.isArray(x.stages)) {
      return `<td class="num"><div class="ladder">` + x.stages.map((s, i) =>
        `${i ? `<span class="rung-sep">›</span>` : ""}<span class="rung ${i < x.at ? "done" : i === x.at ? "at" : ""}">${esc(s)}</span>`
      ).join("") + `</div></td>`;
    }
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

  // The second crystallization — the law's own anatomy as a graph. Not a
  // WRITE-REGISTRY row (the registry tracks WRITE surfaces; this is the law
  // describing itself), so it rides the law's-own-measures block, reporting
  // exactly what was on disk at generation time and nothing about intent.
  const mm = model.metamodel;
  const crystalAt = !mm.present || mm.unreadable ? 0 : (mm.nodes?.length ? 1 : 0);
  const law = [...lawMeasures(model), {
    label: "the second crystallization (ŷ_graph) — the law as a graph",
    stages: ["absent", "v0 spine", "fidelity-linted"], at: crystalAt,
    note: mm.present
      ? (mm.unreadable ? `${mm.path} present but unparseable: ${mm.unreadable}`
        : `${mm.path}: ${mm.nodes.length} concept nodes, ${mm.edges.length} typed edges, ${new Set(mm.edges.map((e) => e.type)).size} edge types`)
      : `${mm.path} absent at generation time`,
  }];

  return `
<h2>Convergence — the registry, counted</h2>
<p class="lede">Each <code>WRITE-REGISTRY.md</code> row, measured live from this clone. Green = at target. Watch the warn column shrink.</p>
${drift}
<h3>The law's own measures</h3>
<table class="diff"><thead><tr><th colspan="3">measurement</th><th>this clone</th></tr></thead><tbody>
${law.map((x) => `<tr><td class="mlabel" colspan="3">${esc(x.label)}${x.note ? `<i>${esc(x.note)}</i>` : ""}</td>${cell(x)}</tr>`).join("")}
</tbody></table>
${sections}`;
}

// ── the window: the office's projection of this same town ───────────────────
function renderWindow(model) {
  const w = model.window;
  const head = `<h2>The window — the office's projection</h2>`;

  if (!w.present) {
    return head + `<p class="absent">No office payload given. Feed one:</p>
      <pre class="cmd">node tools/graph-views.mjs --window-json &lt;payload.json&gt;
node tools/graph-views.mjs --window-url  &lt;url&gt;</pre>
      <p class="absent">The payload is <code>worldGraphView()</code>'s output (<code>office/src/world-graph.mjs</code>). To make one:</p>
      <pre class="cmd">node -e "import('./src/world-graph.mjs').then(m=&gt;console.log(JSON.stringify(m.worldGraphView({}))))" &gt; world-graph.json</pre>`;
  }
  if (w.unreadable) {
    return head + `<p class="absent warn">Unreadable payload at <code>${esc(w.from)}</code>: ${esc(w.unreadable)}.</p>`;
  }

  const p = w.payload;
  const asOf = p.as_of ?? {};
  const counts = p.counts ?? {};
  const painted = new Set();
  for (const l of w.lints) for (const n of l.implicates?.nodes ?? []) painted.add(n.id);
  const paintedEdges = new Set();
  for (const l of w.lints) for (const e of l.implicates?.edges ?? []) paintedEdges.add(e.id);

  // Is the office looking at the world this clone holds? Neither surface can
  // answer alone; the hub can, and a stale store is the kind of thing that
  // hides for days behind a picture that still renders.
  const ref = model.worldRef ?? { sha: null, ref: null };
  const sameWorld = ref.sha && asOf.world ? (ref.sha === asOf.world) : null;
  const freshness = sameWorld === null
    ? `<span class="chip">world sha unknown on one side — no freshness claim</span>`
    : sameWorld
      ? `<span class="chip ok">the store is hydrated at this clone's ${esc(ref.ref)}</span>`
      : `<span class="chip warn">the store is BEHIND this clone's ${esc(ref.ref)} — store <code>${esc(String(asOf.world).slice(0, 10))}</code>, clone <code>${esc(String(ref.sha).slice(0, 10))}</code></span>`;

  // ── the map. y passes through UNCHANGED; see the header. ──────────────────
  const KIND_CLASS = { mark: "k-mark", class: "k-class", code: "k-code", doctrine: "k-doct", unknown: "k-unk" };
  const posById = new Map(w.positioned.map((n) => [n.data.id, n.position]));
  const edgeSvg = w.drawable.map((e) => {
    const a = posById.get(e.data.source), b = posById.get(e.data.target);
    const lit = e.data.lints?.length || paintedEdges.has(e.data.id);
    return `<line class="wg-e${lit ? " lit" : ""}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join("");
  const nodeSvg = w.positioned.map((n) => {
    const d = n.data, lit = d.lints?.length || painted.has(d.id);
    return `<circle class="wg-n ${KIND_CLASS[d.kind] ?? "k-unk"}${lit ? " lit" : ""}${d.unresolved ? " unres" : ""}"
      data-id="${esc(d.id)}" cx="${n.position.x}" cy="${n.position.y}" r="1"/>`;
  }).join("");

  const fit = (b) => `${b.x} ${b.y} ${b.w} ${b.h}`;

  // Nodes the store holds no coordinates for are LISTED, never placed. Giving
  // them a tidy grid would be inventing positions, and this pane's whole claim
  // is that every dot on the map is where the store says it is.
  const unpos = w.nodes.filter((n) => !n.position);
  const byKind = new Map();
  for (const n of unpos) {
    const k = n.data.kind ?? "unknown";
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(n);
  }
  const unposHtml = [...byKind].sort((a, b) => b[1].length - a[1].length).map(([k, list]) =>
    `<details><summary><span class="dot ${KIND_CLASS[k] ?? "k-unk"}"></span><b>${esc(k)}</b> <span class="count">${list.length}</span></summary>
      <div class="wg-chips">${list.slice(0, 400).map((n) => {
      const lit = n.data.lints?.length || painted.has(n.data.id);
      return `<span class="wg-chip${lit ? " lit" : ""}" data-id="${esc(n.data.id)}">${esc(n.data.id)}${lit ? ` <i>${esc((n.data.lints ?? []).join(" "))}</i>` : ""}</span>`;
    }).join("")}${list.length > 400 ? `<span class="wg-chip more">…${list.length - 400} more</span>` : ""}</div></details>`).join("");

  // ── the findings. The office's panel, kept honest to its own three rules. ──
  const lintHtml = w.lints.map((l) => {
    const im = l.implicates ?? {};
    const vclass = l.verdict === "RED" ? "st-viol" : l.verdict === "GREEN" ? "st-ok" : "st-cut";
    return `<details class="finding"><summary>
        <span class="st ${vclass}">${esc(l.lint)} · ${esc(l.verdict)}</span>
        <span class="fhead">${esc(l.headline)}</span></summary>
      <div class="fbody">
        ${im.paints === false ? `<p class="warn">paints: false — ${esc(im.note ?? "this finding addresses no node")}</p>` : ""}
        <p class="dim">implicates <b>${(im.nodes ?? []).length}</b> node(s), <b>${(im.edges ?? []).length}</b> edge(s)${
      (im.unmatched ?? []).length ? `, and <b class="warn">${im.unmatched.length}</b> id(s) the graph does not hold` : ""} · ${l.rows_total ?? 0} row(s) of evidence, ${l.evidence_total ?? 0} head(s)</p>
        ${(im.unmatched ?? []).length ? `<p class="warn">unmatched, reported not dropped: ${im.unmatched.map((u) => `<code>${esc(u.id)}</code>`).join(", ")}</p>` : ""}
        ${l.method ? `<p class="dim"><b>method</b> ${esc(excerpt(l.method, 400))}</p>` : ""}
        ${l.limits ? `<p class="dim"><b>limits</b> ${esc(excerpt(l.limits, 400))}</p>` : ""}
        <ul class="ev">${(l.evidence ?? []).map((e) => `<li>${esc(excerpt(typeof e === "string" ? e : JSON.stringify(e), 260))}</li>`).join("")}</ul>
        ${(im.nodes ?? []).length ? `<div class="wg-chips">${im.nodes.slice(0, 40).map((n) =>
        `<span class="wg-chip lit" data-id="${esc(n.id)}" title="${esc(n.why ?? "")}">${esc(n.id)}</span>`).join("")}</div>` : ""}
      </div></details>`;
  }).join("");

  const coord = p.coordinates ?? {};
  const conv = Array.isArray(p.convergence_kinds) ? p.convergence_kinds : [];

  const data = JSON.stringify(Object.fromEntries(w.nodes.map((n) => [n.data.id, n.data])));

  return head
    + `<p class="lede">The office's <code>world.db</code> drawn as a map — marks, classes, code, doctrine. Red = implicated by a standing
       invariant (L1–L6, listed below). Drag to pan, wheel to zoom, click a node to read it. Source <code>${esc(w.from)}</code>.</p>`
    + `<div class="chips">${freshness}
        <span class="chip">store hydrated ${esc(asOf.hydrated_at ?? "—")}</span>
        <span class="chip">status ${esc(asOf.hydration_status ?? "—")}</span>
        <span class="chip">world <code>${esc(String(asOf.world ?? "—").slice(0, 10))}</code></span>
        <span class="chip">office <code>${esc(String(asOf.office ?? "—").slice(0, 10))}</code></span></div>`
    + statRow([["nodes", counts.nodes ?? w.nodes.length], ["edges", counts.edges ?? w.edges.length],
        ["positioned", w.positioned.length, w.positioned.length === w.nodes.length ? "s-green" : "warn"],
        ["drawable edges", w.drawable.length, "warn"],
        ["painted nodes", painted.size, painted.size ? "warn" : "s-green"],
        ["unresolved", counts.unresolved ?? 0, (counts.unresolved ?? 0) ? "warn" : "s-green"]])
    + `<p class="note">Coordinates: ${esc(coord.units ?? "—")} · x ${esc(coord.x ?? "—")} · y ${esc(coord.y ?? "—")} · y runs down the screen, so south is down.</p>`
    + `<p class="note"><b>${w.positioned.length} of ${w.nodes.length} nodes carry a position</b> and are drawn; the rest are listed below the map.
       ${w.drawable.length} of ${w.edges.length} edges have both ends placed and are drawn.</p>`
    + `<div class="toolbar"><button onclick="wgFit(this,'all')">fit all</button><button onclick="wgFit(this,'dense')">the main cluster (${w.coreCount} of ${w.positioned.length})</button>
        <button onclick="wgConv(this)">highlight law-reaches-code</button>
        <span class="dim">drag to pan · wheel to zoom · click a node to read it</span><span class="chip" id="wg-span">—</span></div>`
    + `<div class="mm-wrap"><div class="mm-canvas wg-canvas">
        <svg id="wg-svg" data-all="${fit(w.fitAll)}" data-dense="${fit(w.fitDense)}" viewBox="${fit(w.fitDense)}"
             preserveAspectRatio="xMidYMid meet" role="img" aria-label="the office's world graph">
          <g id="wg-edges">${edgeSvg}</g><g id="wg-nodes">${nodeSvg}</g></svg></div>
        <aside class="mm-panel" id="wg-panel"><p class="dim">Click a node to read it.</p></aside></div>`
    + `<div class="legend"><span class="dot k-mark"></span> mark <span class="dot k-class"></span> class
        <span class="dot k-code"></span> code <span class="dot k-doct"></span> doctrine
        <span class="dot lit"></span> implicated by a standing invariant
        &nbsp;·&nbsp; <b>law-reaches-code</b> = ${conv.length ? conv.map((k) => `<code>${esc(k)}</code>`).join(" → ") : "—"}
        (the office calls this traversal "convergence"; renamed here).</div>`
    + `<h3>The standing invariants, painted</h3>${lintHtml}`
    + `<h3>In the store, no coordinates</h3>${unposHtml}`
    + `<h3>The three rules</h3>
       <p class="note">From <code>office/src/world-graph.mjs</code>, verbatim.</p>
       <ol class="rules">${WINDOW_HONESTY_RULES.map(([t, b]) => `<li><b>${esc(t)}</b> ${esc(b)}</li>`).join("")}</ol>`
    + `<script type="application/json" id="wg-data">${data.replace(/</g, "\\u003c")}</script>`
    + `<script type="application/json" id="wg-conv">${JSON.stringify(conv)}</script>`;
}

// ── the fourth view: the law itself ──────────────────────────────────────────
// The metamodel is the SECOND crystallization: the world graph is the town made
// of nodes and edges; this is the LAW made of nodes and edges. Rendering it with
// its edge types visible is the whole point — a concept map with unlabelled
// lines would say the concepts are related without saying how, which is exactly
// the fidelity the second crystallization exists to test.
function renderMetamodel(model) {
  const mm = model.metamodel;
  const head = `<h2>The law itself — the metamodel</h2>`;

  if (!mm.present) {
    return head + `<p class="absent"><code>${esc(mm.path)}</code> is absent. This tab draws it once the founder pen writes it —
    re-run <code>tools/graph-views.mjs</code> after the file lands.</p>`;
  }
  if (mm.unreadable) {
    return head + `<p class="absent warn"><code>${esc(mm.path)}</code> is present but did not parse: ${esc(mm.unreadable)}.
    Nothing is drawn rather than drawn wrongly.</p>`;
  }
  if (!mm.nodes.length) {
    return head + `<p class="absent"><code>${esc(mm.path)}</code> parsed but declares no nodes${
      mm.unknown.top.length ? ` (top-level keys present: ${mm.unknown.top.map((k) => `<code>${esc(k)}</code>`).join(", ")})` : ""}.</p>`;
  }

  const { pos, width, height } = mm.layout;
  const NW = 168, NH = 34;
  const P = (id) => pos.get(id) ?? { x: 0, y: 0 };
  const cx = (id) => P(id).x + NW / 2, cy = (id) => P(id).y + NH / 2;

  // Reciprocal pairs share a midpoint, so their labels land on top of each
  // other. Count each unordered pair first and fan the labels apart by index.
  const pairSeen = new Map();
  const pairIdx = mm.edges.map((e) => {
    const k = [e.from, e.to].sort().join("\t");
    const i = pairSeen.get(k) ?? 0;
    pairSeen.set(k, i + 1);
    return i;
  });

  const edgeSvg = mm.edges.map((e, i) => {
    const a = P(e.from), b = P(e.to);
    const fan = (pairIdx[i] - ((pairSeen.get([e.from, e.to].sort().join("\t")) ?? 1) - 1) / 2);
    let d, lx, ly;
    if (b.y > a.y) {
      // Forward: leave the bottom of the source, arrive at the top of the target.
      const x1 = cx(e.from), y1 = a.y + NH, x2 = cx(e.to), y2 = b.y;
      const my = (y1 + y2) / 2;
      d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
      lx = (x1 + x2) / 2; ly = my - 3 + fan * 13;
    } else {
      // Back or sideways: route off the right edge so it never hides under the
      // forward flow. A back-edge pointing the other way is the truth about it.
      const x1 = a.x + NW, y1 = cy(e.from), x2 = b.x + NW, y2 = cy(e.to);
      const bulge = Math.max(x1, x2) + 46 + Math.abs(fan) * 18;
      d = `M ${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2} ${y2}`;
      lx = bulge + 4; ly = (y1 + y2) / 2;
    }
    return `<g class="mm-edge${b.y > a.y ? "" : " mm-back"}" data-from="${esc(e.from)}" data-to="${esc(e.to)}">`
      + `<path d="${d}" marker-end="url(#mm-arrow)"/>`
      + `<text x="${lx}" y="${ly}" text-anchor="${b.y > a.y ? "middle" : "start"}">${esc(e.type)}</text></g>`;
  }).join("");

  const nodeSvg = mm.nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    const npred = Object.keys(n.predicates).length;
    return `<g class="mm-node" data-id="${esc(n.id)}" tabindex="0" role="button">`
      + `<rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="5"/>`
      + `<text x="${p.x + 10}" y="${p.y + NH / 2}" dominant-baseline="central">${esc(n.id)}</text>`
      + (npred ? `<text class="mm-badge" x="${p.x + NW - 9}" y="${p.y + NH / 2}" text-anchor="end" dominant-baseline="central">${npred}</text>` : "")
      + `</g>`;
  }).join("");

  // Node detail travels in the page as data, so a click needs no fetch and the
  // file stays openable from file://.
  const data = JSON.stringify(Object.fromEntries(mm.nodes.map((n) => [n.id, {
    class: n.class, predicates: n.predicates, prose: n.prose,
    extra: Object.keys(n.extra).length ? n.extra : null,
    out: mm.edges.filter((e) => e.from === n.id).map((e) => [e.type, e.to]),
    in: mm.edges.filter((e) => e.to === n.id).map((e) => [e.type, e.from]),
  }])));

  const notes = [];
  if (mm.dangling.length) notes.push(`<b>${mm.dangling.length}</b> edge(s) name a node the file does not define — kept and listed, not dropped: `
    + mm.dangling.slice(0, 8).map((e) => `<code>${esc(e.from)} —${esc(e.type)}→ ${esc(e.to)}</code>`).join(", "));
  if (mm.unknown.top.length) notes.push(`unknown top-level key(s): ${mm.unknown.top.map((k) => `<code>${esc(k)}</code>`).join(", ")}`);
  if (mm.unknown.node.length) notes.push(`unknown node key(s), carried through to the detail panel: ${mm.unknown.node.map((k) => `<code>${esc(k)}</code>`).join(", ")}`);
  if (mm.unknown.edge.length) notes.push(`unknown edge key(s): ${mm.unknown.edge.map((k) => `<code>${esc(k)}</code>`).join(", ")}`);

  return head
    + `<p class="lede">LOGOS as a graph, read from <code>${esc(mm.path)}</code>. Every edge is labelled with its relation.
       Click a concept for its class, predicates, edges, and the LOGOS doc it comes from.</p>`
    + statRow([["concept nodes", mm.nodes.length], ["typed edges", mm.edges.length],
        ["edge types", new Set(mm.edges.map((e) => e.type)).size], ["layers", mm.layout.layers]])
    + (notes.length ? `<div class="legend">${notes.map((n) => `<div>${n}</div>`).join("")}</div>` : "")
    + `<div class="mm-wrap"><div class="mm-canvas"><svg viewBox="0 0 ${width + (mm.layout.backEdges ? 170 : 0)} ${height}" width="${width + (mm.layout.backEdges ? 170 : 0)}" height="${height}" role="img" aria-label="the metamodel graph">
        <defs><marker id="mm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 8 4 L 0 7 z"/></marker></defs>
        ${edgeSvg}${nodeSvg}</svg></div>
      <aside class="mm-panel" id="mm-panel"><p class="dim">Click a concept to read it.</p></aside></div>
      <script type="application/json" id="mm-data">${data.replace(/</g, "\\u003c")}</script>`;
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
.frame { margin:0 0 6px; color:#c8c0af; font-size:.95rem; font-style:italic; }
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
/* the honest tense of the ideal tab */
.tense { background:#1a1e25; border:1px solid #262c36; border-left:3px solid #7ba7e0; border-radius:4px;
  padding:11px 15px; font-size:.85rem; color:#9a9280; max-width:88ch; }
.tense b { color:#c8c0af; }
/* the serialization map, open to red pen */
details.mapping { margin:16px 0; background:#1a1e25; border:1px solid #262c36; border-radius:4px; padding:10px 15px; }
details.mapping>summary { font-size:.9rem; color:#c8c0af; }
table.maptable td { font-size:.8rem; }
td.mcls { color:#7ba7e0; width:11%; } td.mgloss { color:#7e7867; font-style:italic; width:40%; }
.p-edgey { border-color:#3a4a63; } .p-edgey b { color:#7ba7e0; }
.p-residue { border-color:#5a3730; background:#241b19; color:#d98a7a; }
.p-residue b { color:#d98a7a; font-weight:normal; margin-right:5px; }
.p-debt { border-style:dotted; border-color:#65517f; background:#211c29; color:#aa8fd8; }
.p-debt b { color:#aa8fd8; font-weight:normal; margin-right:5px; }
.na { color:#5d636e; }
/* the stage ladder — a row whose measure is a position, not a count */
.ladder { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
.rung { font-size:.68rem; font-family:ui-monospace,Consolas,Menlo,monospace; padding:2px 8px; border-radius:3px;
  border:1px solid #2e3542; color:#5d636e; background:#1a1f27; white-space:nowrap; }
.rung.done { color:#84c98f; border-color:#3a5a44; }
.rung.at { color:#e8c56a; border-color:#4a3f22; background:#2a2418; }
.rung-sep { color:#3a4048; font-size:.7rem; }
/* the metamodel tab */
.absent { background:#1a1e25; border:1px solid #262c36; border-left:3px solid #5d636e; border-radius:4px;
  padding:14px 18px; color:#9a9280; max-width:82ch; }
.absent.warn { border-left-color:#d98a7a; }
.mm-wrap { display:flex; gap:14px; align-items:flex-start; margin:14px 0; }
.mm-canvas { flex:1 1 auto; overflow:auto; max-height:640px; background:#1a1e25; border:1px solid #262c36; border-radius:4px; padding:6px; }
.mm-canvas svg { display:block; }
.mm-edge path { fill:none; stroke:#3d4551; stroke-width:1.4; }
.mm-edge text { fill:#7e8794; font:10px ui-monospace,Consolas,Menlo,monospace; paint-order:stroke;
  stroke:#1a1e25; stroke-width:3px; stroke-linejoin:round; }
.mm-edge.lit path { stroke:#e8c56a; stroke-width:2.2; } .mm-edge.lit text { fill:#e8c56a; }
.mm-back path { stroke-dasharray:4 3; stroke:#4a4150; } .mm-back text { fill:#8a7f96; }
#mm-arrow path { fill:#3d4551; }
.mm-node rect { fill:#20262f; stroke:#3a4250; stroke-width:1.2; }
.mm-node text { fill:#c8c0af; font:12px ui-monospace,Consolas,Menlo,monospace; }
.mm-node text.mm-badge { fill:#5d636e; font-size:10px; }
.mm-node { cursor:pointer; }
.mm-node:hover rect, .mm-node:focus rect { stroke:#e8c56a; }
.mm-node.sel rect { stroke:#e8c56a; stroke-width:2; fill:#2a2418; }
.mm-panel { flex:0 0 300px; background:#1a1e25; border:1px solid #262c36; border-radius:4px; padding:12px 15px;
  font-size:.84rem; max-height:640px; overflow:auto; }
.mm-panel h4 { margin:0 0 3px; font-size:.95rem; color:#e8c56a; font-weight:normal;
  font-family:ui-monospace,Consolas,Menlo,monospace; }
.mm-panel .dim { color:#5d636e; }
.mm-panel dl { margin:6px 0 0; } .mm-panel dt { color:#84c98f; font-size:.7rem;
  font-family:ui-monospace,Consolas,Menlo,monospace; margin-top:7px; }
.mm-panel dd { margin:1px 0 0; color:#9a9280; font-size:.8rem; }
.mm-panel a { color:#7ba7e0; }
@media (max-width:900px) { .mm-wrap { flex-direction:column; } .mm-panel { flex:1 1 auto; width:100%; } }
/* the window pane */
pre.cmd { background:#12151b; border:1px solid #262c36; border-radius:4px; padding:10px 14px; overflow-x:auto;
  font:12px/1.6 ui-monospace,Consolas,Menlo,monospace; color:#9a9280; max-width:100%; }
.chips { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
.chip { font-size:.72rem; font-family:ui-monospace,Consolas,Menlo,monospace; padding:3px 9px; border-radius:3px;
  border:1px solid #2e3542; background:#1a1f27; color:#9a9280; }
.chip.ok { color:#84c98f; border-color:#3a5a44; } .chip.warn { color:#e8c56a; border-color:#4a3f22; background:#2a2418; }
.wg-canvas { height:560px; overflow:hidden; cursor:grab; } .wg-canvas.grabbing { cursor:grabbing; }
.wg-canvas svg { width:100%; height:100%; }
.wg-e { stroke:#333b47; stroke-width:0.6; vector-effect:non-scaling-stroke; }
.wg-e.lit { stroke:#d9503f; stroke-width:1.6; vector-effect:non-scaling-stroke; }
.wg-n { stroke:#14171d; stroke-width:0.5; vector-effect:non-scaling-stroke; cursor:pointer; }
.k-mark { fill:#7ba7e0; } .k-class { fill:#aa8fd8; } .k-code { fill:#84c98f; } .k-doct { fill:#e8c56a; } .k-unk { fill:#5d636e; }
.wg-n.lit { fill:#d9503f; } .wg-n.unres { stroke:#d98a7a; stroke-width:1.2; }
.wg-n.sel { stroke:#e8c56a; stroke-width:2.5; }
.wg-canvas.conv .wg-n { opacity:.12; } .wg-canvas.conv .wg-n.is-conv { opacity:1; }
span.dot.k-mark, span.dot.k-class, span.dot.k-code, span.dot.k-doct, span.dot.k-unk { --c:currentColor; }
span.dot.k-mark { background:#7ba7e0; } span.dot.k-class { background:#aa8fd8; }
span.dot.k-code { background:#84c98f; } span.dot.k-doct { background:#e8c56a; } span.dot.lit { background:#d9503f; }
.wg-chips { display:flex; flex-wrap:wrap; gap:4px; padding:6px 0 2px 18px; }
.wg-chip { font-size:.68rem; font-family:ui-monospace,Consolas,Menlo,monospace; padding:2px 7px; border-radius:3px;
  border:1px solid #2e3542; background:#1a1f27; color:#9a9280; cursor:pointer; }
.wg-chip.lit { border-color:#5a3730; background:#241b19; color:#d98a7a; }
.wg-chip.more { border-style:dashed; cursor:default; } .wg-chip i { font-style:normal; color:#e8c56a; }
details.finding { border:1px solid #262c36; border-radius:4px; margin:6px 0; background:#1a1e25; padding:8px 12px; }
details.finding>summary { display:flex; gap:9px; align-items:baseline; flex-wrap:wrap; }
.fhead { color:#c8c0af; font-size:.86rem; } .fbody { padding:8px 0 2px 4px; }
.fbody p { margin:4px 0; font-size:.82rem; } .fbody .dim { color:#7e7867; }
ul.ev { margin:6px 0; padding-left:20px; } ul.ev li { color:#9a9280; font-size:.79rem; margin:3px 0;
  font-family:ui-monospace,Consolas,Menlo,monospace; }
ol.rules { max-width:92ch; } ol.rules li { color:#9a9280; font-size:.85rem; margin:8px 0; }
ol.rules b { color:#c8c0af; }
`;

const JS = `
function show(i){document.querySelectorAll('nav button').forEach(function(b,j){b.setAttribute('aria-selected',j===i);});
document.querySelectorAll('main>section').forEach(function(s,j){s.hidden=j!==i;});}
function allDetails(btn,open){btn.closest('section').querySelectorAll('details').forEach(function(d){d.open=open;});}
(function(){
  var el=document.getElementById('mm-data'); if(!el) return;
  var data=JSON.parse(el.textContent), panel=document.getElementById('mm-panel');
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
  function rows(list,arrow){return list.map(function(p){
    return '<dd><code>'+esc(p[0])+'</code> '+arrow+' '+esc(p[1])+'</dd>';}).join('');}
  function pick(id){
    var n=data[id]; if(!n) return;
    document.querySelectorAll('.mm-node').forEach(function(g){g.classList.toggle('sel',g.dataset.id===id);});
    document.querySelectorAll('.mm-edge').forEach(function(g){
      g.classList.toggle('lit',g.dataset.from===id||g.dataset.to===id);});
    var h='<h4>'+esc(id)+'</h4>';
    if(n.class) h+='<p class="dim">class: '+esc(n.class)+'</p>';
    var keys=Object.keys(n.predicates||{});
    if(keys.length){h+='<dl><dt>predicates</dt>'+keys.map(function(k){
      var v=n.predicates[k]; if(v&&typeof v==='object') v=JSON.stringify(v);
      return '<dd><b>'+esc(k)+'</b> '+esc(v)+'</dd>';}).join('')+'</dl>';}
    if(n.out&&n.out.length) h+='<dl><dt>edges out</dt>'+rows(n.out,'&rarr;')+'</dl>';
    if(n.in&&n.in.length) h+='<dl><dt>edges in</dt>'+rows(n.in,'&larr;')+'</dl>';
    if(n.prose) h+='<dl><dt>prose</dt><dd><a href="../'+esc(n.prose)+'">'+esc(n.prose)+'</a></dd></dl>';
    else h+='<p class="dim">no prose pointer on this node.</p>';
    if(n.extra) h+='<dl><dt>keys this reader does not know</dt><dd>'+esc(JSON.stringify(n.extra))+'</dd></dl>';
    panel.innerHTML=h;
  }
  document.querySelectorAll('.mm-node').forEach(function(g){
    g.addEventListener('click',function(){pick(g.dataset.id);});
    g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(g.dataset.id);}});
  });
})();
(function(){
  var el=document.getElementById('wg-data'); if(!el) return;
  var data=JSON.parse(el.textContent), svg=document.getElementById('wg-svg'),
      panel=document.getElementById('wg-panel'), canvas=svg.parentNode;
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
  var vb=svg.getAttribute('viewBox').split(' ').map(Number);
  // The viewBox holds real world METRES, so a radius written in user units is a
  // radius in metres — at town scale that is a third of a screen pixel, which
  // is how the first draft rendered an empty map. Stroke has vector-effect;
  // there is no such thing for r, so r is rescaled on every viewBox change to
  // keep a node the same size on screen at any zoom.
  var dots=[].slice.call(svg.querySelectorAll('.wg-n'));
  var span=document.getElementById('wg-span');
  function apply(){
    svg.setAttribute('viewBox',vb.join(' '));
    var r=canvas.getBoundingClientRect(), u=vb[2]/Math.max(1,r.width);
    for(var i=0;i<dots.length;i++){
      var base=dots[i].classList.contains('sel')?6:dots[i].classList.contains('lit')?4.4:3;
      dots[i].setAttribute('r',base*u);
    }
    if(span) span.textContent=Math.round(vb[2]).toLocaleString()+' m across';
  }
  window.wgFit=function(btn,which){
    vb=svg.dataset[which==='all'?'all':'dense'].split(' ').map(Number); apply();};
  window.wgConv=function(btn){
    var on=canvas.classList.toggle('conv');
    btn.textContent=(on?'show all kinds':'highlight law-reaches-code');};
  // pan
  var drag=null;
  canvas.addEventListener('pointerdown',function(e){
    if(e.target.classList.contains('wg-n')) return;
    drag={x:e.clientX,y:e.clientY,vb:vb.slice()}; canvas.classList.add('grabbing');
    canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',function(e){
    if(!drag) return;
    var r=canvas.getBoundingClientRect(), sx=drag.vb[2]/r.width, sy=drag.vb[3]/r.height;
    vb[0]=drag.vb[0]-(e.clientX-drag.x)*sx; vb[1]=drag.vb[1]-(e.clientY-drag.y)*sy; apply();});
  function endDrag(){drag=null; canvas.classList.remove('grabbing');}
  canvas.addEventListener('pointerup',endDrag); canvas.addEventListener('pointercancel',endDrag);
  // zoom about the cursor
  canvas.addEventListener('wheel',function(e){
    e.preventDefault();
    var r=canvas.getBoundingClientRect(), k=e.deltaY>0?1.15:1/1.15;
    var px=(e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height;
    var cx=vb[0]+vb[2]*px, cy=vb[1]+vb[3]*py;
    vb[2]*=k; vb[3]*=k; vb[0]=cx-vb[2]*px; vb[1]=cy-vb[3]*py; apply();},{passive:false});
  // the convergence set, marked once so the toggle is pure CSS
  var conv=(JSON.parse(document.getElementById('wg-conv')?.textContent||'[]'));
  svg.querySelectorAll('.wg-n').forEach(function(n){
    var d=data[n.dataset.id]; if(d&&conv.indexOf(d.kind)>=0) n.classList.add('is-conv');});
  function pick(id){
    var d=data[id]; if(!d) return;
    svg.querySelectorAll('.wg-n').forEach(function(n){n.classList.toggle('sel',n.dataset.id===id);});
    apply();
    var h='<h4>'+esc(id)+'</h4><p class="dim">'+esc(d.kind)+(d.subkind?' · '+esc(d.subkind):'')+'</p><dl>';
    ['tier','by','path','date','mechanic','class','affordances','deg','indeg','outdeg'].forEach(function(k){
      if(d[k]===undefined||d[k]===null) return;
      h+='<dt>'+k+'</dt><dd>'+esc(d[k])+'</dd>';});
    if(d.unresolved) h+='<dt>unresolved</dt><dd>the store holds no node behind this id</dd>';
    if(d.lints&&d.lints.length) h+='<dt>implicated by</dt><dd>'+esc(d.lints.join(', '))+'</dd>';
    panel.innerHTML=h+'</dl>';}
  svg.addEventListener('click',function(e){
    if(e.target.classList.contains('wg-n')) pick(e.target.dataset.id);});
  apply();
  window.addEventListener('resize',apply);
  document.querySelectorAll('.wg-chip[data-id]').forEach(function(c){
    c.addEventListener('click',function(){pick(c.dataset.id);
      panel.scrollIntoView({block:'nearest'});});});
})();
`;

function renderHtml(model, views) {
  const tabs = views.map((v, i) => `<button aria-selected="${i === 0}" onclick="show(${i})">${v.label}</button>`).join("");
  const secs = views.map((v, i) => `<section${i === 0 ? "" : " hidden"}>${v.html}</section>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Postmark — graph views</title><style>${CSS}</style></head>
<body><div class="wrap">
<h1>POSTMARK · THE GRAPH HUB</h1>
<p class="frame">Five views of one town, measured against LOGOS.</p>
<p class="sub">${esc(model.repo)} · generated ${esc(model.generatedAt)} · ${model.marks.length} nodes${
    model.window?.present && !model.window.unreadable ? ` · window from ${esc(model.window.from)}` : ""}</p>
<nav>${tabs}</nav>
<main>${secs}</main>
<footer>Generated by <code>tools/graph-views.mjs</code> · standing from <code>tools/mark-standing.mjs</code> · rows from <code>WRITE-REGISTRY.md</code>.</footer>
</div><script>${JS}</script></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
const model = await buildModel();
const ALL = [
  { key: "window", label: "The window", render: renderWindow },
  { key: "practical", label: "What IS", render: renderPractical },
  { key: "ideal", label: "What LOGOS derives", render: renderIdeal },
  { key: "diff", label: "Convergence", render: renderDiff },
  { key: "law", label: "The law itself", render: renderMetamodel },
];
const chosen = VIEW === "all" ? ALL : ALL.filter((v) => v.key === VIEW);
if (!chosen.length) {
  console.error(`unknown --view "${VIEW}" — one of: window, practical, ideal, diff, law (default: all five, tabbed)`);
  process.exit(1);
}
writeFileSync(OUT, renderHtml(model, chosen.map((v) => ({ label: v.label, html: v.render(model) }))));
const kb = Math.round(statSync(OUT).size / 1024);
console.log(`graph-hub: ${model.marks.length} nodes · ${model.containment.length} containment edges · `
  + `${model.tierCarriers.length} raw tier fields (${model.tierInert.length} inert) · `
  + `${model.classNodes.length} class-nodes · ${model.log.records.length} log records · ${model.consentWords} consent words`);
// Each pane says out loud whether its source was there. A pane that renders an
// honest absence and a pane that renders data must not look the same from the
// command line, or a missing feed gets shipped as a finished page.
const say = (name, ok, detail) => console.log(`  ${ok ? "·" : "!"} ${name.padEnd(22)} ${ok ? detail : `ABSENT — ${detail}`}`);
say("window", !!(model.window.present && !model.window.unreadable),
  model.window.unreadable ? `${model.window.from}: ${model.window.unreadable}`
    : model.window.present ? `${model.window.nodes.length} nodes · ${model.window.lints.length} invariants · from ${model.window.from}`
      : "no --window-json / --window-url given");
say("law (metamodel)", !!(model.metamodel.present && !model.metamodel.unreadable && model.metamodel.nodes?.length),
  model.metamodel.unreadable ? `${model.metamodel.path}: ${model.metamodel.unreadable}`
    : model.metamodel.present ? `${model.metamodel.nodes.length} concepts · ${model.metamodel.edges.length} typed edges`
      : `${model.metamodel.path} not on disk`);
say("published store", !!model.store && !model.store._error, model.store?._error ?? `written ${model.store?._mtime}`);
say("write registry", !model.registry.missing,
  model.registry.missing ? "WRITE-REGISTRY.md not found" : `${model.registry.sections.reduce((n, s) => n + s.rows.length, 0)} rows`);
console.log(`wrote ${OUT} (${kb} KB) — open it in a browser; it needs no server.`);
