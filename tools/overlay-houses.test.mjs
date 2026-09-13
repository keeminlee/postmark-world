// overlay-houses.test.mjs — the atlas's home cards come back on the parcels, drawn
// from the world's record, with the frame given a roof; the frame is the HOME
// light (Keemin, 2026-09-10). Same contract as the pips: written with the
// record, sized by the camera, no camera argument.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OVERLAY_PIP_R, HOME_CARD, homeCardPath, markerScale,
  overlayHomeCardSVG, homeMarkOfParcel, houseIsLit, enclosingParcels, homeFaceSVG, fillFromTown, TOWN_FILL_FIELDS,
  sceneArtSVG,
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
  // …and the default face sits in the frame. It was a door and two windows
  // (founder, 2026-09-11); since 2026-09-12 it is the town's own seal — the
  // favicon's envelope, on Postmark navy (Keemin: "dark blue default, with the
  // little envelope icon in the middle"). The counts move from 1+2 to 1+1
  // because the drawing is one mark now, not three.
  assert.equal((svg.match(/class="ov-home-envelope"/g) ?? []).length, 1, "an envelope");
  assert.equal((svg.match(/class="ov-home-flap"/g) ?? []).length, 1, "and its flap");
  assert.doesNotMatch(svg, /ov-home-door|ov-home-window/, "the door and windows are gone, not merely hidden");
  assert.doesNotMatch(overlayHomeCardSVG({ at: { x: 0, y: 0 }, id: "a/b", label: "a", image: "/shelf/a/x.jpg" }), /ov-home-envelope/, "a pictured house wears its picture, not the default face");
  const face = homeFaceSVG();
  // The door used to stand ON the ground line; a letter does not, so what is
  // pinned instead is that the envelope is centred on the BODY — the roof is
  // not somewhere a letter goes, and an envelope drifting into it is the way
  // this drawing would go wrong.
  const [, y0, envH] = face.match(/y="(-?[\d.]+)" width="\d+" height="(\d+)"/).map(Number);
  const eave = -(HOME_CARD.h + HOME_CARD.roof) / 2 + HOME_CARD.roof;
  assert.equal(y0 + envH / 2, eave + HOME_CARD.h / 2, "the envelope is centred on the body");
  assert.ok(y0 > eave, "and sits below the eaves, never in the roof");
  // ⚑ THE FLIP: drop homeFaceSVG() from the blank card → the envelope count reds.
});

test("the seal is the town's, in the town's two colours", () => {
  // NOT A RESTATEMENT OF THE CSS — the point is that these two values are the
  // site's own, so a later theme change moves them together. #0d1426 is the
  // navy behind seventy site surfaces and the ground of public/atelier/postmark/
  // favicon.svg; #e8c48b is the gold of that same favicon's envelope.
  assert.match(SOURCE, /\.ov-home-blank \{ fill:#0d1426; \}/, "the art-less card is Postmark navy");
  assert.match(SOURCE, /\.ov-glyph \{ fill:#0d1426;/, "and so is the far glyph");
  assert.doesNotMatch(SOURCE, /fill:#f4e6c8/, "no cream house is left anywhere");
  assert.match(SOURCE, /\.ov-home-envelope \{ fill:none; stroke:#e8c48b;/, "the envelope is the favicon's gold");
  // LIT MUST STILL READ AS LIT. The windows carried that and are gone, so the
  // envelope has to carry it — this is the assertion that the swap did not
  // quietly cost the map one of its two derived lights.
  assert.match(SOURCE, /\.ov-home\.lit \.ov-home-envelope \{ fill:#ffcf5c;/, "a lit house fills its envelope");
  assert.match(SOURCE, /\.ov-home\.lit \.ov-home-frame \{ stroke:#ffcf5c;/, "and still glows its frame");
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

test("THE RESIDENT'S OWN HOUSE WEARS ITS PICTURE TOO — a portfolio row that shadows the world's record is filled, never overwritten (Keemin's terrace screenshot, 2026-09-11)", () => {
  const own = { id: HOME.id, kind: "sited", at: { x: 100, y: 200 }, body: "mine, as I wrote it" };   // what my-marks hands the page: no tier, no placementParent, no image
  const byId = new Map([[own.id, own]]);
  const touched = fillFromTown(byId, [PARCEL, HOME]);
  assert.deepEqual(touched, [PARCEL.id, HOME.id], "the parcel was added, the house was filled");
  const filled = byId.get(HOME.id);
  assert.equal(filled.image, HOME.image, "the world's picture");
  assert.equal(filled.placementParent, PARCEL.id, "and its parcel, so homeMarkOfParcel finds it");
  assert.equal(filled.tier, "home");
  assert.equal(filled.body, "mine, as I wrote it", "the row's own words are untouched");
  assert.equal(homeMarkOfParcel(PARCEL.id, [...byId.values()]), filled, "the card finds the dwelling now");
  // never overwrite: a row that HAS a picture keeps it
  const mine2 = new Map([[HOME.id, { ...own, image: "https://media.postmark.town/media/keeminlee/mine.jpg" }]]);
  fillFromTown(mine2, [HOME]);
  assert.equal(mine2.get(HOME.id).image, "https://media.postmark.town/media/keeminlee/mine.jpg");
  assert.deepEqual(fillFromTown(new Map([[HOME.id, HOME]]), [HOME]), [], "nothing to fill, nothing touched");
  assert.ok(TOWN_FILL_FIELDS.includes("image") && TOWN_FILL_FIELDS.includes("placementParent"), "the two fields the card lives on");
  // ⚑ THE FLIP: return to `if (!byId.has(m.id)) byId.set(m.id, m)` → the picture line reds.
});

test("A PARCEL IS NOT FURNITURE — its card is its whole drawing", () => {
  // Keemin's dev screenshot, 2026-09-12: his own house drawn twice from outside
  // the parcel — the card, and an unframed square photograph sitting on top of
  // it. Both carried the PARCEL's id, measured on dev at 152 px:
  //   g.wv-scene-mark-art 152x152 WITH IMAGE   <- the furnishing pass
  //   g.ov-home lit        139x89 WITH IMAGE   <- the card
  //
  // Only a signed-in reader could see it: sceneArtSVG needs markImagePath() on
  // the parcel, the fold gives a parcel none, and a resident's own row does.
  assert.match(SOURCE, /\.filter\(\(m\) => m\.kind !== "parcel"\)/,
    "the furnishing pass excludes parcels");
  // …and it is excluded in the FURNISHING pass, not somewhere that would also
  // stop the card being drawn. The card's own call site must be untouched.
  assert.match(SOURCE, /s \+= homeCard\(full, p, fanned\.has\(m\.id\) \? fanOffsetPx\(m\.id\) : null, nameOf\(m\), tier\)/,
    "the card is still drawn from the drawn set");
  // ⚑ THE FLIP: drop the filter and a parcel carrying a picture is furnished
  //   again — which on dev is the square over the card, and on the spectator
  //   path is invisible, which is how it lived.
});

test("sceneArtSVG is what drew the square, and it still draws for real furniture", () => {
  // The pass is not disabled, only kept off parcels: a pictured non-parcel mark
  // inside a room still hangs its art, which is the whole point of the pass.
  const chair = { id: "rei/the-mending-basket", kind: "sited", tier: "market",
    at: { x: 0, y: 0 }, extent: { w: 2, h: 2 }, image: "https://media.postmark.town/media/rei/x.jpg" };
  const px = (p) => ({ x: p.x, y: p.y });
  const art = sceneArtSVG(chair, px);
  assert.match(art, /class="wv-scene-mark-art"/, "furniture with a picture still hangs it");
  assert.match(art, /<image /, "…and it is an image, not a tint");
  // a parcel handed to the same function would still draw — the rule is the
  // pass's, not the function's, and that is deliberate: sceneArtSVG stays pure
  // and reusable, the caller decides what is furniture.
  assert.ok(sceneArtSVG({ ...chair, id: "a/b-parcel", kind: "parcel" }, px).length > 0,
    "the function itself is unchanged and still answers for any embodied mark");
});
