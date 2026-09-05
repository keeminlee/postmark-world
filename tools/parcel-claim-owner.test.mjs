// parcel-claim-owner.test.mjs — the parcel rule has one owner (postmark#2514).
//
// ── THE DEFECT THIS BINDS ──────────────────────────────────────────────────
//
// "May this household add a parcel?" is TWO clauses at two grains: one parcel
// per HANDLE (written law) and at most `PARCEL_CLAIM_CAP` per CREDENTIAL
// household (ruled 2026-07-30, gated on the claim's date, prior estate
// standing). The fold said both, in two arms. The office door said only the
// second — and its comment named the fold as its co-enforcer, so a door
// implementing HALF a rule read as a door agreeing with the fold.
//
// berthillon holds `chez-antoine` and stands alone under their credential, so
// the cap read 1 of 3 and the door admitted three cones declared `kind: parcel`
// on 2026-09-03, -04 and -05. The crossing refused all three on the clause the
// door never had, and the shared drawer took `current-the-reader`'s eleven
// admissible marks down with them for five crossings.
//
// The bar: the two clauses, their ORDER, and their SENTENCES have exactly one
// source, and the fold's own admission path is proven to read it.

import test from "node:test";
import assert from "node:assert/strict";
import {
  PARCEL_CLAIM_CAP, PARCEL_CAP_LAW_DATE, PARCEL_ONE_PER_HANDLE,
  admissionBase, admitDelta, parcelClaimRefusal, parcelClaimRefusalIn,
} from "./marks-fold.mjs";

const parcel = (id, by, at, date = "2026-09-03") => ({
  id, by, household: by, kind: "parcel", date,
  at: { x: at[0], y: at[1] }, extent: { w: 100, h: 100 },
});

test("CLAUSE 1 — one parcel per HANDLE, and its sentence is the fold's own", () => {
  const held = [parcel("alice/first", "alice", [100, 100])];
  assert.equal(
    parcelClaimRefusalIn(held, { by: "alice", id: "alice/second", date: "2026-09-03" }),
    PARCEL_ONE_PER_HANDLE);
  assert.equal(PARCEL_ONE_PER_HANDLE, "household already holds a parcel (relocation = replace, not add)",
    "the sentence is verbatim what the crossing has been printing since S55 — a resident reading the door reads the crossing's words");
});

test("CLAUSE 2 — the cap counts per CREDENTIAL household, not per handle", () => {
  // Three handles, one credential, three parcels held. A FOURTH handle in the
  // same house is under clause 1 (it holds none of its own) and must still be
  // stopped by the cap.
  const households = { a: "gh:1", b: "gh:1", c: "gh:1", d: "gh:1" };
  const held = [parcel("a/p", "a", [0, 0]), parcel("b/p", "b", [200, 0]), parcel("c/p", "c", [400, 0])];
  const why = parcelClaimRefusalIn(held, { by: "d", id: "d/p", date: "2026-09-03", households });
  assert.match(why, /^parcel claim capped/);
  assert.match(why, new RegExp(`cap ${PARCEL_CLAIM_CAP} per household, ruled ${PARCEL_CAP_LAW_DATE}`));
  // and the same handle in a house of its own is not capped by its neighbours
  assert.equal(parcelClaimRefusalIn(held, { by: "d", id: "d/p", date: "2026-09-03" }), null,
    "with no registry every handle is its own household, so d's first parcel is admissible");
});

test("CLAUSE 1 FIRES FIRST — the order is part of the rule", () => {
  // A handle that holds one parcel AND is at the cap gets the per-handle
  // sentence, because that is the one that tells them the true remedy
  // (relocate) rather than the one that tells them to wait for the founder.
  const households = { a: "gh:1", b: "gh:1", c: "gh:1" };
  const held = [parcel("a/p", "a", [0, 0]), parcel("b/p", "b", [200, 0]), parcel("c/p", "c", [400, 0])];
  assert.equal(parcelClaimRefusalIn(held, { by: "a", id: "a/second", date: "2026-09-03", households }),
    PARCEL_ONE_PER_HANDLE);
});

test("A RELOCATION IS NOT A CLAIM — both by id and by the replacing flag", () => {
  const held = [parcel("alice/first", "alice", [100, 100])];
  assert.equal(parcelClaimRefusalIn(held, { by: "alice", id: "alice/first", date: "2026-09-03" }), null,
    "amending the parcel you already hold does not count you as your own rival");
  assert.equal(parcelClaimRefusal({ id: "alice/second", date: "2026-09-03", heldByHandle: true, replacing: true }), null,
    "and the delta arm's `_replacing` says the same thing from the other side");
});

test("THE CAP'S DATE GATE AND ITS EXCEPTION MAP still stand", () => {
  const households = { a: "gh:9", b: "gh:9", c: "gh:9", d: "gh:9" };
  const held = [parcel("a/p", "a", [0, 0]), parcel("b/p", "b", [200, 0]), parcel("c/p", "c", [400, 0])];
  assert.equal(parcelClaimRefusalIn(held, { by: "d", id: "d/p", date: "2026-07-29", households }), null,
    "a claim dated before the law is prior estate and stands");
  assert.equal(parcelClaimRefusal({
    id: "caelum-reeves/the-still-house-parcel", date: "2026-08-10", heldByCred: 9,
  }), null, "the founder-worded exception passes the cap gate by name");
});

test("THE FOLD ITSELF READS THIS OWNER — flip the sentence and the crossing changes with it", () => {
  // The binding that makes the other five tests worth anything: admitDelta,
  // the path every crossing runs, must produce the OWNER's sentence rather than
  // a copy of it. If someone re-spells the clause in either fold arm, this goes
  // red instead of the two quietly disagreeing.
  const base = admissionBase(
    { marks: [{ ...parcel("alice/first", "alice", [100, 100]), declared_household: "solo:alice" }] },
    { households: null });
  const out = admitDelta([parcel("alice/second", "alice", [900, 900])], base);
  assert.equal(out.errors.length, 1);
  assert.equal(out.errors[0].mark, "alice/second");
  assert.equal(out.errors[0].error, PARCEL_ONE_PER_HANDLE,
    "the crossing's refusal IS the owner's string, not a second copy of it");
});
