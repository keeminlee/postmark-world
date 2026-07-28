import assert from "node:assert/strict";
import test from "node:test";

import { viewerAxisControls, viewerAxisState } from "../spectator/viewer.mjs";

test("viewer axes keep world composition and portfolio filtering independent", () => {
  const states = [
    [{ identityResolved: false, baseLayer: "mine", justMine: true }, false, "the True World", "everything"],
    [{ identityResolved: true, baseLayer: "true", justMine: false }, true, "the True World", "everything"],
    [{ identityResolved: true, baseLayer: "true", justMine: true }, true, "the True World", "just mine"],
    [{ identityResolved: true, baseLayer: "mine", justMine: false }, true, "My World", "everything"],
    [{ identityResolved: true, baseLayer: "mine", justMine: true }, true, "My World", "just mine"],
  ];

  for (const [input, controls, base, relation] of states)
    assert.deepEqual(viewerAxisState(input), { controls, base, relation });

  assert.equal(viewerAxisControls(states[0][0]), "", "anonymous spectators get no identity axes");

  const trueMine = viewerAxisControls(states[2][0]);
  assert.match(trueMine, />the True World<\/button>/);
  assert.match(trueMine, />My World<\/button>/);
  assert.match(trueMine, />just mine<\/button>/);
  assert.match(trueMine, /data-world-base="true"[^>]*>the True World/);
  assert.match(trueMine, /data-mine-filter="mine"[^>]*>just mine/);

  const myEverything = viewerAxisControls(states[3][0]);
  assert.match(myEverything, /class="wv-fchip on" data-world-base="mine">My World/);
  assert.match(myEverything, /class="wv-fchip on" data-mine-filter="everything">everything/);
});
