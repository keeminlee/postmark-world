// viewer-draft-overlay.test.mjs — the draft overlay: declarations into the lens.
//
// The law (founder, 2026-08-22): "interiors showing draft marks is a crucial
// feature." The tourniquet took the fold off the signed-in read, so the
// composed state stopped carrying a household's unpublished marks; the office's
// delta now ships each draft's DECLARATION in world frame, and the viewer lays
// those records into the mark list. What makes the interior work for free is
// the engine's own reading: containment is computed at the read
// (childrenByGeometry inside investigate), so a draft whose declared point
// lands on a room's floor is IN that room's answer — no fold, no parent edge,
// no stored judgment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeDraftOverlay, draftMarkIds } from "../spectator/viewer.mjs";
import { investigate } from "./world-verbs.mjs";

const ROOM = {
  id: "rei/the-lanternstep-house", by: "rei", household: "rei", kind: "sited",
  tier: "home", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 }, body: "the lanternstep house",
};
const ELSEWHERE = {
  id: "the-town/the-quay", by: "the-town", household: "the-town", kind: "sited",
  tier: "constitution", at: { x: 500, y: 500 }, extent: { w: 40, h: 40 }, body: "the quay",
};
const STATE = { marks: [ROOM, ELSEWHERE], parcels: [], determined: {}, errors: [] };

const CUP = {
  id: "rei/a-small-cup", status: "added", by: "rei", kind: "sited",
  at: { x: 102, y: 98 }, extent: { w: 1, h: 1 }, body: "a small cup, unstaked",
};

test("an added draft with world geometry joins the mark list, flagged draft", () => {
  const out = composeDraftOverlay(STATE, [CUP]);
  const cup = out.marks.find((m) => m.id === "rei/a-small-cup");
  assert.ok(cup, "the draft is in the composed lens");
  assert.equal(cup.draft, true);
  assert.equal(STATE.marks.length, 2, "the input state is not mutated");
  assert.ok(draftMarkIds([CUP]).has("rei/a-small-cup"), "and the grey set knows it");
});

test("THE CRUCIAL FEATURE: the room's own answer holds the unstaked draft on its floor", () => {
  const world = composeDraftOverlay(STATE, [CUP]);
  const found = investigate(ROOM.id, world, { budget: 50 });
  const childIds = (found?.children ?? []).map((c) => c.id);
  assert.ok(childIds.includes("rei/a-small-cup"),
    "Rei, entered in the Lanternstep House, sees her unstaked draft cup — geometry at the read, no fold");
  const elsewhere = investigate(ELSEWHERE.id, world, { budget: 50 });
  assert.ok(!(elsewhere?.children ?? []).some((c) => c.id === "rei/a-small-cup"),
    "and the quay across town does not");
});

test("deleted and geometry-less drafts stay out; a modified one replaces its published record", () => {
  const gone = { ...CUP, id: "rei/gone", status: "deleted" };
  const unframed = { id: "rei/unframed", status: "added", kind: "sited", body: "no at" };
  const edit = { id: "rei/the-lanternstep-house", status: "modified", body: "repainted, unpublished", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 } };
  const out = composeDraftOverlay(STATE, [gone, unframed, edit]);
  assert.ok(!out.marks.some((m) => m.id === "rei/gone"), "a deletion is the absence it declares");
  assert.ok(!out.marks.some((m) => m.id === "rei/unframed"), "no world frame, no badge — never a guessed position");
  const house = out.marks.filter((m) => m.id === "rei/the-lanternstep-house");
  assert.equal(house.length, 1, "one copy, ever — the edit replaces, never doubles");
  assert.equal(house[0].body, "repainted, unpublished", "the household lens reads its own unpublished edit");
  assert.equal(house[0].draft, true);
});

test("a modified draft replaces CONTENT, never authority — the house keeps its door (2026-08-22 live find)", () => {
  const edit = { id: "rei/the-lanternstep-house", status: "modified", tier: "market", path: "x",
    body: "repainted", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 } };
  const out = composeDraftOverlay(STATE, [edit]);
  const house = out.marks.find((m) => m.id === "rei/the-lanternstep-house");
  assert.equal(house.tier, "home", "the delta's legacy tier line never overwrites canon standing");
  assert.equal(house.body, "repainted", "the pending edit's content shows");
  assert.equal(house.draft, true);
  assert.equal(house.status, undefined, "no transport fields leak into the lens");
  assert.equal(house.path, undefined);
  const cup = composeDraftOverlay(STATE, [{ ...CUP, tier: "market", path: "y" }])
    .marks.find((m) => m.id === "rei/a-small-cup");
  assert.equal(cup.tier, undefined, "an added draft carries no asserted tier — the walk derives standing");
  assert.equal(cup.status, undefined);
  assert.equal(cup.path, undefined);
});
