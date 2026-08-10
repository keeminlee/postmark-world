#!/usr/bin/env node
// world-verbs.mjs — the spine verbs, thin wrappers over world-engine.mjs.
//
// These are the MCP/API surface's verbs in library form. The site endpoints and
// the MCP tools wrap the SAME functions (Wright's half tonight); nothing here
// touches the network. The verb vocabulary is the epic's (§ The semantic world):
//   orient · open-your-eyes · investigate · walk
//
// A `world` is what the loader assembles:
//   { marks, terrain, heightfield, light, fogCeilingM, charter }
// A `state` is the walker: { x, y, name, household? }.

import {
  fieldOfView, radialSerialize, statusAt, lightLevelAt, fogModel,
  bearingDeg, quantizeBearing, distanceBand, DIALS,
} from "./world-engine.mjs";
import {
  marksContain, pointInPolygon, pointInRect, polygonOf, rect,
} from "./geometry.mjs"; // the ONE containment definition — pure, browser-safe (no node:*)

// ───────────────────────── orient — charter + your state ────────────────────
// The establishing line of every telling: the let-there-be-light root (light
// from the NE, dying to the SW), the world's extent, and WHERE/HOW you stand —
// region, elevation, and the fog/light status effects on you right now.
export function orient(state, world, { crossing = 0, dials = DIALS } = {}) {
  const { heightfield, light, fogCeilingM, terrain } = world;
  const fog = fogModel(crossing, dials);
  const groundH = heightfield.elevationAt(state.x, state.y);
  const self = statusAt({ x: state.x, y: state.y, groundH, eyeH: dials.eye_height_m, heightfield, light, fog, fogCeilingM });
  // the containment spine: root → inward. within[0] is the frame (the root),
  // whose body is the establishing line — charter out of code, into the record.
  const within = containmentChain(state, world.marks);
  const root = within[0];
  return {
    charter: { ...(world.charter ?? CHARTER), establishing: root?.body ?? (world.charter ?? CHARTER).light, from_mark: root?.id ?? null },
    you: {
      name: state.name ?? "(unnamed)",
      at: { x: state.x, y: state.y },
      groundElevM: +groundH.toFixed(1),
      eyeElevM: +self.eyeElev.toFixed(1),
      standingOn: nearestGround(state, world),
      region: regionOf(state, world),
      within, // the spine, root → innermost (structural — the site renders it as the leading section)
      light: { level: +self.lightLevel.toFixed(2), inDarkness: self.inDarkness },
      fog: { crossing: fog.crossing, thickness: +fog.thickness.toFixed(2), inFog: self.inFog, aboveFog: self.aboveFog },
    },
    verbs: ["open-your-eyes", "investigate(mark)", "walk(dir, dist)"],
  };
}

// ───────────────────────── open-your-eyes — the FOV telling ──────────────────
// Field of view in radial coordinates: quantized bearings, named distance bands,
// ranked by angular size modulated by stamps, capped at the context budget, fog
// and darkness applied, signal-marks cutting through. Returns both the raw fov
// (for callers) and a `tell()` that renders the human/agent-facing prose.
export function openYourEyes(state, world, { crossing = 0, budget = DIALS.context_budget, dials = DIALS } = {}) {
  const fov = fieldOfView(state, world, { crossing, budget, dials });
  const radial = radialSerialize(fov);
  radial.within = containmentChain(state, world.marks); // the spine: root → inward, parents first
  fov.within = radial.within;
  return { fov, radial, tell: () => renderTelling(state, radial, fov) };
}

// containmentChain — the telling's spine (Keemin, 2026-07-23): the marks the
// observer stands WITHIN, from the top parent (the root, whose body is the
// establishing line) inward to the smallest containing mark. Computed from
// geometry now that the one-tree data is live — the ancestry walk IS orient's
// answer. Root-first (largest extent), innermost-last.
export function containmentChain(pos, marks) {
  // Marks whose TRUE footprint contains the point. A points: ring wins over its
  // at/extent bbox; otherwise a regular mark keeps the byte-identical rect path.
  const containing = marks
    .filter((m) => m.at && (m.kind === "sited" || m.kind === "parcel") && pointWithinMark(pos, m))
    .sort((a, b) => extentArea(a) - extentArea(b)); // innermost (smallest) first
  // build the ANCESTRY nest from the innermost outward: a larger mark joins only
  // if its true shape CONTAINS the current nest tip — so sibling extents that
  // merely overlap the point are dropped, not listed.
  const nest = [];
  for (const m of containing) {
    if (nest.length === 0 || marksContain(m, nest[nest.length - 1])) nest.push(m);
  }
  return nest.reverse().map((m) => ({ id: m.id, by: m.by, tier: m.tier, body: m.body, extentM: Math.max(m.extent?.w ?? 0, m.extent?.h ?? 0) }));
}
function extentArea(m) { return (m.extent?.w ?? 1) * (m.extent?.h ?? 1); }
function pointWithinMark(pos, mark) {
  const ring = polygonOf(mark);
  return ring
    ? pointInPolygon(Number(pos?.x), Number(pos?.y), ring)
    : pointInRect(Number(pos?.x), Number(pos?.y), rect(mark));
}

// ───────────────────────── investigate — descend the tree, capped ────────────
// Zoom one mark: its body (full prose), the predicated properties attached to
// it, and the sited things inside it — capped by `budget`, re-callable to go
// deeper. This is the LOD "descend with attention" path.
//
// THE TWO NUMBERS, and they are not the same number (trued 2026-08-10). Every
// relation line below used to emit a field NAMED `stamps` that carried
// `m.weight` — the effective, fanned-up figure under the raw figure's name. The
// vocabulary is now the fold's own, everywhere:
//
//   stamps — RAW own escrow. What residents actually put on this mark.
//   weight — EFFECTIVE. own escrow + breadth bonus + everything fanning up.
//            This is the ✦ number a telling prints, and the default to show.
//
// The target additionally carries `weight_parts`, which is that ✦ number's
// receipt (marks-fold.mjs § partsOf) — because a reader shown one figure built
// out of three sources cannot otherwise tell which of them they are looking at.
export function investigate(markId, world, { depth = 1, budget = DIALS.context_budget } = {}) {
  const byId = new Map(world.marks.map((m) => [m.id, m]));
  const target = byId.get(markId) ?? byId.get(markId.replace(/^terrain:/, "")) ?? null;
  const asTerrain = (world.terrain?.features ?? []).find((f) => `terrain:${f.id}` === markId || f.id === markId);
  if (!target && !asTerrain) return { error: `no mark or terrain feature '${markId}'` };

  if (asTerrain && !target) {
    return { id: markId, kind: "terrain", body: asTerrain.receipt, attaches: attachedTo(markId, world, budget) };
  }
  const predicates = world.marks.filter((m) => (m.kind === "predicated" || m.kind === "naming") && m.parent === markId)
    .slice(0, budget).map((m) => ({ id: m.id, slot: m.slot ?? (m.kind === "naming" ? "name" : null), value: m.value, weight: m.weight ?? 0, stamps: m.stamps ?? 0, body: m.body }));
  // NEAREST FIRST, so the budget cuts the far ones rather than whichever the fold
  // happened to list last. Under fold order a child 212 m from the threshold
  // district lost its seat to five siblings 900 m out — and an arbitrary cut does
  // not read as arbitrary to whoever is looking at it, it reads as a judgement.
  // the FULL set is kept for the alongside exclusion below — a grandchild is not
  // this mark's child, but it is certainly not its neighbour either
  const contained = childrenByGeometry(target, world);
  const allChildren = directChildren(contained)
    .map((m) => ({ m, away: Math.hypot(m.at.x - target.at.x, m.at.y - target.at.y) }))
    .sort((a, b) => a.away - b.away || String(a.m.id).localeCompare(String(b.m.id)))
    .map((entry) => entry.m);
  const children = allChildren.slice(0, budget)
    .map((m) => ({ id: m.id, kind: m.kind, at: m.at, weight: m.weight ?? 0, stamps: m.stamps ?? 0, body: firstLine(m.body) }));
  // parents: what the target sits inside, nearest container first (renamed from
  // `within` 2026-08-02 — within/children read as near-synonyms and the pair was
  // a reader trap; parents[0] is the direct container). Its own relation, and
  // the fix for a real mis-sort — a parent is in the household's near-cluster
  // and is not a child of the target, so before this it fell through into
  // `alongside` and a child's own house was reported as its neighbour.
  // Excluding ancestors without naming them would only have hidden the
  // relation; carrying it makes upward context first-class.
  // ONE STEP UP ONLY, for the same reason as one step down: "sits inside" should
  // answer with the house, not the house and the district and the world. The full
  // nest is still WALKED, because every ancestor must stay out of `alongside` —
  // a grandparent is not a neighbour just because it is not the direct container.
  const ancestry = ancestorsByGeometry(target, world);
  const parents = ancestry.slice(0, 1)
    .map((m) => ({ id: m.id, kind: m.kind, household: m.household, at: m.at, weight: m.weight ?? 0, stamps: m.stamps ?? 0, body: firstLine(m.body) }));
  // alongside: the rest of this household's cluster near the target — the marks
  // the FOV collapsed at distance ("+N more of <hh>'s"). Descending opens them.
  // Deliberately NOT named siblings: this is the household's geometric
  // neighbourhood, not the tree relation.
  //
  // EXCLUDED AGAINST THE FULL LISTS, NOT THE BUDGETED ONES. This comment used to
  // claim both filters ran before the slice; `parents` is never sliced, but
  // `children` was sliced on the line that built it, so childIds only ever held
  // the twelve that fit. A true child the budget dropped then passed the "not a
  // child" test and was told to the reader as a NEIGHBOUR of its own container —
  // which is the exact failure this exclusion exists to prevent, one relation
  // over. A budget decides how much gets said; it must not decide what is true.
  // both sets are the FULL relations, never the reported slice: what a mark is
  // related to does not shrink because we chose to say less of it
  const childIds = new Set(contained.map((m) => m.id));
  const parentIds = new Set(ancestry.map((m) => m.id));
  const alongside = householdNear(target, world).filter((m) => !childIds.has(m.id) && !parentIds.has(m.id)).slice(0, budget)
    .map((m) => ({ id: m.id, kind: m.kind, at: m.at, weight: m.weight ?? 0, stamps: m.stamps ?? 0, signal: !!m.signal, body: firstLine(m.body) }));
  return {
    id: target.id, kind: target.kind, household: target.household, at: target.at, extent: target.extent,
    sovereign: !!target.sovereign,
    weight: target.weight ?? 0, stamps: target.stamps ?? 0,
    // the ✦ number's receipt, carried on the target only: a reader descending
    // into one mark is asking about THAT mark, and putting a breakdown on every
    // relation line would bury the one they opened.
    weight_parts: target.weight_parts ?? null,
    body: target.body,
    predicates, parents, children, alongside,
    more: { predicates: countPredicates(markId, world) - predicates.length, children: allChildren.length - children.length },
    reinvoke: depth > 1 ? [...children, ...alongside].map((c) => c.id) : [],
  };
}

// ───────────────────────── walk — the walk dial + anonymous wear ─────────────
// Move `distM` metres in a compass `dir`. The walk dial is ~15 km per crossing
// (decision 008), so a walk spends `distM / walkSpeed` crossings. The path lands
// in a walk-ledger and its wear aggregates per grid cell WITHOUT names — where
// you wander is more intimate than who you wrote (epic § Paths are wear).
export function walk(state, dir, distM, world, { walkLedger = null, cell = 50 } = {}) {
  const walkSpeed = world.terrain?.elevation?.walk_speed_m_per_crossing ?? 15000;
  const unit = DIR_UNIT[dir?.toUpperCase?.()] ?? unitFromDeg(Number(dir));
  if (!unit) return { error: `unknown direction '${dir}' — use a compass point (N, NE, …) or a bearing in degrees` };
  const to = { x: Math.round(state.x + unit.x * distM), y: Math.round(state.y + unit.y * distM) };
  const crossings = +(distM / walkSpeed).toFixed(3);

  // anonymous wear: bucket the path into grid cells, +1 each, no holder name
  const wear = new Map();
  const steps = Math.max(1, Math.ceil(distM / cell));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round((state.x + (to.x - state.x) * t) / cell) * cell;
    const cy = Math.round((state.y + (to.y - state.y) * t) / cell) * cell;
    const key = `${cx},${cy}`;
    wear.set(key, (wear.get(key) ?? 0) + 1);
  }
  const wearDelta = [...wear].map(([k, n]) => { const [x, y] = k.split(",").map(Number); return { x, y, wear: n }; });
  if (walkLedger) for (const w of wearDelta) walkLedger.set(`${w.x},${w.y}`, (walkLedger.get(`${w.x},${w.y}`) ?? 0) + w.wear); // names never enter the ledger

  return {
    from: { x: state.x, y: state.y }, to, dir: dir?.toUpperCase?.() ?? dir, distM,
    crossings, arrivesInWords: crossings <= 1 ? "this crossing" : `${Math.ceil(crossings)} crossings out`,
    wearDelta, newState: { ...state, x: to.x, y: to.y },
  };
}

// ───────────────────────── the telling renderer ─────────────────────────────
// Turns the radial serialization into told prose — the D&D-shaped "what you see."
// The spine is CONTAINMENT, parents-first (Keemin, 2026-07-23): the root's body
// opens as the establishing line; then you home inward through the marks you are
// WITHIN (region → any containing mark); THEN the radial FOV listing.
function renderTelling(state, radial, fov) {
  const o = radial.observer;
  const within = radial.within ?? [];
  const L = [];
  // 1. the establishing line — the root's body (the frame; never a card)
  const root = within[0];
  if (root?.body) { L.push(root.body); L.push(""); }
  const who = o.name ?? "You";
  const stands = who === "You" ? "stand" : "stands"; // verb agreement: "You stand" vs "an agent stands"
  L.push(`— ${who} ${stands} at (${o.at?.x ?? state.x}, ${o.at?.y ?? state.y}), ${o.groundElevM} m above the sea.`);
  // 2. the containment spine — home inward through what contains you (skip the root frame)
  const spine = within.slice(1).filter((m) => m.body);
  if (spine.length) L.push(`You are within ${spine.map((m) => firstLine(m.body).replace(/[.·\s]+$/, "")).join(" · ")}.`);
  const anySignalCarries = fov.carried.some((m) => m.signal); // don't promise lights that aren't there
  const airline = o.aboveFog ? "You are above the fog; the sightlines run long."
    : o.inFog ? `Fog is in tonight (crossing ${radial.crossing}, thickness ${radial.fog.thickness}); it closes the view to about ${radial.sightReachM} m${anySignalCarries ? ", and only the lights carry further" : ""}.`
    : `The air is clear (crossing ${radial.crossing}); you can see about ${radial.sightReachM} m.`;
  const lightline = o.inDarkness ? "You stand near the dark end of the world; the day is a rumor off to the northeast."
    : o.lightLevel > 0.7 ? "The northeast dawn-light is full on you here."
    : "The light is going — the world's glow lives off to the northeast and dies toward the southwest.";
  L.push(airline + " " + lightline);
  L.push("");

  // Distance orders the telling; bearing is a field on the mark (Keemin,
  // 2026-07-27). The named bands are the sections, outward, so the whole telling
  // continues the containment spine's one move — from where you stand, out —
  // instead of restarting it once per wind, each wind mixing near and far. A
  // bearing is a property of a mark *relative to you*: you consult it once a mark
  // has your attention, so it belongs on the mark's line. The rose stays the map
  // pane's taxonomy, where it is geometry rather than a table of contents.
  // Regrouped from the band and distM every entry already carries — byBearing is
  // the wire shape and is read here, never reshaped.
  // The spine is not listed twice (Keemin, 2026-07-27). A mark you stand WITHIN is
  // already told above — as the establishing line if it is the frame, otherwise in the
  // "You are within …" clause — so repeating it in a band says the same thing twice.
  // Only the entries the spine ACTUALLY tells are dropped: the spine renders bodies,
  // so a within-entry with no body is named nowhere above and keeps its band line
  // rather than vanishing from the telling altogether.
  const toldBySpine = new Set(within.filter((w) => w.body).map((w) => w.id));
  const byBand = {};
  for (const bands of Object.values(radial.byBearing))
    for (const [bandName, ms] of Object.entries(bands)) (byBand[bandName] ??= []).push(...ms);
  for (const bandName of orderBands(Object.keys(byBand))) {
    const parts = [];
    for (const m of byBand[bandName].sort((a, b) => a.distM - b.distM)) {
      if (toldBySpine.has(m.id)) continue;
      // the band heads the section, so a horizon line no longer restates it
      if (m.far) { parts.push(`  · ${horizonPhrase(m)}`); continue; }
      const lit = m.signal ? " (its light carries)" : "";
      const occ = m.occluded && m.signal ? " — its footing is hidden, only the light shows" : "";
      const dim = m.dim < 0.5 ? " — dim, at the dark edge" : "";
      const more = m.clusteredCount ? ` (+${m.clusteredCount} more of ${m.household}'s — investigate)` : "";
      parts.push(`  · ${m.distM} m ${m.bearing} — ${firstLine(m.body) || m.id}${lit}${occ}${dim}${more}  [${m.id}, ✦${m.weight}]`);
    }
    if (parts.length) { L.push(`${bandHeading(bandName)}:`); L.push(...parts); }
  }
  const agg = radial.aggregate;
  if (agg.hidden_by_budget > 0) {
    const spread = Object.entries(agg.by_bearing).map(([b, n]) => `${n} ${b}`).join(", ");
    L.push("");
    L.push(`  …and ${agg.hidden_by_budget} more marks the eye doesn't sort out at this range (${spread}). Walk toward one, or investigate it, to bring it in.`);
  }
  L.push("");
  L.push(`  (${radial.counts.visible} marks in view of ${radial.counts.candidates} in range · ${radial.counts.occluded} behind the ground · ${radial.counts.fogHidden} lost to fog)`);
  return L.join("\n");
}

// ───────────────────────── charter (the let-there-be-light root) ─────────────
export const CHARTER = {
  root: "let-there-be-light",
  light: "Postmark's light comes from the northeast and dies in the southwest (the atlas's settled day-axis).",
  extent: "The whole world is this mark's extent. Everything below is a child of the light.",
  clock: "Effects tick at ferry crossings, twice a day. Fog is the crossing's own weather.",
  origin: "The grid measures from Ferry's crossing — the centre of the Town Centre. x east, y south, z metres above the sea.",
};

// ───────────────────────── helpers ─────────────────────────────────────────
const DIR_UNIT = {
  N: { x: 0, y: -1 }, NE: { x: 0.7071, y: -0.7071 }, E: { x: 1, y: 0 }, SE: { x: 0.7071, y: 0.7071 },
  S: { x: 0, y: 1 }, SW: { x: -0.7071, y: 0.7071 }, W: { x: -1, y: 0 }, NW: { x: -0.7071, y: -0.7071 },
};
function unitFromDeg(deg) { if (!Number.isFinite(deg)) return null; const r = deg * Math.PI / 180; return { x: Math.sin(r), y: -Math.cos(r) }; }
// Never cut mid-word: ellipsize at a word boundary. Bodies are ≤150 by law, but
// legacy-fixture bodies and far-feature notes are not law-bounded, so the display
// layer must not trust length.
function ellipsize(str, max) {
  const s = String(str ?? "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—-]+$/, "") + "…";
}
// Guard the seam: a mark's body must never read like frontmatter. run-01 cast
// bodies literally begin "sits:" / "region:" (a sim artifact) — the fixture is
// the archive and stays untouched (Wright, 07-22), so the DISPLAY strips a
// leading field-name colon prefix rather than the record being rewritten.
function bodyProse(body) {
  return String(body ?? "").trim().replace(/^\s*(sits|region|kind|at|date|slot|value|household|mark|parent)\s*:\s*/i, "").trim();
}
function firstLine(body) { return ellipsize(bodyProse(body).split(/\n/)[0].replace(/\s+/g, " "), 148); }
function countPredicates(id, world) { return world.marks.filter((m) => (m.kind === "predicated" || m.kind === "naming") && m.parent === id).length; }
function attachedTo(id, world, budget) { return world.marks.filter((m) => m.parent === id).slice(0, budget).map((m) => ({ id: m.id, slot: m.slot, value: m.value })); }
function householdNear(target, world, radius = DIALS.cluster_beyond_m) {
  if (!target.at || !target.household) return [];
  return world.marks.filter((m) => m !== target && m.household === target.household && m.at && m.kind !== "parcel"
    && Math.hypot(m.at.x - target.at.x, m.at.y - target.at.y) <= radius);
}
function childrenByGeometry(parent, world) {
  if (!parent.at || !parent.extent) return [];
  return world.marks.filter((m) => m !== parent && m.at && m.kind === "sited" && marksContain(parent, m));
}
// ONE STEP DOWN ONLY (Keemin, 2026-08-04: parents and children should show their
// direct relations, no grandchildren and no grandparents).
//
// Geometric containment is transitive, so "what is inside this" answered with a
// whole subtree: the threshold district listed a house AND that house's window,
// lamp and ledge as if all four were its own. A child is DIRECT when nothing else
// inside the parent contains it. Strictly-larger, the same tiebreak the ancestor
// walk uses, so two marks with one footprint cannot delete each other.
function directChildren(contained) {
  return contained.filter((m) =>
    !contained.some((n) => n !== m && extentArea(n) > extentArea(m) && marksContain(n, m)));
}
// The marks that CONTAIN the target, nearest (smallest) first — the exact
// inverse of childrenByGeometry, under the same true-shape rule, so `inside`
// and `within` can never disagree about an edge. The world-root is left out on
// purpose: it frames everything, so naming it as context is noise — the same
// test placementParent uses when it refuses the root as a parent.
function ancestorsByGeometry(target, world) {
  if (!target.at || !target.extent) return [];
  const tr = rect(target), ta = tr.w * tr.h;
  const containing = world.marks
    .filter((m) => {
      if (m === target || m.kind !== "sited" || !m.at || !m.extent) return false;
      const mr = rect(m);
      if (Math.max(mr.w, mr.h) >= DIALS.world_scale_extent_m) return false;
      return mr.w * mr.h > ta && marksContain(m, target); // strictly larger, as the fold requires of a parent
    })
    .sort((a, b) => extentArea(a) - extentArea(b));  // innermost first
  // Build a true NEST outward — a larger mark joins only if it contains the
  // current tip. Same discipline as containmentChain: without it, a sibling
  // rect that happens to cover the target (a coarse-rect artifact) would be
  // reported as one of its containers. Nearest-first, deliberately the reverse
  // of containmentChain's root-first: that one opens a telling with the frame,
  // this one answers "what is this in?" and the immediate house is the answer.
  const nest = [];
  for (const m of containing) {
    if (nest.length === 0 || marksContain(m, nest[nest.length - 1])) nest.push(m);
  }
  return nest;
}
function nearestGround(state, world) {
  let best = null, bd = Infinity;
  for (const f of world.terrain?.features ?? []) {
    const pts = f.centerline_m ?? f.line_m ?? (f.at_m ? [f.at_m] : (f.center_m ? [f.center_m] : []));
    for (const p of (Array.isArray(pts) ? pts : [pts])) {
      if (!p) continue; const d = Math.hypot(p.x - state.x, p.y - state.y);
      if (d < bd) { bd = d; best = f.id; }
    }
  }
  return bd < 400 ? { feature: best, distM: Math.round(bd) } : null;
}
function regionOf(state, world) {
  // nearest region control point (the heightfield's own anchors carry region ids)
  let best = null, bd = Infinity;
  for (const c of world.heightfield?.controlPoints ?? []) {
    if (!c.id) continue; const d = Math.hypot(c.x - state.x, c.y - state.y);
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}
function orderBands(keys) { const order = DIALS.distance_bands.map((b) => b.name); return keys.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)); }
// band names are written as prose ("a fair way off"); a section head wants sentence case
function bandHeading(name) { const s = String(name ?? ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function horizonPhrase(m) {
  const km = (m.distM / 1000).toFixed(0);
  const name = m.label || ellipsize(bodyProse(m.body), 80); // a short label, not the decision-008 arithmetic
  return `${name} (${m.bearing}, ~${km} km, ${m.heightM} m up)`;
}
