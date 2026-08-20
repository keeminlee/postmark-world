// viewer-interior.test.mjs — the interior recipe: a room, seen from inside it.
//
// Brief 1 proved occupancy reaches the viewer. This proves the viewer can DRAW
// the room that occupancy names, and that it draws the room the record actually
// describes rather than a plausible-looking one.
//
// The live fixture is the town's own record: wright is inside the-town-centre on
// main, so the interior these tests build is a real interior. The probes that
// matter most are the ones guarding rulings that could be broken silently:
//   · a SPECTATOR never gets an interior (a camera has no body to carry across a
//     threshold) — and the exterior's geometric `within` must never be the room;
//   · presence is OCCUPANCY-SCOPED — a resident in another room cannot appear;
//   · NO PAINTING inside — the atlas must not leak through the floor;
//   · exit lands on the RIM, never the centre.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INTERIOR_MIN_M_PER_PX, INTERIOR_VIEWPORT, SPECTATOR_ACTOR,
  interiorBodySVG, interiorFraming, interiorFurniture, interiorPlaqueHTML,
  interiorPx, interiorRecipe, interiorRuleM, interiorSVG, interiorThingSVG,
  paperFloorSVG, rimPointOf, standpointOccupancy,
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

/** The whole path the viewer walks, in one call: ledger → occupancy → room →
 *  investigate → recipe. Every test below that says "the real record" uses this,
 *  so if the wiring drifts they all fail together rather than one at a time. */
function realInterior({ acts = REAL_ACTS, handle = "wright", at = fractionalCrossing() } = {}) {
  const occupancy = occupancyAt(acts, at);
  const roomId = withinOf(occupancy, handle);
  if (!roomId) return null;
  const room = byId.get(roomId);
  const found = investigate(roomId, world, { occupancy, budget: 40 });
  const children = (found.children ?? []).map((c) => (isEntity(c) ? c : { ...(byId.get(c.id) ?? c) }));
  return { room, recipe: interiorRecipe({ room, children, you: handle }) };
}

// ── the real record ─────────────────────────────────────────────────────────
test("the real record builds a real interior — wright is inside the Town Centre", () => {
  const built = realInterior();
  assert.ok(built, "wright's standing crossing is the fixture; without it nothing below proves anything");
  assert.equal(built.room.id, "the-town/the-town-centre");
  assert.ok(built.recipe.things.length >= 10,
    `the Town Centre holds real furniture on the record (got ${built.recipe.things.length})`);
  assert.deepEqual(built.recipe.bodies, ["wright"]);
  assert.equal(built.recipe.you, "wright");
});

test("the plaque speaks in the ROOM's own words, not about it", () => {
  const built = realInterior();
  const html = interiorPlaqueHTML({ ...built.recipe, room: built.room, name: "The Town Centre" });
  assert.match(html, /you are inside/i);
  assert.match(html, /The Town Centre/);
  // the mark's own body, off the record — not a caption this file wrote
  assert.ok(built.room.body && built.room.body.length > 20, "the fixture room must have prose to plaque");
  assert.match(html, /lamplit quay/, "the plaque is the mark's body text verbatim");
  assert.match(html, /have it to yourself/, "alone is said plainly rather than left blank");
});

// ── the framing ─────────────────────────────────────────────────────────────
test("the room's own centre lands in the middle of the panel", () => {
  const room = { id: "r", at: { x: -75, y: -75 }, extent: { w: 2000, h: 1500 } };
  const framing = interiorFraming({ room });
  const p = interiorPx(framing, room.at);
  assert.ok(Math.abs(p.x - framing.W / 2) < 0.001, "horizontally centred");
  assert.ok(Math.abs(p.y - framing.H / 2) < 0.001, "vertically centred");
});

test("fit-to-extent: the floor fills the panel without touching its edge", () => {
  const framing = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 2000, h: 1500 } } });
  assert.ok(framing.floorPx.w <= framing.W && framing.floorPx.h <= framing.H, "inside the panel");
  assert.ok(framing.floorPx.w > framing.W * 0.7 || framing.floorPx.h > framing.H * 0.7, "and filling it");
  assert.ok(framing.floorPx.w < framing.W, "with air at the edge — a flush floor reads as a crop");
});

test("THE SCALE FLOOR caps magnification for a tiny room, and leaves a normal one alone", () => {
  const cupboard = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 0.4, h: 0.4 } } });
  assert.equal(cupboard.mPerPx, INTERIOR_MIN_M_PER_PX,
    "a sub-metre room is held at the floor rather than magnified until the paper grain wins");
  const hall = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 2000, h: 1500 } } });
  assert.ok(hall.mPerPx > INTERIOR_MIN_M_PER_PX, "a real room is fitted, not floored");
});

test("the rule is a round number of metres and near enough to read as squared paper", () => {
  for (const mPerPx of [0.004, 0.05, 0.4, 2.58, 40]) {
    const m = interiorRuleM(mPerPx);
    assert.ok(m > 0, "a spacing is always chosen");
    const px = m / mPerPx;
    assert.ok(px > 8 && px < 260, `${m} m at ${mPerPx} m/px is ${px.toFixed(0)} px — legible`);
  }
});

// ── what is in the room ─────────────────────────────────────────────────────
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

// ── the drawing ─────────────────────────────────────────────────────────────
test("NO PAINTING INSIDE — the atlas cannot leak through the floor", () => {
  const built = realInterior();
  const svg = interiorSVG({ ...built.recipe, room: built.room });
  assert.match(svg, /wv-int-floor/, "there is a floor");
  assert.doesNotMatch(svg, /atlas/i, "and no atlas");
  assert.doesNotMatch(svg, /town\.html/, "and nothing fetched from the painting");
  assert.doesNotMatch(svg, /wv-overlay|ov-pip|ov-reach/, "and none of the exterior's overlay furniture");
});

test("an image-mark hangs as FRAMED ART; a plain mark does not", () => {
  const framing = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 20, h: 20 } } });
  const art = interiorThingSVG(
    { id: "r/picture", kind: "sited", at: { x: 2, y: 2 }, extent: { w: 2, h: 2 },
      image: "https://media.postmark.town/media/keeminlee/abc123.jpg" },
    framing);
  assert.match(art, /<image/, "the picture is hung");
  assert.match(art, /wv-far-art-frame/, "in a frame — the same one the far country uses");
  assert.match(art, /abc123\.jpg/);
  assert.match(art, /href="\/media\//, "as a same-origin path — an SVG href takes no host");
  assert.doesNotMatch(art, /https:/, "the absolute shelf url never reaches the markup");

  const plain = interiorThingSVG({ id: "r/bench", kind: "sited", at: { x: 1, y: 1 }, extent: { w: 2, h: 1 } }, framing);
  assert.doesNotMatch(plain, /<image/, "a bench is not a picture");
  assert.match(plain, /wv-int-pip/);
});

test("an off-shelf image URL is refused rather than hung", () => {
  const framing = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 20, h: 20 } } });
  const svg = interiorThingSVG(
    { id: "r/bad", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, image: "https://evil.example/x.jpg" },
    framing);
  assert.doesNotMatch(svg, /evil\.example/, "only the media shelf is hangable");
  assert.match(svg, /wv-int-pip/, "and it falls back to being a thing on the floor");
});

test("you are marked as yourself, and company is drawn apart from you", () => {
  const framing = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 20, h: 20 } } });
  const you = interiorBodySVG("wright", framing, { index: 0, of: 2, you: true });
  const them = interiorBodySVG("kilean", framing, { index: 1, of: 2, you: false });
  assert.match(you, /is-you/);
  assert.match(you, /\(you\)/);
  assert.doesNotMatch(them, /is-you/);
  const spot = (svg) => `${svg.match(/cx="([-\d.]+)"/)?.[1]},${svg.match(/cy="([-\d.]+)"/)?.[1]}`;
  assert.notEqual(spot(you), spot(them), "two bodies in one room do not stand in the same spot");
  // and a pair reads side by side rather than stacked in one column
  assert.notEqual(you.match(/cx="([-\d.]+)"/)?.[1], them.match(/cx="([-\d.]+)"/)?.[1],
    "a pair is spread across the room, not down it");
});

test("a single occupant stands at the room's centre rather than off on a radius", () => {
  const framing = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 20, h: 20 } } });
  const svg = interiorBodySVG("wright", framing, { index: 0, of: 1, you: true });
  assert.match(svg, new RegExp(`cx="${(framing.W / 2).toFixed(1)}"`));
});

test("the floor is paper: a ruled sheet with walls, and no fetched asset", () => {
  const svg = paperFloorSVG(interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 100, h: 80 } } }));
  assert.match(svg, /wv-int-floor/);
  assert.match(svg, /wv-int-wall/);
  assert.match(svg, /<pattern/, "the square rule");
  assert.doesNotMatch(svg, /href/, "nothing is loaded to draw a floor");
});

// ── the rulings that could break quietly ────────────────────────────────────
test("A SPECTATOR NEVER GETS AN INTERIOR — a camera has no body to carry inside", () => {
  const spectator = standpointOccupancy({ acts: REAL_ACTS, at: fractionalCrossing(), handle: SPECTATOR_ACTOR });
  assert.equal(spectator.insideOf, null, "so composeTelling's interior branch cannot fire for it");
  assert.deepEqual(spectator.entered, []);
  const none = standpointOccupancy({ acts: REAL_ACTS, at: fractionalCrossing(), handle: null });
  assert.equal(none.insideOf, null);
});

test("the room is the ENTERED mark, never the geometric one you are standing on", () => {
  // wright's crossing is the only thing that puts him inside; his coordinates are
  // not consulted anywhere in this path, which is the whole of R15 in one probe
  const built = realInterior();
  assert.equal(built.room.id, withinOf(occupancyAt(REAL_ACTS, fractionalCrossing()), "wright"));
  // and with the acts removed there is no room at all, however he is standing
  assert.equal(realInterior({ acts: [] }), null);
});

test("FALSIFIER: an exit appended to the ledger closes the interior", () => {
  const exited = parseThresholdLedger(
    LEDGER + `- 2026-08-20T02:00:00.000Z · wright · exits the-town/the-town-centre · at 138.1300\n`).acts;
  assert.equal(realInterior({ acts: exited }), null, "no room, so nothing to draw");
  // and before the exit's own clock he is still inside — an exit is an act in
  // time, not a retraction of one
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
test("markup in a mark id, a body, or a handle cannot escape the room", () => {
  const framing = interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } } });
  const thing = interiorThingSVG({ id: '<script>x</script>', kind: "sited", at: { x: 0, y: 0 } }, framing,
    { nameOf: () => '<script>x</script>' });
  assert.doesNotMatch(thing, /<script>/);
  assert.match(interiorBodySVG('<img src=x>', framing), /&lt;img/);
  const plaque = interiorPlaqueHTML({
    room: { id: "r", body: '<b>bold</b> & "quoted"' }, name: "<i>Room</i>", bodies: ["<em>a</em>"],
  });
  assert.doesNotMatch(plaque, /<b>bold<\/b>/);
  assert.doesNotMatch(plaque, /<i>Room<\/i>/);
  assert.match(plaque, /&amp;/);
});

test("the viewport default is the one the panel is drawn at", () => {
  assert.equal(interiorFraming({ room: { at: { x: 0, y: 0 }, extent: { w: 10, h: 10 } } }).W, INTERIOR_VIEWPORT.w);
});
