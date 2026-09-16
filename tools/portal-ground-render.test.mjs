// portal-ground-render.test.mjs — A DOOR DRAWS AS A DOOR.
//
// The record says wright/the-cellar-door is a `portal-ground` (four marks carry
// the class today). On the room floor it was an id-hashed 22%-saturation tint
// on a rectangle — the exact same treatment rei/the-mending-basket gets,
// differing only in hue, and hue here is a hash of the id and carries no
// meaning a reader could learn. On the map it was the identical amber dot every
// other mark is. The founder standing in the Lanternstep parlor had nothing to
// look at that said "this one you can go through".
//
// The two surfaces are fixed in the two places that draw them, and both read
// the `c-portal-ground` token the one class-string now mints, so neither
// surface has its own private notion of what a door is.
//
// THE AESTHETIC IS THE FLOOR'S OWN. The room floor is slate now (2026-09-11)
// and its walls are drawn in one paper-toned ink; a door on a plan is drawn the
// way an architect draws one — the threshold's doubled line, the leaf, and the
// arc it swings through — in that same ink. No colour enters that the page did
// not already have, and the test reads the wall's ink off the stylesheet rather
// than pinning a hex, so the day the walls change ink the door changes with them
// or this reds.
//
// Built on the party lineage (world 59b8d380), lost in the 08-29 rollback,
// ported 2026-09-16 (POS-91 / postmark#2847).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { overlayPipSVG, placeholderExtentSVG } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");
const MARKS = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8")).marks;

const px = (p) => ({ x: p.x * 4, y: p.y * 4 });
const geometry = { kind: "sited", at: { x: 0, y: 0 }, extent: { w: 5, h: 5 } };
const DOOR = { ...geometry, id: "wright/the-cellar-door", class: "portal-ground" };
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

test("a ringed portal-ground gets the glyph on its ring's bounding box, and a ringed basket gets none", () => {
  const ring = { points: [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }] };
  const door = placeholderExtentSVG({ ...DOOR, ...ring }, px);
  assert.match(door, /<polygon class="wv-ph-extent c-portal-ground"/, "the ring is still the ring");
  assert.match(door, /wv-ph-door-leaf/, "with the door drawn over it");
  assert.doesNotMatch(placeholderExtentSVG({ ...BASKET, ...ring }, px), /wv-ph-door/);
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

test("THE PALETTE HOLDS: the door is drawn in the wall's own ink, read off the wall's rule", () => {
  // The wall's ink is whatever `.wv-scene-wall` says today — paper-toned on the
  // slate floor since 2026-09-11. Every stroke the door adds must be that ink,
  // and the pip's doorway the page's own dark. A hex of its own here would be a
  // second visual language for one glyph.
  const wall = /\.wv-scene-wall \{[^}]*stroke:(#[0-9a-f]{3,6})/i.exec(SOURCE)?.[1]?.toLowerCase();
  assert.ok(wall, "the wall rule names its ink");
  for (const sel of [".wv-ph-extent.c-portal-ground", ".wv-ph-threshold", ".wv-ph-door-leaf", ".wv-ph-door-swing"]) {
    const rule = new RegExp(sel.replace(/\./g, "\\.") + " \\{([^}]*)\\}").exec(SOURCE)?.[1];
    assert.ok(rule, `${sel} has a rule`);
    const inks = [...new Set((rule.match(/#[0-9a-f]{3,6}/gi) ?? []).map((h) => h.toLowerCase()))];
    assert.deepEqual(inks, [wall], `${sel} is drawn in the wall's ink and nothing else`);
  }
  assert.match(SOURCE, /\.ov-pip-door \{ fill:var\(--night\)/, "and the doorway on the map is the page's own dark");
});

test("the glyph is live, not dormant: today's record carries portal-ground marks with extents", () => {
  // The record's own word decides whether a door is ever drawn. Named here so a
  // day the class disappears from the record is a day this test says so, rather
  // than the glyph quietly shipping to nothing.
  const doors = MARKS.filter((m) => m.class === "portal-ground" && m.extent);
  assert.ok(doors.length >= 1, `the record carries ${doors.length} portal-ground mark(s) with an extent`);
});
