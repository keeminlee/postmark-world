// origin-name.test.mjs — the grid origin {0,0} is named THE ORIGIN (#2752,
// Keemin 2026-09-13: "can we just… call 0,0 the Origin?").
//
// Why this file exists: the origin used to be told to residents as "Ferry's
// crossing" — in the charter sentence the verbs hand out, in place-mark's --at
// hint, in the walkers falsifier's own reasoning — while the only mark named
// `the-town/the-quay` stands in the Long Run at (1390, 5665), and the ground at
// the origin is `the-town/the-quay-reach`. The name is now the Origin.
//
// THE CHARTER SENTENCE IS THE ONE A NEWCOMER MEETS. `CHARTER.origin` is what
// tells a resident how the grid is measured before they place their first mark,
// so it is the sentence that carries the gloss and the sentence this falsifier
// guards.
//
// THE SECOND TEST IS THE SCOPE GUARD, and it is the point of the rename. The
// ferry's CROSSINGS are events — the twice-daily tick the whole world runs on —
// and they keep their name. Only the origin stopped borrowing it. A rename that
// swept the word out of `CHARTER.clock` too would be a different, wrong change,
// and this test fails if anyone makes it.
//
//   node --test tools/origin-name.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { CHARTER } from "./world-verbs.mjs";

test("FALSIFIER — the charter measures the grid from the Origin, glossed once", () => {
  assert.match(CHARTER.origin, /from the Origin\b/,
    `the charter names the grid's origin "the Origin"; got: ${CHARTER.origin}`);

  // the gloss: a newcomer meets {0,0} and what stands there in the same breath
  assert.match(CHARTER.origin, /\{0,0\}/, "the charter sentence carries the coordinate");
  assert.match(CHARTER.origin, /where the ferry lands/, "and says what is there");

  // the retired words are gone from the sentence a resident reads
  assert.doesNotMatch(CHARTER.origin, /Ferry's crossing/,
    "the origin no longer wears the crossing's name");
  assert.doesNotMatch(CHARTER.origin, /quay/i,
    "nor the quay's — the-town/the-quay is a mark in the Long Run, 5.6 km away");

  // the sentence still says what it always said about the axes
  assert.match(CHARTER.origin, /x east, y south/);
});

test("SCOPE GUARD — the ferry's crossings are EVENTS and keep their name", () => {
  // The rename touched the origin's NAME and coordinate descriptions. It did not
  // touch the clock, and must not: "ferry crossings" here is the twice-daily
  // tick, not a place. If this goes red, a rename swept too wide.
  assert.match(CHARTER.clock, /ferry crossings/,
    `the clock still ticks at ferry crossings; got: ${CHARTER.clock}`);
  assert.match(CHARTER.clock, /twice a day/);

  // and the other charter fields are untouched by any of it
  assert.match(CHARTER.root, /let-there-be-light/);
  assert.match(CHARTER.light, /northeast/);
});
