// viewer-stood-out.test.mjs — THE CAMERA STEPS OUTSIDE WHEN THE EXIT DOES.
//
// ⚑ FOUNDER, 2026-08-29: he exited as rei, the door took it, and he was still
// looking at the inside of the vault. The scene is mounted off the enter-exit
// ledger, which is read on a clock, so between the act landing and the next
// read the page went on drawing a room its reader had left. The stale entry
// IS cleaned up, but only in the OUTDOORS branch of the telling's render, which
// never runs in painting-only mode: the default, and the mode he was in.
//
// The site's cockpit knows the moment the door takes an exit and says so on
// `pm:stood-out` (site: src/lib/world-cockpit-mount.mjs). The viewer listens,
// drops the built interior for that standpoint, puts the town back, and asks
// the record to catch up behind the redraw.
//
// SOURCE PINS, the repo's discipline for closure code inside mountViewer (the
// pattern entered-mark-chip.test.mjs keeps). Built on the party lineage (world
// 9120587c), lost in the 08-29 rollback, ported 2026-09-16 (POS-91 /
// postmark#2847) without the room's music, which stayed with the dungeon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

test("a landed exit takes the interior down without waiting for the ledger's clock", () => {
  assert.match(SOURCE, /function standOutOfRoom\(leftId = null\) \{/);
  assert.match(SOURCE, /interiorByKey\.delete\(key\);\r?\n\s*const boxEl = \$\(root, "\.wv-minimap"\);/,
    "the built pane is dropped, then the town goes back up");
  assert.match(SOURCE, /boxEl\.classList\.remove\("is-scene-mark"\);[\s\S]{0,120}?syncSceneExit\(boxEl, null, key\);[\s\S]{0,120}?remountTown\(boxEl\);/,
    "and everything the room owned goes with it — the way-out pill included");
  // driven by the ACT, not by a poll — the founder's own instruction
  assert.match(SOURCE, /window\.addEventListener\("pm:stood-out", onStoodOut\);/);
  assert.match(SOURCE, /window\.removeEventListener\("pm:stood-out", onStoodOut\);/, "and given back at stop()");
});

test("…and it is a redraw, not a second source of truth", () => {
  // Nothing here decides that somebody left. The door decided, the cockpit
  // relayed it, and this is the picture catching up — with the record asked to
  // catch up behind it, so the next render agrees with what is already on screen
  // rather than undoing it.
  assert.match(SOURCE, /loadEnterExitLedger\(\)\.then\(\(\) => renderCurrent\(\)\)/,
    "the ledger read still happens; it is no longer what the reader waits on");
  // AND IT IGNORES AN EXIT THAT IS NOT THIS STANDPOINT'S. Two residents on one
  // key, one stepping out, must not take the other's scene down.
  assert.match(SOURCE, /if \(leftId && built\?\.room\?\.id && built\.room\.id !== leftId\) return;/);
  // a page with no cockpit never fires it, and a throw in a redraw is not worth
  // taking the viewer down for
  assert.match(SOURCE, /const onStoodOut = \(ev\) => \{ try \{ standOutOfRoom\(ev\?\.detail\?\.left \?\? null\); \} catch/);
});

test("the standpoint the event is judged against is the one the scene is mounted for", () => {
  // syncScene mounts off `standpointKey()`; the teardown must read the same key,
  // or a spectating page and an acting one would disagree about whose room it is.
  assert.match(SOURCE, /function standOutOfRoom\(leftId = null\) \{\r?\n\s*const key = standpointKey\(\);/,
    "one key function for the mount and the unmount");
});
