// tier-frames.test.mjs — § the tier binding (marks-fold.mjs; SCHEMA.md
// § Containment is not authority). Founder-ruled 2026-08-11 evening:
//
//   A PARENT BINDS A CHILD ONLY IF ITS TIER RANKS AT OR ABOVE THE CHILD'S.
//
// A bound child is framed by its parent and rides when the parent moves. An
// outranking child is framed by the WORLD and nothing its parent does can move
// it; when geometry drifts, its directory edge is RE-POINTED (a repair) rather
// than refused. A predicate can never outrank what it predicates — the one
// shape with no repair available, so that one IS refused.
//
// Four quadrants, one refusal, and a falsifier. The quadrants say what the rule
// means; the falsifier says the change that introduced it moved no ground.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, placementParent, tierRank, TIER_RANK, COORDS_FIELD, COORDS_RELATIVE } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");

// ── fixtures ─────────────────────────────────────────────────────────────────
// Same shape as coords-frame.test.mjs: a spec is { path, fm }, the path IS the
// nesting. Positions are written in the v3 relative frame, which is what makes
// the quadrants readable — a bound child's numbers are small and local, an
// outranking child's are the world's.
function treeOf(records) {
  const dir = mkdtempSync(join(tmpdir(), "tier-frames-"));
  for (const { path, fm } of records) {
    const d = join(dir, ...path.split("/"));
    mkdirSync(d, { recursive: true });
    const lines = Object.entries(fm).map(([k, v]) => {
      if (k === "at") return `at: { x: ${v.x}, y: ${v.y} }`;
      if (k === "extent") return `extent: { w: ${v.w}, h: ${v.h} }`;
      return `${k}: ${v}`;
    });
    writeFileSync(join(d, "mark.md"), `---\n${lines.join("\n")}\n---\n\nA record in a fixture.\n`);
  }
  return dir;
}
const withTree = (records, fn) => { const d = treeOf(records); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } };
const R = "let-there-be-light";
const THE_ROOT = { path: R, fm: {
  kind: "sited", by: "the-town", tier: "constitution", date: "2026-08-11",
  at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, [COORDS_FIELD]: COORDS_RELATIVE,
} };
const mark = (tier, at, extent, extra = {}) => ({ kind: "sited", by: "t", tier, date: "2026-08-11", at, extent, ...extra });
const by = (dir) => Object.fromEntries(loadMarks(dir).map((m) => [m.id, m]));

function runLint(marksDir) {
  const r = spawnSync(process.execPath, [LINT, "--marks-dir", marksDir, "--json"], { encoding: "utf8" });
  return { code: r.status, ...JSON.parse(r.stdout) };
}

// ── the ranks themselves ─────────────────────────────────────────────────────
test("the ranks are the law's order, and a record with no tier is market", () => {
  assert.deepEqual(TIER_RANK, { constitution: 3, sovereignty: 2, market: 1, draft: 0 });
  assert.equal(tierRank({ tier: "constitution" }) > tierRank({ tier: "sovereignty" }), true);
  assert.equal(tierRank({ tier: "sovereignty" }) > tierRank({ tier: "market" }), true);
  assert.equal(tierRank({ tier: "market" }) > tierRank({ tier: "draft" }), true);
  assert.equal(tierRank({}), TIER_RANK.market, "a missing tier is market");
  assert.equal(tierRank({ tier: "nonsense" }), TIER_RANK.market, "and so is one nobody can read");
  assert.equal(tierRank(undefined), TIER_RANK.market);
});

// ── QUADRANT 1: blue in yellow — a constitution mark inside a market claim ───
test("blue-in-yellow ANCHORS: the meadow cannot drag the river", () => {
  // A resident's meadow filed around one reach of the town's own river. The
  // reach outranks it, so the reach's numbers are the world's.
  const MEADOW = { path: `${R}/the-meadow`, fm: mark("market", { x: 1000, y: 1000 }, { w: 400, h: 400 }) };
  const REACH = { path: `${R}/the-meadow/the-reach`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 100, h: 20 }, { by: "the-town" }) };
  withTree([THE_ROOT, MEADOW, REACH], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["the-town/the-reach"]._origin, { x: 0, y: 0 }, "framed by the world, not by the meadow");
    assert.deepEqual(m["the-town/the-reach"].at, { x: 1000, y: 1000 }, "so its file numbers ARE its world numbers");
    assert.deepEqual(m["t/the-meadow"]._origin, { x: 0, y: 0 }, "…while the meadow itself stands on open ground");
  });

  // THE POINT OF THE WHOLE LAW: move the meadow, and the reach does not follow.
  const MOVED = { ...MEADOW, fm: { ...MEADOW.fm, at: { x: 9000, y: 9000 } } };
  withTree([THE_ROOT, MOVED, REACH], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-meadow"].at, { x: 9000, y: 9000 }, "the meadow went where its author put it");
    assert.deepEqual(m["the-town/the-reach"].at, { x: 1000, y: 1000 }, "and the river stayed exactly where it was");
  });

  // …and the edge that now lies is a REPAIR, not a refusal: the meadow no
  // longer contains the reach, so the directory must be re-pointed at the
  // tightest container that does — here, the root. Nothing about the reach
  // moves when it is.
  withTree([THE_ROOT, MOVED, REACH], (dir) => {
    const out = runLint(dir);
    assert.equal(out.errors, 0, "nobody is refused for it");
    assert.equal(out.code, 3, "exit 3 — repair needed, distinct from refused");
    assert.deepEqual(out.rehomes.map((r) => [r.mark, r.from, r.to]), [["the-town/the-reach", "t/the-meadow", null]]);
    assert.match(out.rehomes[0].msg, /The mark does not move/);
  });

  // While the meadow still contains it, the same filing is simply correct.
  withTree([THE_ROOT, MEADOW, REACH], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 0, "an outranking child filed in its true container is clean");
    assert.deepEqual(out.rehomes, []);
  });
});

// ── QUADRANT 2: yellow in green — a market mark inside a sovereignty one ─────
test("yellow-in-green is BOUND: it rides its parent, and a lying edge is still an ERROR", () => {
  const HOUSE = { path: `${R}/the-house`, fm: mark("sovereignty", { x: 500, y: 500 }, { w: 100, h: 100 }) };
  const LAMP = { path: `${R}/the-house/the-lamp`, fm: mark("market", { x: 10, y: -5 }, { w: 2, h: 2 }) };
  withTree([THE_ROOT, HOUSE, LAMP], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-lamp"]._origin, { x: 500, y: 500 }, "sovereignty outranks market, so the house binds the lamp");
    assert.deepEqual(m["t/the-lamp"].at, { x: 510, y: 495 }, "and the lamp's numbers are an offset from it");
  });
  withTree([THE_ROOT, { ...HOUSE, fm: { ...HOUSE.fm, at: { x: 800, y: 800 } } }, LAMP], (dir) => {
    assert.deepEqual(by(dir)["t/the-lamp"].at, { x: 810, y: 795 }, "the lamp rode with the house, on the record, with no sweep");
  });

  // A bound child whose edge stops being true is a question for its author, not
  // a job for the machinery: re-pointing the directory would re-frame the
  // lamp's numbers and move the lamp.
  withTree([
    THE_ROOT,
    HOUSE,
    { path: `${R}/the-house/the-lamp`, fm: mark("market", { x: 9000, y: 9000 }, { w: 2, h: 2 }) },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 1, "refused");
    assert.deepEqual(out.rehomes, [], "and never offered as a repair");
    assert.match(out.findings.find((f) => f.sev === "ERROR" && /the-lamp/.test(f.file)).msg,
      /the edge must name the tightest geometric container/);
  });
});

// ── QUADRANT 3: blue in blue — equal ranks bind ──────────────────────────────
test("blue-in-blue is BOUND: the wheelhouse rides the Post Office, and the Centre's three children bind", () => {
  // The live tree, not a fixture: equal tiers bind, so the whole constitution
  // spine still composes down the directory chain exactly as it did before the
  // rule. If `>=` were ever weakened to `>`, every one of these would anchor at
  // the world origin and the town would come apart at the quay.
  const m = by(join(ROOT, "WORLD/marks"));
  const rides = (child, parent) => {
    assert.equal(m[child].tier, "constitution", `${child} is constitution`);
    assert.equal(m[parent].tier, "constitution", `${parent} is constitution`);
    assert.equal(m[child]._parentMarkId, parent, `${child} is filed in ${parent}`);
    assert.deepEqual(m[child]._origin, { x: m[parent].at.x, y: m[parent].at.y }, `${child} is framed on ${parent}`);
  };
  rides("the-town/the-wheelhouse", "the-town/the-post-office");
  rides("the-town/the-post-office", "the-town/the-quay-reach");
  rides("the-town/the-quay-reach", "the-town/the-town-centre");
  rides("the-town/the-town-centre", "the-town/let-there-be-light");
  // the three the Centre's own raise settles — blue-in-blue rather than outranking
  for (const child of ["the-town/the-bounty-board", "the-town/the-keeping-works", "the-town/the-quay-reach"])
    rides(child, "the-town/the-town-centre");
  // and the wheelhouse genuinely composes through four frames to one place
  assert.deepEqual(m["the-town/the-wheelhouse"].at, { x: -30, y: 39 });
  assert.deepEqual(m["the-town/the-wheelhouse"]._fileAt, { x: 0, y: -1 }, "written where it stands, on the boat");
});

// ── QUADRANT 4: green in yellow — the fox-hearth pattern ─────────────────────
test("green-in-yellow ANCHORS: a home inside its own market parcel stands on world numbers", () => {
  const m = by(join(ROOT, "WORLD/marks"));
  for (const [home, parcel] of [
    ["alden/the-fox-hearth", "alden/the-fox-hearth-parcel"],
    ["ellery/the-level", "ellery/the-level-parcel"],
    ["corwin/the-margin", "corwin/the-margin-parcel"],
  ]) {
    assert.equal(m[home].tier, "sovereignty");
    assert.equal(m[parcel].tier, "market", "a parcel is a fence at market tier, not a rank");
    assert.equal(m[home]._parentMarkId, parcel);
    assert.deepEqual(m[home]._origin, { x: 0, y: 0 }, `${home} is framed by the world, not by its fence`);
    assert.deepEqual(m[home].at, m[home]._fileAt, "…so its file numbers ARE its world numbers");
  }
  // A parcel relocation is "replace, not add" (the fold's own rule), so the
  // interesting case is the fixture: move the fence and the home stays put.
  const PARCEL = { path: `${R}/the-parcel`, fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel" } };
  const HOME = { path: `${R}/the-parcel/the-hearth`, fm: mark("sovereignty", { x: 200, y: 200 }, { w: 4, h: 4 }) };
  withTree([THE_ROOT, PARCEL, HOME], (dir) => {
    assert.deepEqual(by(dir)["t/the-hearth"].at, { x: 200, y: 200 });
  });
  withTree([THE_ROOT, { ...PARCEL, fm: { ...PARCEL.fm, at: { x: 7000, y: 7000 } } }, HOME], (dir) => {
    assert.deepEqual(by(dir)["t/the-hearth"].at, { x: 200, y: 200 }, "the fence moved; the hearth did not");
  });
});

test("a TOP-LEVEL mark a new claim grows around is re-homed, not refused", () => {
  // The case the tier comparison alone gets wrong, and the likeliest one to
  // actually happen: the town's reach stands on open ground, filed under the
  // root because nothing contained it. A resident then files a meadow around
  // it. The reach's parent is the ROOT, which binds everything — so by tiers
  // alone this reads "bound" and refuses, bouncing a resident whose claim is
  // perfectly lawful. But the root's centre IS the world origin, so filing the
  // reach inside the meadow does not shift it by a metre. Repair, not refusal.
  const REACH = { path: `${R}/the-reach`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 100, h: 20 }, { by: "the-town" }) };
  const MEADOW = { path: `${R}/the-meadow`, fm: mark("market", { x: 1000, y: 1000 }, { w: 400, h: 400 }) };
  withTree([THE_ROOT, REACH], (dir) => {
    assert.equal(runLint(dir).code, 0, "on open ground with nothing around it, the filing is simply true");
  });
  withTree([THE_ROOT, REACH, MEADOW], (dir) => {
    const out = runLint(dir);
    assert.equal(out.errors, 0, "the resident's meadow is lawful and nobody is bounced for it");
    assert.equal(out.code, 3);
    assert.deepEqual(out.rehomes.map((r) => [r.mark, r.from, r.to]), [["the-town/the-reach", null, "t/the-meadow"]]);
    // and the repair really is free: framed by the world before and after
    assert.deepEqual(by(dir)["the-town/the-reach"]._origin, { x: 0, y: 0 });
  });
  // …but a top-level mark the new container WOULD bind is still a refusal:
  // there the numbers genuinely change meaning, and somebody has to say so.
  withTree([
    THE_ROOT,
    { path: `${R}/the-cottage`, fm: mark("market", { x: 1000, y: 1000 }, { w: 20, h: 20 }) },
    { path: `${R}/the-district`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 400, h: 400 }, { by: "the-town" }) },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 1, "refused");
    assert.deepEqual(out.rehomes, []);
  });
});

// ── the one refusal ──────────────────────────────────────────────────────────
test("a predicate cannot outrank what it predicates — refused, never re-homed", () => {
  withTree([
    THE_ROOT,
    { path: `${R}/the-yard`, fm: mark("market", { x: 300, y: 300 }, { w: 50, h: 50 }) },
    { path: `${R}/the-yard/the-law`, fm: {
      kind: "predicated", by: "the-town", tier: "constitution", date: "2026-08-11", slot: "mood", value: "quiet",
    } },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 1, "refused, not repaired");
    assert.deepEqual(out.rehomes, []);
    const found = out.findings.find((f) => /a predicate cannot outrank what it predicates/.test(f.msg));
    assert.ok(found, `the refusal names itself:\n${out.findings.map((f) => f.msg).join("\n")}`);
    assert.equal(found.sev, "ERROR");
    assert.match(found.msg, /it is its parent continued/);
  });
  // an equal-tier predicate is fine — it is the OUTRANKING that is impossible
  withTree([
    THE_ROOT,
    { path: `${R}/the-yard`, fm: mark("market", { x: 300, y: 300 }, { w: 50, h: 50 }) },
    { path: `${R}/the-yard/the-mood`, fm: {
      kind: "predicated", by: "t", date: "2026-08-11", slot: "mood", value: "quiet",
    } },
  ], (dir) => {
    assert.equal(runLint(dir).code, 0);
  });
});

test("a predicate is still walked past by a positioned mark beneath it, whatever tier it wears", () => {
  // The continuation exemption is about the frame, not about the lint: the
  // loader must not refuse to place a mark just because a predicate stands in
  // its chain. (The lint separately forbids this nesting; the loader still owes
  // an answer when it meets one.)
  withTree([
    THE_ROOT,
    { path: `${R}/the-house`, fm: mark("constitution", { x: 400, y: 400 }, { w: 60, h: 60 }, { by: "the-town" }) },
    { path: `${R}/the-house/the-law`, fm: { kind: "predicated", by: "the-town", tier: "constitution", date: "2026-08-11", slot: "mood", value: "quiet" } },
    { path: `${R}/the-house/the-law/the-lamp`, fm: mark("market", { x: 3, y: 4 }, { w: 1, h: 1 }) },
  ], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["the-town/the-law"]._origin, { x: 400, y: 400 }, "the predicate carries its parent's centre");
    assert.deepEqual(m["t/the-lamp"]._origin, { x: 400, y: 400 }, "and the lamp is framed on the house past it");
    assert.deepEqual(m["t/the-lamp"].at, { x: 403, y: 404 });
  });
});

test("the walk keeps climbing past a parent that does not bind, to the first ancestor that does", () => {
  // Two market layers between a sovereignty mark and the constitution root:
  // neither binds it, so it lands on the world and not on the nearer of the two.
  withTree([
    THE_ROOT,
    { path: `${R}/outer`, fm: mark("market", { x: 100, y: 100 }, { w: 400, h: 400 }) },
    { path: `${R}/outer/inner`, fm: mark("market", { x: 120, y: 120 }, { w: 200, h: 200 }) },
    { path: `${R}/outer/inner/the-home`, fm: mark("sovereignty", { x: 150, y: 150 }, { w: 10, h: 10 }) },
  ], (dir) => {
    assert.deepEqual(by(dir)["t/the-home"]._origin, { x: 0, y: 0 });
    assert.deepEqual(by(dir)["t/the-home"].at, { x: 150, y: 150 });
  });
  // and a binding ancestor ABOVE a non-binding one is found and used
  withTree([
    THE_ROOT,
    { path: `${R}/the-district`, fm: mark("constitution", { x: 100, y: 100 }, { w: 400, h: 400 }, { by: "the-town" }) },
    { path: `${R}/the-district/the-yard`, fm: mark("market", { x: 20, y: 20 }, { w: 200, h: 200 }) },
    { path: `${R}/the-district/the-yard/the-cairn`, fm: mark("sovereignty", { x: 5, y: 5 }, { w: 4, h: 4 }) },
  ], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-yard"].at, { x: 120, y: 120 }, "the yard is bound by the district");
    assert.deepEqual(m["t/the-cairn"]._origin, { x: 100, y: 100 }, "the cairn skipped the yard and took the district");
    assert.deepEqual(m["t/the-cairn"].at, { x: 105, y: 105 }, "…which is NOT the yard's 125,125");
  });
});

// ── THE FALSIFIER ────────────────────────────────────────────────────────────
//
// Everything above says what the rule MEANS. This says what the change that
// introduced it DID, to the 623 real marks the town has actually made, and it
// is allowed to answer "it moved the world".
//
// Two real programs over two real trees, the discipline of
// tools/coords-equivalence.mjs: the PRE-RULE marks loaded by the PRE-RULE
// tools/marks-fold.mjs, extracted read-only at the commit before the rule
// landed, against this tree loaded with these tools. Neither side is a
// transcription, and neither is a snapshot the change took of itself.
//
// The ref LOCATES ITSELF — the parent of the commit that introduced `tierRank`
// — so this keeps meaning the same thing after the branch merges, rather than
// quietly comparing the tree against itself once `origin/main` moves on.
test("THE FALSIFIER: every mark in the real world composes to EXACTLY the position it held before the tier binding", async () => {
  const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" }).trim();
  const introduced = git("log", "--format=%H", "-S", "export const tierRank", "--", "tools/marks-fold.mjs")
    .split(/\r?\n/).filter(Boolean);
  assert.ok(introduced.length, "the commit that introduced the rule must be findable — without it there is no before-side, and a falsifier that cannot locate its own baseline is not a falsifier");
  const REF = `${introduced[0]}^`;

  const scratch = mkdtempSync(join(tmpdir(), "tier-falsifier-"));
  try {
    execFileSync("git", ["-C", ROOT, "archive", "-o", join(scratch, "ref.tar"), REF, "WORLD/marks", "tools"]);
    execFileSync("tar", ["-xf", "ref.tar"], { cwd: scratch });
    const old = await import(pathToFileURL(join(scratch, "tools/marks-fold.mjs")).href);
    assert.equal(old.tierRank, undefined, "the ref side must NOT know the rule, or the two sides agree for free");

    const A = old.loadMarks(join(scratch, "WORLD/marks")).filter((m) => !m._error);
    const B = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
    assert.ok(A.length >= 600, `the real tree, not a fixture (${A.length} records at the ref)`);

    // The census first: a change that DROPPED a record would otherwise pass,
    // since a mark that is not there has no position to disagree about.
    const idsA = new Set(A.map((m) => m.id)), idsB = new Set(B.map((m) => m.id));
    assert.deepEqual([...idsA].filter((i) => !idsB.has(i)), [], "no record was lost");
    assert.deepEqual([...idsB].filter((i) => !idsA.has(i)), [], "and none appeared");

    const posOf = (ms) => new Map(ms.filter((m) => m.at).map((m) => [m.id, {
      at: `${m.at.x},${m.at.y}`,
      extent: JSON.stringify(m.extent ?? null),
      points: JSON.stringify(m.points ?? null),
    }]));
    const pa = posOf(A), pb = posOf(B);
    assert.ok(pa.size > 300, `enough positioned records to be worth checking (${pa.size})`);
    const moved = [], extentChanged = [], ringChanged = [];
    for (const [id, a] of pa) {
      const b = pb.get(id);
      if (a.at !== b.at) moved.push(`${id}: ${a.at} -> ${b.at}`);
      if (a.extent !== b.extent) extentChanged.push(id);   // a size is not a position; it must not move
      if (a.points !== b.points) ringChanged.push(id);     // a ring IS a set of positions and rides with `at`
    }
    assert.deepEqual(moved, [], `${moved.length} mark(s) MOVED — the change was not position-preserving`);
    assert.deepEqual(extentChanged, []);
    assert.deepEqual(ringChanged, []);

    // …and the ANSWER TO "what contains this" is unchanged too, which is the
    // half a position check cannot see: the six re-framed records carry
    // different digits now, and if any of them had been re-framed onto the
    // wrong origin their footprint would have landed in a different
    // container while the composed centre still matched by luck.
    for (const m of A) {
      const before = old.placementParent(m, A);
      const after = placementParent(pb.has(m.id) ? B.find((x) => x.id === m.id) : m, B);
      assert.equal(after, before, `placementParent moved for ${m.id}`);
    }
  } finally {
    if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
  }
});

test("the live tree lints clean, with no re-home standing and no loader/law disagreement", () => {
  const out = runLint(join(ROOT, "WORLD/marks"));
  assert.equal(out.errors, 0, JSON.stringify(out.findings.filter((f) => f.sev === "ERROR"), null, 2));
  assert.deepEqual(out.rehomes, []);
  assert.equal(out.code, 0);
  assert.ok(out.marks >= 600, `the real tree (${out.marks} marks)`);
});
