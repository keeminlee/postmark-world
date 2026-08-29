// entered-mark-chip.test.mjs — the chip in the painting's corner names the mark
// whose INTERIOR you are looking at, and that room's card stops answering every
// pixel of its own floor.
//
// FOUNDER, 2026-08-29, both halves in his own words:
//
//   (a) "no not containment! it has to be the mark you're currently viewing the
//        INTERIOR OF (aka ENTERED). geometric containment smallest is NOT
//        appropriate for this."
//
//   (b) "right now EVERYWHERE you put your mouse, the candle vault's mark-card
//        noisily fills the center of the screen."
//
// The two are one change. The chip is what makes the second one safe: a room
// removed from the hover answers would be a mark you could no longer reach by
// looking at it, and the chip is where it goes on being reachable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  chipMark, isAmbientMark, paintingMarkAtPoint, smallestContainingMark, toldPaintingMarks, WORLD_ROOT_ID,
} from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ── THE ROOM THIS ASK CAME OUT OF, and one thing standing on its floor ───────
//
// ⚑ THE RUG IS THE CONTROL AND IT IS THE WHOLE POINT. It is smaller than the
// vault and it sits under the camera, so at that point the innermost CONTAINING
// mark is the rug and the ENTERED mark is the vault. Every assertion below that
// says "entered" would pass by accident against a containment reader if the two
// agreed, so here they are made to disagree.
const VAULT = "the-town/the-candle-vault";
const DOOR = "the-town/the-cellar-door";
const RUG = "the-town/the-vault-rug";
const CLAUSE = "the-town/a-vault-clause";
const MARKS = [
  { id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320_000, h: 320_000 } },
  { id: DOOR, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 40, h: 40 } },
  { id: VAULT, kind: "sited", parent: DOOR, at: { x: 0, y: 0 }, extent: { w: 12, h: 12 } },
  { id: RUG, kind: "sited", parent: VAULT, at: { x: 2, y: 2 }, extent: { w: 3, h: 3 } },
  { id: CLAUSE, kind: "predicated", parent: VAULT, at: { x: -2, y: -2 }, extent: { w: 3, h: 3 } },
];
const RADIAL = {
  within: [{ id: WORLD_ROOT_ID }, { id: DOOR }, { id: VAULT }],
  byBearing: { E: { underfoot: [{ id: RUG }] } },
};
const CANDIDATES = toldPaintingMarks(RADIAL, MARKS);
const at = (worldPoint, insideRoomId = null) => paintingMarkAtPoint({
  screenPoint: { x: 100, y: 100 }, worldPoint, glyphs: [], marks: CANDIDATES, insideRoomId,
});

// ══ (a) THE CHIP IS THE ENTERED MARK ════════════════════════════════════════

test("the chip names the mark whose interior is being viewed, and the root outside one", () => {
  assert.equal(chipMark({ viewingInteriorOf: VAULT }), VAULT);
  assert.equal(chipMark({ viewingInteriorOf: null }), WORLD_ROOT_ID,
    "outdoors it is the mark that frames everything, exactly as before");
  assert.equal(chipMark(), WORLD_ROOT_ID, "and with nothing said at all, the same");
});

test("ENTERED beats containment where the two disagree — the founder's own correction", () => {
  // ⚑ THE CAN-FAIL CONTROL. Standing on the rug inside the vault, the innermost
  // CONTAINING mark is the rug: a chip built the geometric way would say so.
  assert.equal(smallestContainingMark({ x: 2, y: 2 }, MARKS), RUG,
    "the two readings genuinely differ at this point — without this the test below proves nothing");
  assert.equal(chipMark({ viewingInteriorOf: VAULT }), VAULT,
    "and the chip says the mark you ENTERED, not the smallest thing your feet are on");
});

test("the chip cannot fall back on containment, because it is never handed the marks", () => {
  // A STRUCTURAL GUARANTEE, not a promise in prose. There is no marks list in
  // this function's reach, so no future edit can quietly reintroduce the
  // reading the founder ruled out without first changing its signature.
  assert.doesNotMatch(String(chipMark), /marks/,
    "the word does not occur in the function at all — there is nothing here to read a chain out of");
  assert.match(SOURCE, /export function chipMark\(\{ viewingInteriorOf = null \} = \{\}\) \{\r?\n\s*return viewingInteriorOf \|\| WORLD_ROOT_ID;\r?\n\}/,
    "the whole of it is: what you entered, or the root");
});

test("the viewer feeds the chip the MOUNTED room, which is the entered one", () => {
  // `sceneRoomId` is the mark whose scene is mounted — set from `insideOf`,
  // which standpointOccupancy folds out of the threshold ledger's crossing
  // acts. So the value reaching chipMark is a crossing, never a coordinate.
  assert.match(SOURCE, /const chipMarkId = \(\) => chipMark\(\{ viewingInteriorOf: sceneRoomId \}\);/);
  assert.match(SOURCE, /let sceneRoomId = null;\s+\/\/ the mark whose scene is mounted/,
    "and that variable still means what this depends on it meaning");
});

test("every place the chip is named reads the one accessor", () => {
  // Its lit state, its hover, the click that opens its card, and its label —
  // four readers, and a chip that opened one mark while naming another would be
  // worse than the hardcoded one it replaces.
  assert.match(SOURCE, /rootGlyph\.classList\.toggle\("on", interaction\.selectedId === chip\);/);
  assert.match(SOURCE, /rootGlyph\.classList\.toggle\("is-hovered", interaction\.hoveredId === chip\);/);
  assert.match(SOURCE, /rootGlyph\.setAttribute\("aria-label", markName\(\{ id: chip \}\)\.name\);/,
    "the label follows too — it is the only name this textless button has");
  assert.match(SOURCE, /\[data-root-mark\]"\)\) \{ selectMark\(chipMarkId\(\), \{ scrollCell: true \}\); return; \}/,
    "and the press opens the card of the mark it is naming");
  assert.match(SOURCE, /\[data-root-mark\]"\)\) \{ hoverMark\(chipMarkId\(\)\); return; \}/);
  // ⚑ AND NONE OF THEM IS STILL HARDCODED. Four of five would have been a chip
  // that lit for one mark and opened another.
  assert.doesNotMatch(SOURCE, /\[data-root-mark\]"\)\) \{ selectMark\(WORLD_ROOT_ID/);
  assert.doesNotMatch(SOURCE, /\[data-root-mark\]"\)\) \{ hoverMark\(WORLD_ROOT_ID/);
});

// ══ (b) THE ROOM'S CARD IS OUT OF ITS OWN FLOOR ═════════════════════════════

test("inside the room, bare floor answers with nothing instead of the room", () => {
  // (4,4) is on the vault's floor and off the rug: before, every such pixel
  // handed back the vault, which is why its card filled the screen wherever the
  // mouse went.
  assert.equal(at({ x: 4, y: 4 }), VAULT,
    "the reading it had — without this the line below is not a change");
  assert.equal(at({ x: 4, y: 4 }, VAULT), null,
    "and standing in the vault, pointing at its bare floor asks for nothing");
});

test("dropping the room alone would only have promoted the room around it", () => {
  // ⚑ THE FIRST VERSION OF THIS CHANGE, kept as a test because it looked right
  // and was not. The containment ladder falls through: with only the vault out
  // of the answer, the same floor handed back the CELLAR DOOR at every pixel —
  // one noisy card for another, and the founder's complaint word for word.
  assert.equal(smallestContainingMark({ x: 4, y: 4 }, CANDIDATES,
    { insideRoomId: null }), VAULT, "the ladder's rungs, from the inside out:");
  assert.equal(smallestContainingMark({ x: 4, y: 4 }, CANDIDATES.filter((m) => m.id !== VAULT)), DOOR,
    "…the vault, then the door around it — which is what a room-only exclusion reaches");
  assert.equal(at({ x: 4, y: 4 }, VAULT), null,
    "so the room AND everything enclosing it are out, and the floor answers with nothing");
});

test("what stands ON the room's floor still answers", () => {
  // The removal must reach outward and not inward. A rug in the vault is a thing
  // in this view; the district three levels up is not.
  assert.equal(at({ x: 2, y: 2 }, VAULT), RUG,
    "the rug on the vault's floor is still pointable from inside the vault");
});

test("the marks list is never shortened, because that swallows the room's own children", () => {
  // ⚑ THE BUG THE CAREFUL VERSION AVOIDS, demonstrated rather than asserted in
  // prose. `isAmbientMark` walks a mark's parent chain through the list it is
  // handed and treats a parent it cannot FIND as ambient — and ambient marks are
  // filtered out of containment entirely. So a clause of the vault is a solid
  // mark while the vault is in the list, and vanishes into the ambient the
  // moment the vault is filtered out of it.
  const clause = MARKS.find((m) => m.id === CLAUSE);
  assert.equal(isAmbientMark(clause, MARKS), false,
    "a predicated mark under an embodied parent is not ambient");
  assert.equal(isAmbientMark(clause, MARKS.filter((m) => m.id !== VAULT)), true,
    "…and it becomes ambient the instant its parent is missing from the list — the swallow");
  assert.match(SOURCE, /const room = insideRoomId \? \(marks \?\? \[\]\)\.find\(\(mark\) => mark\?\.id === insideRoomId\) : null;/,
    "so the room is looked UP in the whole list, never removed from it");
});

test("the narrowing is scoped to the mounted room, so the atlas is untouched", () => {
  // Out of doors, pointing at the region that contains you is the entire reason
  // to point at it — the rule this file has carried since 2026-08-04. Nothing
  // above may cost that.
  assert.equal(at({ x: 4, y: 4 }, null), VAULT, "no room mounted, nothing narrowed");
  assert.equal(at({ x: 20, y: 20 }, null), DOOR,
    "and the containing region outside still answers for its own ground");
  assert.match(SOURCE, /marks,\r?\n\s*insideRoomId: sceneRoomId,\r?\n\s*\}\);/,
    "the viewer passes the MOUNTED room and nothing else — null in the town");
});

test("only the containment half is narrowed; an aimed pip still answers", () => {
  // A pip is a target the size of the thing it names, so hovering one is
  // something a reader did on purpose. The complaint was about what happens
  // when they did not aim at anything.
  assert.equal(
    paintingMarkAtPoint({
      screenPoint: { x: 100, y: 100 }, worldPoint: { x: 4, y: 4 },
      glyphs: [{ id: VAULT, x: 104, y: 100 }], marks: CANDIDATES, insideRoomId: VAULT,
    }),
    VAULT,
    "the room's own pip, pointed at directly, is still the room",
  );
  assert.match(SOURCE, /return snappedMarkAtPoint\(screenPoint, glyphs, radiusPx\)\r?\n\s*\?\? smallestContainingMark\(worldPoint, marks, \{ insideRoomId \}\);/,
    "the snap half never sees the narrowing");
});

test("nothing is made unreachable — the chip is the way back to the room", () => {
  // The removal is only honest because there is a door left. If the press on
  // the chip stopped opening the chip's own mark, this whole change would be a
  // mark quietly becoming unlearnable inside itself.
  assert.match(SOURCE, /\[data-root-mark\]"\)\) \{ selectMark\(chipMarkId\(\), \{ scrollCell: true \}\); return; \}/);
  assert.equal(chipMark({ viewingInteriorOf: VAULT }), VAULT,
    "and the mark that press opens is the one whose floor stopped answering");
});

test("the chip is drawn as what it names, not always as a constitution", () => {
  // ⚑ FOUND IN THE SHOT, and only there. Blue was hardcoded on this dot while it
  // could only ever be let-there-be-light — and blue is this page's word for
  // CONSTITUTION, the tier language a reader learns by colour rather than by
  // words. The chip named "The Riverside Arcade" correctly and was still painted
  // constitution-blue over it: every DOM assertion passed, and the picture said
  // something about that room the record does not say.
  assert.match(SOURCE, /\.wv-root-mark \{[\s\S]{0,200}?background:var\(--wv-chip-tint, var\(--blue\)\);/,
    "the root's own blue is the DEFAULT, not the only answer");
  assert.match(SOURCE, /\.wv-root-mark\.t-home \{ --wv-chip-tint:var\(--green\);/);
  assert.match(SOURCE, /\.wv-root-mark\.t-market \{ --wv-chip-tint:var\(--amber\);/);
  // the lit ring too — it was a literal blue rgba beside a background that moved
  assert.match(SOURCE, /\.wv-root-mark\.on \{ opacity:1; box-shadow:0 0 0 4px var\(--wv-chip-halo, rgba\(123,167,224,\.35\)\)/,
    "and the halo follows the tint instead of staying blue under a green dot");
  assert.match(SOURCE, /const tier = tierOf\(\{ id: chip \}\);\r?\n\s*for \(const t of \["constitution", "home", "market"\]\) rootGlyph\.classList\.toggle\(`t-\$\{t\}`, tier === t\);/,
    "…and the class is the same tierOf reading every pip and card on this page is coloured from");
});
