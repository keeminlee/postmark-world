// viewer-interior.test.mjs — THE ROOM AS A SCENE OF THE ONE ENGINE.
//
// The founder's ruling (2026-08-20): ONE ENGINE, ONE RENDER, DIFFERENT SCENES.
// A room renders through the same painting machinery as the town — the same
// pips, the same hover, the same click precedence — and the ONLY scene-unique
// element is the GROUND: a white placeholder, replaced by the mark's own image
// when it has one, overlaid with an svg art slot, mirroring the atlas's own
// base-raster-svg structure. The custom interior renderer this file used to
// test is gone; what remains under test here is the DATA path (occupancy →
// room → furniture → radial), the plaque (telling chrome), the ground builder,
// and the rim. The scene swap itself is exercised at the rig (scene-qa).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROOM_GROUND_UNITS, SPECTATOR_ACTOR,
  interiorFurniture, interiorPlaqueHTML, markImagePath,
  placeholderExtentSVG, placeholderHue, rimPointOf, sceneArtSVG, roomGround, sceneRuleM, standpointOccupancy,
} from "../spectator/viewer.mjs";
import { assembleWorld } from "./world-build.mjs";
import { investigate } from "./world-verbs.mjs";
import { isEntity, occupancyAt, parseThresholdLedger, withinOf } from "./thresholds.mjs";
import { fractionalCrossing } from "./walk.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const world = assembleWorld({
  worldState: JSON.parse(read("WORLD/world-state.json")),
  skeleton: JSON.parse(read("WORLD/skeleton.json")),
});
const byId = new Map(world.marks.map((m) => [m.id, m]));
const LEDGER = read("WORLD/threshold-ledger.md");
const REAL_ACTS = parseThresholdLedger(LEDGER).acts;
// THE FIXTURE IS SYNTHETIC ON PURPOSE (state-durable-facts): the live ledger
// moves with every crossing, so a test pinned to who happens to be inside
// TODAY fails the day they step out. The MARKS are the durable half — the
// Town Centre exists by constitution — so the crossing is synthesized and the
// room is real.
const FIXTURE_ACTS = parseThresholdLedger(
  `- 2026-08-20T01:00:00.000Z · wright · enters the-town/the-town-centre · at 138.0000 · word neutral\n`).acts;
const FIXTURE_AT = 999;

/** The whole data path the viewer walks, in one call: ledger → occupancy →
 *  room → investigate → furniture. If the wiring drifts these fail together. */
function realInterior({ acts = FIXTURE_ACTS, handle = "wright", at = FIXTURE_AT } = {}) {
  const occupancy = occupancyAt(acts, at);
  const roomId = withinOf(occupancy, handle);
  if (!roomId) return null;
  const room = byId.get(roomId);
  const found = investigate(roomId, world, { occupancy, budget: 40 });
  const children = (found.children ?? []).map((c) => (isEntity(c) ? c : { ...(byId.get(c.id) ?? c) }));
  return { room, ...interiorFurniture({ room, children }), you: handle };
}

// ── the real record ─────────────────────────────────────────────────────────
test("the real marks build a real interior — the Town Centre, entered", () => {
  const built = realInterior();
  assert.ok(built, "wright's standing crossing is the fixture; without it nothing below proves anything");
  assert.equal(built.room.id, "the-town/the-town-centre");
  assert.ok(built.things.length >= 10,
    `the Town Centre holds real furniture on the record (got ${built.things.length})`);
  assert.deepEqual(built.bodies, ["wright"]);
});

test("the plaque speaks in the ROOM's own words, not about it", () => {
  const built = realInterior();
  const html = interiorPlaqueHTML({ room: built.room, bodies: built.bodies, you: built.you, name: "The Town Centre" });
  assert.match(html, /you are inside/i);
  assert.match(html, /The Town Centre/);
  assert.ok(built.room.body && built.room.body.length > 20, "the fixture room must have prose to plaque");
  assert.match(html, /lamplit quay/, "the plaque is the mark's body text verbatim");
  assert.match(html, /have it to yourself/, "alone is said plainly rather than left blank");
});

// ── the ground (the ONE scene-unique element) ───────────────────────────────
test("the ground is the paper floor for an art-less room, with the art slot ready", () => {
  const g = roomGround({ id: "r", at: { x: 100, y: -50 }, extent: { w: 12, h: 12 } });
  assert.match(g.svgText, /wv-scene-ground/, "the full-bleed base rect exists");
  assert.match(g.svgText, /wv-scene-rule-pat/, "squared paper — the drafting sheet's rule (founder's revision of his own white)");
  assert.match(g.svgText, /wv-scene-wall/, "the room's own boundary is drawn as the wall");
  assert.doesNotMatch(g.svgText, /<image/, "no image invented for a mark that has none");
  assert.match(g.svgText, /wv-scene-art/, "the svg overlay slot exists either way — the atlas's own structure");
});

test("the paper's rule is a round number of metres at any room size", () => {
  for (const extent of [{ w: 12, h: 12 }, { w: 0.5, h: 0.5 }, { w: 300, h: 120 }]) {
    const g = roomGround({ id: "r", at: { x: 0, y: 0 }, extent });
    const m = sceneRuleM(g.mPerPx);
    assert.ok([0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500].includes(m), `${m} m squares for ${extent.w} m room`);
  }
});

test("a room with shelf art wears it over its own footprint; off-shelf art is refused", () => {
  const room = { id: "r", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } };
  const withArt = roomGround(room, { image: "/media/x/y.png" });
  assert.match(withArt.svgText, /<image href="\/media\/x\/y\.png"/, "the mark's image replaces the white");
  // "the background represented by the image" (Keemin, 2026-08-21): the room's
  // ground FILLS — slice, cropping the overflow — while the mark card keeps meet.
  assert.match(withArt.svgText, /preserveAspectRatio="xMidYMid slice"/, "a ground fills its room");
  // markImagePath is the gate the caller uses: an off-shelf URL never becomes a path
  assert.equal(markImagePath({ image: "https://evil.example/x.jpg" }), null, "only the shelf is wearable");
});

test("the registration round-trips: a world point projected onto the ground comes back itself", () => {
  const g = roomGround({ id: "r", at: { x: 1075, y: -800 }, extent: { w: 12, h: 12 } });
  const world = { x: 1077.5, y: -803.25 };
  const px = { x: g.originPx.x + world.x / g.mPerPx, y: g.originPx.y + world.y / g.mPerPx };
  const back = { x: (px.x - g.originPx.x) * g.mPerPx, y: (px.y - g.originPx.y) * g.mPerPx };
  assert.ok(Math.abs(back.x - world.x) < 1e-9 && Math.abs(back.y - world.y) < 1e-9);
});

test("the room's centre lands at the ground's centre", () => {
  const g = roomGround({ id: "r", at: { x: 40, y: 90 }, extent: { w: 20, h: 20 } });
  const px = { x: g.originPx.x + 40 / g.mPerPx, y: g.originPx.y + 90 / g.mPerPx };
  const vb = g.svgText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(vb, "the ground declares its viewBox");
  assert.ok(Math.abs(px.x - Number(vb[1]) / 2) < 0.6 && Math.abs(px.y - Number(vb[2]) / 2) < 0.6);
});

test("THE NUMERIC REGIME: a room spans ~ROOM_GROUND_UNITS of its own ground, not a sliver of the town's", () => {
  // the whole reason a scene carries its own registration: the engine runs at
  // zoomK ≈ 1 indoors, exactly the regime the town tuned it for — never the
  // 400–600× deep zoom past MAX_ZOOM_IN that a shared svg forced
  for (const extent of [{ w: 12, h: 12 }, { w: 0.5, h: 0.5 }, { w: 300, h: 120 }]) {
    const g = roomGround({ id: "r", at: { x: 0, y: 0 }, extent });
    const span = Math.max(extent.w, extent.h) / g.mPerPx;
    assert.ok(span > ROOM_GROUND_UNITS * 0.7 && span <= ROOM_GROUND_UNITS,
      `a ${extent.w}×${extent.h} room spans ${span.toFixed(0)} ground units`);
  }
});

test("PLACEHOLDERS: deterministic per-mark hue, low saturation, art-less only", () => {
  const px = (p) => ({ x: p.x, y: p.y });
  const a = placeholderExtentSVG({ id: "r/shelf", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 2 } }, px);
  const b = placeholderExtentSVG({ id: "r/stove", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 2 } }, px);
  assert.match(a, /hsl\(\d+ 22% 76%\)/, "low saturation by the founder's word — never transparency");
  assert.notEqual(a.match(/hsl\((\d+)/)[1], b.match(/hsl\((\d+)/)[1], "two marks, two hues — nesting reads");
  assert.equal(a, placeholderExtentSVG({ id: "r/shelf", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 4, h: 2 } }, px),
    "the same mark is the same colour on every load for every reader");
  assert.equal(placeholderHue("r/shelf"), placeholderHue("r/shelf"));
  const arty = placeholderExtentSVG({ id: "r/pic", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, image: "https://media.postmark.town/media/a/b.png" }, px);
  assert.equal(arty, "", "a mark wearing its art needs no stand-in");
  const dot = placeholderExtentSVG({ id: "r/point", kind: "sited", at: { x: 0, y: 0 } }, px);
  assert.equal(dot, "", "a point has no extent to stand in for");
});

test("ART HANGS: a shelf-clad mark draws framed art over its extent; off-shelf refuses", () => {
  const px = (p2) => ({ x: p2.x, y: p2.y });
  const clad = sceneArtSVG({ id: "r/pic", kind: "sited", at: { x: 10, y: 10 }, extent: { w: 4, h: 2 },
    image: "https://media.postmark.town/media/a/b.svg" }, px);
  assert.match(clad, /wv-scene-mark-art/);
  assert.match(clad, /<image href="\/shelf\/a\/b\.svg"/, "the shelf URL rides as the same-origin route");
  assert.match(clad, /wv-scene-art-frame/, "framed, as the bulletin promised");
  assert.equal(sceneArtSVG({ id: "r/bad", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 },
    image: "https://evil.example/x.jpg" }, px), "", "off-shelf art never hangs");
});

test("markup in a mark's image path cannot escape the ground", () => {
  const g = roomGround({ id: "r", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } },
    { image: '/media/a/"onload="alert(1)' });
  assert.doesNotMatch(g.svgText, /onload="alert/, "the href is escaped, not interpolated");
});

// ── the furniture (the radial's source) ─────────────────────────────────────
test("furniture excludes the room itself and anything with no place", () => {
  const room = { id: "the/room", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 } };
  const { things } = interiorFurniture({
    room,
    children: [
      room,                                                             // itself
      { id: "the/predicate", kind: "predicated" },                      // no at
      { id: "the/chair", kind: "sited", at: { x: 101, y: 100 } },
      { id: "the/table", kind: "sited", at: { x: 100, y: 100 } },
    ],
  });
  assert.deepEqual(things.map((t) => t.id), ["the/table", "the/chair"],
    "nearest the centre first, and neither the room nor a predicate is furniture");
});

test("bodies come from the ENTITY children and nothing else", () => {
  const { things, bodies } = interiorFurniture({
    room: { id: "r", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } },
    children: [
      { id: "kilean", kind: "entity", handle: "kilean", at: null },
      { id: "r/bench", kind: "sited", at: { x: 1, y: 1 } },
      { id: "postmaster", kind: "entity", handle: "postmaster", at: null },
    ],
  });
  assert.deepEqual(bodies, ["kilean", "postmaster"], "sorted, and only the entities");
  assert.deepEqual(things.map((t) => t.id), ["r/bench"], "a body is not a thing on the floor");
});

test("PRESENCE IS OCCUPANCY-SCOPED — someone in another room cannot appear in this one", () => {
  const acts = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · kilean · enters the-town/the-town-centre · at 138.0000 · word neutral\n`
    + `- 2026-08-20T01:01:00.000Z · postmaster · enters the-town/the-post-office · at 138.0010 · word welcomed\n`).acts;
  const occupancy = occupancyAt(acts, 999);
  const found = investigate("the-town/the-town-centre", world, { occupancy, budget: 40 });
  const children = (found.children ?? []).map((c) => (isEntity(c) ? c : { ...(byId.get(c.id) ?? c) }));
  const { bodies } = interiorFurniture({ room: byId.get("the-town/the-town-centre"), children });
  assert.ok(bodies.includes("kilean"), "the one who crossed into THIS room is here");
  assert.ok(!bodies.includes("postmaster"), "the one who crossed into another is not");
});

// ── who gets a scene ────────────────────────────────────────────────────────
test("A SPECTATOR NEVER GETS AN INTERIOR — a camera has no body to carry inside", () => {
  const spectator = standpointOccupancy({ acts: REAL_ACTS, at: fractionalCrossing(), handle: SPECTATOR_ACTOR });
  assert.equal(spectator.insideOf, null, "so composeTelling's interior branch cannot fire for it");
  assert.deepEqual(spectator.entered, []);
  const none = standpointOccupancy({ acts: REAL_ACTS, at: fractionalCrossing(), handle: null });
  assert.equal(none.insideOf, null);
});

test("the room is the ENTERED mark, never the geometric one you are standing on", () => {
  const built = realInterior();
  assert.equal(built.room.id, withinOf(occupancyAt(FIXTURE_ACTS, FIXTURE_AT), "wright"));
  assert.equal(realInterior({ acts: [] }), null);
});

test("one resident being in a room does not put another resident in it", () => {
  const acts = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · wright · enters the-town/the-town-centre · at 138.0000 · word neutral\n`).acts;
  const at = 999;
  assert.equal(standpointOccupancy({ acts, at, handle: "wright" }).insideOf, "the-town/the-town-centre");
  assert.equal(standpointOccupancy({ acts, at, handle: "kilean" }).insideOf, null,
    "kilean has crossed nothing, so kilean is inside nothing");
  assert.deepEqual(standpointOccupancy({ acts, at, handle: "kilean" }).entered, []);
});

test("FALSIFIER: an exit appended to the ledger closes the interior", () => {
  const exited = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · wright · enters the-town/the-town-centre · at 138.0000 · word neutral\n`
    + `- 2026-08-20T02:00:00.000Z · wright · exits the-town/the-town-centre · at 138.1300\n`).acts;
  assert.equal(realInterior({ acts: exited }), null, "no room, so nothing to draw");
  assert.ok(realInterior({ acts: exited, at: 138.12 }), "still inside at 138.12");
});

// ── stepping out ────────────────────────────────────────────────────────────
test("stepping out lands on the RIM, not the centre", () => {
  const room = { at: { x: 0, y: 0 }, extent: { w: 100, h: 60 } };
  const rim = rimPointOf(room, { x: 0, y: 500 });   // approaching from the south
  assert.equal(rim.y, 30, "the southern edge of the extent");
  assert.equal(rim.x, 0);
  assert.notDeepEqual(rim, { x: 0, y: 0 }, "never the middle of the building you just left");
});

test("the rim is on the side you came from", () => {
  const room = { at: { x: 0, y: 0 }, extent: { w: 100, h: 60 } };
  assert.equal(rimPointOf(room, { x: -900, y: 0 }).x, -50, "from the west, the western rim");
  assert.equal(rimPointOf(room, { x: 900, y: 0 }).x, 50, "from the east, the eastern rim");
});

test("with no approach on the record the rim falls to the southern edge", () => {
  const room = { at: { x: 10, y: 10 }, extent: { w: 40, h: 20 } };
  assert.deepEqual(rimPointOf(room, null), { x: 10, y: 20 });
  assert.deepEqual(rimPointOf(room, { x: 10, y: 10 }), { x: 10, y: 20 }, "standing at the centre is no approach");
});

test("the real room's rim is on its boundary and outside its middle", () => {
  const room = byId.get("the-town/the-town-centre");
  const rim = rimPointOf(room, { x: 0, y: 4000 });
  assert.equal(rim.y, room.at.y + room.extent.h / 2, "exactly the recorded edge");
});

test("a room with no extent cannot throw — the rim is its own point", () => {
  assert.deepEqual(rimPointOf({ at: { x: 4, y: 5 } }, { x: 0, y: 0 }), { x: 4, y: 5 });
  assert.deepEqual(rimPointOf(null, null), { x: 0, y: 0 });
});

// ── escaping ────────────────────────────────────────────────────────────────
test("markup in a room's prose, name, or company cannot escape the plaque", () => {
  const plaque = interiorPlaqueHTML({
    room: { id: "r", body: '<b>bold</b> & "quoted"' }, name: "<i>Room</i>", bodies: ["<em>a</em>"],
  });
  assert.doesNotMatch(plaque, /<b>bold<\/b>/);
  assert.doesNotMatch(plaque, /<i>Room<\/i>/);
  assert.match(plaque, /&amp;/);
});

// ── the way out names where it goes (Wright, 2026-08-21) ────────────────────
//
// Occupancy is a STACK, not a flag: wright entered the-trueing-terrace and
// the-trueing-house in a single act, so one press of "step outside" leaves the
// house and leaves him standing in the terrace — still indoors, and with the
// terrace's own camera capped at its walls, which is half of why the way out
// felt like a locked view. The button now says which room it opens onto, so a
// nested dweller knows before pressing rather than after.
//
// THE HALF THIS DOES NOT DECIDE: whether one press should leave the whole
// stack. That is a record-semantics call and is the founder's.

test("EXIT NAMES ITS DESTINATION: leaving a nested room lands you in the room around it", async () => {
  const { exitDestination, exitButtonLabel } = await import("../spectator/viewer.mjs");
  // wright's real shape, outermost -> innermost
  const stack = ["wright/the-trueing-terrace", "wright/the-trueing-house"];
  assert.equal(exitDestination(stack), "wright/the-trueing-terrace");
  assert.equal(
    exitButtonLabel(stack, (id) => (id === "wright/the-trueing-terrace" ? "the Trueing Terrace" : id)),
    "↤ step outside → the Trueing Terrace",
  );
});

test("and says nothing extra when the next press really does put you outdoors", async () => {
  const { exitDestination, exitButtonLabel } = await import("../spectator/viewer.mjs");
  assert.equal(exitDestination(["wright/the-trueing-terrace"]), null, "one room deep: the next step is outside");
  assert.equal(exitButtonLabel(["wright/the-trueing-terrace"]), "↤ step outside");
  // and the empty / malformed cases answer the same rather than throwing
  assert.equal(exitDestination([]), null);
  assert.equal(exitDestination(null), null);
  assert.equal(exitDestination([null, undefined]), null, "a stack of nothing is not a destination");
  assert.equal(exitButtonLabel([]), "↤ step outside");
});

test("a stack three deep names the room it opens onto, not the one at the bottom", async () => {
  const { exitDestination } = await import("../spectator/viewer.mjs");
  assert.equal(exitDestination(["a/outer", "a/middle", "a/inner"]), "a/middle",
    "the destination is one step out, never all the way out — that is what a crossing means");
});
