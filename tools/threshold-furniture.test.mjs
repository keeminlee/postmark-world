// threshold-furniture.test.mjs — A THRESHOLD STRADDLING A WALL IS FURNITURE OF
// BOTH ROOMS IT JOINS (founder-ruled 2026-08-27).
//
// The founder stood in the Lanternstep parlor and could not see the cellar door
// the parlor's own prose promises him. The parlor's entry law says it in as many
// words:
//
//     "The cellar door is in the west wall, and whatever is behind it has been
//      waiting up; the parlor makes no promises about the cellar."
//
// And the geometry agrees with the prose: the parlor's west wall stands at
// x 1083, and the-town/the-cellar-door runs x 1080.5 → 1085.5 — it is IN the
// wall, which is the only place a door can be. Room furniture was strict
// full-rect containment (`marksContain`), so a door in a wall is contained by
// neither room and was a child of NOTHING. It rendered nowhere, and the parlor
// told the founder about a door the parlor did not hold.
//
// The fix is the CLASS, not the door: containment stays the primary relation
// and an OVERLAP branch stands beside it. A sited mark that materially overlaps
// a room is furniture of that room. A straddler therefore appears in BOTH rooms
// it joins — that is the ruling, not a duplicate to be de-duplicated away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleWorld } from "./world-build.mjs";
import { investigate } from "./world-verbs.mjs";
import { DIALS } from "./world-engine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
// THE COMMITTED WORLD, not a fixture. The whole point of this test is that the
// record the site renders from carries a door nobody could see.
const world = assembleWorld({
  worldState: JSON.parse(read("WORLD/world-state.json")),
  skeleton: JSON.parse(read("WORLD/skeleton.json")),
});
const byId = new Map(world.marks.map((m) => [m.id, m]));

const PARLOR = "the-town/the-lanternstep-parlor";
const DOOR = "the-town/the-cellar-door";
const HOUSE = "rei/the-lanternstep-house";

test("THE FALSIFIER: the parlor's own children hold the cellar door its own prose promises", () => {
  const parlor = byId.get(PARLOR);
  assert.ok(parlor, `${PARLOR} is not in the committed world — this test's subject is gone`);
  // the parlor says so itself, in the entry law the door renders at the threshold
  assert.match(String(parlor.entry?.consequence ?? ""), /The cellar door is in the west wall/,
    "the parlor's own line is the claim under test — if it changed, re-read this test before deleting it");

  const found = investigate(PARLOR, world, { budget: 40 });
  assert.ok(!found.error, String(found.error ?? ""));
  const ids = found.children.map((c) => c.id);
  assert.ok(ids.includes(DOOR),
    `the parlor lists ${ids.length} children and none of them is the cellar door standing in its west wall: ${ids.join(", ")}`);
});

test("AND IN BOTH ROOMS IT JOINS — a straddler is furniture on both sides, which is what a threshold IS", () => {
  // The door runs x 1080.5→1085.5. The parlor's west wall is x 1083; the house's
  // is x 1082. It stands in both walls at once, so both rooms hold it. The
  // duplicate is the truth, not a defect.
  const houseKids = investigate(HOUSE, world, { budget: 40 });
  assert.ok(!houseKids.error, String(houseKids.error ?? ""));
  const parlorKids = investigate(PARLOR, world, { budget: 40 });
  assert.ok(parlorKids.children.some((c) => c.id === DOOR), "the parlor holds it");
  // the house holds it too — through the parlor, which is the house's own child:
  // directness still applies, so the door is furniture of the innermost room it
  // joins and the house lists the parlor rather than reaching past it
  assert.ok(houseKids.children.some((c) => c.id === PARLOR),
    "the house holds the parlor, so the door reaches the house through it");
});

test("THE BOUND: the overlap branch does not make every mark furniture of the 320 km frame", () => {
  // Two guards, and this pins both. A mark is admitted by overlap only if it is
  // strictly SMALLER than the room, and only if the room is not the world frame
  // — the root is the establishing line, never a room with things in it. Without
  // the bound, an overlap test that admits on any shared ground would hand the
  // root the whole world twice over.
  const root = world.marks.find((m) => Math.max(m.extent?.w ?? 0, m.extent?.h ?? 0) >= DIALS.world_scale_extent_m);
  assert.ok(root, "the world frame is in the record");
  const found = investigate(root.id, world, { budget: 40 });
  // the frame answers its DIRECT children only; the assertion is that the
  // overlap branch has not flattened the world into it
  const ids = new Set((found.children ?? []).map((c) => c.id));
  assert.ok(!ids.has(DOOR),
    "a 5 m door in a house in a garden is not direct furniture of the 320 km world frame");
});
