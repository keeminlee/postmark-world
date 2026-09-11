// overlay-houses.test.mjs — the atlas's home cards come back on the parcels, drawn
// from the world's record, with the frame given a roof; the frame is the HOME
// light (Keemin, 2026-09-10). Same contract as the pips: written with the
// record, sized by the camera, no camera argument.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OVERLAY_PIP_R, HOME_CARD, homeCardPath, markerScale,
  overlayHomeCardSVG, homeMarkOfParcel, houseIsLit,
} from "../spectator/viewer.mjs";

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
