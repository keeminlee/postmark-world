#!/usr/bin/env node
// marks-fold.mjs — canon is a fold over the marks register + the stake lines.
// Pure function: (WORLD/marks/**, TERRAIN/skeleton.json, stakes, prevState?) -> world-state.
// Anyone with a clone can recompute the world. See MARKS.md (the law this implements).
//
// Usage:
//   node tools/marks-fold.mjs                      # fold the repo, write WORLD/world-state.json + WORLD/INDEX.md
//   node tools/marks-fold.mjs --stakes f.json      # override stakes source (sims/tests)
//   node tools/marks-fold.mjs --marks-dir d --prev prev.json --tick N --no-write --json
//
// Stakes source (default): lines in WHITE_PAGES/stamp-ledger.md of the form
//   - <date> · <handle> → stake:mark:<household>/<slug> · <n> · ...
//   - <date> · <handle> → return:mark:<household>/<slug> · <n> · ...
// or a JSON file: [{ holder, mark, n, tick }] (negative n or matching return = withdrawal).

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const has = (name) => args.includes(name);
const MARKS_DIR = opt("--marks-dir", join(ROOT, "WORLD/marks"));
const TERRAIN_PATH = opt("--terrain", join(ROOT, "WORLD/TERRAIN/skeleton.json"));
const STAKES_PATH = opt("--stakes", null);
const PREV_PATH = opt("--prev", null);
const TICK = Number(opt("--tick", 0));
const DIALS = {
  determine_pct: 0.50, release_pct: 0.40,      // hysteresis band (MARKS.md)
  overlap_site_frac: 0.30,                     // sited overlap fraction -> same site-slot
  parcel_w: 25, parcel_h: 25,
  ...(opt("--dials", null) ? JSON.parse(readFileSync(opt("--dials"), "utf8")) : {}),
};

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
    if (val.startsWith("{")) { // inline object {x: 1, y: 2}
      const obj = {};
      for (const pair of val.replace(/[{}]/g, "").split(",")) {
        const p = pair.match(/([\w]+)\s*:\s*(-?[\d.]+)/);
        if (p) obj[p[1]] = Number(p[2]);
      }
      val = obj;
    } else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    fm[key] = val;
  }
  return { ...fm, body };
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
export function loadMarks(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const hh of readdirSync(dir)) {
    const hhDir = join(dir, hh);
    let st; try { st = statSync(hhDir); } catch { continue; }
    if (!st.isDirectory()) continue;
    walkMarks(hhDir, hh, null, out);
  }
  return out;
}

function walkMarks(nodeDir, household, parentMarkId, out) {
  const entries = readdirSync(nodeDir);
  let thisId = parentMarkId;
  if (entries.includes("mark.md")) {
    const slug = basename(nodeDir);
    let rec;
    try {
      rec = parseRecord(readFileSync(join(nodeDir, "mark.md"), "utf8"), `${household}/${slug}/mark.md`);
    } catch (e) {
      rec = { _error: e.message, body: "" };
    }
    const stray = { household: rec.household, mark: rec.mark }; // dir is authoritative; keep for lint cross-check
    rec.household = household;
    rec.slug = slug;
    rec.id = `${household}/${slug}`;
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
    if (s.isDirectory()) walkMarks(p, household, thisId, out);
  }
}

// ---------- load stakes ----------
function loadStakes() {
  if (STAKES_PATH) {
    const j = JSON.parse(readFileSync(STAKES_PATH, "utf8"));
    return j.map(s => ({ tick: s.tick ?? 0, holder: s.holder, mark: s.mark, n: s.n }));
  }
  const ledger = join(ROOT, "WHITE_PAGES/stamp-ledger.md");
  if (!existsSync(ledger)) return [];
  const out = [];
  const re = /^-\s+(\S+)\s+·\s+(\S+)\s+→\s+(stake|return):mark:(\S+)\s+·\s+(\d+)/;
  for (const line of readFileSync(ledger, "utf8").split(/\r?\n/)) {
    const m = line.match(re);
    if (m) out.push({ tick: 0, holder: m[2], mark: m[4], n: m[3] === "return" ? -Number(m[5]) : Number(m[5]) });
  }
  return out;
}

// ---------- geometry (the ONE definition now lives in geometry.mjs — pure and
// browser-safe. Imported here for the fold's internal use, and RE-EXPORTED so
// mark-lint.mjs's `import { … rect, contains } from "./marks-fold.mjs"` is
// unchanged. rects are centered on at, sized by extent) ----------
export { rect, overlapArea, contains } from "./geometry.mjs";
import { rect, overlapArea, contains } from "./geometry.mjs";

// ---------- the fold ----------
export function fold({ marks, terrain, stakes, prev = null, tick = 0, dials = DIALS }) {
  const errors = [];
  const terrainIds = new Set((terrain?.features ?? []).map(f => "terrain:" + f.id));
  const byId = new Map();
  for (const mk of marks) {
    if (mk._error) { errors.push({ mark: mk.id, error: mk._error }); continue; }
    if (byId.has(mk.id)) { errors.push({ mark: mk.id, error: "duplicate id" }); continue; }
    byId.set(mk.id, mk);
  }

  // admissibility: parcels never overlap (first-in-order wins), one per household;
  // predicated/naming must not target terrain with a rival intent (attach-only is fine —
  // rivalry-vs-terrain is refused later since terrain has no slot values to rival).
  const parcels = [];
  const parcelByHh = new Map();
  for (const mk of byId.values()) {
    if (mk.kind !== "parcel") continue;
    const r = rect(mk); r.w = r.w || dials.parcel_w; r.h = r.h || dials.parcel_h;
    if (parcelByHh.has(mk.household)) { errors.push({ mark: mk.id, error: "household already holds a parcel (relocation = replace, not add)" }); continue; }
    const clash = parcels.find(p => overlapArea(p._r, r) > 0);
    if (clash) { errors.push({ mark: mk.id, error: `parcel overlaps ${clash.id} — inadmissible (MARKS.md § Parcels)` }); continue; }
    parcels.push({ id: mk.id, household: mk.household, _r: r });
    parcelByHh.set(mk.household, r);
  }

  // stakes -> per-mark balances (escrow; negative = withdrawal), effect-next-crossing: tick strictly < current
  const stakeByMark = new Map(); const portfolios = new Map();
  for (const s of stakes) {
    if (s.tick >= tick && tick > 0) continue; // not yet effective
    if (!byId.has(s.mark) && !terrainIds.has(s.mark)) { errors.push({ stake: s, error: "stake on unknown mark" }); continue; }
    stakeByMark.set(s.mark, (stakeByMark.get(s.mark) ?? 0) + s.n);
    if (!portfolios.has(s.holder)) portfolios.set(s.holder, new Map());
    const pf = portfolios.get(s.holder);
    pf.set(s.mark, (pf.get(s.mark) ?? 0) + s.n);
  }
  for (const [id, n] of stakeByMark) if (n < 0) { errors.push({ mark: id, error: `net stake negative (${n}) — over-withdrawal` }); stakeByMark.set(id, 0); }

  // sovereignty: sited marks fully inside their OWN household's parcel are sovereign leaves
  for (const mk of byId.values()) {
    if (mk.kind === "sited") {
      const pr = parcelByHh.get(mk.household);
      mk._sovereign = !!(pr && contains(pr, rect(mk)));
    }
  }

  // containment edges (computed, never authored): sited-in-sited by geometry; predicated/naming by parent ref
  const children = new Map(); const parentOf = new Map();
  const sited = [...byId.values()].filter(mk => mk.kind === "sited");
  for (const a of sited) for (const b of sited) {
    if (a === b) continue;
    const ra = rect(a), rb = rect(b);
    if (ra.w * ra.h > rb.w * rb.h && contains(ra, rb)) {
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

  // fan-up weight: own + all descendants (memoized DFS)
  const weight = new Map();
  const weightOf = (id, seen = new Set()) => {
    if (weight.has(id)) return weight.get(id);
    if (seen.has(id)) return 0; seen.add(id);
    let w = stakeByMark.get(id) ?? 0;
    for (const c of children.get(id) ?? []) w += weightOf(c, seen);
    weight.set(id, w); return w;
  };
  for (const id of [...byId.keys(), ...terrainIds]) weightOf(id);

  // slots: predicated/naming rivalry = same (parent, slot); sited rivalry = overlapping non-sovereign extents
  const slots = new Map(); // key -> { values: Map(value -> stamps), marks: [] }
  for (const mk of byId.values()) {
    if (mk.kind === "predicated" || mk.kind === "naming") {
      if (terrainIds.has(mk.parent) && mk.slot !== "name" && mk.kind === "naming") { /* naming terrain allowed */ }
      const key = `${mk.parent}::${mk.kind === "naming" ? "name" : mk.slot}`;
      if (!slots.has(key)) slots.set(key, { values: new Map(), marks: [] });
      const slot = slots.get(key);
      slot.marks.push(mk.id);
      const v = String(mk.value ?? "");
      slot.values.set(v, (slot.values.get(v) ?? 0) + (stakeByMark.get(mk.id) ?? 0));
    }
  }
  // sited site-slots: cluster overlapping commons sited marks
  const siteClusters = [];
  const commonsSited = sited.filter(mk => !mk._sovereign);
  for (const mk of commonsSited) {
    const r = rect(mk);
    let placed = null;
    for (const cl of siteClusters) {
      if (cl.some(o => { const ro = rect(o); const ov = overlapArea(r, ro); return ov >= dials.overlap_site_frac * Math.min(r.w * r.h, ro.w * ro.h); })) { cl.push(mk); placed = cl; break; }
    }
    if (!placed) siteClusters.push([mk]);
  }
  for (const cl of siteClusters) {
    if (cl.length < 2) continue;
    const key = `site::${cl.map(m => m.id).sort().join("|")}`;
    const slot = { values: new Map(), marks: cl.map(m => m.id) };
    for (const mk of cl) slot.values.set(mk.id, weightOf(mk.id)); // rival SITE claims compete on full fan-up weight
    slots.set(key, slot);
  }

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
    if (entries.length > 1 && entries[1][1] > 0) rivalries.push({ slot: key, values: entries, total, determined: det });
    if (det !== null) determined[key] = det; else if (total > 0 && entries.length > 1) vague.push(key);
  }

  return {
    tick, dials,
    marks: [...byId.values()].map(mk => ({
      id: mk.id, kind: mk.kind, household: mk.household, date: mk.date,
      at: mk.at, extent: mk.extent, parent: mk.parent, slot: mk.slot, value: mk.value,
      sovereign: !!mk._sovereign, stamps: stakeByMark.get(mk.id) ?? 0, weight: weight.get(mk.id) ?? 0,
      body: mk.body,
    })),
    parcels: parcels.map(p => ({ id: p.id, household: p.household, at: { x: p._r.x, y: p._r.y }, extent: { w: p._r.w, h: p._r.h } })),
    determined, vague, rivalries,
    portfolios: Object.fromEntries([...portfolios].map(([h, pf]) => [h, [...pf].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([mark, n]) => ({ mark, stamps: n }))])),
    terrain_weight: Object.fromEntries([...terrainIds].map(id => [id, weight.get(id) ?? 0])),
    errors,
  };
}

// ---------- INDEX render (the v0 table IS the world) ----------
function renderIndex(state) {
  const rows = state.marks
    .filter(mk => !mk.sovereign)
    .sort((a, b) => b.weight - a.weight)
    .map(mk => `| ${mk.id} | ${mk.kind} | ${mk.at ? `${mk.at.x},${mk.at.y}` : (mk.parent ?? "")} | ${mk.slot ? `${mk.slot}=${mk.value}` : ""} | ${mk.stamps} | ${mk.weight} | ${state.rivalries.some(r => r.slot.includes(mk.id)) ? "⚔" : ""} |`);
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
**Parcels:** ${state.parcels.map(p => `${p.household} @ ${p.at.x},${p.at.y}`).join(" · ") || "(none)"}
${state.errors.length ? `\n**⚠ fold errors:** ${state.errors.length} (see world-state.json)` : ""}
`;
}

// ---------- main ----------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, "/").replace(/^([a-z]):/i, (s) => s.toUpperCase());
if (isMain || basename(process.argv[1] ?? "") === "marks-fold.mjs") {
  const marks = loadMarks(MARKS_DIR);
  const terrain = existsSync(TERRAIN_PATH) ? JSON.parse(readFileSync(TERRAIN_PATH, "utf8")) : null;
  const stakes = loadStakes();
  const prev = PREV_PATH ? JSON.parse(readFileSync(PREV_PATH, "utf8")) : null;
  const state = fold({ marks, terrain, stakes, prev, tick: TICK });
  if (has("--json")) console.log(JSON.stringify(state, null, 2));
  if (!has("--no-write")) {
    mkdirSync(join(ROOT, "WORLD"), { recursive: true });
    writeFileSync(join(ROOT, "WORLD/world-state.json"), JSON.stringify(state, null, 2) + "\n");
    writeFileSync(join(ROOT, "WORLD/INDEX.md"), renderIndex(state));
    console.log(`fold: ${state.marks.length} marks · ${state.parcels.length} parcels · ${Object.keys(state.determined).length} determined · ${state.vague.length} vague · ${state.rivalries.length} rivalries · ${state.errors.length} errors`);
  }
}
