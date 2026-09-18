// lately-pages-and-filters.test.mjs — the Lately rail's "more" and its kind
// chips, asked of the pure read (POS-90, #2846, 2026-09-18).
//
// The rail composes four sources client-side and cuts them once, at `limit: 14`.
// Two things are being added and only one of them is new arithmetic:
//
//   • MORE is `offset`, not a bigger `limit`. The distinction is the whole
//     feature. Raising the cut re-publishes every row the reader has already
//     read, and — because each source is bounded — can never reach past one
//     page's worth at the far end. Walking a window of fourteen down the list
//     is a different read, and the `[falsifier]` at the foot of this file is
//     red for any build where the two are the same.
//
//   • THE FILTER IS BEFORE THE CUT. A reader who presses "stakes" wants a page
//     of fourteen stakes, not the stakes that happened to survive a page of
//     everything. The fixture below puts every stake on the OLDEST twelve days
//     precisely so the two orders of operations cannot both be green: filtering
//     after the cut returns nothing, filtering before it returns all twelve.
//
// Pure — no rig, no ports, no browser. The page-driven legs (two presses → 42
// rows, a chosen kind → every row `data-kind="stake"`) live in
// `tools/lately-more-on-the-page.test.mjs`.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_KINDS,
  activityFeed,
  activityWantsWider,
  recentActivity,
} from "../spectator/viewer.mjs";

const NOW = "2026-09-18T12:00:00Z";
const DAY0 = Date.parse("2026-09-18T00:00:00Z");
const pad = (n) => String(n).padStart(2, "0");
// `back` days before 2026-09-18, as the record spells a day.
const day = (back) => new Date(DAY0 - back * 86_400_000).toISOString().slice(0, 10);

// ── THE FIXTURE ────────────────────────────────────────────────────────────
//
// Seventy rows over thirty days — comfortably past the 28 the brief asks the
// paging to be proved over, and shaped so each kind's rows sit where the test
// needs them:
//
//   days  0-29  one walk each, a different handle every day (latest-per-day
//               collapses a handle's own departures, and thirty handles is how
//               you get thirty walks rather than one)
//   days  0-19  one mark each
//   days 18-29  one stake each — the OLDEST end, on purpose (see the header)
//   days  0-7   one blessing each
//
// Within a day the sort is by time descending, so a day that has all of them
// reads blessing (18:00), walk (12:00), stake (06:00), mark (no time at all).
const departures = Array.from({ length: 30 }, (_, back) => ({
  iso: `${day(back)}T12:00:00.000Z`,
  handle: `walker-${pad(back)}`,
  toward: { x: back, y: back },
  targetMarkId: `w/mark-${pad(back)}`,
}));
const marks = Array.from({ length: 20 }, (_, back) => ({
  id: `m/mark-${pad(back)}`,
  date: day(back),
  by: `writer-${pad(back)}`,
}));
const stakes = Array.from({ length: 12 }, (_, i) => ({
  iso: `${day(18 + i)}T06:00:00.000Z`,
  handle: `backer-${pad(18 + i)}`,
  mark: `m/mark-${pad(18 + i)}`,
  n: 3 + i,
}));
const blessings = Array.from({ length: 8 }, (_, back) => ({
  date: `${day(back)}T18:00:00.000Z`,
  n: 70 - back,
}));
const FIXTURE = { departures, marks, stakes, blessings, now: NOW };
const TOTAL = 30 + 20 + 12 + 8;

// A row's identity for overlap/gap work: kind + day + who + subject is unique
// across this fixture and says what a reader would actually see twice.
const idOf = (r) => `${r.kind}|${r.day}|${r.who}|${r.subject ?? ""}|${r.n ?? ""}`;

test("lately: offset pages the record without overlap or gap", () => {
  const p1 = activityFeed({ ...FIXTURE, limit: 14, offset: 0 });
  const p2 = activityFeed({ ...FIXTURE, limit: 14, offset: 14 });
  const p3 = activityFeed({ ...FIXTURE, limit: 14, offset: 28 });

  assert.equal(p1.total, TOTAL, "`total` counts what is composed, not what is shown");
  assert.equal(p1.rows.length, 14);
  assert.equal(p2.rows.length, 14);
  assert.equal(p3.rows.length, 14);

  const walked = [...p1.rows, ...p2.rows, ...p3.rows].map(idOf);
  assert.equal(new Set(walked).size, 42, "no row is published twice");
  // NO GAP: three pages of fourteen are the first forty-two rows of the one
  // list, in the one order — which is the claim "append the next page" makes.
  const straight = recentActivity({ ...FIXTURE, limit: 42, offset: 0 }).map(idOf);
  assert.deepEqual(walked, straight, "the pages are the list, cut into three");

  // The far end: a page that runs out returns what is left, and says so.
  const last = activityFeed({ ...FIXTURE, limit: 14, offset: 63 });
  assert.equal(last.rows.length, TOTAL - 63, "the tail is as long as the tail is");
  assert.equal(last.more, false, "and nothing follows it");
  assert.equal(p1.more, true, "while the first page has sixty rows behind it");
  assert.deepEqual(activityFeed({ ...FIXTURE, limit: 14, offset: TOTAL }).rows, [],
    "past the end is empty, not a throw and not a wrap");
});

test("lately: the first page is unchanged by the paging that was added under it", () => {
  // THE ONE BYTE-IDENTITY THAT MATTERS. Every reader who never presses "more"
  // must get exactly the rail they had: `offset` absent, `kinds` absent, the
  // same fourteen in the same order as the call site has asked for since
  // 2026-08-08.
  const before = recentActivity({ departures, marks, stakes, blessings, now: NOW, limit: 14 });
  const after = activityFeed({ ...FIXTURE, limit: 14, offset: 0, kinds: null }).rows;
  assert.deepEqual(after, before);
  assert.equal(before.length, 14);
});

test("lately: a kind filter returns only that kind, and pages within it", () => {
  for (const kind of ACTIVITY_KINDS) {
    const only = activityFeed({ ...FIXTURE, limit: 100, kinds: [kind] });
    assert.ok(only.rows.length > 0, `the fixture carries ${kind} rows`);
    assert.deepEqual([...new Set(only.rows.map((r) => r.kind))], [kind],
      `choosing ${kind} returns ${kind} rows and nothing else`);
  }

  // PAGING WITHIN A KIND. Twenty marks is one full page and a short one.
  const m1 = activityFeed({ ...FIXTURE, limit: 14, offset: 0, kinds: ["mark"] });
  const m2 = activityFeed({ ...FIXTURE, limit: 14, offset: 14, kinds: ["mark"] });
  assert.equal(m1.total, 20, "`total` is the count after the filter");
  assert.equal(m1.rows.length, 14);
  assert.equal(m1.more, true);
  assert.equal(m2.rows.length, 6);
  assert.equal(m2.more, false);
  assert.equal(new Set([...m1.rows, ...m2.rows].map(idOf)).size, 20, "every mark once");

  // Several kinds at once is the same read with a wider set — the chip row does
  // not use it today and the filter has no reason to refuse it.
  const both = activityFeed({ ...FIXTURE, limit: 100, kinds: ["stake", "settlement"] });
  assert.equal(both.total, 12 + 8);
  // An empty list is not a filter that excludes everything — it is no filter,
  // the same as `all`. A chip row whose "all" hands `[]` must not empty the rail.
  assert.equal(activityFeed({ ...FIXTURE, limit: 100, kinds: [] }).total, TOTAL);
  assert.equal(activityFeed({ ...FIXTURE, limit: 100, kinds: null }).total, TOTAL);
  // A kind nobody has: an honest empty, not everything.
  assert.deepEqual(activityFeed({ ...FIXTURE, limit: 100, kinds: ["enter"] }).rows, []);
});

test("lately: a page that runs past what is composed asks for a wider source", () => {
  // THE WIDEN PATH, on the fixture the brief names: departures older than the
  // window. With a fortnight's window the rail composes only what is inside it,
  // and the reader's second page runs off the end — which is the signal to widen
  // the source rather than to tell the reader there is nothing more.
  const since14 = new Date(Date.parse(NOW) - 14 * 86_400_000).toISOString();
  const since28 = new Date(Date.parse(NOW) - 28 * 86_400_000).toISOString();
  const windowed = (since) => departures.filter((d) => d.iso >= since);

  const narrow = activityFeed({ ...FIXTURE, departures: windowed(since14), limit: 14, kinds: ["walk"] });
  // Fifteen, not fourteen: the window is a `>=` against an instant, and the walk
  // fourteen days back is at the same second as the boundary. The arithmetic is
  // the fixture's own, not a copy of the page's.
  assert.equal(narrow.total, 15, "a fortnight of days is a fortnight of walks");
  assert.equal(activityWantsWider({ offset: 14, limit: 14, total: narrow.total }), true,
    "page two runs past the fortnight — widen the window, do not report the end of the record");

  const wide = activityFeed({ ...FIXTURE, departures: windowed(since28), limit: 14, kinds: ["walk"] });
  assert.equal(wide.total, 29, "another fortnight brings back another fourteen");
  assert.equal(activityWantsWider({ offset: 14, limit: 14, total: wide.total }), false,
    "and page two now fits inside what is composed");

  // The far end of the widened record still ends. A source with nothing more to
  // give is what closes the control, and this is the arithmetic that says so.
  assert.equal(activityWantsWider({ offset: 28, limit: 14, total: wide.total }), true);
  assert.equal(activityWantsWider({ offset: 14, limit: 14, total: 30 }), false);
  assert.equal(activityWantsWider({ offset: 0, limit: 14, total: 0 }), true,
    "a rail with nothing composed at all is the widest case of the same question");
  assert.equal(activityWantsWider({}), false, "no page asked for, nothing to widen");
});

test("lately [falsifier]: raising the cut is not paging, and the filter is not after it", () => {
  // ── LEG 1 — `offset` must MOVE the window ────────────────────────────────
  //
  // The build this test exists to catch is the cheap one: "more" implemented as
  // `limit += 14`, the whole list re-rendered from the top. Under it `offset` is
  // a no-op, so page two IS page one and both assertions below go red. Under a
  // real paging build page two is rows 15-28 of the one list and neither can.
  const p1 = recentActivity({ ...FIXTURE, limit: 14, offset: 0 });
  const p2 = recentActivity({ ...FIXTURE, limit: 14, offset: 14 });
  const overlap = p2.filter((row) => p1.some((held) => idOf(held) === idOf(row)));
  assert.deepEqual(overlap, [], "page two must share no row with page one");
  assert.deepEqual(p2.map(idOf), recentActivity({ ...FIXTURE, limit: 28 }).slice(14).map(idOf),
    "page two is rows 15-28 of the record, which a raised `limit` alone can never be");

  // ── LEG 2 — the filter must run BEFORE the cut ───────────────────────────
  //
  // Every stake in the fixture is on the oldest twelve days, so none of them is
  // in the newest fourteen rows. A build that cuts first and filters after hands
  // the reader an empty rail and calls it "the stakes".
  const newest14 = recentActivity({ ...FIXTURE, limit: 14 });
  assert.equal(newest14.filter((r) => r.kind === "stake").length, 0,
    "the fixture's premise: no stake is inside a page of everything");
  const stakePage = activityFeed({ ...FIXTURE, limit: 14, kinds: ["stake"] });
  assert.equal(stakePage.rows.length, 12, "choosing stakes shows the stakes, all twelve of them");
  assert.deepEqual([...new Set(stakePage.rows.map((r) => r.kind))], ["stake"]);
});
