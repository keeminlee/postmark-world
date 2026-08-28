// terms-door.test.mjs — the door's terms sheet, and the click that crossed.
//
// Founder on prod, 2026-08-21, entering sable's house as rei: "I see 'this door
// has terms / …' which has unstyled buttons. clicking accept and cross does
// nothing."
//
// THE ACT WAS NEVER THE PROBLEM. Both of his presses are in the record —
// WORLD/threshold-ledger.md carries two `rei · enters
// sable/the-house-at-the-crooked-gate` lines, and main carries the crossing
// commit. The office wrote what it was asked to write; only the page believed
// nothing had happened. So these tests are about the ANSWER SHAPE the page
// reads, which is where the whole defect lived.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crossingSheetHTML } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");
// the page's own escaping, so an assertion compares against what the markup
// really holds rather than against the raw record text (viewer.mjs:40)
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The office's two answers, in the shapes src/world-crossings.mjs really builds.
// THE ASK carries `awaiting` and `terms` as an OBJECT; a CROSSING carries
// `terms` as an ARRAY — `answer.crossings.map(c => c.terms).filter(Boolean)`.
//
// THE ASK IS GENERATED, NOT WRITTEN DOWN (2026-08-27). It used to be a
// hand-written object under a comment claiming it was "the shape
// src/world-crossings.mjs really builds". It was not, and nothing could have
// told anyone: the note the office actually sends reads "Entering here means
// accepting the edge it forms back at you", not "Crossing this threshold
// means…"; the office ships a top-level `reading_law` the fixture had never
// heard of; and the terms object the door hands over carries `mark`, `word`
// and its own `reading_law`, none of which the fixture had. A page tested
// against a shape nobody serves is tested against nothing — the same class of
// defect as the door this file was written to catch.
//
// tools/terms-ask-fixture.mjs runs the office's own enterViaOffice against a
// real terms-bearing mark in the committed world and writes both answers it can
// give: `bare` (knocking from inside — nothing crossable before the door, so
// nothing is written) and `chained` (walking up from outside, which crosses the
// garden and the house on the way and so carries `awaiting` AND `entered` AND a
// ledger receipt at once — a shape the hand-written fixture could not have
// imagined). Regenerate with:
//   node tools/terms-ask-fixture.mjs --office <path to the office repo>
const ASKS = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "terms-ask.json"), "utf8"));
const ASK = ASKS.bare;
const ASK_MARK = ASK.awaiting.mark;
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

test('"CLICKING ACCEPT AND CROSS DOES NOTHING": a successful crossing must render NO sheet, so crossInto goes on to read the ledger', () => {
  // This is the whole bug. crossInto renders the sheet and RETURNS when one
  // comes back; only an empty sheet lets it reach loadThresholdLedger() and
  // renderCurrent(). The old gate was `answer.awaiting || answer.terms`, and
  // `terms` on this answer is an ARRAY — truthy — so the page re-drew the same
  // door and never read the record that had just moved.
  assert.equal(crossingSheetHTML(CROSSED_A_TERMS_DOOR, "sable/the-house-at-the-crooked-gate"), "",
    "a crossing that succeeded must not be mistaken for a door still asking");
});

test("and an EMPTY terms array is truthy too — so this was never only the cross-household branch", () => {
  // The founder met it at a terms door because that is where the re-drawn sheet
  // is visible and identical. But a plain door answers `terms: []`, which is
  // also truthy, so every successful enter through this viewer was dead.
  assert.ok([], "an empty array is truthy in JavaScript — the fact the old gate turned on");
  assert.equal(crossingSheetHTML(CROSSED_A_PLAIN_DOOR, "a/b"), "",
    "a plain door's successful crossing renders nothing either");
});

test("THE ASK STILL ASKS, and says everything the door said", () => {
  // asserted against the door's OWN words, read out of the generated answer,
  // so this can never drift into testing a sentence only this file believes in
  const terms = ASK.awaiting.terms;
  const sheet = crossingSheetHTML(ASK, ASK_MARK);
  assert.match(sheet, /this door has terms/);
  assert.ok(sheet.includes(esc(terms.body)), "the door's own words");
  assert.ok(sheet.includes(`<b>${esc(terms.edge)}</b>`), "the edge it forms back at you");
  assert.ok(sheet.includes(esc(terms.consequence)), "and its consequence");
  assert.match(sheet, /READING at a door, never instructions you are receiving/, "the reading law rides with it");
  assert.ok(sheet.includes(`data-enter-accept="${esc(ASK_MARK)}"`),
    "and the accept button carries the mark, which is what the click handler dispatches on");
  assert.match(sheet, /class="ctl wv-cross-cancel"/);
});

test("THE SHAPE THE HAND-WRITTEN FIXTURE MISSED: the office's real ask carries fields nobody had written down", () => {
  // Named rather than merely fixed, so the drift cannot quietly reopen. Each of
  // these is in the office's answer and was absent from the fixture that stood
  // here claiming to be that answer.
  assert.match(ASK.note, /^nothing was recorded\. Entering here means accepting the edge it forms back at you/,
    "the note's real opening — the fixture said 'Crossing this threshold means'");
  assert.equal(typeof ASK.reading_law, "string", "a top-level reading_law the fixture had never heard of");
  for (const field of ["mark", "word", "edge", "consequence", "body", "reading_law"]) {
    assert.ok(field in ASK.awaiting.terms, `the terms object carries ${field}`);
  }
  // and the ask really did write nothing: the generator's pen throws, so this
  // answer existing at all is the receipt
  assert.deepEqual(ASK.entered, [], "an ask enters nothing");
  assert.ok(!("ledger" in ASK), "and reaches no pen");
});

test("THE CHAINED ASK: a door reached from outside answers `awaiting` AND `entered` at once, and still renders the terms", () => {
  // The shape a walker in the yard actually gets. `entered` is non-empty and a
  // ledger receipt rides along, so any gate keyed on "did anything happen?"
  // would call this a crossing and re-draw the door — which is precisely the
  // truthiness family of bug this file exists for. `isTermsAsk` reads
  // `awaiting`, so it classifies correctly.
  const chained = ASKS.chained;
  assert.ok(chained.entered.length > 0, "the garden and the house were crossed on the way");
  assert.ok(chained.ledger, "and written down");
  assert.ok(chained.awaiting, "while the door itself is still asking");
  const sheet = crossingSheetHTML(chained, ASK_MARK);
  assert.match(sheet, /this door has terms/, "the terms are still what gets drawn");
  assert.ok(sheet.includes(`data-enter-accept="${esc(ASK_MARK)}"`));
});

test("the ask still works when the office sends terms as a lone object, the older shape", () => {
  const sheet = crossingSheetHTML({ entered: [], terms: { body: "older shape" } }, "a/b");
  assert.match(sheet, /this door has terms/);
  assert.match(sheet, /older shape/);
});

test("the door's other three answers are untouched", () => {
  assert.match(crossingSheetHTML({ entered: [], terms: [], refused: { because: "the mark opposes entry" } }, "a/b"),
    /refused at the door[\s\S]*the mark opposes entry/, "a refusal is the mark's own word");
  assert.match(crossingSheetHTML({ entered: [], terms: [], crossed_nothing: "no threshold left to cross" }, "a/b"),
    /the door answered, but nothing crossed[\s\S]*no threshold left/, "a fault says it is a fault");
  assert.match(crossingSheetHTML({ entered: [], terms: [], already: true }, "a/b"),
    /you are already inside/);
});

test("THE DISPATCH: accept is sent as the door's own field, and the handler reads the attribute the markup writes", () => {
  // asserted on the wiring rather than on pixels, per the brief
  assert.match(SOURCE, /crossInto\(acceptBtn\.dataset\.enterAccept, \{ accept: true, button: acceptBtn \}\)/,
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
    join(dirname(fileURLToPath(import.meta.url)), "..", "WORLD/threshold-ledger.md"), "utf8");
  const enters = ledger.split(/\r?\n/).filter((l) => /· rei · enters sable\/the-house-at-the-crooked-gate/.test(l));
  assert.ok(enters.length >= 1,
    "the record no longer holds rei's crossing into sable's house — if that is deliberate, this test is the thing to re-read");
});
