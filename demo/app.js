// DEMO — the works portal, client side. Exploration; nothing here ships.
//
// The whole job of this file is to OFFER SHAPES. It draws the same derived
// graph three ways so the shapes can be compared, and it draws nothing it did
// not read from /graph.json, which in turn read the marks tree off disk.

const SVGNS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, parent = null) => {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  if (parent) parent.appendChild(n);
  return n;
};
const $ = (sel) => document.querySelector(sel);

const state = {
  graph: null,
  map: null,
  layout: "nested",
  off: new Set(),          // edge types switched off
  showEdgeLabels: true,
  selected: null,
  view: { k: 1, x: 0, y: 0 },
  placed: null,            // last computed layout
};

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    const [g, m] = await Promise.all([
      fetch("/graph.json").then((r) => r.json()),
      fetch("/map.json").then((r) => r.json()),
    ]);
    if (g.error) throw new Error(g.error);
    state.graph = g;
    state.map = m;
    state.byId = new Map(g.nodes.map((n) => [n.id, n]));
    drawMap();
    buildLegend();
    wire();
    renderGraph();
  } catch (e) {
    document.body.innerHTML = `<pre class="err">the demo could not read the record:\n\n${e && e.stack ? e.stack : e}</pre>`;
  }
}

// ================================================================== the map
function drawMap() {
  const svg = $("#map");
  const m = state.map;
  svg.replaceChildren();

  // The works is the subject of this demo, so the frame is the works with room
  // around it. The rest of the town centre is still drawn and simply runs off
  // the edges, which is what a neighbourhood does.
  const subject = m.marks.find((k) => k.isWorks) ?? { at: m.anchor.at, extent: m.anchor.extent ?? { w: 2000, h: 1500 } };
  const fw = subject.extent.w * 2.1, fh = subject.extent.h * 2.1;
  svg.setAttribute("viewBox", `${subject.at.x - fw / 2} ${subject.at.y - fh / 2} ${fw} ${fh}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

  const g = el("g", {}, svg);
  const aw = m.anchor.extent?.w ?? 2000, ah = m.anchor.extent?.h ?? 1500;
  el("rect", {
    class: "m-anchor",
    x: m.anchor.at.x - aw / 2, y: m.anchor.at.y - ah / 2,
    width: aw, height: ah, rx: 6,
  }, g);

  // biggest first so small marks land on top of the ground they sit in
  const marks = [...m.marks].sort((a, b) => (b.extent.w * b.extent.h) - (a.extent.w * a.extent.h));
  let works = null;
  for (const k of marks) {
    if (k.isWorks) { works = k; continue; }
    const r = el("rect", {
      class: `m-mark${k.kind === "parcel" ? " is-parcel" : ""}`,
      x: k.at.x - k.extent.w / 2, y: k.at.y - k.extent.h / 2,
      width: k.extent.w, height: k.extent.h, rx: 3,
    }, g);
    el("title", {}, r).textContent = `${k.slug} · ${k.kind} · ${k.tier}`;
    // only label a mark the label actually fits inside — the world's units are
    // the text's units here, so an overflowing name lands on its neighbour
    if (k.slug.length * 6.6 <= k.extent.w) {
      el("text", { class: "m-label", x: k.at.x, y: k.at.y + 4, "text-anchor": "middle" }, g).textContent = k.slug;
    }
  }

  // the works, drawn last so nothing covers the door
  if (works) {
    const wg = el("g", {}, g);
    el("rect", {
      class: "m-works",
      x: works.at.x - works.extent.w / 2, y: works.at.y - works.extent.h / 2,
      width: works.extent.w, height: works.extent.h, rx: 5,
    }, wg).addEventListener("click", portalIn);
    el("text", {
      class: "m-works-label", x: works.at.x, y: works.at.y - works.extent.h / 2 + 34, "text-anchor": "middle",
    }, wg).textContent = "the Keeping Works";

    // the portal affordance: the door, breathing
    const px = works.at.x, py = works.at.y + 40;
    el("circle", { class: "m-portal-ring pulse", cx: px, cy: py, r: 28 }, wg);
    el("circle", { class: "m-portal-ring", cx: px, cy: py, r: 15 }, wg);
    el("circle", { class: "m-portal-dot", cx: px, cy: py, r: 5 }, wg);
    el("text", { class: "m-portal-cap", x: px, y: py + 54, "text-anchor": "middle" }, wg).textContent = "THE WORKS PORTAL";
    const hit = el("circle", { class: "m-portal-hit", cx: px, cy: py, r: 46 }, wg);
    hit.addEventListener("click", portalIn);
    el("title", {}, hit).textContent = state.graph.portal ? state.graph.portal.body : "the portal";
  }

  const p = state.graph.portal;
  $("#map-sub").textContent = `${m.marks.length} sited marks around ${m.anchor.id} · drawn from WORLD/marks`;
  $("#map-hint").innerHTML = p
    ? `<em>${p.id}</em> — slot <em>${p.slot}</em>, value <em>${p.value}</em>. Click the works to pass through.`
    : "no portal predicate found on the works";
}

// ---------------------------------------------------------- the threshold
// "Passing through a portal changes what you read, never where you stand" — so the map
// does not go anywhere. It recedes and dims while class-space blooms over it.
// The handoff is 170ms, not 260: measured through the passage, a 260ms gap put
// the map at 16% opacity before class-space had reached 7%, so the passage read
// as a fade through black rather than one read replacing another. At 170 the two
// genuinely overlap and the portal's light carries across the seam.
const HANDOFF = 170;
let passing = false;
function portalIn() {
  if (passing) return;
  passing = true;
  const veil = $("#veil");
  veil.classList.add("is-lit");
  $("#map-layer").classList.remove("is-open");
  setTimeout(() => {
    $("#works-layer").classList.add("is-open");
    fitToView();
    setTimeout(() => { veil.classList.remove("is-lit"); passing = false; }, 320);
  }, HANDOFF);
}
function portalOut() {
  if (passing) return;
  passing = true;
  clearSelection();
  const veil = $("#veil");
  veil.classList.add("is-lit");
  $("#works-layer").classList.remove("is-open");
  setTimeout(() => {
    $("#map-layer").classList.add("is-open");
    setTimeout(() => { veil.classList.remove("is-lit"); passing = false; }, 320);
  }, HANDOFF);
}

// ============================================================ the layouts
const NW = 124, NH = 34;          // a node's box
const GAP_X = 16, ROW = 124;      // tree spacing
const RING = 160;                 // radial ring spacing

function childrenOf(nodes, key = "layoutParent") {
  const kids = new Map();
  for (const n of nodes) {
    const p = n[key];
    if (!p) continue;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(n);
  }
  for (const list of kids.values()) list.sort((a, b) => label(a).localeCompare(label(b)));
  return kids;
}
const label = (n) => n.className || n.slot || n.slug;
const rootsOf = (nodes, key = "layoutParent") => nodes.filter((n) => !n[key]);

function subtreeLeafCount(id, kids, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const c = kids.get(id) ?? [];
  const v = c.length === 0 ? 1 : c.reduce((s, k) => s + subtreeLeafCount(k.id, kids, memo), 0);
  memo.set(id, v);
  return v;
}

/* ---- (a) TREE — the extends lattice as a top-down dendrogram ------------
   A forest, honestly: the record has more than one root. Roots that carry a
   subtree are laid out as trees; roots that stand alone are flowed into a
   band beneath them, because a row of 17 singletons beside a deep tree makes
   the tree unreadable and says nothing extra. */
function layoutTree(nodes) {
  const kids = childrenOf(nodes);
  const pos = new Map();
  const roots = rootsOf(nodes);
  const trees = roots.filter((r) => (kids.get(r.id) ?? []).length > 0);
  const lone = roots.filter((r) => (kids.get(r.id) ?? []).length === 0);
  // the deepest tree first — it is the spine of the works and should read first
  const memo = new Map();
  trees.sort((a, b) => subtreeLeafCount(b.id, kids, memo) - subtreeLeafCount(a.id, kids, memo));

  let cursor = 0;
  const place = (n, depth) => {
    const c = kids.get(n.id) ?? [];
    let x;
    if (c.length === 0) { x = cursor; cursor += NW + GAP_X; }
    else {
      const xs = c.map((k) => place(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(n.id, { x, y: depth * ROW, w: NW, h: NH });
    return x;
  };
  for (const r of trees) { place(r, 0); cursor += NW; }

  // the loose band
  const containers = [];
  if (lone.length) {
    const treeBottom = Math.max(0, ...[...pos.values()].map((p) => p.y)) + NH;
    const treeRight = Math.max(NW, ...[...pos.values()].map((p) => p.x + NW));
    const perRow = Math.max(4, Math.ceil(Math.sqrt(lone.length * 1.9)));
    const bandTop = treeBottom + 96;
    lone.forEach((n, i) => {
      pos.set(n.id, {
        x: (i % perRow) * (NW + GAP_X),
        y: bandTop + Math.floor(i / perRow) * (NH + 20),
        w: NW, h: NH,
      });
    });
    const rows = Math.ceil(lone.length / perRow);
    containers.push({
      x: -18, y: bandTop - 42,
      w: Math.max(perRow * (NW + GAP_X) - GAP_X, treeRight) + 36,
      h: rows * (NH + 20) + 52,
      name: `${lone.length} class-nodes with no lattice edge holding them up`,
    });
  }
  return { pos, containers };
}

/* ---- (b) RADIAL — roots at the centre, lattice depth as distance -------
   Two corrections the first drawing demanded. A node's box is ~NW wide, so a
   ring only holds so many before they overlap: each ring's radius is therefore
   the larger of its depth's spacing and the circumference its own membership
   needs. And the class-nodes that hold nothing and hang from nothing are not at
   some depth from the centre — they are outside the lattice altogether, so they
   get their own outer ring and it says so. */
function layoutRadial(nodes) {
  const kids = childrenOf(nodes);
  const pos = new Map();
  const memo = new Map();
  const allRoots = rootsOf(nodes);
  const rooted = allRoots.filter((r) => (kids.get(r.id) ?? []).length > 0);
  const lone = allRoots.filter((r) => (kids.get(r.id) ?? []).length === 0);

  // how many nodes land at each depth, so a ring can be sized to hold them
  const depthCount = new Map();
  const countDepth = (n, d) => {
    depthCount.set(d, (depthCount.get(d) ?? 0) + 1);
    for (const k of kids.get(n.id) ?? []) countDepth(k, d + 1);
  };
  for (const r of rooted) countDepth(r, 0);

  const NEED = NW + 26;
  const radiusAt = (d) => Math.max(120 + d * RING, ((depthCount.get(d) ?? 1) * NEED) / (Math.PI * 2));

  const total = rooted.reduce((s, r) => s + subtreeLeafCount(r.id, kids, memo), 0) || 1;
  let a0 = -Math.PI / 2;
  const place = (n, depth, from, to) => {
    const mid = (from + to) / 2;
    const r = radiusAt(depth);
    pos.set(n.id, { x: Math.cos(mid) * r, y: Math.sin(mid) * r, w: NW, h: NH });
    const c = kids.get(n.id) ?? [];
    if (!c.length) return;
    const span = to - from;
    let cur = from;
    for (const k of c) {
      const share = span * (subtreeLeafCount(k.id, kids, memo) / subtreeLeafCount(n.id, kids, memo));
      place(k, depth + 1, cur, cur + share);
      cur += share;
    }
  };
  for (const r of rooted) {
    const share = (Math.PI * 2) * (subtreeLeafCount(r.id, kids, memo) / total);
    place(r, 0, a0, a0 + share);
    a0 += share;
  }

  // the outer ring: in the lattice's terms these stand at no distance at all
  const maxD = Math.max(0, ...[...depthCount.keys()]);
  const outer = Math.max(radiusAt(maxD) + RING, (lone.length * NEED) / (Math.PI * 2));
  lone.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, lone.length)) * Math.PI * 2;
    pos.set(n.id, { x: Math.cos(a) * outer, y: Math.sin(a) * outer, w: NW, h: NH });
  });

  return {
    pos, containers: [], rings: true,
    ringRadii: [...Array(maxD + 1).keys()].map(radiusAt),
    outerRing: lone.length ? { r: outer, label: `${lone.length} class-nodes outside the lattice — no extends above or below them` } : null,
  };
}

/* ---- (c) NESTED — the DIRECTORY as boxes, the lattice as arrows --------
   The other two lay the works out by what extends what. This one lays it out
   by what sits inside what on disk, and lets the extends edges fly across it.
   Where a box's own arrow points at its own container the two agree; where it
   flies somewhere else, they do not. That disagreement is the thing this
   layout exists to make visible. */
function layoutNested(nodes) {
  const kids = childrenOf(nodes, "dirParent");
  const pos = new Map();
  const containers = [];
  const PAD = 14, INNER = 12;
  // HEAD grows with nesting size now that group labels scale (Keemin QoL):
  // measured bottom-up, a box holding many rows gets a taller head-band so its
  // bigger label never lies over its first child's own head.
  const HEAD = 34;

  // ONE pass decides the rows and their heights, and both the measured size and
  // the placed positions read that same plan. Measuring with one rule and
  // placing with another is how a box ends up with a floor of empty space
  // underneath its contents — which is exactly what the first drawing had.
  const planOf = new Map();
  const measure = (n) => {
    if (planOf.has(n.id)) return planOf.get(n.id);
    // within each level: predicates ABOVE the classes, each group alphabetical
    // (Keemin, 2026-08-19 close — the law slots read before the sub-machinery)
    const c = [...(kids.get(n.id) ?? [])].sort((a, b) =>
      ((a.kind === "class" ? 1 : 0) - (b.kind === "class" ? 1 : 0)) ||
      String(a.slug).localeCompare(String(b.slug)));
    if (!c.length) { const p = { w: NW, h: NH, rows: [] }; planOf.set(n.id, p); return p; }
    const sizes = c.map(measure);
    const perRow = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(c.length))));
    const rows = [];
    for (let i = 0; i < c.length; i += perRow) {
      const slice = c.slice(i, i + perRow).map((k, j) => ({ node: k, size: sizes[i + j] }));
      rows.push({ items: slice, h: Math.max(...slice.map((s) => s.size.h)), w: slice.reduce((a, s) => a + s.size.w, 0) + INNER * (slice.length - 1) });
    }
    const innerW = Math.max(NW, ...rows.map((r) => r.w));
    const innerH = rows.reduce((a, r) => a + r.h, 0) + INNER * (rows.length - 1);
    const p = { w: innerW + PAD * 2, h: HEAD + NH + INNER + innerH + PAD, rows };
    planOf.set(n.id, p);
    return p;
  };

  const place = (n, x, y) => {
    const p = measure(n);
    if (!p.rows.length) { pos.set(n.id, { x: x + NW / 2, y: y + NH / 2, w: NW, h: NH }); return p; }
    containers.push({ x, y, w: p.w, h: p.h, name: label(n) });
    // the container's own node sits at its head, so containment is never read
    // as the node having vanished into its own box
    pos.set(n.id, { x: x + PAD + NW / 2, y: y + HEAD + NH / 2, w: NW, h: NH });
    let cy = y + HEAD + NH + INNER;
    for (const row of p.rows) {
      let cx = x + PAD;
      for (const it of row.items) { place(it.node, cx, cy); cx += it.size.w + INNER; }
      cy += row.h + INNER;
    }
    return p;
  };

  const roots = nodes.filter((n) => !n.dirParent);
  // the portal's own furniture leads: portal, then the logos primitives
  // (node, edge) at the top; the rest biggest-first as before
  const pin = (n) => (n.slot === "portal" ? 0 : !n.inWorks && n.slug === "node" ? 1 : !n.inWorks && n.slug === "edge" ? 2 : 3);
  roots.sort((a, b) => (pin(a) - pin(b)) || (measure(b).h * measure(b).w - measure(a).h * measure(a).w));
  const GUT = 26;
  // the portal furniture (portal, node, edge) rides a top strip; EVERYTHING
  // else lives inside ONE labeled box: the-keeping-works (Keemin, close)
  const lead = roots.filter((n) => pin(n) < 3);
  const rest = roots.filter((n) => pin(n) === 3);
  let x = 0, rowH = 0;
  for (const r of lead) {
    const s = measure(r);
    place(r, x, 0);
    x += s.w + GUT; rowH = Math.max(rowH, s.h);
  }
  const boxTop = lead.length ? rowH + GUT : 0;
  const PADB = 18, HEADB = 26;
  const maxW = Math.max(1400, ...rest.map((r) => measure(r).w));
  let bx = PADB, by = boxTop + HEADB, brow = 0, bright = 0;
  for (const r of rest) {
    const s = measure(r);
    if (bx > PADB && bx + s.w > maxW) { bx = PADB; by += brow + GUT; brow = 0; }
    place(r, bx, by);
    bx += s.w + GUT; brow = Math.max(brow, s.h);
    bright = Math.max(bright, bx);
  }
  if (rest.length) {
    containers.unshift({ x: 0, y: boxTop, w: Math.max(bright - GUT + PADB, 320), h: (by + brow + PADB) - boxTop, name: "the-keeping-works" });
  }
  return { pos, containers };
}

// ============================================================ the drawing
function renderGraph() {
  const svg = $("#graph");
  svg.replaceChildren();
  const g = state.graph;

  const laid = state.layout === "tree" ? layoutTree(g.nodes)
    : state.layout === "radial" ? layoutRadial(g.nodes)
      : layoutNested(g.nodes);
  state.placed = laid;

  const root = el("g", { id: "vp" }, svg);

  // rings first, under everything — the radial layout's own scale, labelled so
  // the distance is readable as a depth rather than guessed at
  if (laid.rings) {
    const layer = el("g", {}, root);
    (laid.ringRadii ?? []).forEach((r, d) => {
      el("circle", { class: "m-anchor", cx: 0, cy: 0, r }, layer);
      el("text", { class: "c-name", x: 4, y: -r - 5 }, layer).textContent = `depth ${d}`;
    });
    if (laid.outerRing) {
      el("circle", { class: "m-anchor", cx: 0, cy: 0, r: laid.outerRing.r }, layer);
      el("text", { class: "c-name", x: 4, y: -laid.outerRing.r - 5 }, layer).textContent = laid.outerRing.label;
    }
  }

  // containers (the loose band, or the nested boxes)
  const cLayer = el("g", {}, root);
  for (const c of laid.containers) {
    el("rect", { class: "c-box", x: c.x, y: c.y, width: c.w, height: c.h, rx: 7 }, cLayer);
    // group labels scale with the box they name (Keemin QoL, 2026-08-19):
    // big groupings read big, leaves' containers stay quiet — area-driven, clamped
    const cFont = Math.max(11, Math.min(28, Math.round(Math.sqrt(c.w * c.h) / 14)));
    el("text", { class: "c-name", x: c.x + 9, y: c.y + cFont + 2, style: `font-size:${cFont}px` }, cLayer).textContent = c.name;
  }

  const eLayer = el("g", {}, root);
  const lLayer = el("g", {}, root);
  const nLayer = el("g", {}, root);

  // ------------------------------------------------------------- edges
  const drawn = [];
  for (const e of g.edges) {
    if (state.off.has(e.type)) continue;
    const a = laid.pos.get(e.from), b = laid.pos.get(e.to);
    if (!a || !b) continue;
    const child = state.byId.get(e.to) ?? state.byId.get(e.from);
    // is this edge the one holding its child up in THIS drawing?
    const spine = (state.byId.get(e.to)?.layoutParent === e.from) || (state.byId.get(e.from)?.layoutParent === e.to);
    const { d, mid } = edgePath(a, b, spine && state.layout !== "nested");
    const path = el("path", { class: `edge t-${e.type}`, d }, eLayer);
    path.dataset.from = e.from; path.dataset.to = e.to;
    el("title", {}, path).textContent = `${e.type} — ${shortId(e.from)} → ${shortId(e.to)}${e.detail ? ` (${e.detail})` : ""}`;

    const t = el("text", {
      class: `e-label l-${e.type}`, x: mid.x, y: mid.y - 2, "text-anchor": "middle",
    }, lLayer);
    t.textContent = e.detail?.startsWith("tie: ") ? e.detail.slice(5) : e.type;
    t.dataset.from = e.from; t.dataset.to = e.to;
    if (!state.showEdgeLabels) t.setAttribute("visibility", "hidden");
    drawn.push({ e, path, label: t });
  }
  state.drawnEdges = drawn;

  // ------------------------------------------------------------- nodes
  for (const n of g.nodes) {
    const p = laid.pos.get(n.id);
    if (!p) continue;
    const isPortal = n.id === (g.portal && g.portal.id);
    // beyond-the-works nodes (the logos quarter's, pulled in by reference) wear
    // their quarter, not the works' dress — inWorks comes from the derivation
    const quarter = n.inWorks ? null : (n.path.split("/").slice(-2, -1)[0] || "beyond");
    const grp = el("g", { class: `node${n.inWorks ? "" : " is-out"}`, transform: `translate(${p.x - p.w / 2},${p.y - p.h / 2})` }, nLayer);
    grp.dataset.id = n.id;
    el("rect", {
      class: `n-box ${n.kind === "class" ? "k-class" : "k-pred"}${isPortal ? " is-portal" : ""}${n.red ? " is-red" : ""}`,
      width: p.w, height: p.h, rx: 5,
    }, grp);
    el("text", { class: "n-name", x: 9, y: 15 }, grp).textContent = trunc(label(n), 20);
    // slot governance, worn on the node: sealed (class-governed value) ·
    // unsealed + custody (instance-governed, values-tier names whose word
    // fills it) · witnessed (stamped by the act, chosen by nobody)
    const gov = n.kind === "class" ? null :
      n.value === "unsealed" ? `unsealed · ${(n.valuesTier ?? "?").slice(0, 5)}` :
      n.value === "witnessed" ? "witnessed" : "sealed";
    el("text", { class: "n-kind", x: 9, y: 26 }, grp).textContent =
      quarter ? `from ${trunc(quarter, 12)} — beyond` :
      n.kind === "class" ? `class · v${n.version ?? "?"}` : (n.slot ? `${trunc(n.slot, 12)} · ${gov}` : `predicate · ${gov}`);

    grp.addEventListener("mouseenter", (ev) => { hoverOn(n, ev); });
    grp.addEventListener("mousemove", moveTip);
    grp.addEventListener("mouseleave", hoverOff);
    grp.addEventListener("click", (ev) => { ev.stopPropagation(); select(n.id); });
  }

  svg.addEventListener("click", () => clearSelection(), { once: false });
  fitToView();
  updateFoot();
}

function edgePath(a, b, spine) {
  if (spine) {
    // a spine edge reads as descent: leave the parent's underside, arrive on
    // the child's top, with the bend halfway between the rows
    const my = (a.y + b.y) / 2;
    const d = `M ${a.x} ${a.y + a.h / 2} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y - b.h / 2}`;
    return { d, mid: { x: (a.x + b.x) / 2, y: my } };
  }
  // everything else bows, so a cross-cutting edge never hides under a spine one
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(90, len * 0.22);
  const cx = (a.x + b.x) / 2 - (dy / len) * bow;
  const cy = (a.y + b.y) / 2 + (dx / len) * bow;
  return {
    d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
    mid: { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y },
  };
}

const shortId = (id) => String(id).replace(/^the-town\//, "");
const trunc = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

// ------------------------------------------------------------ interaction
function hoverOn(n, ev) {
  const tip = $("#tip");
  tip.innerHTML =
    `<div class="t-name">${esc(label(n))}</div>` +
    `<div class="t-kind">${esc(n.kind)}${n.tier ? " · " + esc(n.tier) : ""}${n.inWorks ? "" : " · BEYOND THE WORKS — " + esc(n.path)}${n.red ? ` · <span class="t-red">RED — ${esc(n.redWhy || "stated, no mechanic/engine yet")}</span>` : ""}</div>` +
    (n.body ? `<div class="t-body">${esc(n.body)}</div>` : "");
  tip.hidden = false;
  moveTip(ev);
  highlight(n.id);
}
function moveTip(ev) {
  const tip = $("#tip");
  const st = $(".stage").getBoundingClientRect();
  let x = ev.clientX - st.left + 16, y = ev.clientY - st.top + 14;
  if (x + tip.offsetWidth > st.width - 8) x = ev.clientX - st.left - tip.offsetWidth - 12;
  if (y + tip.offsetHeight > st.height - 8) y = ev.clientY - st.top - tip.offsetHeight - 12;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
function hoverOff() {
  $("#tip").hidden = true;
  if (state.selected) highlight(state.selected); else clearHighlight();
}

// the works is quiet until you ask it something: hovering or selecting a node
// lifts that node's own edges and dims the rest
function highlight(id) {
  const near = new Set([id]);
  for (const { e } of state.drawnEdges ?? []) {
    if (e.from === id) near.add(e.to);
    if (e.to === id) near.add(e.from);
  }
  for (const g of document.querySelectorAll("#graph .node")) {
    g.classList.toggle("is-dim", !near.has(g.dataset.id));
    g.classList.toggle("is-sel", g.dataset.id === state.selected);
  }
  for (const { e, path, label: lab } of state.drawnEdges ?? []) {
    const hot = e.from === id || e.to === id;
    path.classList.toggle("is-hot", hot);
    path.classList.toggle("is-dim", !hot);
    lab.classList.toggle("is-hot", hot);
    lab.classList.toggle("is-dim", !hot && !state.showEdgeLabels ? true : !hot && false);
    if (state.showEdgeLabels) lab.removeAttribute("visibility");
    else lab.setAttribute("visibility", hot ? "visible" : "hidden");
  }
}
function clearHighlight() {
  for (const g of document.querySelectorAll("#graph .node")) { g.classList.remove("is-dim"); g.classList.remove("is-sel"); }
  for (const { path, label: lab } of state.drawnEdges ?? []) {
    path.classList.remove("is-hot", "is-dim");
    lab.classList.remove("is-hot", "is-dim");
    if (state.showEdgeLabels) lab.removeAttribute("visibility"); else lab.setAttribute("visibility", "hidden");
  }
}

function select(id) {
  state.selected = id;
  highlight(id);
  const n = state.byId.get(id);
  const g = state.graph;
  const mine = g.edges.filter((e) => e.from === id || e.to === id);
  const row = (e) => {
    const other = e.from === id ? e.to : e.from;
    const dir = e.from === id ? "→" : "←";
    return `<li><span class="pill" style="border-color:var(--e-${e.type});color:var(--e-${e.type})">${e.type}</span> ${dir} ${esc(shortId(other))}${e.detail ? ` <span class="d-path">${esc(e.detail)}</span>` : ""}</li>`;
  };
  $("#detail-body").innerHTML = [
    `<h3 class="d-name">${esc(label(n))}</h3>`,
    `<div class="d-id">${esc(n.id)}</div>`,
    n.body ? `<p class="d-body">${esc(n.body)}</p>` : "",
    `<div class="d-sec"><h4>record</h4><div class="d-kv">`,
    `kind <b>${esc(n.kind)}</b>${n.className ? ` · class <b>${esc(n.className)}</b>` : ""}${n.version ? ` · v<b>${n.version}</b>` : ""}<br>`,
    `by <b>${esc(n.by ?? "—")}</b> · tier <b>${esc(n.tier ?? "—")}</b> · ${esc(n.date ?? "")}`,
    n.slot ? `<br>slot <b>${esc(n.slot)}</b> = <b>${esc(n.value ?? "")}</b>` : "",
    n.valuesTier ? `<br>values-tier <b>${esc(n.valuesTier)}</b>` : "",
    `</div></div>`,
    n.dials ? `<div class="d-sec"><h4>dials</h4><div class="d-kv">${Object.entries(n.dials).map(([k, v]) => `${esc(k)} <b>${esc(JSON.stringify(v))}</b>`).join("<br>")}</div></div>` : "",
    (n.mobility || n.anchor || n.ambient || n.exempt.length || n.propagation)
      ? `<div class="d-sec"><h4>standing</h4><div>${[
        n.mobility ? `<span class="pill">mobility ${esc(n.mobility)}</span>` : "",
        n.anchor ? `<span class="pill">anchor ${esc(n.anchor)}</span>` : "",
        n.ambient ? `<span class="pill">ambient</span>` : "",
        ...n.exempt.map((x) => `<span class="pill">exempt ${esc(x)}</span>`),
        n.propagation ? `<span class="pill">propagation ${esc(JSON.stringify(n.propagation))}</span>` : "",
      ].join("")}</div></div>` : "",
    n.actions.length ? `<div class="d-sec"><h4>actions</h4><ul>${n.actions.map((a) => `<li>${esc(a.action)}${a.for ? ` <i>for ${esc(a.for)}</i>` : ""}${a.residue ? ` → ${esc(shortId(a.residue))}` : ""}</li>`).join("")}</ul></div>` : "",
    n.code.length ? `<div class="d-sec"><h4>implements (source, not a mark)</h4><ul>${n.code.map((c) => `<li class="d-path">${esc(c)}</li>`).join("")}</ul></div>` : "",
    mine.length ? `<div class="d-sec"><h4>edges (${mine.length})</h4><ul>${mine.map(row).join("")}</ul></div>` : `<div class="d-sec"><h4>edges</h4><div class="d-kv">none</div></div>`,
    `<div class="d-sec"><h4>on disk</h4><div class="d-path">WORLD/marks/${esc(n.path)}/mark.md</div></div>`,
    `<div class="d-sec"><h4>held up by</h4><div class="d-kv">${n.layoutParent ? `<b>${esc(n.layoutParentEdge)}</b> from ${esc(shortId(n.layoutParent))}` : "<b>nothing</b> — a root in this drawing"} · lattice depth <b>${n.latticeDepth}</b></div></div>`,
  ].join("");
  $("#detail").hidden = false;
}
function clearSelection() {
  state.selected = null;
  $("#detail").hidden = true;
  clearHighlight();
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ------------------------------------------------------------- the legend
function buildLegend() {
  const g = state.graph;
  const ul = $("#legend-list");
  ul.replaceChildren();
  for (const [type, meta] of Object.entries(g.edgeTypes)) {
    const n = g.counts.byEdgeType[type] ?? 0;
    if (!n) continue; // a type with nothing drawn earns no legend row
    const li = document.createElement("li");
    li.dataset.type = type;
    li.title = meta.note;
    li.innerHTML = `<span class="swatch" style="border-top-color:var(--e-${type})"></span><span>${type}</span><span class="count">${n}</span>`;
    li.setAttribute("role", "button");
    li.addEventListener("click", () => {
      state.off.has(type) ? state.off.delete(type) : state.off.add(type);
      li.classList.toggle("is-off", state.off.has(type));
      renderGraph();
    });
    ul.appendChild(li);
  }
  // node dress lives in its OWN strip (#legend-nodes), never among edge types
  const nul = $("#legend-nodes");
  nul.replaceChildren();
  const outN = g.nodes.filter((n) => !n.inWorks).length;
  if (outN) {
    const li = document.createElement("li");
    li.className = "legend-static";
    li.title = "nodes pulled in from beyond the works (the logos quarter); the portal and implements: reach out to them — read here, never governed here";
    li.innerHTML = `<span class="lbl">nodes:</span><span class="swatch swatch-out"></span><span>from beyond</span><span class="count">${outN}</span>`;
    nul.appendChild(li);
  }
  const lone = g.nodes.filter((n) => !n.layoutParent).length;
  $("#spine-note").title =
    `who sits under whom is decided by the first of: ${g.spineOrder.join(", ")}. ` +
    `${lone} nodes have none of those and stand as roots. Every edge is still drawn and labelled by its own type — the spine only decides placement.`;
}

function updateFoot() {
  const g = state.graph;
  const shown = g.edges.filter((e) => !state.off.has(e.type)).length;
  const notes = {
    tree: "the extends lattice as a dendrogram — depth downward",
    radial: "roots at the centre; lattice depth reads as distance from it",
    nested: "boxes are the DIRECTORY on disk; the arrows are the lattice. Where an arrow leaves its own box, the tree and the lattice disagree.",
  };
  $("#works-sub").textContent = `${g.counts.classNodes} class-nodes · ${g.counts.predicates} predicates · ${shown}/${g.counts.edges} edges shown`;
  $("#works-foot").innerHTML = `<em>${state.layout}</em> — ${esc(notes[state.layout])}` +
    (g.counts.unresolved ? ` · <em>${g.counts.unresolved} unresolved target(s)</em>` : "");
}

// -------------------------------------------------------------- view + wire
function fitToView() {
  const svg = $("#graph");
  const laid = state.placed;
  if (!laid) return;
  const pts = [...laid.pos.values()];
  if (!pts.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x - p.w / 2); x1 = Math.max(x1, p.x + p.w / 2);
    y0 = Math.min(y0, p.y - p.h / 2); y1 = Math.max(y1, p.y + p.h / 2);
  }
  for (const c of laid.containers) {
    x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x + c.w);
    y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y + c.h);
  }
  const m = 46;
  const bw = (x1 - x0) + m * 2, bh = (y1 - y0) + m * 2;
  const r = svg.getBoundingClientRect();
  const k = Math.min(r.width / bw, r.height / bh, 1.7);
  state.view = { k, x: r.width / 2 - k * (x0 + x1) / 2, y: r.height / 2 - k * (y0 + y1) / 2 };
  applyView();
}
function applyView() {
  const vp = document.getElementById("vp");
  if (vp) vp.setAttribute("transform", `translate(${state.view.x},${state.view.y}) scale(${state.view.k})`);
}

function wire() {
  $("#leave").addEventListener("click", portalOut);
  $("#reset-view").addEventListener("click", fitToView);
  for (const b of document.querySelectorAll(".lay")) {
    b.addEventListener("click", () => {
      state.layout = b.dataset.layout;
      for (const o of document.querySelectorAll(".lay")) o.classList.toggle("is-on", o === b);
      const keep = state.selected;
      renderGraph();
      if (keep) select(keep);
    });
  }
  $("#edge-labels").addEventListener("change", (e) => {
    state.showEdgeLabels = e.target.checked;
    for (const { label: lab } of state.drawnEdges ?? []) {
      if (state.showEdgeLabels) lab.removeAttribute("visibility"); else lab.setAttribute("visibility", "hidden");
    }
  });
  $("#detail-close").addEventListener("click", clearSelection);

  // pan + zoom, so a wide layout is still walkable
  const svg = $("#graph");
  let drag = null;
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".node")) return;
    drag = { x: ev.clientX, y: ev.clientY, vx: state.view.x, vy: state.view.y };
    svg.classList.add("is-drag"); svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    state.view.x = drag.vx + (ev.clientX - drag.x);
    state.view.y = drag.vy + (ev.clientY - drag.y);
    applyView();
  });
  const end = (ev) => { drag = null; svg.classList.remove("is-drag"); try { svg.releasePointerCapture(ev.pointerId); } catch { /* not captured */ } };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const f = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    const k = Math.max(0.12, Math.min(4, state.view.k * f));
    state.view.x = mx - (mx - state.view.x) * (k / state.view.k);
    state.view.y = my - (my - state.view.y) * (k / state.view.k);
    state.view.k = k;
    applyView();
  }, { passive: false });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (state.selected) clearSelection(); else if ($("#works-layer").classList.contains("is-open")) portalOut(); }
    if (ev.key === "3") document.querySelector('[data-layout="nested"]')?.click();
  });
  window.addEventListener("resize", () => { if ($("#works-layer").classList.contains("is-open")) fitToView(); });
}

boot();
