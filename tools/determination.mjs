// determination.mjs — the region carve. ECONOMY.md §9.2, implemented as geometry.
//
//   "a mark defends each cell it covers at effective-stamps / area, contests are
//    INTERSECTION-ONLY, and rival densities are compared REGION BY REGION […] a
//    dense pond determines its own cells inside a thin meadow; the meadow keeps
//    the rest."
//
// This replaces the site-cluster mechanism (`overlap_site_frac: 0.30`), which was
// never ruled and which CHAINED: a mark overlapping 30% of a neighbour joined its
// cluster, that neighbour's neighbour joined too, and one slot ended up holding a
// whole nesting tree as if its members were rival claims on one site. The Pando
// slot was 28 marks — a peak, its porch, its garden, five trees, a lantern hook —
// scored as one contest with a 46% top share, which is permanently vague by
// construction. Nothing there was ever in dispute; the mechanism manufactured it.
//
// THE CARVE IS DERIVED, NEVER STORED. Authors' claim rects stay whole on disk —
// nobody's mark is edited, split, or shrunk by a contest. What the fold publishes
// is an OVERLAY: for each claim, which regions of it are determined to whom.
// Rect-minus-rect is an L-shape, so the overlay speaks in rect-LISTS.
//
// Method, per overlap neighborhood (a connected component of the overlap graph):
//   1. coordinate-compress the members' edges into a grid of cells
//   2. each cell goes to the DENSEST claim covering it
//   3. a cell covered by exactly one CREDENTIAL HOUSEHOLD is not a contest — it is
//      that household's own composition (ownership composes; a porch inside its
//      own peak was never a rival). Only cells where two households meet are
//      contests, and only those carry the hysteresis band.
//   4. cells are merged back into maximal rects for the overlay
//
// 0-area predicates are NOT here: they keep their existing spread rule (a
// predicate has no extent of its own, it spreads over its parent — §9.2 — which
// the fold already expresses by folding predicate stamps up into the parent's
// weight, and by rivaling predicates in (parent, slot) rather than on ground).

// A claim as this module wants it: { id, cred, rect: {x,y,w,h}, effective }.
// `effective` is the mark's effective stamps (own + everything that fans up into
// it under the consent table). Density is effective/area — the whole point of
// §9.2: to hold ground you need conviction proportional to the ground.
export const densityOf = (claim) => {
  const a = Math.max(claim.rect.w * claim.rect.h, 1e-9);
  return claim.effective / a;
};

const lo = (r, axis) => (axis === "x" ? r.x - r.w / 2 : r.y - r.h / 2);
const hi = (r, axis) => (axis === "x" ? r.x + r.w / 2 : r.y + r.h / 2);
const overlaps = (a, b) =>
  lo(a, "x") < hi(b, "x") && lo(b, "x") < hi(a, "x") && lo(a, "y") < hi(b, "y") && lo(b, "y") < hi(a, "y");

// The cell key is GEOMETRIC, not an index — "x0,y0,x1,y1" in grid meters. Index
// keys would shift the moment a new claim arrives and re-cut the compression, so
// every incumbent would silently lose its seat to a bookkeeping change. A prior
// winner is looked up by whichever prior cell CONTAINS the new cell's centre,
// which is what lets the band survive a re-cut of the grid around it.
const cellKey = (x0, y0, x1, y1) => `${x0},${y0},${x1},${y1}`;

function prevWinnerAt(prevCells, cx, cy) {
  if (!prevCells) return undefined;
  for (const key of Object.keys(prevCells)) {
    const [x0, y0, x1, y1] = key.split(",").map(Number);
    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) return prevCells[key];
  }
  return undefined;
}

// connected components of "these two claims overlap at all"
function neighborhoods(claims) {
  const parent = claims.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < claims.length; i++)
    for (let j = i + 1; j < claims.length; j++)
      if (overlaps(claims[i].rect, claims[j].rect)) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
  const groups = new Map();
  claims.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  return [...groups.values()].filter((g) => g.length > 1);
}

// Merge a set of grid cells belonging to one winner back into maximal rects.
// Greedy: run each row horizontally, then fuse vertically adjacent identical runs.
// The overlay is for reading and rendering, so a tidy handful of rects beats a
// thousand cells; the cell set it came from is exact either way.
function mergeCells(cells, xs, ys) {
  const inRow = new Map(); // row index -> sorted column indices
  for (const [i, j] of cells) { if (!inRow.has(j)) inRow.set(j, []); inRow.get(j).push(i); }
  const runs = []; // { j, i0, i1 }
  for (const [j, cols] of inRow) {
    cols.sort((a, b) => a - b);
    let start = cols[0], prev = cols[0];
    for (let k = 1; k <= cols.length; k++) {
      const c = cols[k];
      if (c !== prev + 1) { runs.push({ j, i0: start, i1: prev }); start = c; }
      prev = c;
    }
  }
  runs.sort((a, b) => a.i0 - b.i0 || a.i1 - b.i1 || a.j - b.j);
  const out = [];
  let k = 0;
  while (k < runs.length) {
    const { i0, i1 } = runs[k];
    let j0 = runs[k].j, j1 = runs[k].j, m = k + 1;
    while (m < runs.length && runs[m].i0 === i0 && runs[m].i1 === i1 && runs[m].j === j1 + 1) { j1 = runs[m].j; m++; }
    const x0 = xs[i0], x1 = xs[i1 + 1], y0 = ys[j0], y1 = ys[j1 + 1];
    out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
    k = m;
  }
  return out;
}

/**
 * carve(claims, { prevCells, determine_pct, release_pct })
 *
 * claims: [{ id, cred, rect:{x,y,w,h}, effective }]
 * prevCells: the previous fold's cell → winner map (hysteresis incumbency)
 *
 * → { determination, contests, cells, neighborhoods }
 *   determination[id] = { held:[rect], lost:[{to,x,y,w,h}], vague:[rect],
 *                         area, held_area, lost_area, vague_area }
 *   contests = [{ region:{x,y,w,h}, claims:[[id,density]…], determined, share, area }]
 *   cells    = { "x0,y0,x1,y1": winnerId }  (carried into the next fold)
 */
export function carve(claims, { prevCells = null, determine_pct = 0.5, release_pct = 0.4 } = {}) {
  const determination = {};
  const contests = [];
  const cells = {};
  const groups = neighborhoods(claims);

  for (const group of groups) {
    // 1. coordinate compression — every claim edge in this neighborhood becomes a cut
    const xs = [...new Set(group.flatMap((c) => [lo(c.rect, "x"), hi(c.rect, "x")]))].sort((a, b) => a - b);
    const ys = [...new Set(group.flatMap((c) => [lo(c.rect, "y"), hi(c.rect, "y")]))].sort((a, b) => a - b);
    const won = new Map();      // winnerId -> [[i,j], …]
    const lostBy = new Map();   // loserId -> Map(winnerId -> [[i,j], …])   — to another household
    const withinBy = new Map(); // loserId -> Map(winnerId -> [[i,j], …])   — to its own household's finer mark
    const vagueBy = new Map();  // claimId -> [[i,j], …]

    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < ys.length; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
        const covering = group.filter((c) =>
          cx > lo(c.rect, "x") && cx < hi(c.rect, "x") && cy > lo(c.rect, "y") && cy < hi(c.rect, "y"));
        if (!covering.length) continue;

        const ranked = covering
          .map((c) => [c, densityOf(c)])
          .sort((a, b) => b[1] - a[1] || (a[0].id < b[0].id ? -1 : 1)); // ties resolve by id, so a fold is deterministic

        // 2. is this cell a CONTEST? Only if two credential households meet here.
        // One household's own marks composing (a porch inside its own peak) is
        // not a dispute — it is ownership, and Keemin's grain ruling scopes every
        // conflict rule to the credential household. The densest of that
        // household's claims simply holds the cell.
        const households = new Set(covering.map((c) => c.cred));
        const contested = households.size > 1;

        let winner = ranked[0][0].id, share = 1, determined = winner;
        if (contested) {
          const total = ranked.reduce((a, [, d]) => a + d, 0);
          // Nobody has backed ANY of the claims meeting here. That is not a live
          // contest — it is ground no one has yet said anything about, and there
          // is nothing to compare. It resolves to nobody and is reported as vague
          // on each claim, but it is not a rivalry: ⚔ should mean two households
          // are actually pushing, not merely that two rectangles touch.
          if (total <= 0) {
            for (const c of covering) { if (!vagueBy.has(c.id)) vagueBy.set(c.id, []); vagueBy.get(c.id).push([i, j]); }
            continue;
          }
          share = ranked[0][1] / total;
          const prev = prevWinnerAt(prevCells, cx, cy);
          const prevClaim = prev !== undefined ? ranked.find(([c]) => c.id === prev) : undefined;
          determined = null;
          if (prevClaim && prevClaim[1] / total >= release_pct) determined = prev;         // incumbent holds until it falls below release
          if (determined === null && share > determine_pct) determined = ranked[0][0].id;  // challenger takes only past determine
          winner = determined;
          contests.push({ _i: i, _j: j, _xs: xs, _ys: ys,
            claims: ranked.map(([c, d]) => [c.id, d]), determined, share });
        }

        if (winner === null) {
          for (const c of covering) { if (!vagueBy.has(c.id)) vagueBy.set(c.id, []); vagueBy.get(c.id).push([i, j]); }
        } else {
          cells[cellKey(xs[i], ys[j], xs[i + 1], ys[j + 1])] = winner;
          if (!won.has(winner)) won.set(winner, []);
          won.get(winner).push([i, j]);
          const winnerCred = ranked.find(([c]) => c.id === winner)[0].cred;
          for (const c of covering) {
            if (c.id === winner) continue;
            // Ground taken by your OWN household is not a loss, it is your own
            // composition — a peak whose garden sits inside it has not lost the
            // garden's ground to anybody. Keeping these in one bucket would have a
            // renderer telling vermillion she had lost a tenth of her mountain to
            // her own trees. Same overlay, two words, because they are two things.
            const bucket = c.cred === winnerCred ? withinBy : lostBy;
            if (!bucket.has(c.id)) bucket.set(c.id, new Map());
            const m = bucket.get(c.id);
            if (!m.has(winner)) m.set(winner, []);
            m.get(winner).push([i, j]);
          }
        }
      }
    }

    // 3. merge back into rects, per claim
    for (const c of group) {
      const held = mergeCells(won.get(c.id) ?? [], xs, ys);
      const vague = mergeCells(vagueBy.get(c.id) ?? [], xs, ys);
      const flatten = (src) => {
        const out = [];
        for (const [to, cs] of src.get(c.id) ?? new Map())
          for (const r of mergeCells(cs, xs, ys)) out.push({ to, ...r });
        return out;
      };
      const lost = flatten(lostBy), within = flatten(withinBy);
      const area = (rs) => rs.reduce((a, r) => a + r.w * r.h, 0);
      determination[c.id] = {
        held, within, lost, vague,
        area: c.rect.w * c.rect.h,
        held_area: area(held), within_area: area(within), lost_area: area(lost), vague_area: area(vague),
      };
    }
  }

  // contests carry their region as a rect; the compression indices were internal
  const out = contests.map((k) => {
    const x0 = k._xs[k._i], x1 = k._xs[k._i + 1], y0 = k._ys[k._j], y1 = k._ys[k._j + 1];
    return {
      kind: "region",
      region: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 },
      area: (x1 - x0) * (y1 - y0),
      claims: k.claims, determined: k.determined, share: k.share,
    };
  });
  // adjacent cells of one identical contest are one contest to a reader
  const merged = [];
  const seen = new Map();
  for (const c of out) {
    const sig = c.claims.map(([id]) => id).sort().join("|") + "::" + c.determined;
    if (!seen.has(sig)) { seen.set(sig, { ...c, regions: [c.region] }); merged.push(seen.get(sig)); }
    else { const m = seen.get(sig); m.regions.push(c.region); m.area += c.area; }
  }
  for (const m of merged) { delete m.region; }

  return { determination, contests: merged, cells, neighborhoods: groups.length };
}
