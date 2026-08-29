// viewer-walk-stride.test.mjs — the walk desk, after the founder walked with it.
//
// THREE THINGS HE SAID, live-testing the dungeon on 2026-08-29:
//
//   "I still can't walk less than 1 meter by clicking."
//   "the walk button in the UI is still FILLED with irrelevant information I
//    don't care about."
//   "I can't even click my own token to walk."
//   "RECLICKING Illuminator takes me back out to where she actually is? makes
//    absolutely zero sense."
//
// ⚑ WHY THE FIRST ONE HAD ALREADY BEEN "FIXED" AND STILL BIT HIM, because that
// is the lesson rather than the line of code. The site's cockpit had learned the
// ground's stride and snapped ITS click-to-walk. But the walking a reader
// actually does rides THIS desk — the viewer's — which had never heard of the
// dial. A lane fixed the surface it owned, the suite went green, and the surface
// the founder walks with was untouched. A fix that lands where nobody walks is
// not a fix, and no test on either side could see it because each side was
// testing its own half.
//
// SOURCE PINS, this repo's standing discipline for viewer closure code (the
// pattern the other viewer-*.test.mjs files keep): the desk renders inside
// `mountViewer`'s closure, so a behavioural test would be testing a harness
// rather than the seam. Each assertion below fails against the pre-ruling file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

// ── the stride ──────────────────────────────────────────────────────────────

test("the stride is kept from the apex read the viewer was already making", () => {
  // NOT A SECOND FETCH. The palette load already asks the apex and already
  // receives the whole answer; the dial was arriving in that response and being
  // dropped on the floor with everything except `actions`.
  assert.match(VIEWER, /setWalkStride\(body\?\.standpoint\?\.portal\?\.walk_min_step\)/,
    "read off the same response the palette comes out of");
  // ONE READER, counted over the CODE rather than the whole file: the field is
  // named in the comment above the line too, and an assertion that counts prose
  // fails the next time somebody explains something. It did, on this test's own
  // first run — the second time tonight a grep-the-source check has been tripped
  // by the paragraph written to justify it.
  assert.equal((VIEWER.match(/body\?\.standpoint\?\.portal\?\.walk_min_step/g) ?? []).length, 1,
    "read in exactly one place — a second speller is a second thing to drift");
  // the FLAT field, on the portal block. The nested spellings the site lane
  // guessed at first do not exist and must not reappear here.
  assert.doesNotMatch(VIEWER, /walk\s*\.\s*min_step|walk:\s*\{\s*min_step/,
    "no nested walk.min_step — that shape was a guess and was never the field");
});

test("a ground that declares no stride is not snapped, which is every ground in the town", () => {
  // ⚑ THE DEFAULT IS THE WHOLE SAFETY OF THIS. A floor of one metre here would
  // make the entire town start rounding walks it has never rounded — the office
  // refused exactly that on its own side and wrote down why, and the site lane
  // shipped it as a bug and had to take it back out. Null means null.
  assert.match(VIEWER, /const next = Number\.isFinite\(n\) && n > 0 \? n : null;/,
    "an unusable or absent dial is null, not a number");
  assert.match(VIEWER, /walkStrideM \? Math\.round\(v \/ walkStrideM\) \* walkStrideM : v/,
    "and with no stride the coordinate is handed back untouched");
  // the office's own arithmetic, so a point snapped here and a point the office
  // snaps land on the same square
  assert.match(VIEWER, /round\(v \/ walkStrideM\) \* walkStrideM/,
    "round(v/step)*step, anchored at the world origin");
});

test("the snap happens before anything is asked of the point", () => {
  // The walls check, the zero-length refusal, the preview and the confirmed
  // destination must all be about the SAME point. Snapping later would arm one
  // place and walk to another.
  assert.match(VIEWER, /function chooseWalkPoint\(rawX, rawY, namedInside = null\)/,
    "the raw click is named raw");
  assert.match(VIEWER, /const x = snapToStride\(rawX\), y = snapToStride\(rawY\);\r?\n\s*const destination = pointWalkDestination/,
    "and snapped on the line before the destination is derived");
});

// ── the declutter ───────────────────────────────────────────────────────────

test("a ground with a stride is room scale, and the desk says less", () => {
  // SCOPED TO THE DIAL RATHER THAN TO THE DUNGEON, deliberately: a ground that
  // declares a walk lattice is telling you it is room-scale, so the same fact
  // that makes a quarter-metre step meaningful makes a crossings ETA absurd.
  // Keying on the dungeon by name would be a second thing to keep in step.
  assert.match(VIEWER, /const roomScale = walkStrideM != null;/,
    "one predicate, off the one dial");
  assert.match(VIEWER, /status\.hidden = journey\.kind !== "journey" \|\| roomScale;/,
    "the journey status line stands down in a room");
  assert.match(VIEWER, /if \(whoRow\) whoRow\.hidden = roomScale;/,
    "and so does Who, which the cockpit dock is answering two inches away");
  assert.match(VIEWER, /walkToRow\(destination, preview, roomScale\)/,
    "the To line is told which reading it is giving");
});

test("in a room the To line is the distance and nothing else", () => {
  assert.match(VIEWER, /function walkToRow\(destination, preview, roomScale = false\)/);
  // the ETA, the pace-guess note and the compass arrow are what he called
  // irrelevant — all three are precision about nothing at two metres
  assert.match(VIEWER, /const leg = roomScale\r?\n\s*\? \[parts \? `<span class="wv-walk-meta">\$\{esc\(parts\.distance\)\}<\/span>` : ""\]\.filter\(Boolean\)/,
    "a room keeps the distance alone");
  // …and the open world keeps every one of them, because out there a journey
  // genuinely is priced in crossings
  assert.match(VIEWER, /parts\?\.eta \? `<span class="wv-walk-meta">\$\{esc\(parts\.eta\)\}<\/span>` : ""/,
    "the world's own reading is untouched");
  assert.match(VIEWER, /parts\?\.paceNote \? `<span class="wv-walk-meta is-guess"/,
    "including the note that says which stride an ETA was guessed with");
});

// ── the gestures ────────────────────────────────────────────────────────────

test("your own token on the map is a walk button, and nobody else's is", () => {
  // ⚑ THE CIRCLE WAS ALREADY SWALLOWING THE CLICK. `.wv-walker-hit` has
  // `pointer-events: all` so it could take a hover and a title — and with no
  // handler behind it, clicking your own face did nothing AND stopped the
  // ground underneath from hearing it. Not an act that failed: an act with
  // nothing behind it and a hole where the fallback was.
  assert.match(VIEWER, /class="wv-walker-hit" data-walker="\$\{esc\(w\.handle\)\}"/,
    "the hit target carries whose token it is");
  assert.match(VIEWER, /const ours = \(state\.whoami\?\.handles \?\? \[\]\)\.includes\(mine\);/,
    "only your own handles answer");
  assert.match(VIEWER, /if \(mine !== state\.actAs\) \{ selectActor\(mine\); return; \}/,
    "an unselected one of yours selects first");
  assert.match(VIEWER, /if \(canAct\(\)\) ACTION_DOORS\.walk\.begin\(\);/,
    "and the selected one opens the same walk door the verb opens");
});

test("pressing the face you are already wearing does nothing", () => {
  // THE RULING: re-clicking the selected face is a no-op, not a teleport.
  assert.match(VIEWER, /async function selectActor\(actor\) \{[\s\S]{0,2000}?if \(actor === state\.actAs\) return;/,
    "the guard is the first thing selectActor does");
  // ⚑ AND THE "RELOAD SPECIAL-CASE" HE SUSPECTED DOES NOT EXIST — asserted so a
  // later reader does not go looking for it again. The reload was CORRECT: the
  // resident had crossed into the vault and not stepped out, so her standpoint
  // is the vault. The jump came from the camera recentring on `actorOrigin()`,
  // which is where a resident LIVES rather than where they are STANDING after a
  // crossing. Nothing here special-cases a fight, and nothing should.
  assert.match(VIEWER, /const origin = actorOrigin\(\);\r?\n\s*if \(origin\) state\.cam = \{ x: origin\.x, y: origin\.y \};/,
    "and the recentre on a REAL switch is untouched — it is the line that looked like a reload bug");
});

// ══ THE STORE CARRIES WHAT THE STATIC RENDER HAS TO SEE (2026-08-29) ═════════
//
// TWO SURFACES READ A MARK, and only one of them was being told things. The
// office's LIVE door reads the hydrated store and shrouds a loot-flagged thing
// until the encounter is spent. The BAKED map reads WORLD/world-state.json —
// and that file carried no `loot` at all, so the static render drew the wick end
// and the slice from the first moment of the fight. The founder reported it
// twice. One fact, two readers, held by one of them.
//
// The fix is one line in the fold beside `image`, which had already learned this
// lesson: a surface that renders from the store cannot see a frontmatter key the
// fold does not carry.

test("the fold carries the shroud's flag into the store, beside the picture", () => {
  const fold = readFileSync(join(HERE, "marks-fold.mjs"), "utf8");
  assert.match(fold, /image: mk\.image,/, "the picture pointer, which already worked");
  assert.match(fold, /loot: mk\.loot,/, "and the prize flag, which did not");
  // both are undefined-on-absent, so a world with neither serializes unchanged
  assert.doesNotMatch(fold, /loot: mk\.loot \?\? false/, "no default — absent stays absent");
});

test("the picture pointer was never the missing half", () => {
  // ⚑ RECORDED BECAUSE IT WAS THE OBVIOUS SUSPECT AND IT WAS INNOCENT. The
  // founder sees no mark art on dev, and the natural reading is that the fold
  // drops `image` the way it dropped `loot`. It does not — it has carried the
  // pointer since 2026-08-15, and the parlor art rendered through it on the
  // rehearsal night.
  //
  // So the art's absence is not a fold defect: it is a STALE world-state.json
  // in the clone the dev site builds from, written before the seven marks were
  // restaged. The fix is to re-run the fold over that clone, not to change this
  // file. Its own header states the invocation:
  //     node tools/marks-fold.mjs
  // which writes WORLD/world-state.json and WORLD/INDEX.md from the repo.
  const fold = readFileSync(join(HERE, "marks-fold.mjs"), "utf8");
  assert.match(fold, /node tools\/marks-fold\.mjs\s+# fold the repo, write WORLD\/world-state\.json/,
    "the regeneration command is documented where a reader would look for it");
});
