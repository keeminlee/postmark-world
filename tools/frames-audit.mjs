// frames-audit.mjs — the LIVE split-brain census (world-runtime ladder, rung 8).
//
// A READ-ONLY tool. It loads the world's real, scattered state — marks from
// world-state.json, walk positions derived from the walk ledger, occupancy
// derived from the threshold ledger, holdings folded from the attachments log —
// pours them through the pure `buildFrameGraph` + `composeWorldPosition`, and
// reports how many split-brains actually exist in the record RIGHT NOW.
//
// The one thing it answers: of everyone the record says is somewhere, for how
// many do two ledgers disagree about where? Occupancy that claims a walker is
// inside a mark their walk position left (the after-party-Grove risk); a held
// thing whose holder has fallen out of the graph; an entity that entered marks
// but has no walk record to place them. Every count is COMPUTED from the loaded
// state, never asserted — and every source it could not reach is DISCLOSED, so a
// partial census says what it could not see rather than guessing.
//
// PURITY LINE. The frame core (frames.mjs) and the adapter (frames-adapter.mjs)
// stay pure — data in, nodes out. ALL io lives here: this file reads the files
// and the db, shapes the four sources, and hands them to the pure pair. The fold
// functions below (`foldHoldings`, `categorize`) are themselves pure so a test
// can drive the whole census from fixture text without touching disk.

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { parseWalkLedger, positionsAt, fractionalCrossing } from "./walk.mjs";
import { parseThresholdLedger, occupancyAt } from "./thresholds.mjs";
import { buildFrameGraph } from "./frames-adapter.mjs";
import { composeWorldPosition, frameChain } from "./frames.mjs";

// A CJS require for core modules only — node:sqlite is experimental, so it is
// loaded through this hop lazily (touched only when a db path is given) rather
// than a top-level import that would warn on every run of the whole tool.
const require = createRequire(import.meta.url);

// ── pure folds ───────────────────────────────────────────────────────────────

// A thing's mark carries `class: "thing"` (the 2026-08-22 ruling: a thing is not
// ground). These are the carriable objects; every other placed mark is world
// furniture. Split so the census can count entities / things / marks apart while
// still feeding every placed mark to the graph (an unheld thing rests on its own
// ground, a held one gets reparented onto its holder by buildFrameGraph).
export const isThingMark = (m) => m?.class === "thing";

/**
 * Current holdings, folded from the attachments log. The log is append-only acts
 * on (entity, target) pairs: `cascade` attaches (a pickup), `detach` releases (a
 * drop). Latest act per TARGET wins — a thing has one holder, and the last hand
 * to touch it is the one holding it. A target whose latest act is a detach is
 * held by nobody and is omitted.
 *
 * @param {Array<{entity,target,policy,born_at}>} acts
 * @returns {Array<{thing,holder}>}  one row per currently-held thing
 */
export function foldHoldings(acts = []) {
  const latest = new Map(); // target → the act with the newest born_at
  for (const a of acts) {
    if (!a?.target || !a?.entity) continue;
    const prev = latest.get(a.target);
    if (!prev || String(a.born_at) > String(prev.born_at)) latest.set(a.target, a);
  }
  const holdings = [];
  for (const [target, a] of latest) {
    if (a.policy === "detach") continue; // released — nobody holds it now
    holdings.push({ thing: target, holder: a.entity });
  }
  return holdings.sort((x, y) => x.thing.localeCompare(y.thing));
}

/** Split placed marks into world furniture vs. things, for the totals line. */
export function categorize(marks = []) {
  const things = [], furniture = [];
  for (const m of marks) (isThingMark(m) ? things : furniture).push(m);
  return { things, furniture };
}

// ── io loaders (the impure half) ─────────────────────────────────────────────

/** Placed marks from world-state.json — those with a readable centre AND a real
 *  extent (the only ones that have an inside and can be composed against). */
export function loadMarks(worldStatePath) {
  const state = JSON.parse(readFileSync(worldStatePath, "utf8"));
  return (state.marks ?? [])
    .filter((m) => m?.at && Number.isFinite(m.at.x) && Number.isFinite(m.at.y)
                && m?.extent && Number(m.extent.w) > 0 && Number(m.extent.h) > 0)
    .map((m) => ({ id: m.id, at: m.at, extent: m.extent, class: m.class ?? null, kind: m.kind ?? null }));
}

/** Live walker positions: every departure's derived (x,y) at `now`. */
export function loadWalkers(walkLedgerPath, now = fractionalCrossing()) {
  const { departures, unrecognized } = parseWalkLedger(readFileSync(walkLedgerPath, "utf8"));
  const pos = positionsAt(departures, now);
  const walkers = {};
  for (const [handle, p] of Object.entries(pos)) walkers[handle] = { x: p.x, y: p.y };
  return { walkers, unrecognized };
}

/** Live occupancy stacks: the mark chain each handle has entered and not left. */
export function loadOccupancy(thresholdLedgerPath) {
  const { acts, unrecognized } = parseThresholdLedger(readFileSync(thresholdLedgerPath, "utf8"));
  const occupancy = {};
  for (const [handle, stack] of occupancyAt(acts)) occupancy[handle] = stack;
  return { occupancy, unrecognized };
}

/**
 * Holdings, from whichever custody store is reachable. Two shapes, one fold:
 *   · a sqlite db (dynamic.db) with an `attachments` table — read read-only.
 *   · a JSON array of attachment acts (a dumped snapshot) — read straight.
 * Returns { holdings, source, disclosure }. If neither path is reachable the
 * holdings are empty and a disclosure names the gap — a census that cannot see
 * custody says so rather than reporting zero held things as if it looked.
 */
export function loadHoldings({ dbPath = null, jsonPath = null } = {}) {
  if (jsonPath && existsSync(jsonPath)) {
    const acts = JSON.parse(readFileSync(jsonPath, "utf8"));
    return { holdings: foldHoldings(acts), source: `attachments-json:${jsonPath}`, disclosure: null };
  }
  if (dbPath && existsSync(dbPath)) {
    try {
      // node:sqlite is experimental; loaded here (only when a db path is given)
      // so the tool loads and its tests run where sqlite is absent. Disclose
      // rather than crash if the read fails.
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const acts = db.prepare("SELECT entity, target, policy, born_at FROM attachments").all();
      db.close();
      return { holdings: foldHoldings(acts), source: `dynamic.db:${dbPath}`, disclosure: null };
    } catch (e) {
      return { holdings: [], source: null,
               disclosure: { kind: "holdings-unsourced", note: `dynamic.db at ${dbPath} unreadable: ${e.message}` } };
    }
  }
  return { holdings: [], source: null,
           disclosure: { kind: "holdings-unsourced",
                         note: "no custody store reachable (dynamic.db attachments table lives on the office box); held-thing census skipped — count is a floor of 0, not a measured 0." } };
}

// ── the census ───────────────────────────────────────────────────────────────

/**
 * The whole audit, over an already-loaded set of sources. Pure given its input
 * (the loaders did the io). Returns the census: totals, the stale-occupancy
 * list, the held-thing composition list, and every fault — each COMPUTED from
 * the graph, plus every disclosure the adapter and the loaders raised.
 *
 * @param {object} src   { marks, walkers, occupancy, holdings } — buildFrameGraph's shape
 * @param {object} extra { loaderDisclosures } — gaps the io half already knows
 */
export function auditCensus(src = {}, extra = {}) {
  const { marks = [], walkers = {}, occupancy = {}, holdings = [] } = src;
  const { loaderDisclosures = [] } = extra;

  const { nodes, disclosures } = buildFrameGraph(src);
  const allDisclosures = [...disclosures, ...loaderDisclosures];

  const { things, furniture } = categorize(marks);

  // Stale occupancy — the headline. The adapter raises one per entity whose
  // walk position is outside the deepest mark their occupancy claims.
  const staleOccupancy = allDisclosures
    .filter((d) => d.kind === "stale-occupancy")
    .map((d) => ({ handle: d.handle, occupies: d.occupies, walk_pos: d.walk_pos, mark_pos: d.mark_pos }));

  // Occupancy with no walk position — an entity that entered marks but has no
  // walk record, so it has no world position at all. The adapter cannot place
  // it (it iterates walkers), so its occupancy is silently dropped; the census
  // names it as its own split-brain rather than letting it vanish.
  const occupancyWithoutPosition = Object.keys(occupancy)
    .filter((h) => !(h in walkers))
    .map((handle) => ({ handle, occupies: occupancy[handle] }));
  for (const o of occupancyWithoutPosition)
    allDisclosures.push({ kind: "occupancy-without-position", handle: o.handle, occupies: o.occupies,
      note: `${o.handle} has entered ${o.occupies.join(" > ")} but has no walk record — no world position to place them, so the graph omits them and their occupancy is orphaned.` });

  // Held things — does each compose to its holder? A held thing is framed on
  // its holder at their feet; it "composes to its holder" when its world
  // position equals the holder's. A holder absent from the graph is a
  // dangling-holder (the thing cannot be placed at all).
  const held = holdings.map(({ thing, holder }) => {
    const node = nodes[thing];
    const holderInGraph = !!nodes[holder];
    let composes = false, thingPos = null, holderPos = null, fault = null;
    if (!holderInGraph) {
      fault = "dangling-holder";
    } else {
      try {
        thingPos = node ? composeWorldPosition(thing, nodes) : null;
        holderPos = composeWorldPosition(holder, nodes);
        composes = !!thingPos && !!holderPos && thingPos.x === holderPos.x && thingPos.y === holderPos.y;
        if (!composes && node?.frame !== holder) fault = "not-framed-on-holder";
        else if (!composes) fault = "holder-positionless"; // holder in graph but carries no position
      } catch (e) {
        fault = `compose-fault: ${e.message}`;
      }
    }
    return { thing, holder, framed_on: node?.frame ?? null, holder_in_graph: holderInGraph, composes, thing_pos: thingPos, holder_pos: holderPos, fault };
  });

  // Graph faults — walk every node's frame chain; a cycle or dangling frame
  // throws, and is a fault a caller must see. dangling-holder disclosures from
  // the adapter are collected too.
  const faults = [];
  for (const id of Object.keys(nodes)) {
    try { frameChain(id, nodes); }
    catch (e) { faults.push({ node: id, error: e.message }); }
  }
  const danglingHolders = allDisclosures.filter((d) => d.kind === "dangling-holder");

  return {
    totals: {
      entities: Object.keys(walkers).length,
      things: things.length,
      marks: furniture.length,
      placed_marks_total: marks.length,
      nodes: Object.keys(nodes).length,
    },
    stale_occupancy: { count: staleOccupancy.length, cases: staleOccupancy },
    occupancy_without_position: { count: occupancyWithoutPosition.length, cases: occupancyWithoutPosition },
    held_things: {
      count: held.length,
      composing: held.filter((h) => h.composes).length,
      stuck: held.filter((h) => !h.composes).length,
      cases: held,
    },
    faults: { chain_faults: faults, dangling_holders: danglingHolders.map((d) => ({ thing: d.thing, holder: d.holder })) },
    disclosures: allDisclosures,
  };
}

// ── the live run (io + census + report) ──────────────────────────────────────

const DEFAULTS = {
  worldRoot: "G:/postmark/postmark-world/WORLD",
  dynamicDb: null,          // e.g. a local snapshot of the office box's dynamic.db
  attachmentsJson: null,    // or a dumped attachments array
};

/** Load every source, run the census, return { census, meta }. */
export function runLiveAudit(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const now = opts.now ?? fractionalCrossing();
  const loaderDisclosures = [];

  const marks = loadMarks(`${cfg.worldRoot}/world-state.json`);
  const { walkers, unrecognized: walkUnrec } = loadWalkers(`${cfg.worldRoot}/walk-ledger.md`, now);
  const { occupancy, unrecognized: thrUnrec } = loadOccupancy(`${cfg.worldRoot}/threshold-ledger.md`);
  const { holdings, source: holdingsSource, disclosure: holdingsDisc } =
    loadHoldings({ dbPath: cfg.dynamicDb, jsonPath: cfg.attachmentsJson });
  if (holdingsDisc) loaderDisclosures.push(holdingsDisc);
  if (walkUnrec.length) loaderDisclosures.push({ kind: "walk-ledger-unrecognized", count: walkUnrec.length });
  if (thrUnrec.length) loaderDisclosures.push({ kind: "threshold-ledger-unrecognized", count: thrUnrec.length });

  const census = auditCensus({ marks, walkers, occupancy, holdings }, { loaderDisclosures });
  return { census, meta: { now, worldRoot: cfg.worldRoot, holdingsSource, at: new Date().toISOString() } };
}

/** A human-readable summary of the census — the census spoken, every line a
 *  count that came out of the graph. */
export function summarize(census, meta = {}) {
  const L = [];
  const t = census.totals;
  L.push(`FRAME-GRAPH LIVE CENSUS  (${meta.at ?? ""})`);
  L.push(`world: ${meta.worldRoot ?? "?"}  ·  clock: crossing ${Number(meta.now ?? 0).toFixed(4)}`);
  L.push(`holdings source: ${meta.holdingsSource ?? "NONE (disclosed)"}`);
  L.push("");
  L.push(`TOTALS: ${t.entities} entities · ${t.things} things · ${t.marks} marks  (${t.nodes} frame nodes)`);
  L.push("");
  L.push(`STALE OCCUPANCY: ${census.stale_occupancy.count} case(s) — occupancy claims inside a mark the walk position left`);
  for (const c of census.stale_occupancy.cases)
    L.push(`  · ${c.handle} occupies ${c.occupies}, but walks at (${c.walk_pos.x}, ${c.walk_pos.y}) — mark centre (${c.mark_pos.x}, ${c.mark_pos.y})`);
  L.push("");
  L.push(`OCCUPANCY WITHOUT POSITION: ${census.occupancy_without_position.count} case(s) — entered marks but no walk record to place them`);
  for (const c of census.occupancy_without_position.cases)
    L.push(`  · ${c.handle} in [${c.occupies.join(" > ")}] — no world position`);
  L.push("");
  const h = census.held_things;
  L.push(`HELD THINGS: ${h.count} held · ${h.composing} compose to their holder · ${h.stuck} stuck`);
  for (const c of h.cases) {
    const where = c.composes && c.holder_pos ? `→ (${c.holder_pos.x}, ${c.holder_pos.y}) with ${c.holder}` : `STUCK (${c.fault})`;
    L.push(`  · ${c.thing}  held by ${c.holder}  ${where}`);
  }
  L.push("");
  L.push(`FAULTS: ${census.faults.chain_faults.length} chain fault(s) (cycle/dangling-frame) · ${census.faults.dangling_holders.length} dangling holder(s)`);
  for (const f of census.faults.chain_faults) L.push(`  · ${f.node}: ${f.error}`);
  for (const f of census.faults.dangling_holders) L.push(`  · ${f.thing} held by absent ${f.holder}`);
  const otherDisc = census.disclosures.filter((d) => !["stale-occupancy", "occupancy-without-position", "dangling-holder"].includes(d.kind));
  if (otherDisc.length) {
    L.push("");
    L.push(`DISCLOSURES (unsourced / malformed): ${otherDisc.length}`);
    for (const d of otherDisc) L.push(`  · [${d.kind}] ${d.note ?? d.count ?? ""}`);
  }
  return L.join("\n");
}

// ── cli ──────────────────────────────────────────────────────────────────────
// node tools/frames-audit.mjs [--world <dir>] [--db <dynamic.db>] [--attachments-json <file>] [--json]
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("frames-audit.mjs")) {
  const args = process.argv.slice(2);
  const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const cfg = {};
  if (opt("--world")) cfg.worldRoot = opt("--world");
  if (opt("--db")) cfg.dynamicDb = opt("--db");
  if (opt("--attachments-json")) cfg.attachmentsJson = opt("--attachments-json");
  const { census, meta } = runLiveAudit(cfg);
  if (args.includes("--json")) console.log(JSON.stringify({ census, meta }, null, 2));
  else console.log(summarize(census, meta));
}
