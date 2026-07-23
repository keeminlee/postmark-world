// viewer.mjs — THE told-world viewer, one module for both surfaces.
//
// This is the single implementation (Keemin, 2026-07-23: the local build is THE
// one viewer; the site serves this same file as a standalone island). It owns the
// markup, the styles, and every interaction; the host page is a thin shell that
// calls `mountViewer(appEl)`. It computes the field of view CLIENT-SIDE from the
// town's public record — read-only by construction: the walk/stake/mark verbs are
// never even imported, so nothing here can be written anywhere.
//
// It runs in two habitats and feature-detects which without a config flag:
//   • LOCAL (spectator/server.mjs)  — /WORLD/*.json off disk, /api/stakes live,
//     /atlas/* proxied to postmark.town. The rich dev surface.
//   • ISLAND (postmark.town/world)  — world-state/skeleton from raw.githubusercontent,
//     /atlas same-origin, the stakes half hidden (no server to ask).
//
// One engine, imported the clone's way (relative into the package): the browser
// runs the exact library anyone can `node`. If this page and a clone disagree,
// the office has explaining to do.
import { orient, openYourEyes, investigate, containmentChain } from "../tools/world-verbs.mjs";
import { assembleWorld } from "../tools/world-build.mjs";
import { DIALS } from "../tools/world-engine.mjs";

const RAW = "https://raw.githubusercontent.com/keeminlee/postmark-world/main";
const $ = (root, s) => root.querySelector(s);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BEARING_LONG = { N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest" };
const BEARING_ORDER = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

// the stand-at presets (the same three the local build and the astro page carried)
const PRESETS = [
  { x: 0, y: 0, label: "The quay — Ferry's crossing" },
  { x: 575, y: -2600, label: "Trueing Terrace — above the fog" },
  { x: -1900, y: 2150, label: "Caelina's ground — the dark pole" },
];

// dev-pane dials — the FOV-time leans only (assembly-time idw stays fixed, so a
// dial change never re-folds or re-assembles: it re-tells). Each is {key,label,
// min,max,step}. Ranges are generous prototyping room, not law.
const DEV_DIALS = [
  { key: "context_budget", label: "context budget", min: 1, max: 30, step: 1 },
  { key: "cluster_beyond_m", label: "cluster beyond (m)", min: 100, max: 4000, step: 50 },
  { key: "max_sight_m", label: "max sight (m)", min: 2000, max: 40000, step: 500 },
  { key: "bearing_points", label: "bearing rose", min: 4, max: 32, step: 4 },
  { key: "weight_lod_k", label: "stamp lift (weight k)", min: 0, max: 2, step: 0.05 },
  { key: "eye_height_m", label: "eye height (m)", min: 0.5, max: 60, step: 0.5 },
  { key: "default_mark_top_m", label: "default mark top (m)", min: 0, max: 60, step: 0.5 },
  { key: "fog_base", label: "fog base", min: 0, max: 1, step: 0.01 },
  { key: "fog_swing", label: "fog swing", min: 0, max: 0.5, step: 0.01 },
  { key: "fog_sight_floor_m", label: "fog sight floor (m)", min: 20, max: 3000, step: 20 },
  { key: "fog_sight_ceiling_m", label: "clear-air sight (m)", min: 2000, max: 40000, step: 500 },
  { key: "above_fog_bonus", label: "above-fog bonus", min: 1, max: 3, step: 0.1 },
  { key: "signal_fog_reach_mult", label: "signal fog reach ×", min: 1, max: 12, step: 0.5 },
  { key: "dark_dim_floor", label: "dark dim floor", min: 0, max: 1, step: 0.05 },
  { key: "los_clearance_m", label: "LOS clearance (m)", min: 0, max: 5, step: 0.25 },
];

const STYLE = `
.wv { --night:#14171d; --panel:#1c2129; --panel2:#20262f; --line:#2e3542;
  --paper:#e8e0cf; --dim:#9a9280; --amber:#e8c56a; --amber-dark:#b8964a; --err:#d98a7a;
  background:var(--night); color:var(--paper); font:16px/1.55 Georgia,"Times New Roman",serif;
  min-height:100vh; }
.wv * { box-sizing:border-box; }
.wv-head { padding:14px 22px; border-bottom:1px solid var(--line); display:flex;
  align-items:baseline; gap:14px; flex-wrap:wrap; }
.wv-head h1 { font-size:1.05rem; margin:0; color:var(--amber); font-weight:600; letter-spacing:.04em; }
.wv-head .wv-sub { color:var(--dim); font-style:italic; font-size:.85rem; }
.wv-alpha { border:1px solid rgba(216,138,122,.5); border-left-width:4px; border-radius:5px;
  margin:16px 22px 0; padding:9px 14px; font-size:.84rem; line-height:1.5; color:var(--dim); max-width:92ch; }
.wv-alpha b { color:var(--err); letter-spacing:.08em; }
.wv-main { display:grid; grid-template-columns:236px minmax(0,1fr) 400px; gap:0; align-items:start; }
.wv-main.no-map { grid-template-columns:236px minmax(0,1fr); }
@media (max-width:1160px){ .wv-main,.wv-main.no-map { grid-template-columns:236px minmax(0,1fr); }
  .wv-map { grid-column:1 / -1; border-top:1px solid var(--line); } .wv-map .wv-sticky { position:static; } }
@media (max-width:720px){ .wv-main,.wv-main.no-map { grid-template-columns:1fr; } }
.wv-nav { padding:18px; border-right:1px solid var(--line); background:var(--panel); }
.wv-nav h2 { font-size:.74rem; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin:18px 0 8px; }
.wv-tabs { display:flex; gap:4px; margin-bottom:6px; }
.wv-tabs button { flex:1; background:transparent; border:1px solid var(--line); color:var(--dim);
  font:inherit; font-size:.8rem; border-radius:4px; padding:6px 4px; cursor:pointer; }
.wv-tabs button.on { border-color:var(--amber); color:var(--amber); background:var(--panel2); }
.wv-nav button.ctl, .wv-nav .compass button, .wv-nav .step button {
  background:transparent; border:1px solid var(--line); color:var(--paper); font:inherit;
  font-size:.83rem; border-radius:4px; padding:5px 9px; cursor:pointer; }
.wv-nav .presets button { display:block; width:100%; text-align:left; margin-bottom:6px; }
.wv-nav button.ctl:hover, .wv-nav .compass button:hover, .wv-nav .step button:hover { border-color:var(--amber-dark); color:var(--amber); }
.wv-nav .compass { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; max-width:200px; }
.wv-nav .compass .pos { display:flex; align-items:center; justify-content:center; color:var(--dim); font-size:.72rem; }
.wv-nav .step { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
.wv-nav .step button.on { border-color:var(--amber); color:var(--amber); }
.wv-nav input.txt, .wv-nav input.num { width:100%; background:var(--night); color:var(--paper);
  border:1px solid var(--line); border-radius:4px; font:inherit; padding:4px 7px; }
.wv-nav input.num { width:80px; }
.wv-where { color:var(--dim); font-size:.82rem; margin-top:14px; }
.wv-where b { color:var(--paper); }
.wv-dev-toggle { margin-top:20px; width:100%; }
.wv-dev { margin-top:12px; border-top:1px solid var(--line); padding-top:12px; }
.wv-dev .dial { margin-bottom:9px; }
.wv-dev .dial label { display:flex; justify-content:space-between; font-size:.74rem; color:var(--dim); margin-bottom:2px; }
.wv-dev .dial label b { color:var(--amber); font-variant-numeric:tabular-nums; }
.wv-dev .dial input[type=range] { width:100%; accent-color:var(--amber-dark); }
.wv-dev .devrow { display:flex; gap:6px; margin-top:6px; }
.wv-dev .devrow button { flex:1; }
.wv-dev .devnote { font-size:.72rem; color:var(--dim); margin:2px 0 10px; font-style:italic; }
.wv-view { padding:22px 28px; overflow-x:auto; min-height:60vh; }

/* the telling */
.wv-spine { font-size:.8rem; color:var(--dim); margin-bottom:12px; letter-spacing:.02em; }
.wv-spine .node { color:var(--amber-dark); }
.wv-spine .sep { opacity:.5; margin:0 5px; }
.wv-open { white-space:pre-wrap; max-width:76ch; line-height:1.55; border-bottom:1px solid var(--line);
  padding-bottom:14px; margin-bottom:10px; }
.wv-bearing h3 { font-size:.8rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); margin:18px 0 8px; }
.wv-bearing .bshort { opacity:.5; font-size:.72rem; }
.wv-card { border:1px solid var(--line); border-left:3px solid var(--amber-dark); border-radius:5px;
  padding:10px 13px; margin:8px 0; cursor:pointer; max-width:76ch; }
.wv-card:hover { border-color:var(--amber-dark); }
.wv-card.far { border-left-color:var(--line); font-style:italic; }
.wv-card .cbody { line-height:1.45; }
.wv-card .cmeta { margin-top:7px; display:flex; gap:6px; flex-wrap:wrap; align-items:baseline; }
.wv-chip { font-size:.7rem; letter-spacing:.04em; border:1px solid var(--line); border-radius:999px;
  padding:1px 8px; color:var(--dim); white-space:nowrap; }
.wv-chip.stamps { border-color:var(--amber-dark); color:var(--amber); }
.wv-chip.signal { border-color:var(--amber-dark); color:var(--amber); }
.wv-chip.dim { opacity:.6; }
.wv-cid { font-size:.7rem; color:var(--dim); opacity:.6; margin-left:auto; font-family:Consolas,Menlo,monospace; }
.wv-cluster { margin-top:7px; font-size:.8rem; font-style:italic; color:var(--amber); opacity:.85; }
.wv-tallies { margin-top:22px; padding-top:10px; font-size:.82rem; color:var(--dim); border-top:1px solid var(--line); max-width:76ch; }
/* investigate in place */
.wv-expand { margin-top:10px; padding-top:10px; border-top:1px dashed var(--amber-dark); cursor:default; }
.wv-crumbs { display:flex; gap:10px; align-items:baseline; margin-bottom:6px; }
.wv-back { color:var(--amber); cursor:pointer; font-size:.82rem; }
.wv-back:hover { text-decoration:underline; }
.wv-tree-label { font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); margin:12px 0 4px 10px; }
.wv-tree { margin-left:20px; border-left:1px solid var(--amber-dark); padding-left:14px; }
.wv-tree.sib { margin-left:4px; border-left-style:dotted; }
.wv-tnode { padding:7px 10px; margin:5px 0; border:1px solid var(--line); border-radius:4px; cursor:pointer; }
.wv-tnode:hover { border-color:var(--amber-dark); }
.wv-tnode .tbody { font-size:.92rem; line-height:1.4; }
.wv-tslot { font-style:italic; color:var(--dim); }

/* grid-true */
.wv-gridwrap { display:flex; flex-direction:column; align-items:center; }
.wv-ladder { position:relative; border:1px solid var(--line); border-radius:6px; padding:26px 12px 12px;
  margin:0; width:100%; max-width:720px; }
.wv-ladder > .lname { position:absolute; top:5px; left:12px; font-size:.7rem; letter-spacing:.06em;
  text-transform:uppercase; color:var(--amber-dark); }
.wv-ladder.root { border-color:var(--amber-dark); }
.wv-canvas { position:relative; width:100%; aspect-ratio:1/1; background:
  radial-gradient(circle at center, rgba(232,197,106,.05), transparent 70%); border:1px solid var(--line);
  border-radius:4px; overflow:hidden; }
.wv-canvas svg { position:absolute; inset:0; width:100%; height:100%; }
.wv-you { fill:#ff2418; stroke:#fff; stroke-width:2; }
.wv-you-halo { fill:none; stroke:#ff2418; stroke-width:1.5; opacity:.5; }
.wv-reach { fill:rgba(232,197,106,.05); stroke:var(--amber); stroke-width:1.5; stroke-dasharray:6 5; opacity:.7; }
.wv-pip { fill:var(--amber); opacity:.75; cursor:pointer; }
.wv-pip.sig { fill:#fff3cf; }
.wv-plabel { fill:var(--paper); font:11px Georgia,serif; opacity:.85; pointer-events:none; }
.wv-axis { fill:var(--dim); font:11px Georgia,serif; opacity:.6; }
.wv-gridnote { color:var(--dim); font-size:.8rem; margin-top:12px; max-width:70ch; text-align:center; font-style:italic; }

/* my marks */
.wv-marks-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:6px; }
.wv-marks-head h2 { margin:0; color:var(--amber); font-size:1rem; }
.wv-section-title { font-size:.76rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim);
  margin:22px 0 10px; border-bottom:1px solid var(--line); padding-bottom:5px; }
.wv-mrow { border:1px solid var(--line); border-left:3px solid var(--amber-dark); border-radius:5px;
  padding:9px 12px; margin:7px 0; max-width:80ch; }
.wv-mrow.pred { border-left-color:var(--line); }
.wv-mrow .mbody { line-height:1.4; font-size:.94rem; }
.wv-mrow .mmeta { margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:baseline; }
.wv-mrow .stand { color:var(--amber); cursor:pointer; font-size:.74rem; border:1px solid var(--amber-dark);
  border-radius:999px; padding:1px 8px; }
.wv-mrow .stand:hover { background:var(--panel2); }

/* the painting */
.wv-map { padding:18px; }
.wv-map .wv-sticky { position:sticky; top:16px; }
.wv-map h2 { font-size:.74rem; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin:0 0 10px; }
.wv-minimap { border:1px solid var(--line); border-radius:5px; overflow:hidden; cursor:crosshair; }
.wv-minimap svg { display:block; width:100%; height:auto; }
.wv-minimap .loading { padding:18px 12px; font-size:.82rem; font-style:italic; color:var(--dim); }
.wv-mapnote { font-size:.78rem; color:var(--dim); line-height:1.45; margin-top:8px; }
.ov-reach { fill:rgba(232,197,106,.06); stroke:var(--amber); stroke-width:2.5; stroke-dasharray:10 8; opacity:.8; }
.ov-pip { fill:var(--amber); opacity:.65; }
.ov-dot { fill:#ff2418; stroke:#fff; stroke-width:3; }
.ov-halo { fill:none; stroke:#ff2418; stroke-width:3; opacity:.55; }

.wv-quiet { color:var(--dim); font-style:italic; }
.wv-err { color:var(--err); }
`;

const MARKUP = `
<header class="wv-head">
  <h1>POSTMARK — THE TOLD WORLD</h1>
  <span class="wv-sub">a camera over the marks tree · read-only · nothing you do here is written</span>
</header>
<div class="wv-alpha"><b>ALPHA</b> — the told world days after its first breath. Unlisted, unannounced, and every
  part of this page may change shape or break without a word. The record underneath is real; the viewer is a work in progress.</div>
<div class="wv-main">
  <nav class="wv-nav">
    <div class="wv-tabs">
      <button class="tab on" data-view="telling">The telling</button>
      <button class="tab" data-view="grid">Grid-true</button>
      <button class="tab" data-view="marks">My marks</button>
    </div>
    <div class="wv-standctl">
      <h2>Stand at</h2>
      <div class="presets">${PRESETS.map((p) => `<button class="ctl" data-x="${p.x}" data-y="${p.y}">${esc(p.label)}</button>`).join("")}</div>
      <h2>Move</h2>
      <div class="compass">
        <button class="ctl" data-dx="-1" data-dy="-1">NW</button><button class="ctl" data-dx="0" data-dy="-1">N</button><button class="ctl" data-dx="1" data-dy="-1">NE</button>
        <button class="ctl" data-dx="-1" data-dy="0">W</button><div class="pos">0,0</div><button class="ctl" data-dx="1" data-dy="0">E</button>
        <button class="ctl" data-dx="-1" data-dy="1">SW</button><button class="ctl" data-dx="0" data-dy="1">S</button><button class="ctl" data-dx="1" data-dy="1">SE</button>
      </div>
      <div class="step">
        <button class="ctl" data-m="100">100 m</button><button class="ctl on" data-m="250">250 m</button>
        <button class="ctl" data-m="500">500 m</button><button class="ctl" data-m="1000">1 km</button>
      </div>
      <h2>Crossing</h2>
      <input class="num crossing" type="number" value="19" min="0"> <span class="wv-quiet" style="font-size:.78rem">fog seeds from it</span>
      <div class="wv-where"></div>
    </div>
    <div class="wv-marksctl" hidden>
      <h2>Resident</h2>
      <input class="txt handle" type="text" value="wright" spellcheck="false" autocapitalize="off">
      <div class="wv-quiet" style="font-size:.78rem; margin-top:6px">whose marks &amp; stakes to show</div>
    </div>
    <button class="ctl wv-dev-toggle">⚙ dev dials</button>
    <div class="wv-dev" hidden></div>
  </nav>
  <section class="wv-view">
    <div class="wv-telling"><div class="wv-quiet">opening your eyes…</div></div>
    <div class="wv-grid" hidden></div>
    <div class="wv-marks" hidden></div>
  </section>
  <aside class="wv-map">
    <div class="wv-sticky">
      <h2>The painting</h2>
      <div class="wv-minimap"><div class="loading">fetching the painting…</div></div>
      <p class="wv-mapnote">the atlas, for bearings — <b>the telling is the truth</b>. Click the map to stand there.
        The dashed ring is how far today's air lets you see.</p>
    </div>
  </aside>
</div>
`;

export function mountViewer(appEl) {
  if (!appEl) throw new Error("mountViewer needs a host element");
  const shadowHost = appEl;
  shadowHost.classList.add("wv");
  const styleTag = document.createElement("style");
  styleTag.textContent = STYLE;
  shadowHost.appendChild(styleTag);
  const wrap = document.createElement("div");
  wrap.innerHTML = MARKUP;
  shadowHost.appendChild(wrap);

  const root = shadowHost;
  const state = {
    cam: { x: 0, y: 0 },
    step: 250,
    crossing: 19,
    view: "telling",
    handle: "wright",
    dials: { ...DIALS },
    stakesLocal: null,      // null=unknown, true/false after probe
  };
  let data = null;          // { worldState, skeleton }
  let world = null;         // assembled once (crossing-independent)
  let mapCtx = null;
  let lastRadial = null;

  // ───────── data + world (feature-detected source) ─────────
  async function fetchJson(paths) {
    let lastErr;
    for (const p of paths) {
      try { const r = await fetch(p); if (r.ok) return await r.json(); lastErr = new Error(`${p} → HTTP ${r.status}`); }
      catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error("no source");
  }
  async function loadData() {
    if (data) return;
    const [ws, sk] = await Promise.all([
      fetchJson(["/WORLD/world-state.json", `${RAW}/WORLD/world-state.json`]),
      fetchJson(["/WORLD/skeleton.json", `${RAW}/WORLD/skeleton.json`]),
    ]);
    data = { worldState: ws, skeleton: sk };
    world = assembleWorld({ worldState: ws, skeleton: sk });
  }

  // ───────── the telling view ─────────
  function chips(m) {
    const c = [];
    c.push(`<span class="wv-chip">${esc(m.band ?? "")}${m.distM != null && !m.far ? ` · ${m.distM.toLocaleString()} m` : m.far ? ` · ~${Math.round((m.distM ?? 0) / 1000)} km` : ""}</span>`);
    if (m.weight > 0) c.push(`<span class="wv-chip stamps">✦${m.weight}</span>`);
    if (m.signal) c.push(`<span class="wv-chip signal">its light carries</span>`);
    if (m.dim != null && m.dim < 1) c.push(`<span class="wv-chip dim">dim</span>`);
    if (m.aboveFogTarget) c.push(`<span class="wv-chip">above the fog</span>`);
    return c.join("");
  }
  function spineCrumb(within) {
    if (!within?.length) return "";
    const nodes = within.map((w) => `<span class="node" title="${esc(w.id)}">${esc(firstWords(w.body, 5) || w.id)}</span>`);
    return `<div class="wv-spine">you stand within ${nodes.join('<span class="sep">›</span>')}</div>`;
  }
  function tellingCards(radial) {
    const by = radial?.byBearing ?? {};
    // order by the compass rose where known; any coined key (a degree bearing from
    // a non-16 bearing_points dial) sorts after, so the dev pane never blanks a view
    const keys = Object.keys(by).sort((a, b) => {
      const ia = BEARING_ORDER.indexOf(a), ib = BEARING_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    let html = "";
    for (const b of keys) {
      const group = by[b]; if (!group) continue;
      const entries = Object.values(group).flat(); if (!entries.length) continue;
      html += `<div class="wv-bearing"><h3>${BEARING_LONG[b] ?? b} <span class="bshort">${b}</span></h3>`;
      for (const m of entries) {
        html += `<article class="wv-card${m.far ? " far" : ""}" data-id="${esc(m.id)}" role="button" tabindex="0">
          <div class="cbody">${esc(m.far ? (m.label ?? m.id) : m.body ?? "")}</div>
          <div class="cmeta">${chips(m)}<span class="wv-cid">${esc(m.id)}</span></div>
          ${m.clusteredCount > 1 ? `<div class="wv-cluster">+${m.clusteredCount - 1} more of ${esc(m.household ?? "this household")}'s — investigate</div>` : ""}
        </article>`;
      }
      html += `</div>`;
    }
    return html || `<div class="wv-quiet">nothing tells from here — walk, or wait for clearer air.</div>`;
  }
  function tallies(radial) {
    const c = radial?.counts ?? {}, agg = radial?.aggregate ?? {}, parts = [];
    if (c.candidates != null) parts.push(`${c.shown ?? "?"} told of ${c.visible ?? "?"} in view (${c.candidates} in range)`);
    if (c.occluded) parts.push(`${c.occluded} behind the ground`);
    if (c.fogHidden) parts.push(`${c.fogHidden} lost to fog`);
    if (agg.hidden_by_budget) parts.push(`${agg.hidden_by_budget} more the eye doesn't sort out`);
    return parts.join(" · ");
  }
  function renderTelling() {
    const box = $(root, ".wv-telling");
    try {
      const name = state.cam.x === 0 && state.cam.y === 0 ? "a spectator on the Town Centre quay" : "a spectator";
      const e = openYourEyes({ x: state.cam.x, y: state.cam.y, name }, world, { crossing: state.crossing, dials: state.dials, budget: state.dials.context_budget });
      lastRadial = e.radial;
      const blocks = e.tell().split("\n\n");
      const opening = [blocks[0], blocks[1]].filter(Boolean).join("\n\n");
      box.innerHTML = spineCrumb(e.radial.within)
        + `<div class="wv-open">${esc(opening)}</div>`
        + `<div class="wv-cards">${tellingCards(e.radial)}</div>`
        + `<div class="wv-tallies">${esc(tallies(e.radial))}</div>`;
      drawOverlay(e.radial);
    } catch (err) {
      box.innerHTML = `<div class="wv-err">the telling failed: ${esc(err?.message ?? err)}</div>`;
    }
  }

  // ───────── investigate (in-place expansion inside a card) ─────────
  const tnode = (n, cls) => `<div class="wv-tnode ${cls}" data-id="${esc(n.id)}" role="button" tabindex="0">
      <div class="tbody">${n.slot ? `<span class="wv-tslot">${esc(n.slot)}:</span> <b>${esc(n.value ?? "")}</b> — ` : ""}${esc(n.body ?? "")}</div>
      <div class="cmeta">${n.stamps > 0 ? `<span class="wv-chip stamps">✦${n.stamps}</span>` : ""}<span class="wv-cid">${esc(n.id)}</span></div>
    </div>`;
  function renderExpansion(card) {
    const stack = card._stack ?? [];
    let box = card.querySelector(".wv-expand");
    if (!stack.length) { box?.remove(); return; }
    const id = stack[stack.length - 1];
    const d = investigate(id, world);
    if (!box) { box = document.createElement("div"); box.className = "wv-expand"; card.appendChild(box); }
    if (d.error) { box.innerHTML = `<div class="wv-err">${esc(d.error)}</div>`; return; }
    const drilled = stack.length > 1;
    box.innerHTML = `
      ${drilled ? `<div class="wv-crumbs"><span class="wv-back" role="button" tabindex="0">◂ back</span><span class="wv-cid">${esc(d.id)}</span></div>
      <div class="cbody" style="margin-bottom:6px">${esc(d.body ?? "")}</div>` : ""}
      <div class="cmeta" style="margin-bottom:4px">${d.stamps > 0 ? `<span class="wv-chip stamps">✦${d.stamps}</span>` : `<span class="wv-chip">✦0 — a pre-mark, awaiting its resident</span>`}${d.sovereign ? `<span class="wv-chip">sovereign</span>` : ""}${d.tier === "constitution" ? `<span class="wv-chip">constitution</span>` : ""}</div>
      ${d.predicates?.length ? `<div class="wv-tree-label">told of it</div><div class="wv-tree">${d.predicates.map((p) => tnode(p, "prop")).join("")}</div>` : ""}
      ${d.inside?.length ? `<div class="wv-tree-label">within it</div><div class="wv-tree">${d.inside.map((p) => tnode(p, "child")).join("")}</div>` : ""}
      ${d.alongside?.length ? `<div class="wv-tree-label">alongside</div><div class="wv-tree sib">${d.alongside.map((p) => tnode(p, "sib")).join("")}</div>` : ""}
      ${(d.more?.inside > 0 || d.more?.predicates > 0) ? `<div class="wv-quiet" style="margin:8px 0 0 10px; font-size:.8rem">…and more the eye holds back — investigate deeper.</div>` : ""}`;
  }

  // ───────── grid-true view ─────────
  function renderGrid() {
    const box = $(root, ".wv-grid");
    try {
      const name = state.cam.x === 0 && state.cam.y === 0 ? "a spectator on the Town Centre quay" : "a spectator";
      const e = openYourEyes({ x: state.cam.x, y: state.cam.y, name }, world, { crossing: state.crossing, dials: state.dials, budget: state.dials.context_budget });
      lastRadial = e.radial;
      const within = e.radial.within ?? [];
      const carried = (e.fov.carried ?? []).filter((m) => m.at && typeof m.at.x === "number");
      const reach = e.radial.sightReachM ?? 1000;
      // scale: fit the FARTHEST VISIBLE MARK (not the whole sight radius), so the
      // marks spread across the canvas instead of bunching at the centre when the
      // air is clear and the reach dwarfs what's actually in view. Still true —
      // every point keeps its real bearing and relative distance.
      const farthest = Math.max(1, ...carried.map((m) => m.distM ?? 0));
      const fit = Math.max(300, farthest * 1.15); // floor so a near-only view isn't absurdly zoomed
      const VB = 1000, C = VB / 2, sc = C / fit; // px per metre
      const px = (mx, my) => ({ x: C + (mx - state.cam.x) * sc, y: C + (my - state.cam.y) * sc });
      const reachPx = reach * sc, reachFits = reachPx <= C * 1.35;
      let svg = reachFits ? `<circle cx="${C}" cy="${C}" r="${reachPx.toFixed(1)}" class="wv-reach"/>` : "";
      // axis ticks (grid: x east→right, y south→down)
      svg += `<text x="${C}" y="16" text-anchor="middle" class="wv-axis">N</text>`;
      svg += `<text x="${C}" y="${VB - 6}" text-anchor="middle" class="wv-axis">S</text>`;
      svg += `<text x="10" y="${C}" class="wv-axis">W</text>`;
      svg += `<text x="${VB - 10}" y="${C}" text-anchor="end" class="wv-axis">E</text>`;
      // a soft scale hint: the fit radius in metres, bottom-right
      svg += `<text x="${VB - 10}" y="${VB - 12}" text-anchor="end" class="wv-axis">edge ≈ ${Math.round(fit).toLocaleString()} m${reachFits ? "" : " · air sees ~" + Math.round(reach).toLocaleString() + " m"}</text>`;
      for (const m of carried) {
        const p = px(m.at.x, m.at.y);
        const r = m.signal ? 7 : 4 + Math.min(6, Math.log1p(m.weight || 0) * 2.2);
        svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" class="wv-pip${m.signal ? " sig" : ""}" data-id="${esc(m.id)}"><title>${esc(m.id)} — ${esc(firstWords(m.body, 12))}</title></circle>`;
        const lx = p.x + (p.x > C ? -8 : 8), anchor = p.x > C ? "end" : "start";
        svg += `<text x="${lx.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="${anchor}" class="wv-plabel">${esc(shortLabel(m))}</text>`;
      }
      svg += `<circle cx="${C}" cy="${C}" r="26" class="wv-you-halo"/><circle cx="${C}" cy="${C}" r="6" class="wv-you"/>`;
      const canvas = `<div class="wv-canvas"><svg viewBox="0 0 ${VB} ${VB}" preserveAspectRatio="xMidYMid meet">${svg}</svg></div>`;
      // nest the canvas inside the containment ladder (root outermost)
      let nested = canvas;
      for (let i = within.length - 1; i >= 0; i--) {
        const w = within[i];
        const isRoot = i === 0;
        nested = `<div class="wv-ladder${isRoot ? " root" : ""}"><div class="lname" title="${esc(w.id)}">${esc(firstWords(w.body, 7) || w.id)}</div>${nested}</div>`;
      }
      box.innerHTML = `<div class="wv-gridwrap">${nested}
        <div class="wv-gridnote">you stand at the centre; each point is a mark in its true bearing and distance. The nested frames are what you stand <b>within</b> — the outermost is the world itself, the innermost the smallest thing that contains you. Click a point to investigate.</div></div>`;
    } catch (err) {
      box.innerHTML = `<div class="wv-err">the grid failed: ${esc(err?.message ?? err)}</div>`;
    }
  }

  // ───────── my marks view ─────────
  async function probeStakes() {
    if (state.stakesLocal !== null) return state.stakesLocal;
    try { const r = await fetch(`/api/stakes?holder=${encodeURIComponent(state.handle)}`); state.stakesLocal = r.ok; }
    catch { state.stakesLocal = false; }
    return state.stakesLocal;
  }
  function markRow(m, standable) {
    return `<div class="wv-mrow${m.kind === "sited" || m.kind === "parcel" ? "" : " pred"}">
      <div class="mbody">${esc(m.body ?? "")}</div>
      <div class="mmeta">
        <span class="wv-chip">${esc(m.kind)}</span>
        ${m.weight > 0 ? `<span class="wv-chip stamps">✦${m.weight}</span>` : `<span class="wv-chip">✦0</span>`}
        ${m.tier === "constitution" ? `<span class="wv-chip">constitution</span>` : ""}
        ${m.sovereign ? `<span class="wv-chip">sovereign</span>` : ""}
        <span class="wv-cid">${esc(m.id)}</span>
        ${standable ? `<span class="stand" data-x="${m.at.x}" data-y="${m.at.y}">stand here ▸</span>` : ""}
      </div></div>`;
  }
  async function renderMarks() {
    const box = $(root, ".wv-marks");
    const h = state.handle.trim();
    const mine = (world.marks ?? []).filter((m) => m.by === h);
    const sited = mine.filter((m) => m.at && (m.kind === "sited" || m.kind === "parcel"));
    const desc = mine.filter((m) => !(m.at && (m.kind === "sited" || m.kind === "parcel")));
    let html = `<div class="wv-marks-head"><h2>${esc(h)}</h2><span class="wv-quiet">${mine.length} mark${mine.length === 1 ? "" : "s"} on the record</span></div>`;
    html += `<div class="wv-section-title">marks ${esc(h)} authored — sited</div>`;
    html += sited.length ? sited.map((m) => markRow(m, true)).join("") : `<div class="wv-quiet">no sited marks.</div>`;
    if (desc.length) {
      html += `<div class="wv-section-title">told of other marks (predicated · naming)</div>`;
      html += desc.map((m) => markRow(m, false)).join("");
    }
    // stakes half — local-only, feature-detected
    html += `<div class="wv-section-title">marks ${esc(h)}'s stamps are staked on</div>`;
    html += `<div class="wv-stakes-slot"><div class="wv-quiet">checking the stamp-ledger…</div></div>`;
    box.innerHTML = html;

    const local = await probeStakes();
    const slot = $(root, ".wv-stakes-slot");
    if (!slot) return;
    if (!local) {
      slot.innerHTML = `<div class="wv-quiet">the stakes view reads the town's stamp-ledger — a local-only feature; it isn't served on the public island.</div>`;
      return;
    }
    try {
      const r = await fetch(`/api/stakes?holder=${encodeURIComponent(h)}`);
      const d = await r.json();
      const stakes = d.stakes ?? [];
      if (!stakes.length) {
        slot.innerHTML = `<div class="wv-quiet">${esc(h)} holds no stakes on any mark yet (the ledger records 0 stake lines — staking is first-class but rare so far).</div>`;
        return;
      }
      const byId = new Map((world.marks ?? []).map((m) => [m.id, m]));
      slot.innerHTML = stakes.map((s) => {
        const m = byId.get(s.mark);
        return `<div class="wv-mrow">
          <div class="mbody">${esc(m?.body ?? "(a mark not in the current fold)")}</div>
          <div class="mmeta"><span class="wv-chip stamps">${s.n > 0 ? "+" : ""}${s.n} staked</span>
          <span class="wv-cid">${esc(s.mark)}</span>
          ${m?.at ? `<span class="stand" data-x="${m.at.x}" data-y="${m.at.y}">stand here ▸</span>` : ""}</div></div>`;
      }).join("");
    } catch (e) {
      slot.innerHTML = `<div class="wv-err">stakes failed: ${esc(e?.message ?? e)}</div>`;
    }
  }

  // ───────── the painting (atlas minimap) ─────────
  async function loadMinimap() {
    const boxEl = $(root, ".wv-minimap");
    try {
      const html = await fetch("/atlas/town.html").then((r) => { if (!r.ok) throw new Error(`atlas HTTP ${r.status}`); return r.text(); });
      const doc = new DOMParser().parseFromString(html, "text/html");
      const svg = doc.querySelector("svg");
      if (!svg) throw new Error("no svg in the painting");
      const g = data.skeleton._grid ?? {};
      const om = String(g.origin ?? "").match(/\((\d+)\s*,\s*(\d+)\)/);
      const sm = String(g.scale ?? "").match(/(\d+(?:\.\d+)?)\s*m per atlas px/);
      if (!om || !sm) throw new Error("skeleton _grid changed shape");
      const originPx = { x: +om[1], y: +om[2] }, mPerPx = +sm[1];
      svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.querySelectorAll("script").forEach((s) => s.remove());
      const atlasBase = new URL("/atlas/town.html", location.origin);
      svg.querySelectorAll("image").forEach((im) => {
        const hh = im.getAttribute("href") ?? im.getAttribute("xlink:href");
        if (hh && !/^(https?:)?\//.test(hh)) { im.setAttribute("href", new URL(hh, atlasBase).pathname); im.removeAttribute("xlink:href"); }
      });
      const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.setAttribute("id", "wv-overlay");
      svg.appendChild(overlay);
      boxEl.innerHTML = ""; boxEl.appendChild(svg);
      mapCtx = { svg, overlay, originPx, mPerPx };
      svg.addEventListener("click", (e) => {
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        state.cam = { x: Math.round((p.x - originPx.x) * mPerPx), y: Math.round((p.y - originPx.y) * mPerPx) };
        renderCurrent();
      });
      if (lastRadial) drawOverlay(lastRadial);
    } catch (e) {
      boxEl.innerHTML = `<div class="loading">the painting didn't load (${esc(e.message)}) — the telling still works</div>`;
    }
  }
  function drawOverlay(radial) {
    if (!mapCtx) return;
    const { overlay, originPx, mPerPx } = mapCtx;
    const px = (m) => ({ x: originPx.x + m.x / mPerPx, y: originPx.y + m.y / mPerPx });
    const me = px(state.cam), reachPx = (radial?.sightReachM ?? 0) / mPerPx;
    let s = `<circle cx="${me.x}" cy="${me.y}" r="${reachPx}" class="ov-reach"/>`;
    for (const bands of Object.values(radial?.byBearing ?? {}))
      for (const arr of Object.values(bands))
        for (const m of arr) { if (!m.at || typeof m.at.x !== "number") continue; const p = px(m.at); s += `<circle cx="${p.x}" cy="${p.y}" r="11" class="ov-pip"><title>${esc(m.id)}</title></circle>`; }
    s += `<circle cx="${me.x}" cy="${me.y}" r="17" class="ov-dot"/><circle cx="${me.x}" cy="${me.y}" r="36" class="ov-halo"/>`;
    overlay.innerHTML = s;
  }

  // ───────── dev pane ─────────
  function buildDevPane() {
    const dev = $(root, ".wv-dev");
    dev.innerHTML = `<div class="devnote">live engine dials — re-tells on change; never mutates the module, never re-folds.</div>`
      + DEV_DIALS.map((d) => {
        const v = state.dials[d.key];
        return `<div class="dial"><label>${esc(d.label)} <b data-out="${d.key}">${fmt(v)}</b></label>
          <input type="range" data-dial="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}"></div>`;
      }).join("")
      + `<div class="devrow"><button class="ctl wv-dev-reset">reset dials</button></div>`;
  }
  function fmt(v) { return Number.isInteger(v) ? String(v) : (+v).toFixed(2).replace(/\.?0+$/, ""); }

  // ───────── view switching + shared render ─────────
  function renderCurrent() {
    $(root, ".pos").textContent = `${state.cam.x},${state.cam.y}`;
    $(root, ".wv-where").innerHTML = `standing at <b>(${state.cam.x}, ${state.cam.y})</b>`;
    if (state.view === "telling") renderTelling();
    else if (state.view === "grid") renderGrid();
    else if (state.view === "marks") renderMarks();
    if (state.view !== "marks" && !mapCtx) loadMinimap();
  }
  function switchView(v) {
    state.view = v;
    for (const t of root.querySelectorAll(".wv-tabs .tab")) t.classList.toggle("on", t.dataset.view === v);
    $(root, ".wv-telling").hidden = v !== "telling";
    $(root, ".wv-grid").hidden = v !== "grid";
    $(root, ".wv-marks").hidden = v !== "marks";
    $(root, ".wv-standctl").hidden = v === "marks";
    $(root, ".wv-marksctl").hidden = v !== "marks";
    $(root, ".wv-main").classList.toggle("no-map", v === "marks");
    $(root, ".wv-map").hidden = v === "marks";
    renderCurrent();
  }

  // ───────── events ─────────
  let devTimer = null;
  root.addEventListener("click", (e) => {
    const tab = e.target.closest(".wv-tabs .tab");
    if (tab) { switchView(tab.dataset.view); return; }
    // investigate: back-crumb / tree node / card
    const back = e.target.closest(".wv-back");
    if (back) { const card = back.closest(".wv-card"); card._stack.pop(); renderExpansion(card); return; }
    const tn = e.target.closest(".wv-tnode");
    if (tn) { const card = tn.closest(".wv-card"); if (card && tn.dataset.id) { card._stack.push(tn.dataset.id); renderExpansion(card); } return; }
    // grid pip → investigate in a floating card is overkill; jump to telling+expand
    const pip = e.target.closest(".wv-pip");
    if (pip && pip.dataset.id) { switchView("telling"); queueMicrotask(() => openCardById(pip.dataset.id)); return; }
    const stand = e.target.closest(".stand");
    if (stand) { state.cam = { x: +stand.dataset.x, y: +stand.dataset.y }; switchView("telling"); return; }
    if (e.target.closest(".wv-dev-toggle")) { const dev = $(root, ".wv-dev"); dev.hidden = !dev.hidden; if (!dev.dataset.built) { buildDevPane(); dev.dataset.built = "1"; } return; }
    if (e.target.closest(".wv-dev-reset")) { state.dials = { ...DIALS }; buildDevPane(); renderCurrent(); return; }
    const b = e.target.closest("button.ctl, .wv-card");
    if (!b) return;
    if (b.dataset.x !== undefined && b.classList.contains("ctl")) { state.cam = { x: +b.dataset.x, y: +b.dataset.y }; renderCurrent(); }
    else if (b.dataset.dx !== undefined) { state.cam.x += (+b.dataset.dx) * state.step; state.cam.y += (+b.dataset.dy) * state.step; renderCurrent(); }
    else if (b.dataset.m) { state.step = +b.dataset.m; for (const x of root.querySelectorAll(".step button")) x.classList.toggle("on", x === b); }
    else if (b.classList.contains("wv-card") && b.dataset.id) { if (b._stack?.length) { b._stack = []; renderExpansion(b); } else { b._stack = [b.dataset.id]; renderExpansion(b); } }
  });
  function openCardById(id) {
    const card = [...root.querySelectorAll(".wv-card")].find((c) => c.dataset.id === id);
    if (card) { card._stack = [id]; renderExpansion(card); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  root.addEventListener("input", (e) => {
    if (e.target.classList.contains("crossing")) { state.crossing = Number(e.target.value) || 0; renderCurrent(); return; }
    if (e.target.classList.contains("handle")) { state.handle = e.target.value; state.stakesLocal = null; if (state.view === "marks") renderMarks(); return; }
    const dial = e.target.dataset?.dial;
    if (dial) {
      state.dials = { ...state.dials, [dial]: Number(e.target.value) };
      const out = root.querySelector(`[data-out="${dial}"]`); if (out) out.textContent = fmt(state.dials[dial]);
      clearTimeout(devTimer); devTimer = setTimeout(renderCurrent, 70);
    }
  });

  // ───────── boot ─────────
  (async () => {
    try {
      await loadData();
      renderCurrent();
    } catch (err) {
      $(root, ".wv-telling").innerHTML = `<div class="wv-err">could not load the world record: ${esc(err?.message ?? err)}</div>`;
    }
  })();

  return { rerender: renderCurrent };
}

// ───────── tiny helpers (display only) ─────────
function firstWords(body, n) {
  const s = String(body ?? "").replace(/^\s*(sits|region|kind|at|date|slot|value|household|mark|parent)\s*:\s*/i, "").trim().replace(/\s+/g, " ");
  const w = s.split(" ").slice(0, n).join(" ");
  return w + (s.split(" ").length > n ? "…" : "");
}
function shortLabel(m) {
  if (m.far) return m.label ?? m.id;
  const leaf = String(m.id ?? "").split("/").pop() ?? "";
  return leaf.replace(/-/g, " ").split(" ").slice(0, 4).join(" ");
}
