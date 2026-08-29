// enter-affordance.test.mjs — the doorknob.
//
// The interior shipped without one. A resident could BE inside a mark — the
// ledger said so, the viewer drew the room — but nothing on the site could put
// them there; only the MCP door could enter. The founder's word: "if I can't
// enter marks via the site, what did we even build."
//
// What is pinned here is the DECISION (who may enter what, and the door's three
// answers), not the plumbing. The apex call and the DOM live in mountViewer's
// closure; the browser receipts cover those.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SPECTATOR_ACTOR, enterSheetHTML, enterAffordance, enterButtonHTML, enterableMark,
} from "../spectator/viewer.mjs";

const ROOM = { id: "rei/the-lanternstep-house", kind: "sited", at: { x: 10, y: -4 }, extent: { w: 12, h: 9 } };
const GRANTED = [{ action: "enter", grant: "yours" }, { action: "walk", grant: "yours" }];

// ── enterable ground ────────────────────────────────────────────────────────
test("ground with an inside is enterable; a point is not", () => {
  assert.equal(enterableMark(ROOM), true);
  assert.equal(enterableMark({ ...ROOM, extent: null }), false, "a point has no inside");
  assert.equal(enterableMark({ ...ROOM, extent: { w: 0, h: 9 } }), false, "no width, no room");
  assert.equal(enterableMark({ ...ROOM, at: null }), false, "nowhere is not somewhere");
  assert.equal(enterableMark({ ...ROOM, kind: "predicated" }), false, "a property is not a place");
  assert.equal(enterableMark({ ...ROOM, kind: "naming" }), false);
  assert.equal(enterableMark(null), false);
});

// ── who may enter ───────────────────────────────────────────────────────────
test("FALSIFIER: a resident granted the entry sees the door", () => {
  const a = enterAffordance({ mark: ROOM, palette: GRANTED, actingAs: "wright", insideOf: null });
  assert.equal(a.show, true);
  assert.equal(a.why, null);
});

test("FALSIFIER: a SPECTATOR never sees the door", () => {
  // the same reason the interior refuses a camera (R15): a spectator has no body
  // to carry across a threshold
  for (const actingAs of [SPECTATOR_ACTOR, null, ""]) {
    const a = enterAffordance({ mark: ROOM, palette: GRANTED, actingAs });
    assert.equal(a.show, false, `a spectator (${JSON.stringify(actingAs)}) was offered the entry`);
    assert.match(a.why, /no body/);
  }
});

test("a standpoint without the grant is not afforded the verb", () => {
  const a = enterAffordance({ mark: ROOM, palette: [{ action: "walk" }], actingAs: "wright" });
  assert.equal(a.show, false);
  assert.match(a.why, /not granted/);
  assert.equal(enterAffordance({ mark: ROOM, palette: [], actingAs: "wright" }).show, false);
});

test("a mark with no inside offers no door to anyone", () => {
  const a = enterAffordance({ mark: { ...ROOM, extent: null }, palette: GRANTED, actingAs: "wright" });
  assert.equal(a.show, false);
  assert.match(a.why, /no inside/);
});

test("already inside is a no-op, not a refusal — and the door goes away", () => {
  const a = enterAffordance({ mark: ROOM, palette: GRANTED, actingAs: "wright", insideOf: ROOM.id });
  assert.equal(a.show, false);
  assert.match(a.why, /already inside/);
  // but being inside something ELSE still offers this door (deep entry is a chain)
  assert.equal(
    enterAffordance({ mark: ROOM, palette: GRANTED, actingAs: "wright", insideOf: "the-town/the-quay-reach" }).show,
    true, "a chain of entries is how you get deep; the next door must still be there");
});

test("the button names its mark and says what it does", () => {
  const html = enterButtonHTML(ROOM.id);
  assert.match(html, /data-enter="rei\/the-lanternstep-house"/);
  assert.match(html, />enter</);
  assert.doesNotMatch(enterButtonHTML('"><script>x</script>'), /<script>/);
});

// ── the door's three answers ────────────────────────────────────────────────
test("FALSIFIER: TERMS renders as a question with a second button, and writes nothing", () => {
  // the two-call handshake IS the UI: the first call carried no accept, so the
  // record is untouched and the walker's word is what the second button is for
  const html = enterSheetHTML({
    awaiting: { terms: { body: "The lanternstep house, lit at dusk.", edge: "aboard", consequence: "you are counted among its lamps" } },
    entered: [],
  }, ROOM.id);
  assert.match(html, /this door has terms/);
  assert.match(html, /lanternstep house/);
  assert.match(html, /aboard/);
  assert.match(html, /counted among its lamps/);
  assert.match(html, /data-enter-accept="rei\/the-lanternstep-house"/, "the second leg of the handshake");
  assert.match(html, /stay outside/, "declining is free, and it is offered");
  assert.match(html, /READING at a door/, "the reading law rides the terms");
});

test("FALSIFIER: a REFUSAL is the mark's own word, and says the act still stands", () => {
  const html = enterSheetHTML({
    refused: { mark: ROOM.id, word: "opposed", because: "the wheelhouse is the postmaster's own" },
  }, ROOM.id);
  assert.match(html, /refused at the door/);
  assert.match(html, /postmaster's own/);
  assert.match(html, /act is in the record/, "being turned away is a fact about the town");
  assert.doesNotMatch(html, /accept and enter/, "a refusal offers no second try");
});

test("a clean entry renders NO sheet — the interior is the answer", () => {
  // nothing to say at the door once you are through it; the room speaks instead
  assert.equal(enterSheetHTML({ entered: [ROOM.id], within: [ROOM.id] }, ROOM.id), "");
  assert.equal(enterSheetHTML({}, ROOM.id), "");
});

// ── no silent click (founder, 2026-08-20) ──────────────────────────────────
//
// The founder clicked enter and NOTHING happened. The door had answered success
// with entered: [], no terms, no refusal, no ledger row — an act that vanished.
// The viewer rendered nothing because there was nothing, which was correct and
// useless. The office now says WHY it entered nothing, and these pin that the
// reader is told.
test("FALSIFIER: an answer that entered nothing is never silent", () => {
  const html = enterSheetHTML({ entered: [], crossed_nothing: "nothing was entered at rei/x, and the door named neither terms nor a refusal" }, "rei/x");
  assert.notEqual(html, "", "the vanished click is the bug — an empty sheet here IS the bug");
  assert.match(html, /nothing was entered/);
  assert.match(html, /neither terms nor a refusal/, "the door's own reason is shown, not a paraphrase");
});

test("already-inside is said as itself, not as a fault", () => {
  const html = enterSheetHTML({ already: true, entered: [], crossed_nothing: "you are already within rei/x" }, "rei/x");
  assert.match(html, /already inside/);
  assert.doesNotMatch(html, /fault/, "a no-op is not an error and must not read as one");
});

test("a real entry is still silent — the room is the announcement", () => {
  assert.equal(enterSheetHTML({ entered: ["rei/x"], within: ["rei/x"] }, "rei/x"), "");
});

test("markup in the door's own words cannot escape the sheet", () => {
  const html = enterSheetHTML({
    awaiting: { terms: { body: "<script>x</script>", edge: "<b>e</b>", consequence: "<i>c</i>" } },
  }, "a/b");
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>e<\/b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(enterSheetHTML({ refused: { because: "<img src=x>" } }, "a/b"), /<img/);
});
