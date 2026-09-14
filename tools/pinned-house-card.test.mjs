// pinned-house-card.test.mjs — the house you are reading stays the house you
// are reading (Keemin, 2026-09-12: "when a house is clicked (and the column is
// up), it gets pinned in its 'zoomed' form even when zoomed out").
//
//   node --test tools/pinned-house-card.test.mjs
//
// THE POINT. Zooming out to see where a house sits should not take the thing
// you are reading and turn it back into a bead. While a column is open, that
// ONE parcel answers `near` at every tier — picture, name, frame — and every
// other house on the map follows the camera exactly as before.
//
// TWO HALVES, AND THE SECOND IS THE ONE THAT NEARLY GOT MISSED. The rule itself
// is one line in homeCard. But a selection does not redraw the overlay: the six
// drawOverlay call sites are the first radial, the camera settle, the pane
// refit, the layout settle, the dev dials and the resident record read, and not
// one of them is a click. markInteraction.subscribe runs
// syncMarkInteractionViews, which toggles classes, moves the highlight, syncs
// the chip and renders the bubbles, and touches the overlay's markup not at
// all. So without a trigger the pin would have been correct code that never
// ran until the reader moved the camera — the one thing they were not doing.
// Measured before building; the trigger is asserted here as its own falsifier.
//
// The page is driven, for the reason tools/town-ground-page.test.mjs gives at
// length. Playwright absent SKIPS LOUDLY and names what went unguarded.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");

// ── source pins: the rule, and the trigger that makes it reach the screen ───

test("[pin] the pinned parcel answers `near` inside homeCard, before the tier is read", () => {
  const fn = SOURCE.slice(SOURCE.indexOf("function homeCard(parcel, at, fan, title, tier = null)"));
  const body = fn.slice(0, fn.indexOf("\n  function "));
  const pin = body.indexOf("pinnedColumnParcelId && parcel.id === pinnedColumnParcelId");
  const farGate = body.indexOf('if (tier === "far")');
  assert.ok(pin >= 0, "homeCard reads the pinned parcel");
  assert.ok(pin < farGate, "…and does so BEFORE the far gate, or the pin could never beat it");
  assert.match(body, /tier = "near"/, "the pinned parcel is treated as near");
});

test("[pin] opening or closing a column redraws the map — and nothing else does", () => {
  // The trigger, where the column is decided.
  const at = SOURCE.indexOf("const pinnedNow = column?.parcelId ?? null;");
  assert.ok(at > 0, "the pinned id is taken from the column view");
  const block = SOURCE.slice(at, at + 260);
  assert.match(block, /if \(pinnedNow !== pinnedColumnParcelId\)/,
    "it redraws only when the PINNED HOUSE changes, not on every hover or selection");
  assert.match(block, /pinnedColumnParcelId = pinnedNow;[\s\S]{0,80}drawOverlay/,
    "the id is assigned BEFORE the draw, so a re-entrant call finds nothing changed");
  // ⚑ THE FLIP, and the correction the flip made to this comment. I wrote that
  //   dropping the trigger would red only the page test. It reds THIS pin too,
  //   which is obvious in hindsight — the pin names the thing I removed. What
  //   the flip does prove is the half that matters: with the id still assigned
  //   and only the redraw gone, BOTH page tests red, so the "correct code that
  //   never runs" shape is caught by something that watches the screen and not
  //   only by a regex that watches the source.
});

test("[pin] the pin is not a second draw path — it rides homeCard and the same cull", () => {
  // A pinned house must still be culled with the others. The guard is that the
  // pin lives inside homeCard, which is only ever called from inside the drawn
  // loop; there is no second call site that could draw an off-screen house.
  const calls = [...SOURCE.matchAll(/homeCard\(/g)].length;
  assert.equal(calls, 3, "homeCard is defined once and called twice — the drawn set and the houses pass");
  assert.doesNotMatch(SOURCE, /pinnedColumnParcelId[^\n]*markInDrawnBounds/,
    "the pin does not reach around the cull");
});

// ── and the page, because the above only proves lines were typed ────────────

const PLAYWRIGHT_PATHS = ["playwright", "file:///G:/Wright-HQ/node_modules/playwright/index.mjs"];
async function loadChromium() {
  for (const spec of PLAYWRIGHT_PATHS) {
    try { return (await import(spec)).chromium; } catch { /* next */ }
  }
  return null;
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const CLEANUP = [];
after(() => { for (const stop of CLEANUP.reverse()) { try { stop(); } catch { /* gone */ } } });

let chromium = null, port = null, browser = null;
before(async () => {
  chromium = await loadChromium();
  if (!chromium) return;
  port = await freePort();
  const proc = spawn(process.execPath, [join(ROOT, "spectator", "server.mjs")], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  CLEANUP.push(() => proc.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the rig did not announce itself in 30s")), 30_000);
    proc.stdout.on("data", (b) => { if (String(b).includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => { clearTimeout(timer); reject(new Error(`the rig exited ${c}`)); });
  });
  browser = await chromium.launch();
  CLEANUP.push(() => browser.close());
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".wv-telling-pane", { state: "attached", timeout: 90_000 });
  await page.evaluate(() => { const el = document.querySelector(".wv-tour-skip"); if (el && el.offsetParent) el.click(); });
  await page.waitForFunction(() => document.querySelectorAll("#wv-overlay [data-id]").length > 0,
    null, { timeout: 60_000 }).catch(() => {});
  const state = () => page.evaluate(() => [
    document.getElementById("wv-overlay")?.getAttribute("data-tier") ?? "-",
    document.querySelectorAll("#wv-overlay .ov-home").length,
    document.querySelectorAll("#wv-overlay .ov-glyph").length,
  ].join("/"));
  page.settle = async () => {
    let last = await state(), held = 0, waited = 0;
    while (held < 900 && waited < 40_000) {
      await page.waitForTimeout(150); waited += 150;
      const now = await state();
      held = now === last ? held + 150 : 0; last = now;
    }
  };
  await page.settle();
  return { page, errors };
}

/** click a mark on the painting, at its own place on the screen */
async function clickMark(page, id) {
  const at = await page.evaluate((pid) => {
    const el = document.querySelector(`#wv-overlay .ov-pip[data-id="${pid}"]`)
      ?? document.querySelector(`#wv-overlay .ov-glyph[data-id="${pid}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, id);
  if (!at) throw new Error(`no mark on screen for ${id}`);
  await page.mouse.click(at.x, at.y);
  // A HOUSE USUALLY HAS SOMEONE STANDING ON IT. Residents are drawn over their
  // own parcels, so a click at a house's centre is a CROWDED click and the map
  // answers with the chooser (residents, parcels, then other marks) rather than
  // selecting anything. Measured on the live page: the first house I clicked
  // put a walker's frame topmost and raised the chooser, and the test read that
  // as "the column did not open". Finishing the choice is what a reader does.
  await page.waitForTimeout(250);
  const chose = await page.evaluate((pid) => {
    const row = document.querySelector(`[data-choose="${pid}"]`);
    if (!row) return false;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, id);
  if (chose) await page.waitForTimeout(250);
}

/**
 * THE HOUSES A READER COULD CLICK, in document order. The far tier draws every
 * parcel within one viewport of the edge (drawOverlay: "same box, one viewport
 * of margin"), so the overlay's first glyph is not the first glyph ON SCREEN —
 * and a mouse click at a place off the screen lands on nothing. Measured
 * 2026-09-14 on S70's record (ff2c50b8): the first glyph in document order
 * moved from histor-reeves' parcel at y=123 to amia-semper's at y=−401, and
 * both page tests below went red on "the column is up" while the pin itself
 * was sound. The keeper refused S70 on exactly those two reds. So: only a
 * glyph whose whole shape lies inside the viewport is a house to click.
 */
const housesOnScreen = (page) => page.evaluate(() => {
  const inset = 4;
  return [...document.querySelectorAll("#wv-overlay .ov-glyph[data-id]")]
    .filter((g) => {
      const b = g.getBoundingClientRect();
      return b.left >= inset && b.top >= inset
        && b.right <= innerWidth - inset && b.bottom <= innerHeight - inset;
    })
    .map((g) => g.dataset.id);
});

/** how one parcel is drawn right now: a far glyph, or a full card */
const formOf = (page, id) => page.evaluate((pid) => {
  const ov = document.getElementById("wv-overlay");
  const glyph = ov?.querySelector(`.ov-glyph[data-id="${pid}"]`);
  const card = [...(ov?.querySelectorAll(".ov-home[data-id]") ?? [])].find((c) => c.dataset.id === pid);
  return {
    tier: ov?.getAttribute("data-tier") ?? "-",
    glyph: !!glyph,
    card: !!card,
    picture: !!card?.querySelector("image"),
    named: !!card?.querySelector(".ov-home-label"),
    totalGlyphs: ov?.querySelectorAll(".ov-glyph").length ?? 0,
    totalCards: ov?.querySelectorAll(".ov-home").length ?? 0,
  };
}, id);

test("THE PAGE — a clicked house keeps its card at far; its neighbour stays a glyph", async (t) => {
  if (!chromium) {
    t.skip("NO PLAYWRIGHT — the pin, the redraw trigger and the neighbour case went UNGUARDED. "
      + "The source pins above prove the lines were typed and nothing more.");
    return;
  }
  const { page, errors } = await openPage();
  assert.deepEqual(errors, [], "the page mounted without throwing");

  // two houses at the far tier, both beads — and both ON THE SCREEN, or the
  // click below asks nothing (see housesOnScreen)
  const onScreen = await housesOnScreen(page);
  assert.ok(onScreen.length >= 2, `the far tier drew two houses inside the viewport to click (${onScreen.length})`);
  const pair = { a: onScreen[0], b: onScreen[1] };
  const before = await formOf(page, pair.a);
  assert.equal(before.tier, "far", "we are at the far tier");
  assert.equal(before.glyph, true, "…and the house is a glyph before the click");
  assert.equal(before.card, false);

  // CLICK IT THE WAY A READER DOES, with the mouse at a place on the screen.
  // A synthetic MouseEvent on the pip does nothing and I nearly wrote this test
  // around one: the map does not select from the event's target, it hit-tests
  // screen coordinates on the svg's own pointerdown/pointerup
  // (contestedMarksAtPoint over screenMarkCandidates). Dispatching a click at
  // an element is therefore a probe that cannot pass.
  await clickMark(page, pair.a);
  await page.settle();

  const columnUp = await page.evaluate(() => {
    const col = document.querySelector(".wv-homecol");
    return !!col && !col.hidden && col.offsetParent !== null;
  });
  assert.equal(columnUp, true, "the column is up — otherwise the next line asks nothing");

  const after = await formOf(page, pair.a);
  assert.equal(after.tier, "far", "the camera has not moved: still the far tier");
  assert.equal(after.card, true, "the clicked house is now a CARD at far");
  assert.equal(after.glyph, false, "…and no longer a glyph");
  assert.equal(after.named, true, "it wears its name");

  // the neighbour is untouched — this is what makes it a pin and not a tier change
  const neighbour = await formOf(page, pair.b);
  assert.equal(neighbour.glyph, true, "its neighbour is still a glyph");
  assert.equal(neighbour.card, false);
  assert.ok(after.totalCards <= 2, `only the pinned house became a card (${after.totalCards})`);

  await page.close();
  // ⚑ THE FLIP: remove the redraw trigger and `after` still reads a glyph —
  //   the rule is in the code and never reaches the screen.
});

test("THE PAGE — closing the column gives the house back to the camera", async (t) => {
  if (!chromium) { t.skip("NO PLAYWRIGHT — the unpin went UNGUARDED."); return; }
  const { page, errors } = await openPage();
  assert.deepEqual(errors, [], "the page mounted without throwing");
  const [id] = await housesOnScreen(page);
  assert.ok(id, "a house on the screen to click");

  await clickMark(page, id);
  await page.settle();
  assert.equal((await formOf(page, id)).card, true, "pinned");

  // the column's own ✕ — an ordinary DOM button, so an ordinary click reaches it
  await page.click(".wv-homecol-close");
  await page.settle();

  const back = await formOf(page, id);
  assert.equal(back.tier, "far", "still the far tier");
  assert.equal(back.card, false, "the house is not a card any more");
  assert.equal(back.glyph, true, "…it is a glyph again, following the camera like the rest");
  await page.close();
});
