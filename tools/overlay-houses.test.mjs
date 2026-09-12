// overlay-houses.test.mjs — the atlas's home cards come back on the parcels, drawn
// from the world's record, with the frame given a roof; the frame is the HOME
// light (Keemin, 2026-09-10). Same contract as the pips: written with the
// record, sized by the camera, no camera argument.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OVERLAY_PIP_R, HOME_CARD, homeCardPath, markerScale,
  overlayHomeCardSVG, homeMarkOfParcel, houseIsLit, enclosingParcels, homeFaceSVG,
} from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

const PARCEL = { id: "jack/the-lantern-parcel", kind: "parcel", household: "jack", at: { x: 100, y: 200 }, extent: { w: 25, h: 25 } };
const HOME = { id: "jack/the-lantern", kind: "sited", tier: "home", placementParent: PARCEL.id, at: { x: 100, y: 200 }, extent: { w: 12, h: 12 }, image: "https://media.postmark.town/media/jack/abc.jpg" };

test("a card is the picture in a house-shaped frame with the name under it, anchored by the transparent pip", () => {
  const svg = overlayHomeCardSVG({ at: { x: 10, y: -20 }, id: PARCEL.id, label: "jack", image: "/shelf/jack/abc.jpg", classes: "t-home" });
  assert.match(svg, /<clipPath id="wv-home-jack-the-lantern-parcel"><path d="M /, "the picture is clipped to the house silhouette");
  assert.match(svg, /<image href="\/shelf\/jack\/abc.jpg"/, "the picture is the one handed in, through the shelf route");
  assert.match(svg, /class="ov-home-frame"/, "the frame is drawn over the picture");
  assert.match(svg, /class="ov-home-label" [^>]*>jack<\/text>/, "the household's name sits under the card");
  assert.match(svg, new RegExp(`r="${OVERLAY_PIP_R}" class="ov-pip ov-pip-home t-home" data-id="jack/the-lantern-parcel"`), "the pip stays as anchor + hit target");
  assert.match(svg, /class="ov-home" data-id=/, "unlit by default");
  assert.doesNotMatch(svg, /r="[\d.]*\.\d+"/, "a fractional radius means the camera got into the markup");
});

test("the silhouette has a roof: its peak is above its eaves", () => {
  const d = homeCardPath();
  const nums = d.match(/-?[\d.]+/g).map(Number);
  const top = -(HOME_CARD.h + HOME_CARD.roof) / 2, eave = top + HOME_CARD.roof;
  assert.equal(nums[3], top, "the peak is the second point");
  assert.ok(eave > top, "the eaves are below the peak");
  assert.match(d, /Z$/, "closed");
});

test("no picture: the empty frame, as the atlas gave it", () => {
  const svg = overlayHomeCardSVG({ at: { x: 0, y: 0 }, id: "a/b", label: "a" });
  assert.match(svg, /class="ov-home no-art"/);
  assert.match(svg, /class="ov-home-blank"/);
  assert.doesNotMatch(svg, /<image/);
  // …and the default face sits in the frame (founder, 2026-09-11): the same three rects the far glyph wears
  assert.equal((svg.match(/class="ov-home-door"/g) ?? []).length, 1, "a door");
  assert.equal((svg.match(/class="ov-home-window"/g) ?? []).length, 2, "two windows");
  assert.doesNotMatch(overlayHomeCardSVG({ at: { x: 0, y: 0 }, id: "a/b", label: "a", image: "/shelf/a/x.jpg" }), /ov-home-door/, "a pictured house wears its picture, not the default face");
  const face = homeFaceSVG();
  const bottoms = [...face.matchAll(/y="(-?[\d.]+)" width="\d+" height="(\d+)"/g)].map((m) => Number(m[1]) + Number(m[2]));
  assert.equal(bottoms[0], (HOME_CARD.h + HOME_CARD.roof) / 2, "the door stands on the ground line");
  // ⚑ THE FLIP: drop homeFaceSVG() from the blank card → the door count reds.
});

test("identical inputs give identical markup at any camera", () => {
  const args = { at: { x: 7, y: 9 }, id: "a/b", label: "a", image: "/shelf/a/x.jpg", lit: true };
  const a = overlayHomeCardSVG(args);
  for (const zoom of [0.5, 1, 4, 40, 400]) {
    markerScale(zoom);
    assert.equal(overlayHomeCardSVG(args), a, `markup moved with the camera at zoom ${zoom}`);
  }
  assert.match(a, /class="ov-home lit"/);
});

test("the card's picture is the HOME sited on the parcel, preferring one with a picture", () => {
  const bare = { ...HOME, id: "jack/the-shed", image: undefined };
  assert.equal(homeMarkOfParcel(PARCEL.id, [bare, HOME]), HOME);
  assert.equal(homeMarkOfParcel(PARCEL.id, [bare]), bare, "a home with no picture still names the card");
  assert.equal(homeMarkOfParcel(PARCEL.id, [{ ...HOME, tier: "market" }]), null, "a market mark on the parcel is not the dwelling");
  assert.equal(homeMarkOfParcel("nobody/nowhere", [HOME]), null);
});

test("HOME: the household's walker at rest inside the parcel lights the frame", () => {
  const home = { handle: "jack", x: 105, y: 195, standing: true };
  assert.equal(houseIsLit(PARCEL, [home]), true);
  assert.equal(houseIsLit(PARCEL, [{ ...home, moving: true }]), false, "walking past your own door is not being home");
  assert.equal(houseIsLit(PARCEL, [{ ...home, x: 140 }]), false, "outside the fence is not home");
  assert.equal(houseIsLit(PARCEL, [{ ...home, handle: "rei" }]), false, "a visitor at rest is not the household");
  assert.equal(houseIsLit(PARCEL, []), false);
  const shared = { ...PARCEL, household: "keeminlee" };
  assert.equal(houseIsLit(shared, [{ handle: "wright", x: 100, y: 200, arrived: true }], (h) => (h === "wright" ? "keeminlee" : null)), true, "a multi-resident household lights through the resolver");
  assert.equal(houseIsLit(shared, [{ handle: "wright", x: 100, y: 200, arrived: true }]), false, "…and not without it");
  assert.equal(houseIsLit({ ...PARCEL, at: null }, [home]), false);
});

test("THE PARCEL UNDERFOOT — entered directly, through the dwelling on it, or a room in that dwelling — is the one parcel whose card is not drawn", () => {
  const ROOM = { id: "jack/the-lantern/kitchen", kind: "sited", parent: HOME.id, at: { x: 102, y: 201 }, extent: { w: 3, h: 3 } };
  const OTHER = { id: "rei/the-attic-parcel", kind: "parcel", household: "rei", at: { x: 300, y: 300 }, extent: { w: 25, h: 25 } };
  const marks = [PARCEL, HOME, ROOM, OTHER];
  assert.deepEqual([...enclosingParcels(PARCEL.id, marks)], [PARCEL.id], "the parcel itself");
  assert.deepEqual([...enclosingParcels(HOME.id, marks)], [PARCEL.id], "the dwelling sited on it (placementParent)");
  assert.deepEqual([...enclosingParcels(ROOM.id, marks)], [PARCEL.id], "a room in the dwelling (parent, then placementParent)");
  assert.deepEqual([...enclosingParcels(OTHER.id, marks)], [OTHER.id], "somebody else's parcel hides only itself");
  assert.equal(enclosingParcels(null, marks).size, 0, "outside — nothing mounted — nothing hidden");
  assert.equal(enclosingParcels("the-town/let-there-be-light", marks).size, 0, "the town is not a parcel");
  assert.equal(enclosingParcels("a", [{ id: "a", parent: "b" }, { id: "b", parent: "a" }]).size, 0, "a cycle in the record ends");
  assert.equal(enclosingParcels(HOME.id, new Map(marks.map((m) => [m.id, m]))).size, 1, "handed the viewer's own index, the same answer");
  // the viewer asks it of the MOUNTED room, once per draw, and both house passes honour it
  assert.match(SOURCE, /const underfoot = enclosingParcels\(sceneRoomId, byId\);/, "asked of the mounted room — the entered one, never geometry");
  assert.match(SOURCE, /if \(full\.kind === "parcel" && underfoot\.has\(m\.id\)\) continue;\n(?:.*\n){0,6}\s*glyphIds\.add\(m\.id\);/, "…before the card, the pip, or the glyph id");
  assert.match(SOURCE, /glyphIds\.has\(m\.id\) \|\| underfoot\.has\(m\.id\)\) continue;/, "and the landmark pass too");
  // ⚑ THE FLIP: drop `m.placementParent` from the queue push → the dwelling line reds.
});

test("THE CARD'S LABEL IS THE HOME'S NAME — the dwelling where one stands, the household only where none does (founder, 2026-09-11)", () => {
  assert.match(SOURCE, /label: home \? markName\(home\)\.name : String\(parcel\.household \?\? parcel\.by \?\? ""\),/, "the viewer's card asks the home first");
  // ⚑ THE FLIP: put the household back first → reds.
});
