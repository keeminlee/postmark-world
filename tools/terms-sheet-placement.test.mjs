// terms-sheet-placement.test.mjs — THE DOSSIER RENDERED BELOW THE FOLD.
//
// The founder pressed `enter` on a terms-bearing mark, and the button reverted
// to "enter" with nothing to show for it. The sheet was there. It was just
// nowhere he could see it: crossInto appended the door's answer with
// `card.insertAdjacentHTML("beforeend", sheet)`, after the card's full
// investigate expansion tree, inside a pinned bubble that is a scroll box.
// Nothing scrolled it into view. The door read as broken while working.
//
// THE FIX IS WHERE, NOT WHETHER: the answer goes beside the byline row that
// holds the button that was pressed, which is where the door is, and the
// inserted node is scrolled into its own container's view.
//
// ── on this harness ──────────────────────────────────────────────────────────
// The party lineage tested this with jsdom. The world's suite runs with NO
// dependencies — the CI workflow installs nothing and the box's candle runs
// the same suite — so a jsdom import here would red every crossing. The DOM the
// two functions touch is small (isConnected, closest, querySelector(All),
// insertAdjacentHTML, nextElementSibling, lastElementChild, scrollIntoView,
// dataset), so a fake of exactly that surface stands in. It has no layout, like
// jsdom; what it CAN prove is the root cause, which is layout-free and exact:
// DOM ORDER, and that the scroll was asked for. Eyes on the dev stage remain
// Wright's pass, not this file's.
//
// Built on the party lineage (world 21a2d2bd), lost in the 08-29 rollback,
// ported 2026-09-16 (POS-91 / postmark#2847). The office's generated ask
// fixture did not come along — the sheet's own text is covered by
// terms-door.test.mjs; this file is about WHERE it lands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { liveMarkCard, placeCrossingSheet } from "../spectator/viewer.mjs";

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

// ── a DOM the size of the question ──────────────────────────────────────────
class El {
  constructor(tag, { classes = [], dataset = {}, id = null } = {}) {
    this.tag = tag; this.classes = new Set(classes); this.dataset = { ...dataset }; this.id = id;
    this.children = []; this.parentElement = null; this.scrolls = [];
  }
  get classList() { const s = this.classes; return { contains: (c) => s.has(c) }; }
  get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n.tag === "body"; }
  get nextElementSibling() { const sib = this.parentElement?.children ?? []; return sib[sib.indexOf(this) + 1] ?? null; }
  get lastElementChild() { return this.children[this.children.length - 1] ?? null; }
  append(...els) { for (const e of els) { e.parentElement = this; this.children.push(e); } return this; }
  matches(sel) {
    // ".a.b[data-x]" — class and attribute-presence selectors, which is all the code uses
    const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    const attrs = [...sel.matchAll(/\[data-([\w-]+)\]/g)].map((m) => m[1]);
    return classes.every((c) => this.classes.has(c)) && attrs.every((a) => a in this.dataset);
  }
  closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentElement; } return null; }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelector(sel) { for (const n of this.walk()) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) { return [...this.walk()].filter((n) => n.matches(sel)); }
  insertAdjacentHTML(position, html) {
    const el = El.fromHTML(html);
    if (position === "beforeend") return this.append(el);
    if (position === "afterend") { const sib = this.parentElement.children; sib.splice(sib.indexOf(this) + 1, 0, el); el.parentElement = this.parentElement; return; }
    throw new Error(`position ${position} is not one this page uses`);
  }
  scrollIntoView(opts) { this.scrolls.push(opts); }
  remove() { const sib = this.parentElement?.children; if (sib) sib.splice(sib.indexOf(this), 1); this.parentElement = null; }
  static fromHTML(html) {
    const cls = /class="([^"]*)"/.exec(html)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
    const tag = /^<(\w+)/.exec(html.trim())?.[1] ?? "div";
    return new El(tag, { classes: cls });
  }
}
const el = (tag, opts) => new El(tag, opts);
const SHEET = `<div class="wv-cross-sheet is-terms"><div class="wv-cross-head">the door asks</div></div>`;
const MARK = "wright/the-cellar-door";

// The card as the page really builds it: the byline row carrying the enter
// button, then the investigate expansion tree — the tall thing that was pushing
// the answer off the bottom of the bubble.
function mountBubble(body, markId = MARK) {
  const button = el("button", { dataset: { enter: markId } });
  const byline = el("div", { classes: ["wv-cell-byline-row"] }).append(el("span", { classes: ["wv-cell-actions"] }).append(button));
  const tree = el("div", { classes: ["wv-expansion"] }).append(...Array.from({ length: 24 }, (_, i) => el("div", { classes: ["wv-rnode"], dataset: { id: `x/${i}` } })));
  const card = el("article", { classes: ["wv-card", "fov"], dataset: { id: markId } })
    .append(el("div", { classes: ["cbody"] }), byline, el("div", { classes: ["cmeta"] }), tree);
  const bubble = el("div", { classes: ["wv-bubble", "is-pinned"] }).append(card);
  body.append(bubble);
  return { card, byline, tree, button };
}

test("THE FALSIFIER: the door's answer lands beside the door, not past the end of the expansion tree", () => {
  const body = el("body"); const { card, byline, tree } = mountBubble(body);
  const node = placeCrossingSheet(card, SHEET);
  assert.ok(node && node.isConnected, "the sheet is on the page");
  assert.ok(node.classList.contains("wv-cross-sheet"));
  // THE ASSERTION THAT WAS RED. Appended `beforeend`, the sheet is the card's
  // LAST child — after 24 relation nodes, inside a scroll box.
  assert.equal(card.children.indexOf(node), card.children.indexOf(byline) + 1,
    "the answer must sit immediately after the byline row that holds the button that was pressed");
  assert.ok(card.children.indexOf(node) < card.children.indexOf(tree),
    "and BEFORE the expansion tree — the tall thing that was pushing it out of sight");
});

test("and the inserted node asks to be scrolled into its own container's view", () => {
  const body = el("body"); const { card } = mountBubble(body);
  const node = placeCrossingSheet(card, SHEET);
  assert.deepEqual(node.scrolls, [{ block: "nearest" }],
    "exactly one scroll, of the sheet itself, `nearest` — bring it into view without yanking a reader who can already see it");
});

test("THE RESIDUAL: a re-render between the click and the answer must not send the sheet into an orphan", () => {
  const body = el("body"); const { card: stale } = mountBubble(body);
  stale.parentElement.remove();                       // the re-render: the old bubble is gone…
  const { card: live } = mountBubble(body);           // …and a brand new one stands for the same mark
  assert.equal(stale.isConnected, false, "the captured reference is an orphan");
  const resolved = liveMarkCard(body, MARK, stale);
  assert.equal(resolved, live, "the live card is found by data-id, not trusted from before the await");
  placeCrossingSheet(resolved, SHEET);
  assert.equal(live.querySelectorAll(".wv-cross-sheet").length, 1, "the answer is on the page");
  assert.equal(stale.querySelectorAll(".wv-cross-sheet").length, 0, "and not in the orphan");
});

test("liveMarkCard keeps a card that is still connected, and answers null when there is no card at all", () => {
  const body = el("body"); const { card } = mountBubble(body);
  assert.equal(liveMarkCard(body, MARK, card), card, "a connected card is the live card — no needless re-query");
  assert.equal(liveMarkCard(body, MARK, null), card, "and it is found by id when nothing was captured");
  assert.equal(liveMarkCard(body, "nobody/here", null), null);
  assert.equal(liveMarkCard(null, MARK, null), null);
});

test("a card with no byline row still gets its answer — the fallback is the old behaviour, not nothing", () => {
  const body = el("body"); const card = el("article", { classes: ["wv-card"], dataset: { id: MARK } }).append(el("div", { classes: ["cbody"] }));
  body.append(card);
  const node = placeCrossingSheet(card, SHEET);
  assert.ok(node?.isConnected);
  assert.equal(card.lastElementChild, node, "appended at the end, as before");
  assert.equal(node.scrolls.length, 1, "and still scrolled to");
});

test("THE CLASS: an enter affordance with NO card at all still has somewhere to put the answer", () => {
  // The founder's standing list (2026-08-27, A1): the sheet needs a guaranteed
  // render home wherever an enter affordance lives, not only on roster cards.
  // `card?.insertAdjacentHTML` silently did nothing when the chain came up empty.
  const body = el("body"); const button = el("button", { dataset: { enter: MARK } });
  const row = el("div", { classes: ["wv-cell-byline-row"] }).append(el("span", { classes: ["wv-cell-actions"] }).append(button));
  body.append(el("div", { classes: ["wv-somewhere-else"] }).append(row));
  const node = placeCrossingSheet(null, SHEET, { button });
  assert.ok(node?.isConnected, "the answer is on the page even with no .wv-card anywhere");
  assert.equal(row.nextElementSibling, node, "and still beside the button that was pressed");
});

test("the pressed button's OWN row wins over some other card's row", () => {
  const body = el("body"); const first = el("div", { classes: ["wv-cell-byline-row"], id: "first" }).append(el("button", { dataset: { enter: MARK } }));
  const pressed = el("button", { dataset: { enter: MARK } });
  const second = el("div", { classes: ["wv-cell-byline-row"], id: "second" }).append(pressed);
  const card = el("article", { classes: ["wv-card"], dataset: { id: MARK } }).append(first, second);
  body.append(card);
  const node = placeCrossingSheet(card, SHEET, { button: pressed });
  assert.equal(card.children.indexOf(node), card.children.indexOf(second) + 1, "the answer follows the press");
});

test("THE REFUSAL GETS THE SAME TREATMENT — a door that says no must be as visible as one that asks", () => {
  // Both catch branches had their own hand-rolled append, so fixing only the
  // terms path would have left a refusal below the fold — half a fix that reads
  // as a whole one until someone is refused.
  assert.match(SOURCE, /placeCrossingSheet\(liveCard\(\),[\s\S]{0,260}?wv-cross-sheet is-refused"><div class="wv-cross-head">the door did not take it/,
    "crossInto's catch places its sheet through the same function");
  assert.match(SOURCE, /placeCrossingSheet\(liveCard\(\),[\s\S]{0,260}?wv-cross-sheet is-refused"><div class="wv-cross-head">the walk did not take/,
    "and so does walkThereAndEnter's");
  assert.doesNotMatch(SOURCE, /card\?\.insertAdjacentHTML\("beforeend"/,
    "no crossing sheet is appended to a card's end by hand any more");
});

test("THE WIRING: crossInto re-resolves the card after the await and re-places the bubble it grew", () => {
  assert.match(SOURCE, /const liveCard = \(\) => liveMarkCard\(root, markId, clicked\);/,
    "the card is a function of the live DOM, not a value captured before the await");
  assert.match(SOURCE, /placeCrossingSheet\(liveCard\(\), sheet, \{ button \}\);\s*\n\s*positionBubbles\(\)/,
    "and the bubble is re-placed after it grows, or the sheet is pushed off the pane it was just put on");
});
