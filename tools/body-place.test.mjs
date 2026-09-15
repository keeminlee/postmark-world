// body-place.test.mjs — one owner for where a body is (Linear POS-92, 2026-09-15).
//
// THE INSTANCE. Sollerino's walk named rei/the-lanternstep-house and stopped
// 0.5 m outside Rei's parcel (the rim, #2781's class), inside wright's parlor
// next door, with no crossing on the record. Four readers answered four ways:
// the hover said "at rei/the-lanternstep-house" (the walk's target), the room
// showed nobody (passage only), the office's place string named a 0.2 m thing
// 13 m away, and the reader's own body jumped between the read's standpoint
// and the present row every poll. Keemin: "Multiple SoTs on location?" Yes.
//
// TWO INSTRUMENTS, one for each half of the disease:
//   1. CONSUMER PARITY — one fixture body, and every sentence about its place
//      derived from bodyPlace agrees (this file's unit half; the consumers'
//      wiring is pinned by the census).
//   2. THE READER CENSUS — a source pin naming the only sites allowed to read
//      the walk's target as a place, the read's standpoint, the present rows or
//      the camera as a position. A new site reds with the sentence that names
//      the owner. A text pin is the weaker instrument; it is the only one that
//      fires on the growth itself rather than on a symptom (August's fix,
//      where-is.mjs, shipped with tests of the owner and none against a second
//      owner appearing — and the viewer grew four).
//
// THE CAN-FAIL FLIPS: (a) in placeLabel, print the walk's target as the place
// → "Sollerino at the door" reds; (b) in sceneWalkerSet, drop the coordinate
// clause → "inside by coordinates" reds; (c) restore any `at ${w.mark_id}` in
// the viewer → the census reds.
//
//   node --test tools/body-place.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bodyPlace, placeLabel, sceneWalkerSet, walkerFrameSVG } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ── the fixture: Rei's ground and Wright's parlor, as on the record 09-15 ────
const parcel = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", at: { x: 1075, y: -800 }, extent: { w: 25, h: 25 } };
const house = { id: "rei/the-lanternstep-house", kind: "sited", at: { x: 1075, y: -800 }, extent: { w: 12, h: 12 } };
const lantern = { id: "rei/the-pocket-lantern-for-hal", kind: "sited", class: "thing", at: { x: 1075, y: -800 }, extent: { w: 0.2, h: 0.2 } };
const parlor = { id: "wright/the-lanternstep-parlor", kind: "sited", at: { x: 1088, y: -792 }, extent: { w: 10, h: 6 } };
const marks = [parcel, house, lantern, parlor];
const determined = {};
// the store's row for Sollerino, verbatim shape from /world/walkers 09-15
const sollerino = { handle: "sollerino", x: 1088, y: -794.5, source: "walk", moving: false, toward: null, remaining_m: 0, eta_crossings: 0, mark_id: "rei/the-lanternstep-house" };
// rei, inside her parcel by a crossing on the record
const rei = { handle: "rei", x: 1091.9, y: -797.2, source: "walk", moving: false, mark_id: null };
const acts = [{ handle: "rei", act: "enters", mark: parcel.id, at: 190.9, word: "neutral" }];
const at = 190.95;

test("Sollerino: bound for the house, standing on the parlor's ground, entered nothing — and the sentence says so", () => {
  const place = bodyPlace(sollerino, { marks, acts, at });
  assert.deepEqual(place.position, { x: 1088, y: -794.5 });
  assert.equal(place.inside, parlor.id, "by coordinates he stands on the parlor's ground, not the lantern's (a thing is not ground)");
  assert.equal(place.entered, null, "no crossing on the record");
  assert.equal(place.boundFor, house.id, "the walk's target is where he was going, never where he is");
  assert.equal(placeLabel(place, marks, determined), "on The Lanternstep Parlor's ground, at the door of The Lanternstep House");
});

test("rei: entered her parcel — the sentence is the crossing, not the ground under her", () => {
  const place = bodyPlace(rei, { marks, acts, at });
  assert.equal(place.entered, parcel.id);
  // the record's own oddity, kept as the fixture: her walk position (1091.9,
  // -797.2) is 4.4 m EAST of her parcel's footprint (x ≤ 1087.5) — she walked
  // to her house, arrived at the rim (#2781's class), and entered by an act.
  // Containment says outside; passage says inside; the sentence follows the
  // crossing, because a crossing is the record's own word about a body.
  assert.equal(place.inside, null);
  assert.equal(placeLabel(place, marks, determined), "in The Lanternstep House Parcel");
});

test("a body on open ground, bound for nothing, says so; a moving body says its leg", () => {
  assert.equal(placeLabel(bodyPlace({ handle: "x", x: 5000, y: 5000 }, { marks, acts, at }), marks, determined), "on open ground");
  const leg = placeLabel(bodyPlace({ handle: "y", x: 0, y: 0, moving: true, remaining_m: 120, eta_crossings: 1 }, { marks, acts, at }), marks, determined);
  assert.match(leg, /^120 m to go, ETA /);
  assert.equal(bodyPlace(null), null);
  assert.equal(placeLabel(null), "");
});

test("a walk that arrived INSIDE its target carries no door clause", () => {
  const arrived = { handle: "z", x: 1076, y: -801, mark_id: house.id };
  assert.equal(placeLabel(bodyPlace(arrived, { marks, acts, at }), marks, determined), "on The Lanternstep House's ground");
});

test("the room roster draws bodies inside by coordinates at the threshold, and bodies outside not at all", () => {
  const manifest = new Map([[parcel.id, ["rei"]]]);
  const inside = { handle: "guest", x: 1080, y: -790 };      // inside the parcel's footprint, no crossing
  const outside = { handle: "passer", x: 1200, y: -700 };
  const drawn = sceneWalkerSet({ walkers: [rei, inside, outside, sollerino], manifest, roomId: parcel.id, marks });
  assert.deepEqual(drawn.map((w) => w.handle), ["rei", "guest"], "rei by passage, the guest by coordinates; the passer and Sollerino (0.5 m outside) not at all");
  assert.equal(drawn[0].threshold, undefined, "a crossing draws in full");
  assert.equal(drawn[1].threshold, true, "coordinates alone draw at the threshold");
  assert.deepEqual(sceneWalkerSet({ walkers: [rei, inside], manifest, roomId: null, marks }).map((w) => w.handle), ["rei", "guest"], "outdoors: everyone, unchanged");
  assert.match(walkerFrameSVG({ at: { x: 0, y: 0 }, handle: "guest", threshold: true }), /class="wv-walker-far[^"]*at-threshold"/);
});

// ── THE READER CENSUS ────────────────────────────────────────────────────────
const count = (needle) => VIEWER.split(needle).length - 1;

test("CENSUS: no sentence in the viewer prints the walk's target as a place", () => {
  assert.equal(count("`at ${w.mark_id}`"), 0, "print the place from bodyPlace — walkerPlace(w) — never from mark_id");
  assert.equal(count("walkerPlace(w)"), 3, "the highlight title, the walker identity and the bubble, and only those");
});

test("CENSUS: the reader's own body has one stand-in and one owner", () => {
  assert.equal(count("walkersFromPresent(read.present"), 1, "only loadResidentRead may seed the list from the read; the poll never draws from it");
  assert.equal(count("selfFromRead(read)"), 2, "the seed and the poll's merge — nothing else reads the standpoint as the body");
});

test("CENSUS: the camera is a position for the spectator's dot and nothing else", () => {
  assert.equal(count("px(state.cam)"), 1, "the overlay's standpoint dot — drawn only while there is no body (POS-93)");
});

test("CENSUS: every room roster asks the same containment as bodyPlace", () => {
  const calls = VIEWER.match(/sceneWalkerSet\(\{[^}]*walkers:[^}]*\}/g) ?? [];   // call sites pass `walkers:`; the definition destructures `walkers =`
  assert.ok(calls.length >= 1, "drawWalkers calls it");
  for (const call of calls) assert.match(call, /marks:/, "a roster without marks cannot see a body inside by coordinates");
});
