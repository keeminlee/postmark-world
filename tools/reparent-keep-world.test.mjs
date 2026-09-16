// reparent-keep-world.test.mjs — THE REPARENT VERB, held from both sides.
// POS-102 · postmark#2865 (2026-09-16). The law under test, in the issue's words:
//
//   "A structural edit never moves anything. reparentKeepWorld(child, newFrame)
//    — take the child's composed world position and write `at` as that position
//    expressed in the new frame. Two call sites: a frame leaves canon with
//    standing marks filed under it — reparent each direct child to the next frame
//    up, keep world, then let the frame go; a frame comes back — reparent the
//    same children back into it, keep world."
//
// Fixtures first (a tree small enough to check by hand), then the real tree: the
// five frames the 09-16 return kept, by name, leave and return — and a sample of
// whatever frames bind the most children today, so the falsifier keeps meaning
// something after those five have gone.

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { snapshotWorld, reparentKeepWorld, keepWorldAcross, rewriteNumbers, ReframeRefusal } from "./reparent-keep-world.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LIVE = join(ROOT, "WORLD", "marks");

const record = ({ kind = "sited", by, tier, at, extent, points, body = "a mark", coords, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (points) lines.push(`points: ${points}`);
  if (coords) lines.push(`coords: ${coords}`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

function scratchTree(t, prefix = "pm-reparent-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marks = join(dir, "WORLD", "marks");
  const put = (rel, text) => { const f = join(marks, rel, "mark.md"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); return f; };
  return { dir, marks, put };
}

const worldOf = (marksDir) => {
  const out = new Map();
  for (const m of loadMarks(marksDir)) if (!m._error && !out.has(m.id)) out.set(m.id, { at: m.at ? { x: m.at.x, y: m.at.y } : null, points: m.points ?? null, frame: m._frameId ?? null });
  return out;
};
const line = (file, key) => (readFileSync(file, "utf8").match(new RegExp(`^${key}: .*$`, "m")) ?? [null])[0];

// ── the fixture: a district, a terrace on it, what stands on the terrace ──────
// root (the-town, constitution) at 0,0 · the-district (limen) at 1000,2000 ·
// the-terrace (limen) at 0,500 on the district → world 1000,2500 · on the
// terrace: hal's parcel at -100,-50 → world 900,2450 with hal's house at 0,0 on
// the parcel; wright's ring at 20,20 with a four-point ring; the town's plaque
// (constitution — outranks the terrace, so the WORLD frames it) at 1005,2505.
function terraceTree(t) {
  const tree = scratchTree(t);
  tree.put("let-there-be-light", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  tree.put("let-there-be-light/the-district", record({ by: "limen", at: { x: 1000, y: 2000 }, extent: { w: 3000, h: 3000 }, body: "a district" }));
  tree.terrace = tree.put("let-there-be-light/the-district/the-terrace", record({ by: "limen", at: { x: 0, y: 500 }, extent: { w: 300, h: 2000 }, body: "a terrace" }));
  tree.parcel = tree.put("let-there-be-light/the-district/the-terrace/the-parcel", record({ kind: "parcel", by: "hal", at: { x: -100, y: -50 }, extent: { w: 30, h: 30 }, body: "hal's parcel" }));
  tree.house = tree.put("let-there-be-light/the-district/the-terrace/the-parcel/the-house", record({ by: "hal", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 }, body: "hal's house" }));
  tree.ring = tree.put("let-there-be-light/the-district/the-terrace/the-ring", record({ by: "wright", at: { x: 20, y: 20 }, extent: { w: 10, h: 10 }, points: "15,15 25,15 25,25 15,25", body: "a ring of stones" }));
  tree.plaque = tree.put("let-there-be-light/the-district/the-terrace/the-plaque", record({ by: "the-town", tier: "constitution", at: { x: 1005, y: 2505 }, extent: { w: 2, h: 2 }, body: "the town's plaque" }));
  return tree;
}

test("the verb: a world position re-expressed in a new frame composes back exactly; a pair that would round is REFUSED, not moved", () => {
  assert.deepEqual(reparentKeepWorld({ id: "hal/the-parcel", at: { x: 900, y: 2450 } }, { x: 1000, y: 2000 }), { at: { x: -100, y: 450 }, points: null });
  assert.deepEqual(
    reparentKeepWorld({ id: "wright/the-ring", at: { x: 1020, y: 2520 }, points: [[1015, 2515], [1025, 2515]] }, { x: 1000, y: 2000 }),
    { at: { x: 20, y: 520 }, points: [[15, 515], [25, 515]] },
  );
  // coords-frame.test.mjs keeps this pair: subtract-then-add loses a bit. The
  // migration proved every record rather than trusting algebra for the same
  // reason; the verb refuses the record rather than moving it by 1e-14 m.
  assert.throws(() => reparentKeepWorld({ id: "x/rounds", at: { x: 1075, y: -790.9 } }, { x: 1010, y: 2005 }),
    (e) => e instanceof ReframeRefusal && /does not survive re-framing .* in doubles/.test(e.message) && e.refused[0].id === "x/rounds");
  assert.throws(() => reparentKeepWorld({ id: "x/nowhere" }, { x: 0, y: 0 }), ReframeRefusal, "a record with no position has nothing to re-express");
});

test("the file: only the frontmatter's at: (and points:) line changes — body, other fields and CRLF line endings stay as the author wrote them", () => {
  const crlf = "---\r\nkind: sited\r\nby: hal\r\nat: { x: 1, y: 2 }\r\npoints: 1,1 2,1 2,2\r\nextent: { w: 3, h: 3 }\r\n---\r\n\r\nat: home, a body line that says at:\r\n";
  const out = rewriteNumbers(crlf, { at: { x: -9, y: 8.5 }, points: [[0, 0], [1, 0], [1, 1]] }, "hal/x");
  assert.equal(out, "---\r\nkind: sited\r\nby: hal\r\nat: { x: -9, y: 8.5 }\r\npoints: 0,0 1,0 1,1\r\nextent: { w: 3, h: 3 }\r\n---\r\n\r\nat: home, a body line that says at:\r\n");
  assert.throws(() => rewriteNumbers("---\nkind: sited\nby: hal\n---\n", { at: { x: 1, y: 1 }, points: null }, "hal/y"), /has no "at:" line/);
  assert.throws(() => rewriteNumbers("---\nat: { x: 0, y: 0 }\n---\n", { at: { x: 1e-9, y: 0 }, points: null }, "hal/z"), /exponent notation/);
});

test("A FRAME LEAVES: its bound children hand to the next frame up and keep their world position; the grandchild rides its parent untouched; the outranking child was never framed by it — and A FRAME RETURNS: the same verb, the other way, back to the byte", (t) => {
  const tree = terraceTree(t);
  const original = { parcel: readFileSync(tree.parcel, "utf8"), ring: readFileSync(tree.ring, "utf8"), house: readFileSync(tree.house, "utf8"), plaque: readFileSync(tree.plaque, "utf8"), terrace: readFileSync(tree.terrace, "utf8") };
  const world0 = worldOf(tree.marks);
  assert.deepEqual(world0.get("hal/the-parcel"), { at: { x: 900, y: 2450 }, points: null, frame: "limen/the-terrace" }, "the fixture composes as the comment says");
  assert.deepEqual(world0.get("wright/the-ring").points, [[1015, 2515], [1025, 2515], [1025, 2525], [1015, 2525]]);
  assert.equal(world0.get("the-town/the-plaque").frame, "the-town/let-there-be-light", "the plaque outranks the terrace: the root frames it");

  // ── leave ──
  const before = snapshotWorld(tree.marks);
  unlinkSync(tree.terrace);
  const moved = keepWorldAcross(tree.marks, before);
  assert.deepEqual(moved.map((r) => [r.id, r.frame_from, r.frame_to]).sort(), [
    ["hal/the-parcel", "limen/the-terrace", "limen/the-district"],
    ["wright/the-ring", "limen/the-terrace", "limen/the-district"],
  ], "exactly the two the terrace framed — the receipt names both frames");
  assert.equal(line(tree.parcel, "at"), "at: { x: -100, y: 450 }", "hal's parcel, against the district now");
  assert.equal(line(tree.house, "at"), "at: { x: 0, y: 0 }", "the house rides its parcel and is not written");
  assert.equal(readFileSync(tree.house, "utf8"), original.house);
  assert.equal(line(tree.ring, "at"), "at: { x: 20, y: 520 }");
  assert.equal(line(tree.ring, "points"), "points: 15,515 25,515 25,525 15,525", "the ring rides the same frame as its at");
  assert.equal(readFileSync(tree.plaque, "utf8"), original.plaque, "the plaque is not written: the terrace never framed it");
  const world1 = worldOf(tree.marks);
  for (const [id, w] of world0) {
    if (id === "limen/the-terrace") { assert.equal(world1.has(id), false); continue; }
    assert.deepEqual({ at: world1.get(id).at, points: world1.get(id).points }, { at: w.at, points: w.points }, `${id} composes to exactly where it was`);
  }
  assert.equal(world1.get("hal/the-house").frame, "hal/the-parcel", "the grandchild's frame is still its parent");

  // ── return ──
  const departed = snapshotWorld(tree.marks);
  writeFileSync(tree.terrace, original.terrace);
  const back = keepWorldAcross(tree.marks, departed, { skip: new Set([tree.terrace]) });
  assert.deepEqual(back.map((r) => [r.id, r.frame_from, r.frame_to]).sort(), [
    ["hal/the-parcel", "limen/the-district", "limen/the-terrace"],
    ["wright/the-ring", "limen/the-district", "limen/the-terrace"],
  ]);
  assert.equal(readFileSync(tree.parcel, "utf8"), original.parcel, "the parcel's file is back to the byte");
  assert.equal(readFileSync(tree.ring, "utf8"), original.ring, "and the ring's");
  assert.deepEqual([...worldOf(tree.marks)].map(([id, w]) => [id, w.at, w.points]).sort(), [...world0].map(([id, w]) => [id, w.at, w.points]).sort(), "the world is exactly what it was before either edit");
});

test("A FRAME RETURNS SOMEWHERE ELSE: the edit's own record keeps its author's numbers (skip), and what stood on the old ground stays on the old ground rather than riding the new frame", (t) => {
  const tree = terraceTree(t);
  const world0 = worldOf(tree.marks);
  const before = snapshotWorld(tree.marks);
  unlinkSync(tree.terrace);
  keepWorldAcross(tree.marks, before);
  const departed = snapshotWorld(tree.marks);
  // the terrace comes back 100 m north of where it stood — the author's word
  writeFileSync(tree.terrace, record({ by: "limen", at: { x: 0, y: 600 }, extent: { w: 300, h: 2000 }, body: "a terrace, rebuilt a little north" }));
  const back = keepWorldAcross(tree.marks, departed, { skip: new Set([tree.terrace]) });
  assert.deepEqual(back.map((r) => r.id).sort(), ["hal/the-parcel", "wright/the-ring"]);
  const world2 = worldOf(tree.marks);
  assert.deepEqual(world2.get("limen/the-terrace").at, { x: 1000, y: 2600 }, "the returned frame stands where its author put it");
  assert.deepEqual(world2.get("hal/the-parcel").at, world0.get("hal/the-parcel").at, "hal's parcel did not move north with it");
  assert.equal(line(tree.parcel, "at"), "at: { x: -100, y: -150 }", "…its numbers changed instead");
  assert.deepEqual(world2.get("wright/the-ring").points, world0.get("wright/the-ring").points);
});

test("THE DOOR: a mark whose position does not survive re-framing in doubles is REFUSED by name, and nothing is written for it", (t) => {
  // coords-frame.test.mjs's pair, built into a tree: the district stands at
  // 1010,2005; the terrace at -1010,-2005 on it composes to 0,0 exactly; the
  // stone at 1075,-790.9 on the terrace composes to 1075,-790.9 exactly. Take the
  // terrace away and the stone would have to be written against 1010,2005 —
  // which loses a bit.
  const tree = scratchTree(t, "pm-reparent-door-");
  tree.put("let-there-be-light", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative" }));
  tree.put("let-there-be-light/the-district", record({ by: "limen", at: { x: 1010, y: 2005 }, extent: { w: 20000, h: 20000 } }));
  const terrace = tree.put("let-there-be-light/the-district/the-terrace", record({ by: "limen", at: { x: -1010, y: -2005 }, extent: { w: 8000, h: 8000 } }));
  const stone = tree.put("let-there-be-light/the-district/the-terrace/the-stone", record({ by: "hal", at: { x: 1075, y: -790.9 }, extent: { w: 1, h: 1 } }));
  const stoneText = readFileSync(stone, "utf8");
  assert.deepEqual(worldOf(tree.marks).get("hal/the-stone").at, { x: 1075, y: -790.9 });
  const before = snapshotWorld(tree.marks);
  unlinkSync(terrace);
  assert.throws(() => keepWorldAcross(tree.marks, before),
    (e) => e instanceof ReframeRefusal && e.refused.length === 1 && e.refused[0].id === "hal/the-stone"
      && e.refused[0].frame_from === "limen/the-terrace" && e.refused[0].frame_to === "limen/the-district" && /rounding/.test(e.refused[0].reason));
  assert.equal(readFileSync(stone, "utf8"), stoneText, "nothing was written for the record it refused");
});

// ── THE FALSIFIER, over the real tree ─────────────────────────────────────────

const FIVE = [
  "let-there-be-light/the-threshold-district/fog-on-the-lower-terrace",
  "let-there-be-light/the-threshold-district/footpath-becomes-a-suggestion",
  "let-there-be-light/the-threshold-district/the-descending-terraces",
  "let-there-be-light/the-threshold-district/wide-spaced-lanterns",
  "let-there-be-light/the-lanternseed-gardens/the-experiment-garden",
];

function liveCopy(t, prefix) {
  const scratch = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  cpSync(LIVE, scratch, { recursive: true });
  return scratch;
}

// Leave the named frames, prove nothing else moved, bring them back, prove every
// rewritten file is back to the byte. Shared by the two real-tree tests below.
function leaveAndReturn(scratch, frames, liveWorld) {
  const ids = new Set(frames.map((rel) => loadMarks(scratch).find((m) => !m._error && m._dir.replace(/\\/g, "/").endsWith(`/${rel}`))?.id).filter(Boolean));
  assert.equal(ids.size, frames.length, `every named frame is a readable record on the live tree (${[...ids].join(", ")})`);
  const originals = new Map();
  for (const rel of frames) originals.set(rel, readFileSync(join(scratch, rel, "mark.md"), "utf8"));

  const before = snapshotWorld(scratch);
  for (const rel of frames) unlinkSync(join(scratch, rel, "mark.md"));
  const moved = keepWorldAcross(scratch, before);
  assert.ok(moved.length > 0, "the frames named actually framed something, or this proved nothing");
  for (const row of moved) assert.ok(ids.has(row.frame_from), `${row.id} left ${row.frame_from}, which is one of the frames that left`);
  const departed = worldOf(scratch);
  for (const [id, w] of liveWorld) {
    if (ids.has(id)) { assert.equal(departed.has(id), false, `${id} left`); continue; }
    assert.ok(departed.has(id), `${id} still stands`);
    assert.deepEqual({ at: departed.get(id).at, points: departed.get(id).points }, { at: w.at, points: w.points }, `${id} stands exactly where it stood`);
  }

  const beforeReturn = snapshotWorld(scratch);
  for (const rel of frames) writeFileSync(join(scratch, rel, "mark.md"), originals.get(rel));
  const back = keepWorldAcross(scratch, beforeReturn, { skip: new Set(frames.map((rel) => join(scratch, rel, "mark.md"))) });
  assert.deepEqual(back.map((r) => r.id).sort(), moved.map((r) => r.id).sort(), "the return re-expresses exactly the records the leaving did");
  for (const row of moved) {
    const rel = row.file.replace(/\\/g, "/").slice(scratch.replace(/\\/g, "/").length + 1);
    assert.equal(readFileSync(row.file, "utf8"), readFileSync(join(LIVE, rel), "utf8"), `${row.id}: back to the byte`);
  }
  const returned = worldOf(scratch);
  for (const [id, w] of liveWorld) assert.deepEqual({ at: returned.get(id)?.at ?? null, points: returned.get(id)?.points ?? null }, { at: w.at, points: w.points }, `${id} after the round trip`);
  return moved;
}

test("THE FALSIFIER (the 09-16 return's five): limen's four terraces and rei's experiment garden leave the real tree, and everything that stood on them stands where it stood — then they return, and every re-expressed number comes back to the byte", (t) => {
  const present = FIVE.filter((rel) => existsSync(join(LIVE, rel, "mark.md")));
  if (!present.length) { t.skip("the five have left the live tree — the acceptance ran; the sample below carries the invariant"); return; }
  const scratch = liveCopy(t, "pm-reparent-five-");
  const moved = leaveAndReturn(scratch, present, worldOf(LIVE));
  const movedIds = new Set(moved.map((r) => r.id));
  // the ones the 05:45Z crossing caught moving — a house, a parcel, a gift
  for (const id of ["hal/the-green-lamp-house-parcel", "noe/the-setting-down-house-parcel", "ryuu-kurogane/the-fox-and-dragon-house-parcel", "neth/hedgerow-cottage"])
    if (present.length === FIVE.length) assert.ok(movedIds.has(id), `${id} was framed by a terrace and is re-expressed`);
  assert.equal(movedIds.has("hal/the-green-lamp-house"), false, "hal's house rides hal's parcel and is not written");
  t.diagnostic(`${moved.length} record(s) re-expressed across the five: ${[...movedIds].sort().join(", ")}`);
});

test("THE FALSIFIER (whatever binds the most today): the six frames that frame the most marks on the live tree leave at once and return, and nothing else moves", (t) => {
  const live = loadMarks(LIVE).filter((m) => !m._error);
  const root = live.find((m) => m.slug === "let-there-be-light");
  const count = new Map();
  for (const m of live) if (m._fileAt && m._frameId && m._frameId !== root?.id) count.set(m._frameId, (count.get(m._frameId) ?? 0) + 1);
  const fiveIds = new Set(FIVE.map((rel) => rel.split("/").pop()));
  const chosen = [...count].filter(([id]) => !fiveIds.has(id.split("/").pop()))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6)
    .map(([id]) => live.find((m) => m.id === id)._dir.replace(/\\/g, "/").slice(LIVE.replace(/\\/g, "/").length + 1));
  assert.equal(chosen.length, 6, "the live tree has at least six frames binding something");
  const scratch = liveCopy(t, "pm-reparent-sample-");
  const moved = leaveAndReturn(scratch, chosen, worldOf(LIVE));
  t.diagnostic(`frames: ${chosen.map((c) => c.split("/").pop()).join(", ")} — ${moved.length} record(s) re-expressed and restored`);
});
