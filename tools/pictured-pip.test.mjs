// pictured-pip.test.mjs — A MARK WEARING ITS PICTURE NEEDS NO DOT (2026-09-18).
//
// Keemin, on the w39 train: "remove the center dot on marks with images? it
// often blocks them and makes them look bad. and the image makes it obvious
// there's a mark there anyway." The parcel already had the shape for this —
// its pip is transparent under the home card (`.ov-pip.ov-pip-home`), still
// the hover anchor, the hit target and the fan's seat. This extends the same
// contract to any mark whose picture is ON THE PAINTING in the draw: hung at
// far/mid (`drawPlacedArt`'s set) or drawn over its extent at near
// (`sceneArtSVG` in the furnishing pass). A mark at mid keeps its dot — that
// tier draws tinted extents and no pictures, so nothing else would mark it.
//
// The rule lives in three places that must agree — the set, the class, the
// style — and this file pins all three, so dropping any one goes red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { overlayPipSVG, OVERLAY_PIP_R } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

test("the set: pictured marks = the hung art, plus every near-tier picture the furnishing pass drew", () => {
  assert.match(SOURCE, /const pictured = new Set\(hungArt\);/, "seeded from the placed art, so a district hung at far/mid loses its dot too");
  assert.match(SOURCE, /const art = markImagePath\(m\) \? sceneArtSVG\(m, px\) : "";\n\s+if \(art\) \{ s \+= art; pictured\.add\(m\.id\); \}/,
    "a mark joins the set only when its picture was actually emitted — a mark with an image but no extent draws no art and keeps its dot");
  assert.match(SOURCE, /if \(tier === "mid"\) \{ s \+= placeholderExtentSVG\(m, px, \{ ignoreArt: true \}\); continue; \}/,
    "at mid the pass draws the tinted extent and never a picture, so nothing is added — the dot stays");
});

test("the class: the pip loop hands `ov-pip-pictured` to exactly the marks in the set", () => {
  assert.match(SOURCE, /classes: markClasses\(m\) \+ \(pictured\.has\(m\.id\) \? " ov-pip-pictured" : ""\)/);
  // the pure emitter passes the class through untouched, onto the circle that is the anchor
  const pip = overlayPipSVG({ at: { x: 10, y: 20 }, id: "a/b", classes: "t-home ov-pip-pictured" });
  assert.match(pip, new RegExp(`<circle cx="0" cy="0" r="${OVERLAY_PIP_R}" class="ov-pip t-home ov-pip-pictured" data-id="a/b">`),
    "the circle is still emitted — the hover anchor, the hit target and the fan seat do not move");
});

test("the style: a pictured pip is transparent, the way the home pip is, and nothing else about it changes", () => {
  assert.match(SOURCE, /\.ov-pip\.ov-pip-home \{ opacity:0; \}/, "the parcel's rule, the precedent");
  assert.match(SOURCE, /\.ov-pip\.ov-pip-pictured \{ opacity:0; \}/, "the pictured mark's rule, the same shape");
  assert.doesNotMatch(SOURCE, /\.ov-pip\.ov-pip-pictured \{[^}]*(display|pointer-events|visibility)/,
    "opacity only — display:none or pointer-events:none would take the anchor and the click with the paint");
});
