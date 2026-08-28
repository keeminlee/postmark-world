// terms-sheet-placement.test.mjs — THE DOSSIER RENDERED BELOW THE FOLD.
//
// The founder pressed `enter` on a terms-bearing mark, and the button reverted
// to "enter" with nothing to show for it. The sheet was there. It was just
// nowhere he could see it.
//
// crossInto appended the door's answer with
// `card.insertAdjacentHTML("beforeend", sheet)`. By the time it runs, the card
// already ends with a full investigate expansion tree — opened unconditionally
// when the pinned bubble is built — and the pinned bubble is a 32rem scroll box
// (`.wv-bubble.is-pinned { max-height:min(64%,32rem); overflow-y:auto }`).
// Nothing scrolled it into view. So the terms landed past the bottom of a
// scroll container the reader had no reason to scroll, and the door read as
// broken while working perfectly.
//
// THE FIX IS WHERE, NOT WHETHER: the answer goes beside the byline row that
// holds the button that was pressed, which is where the door is, and the
// inserted node is scrolled into its own container's view.
//
// ── on what this harness can and cannot prove ───────────────────────────────
// jsdom has NO LAYOUT ENGINE. `getBoundingClientRect()` returns all zeros for
// every element and `scrollIntoView` is not implemented at all, so the
// assertion one would most like to make — that the sheet's rect lies inside its
// scroll container's visible box — cannot be made here and is NOT made below.
// A test asserting it against jsdom's zeros would pass identically before and
// after the fix, which is worse than no test.
//
// What IS asserted is the root cause, which is layout-free and exact: DOM
// ORDER. The sheet must be a sibling immediately after the byline row and
// BEFORE the expansion tree — the tall thing that was pushing it out of sight.
// Beside it: that the scroll is requested at all, and that the answer lands in
// the card that is actually on the page. Verifying it with human eyes on the
// dev stage is Wright's pass, not this file's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import {
  crossingSheetHTML, enterButtonHTML, liveMarkCard, markCellBylineRow, placeCrossingSheet,
} from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SOURCE = read("spectator/viewer.mjs");
// THE OFFICE'S OWN ANSWER, generated rather than written down
// (tools/terms-ask-fixture.mjs). The fixture this file used to rely on was
// hand-written and had drifted: the note really reads "Entering here means…",
// not "Crossing this threshold means…", and the office ships a `reading_law`
// the hand-written one had never heard of.
const ASKS = JSON.parse(read("tools/fixtures/terms-ask.json"));
const MARK = ASKS.bare.awaiting.mark;

// The card as the page really builds it: the byline row carrying the enter
// button, then the investigate expansion tree that renderExpansion appends —
// the tall thing that was pushing the answer off the bottom of the bubble.
function mountBubble(dom, { markId = MARK } = {}) {
  const root = dom.window.document.body;
  root.innerHTML = `<div class="wv-bubble is-pinned">`
    + `<article class="wv-card fov" data-id="${markId}">`
    + `<div class="cbody">a door</div>`
    + markCellBylineRow({ by: "the-town", date: "2026-08-27" },
        `<span class="wv-cell-actions">${enterButtonHTML(markId)}</span>`)
    + `<div class="cmeta"></div>`
    + `<div class="wv-expansion">${Array.from({ length: 24 },
        (_, i) => `<div class="wv-rnode" data-id="x/${i}">a relative</div>`).join("")}</div>`
    + `</article></div>`;
  return { root, card: root.querySelector(".wv-card") };
}

function freshDom() {
  const dom = new JSDOM(`<!doctype html><body></body>`);
  // jsdom implements no layout, so it ships no scrollIntoView. Standing one up
  // is what lets the call be OBSERVED; it is not what makes it correct.
  const seen = [];
  dom.window.Element.prototype.scrollIntoView = function scrollIntoView(opts) { seen.push({ el: this, opts }); };
  return { dom, seen };
}

test("THE FALSIFIER: the door's answer lands beside the door, not past the end of the expansion tree", () => {
  const { dom } = freshDom();
  const { card } = mountBubble(dom);
  const sheet = crossingSheetHTML(ASKS.bare, MARK);
  assert.ok(sheet, "the office's real ask renders a sheet at all");

  const node = placeCrossingSheet(card, sheet);
  assert.ok(node && node.isConnected, "the sheet is on the page");
  assert.ok(node.classList.contains("wv-cross-sheet"));

  // THE ASSERTION THAT WAS RED. Appended `beforeend`, the sheet is the card's
  // LAST child — after 24 relation nodes, inside a 32rem scroll box.
  const byline = card.querySelector(".wv-cell-byline-row");
  assert.equal(node.previousElementSibling, byline,
    "the answer must sit immediately after the byline row that holds the button that was pressed");
  const tree = card.querySelector(".wv-expansion");
  assert.equal(node.compareDocumentPosition(tree) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    "and BEFORE the expansion tree — the tall thing that was pushing it out of sight");
});

test("and the inserted node asks to be scrolled into its own container's view", () => {
  // Placement alone is not enough: the bubble may already be scrolled down, and
  // a reader who has to hunt for the answer is in the same position as a reader
  // who never got one.
  const { dom, seen } = freshDom();
  const { card } = mountBubble(dom);
  const node = placeCrossingSheet(card, crossingSheetHTML(ASKS.bare, MARK));
  assert.equal(seen.length, 1, "exactly one scroll was requested");
  assert.equal(seen[0].el, node, "and it was the sheet, not the card or the bubble");
  assert.deepEqual(seen[0].opts, { block: "nearest" },
    "`nearest` — bring it into view without yanking a reader who can already see it");
});

test("THE RESIDUAL: a re-render between the click and the answer must not send the sheet into an orphan", () => {
  // crossInto awaits the office. A re-render in that window replaces the card
  // node the closure captured, and the replaced node is still a perfectly good
  // object to write into — it is simply no longer on the page. That failure
  // looks EXACTLY like the one being fixed, so it is closed in the same act.
  const { dom } = freshDom();
  const { root, card } = mountBubble(dom);
  const stale = card;
  // the re-render: same mark, brand new nodes
  mountBubble(dom);
  const live = root.querySelector(`.wv-card[data-id="${MARK}"]`);
  assert.notEqual(live, stale, "the page moved under us");
  assert.equal(stale.isConnected, false, "and the captured reference is an orphan");

  const resolved = liveMarkCard(root, MARK, stale);
  assert.equal(resolved, live, "the live card is found by data-id, not trusted from before the await");
  placeCrossingSheet(resolved, crossingSheetHTML(ASKS.bare, MARK));
  assert.equal(live.querySelectorAll(".wv-cross-sheet").length, 1, "the answer is on the page");
  assert.equal(stale.querySelectorAll(".wv-cross-sheet").length, 0, "and not in the orphan");
});

test("liveMarkCard keeps a card that is still connected, and answers null when there is no card at all", () => {
  const { dom } = freshDom();
  const { root, card } = mountBubble(dom);
  assert.equal(liveMarkCard(root, MARK, card), card, "a connected card is the live card — no needless re-query");
  assert.equal(liveMarkCard(root, MARK, null), card, "and it is found by id when nothing was captured");
  assert.equal(liveMarkCard(root, "nobody/here", null), null);
  assert.equal(liveMarkCard(null, MARK, null), null);
});

test("a card with no byline row still gets its answer — the fallback is the old behaviour, not nothing", () => {
  // Not every surface that can enter builds a byline row. Falling back to the
  // card's end is exactly what the page did before, so the worst case is
  // unchanged rather than newly broken.
  const { dom, seen } = freshDom();
  const doc = dom.window.document;
  doc.body.innerHTML = `<article class="wv-card" data-id="${MARK}"><div class="cbody">bare</div></article>`;
  const card = doc.querySelector(".wv-card");
  const node = placeCrossingSheet(card, crossingSheetHTML(ASKS.bare, MARK));
  assert.ok(node?.isConnected);
  assert.equal(card.lastElementChild, node, "appended at the end, as before");
  assert.equal(seen.length, 1, "and still scrolled to");
});

test("THE CLASS: an enter affordance with NO card at all still has somewhere to put the answer", () => {
  // The founder's own standing list (docs 2026-08-27, A1) names the wider
  // class: the sheet needs a guaranteed render home wherever an enter
  // affordance lives, not only on roster cards. `card?.insertAdjacentHTML`
  // silently did nothing when the optional chain came up empty — a click that
  // vanishes, which is the same symptom from a different cause.
  const { dom } = freshDom();
  const doc = dom.window.document;
  doc.body.innerHTML = `<div class="wv-somewhere-else">`
    + markCellBylineRow(null, `<span class="wv-cell-actions">${enterButtonHTML(MARK)}</span>`)
    + `</div>`;
  const button = doc.querySelector("[data-enter]");
  const node = placeCrossingSheet(null, crossingSheetHTML(ASKS.bare, MARK), { button });
  assert.ok(node?.isConnected, "the answer is on the page even with no .wv-card anywhere");
  assert.equal(node.previousElementSibling, button.closest(".wv-cell-byline-row"),
    "and still beside the button that was pressed");
});

test("the pressed button's OWN row wins over some other card's row", () => {
  // Two enter affordances on one page is the ordinary case (a card and a
  // bubble showing the same mark). The answer belongs at the button the reader
  // actually pressed, not at whichever row a querySelector happened to reach.
  const { dom } = freshDom();
  const doc = dom.window.document;
  doc.body.innerHTML = `<article class="wv-card" data-id="${MARK}">`
    + `<div class="wv-cell-byline-row" id="first">${enterButtonHTML(MARK)}</div>`
    + `<div class="wv-cell-byline-row" id="second">${enterButtonHTML(MARK)}</div>`
    + `</article>`;
  const card = doc.querySelector(".wv-card");
  const button = doc.querySelector("#second [data-enter]");
  const node = placeCrossingSheet(card, crossingSheetHTML(ASKS.bare, MARK), { button });
  assert.equal(node.previousElementSibling?.id, "second", "the answer follows the press");
});

test("THE REFUSAL GETS THE SAME TREATMENT — a door that says no must be as visible as one that asks", () => {
  // The catch branch had its own hand-rolled `insertAdjacentHTML("beforeend")`,
  // so fixing only the terms path would have left the refusal below the fold —
  // half a fix that reads as a whole one until someone is refused.
  assert.match(SOURCE, /placeCrossingSheet\(liveCard\(\),[\s\S]{0,220}?wv-cross-sheet is-refused/,
    "the catch places its sheet through the same function");
  assert.doesNotMatch(SOURCE, /card\?\.insertAdjacentHTML\("beforeend"/,
    "no crossing sheet is appended to a card's end by hand any more");
});

test("THE WIRING: crossInto re-resolves the card after the await and re-places the bubble it grew", () => {
  assert.match(SOURCE, /const liveCard = \(\) => liveMarkCard\(root, markId, clicked\)/,
    "the card is a function of the live DOM, not a value captured before the await");
  assert.match(SOURCE, /placeCrossingSheet\(liveCard\(\), sheet, \{ button \}\);\s*\n\s*positionBubbles\(\)/,
    "and the bubble is re-placed after it grows, or the sheet is pushed off the pane it was just put on");
});
