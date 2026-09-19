// portfolio-one-wave.test.mjs — the resident's portfolio is walked in ONE wave
// after the first page, and the wave is sized off the door's own counts
// (POS-87, postmark#2845, 2026-09-17).
//
// ── WHAT WAS WRONG ────────────────────────────────────────────────────────
//
// `loadMineMarks` awaited each page of the portfolio door before asking for the
// next. The pages do not depend on each other and never did: the door's FIRST
// answer already carries `counts`, the whole of what the household owns, so
// after one request the number of pages is known. A household of 91 published
// marks paid five serial round trips for four answers it could have had at
// once, and a signed-in reader spent that whole time looking at empty panes.
//
// ── THE CLAIM THAT IS EASY TO FAKE, AND THE ONE THAT IS EASY TO GET WRONG ──
//
// EASY TO FAKE: "the pages are parallel." A fast stub answers so quickly that a
// serial walk's requests land milliseconds apart too, and a spread threshold
// alone would pass on the unfixed code on a fast enough machine. So the stub
// holds every answer open for `DELAY` ms and the assertion that carries the
// claim is not a threshold at all: EVERY page after the first must have been
// ASKED FOR WHEN THE DOOR HAD ANSWERED EXACTLY ONCE. A serial walk cannot
// satisfy that at any speed, because page three's request does not exist until
// page two resolves — by then the door has answered twice.
//
// THE COUNT IS THE INSTRUMENT, AND IT REPLACED A MARGIN (postmark#2977). This
// file used to assert the same thing with a stopwatch: the wave's requests fall
// within `DELAY / 2` = 30 ms of each other. That is true of the viewer and also
// true of the machine — the keeper's bless gate read 40 ms and held a
// settlement for an hour because an operator was deleting 82 GB on the same
// drive at the time. The stub now records a COUNT of answers rather than a
// clock, and the count cannot be stretched: `walkMinePages` issues the whole
// wave inside one synchronous loop, and no promise settles while that loop
// runs. A test of a gate must be able to fail only for the reason it names.
//
// EASY TO GET WRONG: how many pages there are. The door pages each list
// independently at 20 against one shared offset (office `src/world.mjs` §
// `markPage`, `MARKS_PAGE = 20`) — one request answers with up to 20 drafts AND
// up to 20 published AND up to 20 backed. So the walk is as long as the LONGEST
// list, never as long as the sum. The main fixture owns 134 marks across three
// lists with 110 in the longest, so the two arithmetics disagree out loud: the
// longest says six pages, the sum says seven. The test asserts the exact
// offsets requested, so a wave sized off the sum reds on a wasted request
// rather than passing quietly.
//
// ── THE CONTROL, AND WHAT IT IS FOR ───────────────────────────────────────
//
// "The merged set equals the door's" is asserted against a SERIAL walk computed
// here, independently, from the same stub — not against a list typed out by
// hand. A hand-typed expectation is a test of what I imagined the door returns;
// walking it the old way and comparing is a test of the change. The same
// control is then pointed at a door that pages NARROWER than this walk assumes,
// where both walks truncate: the claim is not that the wave is cleverer than
// the loop, it is that it comes back with the same rows in the same order in
// every case, including the ones neither of them handles well.
//
// ── THE FLIPS (each restored byte-identical against the commit) ───────────
//
//   viewer.mjs § walkMinePages — `await fetchPage(offset)` in place of the
//     `pending.shift()` arm (the serial walk restored)
//        → "ONE WAVE" reds: pages 3..6 are asked for after page 2 answers
//   viewer.mjs § minePageCount — the four counts summed in place of `Math.max`
//        → "THE LONGEST LIST" reds, and "ONE WAVE" reds on a wasted offset 120
//   viewer.mjs § walkMinePages — the `pages >= pageLimit` arm deleted
//        → "THE WALK'S OWN CEILING" reds: an incomplete portfolio comes back
//          marked complete
//   viewer.mjs § walkMinePages — the wave pushed as thunks and called at the
//     shift (`pending.push(() => fetchPage(o))`, `await (pending.shift())()`)
//        → "ONE WAVE" reds on the ORDERING assertion alone
//
// THE LAST FLIP IS THERE BECAUSE THE FIRST ONE IS NOT ENOUGH. Restoring the
// serial await leaves the wave launched as well, so the request COUNT goes
// wrong and the offsets assertion fires before the ordering assertion is ever
// reached — which would leave the ordering claim, the one this file exists for,
// a probe nobody had seen fail. The lazy flip asks for the same six offsets in
// the same order, one at a time, so the offsets assertion stays green and only
// the ordering one reds.
//
// Run receipts in docs/2026-09-17/jetto-pos-87-first-paint-report.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { walkMinePages, minePageCount, MINE_PAGE_SIZE, MINE_PAGE_LIMIT } from "../spectator/viewer.mjs";

const LISTS = ["drafts", "docket", "published", "backed"];

// ── the door, as the office actually pages it ──────────────────────────────
//
// `markPage` ported line for line from office `src/world.mjs`, clamp included.
// THE CLAMP IS NOT A DETAIL: `start` is pinned to `rows.length - 1`, so a list
// shorter than the offset does not answer with an empty page — it answers with
// its LAST ROW, again, at every offset past its end. A stub that returned []
// there would be a kinder door than the real one, and the walk's dedupe (the
// `list:id` set) is what makes that harmless. Testing against the kind version
// would leave the dedupe unexercised on the very path that needs it.
function markPage(rows, offset = 0, pageSize = MINE_PAGE_SIZE) {
  const start = Math.min(Math.max(Number(offset) || 0, 0), Math.max(rows.length - 1, 0));
  const page = rows.slice(start, start + pageSize);
  const rest = [...rows.slice(0, start), ...rows.slice(start + page.length)].map((m) => m.id);
  return { page, rest, offset: start, complete: rest.length === 0 };
}

const rowsFor = (list, n) => Array.from({ length: n }, (_, i) => ({
  id: `${list}-household/mark-${String(i).padStart(4, "0")}`,
  by: `${list}-household`,
  at: { x: i, y: -i },
}));

const emptyDoor = () => ({ drafts: [], docket: [], published: [], backed: [] });
const countsOf = (door) => Object.fromEntries(LISTS.map((l) => [l, door[l].length]));

// 134 marks, 110 in the longest list. The longest says six pages; the sum says
// seven. They are meant to disagree.
const DOOR = { ...emptyDoor(), drafts: rowsFor("drafts", 2), published: rowsFor("published", 110), backed: rowsFor("backed", 22) };

const DELAY = 60;   // every answer is held open this long — see the header

/**
 * A stub door that records, per request, HOW MANY ANSWERS IT HAD ALREADY GIVEN
 * when that request was made. Not when — how many. The door keeps no clock.
 *
 * `answersWhenAsked` is the whole instrument. It is a count of events this door
 * caused, read at the moment of another event it caused, so it cannot drift,
 * cannot be stretched by a busy machine, and has no threshold anywhere in it.
 * A wall-clock field would be a standing invitation to write a margin against
 * it, which is the arm postmark#2977 removed, so there is no such field to
 * reach for.
 *
 * `counts` defaults to the truth about `door`; `doorPageSize` is the door's own
 * page, which is 20 in the office today and is a parameter here only so the
 * narrower-door case can be walked at all.
 */
function stubDoor({ door = DOOR, counts = null, delay = DELAY, doorPageSize = MINE_PAGE_SIZE } = {}) {
  const said = counts ?? countsOf(door);
  const log = [];
  let answers = 0;   // answers this door has RESOLVED, counted as each one resolves
  const fetchPage = (offset) => {
    const entry = { offset, answersWhenAsked: answers };
    log.push(entry);
    const paged = Object.fromEntries(LISTS.map((l) => [l, markPage(door[l], offset, doorPageSize)]));
    const withheld = LISTS.reduce((n, l) => n + paged[l].rest.length, 0);
    const answer = {
      ...Object.fromEntries(LISTS.map((l) => [l, paged[l].page])),
      counts: said,
      complete: withheld === 0,
    };
    return new Promise((resolve) => setTimeout(() => { answers += 1; resolve(answer); }, delay));
  };
  return { fetchPage, log };
}

/** The walk as it was before this lane: one page at a time, each awaited. */
async function serialWalk(fetchPage, { pageSize = MINE_PAGE_SIZE, pageLimit = MINE_PAGE_LIMIT } = {}) {
  const merged = { drafts: [], docket: [], published: [], backed: [], complete: true };
  const seen = new Set();
  let offset = 0, pages = 0, exhausted = false, counts = null;
  for (;;) {
    const page = await fetchPage(offset);
    counts ??= page?.counts ?? null;
    let added = 0;
    for (const list of LISTS)
      for (const row of page?.[list] ?? []) {
        const tag = `${list}:${row?.id}`;
        if (!row?.id || seen.has(tag)) continue;
        seen.add(tag); merged[list].push(row); added += 1;
      }
    pages += 1;
    const done = counts ? LISTS.every((l) => merged[l].length >= (counts[l] ?? 0)) : page?.complete !== false;
    if (done || added === 0) break;
    if (pages >= pageLimit) { exhausted = true; merged.complete = false; break; }
    offset += pageSize;
  }
  return { merged, pages, exhausted };
}

const idsOf = (merged) => Object.fromEntries(LISTS.map((l) => [l, merged[l].map((r) => r.id)]));

// ───────────────────────────────────────────────────────────────────────────

test("THE LONGEST LIST IS THE PAGE COUNT, NEVER THE SUM", () => {
  // the household POS-87 was measured on: 115 marks, 91 in the longest list
  assert.equal(minePageCount({ drafts: 2, docket: 0, published: 91, backed: 22 }), 5,
    "five pages hold 91 published; the sum (115) would ask for six and the sixth is empty");
  // four full lists: the sum is four times the truth
  assert.equal(minePageCount({ drafts: 20, docket: 20, published: 20, backed: 20 }), 1,
    "four lists of twenty arrive in ONE page — the door pages each list, not the concatenation");
  assert.equal(minePageCount(countsOf(DOOR)), 6, "110 in the longest list is six pages");
  assert.equal(minePageCount({}), 1, "a door that says nothing is still asked once");
  assert.equal(minePageCount({ drafts: 0, docket: 0, published: 0, backed: 0 }), 1,
    "an empty household is still asked once — the first page is asked before anything is known");
});

test("ONE WAVE: every page after the first is asked for before page two answers", async () => {
  const { fetchPage, log } = stubDoor();
  const walked = await walkMinePages(fetchPage);

  assert.deepEqual(log.map((e) => e.offset), [0, 20, 40, 60, 80, 100],
    "the door was not asked for exactly the six pages its counts imply");
  assert.equal(walked.pages, 6);

  const wave = log.filter((e) => e.offset >= 20);

  // THE CLAIM, AS AN ORDER RATHER THAN A CLOCK (postmark#2977). Every page of
  // the wave was asked for when this door had answered EXACTLY ONCE — page one,
  // whose `counts` sized the wave — and not one answer more.
  //
  // The one equality is two-sided, which is why it replaced three comparisons:
  //
  //   more than 1  the walk is still serial. Page three's request did not exist
  //                until page two resolved, so the door had answered twice
  //                before it arrived.
  //   less than 1  the wave was launched before the door said what the household
  //                owns, so it was not sized from `counts` at all.
  //
  // AND IT CANNOT BE BROKEN BY A BUSY MACHINE. `walkMinePages` issues the whole
  // wave inside one synchronous loop; no timer can fire and no promise can
  // settle while that loop runs, so the count this reads is fixed by the
  // language, not by how fast the box was. The arm this replaced asserted that
  // the wave's requests fell within `DELAY / 2` of wall clock — true of the
  // viewer, but also an instrument of the disk: it read 40 ms and held a
  // settlement's bless for an hour while an operator deleted a folder on the
  // same drive. A margin that reds on someone else's I/O is not measuring this
  // walk.
  for (const entry of wave)
    assert.equal(entry.answersWhenAsked, 1,
      `the page at offset ${entry.offset} was asked for after this door had answered ${entry.answersWhenAsked} times, not once: `
      + (entry.answersWhenAsked > 1
        ? "pages of the wave are waiting on each other, so the walk is still serial"
        : "the wave was launched before the door's counts arrived, so it was not sized from them"));
});

test("THE MERGED SET IS WHAT SERIAL WALKING PRODUCED, ROW FOR ROW", async () => {
  const wave = await walkMinePages(stubDoor().fetchPage);
  const serial = await serialWalk(stubDoor({ delay: 0 }).fetchPage);

  assert.deepEqual(idsOf(wave.merged), idsOf(serial.merged),
    "the wave and the serial walk disagree about what this household owns");
  assert.equal(wave.pages, serial.pages, "the wave asked for a different number of pages than the walk needed");
  assert.equal(wave.exhausted, serial.exhausted);
  assert.equal(wave.merged.complete, serial.merged.complete);

  // and it is the WHOLE door, not a prefix of it — the arithmetic lie this
  // walk exists to prevent
  for (const list of LISTS)
    assert.deepEqual(wave.merged[list].map((r) => r.id), DOOR[list].map((r) => r.id),
      `the ${list} list came back short or out of order`);
});

test("A NARROWER DOOR IS WALKED THE SAME WAY IT ALWAYS WAS", async () => {
  // If the office ever pages smaller than this walk steps, both walks collect
  // the same rows and stop in the same place — the wave sizes itself from
  // `counts`, and when the pages come back thinner than that implies, the loop
  // goes on exactly as the serial one did. The claim is NOT that the wave
  // rescues this: it is that it changes nothing about it.
  const narrow = { door: DOOR, doorPageSize: 10 };
  const wave = await walkMinePages(stubDoor({ ...narrow, delay: 0 }).fetchPage);
  const serial = await serialWalk(stubDoor({ ...narrow, delay: 0 }).fetchPage);

  assert.deepEqual(idsOf(wave.merged), idsOf(serial.merged),
    "against a narrower door the wave and the loop disagree about what came back");
  assert.equal(wave.pages, serial.pages);
  assert.ok(wave.merged.published.length < DOOR.published.length,
    "this fixture is meant to come up short; if it does not, it is not testing the short case");
});

test("THE WALK'S OWN CEILING STILL BOUNDS IT, AND SAYS SO", async () => {
  // 300 published marks is fifteen pages of twenty, past the walk's ceiling of
  // twelve. The door really holds them — a fixture whose `counts` claim more
  // than its rows would end the walk on "this page added nothing" and never
  // reach the ceiling at all, which is how this test first passed for the
  // wrong reason.
  const big = { ...emptyDoor(), published: rowsFor("published", 300) };
  const { fetchPage, log } = stubDoor({ door: big, delay: 0 });
  const walked = await walkMinePages(fetchPage);

  assert.equal(log.length, MINE_PAGE_LIMIT,
    `the walk asked for ${log.length} pages against a ceiling of ${MINE_PAGE_LIMIT}`);
  assert.equal(walked.pages, MINE_PAGE_LIMIT);
  assert.equal(walked.exhausted, true, "the walk stopped at its ceiling and did not say so");
  assert.equal(walked.merged.complete, false,
    "an incomplete portfolio came back marked complete, and the page would draw it as all of yours");

  const serial = await serialWalk(stubDoor({ door: big, delay: 0 }).fetchPage);
  assert.deepEqual(idsOf(walked.merged), idsOf(serial.merged),
    "at the ceiling the wave and the loop kept different rows");
});

test("A HOUSEHOLD THAT FITS IN ONE PAGE STILL COSTS ONE REQUEST", async () => {
  const small = { ...emptyDoor(), drafts: rowsFor("drafts", 1), published: rowsFor("published", 3) };
  const { fetchPage, log } = stubDoor({ door: small });
  const walked = await walkMinePages(fetchPage);
  assert.deepEqual(log.map((e) => e.offset), [0], "a household inside one page was asked for a second one");
  assert.equal(walked.pages, 1);
  assert.equal(walked.merged.complete, true);
});

test("A DOOR THAT CARRIES NO COUNTS IS STILL WALKED, ONE PAGE AT A TIME", async () => {
  // `counts` is what sizes the wave; without it there is nothing to size from
  // and the walk falls back to what it always did — ask, look, ask again.
  const { fetchPage, log } = stubDoor({ counts: undefined, delay: 0 });
  const noCounts = (offset) => fetchPage(offset).then(({ counts, ...rest }) => rest);
  const walked = await walkMinePages(noCounts);
  const serial = await serialWalk((offset) => stubDoor({ counts: undefined, delay: 0 }).fetchPage(offset)
    .then(({ counts, ...rest }) => rest));

  assert.ok(log.length > 1, "a countless door was asked once and believed");
  assert.deepEqual(idsOf(walked.merged), idsOf(serial.merged),
    "without counts the wave and the loop disagree");
});
