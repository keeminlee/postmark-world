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
  overlap_site_frac: 0.30,                     // sited overlap fraction -> same site-slot
  parcel_w: 25, parcel_h: 25,
  ...(opt("--dials", null) ? JSON.parse(readFileSync(opt("--dials"), "utf8")) : {}),
};

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
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    walkMarks(p, null, out); // v2: no household from the path; `by` comes from each mark's frontmatter
  }
  return out;
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
// The parcel-claim cap (Keemin's ruling, 2026-07-30): a credential-household may
// CLAIM at most 3 parcels. Forward law — holdings dated on/before the law date
// stand as prior estate (the Reeves' four, the founder household's five), they
// simply cannot claim more. Grain note: `household` on a mark is the by: handle;
// the CREDENTIAL household groups handles via WORLD/households.json (derived
// from the town's pins). A handle absent from the registry is its own household.
export const PARCEL_CLAIM_CAP = 3;
export const PARCEL_CAP_LAW_DATE = "2026-07-30"; // claims dated strictly after this are gated
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

  // admissibility: parcels never overlap (first-in-order wins), one per handle,
  // and — the claim cap, ruled 2026-07-30 — at most PARCEL_CLAIM_CAP claims per
  // CREDENTIAL household for parcels dated after the law (prior estate stands);
  // predicated/naming must not target terrain with a rival intent (attach-only is fine —
  // rivalry-vs-terrain is refused later since terrain has no slot values to rival).
  const credHh = (handle) => households?.[handle] ?? `solo:${handle}`;
  const parcels = [];
  const parcelByHh = new Map();
  const parcelsByCred = new Map();
  for (const mk of byId.values()) {
    if (mk.kind !== "parcel") continue;
    const r = rect(mk); r.w = r.w || dials.parcel_w; r.h = r.h || dials.parcel_h;
    if (parcelByHh.has(mk.household)) { errors.push({ mark: mk.id, error: "household already holds a parcel (relocation = replace, not add)" }); continue; }
    const cred = credHh(mk.household);
    const held = parcelsByCred.get(cred) ?? 0;
    if (String(mk.date ?? "") > PARCEL_CAP_LAW_DATE && held >= PARCEL_CLAIM_CAP) {
      errors.push({ mark: mk.id, error: `parcel claim capped — this credential household already holds ${held} (cap ${PARCEL_CLAIM_CAP} per household, ruled ${PARCEL_CAP_LAW_DATE}; prior estate stands, new claims wait on the founder's word)` });
      continue;
    }
    const clash = parcels.find(p => overlapArea(p._r, r) > 0);
    if (clash) { errors.push({ mark: mk.id, error: `parcel overlaps ${clash.id} — inadmissible (MARKS.md § Parcels)` }); continue; }
    parcels.push({ id: mk.id, household: mk.household, _r: r });
    parcelByHh.set(mk.household, r);
    parcelsByCred.set(cred, held + 1);
  }

  // stakes -> per-mark balances (escrow; negative = withdrawal), effect-next-crossing: tick strictly < current
  const stakeByMark = new Map(); const weightByMark = new Map(); const portfolios = new Map();
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

  // fan-up weight: own + all descendants (memoized DFS)
  const weight = new Map();
  const weightOf = (id, seen = new Set()) => {
    if (weight.has(id)) return weight.get(id);
    if (seen.has(id)) return 0; seen.add(id);
    let w = weightByMark.get(id) ?? 0;
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
      slot.values.set(v, (slot.values.get(v) ?? 0) + (weightByMark.get(mk.id) ?? 0));
    }
  }
  // sited site-slots: cluster overlapping commons sited marks
  const siteClusters = [];
  // constitution-tier marks (the root, terrain) bind without stamps and cannot be
  // rivaled/determined against — they never enter site-rivalry clustering (and the
  // world-spanning root would otherwise rival everything it contains).
  const commonsSited = sited.filter(mk => !mk._sovereign && mk.tier !== "constitution");
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
      id: mk.id, kind: mk.kind, by: mk.by ?? mk.household, tier: mk.tier ?? "market", household: mk.household, date: mk.date,
      at: mk.at, extent: mk.extent, parent: mk.parent, slot: mk.slot, value: mk.value, far: mk.far,
      sovereign: !!mk._sovereign, stamps: stakeByMark.get(mk.id) ?? 0, weight: weight.get(mk.id) ?? 0,
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
  // the credential-household registry lives beside the marks tree (WORLD/households.json);
  // absent = every handle is its own household (solo grain), never an error.
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
    console.log(`fold: ${state.marks.length} marks · ${state.parcels.length} parcels · ${Object.keys(state.determined).length} determined · ${state.vague.length} vague · ${state.rivalries.length} rivalries · ${state.errors.length} errors`);
  }
}
