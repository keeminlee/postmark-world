// actas-dock.test.mjs — the viewer's half of the Act-As dock handshake (2026-08-28).
//
// THE LAW: while the site's cockpit has docked its Act-As faces onto the verb
// bar (data-pmc-dock on <html>), this viewer's own Act As row stands down —
// one control answers "who acts?", never two drawn on top of each other (the
// founder's catch: the plate "just sits ON TOP of the existing rail"). The
// dock speaks pm:act-as; selectActor follows, so the walk desk and enter
// buttons act as the face the dock lit.
//
// Source pins, the discipline this suite already uses for mountViewer closures
// (fp-layer-epoch.test.mjs states why: mounting the whole app to watch one
// guard tests the harness, not the guard). Each regex fails against the
// pre-dock viewer — that is the flip.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const viewer = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("renderIdentity stands down while the dock holds the question", () => {
  assert.match(viewer, /const dockOwned = !!document\.documentElement\?\.hasAttribute\?\.\("data-pmc-dock"\);/,
    "the row reads the dock's attribute — the late-boot half of the handshake");
  assert.match(viewer, /box\.hidden = dockOwned;\s*\n\s*if \(dockOwned\) return;/,
    "and hides itself rather than drawing a second control under the dock");
});

test("the dock's word moves this viewer's own actor", () => {
  assert.match(viewer, /window\.addEventListener\("pm:act-as", \(e\) => \{/,
    "the viewer listens for the dock's selection");
  assert.match(viewer, /\(state\.whoami\?\.handles \?\? \[\]\)\.includes\(h\) && h !== state\.actAs\) selectActor\(h\);/,
    "resident handles only, own-key only, and a repeat is not a re-selection");
  assert.match(viewer, /window\.addEventListener\("pm:cockpit-dock", \(\) => renderIdentity\(\)\);/,
    "mount/unmount re-renders the row — the early-boot half of the handshake");
});
