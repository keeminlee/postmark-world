// geometry.mjs — the ONE definition of a mark's rect and of containment.
//
// Pure and browser-safe (zero imports, no node:*). Extracted from marks-fold.mjs
// so both the fold (Node, disk) and the verbs (browser bundle) import the same
// `contains` — the one-contains invariant that keeps the fold's computed edges
// and the lint's "you cannot lie with an edge" from ever disagreeing, now
// expressed one level down where a browser bundle can reach it. marks-fold.mjs
// re-exports these so mark-lint.mjs's existing import path is unchanged.
//
// Rects are centered on `at`, sized by `extent`.
export const rect = (mk) => ({ x: mk.at?.x ?? 0, y: mk.at?.y ?? 0, w: mk.extent?.w ?? 1, h: mk.extent?.h ?? 1 });
export function overlapArea(a, b) {
  const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}
export const contains = (outer, inner) => overlapArea(outer, inner) >= 0.99 * inner.w * inner.h;

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE — a mark's true footprint as a set of grid cells (Keemin's ruling,
// 2026-07-23: compute a mark's extent as the set of grid coordinates it
// encompasses, allow polygon-style definition for irregular things like the
// river). This is ADDITIVE: the three primitives above are untouched and remain
// the analytic rect path, so rect-vs-rect stays byte-identical for the whole
// current record. `marksContain`/`marksOverlapArea` below use coverage cell-sets
// ONLY when a party is irregular (carries a polygon ring or a resolved feature
// polyline); otherwise they delegate to the analytic `contains`/`overlapArea`.
//
// Grid resolution for coverage is a DIAL. The 1 m grid stays the coordinate
// canon (at/extent are 1 m); coverage COARSENS to keep set sizes tractable
// (town ≈ 7.5×10.5 km). Movable by ruling, never silently.
export const COVERAGE_CELL_M = 5;
// A rasterization is refused past this many cells — coverage is for irregular /
// small marks, never map-scale rects (those stay analytic). marksContain falls
// back to the analytic bbox rather than materialize an intractable set.
const MAX_COVERAGE_CELLS = 1_000_000;

const cellKey = (cx, cy) => cx + "," + cy;
const cellIndex = (v, cell) => Math.floor(v / cell);
const cellCenter = (i, cell) => (i + 0.5) * cell;
const lerp = (a, b, t) => a + (b - a) * t;

// the polygon ring of a mark, if it carries one (SVG-points style: a closed ring
// of grid-meter vertices, `[{x,y}…]` or `[[x,y]…]`). ≥3 vertices to be a shape.
export function polygonOf(mark) {
  const pts = mark?.points;
  if (!Array.isArray(pts) || pts.length < 3) return null;
  return pts.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }));
}
// A resolved feature swath: { line: [{x,y,w_m?}…], width? } — the caller (fold)
// follows a mark's `feature:` link into the skeleton and passes the polyline here
// (geometry.mjs stays pure: it never reads the skeleton itself).
const hasFeatureLine = (feature) => !!(feature && Array.isArray(feature.line) && feature.line.length >= 2);

// Is this mark expressed IRREGULARLY (a real shape), vs a plain at/extent rect?
export function isIrregular(mark, feature = null) {
  return !!(polygonOf(mark) || hasFeatureLine(feature));
}

// coverage(mark, {cell, feature}) → Set<cellKey>. Rasterizer by outward
// expression: polygon ring · feature polyline+width · rect box. Returns null if
// the rasterization would exceed MAX_COVERAGE_CELLS (caller falls back analytic).
export function coverage(mark, { cell = COVERAGE_CELL_M, feature = null } = {}) {
  const poly = polygonOf(mark);
  if (poly) return rasterizePolygon(poly, cell);
  if (hasFeatureLine(feature)) return rasterizePolyline(feature.line, feature.width, cell);
  return rasterizeRect(rect(mark), cell);
}

function rasterizeRect(r, cell) {
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, y0 = r.y - r.h / 2, y1 = r.y + r.h / 2;
  const cx0 = cellIndex(x0, cell), cx1 = cellIndex(x1, cell), cy0 = cellIndex(y0, cell), cy1 = cellIndex(y1, cell);
  if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_COVERAGE_CELLS) return null;
  const set = new Set();
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const px = cellCenter(cx, cell), py = cellCenter(cy, cell);
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) set.add(cellKey(cx, cy));
  }
  return set;
}

function rasterizePolygon(ring, cell) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const p of ring) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
  const cx0 = cellIndex(minx, cell), cx1 = cellIndex(maxx, cell), cy0 = cellIndex(miny, cell), cy1 = cellIndex(maxy, cell);
  if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_COVERAGE_CELLS) return null;
  const set = new Set();
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++)
    if (pointInPolygon(cellCenter(cx, cell), cellCenter(cy, cell), ring)) set.add(cellKey(cx, cy));
  return set;
}

// A polyline+width swath. Width may be per-vertex (`w_m`, as the channel
// centerline carries) or a scalar `width`; the half-width interpolates along each
// segment. Iterated PER SEGMENT (local bbox), never the whole map bbox, so a long
// thin river stays tractable.
function rasterizePolyline(line, width, cell) {
  const set = new Set();
  const half = (i) => (line[i]?.w_m ?? line[i]?.w ?? width ?? cell) / 2;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], hw = Math.max(half(i), half(i + 1));
    const cx0 = cellIndex(Math.min(a.x, b.x) - hw, cell), cx1 = cellIndex(Math.max(a.x, b.x) + hw, cell);
    const cy0 = cellIndex(Math.min(a.y, b.y) - hw, cell), cy1 = cellIndex(Math.max(a.y, b.y) + hw, cell);
    if (set.size + (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_COVERAGE_CELLS) return null;
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const px = cellCenter(cx, cell), py = cellCenter(cy, cell);
      const { d, t } = distToSegment(px, py, a.x, a.y, b.x, b.y);
      if (d <= lerp(half(i), half(i + 1), t)) set.add(cellKey(cx, cy));
    }
  }
  return set;
}

function pointInPolygon(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}
function pointInRect(px, py, r) { return px >= r.x - r.w / 2 && px <= r.x + r.w / 2 && py >= r.y - r.h / 2 && py <= r.y + r.h / 2; }

// marksContain(outer, inner) — containment that HONORS TRUE SHAPE. Regular vs
// regular delegates to the analytic `contains` (byte-identical). Otherwise it is
// a cell-set op: ≥`frac` of the inner's coverage cells fall inside the outer
// (outer rect tested analytically per cell; outer irregular tested by membership
// in its coverage set). Falls back to analytic bbox if a coverage set would be
// intractable — never blocks, never lies more coarsely than the old bbox rule.
export function marksContain(outer, inner, { cell = COVERAGE_CELL_M, outerFeature = null, innerFeature = null, frac = 0.99 } = {}) {
  const oIrr = isIrregular(outer, outerFeature), iIrr = isIrregular(inner, innerFeature);
  if (!oIrr && !iIrr) return contains(rect(outer), rect(inner));
  const innerCells = coverage(inner, { cell, feature: innerFeature });
  if (!innerCells) return contains(rect(outer), rect(inner)); // inner too big to rasterize → analytic
  if (innerCells.size === 0) return false;
  let inOuter;
  if (oIrr) {
    const outerCells = coverage(outer, { cell, feature: outerFeature });
    if (!outerCells) return contains(rect(outer), rect(inner));
    inOuter = (k) => outerCells.has(k);
  } else {
    const ro = rect(outer);
    inOuter = (k) => { const [cx, cy] = k.split(",").map(Number); return pointInRect(cellCenter(cx, cell), cellCenter(cy, cell), ro); };
  }
  let covered = 0;
  for (const k of innerCells) if (inOuter(k)) covered++;
  return covered / innerCells.size >= frac;
}

// marksOverlapArea(a, b) — overlap area honoring true shape. Regular vs regular
// delegates to the analytic `overlapArea` (byte-identical); otherwise it is the
// count of shared coverage cells × cell². Falls back to analytic if intractable.
export function marksOverlapArea(a, b, { cell = COVERAGE_CELL_M, aFeature = null, bFeature = null } = {}) {
  const aIrr = isIrregular(a, aFeature), bIrr = isIrregular(b, bFeature);
  if (!aIrr && !bIrr) return overlapArea(rect(a), rect(b));
  const ca = coverage(a, { cell, feature: aFeature }), cb = coverage(b, { cell, feature: bFeature });
  if (!ca || !cb) return overlapArea(rect(a), rect(b));
  const [small, big] = ca.size <= cb.size ? [ca, cb] : [cb, ca];
  let shared = 0;
  for (const k of small) if (big.has(k)) shared++;
  return shared * cell * cell;
}
