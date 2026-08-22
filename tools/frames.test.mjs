// frames.test.mjs — the frame graph's arithmetic, pinned (rung 8).
//
// Every case here is a bug we hit live on 2026-08-22, expressed as the one
// invariant that would have prevented it. If the composition or a reparent ever
// changes shape, one of these fails; the party-eve design sitting is the story
// behind each.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  frameChain, composeWorldPosition, atBoundary,
  reparentPreserving, reparentSnapping,
  pickUp, drop, enter, exit, board, goAshore, WORLD,
} from "./frames.mjs";

// ── composition ──────────────────────────────────────────────────────────────

test("a node framed on the world composes to its own local — world coords ARE the root frame", () => {
  const nodes = { "wright/house": { frame: WORLD, local: { x: 575, y: -2600 }, extent: { w: 12, h: 12 } } };
  assert.deepEqual(composeWorldPosition("wright/house", nodes), { x: 575, y: -2600 });
});

test("THE TOP: a thing framed on its holder composes to the holder's world position", () => {
  // little-m's top: held by wright, at his feet (local 0,0). Wright walks; the
  // top's world position IS wright's — the carry the flat model never gave us.
  const nodes = {
    "wright": { frame: WORLD, local: { x: 500, y: -2600 } },
    "top": { frame: "wright", local: { x: 0, y: 0 } },
  };
  assert.deepEqual(composeWorldPosition("top", nodes), { x: 500, y: -2600 });
  // wright walks to the archway; the top follows for free — one edit, no move of the top.
  nodes.wright.local = { x: -1360, y: -2410 };
  assert.deepEqual(composeWorldPosition("top", nodes), { x: -1360, y: -2410 },
    "the top rode the holder's frame — this is the whole payoff of rung 8");
});

test("THREE LEVELS: a thing on a resident on the Post Office composes through the chain", () => {
  // top → wright → post-office → world. The vessel sails, everyone aboard and
  // everything they carry moves, in one composition walk.
  const nodes = {
    "the-town/post-office": { frame: WORLD, local: { x: 1000, y: 2000 }, extent: { w: 40, h: 20 } },
    "wright": { frame: "the-town/post-office", local: { x: 3, y: 4 } },
    "top": { frame: "wright", local: { x: 0, y: 0 } },
  };
  assert.deepEqual(composeWorldPosition("top", nodes), { x: 1003, y: 2004 });
  nodes["the-town/post-office"].local = { x: -48000, y: -48000 }; // she sails
  assert.deepEqual(composeWorldPosition("top", nodes), { x: -47997, y: -47996 },
    "the boat carried the passenger and the passenger carried the thing, through one chain");
  assert.deepEqual(frameChain("top", nodes), ["top", "wright", "the-town/post-office"]);
});

test("a node with no local carries no position; an unplaced ancestor contributes no offset", () => {
  const nodes = {
    "predicate": { frame: "wright", local: null },
    "wright": { frame: WORLD, local: { x: 5, y: 6 } },
    "orphan-frame": { frame: WORLD }, // no local
    "thing": { frame: "orphan-frame", local: { x: 2, y: 2 } },
  };
  assert.equal(composeWorldPosition("predicate", nodes), null, "no local of its own → no position");
  assert.deepEqual(composeWorldPosition("thing", nodes), { x: 2, y: 2 }, "an unplaced frame adds zero, not NaN");
});

test("a cycle and a dangling frame are FAULTS, reported, never a wrong position", () => {
  assert.throws(() => frameChain("a", { a: { frame: "b", local: { x: 0, y: 0 } }, b: { frame: "a", local: { x: 0, y: 0 } } }), /cycle/);
  assert.throws(() => composeWorldPosition("x", { x: { frame: "gone", local: { x: 0, y: 0 } } }), /dangling frame gone/);
});

// ── the enter gate: frame changes only at a boundary you stand on ─────────────

test("ENTER-ANYWHERE is refused: you cannot cross into a mark you are nowhere near", () => {
  const nodes = {
    "wright": { frame: WORLD, local: { x: 0, y: 0 } },              // Ferry's crossing
    "house": { frame: WORLD, local: { x: 575, y: -2600 }, extent: { w: 12, h: 12 } },
  };
  assert.equal(atBoundary("wright", "house", nodes), false, "a kilometre off, the door refuses you");
  nodes.wright.local = { x: 576, y: -2601 };                        // at the door
  assert.equal(atBoundary("wright", "house", nodes), true, "standing on its ground, you may cross");
  // a mark with no extent has no inside
  assert.equal(atBoundary("wright", "house", { ...nodes, house: { frame: WORLD, local: { x: 576, y: -2601 } } }), false);
});

// ── reparent: preserve vs snap ───────────────────────────────────────────────

test("ENTER preserves world position — you are re-expressed in the mark's frame, not moved", () => {
  const nodes = {
    "wright": { frame: WORLD, local: { x: 600, y: -2600 } },
    "house": { frame: WORLD, local: { x: 575, y: -2600 }, extent: { w: 60, h: 60 } },
  };
  const moved = enter("wright", "house", nodes);
  assert.equal(moved.frame, "house");
  assert.deepEqual(moved.local, { x: 25, y: 0 }, "local = your world pos minus the house's");
  const after = { ...nodes, wright: moved };
  assert.deepEqual(composeWorldPosition("wright", after), { x: 600, y: -2600 }, "world position is IDENTICAL — a carriage is nothing happening");
});

test("EXIT preserves, reparenting up to the current frame's parent (the door)", () => {
  const nodes = {
    "terrace": { frame: WORLD, local: { x: 900, y: -2400 } },
    "house": { frame: "terrace", local: { x: -325, y: -200 } },   // world (575,-2600)
    "wright": { frame: "house", local: { x: 1, y: -1 } },          // world (576,-2601)
  };
  const out = exit("wright", nodes);
  assert.equal(out.frame, "terrace", "one level up: house → terrace");
  const after = { ...nodes, wright: out };
  assert.deepEqual(composeWorldPosition("wright", after), { x: 576, y: -2601 }, "still exactly where you stood");
});

test("PICKUP snaps the thing to its holder's feet; DROP preserves it where you stand", () => {
  const nodes = {
    "wright": { frame: WORLD, local: { x: 500, y: -2600 } },
    "top": { frame: WORLD, local: { x: 100, y: 100 } },           // lying on the ground far off
  };
  const held = pickUp("top", "wright", nodes);
  assert.equal(held.frame, "wright");
  assert.deepEqual(held.local, { x: 0, y: 0 }, "it comes to your hand, not left where it lay");
  const carrying = { ...nodes, top: held };
  assert.deepEqual(composeWorldPosition("top", carrying), { x: 500, y: -2600 }, "the top is now at wright");

  // walk to the party, then drop: it stays there, framed on the world
  carrying.wright = { ...carrying.wright, local: { x: -1360, y: -2410 } };
  const setDown = drop("top", carrying);
  assert.equal(setDown.frame, null, "dropped onto the world");
  const dropped = { ...carrying, top: setDown };
  assert.deepEqual(composeWorldPosition("top", dropped), { x: -1360, y: -2410 }, "set down where you truly stand");
});

test("BOARD and GO ASHORE preserve, on and off the vessel's frame", () => {
  const nodes = {
    "boat": { frame: WORLD, local: { x: 1000, y: 2000 }, extent: { w: 40, h: 20 } },
    "wright": { frame: WORLD, local: { x: 1005, y: 2003 } },        // standing on her deck
  };
  const aboard = board("wright", "boat", nodes);
  assert.equal(aboard.frame, "boat");
  assert.deepEqual(aboard.local, { x: 5, y: 3 });
  const sailing = { ...nodes, wright: aboard, boat: { ...nodes.boat, local: { x: 5000, y: 2000 } } };
  assert.deepEqual(composeWorldPosition("wright", sailing), { x: 5005, y: 2003 }, "she sailed, you sailed with her");
  const off = goAshore("wright", sailing);
  assert.equal(off.frame, null);
  assert.deepEqual(composeWorldPosition("wright", { ...sailing, wright: off }), { x: 5005, y: 2003 }, "you step off exactly where she left you");
});
