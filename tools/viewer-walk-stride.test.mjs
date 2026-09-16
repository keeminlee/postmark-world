// viewer-walk-stride.test.mjs — the walk desk, after the founder walked with it.
//
// THREE THINGS HE SAID, live-testing on 2026-08-29:
//
//   "I still can't walk less than 1 meter by clicking."
//   "the walk button in the UI is still FILLED with irrelevant information I
//    don't care about."
//   "I can't even click my own token to walk."
//   "RECLICKING Illuminator takes me back out to where she actually is? makes
//    absolutely zero sense."
//
// ⚑ WHY THE FIRST ONE HAD ALREADY BEEN "FIXED" AND STILL BIT HIM: the site's
// cockpit had learned the ground's stride and snapped ITS click-to-walk, but
// the walking a reader actually does rides THIS desk, which had never heard of
// the dial. A fix that lands where nobody walks is not a fix.
//
// SOURCE PINS, this repo's standing discipline for viewer closure code. Built on
// the party lineage (world 42eeb71c), lost in the 08-29 rollback, ported
// 2026-09-16 (POS-91 / postmark#2847). No ground on today's record declares a
// stride, so the snap and the room-scale desk ship dormant and correct; the
// token-as-walk-button and the no-op reselect ship live.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

// ── the stride ───────────────────────────────────────────────────────────────

test("the stride is kept from the apex read the viewer was already making", () => {
  assert.match(VIEWER, /setWalkStride\(body\?\.standpoint\?\.portal\?\.walk_min_step\)/,
    "read off the same response the palette comes out of");
  // ONE READER, counted over the CODE rather than the whole file: the field is
  // named in the comment above the line too, so the count is of the call.
  assert.equal((VIEWER.match(/setWalkStride\(body\?\.standpoint\?\.portal\?\.walk_min_step\)/g) ?? []).length, 1,
    "read in exactly one place — a second speller is a second thing to drift");
  assert.doesNotMatch(VIEWER, /walk\s*\.\s*min_step|walk:\s*\{\s*min_step/,
    "no nested walk.min_step — that shape was a guess and was never the field");
});

test("a ground that declares no stride is not snapped, which is every ground in the town", () => {
  // ⚑ THE DEFAULT IS THE WHOLE SAFETY OF THIS. A floor of one metre here would
  // make the entire town start rounding walks it has never rounded. Null means null.
  assert.match(VIEWER, /const next = Number\.isFinite\(n\) && n > 0 \? n : null;/,
    "an unusable or absent dial is null, not a number");
  assert.match(VIEWER, /walkStrideM \? Math\.round\(v \/ walkStrideM\) \* walkStrideM : v/,
    "and with no stride the coordinate is handed back untouched");
});

test("the snap happens before anything is asked of the point", () => {
  assert.match(VIEWER, /function chooseWalkPoint\(rawX, rawY, namedInside = null\)/,
    "the raw click is named raw");
  assert.match(VIEWER, /const x = snapToStride\(rawX\), y = snapToStride\(rawY\);\r?\n\s*const destination = pointWalkDestination/,
    "and snapped on the line before the destination is derived");
});

// ── the declutter ────────────────────────────────────────────────────────────

test("a ground with a stride is room scale, and the desk says less", () => {
  assert.match(VIEWER, /const roomScale = walkStrideM != null;/, "one predicate, off the one dial");
  assert.match(VIEWER, /status\.hidden = journey\.kind !== "journey" \|\| roomScale;/,
    "the journey status line stands down in a room");
  assert.match(VIEWER, /if \(whoRow\) whoRow\.hidden = roomScale;/,
    "and so does Who, which the cockpit dock is answering two inches away");
  assert.match(VIEWER, /walkToRow\(destination, preview, roomScale\)/,
    "the To line is told which reading it is giving");
});

test("in a room the To line is the distance and nothing else", () => {
  assert.match(VIEWER, /function walkToRow\(destination, preview, roomScale = false\)/);
  assert.match(VIEWER, /const leg = roomScale\r?\n\s*\? \[parts \? `<span class="wv-walk-meta">\$\{esc\(parts\.distance\)\}<\/span>` : ""\]\.filter\(Boolean\)/,
    "a room keeps the distance alone");
  assert.match(VIEWER, /parts\?\.eta \? `<span class="wv-walk-meta">\$\{esc\(parts\.eta\)\}<\/span>` : ""/,
    "the world's own reading is untouched");
  assert.match(VIEWER, /parts\?\.paceNote \? `<span class="wv-walk-meta is-guess"/,
    "including the note that says which stride an ETA was guessed with");
});

// ── the gestures ─────────────────────────────────────────────────────────────

test("your own token on the map is a walk button, and nobody else's is", () => {
  // ⚑ THE CIRCLE WAS ALREADY SWALLOWING THE CLICK. `.wv-walker-hit` has
  // `pointer-events: all` so it could take a hover and a title — and with no
  // handler behind it, clicking your own face did nothing AND stopped the
  // ground underneath from hearing it.
  assert.match(VIEWER, /class="wv-walker-hit" data-walker="\$\{esc\(handle\)\}"/,
    "the hit target carries whose token it is");
  assert.match(VIEWER, /const ours = \(state\.whoami\?\.handles \?\? \[\]\)\.includes\(mine\);/,
    "only your own handles answer");
  assert.match(VIEWER, /if \(mine !== state\.actAs\) \{ selectActor\(mine\); return; \}/,
    "an unselected one of yours selects first");
  assert.match(VIEWER, /if \(canAct\(\)\) ACTION_DOORS\.walk\.begin\(\);/,
    "and the selected one opens the same walk door the verb opens");
});

test("pressing the face you are already wearing does nothing", () => {
  assert.match(VIEWER, /async function selectActor\(actor\) \{[\s\S]{0,1200}?if \(actor === state\.actAs\) return;/,
    "the guard is the first thing selectActor does");
  // AND THE "RELOAD SPECIAL-CASE" HE SUSPECTED DOES NOT EXIST: the jump came
  // from the camera recentring on `actorOrigin()`, where a resident LIVES rather
  // than where they are STANDING after a crossing. The recentre on a REAL switch
  // is untouched — it is the line that looked like a reload bug.
  assert.match(VIEWER, /const origin = actorOrigin\(\);\r?\n\s*if \(origin\) state\.cam = \{ x: origin\.x, y: origin\.y \};/,
    "the recentre on a real switch stands as it was");
});
