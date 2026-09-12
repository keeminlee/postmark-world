// walk-there-and-enter.test.mjs — the enter button's refusal-from-afar grows the
// walk the door already knows how to take (founder-agreed 2026-09-11).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { walkThereOffer, walkThereSheetHTML } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");

test("A REFUSAL FROM AFAR IS AN OFFER — from the body's own walk first, from the door's sentence when the body has none, never from any other refusal", () => {
  const withWalk = { error: "bounce", defect: "you are not at that door — x stands ~340 m from where you stand", walk: { to: { x: 563, y: -294.5 }, mark: "illuminator/the-looking-room-parcel" } };
  assert.deepEqual(walkThereOffer(409, withWalk, "whatever/the-page-named"), { mark: "illuminator/the-looking-room-parcel", to: { x: 563, y: -294.5 } }, "the office's plan names the mark; the page defers to it");
  const sentenceOnly = { error: "bounce", defect: "you are not at that door — a/b stands ~40 m from where you stand" };
  assert.deepEqual(walkThereOffer(409, sentenceOnly, "a/b"), { mark: "a/b", to: null }, "today's office sends no walk in the 409: the sentence is recognised");
  assert.deepEqual(walkThereOffer(409, { error: "bounce", defect: "a door is entered from its threshold — walk to (1, 2) and knock again" }, "a/b"), { mark: "a/b", to: null }, "and the renamed sentence too");
  assert.equal(walkThereOffer(409, { error: "bounce", defect: "you are within x — this walk would carry you out" }, "a/b"), null, "another 409 is not a walk offer");
  assert.equal(walkThereOffer(422, sentenceOnly, "a/b"), null, "and neither is any other status");
  assert.equal(walkThereOffer(409, sentenceOnly, ""), null, "no mark named, nothing to walk to");
  const sheet = walkThereSheetHTML({ mark: "a/b", to: null }, "you are not at that door");
  assert.match(sheet, /<button type="button" class="ctl wv-walk-enter" data-walk-enter="a\/b">walk there and enter<\/button>/);
  assert.match(sheet, /wv-cross-cancel">stay here/);
  // ⚑ THE FLIP: make walkThereOffer ignore `body.walk` → the first line reds.
});

test("THE PAGE WIRES IT — crossInto offers on the refusal, the delegate sends the walk with entry on arrival, and nothing else about entering changed", () => {
  assert.match(SOURCE, /const offer = answer\.error === "bounce" \? walkThereOffer\(response\?\.status, answer, markId\) : null;/, "crossInto asks the pure rule");
  assert.match(SOURCE, /apexAct\("walk", \{ mark_id: markId, enter_on_arrival: true, \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/, "one act: the walk door, entry on arrival, the walker's word only when asked");
  assert.match(SOURCE, /closest\("\[data-walk-enter\]"\)/, "the root delegate reads the button");
  assert.match(SOURCE, /closest\("\[data-walk-enter-accept\]"\)/, "and the terms accept for a walk");
  assert.match(SOURCE, /apexAct\("enter", \{ mark: markId, \.\.\.\(accept \? \{ accept: true \} : \{\}\) \}\)/, "the enter act is untouched");
  // ⚑ THE FLIP: drop the `[data-walk-enter]` branch from the delegate → the third line reds.
});
