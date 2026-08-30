#!/usr/bin/env node
// stance-dials.test.mjs — the stance verb's two standing numbers, declared.
//
// WHY THIS FILE EXISTS. `declare-stance-on` carried `dials: {}` and no dial
// children while the live door ran on two constants no node declared —
// postmark-office src/world-stance.mjs:91 `AMBIENT_CAP = 3` and :93
// `PAGE_SIZE = 20`, consumed at :336-337 (the doorstep's ambient block) and
// :359-363 / :408 (the shadow read's page). The class IS dispatched —
// `ACTION_STANCE` at :86, `declareStanceViaOffice` at :457, imported by the
// door at src/world-apex.mjs:74 — so these are live constitutional numbers that
// were owned by nothing.
//
// Against `the-town/the-owned-constants`, verbatim:
//
//   "Every constant in the machinery is owned by a dial or a law — an orphan
//    number is a rule nobody declared."
//
// L3 could not catch it: its watch list was CLOSED to three constants and said
// so in its own limits string. Widening L3 is the office-side half of this fix;
// this is the world-side half, and it is the half that has to come first,
// because a lint that checks code against dials needs the dials to exist.
//
// THE FILING. These are `kind: predicated` children nested under the class they
// describe — the `say` pattern (earshot-m, hear-max, …), and the shape
// LOGOS/classes.md § the seam requires: "Every dial is a predicate (the
// founder's convention word, same review): a number the law carries rides a
// predicate child, never a frontmatter JSON". Nesting survives the freeze: a
// predicated mark "is its parent CONTINUED … that nesting is AUTHORSHIP — 'this
// describes that' — not a claim about ground" (tools/mark-lint.mjs, gate B).
//
// Reads MARK FILES, never the store, for reached-grants.test.mjs's reason and
// one more: these marks are newer than the last fold, so the store has not seen
// them and a store-reading falsifier would report their absence as their state.
//
// Run: node --test tools/stance-dials.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const WORKS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works";
const STANCE = `${WORKS}/postmark-edge/declare-stance-on`;

const at = (rel) => join(here, "..", rel);
const read = (rel) => readFileSync(at(rel), "utf8");
const scalar = (rel, name) => {
  const line = read(rel).split("\n").find((l) => l.startsWith(`${name}:`));
  assert.ok(line, `${rel} carries a ${name}: line`);
  return line.slice(name.length + 1).trim();
};
const body = (rel) => {
  const t = read(rel);
  const end = t.indexOf("\n---", 3);
  return t.slice(t.indexOf("\n", end + 1) + 1).trim();
};

// slot -> the office constant it declares, and the value that constant holds.
// Copied here ONCE, beside the assertion, exactly as STRIDE_CLASS_NAME is kept
// beside departurePace — and the office-side L3 is what holds this table to the
// code. A world repo cannot import office src/, so this pair is the seam, and
// naming it as a seam is better than pretending the number has one home when
// the two repos each need to say it.
const DIALS = {
  ambient_cap: { dir: "ambient-cap", value: 3, constant: "AMBIENT_CAP" },
  page_size: { dir: "page-size", value: 20, constant: "PAGE_SIZE" },
};

test("the stance verb declares both of its standing numbers as predicate children", () => {
  for (const [slot, { dir, value, constant }] of Object.entries(DIALS)) {
    const rel = `${STANCE}/${dir}/mark.md`;
    assert.ok(existsSync(at(rel)),
      `${slot} has no node — src/world-stance.mjs runs on ${constant} and "an orphan number is a rule nobody declared"`);
    assert.equal(scalar(rel, "kind"), "predicated",
      `${slot} is a dial, and "a number the law carries rides a predicate child, never a frontmatter JSON"`);
    assert.equal(Number(scalar(rel, "value")), value,
      `${slot} must equal the constant the door actually runs on (${constant} = ${value}, src/world-stance.mjs)`);
    assert.equal(scalar(rel, "by"), "the-town", `${slot} is the town's own declaration`);
    assert.equal(scalar(rel, "tier"), "constitution", `${slot} is law, not furniture`);
    assert.equal(scalar(rel, "slot"), slot, `${slot}'s slot name is what a reader would ask for`);
  }
});

test("each dial carries its claim — a dial nobody can read is a constant with extra steps", () => {
  // dials-on-the-record.test.mjs's standard for the say and doorstep dials,
  // applied to these: a readable sentence, and inside the one-claim cap.
  for (const { dir } of Object.values(DIALS)) {
    const b = body(`${STANCE}/${dir}/mark.md`);
    assert.ok(b.length > 20, `${dir} states no claim`);
    assert.ok([...b].length <= 150, `${dir} breaks the one-claim cap (the-town/the-one-claim)`);
  }
});

test("the numbers have ONE home: the class frontmatter does not restate them", () => {
  // The failure mode F5 found on the walk pace — three declarations, one read.
  // Having just planted these, the cheapest way to acquire that bug is to also
  // write them into `dials:` on the class node.
  const cls = read(`${STANCE}/mark.md`);
  const line = cls.split("\n").find((l) => l.startsWith("dials:"));
  assert.ok(line, "the class carries a dials: line");
  const dials = JSON.parse(line.slice("dials:".length).trim());
  for (const slot of Object.keys(DIALS))
    assert.equal(dials[slot], undefined,
      `${slot} is restated in the class's frontmatter — the dial children are its home, and a second copy is the walk-pace bug again`);
});
