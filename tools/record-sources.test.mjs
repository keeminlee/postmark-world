// record-sources.test.mjs — the read-time half of the world-pin guardrail.
//
//   node --test tools/record-sources.test.mjs
//
// The site's release lane resolves its world pin under three guardrails the
// founder ruled on 2026-08-25. This file asserts the FIRST one, quoted verbatim
// from that ruling and not paraphrased:
//
//     "tags only, never main tip."
//
// The site enforces it at build time (`tools/lib/world-pin.mjs`, falsified in
// `test/world-pin.test.mjs` over there). What was never enforced is the other
// end: the page itself used to fetch
// `https://raw.githubusercontent.com/keeminlee/postmark-world/main/...` whenever
// a record was missing same-origin — and one record, `WORLD/walk-ledger.md`, was
// missing from the site's staging list, so that leg was taken on EVERY load of
// postmark.town/world. Prod's departures were told from unblessed main while the
// build obeyed the law.
//
// Two shapes of probe, because one of them is not enough:
//
//   1. THE DECISION. `recordSources` is pure, so the chain it builds can be
//      read and asserted directly. If somebody adds a third leg, this goes red.
//   2. THE BYTES. A decision module can be bypassed by one inline `fetch`, which
//      is exactly how the original leg was written. So the viewer's own source
//      text is read and asserted to contain no main-tip URL at all.
//
// Both are paired with a case that proves the probe can still fail: an assertion
// that no input produces a forbidden URL is worth nothing if the detector cannot
// recognise a forbidden URL when handed one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { recordSources, recordAbsenceMessage, readsMainTip, WORLD_MAIN_TIP } from "./record-sources.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// Every public record the viewer reads same-origin, and the office lane beside
// it where one exists. Written out rather than derived: this list is the thing
// under test, and a test that derives its own inputs from the code it is testing
// asserts nothing.
const RECORDS = [
  { record: "/WORLD/world-state.json", office: "/api/world/state" },
  { record: "/WORLD/skeleton.json", office: "/api/world/skeleton" },
  { record: "/WORLD/walk-ledger.md", office: null },
  { record: "/WORLD/threshold-ledger.md", office: "/api/world/threshold-ledger" },
  { record: "/seeding/manifest.json", office: null },
];

// ---------------------------------------------------------------------------
// GUARDRAIL — "tags only, never main tip"
// ---------------------------------------------------------------------------

test('tags only, never main tip: no source chain the viewer builds names the world repo main tip', () => {
  for (const { record, office } of RECORDS) {
    for (const source of recordSources(record, { office })) {
      assert.equal(readsMainTip(source.url), false,
        `${record} may not be read from ${source.url}`);
    }
  }
});

test('tags only, never main tip: the detector recognises the forbidden URL, so the assertion above can fail', () => {
  // THE CAN-FAIL FLIP. This is the exact chain the viewer built before
  // 2026-08-26 — the third leg is the one that was removed. Fed to the same
  // detector the test above uses, it must come back forbidden.
  const beforeThisCut = [
    { url: "/api/world/state" },
    { url: "/WORLD/world-state.json" },
    { url: `${WORLD_MAIN_TIP}/WORLD/world-state.json` },
  ];
  const forbidden = beforeThisCut.filter((source) => readsMainTip(source.url));
  assert.equal(forbidden.length, 1);
  assert.equal(forbidden[0].url, `${WORLD_MAIN_TIP}/WORLD/world-state.json`);
});

test('tags only, never main tip: the viewer source itself carries no main-tip URL', () => {
  // THE BYTES, not the decision. The leg this cut removed was an inline literal
  // inside a fetch loop; a module boundary would not have stopped it being
  // written and would not stop it coming back.
  const viewer = readFileSync(join(ROOT, "spectator", "viewer.mjs"), "utf8");
  assert.equal(viewer.includes(WORLD_MAIN_TIP), false,
    `spectator/viewer.mjs must not name ${WORLD_MAIN_TIP}`);
});

test('tags only, never main tip: the source-text probe can fail, shown against the pre-cut line', () => {
  // THE CAN-FAIL FLIP for the probe above, against the exact line that used to
  // sit at spectator/viewer.mjs:28.
  const preCutLine = `const RAW = "${WORLD_MAIN_TIP}";`;
  assert.equal(preCutLine.includes(WORLD_MAIN_TIP), true);
});

test('the local spectator server answers for every record the viewer reads same-origin', () => {
  // The fallback was removable only because nothing real needed it. That claim
  // is checked here rather than asserted: the local habitat must serve, off its
  // own disk, every path the viewer asks this origin for. `/WORLD/walk-ledger.md`
  // is the one that was missing, and its absence is what the main-tip leg was
  // actually covering.
  const server = readFileSync(join(ROOT, "spectator", "server.mjs"), "utf8");
  for (const { record } of RECORDS) {
    assert.ok(server.includes(`p === "${record}"`),
      `spectator/server.mjs has no route for ${record} — a local read would have nowhere to go`);
  }
});

// ---------------------------------------------------------------------------
// AN ABSENCE IS NAMED, NOT FILLED IN
// ---------------------------------------------------------------------------

test('a record that could not be read is reported as INCOMPLETE, never as empty', () => {
  const message = recordAbsenceMessage("/WORLD/walk-ledger.md");
  assert.match(message, /\/WORLD\/walk-ledger\.md/);
  assert.match(message, /INCOMPLETE, not empty/);
});

test('the absence names every source that was tried, so a reader can see where it looked', () => {
  const message = recordAbsenceMessage("/WORLD/threshold-ledger.md", { office: "/api/world/threshold-ledger" });
  assert.match(message, /\/api\/world\/threshold-ledger/);
  assert.match(message, /\/WORLD\/threshold-ledger\.md/);
  assert.equal(readsMainTip(message), false);
});

// ---------------------------------------------------------------------------
// THE CHAIN'S OWN SHAPE
// ---------------------------------------------------------------------------

test('the office goes first where there is one, because it reads a clone and a staged file is a photograph', () => {
  const chain = recordSources("/WORLD/threshold-ledger.md", { office: "/api/world/threshold-ledger" });
  assert.deepEqual(chain.map((source) => source.url),
    ["/api/world/threshold-ledger", "/WORLD/threshold-ledger.md"]);
  assert.equal(chain[0].json, true);    // the office wraps the ledger in JSON
  assert.equal(chain[1].json, false);   // a file IS the text
});

test('a record with no office lane is read from this origin and nowhere else', () => {
  assert.deepEqual(recordSources("/WORLD/walk-ledger.md").map((source) => source.url),
    ["/WORLD/walk-ledger.md"]);
});

test('a source that is not a same-origin path is refused rather than fetched', () => {
  // The one way a main-tip URL could re-enter through this module is somebody
  // passing one in. It does not get to be a "record".
  assert.throws(() => recordSources(`${WORLD_MAIN_TIP}/WORLD/world-state.json`), /same-origin path/);
  assert.throws(() => recordSources("WORLD/world-state.json"), /same-origin path/);
});
