// fp-layer-epoch.test.mjs — THE FOOTPRINT LAYER IS A PHOTOGRAPH, AND IT HAD NO
// SHUTTER.
//
// The footprints are baked once from `world.marks` into a single innerHTML —
// that is the whole reason the layer is fast, and it is also what makes the
// node a picture of the world as it stood when the bake ran rather than a live
// view of it.
//
// `applyWorldLayer` re-assembles the world after an in-app reload and bumps
// `worldEpoch` for exactly this reason ("the record moved: an open bubble is now
// stale prose"). Every other prebuilt view reads that number. This layer was the
// one that did not: its guard was `if (!fpLayer.childNodes.length)`, which asks
// "has this ever been built?" and never "is what it holds still true?". So a
// reload kept the old footprints forever — a mark moved, renamed or newly
// published went on being drawn at its old shape, with no way for a reader to
// tell and no way for the layer to ever correct itself.
//
// ── why this file asserts on the source ─────────────────────────────────────
// buildFpLayer, fpEpoch and toggleFp are closures inside mountViewer, which
// takes a live app element, fetches the world, and stands up a ResizeObserver
// and a full SVG map. Mounting all of that to observe one cache guard would
// test the harness far more than the guard. The repo already asserts wiring
// this way where the defect IS the wiring (terms-door.test.mjs, "asserted on
// the wiring rather than on pixels"), and this defect is exactly that: a
// one-line guard asking the wrong question.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

test("THE FALSIFIER: the layer is rebuilt when the WORLD moved, not only when it was never built", () => {
  assert.match(SOURCE, /if \(!fpLayer\.childNodes\.length \|\| fpStale\(\)\) buildFpLayer\(\);/,
    "opening the layer must ask whether what it holds is still true");
  assert.doesNotMatch(SOURCE, /if \(!fpLayer\.childNodes\.length\) buildFpLayer\(\);/,
    "the has-it-ever-been-built guard is gone — it is the whole defect");
});

test("the bake stamps the epoch it was taken at, or nothing could ever know it was stale", () => {
  assert.match(SOURCE, /fpLayer\.innerHTML = s;\s*\n\s*fpEpoch = worldEpoch;/,
    "fpEpoch is written where the bake happens, so the two can never part");
  assert.match(SOURCE, /let fpEpoch = -1;/,
    "-1 is never-baked — a value no real epoch can collide with");
  assert.match(SOURCE, /const fpStale = \(\) => fpEpoch !== worldEpoch;/,
    "one predicate, so the two readers below cannot disagree about what stale means");
});

test("AND AN ALREADY-OPEN LAYER CORRECTS ITSELF — the reader must not have to toggle it off and on", () => {
  // The half that a toggle-only guard would still have missed: a world reload
  // with the footprints ON leaves stale shapes visible on screen. drawOverlay
  // runs on every repaint, and the refresh is a no-op unless the layer is both
  // built and stale.
  assert.match(SOURCE, /function drawOverlay\(radial\) \{\s*\n\s*if \(!mapCtx\) return;[\s\S]{0,220}?mapCtx\.refreshFp\?\.\(\);/,
    "every repaint gives an open layer the chance to notice");
  assert.match(SOURCE, /mapCtx\.refreshFp = \(\) => \{\s*\n\s*if \(fpLayer\.childNodes\.length && fpStale\(\)\) buildFpLayer\(\);/,
    "and it costs nothing when the layer is unbuilt or current");
});

test("THE CONTRACT'S OTHER END: applyWorldLayer still bumps the epoch this depends on", () => {
  // If the bump ever goes away, this whole fix becomes a no-op that looks like
  // a fix — so the thing it depends on is pinned from here too.
  assert.match(SOURCE, /worldEpoch \+= 1;/, "applyWorldLayer bumps the epoch");
  assert.match(SOURCE, /let worldEpoch = 0;/, "and it starts at 0, so a never-baked -1 is always stale");
});
