// frames.mjs — THE FRAME GRAPH (world-runtime ladder, rung 8).
//
// One position model for everything that has a place — marks, entities, things.
// A NODE carries a LOCAL coordinate and a FRAME pointer (the id of the node it
// is positioned within, or null for the world). World position is composed by
// walking the frame chain to the root, accumulating translation. "World coords"
// are nothing but the let-there-be-light reference frame; every other frame is
// an offset inside it.
//
// This is a transform hierarchy — a scene graph — and Postmark has no rotation,
// so composition is pure translation: world = Σ local offsets up the chain. The
// same walk the static mark tree already does (marks-fold frameMarks), lifted
// to a first-class primitive that ENTITIES and THINGS can root on too, which is
// the whole of rung 8: a resident can be a frame (you carry a thing → it rides
// your frame), not only a carrier MARK (a vessel).
//
// The unifying invariant every world verb becomes: A NODE'S FRAME CHANGES ONLY
// AT A BOUNDARY IT STANDS ON. `atBoundary` is that gate; `reparentPreserving`
// and `reparentSnapping` are the two ways a frame changes once the gate passes.
// enter/exit/board/ashore/drop preserve world position (you are re-expressed,
// not moved); pickup snaps the thing to its holder. Four split-brains
// (walk-out-of-room, enter-anywhere, thing-carry, emission-on-deck) collapse
// because a verb can no longer move position without occupancy or the reverse.
//
// PURE. No IO, no clock, no DB, no repo. `nodes` is a Map or plain object of
// id → { frame, local: {x,y}, extent? }. The caller supplies the graph; this
// composes and transforms it, and every answer is checkable in isolation.

const WORLD = null; // the root frame — let-there-be-light, the world's own origin

const getNode = (nodes, id) =>
  nodes instanceof Map ? nodes.get(id) : (nodes ? nodes[id] : undefined);

const localOf = (node) => {
  const x = Number(node?.local?.x), y = Number(node?.local?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/**
 * The chain of frame ids from a node UP to the world, the node's own id first
 * and the world (null) never listed. Throws on a cycle (a node that frames on
 * itself, directly or through a ring) and on a dangling frame (a frame id no
 * node in the graph provides) — both are graph faults a caller must see, never
 * silently a different position.
 */
export function frameChain(id, nodes) {
  const chain = [];
  const seen = new Set();
  let cur = id;
  while (cur !== WORLD && cur !== undefined) {
    if (seen.has(cur)) throw new Error(`frame cycle at ${cur}: a node cannot be within itself`);
    seen.add(cur);
    const node = getNode(nodes, cur);
    if (node === undefined) throw new Error(`dangling frame ${cur}: no node in the graph provides it`);
    chain.push(cur);
    cur = node.frame ?? WORLD;
  }
  return chain;
}

/**
 * A node's WORLD position: its local coordinate plus every frame offset above
 * it, to the root. A node with no readable local coordinate composes to null
 * (it carries no position — a predicate, an unplaced entity), which is a fact,
 * not an error. The frame offsets of an ancestor that itself carries no local
 * are treated as zero: an unplaced frame contributes no translation, so a node
 * inside it reads on the world origin rather than vanishing.
 */
export function composeWorldPosition(id, nodes) {
  const chain = frameChain(id, nodes);
  const self = getNode(nodes, id);
  const own = localOf(self);
  if (!own) return null; // no position of its own
  let x = own.x, y = own.y;
  // start at index 1: the node's own local is already in (x,y); add each
  // ancestor frame's local as the offset that frame sits at within ITS parent.
  for (let i = 1; i < chain.length; i++) {
    const anc = localOf(getNode(nodes, chain[i]));
    if (anc) { x += anc.x; y += anc.y; }
  }
  return { x, y };
}

/**
 * Is `id`'s world position within `targetId`'s extent — is the node standing at
 * the target, so it may cross into its frame? THE ENTER GATE, and the whole of
 * what stops entering a mark from the far side of the world. v1 is an
 * axis-aligned extent test (marks are rects); a polygon `points` refinement is
 * a later pass, and until then a polygon mark uses its bounding extent, which
 * is permissive at the corners and never wrongly refuses someone truly inside.
 * A target with no extent has no inside and always answers false.
 */
export function atBoundary(id, targetId, nodes, { pad = 0 } = {}) {
  const here = composeWorldPosition(id, nodes);
  const target = getNode(nodes, targetId);
  const centre = composeWorldPosition(targetId, nodes);
  const w = Number(target?.extent?.w), h = Number(target?.extent?.h);
  if (!here || !centre || !(w > 0) || !(h > 0)) return false;
  return Math.abs(here.x - centre.x) <= w / 2 + pad
      && Math.abs(here.y - centre.y) <= h / 2 + pad;
}

/**
 * Change `id`'s frame to `newFrameId` while HOLDING ITS WORLD POSITION FIXED —
 * the node is re-expressed in the new frame, not moved. Returns the node with a
 * recomputed `local`. This is enter/exit/board/go-ashore/drop: crossing a
 * boundary you are standing on does not teleport you, it re-parents you where
 * you already are. `newFrameId` null re-expresses on the world.
 *
 * The arithmetic is the composition run backwards: local = worldPos(node) −
 * worldPos(newFrame). A carriage is nothing happening (frame law, 2026-08-10):
 * the world position is identical before and after, only the name of the frame
 * it is written against changes.
 */
export function reparentPreserving(id, newFrameId, nodes) {
  const world = composeWorldPosition(id, nodes);
  if (!world) throw new Error(`${id} has no world position to preserve`);
  const frameWorld = newFrameId === WORLD ? { x: 0, y: 0 } : composeWorldPosition(newFrameId, nodes);
  if (!frameWorld) throw new Error(`cannot reparent ${id} onto ${newFrameId}: that frame has no world position`);
  const node = getNode(nodes, id);
  return { ...node, frame: newFrameId ?? null, local: { x: world.x - frameWorld.x, y: world.y - frameWorld.y } };
}

/**
 * Change `id`'s frame to `newFrameId` and SNAP it to that frame at `offset`
 * (default the frame's own origin, 0,0). The node's world position becomes the
 * frame's plus the offset — it is MOVED to the frame. This is pickup: a thing
 * comes to its holder's hand, at their feet, not left where it lay. The inverse
 * of drop, which preserves.
 */
export function reparentSnapping(id, newFrameId, nodes, offset = { x: 0, y: 0 }) {
  const node = getNode(nodes, id);
  const local = { x: Number(offset?.x) || 0, y: Number(offset?.y) || 0 };
  return { ...node, frame: newFrameId ?? null, local };
}

/**
 * The verbs, named — thin wrappers that say which reparent each world act is,
 * so a caller reads intent, not arithmetic. Each returns the transformed node;
 * writing it back to the graph (and the log) is the caller's act.
 *
 *   pickUp(thing, holder)  → snap onto the holder at their feet
 *   drop(thing)            → preserve onto the world where it is set down
 *   enter(entity, mark)    → preserve into the mark (gate with atBoundary first)
 *   exit(entity)           → preserve up to the current frame's parent
 *   board(entity, vessel)  → preserve onto the vessel (gate with atBoundary)
 *   goAshore(entity)       → preserve onto the world
 */
export const pickUp = (thingId, holderId, nodes) => reparentSnapping(thingId, holderId, nodes);
export const drop = (thingId, nodes) => reparentPreserving(thingId, WORLD, nodes);
export const enter = (entityId, markId, nodes) => reparentPreserving(entityId, markId, nodes);
export const board = (entityId, vesselId, nodes) => reparentPreserving(entityId, vesselId, nodes);
export const goAshore = (entityId, nodes) => reparentPreserving(entityId, WORLD, nodes);
export function exit(entityId, nodes) {
  const node = getNode(nodes, entityId);
  const parentFrame = node?.frame == null ? WORLD : (getNode(nodes, node.frame)?.frame ?? WORLD);
  return reparentPreserving(entityId, parentFrame, nodes);
}

export { WORLD };
