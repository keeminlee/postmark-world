// viewer-occupancy.test.mjs — the crossings, as the VIEWER reads them.
//
// tools/thresholds.test.mjs already proves the derivation. This file proves the
// half that was missing until now: that the viewer asks it the right question,
// with the right words, at the right clock, and says the answer out loud.
//
// Every test is a probe that could fail. The two that matter most are the two
// that were live traps rather than hypotheticals:
//   · STANDING IS NOT ENTERING (R15) — the viewer already had a `within`, and it
//     is the geometric one. A readout that quietly reused it would look right on
//     every screenshot and be wrong about the whole feature.
//   · THE CLOCK — the viewer's crossing dial is FLOORED, the ledger stamps
//     FRACTIONAL. Folding at the floor hides every crossing made since the last
//     12-hour boundary. The real ledger's one act is the fixture that catches it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { occupancyChipHTML, occupancyDevLine, standpointOccupancy, SPECTATOR_ACTOR } from "../spectator/viewer.mjs";
import { parseThresholdLedger } from "./thresholds.mjs";
import { fractionalCrossing } from "./walk.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// THE LIVE FIXTURE: the town's own record, not a mock. wright's crossing into
// the-town-centre is on main, so these tests read the same bytes the page does.
// If the ledger's grammar ever changes under the viewer, this file fails first.
const LEDGER = readFileSync(join(ROOT, "WORLD/threshold-ledger.md"), "utf8");
const REAL = parseThresholdLedger(LEDGER);
const WRIGHT_CROSSING = REAL.acts.find((a) => a.handle === "wright" && a.act === "enters");

test("the real ledger parses clean — the fixture these tests stand on is the record", () => {
  assert.equal(REAL.unrecognized.length, 0, "the town's own ledger must not read as malformed");
  assert.ok(WRIGHT_CROSSING, "wright's crossing is the standing fixture; without it the rest proves nothing");
  assert.equal(WRIGHT_CROSSING.mark, "the-town/the-town-centre");
});

test("the viewer derives wright's entered-stack from the real record", () => {
  const at = fractionalCrossing();
  const { entered, insideOf, alongside } = standpointOccupancy({ acts: REAL.acts, at, handle: "wright" });
  assert.deepEqual(entered, ["the-town/the-town-centre"]);
  assert.equal(insideOf, "the-town/the-town-centre");
  assert.deepEqual(alongside, [], "nobody else has crossed in yet, and the readout must not invent company");
});

test("who is in this room — occupantsOf reaches the viewer as the manifest", () => {
  const { manifest } = standpointOccupancy({ acts: REAL.acts, at: fractionalCrossing() });
  assert.deepEqual([...manifest.get("the-town/the-town-centre")], ["wright"]);
});

// ── the falsifier ───────────────────────────────────────────────────────────
//
// The probe that could only pass if the derivation is live: append an EXIT to a
// copy of the real ledger text and the readout must empty. If this test passes
// while the entered-stack is hardcoded, mocked, or read off geometry, it fails.
test("FALSIFIER: an exit appended to the ledger empties the readout", () => {
  const exited = LEDGER + `- 2026-08-20T02:00:00.000Z · wright · exits the-town/the-town-centre · at ${(WRIGHT_CROSSING.at + 0.01).toFixed(4)}\n`;
  const { acts, unrecognized } = parseThresholdLedger(exited);
  assert.equal(unrecognized.length, 0);
  const at = fractionalCrossing();
  const after = standpointOccupancy({ acts, at, handle: "wright" });
  assert.deepEqual(after.entered, [], "after the exit wright is inside nothing");
  assert.equal(after.insideOf, null);
  assert.equal(after.manifest.size, 0, "and the room is empty — nobody is inside anything");
  assert.equal(occupancyChipHTML(after), "", "and the chip is absent rather than empty");

  // and the same acts BEFORE the exit's clock still hold him inside: the exit is
  // an act in time, not a retraction of history
  const before = standpointOccupancy({ acts, at: WRIGHT_CROSSING.at, handle: "wright" });
  assert.deepEqual(before.entered, ["the-town/the-town-centre"]);
});

// ── the clock ───────────────────────────────────────────────────────────────
test("THE FLOORED CLOCK HIDES THE CROSSING — the fold must be asked fractionally", () => {
  const fractional = WRIGHT_CROSSING.at + 0.001;
  const floored = Math.floor(fractional);
  assert.notEqual(floored, fractional, "the fixture must straddle a boundary or this proves nothing");
  assert.deepEqual(
    standpointOccupancy({ acts: REAL.acts, at: fractional, handle: "wright" }).entered,
    ["the-town/the-town-centre"]);
  assert.deepEqual(
    standpointOccupancy({ acts: REAL.acts, at: floored, handle: "wright" }).entered,
    [], "at the floored dial the act has not happened yet — which is why the viewer never asks at it");
});

test("time-travel to before the crossing reports the truth of that instant", () => {
  const { entered, manifest } = standpointOccupancy({ acts: REAL.acts, at: WRIGHT_CROSSING.at - 1, handle: "wright" });
  assert.deepEqual(entered, []);
  assert.equal(manifest.size, 0);
});

// ── standing is not entering (R15) ──────────────────────────────────────────
test("a walker standing on a mark's ground has entered nothing — only a crossing fills the stack", () => {
  // no acts at all is exactly the state of every resident who has only ever
  // walked: the walk ledger can put them on the Post Office's doorstep and this
  // answer stays empty, which is the whole of the law in one assertion
  const { entered, insideOf, manifest } = standpointOccupancy({ acts: [], at: 999, handle: "wright" });
  assert.deepEqual(entered, []);
  assert.equal(insideOf, null);
  assert.equal(manifest.size, 0);
});

test("a refused crossing is in the record and not in the occupancy", () => {
  const acts = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · kilean · enters the-town/the-wheelhouse · at 138.0000 · word opposed\n`).acts;
  assert.equal(acts.length, 1, "the act happened and the record holds it");
  assert.deepEqual(standpointOccupancy({ acts, at: 999, handle: "kilean" }).entered, [],
    "being turned away is a fact about the town, not a room he is in");
});

test("the spectator is inside nothing but can still read the manifest", () => {
  const at = fractionalCrossing();
  const spectator = standpointOccupancy({ acts: REAL.acts, at, handle: SPECTATOR_ACTOR });
  assert.deepEqual(spectator.entered, [], "a camera has crossed no thresholds");
  assert.equal(spectator.insideOf, null);
  assert.deepEqual([...spectator.manifest.get("the-town/the-town-centre")], ["wright"],
    "but who is inside what is not a private fact");
  assert.equal(occupancyChipHTML(spectator), "", "so the spectator's pane carries no chip");
});

// ── the deep stack ──────────────────────────────────────────────────────────
test("a chain of crossings reads outermost→innermost, and exiting the ship leaves her cabins", () => {
  const acts = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · kilean · enters the-town/the-post-office · at 138.0000 · word welcomed\n`
    + `- 2026-08-20T01:10:00.000Z · kilean · enters the-town/the-mail-hold · at 138.0100 · word neutral\n`).acts;
  const aboard = standpointOccupancy({ acts, at: 999, handle: "kilean" });
  assert.deepEqual(aboard.entered, ["the-town/the-post-office", "the-town/the-mail-hold"]);
  assert.equal(aboard.insideOf, "the-town/the-mail-hold");
  // he is in the hold AND aboard the boat: occupancy of a room implies its holder
  assert.deepEqual([...aboard.manifest.keys()].sort(), ["the-town/the-mail-hold", "the-town/the-post-office"]);

  const ashore = standpointOccupancy({
    acts: [...acts, ...parseThresholdLedger(`- 2026-08-20T01:20:00.000Z · kilean · exits the-town/the-post-office · at 138.0200\n`).acts],
    at: 999, handle: "kilean",
  });
  assert.deepEqual(ashore.entered, [], "leaving the boat leaves her hold too");
});

test("alongside names the others in your innermost room and never yourself", () => {
  const acts = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · kilean · enters the-town/the-post-office · at 138.0000 · word welcomed\n`
    + `- 2026-08-20T01:05:00.000Z · postmaster · enters the-town/the-post-office · at 138.0050 · word welcomed\n`).acts;
  assert.deepEqual(standpointOccupancy({ acts, at: 999, handle: "kilean" }).alongside, ["postmaster"]);
  assert.deepEqual(standpointOccupancy({ acts, at: 999, handle: "postmaster" }).alongside, ["kilean"]);
});

// ── what the reader actually sees ───────────────────────────────────────────
test("the chip says what was entered, in the mark's own name, and who is in there", () => {
  const readout = standpointOccupancy({ acts: REAL.acts, at: fractionalCrossing(), handle: "wright" });
  const html = occupancyChipHTML({ ...readout, nameOf: () => "The Town Centre" });
  assert.match(html, /class="wv-entered"/);
  assert.match(html, /entered/);
  assert.match(html, /The Town Centre/);
  assert.match(html, /data-id="the-town\/the-town-centre"/);
  assert.match(html, /alone in here/, "no company is said plainly rather than left blank");
  assert.doesNotMatch(html, /within/i, "the word `within` is the geometric one and must never appear here");
});

test("the chip names company when there is any", () => {
  const acts = parseThresholdLedger(
    `- 2026-08-20T01:00:00.000Z · kilean · enters the-town/the-post-office · at 138.0000 · word welcomed\n`
    + `- 2026-08-20T01:05:00.000Z · postmaster · enters the-town/the-post-office · at 138.0050 · word welcomed\n`).acts;
  const html = occupancyChipHTML(standpointOccupancy({ acts, at: 999, handle: "kilean" }));
  assert.match(html, /with postmaster/);
  assert.doesNotMatch(html, /alone in here/);
});

test("the dev readout names every room and its occupants, and says so when there are none", () => {
  const at = fractionalCrossing();
  const { manifest } = standpointOccupancy({ acts: REAL.acts, at });
  const line = occupancyDevLine({ manifest, acts: REAL.acts.length, unrecognized: REAL.unrecognized.length, at });
  assert.match(line, /threshold ledger/);
  assert.match(line, /1 crossing/);
  assert.match(line, /wright/);
  assert.doesNotMatch(line, /unrecognized/, "a clean ledger does not report a malformed count");

  assert.match(occupancyDevLine({ manifest: new Map(), acts: 0 }), /nobody is inside anything/);
});

test("a mark id with markup in it cannot escape the chip", () => {
  const html = occupancyChipHTML({ entered: ['the-town/<img src=x onerror="boom">'], alongside: ['<script>'] });
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img/);
});
