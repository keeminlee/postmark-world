// act-as-scene.test.mjs — THE SCENE FOLLOWS THE ACTOR, ON EVERY ARM OF THE SWITCH.
//
// ── WHY THIS FILE CHANGES NO BEHAVIOUR (POS-94 / postmark#2848) ─────────────
//
// The issue reports that switching act-as leaves the previous resident's
// interior mounted, and that a Spectator inherits a room it can never leave. It
// proposes three fixes, the first being "every act-as switch, warm or cold, ends
// in syncScene for the new key".
//
// That fix is already here, and was here before the report. It landed 2026-08-19
// (2505170a, "a warm switch cannot leave you in somebody else's room") after the
// same symptom was met with kilean, and `activateTellingPane` carries both the
// call and the note. It is on the build the founder was reading: the viewer
// served at postmark.town/world-engine/spectator/viewer.mjs on 2026-09-16 is
// world fc5a2c4d byte-for-byte (md5 f75b6d112c349ec55175f1a055c40d57), and it
// contains `syncScene(key)` ahead of the early return.
//
// Driven on the real page against this clone's own record — keith is inside
// keith/the-garage at the ledger's end, jetto-of-starforge's passage stack is
// empty — the switch behaves correctly in four conditions: the fold arm, the
// resident path, a boot straight into a room with no town ever mounted, and
// straight from inside to Spectator. In every one the room comes down, the town
// mounts, and the exit pill goes.
//
// So the diagnosis is returned rather than implemented, and what is left behind
// is this: the behaviour the issue asks for, pinned, so it cannot be dropped
// again. Dropping `syncScene(key)` from `activateTellingPane` was measured to
// break the switch BACK into a room on the warm path — the call is load-bearing
// today, not vestigial.
//
// Proposal 3 in the issue ("the way-out pill is never shown to a spectator on a
// room it cannot leave") guards a state this code cannot reach, and the last
// test says why in the one place it is checkable: a spectator is handed an empty
// passage stack by construction, so no interior is ever filed under the
// spectator key, so `syncScene` can never mount a room for it. A guard against
// an impossible state teaches the next reader to fear the wrong thing; the
// falsifier is written instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SPECTATOR_ACTOR, standpointOccupancy } from "../spectator/viewer.mjs";
import { parseEnterExitLedger } from "./enter-exit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ── the one behavioural claim that is testable without a DOM ───────────────
//
// THE FIXTURE IS SYNTHESIZED, NOT READ OFF TODAY'S LEDGER (state-durable-facts):
// who is indoors moves with every crossing, so the acts are written here and
// the shape of the answer is what is pinned.
const ACTS = parseEnterExitLedger(
  "- 2026-09-16T01:00:00.000Z · keith · enters keith/the-garage · at 138.0000 · word neutral\n"
).acts;

test("FALSIFIER: a spectator can never be inside anything, so no room can be filed under its key", () => {
  const resident = standpointOccupancy({ acts: ACTS, at: 999, handle: "keith" });
  assert.equal(resident.insideOf, "keith/the-garage",
    "the fixture really does put somebody indoors, or this proves nothing");

  for (const handle of [SPECTATOR_ACTOR, null, ""]) {
    const seen = standpointOccupancy({ acts: ACTS, at: 999, handle });
    assert.equal(seen.insideOf, null, `a camera has crossed no threshold (handle ${JSON.stringify(handle)})`);
    assert.deepEqual(seen.entered, [], "…and holds an empty stack, not a stale one");
  }
});

test("FALSIFIER: the reader's own key decides the scene — one standpoint indoors does not put another on a floor", () => {
  // `composeTelling` runs for residents the reader is NOT looking at, which is
  // exactly how a stale room would spread if occupancy were a single flag.
  const other = standpointOccupancy({ acts: ACTS, at: 999, handle: "jetto-of-starforge" });
  assert.equal(other.insideOf, null, "a handle with no crossings is nowhere indoors");
  assert.deepEqual(other.entered, []);
  assert.deepEqual(
    standpointOccupancy({ acts: ACTS, at: 999, handle: "keith" }).alongside, [],
    "and the one who IS inside is alone in there");
});

// ── [pin] the scene is synced on EVERY arm of the switch ───────────────────
//
// The three source pins below are the issue's proposal 1, as it already stands.
// They are ordered the way a reader would walk it: the sync itself, the single
// funnel every arm goes through, and the arms.
test("[pin] activateTellingPane syncs the scene BEFORE its early return", () => {
  // the early return is on a null radial — a resident whose read has not landed
  // yet, and a spectator waiting on the fold. Syncing after it is what left the
  // previous resident's room up under the next resident's name.
  assert.match(SOURCE, /syncScene\(key\);\n    if \(!radial\) return;/,
    "the sync is above the early return, so a pane-less switch still remounts the town");
});

test("[pin] every arm of a switch reaches it — the cold arm, the warm arm, and the Spectator arm", () => {
  assert.match(SOURCE, /function renderTelling\(\) \{\n    const key = standpointKey\(\);\n[\s\S]{0,140}?activateTellingPane\(key, radial\);/,
    "the cold arm: renderTelling builds the pane and activates it");
  assert.match(SOURCE, /if \(warm\) activateTellingPane\(actor, entry\.radial\);\n    else renderTelling\(\);/,
    "the resident switch: warm goes straight to the pane, cold through renderTelling");
  assert.match(SOURCE, /renderTelling\(\);\n      drawWalkers\(\);\n      return;/,
    "the Spectator arm renders a telling before returning, so it syncs too");
  assert.match(SOURCE, /syncScene\(standpointKey\(\)\);/,
    "and a full re-render asks the same question of the same key");
});

test("[pin] syncScene mounts the new key's room, or remounts the town when it has none", () => {
  assert.match(SOURCE, /if \(\(room\?\.id \?\? null\) === sceneRoomId\) return;\n    if \(room\) mountRoomScene\(boxEl, room\);\n    else remountTown\(boxEl\);/,
    "a key with no interior takes the town branch — this is the whole of proposal 1");
  assert.match(SOURCE, /const built = interiorByKey\.get\(key\) \?\? null;/,
    "and the room is looked up under the NEW key, never a remembered one");
});

test("[pin] the way out is hung off the room, so it leaves with the room", () => {
  assert.match(SOURCE, /if \(!room\) \{ chrome\?\.remove\(\); return; \}/,
    "no room, no pill — the spectator cannot be left holding an exit it cannot use");
});
