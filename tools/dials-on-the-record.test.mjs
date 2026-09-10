#!/usr/bin/env node
// dials-on-the-record.test.mjs — the two rulings of 2026-08-22, asserted
// against the FOLDED WORLD, not a fixture.
//
// WHY THE LIVE FOLD AND NOT A FIXTURE. The slow-walk bug (PSA 2026-08-22) was
// not a wrong formula: every unit test passed while every walker in the world
// moved at a quarter of the lawful stride for five days, because the reader
// asked for a class named `departure` that had been renamed to `depart` and a
// fixture happily answered to whichever name the fixture itself used. A test
// that builds its own record can only ever prove the code agrees with the test.
// So these read WORLD/world-state.json — what a clone actually folds — and a
// dial that is renamed, re-parented, or dropped goes red here.
//
// Run: node --test tools/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8"));
const marks = Array.isArray(state.marks) ? state.marks : Object.values(state.marks ?? {});
const byId = new Map(marks.map((m) => [m.id, m]));

// ── RULING B, verbatim (Keemin, 2026-08-22) ─────────────────────────────────
// "let's update those dials for 'say'... make everything pull the actual
// numbers from there too. I think the predicates should be under the say edge
// rather than the residue, as we may rule future sounds differently."
const SAY_DIALS = {
  earshot_m: 60,
  fade_min: 5,
  conversation_lull_min: 30,
  speak_every_s: 15,
  text_max: 500,
  hear_max: 20,
  presence_min: 15,
};

// ── RULING A, verbatim (Keemin, 2026-08-22) ─────────────────────────────────
// "change doorstep s.t. residents get all PSAs made in the last week (up to 5)
// as actual text? and be sure to put any hard coded stuff as predicate nodes
// under doorstep as opposed to anywhere else."
const DOORSTEP_DIALS = { psa_window_days: 7, psa_max: 5 };

function dialsUnder(parentId) {
  return marks.filter((m) => m.kind === "predicated" && m.parent === parentId);
}

test("ruling B: every number of speech stands as a predicate under the SAY EDGE — not the sound residue", () => {
  const under = dialsUnder("the-town/say");
  const bySlot = new Map(under.map((m) => [m.slot, m]));
  for (const [slot, want] of Object.entries(SAY_DIALS)) {
    const m = bySlot.get(slot);
    assert.ok(m, `the-town/say carries no predicate for "${slot}" — the ruling puts the numbers of speech under the say edge`);
    assert.equal(Number(m.value), want, `${slot} folded as ${m.value}, expected ${want}`);
    assert.equal(m.by, "the-town", `${slot} must be the town's own declaration`);
    assert.equal(m.tier, "constitution", `${slot} is law, not market furniture`);
  }
  // and the residue is NOT where they live — "we may rule future sounds
  // differently" is the ruling's own reason, so a dial that drifts onto
  // the-town/sound has lost the distinction the founder asked for.
  const onResidue = dialsUnder("the-town/sound").filter((m) => Object.hasOwn(SAY_DIALS, m.slot));
  assert.deepEqual(onResidue.map((m) => m.slot), [],
    "speech's dials must not stand on the sound residue — the ruling puts them on the say edge");
});

test("ruling A: the doorstep's own two numbers stand as predicates under doorstep, and nowhere else", () => {
  const bySlot = new Map(dialsUnder("the-town/doorstep").map((m) => [m.slot, m]));
  for (const [slot, want] of Object.entries(DOORSTEP_DIALS)) {
    const m = bySlot.get(slot);
    assert.ok(m, `the-town/doorstep carries no predicate for "${slot}" — "put any hard coded stuff as predicate nodes under doorstep"`);
    assert.equal(Number(m.value), want, `${slot} folded as ${m.value}, expected ${want}`);
  }
  // "as opposed to anywhere else": no other parent in the whole world may
  // carry these slugs, or the number has two homes and the ruling is undone.
  const elsewhere = marks.filter((m) => m.kind === "predicated"
    && Object.hasOwn(DOORSTEP_DIALS, m.slot) && m.parent !== "the-town/doorstep");
  assert.deepEqual(elsewhere.map((m) => `${m.slot} under ${m.parent}`), [],
    "a doorstep dial has taken a second home — the ruling says under doorstep as opposed to anywhere else");
});

test("the dials carry their claim: every one is a readable sentence, none is a bare number", () => {
  const all = [...dialsUnder("the-town/say"), ...dialsUnder("the-town/doorstep")]
    .filter((m) => Object.hasOwn(SAY_DIALS, m.slot) || Object.hasOwn(DOORSTEP_DIALS, m.slot));
  assert.equal(all.length, Object.keys(SAY_DIALS).length + Object.keys(DOORSTEP_DIALS).length);
  for (const m of all) {
    assert.ok(String(m.body ?? "").trim().length > 20,
      `${m.id} states no claim — a dial nobody can read is a constant with extra steps`);
    assert.ok(String(m.body).length <= 150, `${m.id} breaks the one-claim cap`);
  }
});

test("the two clocks stay two: hearing and the record's grouping are different dials", () => {
  const bySlot = new Map(dialsUnder("the-town/say").map((m) => [m.slot, m]));
  const fade = Number(bySlot.get("fade_min")?.value);
  const lull = Number(bySlot.get("conversation_lull_min")?.value);
  assert.ok(Number.isFinite(fade) && Number.isFinite(lull), "both clocks must stand on the record");
  assert.notEqual(fade, lull,
    "fade_min is HEARING and conversation_lull_min is the RECORD's grouping — collapsing them shatters a long party into serial threads (the maiden crossing, 2026-08-08)");
  assert.ok(lull > fade, "the record's grouping tolerates a lull the hearing clock does not");
  // the clause itself stands as a node, under its own name (the lint refused a
  // second `the-two-clocks`: that slug is state-and-time.md's written/settled pair)
  assert.ok(byId.has("the-town/the-hearing-and-the-record"),
    "the two-clocks clause must stand as its own predicate on the say edge");
});
