// entered-chip-shots.mjs — the rendered half of the entered-mark chip.
//
//   PORT=4893 node spectator/server.mjs &
//   node tools/entered-chip-shots.mjs [port] [outdir]
//
// WHAT ONLY A SHOT CAN SETTLE. The unit tests say the chip resolves to the
// entered mark and that the room's own floor stops answering; they cannot say
// whether the dot in the corner of the painting still looks like a mark, whether
// the bubble it opens is anchored anywhere a reader can see, or — the whole
// complaint — whether moving the mouse around a room now leaves the middle of
// the screen alone. Those are pixels.
//
// ⚑ THE STANDPOINT IS REAL RECORD, NOT A FIXTURE. The only thing faked here is
// the identity answer, so the page will act as a resident at all: everything
// downstream — which room `sable` is inside, where its walls are, what the chip
// resolves to — is folded out of this clone's own enter-exit ledger and marks.
// A fixture standpoint would have proved the mechanism against a world of my own
// making, which is the failure this whole ask came out of.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("G:/Wright-HQ/package.json");
const { chromium } = require("playwright");

const PORT = Number(process.argv[2] ?? 4893);
const OUT = process.argv[3] ?? "qa-shots/entered-chip";
const BASE = `http://127.0.0.1:${PORT}/`;

// sable's last two acts in WORLD/enter-exit-ledger.md are ENTERS with no exit
// after them, so sable is standing inside the arcade, inside the grove.
const WHO = "sable";
const ROOM = "fabel-of-garrison/the-riverside-arcade";
const ROOT_MARK = "the-town/let-there-be-light";

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, line) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${line}`); if (!ok) failures.push(line); };

const browser = await chromium.launch();

async function open({ actAs }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => failures.push(`page error — ${e.message}`));
  // the identity door, and ONLY the identity door
  await page.route("**/ops/whoami", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ handles: actAs ? [actAs] : [], principal: false, household: "garrison" }),
  }));
  await page.addInitScript(([who, key]) => {
    try {
      localStorage.setItem("pm_key", "qa");
      if (who) { localStorage.setItem(key, who); localStorage.setItem("pm.world.last_resident", who); }
      else localStorage.setItem(key, "__spectator__");
      // the first-visit greeting, declined before it opens — its scrim covers the
      // whole page, so nothing below could reach the painting underneath it. A
      // spectator has no key to write and is greeted every load, which is why the
      // scrim is also removed outright further down.
      if (who) localStorage.setItem(`pm_world_tour_seen:${who}`, "1");
    } catch { /* a private window is not what this measures */ }
  }, [actAs, "pm.world.act_as"]);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wv-root-mark", { timeout: 20_000 });
  await page.waitForTimeout(2500); // the record, the fold, and the scene mount
  // ⚑ THE GREETING IS SKIPPED THE WAY A READER SKIPS IT, by pressing its own
  // skip. Removing the scrim alone was not enough and cost a false FAIL: the
  // tour PANEL is a separate element sitting in the middle of the painting, so a
  // sweep of the map hit the card instead of the ground and reported that
  // nothing outdoors answers the pointer any more. Pressing skip is also the
  // honest version — it leaves the page in the state a returning reader is in,
  // rather than one no reader can produce.
  const skip = await page.$(".wv-tour button:has-text('skip')");
  if (skip) { await skip.click(); await page.waitForTimeout(400); }
  await page.evaluate(() => { for (const el of document.querySelectorAll(".wv-tour, .wv-tour-scrim")) el.remove(); });
  return page;
}

const chipState = (page) => page.evaluate(() => {
  const el = document.querySelector(".wv-root-mark");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    label: el.getAttribute("aria-label"),
    tint: getComputedStyle(el).backgroundColor,
    tiers: [...el.classList].filter((c) => c.startsWith("t-")),
    box: { x: r.x, y: r.y, width: r.width, height: r.height },
    scene: document.querySelector(".wv-minimap")?.classList.contains("is-scene-mark") ?? false,
    plaque: document.querySelector(".wv-int-plaque-name")?.textContent?.trim() ?? null,
  };
});

/** Whatever card the painting is showing right now, and how much room it takes. */
const cardsUp = (page) => page.evaluate(() => [...document.querySelectorAll(".wv-bubble")]
  .filter((el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0)
  .map((el) => ({ txt: el.textContent.replace(/\s+/g, " ").trim().slice(0, 80), w: Math.round(el.getBoundingClientRect().width) })));

const shot = async (page, file, clip = null) => {
  await page.screenshot({ path: join(OUT, file), ...(clip ? { clip } : { fullPage: false }) });
  console.log(`  shot  ${join(OUT, file)}`);
};

/** Sweep the painting and collect every card the sweep summoned. */
async function sweep(page) {
  const svg = await page.$(".wv-minimap svg");
  const b = await svg.boundingBox();
  const seen = new Set();
  for (const [fx, fy] of [[.3, .3], [.5, .4], [.5, .6], [.7, .5], [.4, .7], [.6, .3]]) {
    await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy);
    await page.waitForTimeout(140);
    for (const c of await cardsUp(page)) seen.add(c.txt);
  }
  return [...seen];
}

// ══ INSIDE THE ROOM ═════════════════════════════════════════════════════════
console.log(`\n── standing inside ${ROOM} ──`);
{
  const page = await open({ actAs: WHO });
  const chip = await chipState(page);
  note(Boolean(chip), "the chip is on the painting at all");
  note(chip.scene, `the pane is showing an interior (plaque: ${JSON.stringify(chip.plaque)})`);
  note(!/Let There Be Light/i.test(chip.label ?? ""),
    `and the chip has stopped saying the world root (${JSON.stringify(chip.label)})`);
  note(/arcade/i.test(chip.label ?? ""), `it names the room whose interior this is (${JSON.stringify(chip.label)})`);
  // ⚑ AND IT IS DRAWN AS WHAT IT NAMES. Blue is this page's word for
  // CONSTITUTION; a blue dot over a room that is not one says the wrong thing in
  // the one language a reader learns by colour instead of by words.
  //
  // Checked against the ROOM'S OWN CARD rather than against a tier written down
  // here. Writing one down is how this assertion was wrong the first time — I
  // guessed "home" for a room the standing rule calls market, and a guess that
  // happened to be right would have proved nothing anyway.
  await page.hover(".wv-root-mark");
  await page.waitForTimeout(400);
  const cardTier = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".wv-bubble, .wv-card")]
      .find((n) => getComputedStyle(n).display !== "none" && n.getBoundingClientRect().width > 0);
    return [...(el?.classList ?? [])].find((c) => c.startsWith("t-")) ?? null;
  });
  note(Boolean(cardTier) && chip.tiers.includes(cardTier),
    `the chip carries the tier the room's own card carries (card ${cardTier}, chip ${JSON.stringify(chip.tiers)})`);
  note(chip.tint !== "rgb(123, 167, 224)", `and is no longer painted constitution-blue (${chip.tint})`);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  await shot(page, "01-inside-the-room.png");
  await shot(page, "02-the-chip-magnified.png",
    { x: Math.max(0, chip.box.x - 26), y: Math.max(0, chip.box.y - 26), width: chip.box.width + 190, height: chip.box.height + 52 });

  // ⚑ THE COMPLAINT ITSELF: "EVERYWHERE you put your mouse".
  const summoned = await sweep(page);
  note(summoned.length === 0, `six points around the room summon no mark card (${JSON.stringify(summoned)})`);
  await shot(page, "03-floor-hovered-nothing-summoned.png");

  // …and the room is still reachable, which is what makes that a removal of
  // noise rather than a mark becoming unlearnable inside itself.
  await page.hover(".wv-root-mark");
  await page.waitForTimeout(400);
  const onChip = await cardsUp(page);
  note(onChip.length === 1, `hovering the chip raises exactly one card (${onChip.length})`);
  note(/arcade/i.test(onChip[0]?.txt ?? ""), `and it is the room's own (${JSON.stringify(onChip[0]?.txt)})`);
  await shot(page, "04-the-chip-opens-the-room.png");
  await page.close();
}

// ══ OUTSIDE, WHICH MUST BE EXACTLY AS IT WAS ════════════════════════════════
console.log("\n── outdoors, unchanged ──");
{
  const page = await open({ actAs: null });
  const chip = await chipState(page);
  note(!chip.scene, "no interior is mounted");
  note(/Let There Be Light/i.test(chip.label ?? ""),
    `the chip is the world root again (${JSON.stringify(chip.label)})`);
  note(chip.tint === "rgb(123, 167, 224)",
    `and constitution-blue again, exactly as it always was (${chip.tint})`);
  const summoned = await sweep(page);
  note(summoned.length > 0,
    `and pointing at the painting still tells you what is there (${summoned.length} card(s): ${JSON.stringify(summoned.slice(0, 2))})`);
  await shot(page, "05-outdoors-hover-still-answers.png");
  await page.close();
}

await browser.close();
console.log(`\n${failures.length ? `FAILED (${failures.length})` : "all clear"}`);
for (const f of failures) console.log(`  · ${f}`);
process.exit(failures.length ? 1 : 0);
