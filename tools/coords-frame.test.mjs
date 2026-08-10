// coords-frame.test.mjs — SCHEMA v3 § The frame. A mark's `at:` is written as an
// offset from its parent's centre; `loadMarks` composes world coordinates once,
// at load, and nothing downstream can tell which frame the files were written in.
//
// The load-bearing claim these guard is the EQUIVALENCE: the same world, written
// both ways, must fold to the same positions. (tools/coords-equivalence.mjs makes
// that claim against the real tree and two real checkouts; this makes it against
// a fixture small enough to read.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadMarks, fold, declaredCoords, worldToFile, fileToWorld, ringToFile, ringToWorld,
  COORDS_FIELD, COORDS_RELATIVE, COORDS_ABSOLUTE,
} from "./marks-fold.mjs";

// ── fixtures ─────────────────────────────────────────────────────────────────
// A spec is { path, fm } — the path is the nesting, the frontmatter is the record.
function treeOf(records) {
  const dir = mkdtempSync(join(tmpdir(), "coords-frame-"));
  for (const { path, fm } of records) {
    const d = join(dir, ...path.split("/"));
    mkdirSync(d, { recursive: true });
    const lines = Object.entries(fm).map(([k, v]) => {
      if (k === "at") return `at: { x: ${v.x}, y: ${v.y} }`;
      if (k === "extent") return `extent: { w: ${v.w}, h: ${v.h} }`;
      if (k === "points") return `points: ${v.map((p) => `${p[0]},${p[1]}`).join(" ")}`;
      return `${k}: ${v}`;
    });
    writeFileSync(join(d, "mark.md"), `---\n${lines.join("\n")}\n---\n\nA record in a fixture.\n`);
  }
  return dir;
}

const R = "let-there-be-light";
const sited = (at, extent, extra = {}) => ({ kind: "sited", by: "t", date: "2026-08-09", at, extent, ...extra });

// The SAME world, told twice. Absolute states every position against the origin;
// relative states each against the centre it stands in. The root and the mark on
// open ground carry identical numbers in both — that is the point, not a fluke.
const ABSOLUTE = [
  { path: R, fm: { kind: "sited", by: "the-town", tier: "constitution", date: "2026-07-22", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } } },
  { path: `${R}/region`, fm: sited({ x: 1000, y: 2000 }, { w: 500, h: 500 }) },
  { path: `${R}/region/house`, fm: sited({ x: 1010, y: 2005 }, { w: 20, h: 20 }) },
  { path: `${R}/region/house/hearth`, fm: sited({ x: 1008, y: 2004 }, { w: 2, h: 2 }) },
  { path: `${R}/region/lake`, fm: sited({ x: 1100, y: 2100 }, { w: 40, h: 20 }, { points: [[1080, 2090], [1120, 2090], [1120, 2110], [1080, 2110]] }) },
  { path: `${R}/open`, fm: sited({ x: 5000, y: 6000 }, { w: 10, h: 10 }) },
];
const RELATIVE = [
  { path: R, fm: { ...ABSOLUTE[0].fm, [COORDS_FIELD]: COORDS_RELATIVE } },
  { path: `${R}/region`, fm: sited({ x: 1000, y: 2000 }, { w: 500, h: 500 }) },        // framed on the root's centre: unchanged
  { path: `${R}/region/house`, fm: sited({ x: 10, y: 5 }, { w: 20, h: 20 }) },          // from the region's centre
  { path: `${R}/region/house/hearth`, fm: sited({ x: -2, y: -1 }, { w: 2, h: 2 }) },    // from the house's centre
  { path: `${R}/region/lake`, fm: sited({ x: 100, y: 100 }, { w: 40, h: 20 }, { points: [[80, 90], [120, 90], [120, 110], [80, 110]] }) },
  { path: `${R}/open`, fm: sited({ x: 5000, y: 6000 }, { w: 10, h: 10 }) },
];

const positions = (marks) => Object.fromEntries(marks.filter((m) => m.at).map((m) => [m.id, `${m.at.x},${m.at.y}`]));
const withTree = (records, fn) => { const d = treeOf(records); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };

// ── the transforms ───────────────────────────────────────────────────────────
test("every (position, origin) pair the record actually holds survives the round trip exactly", () => {
  // The real sub-meter cases, lifted from WORLD/marks with their real origins —
  // the ones where the arithmetic could plausibly lose a bit and did not.
  const REAL = [
    [{ x: 1075, y: -790.9 }, { x: 1075, y: -800 }],          // rei/the-front-walk
    [{ x: 1075, y: -795.4 }, { x: 1075, y: -795 }],          // rei/the-front-door
    [{ x: 1076.5, y: -794.8 }, { x: 1075, y: -795 }],        // rei/the-road-dust-brush
    [{ x: 1137, y: 2788.6 }, { x: 1140, y: 2795 }],          // rei/the-thyme-thank-you
    [{ x: 576, y: -2593.6 }, { x: 575, y: -2600 }],          // rei/the-white-flower-at-wrights-door
    [{ x: -96497.5, y: -95480 }, { x: -95458, y: -95458 }],  // little-bird/a-pot-on-the-grey-stones
    [{ x: 655, y: 3324.5 }, { x: 655, y: 3325 }],            // merrick-nocturne/the-lantern
    [{ x: 0, y: 0 }, { x: 0, y: 0 }],                        // the root: it IS the frame
  ];
  for (const [at, origin] of REAL) {
    const back = fileToWorld(worldToFile(at, origin), origin);
    assert.deepEqual(back, at, `${at.x},${at.y} framed on ${origin.x},${origin.y}`);
  }
});

test("the transform is NOT universally invertible in doubles — which is why the migration ships a falsifier", () => {
  // Subtract-then-add loses a bit for some pairs. This is not a defect to fix
  // (rounding it away would move a mark by ~1e-14 m and hide real error); it is
  // the reason the v2→v3 rewrite is proved by CHECKING EVERY RECORD
  // (tools/coords-equivalence.mjs, zero tolerance) rather than by algebra.
  // Keep this case: if it ever starts round-tripping, the arithmetic changed.
  const at = { x: 1075, y: -790.9 }, origin = { x: 1010, y: 2005 };
  assert.notDeepEqual(fileToWorld(worldToFile(at, origin), origin), at);
  // and the offset a real pair writes is deliberately the exact difference,
  // ugly decimal and all — that spelling is what makes it recoverable
  assert.equal(worldToFile({ x: 1075, y: -790.9 }, { x: 1075, y: -800 }).y, 9.100000000000023);
});

test("a points ring shifts by the same transform and keeps the spelling it was authored in", () => {
  const origin = { x: 1010, y: 2005 };
  const ring = [[80, 90], [120, 110]];
  assert.deepEqual(ringToFile(ring, origin), [[80 - 1010, 90 - 2005], [120 - 1010, 110 - 2005]]);
  assert.deepEqual(ringToWorld(ringToFile(ring, origin), origin), ring, "a ring round-trips");
  // an {x,y}-spelled ring comes back {x,y}-spelled — the migration rewrites records, not their grammar
  assert.deepEqual(ringToFile([{ x: 80, y: 90 }], origin), [{ x: 80 - 1010, y: 90 - 2005 }]);
});

// ── the absolute tree is untouched ───────────────────────────────────────────
test("a tree that declares nothing is absolute, and its positions are read verbatim", () => {
  withTree(ABSOLUTE, (dir) => {
    const marks = loadMarks(dir);
    assert.equal(declaredCoords(marks), COORDS_ABSOLUTE, "no declaration = v2 absolute");
    assert.deepEqual(positions(marks), {
      "the-town/let-there-be-light": "0,0", "t/region": "1000,2000", "t/house": "1010,2005",
      "t/hearth": "1008,2004", "t/lake": "1100,2100", "t/open": "5000,6000",
    });
    const hearth = marks.find((m) => m.id === "t/hearth");
    assert.deepEqual(hearth._fileAt, { x: 1008, y: 2004 }, "_fileAt is what the file says");
    assert.deepEqual(hearth._origin, { x: 1010, y: 2005 }, "_origin is the parent's centre even on an absolute tree — the migration needs it");
    assert.deepEqual(marks.find((m) => m.id === "t/lake").points, ABSOLUTE[4].fm.points, "an absolute ring is not shifted");
  });
});

// ── the same world, both frames ──────────────────────────────────────────────
test("THE EQUIVALENCE: the same world written in either frame loads to the same positions", () => {
  withTree(ABSOLUTE, (abs) => withTree(RELATIVE, (rel) => {
    const a = loadMarks(abs), b = loadMarks(rel);
    assert.equal(declaredCoords(b), COORDS_RELATIVE);
    assert.deepEqual(positions(b), positions(a), "every mark composes to exactly the position the absolute tree states");
    // and the ring rides with it
    assert.deepEqual(b.find((m) => m.id === "t/lake").points, a.find((m) => m.id === "t/lake").points);
    // ...all the way through the fold, which is the only thing anything downstream sees
    const foldOf = (marks) => JSON.stringify(fold({ marks, terrain: { features: [] }, stakes: [] }).marks);
    assert.equal(foldOf(b), foldOf(a), "the fold cannot tell which frame the files were written in");
  }));
});

test("the root keeps world numbers, open ground is framed on the origin, depth composes by the chain", () => {
  withTree(RELATIVE, (dir) => {
    const by = Object.fromEntries(loadMarks(dir).map((m) => [m.id, m]));
    assert.deepEqual(by["the-town/let-there-be-light"]._origin, { x: 0, y: 0 }, "the root IS the frame");
    assert.deepEqual(by["the-town/let-there-be-light"].at, { x: 0, y: 0 });
    assert.deepEqual(by["t/open"]._origin, { x: 0, y: 0 }, "open ground is framed on the root's centre");
    assert.deepEqual(by["t/open"]._fileAt, by["t/open"].at, "so its file numbers ARE its world numbers");
    assert.deepEqual(by["t/house"]._origin, { x: 1000, y: 2000 });
    assert.deepEqual(by["t/hearth"]._origin, { x: 1010, y: 2005 }, "two levels down, framed on the composed parent");
    assert.deepEqual(by["t/hearth"]._fileAt, { x: -2, y: -1 }, "the file keeps the offset the resident wrote");
  });
});

test("moving a container moves everything inside it, with no sweep of the children", () => {
  // The whole reason for the frame: edit ONE line and the contents follow.
  const moved = RELATIVE.map((r) => (r.path === `${R}/region` ? { ...r, fm: { ...r.fm, at: { x: 1300, y: 2400 } } } : r));
  withTree(moved, (dir) => {
    const by = Object.fromEntries(loadMarks(dir).map((m) => [m.id, m]));
    assert.deepEqual(by["t/house"].at, { x: 1310, y: 2405 }, "the house rode with its region");
    assert.deepEqual(by["t/hearth"].at, { x: 1308, y: 2404 }, "and so did the hearth inside the house");
    assert.deepEqual(by["t/open"].at, { x: 5000, y: 6000 }, "open ground did not move");
  });
});

test("extent is a size and never moves; a points ring is a set of positions and does", () => {
  withTree(RELATIVE, (dir) => {
    const lake = loadMarks(dir).find((m) => m.id === "t/lake");
    assert.deepEqual(lake.extent, { w: 40, h: 20 }, "the extent is the file's, unshifted");
    assert.deepEqual(lake.points, [[1080, 2090], [1120, 2090], [1120, 2110], [1080, 2110]], "the ring composed with the mark");
  });
});

test("a positioned mark under a predicate is framed on the nearest ancestor that has a centre", () => {
  // The lint forbids this nesting (a predicate's children must be predicates), but
  // the loader must not silently frame a mark on nothing when it meets one.
  withTree([
    ...RELATIVE.slice(0, 3),
    { path: `${R}/region/house/the-law`, fm: { kind: "predicated", by: "t", date: "2026-08-09", slot: "mood", value: "quiet" } },
    { path: `${R}/region/house/the-law/lamp`, fm: sited({ x: 3, y: 4 }, { w: 1, h: 1 }) },
  ], (dir) => {
    const by = Object.fromEntries(loadMarks(dir).map((m) => [m.id, m]));
    assert.deepEqual(by["t/the-law"]._origin, { x: 1010, y: 2005 }, "a predicate is its parent continued — it carries that centre");
    assert.deepEqual(by["t/lamp"]._origin, { x: 1010, y: 2005 }, "the walk stepped past the predicate to the house");
    assert.deepEqual(by["t/lamp"].at, { x: 1013, y: 2009 });
  });
});

test("a frame declaration it cannot read is refused, never guessed", () => {
  withTree([{ path: R, fm: { ...ABSOLUTE[0].fm, [COORDS_FIELD]: "relatve" } }, ABSOLUTE[1], ABSOLUTE[2]], (dir) => {
    // Reading a typo as absolute would place every nested mark at its raw offset
    // and print success — the one failure this schema cannot afford to be quiet about.
    assert.throws(() => loadMarks(dir), /not a frame this loader knows/);
  });
});

test("a sub-tree with no root frames open ground on the world origin", () => {
  withTree([{ path: "region", fm: { ...sited({ x: 10, y: 20 }, { w: 4, h: 4 }), [COORDS_FIELD]: COORDS_RELATIVE } }], (dir) => {
    const [m] = loadMarks(dir);
    assert.deepEqual(m._origin, { x: 0, y: 0 });
    assert.deepEqual(m.at, { x: 10, y: 20 }, "a fixture loaded on its own is still readable");
  });
});
