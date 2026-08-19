// ruled-grants.test.mjs — the falsifier S39's refusal earned (2026-08-18).
//
// The first box sweep (914ddc26) resurrected a stale pre-ruling copy of
// the-town/berth from a composed draft branch and silently WIDENED a
// constitutional grant: `say for: berth` lost its `for:`, and LOGOS
// (classes.md § The human class) reads an absent `for:` as RESIDENT. The
// full suite was green while a ruled actor-kind regressed — so nothing
// mechanical stood between a stale branch copy and the constitution.
//
// This file is that something. The sweep runs this suite and a red suite
// publishes nothing (settlement-auto.sh exits 1, a finding for the
// Worldkeeper's judgment) — so a recurrence now refuses instead of
// landing. The grant targets asserted here are RULED text (Keemin,
// 679e097f, the act-as-human planting); they change only by a founder's
// pen changing this file in the same act. The supersession CLASS fix —
// the sweep's replay learning that main's amendments outrank draft
// copies — is #1697's, and this guard does not pretend to be it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const markActions = (rel) => {
  const text = readFileSync(join(here, "..", rel), "utf8");
  const line = text.split("\n").find((l) => l.startsWith("actions:"));
  assert.ok(line, `${rel} carries an actions: line`);
  return JSON.parse(line.slice("actions:".length).trim());
};

test("the berth's say grant is for: berth (ruled 679e097f; regressed by sweep 914ddc26; S39 refused over it)", () => {
  const actions = markActions(
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/berth/mark.md");
  const say = actions.find((a) => a.action === "say");
  assert.ok(say, "the berth class grants say");
  assert.equal(say.for, "berth",
    "an absent for: reads as RESIDENT under LOGOS — this widening is exactly what the sweep must refuse");
});

test("the departure's pace dial is 60 (decision 008b; regressed by sweep 652fdb44, caught by Keemin's memory 08-18)", () => {
  const text = readFileSync(join(here, "..",
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-edge/departure/mark.md"), "utf8");
  const line = text.split("\n").find((l) => l.startsWith("dials:"));
  assert.ok(line, "the departure class carries a dials: line");
  assert.equal(JSON.parse(line.slice("dials:".length).trim()).pace_km_per_crossing, 60,
    "the resident stride is RULED text (008b: 5 km/h, a person's walk) — a stale copy reverting it is the #1697 class");
});

test("the human's say grant is for: human (the act-as-human fence, same ruling)", () => {
  const actions = markActions(
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/human/mark.md");
  const say = actions.find((a) => a.action === "say");
  assert.ok(say, "the human class grants say");
  assert.equal(say.for, "human");
});

test("the resident's enter and exit grants stand, residue the-town/entry (ruled 2026-08-18 — the enter/exit node planting; the door gap is L6's red, not this suite's)", () => {
  const actions = markActions(
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/entity/resident/mark.md");
  for (const verb of ["enter", "exit"]) {
    const g = actions.find((a) => a.action === verb);
    assert.ok(g, `the resident class grants ${verb}`);
    assert.equal(g.residue, "the-town/entry",
      "one residue for both verbs: exit writes the next entry, to the effective parent (the-walk's own grammar)");
  }
});

test("the exit-law slot is unsealed in scope and constitutional in custody — no sovereign jails (ruled 2026-08-18)", () => {
  const slot = readFileSync(join(here, "..",
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/postmark-node/exit-law-slot/mark.md"), "utf8");
  assert.match(slot, /value: unsealed/, "per-mark exit laws may exist (the Post Office underway)");
  assert.match(slot, /values-tier: constitution/,
    "only the town's pen bars a leaving — a resident exit law is nothing");
});
