// grounds-pair.test.mjs — the falsifier for the one-coordinate law
// (Keeping Works: postmark-node/mark/parcel/one-coordinate, planted 2026-09-02):
// "A parcel and the home it grounds share one coordinate. The ground stores it;
// the dwelling stands at zero offset; a divergent pair refuses at the fold."
// Wiring the refusal into marks-fold itself rides the build phase after the
// founder's red pen; this test guards the law over the live tree and proves the
// check CAN fail on a divergent fixture.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// every fixture this file makes is removed when the file finishes (the 09-01 rule)
const SCRATCH = [];
const scratch = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); SCRATCH.push(d); return d; };
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

/** Every parcel bearing a `home` predicate whose named house stands as a mark:
 *  the two world-composed coordinates must be equal. Returns the divergent pairs. */
function divergentGroundsPairs(marks) {
  const byId = new Map(marks.map((m) => [m.id, m]));
  const out = [];
  for (const p of marks) {
    if (p.kind !== "parcel" || !p.at) continue;
    const homeEdge = marks.find((m) => m.kind === "predicated" && m.slot === "home" && m._parentMarkId === p.id);
    if (!homeEdge || !homeEdge.value) continue;
    const house = byId.get(`${p.by}/${homeEdge.value}`);
    if (!house || !house.at) continue;
    if (Math.abs(house.at.x - p.at.x) > 0.01 || Math.abs(house.at.y - p.at.y) > 0.01)
      out.push({ parcel: p.id, home: house.id, parcel_at: p.at, home_at: house.at });
  }
  return out;
}

test("THE LAW: a parcel and the home it grounds share one coordinate — every live pair", () => {
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const divergent = divergentGroundsPairs(marks);
  assert.deepEqual(divergent, [],
    "a divergent pair refuses at the fold — the ground's number is the number");
});

test("the falsifier can fail: a divergent fixture pair is caught", () => {
  const d = scratch("grounds-pair-");
  const w = (rel, s) => { mkdirSync(join(d, dirname(rel)), { recursive: true }); writeFileSync(join(d, rel), s); };
  w("the-house-parcel/mark.md", "---\nby: test-h\nkind: parcel\ndate: 2026-09-02\nat: { x: 10, y: 10 }\nextent: { w: 25, h: 25 }\n---\n\nfixture parcel\n");
  w("the-house-parcel/home/mark.md", "---\nby: test-h\nkind: predicated\ndate: 2026-09-02\nslot: home\nvalue: the-house\n---\n\nfixture home edge\n");
  w("the-house-parcel/the-house/mark.md", "---\nby: test-h\nkind: sited\ndate: 2026-09-02\nat: { x: 15, y: 10 }\nextent: { w: 12, h: 10 }\n---\n\nfixture house, deliberately 5 m off its ground\n");
  const marks = loadMarks(d).filter((m) => !m._error);
  const divergent = divergentGroundsPairs(marks);
  assert.equal(divergent.length, 1, "the divergent pair must be caught");
  assert.equal(divergent[0].parcel, "test-h/the-house-parcel");
});
