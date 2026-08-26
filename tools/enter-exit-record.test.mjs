// enter-exit-record.test.mjs — the enter/exit record, as the WORLD REPO holds it.
//
//   node --test tools/enter-exit-record.test.mjs
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
//
// The record was one append-only file. Since 2026-08-26 it is three, and the
// shape only works if each one is exactly what it says it is:
//
//   WORLD/enter-exit-ledger-frozen.md  the era when each passage spent a git
//                                      commit of its own. FROZEN — a fixed
//                                      input, never appended to again.
//   WORLD/enter-exit-ledger.md         DERIVED — the frozen era plus the world
//                                      journal's rows, regenerated whole.
//   WORLD/threshold-ledger.md          the same bytes under the retired name,
//                                      for one grace window.
//
// The office owns the deriver (src/enter-exit-ledger.mjs over there) and is
// falsified over there. What is asserted HERE is the half that lives in this
// repo and that the office cannot check for itself: that the three files agree,
// that the frozen era did not lose a line to the rename, and that every reader
// in this package asks for the record by a name the package actually carries.
//
// ── THE LAW, QUOTED ─────────────────────────────────────────────────────────
//
// `the-town/enter`, class, constitution tier, version 4, source LOGOS/classes.md:
//
//     "An entry is one passage written — who crossed, into what, at a threshold
//      you truly stand before; exit writes the next, to the effective parent."
//
// A passage that is written and that no reader can reach is not written. On
// 2026-08-24T19:39:13Z this record stopped being reachable and nobody found out
// for two days, because no probe in either repo ever asked whether an act
// performed at the door came back out of it.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnterExitLedger, LEDGER_HEADER, ENTER_EXIT_RE, FERRY_FIELD, occupancyAt } from "./enter-exit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FROZEN = "WORLD/enter-exit-ledger-frozen.md";
const DERIVED = "WORLD/enter-exit-ledger.md";
const RETIRED = "WORLD/threshold-ledger.md";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const actLines = (text) => text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.startsWith("- "));

// ── THE THREE FILES ─────────────────────────────────────────────────────────

test("all three files are in the tree — a record the package does not carry is a 404 in prod", () => {
  // The site stages a record file because a reader asks this origin for it, and
  // the build FAILS if the pinned package does not carry it. So a viewer that
  // asks for a name this repo does not ship does not degrade — it stops the
  // release. Both names are asked for during the grace window.
  for (const rel of [FROZEN, DERIVED, RETIRED])
    assert.ok(existsSync(join(ROOT, rel)), `${rel} is missing from the world package`);
});

test("the retired name carries the SAME BYTES as the new one", () => {
  assert.equal(read(RETIRED), read(DERIVED),
    "a viewer bundle blessed before the rename must read a TRUE record, not an old one — same bytes, two doors");
});

test("the derived file carries the derived header, and the derived header is this package's", () => {
  // ONE HOME FOR THE SERIALIZATION. The office reads this constant out of the
  // clone rather than keeping a copy, so a header that drifted here would drift
  // everywhere at once rather than in two places differently.
  assert.ok(read(DERIVED).startsWith(LEDGER_HEADER),
    "the derived file's header is not the one tools/enter-exit.mjs exports");
});

test("the derived file says it is derived, out loud, where a writer would read it", () => {
  const header = read(DERIVED).split("\n- ")[0];
  assert.match(header, /DERIVED/);
  assert.match(header, /Nothing appends to this file/);
});

// ── THE FROZEN ERA ──────────────────────────────────────────────────────────

test("THE FROZEN ERA lost nothing to the rename — 155 passages, first and last named", () => {
  // The file was `WORLD/threshold-ledger.md` and was moved, not rewritten. The
  // count and the endpoints are asserted rather than eyeballed because a rename
  // that quietly dropped a line would look exactly like a rename that did not.
  const lines = actLines(read(FROZEN));
  assert.equal(lines.length, 155);
  assert.equal(lines[0],
    "- 2026-08-20T01:17:55.978Z · wright · enters the-town/the-town-centre · at 138.1082 · word neutral");
  assert.equal(lines.at(-1),
    "- 2026-08-24T19:39:13.114Z · sable · enters fabel-of-garrison/the-riverside-arcade · at 147.6377 · word neutral");
});

test("THE FROZEN ERA is entirely readable by the reader that has to read it", () => {
  const { acts, unrecognized } = parseEnterExitLedger(read(FROZEN));
  assert.equal(unrecognized.length, 0, "a frozen record its own parser cannot read is a record that has been lost");
  assert.equal(acts.length, 155);
});

test("THE FROZEN ERA stops at the cutover instant and not one passage later", () => {
  // 2026-08-24T19:39:13.114Z is when the single log took the pen. Anything after
  // it belongs to the journal, and a line here from after that instant would
  // mean two pens were writing the same record.
  const CUTOVER = "2026-08-24T19:39:13.114Z";
  const after = parseEnterExitLedger(read(FROZEN)).acts.filter((a) => a.iso > CUTOVER);
  assert.deepEqual(after, [], `the frozen era must end at ${CUTOVER}`);
});

test("THE FROZEN ERA says it is an INPUT, not an output", () => {
  const header = read(FROZEN).split("\n- ")[0];
  assert.match(header, /FROZEN/);
  assert.match(header, /never appended to again/);
  assert.match(header, /INPUT, not an output/,
    "an archive that also grows cannot be the fixed point a derivation stands on, and the file has to say so");
});

// ── THE DERIVATION, FROM THIS SIDE ──────────────────────────────────────────

test("the derived file contains the frozen era, in order, unchanged", () => {
  const frozen = actLines(read(FROZEN));
  const derived = actLines(read(DERIVED));
  assert.deepEqual(derived.slice(0, frozen.length), frozen,
    "deriving the live era must not cost the record its history");
});

test("the derived file adds nothing this repo cannot account for", () => {
  // This repo cannot see the office's journal, so the committed derived file is
  // the frozen era exactly. Anything else here would be a line somebody typed.
  assert.equal(actLines(read(DERIVED)).length, actLines(read(FROZEN)).length,
    "the world repo has no journal to read — a longer derived file means a hand wrote in it");
});

test("the derived record folds to an occupancy — the record is not merely well-formed, it MEANS something", () => {
  const { acts, unrecognized } = parseEnterExitLedger(read(DERIVED));
  assert.equal(unrecognized.length, 0);
  const inside = occupancyAt(acts, Infinity);
  assert.ok(inside.size > 0, "nobody is inside anything on the whole record — that is not a town, that is a parse that silently gave up");
  for (const [handle, stack] of inside)
    assert.ok(stack.length > 0 && stack.every((m) => m.includes("/")), `${handle}'s chain is not made of mark ids`);
});

// ── THE FERRY FIELD ─────────────────────────────────────────────────────────

test("THE FERRY FIELD — the frozen era's `at` and the live era's `ferry` are the same number", () => {
  const historic = "- 2026-08-24T19:39:13.114Z · s · enters a/b · at 147.6377 · word neutral";
  const modern = "- 2026-08-24T19:39:13.114Z · s · enters a/b · ferry 147.6377 · word neutral";
  assert.equal(parseEnterExitLedger(historic).acts[0].at, parseEnterExitLedger(modern).acts[0].at);
  assert.equal(FERRY_FIELD, "ferry");
});

test("THE FERRY FIELD — the word `crossing` is reserved for the ferry's clock and is not a field here", () => {
  assert.equal(ENTER_EXIT_RE.test("- x · a · enters m · crossing 1 · word neutral"), false);
  assert.equal(ENTER_EXIT_RE.test("- x · a · enters m · ferry 1 · word neutral"), true);
  assert.equal(ENTER_EXIT_RE.test("- x · a · enters m · at 1 · word neutral"), true);
});

// ── EVERY READER IN THIS PACKAGE ────────────────────────────────────────────

test("the viewer asks for a record name this package carries", () => {
  // The site derives its staging list from the paths the pinned viewer asks
  // this origin for, and FAILS the build when the package does not carry one.
  // So a viewer literal with no file behind it does not degrade — it stops the
  // release, and it stops it in the other repo where this lane cannot see it.
  const viewer = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");
  const asked = [...viewer.matchAll(/["'](\/WORLD\/[A-Za-z0-9._\-/]+)["']/g)].map((m) => m[1]);
  assert.ok(asked.includes("/WORLD/enter-exit-ledger.md"), "the viewer does not ask for the record by its new name");
  for (const path of new Set(asked))
    assert.ok(existsSync(join(ROOT, path.slice(1))), `the viewer asks this origin for ${path} and the package has no such file`);
});

test("the local spectator serves both names off its own disk", () => {
  // A page served from a bare clone with no office must still derive occupancy,
  // and during the grace window it may ask for either name.
  const server = readFileSync(join(ROOT, "spectator", "server.mjs"), "utf8");
  for (const path of ["/WORLD/enter-exit-ledger.md", "/WORLD/threshold-ledger.md"])
    assert.ok(server.includes(`p === "${path}"`), `spectator/server.mjs has no route for ${path}`);
});

test("nothing in this package still imports the retired grammar module", () => {
  // `tools/thresholds.mjs` is gone. A stale import would not be a soft failure:
  // it is a module that does not resolve, which takes the whole viewer down.
  const viewer = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");
  assert.equal(viewer.includes("tools/thresholds.mjs"), false);
  assert.equal(existsSync(join(ROOT, "tools", "thresholds.mjs")), false, "the retired module is still in the tree");
  assert.ok(existsSync(join(ROOT, "tools", "enter-exit.mjs")));
});

test("the probes above can fail — a name this package does not carry is caught", () => {
  // THE CAN-FAIL FLIP for the reader probes. An assertion that every asked-for
  // path exists is worth nothing if the check cannot notice one that does not.
  assert.equal(existsSync(join(ROOT, "WORLD/enter-exit-ledger-that-does-not-exist.md")), false);
  assert.equal(readFileSync(join(ROOT, "spectator", "server.mjs"), "utf8")
    .includes('p === "/WORLD/no-such-record.md"'), false);
});
