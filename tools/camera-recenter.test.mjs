// camera-recenter.test.mjs — switching resident RECENTERS on them.
//
// Founder, 2026-08-20: "let's not save camera state per act-as resident and just
// recenter on them on click."
//
// The old behaviour restored each resident's last viewBox, so clicking a resident
// could land you on a corner of the map they had panned to earlier and NOT on the
// resident — the one thing the click plainly means. Predictable beats remembered:
// the answer to "show me kilean" is kilean.
//
// The camera itself lives inside mountViewer's closure and needs a DOM, so what
// is pinned here is the thing that made the old behaviour possible: the view
// cache used to carry a per-resident `view`, and `stashActiveView` used to fill
// it. Both are gone. A regression would have to put them back, and this notices.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { viewIsWarm } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

test("FALSIFIER: no per-resident viewBox is saved anywhere", () => {
  assert.doesNotMatch(SOURCE, /function stashActiveView/,
    "the function that stashed a resident's painting is gone");
  assert.doesNotMatch(SOURCE, /\bstashActiveView\(\)/,
    "and nothing calls it");
  assert.doesNotMatch(SOURCE, /entry\.view\s*=/,
    "no cache entry is given a viewBox to come back to");
});

test("FALSIFIER: the act-as switch recenters rather than restoring", () => {
  // the restore was `if (entry?.view && mapCtx?.setView) mapCtx.setView(entry.view, false)`
  assert.doesNotMatch(SOURCE, /setView\(entry\.view/,
    "a saved frame is never re-applied on a switch");
  assert.match(SOURCE, /ALWAYS RECENTER ON WHOEVER YOU JUST BECAME/,
    "the ruling is written where the switch happens");
});

test("the cache entry no longer carries a view slot at all", () => {
  // belt and braces: the shape itself cannot hold one, so a future `entry.view`
  // would be a new field somebody had to add on purpose
  const shape = SOURCE.match(/entry = \{ pane: null[^}]*\}/)?.[0] ?? "";
  assert.ok(shape, "the cache entry shape is still findable");
  assert.doesNotMatch(shape, /\bview\b/, `the shape still holds a view slot: ${shape}`);
});

// ── what warmth still means ─────────────────────────────────────────────────
//
// Dropping the saved camera must not drop the PANE cache — a warm switch is
// still instant, it simply arrives centred. These pin that the warmth rule is
// untouched by the camera change.
const at = { x: 10, y: -4 };
const warm = { radial: {}, mounted: true, signature: "sig-1", origin: at };

test("a built pane is still warm without any saved camera", () => {
  assert.equal(viewIsWarm(warm, { signature: "sig-1", origin: at }), true,
    "warmth is about the record and the standpoint, never about the viewBox");
});

test("warmth still breaks when the record or the standpoint moves", () => {
  assert.equal(viewIsWarm(warm, { signature: "sig-2", origin: at }), false, "the record moved");
  assert.equal(viewIsWarm(warm, { signature: "sig-1", origin: { x: 11, y: -4 } }), false, "they moved");
  assert.equal(viewIsWarm({ ...warm, mounted: false }, { signature: "sig-1", origin: at }), false);
  assert.equal(viewIsWarm(null, { signature: "sig-1", origin: at }), false);
});

test("A -> B -> A is warm both times, so recentering costs nothing", () => {
  // the switch away no longer stashes anything, which is exactly why coming back
  // must still be instant — otherwise the ruling would have bought predictability
  // with a rebuild
  const a = { radial: {}, mounted: true, signature: "s", origin: { x: 1, y: 1 } };
  assert.equal(viewIsWarm(a, { signature: "s", origin: { x: 1, y: 1 } }), true);
  assert.equal(viewIsWarm(a, { signature: "s", origin: { x: 1, y: 1 } }), true, "and again on the way back");
});
