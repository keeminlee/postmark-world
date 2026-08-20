// proposed-settlement.test.mjs — the door predicts, and says so in grey.
//                                        node --test tools/proposed-settlement.test.mjs
//
// THE LAW THIS READS (nodes-first, R29 — cite by id, never paraphrase):
//   the-town/the-forecast    a forecast is a reading of the next save, run through
//                            the judgment that will make it — derived at the asking,
//                            never stored, never canon.   (logos/the-forecast)
//   the-town/the-save        the past reads from the newest save and is never
//                            re-judged.                    (logos/the-save)
//   the-town/the-tenses      settled past, declared present, undeclared future —
//                            tense is read against the standpoint's settlement.
//                                                          (logos/the-tenses)
//   the-town/the-disclosure  an answer given without its inputs must never wear the
//                            grammar of an answer that had them. (logos/the-disclosure)
//
// WHAT IS BEING GUARDED. Between crossings the chip shows the last save's ✦ while
// the ledger has moved on. The surface already said something about that gap, and
// what it said was RAW ESCROW under a ✦ glyph — "✦ 9 is staked on it now". That
// number is not a ✦weight and never lands: the save adds the breadth bonus and
// everything fanning up. Two quantities under one glyph is the exact confusion
// `ledger_weight` was renamed to stop (world-stake.mjs, 2026-08-10). So the line
// now carries the FORECAST — the office folds the current pending book through
// marks-fold.mjs, the same judgment the crossing runs — and the viewer only ever
// renders a number somebody else derived.
//
// THE QUIET RULE (Keemin, 2026-08-18, verbatim): "try not to bloat/clutter the UI
// as much as possible." A mark with no pending delta renders EXACTLY as it does
// today — not an empty section, not a "nothing pending" line, nothing. That is
// asserted here byte-for-byte against a string captured from main, so a future
// helpful addition goes red by name.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stakeBackersHTML } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORECAST_MARK = join(ROOT, "WORLD/marks/let-there-be-light/logos/the-forecast/mark.md");

const settled = {
  weight: 108,
  weightParts: {
    own_escrow: 8,
    breadth: { k: 5, external_households: 2, bonus: 10 },
    fanned: [{ id: "vermillion/the-pando-peak", weight: 90 }],
  },
  holders: [{ holder: "vermillion", amount: 5 }, { holder: "gael-renton", amount: 3 }],
};

// Captured from main's own stakeBackersHTML before this branch touched it. The
// no-delta rendering must not move by one byte.
// THE GOLDEN, RE-CUT 2026-08-20 for the two-block pane. The old one interleaved
// a LIVE holder list with the LAST SETTLEMENT's arithmetic in one column, and the
// founder read the result as the surface contradicting itself — "no one yet"
// directly above "1 other household backing it". Both were true; they are
// different books. They are now two blocks with their tenses named.
//
// What this constant is FOR is unchanged and is the reason it is spelled out
// rather than generated: the quiet rule below asserts that a mark with nothing
// pending renders byte for byte as it did before the forecast existed. That
// claim needs a literal to be worth anything.
const MAIN_NO_DELTA =
  '<b>✦ 108</b><div class="wv-backer-head">backing it now</div>'
  + '<div class="wv-backer is-holder"><span>vermillion</span><span class="amount">✦ 5</span></div>'
  + '<div class="wv-backer is-holder"><span>gael-renton</span><span class="amount">✦ 3</span></div>'
  + '<div class="wv-backer-head">what the ✦ is made of<span class="wv-quiet"> · at the last Settlement</span></div>'
  + '<div class="wv-backer"><span>staked on it</span><span class="amount">✦ 8</span></div>'
  + '<div class="wv-backer"><span>spread across 2 households</span><span class="amount">✦ 10</span></div>'
  + '<div class="wv-backer"><span>1 mark inside it</span><span class="amount">✦ 90</span></div>';

// ── the law is planted, and the code answers to it ──────────────────────────
test("the forecast law stands as a node, and says a forecast is derived and never stored", () => {
  const text = readFileSync(FORECAST_MARK, "utf8");
  assert.match(text, /^by: the-town$/m, "the constitution is the town's own hand");
  assert.match(text, /^tier: constitution$/m);
  assert.match(text, /^slot: forecast$/m);
  const body = text.split(/---\r?\n/).at(-1).trim();
  assert.ok(body.length <= 150, `the-town/the-one-claim caps a body at 150; this is ${body.length}`);
  assert.match(body, /never stored/, "the clause the read path relies on");
  assert.match(body, /judgment that will make it/, "the one-derivation half of the law");
});

// ── the forecast renders, in grey, with one chip ────────────────────────────
test("a pending delta renders the PROPOSED weight, not the raw escrow", () => {
  // The trap this pins. Raw escrow here is 9; the save will land 9 + breadth 10
  // + 90 fanning up = ✦109. A surface that prints the ledger number tells the
  // resident their stake is worth 9 when the crossing will say 109.
  const html = stakeBackersHTML({ ...settled, proposed: { weight: 109, at: "2026-08-18T17:45:00.000Z" } });
  assert.match(html, /✦ 109/, "the proposed figure is what the next save will land");
  assert.doesNotMatch(html, /✦ 9\b/, "the raw ledger number is never printed as a ✦weight");
  assert.match(html, /at the next Settlement/);
});

test("the forecast is drafts-grey and carries exactly one next-crossing chip", () => {
  const html = stakeBackersHTML({ ...settled, proposed: { weight: 109, at: "2026-08-18T17:45:00.000Z" } });
  const pending = html.match(/<div class="wv-backer-pending[^"]*">[\s\S]*?<\/div>\s*$/)?.[0] ?? "";
  assert.ok(pending, "the forecast rides the existing pending slot");
  assert.match(pending, /is-draft/, "grey is the drafts grammar the viewer already speaks");
  assert.equal((html.match(/wv-chip/g) ?? []).length, 1, "one chip, not a dashboard");
  assert.match(html, /17:45Z/, "the next save's time is known, so the chip names it");
});

test("ZERO NEW PANELS: the forecast adds no container the no-delta render lacks", () => {
  const quiet = stakeBackersHTML(settled);
  const loud = stakeBackersHTML({ ...settled, proposed: { weight: 109, at: "2026-08-18T17:45:00.000Z" } });
  const tags = (html) => [...html.matchAll(/<(\w+)[^>]*class="([^"]*)"/g)].map((m) => `${m[1]}.${m[2].split(" ")[0]}`);
  const added = [...new Set(tags(loud))].filter((t) => !new Set(tags(quiet)).has(t));
  assert.deepEqual(added, ["div.wv-backer-pending", "span.wv-chip"],
    "the forecast may extend the existing pending line and add one chip — nothing else");
});

// ── the quiet rule ──────────────────────────────────────────────────────────
test("NO pending delta renders byte-for-byte as main did — nothing added, not even an empty state", () => {
  assert.equal(stakeBackersHTML(settled), MAIN_NO_DELTA);
  assert.equal(stakeBackersHTML({ ...settled, proposed: null }), MAIN_NO_DELTA);
  // NARROWED: the breakdown heading now names its own tense ("at the last
  // Settlement"), so a bare /Settlement/ no longer distinguishes the pending
  // line. The pending line is what the quiet rule was ever about.
  assert.doesNotMatch(stakeBackersHTML(settled), /next Settlement|wv-backer-pending|wv-chip/,
    "silence is the whole feature where there is nothing to say");
});

test("a forecast EQUAL to the settled figure is not a delta, and says nothing", () => {
  const html = stakeBackersHTML({ ...settled, proposed: { weight: 108, at: "2026-08-18T17:45:00.000Z" } });
  assert.equal(html, MAIN_NO_DELTA, "predicting no change is not news");
});

// ── disclosure ──────────────────────────────────────────────────────────────
test("an unreadable engine names its refusal and never fabricates a number", () => {
  // the-town/the-disclosure: refuse or disclose absent inputs; never quietly
  // substitute. Rendering nothing here would be indistinguishable from "your
  // stake already settled" — the stale-✦-as-refusal misreading this line exists
  // to prevent — so the one case that earns extra words is the broken one.
  const html = stakeBackersHTML({ ...settled, proposed: { unavailable: "the world record could not be read" } });
  assert.match(html, /the next Settlement cannot be read/);
  assert.match(html, /the world record could not be read/, "the reason travels with the refusal");
  assert.doesNotMatch(html, /at the next Settlement/, "a refusal never wears a forecast's grammar");
  // Scoped to the pending line: the settled headline is ✦ 108 and stays, so a
  // whole-document assertion here would have failed for a reason unrelated to
  // the claim — and passed later for one too.
  const pending = html.match(/<div class="wv-backer-pending[^"]*">[\s\S]*?<\/div>\s*$/)?.[0] ?? "";
  assert.ok(pending, "the refusal rides the same one slot");
  assert.doesNotMatch(pending, /✦/, "no number is invented for an answer that had no inputs");
});
