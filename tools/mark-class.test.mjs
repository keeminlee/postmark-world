import test from "node:test";
import assert from "node:assert/strict";
import { markClass } from "./mark-class.mjs";

// build a byId map from plain mark objects (the folded shape: by, kind, parent, sovereign, tier)
const world = (...marks) => new Map(marks.map((m) => [m.id, m]));

const PARCEL = { id: "wright/the-trueing-house-parcel", kind: "parcel", by: "wright" };
const HOUSE = { id: "wright/the-trueing-house", kind: "sited", by: "wright", sovereign: true, parent: PARCEL.id };

test("holder's own mark inside their parcel is home", () => {
  const mine = { id: "wright/the-bench", kind: "sited", by: "wright", parent: PARCEL.id };
  assert.equal(markClass(mine, world(PARCEL, HOUSE, mine)), "home");
});

test("holder's predicated mark on their own sovereign structure is home", () => {
  const timber = { id: "wright/exposed-timber", kind: "predicated", by: "wright", parent: HOUSE.id, slot: "material" };
  assert.equal(markClass(timber, world(PARCEL, HOUSE, timber)), "home");
});

test("a guest's mark inside another household's parcel is market, not home", () => {
  const flower = { id: "rei/a-flower", kind: "sited", by: "rei", parent: PARCEL.id };
  assert.equal(markClass(flower, world(PARCEL, HOUSE, flower)), "market");
});

test("a guest's predicated mark on another's sovereign structure is market", () => {
  const ribbon = { id: "rei/a-ribbon", kind: "predicated", by: "rei", parent: HOUSE.id, slot: "door-color" };
  assert.equal(markClass(ribbon, world(PARCEL, HOUSE, ribbon)), "market");
});

test("the parcel itself is its holder's home", () => {
  assert.equal(markClass(PARCEL, world(PARCEL)), "home");
});

test("a mark with no parcel or sovereign ancestor stays market", () => {
  const region = { id: "limen/the-threshold-district", kind: "sited", by: "limen" };
  const room = { id: "limen/hearth-room", kind: "sited", by: "limen", parent: region.id };
  assert.equal(markClass(room, world(region, room)), "market");
});

test("constitution tier holds when no ground governs", () => {
  const root = { id: "the-town/let-there-be-light", kind: "sited", by: "the-town", tier: "constitution" };
  assert.equal(markClass(root, world(root)), "constitution");
});
