// lately-strike-asks-the-town.test.mjs — A ROW IS STRUCK WHEN THE TOWN HAS
// LOST ITS MARK, NEVER WHEN THE READER MERELY CANNOT SEE IT (postmark#2913,
// 2026-09-18).
//
// ── THE INSTANCE ────────────────────────────────────────────────────────────
//
// Keemin, on prod, acting as jetto-of-starforge (2026-09-17 ~20:5x EDT): "a
// bunch of the marks in Lately have been crossed out. Did we lose those marks
// somehow?" — `rowan-archive set out for ~~Rowans First Birthday Moon Charm~~`.
// The mark stands on world main and in settlement-publications.json. Nothing
// was lost. `actSubjectGone(subject, byId)` was `!byId.has(subject)`, and since
// 2026-09-10 `byId` on the RESIDENT path is the reader's own read — their marks,
// the records within and nearby, the town's houses — not the town. So every
// row whose destination lay outside the reader's read was struck as dead. A
// Spectator, whose `byId` is the whole fold, saw the strikes correctly.
//
// Reproduced on the page (the rig of tools/standpoint-dot-culled.test.mjs, a
// three-departure ledger fixture) at dd5e0f48: resident → specimen STRUCK,
// Spectator → not; after this change resident → not struck, Spectator
// byte-identical.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
// `actSubjectGone(subject, byId, town)`: `town` is a whole-town index when one
// is in hand, and a subject is gone only when NEITHER the town nor the read
// carries it. With no whole-town set in hand nothing is struck — absence from a
// partial read is not death. The Spectator hands its fold as both.
//
// ── THE CAN-FAIL FLIP ──────────────────────────────────────────────────────
//
//   `return !town.has(subject) && !byId?.has(subject);`
//     → `return !byId.has(subject);`          the first test below reds
//   call site: `actSubjectGone(row.subject, byId, town)`
//     → `actSubjectGone(row.subject, byId)`   the [pin] reds
//   or drop the argument at the one call that hands it in:
//     `activityLineHTML(row, town)` → `activityLineHTML(row)`   the [pin] reds,
//     because `town` then defaults to `byId` and the read stands in for the
//     town again without a single line saying so (POS-90 moved the
//     derivation into `activityTown()` and the call into `activityLineHTML`;
//     the rule above did not move).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { actSubjectGone } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// the specimen and the shape of a resident's read: thirteen marks, none of
// them the specimen, because the specimen stands 4 km from the reader
const SPECIMEN = "milo/rowans-first-birthday-moon-charm";
const RETIRED = "vermillion/retired-mark";
const READ_IDS = [
  "jetto-of-starforge/the-waystation-parcel", "jetto-of-starforge/the-waystation",
  "berthillon/chez-antoine", "postmaster/the-waiting-room-parcel", "illuminator/the-looking-room-parcel",
  "the-town/the-town", "the-town/the-threshold-district", "the-town/the-fen", "the-town/the-locks",
  "the-town/the-spine", "the-town/the-heights", "the-town/the-shore", "the-town/the-commons",
];
const read = new Map(READ_IDS.map((id) => [id, { id }]));
// the town: the read's marks plus the specimen and a thousand more — a fold
const fold = new Map([...READ_IDS, SPECIMEN, ...Array.from({ length: 1000 }, (_, i) => `rig/mark-${i}`)].map((id) => [id, { id }]));

test("a mark absent from a 13-mark read but present in the fold is NOT gone", () => {
  assert.equal(read.size, 13, "the fixture is a partial read, or this proves nothing");
  assert.equal(read.has(SPECIMEN), false, "the specimen must be outside the read");
  assert.equal(fold.has(SPECIMEN), true, "and on the record");
  // the bug, stated: asked of the read alone it goes; asked of the town it stands
  assert.equal(actSubjectGone(SPECIMEN, read), true,
    "with no town in hand the read IS the town — the old two-argument call, kept for the Spectator, still strikes");
  assert.equal(actSubjectGone(SPECIMEN, read, fold), false,
    "the town carries the mark: a resident who cannot see it has not lost it");
});

test("a mark absent from both, with the fold loaded, IS gone", () => {
  assert.equal(fold.has(RETIRED), false);
  assert.equal(read.has(RETIRED), false);
  assert.equal(actSubjectGone(RETIRED, read, fold), true, "the town has lost it: struck");
});

test("no fold and a partial read: nothing is struck", () => {
  assert.equal(actSubjectGone(RETIRED, read, null), false, "absence from a partial read is not death");
  assert.equal(actSubjectGone(SPECIMEN, read, null), false);
  assert.equal(actSubjectGone(RETIRED, read, new Set()), false, "an empty town is no town — nothing is known yet");
});

test("the Spectator's verdicts are unchanged: the fold handed as both", () => {
  assert.equal(actSubjectGone(RETIRED, fold, fold), true);
  assert.equal(actSubjectGone(SPECIMEN, fold, fold), false);
  assert.equal(actSubjectGone(null, fold, fold), false, "a walk toward bare coordinates names no mark");
  assert.equal(actSubjectGone(RETIRED, new Map(), new Map()), false, "before the fold arrives nothing is missing");
  // a record the read carries that the (older) fold does not is alive — the
  // read is the fresher of the two
  const fresh = new Map([...read, ["rig/written-since-the-fold", { id: "rig/written-since-the-fold" }]]);
  assert.equal(actSubjectGone("rig/written-since-the-fold", fresh, fold), false);
});

test("[pin] the rail hands the strike a whole-town set on the resident path only when the fold is loaded", () => {
  // The derivation. It lives in `activityTown()` since POS-90, because the full
  // render and the appended page both need it and two spellings of it would be
  // two answers to "what is the town".
  assert.match(SOURCE,
    /const activityTown = \(\) =>\s*\(onResidentPath\(\) \? \(world\?\.marks \? new Set\(world\.marks\.map\(\(m\) => m\.id\)\) : null\) : byId\);/,
    "the rail must derive `town` from the fold on the resident path, and nowhere else");
  // and it reaches the strike
  assert.match(SOURCE, /actSubjectGone\(row\.subject, byId, town\)/,
    "the rail must hand that town to actSubjectGone");
  // EVERY caller hands it in. `actSubjectGone`'s third argument defaults to the
  // read, so a one-argument `activityLineHTML(row)` restores the bug in full
  // and changes no line that mentions the town.
  assert.doesNotMatch(SOURCE, /activityLineHTML\(row\)/,
    "a row rendered without a town falls back to the read, which is the bug this file exists for");
  assert.doesNotMatch(SOURCE, /actSubjectGone\(row\.subject, byId\)/,
    "the two-argument call at the rail is the bug: the read stood in for the town");
  // the same-origin copy of the record is loaded for the houses and is NOT the
  // town for this purpose — it is the export that lags the door (#2923)
  assert.doesNotMatch(SOURCE, /actSubjectGone\([^)]*townChain/,
    "townChain lags the door by a settlement; a mark written since the pin would be struck for its first hours");
});
