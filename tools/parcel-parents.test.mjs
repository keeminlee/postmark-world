// parcel-parents.test.mjs — A PARCEL IS A CONTAINER, AND THE TWO READERS OF
// "what is this inside?" MUST NAME THE SAME MARK.
//
// The world has one primitive that decides a mark's container from geometry —
// `placementParent` (marks-fold.mjs), the one the write path calls to choose
// the directory a new mark lands in. It counts a mark as a possible parent when
// `kind` is "sited" OR "parcel".
//
// `ancestorsByGeometry` (world-verbs.mjs), which answers the reader's "what is
// this in?", filtered `kind !== "sited"` and so could never report a parcel.
// The cellar door sits squarely inside rei/the-lanternstep-house-parcel — a
// 25 x 25 m title — and the nearest parent the telling would name for it was
// rei/the-lanternseed-gardens, 1854 x 1637 m. A door standing in a field.
//
// Two readers of one relation, disagreeing about what counts as a container,
// is the defect; the door is only where it showed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleWorld } from "./world-build.mjs";
import { crossingPlan, investigate } from "./world-verbs.mjs";
import { placementParent } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const world = assembleWorld({
  worldState: JSON.parse(read("WORLD/world-state.json")),
  skeleton: JSON.parse(read("WORLD/skeleton.json")),
});
const byId = new Map(world.marks.map((m) => [m.id, m]));

const DOOR = "the-town/the-cellar-door";
const PARCEL = "rei/the-lanternstep-house-parcel";

test("THE FALSIFIER: the cellar door's parents include the parcel it sits in", () => {
  const door = byId.get(DOOR), parcel = byId.get(PARCEL);
  assert.ok(door && parcel, "both marks are in the committed world");
  assert.equal(parcel.kind, "parcel", "the container under test is a parcel — that is the whole point");

  const parents = investigate(DOOR, world, { budget: 40 }).parents ?? [];
  const ids = parents.map((p) => p.id);
  assert.ok(ids.includes(PARCEL),
    `the door's reported parents are ${ids.join(", ") || "(none)"} — the 25 m parcel it stands in is not among them`);
});

test("AND IT IS THE NEAREST ONE — a 25 m title beats a 1854 m garden", () => {
  // `parents` is nearest-container-first and the telling slices it to one, so
  // reporting the parcel at all is not enough: it has to be the one that gets
  // said. Before the fix the answer was rei/the-lanternseed-gardens.
  const parents = investigate(DOOR, world, { budget: 40 }).parents ?? [];
  assert.equal(parents[0]?.id, PARCEL,
    "the nearest container is the parcel, not the garden the parcel sits in");
});

test("THE CLASS GUARD: `investigate` and the fold's `placementParent` name the same container, for every mark in the world", () => {
  // The weak form, stated over the whole record. These are the world's two
  // answers to one question, and a mark whose telling names a different
  // container than its filing does is a mark two readers disagree about.
  const disagreements = [];
  for (const m of world.marks) {
    if (!m.at || !m.extent) continue;
    if (m.kind !== "sited" && m.kind !== "parcel") continue;
    const filed = placementParent(m, world.marks.filter((n) => n.id !== m.id));
    const told = investigate(m.id, world, { budget: 40 }).parents?.[0]?.id ?? null;
    if (filed !== told) disagreements.push(`${m.id}: filed under ${filed ?? "(root)"}, told as ${told ?? "(root)"}`);
  }
  assert.deepEqual(disagreements, [],
    "every mark's told container is its filed container — one geometry, one answer");
});

test("THE BOUND, PINNED: a parcel is a container but not a THRESHOLD — the crossing chain stays sited", () => {
  // Stated so the bound has a receipt and cannot drift back silently either way.
  // A crossing is an authored consent act that appends a row to
  // WORLD/threshold-ledger.md, and a parcel is a land title, not a room: a row
  // reading "enters rei/the-lanternstep-house-parcel" would put a claim in the
  // permanent record that nobody made. It would also part the derivation from
  // the record already written — occupancy derives from the ledger's own rows,
  // and every crossing in it was recorded under the sited-only chain.
  //
  // If the founder rules that a title IS a threshold, this test is the thing to
  // delete, and THRESHOLD_KINDS in world-verbs.mjs is the one line to change.
  const house = byId.get("rei/the-lanternstep-house");
  const plan = crossingPlan({ x: house.at.x, y: house.at.y }, "rei/the-lanternstep-house", world, {});
  assert.ok(!plan.error, String(plan.error ?? ""));
  assert.ok(!plan.chain.includes(PARCEL),
    `the crossing chain is ${plan.chain.join(" -> ")} — a parcel in it is a ledger row for a door nobody opened`);
  // and the same mark's READING does name it, which is the whole distinction
  assert.ok((investigate("rei/the-lanternstep-house", world, { budget: 40 }).parents ?? [])
    .some((p) => p.id === PARCEL), "while 'what is this inside?' answers the parcel");
});
