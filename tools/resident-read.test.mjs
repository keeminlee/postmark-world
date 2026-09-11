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

// ───────── the people the read names ───────────────────────────────────────

import { walkersFromPresent } from "../spectator/viewer.mjs";

const PRESENT = {
  count: 3, shown: 3, radius_m: 500, capped: false,
  residents: [
    { handle: "rei", at: { x: 10, y: -20 }, distance_m: 22, bearing: "N", standing: true, moving: false, aboard: false, place: "the gardens" },
    { handle: "hal", at: { x: 40, y: 0 }, distance_m: 40, bearing: "E", standing: false, moving: true, aboard: false, remaining_m: 90 },
    { handle: "ghost", distance_m: 5 },                       // no position at all
  ],
};

test("present becomes walkers: at{x,y} becomes x/y, and the flags ride", () => {
  const w = walkersFromPresent(PRESENT);
  assert.deepEqual(w.map((r) => r.handle), ["rei", "hal"]);
  assert.equal(w[0].x, 10); assert.equal(w[0].y, -20);
  assert.equal(w[0].standing, true); assert.equal(w[0].place, "the gardens");
  assert.equal(w[1].moving, true);
});

test("FALSIFIER — a person with no position is DROPPED, never drawn at the origin", () => {
  const w = walkersFromPresent(PRESENT);
  assert.ok(!w.some((r) => r.handle === "ghost"),
    "a row with no `at` must not be drawn — (0,0) is Ferry's crossing, and putting someone "
    + "there is a lie the map would tell convincingly");
  // the anti-vacuity half: give it a position and it draws
  const withPlace = { residents: [{ handle: "ghost", at: { x: 1, y: 2 } }] };
  assert.equal(walkersFromPresent(withPlace).length, 1);
});

test("FALSIFIER — the READER is drawn, and a subset assertion could never have said so", () => {
  // ⚑ THIS IS THE TEST THAT WAS MISSING, and its absence is why a resident on
  // dev saw the whole town on the map and not themselves — the spectator's red
  // coordinate dot standing where their face should be. The falsifier beside
  // this one says "drawn ⊆ present", which is SATISFIED BY THE READER BEING
  // ABSENT. A subset assertion bounds a set; it can never require a member.
  //
  // `present` answers "who ELSE is about" — the office builds it with
  // `exclude: [handle]`, correctly, because presence is a thing you observe and
  // you do not observe yourself. The old path hid that for free by asking
  // /world/walkers, which returns everyone in town.
  const self = { handle: "wright", at: { x: 967, y: -2450 } };
  const w = walkersFromPresent(PRESENT, { self });
  const me = w.find((r) => r.handle === "wright");
  assert.ok(me, "the reader is not on their own map");
  assert.equal(me.x, 967); assert.equal(me.y, -2450);
  assert.equal(me.standing, true);
  assert.equal(me.self, true, "and is marked as the reader, so the renderer can tell");
  // the others are still there — adding the reader is not replacing the list
  assert.deepEqual(w.filter((r) => !r.self).map((r) => r.handle), ["rei", "hal"]);
  // THE FLIP: without `self` the reader is absent, which is the bug exactly
  assert.ok(!walkersFromPresent(PRESENT).some((r) => r.handle === "wright"),
    "without the reader handed in, nothing invents them — the fix must be the caller's doing");
});

test("FALSIFIER — the reader is NEVER drawn twice", () => {
  // If `present` ever does carry the reader — a different exclusion rule,
  // another door, a later ruling — the list's own row wins and nothing is
  // added. A reader drawn twice is a reader split in two, which is worse than
  // the bug this fixes.
  const carriesMe = { residents: [
    { handle: "wright", at: { x: 1, y: 2 }, standing: false, moving: true },
    { handle: "rei", at: { x: 10, y: -20 } },
  ] };
  const w = walkersFromPresent(carriesMe, { self: { handle: "wright", at: { x: 967, y: -2450 } } });
  assert.equal(w.filter((r) => r.handle === "wright").length, 1, "one body, one reader");
  assert.equal(w[0].x, 1, "and it is the LIST's row that wins — the door outranks the standpoint");
  assert.equal(w[0].moving, true);
});

test("a standpoint nobody is standing at draws nobody", () => {
  // `stance: "embodied"` is the read saying these coordinates are a person.
  // The caller owns that test; this asserts the shape it depends on — a self
  // with no usable position adds nothing rather than a body at the origin.
  assert.equal(walkersFromPresent({}, { self: null }).length, 0);
  assert.equal(walkersFromPresent({}, { self: { handle: "wright" } }).length, 0);
  assert.equal(walkersFromPresent({}, { self: { handle: "", at: { x: 1, y: 1 } } }).length, 0);
  assert.equal(walkersFromPresent({}, { self: { handle: "wright", at: { x: 0, y: 0 } } }).length, 1,
    "and (0,0) IS a real standpoint — Ferry's crossing — when it is the read's own");
});

test("FALSIFIER — the drawn set is a SUBSET of what the read named, never a superset", () => {
  // present ∪ {self}: the reader is the one body the read does not name and the
  // page is nonetheless right to draw, because the read's standpoint IS them.
  const named = new Set(PRESENT.residents.map((r) => r.handle));
  for (const w of walkersFromPresent(PRESENT))
    assert.ok(named.has(w.handle), `${w.handle} was drawn and the read never named them`);
  const withSelf = walkersFromPresent(PRESENT, { self: { handle: "wright", at: { x: 1, y: 1 } } });
  for (const w of withSelf)
    assert.ok(named.has(w.handle) || w.self === true,
      `${w.handle} was drawn, is not in present, and is not the reader`);
  // and an empty reading draws nobody rather than falling back to the town
  assert.deepEqual(walkersFromPresent({}), []);
  assert.deepEqual(walkersFromPresent({ residents: [] }), []);
});

test("FALSIFIER — the resident path does not ask /world/walkers", async () => {
  // A SOURCE GUARD, and it is the one the reviewer asked for: the whole-town
  // poll must not be reachable from the resident branch. Read from the bytes,
  // because the behaviour lives in a browser this test does not have.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  // ⚑ COMMENTS ARE STRIPPED FIRST, and the first version of this test did not
  // strip them — so it went red on the branch's own explanation of why the
  // whole-town poll is not used, which mentions the path by name. A source
  // guard that a COMMENT can trip is a guard that gets silenced by rewording
  // instead of by fixing, which is the opposite of what it is for. It reads
  // code now.
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  const body = code.slice(code.indexOf("async function pollWalkers()"));
  const townPoll = body.indexOf('const paths = [officeUrl("/world/walkers")');
  assert.ok(townPoll > 0, "the town-wide poll is still there for the spectator path");
  const residentArm = body.slice(0, townPoll);
  assert.ok(residentArm.includes("onResidentPath()"),
    "pollWalkers branches on the resident path before it reaches the town-wide poll");
  assert.ok(residentArm.includes("/world/present"),
    "and that branch asks who is within earshot");
  assert.ok(!residentArm.includes("/world/walkers"),
    "the resident branch must not reach the whole-town poll");
  assert.ok(/(^|[^A-Za-z])return;/.test(residentArm),
    "and it RETURNS — falling through would ask both");
});

// ───────── a fold in hand must not feed a resident's painting ──────────────

test("FALSIFIER — the drawn set is decided by WHO is reading, not by what is in hand", async () => {
  // Keemin, 2026-09-10: act as wright, switch to Spectator, switch back — and
  // the whole town came back, 89 cards. The Spectator visit loads the fold
  // (correctly) and assembles `world`; nothing cleared it on the way back, and
  // `allMarks()` preferred a fold in hand. So the overlay painted the entire
  // town while the pane composed from a thirteen-mark read: one page, two
  // answers, and the louder one won the screen.
  //
  // A SOURCE GUARD, because the behaviour lives in a browser this test does not
  // have. It reads code, not prose — comments are stripped first, the lesson
  // from the walker guard one commit ago.
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const decl = code.match(/const allMarks = \(\) =>[^;]+;/);
  assert.ok(decl, "allMarks is defined");
  assert.match(decl[0], /onResidentPath\(\)/,
    "allMarks must ask WHO is reading before it reaches for a fold — otherwise a "
    + "Spectator detour leaves one behind and the resident's painting reverts to the town");
  // and the resident arm must not consult the fold at all
  const residentArm = decl[0].slice(decl[0].indexOf("onResidentPath()"), decl[0].indexOf(":"));
  assert.ok(!/world\?\.marks/.test(residentArm),
    "the resident arm reads the index, never the fold");
  // switching back to a resident refills the index from that resident's read
  assert.match(code, /byId = residentById\(cachedRead, mineSet\.marks\)/,
    "selectActor refills byId from the returning resident's own read");
  assert.match(code, /homeSet = buildHomeSet\(data\?\.manifest, allMarks\(\)\)/,
    "and homeSet with it, or green stops meaning home");
});

test("the Spectator arm refills the index from the fold — a house outside the last resident's read is clickable again (2026-09-11)", async () => {
  // Keemin, 2026-09-11: act as wright, switch to Spectator, walk to the
  // Threshold District — "I cannot click any of the parcels in there".
  // Measured in his tab with the index exposed: after the detour `byId` held
  // 88 records and `byId.get("nyx/the-night-room-parcel").at` was null, so
  // `screenMarkCandidates` (which asks `byId` for every drawn mark's place)
  // returned no candidate and the click fell through to open ground. Fresh
  // Spectator, same house, same click: 1,185 records, `at` present, the
  // column opened. The resident arm already refills the index on the way
  // back; this asserts the Spectator arm refills it on the way out, from the
  // fold, when the fold is in hand.
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const arm = code.slice(code.indexOf("if (actor === SPECTATOR_ACTOR) {"), code.indexOf("if (!(state.whoami?.handles ?? []).includes(actor)) return;"));
  assert.ok(arm.length > 0, "the Spectator arm of selectActor is where it was");
  assert.match(arm, /byId = new Map\(world\.marks\.map\(\(m\) => \[m\.id, m\]\)\)/,
    "the Spectator arm refills byId from the fold's marks, so every drawn house has a place the click can find");
  assert.match(arm, /homeSet = buildHomeSet\(data\?\.manifest, world\.marks\)/,
    "and homeSet with it, from the same fold");
  assert.match(arm, /if \(world\) \{/,
    "guarded on the fold being in hand — with none, the telling's late fetch runs applyWorldLayer, which fills both");
});
