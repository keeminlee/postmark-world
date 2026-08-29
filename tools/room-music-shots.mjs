// room-music-shots.mjs — the browser half of the room's music.
//
//   PORT=4898 WORLD_DIR=<a staged record> node spectator/server.mjs &
//   node tools/room-music-shots.mjs [port] [outdir]
//
// ⚑ THIS RUNNER CANNOT HEAR, and says so rather than implying otherwise. What a
// screenshot settles is whether the toggle looks like its neighbours and reads
// as pressed; what only a live page settles is whether an AudioContext actually
// came up RUNNING, whether the element got the room's track, and whether both
// were released on the way out. So the sound is checked by reading the player's
// own state and the pixels are checked by looking at them. Neither is asked to
// be the other.
//
// THE ROOM IS REAL RECORD. Only the identity answer is faked, and one dial is
// staged onto the room's mark in a COPY of the world tree — the live record is
// never written to from a QA run.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("G:/Wright-HQ/package.json");
const { chromium } = require("playwright");

const PORT = Number(process.argv[2] ?? 4898);
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

const browser = await chromium.launch();

/**
 * @param actAs      a resident to act as, or null for a spectator
 * @param track      "real" | "html" | "missing" — what the track URL answers
 * @param optOut     seed the opt-out slot
 * @param refuse     make the page's AudioContext report itself SUSPENDED
 */
async function open({ actAs = WHO, track = "real", optOut = false, refuse = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => failures.push(`page error — ${e.message}`));
  await page.route("**/ops/whoami", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ handles: actAs ? [actAs] : [], principal: false }),
  }));
  if (track === "real") {
    // THE FOUNDER'S OWN TRACK, off the site clone's disk, with the content type a
    // correctly-served origin sends. The world's dev server has no /birthday/ of
    // its own — that path belongs to the SITE's origin, where the page runs.
    await page.route("**/birthday/vault-theme.mp3", (route) => route.fulfill({
      status: 200, contentType: "audio/mpeg", body: TRACK,
    }));
  }
  if (track === "html") {
    // ⚑ WHAT AN ACCESS-FRONTED ORIGIN ACTUALLY SENDS: a 200 with a login PAGE.
    // Not a 404, not an error — HTML wearing a 200, which is the shape that took
    // the fallback down with it on dev.
    await page.route("**/birthday/vault-theme.mp3", (route) => route.fulfill({
      status: 200, contentType: "text/html", body: "<html><body>Sign in</body></html>",
    }));
  }
  await page.addInitScript(([who, key, off, refuseAudio]) => {
    try {
      localStorage.setItem("pm_key", "qa");
      if (who) { localStorage.setItem(key, who); localStorage.setItem("pm.world.last_resident", who); localStorage.setItem(`pm_world_tour_seen:${who}`, "1"); }
      else localStorage.setItem(key, "__spectator__");
      if (off) localStorage.setItem("pm_world_music_off", "1");
      else localStorage.removeItem("pm_world_music_off");
    } catch { /* a private window is not what this measures */ }
    const ctxs = []; const audios = [];
    window.__music = { ctxs, audios, gestures: 0 };
    // a real press, seen before anything else on the page can act on it — this is
    // the browser's user-activation bit, stood in for
    window.__gestured = false;
    document.addEventListener("pointerdown", () => { window.__gestured = true; }, { capture: true });
    document.addEventListener("keydown", () => { window.__gestured = true; }, { capture: true });
    const RealCtx = window.AudioContext;
    window.AudioContext = function (...a) {
      const c = new RealCtx(...a);
      if (refuseAudio) {
        // ⚑ THE BROWSER'S REFUSAL, SIMULATED, and labelled as such. Headless
        // Chromium grants audio even under --autoplay-policy=document-user-
        // activation-required, so a genuinely suspended context cannot be induced
        // here. What is faked is the BROWSER's answer; the code under test is
        // untouched, and this is the only way to drive the branch that waits for
        // a first gesture. Resuming is allowed to work on the second ask, which
        // is what a real gesture does.
        // ⚑ IT MUST REFUSE THE CODE'S OWN OPENING resume(), or it is not a
        // simulation of anything: startChiptune calls resume() immediately, so a
        // fake that woke on the first ask would report "running" before any hand
        // had touched the page — which is precisely the state being tested for.
        // So waking is gated on a REAL user gesture, read off the document.
        let woken = false;
        Object.defineProperty(c, "state", { get: () => (woken ? "running" : "suspended") });
        const realResume = c.resume.bind(c);
        c.resume = () => {
          if (!window.__gestured) return Promise.resolve();   // the browser's "not yet"
          if (!woken) { woken = true; window.__music.gestures++; }
          return realResume();
        };
      }
      ctxs.push(c);
      return c;
    };
    window.AudioContext.prototype = RealCtx.prototype;
    const RealAudio = window.Audio;
    window.Audio = function (...a) { const el = new RealAudio(...a); audios.push(el); return el; };
    window.Audio.prototype = RealAudio.prototype;
  }, [actAs, "pm.world.act_as", optOut, refuse]);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wv-root-mark", { timeout: 20_000 });
  await page.waitForTimeout(2600);
  const skip = await page.$(".wv-tour button:has-text('skip')");
  if (skip && await skip.isVisible()) { await skip.click(); await page.waitForTimeout(300); }
  await page.evaluate(() => { for (const el of document.querySelectorAll(".wv-tour, .wv-tour-scrim")) el.remove(); });
  return page;
}

const btn = (page) => page.evaluate(() => {
  const b = document.querySelector(".wv-map-music");
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    hidden: b.hidden, on: b.classList.contains("on"), title: b.getAttribute("title"),
    pressed: b.getAttribute("aria-pressed"),
    box: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
});

/** WHAT THE PLAYER ACTUALLY DID — the honest substitute for listening. */
const sound = (page) => page.evaluate(() => ({
  contexts: window.__music.ctxs.map((c) => c.state),
  gestures: window.__music.gestures,
  audios: window.__music.audios.map((a) => ({ src: a.getAttribute("src") ?? a.src, loop: a.loop, paused: a.paused, volume: a.volume })),
}));

const shot = async (page, file, clip = null) => {
  await page.screenshot({ path: join(OUT, file), ...(clip ? { clip } : {}) });
  console.log(`  shot  ${join(OUT, file)}`);
};

// ══ OUTDOORS: NO BUTTON, NOTHING BUILT ══════════════════════════════════════
console.log("\n── outdoors ──");
{
  const page = await open({ actAs: null });
  const b = await btn(page);
  note(b?.hidden === true, `the music button is not on the painting (hidden=${b?.hidden})`);
  const s = await sound(page);
  note(s.contexts.length === 0 && s.audios.length === 0, `and nothing was built to play with (${JSON.stringify(s.contexts)})`);
  await page.close();
}

// ══ THE DEFAULT: MUSIC, WITHOUT PRESSING ANYTHING ═══════════════════════════
console.log(`\n── inside ${ROOM}: it plays on its own ──`);
{
  const page = await open({});
  const b = await btn(page);
  note(b?.hidden === false, "the button appears inside the room");
  note(b.on === true && b.pressed === "true", `and the music is ON without anyone pressing it (${b.pressed})`);
  const s = await sound(page);
  note(s.contexts.length === 1, "the handrolled loop was built to cover the download");
  note(s.audios.length === 1 && /vault-theme/.test(s.audios[0].src), `and the room's track was asked for (${JSON.stringify(s.audios[0]?.src)})`);
  note(s.audios[0]?.loop === true && Math.abs(s.audios[0].volume - 0.15) < 0.001, "looping, at the modest volume");
  note(s.contexts.includes("running") || s.audios.some((a) => !a.paused), `something is sounding (${JSON.stringify(s.contexts)})`);
  const kin = await page.evaluate(() => {
    const all = [...document.querySelectorAll(".wv-mapctl .ctl")].filter((b) => !b.hidden);
    const r = document.querySelector(".wv-mapctl").getBoundingClientRect();
    return { sizes: [...new Set(all.map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`))],
             row: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
  note(kin.sizes.length === 1, `every round control is one size, the music one included (${JSON.stringify(kin.sizes)})`);
  await shot(page, "01-the-row-with-the-music-button.png", kin.row);
  await page.close();
}

// ══ THE BUG THE FOUNDER HIT: THE TRACK ANSWERS HTML ═════════════════════════
console.log("\n── the track answers an Access login page ──");
{
  const page = await open({ track: "html" });
  const b = await btn(page);
  const s = await sound(page);
  // ⚑ THE WHOLE POINT. Before the fix this was a closed context and a dark
  // button: the file's rejection tore down the loop with it.
  note(s.contexts.includes("running"), `the handrolled loop is still playing (${JSON.stringify(s.contexts)})`);
  note(b.on === true, "and the button is honestly lit, because something IS sounding");
  note(s.audios.every((a) => a.paused), "the track itself is not playing — it never could");
  await shot(page, "02-html-masquerade-loop-survives.png", b.box && { x: b.box.x - 90, y: b.box.y - 12, width: b.box.width + 110, height: b.box.height + 24 });
  await page.close();
}

// ══ A MISSING TRACK IS THE SAME PROMISE ═════════════════════════════════════
console.log("\n── the track 404s ──");
{
  const page = await open({ track: "missing" });
  const s = await sound(page);
  note(s.contexts.includes("running"), `a 404 costs the room its track, not its music (${JSON.stringify(s.contexts)})`);
  await page.close();
}

// ══ THE BROWSER REFUSES UNTIL A GESTURE ═════════════════════════════════════
console.log("\n── blocked, then any gesture at all ──");
{
  // ⚑ THE TRACK MUST BE GONE TOO, or this proves nothing. My first draft faked
  // only the AudioContext's refusal and left the mp3 answering: the element
  // played, so something WAS sounding and the button was honestly lit — a
  // correct result that looked like a failure. A page where the browser is
  // refusing is a page where nothing sounds, and that is what this stages.
  const page = await open({ refuse: true, track: "missing" });
  const before = await btn(page);
  const s0 = await sound(page);
  note(s0.contexts[0] === "suspended", `the context is refused (${JSON.stringify(s0.contexts)})`);
  note(s0.audios.every((a) => a.paused), "and the track is not covering for it either");
  note(before.on === false, "so the button is NOT lit — never lit over silence");
  note(/touch the page/.test(before.title ?? ""), `and it says what is waited on (${JSON.stringify(before.title)})`);
  // ⚑ NOT THE ♪ — a click on empty painting, which is the whole of "any gesture".
  await page.mouse.click(900, 700);
  await page.waitForTimeout(900);
  const after = await btn(page);
  const s1 = await sound(page);
  note(s1.gestures === 1, `one gesture woke it, exactly once (resumes: ${s1.gestures})`);
  note(after.on === true, "and the music is playing without the button ever being pressed");
  await page.close();
}

// ══ THE ONE THING REMEMBERED IS THE NO ══════════════════════════════════════
console.log("\n── a reader who said no ──");
{
  const page = await open({ optOut: true });
  const b = await btn(page);
  const s = await sound(page);
  note(b.hidden === false && b.on === false, "the button is there and the room is quiet");
  note(s.contexts.length === 0 && s.audios.length === 0, "nothing was built at all");
  await page.mouse.click(900, 700);
  await page.waitForTimeout(700);
  note((await btn(page)).on === false, "and no gesture talks them out of it");
  // …and pressing it withdraws the no
  await page.click(".wv-map-music");
  await page.waitForTimeout(900);
  note((await btn(page)).on === true, "pressing it plays");
  note(await page.evaluate(() => { try { return localStorage.getItem("pm_world_music_off"); } catch { return "?"; } }) === null,
    "and the opt-out is cleared rather than replaced with a yes nobody needs");
  await page.close();
}

// ══ LEAVING ═════════════════════════════════════════════════════════════════
console.log("\n── no longer standing in a room ──");
{
  const page = await open({});
  note((await btn(page)).on === true, "playing, so the exit below has something to stop");
  await page.click('[data-act-as="__spectator__"]');
  await page.waitForTimeout(1500);
  const gone = await btn(page);
  const s = await sound(page);
  note(gone?.hidden === true, `the button goes with the room (hidden=${gone?.hidden})`);
  note(s.contexts.every((c) => c === "closed") && s.audios.every((a) => a.paused),
    `and the vault does not follow you home (${JSON.stringify(s.contexts)}, paused ${JSON.stringify(s.audios.map((a) => a.paused))})`);
  await shot(page, "03-outside-again-no-button.png");
  await page.close();
}

await browser.close();
console.log(`\n${failures.length ? `FAILED (${failures.length})` : "all clear"}`);
for (const f of failures) console.log(`  · ${f}`);
process.exit(failures.length ? 1 : 0);
