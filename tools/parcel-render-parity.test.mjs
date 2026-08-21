// parcel-render-parity.test.mjs — law 1's falsifier.
//
// The law, quoted verbatim from the gold plan (Starstory
// PULSE/gold-plans/postmark-home-images/postmark-home-images.md, "The law"):
//
//   "A parcel renders in the World like any other mark. No kind-gated
//    exclusion in the viewer's default mark rendering; a parcel with an
//    `image:` shows that image exactly where any sited mark would."
//
// The exclusion this replaces lived at tools/world-engine.mjs, in fieldOfView:
// `if (mk.kind === "parcel") continue;` — one line, born with the engine
// (26368c28), and the reason a household's ground could carry art that nobody's
// telling ever mentioned. It was upstream of every viewer surface, so the
// viewer's own cell code never needed a parcel branch and still does not: the
// cell asks `markImageURL(full)` and nothing about kind. That is why the tests
// below are shaped the way they are — the gate that was closed is proven at the
// engine, and the kind-blindness of everything downstream is proven separately,
// so restoring the one line makes THIS file fail rather than a screenshot.
//
// THE CAN-FAIL FLIP WAS RUN. Re-introducing `if (mk.kind === "parcel")
// continue;` at world-engine.mjs:260 fails the first two tests here
// ("the telling has no parcel in it" / "expected the parcel to be told"), and
// leaves the rest green — which is the point: the rest cannot see the gate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeightfield, fieldOfView } from "./world-engine.mjs";
import { isEmbodiedMark, isWalkableTarget, markImageURL, hydrateMarkImages } from "../spectator/viewer.mjs";

const SHELF = "https://media.postmark.town/media/keeminlee/70c2f03d0bcdd54ca117e8fa3c9d9dcf7ee7bc176f58cec0116b281b4f188de6.jpg";

const flatHF = buildHeightfield({ controlPoints: [
  { x: 0, y: 0, h: 5 }, { x: 4000, y: 0, h: 5 }, { x: 0, y: 4000, h: 5 }, { x: -4000, y: 0, h: 5 }, { x: 0, y: -4000, h: 5 },
] });
const light = { dawn_pole_m: { x: 5000, y: -5000 }, dark_pole_m: { x: -5000, y: 5000 } };
const worldOf = (marks) => ({ marks, terrain: { far_features: [], features: [], elevation: {} }, heightfield: flatHF, light, fogCeilingM: 22 });

// TWIN MARKS: identical in every field the telling reads, differing ONLY in
// `kind` and in the sign of x — which mirrors them to the same distance and
// leaves the light and the sightline symmetric. Anything the telling says about
// one it must say about the other, or `kind` is doing work it should not.
const twins = () => [
  { id: "a/house", kind: "sited", by: "a", household: "a", at: { x: 200, y: 0 }, extent: { w: 10, h: 10 }, body: "a house", weight: 3, image: SHELF },
  { id: "b/ground", kind: "parcel", by: "b", household: "b", at: { x: -200, y: 0 }, extent: { w: 10, h: 10 }, body: "b's ground", weight: 3, image: SHELF },
];

const told = (radial) => radial.carried ?? [];

test('A PARCEL RENDERS IN THE WORLD LIKE ANY OTHER MARK: "No kind-gated exclusion in the viewer\'s default mark rendering"', () => {
  const radial = fieldOfView({ x: 0, y: 0 }, worldOf(twins()), { crossing: 20 });
  const ids = told(radial).map((m) => m.id).sort();
  assert.ok(ids.length, "the telling has no parcel in it");
  assert.deepEqual(ids, ["a/house", "b/ground"], "expected the parcel to be told beside the house, not skipped");
});

test("the parcel is told with the SAME shape as the sited mark — same fields, same values, kind apart", () => {
  const entries = told(fieldOfView({ x: 0, y: 0 }, worldOf(twins()), { crossing: 20 }));
  const house = entries.find((m) => m.id === "a/house");
  const ground = entries.find((m) => m.id === "b/ground");
  assert.ok(house && ground, "expected the parcel to be told");
  assert.deepEqual(Object.keys(house).sort(), Object.keys(ground).sort(),
    "a parcel entry carries the same fields — the viewer's one cell path reads them all");
  // everything the cell renders from, at mirrored positions: identical
  for (const field of ["distM", "extentM", "weight", "band", "visible", "occluded", "signal"])
    assert.deepEqual(ground[field], house[field], `${field} differs, so the two do not render alike`);
  assert.equal(ground.kind, "parcel");
  assert.equal(house.kind, "sited");
});

test("THE SECOND GATE: a parcel is not occluded by the ground it sits on — vertical prominence is not kind-gated either", () => {
  // Retiring fieldOfView's `continue` was necessary and not sufficient. markTop
  // gave a parcel zero prominence, so lineOfSight aimed at its own dirt and the
  // last sample always grazed: on flat ground, `clear` = eyeH / n, which SHRINKS
  // as distance grows. Every parcel came back occluded by nothing, and worse the
  // further off it was. This test is the flat-ground case that proves it — a
  // parcel and a house at mirrored distances over a level heightfield, where
  // there is nothing to occlude either of them.
  const entries = told(fieldOfView({ x: 0, y: 0 }, worldOf(twins()), { crossing: 20 }));
  const ground = entries.find((m) => m.id === "b/ground");
  assert.ok(ground, "the parcel was dropped before it could be judged");
  assert.equal(ground.occluded, false, "nothing stands between the observer and this parcel — flat ground, 200 m");
  assert.equal(ground.occludeAt, null);
  assert.equal(ground.visible, true);
  // and the far case, where the artifact bit hardest: further away, still clear
  const far = told(fieldOfView({ x: 0, y: 0 }, worldOf([
    { id: "b/ground", kind: "parcel", by: "b", at: { x: -3000, y: 0 }, extent: { w: 25, h: 25 }, body: "far ground", weight: 3 },
  ]), { crossing: 20 })).find((m) => m.id === "b/ground");
  assert.ok(far, "a parcel 3 km off over level ground is still a thing you can see");
  assert.equal(far.occluded, false);
});

test("terrain still occludes a parcel exactly as it occludes a house — the prominence is modest, not a lie", () => {
  // a ridge rising to 80 m between the observer and both marks
  const hf = buildHeightfield({ controlPoints: [
    { x: 0, y: 0, h: 5 }, { x: 500, y: 0, h: 80 }, { x: 1000, y: 0, h: 5 }, { x: -500, y: 0, h: 80 }, { x: -1000, y: 0, h: 5 },
  ] });
  const behindTheRidge = [
    { id: "a/house", kind: "sited", by: "a", at: { x: 1000, y: 0 }, extent: { w: 10, h: 10 }, body: "house", weight: 3 },
    { id: "b/ground", kind: "parcel", by: "b", at: { x: -1000, y: 0 }, extent: { w: 10, h: 10 }, body: "ground", weight: 3 },
  ];
  const r = fieldOfView({ x: 0, y: 0 }, { marks: behindTheRidge, terrain: { far_features: [], features: [], elevation: {} }, heightfield: hf, light, fogCeilingM: 22 }, { crossing: 20 });
  assert.deepEqual(r.carried, [], "a ridge hides the parcel and the house alike");
  assert.equal(r.counts.occluded, 2);
});

test("the affordances a cell hangs on a mark are kind-blind for parcels: embodied, walkable, picture-bearing", () => {
  const [house, ground] = twins();
  assert.equal(isEmbodiedMark(ground), isEmbodiedMark(house));
  assert.equal(isEmbodiedMark(ground), true);
  assert.equal(isWalkableTarget(ground), isWalkableTarget(house));
  assert.equal(isWalkableTarget(ground), true);
  // the cell's own gate is `!far && markImageURL(full)` — it asks the URL, not
  // the kind, and this is that claim made directly
  assert.equal(markImageURL(ground), markImageURL(house));
  assert.equal(markImageURL(ground), SHELF);
});

test('"a parcel with an `image:` shows that image exactly where any sited mark would" — the same figure, mounted the same way', () => {
  // A minimal stand-in for the two DOM calls hydrateMarkImages makes. The world
  // repo carries no DOM library on purpose, and the surface under test is two
  // methods wide, so the fake is exact rather than approximate.
  const figures = ["a/house", "b/ground"].map((id) => ({
    dataset: { imageFor: id }, child: null, gone: false,
    removeAttribute() { delete this.dataset.imageFor; },
    appendChild(node) { this.child = node; },
    remove() { this.gone = true; },
  }));
  const box = { querySelectorAll: () => figures };
  const doc = { createElement: () => ({ addEventListener() {}, setAttribute() {} }) };
  const byId = new Map(twins().map((m) => [m.id, m]));

  const mounted = hydrateMarkImages(box, (id) => byId.get(id), doc);
  assert.equal(mounted, 2, "both marks mounted a picture");
  const [house, ground] = figures;
  assert.equal(ground.gone, false, "the parcel's figure was not thrown away");
  assert.equal(ground.child.src, SHELF);
  assert.equal(ground.child.src, house.child.src, "the same URL reaches the same <img src> either way");
  assert.equal(ground.child.loading, house.child.loading);
  assert.equal(ground.child.decoding, house.child.decoding);
  assert.equal(ground.child.alt, "b's ground", "and the body is the alt text, as it is for any mark");
});

test("a parcel with no image draws no empty frame — the picture is the only thing that changed", () => {
  const bare = { id: "c/ground", kind: "parcel", by: "c", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 }, body: "bare ground" };
  assert.equal(markImageURL(bare), null, "no image: means no figure is emitted at all");
  // and an off-shelf URL is refused at the viewer the same way for a parcel as
  // for anything else — the shelf is the only mint, at the render layer too
  assert.equal(markImageURL({ ...bare, image: "https://example.com/nice.jpg" }), null);
  assert.equal(markImageURL({ ...bare, image: "https://media.postmark.town/not-the-shelf/x.jpg" }), null);
});
