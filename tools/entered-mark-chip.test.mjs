// entered-mark-chip.test.mjs — the top-left chip names the mark you ENTERED.
//
// Ported 2026-09-11 from the birthday lineage (8d0eb580, 2026-08-29), which never
// reached main; the founder's ruling, in his words: "no not containment! it has
// to be the mark you're currently viewing the INTERIOR OF (aka ENTERED).
// geometric containment smallest is NOT appropriate for this."

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chipMark, WORLD_ROOT_ID } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
const VAULT = "wright/the-candle-vault";

test("the chip names the mark whose interior is being viewed, and the root outside one", () => {
  assert.equal(chipMark({ viewingInteriorOf: VAULT }), VAULT);
  assert.equal(chipMark({ viewingInteriorOf: null }), WORLD_ROOT_ID, "no room mounted: let there be light, as always");
  assert.equal(chipMark(), WORLD_ROOT_ID, "and with nothing said at all, the same");
  // ⚑ THE FLIP: make chipMark return WORLD_ROOT_ID unconditionally → the first line reds.
});

test("the chip cannot fall back on containment, because it is never handed the marks", () => {
  assert.doesNotMatch(String(chipMark), /marks/, "no marks parameter, no containment chain to reach for");
});

test("the viewer feeds the chip the MOUNTED room, and every chip site reads it — none reads the root by hand", () => {
  assert.match(SOURCE, /const chipMarkId = \(\) => chipMark\(\{ viewingInteriorOf: sceneRoomId \}\);/, "the feed is the mounted room, which is set from a crossing");
  assert.match(SOURCE, /selectMark\(chipMarkId\(\), \{ scrollCell: true \}\)/, "the click");
  assert.match(SOURCE, /hoverMark\(chipMarkId\(\)\)/, "the hover");
  assert.doesNotMatch(SOURCE, /selectMark\(WORLD_ROOT_ID/, "no chip click reads the root by hand");
  assert.doesNotMatch(SOURCE, /hoverMark\(WORLD_ROOT_ID\)/, "no chip hover reads the root by hand");
  assert.match(SOURCE, /background:var\(--wv-chip-tint, var\(--blue\)\)/, "and the dot takes the tier's tint, blue only when the chip is the root");
  assert.match(SOURCE, /\.wv-root-mark\.t-home \{ --wv-chip-tint:var\(--green\)/, "a home reads green");
});
