// body-place.test.mjs — one owner for where a body is (Linear POS-92, 2026-09-15).
//
// THE INSTANCE. Sollerino's walk named rei/the-lanternstep-house and ended at
// (1088, -794.5) — the exact centre of Rei's house, of her parcel, and of the
// 0.2 m pocket lantern that sits there — with no crossing on the ledger. Four
// readers answered four ways: the room showed nobody (passage only, so the
// body Keemin could see "clearly depicted within the Lanternstep House" from
// outside vanished inside), the hover said "at rei/the-lanternstep-house" (the
// walk's target — right by accident), the office's place string named the
// lantern, and the reader's own body jumped between the read's standpoint and
// the present row every poll. Keemin: "Multiple SoTs on location?" Yes.
// (The first cut of this file placed him 0.5 m OUTSIDE her parcel; 0.5 m was
// his distance to its centre. Geometry below is WORLD/world-state.json at
// world main 88a3fb0a, 2026-09-15.)
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
// THE CAN-FAIL FLIPS: (a) in placeLabel, drop `!place.arrived` from the door
// clause → "Sollerino at the centre" reds; (b) in sceneWalkerSet, drop the
// coordinate clause → "the room roster" reds; (c) restore any `at ${w.mark_id}`
// in the viewer → the census reds.
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

// ── the fixture: Rei's ground, as WORLD/world-state.json carried it 09-15 ────
// The parcel, the house and the lantern share one centre; Wright's parlor is a
// 10×6 room nested in the north half of the house (y -795 … -789). The gardens
// district that encloses all of it is left out so open ground stays open.
const parcel = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", at: { x: 1088, y: -794.5 }, extent: { w: 25, h: 25 } };
const house = { id: "rei/the-lanternstep-house", kind: "sited", at: { x: 1088, y: -794.5 }, extent: { w: 12, h: 12 } };
const lantern = { id: "rei/the-pocket-lantern-for-hal", kind: "sited", class: "thing", at: { x: 1088, y: -794.5 }, extent: { w: 0.2, h: 0.2 } };
const parlor = { id: "wright/the-lanternstep-parlor", kind: "sited", class: "portal-ground", at: { x: 1088, y: -792 }, extent: { w: 10, h: 6 } };
const marks = [parcel, house, lantern, parlor];
const determined = {};
// the store's row for Sollerino, verbatim shape from /world/walkers 09-15
const sollerino = { handle: "sollerino", x: 1088, y: -794.5, source: "walk", moving: false, toward: null, remaining_m: 0, eta_crossings: 0, mark_id: "rei/the-lanternstep-house" };
// rei, inside her parcel by a crossing on the record; her row is 3.9 m east and
// 2.7 m south of the centre — inside the house, outside the parlor's rows
const rei = { handle: "rei", x: 1091.9, y: -797.2, source: "walk", moving: false, mark_id: null };
const acts = [{ handle: "rei", act: "enters", mark: parcel.id, at: 190.9, word: "neutral" }];
const at = 190.95;

test("Sollerino at the centre: bound for the house and standing inside it, on the parlor's floor, entered nothing — and the sentence carries no door", () => {
  const place = bodyPlace(sollerino, { marks, acts, at });
  assert.deepEqual(place.position, { x: 1088, y: -794.5 });
  assert.equal(place.inside, parlor.id, "the smallest ground under him is the parlor (a room in the house); the lantern at the same point is a thing, not ground");
  assert.equal(place.entered, null, "no crossing on the record");
  assert.equal(place.boundFor, house.id, "the walk's target is where he was going");
  assert.equal(place.arrived, true, "and his coordinates lie inside it");
  assert.equal(placeLabel(place, marks, determined), "on The Lanternstep Parlor's ground");
});

test("a walk that stopped at its target's rim (#2781) says so: the door clause", () => {
  const rimmed = { handle: "rimmed", x: 1102, y: -794.5, mark_id: house.id };   // 1.5 m east of the parcel's east edge (x ≤ 1100.5)
  const place = bodyPlace(rimmed, { marks, acts, at });
  assert.equal(place.inside, null);
  assert.equal(place.arrived, false);
  assert.equal(placeLabel(place, marks, determined), "on open ground, at the door of The Lanternstep House");
});

test("rei: entered her parcel — the sentence is the crossing, not the ground under her", () => {
  const place = bodyPlace(rei, { marks, acts, at });
  assert.equal(place.entered, parcel.id);
  assert.equal(place.inside, house.id, "by coordinates she stands in the house, south of the parlor's rows");
  assert.equal(placeLabel(place, marks, determined), "in The Lanternstep House Parcel");
});

test("a body on open ground, bound for nothing, says so; a moving body says its leg", () => {
  assert.equal(placeLabel(bodyPlace({ handle: "x", x: 5000, y: 5000 }, { marks, acts, at }), marks, determined), "on open ground");
  const leg = placeLabel(bodyPlace({ handle: "y", x: 0, y: 0, moving: true, remaining_m: 120, eta_crossings: 1 }, { marks, acts, at }), marks, determined);
  assert.match(leg, /^120 m to go, ETA /);
  assert.equal(bodyPlace(null), null);
  assert.equal(placeLabel(null), "");
});

test("a walk that arrived INSIDE its target, on the target's own floor, carries no door clause", () => {
  const arrived = { handle: "z", x: 1090, y: -796, mark_id: house.id };   // in the house, south of the parlor
  const place = bodyPlace(arrived, { marks, acts, at });
  assert.equal(place.inside, house.id);
  assert.equal(placeLabel(place, marks, determined), "on The Lanternstep House's ground");
});

test("the room roster draws bodies inside by coordinates at the threshold, and bodies outside not at all", () => {
  const manifest = new Map([[parcel.id, ["rei"]]]);
  const inside = { handle: "guest", x: 1080, y: -790 };      // inside the parcel's footprint, no crossing
  const outside = { handle: "passer", x: 1200, y: -700 };
  const drawn = sceneWalkerSet({ walkers: [rei, inside, outside, sollerino], manifest, roomId: parcel.id, marks });
  assert.deepEqual(drawn.map((w) => w.handle), ["rei", "guest", "sollerino"], "rei by passage; the guest and Sollerino by coordinates; the passer not at all");
  assert.equal(drawn[0].threshold, undefined, "a crossing draws in full");
  assert.equal(drawn[1].threshold, true, "coordinates alone draw at the threshold");
  assert.equal(drawn[2].threshold, true, "Sollerino's dot in Rei's house — the missing dot Keemin reported");
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
  // two sites, ONE thing: the overlay sets the dot down, and syncStandpointDot
  // puts it back when a later draw culls the body it once drew (#2848 (a)).
  // Both are the standpoint dot — drawn only while no body of the reader's is
  // DRAWN (POS-93, asked of the drawn set since 2026-09-17). A third site is
  // something else reading the camera as a body, which is what this counts.
  assert.equal(count("px(state.cam)"), 2, "the standpoint dot's two sites — the overlay's set-down and the walker pass's put-back — and nothing else");
});

test("CENSUS: every room roster asks the same containment as bodyPlace", () => {
  const calls = VIEWER.match(/sceneWalkerSet\(\{[^}]*walkers:[^}]*\}/g) ?? [];   // call sites pass `walkers:`; the definition destructures `walkers =`
  assert.ok(calls.length >= 1, "drawWalkers calls it");
  for (const call of calls) assert.match(call, /marks:/, "a roster without marks cannot see a body inside by coordinates");
});
