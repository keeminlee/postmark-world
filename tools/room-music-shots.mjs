// room-music-shots.mjs — the browser half of the room's music.
//
//   PORT=4896 WORLD_DIR=<a staged record> node spectator/server.mjs &
//   node tools/room-music-shots.mjs [port] [outdir]
//
// ⚑ THIS RUNNER CANNOT HEAR, and says so rather than implying otherwise. What a
// screenshot settles is whether the toggle looks like its neighbours and reads
// as pressed; what only a live page settles is whether an AudioContext actually
// came up, whether the <audio> element was given the room's track, and whether
// both were released on the way out. So the sound is checked by reading the
// player's own state — ctx.state, el.src, el.loop, el.paused — and the pixels
// are checked by looking at them. Neither is asked to be the other.
//
// THE ROOM IS REAL RECORD. Only the identity answer is faked, and one dial is
// staged onto the room's mark in a COPY of the world tree — the live record is
// never written to from a QA run.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("G:/Wright-HQ/package.json");
const { chromium } = require("playwright");

const PORT = Number(process.argv[2] ?? 4896);
const OUT = process.argv[3] ?? "qa-shots/room-music";
const BASE = `http://127.0.0.1:${PORT}/`;

const WHO = "sable";
const ROOM = "fabel-of-garrison/the-riverside-arcade";
const TRACK_PATH = process.env.TRACK_PATH
  ?? "G:/Postmark/worktrees/bday-cockpit2/public/birthday/vault-theme.mp3";
const TRACK = readFileSync(TRACK_PATH);

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, line) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${line}`); if (!ok) failures.push(line); };

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function open({ actAs }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => failures.push(`page error — ${e.message}`));
  await page.route("**/ops/whoami", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ handles: actAs ? [actAs] : [], principal: false }),
  }));
  // THE FOUNDER'S OWN TRACK, off the site clone's disk. The world's dev server
  // has no /birthday/ of its own — that path is the SITE's origin, where the
  // page actually runs — so it is answered here from the real file rather than
  // stubbed, and what plays below is the mp3 that will ship.
  await page.route("**/birthday/vault-theme.mp3", (route) => route.fulfill({
    status: 200, contentType: "audio/mpeg", body: TRACK,
  }));
  // ⚑ THE PLAYER IS INSTRUMENTED, NOT SIMULATED. Real AudioContexts and real
  // <audio> elements are constructed by the page; these wrappers only record
  // that they were, so this runner can report what the viewer actually did.
  await page.addInitScript(([who, key]) => {
    try {
      localStorage.setItem("pm_key", "qa");
      if (who) { localStorage.setItem(key, who); localStorage.setItem("pm.world.last_resident", who); localStorage.setItem(`pm_world_tour_seen:${who}`, "1"); }
      else localStorage.setItem(key, "__spectator__");
      localStorage.removeItem("pm_world_music");
    } catch { /* a private window is not what this measures */ }
    const ctxs = []; const audios = [];
    window.__music = { ctxs, audios };
    const RealCtx = window.AudioContext;
    window.AudioContext = function (...a) { const c = new RealCtx(...a); ctxs.push(c); return c; };
    window.AudioContext.prototype = RealCtx.prototype;
    const RealAudio = window.Audio;
    window.Audio = function (...a) { const el = new RealAudio(...a); audios.push(el); return el; };
    window.Audio.prototype = RealAudio.prototype;
  }, [actAs, "pm.world.act_as"]);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wv-root-mark", { timeout: 20_000 });
  await page.waitForTimeout(2500);
  // the greeting, skipped the way a reader skips it — and only if it is actually
  // up. A resident whose seen-key was staged never sees it, and the button is
  // still in the DOM behind `hidden`, which is why this checks visibility
  // rather than presence.
  const skip = await page.$(".wv-tour button:has-text('skip')");
  if (skip && await skip.isVisible()) { await skip.click(); await page.waitForTimeout(300); }
  await page.evaluate(() => { for (const el of document.querySelectorAll(".wv-tour, .wv-tour-scrim")) el.remove(); });
  return page;
}

const btnState = (page) => page.evaluate(() => {
  const b = document.querySelector(".wv-map-music");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    hidden: b.hidden, on: b.classList.contains("on"), loading: b.classList.contains("is-loading"),
    pressed: b.getAttribute("aria-pressed"), title: b.getAttribute("title"),
    w: Math.round(r.width), h: Math.round(r.height),
    box: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
});

/** WHAT THE PLAYER ACTUALLY DID — the honest substitute for listening. */
const sound = (page) => page.evaluate(() => ({
  contexts: window.__music.ctxs.map((c) => c.state),
  audios: window.__music.audios.map((a) => ({ src: a.getAttribute("src") ?? a.src, loop: a.loop, preload: a.preload, paused: a.paused, volume: a.volume })),
}));

const shot = async (page, file, clip = null) => {
  await page.screenshot({ path: join(OUT, file), ...(clip ? { clip } : {}) });
  console.log(`  shot  ${join(OUT, file)}`);
};

// ══ OUTDOORS: NO BUTTON ═════════════════════════════════════════════════════
console.log("\n── outdoors ──");
{
  const page = await open({ actAs: null });
  const b = await btnState(page);
  note(b?.hidden === true, `the music button is not on the painting (hidden=${b?.hidden})`);
  const s = await sound(page);
  note(s.contexts.length === 0 && s.audios.length === 0, `and nothing was built to play with (${JSON.stringify(s)})`);
  await page.close();
}

// ══ INSIDE A ROOM WITH THE DIAL ═════════════════════════════════════════════
console.log(`\n── inside ${ROOM}, whose mark carries the dial ──`);
{
  const page = await open({ actAs: WHO });
  const rest = await btnState(page);
  note(rest && rest.hidden === false, `the button appears inside the room (hidden=${rest?.hidden})`);
  note(rest?.on === false && rest?.pressed === "false", "and it is OFF, which is the only honest default");
  // SAME VISUAL TYPE AS ITS NEIGHBOURS — measured, not eyeballed, and then also
  // eyeballed, because "same type" is a thing a reader judges by looking.
  const kin = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".wv-mapctl .ctl")].filter((b) => !b.hidden);
    const r = document.querySelector(".wv-mapctl").getBoundingClientRect();
    return { n: all.length, sizes: [...new Set(all.map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`))],
             row: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
  note(kin.sizes.length === 1, `every round control is one size, the music one included (${JSON.stringify(kin.sizes)})`);
  await shot(page, "01-the-row-with-the-music-button.png", kin.row);

  // ── the press ──
  await page.click(".wv-map-music");
  await page.waitForTimeout(900);
  const on = await btnState(page);
  note(on.on === true && on.pressed === "true", `pressing it lights it (${on.pressed}, title ${JSON.stringify(on.title)})`);
  const s = await sound(page);
  // ⚑ NOT A SCREENSHOT'S JOB, and not one state either. SOMETHING IS SOUNDING is
  // the claim, and there are two legitimate ways for it to be true: the
  // handrolled context running, or the founder's track playing with the synth
  // already stood down. My first draft asserted the context alone and FAILED
  // here — correctly — because served off local disk the mp3 wins the handover
  // almost immediately, which is the two-tier rule working exactly as designed.
  // A lit button over neither would be the thing worth catching.
  const sounding = s.contexts.includes("running") || s.audios.some((a) => !a.paused);
  note(sounding, `something is sounding (contexts ${JSON.stringify(s.contexts)}, playing ${JSON.stringify(s.audios.map((a) => !a.paused))})`);
  note(s.audios.length === 1 && /vault-theme/.test(s.audios[0].src),
    `and the room's own track is the one that won (${JSON.stringify(s.audios[0]?.src)})`);
  note(s.contexts.length === 1, "the handrolled loop was built too — it covers the wait, then stands down");
  note(s.audios[0]?.loop === true, "it loops");
  note(Math.abs((s.audios[0]?.volume ?? 1) - 0.15) < 0.001, `at the modest volume (${s.audios[0]?.volume})`);
  await shot(page, "02-music-on.png", on.box && { x: on.box.x - 90, y: on.box.y - 12, width: on.box.width + 110, height: on.box.height + 24 });

  // ── the second press ──
  await page.click(".wv-map-music");
  await page.waitForTimeout(500);
  const off = await btnState(page);
  note(off.on === false && off.pressed === "false", "pressing it again puts it out");
  const s2 = await sound(page);
  note(s2.audios.every((a) => a.paused), `the track is stopped (${JSON.stringify(s2.audios.map((a) => a.paused))})`);
  note(s2.contexts.every((c) => c === "closed"), `and the context is released, not just quiet (${JSON.stringify(s2.contexts)})`);

  // ── and stepping outside ──
  //
  // ⚑ TWO WAYS THIS COULD NOT BE DRIVEN, and saying which is the honest part.
  //
  // NOT BY THE WAY-OUT PILL: leaving is an ACT, written to the enter-exit ledger
  // through the office, and this server is read-only by construction. My first
  // draft pressed the pill and reported the button had not gone; what it had
  // found was a harness that never left the room.
  //
  // NOT BY THE RECORD EITHER, which is the more interesting failure. I appended
  // sable's exit line to the served ledger and called the viewer's own reload():
  // the fetch happened, the ledger carried the exit — and the interior stayed
  // mounted, way-out pill and all, still offering to step outside to The
  // Protected Grove. THAT IS PRE-EXISTING AND IT IS NOT ABOUT MUSIC: the built
  // interior pane is cached per standpoint and is not rebuilt on a ledger
  // re-read in painting-only mode, so the pill goes exactly as stale as the
  // button would. Reported rather than worked around; nothing here fixes it.
  //
  // SO IT IS DRIVEN BY THE STANDPOINT, through a control a reader really has.
  // Standing down to Spectator is "you are not inside anything" arriving by the
  // same route as any other change of who you are, and it is the branch the
  // music rule actually turns on: room null → stop and hide.
  await page.click(".wv-map-music");
  await page.waitForTimeout(700);
  note((await btnState(page)).on === true, "music on again, so the exit below has something to stop");
  await page.click('[data-act-as="__spectator__"]');
  await page.waitForTimeout(1500);
  const gone = await btnState(page);
  note(gone?.hidden === true, `no longer standing in a room, and the button goes with it (hidden=${gone?.hidden})`);
  const s3 = await sound(page);
  note(s3.contexts.every((c) => c === "closed") && s3.audios.every((a) => a.paused),
    `and the vault does not follow you home (contexts ${JSON.stringify(s3.contexts)}, paused ${JSON.stringify(s3.audios.map((a) => a.paused))})`);
  await shot(page, "03-outside-again-no-button.png");
  await page.close();
}

await browser.close();
console.log(`\n${failures.length ? `FAILED (${failures.length})` : "all clear"}`);
for (const f of failures) console.log(`  · ${f}`);
process.exit(failures.length ? 1 : 0);
