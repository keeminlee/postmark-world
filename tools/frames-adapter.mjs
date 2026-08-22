// frames-adapter.mjs — today's scattered state → one frame graph (rung 8).
//
// The migration's READ half, and its proof. The world holds position in three
// unconnected places today:
//
//   · WALK ledger        → an entity's world (x,y), fresh on every departure.
//   · OCCUPANCY (threshold) → the mark stack an entity has entered and not left.
//   · HOLDINGS (attach)  → which thing each resident carries; VESSEL agreements
//                          are the same shape one rank up (aboard a carrier).
//
// This builds the equivalent frame graph under rung 8's one rule, WITHOUT
// changing any store — a pure transform, data in, frame nodes out. It exists to
// prove the unified model reproduces every correct position today AND dissolves
// the split-brains, before a single byte of storage is migrated. When the real
// migration lands, THIS is the shape the writers converge on; until then it is a
// read-model a test can check against reality.
//
// The frame each node gets, in precedence (deepest carrier wins, the frame law):
//   a THING   → its holder (local 0,0: at the holder's feet).
//   an ENTITY aboard a vessel → the vessel (local = pos − vessel pos).
//   an ENTITY inside a mark   → the deepest occupied mark (local = pos − mark pos).
//   otherwise → the world (local = its walk position).
//
// A MARK keeps the frame the static tree already gives it (its parent in the
// nesting), composed by marks-fold — marks don't move, so their frames are
// their directory edges and this adapter takes them as given (world-framed
// here for the proof; the real graph reuses the tree's own frames).

const asXY = (p) => {
  const x = Number(p?.x), y = Number(p?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/**
 * Build frame-graph nodes from the current sources.
 *
 * @param {object} src
 *   marks:      [{ id, at:{x,y}, extent? }]            world-composed marks (from the fold)
 *   walkers:    { handle: {x,y} }                      each entity's walk position
 *   occupancy:  { handle: [markId, …] }                enter/exit stack, outermost first
 *   holdings:   [{ thing, holder }]                    who carries what
 *   aboard:     { handle: vesselId }                   who is riding which vessel (optional)
 *   vessels:    { vesselId: {x,y} }                    vessel world positions (optional)
 * @returns { nodes, disclosures }  nodes keyed by id in the frames.mjs shape;
 *   disclosures names every place a source disagreed with another, which is the
 *   split-brain made legible rather than silently resolved.
 */
export function buildFrameGraph(src = {}) {
  const nodes = {};
  const disclosures = [];
  const marks = src.marks ?? [];
  const walkers = src.walkers ?? {};
  const occupancy = src.occupancy ?? {};
  const holdings = src.holdings ?? [];
  const aboard = src.aboard ?? {};
  const vessels = src.vessels ?? {};

  const markPos = new Map();
  for (const m of marks) {
    const at = asXY(m.at);
    nodes[m.id] = { frame: null, local: at ?? null, extent: m.extent ?? null, kind: "mark" };
    if (at) markPos.set(m.id, at);
  }

  // Vessels are world-framed nodes too — a rider frames on the vessel, so it
  // must be in the graph to compose through. A vessel that is also a mark (its
  // position from the timetable, not the static tree) overwrites the mark node
  // with its live position; same id, one node.
  const vesselPosOf = new Map();
  for (const [vesselId, pos] of Object.entries(vessels)) {
    const at = asXY(pos);
    if (!at) continue;
    nodes[vesselId] = { ...(nodes[vesselId] ?? {}), frame: null, local: at, kind: "vessel" };
    vesselPosOf.set(vesselId, at);
  }

  // ENTITIES: frame by the deepest carrier, local re-expressed against it.
  for (const [handle, pos] of Object.entries(walkers)) {
    const world = asXY(pos);
    if (!world) { nodes[handle] = { frame: null, local: null, kind: "entity" }; continue; }

    const vessel = aboard[handle];
    const vesselPos = vessel ? (vesselPosOf.get(vessel) ?? null) : null;
    const stack = occupancy[handle] ?? [];
    const deepestMark = stack.length ? stack[stack.length - 1] : null;
    const deepestMarkPos = deepestMark ? markPos.get(deepestMark) : null;

    if (vessel && vesselPos) {
      // Today's carriage (positions.withFrames) reads a rider AT the vessel's
      // position — it tracks no deck offset, and the rider's stored walk pos is
      // frozen at boarding while the vessel has sailed, so a deck offset is not
      // recoverable from flat state anyway. The honest reconstruction snaps the
      // rider to the vessel (local 0,0); the real migration's board() captures a
      // true deck offset via reparent-preserving at cast-off (a later refinement).
      nodes[handle] = { frame: vessel, local: { x: 0, y: 0 }, kind: "entity" };
    } else if (deepestMark && deepestMarkPos) {
      // THE SPLIT-BRAIN, MADE LEGIBLE: if the entity's walk position is not
      // inside the mark its occupancy claims, the two ledgers disagree — the
      // exact stale-occupancy bug (walked out without exiting). The frame graph
      // keeps the WALK position (position is never the stale one) and discloses
      // that the occupancy edge is the one to trust or clear.
      const m = marks.find((mm) => mm.id === deepestMark);
      const e = m?.extent;
      const inside = e && Math.abs(world.x - deepestMarkPos.x) <= Number(e.w) / 2
                       && Math.abs(world.y - deepestMarkPos.y) <= Number(e.h) / 2;
      if (!inside) disclosures.push({
        handle, kind: "stale-occupancy", occupies: deepestMark,
        walk_pos: world, mark_pos: deepestMarkPos,
        note: `${handle}'s occupancy says inside ${deepestMark} but their walk position is outside it — walked out without exiting; the frame keeps the walk position.`,
      });
      nodes[handle] = { frame: deepestMark, local: { x: world.x - deepestMarkPos.x, y: world.y - deepestMarkPos.y }, kind: "entity" };
    } else {
      nodes[handle] = { frame: null, local: world, kind: "entity" };
    }
  }

  // THINGS: frame on the holder, at their feet. A thing nobody holds keeps
  // whatever frame its mark already had (set down on the ground it stands on).
  for (const { thing, holder } of holdings) {
    if (!holder) continue;
    if (!nodes[holder]) {
      disclosures.push({ thing, kind: "dangling-holder", holder, note: `${thing} is held by ${holder}, who is not in the graph` });
      continue;
    }
    nodes[thing] = { ...(nodes[thing] ?? { kind: "thing" }), frame: holder, local: { x: 0, y: 0 }, kind: "thing" };
  }

  return { nodes, disclosures };
}
