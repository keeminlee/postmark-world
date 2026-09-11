// resident-read.test.mjs — the resident's read, as the painting and the pane
// want it (2026-09-10).
//
// The adapter is the one place the office's answer and the viewer's surfaces
// meet, so it is where the promises of the compact-read ruling are asserted:
//
//   the page does not re-judge what the read decided
//   a number the read did not carry is ABSENT, never guessed
//   an id the read names with no record SAYS SO, and is never a blank
//
// Every test below is written so it can fail. Two of them exist specifically to
// fail if someone "helpfully" restores a field: `observer` and `counts` are the
// doors through which a second engine would walk back in.

import { test } from "node:test";
import assert from "node:assert/strict";

import { residentRadial, residentReadIds, residentReadKey, RESIDENT_BAND } from "../spectator/viewer.mjs";

const RECORD = (id, extra = {}) => ({
  id, kind: "sited", by: id.split("/")[0], household: id.split("/")[0],
  tier: "market", at: { x: 0, y: 0 }, extent: { w: 4, h: 4 },
  body: `the body of ${id}`, weight: 3, ...extra,
});

const READ = {
  within: [{ id: "the-town/let-there-be-light" }, { id: "wright/the-trueing-terrace" }],
  nearby: [
    { id: "a/far-north", at: { x: 0, y: -900 }, bearing: "N", distance_m: 900, kind: "sited", tier: "market" },
    { id: "a/near-north", at: { x: 0, y: -100 }, bearing: "N", distance_m: 100, kind: "sited", tier: "home" },
    { id: "b/east", at: { x: 300, y: 0 }, bearing: "E", distance_m: 300, kind: "parcel", tier: "market" },
  ],
  records: {
    "a/far-north": RECORD("a/far-north"),
    "a/near-north": RECORD("a/near-north", { image: "https://media.postmark.town/media/a/x.jpg" }),
    "b/east": RECORD("b/east", { kind: "parcel" }),
    "the-town/the-sea": RECORD("the-town/the-sea"),   // the ground: carried, never scenery
  },
  telling: "The air is clear.",
};

test("the read's rows become radial rows: record for the card, standpoint for the place", () => {
  const r = residentRadial(READ);
  const row = r.byBearing.N[RESIDENT_BAND].find((m) => m.id === "a/near-north");
  // the RECORD's half — what a card draws
  assert.equal(row.body, "the body of a/near-north");
  assert.deepEqual(row.extent, { w: 4, h: 4 });
  assert.equal(row.image, "https://media.postmark.town/media/a/x.jpg");
  assert.equal(row.household, "a");
  // the READ's half — what the standpoint says, and it must WIN over the record
  assert.deepEqual(row.at, { x: 0, y: -100 }, "the standpoint's position, not the record's 0,0");
  assert.equal(row.bearing, "N");
  assert.equal(row.distM, 100, "distance_m becomes distM — the name every consumer already reads");
  assert.equal(row.tier, "home");
});

test("nearest first within a bearing — the read's own ordering, made explicit", () => {
  const r = residentRadial(READ);
  assert.deepEqual(r.byBearing.N[RESIDENT_BAND].map((m) => m.id), ["a/near-north", "a/far-north"]);
  assert.deepEqual(Object.keys(r.byBearing).sort(), ["E", "N"]);
  assert.deepEqual(Object.keys(r.byBearing.N), [RESIDENT_BAND], "one band per bearing — bands are not rebuilt");
});

test("the GROUND is carried and is not drawn — a record is not a row", () => {
  const r = residentRadial(READ);
  const ids = [];
  for (const bands of Object.values(r.byBearing)) for (const rows of Object.values(bands)) ids.push(...rows.map((m) => m.id));
  assert.equal(ids.length, 3, "three named, three rows");
  assert.ok(!ids.includes("the-town/the-sea"),
    "the sea is in `records` as the town's floor and must never become a thing you can see");
});

test("FALSIFIER — an id the read names with no record SAYS SO, and is never a blank", () => {
  const holed = { ...READ, records: { ...READ.records } };
  delete holed.records["b/east"];
  const r = residentRadial(holed);
  const row = r.byBearing.E[RESIDENT_BAND][0];
  assert.equal(row.id, "b/east", "the row still stands — a named thing is not dropped");
  assert.equal(row.unread, true, "and it is marked, so the page can say so where it would have drawn");
  assert.equal(r.counts.unread, 1, "and counted, so one hole is not invisible among fifty rows");
  // and the whole read is still usable: the other two rows are untouched
  assert.equal(r.byBearing.N[RESIDENT_BAND].length, 2);
  // the anti-vacuity half: with the record present there is no mark and no count
  const whole = residentRadial(READ);
  assert.equal(whole.byBearing.E[RESIDENT_BAND][0].unread, undefined);
  assert.equal(whole.counts.unread, undefined);
});

test("FALSIFIER — the page re-judges NOTHING the read decided", () => {
  const r = residentRadial(READ);
  for (const bands of Object.values(r.byBearing))
    for (const rows of Object.values(bands))
      for (const row of rows)
        for (const judged of ["score", "visible", "occluded", "occludeAt", "dim", "elevM", "aboveFogTarget"])
          assert.equal(row[judged], undefined,
            `${row.id} carries \`${judged}\` — the read decided what is visible and the page must not second-guess it`);
});

test("FALSIFIER — a number the read did not carry is ABSENT, never guessed", () => {
  const r = residentRadial(READ);
  // These are the engine's own state. Absent on this path by ruling, and null
  // rather than {} so a consumer that forgets to check fails loudly.
  assert.equal(r.observer, null);
  assert.equal(r.fog, null);
  assert.equal(r.sightReachM, null);
  assert.equal(r.aggregate, null);
  // The only count the read can honestly make.
  assert.deepEqual(r.counts, { shown: 3 });
  for (const invented of ["candidates", "visible", "occluded", "fogHidden", "clustered"])
    assert.equal(r.counts[invented], undefined,
      `counts.${invented} was invented — the door never said it`);
});

test("the spine rides through, and an empty read is still a usable radial", () => {
  assert.deepEqual(residentRadial(READ).within.map((w) => w.id),
    ["the-town/let-there-be-light", "wright/the-trueing-terrace"]);
  const empty = residentRadial({});
  assert.deepEqual(empty.within, []);
  assert.deepEqual(empty.byBearing, {});
  assert.deepEqual(empty.counts, { shown: 0 });
  assert.equal(empty.fromRead, true, "still a read-shaped radial — an empty room is not a missing one");
});

test("both door vocabularies are accepted: `nearby` (apex) and `objects` (eyes)", () => {
  const asEyes = { ...READ, objects: READ.nearby, nearby: undefined };
  const a = residentRadial(READ), b = residentRadial(asEyes);
  assert.deepEqual(Object.keys(b.byBearing).sort(), Object.keys(a.byBearing).sort());
  assert.equal(b.counts.shown, a.counts.shown);
});

test("residentReadIds names the spine AND the seen — the page resolves against both", () => {
  const ids = residentReadIds(READ);
  assert.ok(ids.has("a/near-north"));
  assert.ok(ids.has("wright/the-trueing-terrace"), "a spine mark is named by the read too");
  assert.ok(!ids.has("the-town/the-sea"), "the ground is carried, not named");
  assert.equal(ids.size, 5);
});

test("FALSIFIER — the cache key carries the crossing, so an answer never outlives its moment", () => {
  const at = { handle: "wright", x: 888.4, y: -2320.2 };
  assert.equal(residentReadKey({ ...at, crossing: 300 }), "wright|888|-2320|300");
  assert.notEqual(residentReadKey({ ...at, crossing: 300 }), residentReadKey({ ...at, crossing: 301 }),
    "the office's own fog moves with the crossing — a cache that ignored it would show last night's light");
  assert.notEqual(residentReadKey({ ...at, crossing: 300 }), residentReadKey({ ...at, handle: "rei", crossing: 300 }),
    "two residents standing in one spot are two reads");
  assert.equal(residentReadKey({ ...at, crossing: 300 }), residentReadKey({ ...at, x: 888.4, crossing: 300 }),
    "the same standpoint is the same key");
});

test("FALSIFIER — an EMBODIED read is keyed by who and when, never by where", () => {
  // The office's own refusal, in its own words: "your eyes ride your body — an
  // embodied call cannot stand at coordinates." A read taken AS a resident has
  // no coordinates to key on, and must not invent any: the where is the body's
  // and only the office knows it. Learned by shipping the other thing first —
  // the page asked for ?handle=…&x=…&y=… and dev answered 422.
  const embodied = residentReadKey({ handle: "wright", crossing: 182 });
  assert.equal(embodied, "wright|embodied|182");
  assert.equal(residentReadKey({ handle: "wright", x: null, y: null, crossing: 182 }), embodied,
    "no coordinates and null coordinates are the same standpoint: the body's");
  assert.notEqual(embodied, residentReadKey({ handle: "wright", x: 0, y: 0, crossing: 182 }),
    "and a keyless read AT a point is a different question, so a different key");
  assert.notEqual(embodied, residentReadKey({ handle: "wright", crossing: 183 }),
    "the crossing still moves it");
});

// ───────── "plus all of yours", without a fold ──────────────────────────────

import { residentMineMarks, residentById, MINE_SENTINEL_M } from "../spectator/viewer.mjs";

const PORTFOLIO = {
  drafts: [{ id: "me/sketch", kind: "sited", at: { x: 5, y: 5 }, extent: { w: 2, h: 2 }, body: "d" }],
  docket: [],
  published: [
    { id: "me/one", kind: "sited", at: { x: 10, y: 20 }, extent: { w: 3, h: 3 }, body: "p1" },
    { id: "me/a-predicate", kind: "predicated", body: "no site of its own" },
    { id: "me/far-marker", kind: "sited", at: { x: -96497, y: -95455 }, body: "a marker, not a place" },
  ],
  backed: [
    { id: "me/one", kind: "sited", at: { x: 10, y: 20 }, body: "the same mark, backed too" },
    { id: "other/backed", kind: "sited", at: { x: 40, y: 0 }, extent: { w: 1, h: 1 }, body: "b" },
  ],
  complete: true,
};

test("mine: the drawable ones are drawn, across all four lists, each once", () => {
  const { marks } = residentMineMarks(PORTFOLIO);
  assert.deepEqual([...marks.keys()].sort(), ["me/one", "me/sketch", "other/backed"]);
  assert.deepEqual(marks.get("me/one").at, { x: 10, y: 20 });
  assert.equal(marks.get("me/one").body, "p1", "published wins over the backed copy — first list, one row");
});

test("FALSIFIER — a position that is not a place is NOT drawn, and is NAMED", () => {
  const { marks, sentinel, unplaced } = residentMineMarks(PORTFOLIO);
  assert.ok(!marks.has("me/far-marker"), `a mark ${MINE_SENTINEL_M} m past the edge is not put on the map`);
  assert.deepEqual(sentinel, ["me/far-marker"], "and it is named, never silently dropped");
  assert.deepEqual(unplaced, ["me/a-predicate"], "a mark with no site is its own category, not an error");
  // the anti-vacuity half: a real position is not mistaken for a marker
  const near = residentMineMarks({ published: [{ id: "me/edge", at: { x: MINE_SENTINEL_M - 1, y: 0 } }] });
  assert.ok(near.marks.has("me/edge"), "one metre inside the magnitude is a place");
  assert.deepEqual(near.sentinel, []);
});

test("FALSIFIER — a paged portfolio says so, so a painting cannot lie by arithmetic", () => {
  assert.equal(residentMineMarks(PORTFOLIO).complete, true);
  assert.equal(residentMineMarks({ ...PORTFOLIO, complete: false }).complete, false,
    "the door is bounded at 20 a list; a page that drew the first twenty as though they were all of yours would be lying");
});

test("byId: the READ's record wins over the portfolio's thinner copy", () => {
  const read = { records: { "me/one": { id: "me/one", body: "the town's whole record", extent: { w: 9, h: 9 } } } };
  const { marks } = residentMineMarks(PORTFOLIO);
  const byId = residentById(read, marks);
  assert.equal(byId.get("me/one").body, "the town's whole record",
    "a portfolio row is a projection with fewer fields; the canon at this standpoint is the one to keep");
  assert.equal(byId.get("other/backed").body, "b", "and a mark only the portfolio knows still resolves");
  assert.equal(byId.size, 3);
});
