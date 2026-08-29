// room-music.test.mjs — a room can carry a tune, and it never follows you out.
//
// FOUNDER, 2026-08-29: music inside the candle vault, toggleable from a button
// in the upper right, "same visual type as the existing round map buttons", and
// where there is no track of its own a HANDROLLED loop rather than silence.
//
// ⚑ WHAT A TEST CAN AND CANNOT SAY HERE, stated up front because half of this
// feature is a sound. Nothing below hears anything. What is falsifiable is the
// TUNE — every note the fallback will ever play is derivable from a table, with
// no AudioContext anywhere near it — and the RULES: when the button exists, what
// the dial means, which source wins, and that leaving stops it. The sounding
// itself is checked in the browser, by reading the player's own state, and the
// shot runner says so in as many words rather than implying it listened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { midiHz, musicDial, themeNotes, themeSeconds, VAULT_THEME } from "../spectator/viewer.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");

// ══ THE DIAL ════════════════════════════════════════════════════════════════

test("the dial says whether a ground has music, and which track", () => {
  // THE CONTRACT, in three lines. A URL is a track; `true` is "music here, use
  // the handrolled loop"; anything else is silence and no button.
  assert.deepEqual(musicDial({ dials: { music: "/birthday/vault-theme.mp3" } }),
    { play: true, src: "/birthday/vault-theme.mp3" });
  assert.deepEqual(musicDial({ dials: { music: true } }), { play: true, src: null });
  assert.deepEqual(musicDial({ dials: {} }), { play: false, src: null });
  assert.deepEqual(musicDial({ dials: { music: false } }), { play: false, src: null });
  assert.deepEqual(musicDial({ dials: { music: "   " } }), { play: false, src: null },
    "a blank string is not a track — it is a dial somebody meant to fill in");
  assert.deepEqual(musicDial(null), { play: false, src: null }, "and no ground at all is no music");
});

test("nothing here is keyed on the vault — any ground may ask", () => {
  // ⚑ THE CAN-FAIL CONTROL FOR THE WHOLE FEATURE'S SHAPE. If the vault's id
  // appeared in this machinery, the dial would be decoration over a hardcoded
  // room, and every test above would still pass.
  assert.doesNotMatch(String(musicDial), /candle|vault/i, "the reader names no room");
  assert.doesNotMatch(SOURCE, /the-town\/the-candle-vault/,
    "and the file names that room nowhere at all");
  // the same dial on a different ground answers the same way
  assert.deepEqual(musicDial({ id: "keith/the-garage", dials: { music: true } }),
    { play: true, src: null });
});

// ══ THE TUNE ════════════════════════════════════════════════════════════════

test("the handrolled loop is a table, and the table is the whole tune", () => {
  // Eight bars of four, a bass note per bar and the figure in eighths over it.
  assert.equal(VAULT_THEME.bars, 8);
  assert.equal(VAULT_THEME.chords.length, VAULT_THEME.bars, "one chord per bar");
  assert.equal(VAULT_THEME.figure.length, 8, "the figure is a bar of eighths");
  const notes = themeNotes();
  assert.equal(notes.length, VAULT_THEME.bars * (1 + VAULT_THEME.figure.length),
    "every bar contributes its bass and its eight arpeggio notes");
  assert.equal(notes.filter((n) => n.voice === "bass").length, 8);
  // the loop's length is the arithmetic, not a number written down twice
  assert.equal(themeSeconds(), (8 * 4 * 60) / VAULT_THEME.bpm);
  assert.equal(themeSeconds().toFixed(2), "26.67", "…which at 72bpm is a shade under half a minute");
  // AND IT IS IN A MINOR KEY, which is the one thing about the mood that a test
  // can actually check: the first bar's bass is an A, and its arpeggio holds the
  // minor third rather than the major one.
  const first = notes.filter((n) => n.at < 4);
  assert.equal(first.find((n) => n.voice === "bass").midi, 57 - VAULT_THEME.bassDrop, "A1 under the first bar");
  const pitches = new Set(first.filter((n) => n.voice === "arp").map((n) => n.midi));
  assert.ok(pitches.has(60), "C — the minor third");
  assert.ok(!pitches.has(61), "and not C sharp, which would make it a major chord in a dungeon");
});

test("nothing in the tune needs a browser to be known", () => {
  // ⚑ THE POINT OF THE TABLE. These four exports ran in `node --test`, with no
  // AudioContext in the process — so a change to the tune is a change a test
  // can see, and only the SOUNDING of it needs a browser.
  assert.equal(typeof globalThis.AudioContext, "undefined", "no audio in this process");
  assert.ok(themeNotes().every((n) => Number.isFinite(n.midi) && Number.isFinite(n.at)),
    "every note is a number and a time");
  assert.equal(midiHz(69), 440, "A440, so a pitch becomes a frequency in exactly one place");
  assert.equal(midiHz(57).toFixed(3), (220).toFixed(3), "an octave below is half the frequency");
  // the synth SCHEDULES from that list and does not compose its own
  assert.match(SOURCE, /const notes = themeNotes\(theme\);/, "the player reads the table");
  assert.match(SOURCE, /osc\.frequency\.value = midiHz\(n\.midi\);/, "and the one pitch conversion");
  assert.doesNotMatch(SOURCE, /function startChiptune\([\s\S]{0,4000}?Math\.random/,
    "nothing about the loop is improvised at play time");
});

test("modest volume is a number, not an adjective", () => {
  assert.equal(VAULT_THEME.gain, 0.15);
  assert.match(SOURCE, /out\.gain\.value = theme\.gain;/, "the fallback is played at it");
  assert.match(SOURCE, /el\.volume = VAULT_THEME\.gain;/, "and so is the founder's own track");
  assert.equal(VAULT_THEME.cutoffHz, 1400);
  assert.match(SOURCE, /lp\.type = "lowpass";/, "through the gentle lowpass — squares are glassy without it");
});

// ══ THE BUTTON, AND WHEN IT IS THERE AT ALL ═════════════════════════════════

test("the button is one of the round map controls, and starts hidden and off", () => {
  assert.match(SOURCE, /<button type="button" class="ctl wv-map-music" aria-label="music" hidden\r?\n\s*aria-pressed="false"/,
    "same .ctl as its neighbours, hidden until a room asks, and OFF");
  assert.match(SOURCE, /\.wv-mapctl \{ position:absolute; z-index:6; top:10px; right:10px;/,
    "…in the row that hangs at the painting's upper right");
});

test("it appears only inside a ground whose dial asks for music, and goes when you leave", () => {
  // ⚑ ONE READER FOR ALL THREE CASES. Outdoors and an undialed interior are the
  // same branch — there is no music here — which is why neither can be forgotten
  // separately. `room` is null outdoors, and musicDial(null) is {play:false}.
  assert.match(SOURCE, /const dial = musicDial\(room \? \(byId\.get\(room\.id\) \?\? room\) : null\);/,
    "the mounted room's own mark, or nothing");
  assert.match(SOURCE, /if \(!dial\.play\) \{[\s\S]{0,400}?stopMusic\(\);\r?\n\s*btn\.hidden = true;\r?\n\s*return;\r?\n\s*\}/,
    "no dial: the sound stops and the button leaves, on the same branch");
  // AND IT IS DRIVEN FROM THE SCENE'S OWN SYNC, which is the line that makes
  // "audio stops on exit" true without a second exit path to remember.
  assert.match(SOURCE, /syncSceneExit\(boxEl, room, key\);\r?\n\s*syncMusic\(room\);/,
    "called where the way-out pill is decided, off the same room");
  // …and the other exit that is not a door
  assert.match(SOURCE, /bubbleResize\?\.disconnect\(\);\r?\n\s*\/\/ ⚑ AND THE ROOM GOES QUIET\./,
    "a torn-down viewer stops it too");
});

test("the file is preferred, and its FAILURE may never stop the loop", () => {
  // TWO TIERS, and the ORDER is the interesting half: the fallback sounds
  // immediately and the file replaces it when it arrives. An 8MB track behind
  // preload="none" has not begun downloading until then, so waiting for it would
  // be a silent vault for as long as the night is slow.
  assert.match(SOURCE, /music\.synth = startChiptune\(\);/, "the stand-in starts at once");
  assert.match(SOURCE, /el\.addEventListener\("playing", \(\) => \{[\s\S]{0,400}?music\.synth\.stop\(\)/,
    "and stands down the moment the real track is sounding");
  assert.match(SOURCE, /el\.preload = "none";/, "the file is not fetched until somebody wants it");
  assert.match(SOURCE, /el\.loop = true;/, "and it loops, like the fallback");

  // ⚑ THE BUG THE FOUNDER HIT, pinned so it cannot come back. It was one line:
  //     el.play().catch(() => { stopMusic(); })
  // `play()` rejects for two unrelated reasons — "no gesture yet" and "this URL
  // is not playable audio" — and that catch could not tell them apart, so a file
  // that would not play tore down the whole player INCLUDING the chiptune. On dev
  // the mp3 was answering a Cloudflare Access login page (HTML, 200), so he
  // pressed the button and got silence and a dark button.
  assert.doesNotMatch(SOURCE, /el\.play\?\.\(\)\.catch\(\(\) => \{[\s\S]{0,200}?stopMusic\(\)/,
    "the file's rejection no longer stops the music");
  assert.match(SOURCE, /el\.play\?\.\(\)\.then\(undefined, fileGivesUp\);/,
    "it hands both failure routes to one narrow handler");
  assert.match(SOURCE, /const fileGivesUp = \(\) => \{\r?\n\s*if \(music\?\.el !== el\) return;[\s\S]{0,240}?music\.el = null;\r?\n\s*refreshMusicButton\(\);\r?\n\s*\};/,
    "which puts down the ELEMENT and nothing else");
  // THE CAN-FAIL CONTROL FOR THAT CLAIM: the giving-up path must not mention the
  // synth at all. If a future edit adds a synth teardown there, this fails.
  const givesUp = /const fileGivesUp = \(\) => \{([\s\S]*?)\n    \};/.exec(SOURCE);
  assert.ok(givesUp, "the handler is findable");
  assert.doesNotMatch(givesUp[1], /synth|stopMusic/,
    "nothing in the file's failure path can reach the loop");
  // and the only two things that DO stop the loop are named
  assert.match(SOURCE, /el\.addEventListener\("playing", \(\) => \{[\s\S]{0,400}?music\.synth\.stop\(\); music\.synth = null;/,
    "the file succeeding");
  assert.match(SOURCE, /function stopMusic\(\) \{[\s\S]{0,300}?music\.synth\.stop\(\)/, "and leaving the room");
});

test("music defaults ON, and the first touch anywhere is the permission", () => {
  // FOUNDER, 2026-08-29. A browser sounds nothing until a hand has asked, so the
  // default cannot be "playing" — it is "wanting to play, and starting the moment
  // it is allowed to". Which gesture counts is the only thing that changed.
  assert.match(SOURCE, /if \(!musicOptedOut\(\)\) startMusic\(\);/,
    "every entry tries, unless this reader has said no");
  assert.doesNotMatch(SOURCE, /if \(musicRemembered\(\)\) startMusic\(\);/, "there is no remembered YES to wait for");
  // ⚑ `document`, NOT `doc` — and this one was a live ReferenceError, caught by
  // the browser run and by nothing else. In this file `doc` is a locally-scoped
  // parsed XML document, so the unlock threw the moment it was reached: the one
  // path that only runs when the browser is refusing, which is the path hardest
  // to reach on purpose. Pinned by name.
  assert.match(SOURCE, /document\.addEventListener\("pointerdown", wake, \{ once: true, capture: true \}\);\r?\n\s*document\.addEventListener\("keydown", wake, \{ once: true, capture: true \}\);/,
    "the next gesture of ANY kind, once, on the real document");
  assert.doesNotMatch(SOURCE, /\bdoc\.(add|remove)EventListener/,
    "and never on the parsed-XML `doc` this file also has a name for");
  assert.match(SOURCE, /if \(!ctx \|\| ctx\.state !== "suspended" \|\| unlockArmed\) return;/,
    "armed only while the browser is actually refusing, and only once");
  assert.match(SOURCE, /if \(music\?\.on && music\.src && !music\.el\) playFile\(\);/,
    "and the file gets its second chance on the same gesture");
  // it is given back — a page-wide capture listener left armed is a page that
  // reacts to a press nobody aimed at it
  assert.match(SOURCE, /function disarmGestureUnlock\(\) \{/);
  assert.match(SOURCE, /function stopMusic\(\) \{\r?\n\s*disarmGestureUnlock\(\);/, "leaving disarms it");
});

test("only the NO is remembered, and it is remembered in a fresh slot", () => {
  // Under a default of ON, storing "on" says nothing — and storing a STATE rather
  // than a CHOICE is how a preference gets written by accident. The slot holds one
  // thing: this reader pressed the button off.
  assert.match(SOURCE, /const MUSIC_OFF_KEY = "pm_world_music_off";/);
  assert.match(SOURCE, /if \(music\.on\) \{ stopMusic\(\); rememberOptOut\(true\); return; \}\r?\n\s*rememberOptOut\(false\);/,
    "pressing off records the opt-out; pressing back on withdraws it rather than writing a yes");
  // ⚑ AND THE OLD SLOT IS NOT READ. It was written on every start, including
  // starts that immediately failed, so a value in it is not reliably anybody's
  // choice — and under the new meaning reading it could silence a room on the
  // strength of an accident.
  assert.doesNotMatch(SOURCE, /getItem\("pm_world_music"\)/, "the old key is not consulted");
  assert.doesNotMatch(SOURCE, /musicRemembered/, "nor its reader");
  // storage stays a convenience and never a requirement
  assert.match(SOURCE, /catch \{ \/\* a browser that refuses storage still gets music \*\/ \}/);
});

test("the button is dressed off what is SOUNDING, never off what was intended", () => {
  // "never lit over silence" was already the rule; a default of ON gives it far
  // more silence to be wrong about, so the dressing reads the real sources.
  assert.match(SOURCE, /const soundingNow = \(\) => Boolean\(\r?\n\s*music\?\.synth\?\.ctx\?\.state === "running" \|\| \(music\?\.el && !music\.el\.paused\),\r?\n\s*\);/,
    "the context's own word, or the element's own word");
  assert.match(SOURCE, /const refreshMusicButton = \(\) => setMusicButton\(soundingNow\(\)/,
    "and every asynchronous turn re-reads them");
  assert.match(SOURCE, /ctx\.addEventListener\?\.\("statechange", \(\) => refreshMusicButton\(\)\);/,
    "including the context waking up on its own");
  // WANTING AND SOUNDING ARE DIFFERENT, and the button says which it is in
  assert.match(SOURCE, /const waiting = Boolean\(music\?\.on\) && !on;/);
  assert.match(SOURCE, /waiting \? "the music starts the moment you touch the page"/,
    "a reader waiting on their own first gesture is told so, not left at a dead button");
});

test("the toggle is a toggle, and the context is released rather than silenced", () => {
  assert.match(SOURCE, /if \(e\.target\.closest\("\.wv-map-music"\)\) \{ toggleMusic\(\); return; \}/,
    "on the same delegated click every other map control uses");
  assert.match(SOURCE, /if \(music\.synth\) \{ music\.synth\.stop\(\); music\.synth = null; \}/);
  assert.match(SOURCE, /try \{ ctx\.close\(\); \} catch/, "the context is closed, not just silenced");
});
