// viewer.mjs — THE told-world viewer, one module for both surfaces.
//
// This is the single implementation (Keemin, 2026-07-23: the local build is THE
// one viewer; the site serves this same file as a standalone island). It owns the
// markup, the styles, and every interaction; the host page is a thin shell that
// calls `mountViewer(appEl)`. It computes the field of view CLIENT-SIDE from the
// town's public record. Signed-in acts still cross the office door: this module
// previews the exact intent, then sends one credentialed request on confirmation.
//
// It runs in two habitats and feature-detects which without a config flag:
//   • LOCAL (spectator/server.mjs)  — /WORLD/*.json off disk, /api/walks live,
//     /atlas/* proxied to postmark.town. Signed-in controls feature-detect off.
//   • ISLAND (postmark.town/world)  — world-state/skeleton from raw.githubusercontent,
//     /atlas same-origin, with signed-in acts crossing the same-origin office.
//
// One engine, imported the clone's way (relative into the package): the browser
// runs the exact library anyone can `node`. If this page and a clone disagree,
// the office has explaining to do.
import { orient, openYourEyes, investigate, containmentChain } from "../tools/world-verbs.mjs";
import { assembleWorld } from "../tools/world-build.mjs";
import { DIALS, bearingDeg, quantizeBearing } from "../tools/world-engine.mjs";
import { marksContain, pointInPolygon, pointInRect, polygonOf, rect } from "../tools/geometry.mjs"; // read-only: home color + point-destination labels
import { markClass } from "../tools/mark-class.mjs"; // the ONE class rule: in a parcel's directory → home
import { fractionalCrossing, positionAt } from "../tools/walk.mjs";
import { crossingsOnSegment } from "../tools/water.mjs";

const RAW = "https://raw.githubusercontent.com/keeminlee/postmark-world/main";
const $ = (root, s) => root.querySelector(s);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const OFFICE_DEFAULT = "/api";
const ACT_AS_KEY = "pm.world.act_as";
const WORLD_ROOT_ID = "the-town/let-there-be-light";

const markIndex = (marks) => marks instanceof Map
  ? marks
  : new Map((marks ?? []).filter((mark) => mark?.id).map((mark) => [mark.id, mark]));

export function isEmbodiedMark(mark) {
  const w = Number(mark?.extent?.w), h = Number(mark?.extent?.h);
  return (mark?.kind === "sited" || mark?.kind === "parcel")
    && [mark?.at?.x, mark?.at?.y, w, h].every(Number.isFinite)
    && w > 0 && h > 0;
}

export function isAmbientMark(mark, marks = []) {
  if (!mark) return false;
  if (mark.id === WORLD_ROOT_ID) return true;
  if (mark.kind !== "predicated" && mark.kind !== "naming") return false;
  const byMarkId = markIndex(marks);
  const seen = new Set([mark.id]);
  let parentId = mark.parent;
  while (parentId && !seen.has(parentId)) {
    if (parentId === WORLD_ROOT_ID) return true;
    seen.add(parentId);
    const parent = byMarkId.get(parentId);
    if (!parent) return true;
    if (isEmbodiedMark(parent)) return false;
    parentId = parent.parent;
  }
  return true;
}

export function nearestEmbodiedAncestor(mark, marks = []) {
  if (!mark || isAmbientMark(mark, marks)) return null;
  if (isEmbodiedMark(mark)) return mark;
  const byMarkId = markIndex(marks);
  const seen = new Set([mark.id]);
  let parentId = mark.parent;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byMarkId.get(parentId);
    if (!parent || isAmbientMark(parent, byMarkId)) return null;
    if (isEmbodiedMark(parent)) return parent;
    parentId = parent.parent;
  }
  return null;
}

const viewportBounds = (viewport) => {
  const minX = Number(viewport?.minX ?? viewport?.x);
  const minY = Number(viewport?.minY ?? viewport?.y);
  const maxX = Number(viewport?.maxX ?? (minX + Number(viewport?.w)));
  const maxY = Number(viewport?.maxY ?? (minY + Number(viewport?.h)));
  return { minX, minY, maxX, maxY };
};

const pointInBounds = (point, bounds) =>
  point.x >= bounds.minX && point.x <= bounds.maxX
  && point.y >= bounds.minY && point.y <= bounds.maxY;

const orient2d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const segmentsIntersect = (a, b, c, d) => {
  const abC = orient2d(a, b, c), abD = orient2d(a, b, d);
  const cdA = orient2d(c, d, a), cdB = orient2d(c, d, b);
  return (abC === 0 && pointInBounds(c, viewportBounds({
    minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
  })))
    || (abD === 0 && pointInBounds(d, viewportBounds({
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
    })))
    || (cdA === 0 && pointInBounds(a, viewportBounds({
      minX: Math.min(c.x, d.x), maxX: Math.max(c.x, d.x),
      minY: Math.min(c.y, d.y), maxY: Math.max(c.y, d.y),
    })))
    || (cdB === 0 && pointInBounds(b, viewportBounds({
      minX: Math.min(c.x, d.x), maxX: Math.max(c.x, d.x),
      minY: Math.min(c.y, d.y), maxY: Math.max(c.y, d.y),
    })))
    || ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0));
};

export function markGeometryIntersectsViewport(mark, viewport) {
  if (!isEmbodiedMark(mark)) return false;
  const bounds = viewportBounds(viewport);
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) return false;
  const ring = polygonOf(mark);
  if (!ring) {
    const claim = rect(mark);
    return claim.x + claim.w / 2 >= bounds.minX && claim.x - claim.w / 2 <= bounds.maxX
      && claim.y + claim.h / 2 >= bounds.minY && claim.y - claim.h / 2 <= bounds.maxY;
  }
  if (ring.some((point) => pointInBounds(point, bounds))) return true;
  const corners = [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
  ];
  if (corners.some((point) => pointInPolygon(point.x, point.y, ring))) return true;
  const viewportEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
  for (let index = 0; index < ring.length; index++) {
    const edge = [ring[index], ring[(index + 1) % ring.length]];
    if (viewportEdges.some(([a, b]) => segmentsIntersect(edge[0], edge[1], a, b))) return true;
  }
  return false;
}

export function edgePointToward(viewport, target, inset = 0) {
  const bounds = viewportBounds(viewport);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const dx = Number(target?.x) - cx, dy = Number(target?.y) - cy;
  if (![cx, cy, dx, dy].every(Number.isFinite) || (dx === 0 && dy === 0)) return null;
  const halfW = Math.max(0, (bounds.maxX - bounds.minX) / 2 - inset);
  const halfH = Math.max(0, (bounds.maxY - bounds.minY) / 2 - inset);
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const scale = Math.min(tx, ty);
  return { x: cx + dx * scale, y: cy + dy * scale, bearingDeg: bearingDeg(dx, dy) };
}

export function deslugMarkId(id) {
  const slug = String(id ?? "").split("/").filter(Boolean).pop() ?? "";
  const words = slug.split("-").filter(Boolean);
  const readable = [];
  for (const word of words) {
    if (word.toLowerCase() === "s" && readable.length) {
      readable[readable.length - 1] += "'s";
      continue;
    }
    readable.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }
  return readable.join(" ");
}

export function resolveMarkName(mark, determined = {}) {
  const key = `${mark?.id ?? ""}::name`;
  const won = determined instanceof Map ? determined.get(key) : determined?.[key];
  const name = String(won ?? "").trim();
  return name
    ? { name, determined: true }
    : { name: deslugMarkId(mark?.id), determined: false };
}

export function extentGlyphKind(mark) {
  if (!mark?.extent || !(Number(mark.extent.w) > 0 || Number(mark.extent.h) > 0)) return null;
  return polygonOf(mark) ? "polygon" : "rect";
}

function pointInsideMark(point, mark) {
  if (!isEmbodiedMark(mark)) return false;
  const ring = polygonOf(mark);
  return ring
    ? pointInPolygon(Number(point?.x), Number(point?.y), ring)
    : pointInRect(Number(point?.x), Number(point?.y), rect(mark));
}

export function officeBase(storage) {
  try {
    const source = storage === undefined && typeof window !== "undefined" ? window.localStorage : storage;
    return String(source?.getItem("pm.office.base") || OFFICE_DEFAULT).replace(/\/+$/, "");
  } catch {
    return OFFICE_DEFAULT;
  }
}

const officeUrl = (path) => `${officeBase()}${path.startsWith("/") ? path : `/${path}`}`;

export function viewerAxisState({ identityResolved = false, baseLayer = "true", markFilter = "everything" } = {}) {
  return {
    controls: identityResolved,
    base: identityResolved && baseLayer === "mine" ? "My World" : "True World",
    filter: markFilter === "new" ? "new"
      : identityResolved && markFilter === "mine" ? "just mine"
      : "everything",
  };
}

export function viewerAxisControls(options = {}) {
  const axis = viewerAxisState(options);
  if (!axis.controls) return "";
  const base = (key, label) =>
    `<button class="wv-fchip${axis.base === label ? " on" : ""}" data-world-base="${key}">${label}</button>`;
  return `<div class="wv-lens" aria-label="World lens">`
    + `<span>world</span>${base("true", "True World")}<span class="wv-lens-swap">⟷</span>${base("mine", "My World")}`
    + `</div>`;
}

export function viewerFilterControls(options = {}) {
  const axis = viewerAxisState(options);
  const chip = (key, label, disabled = false) =>
    `<button class="wv-fchip${axis.filter === label ? " on" : ""}" data-mark-filter="${key}"${disabled ? ` disabled title="sign in as a resident to see just yours"` : ""}>${label}</button>`;
  return `<div class="wv-mfilter" aria-label="Marks filter">`
    + chip("everything", "everything")
    + chip("mine", "just mine", !axis.controls)
    + chip("new", "new")
    + `</div>`;
}

export function townDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function previewStakeLedgerLine({ mode = "stake", date = townDate(), handle, mark, stamps } = {}) {
  const n = Number(stamps);
  if (!handle || !mark || !Number.isInteger(n) || n < 1) return "";
  return mode === "unstake"
    ? `- ${date} · stake:world-mark/${mark} → ${handle} · ${n} · for: unstake · sig: …`
    : `- ${date} · ${handle} → stake:world-mark/${mark} · ${n} · via: api · sig: …`;
}

export function clampStakeAmount(value, balance) {
  const requested = Number(value);
  const available = Number(balance);
  const validAmount = Number.isInteger(requested) && requested >= 1;
  const validBalance = balance !== null && balance !== undefined && balance !== ""
    && Number.isInteger(available) && available >= 0;
  return {
    requested,
    balance: validBalance ? available : null,
    amount: validAmount && validBalance ? Math.min(requested, available) : null,
    exceeded: validAmount && validBalance && requested > available,
  };
}

export function worldStakeAnswer(answer = {}, mode = "stake") {
  if (answer.error === "bounce" || answer.defect) {
    return {
      kind: "refusal",
      text: [answer.defect || "the door refused the line", answer.hint].filter(Boolean).join(" — "),
    };
  }
  const applied = Number(answer.applied ?? 0);
  if (applied <= 0) {
    return {
      kind: "refusal",
      text: answer.reason || `No stamps were ${mode === "unstake" ? "returned" : "staked"}.`,
    };
  }
  const requested = Number(answer.requested ?? applied);
  const verb = mode === "unstake" ? "returned" : "staked";
  const clipped = answer.clipped || applied < requested
    ? ` The door clipped the request from ${requested} to ${applied}.`
    : "";
  return {
    kind: "success",
    text: `${applied} stamp${applied === 1 ? "" : "s"} ${verb} on ${answer.mark}.${clipped}`,
  };
}

export function summarizeBackers(rows = [], limit = 5) {
  const holders = (rows ?? [])
    .map((row) => ({
      holder: String(row?.holder ?? row?.handle ?? "").trim(),
      amount: Number(row?.amount ?? row?.stamps ?? 0),
    }))
    .filter((row) => row.holder && Number.isFinite(row.amount) && row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.holder.localeCompare(b.holder));
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  return { top: holders.slice(0, cap), others: Math.max(0, holders.length - cap) };
}

export function previewWalkLeg({ from, toward, targetExtent = null, skeleton = null } = {}) {
  if (![from?.x, from?.y, toward?.x, toward?.y].every(Number.isFinite)) return null;
  const at = fractionalCrossing();
  const position = positionAt({ from, toward, at, targetExtent }, at);
  return {
    distanceM: position.legM,
    etaCrossings: position.etaCrossings,
    viaCrossings: skeleton ? crossingsOnSegment(from, toward, skeleton) : [],
  };
}

const HOURS_PER_CROSSING = 12;
export function formatEtaCrossings(etaCrossings) {
  const crossings = Number(etaCrossings);
  if (!Number.isFinite(crossings) || crossings < 0) return "";
  const totalMinutes = Math.round(crossings * HOURS_PER_CROSSING * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `≈ ${hours} h ${String(minutes).padStart(2, "0")} m`;
}

export function formatCardinalPosition(point) {
  const x = Math.round(Number(point?.x)), y = Math.round(Number(point?.y));
  if (![x, y].every(Number.isFinite)) return "";
  if (x === 0 && y === 0) return "at TC";
  const axes = [];
  if (y !== 0) axes.push(`${Math.abs(y).toLocaleString()} m ${y < 0 ? "N" : "S"}`);
  if (x !== 0) axes.push(`${Math.abs(x).toLocaleString()} m ${x < 0 ? "W" : "E"}`);
  return `${axes.join(" · ")} of TC`;
}

export function distanceBandLabel(name, bands = DIALS.distance_bands) {
  const index = (bands ?? []).findIndex((band) => band.name === name);
  if (index < 0) return String(name ?? "");
  const band = bands[index];
  const title = String(name).charAt(0).toUpperCase() + String(name).slice(1);
  const number = (value) => Math.round(Number(value)).toLocaleString();
  if (index === 0) return `${title} (within ~${number(band.max)} m)`;
  const lower = bands[index - 1].max;
  return Number.isFinite(band.max)
    ? `${title} (~${number(lower)}–${number(band.max)} m)`
    : `${title} (~${number(lower)} m+)`;
}

export function pointWalkDestination(point, marks = []) {
  const x = Number(point?.x), y = Number(point?.y);
  if (![x, y].every(Number.isFinite)) return null;
  const inside = marks
    .filter((mark) => {
      return mark?.id && !isAmbientMark(mark, marks) && !mark.far
        && pointInsideMark({ x, y }, mark);
    })
    .sort((a, b) => {
      const areaA = Number(a.extent.w) * Number(a.extent.h);
      const areaB = Number(b.extent.w) * Number(b.extent.h);
      return areaA - areaB || String(a.id).localeCompare(String(b.id));
    })[0]?.id ?? null;
  return { x: Math.round(x), y: Math.round(y), inside };
}

export function walkDestinationLabel(destination, marks = [], determined = {}) {
  const mark = destination?.markId && markIndex(marks).get(destination.markId);
  if (mark) return resolveMarkName(mark, determined).name;
  const cardinal = formatCardinalPosition(destination);
  return cardinal ? `• ${cardinal}` : "";
}

export function disciplineAtlasImages(root) {
  const images = [...root.querySelectorAll("img, image")];
  for (const image of images) {
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
  }
  return images.length;
}

export const MARK_SNAP_RADIUS_PX = 18;

export function snappedMarkAtPoint(point, marks = [], radiusPx = MARK_SNAP_RADIUS_PX) {
  const x = Number(point?.x), y = Number(point?.y), radius = Number(radiusPx);
  if (![x, y, radius].every(Number.isFinite) || radius < 0) return null;
  return marks
    .map((mark) => {
      const mx = Number(mark?.x), my = Number(mark?.y);
      return {
        id: mark?.id,
        distancePx: [mx, my].every(Number.isFinite) ? Math.hypot(mx - x, my - y) : Infinity,
      };
    })
    .filter((mark) => mark.id && mark.distancePx <= radius)
    .sort((a, b) => a.distancePx - b.distancePx || String(a.id).localeCompare(String(b.id)))[0]?.id ?? null;
}

export function smallestContainingMark(point, marks = []) {
  const x = Number(point?.x), y = Number(point?.y);
  if (![x, y].every(Number.isFinite)) return null;
  return (marks ?? [])
    .filter((mark) => !mark?.far && !isAmbientMark(mark, marks) && pointInsideMark({ x, y }, mark))
    .map((mark) => ({ mark, area: Number(mark.extent.w) * Number(mark.extent.h) }))
    .sort((a, b) => a.area - b.area || String(a.mark.id).localeCompare(String(b.mark.id)))[0]?.mark?.id ?? null;
}

export function paintingMarkAtPoint({
  screenPoint,
  worldPoint,
  glyphs = [],
  marks = [],
  radiusPx = MARK_SNAP_RADIUS_PX,
} = {}) {
  return snappedMarkAtPoint(screenPoint, glyphs, radiusPx)
    ?? smallestContainingMark(worldPoint, marks);
}

export function createMarkInteractionStore() {
  let value = Object.freeze({ selectedId: null, hoveredId: null });
  const listeners = new Set();
  const update = (key, id) => {
    const next = id || null;
    if (value[key] === next) return value;
    value = Object.freeze({ ...value, [key]: next });
    for (const listener of listeners) listener(value);
    return value;
  };
  return {
    getState: () => value,
    select: (id) => update("selectedId", id),
    hover: (id) => update("hoveredId", id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const BEARING_LONG = { N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest" };

// The chip's arrow points where the mark lies, north UP — the map pane's orientation.
// It is derived from the QUANTIZED bearing beside it, because that is all a display
// layer has: an FOV mark carries `bearing` (world-engine's quantizeBearing) and no raw
// degrees, and reaching for raw degrees would be a serialization change. That the arrow
// cannot disagree with the word it labels is the happy consequence.
// Rotation, not a set of unicode arrows: ↑↗→ and friends snap 16 winds onto 8, losing
// NNE/ENE entirely, and they cannot draw the "45°" keys quantizeBearing emits whenever
// the bearing_points dial is not 16. A degree rotation renders any rose.
const ROSE_DEG = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const bearingDegOf = (b) => {
  if (b == null) return null;
  if (ROSE_DEG[b] != null) return ROSE_DEG[b];
  const d = /^(-?\d+(?:\.\d+)?)\s*°?$/.exec(String(b));
  return d ? ((Number(d[1]) % 360) + 360) % 360 : null; // unknown key → no arrow, never a wrong one
};
const bearingArrow = (b) => {
  const deg = bearingDegOf(b);
  if (deg == null) return "";
  // A slim NOTCHED arrowhead, chosen by looking at four silhouettes blown up at every
  // wind. A near-equilateral triangle is the trap: it is rotated correctly and still
  // reads WRONG, because at three near-equal vertices the eye picks the nearest one
  // instead of the apex — NE read as left, ENE as down. The notch makes the apex the
  // only sharp vertex and the elongation breaks the symmetry, so the point is
  // unambiguous at 45° steps as well as at the cardinals.
  return `<svg class="wv-arrow" viewBox="-5 -5 10 10" aria-hidden="true">`
    + `<path d="M0 -5 L2.8 4 L0 2.1 L-2.8 4 Z" transform="rotate(${deg})"/></svg>`;
};

// ───────────────────────── THE one mark-shape builder ──────────────────────
// EVERY outline of a mark's claim on the painting comes from here. Never hand-build
// one — that is the rule this function exists to make keepable, and it was earned:
// the ring branch had to be written THREE times before it was written once. Grid-true
// had it, buildFpLayer got it ported when Grid-true retired, and the old highlight
// quietly went on drawing a bbox rect — so a hover washed a rectangle over a mark
// the layer beneath it was correctly drawing as a polygon. Two hand-written mappings
// of one concept drift; three is a habit. No fourth mapping gets written, because
// there is nowhere left to write it.
//
// A mark with a `points:` ring (≥3) draws its AUTHORED shape; everything else draws
// its extent rect. The honesty gate guarantees ring-bbox == at/extent, so the two
// describe the same claim and the ring is only the truer telling of it. Ring vertices
// are absolute grid metres — the same space `at` lives in — so both take the caller's
// world→px mapping unchanged.
//
// `px(x, y) -> {x, y}` is the caller's mapping (the painting's originPx/mPerPx).
// `cls` is the caller's own vocabulary — the footprints layer and the hover wash keep
// their separate classes and styling; only the GEOMETRY is shared.
function markShapeSVG(m, px, cls, { attrs = "", inner = "" } = {}) {
  const ring = Array.isArray(m.points) && m.points.length >= 3 ? m.points : null;
  if (ring) {
    const pts = ring.map((v) => {
      const q = px(Array.isArray(v) ? v[0] : v.x, Array.isArray(v) ? v[1] : v.y);
      return `${q.x},${q.y}`;
    }).join(" ");
    return `<polygon points="${pts}" class="${cls}"${attrs}>${inner}</polygon>`;
  }
  const w = m.extent?.w ?? 0, h = m.extent?.h ?? 0;
  const a = px(m.at.x - w / 2, m.at.y - h / 2), b = px(m.at.x + w / 2, m.at.y + h / 2);
  return `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}"`
    + ` width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" class="${cls}"${attrs}>${inner}</rect>`;
}

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
  --stamp-violet:#aa8fd8; --stamp-violet-dark:#65517f;
  --stamp-violet-heading:#d8c7ef; --stamp-violet-subhead:#cbb8e5;
  /* tier accents (Keemin 2026-07-23): constitution → blue, sovereign/homes → green, market → amber */
  --blue:#7ba7e0; --blue-dark:#5580b8; --green:#84c98f; --green-dark:#57a068;
  background:var(--night); color:var(--paper); font:16px/1.55 Georgia,"Times New Roman",serif;
  min-height:100vh; }
.wv * { box-sizing:border-box; }
.wv-head { padding:14px 22px; border-bottom:1px solid var(--line); display:flex;
  align-items:baseline; gap:14px; flex-wrap:wrap; }
.wv-head h1 { font-size:1.05rem; margin:0; color:var(--amber); font-weight:600; letter-spacing:.04em; }
.wv-head .wv-sub { color:var(--dim); font-style:italic; font-size:.85rem; }
.wv-beta { border:1px solid rgba(216,138,122,.5); border-left-width:4px; border-radius:5px;
  margin:16px 22px 0; padding:9px 14px; font-size:.84rem; line-height:1.5; color:var(--dim); max-width:92ch; }
.wv-beta b { color:var(--err); letter-spacing:.08em; }
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
.wv-band h3 { font-size:.8rem; letter-spacing:.07em; color:var(--dim); margin:18px 0 8px; }
.wv-arrow { width:.95em; height:.95em; vertical-align:-.15em; margin-right:.3em; overflow:visible; }
.wv-arrow path { fill:currentColor; opacity:.8; }
.wv-card { border:1px solid var(--line); border-left:3px solid var(--amber-dark); border-radius:5px;
  --wv-mark-accent:var(--amber); padding:10px 13px; margin:8px 0; cursor:pointer; max-width:76ch; }
.wv-card:hover { border-color:var(--amber-dark); }
.wv-card.t-constitution { --wv-mark-accent:var(--blue); }
.wv-card.t-home { --wv-mark-accent:var(--green); }
.wv-card.is-mark-hovered { border-color:var(--wv-mark-accent); }
.wv-card.is-mark-selected { border-color:var(--wv-mark-accent); outline:1px solid var(--wv-mark-accent);
  outline-offset:2px; }
.wv-tnode.is-mark-hovered, .wv-tnode.is-mark-selected,
.wv-wnode.is-mark-hovered, .wv-wnode.is-mark-selected { color:var(--paper); border-color:var(--amber); }
.wv-card.far { border-left-color:var(--line); font-style:italic; }
.wv-card .cname { display:flex; align-items:center; gap:7px; color:var(--paper); font-size:1.02rem;
  line-height:1.25; font-style:normal; font-weight:700; }
.wv-card .cname.is-determined { color:var(--amber); }
.wv-card .wv-name-arrow { display:inline-flex; align-items:center; color:var(--wv-mark-accent); }
.wv-card .wv-name-arrow .wv-arrow { width:1.3em; height:1.3em; margin:0; vertical-align:middle; }
.wv-card .cbody { line-height:1.45; }
.wv-card .cname + .cbody { margin-top:5px; }
.wv-card .cmeta { margin-top:7px; display:flex; gap:6px; flex-wrap:wrap; align-items:baseline; }
.wv-card .wv-details { display:none; flex-basis:100%; align-items:center; gap:7px; flex-wrap:wrap;
  padding-top:6px; border-top:1px dotted var(--line); color:var(--dim); font-size:.7rem; }
.wv-card:hover .wv-details, .wv-card:focus-within .wv-details, .wv-card.is-mark-selected .wv-details { display:flex; }
.wv-detail-author, .wv-detail-date, .wv-detail-where { white-space:nowrap; }
.wv-card .wv-cell-actions { display:flex; gap:5px; flex-wrap:wrap; margin-left:auto; }
.wv-backing { color:var(--stamp-violet-subhead); font-variant-numeric:tabular-nums;
  font:inherit; font-size:.72rem; white-space:nowrap; }
button.wv-backing { background:transparent; border:0; padding:2px 4px; cursor:pointer; }
button.wv-backing:hover { color:var(--stamp-violet-heading); text-decoration:underline; }
.wv-backing.is-zero { opacity:.65; }
.wv-cell-act { background:transparent; border:1px solid var(--amber-dark); color:var(--amber);
  border-radius:999px; padding:2px 8px; font:inherit; font-size:.7rem; cursor:pointer; }
.wv-cell-act:hover { background:var(--panel2); }
.wv-cell-act.stamp { border-color:var(--stamp-violet-dark); color:var(--stamp-violet-subhead); }
.wv-cell-act.stamp:hover { border-color:var(--stamp-violet); color:var(--stamp-violet-heading); }
.wv-act-sheet { margin-top:10px; padding:10px; border:1px dashed var(--stamp-violet-dark);
  border-radius:4px; background:rgba(20,23,29,.72); cursor:default; }
.wv-act-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.wv-act-head b { color:var(--stamp-violet-heading); font-size:.86rem; }
.wv-act-close { border:0; background:transparent; color:var(--dim); cursor:pointer; font:inherit; }
.wv-act-row { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:8px; }
.wv-act-row label { color:var(--dim); font-size:.72rem; }
.wv-act-row input { width:7rem; background:var(--night); color:var(--paper); border:1px solid var(--line);
  border-radius:4px; padding:4px 7px; font:inherit; }
.wv-act-row button { background:transparent; border:1px solid var(--stamp-violet-dark); color:var(--stamp-violet-subhead);
  border-radius:4px; padding:4px 8px; font:inherit; font-size:.72rem; cursor:pointer; }
.wv-act-row .wv-act-confirm { border-color:var(--stamp-violet); color:var(--stamp-violet-heading); }
.wv-act-row button:disabled { opacity:.45; cursor:not-allowed; }
.wv-act-preview { margin-top:9px; }
.wv-act-preview pre { margin:5px 0; padding:8px; white-space:pre-wrap; overflow-wrap:anywhere;
  background:#0d0f13; border:1px solid var(--line); color:var(--paper); font:12px/1.45 Consolas,Menlo,monospace; }
.wv-act-note, .wv-act-answer { margin:6px 0 0; color:var(--dim); font-size:.75rem; line-height:1.4; }
.wv-backers { margin:7px 0 2px; color:var(--dim); font-size:.74rem; line-height:1.45; }
.wv-backers b { color:var(--stamp-violet-subhead); }
.wv-backer { display:flex; justify-content:space-between; gap:10px; max-width:24rem; }
.wv-backer .amount { color:var(--stamp-violet); font-variant-numeric:tabular-nums; }
.wv-act-answer.success { color:var(--green); }
.wv-act-answer.refusal { color:var(--err); }
.wv-stamp-holding, .wv-stamp-balance { color:var(--stamp-violet); font-variant-numeric:tabular-nums; }
.wv-chip { font-size:.7rem; letter-spacing:.04em; border:1px solid var(--line); border-radius:999px;
  padding:1px 8px; color:var(--dim); white-space:nowrap; }
.wv-chip.stamps { border-color:var(--stamp-violet-dark); color:var(--stamp-violet); }
.wv-chip.signal { border-color:var(--amber-dark); color:var(--amber); }
.wv-chip.dim { opacity:.6; }
.wv-cid { font-size:.7rem; color:var(--dim); opacity:.6; margin-left:auto; font-family:Consolas,Menlo,monospace; }
.wv-extent { display:inline-flex; align-items:center; gap:4px; opacity:.8; }
.wv-extent svg { display:block; }
.wv-extent svg rect, .wv-extent svg polygon { fill:rgba(154,146,128,.18); stroke:var(--dim); stroke-width:1; }
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

/* one lens at the view's top, then one marks vocabulary beneath it */
.wv-lens { display:flex; align-items:center; gap:7px; margin:0 0 9px; }
.wv-lens > span:first-child { color:var(--dim); font-size:.63rem; letter-spacing:.09em; text-transform:uppercase; }
.wv-lens-swap { color:var(--dim); font-size:.76rem; }
.wv-mfilter { display:flex; gap:6px; margin:0 0 12px; }
.wv-fchip { background:transparent; border:1px solid var(--line); color:var(--dim); border-radius:999px;
  padding:3px 15px; font-size:.72rem; letter-spacing:.05em; cursor:pointer; }
.wv-fchip:hover { border-color:var(--amber-dark); color:var(--amber); }
.wv-fchip.on { border-color:var(--amber); color:var(--amber); background:var(--panel2); }
.wv-fchip:disabled { opacity:.38; cursor:not-allowed; }
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
.wv-minimap { -webkit-user-select:none; user-select:none; }
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
/* walkers (write-release P2): the one thing on this map that moves. A walker is
   drawn where DERIVATION says they are — the layer keeps no position of its own. */
.wv-walker { fill:#e0507a; stroke:#fff; stroke-width:2; vector-effect:non-scaling-stroke; }
.wv-walker.arrived { fill:var(--green); }
.wv-walker.standing { fill:#8b93a7; }
.wv-walk-leg { stroke:#e0507a; stroke-width:2; stroke-dasharray:5 4; opacity:.75; vector-effect:non-scaling-stroke; }
.wv-walk-dest { fill:none; stroke:#e0507a; stroke-width:2; vector-effect:non-scaling-stroke; }
.wv-walkpanel { display:flex; align-items:center; gap:8px; font-size:12px; opacity:.9; margin:6px 0 0; flex-wrap:wrap; }
.wv-walkpanel input[type=range] { width:130px; vertical-align:middle; }
.wv-walkpanel button { font:inherit; padding:1px 7px; cursor:pointer; }
#wv-walk-readout { opacity:.75; }
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
#wv-hl-layer { pointer-events:none; }
.wv-fp { fill:none; stroke-width:1.4; vector-effect:non-scaling-stroke; }
.wv-fp.t-constitution { stroke:var(--blue-dark); }
.wv-fp.t-home { stroke:var(--green-dark); }
.wv-fp.t-market { stroke:var(--amber-dark); }
.wv-fp.mech { stroke-dasharray:6 5; }
.wv-fp.fp-parcel { fill:rgba(132,201,143,.10); }
/* the marks you stand WITHIN read a tad heavier — the map's echo of the
   "Where you stand" ladder (Keemin: no nesting ceremony, just weight) */
.wv-fp.fp-within { stroke-width:2.8; }
.wv-hl-label rect { fill:rgba(13,15,19,.94); stroke:var(--line); stroke-width:1; }
.wv-hl-label text { fill:var(--paper); font-family:Consolas,Menlo,monospace; }
.wv-edge-indicator.t-constitution { color:var(--blue); }
.wv-edge-indicator.t-home { color:var(--green); }
.wv-edge-indicator.t-market { color:var(--amber); }
.wv-edge-indicator > path { fill:currentColor; stroke:var(--night); stroke-width:.8; }
.wv-edge-indicator rect { fill:rgba(13,15,19,.94); stroke:currentColor; stroke-width:1; }
.wv-edge-indicator text { fill:currentColor; font-family:Georgia,"Times New Roman",serif; }
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
.wv-nav .wv-identity h2 { margin-top:0; }
.wv-walkdesk { margin-top:16px; padding-top:12px; border-top:1px solid var(--line); }
.wv-walkdesk h2 { margin-top:0; }
.wv-youhere { color:var(--dim); font-size:.76rem; margin-bottom:8px; }
.wv-youhere b { color:var(--green); }
.wv-walk-destination { margin-top:7px; padding:7px 8px; border:1px solid var(--line);
  border-radius:4px; color:var(--dim); font-size:.72rem; line-height:1.4; }
.wv-walk-destination b { color:var(--paper); font-variant-numeric:tabular-nums; }
.wv-walkdesk .wv-walk-confirm {
  width:100%; margin-top:8px; background:transparent; border:1px solid var(--amber-dark);
  color:var(--amber); border-radius:4px; padding:5px 8px; font:inherit; font-size:.76rem; cursor:pointer; }
.wv-walkdesk .wv-walk-confirm:disabled { opacity:.45; cursor:not-allowed; }
.wv-walk-preview { margin-top:8px; padding:8px; border:1px dashed var(--amber-dark); border-radius:4px;
  color:var(--paper); font-size:.75rem; line-height:1.45; }
.wv-walk-answer { margin:7px 0 0; color:var(--dim); font-size:.74rem; }
.wv-walk-answer.success { color:var(--green); }
.wv-walk-answer.refusal { color:var(--err); }
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
  <span class="wv-sub">a camera over the marks tree · signed acts cross the office door</span>
</header>
<div class="wv-beta"><b>BETA</b> — the record is real, and the acts taken here are real. The viewer is still finding
  its shape and may change without notice.</div>
<div class="wv-main">
  <nav class="wv-nav">
    <div class="wv-identity"></div>
    <section class="wv-walkdesk" hidden>
      <h2>Walk</h2>
      <div class="wv-youhere">finding your place in the walk ledger…</div>
      <div class="wv-walk-destination">click the painting, or select a mark cell</div>
      <div class="wv-walk-preview" hidden></div>
      <button type="button" class="wv-walk-confirm" disabled>confirm departure</button>
      <p class="wv-walk-answer" hidden></p>
    </section>
    <div class="wv-standctl">
      <!-- stand/move went DEV-ONLY the day walk shipped (bronze
           spectator-stand-move-dev-only-before-walk, executed 2026-07-28): a
           resident's position is walk-derived now; free repositioning is a dev
           instrument. A signed-in painting click chooses a walking point;
           a spectator click still moves the read-only camera. -->
      <div class="wv-standmove" hidden>
      <h2>Stand at</h2>
      <div class="presets">${PRESETS.map((p) => `<button class="ctl" data-x="${p.x}" data-y="${p.y}">${esc(p.label)}</button>`).join("")}</div>
      <h2>Move</h2>
      <div class="compass">
        <button class="ctl" data-dx="-1" data-dy="-1">NW</button><button class="ctl" data-dx="0" data-dy="-1">N</button><button class="ctl" data-dx="1" data-dy="-1">NE</button>
        <button class="ctl" data-dx="-1" data-dy="0">W</button><div class="pos">at TC</div><button class="ctl" data-dx="1" data-dy="0">E</button>
        <button class="ctl" data-dx="-1" data-dy="1">SW</button><button class="ctl" data-dx="0" data-dy="1">S</button><button class="ctl" data-dx="1" data-dy="1">SE</button>
      </div>
      <div class="stepwrap">
        <label class="steplbl">step size <b class="stepval">100 m</b></label>
        <input class="stepslider" type="range" min="0" max="${STEP_NOTCHES.length - 1}" step="1" value="3" list="wv-stepticks" aria-label="step size">
        <datalist id="wv-stepticks">${STEP_NOTCHES.map((_, i) => `<option value="${i}"></option>`).join("")}</datalist>
      </div>
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
      <p class="wv-mapnote">the atlas, for bearings — <b>the telling is the truth</b>. Click a mark to select it;
        signed residents can also choose open ground for a walk, while spectators look from open-ground clicks.
        Drag to pan, scroll to zoom.</p>
      <p class="wv-walkpanel" id="wv-walk-panel"></p>
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
    markFilter: "everything",           // "everything" | "mine" | "new" — the one marks vocabulary
    baseLayer: "true",                  // "true" (main) | "mine" (main + the household draft)
    portfolio: null,                    // authenticated world_my_marks response
    mineIds: new Set(),                 // portfolio ids across drafts/published/backed
    handle: "",
    actorBalance: null,                 // liquid stamps from keyless /stamps/{handle}; null while loading
    actorHome: null,                    // office-derived home only when no walk record exists
    dials: { ...DIALS },
    dataSource: null,       // which world-state URL won (for the auto-update poll)
    asOf: null,             // X-Postmark-As-Of of the loaded fold (office-live only)
    whoami: null,           // { principal, household, handles } from office /ops/whoami
  };
  let data = null;          // { trueWorld, myWorld, worldState, skeleton, manifest }
  let world = null;         // assembled once (crossing-independent)
  let byId = new Map();     // id → folded mark, for cell lookups
  let homeSet = new Set();  // ids that render green: homes (+ descendants) and sovereigns
  let mapCtx = null;
  let lastRadial = null;
  const markInteraction = createMarkInteractionStore();

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
  const worldStatePaths = () => [officeUrl("/world/state"), "/WORLD/world-state.json", `${RAW}/WORLD/world-state.json`];
  async function fetchWorldState(paths, options = {}) {
    let lastErr;
    for (const p of paths) {
      try { const r = await fetch(p, options); if (r.ok) return { json: await r.json(), url: p, asOf: r.headers.get("x-postmark-as-of") }; lastErr = new Error(`${p} → ${r.status}`); }
      catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error("no source");
  }
  function applyWorldLayer() {
    const composed = state.baseLayer === "mine" && data?.myWorld;
    data.worldState = composed || data.trueWorld;
    world = assembleWorld({ worldState: data.worldState, skeleton: data.skeleton });
    byId = new Map(world.marks.map((m) => [m.id, m]));
    homeSet = buildHomeSet(data.manifest, world.marks);
  }
  const isOfficeLive = (url) => url === officeUrl("/world/state");
  async function loadData() {
    if (data) return;
    // The True World is intentionally credentialless. Even a signed-in browser
    // receives the main fold here; the household-composed fold has its own read.
    const ws = await fetchWorldState(worldStatePaths(), { credentials: "omit" });
    const [sk, mf] = await Promise.all([
      fetchJson([officeUrl("/world/skeleton"), "/WORLD/skeleton.json", `${RAW}/WORLD/skeleton.json`]),
      // homes come from the seeding manifest, fetched the same way (same-origin probe
      // → raw fallback); optional — no manifest just means no green
      fetchJson(["/seeding/manifest.json", `${RAW}/seeding/manifest.json`]).catch(() => null),
    ]);
    state.dataSource = ws.url; state.asOf = ws.asOf;
    data = { trueWorld: ws.json, myWorld: null, worldState: ws.json, skeleton: sk, manifest: mf };
    applyWorldLayer();
  }
  // re-pull the fold from the same source and re-assemble (auto-update). Skeleton
  // and manifest are stable across a write, so only world-state is refetched.
  async function reloadWorld() {
    const ws = await fetchWorldState([state.dataSource, ...worldStatePaths()], { credentials: "omit" });
    state.dataSource = ws.url; state.asOf = ws.asOf;
    data.trueWorld = ws.json;
    applyWorldLayer();
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
      for (const m of marks) {
        if (m.id === home.id || m.by !== h.household || !m.at) continue;
        if ((m.kind === "sited" || m.kind === "parcel") && marksContain(home, m)) set.add(m.id);
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
    // ONE class rule (tools/mark-class.mjs): in a parcel's directory → home,
    // via the fold's parent chain — reaches predicated laws with no coordinates,
    // which homeSet and `sovereign` (both geometric) structurally miss.
    return markClass(full, byId);
  }
  function tierChip(tier) {
    if (tier === "constitution") return `<span class="wv-chip t-constitution">constitution</span>`;
    if (tier === "home") return `<span class="wv-chip t-home">home</span>`;
    return "";
  }

  // ───────── the telling view ─────────
  function chips(m) {
    const c = [];
    if (m.signal) c.push(`<span class="wv-chip signal">its light carries</span>`);
    if (m.dim != null && m.dim < 1) c.push(`<span class="wv-chip dim">dim</span>`);
    if (m.aboveFogTarget) c.push(`<span class="wv-chip">above the fog</span>`);
    return c.join("");
  }
  function markName(m) {
    const full = byId.get(m?.id) ?? m;
    return resolveMarkName(full, data?.worldState?.determined ?? {});
  }
  function radialWhere(m) {
    const full = byId.get(m?.id) ?? m;
    if (!isEmbodiedMark(full) || isAmbientMark(full, byId)) return { bearing: null, detail: "" };
    const dx = Number(full.at.x) - Number(state.cam.x), dy = Number(full.at.y) - Number(state.cam.y);
    const distance = Number.isFinite(m?.distM) ? Number(m.distM) : Math.round(Math.hypot(dx, dy));
    const inside = pointInsideMark(state.cam, full);
    const bearing = inside ? null : (m?.bearing ?? quantizeBearing(bearingDeg(dx, dy), state.dials.bearing_points));
    const dist = m?.far
      ? `~${Math.round(distance / 1000).toLocaleString()} km`
      : `${Math.round(distance).toLocaleString()} m`;
    const direction = bearing ? BEARING_LONG[bearing] ?? bearing : "inside";
    return { bearing, detail: `${dist} · ${direction}` };
  }
  // the FOOTPRINT indicator (Keemin 2026-07-23): coordinate dots say nothing about
  // how big a mark is — the-main-channel is 10^3× a bench. A log-scaled glyph rect
  // + a "w×h m" read gives each cell its size at a glance. Extent is the mark's
  // claim; a points: ring's bbox equals it (the honesty gate), so extent suffices.
  // Law/predicated cells carry no extent → no glyph.
  function extentTag(m) {
    const full = byId.get(m.id) ?? m;
    const e = full.extent;
    if (isAmbientMark(full, byId) || m.far || !e || !(e.w || e.h)) return "";
    const w = e.w ?? 0, h = e.h ?? 0, maxD = Math.max(w, h, 1);
    const box = 6 + Math.min(26, Math.log10(maxD + 1) * 8.5); // ~6px @1m … ~32px @~5km
    const gw = Math.max(2, box * (w / maxD)), gh = Math.max(2, box * (h / maxD));
    const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : Math.round(n));
    const ring = polygonOf(full);
    let glyph;
    if (ring) {
      const xs = ring.map((point) => point.x), ys = ring.map((point) => point.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = (box - 2) / Math.max(maxX - minX, maxY - minY, 1);
      const ox = (box - (maxX - minX) * scale) / 2, oy = (box - (maxY - minY) * scale) / 2;
      const points = ring.map((point) =>
        `${(ox + (point.x - minX) * scale).toFixed(1)},${(oy + (point.y - minY) * scale).toFixed(1)}`).join(" ");
      glyph = `<polygon points="${points}"/>`;
    } else {
      glyph = `<rect x="${((box - gw) / 2).toFixed(1)}" y="${((box - gh) / 2).toFixed(1)}" width="${gw.toFixed(1)}" height="${gh.toFixed(1)}" rx="1"/>`;
    }
    return `<span class="wv-extent" title="footprint ${w}×${h} m">`
      + `<svg width="${box.toFixed(0)}" height="${box.toFixed(0)}" viewBox="0 0 ${box.toFixed(1)} ${box.toFixed(1)}" aria-hidden="true">`
      + `${glyph}</svg>`
      + `<span class="wv-extent-t">${fmt(w)}×${fmt(h)} m</span></span>`;
  }
  function identityResolved() {
    return !!pmKey() && (state.whoami?.handles ?? []).length > 0
      && !!state.portfolio && !!data?.myWorld && !!state.handle;
  }
  function walkableMark(m) {
    const full = byId.get(m?.id) ?? m;
    return (full?.kind === "sited" || full?.kind === "parcel")
      && full?.tier !== "constitution" && !!full.at
      && Math.max(Number(full.extent?.w ?? 0), Number(full.extent?.h ?? 0)) < 2000;
  }
  function backedPosition(markId, handle = state.handle) {
    return (state.portfolio?.backed ?? []).find((row) =>
      (row.id ?? row.mark) === markId && row.holder === handle && Number(row.stamps ?? 0) > 0);
  }
  function markIdentity(m) {
    const full = byId.get(m?.id) ?? m;
    return markName(full).name || String(full?.id ?? "");
  }
  function markActions(m) {
    const full = byId.get(m.id) ?? m;
    const backing = Math.max(0, Number(full.stamps ?? 0));
    const backingClass = `wv-backing${backing === 0 ? " is-zero" : ""}`;
    const backingDisplay = identityResolved()
      ? `<button type="button" class="${backingClass}" data-stake-open data-mark="${esc(m.id)}" title="back this mark">✦ ${backing.toLocaleString()}</button>`
      : `<span class="${backingClass}" title="current backing">✦ ${backing.toLocaleString()}</span>`;
    if (!identityResolved()) return `<span class="wv-cell-actions">${backingDisplay}</span>`;
    const position = backedPosition(m.id);
    return `<span class="wv-cell-actions">`
      + backingDisplay
      + (position ? `<button type="button" class="wv-cell-act stamp unstake" data-unstake-open data-mark="${esc(m.id)}" data-max="${Number(position.stamps)}">take back ${Number(position.stamps)}</button>` : "")
      + `</span>`;
  }
  // THE unified mark-cell — everything on the telling is one of these, and every
  // one names its mark id (Keemin 2026-07-23). role styles it (frame/ladder/law/fov);
  // tier colors it; annotation carries a mechanic's live state (fog/light this crossing).
  function markCell(m, { role = "fov", annotation = "", radialChips = false } = {}) {
    const full = byId.get(m.id) ?? m;
    const tier = tierOf(m), far = !!m.far;
    const identity = markName(full);
    const where = radialWhere(m);
    const details = [
      full.by ? `<span class="wv-detail-author">by ${esc(full.by)}</span>` : "",
      full.date ? `<span class="wv-detail-date">${esc(String(full.date).slice(0, 10))}</span>` : "",
      extentTag(full),
      isEmbodiedMark(full) && !isAmbientMark(full, byId)
        ? `<span class="wv-detail-position">${esc(formatCardinalPosition(full.at))}</span>` : "",
      where.detail ? `<span class="wv-detail-where">${esc(where.detail)}</span>` : "",
    ].filter(Boolean).join("");
    const cluster = (role === "fov" && m.clusteredCount > 1)
      ? `<div class="wv-cluster">+${m.clusteredCount - 1} more of ${esc(m.household ?? "this household")}'s — investigate</div>` : "";
    return `<article class="wv-card ${role}${far ? " far" : ""} t-${tier}" data-id="${esc(m.id)}" role="button" tabindex="0">
      <div class="cname${identity.determined ? " is-determined" : ""}"><span>${esc(identity.name)}</span>${where.bearing ? `<span class="wv-name-arrow" title="${esc(BEARING_LONG[where.bearing] ?? where.bearing)}">${bearingArrow(where.bearing)}</span>` : ""}</div>
      <div class="cbody">${esc(far ? (m.label ?? m.id) : (m.body ?? m.id))}</div>
      ${annotation ? `<div class="wv-cell-state">${esc(annotation)}</div>` : ""}
      <div class="cmeta">${tierChip(tier)}${radialChips ? chips(m) : ""}${markActions(m)}<div class="wv-details">${details}</div></div>
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
    if (obs.inFog) return `Fog is in tonight (thickness ${radial.fog.thickness}) — it closes the view to about ${(radial.sightReachM ?? 0).toLocaleString()} m.`;
    return `The air is clear — you can see about ${(radial.sightReachM ?? 0).toLocaleString()} m.`;
  }
  // keep: optional predicate — under just mine, only cards whose mark passes
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
    // The spine is not listed twice (Keemin, 2026-07-27): the ladder above already
    // gives every mark you stand WITHIN its own card, so a band repeat tells it twice.
    // Under Mine a not-yours spine mark is absent from the ladder, but `keep` filters
    // it from the bands as well, so no mark can fall out of both and vanish.
    const spineIds = new Set((radial?.within ?? []).map((w) => w.id));
    // outward, in the engine's own band order
    const bandOrder = DIALS.distance_bands.map((d) => d.name);
    const keys = Object.keys(byBand).sort((a, b) => bandOrder.indexOf(a) - bandOrder.indexOf(b));
    let html = "";
    for (const band of keys) {
      let entries = byBand[band].filter((m) => !spineIds.has(m.id))
        .sort((m, n) => (m.distM ?? 0) - (n.distM ?? 0));
      if (keep) entries = entries.filter(keep);
      if (!entries.length) continue;
      html += `<div class="wv-band"><h3>${esc(distanceBandLabel(band, state.dials.distance_bands))}</h3>`;
      for (const m of entries) html += markCell(m, { role: "fov", radialChips: true });
      html += `</div>`;
    }
    if (html) return html;
    return keep
      ? `<div class="wv-quiet">none of yours tells from here.</div>`
      : `<div class="wv-quiet">nothing tells from here — walk, or wait for clearer air.</div>`;
  }
  // ───────── the New feed ─────────
  // "a 'New' chip … so everyone can see the new marks being made regardless of their
  // distance or visibility" (Keemin, 2026-07-27). So this reads the WHOLE record,
  // date-descending, and deliberately bypasses the FOV — no fog, no sight radius, no
  // budget, no occlusion. The culling is precisely what this chip opts out of, which
  // is why it reads world.marks rather than a radial. Public by construction: it asks
  // nothing about who is looking.
  const NEW_CAP = 25;
  function newFeed(keep = null) {
    const dated = (world.marks ?? []).filter((m) => m.id && m.date && (!keep || keep(m)));
    // newest first; id breaks ties so the order is stable across re-tells (dates are
    // day-precision for most records, so ties are the common case, not the edge)
    const all = dated.slice().sort((a, b) =>
      String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
    const shown = all.slice(0, NEW_CAP), rest = all.slice(NEW_CAP);
    if (!shown.length) return { html: `<div class="wv-quiet">no marks in the record yet.</div>`, count: "" };

    let html = "";
    for (const m of shown) {
      // distance and bearing FROM WHERE YOU STAND — the chip answers "what is new AND
      // where is it from here". Marks with no geometry (predicated/naming) name their
      // parent instead, since "300 m away" is meaningless for a property of a thing.
      const sited = m.at && typeof m.at.x === "number";
      const view = sited
        ? { ...m, distM: Math.round(Math.hypot(m.at.x - state.cam.x, m.at.y - state.cam.y)),
            bearing: quantizeBearing(bearingDeg(m.at.x - state.cam.x, m.at.y - state.cam.y), state.dials.bearing_points) }
        : m;
      // The feed is still NOT deduped against the containment chain — a chronological
      // index that hid its newest entry would make its own "newest 25 of 244" untrue,
      // and that reasoning is unchanged. What went with the ladder is the "· where you
      // stand" note that used to hang off such a cell: it existed to explain a visible
      // duplicate, and with no ladder rendered there is no duplicate to explain. An
      // annotation pointing at a section the reader cannot see is worse than silence.
      const made = `made ${String(m.date).slice(0, 10)}`;
      html += markCell(view, {
        role: "fov",
        radialChips: true,
        annotation: sited ? made : `${made} · a property of ${m.parent ?? "the record"}`,
      });
    }
    const oldest = String(all[all.length - 1].date).slice(0, 10);
    const count = rest.length
      ? `newest ${shown.length} of ${all.length} marks · ${rest.length} older, back to ${oldest}`
      : `all ${all.length} marks in the record, newest first (back to ${oldest})`;
    return { html, count };
  }
  function tallies(radial) {
    const c = radial?.counts ?? {}, agg = radial?.aggregate ?? {}, parts = [];
    if (c.candidates != null) parts.push(`${c.shown ?? "?"} told of ${c.visible ?? "?"} in view (${c.candidates} in range)`);
    if (c.occluded) parts.push(`${c.occluded} behind the ground`);
    if (c.fogHidden) parts.push(`${c.fogHidden} lost to fog`);
    if (agg.hidden_by_budget) parts.push(`${agg.hidden_by_budget} more the eye doesn't sort out`);
    return parts.join(" · ");
  }
  // "just mine" means the household portfolio's owned OR backed marks. That set is
  // server-derived at household grain: it includes private draft deltas, authored
  // main marks, and every open escrow position. It deliberately does not infer
  // ownership from a browser-visible author string.
  function isMine(m) {
    return !!m?.id && state.mineIds.has(m.id);
  }
  function renderTelling() {
    const box = $(root, ".wv-telling");
    const hasIdentity = identityResolved();
    const mine = hasIdentity && state.markFilter === "mine";
    try {
      const name = state.cam.x === 0 && state.cam.y === 0 ? "a spectator on the Town Centre quay" : "a spectator";
      const e = openYourEyes({ x: state.cam.x, y: state.cam.y, name }, world, { crossing: state.crossing, dials: state.dials, budget: state.dials.context_budget });
      lastRadial = e.radial;
      const within = e.radial.within ?? [];
      const obs = e.radial.observer ?? {};
      const isNew = state.markFilter === "new";
      // The lens owns composition and stands alone. The row below owns the marks
      // question: everything, just mine, or recency. No fourth vocabulary.
      const chips = viewerAxisControls({ identityResolved: hasIdentity, baseLayer: state.baseLayer, markFilter: state.markFilter })
        + viewerFilterControls({ identityResolved: hasIdentity, baseLayer: state.baseLayer, markFilter: state.markFilter });
      // 1. the containment ladder — where you STAND, the standpoint frame. Kept as
      // context even under Mine (filtering the frame to yours would usually empty
      // "where you stand"); the filter narrows the visible marks, not your footing.
      //
      // NEW IS THE EXCEPTION, and by ruling rather than by rule (Keemin, 2026-07-28):
      // under New the feed stands alone. My own composition call was that the ladder
      // is always footing — it is overruled here for New only, so this reads as a
      // decision, not as a bug someone should tidy back. The ladder is not merely
      // hidden, it is not BUILT: New's list is the record in time order, and a
      // standpoint frame above a chronology is answering a question nobody asked.
      const showLadder = !isNew;
      let ladder = "";
      // Under Mine the frame ladder shows only YOUR cells of the chain (your
      // parcel/home when standing in them) — the world-root/terrain/region are
      // constitution and stay out of Mine everywhere (Keemin, 2026-07-27; the
      // first fix missed this path: these cells rendered unconditionally).
      const chain = mine ? within.filter((w) => isMine(byId.get(w.id) ?? w)) : within;
      if (showLadder) chain.forEach((w, i) => {
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
      // World-law cells are the-town's (constitution) — skipped under Mine, and part
      // of the ladder, so they go with it under New.
      if (showLadder && !mine)
        for (const lm of world.marks.filter((m) => m.by === "the-town" && m.mechanic && TELLERS[m.mechanic]))
          ladder += markCell(lm, { role: "law", annotation: TELLERS[lm.mechanic]() });
      // 3. then the listing. The CHIP governs it: All and Mine tell the standpoint —
      // ladder, then the bands, then the FOV tallies. New tells the record instead —
      // the feed alone, with the feed's own count in place of the tallies, so a count
      // line never describes a list it isn't attached to (sight-counts under a listing
      // that ignores sight would be the regression).
      const feed = isNew ? newFeed(mine ? isMine : null) : null;
      box.innerHTML = chips
        + (ladder ? `<div class="wv-section-lbl">where you stand</div>`
                  + `<div class="wv-ladder-cells">${ladder}</div>` : "")
        + (isNew
          ? `<div class="wv-section-lbl">new marks — the whole record, newest first</div>`
            + `<div class="wv-cards">${feed.html}</div>`
            + `<div class="wv-tallies">${esc(feed.count)}</div>`
          : `<div class="wv-cards">${tellingCards(e.radial, mine ? isMine : null)}</div>`
            + `<div class="wv-tallies">${esc(tallies(e.radial))}</div>`);
      if (mine) renderMineTail(box, e.radial);  // the same just-mine list continues beyond this sight
      drawOverlay(e.radial);
      syncMarkInteractionViews();
    } catch (err) {
      box.innerHTML = `<div class="wv-err">the telling failed: ${esc(err?.message ?? err)}</div>`;
    }
  }
  // The just-mine tail: the same filtered list continues beyond this sight with
  // the same mark cells. Backing is not a second shelf; it stays on the cell.
  function elsewhereRow(m) {
    return markCell(m, { role: "fov" });
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
    const tailEl = document.createElement("div");
    tailEl.className = "wv-mine-tail";
    tailEl.innerHTML = tail;
    box.appendChild(tailEl);
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
    syncMarkInteractionViews();
  }
  // ───────── the painting (atlas minimap) ─────────
  async function loadMinimap() {
    const boxEl = $(root, ".wv-minimap");
    try {
      const html = await fetch("/atlas/town.html").then((r) => { if (!r.ok) throw new Error(`atlas HTTP ${r.status}`); return r.text(); });
      const doc = new DOMParser().parseFromString(html, "text/html");
      // The atlas is a synced artifact, so load discipline belongs here at its
      // consumption boundary. Mutate the detached parse before any node mounts.
      disciplineAtlasImages(doc);
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
      // walkers ride above the highlight layer: a walk is the one thing on this
      // map that moves, so it must never be painted under anything.
      const walkLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      walkLayer.setAttribute("id", "wv-walk-layer");
      svg.appendChild(walkLayer);
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
      mapCtx = { svg, overlay, hlLayer, walkLayer, gridLayer, originPx, mPerPx, full, view, zoomK: 1, follow: false, glyphIds: new Set(), _tweening: false };
      let tween = null;
      function applyView() {
        svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
        mapCtx.zoomK = full.w / view.w;
        sizeGridLabels();
        if (lastRadial) drawOverlay(lastRadial);
        renderMarkHighlight();
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
      // drag = pan; a press that travels <6px selects by the painting's one hit
      // order: pip snap, then smallest containing non-ambient extent. Genuinely
      // open ground chooses a walking point for a resident, or moves the
      // read-only spectator camera.
      let press = null;
      function screenMarkCandidates() {
        const matrix = svg.getScreenCTM();
        if (!matrix) return [];
        return [...mapCtx.glyphIds].flatMap((id) => {
          const mark = byId.get(id);
          if (!mark?.at || ![mark.at.x, mark.at.y].every(Number.isFinite)) return [];
          const point = svg.createSVGPoint();
          point.x = originPx.x + mark.at.x / mPerPx;
          point.y = originPx.y + mark.at.y / mPerPx;
          const screen = point.matrixTransform(matrix);
          return [{ id, x: screen.x, y: screen.y }];
        });
      }
      const worldPointForEvent = (event) => {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const painting = point.matrixTransform(svg.getScreenCTM().inverse());
        return {
          x: (painting.x - originPx.x) * mPerPx,
          y: (painting.y - originPx.y) * mPerPx,
        };
      };
      const paintingMarkForEvent = (event) => paintingMarkAtPoint({
        screenPoint: { x: event.clientX, y: event.clientY },
        worldPoint: worldPointForEvent(event),
        glyphs: screenMarkCandidates(),
        marks: world?.marks ?? [],
      });
      svg.addEventListener("pointerdown", (e) => {
        stopTween();
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener("pointermove", (e) => {
        if (!press || e.pointerId !== press.id) {
          markInteraction.hover(paintingMarkForEvent(e));
          return;
        }
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) < 6) {
          markInteraction.hover(paintingMarkForEvent(e));
          return;
        }
        if (!press.moved) breakFollow(); // a real drag unlocks the snap; a stand-click doesn't
        markInteraction.hover(null);
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
        const markId = paintingMarkForEvent(e);
        if (markId) {
          selectMark(markId, { scrollCell: true });
          return;
        }
        const worldPoint = worldPointForEvent(e);
        const point = { x: Math.round(worldPoint.x), y: Math.round(worldPoint.y) };
        markInteraction.select(null);
        if (identityResolved()) chooseWalkPoint(point.x, point.y);
        else {
          state.cam = point;
          renderCurrent();
        }
      });
      svg.addEventListener("pointercancel", () => { press = null; boxEl.classList.remove("panning"); });
      svg.addEventListener("pointerleave", () => { if (!press) markInteraction.hover(null); });

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

      // footprints: every mark's own claim landing on the painting (the calibration
      // made visible) — an extent rect, or the authored `points:` ring where a mark
      // carries one, through the one shape-builder. The world-root (the frame) and
      // far/horizon objects are skipped: no ground.
      const fpPx = (x, y) => ({ x: originPx.x + x / mPerPx, y: originPx.y + y / mPerPx });
      function buildFpLayer() {
        let s = "";
        for (const m of world.marks ?? []) {
          if (!m.at || !m.extent || m.far || isAmbientMark(m, byId)) continue;
          const cls = `t-${tierOf(m)}` + (m.kind === "parcel" ? " fp-parcel" : "") + (m.mechanic ? " mech" : "");
          s += markShapeSVG(m, fpPx, `wv-fp ${cls}`, {
            attrs: ` data-id="${esc(m.id)}"`, inner: `<title>${esc(m.id)}</title>`,
          });
        }
        fpLayer.innerHTML = s;
        if (lastRadial) mapCtx.syncWithin(lastRadial);
      }
      // the standpoint's containment chain reads heavier on the map — kept in sync
      // with every telling (the boxes are the same boxes, only the weight moves)
      mapCtx.syncWithin = (radial) => {
        const ids = new Set((radial?.within ?? []).map((w) => w.id));
        // `[data-id]`, not `rect[data-id]`: a ringed mark is a <polygon>, and the
        // element-name selector would have silently left every true-shape out of the
        // within highlight — a half-port that looks finished.
        for (const r of fpLayer.querySelectorAll("[data-id]"))
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
    const glyphIds = new Set();
    for (const bands of Object.values(radial?.byBearing ?? {}))
      for (const arr of Object.values(bands))
        // tierOf, not m.tier: FOV marks carry no tier field, so it looks the full
        // mark up by id (and catches sovereign/home, which is not a tier value).
        for (const m of arr) {
          if (!m.at || typeof m.at.x !== "number" || !m.id) continue;
          const p = px(m.at);
          glyphIds.add(m.id);
          s += `<circle cx="${p.x}" cy="${p.y}" r="${11 / k}" class="ov-pip t-${tierOf(m)}" data-id="${esc(m.id)}">`
            + `<title>${esc(markIdentity(m))}</title></circle>`;
        }
    s += `<circle cx="${me.x}" cy="${me.y}" r="${17 / k}" class="ov-dot"/><circle cx="${me.x}" cy="${me.y}" r="${36 / k}" class="ov-halo"/>`;
    overlay.innerHTML = s;
    mapCtx.glyphIds = glyphIds;
    mapCtx.syncWithin?.(radial);
    renderMarkHighlight();
    drawWalkers(); // the camera moved; a derived position must stay true to it
    if (mapCtx.follow && mapCtx.lockOn && !mapCtx._tweening) mapCtx.lockOn();
  }
  function renderMarkHighlight() {
    if (!mapCtx?.hlLayer) return;
    const interaction = markInteraction.getState();
    const ids = [interaction.selectedId, interaction.hoveredId]
      .filter((id, index, all) => id && all.indexOf(id) === index);
    mapCtx.hlLayer.innerHTML = ids.map(renderOneMarkHighlight).join("");
  }
  function renderOneMarkHighlight(id) {
    const m = id && byId.get(id);
    const target = nearestEmbodiedAncestor(m, byId);
    if (!m || !target) return "";
    const k = Math.max(1, Math.sqrt(mapCtx.zoomK || 1));
    const t = tierOf(m), mech = m.mechanic ? " mech" : "";
    const p = { x: mapCtx.originPx.x + target.at.x / mapCtx.mPerPx, y: mapCtx.originPx.y + target.at.y / mapCtx.mPerPx };
    const worldViewport = {
      minX: (mapCtx.view.x - mapCtx.originPx.x) * mapCtx.mPerPx,
      minY: (mapCtx.view.y - mapCtx.originPx.y) * mapCtx.mPerPx,
      maxX: (mapCtx.view.x + mapCtx.view.w - mapCtx.originPx.x) * mapCtx.mPerPx,
      maxY: (mapCtx.view.y + mapCtx.view.h - mapCtx.originPx.y) * mapCtx.mPerPx,
    };
    const identity = markIdentity(m);
    const bounds = mapCtx.svg.getBoundingClientRect();
    const unit = bounds.width > 0 ? mapCtx.view.w / bounds.width : 1;
    if (!markGeometryIntersectsViewport(target, worldViewport)) {
      const edgeWorld = edgePointToward(worldViewport, target.at, 18 * unit * mapCtx.mPerPx);
      if (!edgeWorld) return "";
      const edge = {
        x: mapCtx.originPx.x + edgeWorld.x / mapCtx.mPerPx,
        y: mapCtx.originPx.y + edgeWorld.y / mapCtx.mPerPx,
      };
      const label = identity.length > 42 ? `${identity.slice(0, 41)}…` : identity;
      const labelWidth = Math.max(90, Math.min(300, label.length * 7 + 12)) * unit;
      const labelHeight = 23 * unit;
      const labelX = Math.max(mapCtx.view.x + 4 * unit,
        Math.min(mapCtx.view.x + mapCtx.view.w - labelWidth - 4 * unit, edge.x - labelWidth / 2));
      const labelY = Math.max(mapCtx.view.y + 4 * unit,
        Math.min(mapCtx.view.y + mapCtx.view.h - labelHeight - 4 * unit,
          edge.y < mapCtx.view.y + mapCtx.view.h / 2 ? edge.y + 12 * unit : edge.y - labelHeight - 12 * unit));
      return `<g class="wv-edge-indicator t-${t}">`
        + `<path d="M0 -5 L2.8 4 L0 2.1 L-2.8 4 Z" transform="translate(${edge.x} ${edge.y}) rotate(${edgeWorld.bearingDeg}) scale(${1.4 * unit})"/>`
        + `<rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${3 * unit}"/>`
        + `<text x="${labelX + 6 * unit}" y="${labelY + 15.5 * unit}" font-size="${12 * unit}">${esc(label)}</text></g>`;
    }
    // the box AND the dot light together, in the mark's own tier color — the same
    // sentence the cells speak (dashed = machinery-kept truth)
    let s = "";
    if (target.extent && !target.far) {
      // through the ONE shape-builder, so the wash traces the same outline the
      // footprints layer draws. Hand-built here, it drew a bbox rect over a mark the
      // layer beneath was correctly drawing as a polygon — Keemin caught it as a
      // wash that didn't fit its own shape.
      const hlPx = (x, y) => ({ x: mapCtx.originPx.x + x / mapCtx.mPerPx, y: mapCtx.originPx.y + y / mapCtx.mPerPx });
      s += markShapeSVG(target, hlPx, `wv-hl-box t-${t}${mech}`);
    }
    s += `<circle cx="${p.x}" cy="${p.y}" r="${14 / k}" class="wv-hl-dot t-${t}"/>`;
    const label = identity.length > 58 ? `${identity.slice(0, 57)}…` : identity;
    const labelWidth = Math.max(120, Math.min(420, label.length * 7 + 12)) * unit;
    const labelHeight = 23 * unit;
    const right = p.x < mapCtx.view.x + mapCtx.view.w * 0.55;
    const wantedX = right ? p.x + 16 * unit : p.x - labelWidth - 16 * unit;
    const labelX = Math.max(mapCtx.view.x + 4 * unit,
      Math.min(mapCtx.view.x + mapCtx.view.w - labelWidth - 4 * unit, wantedX));
    const labelY = Math.max(mapCtx.view.y + 4 * unit,
      Math.min(mapCtx.view.y + mapCtx.view.h - labelHeight - 4 * unit, p.y - labelHeight - 10 * unit));
    s += `<g class="wv-hl-label"><rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${3 * unit}"/>`
      + `<text x="${labelX + 6 * unit}" y="${labelY + 15.5 * unit}" font-size="${12 * unit}">${esc(label)}</text></g>`;
    return s;
  }
  function syncMarkInteractionViews() {
    const interaction = markInteraction.getState();
    const cells = root.querySelectorAll(".wv-card[data-id], .wv-tnode[data-id], .wv-wnode[data-id]");
    for (const cell of cells) {
      const selected = cell.dataset.id === interaction.selectedId;
      cell.classList.toggle("is-mark-selected", selected);
      cell.classList.toggle("is-mark-hovered", cell.dataset.id === interaction.hoveredId);
      if (cell.classList.contains("wv-card")) cell.setAttribute("aria-selected", String(selected));
    }
    renderMarkHighlight();
  }
  markInteraction.subscribe(syncMarkInteractionViews);

  // ───────── walkers (write-release P2) ─────────
  // A walk is a DECLARED DEPARTURE; position is derived from that record and the
  // clock. So this layer stores nothing and animates nothing — it asks the server
  // where everyone is at a given crossing and draws that.
  let walkState = { at: null, walkers: [], timer: null, pending: null, destination: null, actorBound: true };

  function actorWalker() {
    return walkState.walkers.find((walker) => walker.handle === state.handle) ?? null;
  }

  function actorOrigin() {
    const walker = actorWalker();
    if (walker && Number.isFinite(walker.x) && Number.isFinite(walker.y))
      return { x: Number(walker.x), y: Number(walker.y), source: "walk ledger" };
    if (state.actorHome && Number.isFinite(state.actorHome.x) && Number.isFinite(state.actorHome.y))
      return { x: Number(state.actorHome.x), y: Number(state.actorHome.y), source: "home (no walk recorded yet)" };
    return null;
  }

  function syncActorPosition({ moveCamera = false } = {}) {
    const origin = actorOrigin();
    const here = $(root, ".wv-youhere");
    if (here) here.innerHTML = origin
      ? `you are here — <b>${esc(formatCardinalPosition(origin))}</b><br><span>${esc(origin.source)}</span>`
      : `<span>no walk-ledger or sited-home position was found</span>`;
    if (moveCamera && origin && walkState.actorBound) {
      state.cam = { x: origin.x, y: origin.y };
      renderCurrent();
    }
  }

  function drawWalkers() {
    if (!mapCtx?.walkLayer) return;
    const k = Math.max(1, Math.sqrt(mapCtx.zoomK || 1));
    const px = (m) => ({ x: mapCtx.originPx.x + m.x / mapCtx.mPerPx, y: mapCtx.originPx.y + m.y / mapCtx.mPerPx });
    let s = "";
    for (const w of walkState.walkers) {
      const now = px(w), dest = px(w.toward ?? w);
      // the remaining leg, then the walker on top of it
      if (!w.arrived && !w.standing)
        s += `<line x1="${now.x}" y1="${now.y}" x2="${dest.x}" y2="${dest.y}" class="wv-walk-leg"/>` +
             `<circle cx="${dest.x}" cy="${dest.y}" r="${5 / k}" class="wv-walk-dest"/>`;
      const cls = w.standing ? "wv-walker standing" : w.arrived ? "wv-walker arrived" : "wv-walker";
      const eta = w.standing ? "standing" : w.arrived ? "arrived" : `${w.remaining_m} m to go, ETA ${formatEtaCrossings(w.eta_crossings)}`;
      s += `<circle cx="${now.x}" cy="${now.y}" r="${9 / k}" class="${cls}"><title>${esc(w.handle)} — ${esc(eta)}</title></circle>`;
    }
    mapCtx.walkLayer.innerHTML = s;
    const box = $(root, "#wv-walk-readout");
    if (box) {
      const on = walkState.walkers.filter((w) => !w.arrived && !w.standing).length;
      box.textContent = walkState.at === null ? "no walk records"
        : `crossing ${walkState.at.toFixed(3)} — ` +
          `${walkState.walkers.length} on record, ${on} on the road`;
    }
    syncActorPosition();
  }

  async function pollWalkers() {
    const paths = pmKey()
      ? [officeUrl("/world/walkers"), officeUrl("/walks")]
      : [officeUrl("/walks")];
    for (const path of paths) {
      try {
        const r = await fetch(path, { headers: authHeaders(), credentials: "same-origin" });
        if (!r.ok) continue;
        const j = await r.json();
        walkState.at = Number(j.at);
        walkState.walkers = j.walkers ?? [];
        drawWalkers();
        const origin = actorOrigin();
        if (identityResolved() && origin && walkState.actorBound) {
          const moved = state.cam.x !== origin.x || state.cam.y !== origin.y;
          state.cam = { x: origin.x, y: origin.y };
          if (moved) renderCurrent();
        }
        return true;
      } catch { /* try the spectator-local shape, then feature-detect off */ }
    }
    return false;
  }

  function mountWalkers() {
    const host = $(root, "#wv-walk-panel");
    if (!host) return;
    host.innerHTML = `<span id="wv-walk-readout">checking the walk ledger…</span>`;
    pollWalkers().then((available) => { host.hidden = !available; });
    clearInterval(walkState.timer);
    walkState.timer = setInterval(pollWalkers, 15000);
  }

  async function officeCall(path, { method = "GET", body = null } = {}) {
    const token = pmKey();
    if (!token) throw new Error("sign in before asking the office to act");
    const response = await fetch(officeUrl(path), {
      method,
      headers: {
        accept: "application/json",
        ...authHeaders(),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      credentials: "same-origin",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({
      error: "bounce",
      defect: `the door answered ${response.status} without a readable receipt`,
    }));
    return { ok: response.ok, status: response.status, body: payload };
  }

  async function loadActorHome() {
    state.actorHome = null;
    if (!state.handle) return;
    try {
      const response = await officeCall(`/homes/${encodeURIComponent(state.handle)}`);
      const place = response.body?.world;
      if (response.ok && place?.sited && Number.isFinite(place.x) && Number.isFinite(place.y)) {
        state.actorHome = { x: Number(place.x), y: Number(place.y), markId: place.mark_id ?? null };
        return;
      }
    } catch { /* the manifest fallback below is spectator-safe */ }
    const home = data?.manifest?.homes?.find((entry) => entry.household === state.handle && entry.grid_m);
    if (home) state.actorHome = { x: Number(home.grid_m.x), y: Number(home.grid_m.y), markId: `${home.household}/${home.home_id}` };
  }

  async function loadActorBalance() {
    const handle = state.handle;
    state.actorBalance = null;
    renderIdentity();
    if (!handle) return;
    let nextBalance;
    try {
      const response = await fetch(officeUrl(`/stamps/${encodeURIComponent(handle)}`), {
        headers: { accept: "application/json" },
        credentials: "omit",
      });
      const body = response.ok ? await response.json() : null;
      const balance = Number(body?.stamps);
      nextBalance = response.ok && Number.isInteger(balance) && balance >= 0 ? balance : undefined;
    } catch {
      nextBalance = undefined;
    }
    if (state.handle === handle) {
      state.actorBalance = nextBalance;
      renderIdentity();
    }
  }

  function invalidateWalkPreview() {
    walkState.pending = null;
    const preview = $(root, ".wv-walk-preview");
    const confirm = $(root, ".wv-walk-confirm");
    const answer = $(root, ".wv-walk-answer");
    if (preview) { preview.hidden = true; preview.innerHTML = ""; }
    if (confirm) confirm.disabled = true;
    if (answer) { answer.hidden = true; answer.textContent = ""; answer.className = "wv-walk-answer"; }
  }

  function renderWalkDestinations() {
    const desk = $(root, ".wv-walkdesk");
    if (!desk) return;
    desk.hidden = !identityResolved();
    if (desk.hidden) return;
    renderWalkDestination();
    syncActorPosition();
  }

  function renderWalkDestination() {
    const desk = $(root, ".wv-walkdesk");
    if (!desk) return;
    const box = $(desk, ".wv-walk-destination");
    const destination = walkState.destination;
    if (box) box.innerHTML = destination
      ? `destination — <b>${esc(walkDestinationLabel(destination, byId, data?.worldState?.determined))}</b>`
      : `click the painting, or select a mark cell`;
  }

  function scrollMarkCellIntoView(id) {
    const cell = [...root.querySelectorAll(".wv-card[data-id]")].find((entry) => entry.dataset.id === id);
    cell?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function selectMark(id, { scrollCell = false, scrollDesk = false } = {}) {
    if (!id || !byId.has(id)) return false;
    if (markInteraction.getState().selectedId === id) {
      clearSelectionAndDestination();
      return false;
    }
    markInteraction.select(id);
    if (identityResolved()) {
      walkState.destination = null;
      invalidateWalkPreview();
      renderWalkDestination();
      chooseWalkMark(id, { scrollDesk });
    }
    if (scrollCell) scrollMarkCellIntoView(id);
    return true;
  }

  function clearSelectionAndDestination() {
    markInteraction.select(null);
    walkState.destination = null;
    invalidateWalkPreview();
    renderWalkDestination();
  }

  function chooseWalkMark(id, { scrollDesk = false } = {}) {
    if (!identityResolved()) return;
    const mark = byId.get(id);
    if (!walkableMark(mark)) return;
    chooseWalkPoint(mark.at.x, mark.at.y, id, { scrollDesk });
  }

  function chooseWalkPoint(x, y, namedInside = null, { scrollDesk = true } = {}) {
    if (!identityResolved()) return;
    const destination = pointWalkDestination({ x, y }, world?.marks ?? []);
    if (!destination) return;
    walkState.destination = { ...destination, inside: namedInside || destination.inside, markId: namedInside || null };
    renderWalkDestination();
    previewSelectedWalk();
    if (scrollDesk) $(root, ".wv-walkdesk")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function previewSelectedWalk() {
    const desk = $(root, ".wv-walkdesk");
    const preview = $(desk, ".wv-walk-preview");
    const confirm = $(desk, ".wv-walk-confirm");
    const answer = $(desk, ".wv-walk-answer");
    invalidateWalkPreview();
    const from = actorOrigin();
    if (!from) {
      answer.hidden = false;
      answer.classList.add("refusal");
      answer.textContent = "The office has no walk-ledger or sited-home origin for this resident.";
      return;
    }
    const selected = walkState.destination;
    if (!selected) {
      answer.hidden = false;
      answer.classList.add("refusal");
      answer.textContent = "Choose a destination on the painting or select a mark cell.";
      return;
    }
    const toward = { x: selected.x, y: selected.y };
    const payload = { x: toward.x, y: toward.y, handle: state.handle };
    const destination = walkDestinationLabel(selected, byId, data?.worldState?.determined);
    const leg = previewWalkLeg({ from, toward, skeleton: data?.skeleton });
    if (!leg) {
      answer.hidden = false;
      answer.classList.add("refusal");
      answer.textContent = "Choose a destination with two finite coordinates.";
      return;
    }
    preview.innerHTML = `<b>${leg.distanceM.toLocaleString()} m · ETA ${formatEtaCrossings(leg.etaCrossings)}</b><br>`
      + `${esc(destination)}`;
    preview.hidden = false;
    confirm.disabled = false;
    walkState.pending = { payload, leg };
  }

  async function confirmSelectedWalk() {
    const desk = $(root, ".wv-walkdesk");
    const confirm = $(desk, ".wv-walk-confirm");
    const answer = $(desk, ".wv-walk-answer");
    if (!walkState.pending) return;
    confirm.disabled = true;
    answer.hidden = false;
    answer.className = "wv-walk-answer";
    answer.textContent = "The office is recording the departure…";
    try {
      const response = await officeCall("/world/walks", { method: "POST", body: walkState.pending.payload });
      if (!response.ok || response.body?.error === "bounce") {
        answer.classList.add("refusal");
        answer.textContent = [response.body?.defect || `the door answered ${response.status}`, response.body?.hint].filter(Boolean).join(" — ");
        confirm.disabled = false;
        return;
      }
      answer.classList.add("success");
      answer.textContent = `${state.handle} departed: ${Number(response.body.leg_m ?? 0).toLocaleString()} m, ETA ${formatEtaCrossings(response.body.eta_crossings ?? 0)}.`;
      walkState.pending = null;
      await pollWalkers();
    } catch (error) {
      answer.classList.add("refusal");
      answer.textContent = `The walk door could not be reached — ${error.message}`;
      confirm.disabled = false;
    }
  }

  function openStakeSheet(card, { mode = "stake", max = "" } = {}) {
    root.querySelectorAll(".wv-act-sheet").forEach((sheet) => sheet.remove());
    const sheet = document.createElement("div");
    sheet.className = "wv-act-sheet";
    sheet.dataset.mode = mode;
    sheet.dataset.mark = card.dataset.id;
    if (max !== "") sheet.dataset.max = String(max);
    const balance = Number.isInteger(state.actorBalance) ? state.actorBalance : null;
    if (mode === "stake" && balance !== null) sheet.dataset.balance = String(balance);
    sheet.innerHTML = `<div class="wv-act-head"><b>${mode === "unstake" ? "Take stamps back" : "Back this mark"}</b>`
      + `<button type="button" class="wv-act-close" aria-label="Close">×</button></div>`
      + `<div class="wv-backers"><span>reading who backs this mark…</span></div>`
      + (mode === "stake"
        ? `<p class="wv-act-note">you hold <b class="wv-stamp-holding">✦ ${balance ?? (state.actorBalance === null ? "…" : "unavailable")}</b></p>`
        : "")
      + `<div class="wv-act-row"><label>stamps <input class="wv-act-amount" type="number" min="1" step="1"${max !== "" ? ` max="${Number(max)}"` : balance !== null ? ` max="${balance}"` : ""}></label>`
      + `<button type="button" class="wv-act-preview-btn">preview the sealed line</button></div>`
      + `<div class="wv-act-preview" hidden><pre></pre><p class="wv-act-note">The office fills the signature. Escrow moves now; ✦weight updates at the next Settlement.</p>`
      + `<div class="wv-act-row"><button type="button" class="wv-act-confirm" disabled>confirm and send</button></div></div>`
      + `<p class="wv-act-answer" hidden></p>`;
    card.appendChild(sheet);
    loadStakeBackers(sheet);
    $(sheet, ".wv-act-amount").focus();
  }

  async function loadStakeBackers(sheet) {
    const host = $(sheet, ".wv-backers");
    if (!host) return;
    try {
      const response = await fetch(officeUrl(`/world/stake?mark=${encodeURIComponent(sheet.dataset.mark)}`), {
        headers: { accept: "application/json" },
        credentials: "omit",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.error === "bounce") throw new Error(body?.defect || `the door answered ${response.status}`);
      if (!sheet.isConnected) return;
      const summary = summarizeBackers(body.holders, 5);
      const total = Math.max(0, Number(body.escrow ?? 0));
      host.innerHTML = `<b>✦ ${total.toLocaleString()} backed by</b>`
        + (summary.top.length
          ? summary.top.map((row) => `<div class="wv-backer"><span>${esc(row.holder)}</span><span class="amount">✦ ${row.amount.toLocaleString()}</span></div>`).join("")
            + (summary.others ? `<div>and ${summary.others} other${summary.others === 1 ? "" : "s"}</div>` : "")
          : `<div>no one yet</div>`);
    } catch (error) {
      if (sheet.isConnected) host.textContent = `backer list unavailable — ${error.message}`;
    }
  }

  function previewStakeSheet(sheet) {
    const amountEl = $(sheet, ".wv-act-amount");
    const amount = Number(amountEl.value);
    const max = Number(sheet.dataset.max || 0);
    const stakeLimit = sheet.dataset.mode === "stake"
      ? clampStakeAmount(amount, state.actorBalance)
      : null;
    const line = previewStakeLedgerLine({
      mode: sheet.dataset.mode,
      handle: state.handle,
      mark: sheet.dataset.mark,
      stamps: amount,
    });
    const answer = $(sheet, ".wv-act-answer");
    if (sheet.dataset.mode === "stake" && stakeLimit?.balance === null) {
      answer.hidden = false;
      answer.className = "wv-act-answer refusal";
      answer.textContent = `The stamp balance for ${state.handle} is not available yet.`;
      return;
    }
    if (stakeLimit?.exceeded) {
      amountEl.value = stakeLimit.amount > 0 ? String(stakeLimit.amount) : "";
      answer.hidden = false;
      answer.className = "wv-act-answer refusal";
      answer.textContent = `${state.handle} holds ✦ ${stakeLimit.balance}; the amount was clamped from ${stakeLimit.requested} to ${stakeLimit.balance}. Preview the balance-sized act again.`;
      return;
    }
    if (!line || (max > 0 && amount > max)) {
      answer.hidden = false;
      answer.className = "wv-act-answer refusal";
      answer.textContent = max > 0 && amount > max
        ? `${state.handle} has ${max} stamps to take back from this mark.`
        : "Enter a positive whole number of stamps.";
      return;
    }
    $(sheet, ".wv-act-preview pre").textContent = line;
    $(sheet, ".wv-act-preview").hidden = false;
    $(sheet, ".wv-act-confirm").disabled = false;
    answer.hidden = true;
  }

  async function confirmStakeSheet(sheet) {
    const mode = sheet.dataset.mode;
    const confirm = $(sheet, ".wv-act-confirm");
    const answer = $(sheet, ".wv-act-answer");
    const payload = {
      mark: sheet.dataset.mark,
      stamps: Number($(sheet, ".wv-act-amount").value),
      handle: state.handle,
    };
    confirm.disabled = true;
    answer.hidden = false;
    answer.className = "wv-act-answer";
    answer.textContent = "The office is sealing the line…";
    try {
      const response = await officeCall(mode === "unstake" ? "/world/unstake" : "/world/stake", { method: "POST", body: payload });
      const rendered = worldStakeAnswer(response.body, mode);
      answer.classList.add(rendered.kind);
      answer.textContent = rendered.text;
      if (response.ok && rendered.kind === "success") {
        await Promise.all([loadIdentityWorld(), loadActorBalance()]);
        applyWorldLayer();
        reRender(rendered.text);
      } else {
        confirm.disabled = false;
      }
    } catch (error) {
      answer.classList.add("refusal");
      answer.textContent = `The stake door could not be reached — ${error.message}`;
      confirm.disabled = false;
    }
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
    $(root, ".pos").textContent = formatCardinalPosition(state.cam);
    $(root, ".wv-where").innerHTML = `standing <b>${esc(formatCardinalPosition(state.cam))}</b>`;
    const cn = $(root, ".crossnow");
    if (cn) cn.innerHTML = state.crossingOverride
      ? `crossing <b>${state.crossing}</b> <span class="wv-quiet">· time-travelling</span>`
      : `crossing <b>${state.crossing}</b> <span class="crosslive-tag">· live</span>`;
    if (state.view === "telling") renderTelling();
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
  // One view remains, so this no longer switches anything — it is kept because
  // `.stand` still calls switchView("telling") to come back from a stand-here jump,
  // and because state.view is the seam a future second view would re-enter through.
  function switchView(v) {
    state.view = v;
    $(root, ".wv-telling").hidden = v !== "telling";
    renderCurrent();
  }

  // ───────── events ─────────
  let devTimer = null;
  root.addEventListener("click", (e) => {
    const actor = e.target.closest("[data-act-as]");
    if (actor) { selectActor(actor.dataset.actAs); return; }
    if (e.target.closest(".wv-walk-confirm")) { confirmSelectedWalk(); return; }
    const stakeOpen = e.target.closest("[data-stake-open]");
    if (stakeOpen) { openStakeSheet(stakeOpen.closest(".wv-card"), { mode: "stake" }); return; }
    const unstakeOpen = e.target.closest("[data-unstake-open]");
    if (unstakeOpen) {
      openStakeSheet(unstakeOpen.closest(".wv-card"), { mode: "unstake", max: unstakeOpen.dataset.max });
      return;
    }
    const sheet = e.target.closest(".wv-act-sheet");
    if (sheet) {
      if (e.target.closest(".wv-act-close")) sheet.remove();
      else if (e.target.closest(".wv-act-preview-btn")) previewStakeSheet(sheet);
      else if (e.target.closest(".wv-act-confirm")) confirmStakeSheet(sheet);
      return;
    }
    // the viewport controls (P2): fit / follow / grid
    if (e.target.closest(".wv-map-home")) { mapCtx?.fitAll?.(); return; }
    const fbtn = e.target.closest(".wv-map-follow");
    if (fbtn) { if (!mapCtx) return; mapCtx.follow = !mapCtx.follow; fbtn.classList.toggle("on", mapCtx.follow); if (mapCtx.follow) mapCtx.lockOn(); return; }
    const gbtn = e.target.closest(".wv-map-grid");
    if (gbtn) { if (!mapCtx?.toggleGrid) return; gbtn.classList.toggle("on", !!mapCtx.toggleGrid()); return; }
    const fpbtn = e.target.closest(".wv-map-fp");
    if (fpbtn) { if (!mapCtx?.toggleFp) return; fpbtn.classList.toggle("on", !!mapCtx.toggleFp()); return; }
    const baseChip = e.target.closest("[data-world-base]");
    if (baseChip && identityResolved()) {
      state.baseLayer = baseChip.dataset.worldBase;
      applyWorldLayer();
      const y = window.scrollY; renderTelling(); window.scrollTo(0, y);
      return;
    }
    const filterChip = e.target.closest("[data-mark-filter]");
    if (filterChip && !filterChip.disabled) {
      state.markFilter = filterChip.dataset.markFilter;
      const y = window.scrollY; renderTelling(); window.scrollTo(0, y);
      return;
    }
    // (key sign-in UI removed 2026-07-24 — identity comes from the island's
    // GitHub pill via the pm_key bridge; the viewer collects no credentials)
    // investigate: back-crumb / tree node / card
    const back = e.target.closest(".wv-back");
    if (back) { const card = back.closest(".wv-card"); card._stack.pop(); renderExpansion(card); return; }
    const tn = e.target.closest(".wv-tnode, .wv-wnode"); // upward-context names drill too
    if (tn) {
      const card = tn.closest(".wv-card");
      if (card && tn.dataset.id) {
        selectMark(tn.dataset.id);
        card._stack.push(tn.dataset.id);
        renderExpansion(card);
      }
      return;
    }
    const stand = e.target.closest(".stand");
    if (stand) {
      if (identityResolved()) chooseWalkPoint(+stand.dataset.x, +stand.dataset.y);
      else { state.cam = { x: +stand.dataset.x, y: +stand.dataset.y }; switchView("telling"); }
      return;
    }
    if (e.target.closest(".wv-dev-toggle")) { const dev = $(root, ".wv-dev"); dev.hidden = !dev.hidden; if (!dev.dataset.built) { buildDevPane(); dev.dataset.built = "1"; } return; }
    if (e.target.closest(".wv-dev-reset")) { state.dials = { ...DIALS }; buildDevPane(); renderCurrent(); return; }
    if (e.target.closest(".crosslive")) { state.crossingOverride = false; state.crossing = liveCrossing(); const i = root.querySelector(".crossover"); if (i) i.value = state.crossing; const l = root.querySelector(".crossovlbl"); if (l) l.textContent = "live · " + state.crossing; reRender(); return; }
    const b = e.target.closest("button.ctl, .wv-card");
    if (!b) return;
    if (b.dataset.x !== undefined && b.classList.contains("ctl")) { walkState.actorBound = false; state.cam = { x: +b.dataset.x, y: +b.dataset.y }; renderCurrent(); }
    else if (b.dataset.dx !== undefined) { walkState.actorBound = false; state.cam.x += (+b.dataset.dx) * state.step; state.cam.y += (+b.dataset.dy) * state.step; renderCurrent(); }
    else if (b.classList.contains("wv-card") && b.dataset.id) {
      if (!selectMark(b.dataset.id)) {
        b._stack = [];
        renderExpansion(b);
        return;
      }
      if (b._stack?.length) { b._stack = []; renderExpansion(b); } else { b._stack = [b.dataset.id]; renderExpansion(b); }
    }
  });
  const onViewerKeydown = (event) => {
    if (event.key !== "Escape") return;
    if (!markInteraction.getState().selectedId && !walkState.destination) return;
    clearSelectionAndDestination();
  };
  document.addEventListener("keydown", onViewerKeydown);
  function openCardById(id) {
    const card = [...root.querySelectorAll(".wv-card")].find((c) => c.dataset.id === id);
    if (card) { card._stack = [id]; renderExpansion(card); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  const markCellAt = (target) =>
    target?.closest?.(".wv-card[data-id], .wv-tnode[data-id], .wv-wnode[data-id]") ?? null;
  root.addEventListener("mouseover", (e) => {
    const cell = markCellAt(e.target);
    if (cell) markInteraction.hover(cell.dataset.id);
  });
  root.addEventListener("mouseout", (e) => {
    const from = markCellAt(e.target);
    if (!from) return;
    const to = markCellAt(e.relatedTarget);
    markInteraction.hover(to?.dataset.id ?? null);
  });
  root.addEventListener("mouseleave", () => markInteraction.hover(null));
  root.addEventListener("input", (e) => {
    if (e.target.closest(".wv-act-sheet")) {
      const sheet = e.target.closest(".wv-act-sheet");
      $(sheet, ".wv-act-preview").hidden = true;
      $(sheet, ".wv-act-confirm").disabled = true;
      $(sheet, ".wv-act-answer").hidden = true;
      return;
    }
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
  // Identity is UI memory, not door law. The token is presented on every signed
  // call and the selected resident is included in every act payload. Only the
  // selected handle is sticky; the office remains choose-per-call.
  const pmKey = () => { try { return localStorage.getItem("pm_key") || null; } catch { return null; } };
  const authHeaders = () => { const k = pmKey(); return k ? { Authorization: "Bearer " + k } : {}; };
  async function loadIdentityWorld() {
    const options = { headers: authHeaders(), credentials: "same-origin" };
    const [composed, portfolio] = await Promise.all([
      fetchWorldState([officeUrl("/world/state")], options),
      fetch(officeUrl("/world/my-marks"), options).then(async (r) => {
        if (!r.ok) throw new Error(`${officeUrl("/world/my-marks")} → ${r.status}`);
        return r.json();
      }),
    ]);
    data.myWorld = composed.json;
    state.portfolio = portfolio;
    state.mineIds = new Set(["drafts", "published", "backed"]
      .flatMap((category) => (portfolio[category] ?? []).map((mark) => mark.id ?? mark.mark))
      .filter(Boolean));
    if (state.baseLayer === "mine") applyWorldLayer();
  }
  async function resolveIdentity() {
    const options = { headers: authHeaders(), credentials: "same-origin" };
    if (pmKey()) {
      try {
        const r = await fetch(officeUrl("/ops/whoami"), options);
        state.whoami = r.ok ? await r.json() : null;
      } catch { state.whoami = null; }
    } else {
      state.whoami = null;
    }
    const toggle = $(root, ".wv-dev-toggle");
    if (toggle) toggle.hidden = !(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || state.whoami?.principal);
    // stand/move rides the same dev gate (dev-only since walk shipped — see the markup note)
    const standmove = $(root, ".wv-standmove");
    if (standmove) standmove.hidden = toggle ? toggle.hidden : true;
    const handles = state.whoami?.handles ?? [];
    let remembered = "";
    try { remembered = localStorage.getItem(ACT_AS_KEY) || ""; } catch {}
    state.handle = handles.includes(remembered) ? remembered : (handles[0] ?? "");
    if (handles.length) {
      try {
        await Promise.all([loadIdentityWorld(), loadActorHome(), loadActorBalance()]);
      }
      catch {
        data.myWorld = null;
        state.portfolio = null;
        state.mineIds = new Set();
        state.baseLayer = "true";
        if (state.markFilter === "mine") state.markFilter = "everything";
        applyWorldLayer();
      }
    } else {
      data.myWorld = null;
      state.portfolio = null;
      state.mineIds = new Set();
      state.baseLayer = "true";
      if (state.markFilter === "mine") state.markFilter = "everything";
      applyWorldLayer();
    }
    renderPresets();
    renderIdentity();
    renderWalkDestinations();
    syncActorPosition({ moveCamera: true });
    mountWalkers();
    if (state.view === "telling") renderTelling(); // the chips + filter reflect the new identity
  }

  async function selectActor(handle) {
    if (!(state.whoami?.handles ?? []).includes(handle)) return;
    state.handle = handle;
    try { localStorage.setItem(ACT_AS_KEY, handle); } catch {}
    state.actorBalance = null;
    state.actorHome = null;
    walkState.actorBound = true;
    invalidateWalkPreview();
    root.querySelectorAll(".wv-act-sheet").forEach((sheet) => sheet.remove());
    renderIdentity();
    renderWalkDestinations();
    renderTelling();
    await Promise.all([loadActorHome(), loadActorBalance()]);
    await pollWalkers();
    syncActorPosition({ moveCamera: true });
    if (walkState.destination) previewSelectedWalk();
  }

  function renderIdentity() {
    const box = $(root, ".wv-identity");
    if (!box) return;
    const handles = state.whoami?.handles ?? [];
    box.innerHTML = handles.length
      ? `<h2>Act as</h2><div class="handlepick">${handles.map((handle) =>
          `<button type="button" class="ctl handleopt${handle === state.handle ? " on" : ""}" data-act-as="${esc(handle)}">${esc(handle)}${handle === state.handle
            ? ` · <span class="wv-stamp-balance">✦ ${Number.isInteger(state.actorBalance) ? state.actorBalance : state.actorBalance === null ? "…" : "unavailable"}</span>`
            : ""}</button>`).join("")}</div>`
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
        const r = await fetch(state.dataSource, { credentials: "omit" });
        const asOf = r.headers.get("x-postmark-as-of");
        if (r.ok && asOf && asOf !== state.asOf) {
          const json = await r.json();
          state.asOf = asOf;
          data.trueWorld = json;
          if ((state.whoami?.handles ?? []).length) await loadIdentityWorld();
          applyWorldLayer();
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

  return {
    rerender: renderCurrent,
    stop: () => {
      clearInterval(clock);
      clearInterval(walkState.timer);
      document.removeEventListener("keydown", onViewerKeydown);
    },
  };
}

// ───────── tiny helpers (display only) ─────────
function firstWords(body, n) {
  const s = String(body ?? "").replace(/^\s*(sits|region|kind|at|date|slot|value|household|mark|parent)\s*:\s*/i, "").trim().replace(/\s+/g, " ");
  const w = s.split(" ").slice(0, n).join(" ");
  return w + (s.split(" ").length > n ? "…" : "");
}
