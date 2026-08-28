// mark-class-render.test.mjs — WHAT A MARK IS MUST REACH WHAT A MARK LOOKS LIKE.
//
// Marks carry a `class:` — 175 of them in the committed world, and three of
// those are `portal-ground`: the-town/the-cellar-door, the-town/the-lanternstep-parlor
// and their kin. It is the record's own word for what KIND of thing a mark is.
//
// It reached nothing. `markStateClasses` is the ONE place render classes are
// minted — every coloured surface in the viewer speaks its output: pips,
// footprints, cards, washes, highlights, bubbles, relation lines — and it read
// only `tier` and `draft`. A door and a basket standing in the same room were
// the same two characters of CSS, so the door could not be drawn as a door
// anywhere, by anyone, without a second and rival notion of what it was.
//
// So the class rides the chokepoint that already exists. Nothing downstream
// needs to learn a new vocabulary; a surface that wants to know a door from a
// basket now has `c-portal-ground` on the element it was already given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { markStateClasses } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SOURCE = read("spectator/viewer.mjs");
const MARKS = JSON.parse(read("WORLD/world-state.json")).marks;

const DOOR = MARKS.find((m) => m.id === "the-town/the-cellar-door");
const BASKET = MARKS.find((m) => m.id === "rei/the-mending-basket");

test("THE FALSIFIER: two marks that differ ONLY in `class:` do not render identically", () => {
  assert.ok(DOOR && BASKET, "both marks are in the committed world");
  assert.equal(DOOR.class, "portal-ground", "the door says what it is, on the record");
  // the basket is an ordinary sited mark with no class — the control
  assert.equal(BASKET.class, undefined, "the basket says nothing, which is the ordinary case");
  // and they are the same on every OTHER axis the mint reads, so a difference
  // in the answer can only have come from the class
  const same = { tier: "market", draft: false };
  assert.notEqual(markStateClasses({ ...same, mark: DOOR }), markStateClasses({ ...same, mark: BASKET }),
    "a portal-ground and a basket mint the same render classes — the record's own word for what a mark is reaches no surface");
  assert.match(markStateClasses({ ...same, mark: DOOR }), /(^| )c-portal-ground( |$)/);
});

test("the class rides BESIDE the tier accent, never instead of it", () => {
  // A class is not a tier. A portal-ground can be a home, a constitution mark
  // or ordinary market ground, exactly as `is-draft` is a state and not a tier,
  // so it travels as one more token and the accent goes on saying its own thing.
  assert.equal(markStateClasses({ tier: "home", draft: true, mark: { class: "portal-ground" } }),
    "t-home is-draft c-portal-ground");
  assert.equal(markStateClasses({ tier: "constitution", mark: { class: "arena" } }), "t-constitution c-arena");
});

test("a classless mark is untouched — the old two-token output, byte for byte", () => {
  // every existing surface, selector and test reads these strings; a mark with
  // nothing to add must add nothing
  assert.equal(markStateClasses({ tier: "home" }), "t-home");
  assert.equal(markStateClasses(), "t-market");
  assert.equal(markStateClasses({ tier: "market", draft: true, mark: { id: "a/b" } }), "t-market is-draft");
});

test("THE CLASS IS RECORD TEXT, so it is sanitised before it becomes a selector", () => {
  // `class:` is written by residents in mark records. It reaches a class
  // attribute, so it is escaped at the mint rather than trusted at 20 call
  // sites — the same reason every body on this page goes through `esc`.
  assert.equal(markStateClasses({ mark: { class: 'x" onload="alert(1)' } }), "t-market c-x-onload-alert-1");
  assert.equal(markStateClasses({ mark: { class: "  Portal Ground  " } }), "t-market c-portal-ground");
  assert.equal(markStateClasses({ mark: { class: "///" } }), "t-market", "nothing usable left means nothing added");
  assert.equal(markStateClasses({ mark: { class: 42 } }), "t-market c-42");
});

test("EVERY class in the committed world survives the mint as a usable token", () => {
  // the sanitiser must not quietly eat the record: whatever the town has
  // actually written has to come out the other side as something a stylesheet
  // can name
  const classes = [...new Set(MARKS.map((m) => m.class).filter(Boolean))];
  assert.ok(classes.length > 100, `the record carries ${classes.length} distinct classes`);
  const eaten = classes.filter((c) => !markStateClasses({ mark: { class: c } }).includes("c-"));
  assert.deepEqual(eaten, [], "no class the town has written is lost at the mint");
});

test("THE WIRING: the viewer's ONE class string threads the mark, so every surface gets it at once", () => {
  // markClasses is the single expression every coloured surface calls. If the
  // mark stops reaching it, the token stops reaching pips, footprints, cards,
  // washes, highlights and bubbles together — which is the state this fixes.
  assert.match(SOURCE, /const markClasses = \(m\) => markStateClasses\(\{ tier: tierOf\(m\), draft: isDraft\(m\), mark: byId\.get\(m\?\.id\) \?\? m \}\)/,
    "markClasses resolves the FULL mark — an FOV entry carries no class field of its own");
  assert.match(SOURCE, /investigateNameLine[\s\S]{0,900}?markStateClasses\(\{ tier, draft, mark \}\)/,
    "the investigate relation lines speak it too");
});
