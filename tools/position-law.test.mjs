// position-law.test.mjs — the position ruling of 2026-08-18, asserted OFF THE
// RECORD rather than off a constant in this file.
//
// NODES-FIRST (Keemin, mid-flight during step 9): a fix plants its law as nodes
// before the implementation, and the code exists to close the gap between what
// the nodes say and what the world does. So this file has two halves, and the
// order matters:
//
//   1. THE LAW IS PLANTED. The clauses exist, in the grammar the planting uses,
//      at the tier their custody demands.
//   2. THE CODE OBEYS THE PLANTED TEXT. Every expectation below is READ FROM
//      THE MARK, never mirrored here — the ruled-grants.test.mjs pattern. A test
//      that hardcodes what the law says cannot notice the law changing, which
//      makes it a second copy of the constitution rather than a guard on the
//      first.
//
// The consequence worth stating: amend a clause's `value:` and the behaviour
// assertions below re-aim themselves at the amended text. If the code no longer
// matches, this suite goes red — which is the whole point of reading the record.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { whereIs, homeOf, parcelsFor, porchOf, QUAY_MARK_ID } from "./where-is.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WORKS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works";

/** A mark's frontmatter, as fields — the record is the source, not a fixture. */
function markOf(rel) {
  // normalize first: a Windows checkout (autocrlf) hands this file CRLF, and
  // the record's meaning is line-ending-agnostic — loadMarks reads \r?\n too
  const text = readFileSync(join(here, "..", rel), "utf8").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${rel} has frontmatter and a body`);
  const fields = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fields, body: m[2].trim() };
}

// ── 1. the law is planted ────────────────────────────────────────────────────

test("LAW: the parcel's scope clause stands — a parcel is the HOUSEHOLD's ground", () => {
  const { fields, body } = markOf(`${WORKS}/parcel/household-scope/mark.md`);
  assert.equal(fields.kind, "predicated");
  assert.equal(fields.by, "the-town");
  assert.equal(fields.tier, "constitution", "who may read a household's ground is the town's word, not a holder's");
  assert.equal(fields.slot, "scope");
  assert.ok(fields.value && fields.value !== "unsealed",
    "a stated clause carries a concrete value — `unsealed` is only for a slot left open");
  assert.match(fields.value, /household/i);
  assert.ok(body.length <= 150, `body is ${body.length} chars; the cap is 150`);
});

test("LAW: the parcel's resolution clause stands — own-claimed first, else the household's first-made", () => {
  const { fields, body } = markOf(`${WORKS}/parcel/ground-resolution/mark.md`);
  assert.equal(fields.kind, "predicated");
  assert.equal(fields.slot, "resolution");
  assert.match(fields.value, /own/i, "the handle's own claim leads");
  assert.match(fields.value, /first/i, "and the tie-break is the household's first-made");
  assert.ok(body.length <= 150, `body is ${body.length} chars; the cap is 150`);
});

test("LAW: the resident's standing clause stands — the unplaced stand at the quay", () => {
  const { fields, body } = markOf(`${WORKS}/resident/the-standing-porch/mark.md`);
  assert.equal(fields.kind, "predicated");
  assert.equal(fields.slot, "standing");
  assert.match(fields.value, /quay/i);
  assert.ok(body.length <= 150, `body is ${body.length} chars; the cap is 150`);
});

test("LAW: the CLAIMING law is untouched by any of it — one parcel per handle", () => {
  // The clause that would be easiest to widen by accident, so it is asserted
  // rather than trusted: reading at household grain must never become holding.
  // Asserted across the WHOLE clause, not just `value:` — the headline field
  // states the scope and the body carries the carve-out, and the law is both.
  const { fields, body } = markOf(`${WORKS}/parcel/household-scope/mark.md`);
  assert.match(`${fields.value} ${body}`, /claim/i,
    "the scope clause has to say what it does NOT change, or it reads as a rights grant");
});

// ── 2. the code obeys the planted text ──────────────────────────────────────

const QUAY = { id: QUAY_MARK_ID, by: "the-town", household: "the-town", kind: "sited", at: { x: 1390, y: 5665 } };

// The Rook case (#1864): two handles, one declared household, ground held by A.
const garrison = {
  households: { "rook-of-garrison": "the-garrison", "sol-of-garrison": "the-garrison" },
  marks: [QUAY],
  parcels: [{ id: "sol-of-garrison/the-heart-house-parcel", household: "sol-of-garrison", at: { x: -1375, y: -2550 }, extent: { w: 25, h: 25 } }],
};

test("CODE: ground resolves at the grain the scope clause names", () => {
  const clause = markOf(`${WORKS}/parcel/household-scope/mark.md`).fields.value;
  // The law says the ground is the household's. Read it, then demand it.
  assert.match(clause, /household/i);
  const rook = homeOf("rook-of-garrison", garrison);
  assert.equal(rook.placed, true, `the record says "${clause}" — a sibling handle must read it`);
  assert.equal(rook.mark_id, "sol-of-garrison/the-heart-house-parcel");
  assert.equal(rook.household, "the-garrison");
});

test("CODE: the pick follows the resolution clause's own order, and says which it took", () => {
  const clause = markOf(`${WORKS}/parcel/ground-resolution/mark.md`).fields.value;
  assert.match(clause, /own/i);
  const both = {
    ...garrison,
    parcels: [
      // household's first-made is listed FIRST in fold order, so a naive
      // implementation would return it — the clause says the own claim wins.
      { id: "sol-of-garrison/the-heart-house-parcel", household: "sol-of-garrison", at: { x: -1375, y: -2550 }, extent: { w: 25, h: 25 } },
      { id: "rook-of-garrison/the-rook-parcel", household: "rook-of-garrison", at: { x: 10, y: 20 }, extent: { w: 25, h: 25 } },
    ],
  };
  const rook = homeOf("rook-of-garrison", both);
  assert.equal(rook.via, "own", `the record says "${clause}"`);
  assert.equal(rook.mark_id, "rook-of-garrison/the-rook-parcel");
  // and with no own claim, the household's FIRST-MADE (first in fold order)
  assert.equal(homeOf("rook-of-garrison", garrison).via, "household");
  assert.equal(parcelsFor("rook-of-garrison", both)[0].household, "rook-of-garrison", "own leads the list");
});

test("CODE: the unplaced stand where the standing clause says, and the answer says it is a default", () => {
  const clause = markOf(`${WORKS}/resident/the-standing-porch/mark.md`).fields.value;
  assert.match(clause, /quay/i);
  const here_ = whereIs("adam-rhys", { world: garrison, departures: [] });
  assert.equal(here_.placed, true, `the record says "${clause}"`);
  assert.equal(here_.mark_id, QUAY_MARK_ID);
  assert.equal(here_.source, "quay", "a default that cannot be told from a choice is the thing NOWHERE forbids");
  assert.equal(homeOf("adam-rhys", garrison).placed, false, "standing there is not holding it");
});

test("CODE: reading never becomes holding — the claiming law survives the grain change", () => {
  // A resident outside the household borrows nothing, and the porch mints no
  // ground. This is the assertion that goes red if household grain is ever
  // implemented as a rights grant instead of a read.
  assert.deepEqual(parcelsFor("outsider", garrison), []);
  assert.equal(homeOf("outsider", garrison).placed, false);
  assert.equal(porchOf({ marks: [] }).placed, false, "no quay in the record, no porch — the law is read, not held here");
});
