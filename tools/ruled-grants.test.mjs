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
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/berth/mark.md");
  const say = actions.find((a) => a.action === "say");
  assert.ok(say, "the berth class grants say");
  assert.equal(say.for, "berth",
    "an absent for: reads as RESIDENT under LOGOS — this widening is exactly what the sweep must refuse");
});

test("the human's say grant is for: human (the act-as-human fence, same ruling)", () => {
  const actions = markActions(
    "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works/household/human/mark.md");
  const say = actions.find((a) => a.action === "say");
  assert.ok(say, "the human class grants say");
  assert.equal(say.for, "human");
});
