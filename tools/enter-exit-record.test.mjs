// enter-exit-record.test.mjs — the enter/exit record, as the WORLD REPO holds it.
//
//   node --test tools/enter-exit-record.test.mjs
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
//
// The record was one append-only file. Since 2026-08-26 it was three; since
// 2026-08-28 it is TWO, and the shape only works if each is exactly what it says
// it is:
//
//   WORLD/enter-exit-ledger-frozen.md  the era when each passage spent a git
//                                      commit of its own. FROZEN — a fixed
//                                      input, never appended to again.
//   WORLD/enter-exit-ledger.md         DERIVED — the frozen era plus the world
//                                      journal's rows, regenerated whole. The
//                                      copy in THIS repo is the frozen era
//                                      exactly, because this repo has no
//                                      journal to read.
//
// The office owns the deriver (src/enter-exit-ledger.mjs over there) and is
// falsified over there. What is asserted HERE is the half that lives in this
// repo and that the office cannot check for itself: that the two files agree,
// that the frozen era did not lose a line to the rename, and that every reader
// in this package asks for the record by a name the package actually carries.
//
// ── THE TWIN IS DEAD, AND THESE PROBES ARE ITS HEADSTONE (#2152) ────────────
//
// `WORLD/threshold-ledger.md` was the same bytes under the retired name, kept
// for a grace window. It is deleted at the founder's word ("truly useless"),
// and the byte-parity test that used to compare the two is now a RESURRECTION
// GUARD: the retired path must not exist, and no CODE in this package may name
// it. That inversion is deliberate. The twin was the half that stayed honest
// through three writer bugs — it was never the problem — but a second file
// standing for a record with one deriver is a second thing to keep true, and
// keeping it true is what the deleted assertions were for.
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

test("both files are in the tree — a record the package does not carry is a 404 in prod", () => {
  // The site stages a record file because a reader asks this origin for it, and
  // the build FAILS if the pinned package does not carry it. So a viewer that
  // asks for a name this repo does not ship does not degrade — it stops the
  // release.
  for (const rel of [FROZEN, DERIVED])
    assert.ok(existsSync(join(ROOT, rel)), `${rel} is missing from the world package`);
});

test("RESURRECTION GUARD — the retired name is not in the tree, and a pen that recreates it goes red here", () => {
  // This assertion replaces the byte-parity test that stood here while the twin
  // lived. It is pointed at the ONE way the twin comes back: an office pen with
  // a default write destination. `emitEnterExitLedger` over there defaulted to
  // writing both paths, and the crossing-save called it every save — so a file
  // deleted here reappears on the next crossing unless the pen is gone too.
  // If this goes red, the question is not "who committed a file" but "which
  // writer got its default back".
  assert.equal(existsSync(join(ROOT, RETIRED)), false,
    `${RETIRED} is back — the record has one committed file, and a second one means something is writing it again (#2152)`);
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

test("the local spectator serves the record off its own disk", () => {
  // A page served from a bare clone with no office must still derive occupancy.
  const server = readFileSync(join(ROOT, "spectator", "server.mjs"), "utf8");
  assert.ok(server.includes(`p === "/WORLD/enter-exit-ledger.md"`),
    "spectator/server.mjs has no route for /WORLD/enter-exit-ledger.md");
});

test("RESURRECTION GUARD — no CODE in this package names the retired file", () => {
  // The deletion is only real if nothing still reaches for it. A route or a
  // fetch literal pointed at a file the package does not carry does not fail
  // loudly; it serves a 404 into a reader that then shows an empty town.
  //
  // Sources, not the whole tree: the two files below are the readers, and the
  // exceptions are named one by one rather than filtered by a pattern, because
  // a pattern is how a real reader hides among the excused.
  //
  // EXCUSED, and each for its own reason:
  //   this file          — it is the deletion's own guard; naming the path is
  //                        the assertion.
  //   tools/enter-exit.mjs — the LEDGER_HEADER prose says the retired name is
  //                        gone and where a pre-rename bundle still gets bytes.
  //                        Prose about an absence is not a reader of it.
  //   WORLD/*, docs, git history — the record's own frozen lines and the
  //                        commits that made them. History is not editable.
  const RETIRED_NAME = "threshold-ledger.md";
  for (const rel of ["spectator/viewer.mjs", "spectator/server.mjs"]) {
    assert.equal(readFileSync(join(ROOT, rel), "utf8").includes(RETIRED_NAME), false,
      `${rel} still names ${RETIRED_NAME} — the file is deleted, so that read can only 404 (#2152)`);
  }
});

test("the resurrection guards can fail — both detectors recognise what they are looking for", () => {
  // THE CAN-FAIL FLIP. An existence check that never sees a present file, and a
  // substring check that never sees the substring, both pass vacuously forever.
  assert.equal(existsSync(join(ROOT, DERIVED)), true,
    "the existence probe cannot tell present from absent");
  assert.equal(`if (p === "/WORLD/threshold-ledger.md") return serveFile(res, "WORLD/threshold-ledger.md");`
    .includes("threshold-ledger.md"), true,
    "the source probe cannot recognise the exact line it was written to catch");
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
