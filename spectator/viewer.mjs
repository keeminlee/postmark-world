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
import { contains, rect } from "../tools/geometry.mjs"; // read-only: to color a home + its descendants green

const RAW = "https://raw.githubusercontent.com/keeminlee/postmark-world/main";
const $ = (root, s) => root.querySelector(s);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BEARING_LONG = { N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest" };

// the stand-at presets (the same three the local build and the astro page carried)
const PRESETS = [
  { x: 0, y: 0, label: "The quay — Ferry's crossing" },
  { x: 575, y: -2600, label: "Trueing Terrace — above the fog" },
  { x: -1900, y: 2150, label: "Caelina's ground — the dark pole" },
];

// step-size notches (Keemin 2026-07-23): a single labeled slider, not buttons.
// Non-linear notches so a stride runs from a metre to a kilometre; default 100 m.
const STEP_NOTCHES = [1, 25, 50, 100, 250, 500, 1000];
const STEP_DEFAULT_I = 3; // → 100 m
const stepLabel = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

// the ferry's clock — the LIVE crossing, the office's own derivation (12h crossings
// since the ledger's first delivery day; the "provisional pending a ruling" line is
// now the viewer's default). fog is the crossing's weather, so an open tab that
// rolls over a crossing boundary re-tells with fresh weather.
const CROSSING_EPOCH_UTC = Date.UTC(2026, 5, 12); // 2026-06-12T00:00Z
const liveCrossing = () => Math.max(0, Math.floor((Date.now() - CROSSING_EPOCH_UTC) / (12 * 3600 * 1000)));

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
  /* tier accents (Keemin 2026-07-23): constitution → blue, sovereign/homes → green, market → amber */
  --blue:#7ba7e0; --blue-dark:#5580b8; --green:#84c98f; --green-dark:#57a068;
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
.wv-main { display:grid; grid-template-columns:236px minmax(0,1fr) 600px; gap:0; align-items:start; }
.wv-main.no-map { grid-template-columns:236px minmax(0,1fr); }
@media (max-width:1160px){ .wv-main,.wv-main.no-map { grid-template-columns:236px minmax(0,1fr); }
  .wv-map { grid-column:1 / -1; border-top:1px solid var(--line); } .wv-map .wv-sticky { position:static; } }
@media (max-width:720px){ .wv-main,.wv-main.no-map { grid-template-columns:1fr; } }
/* the app frame (Keemin 2026-07-24 eve): at full width the page stops scrolling —
   each column scrolls itself, and the left side matches the map pane's height */
@media (min-width:1161px){
  .wv { height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  .wv > div { flex:1 1 0; min-height:0; display:flex; flex-direction:column; overflow:hidden; } /* the mount wrapper */
  .wv-main { flex:1 1 0; min-height:0; overflow:hidden; align-items:stretch; }
  .wv-nav, .wv-view { overflow-y:auto; min-height:0; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
  .wv-map { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
  .wv-map .wv-sticky { position:static; display:flex; flex-direction:column; min-height:0; flex:1; }
  .wv-minimap { flex:1; min-height:0; }
  .wv-minimap svg { width:100%; height:100%; }
}
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
.wv-nav .stepwrap { margin-top:10px; }
.wv-nav .steplbl { display:flex; justify-content:space-between; align-items:baseline; font-size:.74rem;
  letter-spacing:.02em; color:var(--dim); text-transform:uppercase; margin-bottom:4px; }
.wv-nav .steplbl b { color:var(--amber); font-variant-numeric:tabular-nums; text-transform:none; letter-spacing:0; }
.wv-nav .stepslider { width:100%; accent-color:var(--amber-dark); cursor:pointer; }
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
.wv-band h3 { font-size:.8rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); margin:18px 0 8px; }
.wv .bshort { opacity:.5; font-size:.72rem; }
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
.wv-extent { display:inline-flex; align-items:center; gap:4px; opacity:.8; }
.wv-extent svg { display:block; }
.wv-extent svg rect { fill:rgba(154,146,128,.18); stroke:var(--dim); stroke-width:1; }
.wv-extent-t { font-size:.66rem; color:var(--dim); font-variant-numeric:tabular-nums; white-space:nowrap; }
.wv-cluster { margin-top:7px; font-size:.8rem; font-style:italic; color:var(--amber); opacity:.85; }
.wv-tallies { margin-top:22px; padding-top:10px; font-size:.82rem; color:var(--dim); border-top:1px solid var(--line); max-width:76ch; }
/* everything is a mark-cell — tier accents + the encompassing ladder */
.wv-section-lbl { font-size:.72rem; letter-spacing:.13em; text-transform:uppercase; color:var(--dim);
  margin:20px 0 9px; opacity:.75; }
.wv-section-lbl:first-child { margin-top:2px; }
.wv-card.t-constitution { border-left-color:var(--blue-dark); }
.wv-card.t-constitution:hover { border-color:var(--blue-dark); }
.wv-card.t-home { border-left-color:var(--green-dark); }
.wv-card.t-home:hover { border-color:var(--green-dark); }
.wv-chip.t-constitution { border-color:var(--blue-dark); color:var(--blue); }
.wv-chip.t-home { border-color:var(--green-dark); color:var(--green); }
.wv-card.frame { border-left-width:5px; border-left-color:var(--blue); background:rgba(123,167,224,.05);
  max-width:76ch; }
.wv-card.frame .cbody { font-size:1.05rem; }
.wv-card.ladder { border-left-width:4px; }
.wv-card.law { border-style:dashed; }
.wv-cell-state { margin-top:6px; font-size:.9rem; color:var(--paper); opacity:.82; font-style:italic; line-height:1.4; }
.wv-card.frame .wv-cell-state, .wv-card.law .wv-cell-state { opacity:.95; }
/* investigate in place */
.wv-expand { margin-top:10px; padding-top:10px; border-top:1px dashed var(--amber-dark); cursor:default; }
.wv-crumbs { display:flex; gap:10px; align-items:baseline; margin-bottom:6px; }
.wv-back { color:var(--amber); cursor:pointer; font-size:.82rem; }
.wv-back:hover { text-decoration:underline; }
/* upward context on an investigate card: what this mark sits INSIDE. Its own
   relation — before this it had none, so a parent fell through into "alongside"
   and a child's own house was listed as its neighbour. Nearest container first;
   each name drills, same as a tree node. Labelled "sits inside" and not
   "within": the children section directly below is already "within it", and two
   adjacent labels differing by one word while meaning opposite directions is a
   trap. The engine field stays "within" — this is the label, not the contract.
   (No backticks anywhere in this block: it is one big template literal.) */
.wv-within { font-size:.8rem; color:var(--dim); margin:2px 0 8px; line-height:1.55; }
.wv-within .lbl { font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; margin-right:7px; }
.wv-within .wv-wnode { color:var(--amber); cursor:pointer; border-bottom:1px dotted var(--amber-dark); }
.wv-within .wv-wnode:hover { color:var(--paper); border-bottom-color:var(--amber); }
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
.wv-ladder.t-constitution { border-color:var(--blue-dark); }
.wv-ladder.t-constitution > .lname { color:var(--blue); }
.wv-ladder.t-home { border-color:var(--green-dark); }
.wv-ladder.t-home > .lname { color:var(--green); }
.wv-canvas { position:relative; width:100%; aspect-ratio:1/1; background:
  radial-gradient(circle at center, rgba(232,197,106,.05), transparent 70%); border:1px solid var(--line);
  border-radius:4px; overflow:hidden; }
.wv-canvas svg { position:absolute; inset:0; width:100%; height:100%; }
.wv-you { fill:#ff2418; stroke:#fff; stroke-width:2; }
.wv-you-halo { fill:none; stroke:#ff2418; stroke-width:1.5; opacity:.5; }
.wv-reach { fill:rgba(232,197,106,.05); stroke:var(--amber); stroke-width:1.5; stroke-dasharray:6 5; opacity:.7; }
.wv-pip { fill:var(--amber); opacity:.75; cursor:pointer; }
.wv-pip.t-constitution { fill:var(--blue); }
.wv-pip.t-home { fill:var(--green); }
.wv-pip.sig { fill:#fff3cf; }
/* grid-true footprints — a mark's claim at true scale; market neutral, constitution blue, home green */
.wv-foot { fill:rgba(154,146,128,.10); stroke:var(--dim); stroke-width:1.4; cursor:pointer; }
.wv-foot:hover { fill-opacity:.24; }
.wv-foot.t-constitution { fill:rgba(123,167,224,.12); stroke:var(--blue); }
.wv-foot.t-home { fill:rgba(132,201,143,.14); stroke:var(--green); }
.wv-foot.sig { stroke:#fff3cf; }
.wv-plabel { fill:var(--paper); font:21px Georgia,serif; opacity:.9; pointer-events:none; paint-order:stroke; stroke:var(--night); stroke-width:3; }
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
.wv-mrow.t-constitution { border-left-color:var(--blue-dark); }
.wv-mrow.t-home { border-left-color:var(--green-dark); }
.wv-mrow .mbody { line-height:1.4; font-size:.94rem; }
.wv-mrow .mmeta { margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:baseline; }
.wv-mrow .stand { color:var(--amber); cursor:pointer; font-size:.74rem; border:1px solid var(--amber-dark);
  border-radius:999px; padding:1px 8px; }
.wv-mrow .stand:hover { background:var(--panel2); }

/* the fused left pane: All / Mine filter chips + the Mine tail (elsewhere + stakes) */
.wv-mfilter { display:flex; gap:6px; margin:0 0 12px; }
.wv-fchip { background:transparent; border:1px solid var(--line); color:var(--dim); border-radius:999px;
  padding:3px 15px; font-size:.72rem; letter-spacing:.05em; cursor:pointer; }
.wv-fchip:hover { border-color:var(--amber-dark); color:var(--amber); }
.wv-fchip.on { border-color:var(--amber); color:var(--amber); background:var(--panel2); }
.wv-mine-tail { margin-top:4px; }
.wv-mine-empty { margin:10px 0; font-style:italic; }
.wv-elsewhere { display:flex; flex-direction:column; gap:6px; }
.wv-elrow { border:1px solid var(--line); border-radius:5px; padding:7px 11px; max-width:80ch; }
.wv-elwords { line-height:1.4; font-size:.88rem; color:var(--paper); }
.wv-elmeta { margin-top:5px; display:flex; gap:8px; flex-wrap:wrap; align-items:baseline; }
.wv-elmeta .stand { color:var(--amber); cursor:pointer; font-size:.74rem; border:1px solid var(--amber-dark);
  border-radius:999px; padding:1px 8px; }
.wv-elmeta .stand:hover { background:var(--panel2); }

/* the painting */
.wv-map { padding:18px; }
.wv-map .wv-sticky { position:sticky; top:16px; }
.wv-map h2 { font-size:.74rem; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin:0 0 10px; }
/* The two map surfaces are things you GRAB, not prose you copy. Dragging used
   to sweep a text selection across the painting's labels, and a live selection
   then fights the next drag (the browser keeps extending it). The mousedown
   handler already preventDefaults; this is the belt to that suspender, because
   selection can still initiate from a text node in some engines regardless.
   Scoped to these two containers ON PURPOSE — the telling cards and letter
   bodies in the left pane must stay selectable, since people copy prose out of
   them. Nuking selection viewer-wide would trade a papercut for a wound. */
.wv-minimap, .wv-canvas { -webkit-user-select:none; user-select:none; }
.wv-minimap { border:1px solid var(--line); border-radius:5px; overflow:hidden; cursor:crosshair; }
.wv-minimap svg { display:block; width:100%; height:auto; }
.wv-minimap .loading { padding:18px 12px; font-size:.82rem; font-style:italic; color:var(--dim); }
.wv-mapnote { font-size:.78rem; color:var(--dim); line-height:1.45; margin-top:8px; }
.ov-reach { fill:rgba(232,197,106,.06); stroke:var(--amber); stroke-width:2.5; stroke-dasharray:10 8; opacity:.8; }
/* the overlay's pips speak the same tier language as everything else on the
   painting — the highlight box/dot, the footprints, the grid pips. They were
   uniform amber, which read as "one kind of thing" on a map whose whole point
   is that the kinds differ (Keemin 2026-07-27: "green homes, blue constitution").
   Amber stays the market default, so only the two named classes move. */
.ov-pip { fill:var(--amber); opacity:.65; }
.ov-pip.t-constitution { fill:var(--blue); }
.ov-pip.t-home { fill:var(--green); }
.ov-dot { fill:#ff2418; stroke:#fff; stroke-width:3; }
.ov-halo { fill:none; stroke:#ff2418; stroke-width:3; opacity:.55; }
/* hover highlight — the mark's box and dot light TOGETHER, in the mark's own
   tier color (Keemin 2026-07-24 eve: one visual language, cells ⇄ map) */
.wv-hl-box { fill:rgba(255,255,255,.06); stroke-width:3; vector-effect:non-scaling-stroke; }
.wv-hl-box.t-constitution { stroke:var(--blue); }
.wv-hl-box.t-home { stroke:var(--green); }
.wv-hl-box.t-market { stroke:var(--amber); }
.wv-hl-box.mech { stroke-dasharray:6 5; }
.wv-hl-dot { stroke:#fff; stroke-width:1.5; vector-effect:non-scaling-stroke; }
.wv-hl-dot.t-constitution { fill:var(--blue); }
.wv-hl-dot.t-home { fill:var(--green); }
.wv-hl-dot.t-market { fill:var(--amber); }
/* the viewport (P2 right-pane convergence): pan/zoom/lock-on live on the painting */
.wv-maphead { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.wv-mapctl { display:flex; gap:5px; }
.wv-mapctl .ctl { font-size:.68rem; padding:2px 8px; }
.wv-mapctl .ctl.on { background:var(--amber-dark); color:var(--night); border-color:var(--amber); }
.wv-minimap.pannable { cursor:grab; }
.wv-minimap.panning { cursor:grabbing; }
.wv-gridline { stroke:#e8c56a; stroke-opacity:.14; stroke-width:1; vector-effect:non-scaling-stroke; }
.wv-gridline.major { stroke-opacity:.32; }
.wv-gridlbl { fill:#e8c56a; opacity:.55; font-family:Consolas,Menlo,monospace; }
/* footprints — every mark's true extent from the record. ONE vocabulary with the
   cells: tier sets the color (tierOf), dashed = the law/mechanic modifier. */
#wv-fp-layer { pointer-events:none; }
.wv-fp { fill:none; stroke-width:1.4; vector-effect:non-scaling-stroke; }
.wv-fp.t-constitution { stroke:var(--blue-dark); }
.wv-fp.t-home { stroke:var(--green-dark); }
.wv-fp.t-market { stroke:var(--amber-dark); }
.wv-fp.mech { stroke-dasharray:6 5; }
.wv-fp.fp-parcel { fill:rgba(132,201,143,.10); }
/* the marks you stand WITHIN read a tad heavier — the map's echo of the
   "Where you stand" ladder (Keemin: no nesting ceremony, just weight) */
.wv-fp.fp-within { stroke-width:2.8; }
.ov-reach { vector-effect:non-scaling-stroke; }
.ov-halo { vector-effect:non-scaling-stroke; }

.wv-nav .wv-identity { margin:10px 0 2px; font-size:.8rem; }
.wv-nav .wv-signin { color:var(--amber-dark); cursor:pointer; }
.wv-nav .wv-signin:hover { color:var(--amber); }
.wv-nav .wv-keyfield { display:flex; gap:5px; margin-top:6px; }
.wv-nav .wv-keyfield input.keyinput { flex:1; }
.wv-nav .wv-keyfield .keyuse { white-space:nowrap; }
.wv-nav .wv-id-in { color:var(--dim); }
.wv-nav .wv-id-in b { color:var(--green); }
.wv-nav .wv-signout { color:var(--amber-dark); cursor:pointer; margin-left:4px; }
.wv-nav .wv-signout:hover { color:var(--amber); }
.wv-nav .handlepick { display:flex; flex-wrap:wrap; gap:5px; }
.wv-nav .handleopt.on { border-color:var(--green-dark); color:var(--green); }
.wv-nav .crossnow { font-size:.86rem; color:var(--paper); }
.wv-nav .crossnow b { color:var(--amber); font-variant-numeric:tabular-nums; }
.wv-nav .crosslive-tag { color:var(--green); font-size:.78rem; }
.wv-dev .cross .crossrow { display:flex; gap:6px; align-items:center; }
.wv-dev .cross input.crossover { flex:1; }
.wv-dev .cross .crosslive { white-space:nowrap; font-size:.76rem; padding:3px 7px; }
.wv-moved { position:sticky; top:6px; z-index:5; display:inline-block; margin-bottom:10px;
  background:var(--panel2); border:1px solid var(--amber-dark); border-radius:999px; padding:4px 13px;
  font-size:.8rem; color:var(--amber); opacity:0; transform:translateY(-4px);
  transition:opacity .3s, transform .3s; pointer-events:none; }
.wv-moved.show { opacity:.96; transform:translateY(0); }
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
    </div>
    <div class="wv-identity"></div>
    <div class="wv-standctl">
      <h2>Stand at</h2>
      <div class="presets">${PRESETS.map((p) => `<button class="ctl" data-x="${p.x}" data-y="${p.y}">${esc(p.label)}</button>`).join("")}</div>
      <h2>Move</h2>
      <div class="compass">
        <button class="ctl" data-dx="-1" data-dy="-1">NW</button><button class="ctl" data-dx="0" data-dy="-1">N</button><button class="ctl" data-dx="1" data-dy="-1">NE</button>
        <button class="ctl" data-dx="-1" data-dy="0">W</button><div class="pos">0,0</div><button class="ctl" data-dx="1" data-dy="0">E</button>
        <button class="ctl" data-dx="-1" data-dy="1">SW</button><button class="ctl" data-dx="0" data-dy="1">S</button><button class="ctl" data-dx="1" data-dy="1">SE</button>
      </div>
      <div class="stepwrap">
        <label class="steplbl">step size <b class="stepval">100 m</b></label>
        <input class="stepslider" type="range" min="0" max="${STEP_NOTCHES.length - 1}" step="1" value="3" list="wv-stepticks" aria-label="step size">
        <datalist id="wv-stepticks">${STEP_NOTCHES.map((_, i) => `<option value="${i}"></option>`).join("")}</datalist>
      </div>
      <h2>Crossing</h2>
      <div class="crossnow"></div>
      <div class="wv-where"></div>
    </div>
    <button class="ctl wv-dev-toggle" hidden>⚙ dev dials</button>
    <div class="wv-dev" hidden></div>
  </nav>
  <section class="wv-view">
    <div class="wv-telling"><div class="wv-quiet">opening your eyes…</div></div>
    <div class="wv-grid" hidden></div>
  </section>
  <aside class="wv-map">
    <div class="wv-sticky">
      <div class="wv-maphead">
        <h2>The painting</h2>
        <div class="wv-mapctl">
          <button class="ctl wv-map-home" title="fit the whole painting">⌂ fit</button>
          <button class="ctl wv-map-follow" title="keep the view centred on where you stand">⌖ follow</button>
          <button class="ctl wv-map-grid" title="the survey grid — 1 km lines, 5 km majors"># grid</button>
          <button class="ctl wv-map-fp" title="every mark's true extent, drawn from the record — parcels green, market amber, constitution dashed">▭ marks</button>
        </div>
      </div>
      <div class="wv-minimap"><div class="loading">fetching the painting…</div></div>
      <p class="wv-mapnote">the atlas, for bearings — <b>the telling is the truth</b>. Click to stand there;
        drag to pan, scroll to zoom. The dashed ring is how far today's air lets you see.</p>
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
    step: STEP_NOTCHES[STEP_DEFAULT_I], // 100 m
    crossing: liveCrossing(),           // default to the live crossing
    crossingOverride: false,            // a dev/principal time-travel override
    view: "telling",
    markFilter: "all",                  // "all" | "mine" — the fused left-pane filter (signed-in)
    handle: "wright",
    dials: { ...DIALS },
    stakesLocal: null,      // null=unknown, true/false after probe
    dataSource: null,       // which world-state URL won (for the auto-update poll)
    asOf: null,             // X-Postmark-As-Of of the loaded fold (office-live only)
    whoami: null,           // { principal, household, handles } from /api/ops/whoami
  };
  let data = null;          // { worldState, skeleton }
  let world = null;         // assembled once (crossing-independent)
  let byId = new Map();     // id → folded mark, for cell lookups
  let homeSet = new Set();  // ids that render green: homes (+ descendants) and sovereigns
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
  // fetch world-state AND report which url won + its X-Postmark-As-Of (the office
  // stamps every response; the auto-update poll compares it). Same office-first
  // preference: office live → same-origin /WORLD → RAW github.
  const WS_PATHS = ["/api/world/state", "/WORLD/world-state.json", `${RAW}/WORLD/world-state.json`];
  async function fetchWorldState(paths) {
    let lastErr;
    for (const p of paths) {
      try { const r = await fetch(p); if (r.ok) return { json: await r.json(), url: p, asOf: r.headers.get("x-postmark-as-of") }; lastErr = new Error(`${p} → ${r.status}`); }
      catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error("no source");
  }
  const isOfficeLive = (url) => !!url && url.startsWith("/api/world/");
  async function loadData() {
    if (data) return;
    const ws = await fetchWorldState(WS_PATHS);
    const [sk, mf] = await Promise.all([
      fetchJson(["/api/world/skeleton", "/WORLD/skeleton.json", `${RAW}/WORLD/skeleton.json`]),
      // homes come from the seeding manifest, fetched the same way (same-origin probe
      // → raw fallback); optional — no manifest just means no green
      fetchJson(["/seeding/manifest.json", `${RAW}/seeding/manifest.json`]).catch(() => null),
    ]);
    state.dataSource = ws.url; state.asOf = ws.asOf;
    data = { worldState: ws.json, skeleton: sk, manifest: mf };
    world = assembleWorld({ worldState: ws.json, skeleton: sk });
    byId = new Map(world.marks.map((m) => [m.id, m]));
    homeSet = buildHomeSet(mf, world.marks);
  }
  // re-pull the fold from the same source and re-assemble (auto-update). Skeleton
  // and manifest are stable across a write, so only world-state is refetched.
  async function reloadWorld() {
    const ws = await fetchWorldState([state.dataSource, ...WS_PATHS]);
    state.dataSource = ws.url; state.asOf = ws.asOf;
    data.worldState = ws.json;
    world = assembleWorld({ worldState: ws.json, skeleton: data.skeleton });
    byId = new Map(world.marks.map((m) => [m.id, m]));
    homeSet = buildHomeSet(data.manifest, world.marks);
  }
  // Home-ness is derived, never on the record: the manifest maps household→home_id,
  // so the home mark is `<household>/<home_id>`; it and its same-household descendants
  // (marks its footprint contains) render green. Fold-computed sovereigns too.
  function buildHomeSet(manifest, marks) {
    const set = new Set();
    for (const m of marks) if (m.sovereign) set.add(m.id);
    const idx = new Map(marks.map((m) => [m.id, m]));
    for (const h of manifest?.homes ?? []) {
      const home = idx.get(`${h.household}/${h.home_id}`);
      if (!home?.at) continue;
      set.add(home.id);
      const hr = rect(home);
      for (const m of marks) {
        if (m.id === home.id || m.by !== h.household || !m.at) continue;
        if ((m.kind === "sited" || m.kind === "parcel") && contains(hr, rect(m))) set.add(m.id);
      }
    }
    return set;
  }
  // the tier accent for any mark or within-node: green (home/sovereign) → blue
  // (constitution) → market (amber default). FOV marks lack a tier field, so look
  // the full mark up by id.
  function tierOf(m) {
    if (homeSet.has(m.id)) return "home";
    const full = byId.get(m.id) ?? m;
    if (full.sovereign) return "home";
    if (full.tier === "constitution") return "constitution";
    return "market";
  }
  function tierChip(tier) {
    if (tier === "constitution") return `<span class="wv-chip t-constitution">constitution</span>`;
    if (tier === "home") return `<span class="wv-chip t-home">home</span>`;
    return "";
  }

  // ───────── the telling view ─────────
  function chips(m) {
    const c = [];
    // how far, then which way. The band heads the section now, so the cell carries
    // what the heading no longer does — the mark's own bearing, both the word and
    // the short code the old heading showed (Keemin, 2026-07-27).
    const dist = m.far ? `~${Math.round((m.distM ?? 0) / 1000).toLocaleString()} km`
      : m.distM != null ? `${m.distM.toLocaleString()} m` : "";
    const brg = m.bearing
      ? `${esc(BEARING_LONG[m.bearing] ?? m.bearing)} <span class="bshort">${esc(m.bearing)}</span>` : "";
    c.push(`<span class="wv-chip">${esc(dist)}${dist && brg ? " · " : ""}${brg}</span>`);
    if (m.weight > 0) c.push(`<span class="wv-chip stamps">✦${m.weight}</span>`);
    if (m.signal) c.push(`<span class="wv-chip signal">its light carries</span>`);
    if (m.dim != null && m.dim < 1) c.push(`<span class="wv-chip dim">dim</span>`);
    if (m.aboveFogTarget) c.push(`<span class="wv-chip">above the fog</span>`);
    return c.join("");
  }
  // the FOOTPRINT indicator (Keemin 2026-07-23): coordinate dots say nothing about
  // how big a mark is — the-main-channel is 10^3× a bench. A log-scaled glyph rect
  // + a "w×h m" read gives each cell its size at a glance. Extent is the mark's
  // claim; a points: ring's bbox equals it (the honesty gate), so extent suffices.
  // Law/predicated cells carry no extent → no glyph.
  function extentTag(m) {
    const e = (byId.get(m.id) ?? m).extent;
    if (m.far || !e || !(e.w || e.h)) return "";
    const w = e.w ?? 0, h = e.h ?? 0, maxD = Math.max(w, h, 1);
    const box = 6 + Math.min(26, Math.log10(maxD + 1) * 8.5); // ~6px @1m … ~32px @~5km
    const gw = Math.max(2, box * (w / maxD)), gh = Math.max(2, box * (h / maxD));
    const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : Math.round(n));
    return `<span class="wv-extent" title="footprint ${w}×${h} m">`
      + `<svg width="${box.toFixed(0)}" height="${box.toFixed(0)}" viewBox="0 0 ${box.toFixed(1)} ${box.toFixed(1)}" aria-hidden="true">`
      + `<rect x="${((box - gw) / 2).toFixed(1)}" y="${((box - gh) / 2).toFixed(1)}" width="${gw.toFixed(1)}" height="${gh.toFixed(1)}" rx="1"/></svg>`
      + `<span class="wv-extent-t">${fmt(w)}×${fmt(h)} m</span></span>`;
  }
  // THE unified mark-cell — everything on the telling is one of these, and every
  // one names its mark id (Keemin 2026-07-23). role styles it (frame/ladder/law/fov);
  // tier colors it; annotation carries a mechanic's live state (fog/light this crossing).
  function markCell(m, { role = "fov", annotation = "", radialChips = false } = {}) {
    const tier = tierOf(m), far = !!m.far;
    const cluster = (role === "fov" && m.clusteredCount > 1)
      ? `<div class="wv-cluster">+${m.clusteredCount - 1} more of ${esc(m.household ?? "this household")}'s — investigate</div>` : "";
    return `<article class="wv-card ${role}${far ? " far" : ""} t-${tier}" data-id="${esc(m.id)}" role="button" tabindex="0">
      <div class="cbody">${esc(far ? (m.label ?? m.id) : (m.body ?? m.id))}</div>
      ${annotation ? `<div class="wv-cell-state">${esc(annotation)}</div>` : ""}
      <div class="cmeta">${tierChip(tier)}${extentTag(m)}${radialChips ? chips(m) : ""}<span class="wv-cid">${esc(m.id)}</span></div>
      ${cluster}
    </article>`;
  }
  // the mechanic's live state, reconstructed from the structured observer fields
  // (the engine's own airline/lightline logic — read, never re-run here).
  function lightStateLine(obs) {
    if (obs.inDarkness) return "The dark end of the world — the day is a rumor off to the northeast.";
    if (obs.lightLevel > 0.7) return "The northeast dawn-light is full on you here.";
    return "The light is going — the world's glow lives off to the northeast, dying toward the southwest.";
  }
  function elevStateLine(obs) {
    const g = obs.groundElevM;
    if (typeof g !== "number") return "";
    const rel = g >= 22 ? " — above the fog line" : g <= 1 ? " — down at the water" : "";
    return `The ground holds you at ${g >= 0 ? "+" : ""}${g} m above the sea${rel}; your eyes ride at ${obs.eyeElevM} m.`;
  }
  function fogStateLine(radial, obs) {
    if (obs.aboveFog) return "You are above the fog; the sightlines run long.";
    if (obs.inFog) return `Fog is in tonight (crossing ${radial.crossing}, thickness ${radial.fog.thickness}) — it closes the view to about ${(radial.sightReachM ?? 0).toLocaleString()} m.`;
    return `The air is clear (crossing ${radial.crossing}) — you can see about ${(radial.sightReachM ?? 0).toLocaleString()} m.`;
  }
  // keep: optional predicate — under the Mine filter, only cards whose mark passes
  // show (the telling stays otherwise identical: same order, same budget already
  // applied by the engine, same card behaviour — the filter only narrows WHO shows).
  function tellingCards(radial, keep = null) {
    const by = radial?.byBearing ?? {};
    // Distance orders the panel; bearing is a field on the cell (Keemin,
    // 2026-07-27) — the same restructure the prose telling carries, so the two
    // habitats never disagree about the world's shape. Regrouped from the band
    // each entry already names; byBearing is the wire shape and stays untouched.
    // (The map pane keeps the rose: there a bearing is geometry, not a heading.)
    const byBand = {};
    for (const group of Object.values(by))
      for (const [band, ms] of Object.entries(group ?? {})) (byBand[band] ??= []).push(...ms);
    // outward, in the engine's own band order
    const bandOrder = DIALS.distance_bands.map((d) => d.name);
    const keys = Object.keys(byBand).sort((a, b) => bandOrder.indexOf(a) - bandOrder.indexOf(b));
    let html = "";
    for (const band of keys) {
      let entries = byBand[band].sort((m, n) => (m.distM ?? 0) - (n.distM ?? 0));
      if (keep) entries = entries.filter(keep);
      if (!entries.length) continue;
      html += `<div class="wv-band"><h3>${esc(band)}</h3>`;
      for (const m of entries) html += markCell(m, { role: "fov", radialChips: true });
      html += `</div>`;
    }
    if (html) return html;
    return keep
      ? `<div class="wv-quiet">none of yours tells from here.</div>`
      : `<div class="wv-quiet">nothing tells from here — walk, or wait for clearer air.</div>`;
  }
  function tallies(radial) {
    const c = radial?.counts ?? {}, agg = radial?.aggregate ?? {}, parts = [];
    if (c.candidates != null) parts.push(`${c.shown ?? "?"} told of ${c.visible ?? "?"} in view (${c.candidates} in range)`);
    if (c.occluded) parts.push(`${c.occluded} behind the ground`);
    if (c.fogHidden) parts.push(`${c.fogHidden} lost to fog`);
    if (agg.hidden_by_budget) parts.push(`${agg.hidden_by_budget} more the eye doesn't sort out`);
    return parts.join(" · ");
  }
  // Is this mark one of the signed-in household's? (Wright's ruling: household ∈
  // whoami handles; we also match m.by so a mark you AUTHORED counts even if its
  // household field ever differs — reuses the read-fix's handles-set idea.)
  // Constitution is excluded from "Mine" unconditionally (Keemin, 2026-07-27):
  // the world's constitutional furniture belongs to the town, not to whichever
  // household happens to hold the-town's pen — even the founders'.
  function isMine(m) {
    // tierOf, never m.tier — FOV/radial marks carry no tier field, so the raw
    // read is silently undefined off the telling path (Jetto's pips lesson).
    if (tierOf(m) === "constitution") return false;
    const hs = state.whoami?.handles;
    if (!hs || !hs.length) return false;
    const set = hs instanceof Set ? hs : new Set(hs);
    return set.has(m.household) || set.has(m.by);
  }
  function renderTelling() {
    const box = $(root, ".wv-telling");
    const signedIn = (state.whoami?.handles ?? []).length > 0;
    const mine = signedIn && state.markFilter === "mine";
    try {
      const name = state.cam.x === 0 && state.cam.y === 0 ? "a spectator on the Town Centre quay" : "a spectator";
      const e = openYourEyes({ x: state.cam.x, y: state.cam.y, name }, world, { crossing: state.crossing, dials: state.dials, budget: state.dials.context_budget });
      lastRadial = e.radial;
      const within = e.radial.within ?? [];
      const obs = e.radial.observer ?? {};
      // the All / Mine filter — a signed-in affordance (keyless has no "mine").
      const chips = signedIn
        ? `<div class="wv-mfilter"><button class="wv-fchip${!mine ? " on" : ""}" data-mfilter="all">All</button><button class="wv-fchip${mine ? " on" : ""}" data-mfilter="mine">Mine</button></div>`
        : "";
      // 1. the containment ladder — where you STAND, the standpoint frame. Kept as
      // context even under Mine (filtering the frame to yours would usually empty
      // "where you stand"); the filter narrows the visible marks, not your footing.
      let ladder = "";
      // Under Mine the frame ladder shows only YOUR cells of the chain (your
      // parcel/home when standing in them) — the world-root/terrain/region are
      // constitution and stay out of Mine everywhere (Keemin, 2026-07-27; the
      // first fix missed this path: these cells rendered unconditionally).
      const chain = mine ? within.filter((w) => isMine(byId.get(w.id) ?? w)) : within;
      chain.forEach((w, i) => {
        const m = byId.get(w.id) ?? w;
        ladder += markCell(m, { role: i === 0 ? "frame" : "ladder", annotation: i === 0 ? lightStateLine(obs) : "" });
      });
      // 2. the world-law cells whose mechanic has live state this crossing. The
      // MARK governs its own telling: any world-law mark carrying a mechanic with
      // a registered teller speaks its live reading as a cell — fog is no longer
      // a special case, and giving a mechanic a voice is one line here (Keemin's
      // modularity, 2026-07-24 eve: the seam residents' own mechanics will use).
      const TELLERS = {
        elevation: () => elevStateLine(obs),
        fog: () => fogStateLine(e.radial, obs),
      };
      // World-law cells are the-town's (constitution) — skipped under Mine.
      if (!mine)
        for (const lm of world.marks.filter((m) => m.by === "the-town" && m.mechanic && TELLERS[m.mechanic]))
          ladder += markCell(lm, { role: "law", annotation: TELLERS[lm.mechanic]() });
      // 3. then the visible rest, outward by bearing — under Mine, only yours.
      box.innerHTML = chips
        + (ladder ? `<div class="wv-section-lbl">where you stand — the frame inward</div>`
                  + `<div class="wv-ladder-cells">${ladder}</div>` : "")
        + `<div class="wv-section-lbl">what tells from here${mine ? " · yours" : ""}</div>`
        + `<div class="wv-cards">${tellingCards(e.radial, mine ? isMine : null)}</div>`
        + `<div class="wv-tallies">${esc(tallies(e.radial))}</div>`;
      if (mine) renderMineTail(box, e.radial);  // elsewhere index + stakes, appended
      drawOverlay(e.radial);
    } catch (err) {
      box.innerHTML = `<div class="wv-err">the telling failed: ${esc(err?.message ?? err)}</div>`;
    }
  }
  // The Mine tail: your authored marks BEYOND this sight (a thin index — first
  // words + id + stand-there, no bodies/expansion), then the stakes section.
  function elsewhereRow(m) {
    const words = String(m.body ?? m.label ?? "").replace(/\s+/g, " ").trim().split(" ").slice(0, 12).join(" ");
    const standable = m.at && typeof m.at.x === "number";
    return `<div class="wv-elrow">
      <div class="wv-elwords">${words ? esc(words) : `<span class="wv-quiet">(no words)</span>`}</div>
      <div class="wv-elmeta"><span class="wv-cid">${esc(m.id)}</span>${standable ? `<span class="stand" data-x="${m.at.x}" data-y="${m.at.y}">stand here ▸</span>` : ""}</div>
    </div>`;
  }
  function renderMineTail(box, radial) {
    // which of your marks are already in sight (so "elsewhere" = the rest)
    const shown = new Set();
    (radial.within ?? []).forEach((w) => shown.add(w.id));
    const by = radial.byBearing ?? {};
    for (const b of Object.keys(by)) for (const m of Object.values(by[b]).flat()) shown.add(m.id);
    const yours = (world.marks ?? []).filter(isMine);
    const elsewhere = yours.filter((m) => m.id && !shown.has(m.id));
    const anyInView = yours.some((m) => shown.has(m.id));

    let tail = "";
    if (!anyInView && !elsewhere.length)
      tail += `<div class="wv-quiet wv-mine-empty">nothing of yours tells from here yet — leave_mark is coming.</div>`;
    if (elsewhere.length) {
      tail += `<div class="wv-section-lbl">elsewhere — ${elsewhere.length} of yours beyond this sight</div>`;
      tail += `<div class="wv-elsewhere">${elsewhere.map(elsewhereRow).join("")}</div>`;
    }
    // stakes — kept exactly as the retired My-marks tab had it: local-only,
    // feature-detected, single-holder. TODO(economy-home): the stakes/economy view
    // wants its own surface; it rides here for now (zero new surface, zero regression).
    tail += `<div class="wv-section-lbl">marks your stamps are staked on</div><div class="wv-stakes-slot"><div class="wv-quiet">checking the stamp-ledger…</div></div>`;
    const tailEl = document.createElement("div");
    tailEl.className = "wv-mine-tail";
    tailEl.innerHTML = tail;
    box.appendChild(tailEl);
    fillStakes(box);
  }
  async function fillStakes(box) {
    const h = (state.handle || "").trim();
    const slot = $(box, ".wv-stakes-slot");
    if (!slot) return;
    const local = await probeStakes();
    if (!local) { slot.innerHTML = `<div class="wv-quiet">the stakes view reads the town's stamp-ledger — a local-only feature; it isn't served on the public island.</div>`; return; }
    try {
      const r = await fetch(`/api/stakes?holder=${encodeURIComponent(h)}`);
      const d = await r.json();
      const stakes = d.stakes ?? [];
      if (!stakes.length) { slot.innerHTML = `<div class="wv-quiet">${esc(h)} holds no stakes on any mark yet (staking is first-class but rare so far).</div>`; return; }
      const byIdMap = new Map((world.marks ?? []).map((m) => [m.id, m]));
      slot.innerHTML = stakes.map((s) => {
        const m = byIdMap.get(s.mark);
        return `<div class="wv-elrow"><div class="wv-elwords">${esc(m?.body ?? "(a mark not in the current fold)")}</div>
          <div class="wv-elmeta"><span class="wv-chip stamps">${s.n > 0 ? "+" : ""}${s.n} staked</span><span class="wv-cid">${esc(s.mark)}</span>${m?.at ? `<span class="stand" data-x="${m.at.x}" data-y="${m.at.y}">stand here ▸</span>` : ""}</div></div>`;
      }).join("");
    } catch (e) { slot.innerHTML = `<div class="wv-err">stakes failed: ${esc(e?.message ?? e)}</div>`; }
  }

  // ───────── investigate (in-place expansion inside a card) ─────────
  const tnode = (n, cls) => `<div class="wv-tnode ${cls}" data-id="${esc(n.id)}" role="button" tabindex="0">
      <div class="tbody">${n.slot ? `<span class="wv-tslot">${esc(n.slot)}:</span> <b>${esc(n.value ?? "")}</b> — ` : ""}${esc(n.body ?? "")}</div>
      <div class="cmeta">${n.stamps > 0 ? `<span class="wv-chip stamps">✦${n.stamps}</span>` : ""}<span class="wv-cid">${esc(n.id)}</span></div>
    </div>`;
  // one container in the upward-context line: its short name, drillable like a
  // tree node, with the household after it so "whose" is answered in place.
  const wnode = (w) => `<span class="wv-wnode" data-id="${esc(w.id)}" role="button" tabindex="0">${esc(firstWords(w.body, 6) || w.id)}</span>`
    + (w.household ? ` <span class="wv-quiet">· ${esc(w.household)}</span>` : "");
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
      ${d.within?.length ? `<div class="wv-within"><span class="lbl">sits inside</span> ${d.within.map(wnode).join(' <span class="wv-quiet">‹</span> ')}</div>` : ""}
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
      // FOOTPRINTS (Keemin 2026-07-23): in grid-true a mark renders as its CLAIM
      // at true scale — an at-centred extent rect (or its points: ring polygon),
      // outlined + translucent so overlaps read, tier-coloured. The main channel
      // reads as the long band it is; a bench is a speck. Below ~5px it collapses
      // to a dot. Marks that CONTAIN the viewer are the nested frames already —
      // skip them here (this is for the non-containing marks in view).
      const withinIds = new Set(within.map((w) => w.id));
      for (const m of carried) {
        if (withinIds.has(m.id)) continue;
        const full = byId.get(m.id) ?? m;
        const w = full.extent?.w ?? 0, h = full.extent?.h ?? 0;
        const cls = `t-${tierOf(m)}${m.signal ? " sig" : ""}`;
        const title = `<title>${esc(m.id)} — ${esc(firstWords(m.body, 12))}</title>`;
        const c = px(full.at.x, full.at.y);
        const ring = Array.isArray(full.points) && full.points.length >= 3 ? full.points : null;
        if (Math.max(w, h) * sc < 5 && !ring) {                       // too small at this scale → a dot
          const r = m.signal ? 6 : 3.5 + Math.min(5, Math.log1p(m.weight || 0) * 1.8);
          svg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${r.toFixed(1)}" class="wv-pip ${cls}" data-id="${esc(m.id)}">${title}</circle>`;
        } else if (ring) {                                            // the authored shape, claim-true
          const pts = ring.map((v) => { const q = px(Array.isArray(v) ? v[0] : v.x, Array.isArray(v) ? v[1] : v.y); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ");
          svg += `<polygon points="${pts}" class="wv-foot ${cls}" data-id="${esc(m.id)}">${title}</polygon>`;
        } else {                                                      // the extent rect, at true scale
          const a = px(full.at.x - w / 2, full.at.y - h / 2), b = px(full.at.x + w / 2, full.at.y + h / 2);
          svg += `<rect x="${Math.min(a.x, b.x).toFixed(1)}" y="${Math.min(a.y, b.y).toFixed(1)}" width="${Math.abs(b.x - a.x).toFixed(1)}" height="${Math.abs(b.y - a.y).toFixed(1)}" rx="1" class="wv-foot ${cls}" data-id="${esc(m.id)}">${title}</rect>`;
        }
        const lx = c.x + (c.x > C ? -7 : 7), anchor = c.x > C ? "end" : "start";
        svg += `<text x="${lx.toFixed(1)}" y="${(c.y - 6).toFixed(1)}" text-anchor="${anchor}" class="wv-plabel">${esc(shortLabel(m))}</text>`;
      }
      svg += `<circle cx="${C}" cy="${C}" r="26" class="wv-you-halo"/><circle cx="${C}" cy="${C}" r="6" class="wv-you"/>`;
      const canvas = `<div class="wv-canvas"><svg viewBox="0 0 ${VB} ${VB}" preserveAspectRatio="xMidYMid meet">${svg}</svg></div>`;
      // nest the canvas inside the containment ladder (root outermost)
      let nested = canvas;
      for (let i = within.length - 1; i >= 0; i--) {
        const w = within[i];
        const isRoot = i === 0;
        nested = `<div class="wv-ladder t-${tierOf(w)}${isRoot ? " root" : ""}"><div class="lname" title="${esc(w.id)}">${esc(firstWords(w.body, 7) || w.id)}</div>${nested}</div>`;
      }
      box.innerHTML = `<div class="wv-gridwrap">${nested}
        <div class="wv-gridnote">you stand at the centre; each point is a mark in its true bearing and distance. The nested frames are what you stand <b>within</b> — the outermost is the world itself, the innermost the smallest thing that contains you. Click a point to investigate.</div></div>`;
      drawOverlay(e.radial); // the painting tracks the camera in grid mode too (the bug: it never did)
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
  // (the standalone "My marks" view retired 2026-07-24 — it fused into the telling
  // as the All / Mine filter; its content now lives in renderTelling's Mine tail.
  // probeStakes above still feeds the stakes section there.)

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
      // the survey grid — the FIRST derived layer: drawn from the registration
      // (origin + scale), never traced from the paint. Sits under the overlay.
      const gridLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gridLayer.setAttribute("id", "wv-grid-layer");
      gridLayer.style.display = "none"; // NOT the hidden attribute — SVG <g> ignores it
      svg.appendChild(gridLayer);
      // footprints — the second derived layer: every mark's true extent, from the
      // record. Sits above the grid, under the pips; pointer-events none so the
      // stand-click and drag pass straight through it.
      const fpLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      fpLayer.setAttribute("id", "wv-fp-layer");
      fpLayer.style.display = "none";
      svg.appendChild(fpLayer);
      const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.setAttribute("id", "wv-overlay");
      svg.appendChild(overlay);
      // a dedicated highlight layer, above the overlay — a hovered/clicked mark
      // washes blue on the painting (viewer↔atlas linkage). Kept separate so the
      // per-render overlay redraw never wipes it.
      const hlLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      hlLayer.setAttribute("id", "wv-hl-layer");
      svg.appendChild(hlLayer);
      boxEl.innerHTML = ""; boxEl.appendChild(svg);
      boxEl.classList.add("pannable");

      // ── the viewport (P2 convergence): the viewBox IS the camera — wheel zooms
      // toward the cursor, drag pans, a short press stands you there, follow keeps
      // the view on your standpoint. Google-maps physics, zero libraries.
      let vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
        const bb = svg.getBBox();
        vb = [bb.x, bb.y, bb.width, bb.height];
      }
      const full = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
      const view = { ...full };
      mapCtx = { svg, overlay, hlLayer, gridLayer, originPx, mPerPx, full, view, zoomK: 1, follow: false, hlId: null, _tweening: false };
      let tween = null;
      function applyView() {
        svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
        mapCtx.zoomK = full.w / view.w;
        sizeGridLabels();
        if (lastRadial) drawOverlay(lastRadial);
        if (mapCtx.hlId) highlightOnMap(mapCtx.hlId);
      }
      function stopTween() { if (tween) { cancelAnimationFrame(tween); tween = null; } mapCtx._tweening = false; }
      function tweenTo(target, ms = 280) {
        stopTween(); mapCtx._tweening = true;
        const from = { ...view }, t0 = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms), k = ease(t);
          view.x = from.x + (target.x - from.x) * k; view.y = from.y + (target.y - from.y) * k;
          view.w = from.w + (target.w - from.w) * k; view.h = from.h + (target.h - from.h) * k;
          applyView();
          if (t < 1) tween = requestAnimationFrame(step); else { tween = null; mapCtx._tweening = false; }
        })(t0);
      }
      const camPx = () => ({ x: originPx.x + state.cam.x / mPerPx, y: originPx.y + state.cam.y / mPerPx });
      mapCtx.lockOn = (animate = true) => {
        const c = camPx();
        const w = Math.min(view.w, full.w / 4), h = w * (full.h / full.w);
        // Centre the dot in the VISIBLE panel, not in the <svg>. The painting
        // keeps the map's own aspect (tall), the pane is shorter, and
        // .wv-minimap clips the overflow — so the svg's midpoint sits well
        // below the middle of what the reader can actually see, by an amount
        // that changes with the window. That was the "follow doesn't really
        // centre" defect: the arithmetic was right about the wrong rectangle.
        // Measured live, so it stays true at any size and needs no constant.
        const sb = svg.getBoundingClientRect(), cb = boxEl.getBoundingClientRect();
        const ax = sb.width > 0 ? (cb.x + cb.width / 2 - sb.x) / sb.width : 0.5;
        const ay = sb.height > 0 ? (cb.y + cb.height / 2 - sb.y) / sb.height : 0.5;
        const target = { x: c.x - w * ax, y: c.y - h * ay, w, h };
        // Compare against the target we actually want, not against the viewBox
        // centre — the old test could return "close enough" while the dot sat
        // off the visible centre by the clip offset.
        if (Math.abs(target.x - view.x) < view.w * 0.005 && Math.abs(target.y - view.y) < view.h * 0.005
            && Math.abs(w - view.w) < full.w * 0.01) return;
        if (animate) tweenTo(target); else { Object.assign(view, target); applyView(); }
      };
      mapCtx.fitAll = () => { mapCtx.follow = false; $(root, ".wv-map-follow")?.classList.remove("on"); tweenTo({ ...full }); };
      // a hand on the camera breaks the follow snap — silently, keeping the view
      // where the hand put it (fit is the only thing that zooms you back out)
      const breakFollow = () => { if (mapCtx.follow) { mapCtx.follow = false; $(root, ".wv-map-follow")?.classList.remove("on"); } };
      svg.addEventListener("wheel", (e) => {
        e.preventDefault(); stopTween(); breakFollow();
        const k = Math.pow(1.0015, e.deltaY);
        const w = Math.min(full.w * 1.1, Math.max(full.w / 24, view.w * k));
        const scale = w / view.w;
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        view.x = p.x - (p.x - view.x) * scale; view.y = p.y - (p.y - view.y) * scale;
        view.w = w; view.h = view.h * scale;
        applyView();
      }, { passive: false });
      // drag = pan; a press that travels <6px = the stand-here click (both live on
      // one pointer stream so neither steals the other)
      let press = null;
      svg.addEventListener("pointerdown", (e) => {
        stopTween();
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener("pointermove", (e) => {
        if (!press || e.pointerId !== press.id) return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) < 6) return;
        if (!press.moved) breakFollow(); // a real drag unlocks the snap; a stand-click doesn't
        press.moved = true; boxEl.classList.add("panning");
        const r = svg.getBoundingClientRect();
        view.x -= dx * (view.w / r.width); view.y -= dy * (view.h / r.height);
        press.x = e.clientX; press.y = e.clientY;
        applyView();
      });
      svg.addEventListener("pointerup", (e) => {
        if (!press || e.pointerId !== press.id) return;
        const wasDrag = press.moved; press = null; boxEl.classList.remove("panning");
        if (wasDrag) return;
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        state.cam = { x: Math.round((p.x - originPx.x) * mPerPx), y: Math.round((p.y - originPx.y) * mPerPx) };
        renderCurrent();
      });
      svg.addEventListener("pointercancel", () => { press = null; boxEl.classList.remove("panning"); });

      // the grid: 1 km lines, 5 km majors, labelled in the town's own directions
      // (x grows east, y grows south; 0 is Ferry's crossing)
      function gridLabel(m, ew) {
        if (m === 0) return "⌖ 0";
        const n = Math.abs(m) / 1000;
        return ew ? `${n} km ${m > 0 ? "E" : "W"}` : `${n} km ${m > 0 ? "S" : "N"}`;
      }
      function buildGridLayer() {
        const mx0 = (full.x - originPx.x) * mPerPx, mx1 = (full.x + full.w - originPx.x) * mPerPx;
        const my0 = (full.y - originPx.y) * mPerPx, my1 = (full.y + full.h - originPx.y) * mPerPx;
        const step = 1000, major = 5000;
        let s = "";
        for (let m = Math.ceil(mx0 / step) * step; m <= mx1; m += step) {
          const x = originPx.x + m / mPerPx, big = m % major === 0;
          s += `<line x1="${x}" y1="${full.y}" x2="${x}" y2="${full.y + full.h}" class="wv-gridline${big ? " major" : ""}"/>`;
          if (big) s += `<text x="${x + 4}" y="${full.y + 26}" class="wv-gridlbl" data-gl>${gridLabel(m, true)}</text>`;
        }
        for (let m = Math.ceil(my0 / step) * step; m <= my1; m += step) {
          const y = originPx.y + m / mPerPx, big = m % major === 0;
          s += `<line x1="${full.x}" y1="${y}" x2="${full.x + full.w}" y2="${y}" class="wv-gridline${big ? " major" : ""}"/>`;
          if (big) s += `<text x="${full.x + 6}" y="${y - 5}" class="wv-gridlbl" data-gl>${gridLabel(m, false)}</text>`;
        }
        gridLayer.innerHTML = s;
        sizeGridLabels();
      }
      function sizeGridLabels() {
        const fs = Math.max(11, 22 / Math.sqrt(mapCtx.zoomK || 1));
        gridLayer.querySelectorAll("[data-gl]").forEach((t) => t.setAttribute("font-size", fs));
      }
      mapCtx.toggleGrid = () => {
        if (!gridLayer.childNodes.length) buildGridLayer();
        const on = gridLayer.style.display === "none";
        gridLayer.style.display = on ? "" : "none";
        return on;
      };

      // footprints: rects centered on at, sized by extent — the record's own
      // geometry landing on the painting (the calibration made visible). The
      // world-root (the frame) and far/horizon objects are skipped: no ground.
      function buildFpLayer() {
        let s = "";
        for (const m of world.marks ?? []) {
          if (!m.at || !m.extent || m.far) continue;
          if (m.id === "the-town/let-there-be-light") continue;
          const w = m.extent.w / mPerPx, h = m.extent.h / mPerPx;
          const x = originPx.x + m.at.x / mPerPx - w / 2, y = originPx.y + m.at.y / mPerPx - h / 2;
          const cls = (m.kind === "parcel" ? "t-home fp-parcel" : `t-${tierOf(m)}`) + (m.mechanic ? " mech" : "");
          s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" data-id="${esc(m.id)}" class="wv-fp ${cls}"><title>${esc(m.id)}</title></rect>`;
        }
        fpLayer.innerHTML = s;
        if (lastRadial) mapCtx.syncWithin(lastRadial);
      }
      // the standpoint's containment chain reads heavier on the map — kept in sync
      // with every telling (the boxes are the same boxes, only the weight moves)
      mapCtx.syncWithin = (radial) => {
        const ids = new Set((radial?.within ?? []).map((w) => w.id));
        for (const r of fpLayer.querySelectorAll("rect[data-id]"))
          r.classList.toggle("fp-within", ids.has(r.dataset.id));
      };
      mapCtx.toggleFp = () => {
        if (!fpLayer.childNodes.length) buildFpLayer();
        const on = fpLayer.style.display === "none";
        fpLayer.style.display = on ? "" : "none";
        return on;
      };

      applyView();
      if (lastRadial) drawOverlay(lastRadial);
    } catch (e) {
      boxEl.innerHTML = `<div class="loading">the painting didn't load (${esc(e.message)}) — the telling still works</div>`;
    }
  }
  function drawOverlay(radial) {
    if (!mapCtx) return;
    const { overlay, originPx, mPerPx } = mapCtx;
    // markers shrink gently as the camera closes in, so a zoomed street never
    // drowns under full-map-sized pips (the reach ring stays true-scale — it IS a distance)
    const k = Math.max(1, Math.sqrt(mapCtx.zoomK || 1));
    const px = (m) => ({ x: originPx.x + m.x / mPerPx, y: originPx.y + m.y / mPerPx });
    const me = px(state.cam), reachPx = (radial?.sightReachM ?? 0) / mPerPx;
    let s = `<circle cx="${me.x}" cy="${me.y}" r="${reachPx}" class="ov-reach"/>`;
    for (const bands of Object.values(radial?.byBearing ?? {}))
      for (const arr of Object.values(bands))
        // tierOf, not m.tier: FOV marks carry no tier field, so it looks the full
        // mark up by id (and catches sovereign/home, which is not a tier value).
        for (const m of arr) { if (!m.at || typeof m.at.x !== "number") continue; const p = px(m.at); s += `<circle cx="${p.x}" cy="${p.y}" r="${11 / k}" class="ov-pip t-${tierOf(m)}"><title>${esc(m.id)}</title></circle>`; }
    s += `<circle cx="${me.x}" cy="${me.y}" r="${17 / k}" class="ov-dot"/><circle cx="${me.x}" cy="${me.y}" r="${36 / k}" class="ov-halo"/>`;
    overlay.innerHTML = s;
    mapCtx.syncWithin?.(radial);
    if (mapCtx.follow && mapCtx.lockOn && !mapCtx._tweening) mapCtx.lockOn();
  }
  // wash a mark blue on the painting — a soft glow at its position (cheap and it
  // reads); null clears. Points-ring/extent could be washed as a shape later, but
  // a glow at the at-point is the "SUPER cool if not too hard" that stays cheap.
  function highlightOnMap(id) {
    if (!mapCtx?.hlLayer) return;
    mapCtx.hlId = id || null;
    const m = id && byId.get(id);
    if (!m?.at) { mapCtx.hlLayer.innerHTML = ""; return; }
    const k = Math.max(1, Math.sqrt(mapCtx.zoomK || 1));
    const t = tierOf(m), mech = m.mechanic ? " mech" : "";
    const p = { x: mapCtx.originPx.x + m.at.x / mapCtx.mPerPx, y: mapCtx.originPx.y + m.at.y / mapCtx.mPerPx };
    // the box AND the dot light together, in the mark's own tier color — the same
    // sentence the cells speak (dashed = machinery-kept truth)
    let s = "";
    if (m.extent && !m.far && m.id !== "the-town/let-there-be-light") {
      const w = m.extent.w / mapCtx.mPerPx, h = m.extent.h / mapCtx.mPerPx;
      s += `<rect x="${p.x - w / 2}" y="${p.y - h / 2}" width="${w}" height="${h}" class="wv-hl-box t-${t}${mech}"/>`;
    }
    s += `<circle cx="${p.x}" cy="${p.y}" r="${14 / k}" class="wv-hl-dot t-${t}"/>`;
    mapCtx.hlLayer.innerHTML = s;
  }

  // ───────── dev pane ─────────
  function buildDevPane() {
    const dev = $(root, ".wv-dev");
    dev.innerHTML = `<div class="devnote">live engine dials — re-tells on change; never mutates the module, never re-folds.</div>`
      + `<div class="dial cross"><label>crossing (time-travel) <b class="crossovlbl">${state.crossingOverride ? state.crossing : "live · " + state.crossing}</b></label>
          <div class="crossrow"><input class="num crossover" type="number" min="0" value="${state.crossing}"><button class="ctl crosslive" title="return to the live crossing">⤺ live</button></div></div>`
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
    const cn = $(root, ".crossnow");
    if (cn) cn.innerHTML = state.crossingOverride
      ? `crossing <b>${state.crossing}</b> <span class="wv-quiet">· time-travelling</span>`
      : `crossing <b>${state.crossing}</b> <span class="crosslive-tag">· live</span>`;
    if (state.view === "telling") renderTelling();
    else if (state.view === "grid") renderGrid();
    if (!mapCtx) loadMinimap();
  }
  // a re-render that the world does TO the viewer, not the viewer to itself: it must
  // preserve where you stand, your step, mode, dials, and scroll (Wright's hard UX
  // constraint — the world updates around you, you are never yanked). A quiet toast
  // names what moved.
  let movedTimer = null;
  function reRender(note) {
    const y = window.scrollY;
    renderCurrent();
    window.scrollTo(0, y);
    if (!note) return;
    let el = $(root, ".wv-moved");
    if (!el) { el = document.createElement("div"); el.className = "wv-moved"; $(root, ".wv-view").prepend(el); }
    el.textContent = `the world moved — ${note}`;
    el.classList.add("show");
    clearTimeout(movedTimer); movedTimer = setTimeout(() => el.classList.remove("show"), 6000);
  }
  function switchView(v) {
    state.view = v;
    for (const t of root.querySelectorAll(".wv-tabs .tab")) t.classList.toggle("on", t.dataset.view === v);
    $(root, ".wv-telling").hidden = v !== "telling";
    $(root, ".wv-grid").hidden = v !== "grid";
    renderCurrent();
  }

  // ───────── events ─────────
  let devTimer = null;
  root.addEventListener("click", (e) => {
    const tab = e.target.closest(".wv-tabs .tab");
    if (tab) { switchView(tab.dataset.view); return; }
    // the viewport controls (P2): fit / follow / grid
    if (e.target.closest(".wv-map-home")) { mapCtx?.fitAll?.(); return; }
    const fbtn = e.target.closest(".wv-map-follow");
    if (fbtn) { if (!mapCtx) return; mapCtx.follow = !mapCtx.follow; fbtn.classList.toggle("on", mapCtx.follow); if (mapCtx.follow) mapCtx.lockOn(); return; }
    const gbtn = e.target.closest(".wv-map-grid");
    if (gbtn) { if (!mapCtx?.toggleGrid) return; gbtn.classList.toggle("on", !!mapCtx.toggleGrid()); return; }
    const fpbtn = e.target.closest(".wv-map-fp");
    if (fpbtn) { if (!mapCtx?.toggleFp) return; fpbtn.classList.toggle("on", !!mapCtx.toggleFp()); return; }
    // the fused left-pane filter: All / Mine — re-tell in place, keep the scroll.
    const fchip = e.target.closest(".wv-fchip");
    if (fchip) { state.markFilter = fchip.dataset.mfilter; const y = window.scrollY; renderTelling(); window.scrollTo(0, y); return; }
    // (key sign-in UI removed 2026-07-24 — identity comes from the island's
    // GitHub pill via the pm_key bridge; the viewer collects no credentials)
    // investigate: back-crumb / tree node / card
    const back = e.target.closest(".wv-back");
    if (back) { const card = back.closest(".wv-card"); card._stack.pop(); renderExpansion(card); return; }
    const tn = e.target.closest(".wv-tnode, .wv-wnode"); // upward-context names drill too
    if (tn) { const card = tn.closest(".wv-card"); if (card && tn.dataset.id) { card._stack.push(tn.dataset.id); renderExpansion(card); } return; }
    // grid pip → investigate in a floating card is overkill; jump to telling+expand
    const pip = e.target.closest(".wv-pip");
    if (pip && pip.dataset.id) { switchView("telling"); queueMicrotask(() => openCardById(pip.dataset.id)); return; }
    const stand = e.target.closest(".stand");
    if (stand) { state.cam = { x: +stand.dataset.x, y: +stand.dataset.y }; switchView("telling"); return; }
    if (e.target.closest(".wv-dev-toggle")) { const dev = $(root, ".wv-dev"); dev.hidden = !dev.hidden; if (!dev.dataset.built) { buildDevPane(); dev.dataset.built = "1"; } return; }
    if (e.target.closest(".wv-dev-reset")) { state.dials = { ...DIALS }; buildDevPane(); renderCurrent(); return; }
    if (e.target.closest(".crosslive")) { state.crossingOverride = false; state.crossing = liveCrossing(); const i = root.querySelector(".crossover"); if (i) i.value = state.crossing; const l = root.querySelector(".crossovlbl"); if (l) l.textContent = "live · " + state.crossing; reRender(); return; }
    const b = e.target.closest("button.ctl, .wv-card");
    if (!b) return;
    if (b.dataset.x !== undefined && b.classList.contains("ctl")) { state.cam = { x: +b.dataset.x, y: +b.dataset.y }; renderCurrent(); }
    else if (b.dataset.dx !== undefined) { state.cam.x += (+b.dataset.dx) * state.step; state.cam.y += (+b.dataset.dy) * state.step; renderCurrent(); }
    else if (b.classList.contains("wv-card") && b.dataset.id) { if (b._stack?.length) { b._stack = []; renderExpansion(b); } else { b._stack = [b.dataset.id]; renderExpansion(b); } }
  });
  function openCardById(id) {
    const card = [...root.querySelectorAll(".wv-card")].find((c) => c.dataset.id === id);
    if (card) { card._stack = [id]; renderExpansion(card); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  // hover any mark surface (a telling card, a grid footprint/pip) → wash it on the
  // painting; leaving clears. mouseover fires on every element enter, so the closest
  // [data-id] is always the right answer without flicker.
  root.addEventListener("mouseover", (e) => { const el = e.target.closest("[data-id]"); highlightOnMap(el?.dataset.id ?? null); });
  root.addEventListener("mouseleave", () => highlightOnMap(null));
  root.addEventListener("input", (e) => {
    if (e.target.classList.contains("stepslider")) { state.step = STEP_NOTCHES[Number(e.target.value)] ?? state.step; const lbl = root.querySelector(".stepval"); if (lbl) lbl.textContent = stepLabel(state.step); return; }
    if (e.target.classList.contains("crossover")) {
      const v = String(e.target.value).trim();
      if (v === "") { state.crossingOverride = false; state.crossing = liveCrossing(); }
      else { state.crossingOverride = true; state.crossing = Math.max(0, Number(v) || 0); }
      const lbl = root.querySelector(".crossovlbl"); if (lbl) lbl.textContent = state.crossingOverride ? state.crossing : "live · " + state.crossing;
      reRender(); return;
    }
    const dial = e.target.dataset?.dial;
    if (dial) {
      state.dials = { ...state.dials, [dial]: Number(e.target.value) };
      const out = root.querySelector(`[data-out="${dial}"]`); if (out) out.textContent = fmt(state.dials[dial]);
      clearTimeout(devTimer); devTimer = setTimeout(renderCurrent, 70);
    }
  });

  // identity (Keemin 2026-07-23): one keyless /api/ops/whoami read powers two
  // read-side behaviours. It reflects the session (an oauth cookie or a key), so:
  //   • dev-dials gate — dials shown only on localhost or for the principal;
  //   • stand-at filter — a signed-in resident's "Stand at" lists only THEIR
  //     household's homes (filtered client-side from the manifest the viewer already
  //     has); keyless spectators get the default presets, unchanged.
  // the resident's key — held per-origin in localStorage, presented as a Bearer on
  // the credentialed reads (whoami). A browser visitor is keyless until they sign
  // in; an oauth cookie also identifies them (whoami reads either). Clearing the
  // key returns to keyless spectator. THIS is what was missing live — the viewer
  // fetched whoami with no credential, so every visitor read as keyless.
  const pmKey = () => { try { return localStorage.getItem("pm_key") || null; } catch { return null; } };
  const authHeaders = () => { const k = pmKey(); return k ? { Authorization: "Bearer " + k } : {}; };
  async function resolveIdentity() {
    try { const r = await fetch("/api/ops/whoami", { headers: authHeaders() }); state.whoami = r.ok ? await r.json() : null; } catch { state.whoami = null; }
    const toggle = $(root, ".wv-dev-toggle");
    if (toggle) toggle.hidden = !(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || state.whoami?.principal);
    // keep state.handle valid (the stakes section's holder); no "mine" when signed out.
    const handles = state.whoami?.handles ?? [];
    if (handles.length && !handles.includes(state.handle)) state.handle = handles[0];
    if (!handles.length) state.markFilter = "all";
    renderPresets();
    renderIdentity();
    if (state.view === "telling") renderTelling(); // the chips + filter reflect the new identity
  }
  // the sign-in affordance — signed out: a key field (localStorage); signed in: who
  // you are + sign out. Unobtrusive, top of the nav.
  function renderIdentity() {
    // Key-paste sign-in REMOVED from the UI (Keemin 2026-07-24 eve) — identity
    // arrives via the island's GitHub sign-in (the bridge fills pm_key) or, in
    // dev, by setting localStorage directly. The viewer only *displays* who you
    // are; it no longer collects credentials, and sign-out lives with the pill.
    const box = $(root, ".wv-identity");
    if (!box) return;
    const handles = state.whoami?.handles ?? [];
    box.innerHTML = handles.length
      ? `<div class="wv-id-in">signed in — <b>${handles.map(esc).join(", ")}</b></div>`
      : "";
  }
  function renderPresets() {
    const box = $(root, ".presets");
    if (!box) return;
    const handles = new Set(state.whoami?.handles ?? []);
    let list = PRESETS;
    if (handles.size && data?.manifest?.homes) {
      const homes = data.manifest.homes
        .filter((h) => handles.has(h.household) && h.grid_m)
        .map((h) => ({ x: h.grid_m.x, y: h.grid_m.y, label: h.title ?? `${h.household}/${h.home_id}` }));
      if (homes.length) list = homes; // your own homes; keyless keeps the defaults
    }
    box.innerHTML = list.map((p) => `<button class="ctl" data-x="${p.x}" data-y="${p.y}">${esc(p.label)}</button>`).join("");
  }

  // ───────── the ambient clock (crossing rollover + auto-update) ─────────
  // The world updates AROUND the viewer. Every 30 s: roll the live crossing over a
  // boundary (fog reseeds → the weather visibly changes), and — on the office-live
  // source only — every other tick (~60 s) compare the fold's X-Postmark-As-Of and
  // re-tell if the record advanced. On /WORLD or RAW we don't poll (don't hammer a
  // CDN / GitHub). Every re-tell preserves standpoint / step / mode / dials / scroll.
  let lastLive = liveCrossing(), tick = 0;
  const clock = setInterval(async () => {
    tick++;
    const nl = liveCrossing();
    if (nl !== lastLive) { lastLive = nl; if (!state.crossingOverride) { state.crossing = nl; reRender(`crossing ${nl}`); } }
    if (tick % 2 === 0 && data && isOfficeLive(state.dataSource)) {
      try {
        const r = await fetch(state.dataSource);
        const asOf = r.headers.get("x-postmark-as-of");
        if (r.ok && asOf && asOf !== state.asOf) {
          const json = await r.json();
          state.asOf = asOf; data.worldState = json;
          world = assembleWorld({ worldState: json, skeleton: data.skeleton });
          byId = new Map(world.marks.map((m) => [m.id, m]));
          homeSet = buildHomeSet(data.manifest, world.marks);
          reRender("the record advanced");
        }
      } catch { /* a poll miss is silent — the last good fold stands */ }
    }
  }, 30000);

  // ───────── boot ─────────
  (async () => {
    try {
      await loadData();
      renderCurrent();
      resolveIdentity(); // after data (the presets filter reads the manifest)
    } catch (err) {
      $(root, ".wv-telling").innerHTML = `<div class="wv-err">could not load the world record: ${esc(err?.message ?? err)}</div>`;
    }
  })();

  return { rerender: renderCurrent, stop: () => clearInterval(clock) };
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
