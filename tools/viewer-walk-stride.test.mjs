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

// ══ THE HANDSHAKE, MADE REAL ON THIS SIDE (seam review, 2026-08-29) ══════════
//
// ⚑ THE FINDING, AND IT IS A STRUCTURAL ONE. The cockpit tried twice to stop the
// viewer acting on a click it had already claimed — once with stopPropagation on
// a document-level CLICK capture, once with `pointer-events: none` on the
// overlay from the site's stylesheet. Both were INERT:
//
//   • `pointerup` fires before `click`, so the mark was selected and the walk
//     armed before the click the cockpit was capturing existed at all;
//   • `contestedMarksAtPoint` hit-tests by SCREEN COORDINATES against a
//     candidate list, not by DOM element, so taking the overlay out of the
//     pointer path never reached it.
//
// Two fixes, both reasonable, both aimed at a mechanism this handler does not
// use — and no event ordering can put a click ahead of a pointerup, so it could
// not have been fixed from the other side. The stand-down belongs here.
//
// AND UNTIL NOW NOTHING IN THIS FILE READ EITHER COCKPIT SIGNAL. Every
// stand-down described as "the same handshake the rail uses" was a rule in the
// SITE's stylesheet hiding an element by display — survivable for chrome, fatal
// for behaviour, because a hidden panel's HANDLER still runs.

test("the viewer reads the cockpit's two signals, and they mean different scopes", () => {
  assert.match(VIEWER, /const cockpitMounted = \(\) => \{/, "mounted: the cockpit owns the acts");
  assert.match(VIEWER, /const cockpitAiming = \(\) => \{/, "aiming: it owns the next click on the painting");
  assert.match(VIEWER, /hasAttribute\("data-pmc-dock"\)/, "the attribute the mount plants");
  assert.match(VIEWER, /classList\.contains\("pmc-aiming"\)/, "and the class it sets while armed");
  // both are try/caught — a viewer running without a document (its own unit
  // tests import this module in node) must not throw on a signal read
  assert.match(VIEWER, /const cockpitMounted = \(\) => \{\r?\n\s*try \{/, "read defensively, so a DOM-less import survives");
});

test("an armed act stands the whole pointerup aside; a mounted one stands down only walking", () => {
  // THE SCOPES ARE DELIBERATELY DIFFERENT. While AIMING the map is a crosshair,
  // so mark-select, the chooser, the talk lens and walking all stand aside for
  // that one gesture. While merely MOUNTED, clicking a pip to inspect a mark is
  // still a perfectly good thing to do in a room — only walking is the
  // cockpit's, because a walk now begins at its button and is confirmed on its
  // panel.
  assert.match(VIEWER, /if \(cockpitAiming\(\)\) return;/, "aiming: the whole handler stands aside");
  assert.match(VIEWER, /if \(canAct\(\) && !cockpitMounted\(\)\) chooseWalkPoint\(point\.x, point\.y\);/,
    "mounted: only the walk-arming stands down");
  // the guard is at the TOP of the handler, after the drag check — before any
  // selection, chooser or lens can consume the gesture
  // ORDER ASSERTED BY INDEX rather than by one long regex: the guard and the
  // first hit-test are separated by the paragraph explaining why the guard is
  // here, and a span-capped pattern fails the day somebody explains more. (It
  // did, on this test's first run — the third time tonight a source check has
  // been tripped by its own justification.)
  //
  // ⚑ AND IT IS SCOPED TO THE HANDLER'S OWN TEXT. The first `contestedMarksAtPoint`
  // in the file is its DEFINITION, two hundred thousand characters earlier, so a
  // whole-file index comparison compared the guard against a function rather
  // than against the call it must precede — and passed or failed for reasons
  // that had nothing to do with the law. The handler is the unit of ordering.
  const handler = VIEWER.slice(VIEWER.indexOf('svg.addEventListener("pointerup"'));
  const body = handler.slice(0, handler.indexOf('svg.addEventListener("pointercancel"'));
  // …and matched as a CALL, not as a name. The paragraph above the guard
  // explains what `contestedMarksAtPoint` does, so a bare-name search found the
  // explanation before the code — the FOURTH time tonight a source check has
  // been tripped by the sentence written to justify it. Prose is not the thing
  // under test; the call is.
  const guard = body.indexOf("if (cockpitAiming()) return;");
  const firstHitTest = body.indexOf("contestedMarksAtPoint({");
  assert.ok(guard > -1, "the guard is inside the pointerup handler");
  assert.ok(firstHitTest > -1, "and so is the first hit-test");
  assert.ok(guard < firstHitTest,
    "the guard stands aside BEFORE anything hit-tests the point");
});

test("the crossing ceremony has one door while the cockpit is mounted", () => {
  // The card chip and the way-out pill are not inside `.wv-actions`, so the
  // rail's own stand-down never covered them — a reader in portal ground was
  // offered the same act by two surfaces with different chrome and confirms.
  assert.match(VIEWER, /if \(cockpit\) return \{ show: false, why: "the cockpit's bar carries the crossing while it is mounted" \};/,
    "the card's chip stands down");
  assert.match(VIEWER, /if \(!room \|\| cockpitMounted\(\)\) \{ chrome\?\.remove\(\); return; \}/,
    "and the pane's way-out is not built at all — which also stops its handler existing");
  assert.match(VIEWER, /cockpit: cockpitMounted\(\),/, "the affordance is told, at its one call site");
});

test("one poller on the conversations door at a time", () => {
  // The cockpit runs its own speech layer at seven seconds while mounted; this
  // wash asks the same door on a slower tick. Two readers of one door is two
  // sets of requests and two paintings of the same sounds.
  assert.match(VIEWER, /if \(convoVisible && tick % 2 === 0 && !cockpitMounted\(\)\) loadConversations\(\)/,
    "the wash stands down while the cockpit is up, and resumes when it unmounts");
});

test("one resolver for who is acting, in a module both sides can import", () => {
  // ⚑ THE MISMATCH IT CLOSES: the viewer resolved the boot selection from
  // `act_as` AND `last_resident` with the spectator sentinel handled; the site's
  // cockpit read only `act_as` and fell back to the first handle. On a reload
  // where `act_as` was absent or held the sentinel, the two rooted at DIFFERENT
  // residents until a face was clicked.
  //
  // The function was already exported from viewer.mjs — what it lacked was a
  // home the site could import without pulling eight thousand lines into the
  // cockpit's bundle. viewer.mjs re-exports both names, so its own callers and
  // falsifiers are untouched.
  const shared = readFileSync(join(HERE, "..", "spectator", "act-as.mjs"), "utf8");
  assert.match(shared, /export function resolveActAsSelection\(/, "the resolver lives in the small module");
  assert.match(shared, /export const SPECTATOR_ACTOR = "__spectator__";/, "with the sentinel it needs");
  assert.match(VIEWER, /import \{ SPECTATOR_ACTOR, resolveActAsSelection, ACT_AS_KEY, LAST_RESIDENT_KEY \} from "\.\/act-as\.mjs";/,
    "the viewer imports rather than defines");
  assert.match(VIEWER, /export \{ SPECTATOR_ACTOR, resolveActAsSelection \};/, "and re-exports for its existing readers");
  assert.doesNotMatch(VIEWER, /export function resolveActAsSelection\(/, "there is exactly one definition");
});
