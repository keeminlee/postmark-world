// parcel-interiors-and-the-telling.test.mjs — three of the founder's 2026-09-11
// evening rulings on the world page, each asked of the pure rule or the source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parcelEnclosing, hiddenInsideParcel, enclosingParcels } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

const PARCEL = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", at: { x: 1088, y: -794 }, extent: { w: 25, h: 25 } };
const HOUSE = { id: "rei/the-lanternstep-house", kind: "sited", tier: "home", placementParent: PARCEL.id, at: { x: 1088, y: -794 }, extent: { w: 12, h: 12 } };
const CHAIR = { id: "rei/the-reading-chair", kind: "sited", parent: HOUSE.id, at: { x: 1090, y: -796 }, extent: { w: 1, h: 1 } };
const GARDENS = { id: "rei/the-lanternseed-gardens", kind: "sited", tier: "market", at: { x: 1338, y: -994 }, extent: { w: 1854, h: 1637 } };
const LAMP = { id: "rei/a-lamp-in-the-gardens", kind: "sited", placementParent: GARDENS.id, at: { x: 1300, y: -900 }, extent: { w: 1, h: 1 } };
const MARKS = [PARCEL, HOUSE, CHAIR, GARDENS, LAMP];

test("WHAT IS INSIDE A PARCEL STAYS INSIDE IT — the dwelling and its furniture are hidden from outside, drawn from within; a region's furniture is never a parcel's", () => {
  assert.equal(parcelEnclosing(HOUSE, MARKS), PARCEL.id, "the dwelling stands inside the parcel (placementParent)");
  assert.equal(parcelEnclosing(CHAIR, MARKS), PARCEL.id, "and so does the chair in the dwelling (parent, then placementParent)");
  assert.equal(parcelEnclosing(PARCEL, MARKS), null, "a parcel is not inside itself");
  assert.equal(parcelEnclosing(LAMP, MARKS), null, "a lamp in a region stands in no parcel");
  const outside = new Set();
  assert.equal(hiddenInsideParcel(HOUSE, MARKS, outside), true, "outside: the house is the card, not a pip");
  assert.equal(hiddenInsideParcel(CHAIR, MARKS, outside), true, "outside: no furniture through the walls");
  assert.equal(hiddenInsideParcel(LAMP, MARKS, outside), false, "outside: the region's lamp stays");
  assert.equal(hiddenInsideParcel(PARCEL, MARKS, outside), false, "outside: the parcel itself is drawn (as its card)");
  const inside = enclosingParcels(HOUSE.id, MARKS);          // standing in the dwelling
  assert.equal(hiddenInsideParcel(CHAIR, MARKS, inside), false, "inside the house: the chair is drawn");
  assert.equal(hiddenInsideParcel(HOUSE, MARKS, inside), false, "inside the house: the house itself is drawn");
  const OTHER = { id: "wright/the-trueing-house", kind: "sited", placementParent: "wright/the-trueing-house-parcel", at: { x: 0, y: 0 }, extent: { w: 1, h: 1 } };
  const marks2 = [...MARKS, OTHER, { id: "wright/the-trueing-house-parcel", kind: "parcel", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 } }];
  assert.equal(hiddenInsideParcel(OTHER, marks2, inside), true, "inside rei's house, wright's house is still a card from outside");
  assert.equal(parcelEnclosing({ id: "a", parent: "b" }, [{ id: "a", parent: "b" }, { id: "b", parent: "a" }]), null, "a cycle ends");
  assert.match(SOURCE, /\.filter\(\(m\) => !hiddenInsideParcel\(byId\.get\(m\.id\) \?\? m, byId, underfoot\)\);/, "the drawn set honours it");
  // ⚑ THE FLIP: make hiddenInsideParcel return false unconditionally → four lines red.
});

test("THE TELLING IS THE CARDS — the office's prose twin is not rendered (founder: 'a giant regular-text blob redundant with the formatted cards')", () => {
  assert.doesNotMatch(SOURCE, /wv-telling-prose/, "no prose block in the resident telling");
  assert.match(SOURCE, /residentTellingCards\(radial, mine \? isMine : null\)/, "the cards are what is rendered");
  // ⚑ THE FLIP: restore the `read.telling` paragraph render → the first line reds.
});

test("NO GROUND BEFORE THE READ — the resident path does not attempt the ground until its read is in hand", () => {
  assert.match(SOURCE, /if \(onResidentPath\(\) && !readCache\.get\(residentStandpointKey\(\{ x: state\.cam\.x, y: state\.cam\.y \}, state\.handle\)\)\) return;\n\s*minimapLoading = true;/, "the gate sits before the loading flag, so the read's own render retries");
  // ⚑ THE FLIP: delete the gate → the flash returns ("the ground didn't draw (townGround: …)").
});
