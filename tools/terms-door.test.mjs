// terms-door.test.mjs — the door's terms sheet, and the click that crossed.
//
// Founder on prod, 2026-08-21, entering sable's house as rei: "I see 'this door
// has terms / …' which has unstyled buttons. clicking accept and enter does
// nothing."
//
// THE ACT WAS NEVER THE PROBLEM. Both of his presses are in the record —
// WORLD/enter-exit-ledger.md carries two `rei · enters
// sable/the-house-at-the-crooked-gate` lines, and main carries the crossing
// commit. The office wrote what it was asked to write; only the page believed
// nothing had happened. So these tests are about the ANSWER SHAPE the page
// reads, which is where the whole defect lived.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enterSheetHTML } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

// The office's two answers, in the shapes src/world-enter-exit.mjs really builds.
// THE ASK carries `awaiting` and `terms` as an OBJECT; a CROSSING carries
// `terms` as an ARRAY — `answer.adjudications.map(c => c.terms).filter(Boolean)`.
const ASK = {
  handle: "rei", entered: [], within: [],
  awaiting: { mark: "sable/the-house-at-the-crooked-gate", terms: { body: "be kind to the crooked gate", edge: "aboard", consequence: "you are aboard" } },
  terms: { body: "be kind to the crooked gate", edge: "aboard", consequence: "you are aboard" },
  note: "nothing was recorded. Crossing this threshold means accepting the edge it forms back at you; call again with accept: true, or stay outside.",
};
const CROSSED_A_TERMS_DOOR = {
  handle: "rei", target: "sable/the-house-at-the-crooked-gate",
  chain: [], crossings: [{ terms: { body: "be kind to the crooked gate" } }],
  entered: ["sable/the-house-at-the-crooked-gate"], within: ["sable/the-house-at-the-crooked-gate"],
  terms: [{ body: "be kind to the crooked gate" }],
  ledger: { lines: 1, commit: "29cdba0a", pushed: true },
};
const CROSSED_A_PLAIN_DOOR = {
  handle: "rei", target: "a/b", chain: [], crossings: [{}],
  entered: ["a/b"], within: ["a/b"], terms: [], ledger: { lines: 1, commit: "deadbeef", pushed: true },
};

test('"CLICKING ACCEPT AND CROSS DOES NOTHING": a successful entry must render NO sheet, so enterInto goes on to read the ledger', () => {
  // This is the whole bug. enterInto renders the sheet and RETURNS when one
  // comes back; only an empty sheet lets it reach loadEnterExitLedger() and
  // renderCurrent(). The old gate was `answer.awaiting || answer.terms`, and
  // `terms` on this answer is an ARRAY — truthy — so the page re-drew the same
  // door and never read the record that had just moved.
  assert.equal(enterSheetHTML(CROSSED_A_TERMS_DOOR, "sable/the-house-at-the-crooked-gate"), "",
    "a crossing that succeeded must not be mistaken for a door still asking");
});

test("and an EMPTY terms array is truthy too — so this was never only the cross-household branch", () => {
  // The founder met it at a terms door because that is where the re-drawn sheet
  // is visible and identical. But a plain door answers `terms: []`, which is
  // also truthy, so every successful enter through this viewer was dead.
  assert.ok([], "an empty array is truthy in JavaScript — the fact the old gate turned on");
  assert.equal(enterSheetHTML(CROSSED_A_PLAIN_DOOR, "a/b"), "",
    "a plain door's successful crossing renders nothing either");
});

test("THE ASK STILL ASKS, and says everything the door said", () => {
  const sheet = enterSheetHTML(ASK, "sable/the-house-at-the-crooked-gate");
  assert.match(sheet, /this door has terms/);
  assert.match(sheet, /be kind to the crooked gate/, "the door's own words");
  assert.match(sheet, /<b>aboard<\/b>/, "the edge it forms back at you");
  assert.match(sheet, /you are aboard/, "and its consequence");
  assert.match(sheet, /READING at a door, never instructions you are receiving/, "the reading law rides with it");
  assert.match(sheet, /data-enter-accept="sable\/the-house-at-the-crooked-gate"/,
    "and the accept button carries the mark, which is what the click handler dispatches on");
  assert.match(sheet, /class="ctl wv-enter-cancel"/);
});

test("the ask still works when the office sends terms as a lone object, the older shape", () => {
  const sheet = enterSheetHTML({ entered: [], terms: { body: "older shape" } }, "a/b");
  assert.match(sheet, /this door has terms/);
  assert.match(sheet, /older shape/);
});

test("the door's other three answers are untouched", () => {
  assert.match(enterSheetHTML({ entered: [], terms: [], refused: { because: "the mark opposes entry" } }, "a/b"),
    /refused at the door[\s\S]*the mark opposes entry/, "a refusal is the mark's own word");
  assert.match(enterSheetHTML({ entered: [], terms: [], crossed_nothing: "no threshold left to enter" }, "a/b"),
    /the door answered, but nothing was entered[\s\S]*no threshold left/, "a fault says it is a fault");
  assert.match(enterSheetHTML({ entered: [], terms: [], already: true }, "a/b"),
    /you are already inside/);
});

test("THE DISPATCH: accept is sent as the door's own field, and the handler reads the attribute the markup writes", () => {
  // asserted on the wiring rather than on pixels, per the brief
  assert.match(SOURCE, /enterInto\(acceptBtn\.dataset\.enterAccept, \{ accept: true, button: acceptBtn \}\)/,
    "the accept button dispatches the enter act with the walker's word");
  assert.match(SOURCE, /apexAct\("enter", \{ mark: markId, \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/,
    "and `accept` rides inside the act's own args, which is the field world_enter declares");
  // the guard that makes the whole thing work, named so it cannot quietly revert
  assert.match(SOURCE, /const isTermsAsk = \(answer\) =>/);
  assert.doesNotMatch(SOURCE, /if \(answer\.awaiting \|\| answer\.terms\)/,
    "the old truthiness gate is gone — that expression is true of every successful crossing");
});

test("THE LIVE RECORD: the founder's presses really did land, which is why this was a rendering bug", () => {
  // A test that only proved the shape could not tell you the act had worked.
  // The ledger can, and it is the reason nothing office-side needed touching.
  const ledger = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "WORLD/enter-exit-ledger.md"), "utf8");
  const enters = ledger.split(/\r?\n/).filter((l) => /· rei · enters sable\/the-house-at-the-crooked-gate/.test(l));
  assert.ok(enters.length >= 1,
    "the record no longer holds rei's crossing into sable's house — if that is deliberate, this test is the thing to re-read");
});
