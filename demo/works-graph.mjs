// DEMO — the Keeping Works as a graph. Exploration, not law.
//
// Nothing here ships. This file derives a class-space graph from the marks tree
// on disk so the works can be LOOKED AT before anyone rules on how it should be
// drawn. It reads the same records the fold reads (loadMarks below) rather than
// keeping a node list of its own — delete a class mark from the tree and it
// leaves this graph; add one and it arrives.
//
// It cites no law. Where a comment names a field it is describing the bytes
// found on disk today, not asserting what the record must contain.

import { loadMarks } from "../tools/marks-fold.mjs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLONE_ROOT = join(HERE, "..");
const MARKS_DIR = join(CLONE_ROOT, "WORLD", "marks");

// The quarter whose interior the portal opens onto, and the mark carrying the
// portal. Both are read by path/slug; if either moves, the demo says so loudly
// rather than quietly drawing half a graph.
const WORKS_SLUG = "the-keeping-works";
const PORTAL_SLOT = "portal";

const norm = (p) => String(p).split(sep).join("/");

// ---------------------------------------------------------------- edge kinds
// Every edge this demo draws carries one of these type names, and the renderer
// prints the name on the edge. An edge with no type is a bug, not a style.
export const EDGE_TYPES = {
  extends: { label: "extends", note: "the lattice edge: this class is a kind of that one (frontmatter `extends:`, resolved by class name)" },
  implements: { label: "implements", note: "the class names a node it realises (frontmatter `implements:`, when the target resolves to a mark)" },
  slot: { label: "slot", note: "a predicated child standing under the node it describes (the directory nesting of a `kind: predicated` mark)" },
  residue: { label: "residue", note: "verb LEAVES noun — a creating verb's leaving (the verb class's own `residue:` field); residue runs postmark-edge → noun, never noun → noun" },
  registry: { label: "registry", note: "one class-node's directory sits inside another's, with no `extends:` between them" },
};

function asArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) { try { const j = JSON.parse(t); return Array.isArray(j) ? j : [j]; } catch { /* fall through */ } }
    return t ? [t] : [];
  }
  return [v];
}

// A target that looks like `<by>/<slug>` may be a mark; anything with a dot or a
// tools/ prefix is a source file. We do not guess — we look the id up in the
// records we actually loaded, and anything that misses is reported as a
// non-mark target rather than dropped silently.
const looksLikeMarkId = (s) => /^[a-z0-9][\w.-]*\/[\w-]+$/i.test(String(s)) && !/\.(mjs|js|md|json)$/i.test(String(s));

export function buildWorksGraph({ marksDir = MARKS_DIR } = {}) {
  const all = loadMarks(marksDir);
  const byId = new Map(all.map((r) => [r.id, r]));

  const works = all.find((r) => r.slug === WORKS_SLUG);
  if (!works) throw new Error(`no mark with slug "${WORKS_SLUG}" under ${marksDir} — the works has moved and this demo has not`);
  const worksDir = norm(works._dir);
  const underWorks = (r) => norm(r._dir).startsWith(worksDir + "/") || norm(r._dir) === worksDir;

  // the portal predicate on the works, and what it says the read roots at
  const portal = all.find((r) => r.kind === "predicated" && r.parent === works.id && r.slot === PORTAL_SLOT);
  const portalTarget = portal ? String(portal.value ?? "").trim() : null;

  // ------------------------------------------------------------ the node set
  // Three sources, in this order, each one a rule rather than a list:
  //   1. every `kind: class` mark standing in the works
  //   2. every mark named by a class-space edge that resolves to a real mark
  //      (this is what pulls the logos quarter's `node` / `edge` in — the
  //      portal points at one and `implements:` points at both)
  //   3. every predicated descendant of anything already in the set (the slots
  //      and their defaults), transitively
  const classNodes = all.filter((r) => r.kind === "class" && underWorks(r));
  const inSet = new Map(classNodes.map((r) => [r.id, r]));
  // portal REMOVED from the drawing (Keemin, 2026-08-19: one instance to
  // date, not worth litigating yet) — the map's crossing mechanic still
  // reads the predicate; the graph just no longer draws it.
  // Formerly: the portal predicate itself stands in class-space, near side of
  // the crossing. Its own parent (the works, a sited mark) does not.

  const classByName = new Map();
  for (const r of classNodes) if (r.class != null) classByName.set(String(r.class), r);

  // pass 2 — referenced marks (portal target, implements targets)
  const referenced = new Set();
  if (portalTarget) referenced.add(portalTarget);
  for (const r of classNodes) for (const t of asArray(r.implements)) if (looksLikeMarkId(t)) referenced.add(String(t));
  for (const id of referenced) { const rec = byId.get(id); if (rec) inSet.set(id, rec); }

  // pass 3 — predicated descendants, transitively
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of all) {
      if (r.kind !== "predicated" && r.kind !== "naming") continue;
      if (inSet.has(r.id)) continue;
      if (r.parent && inSet.has(r.parent)) { inSet.set(r.id, r); grew = true; }
    }
  }

  // ------------------------------------------------------------ the edge set
  const edges = [];
  const relationEdges = []; // ties (from-class/to-class), appended after the lattice
  const unresolved = [];
  const push = (from, to, type, detail) => {
    if (!inSet.has(from) || !inSet.has(to)) { unresolved.push({ from, to, type, detail, reason: !inSet.has(to) ? "target outside class-space" : "source outside class-space" }); return; }
    edges.push({ from, to, type, detail: detail ?? null });
  };

  // (the crossing edge is not drawn while portal is removed from the graph)

  for (const r of inSet.values()) {
    // extends — resolved by class NAME, which is how the record spells it
    if (r.extends != null) {
      const target = classByName.get(String(r.extends).trim());
      if (target) push(r.id, target.id, "extends", `extends: ${r.extends}`);
      else unresolved.push({ from: r.id, to: String(r.extends), type: "extends", reason: "no class-node declares that class name" });
    }

    // implements — mark targets become edges; source-file targets are recorded
    // on the node instead (they are real, they are simply not marks)
    for (const t of asArray(r.implements)) {
      const s = String(t).trim();
      if (!s) continue;
      if (looksLikeMarkId(s) && inSet.has(s)) edges.push({ from: r.id, to: s, type: "implements", detail: `implements: ${s}` });
      else if (looksLikeMarkId(s)) unresolved.push({ from: r.id, to: s, type: "implements", reason: "target is not a mark in class-space" });
    }

    // can + tie arrows BOTH DELETED (Keemin, 2026-08-19 last words): grants
    // and sentences are conditional, typed law — subject/object stay as
    // frontmatter data on each verb (detail panel), and draw nothing.
    // A bare arrow over-claims; the door and the save do the real judging.

    // residue — verb LEAVES noun: a creating verb's own `residue:` field
    // (postmark-edge → noun, never noun → noun; Keemin's grammar)
    if (r.residue != null) {
      const res = String(r.residue).trim();
      if (inSet.has(res)) edges.push({ from: r.id, to: res, type: "residue", detail: `leaves ${res}` });
      else unresolved.push({ from: r.id, to: res, type: "residue", reason: "residue target outside class-space" });
    }

    // slot / registry — both read off the SAME directory nesting; which one it
    // is depends on what the child is and whether an `extends:` already says it
    if (r.parent && inSet.has(r.parent)) {
      if (r.kind === "predicated" || r.kind === "naming") {
        edges.push({ from: r.parent, to: r.id, type: "slot", detail: r.slot ? `slot: ${r.slot}` : "predicate" });
      } else if (r.kind === "class") {
        const alreadyExtends = r.extends != null && classByName.get(String(r.extends).trim())?.id === r.parent;
        if (!alreadyExtends) edges.push({ from: r.parent, to: r.id, type: "registry", detail: "directory nesting, no extends" });
      }
    }
  }
  // ties ride after the lattice: a true subclass parent wins the seating
  edges.push(...relationEdges);

  // -------------------------------------------------- the node payload
  const nodes = [...inSet.values()].map((r) => ({
    id: r.id,
    slug: r.slug,
    kind: r.kind,
    className: r.class ?? null,
    by: r.by ?? null,
    tier: r.tier ?? null,
    version: r.version ?? null,
    date: r.date ?? null,
    slot: r.slot ?? null,
    value: r.value === undefined ? null : (typeof r.value === "object" ? JSON.stringify(r.value) : String(r.value)),
    body: r.body ?? "",
    dials: r.dials && Object.keys(r.dials).length ? r.dials : null,
    mobility: r.mobility ?? null,
    anchor: r.anchor ?? null,
    ambient: r.ambient ?? null,
    exempt: asArray(r.exempt),
    propagation: r.propagation ?? null,
    valuesTier: r["values-tier"] ?? null,
    source: r.source ?? null,
    // implements targets that are source files, not marks: real, not edges
    code: asArray(r.implements).map(String).filter((s) => !looksLikeMarkId(s)),
    actions: asArray(r.actions).filter((a) => a && typeof a === "object").map((a) => ({ action: a.action, for: a.for ?? null, residue: a.residue ?? null })),
    path: norm(r._dir).slice(norm(marksDir).length + 1),
    inWorks: underWorks(r),
    // the enclosing mark's id, kept RAW — this is the directory's own word about
    // what sits inside what, and it stays available even where an `extends:`
    // edge already says the same thing. The nested-box drawing needs the
    // directory truth separately from the lattice truth, because whether those
    // two agree is the thing worth looking at.
    dirParent: r.parent && inSet.has(r.parent) ? r.parent : null,
  }));

  // lattice depth — hops along `extends` to a node that extends nothing.
  // Cycles cannot happen in the tree today; if one ever does, depth stops
  // rather than hanging, and the node is marked.
  const extendsUp = new Map();
  for (const e of edges) if (e.type === "extends") extendsUp.set(e.from, e.to);
  for (const n of nodes) {
    let d = 0, cur = n.id, seen = new Set([cur]), cyclic = false;
    while (extendsUp.has(cur)) {
      cur = extendsUp.get(cur);
      if (seen.has(cur)) { cyclic = true; break; }
      seen.add(cur); d++;
    }
    n.latticeDepth = d;
    n.latticeRoot = cyclic ? null : cur;
    if (cyclic) n.cyclic = true;
  }

  // ---------------------------------------------------- the layout spine
  // The lattice is the spine, but only 13 of the class-nodes carry an
  // `extends:`, so a layout that knows nothing else would draw most of the
  // works as loose roots. Each node therefore gets ONE layout parent, chosen by
  // this order, and the choice travels with the node so the drawing can say
  // which relation is holding it up. Every edge is still drawn and labelled by
  // its own type — this only decides who sits under whom.
  const SPINE_ORDER = ["portal", "extends", "implements", "registry", "slot"];
  const outOf = new Map();
  for (const e of edges) {
    if (!outOf.has(e.from)) outOf.set(e.from, []);
    outOf.get(e.from).push(e);
  }
  const byNodeId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) { n.layoutParent = null; n.layoutParentEdge = null; }
  // portal / extends / implements point from child UP to parent
  for (const n of nodes) {
    for (const type of ["extends", "implements"]) {
      const e = (outOf.get(n.id) ?? []).find((x) => x.type === type);
      if (e && !n.layoutParent) { n.layoutParent = e.to; n.layoutParentEdge = type; }
    }
  }
  // registry / slot point from parent DOWN to child
  for (const e of edges) {
    if (e.type !== "registry" && e.type !== "slot") continue;
    const child = byNodeId.get(e.to);
    if (child && !child.layoutParent) { child.layoutParent = e.from; child.layoutParentEdge = e.type; }
  }
  // (tie-seating retired with holds — parcel seats by its lattice parent now)
  // the portal's own edge points at the root of the read, so the crossing hangs
  // the other way round: `node` sits under the portal in the drawing
  const portalEdge = edges.find((e) => e.type === "portal");
  if (portalEdge) {
    const target = byNodeId.get(portalEdge.to);
    if (target) { target.layoutParent = portalEdge.from; target.layoutParentEdge = "portal"; }
    const near = byNodeId.get(portalEdge.from);
    if (near) { near.layoutParent = null; near.layoutParentEdge = null; }
  }
  // a spine must not eat itself: break any cycle by cutting the node that
  // closes it loose, and say which one it was
  const spineCycles = [];
  for (const n of nodes) {
    const seen = new Set([n.id]);
    let cur = n.layoutParent;
    while (cur) {
      if (seen.has(cur)) { spineCycles.push({ node: n.id, closedAt: cur }); n.layoutParent = null; n.layoutParentEdge = null; break; }
      seen.add(cur);
      cur = byNodeId.get(cur)?.layoutParent ?? null;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    spineOrder: SPINE_ORDER,
    spineCycles,
    worksId: works.id,
    worksPath: norm(works._dir).slice(norm(marksDir).length + 1),
    portal: portal ? { id: portal.id, slot: portal.slot, value: portalTarget, body: portal.body } : null,
    nodes,
    edges,
    unresolved,
    edgeTypes: EDGE_TYPES,
    counts: {
      nodes: nodes.length,
      classNodes: nodes.filter((n) => n.kind === "class").length,
      predicates: nodes.filter((n) => n.kind === "predicated" || n.kind === "naming").length,
      edges: edges.length,
      byEdgeType: Object.fromEntries(Object.keys(EDGE_TYPES).map((t) => [t, edges.filter((e) => e.type === t).length])),
      unresolved: unresolved.length,
    },
  };
}

// ------------------------------------------------------- the map side
// The map the portal is crossed FROM. Sited/parcel marks carry world-composed
// coordinates by the time loadMarks returns them, so this is the real geometry
// of the real record — no fixture, no hand-placed rectangle.
export function buildMap({ marksDir = MARKS_DIR, aroundSlug = "the-town-centre" } = {}) {
  const all = loadMarks(marksDir);
  const anchor = all.find((r) => r.slug === aroundSlug) ?? all.find((r) => r.slug === WORKS_SLUG);
  const works = all.find((r) => r.slug === WORKS_SLUG);
  const placed = all.filter((r) => (r.kind === "sited" || r.kind === "parcel") && r.at && Number.isFinite(r.at.x) && Number.isFinite(r.at.y));

  // everything whose footprint meets the anchor's box, so the view is a real
  // neighbourhood rather than a chosen cast — but nothing LARGER than the
  // neighbourhood. The seas and the drawn land overlap the town centre and are
  // hundreds of kilometres across; including them makes the frame the whole
  // world and the quarter a speck. A mark bigger than the anchor is not part of
  // the anchor's neighbourhood, it is the ground the neighbourhood sits on.
  const box = { x: anchor.at.x, y: anchor.at.y, w: (anchor.extent?.w ?? 2000), h: (anchor.extent?.h ?? 2000) };
  const meets = (r) => {
    const w = r.extent?.w ?? 25, h = r.extent?.h ?? 25;
    if (w > box.w || h > box.h) return false;
    return Math.abs(r.at.x - box.x) <= (box.w + w) / 2 && Math.abs(r.at.y - box.y) <= (box.h + h) / 2;
  };

  return {
    anchor: { id: anchor.id, at: anchor.at, extent: anchor.extent ?? null },
    worksId: works?.id ?? null,
    marks: placed.filter(meets).map((r) => ({
      id: r.id, slug: r.slug, kind: r.kind, tier: r.tier ?? "market",
      at: r.at, extent: r.extent ?? { w: 25, h: 25 },
      body: r.body ?? "", by: r.by ?? null,
      isWorks: r.slug === WORKS_SLUG,
    })),
  };
}
