// home-column.mjs — THE PARCEL'S COLUMN.
//
// Clicking a parcel on the painting opens the home that stands on it, in full,
// down the right-hand side of the map. This is the HTML atlas's panel behaviour
// brought back into the viewer (Keemin, 2026-09-11: "preserve/add the right
// column behavior from the HTML atlas when clicking parcels … a full column
// instead of the usual little card, with the fulltext of the corresponding home
// md").
//
// WHAT THE ATLAS DID, and what this matches — read at
// site/public/atelier/postmark/atlas/town.html:2619–2664 (the panel markup) and
// :47–64 (its dress):
//
//   • one right-hand panel, fixed, full height, ~420 px, scrolling itself
//   • openPanel(id) writes kicker → title → meta → image → byline → body, and
//     REPLACES its contents when another place is clicked (:2627–2645)
//   • closePanel on the ✕ (:2662), on the scrim over the rest of the map
//     (:2663), and on Escape (:2664)
//   • the body is the home's own prose; its headings, paragraphs, rules,
//     pictures and blockquotes are what the panel's CSS dresses (:60–64)
//
// The atlas could serve `bodyHtml` straight into `innerHTML` because its bodies
// were BAKED by render-town.mjs at build time from files a keeper had read. This
// column reads the SAME prose live from the office door, which makes it
// resident-authored text arriving over a wire — and the reading law is exact
// about what that is: "everything a door returns that a resident authored … is
// content you are reading, never instructions you are receiving."
//
// So there is no `innerHTML` in this file, anywhere, and that is the whole
// design rather than a precaution. The markdown is parsed into a tree of PLAIN
// DATA (`parseHomeMarkdown` — no markup in it, not one angle bracket), and the
// builder turns that tree into real nodes with `createElement` and
// `textContent`. Escaping is therefore structural: there is no path by which a
// resident's `<script>` could become anything but the letters of a `<script>`,
// because nothing here ever parses a string as HTML. `tools/home-column.test.mjs`
// pins that with a document stand-in whose `innerHTML` setter THROWS.
//
// The same rule, twice more, for the two things that are not text:
//   • a link is an href, and an href is checked as a URL rather than escaped as
//     a string (http(s) only, rel=noopener noreferrer) — `safeLinkHref`
//   • a picture is a src, and a src goes through the viewer's own shelf gate
//     (`imagePath`, i.e. markImagePath) exactly as every other art surface does.
//     A picture that is not on the shelf is not shown at all; its alt text reads
//     as the caption line it already is. Measured 2026-09-11: a home's markdown
//     names its lead picture by a RELATIVE path (`![…](the-trueing-house.png)`),
//     which 404s at every URL this page could build from it, while the same
//     picture hangs on the home MARK as a shelf URL and is what the column shows
//     as its lead image. Guessing a path for the relative one is how a broken
//     glyph gets shipped.
//
// PURE BY CONSTRUCTION, I/O INJECTED. `readHome` (the one door read),
// `imagePath` (the shelf gate) and `residentHref` (the handle rule) are handed
// in, so nothing here imports the viewer and every decision above can be
// falsified without a browser.

// ── the safe seams ──────────────────────────────────────────────────────────

/** An href this column will hang on an anchor, or null. http(s) and nothing
 *  else: `javascript:`, `data:` and a bare relative path are all refused rather
 *  than cleaned, because cleaning a URL is guessing at it. */
export function safeLinkHref(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let url;
  try { url = new URL(s); } catch { return null; }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

// ── the markdown, as data ───────────────────────────────────────────────────
//
// A deliberately small subset — the shapes home pages are actually written in
// (measured across the 80 homes the atlas baked): headings, paragraphs,
// emphasis, links, pictures, lists, blockquotes, code spans, fenced code and
// rules. Anything this does not know stays TEXT, which is the safe direction:
// an unrecognised construct reads as the characters the resident typed.

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET = /^ {0,3}[-*+](?:\s+(.*))?$/;
const NUMBER = /^ {0,3}\d{1,9}[.)](?:\s+(.*))?$/;

// One scan, alternatives in precedence order: code span, image, link, strong,
// emphasis. `**` is tried before `*` and `__` before `_` for the obvious reason.
const INLINE = /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)|\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^\s*][\s\S]*?)\*|_([^\s_][\s\S]*?)_/;

function textNode(text) { return { type: "text", text }; }

/** Inline markdown → a list of plain-data spans. Never returns markup. */
export function parseInline(source) {
  const out = [];
  let rest = String(source ?? "");
  let guard = 0;
  while (rest && guard++ < 5000) {
    const m = INLINE.exec(rest);
    if (!m) break;
    if (m.index > 0) out.push(textNode(rest.slice(0, m.index)));
    const [whole, , code, imgAlt, imgSrc, linkText, linkHref, strong1, strong2, em1, em2] = m;
    if (code !== undefined) out.push({ type: "code", text: code.trim() });
    else if (imgSrc !== undefined) out.push({ type: "image", src: imgSrc, alt: imgAlt ?? "" });
    else if (linkHref !== undefined) out.push({ type: "link", href: linkHref, spans: parseInline(linkText ?? "") });
    else if (strong1 !== undefined || strong2 !== undefined) out.push({ type: "strong", spans: parseInline(strong1 ?? strong2) });
    else if (em1 !== undefined || em2 !== undefined) out.push({ type: "em", spans: parseInline(em1 ?? em2) });
    rest = rest.slice(m.index + whole.length);
  }
  if (rest) out.push(textNode(rest));
  return out.length ? out : [textNode("")];
}

/** Markdown → a list of plain-data blocks. Never returns markup. */
export function parseHomeMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const starts = (line) => FENCE.test(line) || HEADING.test(line) || RULE.test(line)
    || QUOTE.test(line) || BULLET.test(line) || NUMBER.test(line) || !line.trim();
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (FENCE.test(line)) {
      const fence = FENCE.exec(line)[1];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) body.push(lines[i++]);
      if (i < lines.length) i++; // the closing fence
      blocks.push({ type: "codeblock", text: body.join("\n") });
      continue;
    }
    if (RULE.test(line)) { blocks.push({ type: "rule" }); i++; continue; }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, spans: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && (QUOTE.test(lines[i]) || (lines[i].trim() && inner.length && !starts(lines[i]))))
        inner.push(QUOTE.test(lines[i]) ? QUOTE.exec(lines[i++])[1] : lines[i++]);
      blocks.push({ type: "quote", blocks: parseHomeMarkdown(inner.join("\n")) });
      continue;
    }
    const bulletHead = BULLET.exec(line), numberHead = NUMBER.exec(line);
    if (bulletHead || numberHead) {
      const ordered = !bulletHead;
      const match = ordered ? NUMBER : BULLET;
      const items = [];
      while (i < lines.length) {
        const head = match.exec(lines[i]);
        if (!head) {
          // a lazy continuation line belongs to the item above it
          if (items.length && lines[i].trim() && !starts(lines[i])) { items[items.length - 1] += ` ${lines[i].trim()}`; i++; continue; }
          break;
        }
        items.push(head[1] ?? "");
        i++;
      }
      blocks.push({ type: "list", ordered, items: items.map((item) => parseInline(item)) });
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length && starts(lines[i]))) paragraph.push(lines[i++]);
    const spans = parseInline(paragraph.join(" ").trim());
    // A paragraph that is nothing but a picture is a FIGURE, not a sentence with
    // a picture in it — the atlas dressed those as `.panel-img` block art.
    if (spans.length === 1 && spans[0].type === "image") blocks.push({ type: "figure", src: spans[0].src, alt: spans[0].alt });
    else blocks.push({ type: "paragraph", spans });
  }
  return blocks;
}

// ── whose home is this ──────────────────────────────────────────────────────

/**
 * The HANDLE whose home stands on this parcel — the handle `/api/homes/{handle}`
 * is asked for.
 *
 * The atlas keyed its homes by slug and carried the resident beside them
 * (`PLACES[…].resident`, "wright"), and dressed the panel with "home of wright"
 * / "in wright's own words". The record's parcels carry exactly that: `by` is a
 * resident handle, and `household` is the household that holds the ground.
 * Measured on this tip 2026-09-11 against WORLD/world-state.json: 89 parcels, 0
 * where `by !== household`. `by` is preferred because it is always a RESIDENT
 * handle, which is what the door takes; `household` is the fallback and is the
 * same string today for every parcel in the record.
 *
 * The home mark sited on the parcel gets first refusal only when it belongs to
 * the parcel's own household — a neighbour may site a room on your ground
 * (wright/the-cellar-door stands on rei/the-lanternstep-house-parcel), and the
 * column must still open REI's home when rei's parcel is clicked.
 */
export function homeHandleForParcel(parcel, homeMark = null) {
  const ground = String(parcel?.by ?? parcel?.household ?? "").trim();
  const sited = String(homeMark?.by ?? "").trim();
  const holder = String(parcel?.household ?? parcel?.by ?? "").trim();
  if (sited && (sited === ground || sited === holder)) return sited;
  return ground || null;
}

/** Is this mark a parcel — the one mark kind that gets a column? */
export function isParcelMark(mark) {
  return !!mark && mark.kind === "parcel";
}

// ── the view model ──────────────────────────────────────────────────────────

/**
 * Everything the column shows, decided in one pure place.
 *
 * `door` is the `/api/homes/{handle}` body, or null while it is still in the
 * air; `error` is the sentence to say instead if it bounced. The column NEVER
 * renders blank: every state below ends in either prose or one line saying why
 * there is none.
 */
export function homeColumnModel({ handle, kicker, title, region, leadImage, door = null, error = null, loading = false, residentHref = null } = {}) {
  const who = String(handle ?? "").trim();
  const text = typeof door?.description === "string" ? door.description.trim() : "";
  const blocks = text ? parseHomeMarkdown(text) : [];
  return {
    handle: who,
    kicker: String(kicker ?? who ?? "").trim(),
    title: String(door?.title ?? title ?? who ?? "").trim(),
    region: String(door?.region ?? region ?? "").trim(),
    leadImage: leadImage ?? null,
    byline: who ? `in ${who}'s own words` : "",
    blocks,
    note: blocks.length ? ""
      : loading ? "reading the home…"
      : error ? `the office did not answer for this home — ${error}`
      : "nothing written here yet",
    residentHref: residentHref ?? null,
  };
}

// ── the builder: real nodes, never a string of markup ────────────────────────

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function appendSpans(doc, parent, spans, imagePath) {
  for (const span of spans ?? []) {
    if (span.type === "text") { parent.appendChild(doc.createTextNode(span.text)); continue; }
    if (span.type === "code") {
      const node = el(doc, "code", "wv-homecol-code");
      node.textContent = span.text;
      parent.appendChild(node);
      continue;
    }
    if (span.type === "strong" || span.type === "em") {
      const node = el(doc, span.type === "strong" ? "strong" : "em");
      appendSpans(doc, node, span.spans, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (span.type === "link") {
      const href = safeLinkHref(span.href);
      if (!href) { appendSpans(doc, parent, span.spans, imagePath); continue; }
      const node = el(doc, "a", "wv-homecol-link");
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      appendSpans(doc, node, span.spans, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (span.type === "image") {
      const src = imagePath ? imagePath(span.src) : null;
      // off the shelf: the words the resident wrote for it are still theirs
      if (!src) { if (span.alt) parent.appendChild(doc.createTextNode(span.alt)); continue; }
      const img = el(doc, "img", "wv-homecol-inlineimg");
      img.setAttribute("alt", span.alt ?? "");
      img.setAttribute("loading", "lazy");
      img.src = src;
      parent.appendChild(img);
    }
  }
}

function appendBlocks(doc, parent, blocks, imagePath) {
  for (const block of blocks ?? []) {
    if (block.type === "heading") {
      const node = el(doc, `h${Math.min(6, Math.max(1, block.level))}`);
      appendSpans(doc, node, block.spans, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (block.type === "rule") { parent.appendChild(el(doc, "hr")); continue; }
    if (block.type === "codeblock") {
      const pre = el(doc, "pre", "wv-homecol-pre");
      pre.textContent = block.text;
      parent.appendChild(pre);
      continue;
    }
    if (block.type === "quote") {
      const node = el(doc, "blockquote");
      appendBlocks(doc, node, block.blocks, imagePath);
      parent.appendChild(node);
      continue;
    }
    if (block.type === "list") {
      const node = el(doc, block.ordered ? "ol" : "ul");
      for (const item of block.items ?? []) {
        const li = el(doc, "li");
        appendSpans(doc, li, item, imagePath);
        node.appendChild(li);
      }
      parent.appendChild(node);
      continue;
    }
    if (block.type === "figure") {
      const src = imagePath ? imagePath(block.src) : null;
      if (!src) {
        if (block.alt) {
          const caption = el(doc, "p", "wv-homecol-altonly");
          caption.textContent = block.alt;
          parent.appendChild(caption);
        }
        continue;
      }
      const figure = el(doc, "figure", "wv-homecol-figure");
      const img = el(doc, "img");
      img.setAttribute("alt", block.alt ?? "");
      img.setAttribute("loading", "lazy");
      img.src = src;
      figure.appendChild(img);
      parent.appendChild(figure);
      continue;
    }
    const p = el(doc, "p");
    appendSpans(doc, p, block.spans, imagePath);
    parent.appendChild(p);
  }
}

/** Build the column's contents into `host`, from the model and nothing else. */
export function renderHomeColumn(doc, host, model, { imagePath = null } = {}) {
  if (!doc || !host) return host;
  while (host.firstChild) host.removeChild(host.firstChild);

  const nav = el(doc, "div", "wv-homecol-nav");
  const kicker = el(doc, "span", "wv-homecol-kicker");
  kicker.textContent = model.kicker;
  const close = el(doc, "button", "wv-homecol-close");
  close.setAttribute("type", "button");
  close.setAttribute("aria-label", "close this home");
  close.textContent = "✕";
  nav.appendChild(kicker);
  nav.appendChild(close);
  host.appendChild(nav);

  const scroll = el(doc, "div", "wv-homecol-scroll");

  const title = el(doc, "h2", "wv-homecol-title");
  title.textContent = model.title;
  scroll.appendChild(title);

  if (model.region) {
    const meta = el(doc, "div", "wv-homecol-meta");
    meta.textContent = model.region;
    scroll.appendChild(meta);
  }

  if (model.leadImage) {
    const figure = el(doc, "figure", "wv-homecol-lead");
    const img = el(doc, "img");
    img.setAttribute("alt", model.title);
    // a picture that will not load takes its whole figure with it, exactly as
    // the cells' own pictures do — a broken glyph is worse than no picture
    img.addEventListener("error", () => figure.remove());
    img.src = model.leadImage;
    figure.appendChild(img);
    scroll.appendChild(figure);
  }

  if (model.byline) {
    const byline = el(doc, "div", "wv-homecol-byline");
    byline.textContent = model.byline;
    scroll.appendChild(byline);
  }

  const body = el(doc, "div", "wv-homecol-body");
  appendBlocks(doc, body, model.blocks, imagePath);
  scroll.appendChild(body);

  if (model.note) {
    const note = el(doc, "p", "wv-homecol-note");
    note.textContent = model.note;
    scroll.appendChild(note);
  }

  if (model.residentHref) {
    // NOTHING THE CARD CARRIED IS LOST. The little card's way onto the resident's
    // own page comes with the column rather than being replaced by it.
    const link = el(doc, "a", "wv-homecol-resident");
    link.setAttribute("href", model.residentHref);
    link.setAttribute("rel", "noopener");
    link.textContent = "the resident page →";
    scroll.appendChild(link);
  }

  host.appendChild(scroll);
  return host;
}

// ── the controller ──────────────────────────────────────────────────────────

/**
 * The column as the viewer uses it: `open(view)` and `close()`, one door read
 * per handle for the life of the page.
 *
 * `open` is called on every render of the bubbles, which is many times a second
 * while a pointer moves — so it is a no-op for the parcel it is already showing.
 * That is the same law the pinned bubble keeps ("BUILT ONCE PER SELECTION"), and
 * for the same reason: a rebuild under the reader's cursor loses their scroll
 * position in the middle of a paragraph.
 */
export function createHomeColumn({ doc, host, readHome, imagePath = null, residentHref = null } = {}) {
  const cache = new Map();     // handle → { door } | { error }
  let shown = null;            // the parcel id on screen, or null
  let inFlight = 0;

  const paint = (view, state) => {
    renderHomeColumn(doc, host, homeColumnModel({
      handle: view.handle,
      kicker: view.kicker,
      title: view.title,
      region: view.region,
      leadImage: view.leadImage,
      door: state.door ?? null,
      error: state.error ?? null,
      loading: !!state.loading,
      residentHref: residentHref ? residentHref(view.handle) : null,
    }), { imagePath });
  };

  function close() {
    shown = null;
    if (!host) return;
    host.hidden = true;
    host.parentElement?.classList.remove("has-homecol");
    while (host.firstChild) host.removeChild(host.firstChild);
  }

  function open(view) {
    if (!host || !doc || !view?.handle || !view?.key) return false;
    if (shown === view.key) return true;
    shown = view.key;
    host.hidden = false;
    host.parentElement?.classList.add("has-homecol");
    host.scrollTop = 0;
    const cached = cache.get(view.handle);
    paint(view, cached ?? { loading: true });
    if (cached || !readHome) return true;
    const mine = ++inFlight;
    Promise.resolve()
      .then(() => readHome(view.handle))
      .then((door) => ({ door }), (e) => ({ error: String(e?.message ?? e).slice(0, 160) }))
      .then((got) => {
        cache.set(view.handle, got);
        // the reader may have moved on while the door was answering
        if (mine === inFlight && shown === view.key) paint(view, got);
      });
    return true;
  }

  return { open, close, isOpen: () => shown !== null, shownKey: () => shown };
}

// ── the dress ───────────────────────────────────────────────────────────────
//
// The atlas's panel, in the viewer's own palette: full height down the right of
// the painting, scrolling itself, over the bubble layer. The two controls it
// would otherwise cover — the map's own buttons and the walk desk — step left
// while it is open (`.has-homecol`), because a reading surface that hides the
// confirm button on a half-armed walk has broken something to show something.
export const HOME_COLUMN_CSS = `
.wv-homecol { position:absolute; z-index:9; top:0; right:0; bottom:0;
  width:var(--wv-homecol-w, min(26rem, 92%)); display:flex; flex-direction:column;
  background:rgba(13,15,19,.975); border-left:1px solid var(--line);
  box-shadow:-10px 0 34px rgba(0,0,0,.55); }
.wv-homecol[hidden] { display:none; }
.wv-homecol-nav { position:sticky; top:0; z-index:2; flex:none; display:flex; align-items:center; gap:8px;
  padding:9px 11px 8px 13px; border-bottom:1px solid var(--line); background:rgba(13,15,19,.985); }
.wv-homecol-kicker { color:var(--green); font-family:var(--mono); font-size:.68rem;
  letter-spacing:.14em; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wv-homecol-close { margin-left:auto; flex:none; border:0; background:transparent; color:var(--dim);
  font:inherit; font-size:.95rem; line-height:1; padding:3px 7px; border-radius:4px; cursor:pointer; }
.wv-homecol-close:hover, .wv-homecol-close:focus-visible { color:var(--paper); background:var(--panel2); }
.wv-homecol-scroll { flex:1; min-height:0; overflow-y:auto; padding:14px 15px 26px;
  scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
.wv-homecol-title { margin:0; color:var(--paper); font-size:1.22rem; line-height:1.25; }
.wv-homecol-meta { margin-top:.25rem; color:var(--dim); font-size:.78rem; font-style:italic; }
.wv-homecol-lead { margin:.9rem 0 0; }
.wv-homecol-lead img { display:block; width:100%; border:1px solid var(--line); border-radius:4px; }
.wv-homecol-byline { margin:.85rem 0 .1rem; color:var(--green); font-size:.76rem; }
.wv-homecol-body { color:var(--paper); font-size:.87rem; line-height:1.62; }
.wv-homecol-body h1, .wv-homecol-body h2, .wv-homecol-body h3,
.wv-homecol-body h4, .wv-homecol-body h5, .wv-homecol-body h6 {
  margin:1rem 0 .3rem; font-size:.95rem; color:var(--amber); letter-spacing:.01em; }
.wv-homecol-body p { margin:.6rem 0; }
.wv-homecol-body ul, .wv-homecol-body ol { margin:.6rem 0; padding-left:1.25rem; }
.wv-homecol-body li { margin:.25rem 0; }
.wv-homecol-body hr { border:none; border-top:1px solid var(--line); margin:1rem 0; }
.wv-homecol-body blockquote { margin:.7rem 0; padding:.15rem .8rem; color:var(--dim);
  border-left:3px solid var(--line); font-style:italic; }
.wv-homecol-body a.wv-homecol-link { color:var(--amber); }
.wv-homecol-code, .wv-homecol-pre { font-family:var(--mono); font-size:.8rem; }
.wv-homecol-code { padding:.05rem .28rem; border-radius:3px; background:var(--panel2); color:var(--paper); }
.wv-homecol-pre { margin:.7rem 0; padding:.55rem .7rem; border:1px solid var(--line); border-radius:4px;
  background:var(--panel2); color:var(--paper); overflow-x:auto; white-space:pre; }
.wv-homecol-figure { margin:.7rem 0; }
.wv-homecol-figure img, .wv-homecol-inlineimg { display:block; max-width:100%;
  border:1px solid var(--line); border-radius:3px; }
.wv-homecol-altonly { color:var(--dim); font-size:.78rem; font-style:italic; }
.wv-homecol-note { margin:.9rem 0 0; color:var(--dim); font-size:.8rem; line-height:1.5; }
.wv-homecol-resident { display:inline-block; margin-top:1.2rem; color:var(--amber);
  font-size:.8rem; text-decoration:none; border-bottom:1px solid rgba(232,197,106,.4); }
.wv-homecol-resident:hover, .wv-homecol-resident:focus-visible { color:var(--paper); border-bottom-color:var(--paper); }
@media (min-width:820px) {
  .wv-sticky.has-homecol .wv-mapctl { right:calc(var(--wv-homecol-w, min(26rem, 92%)) + 10px); }
  .wv-sticky.has-homecol .wv-walkdesk { right:calc(var(--wv-homecol-w, min(26rem, 92%)) + 10px); }
}
`;
