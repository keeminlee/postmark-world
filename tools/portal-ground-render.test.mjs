// portal-ground-render.test.mjs — A DOOR DRAWS AS A DOOR.
//
// The record says the-town/the-cellar-door is a `portal-ground`. On the room
// floor it was an id-hashed 22%-saturation tint on a rectangle — the exact same
// treatment rei/the-mending-basket gets, differing only in hue, and hue here is
// a hash of the id and carries no meaning a reader could learn. On the map it
// was the identical amber dot every other mark is. The founder standing in the
// Lanternstep parlor had nothing to look at that said "this one you can go
// through".
//
// The two surfaces are fixed in the two places that draw them, and both read
// the `c-portal-ground` token the one class-string now mints, so neither
// surface has its own private notion of what a door is.
//
// THE AESTHETIC IS THE DRAFTING SHEET'S OWN. The floor is paper (#e8e0cf) ruled
// in squares and walled in #3a3428; a door on a plan is drawn the way an
// architect draws one — the threshold's doubled line, the leaf, and the arc it
// swings through. No colour enters that the page did not already have.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { overlayPipSVG, placeholderExtentSVG } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

const px = (p) => ({ x: p.x * 4, y: p.y * 4 });
const geometry = { kind: "sited", at: { x: 0, y: 0 }, extent: { w: 5, h: 5 } };
const DOOR = { ...geometry, id: "the-town/the-cellar-door", class: "portal-ground" };
const BASKET = { ...geometry, id: "rei/the-mending-basket" };

test("THE FALSIFIER (the floor): a portal-ground and an ordinary mark of identical geometry do not draw the same", () => {
  const door = placeholderExtentSVG(DOOR, px);
  const basket = placeholderExtentSVG(BASKET, px);
  assert.ok(door && basket, "both draw something");
  assert.notEqual(door, basket,
    "the door and the basket are the same rectangle in a different hash-hue — nothing on the floor says one is a way through");
  // and the difference is the DOOR, not merely the hue the id happens to hash to
  assert.match(door, /wv-ph-door-leaf/, "the leaf");
  assert.match(door, /wv-ph-door-swing/, "the arc it swings through");
  assert.match(door, /wv-ph-threshold/, "the threshold's doubled line");
  assert.doesNotMatch(basket, /wv-ph-door/, "and a basket has none of it");
});

test("the floor's door carries the record's own token, so CSS and the pips agree about what it is", () => {
  assert.match(placeholderExtentSVG(DOOR, px), /class="wv-ph-extent c-portal-ground"/,
    "the same c-<class> token markStateClasses mints, so there is one notion of a door on this page");
});

test("THE FALSIFIER (the map): a portal-ground pip is not the identical amber dot", () => {
  const door = overlayPipSVG({ at: { x: 10, y: 20 }, id: DOOR.id, classes: "t-market c-portal-ground" });
  const plain = overlayPipSVG({ at: { x: 10, y: 20 }, id: BASKET.id, classes: "t-market" });
  assert.notEqual(door.replace(DOOR.id, "ID"), plain.replace(BASKET.id, "ID"),
    "the two pips are the same circle — the map cannot tell a way through from a thing on a shelf");
  assert.match(door, /ov-pip-door/, "the doorway is cut into the dot");
});

test("AND THE DOT ITSELF IS UNTOUCHED — the hit area, the tier colour, the fan and the hover anchor all still ride the circle", () => {
  // The glyph is added OVER the pip, never in place of it. `.ov-pip` is the
  // hover anchor selector and the click target, the tier fill is the page's
  // one colour language, and the fan offset is a cx/cy inside the scaled group
  // — replacing the circle with a bespoke shape would have quietly cost all
  // four to gain a picture.
  const door = overlayPipSVG({ at: { x: 10, y: 20 }, id: "a", classes: "t-home c-portal-ground", fan: { dx: 3, dy: -4 } });
  assert.match(door, /<circle cx="3" cy="-4" r="11" class="ov-pip t-home c-portal-ground" data-id="a">/,
    "the circle is exactly the circle it always was");
  assert.match(door, /pointer-events="none"/, "and the glyph over it catches nothing");
});

test("an ordinary pip is byte-identical to what it was — no mark pays for a door it is not", () => {
  const plain = overlayPipSVG({ at: { x: 1, y: 2 }, id: "a" });
  assert.equal(plain,
    `<g transform="translate(1 2)"><g class="ov-s">`
    + `<circle cx="0" cy="0" r="11" class="ov-pip " data-id="a"></circle></g></g>`);
});

test("THE PALETTE HOLDS: the door is drawn in the wall's own ink, and introduces no colour", () => {
  // #3a3428 is the ink .wv-scene-wall and .wv-scene-art-frame already use, and
  // --night is the page's own dark. A new hex here would be a second visual
  // language for one glyph.
  const rules = SOURCE.slice(SOURCE.indexOf(".wv-ph-extent"), SOURCE.indexOf(".wv-minimap"));
  const hexes = [...new Set(rules.match(/#[0-9a-f]{3,6}/gi) ?? [])].map((h) => h.toLowerCase());
  for (const h of hexes) {
    assert.ok(["#e8e0cf", "#3a3428", "#8c8470"].includes(h),
      `${h} is not one of the drafting sheet's three inks — paper, wall, rule`);
  }
});
