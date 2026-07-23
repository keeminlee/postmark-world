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
