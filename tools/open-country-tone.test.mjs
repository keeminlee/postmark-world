// open-country-tone.test.mjs — the void is dark, and the cutover still owes it paint.
//
// THE LAW, quoted (founder, 2026-08-26): "the cream is JARRING" — restore the
// dark visual of the void, keeping everything else the same.
//
// What "everything else" means is load-bearing and is asserted here too: the
// rect keeps existing, keeps the root mark's extent, and the camera fence and
// wheel cap stay exactly as the 2026-08-24 ruling set them. Only the tone moved.
//
// The claim is about a colour, which is the one kind of claim a node test
// cannot see rendered — so it is asserted where the colour is DECIDED (the
// source that names the fill) and not on pixels. The rendered look is a
// separate, human gate; this file's job is to make the decision un-drift-able.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "spectator", "viewer.mjs"), "utf8");

// The rect's own block, isolated, so a fill named somewhere else in a
// 495 KB file can never satisfy an assertion about THIS one.
function openCountryBlock() {
  const start = SOURCE.indexOf("// OPEN COUNTRY:");
  assert.notEqual(start, -1, "the open-country rect's block is gone — this test's subject no longer exists");
  const end = SOURCE.indexOf('svg.insertBefore(base, mistLayer);', start);
  assert.notEqual(end, -1, "the open-country rect no longer mounts under the mist");
  return SOURCE.slice(start, end);
}

test('THE VOID IS DARK: the ground rect fills with the page\'s own night, not a paper tone ("the cream is JARRING", founder 2026-08-26)', () => {
  const block = openCountryBlock();

  assert.match(block, /base\.setAttribute\("fill", "var\(--night\)"\)/,
    'the open-country rect must fill with var(--night) — the page ground it restores');

  // The cream, by name. This is the byte the ruling struck; if it comes back
  // in this block the ruling has been undone, whatever else the block says.
  assert.doesNotMatch(block, /#e3d5b3/i,
    'the cream (#e3d5b3) is back in the open-country block — founder-ruled out 2026-08-26');
});

test("AND --night IS ACTUALLY DARK — naming a token is not the same as being dark", () => {
  // Without this, the test above passes for a --night redefined to cream: the
  // rect would still say var(--night) and the void would still be jarring.
  // The ruling is about what the reader SEES, so the assertion follows the
  // token to its value.
  const m = SOURCE.match(/--night:\s*#([0-9a-f]{6})/i);
  assert.ok(m, "the .wv theme no longer defines --night, so the rect's fill resolves to nothing");

  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  // Rec. 601 luma, the same rough eye-weighting a reader applies. Night is
  // 20/23/29 -> luma ~22. The struck cream (#e3d5b3) is ~212. Anything in
  // between is a judgement call someone should have to make deliberately, so
  // the line sits well clear of both.
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  assert.ok(luma < 64, `--night resolves to #${m[1]} (luma ${luma.toFixed(1)}) — that is not a dark void`);
});

test("EVERYTHING ELSE STAYS: the rect still exists, still spans the root frame, and the camera is untouched (2026-08-24 ruling)", () => {
  const block = openCountryBlock();

  // still drawn, still the root frame's size, still under the mist
  assert.match(block, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "rect"\)/, "the rect is still a rect");
  assert.match(block, /base\.setAttribute\("width", worldFrame\.w\)/, "the rect still spans the world frame's width");
  assert.match(block, /base\.setAttribute\("height", worldFrame\.h\)/, "the rect still spans the world frame's height");
  assert.match(block, /base\.setAttribute\("id", "wv-open-country"\)/, "the rect keeps the id the QA reads it by");
  assert.match(block, /base\.style\.pointerEvents = "none"/, "the ground still takes no clicks");

  // the frame itself: the root mark's extent, never the painting's sheet
  assert.match(SOURCE, /const worldFrame = rootMk\?\.extent\?\.w > 0/,
    "the world frame no longer derives from the root mark's extent (2026-08-24 ruling)");

  // the camera fence and the wheel cap, both keyed to that frame
  assert.match(SOURCE, /const fence = zoomOutLimit > 1\s*\n?\s*\? \(worldFrame \?\?/,
    "the camera fence is no longer the world frame");
  assert.match(SOURCE, /zoomOutLimit > 1 && worldFrame \? worldFrame\.w : full\.w \* zoomOutLimit/,
    "the wheel cap is no longer keyed to the world frame");
});

test("A ROOM NEVER GETS OPEN COUNTRY — interiors are byte-identical either way", () => {
  // zoomOutLimit === 1 is a room; rootMk is only looked up above 1, so
  // worldFrame is null indoors and the whole block is skipped. This is the
  // 08-20 ruling the 08-24 one promised not to disturb, and the tone change
  // does not reach it either.
  assert.match(SOURCE, /const rootMk = zoomOutLimit > 1 \? \(world\?\.marks \?\? \[\]\)/,
    "a room now reaches for the root frame, which the 08-20 ruling forbids");
});
