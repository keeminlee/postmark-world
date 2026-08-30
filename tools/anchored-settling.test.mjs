#!/usr/bin/env node
// anchored-settling.test.mjs — the two settle predicates, held against the law
// the town actually runs on.
//
// WHY THIS FILE EXISTS. Both of these marks were BACKWARDS for six days and
// nothing could see it. `come-ashore-trigger` promised "a button, never
// automatic"; `co-sign-guard` promised "no berth comes ashore without its
// human's hand beside it". The founder's tier line of 2026-08-24 had already
// made settling automatic at the crossing and made the co-sign one of TWO
// anchors, and the engine had enforced exactly that ever since. These are the
// two marks an arriving household reads FIRST — the admission path — so being
// backwards here is worse than being backwards anywhere else in the Works.
//
// What went undetected was not a number but a DIRECTION, which is why the
// assertions below are about the shape of the claim (automatic vs. chosen; a
// disjunction vs. a single gate) and not about a literal.
//
// These read MARK FILES, never the store — reached-grants.test.mjs's rule, and
// for its reason: "The record is the law; a store is a projection of it, and a
// falsifier that reads the projection cannot tell you the law changed — only
// that the copy did." It matters twice over here, because the settle marks are
// law the OFFICE implements and the world's fold is not in the loop at all.
//
// THE LAW, verbatim. The founder's tier line, 2026-08-24, quoted at office
// src/town-journal.mjs:181-182 and again at src/town-drain.mjs:105-106:
//
//   "full automation for both berth and joins (on our side, their side still
//    needs a GitHub auth or co-sign)"
//
// compiled at office src/town-journal.mjs:192:
//
//   export const rowIsSettleable = (row) => Boolean(row?.ghId || row?.cosignedGhId);
//
// and said to the arriving household in the door's own words,
// office src/declare.mjs:388-389:
//
//   "Automatic at the ferry's next crossing once your household is ANCHORED —
//    a verified GitHub id, or your human co-signing."
//   "This door never settles anyone — the crossing does."
//
// Run: node --test tools/anchored-settling.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const WORKS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works";
const SETTLE = `${WORKS}/postmark-edge/settle`;

const read = (rel) => readFileSync(join(here, "..", rel), "utf8");
const scalar = (rel, name) => {
  const line = read(rel).split("\n").find((l) => l.startsWith(`${name}:`));
  assert.ok(line, `${rel} carries a ${name}: line`);
  return line.slice(name.length + 1).trim();
};
const body = (rel) => {
  const t = read(rel);
  const end = t.indexOf("\n---", 3);
  assert.ok(end > 0, `${rel} has closing frontmatter`);
  return t.slice(t.indexOf("\n", end + 1) + 1).trim();
};

const TRIGGER = `${SETTLE}/come-ashore-trigger/mark.md`;
const GUARD = `${SETTLE}/co-sign-guard/mark.md`;

test("the trigger is the CROSSING, not the berth's own hand", () => {
  // src/declare.mjs:389, verbatim: "This door never settles anyone — the
  // crossing does." No berth act stands between an anchored row and the shore;
  // the auto-settle loop is src/town-drain.mjs and reads no berth click.
  const value = scalar(TRIGGER, "value");
  const text = `${value}\n${body(TRIGGER)}`;

  assert.match(text, /\bautomatic\b/i,
    "the trigger must say settling is automatic — the crossing settles, not the berth");
  assert.doesNotMatch(text, /never automatic|a button/i,
    'the repealed trigger promised "the berth\'s own act — a button, never automatic"; the tier line of 2026-08-24 removed the click');
  assert.match(text, /crossing/i,
    "and it must name WHAT settles it: the ferry's next crossing");
});

test("the guard is the ANCHOR, and a co-sign is one of its TWO forms", () => {
  // src/town-journal.mjs:192, verbatim:
  //   export const rowIsSettleable = (row) => Boolean(row?.ghId || row?.cosignedGhId);
  // A verified GitHub id ALONE settles a berth. A guard stated as
  // "co-signed = true" claims a human-consent requirement the town does not
  // enforce — the one direction a consent claim must never drift.
  const value = scalar(GUARD, "value");
  const text = `${value}\n${body(GUARD)}`;

  assert.match(value, /\bor\b/i,
    "the guard is a DISJUNCTION — `rowIsSettleable` is `ghId || cosignedGhId`, so its value must join two anchors with an or");
  assert.match(text, /github|verified id|verified identity/i,
    "the first anchor is a verified GitHub id, and the guard must name it");
  assert.match(text, /co-sign/i, "the second anchor is a human's co-sign");
  assert.doesNotMatch(text, /no berth comes ashore without its human/i,
    "the repealed guard overstated the town's consent requirement by naming one anchor as the only one");
  assert.doesNotMatch(value, /^co-signed = true$/,
    'the guard is not "co-signed = true" — that is the state the audit found backwards');
});

test("nothing settles UNANCHORED, which is the half the disjunction must keep", () => {
  // The disjunction widened the gate; it did not open it. `rowIsSettleable`
  // returns false when both anchors are absent, and src/town-drain.mjs leaves
  // that row waiting rather than refusing it. The marks must not read as
  // "settling is unconditional" now that the co-sign alone no longer gates it.
  const text = `${scalar(GUARD, "value")}\n${body(GUARD)}\n${body(TRIGGER)}`;
  assert.match(text, /anchor/i,
    "the anchor is the precondition and both marks now turn on it — a settle law that names no precondition has lost the thing the co-sign was protecting");
});

test("both marks are the town's own constitutional law, and say when they were amended", () => {
  for (const rel of [TRIGGER, GUARD]) {
    assert.equal(scalar(rel, "by"), "the-town", `${rel} is the town's declaration`);
    assert.equal(scalar(rel, "tier"), "constitution", `${rel} is law, not furniture`);
    assert.equal(scalar(rel, "kind"), "predicated", `${rel} is a predicate on the settle edge`);
    // The correction is dated. A mark that silently acquires the right words
    // loses the receipt for when it was wrong, and these were wrong for six days.
    assert.equal(scalar(rel, "date"), "2026-08-30", `${rel} carries the date of the amendment`);
  }
});
