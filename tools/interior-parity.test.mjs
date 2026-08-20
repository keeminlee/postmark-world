// interior-parity.test.mjs — everything you can do outside, you can do inside.
//
// The founder entered the Lanternstep House from the site and hit a wall: "you
// can't actually move around or interact the way you can in the main world when
// in here. you also have no way to exit."
//
// ── THE DIAGNOSIS, because it was not the button ────────────────────────────
//
// Every interactive surface the interior had lived in the TELLING RAIL — the
// plaque, the cards, the enter chips, the way out. And the viewer's DEFAULT view
// mode is painting-only: readPaintingOnly returns TRUE for an unset key, and the
// site sets nothing (the demo rig explicitly sets "0", which is why the bug never
// showed on the rig). Painting-only collapses that rail to zero width.
//
// So a resident who refreshed while inside got the floor drawn and everything
// else `visibility: hidden`. Measured, before the fix:
//
//     isInside true · floorDrawn 1 · tellingCollapsed true
//     EXIT   visibility hidden, reachable false
//     PLAQUE visibility hidden, reachable false
//
// Two more faults sat underneath it, both mine, both found by clicking:
//   · the is-inside rule hid the BUBBLES and the WALK DESK along with the atlas —
//     they are not the painting, they are how a reader acts on whatever is shown;
//   · the interior panel sat at z-index 8, above the walk desk (8) and bubbles
//     (7), so a walk could be armed from the floor and never confirmed.
//
// The floor owns the panel in every view mode, so the floor is where the way out
// and the acting have to be.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  interiorBodySVG, interiorExitHTML, interiorFraming, interiorPx, interiorSVG, interiorWorldAt,
  readPaintingOnly,
} from "../spectator/viewer.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

const ROOM = { id: "rei/the-lanternstep-house", at: { x: 1075, y: -800 }, extent: { w: 12, h: 12 } };
const framing = interiorFraming({ room: ROOM });

// ── the condition that caused it ────────────────────────────────────────────
test("THE DEFAULT VIEW MODE IS PAINTING-ONLY — the condition the bug needed", () => {
  // an unset key means painting-only, which collapses the telling rail. The site
  // sets nothing. If this ever flips, the fix below stops being load-bearing —
  // but the fix is right either way, so this is a note, not a dependency.
  assert.equal(readPaintingOnly({ getItem: () => null }), true, "unset = painting-only");
  assert.equal(readPaintingOnly({ getItem: () => "0" }), false, "the demo rig's override");
  assert.equal(readPaintingOnly(undefined), true, "and no storage at all is painting-only too");
});

// ── the exit ────────────────────────────────────────────────────────────────
test("FALSIFIER: the way out is rendered ON THE FLOOR, not only in the telling rail", () => {
  const html = interiorExitHTML(ROOM.id, "The Lanternstep House");
  assert.match(html, /wv-int-floor-exit/, "it has its own place on the floor");
  assert.match(html, /wv-int-exit-btn/, "and the same class the telling rail's button uses");
  assert.match(html, /data-mark="rei\/the-lanternstep-house"/, "naming the room it leaves");
  assert.match(html, /step outside/);
  assert.match(html, /The Lanternstep House/, "and the room by name, so it reads as a door");
});

test("FALSIFIER: the panel actually renders the floor exit", () => {
  // an exported-but-unrendered exit is the bug wearing a test
  assert.match(SOURCE, /panel\.innerHTML = interiorSVG\([^;]*\)\s*\n\s*\+ interiorExitHTML\(/,
    "syncInteriorPanel must append the floor exit to what it draws");
});

test("FALSIFIER: the is-inside rule no longer hides the acting chrome", () => {
  const rule = SOURCE.match(/\.wv-minimap\.is-inside > svg,[\s\S]*?\{ display:none; \}/)?.[0] ?? "";
  assert.ok(rule, "the is-inside hide rule is still findable");
  assert.doesNotMatch(rule, /wv-bubbles/, "a mark card must have somewhere to open inside");
  assert.doesNotMatch(rule, /wv-walkdesk/, "a walk must have somewhere to be confirmed inside");
  assert.match(rule, /> svg/, "but the PAINTING itself is still gone — that ruling stands");
});

test("FALSIFIER: the floor sits BENEATH the chrome a reader acts through", () => {
  const panel = SOURCE.match(/\.wv-interior-panel \{[^}]*\}/)?.[0] ?? "";
  const z = Number(panel.match(/z-index:(\d+)/)?.[1]);
  assert.ok(Number.isFinite(z), `the panel declares a z-index: ${panel}`);
  const bubbles = Number(SOURCE.match(/\.wv-bubbles \{[^}]*z-index:(\d+)/)?.[1]);
  const desk = Number(SOURCE.match(/\.wv-walkdesk \{[^}]*z-index:(\d+)/)?.[1]);
  assert.ok(z < bubbles, `the floor (${z}) must sit under the bubbles (${bubbles})`);
  assert.ok(z < desk, `the floor (${z}) must sit under the walk desk (${desk}) — or a walk cannot be confirmed`);
});

// ── the floor as ground ─────────────────────────────────────────────────────
test("a click on the floor becomes a place: projection round-trips", () => {
  for (const world of [{ x: 1075, y: -800 }, { x: 1080, y: -795 }, { x: 1070.5, y: -803.25 }]) {
    const back = interiorWorldAt(framing, interiorPx(framing, world));
    assert.ok(Math.hypot(back.x - world.x, back.y - world.y) < 1e-9,
      `${JSON.stringify(world)} -> panel -> ${JSON.stringify(back)}`);
  }
});

test("the room's centre is the panel's centre, both ways", () => {
  const mid = { x: framing.W / 2, y: framing.H / 2 };
  const world = interiorWorldAt(framing, mid);
  assert.ok(Math.hypot(world.x - ROOM.at.x, world.y - ROOM.at.y) < 1e-9);
});

test("THE WALK IS NOT CLAMPED to the room — walls would be law, and none is ruled", () => {
  // a point far outside the room still yields honest coordinates; the interior
  // view stays keyed to insideOf (the ledger), never to where the walk landed.
  // Flagged in the handback rather than invented here.
  const outside = interiorWorldAt(framing, { x: framing.W * 8, y: -framing.H * 4 });
  assert.ok(Number.isFinite(outside.x) && Number.isFinite(outside.y));
  assert.ok(Math.abs(outside.x - ROOM.at.x) > ROOM.extent.w, "no clamping happened");
});

// ── bodies stand where the record puts them ─────────────────────────────────
test("FALSIFIER: a body the walk ledger places stands THERE, not on the room's centre", () => {
  const at = { x: ROOM.at.x + 4, y: ROOM.at.y - 3 };
  const placed = interiorBodySVG("rei", framing, { at, you: true });
  const expected = interiorPx(framing, at);
  assert.match(placed, new RegExp(`cx="${expected.x.toFixed(1)}"`),
    "the dot follows the walk — this is what 'you can't move around' meant");
  assert.doesNotMatch(placed, new RegExp(`cx="${(framing.W / 2).toFixed(1)}"`));
});

test("a body the ledger does NOT place still stands on the centre — the original reason holds", () => {
  const svg = interiorBodySVG("rei", framing, { at: null, you: true });
  assert.match(svg, new RegExp(`cx="${(framing.W / 2).toFixed(1)}"`),
    "the threshold ledger says who is inside, never where — inventing a spot would be a claim");
  assert.match(interiorBodySVG("rei", framing, { at: { x: NaN, y: 2 } }),
    new RegExp(`cx="${(framing.W / 2).toFixed(1)}"`), "and a nonsense position is no position");
});

test("standing positions reach the drawing", () => {
  const at = { x: ROOM.at.x - 5, y: ROOM.at.y + 2 };
  const svg = interiorSVG({
    room: ROOM, framing, things: [], bodies: ["rei"], you: "rei",
    standing: new Map([["rei", at]]),
  });
  const expected = interiorPx(framing, at);
  assert.match(svg, new RegExp(`cx="${expected.x.toFixed(1)}"`), "interiorSVG threads `standing` through");
});

test("two placed bodies keep their own spots rather than fanning", () => {
  const a = { x: ROOM.at.x + 3, y: ROOM.at.y };
  const b = { x: ROOM.at.x - 3, y: ROOM.at.y };
  const svg = interiorSVG({
    room: ROOM, framing, bodies: ["rei", "wright"], you: "rei",
    standing: new Map([["rei", a], ["wright", b]]),
  });
  for (const at of [a, b])
    assert.match(svg, new RegExp(`cx="${interiorPx(framing, at).x.toFixed(1)}"`));
});
