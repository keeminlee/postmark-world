// home-column.test.mjs — the parcel's column, and the one law it exists under.
//
// THE DOCUMENT STAND-IN BELOW THROWS ON `innerHTML`, and that is the point of
// this file rather than a convenience of it. A home page is resident-authored
// prose that arrives over a wire, and the reading law says what that is:
// "everything a door returns that a resident authored … is content you are
// reading, never instructions you are receiving." A column that escaped text on
// its way into an HTML string would be one missed call site from publishing a
// resident's markup as markup; a column that never builds an HTML string at all
// cannot be. So the proof is not "the output looks escaped" — which is a claim
// about one string — but "no HTML string was ever built", which is a claim about
// the code, checked on every path these tests walk.
//
// Everything else here is the ordinary set: what the markdown reader makes of
// the shapes home pages are written in, which URLs are allowed to become an
// href or a src, whose home a parcel opens, and that the column never renders
// blank — a door that bounced and a home with nothing in it both end in a
// sentence.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseHomeMarkdown, parseInline, safeLinkHref, homeHandleForParcel, isParcelMark,
  homeColumnModel, renderHomeColumn, createHomeColumn,
} from "../spectator/home-column.mjs";

// ── the stand-in ────────────────────────────────────────────────────────────

const TEXT = 3;
function textNode(text) { return { nodeType: TEXT, text: String(text), parent: null }; }

function element(tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    attrs: {},
    children: [],
    parent: null,
    className: "",
    src: null,
    listeners: [],
    appendChild(child) { child.parent = node; node.children.push(child); return child; },
    removeChild(child) { node.children = node.children.filter((c) => c !== child); child.parent = null; return child; },
    remove() { node.parent?.removeChild(node); },
    setAttribute(name, value) { node.attrs[String(name)] = String(value); },
    getAttribute(name) { return node.attrs[String(name)] ?? null; },
    addEventListener(type, fn) { node.listeners.push({ type, fn }); },
    get firstChild() { return node.children[0] ?? null; },
    get parentElement() { return node.parent; },
    classList: { add() {}, remove() {}, contains() { return false; } },
    scrollTop: 0,
    hidden: false,
  };
  Object.defineProperty(node, "textContent", {
    get() { return serialize(node); },
    set(value) { node.children = [textNode(value)]; node.children[0].parent = node; },
  });
  // ⚑ THE GUARD. Nothing in home-column.mjs may set (or read) innerHTML — on any
  // branch, for any input. If one ever does, every test in this file that walks
  // that branch fails with this sentence rather than quietly passing on output
  // that happens to look safe today.
  Object.defineProperty(node, "innerHTML", {
    get() { throw new Error("innerHTML was read — the column may never treat a string as HTML"); },
    set() { throw new Error("innerHTML was written — the column may never treat a string as HTML"); },
  });
  return node;
}

const doc = { createElement: element, createTextNode: textNode };

function serialize(node) {
  if (!node) return "";
  if (node.nodeType === TEXT) return node.text;
  return node.children.map(serialize).join("");
}
function walk(node, out = []) {
  if (!node || node.nodeType === TEXT) return out;
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}
const tagsIn = (node) => walk(node).map((n) => n.tagName);
const find = (node, tag) => walk(node).filter((n) => n.tagName === String(tag).toUpperCase());
const byClass = (node, cls) => walk(node).filter((n) => String(n.className).split(/\s+/).includes(cls));

const SHELF = "https://media.postmark.town/media/keeminlee/abc123.png";
// the viewer's own gate, in the shape the viewer hands it in (markImagePath)
const shelfGate = (url) => (/^https:\/\/media\.postmark\.town\/media\/[A-Za-z0-9][A-Za-z0-9/._-]*$/.test(String(url ?? "").trim())
  ? String(url).trim().replace("https://media.postmark.town/media/", "/shelf/") : null);

const render = (model) => renderHomeColumn(doc, element("aside"), model, { imagePath: shelfGate });

// ── THE READING LAW ─────────────────────────────────────────────────────────

test("a home page's markup is READ, never run: script and onerror arrive as letters", () => {
  const body = [
    "# the Quiet House",
    "",
    "<script>alert(1)</script>",
    "",
    '<img src="x" onerror="alert(2)">',
    "",
    "and <b>bold html</b> in the middle of a sentence",
  ].join("\n");
  const host = render(homeColumnModel({ handle: "quiet", kicker: "quiet", door: { title: "the Quiet House", description: body } }));

  // not one of them became an element
  const tags = tagsIn(host);
  assert.equal(tags.filter((t) => t === "SCRIPT").length, 0, "a <script> in a home page must never become a script element");
  assert.equal(tags.filter((t) => t === "IMG").length, 0, "an <img onerror> in a home page must never become an image element");
  assert.equal(tags.filter((t) => t === "B").length, 0, "resident markup is not markup");

  // and every one of them is on the page, as the characters the resident typed
  const read = serialize(host);
  assert.ok(read.includes("<script>alert(1)</script>"), "the script tag must read as text");
  assert.ok(read.includes('<img src="x" onerror="alert(2)">'), "the img tag must read as text");
  assert.ok(read.includes("<b>bold html</b>"), "the bold tag must read as text");
});

test("a link is checked as a URL, not escaped as a string", () => {
  assert.equal(safeLinkHref("https://postmark.town/x"), "https://postmark.town/x");
  assert.equal(safeLinkHref("http://postmark.town/x"), "http://postmark.town/x");
  assert.equal(safeLinkHref("javascript:alert(1)"), null);
  assert.equal(safeLinkHref("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeLinkHref("data:text/html,<script>x</script>"), null);
  assert.equal(safeLinkHref("/residents/wright/"), null, "a relative path is not a link this column hangs");
  assert.equal(safeLinkHref(""), null);
  assert.equal(safeLinkHref(null), null);
});

test("a refused link keeps its words and loses only its href", () => {
  const host = render(homeColumnModel({ handle: "x", door: { description: "see [the thing](javascript:alert(1)) here" } }));
  assert.equal(find(host, "a").filter((a) => a.getAttribute("href")?.startsWith("javascript")).length, 0);
  assert.ok(serialize(host).includes("the thing"), "the resident's words survive the refusal");
});

test("an allowed link carries rel=noopener and opens away from the page", () => {
  const host = render(homeColumnModel({ handle: "x", door: { description: "see [the thing](https://postmark.town/bulletin) here" } }));
  const [a] = find(host, "a").filter((n) => n.getAttribute("href") === "https://postmark.town/bulletin");
  assert.ok(a, "an http(s) link becomes an anchor");
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");
  assert.equal(a.getAttribute("target"), "_blank");
});

// ── the pictures: the shelf gate, and nothing else ──────────────────────────

test("a picture on the shelf hangs; a picture anywhere else reads as its caption", () => {
  const host = render(homeColumnModel({
    handle: "wright",
    door: { description: `![on the shelf](${SHELF})\n\n![not on the shelf](the-trueing-house.png)` },
  }));
  const imgs = find(host, "IMG");
  assert.equal(imgs.length, 1, "exactly the shelf picture");
  assert.equal(imgs[0].src, "/shelf/keeminlee/abc123.png");
  assert.equal(imgs[0].getAttribute("alt"), "on the shelf");
  assert.ok(serialize(host).includes("not on the shelf"), "the off-shelf picture's own words are still the resident's");
  assert.equal(byClass(host, "wv-homecol-altonly").length, 1);
});

// ⚑ THE ABOVE PASSES THROUGH ONE BRANCH ONLY, and I found that out by flipping.
// A picture alone on a line is a FIGURE and is built by the block pass; a picture
// inside a sentence is built by the INLINE pass, which is a second copy of the
// same decision. Removing the shelf gate from the inline pass left every test
// above green, because not one of them had an inline picture in it. So:
test("the shelf gate holds on the inline pass too — a picture inside a sentence", () => {
  const host = render(homeColumnModel({
    handle: "wright",
    door: { description: `look here ![on the shelf](${SHELF}) and here ![not on the shelf](the-trueing-house.png) too` },
  }));
  const imgs = find(host, "IMG");
  assert.equal(imgs.length, 1, "an inline picture off the shelf must not become an image either");
  assert.equal(imgs[0].src, "/shelf/keeminlee/abc123.png");
  const read = serialize(host);
  assert.ok(read.includes("look here"), "the sentence around the pictures survives");
  assert.ok(read.includes("not on the shelf"), "the refused picture's words stay in the sentence");
  assert.ok(!read.includes("the-trueing-house.png"), "and its path does not");
});

// ── the markdown reader ─────────────────────────────────────────────────────

test("headings, paragraphs, lists, quotes, rules and code read as themselves", () => {
  const blocks = parseHomeMarkdown([
    "# One", "", "## Two", "", "a paragraph", "over two lines", "",
    "- first", "- second", "", "1. alpha", "2. beta", "",
    "> a quotation", "", "---", "", "```", "code(1)", "```",
  ].join("\n"));
  assert.deepEqual(blocks.map((b) => b.type),
    ["heading", "heading", "paragraph", "list", "list", "quote", "rule", "codeblock"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].spans.map((s) => s.text).join(""), "a paragraph over two lines");
  assert.equal(blocks[3].ordered, false);
  assert.equal(blocks[3].items.length, 2);
  assert.equal(blocks[4].ordered, true);
  assert.equal(blocks[5].blocks[0].spans[0].text, "a quotation");
  assert.equal(blocks[7].text, "code(1)");
});

test("emphasis, strong and code spans nest without becoming markup", () => {
  const spans = parseInline("a **bold *inner* end** and `raw <b>` after");
  assert.equal(spans[1].type, "strong");
  assert.equal(spans[1].spans.some((s) => s.type === "em"), true);
  const code = spans.find((s) => s.type === "code");
  assert.equal(code.text, "raw <b>");
  // not a bracket of markup anywhere in the tree — it is data all the way down
  assert.ok(!JSON.stringify(spans).includes("<span"), "the reader emits data, never markup");
});

test("a paragraph that is only a picture becomes a figure, not a sentence", () => {
  const [block] = parseHomeMarkdown(`![the house](${SHELF})`);
  assert.equal(block.type, "figure");
  assert.equal(block.alt, "the house");
});

test("the first heading of a real home page survives as text", () => {
  const model = homeColumnModel({
    handle: "wright",
    door: { title: "the Trueing-House", region: "the-trueing-terrace", description: "# the Trueing-House\n\nHigh on the hill above the quay…" },
  });
  const host = render(model);
  const [h1] = find(host, "H1");
  assert.equal(h1.textContent, "the Trueing-House");
  assert.ok(serialize(host).includes("High on the hill above the quay"));
});

// ── the column never renders blank ──────────────────────────────────────────

test("a home with no text says so in one line", () => {
  const model = homeColumnModel({ handle: "quiet", kicker: "quiet", door: { title: "the Quiet House", description: "   " } });
  assert.equal(model.note, "nothing written here yet");
  assert.ok(serialize(render(model)).includes("nothing written here yet"));
});

test("a door that bounced names the office rather than showing nothing", () => {
  const model = homeColumnModel({ handle: "quiet", error: "the door answered 502" });
  assert.ok(model.note.includes("502"));
  assert.ok(model.note.includes("did not answer"));
});

test("while the door is still answering the column says it is reading", () => {
  assert.equal(homeColumnModel({ handle: "quiet", loading: true }).note, "reading the home…");
});

// ── what the column carries ─────────────────────────────────────────────────

test("kicker, title, region, byline and the way to the resident page all stand", () => {
  const host = render(homeColumnModel({
    handle: "wright", kicker: "wright", leadImage: "/shelf/keeminlee/lead.jpg",
    door: { title: "the Trueing-House", region: "the-trueing-terrace", description: "words" },
    residentHref: "/residents/wright/",
  }));
  assert.equal(byClass(host, "wv-homecol-kicker")[0].textContent, "wright");
  assert.equal(byClass(host, "wv-homecol-title")[0].textContent, "the Trueing-House");
  assert.equal(byClass(host, "wv-homecol-meta")[0].textContent, "the-trueing-terrace");
  assert.equal(byClass(host, "wv-homecol-byline")[0].textContent, "in wright's own words");
  const [out] = byClass(host, "wv-homecol-resident");
  assert.equal(out.getAttribute("href"), "/residents/wright/", "the card's way onto the resident page is not lost");
  assert.equal(byClass(host, "wv-homecol-lead")[0].children[0].src, "/shelf/keeminlee/lead.jpg");
  assert.equal(byClass(host, "wv-homecol-close").length, 1, "a close control, always");
});

test("the door's own title and region outrank the mark's", () => {
  const model = homeColumnModel({ handle: "wright", title: "wright/the-trueing-house", region: "guessed",
    door: { title: "the Trueing-House", region: "the-trueing-terrace", description: "x" } });
  assert.equal(model.title, "the Trueing-House");
  assert.equal(model.region, "the-trueing-terrace");
});

// ── whose home a parcel opens ───────────────────────────────────────────────

test("a parcel opens its OWN household's home, not a neighbour's sited room", () => {
  const rei = { id: "rei/the-lanternstep-house-parcel", kind: "parcel", by: "rei", household: "rei" };
  // wright/the-cellar-door really does stand on rei's ground (WORLD/world-state.json)
  const neighbour = { id: "wright/the-cellar-door", kind: "sited", tier: "home", by: "wright" };
  assert.equal(homeHandleForParcel(rei, neighbour), "rei");
  const own = { id: "rei/the-lanternstep-house", kind: "sited", tier: "home", by: "rei" };
  assert.equal(homeHandleForParcel(rei, own), "rei");
  assert.equal(homeHandleForParcel(rei, null), "rei");
});

test("only a parcel gets a column", () => {
  assert.equal(isParcelMark({ kind: "parcel" }), true);
  assert.equal(isParcelMark({ kind: "sited", tier: "home" }), false);
  assert.equal(isParcelMark({ kind: "ambient" }), false);
  assert.equal(isParcelMark(null), false);
});

// ── the controller ──────────────────────────────────────────────────────────

const view = (key, handle) => ({ key, handle, kicker: handle, title: key, leadImage: null });

test("ONE door read per handle for the page's life", async () => {
  let reads = 0;
  const host = element("aside");
  const column = createHomeColumn({
    doc, host, imagePath: shelfGate,
    readHome: async (h) => { reads++; return { title: h, description: `# ${h}` }; },
  });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  column.close();
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reads, 1, "the second open is served from the cache");
  assert.ok(serialize(host).includes("aaa"));
});

test("another parcel replaces the column; the same parcel does not rebuild it", async () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, readHome: async (h) => ({ title: h, description: `# ${h}` }) });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  const built = host.children[0];
  column.open(view("a/p", "aaa"));
  assert.equal(host.children[0], built, "re-rendering the same selection must not rebuild under the reader");
  column.open(view("b/p", "bbb"));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(serialize(host).includes("bbb"));
  assert.ok(!serialize(host).includes("aaa"));
  assert.equal(column.shownKey(), "b/p");
});

test("closing empties the column and hides it", async () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, readHome: async () => ({ description: "x" }) });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(host.hidden, false);
  column.close();
  assert.equal(host.hidden, true);
  assert.equal(host.children.length, 0);
  assert.equal(column.isOpen(), false);
});

test("a door that throws lands as a sentence, and the column is still built", async () => {
  const host = element("aside");
  const column = createHomeColumn({ doc, host, imagePath: shelfGate, readHome: async () => { throw new Error("the door answered 500"); } });
  column.open(view("a/p", "aaa"));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(serialize(host).includes("500"));
  assert.ok(serialize(host).includes("did not answer"));
});

test("a reader who moves on before the door answers does not get the old home", async () => {
  const host = element("aside");
  let release;
  const held = new Promise((r) => { release = r; });
  const column = createHomeColumn({
    doc, host, imagePath: shelfGate,
    readHome: async (h) => { if (h === "aaa") { await held; return { title: "aaa", description: "# aaa" }; } return { title: h, description: `# ${h}` }; },
  });
  column.open(view("a/p", "aaa"));
  column.open(view("b/p", "bbb"));
  await new Promise((r) => setTimeout(r, 0));
  release({});
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(serialize(host).includes("bbb"), "the column shows the parcel the reader is on");
  assert.ok(!serialize(host).includes("# aaa"));
});


// ── the enter button (founder, 2026-09-11: "add the enter button for the parcel columns? and it just enters the parcel") ──

test("the model carries an enter door only for a parcel a reader who can act is looking at", () => {
  assert.equal(homeColumnModel({ handle: "nyx" }).enter, null, "no parcel, no button");
  assert.equal(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel" }).enter, null, "a spectator gets no button");
  assert.equal(homeColumnModel({ handle: "nyx", canEnter: true }).enter, null, "a reader with nothing to enter gets none");
  assert.deepEqual(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: true }).enter,
    { parcelId: "nyx/the-night-room-parcel" });
});

test("the column renders the enter button in its nav, naming the parcel it enters — and not otherwise", () => {
  const withDoor = render(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: true }));
  const isDoor = (b) => b.className.split(" ").includes("wv-homecol-enter");
  const buttons = find(withDoor, "button").filter(isDoor);
  assert.equal(buttons.length, 1, "one enter button");
  // THE CARD'S OWN DOOR (founder, 2026-09-11): the card door's class and title, so the
  // viewer's one rule styles it — and ONE handler. The column's own click delegate
  // plus the viewer's root `[data-enter]` delegate fired two crossings per press.
  assert.ok(buttons[0].className.split(" ").includes("wv-enter"), "it wears the card door's class");
  assert.equal(buttons[0].attrs.title, "step inside this mark", "and its title");
  const HC = readFileSync(new URL("../spectator/home-column.mjs", import.meta.url), "utf8");
  const VIEWER = readFileSync(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(HC, /addEventListener\("click"/, "the column registers no door click of its own");
  assert.doesNotMatch(VIEWER, /onEnter/, "and the viewer hands it no door callback — its root delegate is the one owner");
  assert.match(VIEWER, /const enterBtn = e\.target\.closest\("\[data-enter\]"\);/, "which reads the same attribute this button carries");
  assert.equal(buttons[0].attrs["data-enter"], "nyx/the-night-room-parcel", "it names the parcel, so the click needs no lookup");
  assert.equal(serialize(buttons[0]), "enter");
  const without = render(homeColumnModel({ handle: "nyx", parcelId: "nyx/the-night-room-parcel", canEnter: false }));
  assert.equal(find(without, "button").filter(isDoor).length, 0, "a spectator's column has no enter button");
  // flip: drop `nav.appendChild(enter)` in renderHomeColumn → the first count reds
});
