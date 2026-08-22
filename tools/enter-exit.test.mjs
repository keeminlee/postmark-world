// thresholds.test.mjs — the crossing acts, their grammar, and the occupancy
// they derive. DEMO SLICE (step 5, jetto/enter-exit-demo).
//
// Every test here is a probe that could fail: each one names a fact that can
// only be true if the thing shipped. The ones that matter most are the two the
// wind-down ruled and could have been got wrong quietly — walk never implying
// entry, and an entity child's opposed being a REFUSAL rather than a standing
// edge with a null effect.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ENTER_EXIT_RE, DEFAULT_ENTRY_WORD, adjudicate, answerOf, containsEdges,
  demandsWord, entityChild, entryLawOf, formatEnterExit, isEntity, isMark,
  occupancyAt, occupantsOf, parseEnterExitLedger, termsAt, withinOf,
} from "./enter-exit.mjs";
import { enterExitPlan, enter, enterPrompt, enteredScope, exit, exitPrompt, withinChain } from "./world-verbs.mjs";
import { walk } from "./world-verbs.mjs";

// ── a tiny world: a ship at the quay, a wheelhouse inside her, open ground ──
const SHIP = {
  id: "the-town/the-post-office", kind: "sited", by: "the-town", tier: "constitution",
  at: { x: 160, y: -20 }, extent: { w: 9, h: 26 },
  body: "The town's own mail boat, moored at Ferry's crossing.",
  entry: { word: "welcomed", edge: "aboard", consequence: "aboard when she sails" },
};
const WHEELHOUSE = {
  id: "the-town/the-wheelhouse", kind: "sited", by: "the-town", tier: "constitution",
  at: { x: 160, y: -21 }, extent: { w: 4, h: 2 },
  body: "The postmaster's wheelhouse, charts and a brass clock.",
  entry: { word: "opposed", consequence: "the wheelhouse is the postmaster's own" },
};
const HOLD = {
  id: "the-town/the-mail-hold", kind: "sited", by: "the-town",
  at: { x: 160, y: -16 }, extent: { w: 6, h: 7 },
  body: "The hold where the sacks ride dry.",
};
const QUAY = {
  id: "the-town/the-quay-reach", kind: "sited", by: "the-town", tier: "constitution",
  at: { x: 150, y: -20 }, extent: { w: 200, h: 200 }, body: "The quay reach.",
};
const world = { marks: [QUAY, SHIP, WHEELHOUSE, HOLD], terrain: { features: [] }, heightfield: { elevationAt: () => 0, controlPoints: [] } };

const ASHORE = { x: 40, y: -20, name: "adam" };
const ONDECK = { x: 160, y: -12, name: "adam" };  // her deck: inside the ship, inside no cabin
const INHOLD = { x: 160, y: -16, name: "adam" };  // standing on the hold's floor — geometrically

// ── the grammar ─────────────────────────────────────────────────────────────

test("a crossing round-trips through its own grammar", () => {
  const line = formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 133.5421, word: "welcomed", iso: "2026-08-18T04:00:00.000Z" });
  assert.equal(line, "- 2026-08-18T04:00:00.000Z · adam · enters the-town/the-post-office · at 133.5421 · word welcomed");
  const { acts, unrecognized } = parseEnterExitLedger(line);
  assert.equal(unrecognized.length, 0);
  assert.deepEqual(acts[0], { iso: "2026-08-18T04:00:00.000Z", handle: "adam", act: "enters", mark: SHIP.id, at: 133.5421, word: "welcomed", line });
});

test("an exit carries no word — nullifying your own side needs nobody's answer", () => {
  const line = formatEnterExit({ handle: "adam", act: "exits", mark: SHIP.id, at: 133.6, iso: "2026-08-18T05:00:00.000Z" });
  assert.match(line, /exits the-town\/the-post-office · at 133\.6000$/);
  assert.equal(parseEnterExitLedger(line).acts[0].word, null);
});

test("a malformed row is unrecognized, never silently read as something else", () => {
  const { acts, unrecognized } = parseEnterExitLedger("- 2026-08-18 · adam · boards the-town/the-post-office");
  assert.equal(acts.length, 0);
  assert.equal(unrecognized.length, 1);
  assert.equal(ENTER_EXIT_RE.test("- x · adam · enters m · at 1 · word shouted"), false);
});

// ── the entry law: three keys, and silence means neutral ────────────────────

test("a silent mark answers neutral — the town's standing law, derived not stored", () => {
  assert.equal(entryLawOf(HOLD), null);
  assert.equal(answerOf(HOLD), DEFAULT_ENTRY_WORD);
  assert.equal(answerOf(HOLD), "neutral");
  assert.equal(demandsWord(HOLD), false);
  assert.equal(termsAt(HOLD), null);
});

test("a declared counter-edge is what demands the walker's explicit word", () => {
  assert.equal(demandsWord(SHIP), true);       // entry.edge: aboard
  assert.equal(demandsWord(WHEELHOUSE), false); // opposed, but no edge to accept
  assert.equal(termsAt(SHIP).consequence, "aboard when she sails");
  assert.match(termsAt(SHIP).reading_law, /text you are READING/);
});

// ── the handshake: one edge, two words ──────────────────────────────────────

test("terms unaccepted stops at the threshold and records nothing", () => {
  const verdict = adjudicate(SHIP, { accepted: false });
  assert.equal(verdict.effect, "terms");
  assert.equal(verdict.word, "welcomed");
  assert.match(verdict.because, /aboard edge back at you/);
});

test("terms accepted lands the crossing", () => {
  assert.equal(adjudicate(SHIP, { accepted: true }).effect, "entered");
});

test("an entity child opposed is REFUSED at the threshold — not a standing edge", () => {
  const verdict = adjudicate(WHEELHOUSE, { accepted: true });
  assert.equal(verdict.effect, "refused");
  assert.equal(verdict.word, "opposed");
  assert.match(verdict.because, /left standing at the door/);
});

// ── the derivation ──────────────────────────────────────────────────────────

const ROWS = (lines) => parseEnterExitLedger(lines.join("\n")).acts;

test("occupancy is a pure function of the acts and the clock", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
  ]);
  assert.deepEqual([...occupancyAt(acts, 9).keys()], []);          // before the crossing
  assert.deepEqual(occupancyAt(acts, 10).get("adam"), [SHIP.id]);
  assert.deepEqual(occupancyAt(acts, 11).get("adam"), [SHIP.id, HOLD.id]);
  assert.equal(withinOf(occupancyAt(acts, 11), "adam"), HOLD.id);
});

test("exit truncates the chain — leaving the ship leaves her hold", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "exits", mark: SHIP.id, at: 12 }),
  ]);
  assert.equal(occupancyAt(acts, 12).has("adam"), false);
  // and exiting the hold alone leaves you aboard
  const partial = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "exits", mark: HOLD.id, at: 12 }),
  ]);
  assert.deepEqual(occupancyAt(partial, 12).get("adam"), [SHIP.id]);
});

test("a refused crossing is in the record and mints no occupancy", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: WHEELHOUSE.id, at: 10, word: "opposed" })]);
  assert.equal(acts.length, 1, "the act happened — being turned away is a fact about the town");
  assert.equal(occupancyAt(acts, 10).has("adam"), false, "and it put nobody inside anything");
});

test("occupants are the manifest: aboard a cabin is aboard the ship too", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: HOLD.id, at: 11, word: "neutral" }),
    formatEnterExit({ handle: "bee", act: "enters", mark: SHIP.id, at: 11, word: "welcomed" }),
  ]);
  const occ = occupantsOf(occupancyAt(acts, 12));
  assert.deepEqual(occ.get(SHIP.id), ["adam", "bee"]);
  assert.deepEqual(occ.get(HOLD.id), ["adam"]);
});

test("the derived edges are literal `contains` with entity children (R14)", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" })]);
  const edges = containsEdges(occupancyAt(acts, 10));
  assert.deepEqual(edges, [{ class: "contains", parent: SHIP.id, child: "adam", childKind: "entity" }]);
});

// ── the hoisted guard ───────────────────────────────────────────────────────

test("isMark refuses an entity child and keeps every mark", () => {
  const child = entityChild("adam", SHIP.id);
  assert.equal(isEntity(child), true);
  assert.equal(isMark(child), false);
  assert.equal(isMark(SHIP), true);
  assert.equal(child.at, null, "an entity child has no position of its own");
  assert.equal(child.extent, null, "and no area — which is the whole reason the guard exists");
});

// ── R15: the two axes, decoupled ────────────────────────────────────────────

test("walking onto a mark's ground does NOT put you within it", () => {
  const leg = walk(ASHORE, "E", 120, world);
  const acts = [];
  const occupancy = occupancyAt(acts);
  assert.equal(occupancy.has("adam"), false, "a walk is not a crossing");
  // and the state is a real one: geometrically inside, legally outside
  const prompt = enterPrompt(ONDECK, world, { occupancy, handle: "adam" });
  assert.equal(prompt.mark, SHIP.id, "the QoL prompt is what makes the decoupling visible rather than a trap");
  assert.ok(leg.newState.x > ASHORE.x);
});

test("the exit prompt fires when you walk off the ground of a mark you are within", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" })]);
  const occupancy = occupancyAt(acts, 10);
  assert.equal(exitPrompt(ONDECK, world, { occupancy, handle: "adam" }), null);
  assert.equal(exitPrompt(ASHORE, world, { occupancy, handle: "adam" }).mark, SHIP.id);
});

// ── deep entry: a chain of crossings, each adjudicated ──────────────────────

test("enter from the shore bundles the walk and crosses each link in turn", () => {
  const plan = enterExitPlan(ASHORE, HOLD.id, world, { handle: "adam" });
  assert.deepEqual(plan.chain, [QUAY.id, SHIP.id, HOLD.id], "outermost first — the ancestry is the chain");
  assert.deepEqual(plan.walk, { to: { x: HOLD.at.x, y: HOLD.at.y }, mark: HOLD.id },
    "the walk half needs no consent, so it can never be the refused half");
});

test("a failed link strands you at THAT threshold, with everything before it standing", () => {
  const answer = enter(ASHORE, WHEELHOUSE.id, world, { handle: "adam", at: 20, accepted: true });
  assert.deepEqual(answer.entered, [QUAY.id, SHIP.id], "the links before the refusal landed");
  assert.equal(answer.stranded, WHEELHOUSE.id, "and you are left at the wheelhouse door — aboard, not ashore");
  assert.equal(answer.refused.word, "opposed");
  assert.equal(answer.rows.length, 3, "all three acts are in the record, including the refused one");
  const occupancy = occupancyAt(parseEnterExitLedger(answer.rows.join("\n")).acts, 20);
  assert.deepEqual(occupancy.get("adam"), [QUAY.id, SHIP.id], "the derivation reads the opposed word and mints nothing for it");
});

test("naming a deeper target cannot bypass an effect-bearing link", () => {
  // terms unaccepted on the ship: the hold is not reachable through her
  const answer = enter(ASHORE, HOLD.id, world, { handle: "adam", at: 20, accepted: false });
  assert.equal(answer.awaiting.mark, SHIP.id, "the boarding link asks first");
  assert.equal(answer.entered.includes(HOLD.id), false);
  assert.equal(answer.rows.some((r) => r.includes(HOLD.id)), false, "and nothing about the hold reached the record");
});

test("links already held drop out of the plan", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: QUAY.id, at: 10, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
  ]);
  const occupancy = occupancyAt(acts, 10);
  const plan = enterExitPlan(INHOLD, HOLD.id, world, { occupancy, handle: "adam" });
  assert.deepEqual(plan.links, [HOLD.id], "a walker aboard asks only for the door he is standing at");
  assert.equal(plan.walk, null, "and standing on its floor already, he needs no walk to reach it");
});

// ── exit ────────────────────────────────────────────────────────────────────

test("exit answers with the scope it restores to", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: QUAY.id, at: 10, word: "neutral" }),
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
  ]);
  const answer = exit(SHIP.id, world, { occupancy: occupancyAt(acts, 10), handle: "adam", at: 11 });
  assert.deepEqual(answer.within, [QUAY.id]);
  assert.equal(answer.into, QUAY.id, "the enclosing scope the view restores to");
});

test("exiting somewhere you are not within refuses with a reason", () => {
  const answer = exit(SHIP.id, world, { occupancy: new Map(), handle: "adam", at: 11 });
  assert.match(answer.error, /nothing to step out of/);
});

// ── the scoped read: the mark becomes the place ─────────────────────────────

test("the entered scope renders the mark's read, its children, and its occupants", () => {
  const acts = ROWS([
    formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
    formatEnterExit({ handle: "bee", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" }),
  ]);
  const scope = enteredScope(SHIP.id, world, { occupancy: occupancyAt(acts, 10) });
  assert.match(scope.chrome, /^You are in: The town's own mail boat/);
  assert.equal(scope.read, SHIP.body);
  assert.deepEqual(scope.occupants, ["adam", "bee"]);
  assert.deepEqual(scope.children.filter((c) => c.kind === "entity").map((c) => c.id), ["adam", "bee"],
    "fellow occupants render for free — the manifest IS children");
  assert.ok(scope.children.some((c) => c.id === WHEELHOUSE.id), "and the mark children are there too");
  assert.equal(scope.marks.every(isMark), true, "the area-reading list is guarded");
  assert.equal(scope.enclosing.id, QUAY.id, "and exit restores to what encloses this");
});

test("the legal chain and the geometric one are allowed to disagree", () => {
  const acts = ROWS([formatEnterExit({ handle: "adam", act: "enters", mark: SHIP.id, at: 10, word: "welcomed" })]);
  const legal = withinChain(world, { occupancy: occupancyAt(acts, 10), handle: "adam" });
  assert.deepEqual(legal.map((w) => w.id), [SHIP.id], "he crossed one threshold");
  // his body, meanwhile, is ashore: he walked off after boarding (v0 does not stop him)
  assert.equal(exitPrompt(ASHORE, world, { occupancy: occupancyAt(acts, 10), handle: "adam" }).mark, SHIP.id);
});
