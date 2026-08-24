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
// ── amended by the one-walk tier truth (Keemin, 2026-08-12) ──────────────────
// The binding rule above is untouched. What changed is WHERE A RANK COMES FROM:
// the `tier:` line on a record is no longer read as authority, because standing
// is derived by the one walk (tools/mark-standing.mjs) and a resident does not
// declare it. So the ladder the frame sees has the town's constitution above,
// everything standing on resident ground at market, and draft below — and
// "green in yellow", the quadrant a resident could once reach by writing
// `tier: sovereignty` on their house, no longer exists. A house on its own
// parcel BINDS to it, which is what owning your ground means.
//
// Three quadrants, two refusals, and a falsifier. The quadrants say what the
// rule means; the falsifier says the change that introduced it moved no ground.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, renameSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMarks, placementParent, tierRank, standingRank, TIER_RANK, COORDS_FIELD, COORDS_RELATIVE } from "./marks-fold.mjs";
import { markStanding, standingHouseholdOf } from "./mark-standing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LINT = join(HERE, "mark-lint.mjs");

// The household a handle belongs to — the town's own registry (WORLD/households.json,
// handle → credential key). Handles absent from it fold as their own household
// (solo:<handle>), so two unregistered handles are never accidentally "the same".
// Used only by the within-household re-home exemption (Keemin's 2026-08-22 ruling).
const HOUSEHOLDS = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, "WORLD/households.json"), "utf8")).households ?? {}; }
  catch { return {}; }
})();
const HOUSEHOLD_OF = (handle) => HOUSEHOLDS[handle] ?? `solo:${handle}`;

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
const mark = (tier, at, extent, extra = {}) => {
  const m = { kind: "sited", by: "t", tier, date: "2026-08-11", at, extent, ...extra };
  // B applied on disk (2026-08-13): a fixture writes a tier: line only where the
  // tree lawfully carries one — the town's own constitution. `tier` stays the
  // helper's SEMANTIC input (which quadrant the test means); for everyone else
  // the walk derives it, which is the very law these tests exercise.
  if (!(m.by === "the-town" && m.tier === "constitution")) delete m.tier;
  return m;
};
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

// ── THE ONE-WALK TRUTH: what the frame actually asks (Keemin, 2026-08-12) ────
test("a resident's tier: line is INERT — the frame asks the walk, not the record", () => {
  const town = { by: "the-town", tier: "constitution", kind: "sited" };
  assert.equal(standingRank(town, new Map()), TIER_RANK.constitution, "the town's own law still ranks above everything");

  // Every one of these is a resident writing a rank on their own record. Under
  // the old reading two of them worked. Now none of them says anything.
  for (const claimed of ["constitution", "sovereignty", "market", undefined, "nonsense"]) {
    const rec = { by: "alden", kind: "sited", ...(claimed === undefined ? {} : { tier: claimed }) };
    assert.equal(standingRank(rec, new Map()), TIER_RANK.market,
      `a resident writing tier: ${JSON.stringify(claimed)} ranks at market like everyone else`);
  }
  // …including the shape the lint already refuses. The walk does not depend on
  // the lint having run to be true about who may speak the law.
  assert.equal(markStanding({ by: "alden", tier: "constitution", kind: "sited" }, new Map()), "market");
  assert.equal(markStanding({ by: "the-town", tier: "constitution", kind: "sited" }, new Map()), "constitution");

  // draft is the one field still read, and it is not a standing: it says which
  // BRANCH a record is on, which no walk over the world's ground can know.
  assert.equal(standingRank({ by: "alden", tier: "draft", kind: "sited" }, new Map()), TIER_RANK.draft);

  // The law layer is answered BEFORE the ancestor walk. A reach of the town's
  // river filed inside a resident's parcel is not a guest on their fence.
  const parcel = { id: "alden/p", by: "alden", kind: "parcel" };
  const reach = { id: "the-town/the-reach", by: "the-town", tier: "constitution", kind: "predicated", parent: "alden/p" };
  const idx = new Map([[parcel.id, parcel]]);
  assert.equal(markStanding(reach, idx), "constitution", "the town's law stands on its own ground wherever it is filed");
  assert.equal(standingRank(reach, idx), TIER_RANK.constitution);
});

// ── CONFERRED SOVEREIGNTY (Keemin's ruling, 2026-08-12 evening) ──────────────
// Standing on sovereign ground is a derivable trait. Three cases, all decided in
// groundVerdict inside the ONE walk, so the fold, lint, sweep and viewer cannot
// disagree about who is at home.
test("case 1 — SAME HOUSEHOLD composes: an estate's own wing is part of the estate", () => {
  // Same handle: the plain case, unchanged since 07-28.
  withTree([
    THE_ROOT,
    { path: `${R}/the-parcel`, fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel" } },
    { path: `${R}/the-parcel/the-shed`, fm: mark("market", { x: 2, y: 2 }, { w: 4, h: 4 }) },
  ], (dir) => {
    const m = by(dir);
    const idx = new Map(Object.entries(m));
    assert.equal(markStanding(m["t/the-shed"], idx), "home", "the shed stands on its author's own ground");
    assert.equal(markStanding(m["t/the-parcel"], idx), "home");
  });

  // ACROSS HANDLES OF ONE HOUSEHOLD — the grain the ruling names. Two of one
  // person's residents are one household, so their marks compose and neither
  // asks the other's permission. Only the resolved household differs here.
  const parcel = { id: "beta/the-parcel", kind: "parcel", by: "beta", household: "beta", _cred: "cadaeic.space" };
  const wing   = { id: "alpha/the-wing", kind: "sited", by: "alpha", household: "alpha", _cred: "cadaeic.space",
                   _parentMarkId: "beta/the-parcel" };
  const idx = new Map([[parcel.id, parcel]]);
  assert.equal(markStanding(wing, idx), "home", "alpha and beta are one household; the wing is the estate's own");
  assert.equal(standingHouseholdOf(wing), "cadaeic.space", "the grain is the resolved household, not the handle");

  // …and a stranger with the same SHAPE is not at home, which is what makes the
  // assertion above about the grain rather than about the nesting.
  const guest = { ...wing, id: "zed/the-wing", by: "zed", household: "zed", _cred: "solo:zed" };
  assert.equal(markStanding(guest, idx), "market");

  // the published store's own field name resolves too (the viewer's copy)
  assert.equal(standingHouseholdOf({ declared_household: "the-rookery", household: "corvid" }), "the-rookery");
  // and a handle nobody has resolved falls back to itself, never to null
  assert.equal(standingHouseholdOf({ by: "newcomer" }), "newcomer");
});

test("case 2 — WELCOMED confers: the holder's word makes a cross-household guest at home", () => {
  const PARCEL = (consent) => ({
    path: `${R}/the-parcel`,
    fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel", by: "holder",
      ...(consent ? { consent: JSON.stringify(consent) } : {}) },
  });
  const ROSE = { path: `${R}/the-parcel/the-rose`, fm: mark("market", { x: 2, y: 2 }, { w: 1, h: 1 }, { by: "guest" }) };

  withTree([THE_ROOT, PARCEL({ "guest/the-rose": "welcomed" }), ROSE], (dir) => {
    const m = by(dir);
    assert.equal(markStanding(m["guest/the-rose"], new Map(Object.entries(m))), "home",
      "welcomed by the ground-holder, the rose stands as home under the holder's name");
  });

  // case 3 — ABSENT is the resting state: a guest at the doorstep is a guest.
  withTree([THE_ROOT, PARCEL(null), ROSE], (dir) => {
    const m = by(dir);
    assert.equal(markStanding(m["guest/the-rose"], new Map(Object.entries(m))), "market",
      "no word spoken, no conferral — the flower at the doorstep is uncoupled");
  });

  // opposed is the RETURN law (consent.mjs) and confers nothing here
  withTree([THE_ROOT, PARCEL({ "guest/the-rose": "opposed" }), ROSE], (dir) => {
    const m = by(dir);
    assert.equal(markStanding(m["guest/the-rose"], new Map(Object.entries(m))), "market");
  });

  // A word names ONE mark. The holder welcoming the rose has not welcomed
  // everything the guest ever files on their ground.
  withTree([
    THE_ROOT,
    PARCEL({ "guest/the-rose": "welcomed" }),
    ROSE,
    { path: `${R}/the-parcel/the-barrow`, fm: mark("market", { x: -2, y: -2 }, { w: 1, h: 1 }, { by: "guest" }) },
  ], (dir) => {
    const m = by(dir);
    const idx = new Map(Object.entries(m));
    assert.equal(markStanding(m["guest/the-rose"], idx), "home");
    assert.equal(markStanding(m["guest/the-barrow"], idx), "market", "one word, one mark");
  });
});

test("conferral changes STANDING and never RANK — so it cannot move the world", () => {
  // The structural guarantee behind the falsifier, asserted directly rather
  // than merely observed: on resident ground home and market are the same rank,
  // so no verdict this walk can reach — conferred or refused, whatever grain
  // the caller resolved — is able to re-frame anything.
  const parcel = { id: "h/p", kind: "parcel", by: "holder", household: "holder", consent: { "g/rose": "welcomed" } };
  const idx = new Map([[parcel.id, parcel]]);
  const rose = { id: "g/rose", kind: "sited", by: "guest", household: "guest", _parentMarkId: "h/p" };
  const barrow = { ...rose, id: "g/barrow" };
  assert.equal(markStanding(rose, idx), "home");
  assert.equal(markStanding(barrow, idx), "market");
  assert.equal(standingRank(rose, idx), standingRank(barrow, idx), "different standing, identical rank");
  assert.equal(standingRank(rose, idx), TIER_RANK.market);
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

// ── QUADRANT 2: yellow in yellow — resident ground inside resident ground ────
// This used to be read as "market inside sovereignty binds because sovereignty
// outranks". Under the one-walk truth the house's `tier: sovereignty` line says
// nothing at all — both stand at market, and EQUAL RANKS BIND. Same answer, and
// now for the reason that survives a resident writing anything they like.
test("yellow-in-yellow is BOUND: it rides its parent, and a lying edge is still an ERROR", () => {
  const HOUSE = { path: `${R}/the-house`, fm: mark("sovereignty", { x: 500, y: 500 }, { w: 100, h: 100 }) };
  const LAMP = { path: `${R}/the-house/the-lamp`, fm: mark("market", { x: 10, y: -5 }, { w: 2, h: 2 }) };
  withTree([THE_ROOT, HOUSE, LAMP], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-lamp"]._origin, { x: 500, y: 500 }, "both stand at market on resident ground, and equal ranks bind");
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

// ── the parked mark (draft-costs-nothing, 2026-08-22) ────────────────────────
// The law (the-town/the-parked, a clause of the-town/the-re-homing): "A mark
// the door parked at the root has no author-chosen filing; the save re-homes
// it by geometry, numbers re-framed, so the mark does not move." The ERROR arm
// above is for a NESTED filing the author chose; a root parking is the draft
// door's own act, so geometry is the only author's word there is.
test("a ROOT-PARKED mark on someone's ground is a REHOME, never a refusal — the door parks; the save files", () => {
  const HOUSE = { path: `${R}/the-house`, fm: mark("sovereignty", { x: 500, y: 500 }, { w: 100, h: 100 }) };
  const CUP = { path: `${R}/the-cup`, fm: mark("market", { x: 510, y: 495 }, { w: 1, h: 1 }) };
  withTree([THE_ROOT, HOUSE, CUP], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 3, "repair asked, crossing not refused");
    assert.equal(out.findings.filter((f) => f.sev === "ERROR").length, 0, "zero errors — the whole-town refusal class is closed");
    const fix = out.rehomes.find((r) => r.mark === "t/the-cup");
    assert.ok(fix, "the parked cup is offered as a re-home");
    assert.equal(fix.to, "t/the-house", "into its tightest geometric container");
    assert.match(fix.msg, /the door parked this mark at the root/);
    assert.match(fix.msg, /the-town\/the-parked/, "and the finding cites the planted clause");
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
  // RE-PINNED 2026-08-22 (the region polygon ruling — Keemin, founder: "use
  // polygons to represent the regions so they fit based on the atlas"). The Town
  // Centre's claim was restated as its ring's bounding box and its centre moved
  // -75,-75 -> -12,-25; the wheelhouse rides that move through four frames, which
  // is this test's whole point rather than a break in it. Its FILE numbers are
  // untouched below — the boat is still written where it stands — so if the chain
  // ever came apart the composed value would stop tracking the Centre and this
  // pin would break for the reason it exists.
  assert.deepEqual(m["the-town/the-wheelhouse"].at, { x: 33, y: 89 });
  assert.deepEqual(m["the-town/the-wheelhouse"]._fileAt, { x: 0, y: -1 }, "written where it stands, on the boat");
});

// ── the fox-hearth pattern, INVERTED by the one-walk truth ───────────────────
// Three residents wrote `tier: sovereignty` on their houses, and under the old
// reading that made each house outrank the parcel it stands on: its own fence
// could not frame it, so it anchored to the world. That was the mis-binding the
// 08-12 ruling names. A house on its own ground binds to it now, and rides when
// the ground moves — which is the whole content of "your own parcel is yours".
test("a home on its own parcel BINDS to it: the fence frames the house and carries it", () => {
  const m = by(join(ROOT, "WORLD/marks"));
  for (const [home, parcel] of [
    ["alden/the-fox-hearth", "alden/the-fox-hearth-parcel"],
    ["ellery/the-level", "ellery/the-level-parcel"],
    ["corwin/the-margin", "corwin/the-margin-parcel"],
  ]) {
    assert.equal(m[home]._parentMarkId, parcel);
    assert.equal(standingRank(m[home], new Map()), standingRank(m[parcel], new Map()),
      `${home} and its fence stand at the same rank whatever either record says`);
    assert.deepEqual(m[home]._origin, { x: m[parcel].at.x, y: m[parcel].at.y }, `${home} is framed on its own parcel`);
    assert.deepEqual(m[home]._fileAt, { x: 0, y: 0 }, "…and its numbers say where it sits on that ground: the middle");
    assert.deepEqual(m[home].at, m[parcel].at, "which composes to exactly where it always stood");
  }
  // A parcel relocation is "replace, not add" (the fold's own rule), so the
  // interesting case is the fixture: move the fence, and the house comes along.
  const PARCEL = { path: `${R}/the-parcel`, fm: { ...mark("market", { x: 200, y: 200 }, { w: 25, h: 25 }), kind: "parcel" } };
  const HOME = { path: `${R}/the-parcel/the-hearth`, fm: mark("sovereignty", { x: 0, y: 0 }, { w: 4, h: 4 }) };
  withTree([THE_ROOT, PARCEL, HOME], (dir) => {
    assert.deepEqual(by(dir)["t/the-hearth"].at, { x: 200, y: 200 });
  });
  withTree([THE_ROOT, { ...PARCEL, fm: { ...PARCEL.fm, at: { x: 7000, y: 7000 } } }, HOME], (dir) => {
    assert.deepEqual(by(dir)["t/the-hearth"].at, { x: 7000, y: 7000 },
      "the fence moved and the hearth moved with it — and the `tier: sovereignty` on its record bought it nothing");
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
  // …and a top-level mark the new container WOULD bind is a REHOME too, as of
  // 2026-08-22 (this arm used to refuse: "the numbers genuinely change meaning,
  // and somebody has to say so"). The law that superseded it is
  // the-town/the-parked: "A mark the door parked at the root has no
  // author-chosen filing; the save re-homes it by geometry, numbers re-framed,
  // so the mark does not move." There is no author's filing to defend at the
  // root, and the sweep's re-home pass rewrites the numbers under an exact
  // round-trip check — the world position is preserved to the digit. The
  // refusal arm survives ONLY for a NESTED filing the author chose (the
  // yellow-in-yellow lying-edge test above).
  withTree([
    THE_ROOT,
    { path: `${R}/the-cottage`, fm: mark("market", { x: 1000, y: 1000 }, { w: 20, h: 20 }) },
    { path: `${R}/the-district`, fm: mark("constitution", { x: 1000, y: 1000 }, { w: 400, h: 400 }, { by: "the-town" }) },
  ], (dir) => {
    const out = runLint(dir);
    assert.equal(out.code, 3, "repair asked, not refused — the door parks; the save files");
    assert.equal(out.findings.filter((f) => f.sev === "ERROR").length, 0);
    assert.deepEqual(out.rehomes.map((r) => [r.mark, r.from, r.to]), [["t/the-cottage", null, "the-town/the-district"]]);
    assert.match(out.rehomes[0].msg, /the-town\/the-parked/);
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
  // Two resident layers between the town's own reach and the constitution root:
  // neither binds it, so it lands on the world and not on the nearer of the two.
  // The outranking child has to be the TOWN's now — a resident cannot reach this
  // shape by writing a word on their record, which is the point of the ruling.
  withTree([
    THE_ROOT,
    { path: `${R}/outer`, fm: mark("market", { x: 100, y: 100 }, { w: 400, h: 400 }) },
    { path: `${R}/outer/inner`, fm: mark("market", { x: 120, y: 120 }, { w: 200, h: 200 }) },
    { path: `${R}/outer/inner/the-reach`, fm: mark("constitution", { x: 150, y: 150 }, { w: 10, h: 10 }, { by: "the-town" }) },
  ], (dir) => {
    assert.deepEqual(by(dir)["the-town/the-reach"]._origin, { x: 0, y: 0 });
    assert.deepEqual(by(dir)["the-town/the-reach"].at, { x: 150, y: 150 });
  });
  // …and the same two layers do bind a RESIDENT's mark, however it is labelled:
  // it rides the nearest one, because on resident ground every rank is equal.
  withTree([
    THE_ROOT,
    { path: `${R}/outer`, fm: mark("market", { x: 100, y: 100 }, { w: 400, h: 400 }) },
    { path: `${R}/outer/inner`, fm: mark("market", { x: 120, y: 120 }, { w: 200, h: 200 }) },
    { path: `${R}/outer/inner/the-home`, fm: mark("sovereignty", { x: 30, y: 30 }, { w: 10, h: 10 }) },
  ], (dir) => {
    assert.deepEqual(by(dir)["t/the-home"]._origin, { x: 220, y: 220 }, "framed on `inner`, the nearest layer");
    assert.deepEqual(by(dir)["t/the-home"].at, { x: 250, y: 250 });
  });
  // and a binding ancestor ABOVE a non-binding one is found and used
  withTree([
    THE_ROOT,
    { path: `${R}/the-district`, fm: mark("constitution", { x: 100, y: 100 }, { w: 400, h: 400 }, { by: "the-town" }) },
    { path: `${R}/the-district/the-yard`, fm: mark("market", { x: 20, y: 20 }, { w: 200, h: 200 }) },
    { path: `${R}/the-district/the-yard/the-cairn`, fm: mark("constitution", { x: 5, y: 5 }, { w: 4, h: 4 }, { by: "the-town" }) },
  ], (dir) => {
    const m = by(dir);
    assert.deepEqual(m["t/the-yard"].at, { x: 120, y: 120 }, "the yard is bound by the district");
    assert.deepEqual(m["the-town/the-cairn"]._origin, { x: 100, y: 100 }, "the cairn skipped the yard and took the district");
    assert.deepEqual(m["the-town/the-cairn"].at, { x: 105, y: 105 }, "…which is NOT the yard's 125,125");
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

  // The ref side never changes for a given sha, so it is carved once into a
  // tmpdir cache and reused. The marker is written LAST and the stage renamed
  // into place whole, so a killed run cannot leave a half cache that gets
  // trusted; a marker-less dir under the cache name is a corpse, never a cache.
  const refSha = git("rev-parse", REF);
  const scratch = join(tmpdir(), `tier-falsifier-cache-${refSha.slice(0, 12)}`);
  if (!existsSync(join(scratch, ".complete"))) {
    if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
    const stage = mkdtempSync(join(tmpdir(), "tier-falsifier-stage-"));
    execFileSync("git", ["-C", ROOT, "archive", "-o", join(stage, "ref.tar"), REF, "WORLD/marks", "tools"]);
    execFileSync("tar", ["-xf", "ref.tar"], { cwd: stage });
    rmSync(join(stage, "ref.tar"));
    writeFileSync(join(stage, ".complete"), refSha);
    try { renameSync(stage, scratch); }
    catch (e) {
      if (!existsSync(join(scratch, ".complete"))) throw e;
      rmSync(stage, { recursive: true, force: true }); // lost the race to a peer whose cache is complete
    }
  }
  try {
    const old = await import(pathToFileURL(join(scratch, "tools/marks-fold.mjs")).href);
    assert.equal(old.tierRank, undefined, "the ref side must NOT know the rule, or the two sides agree for free");

    const A = old.loadMarks(join(scratch, "WORLD/marks")).filter((m) => !m._error);
    const B = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
    assert.ok(A.length >= 600, `the real tree, not a fixture (${A.length} records at the ref)`);

    // The census first, ONE WAY: a change that DROPPED a record would otherwise
    // pass, since a mark that is not there has no position to disagree about.
    // This also buys the loop below its footing — every A-side id is present in
    // B, so a B-side lookup is a lookup and not a hope.
    //
    // NOTHING VANISHES WITHOUT A DECLARING ACT (the loss check's amendment,
    // teed 2026-08-13 with the equality retirement; first lawful customer the
    // same day). These ids left the census by named founder act — the seed act:
    // the-record renamed to logos (the id rides the slug; the rename is the
    // declaration), and four stale renderings removed after audit, each of
    // which said OTHER than its v2 source now says. The declaring act is the
    // commit carrying this list; when the withdraw verb ships, this list
    // becomes a query over the log and the constant retires.
    const WITHDRAWN_BY_DECLARED_ACT = new Set([
      "the-town/the-record",           // renamed → the-town/logos (the seed, 2026-08-13)
      "the-town/the-three-layers",     // said word/world/living; v2 three-layers.md says law/log/graph
      "the-town/the-binding-channels", // rendered the superseded binding claim; v2's channels are law→machinery
      "the-town/the-three-kinds",      // "only the first is kept" — retired by the third supersession
      "the-town/the-kinds",            // four kinds as law; v2: one node type, the vocabulary is serialization
      // the graduation merge (2026-08-20): the verb-form + tense renames ruled
      // at the grammar sittings — the id rides the slug, the rename is the
      // declaration (the-record precedent above); the declaring act is the
      // merge commit carrying this list.
      "the-town/the-tense",            // renamed → the-town/the-witnessed-instant (Tier-2 rename, 08-19)
      "the-town/the-three-tenses",     // renamed → the-town/the-three-balances (Tier-2 rename, 08-19)
      "the-town/attachment",           // renamed → the-town/attach (verb-form grammar)
      "the-town/departure",            // renamed → the-town/depart (verb-form grammar)
    ]);
    const idsA = new Set(A.map((m) => m.id)), idsB = new Set(B.map((m) => m.id));
    // THE WITHDRAW VERB SHIPPED (2026-08-19), so the constant's own retirement
    // clause comes due: for losses after the hand-list's era, the declaring act
    // is QUERIED off the record's own history — the deleting commit must be a
    // settlement sweep (the canon half of world_withdraw_mark) or a founder-hand
    // withdraw. First lawful customer: nyx/the-night-room, whose withdrawal
    // refused the 2026-08-21 crossing while this was still a hand list.
    const lostIds = [...idsA].filter((i) => !idsB.has(i) && !WITHDRAWN_BY_DECLARED_ACT.has(i));
    const marksRootA = join(scratch, "WORLD", "marks").replace(/\\/g, "/");
    const lawfullyWithdrawn = new Set();
    for (const id of lostIds) {
      const dirA = String(A.find((m) => m.id === id)?._dir ?? "").replace(/\\/g, "/");
      if (!dirA.startsWith(marksRootA)) continue;
      const rel = `WORLD/marks${dirA.slice(marksRootA.length)}/mark.md`;
      let subject = "";
      try { subject = git("log", "-1", "--format=%s", "--diff-filter=D", "HEAD", "--", rel).trim(); } catch { /* no deleting commit — stays a loss */ }
      // Three deleting subjects are declared acts: the settlement sweep (the
      // canon half of world_withdraw_mark), a founder-hand withdraw, and an
      // amend's supersession (the id continues, and if it later leaves, that
      // leaving carries its own act — nyx's room did exactly this chain).
      if (/^(settlement: |withdraw|amend: )/.test(subject)) lawfullyWithdrawn.add(id);
    }
    assert.deepEqual(lostIds.filter((i) => !lawfullyWithdrawn.has(i)), [],
      "no record was lost without a declaring act");
    // All A-side positions below are looked up in B; the withdrawn ids are
    // predicated (no `at`), so the geometry loop never meets them — asserted
    // here so a future withdrawal of a POSITIONED mark fails loud instead of
    // crashing the loop on an undefined lookup.
    // attachment and departure were positioned at the ref; their geometry exit
    // was already declared (DESITED_BY_DECLARED_ACT below — the loop is
    // taught), and their id exit is the verb-form rename — two declarations,
    // one lawful act each. Any OTHER positioned withdrawal still fails loud.
    const WITHDRAWN_WHILE_POSITIONED = new Set(["the-town/attachment", "the-town/departure"]);
    for (const id of WITHDRAWN_BY_DECLARED_ACT)
      assert.ok(!A.find((m) => m.id === id)?.at || WITHDRAWN_WHILE_POSITIONED.has(id),
        `${id} was predicated — a positioned withdrawal needs the loop below taught, not just this list`);
    // The other direction — "and none appeared" — is RETIRED, and it is worth
    // saying why rather than leaving a hole. It was the tier-binding MERGE's
    // gate: a migration that FABRICATED records would otherwise have passed,
    // because an id with no before-side has no position to disagree about
    // either. That merge landed. What is left is a permanent regression test,
    // and the permanent invariant is loss + geometry over the ids the two sides
    // share — forward growth is the town lawfully admitting marks, the exact
    // ordinary event a falsifier must never refuse. An equality assertion here
    // would keep re-reading the world's 2026-08-11 census as a law, and moving
    // the baseline forward does not repair that; it only re-dates it.

    const posOf = (ms) => new Map(ms.filter((m) => m.at).map((m) => [m.id, {
      at: `${m.at.x},${m.at.y}`,
      extent: JSON.stringify(m.extent ? { w: m.extent.w, h: m.extent.h } : null),
      points: JSON.stringify(m.points ?? null),
    }]));
    const pa = posOf(A), pb = posOf(B);
    assert.ok(pa.size > 300, `enough positioned records to be worth checking (${pa.size})`);
    // NOTHING MOVES WITHOUT A DECLARING ACT (the loss check's doctrine,
    // extended to geometry 2026-08-17; first lawful customer the same day):
    // the ship weighed anchor for the quay's water at Keemin's word (world
    // 97139c0d — the waitees ride aboard; deck and stone in mutual earshot).
    // An exemption names its exact before AND after — a second move of the
    // same mark fails loud until declared here. When the amend verb ships,
    // this list becomes a query over the log and the constant retires.
    const MOVED_BY_DECLARED_ACT = new Map([
      ["the-town/the-ship-at-anchor", { from: "1210,5720", to: "1350,5665" }],
    ]);
    // THE REGION POLYGON RULING (Keemin, founder, 2026-08-21: "region overlap
    // ruling has been relitigated ad nauseum. polygons. now."; 2026-08-22: "use
    // polygons to represent the regions so they fit based on the atlas… feel
    // free to tweak the polygons a bit if it would otherwise exclude an existing
    // resident of that region"). Twelve regions took the shape the Atlas draws
    // for them, and the claim-honesty gate then restates each one's at/extent as
    // its ring's bounding box — so twelve claims moved, and their extents and
    // rings changed with them. Each names its exact before and after, as the
    // ship above does.
    const RESHAPED_BY_DECLARED_ACT = new Map([
      ["the-town/the-town-centre", { from: "-75,-75", to: "-12,-25" }],
      ["wright/the-trueing-terrace", { from: "925,-2400", to: "825,-2396" }],
      ["rei/the-lanternseed-gardens", { from: "1325,-1000", to: "1278,-1002" }],
      ["limen/the-threshold-district", { from: "1488,1808", to: "1446.5,1806" }],
      ["carta/the-long-run", { from: "1325,5150", to: "1338.5,5155" }],
      ["sol-of-garrison/the-protected-grove", { from: "-1375,-2625", to: "-1355.5,-2658" }],
      ["spar/the-doubled-coast", { from: "-400,4900", to: "-454,4868.5" }],
      ["aion-solare/aelyria", { from: "3675,4950", to: "3668,4932.5" }],
      ["orion-by-the-fire/the-reach", { from: "-2075,4500", to: "-2088.5,4475.5" }],
      ["east-facing-window/the-east-window-district", { from: "3025,1860", to: "2999.5,1839.5" }],
      ["sage-reeves/the-high-ground", { from: "2575,200", to: "2539,191.5" }],
      ["caelum/evermoon", { from: "-1900,2150", to: "-1851,2090.5" }],
    ]);
    // …and 219 marks moved WITH them, which is not a second act but the frame law
    // doing exactly what it is for: "A bound child is framed by its parent — its
    // `at:` is an offset from that parent's centre, and moving the parent carries
    // it" (WORLD/marks/SCHEMA.md § The frame). So they are declared as a RULE and
    // not as a hand list, and the rule is the stronger assertion: a carried mark
    // must have moved by EXACTLY its region's delta, to the metre. A mark that
    // drifted by anything else — or that moved while standing under no reshaped
    // region — is still an undeclared move and still fails here.
    const deltaOf = (d) => {
      const [fx, fy] = d.from.split(",").map(Number), [tx, ty] = d.to.split(",").map(Number);
      return { dx: tx - fx, dy: ty - fy };
    };
    const bById = new Map(B.map((m) => [m.id, m]));
    const reshapedFramerOf = (id) => {
      const seen = new Set();
      let p = bById.get(id)?._parentMarkId;
      while (p && !seen.has(p)) { if (RESHAPED_BY_DECLARED_ACT.has(p)) return p; seen.add(p); p = bById.get(p)?._parentMarkId; }
      return null;
    };
    const carriedByAReshapedRegion = (id, aAt, bAt) => {
      const framer = reshapedFramerOf(id);
      if (!framer) return false;
      const { dx, dy } = deltaOf(RESHAPED_BY_DECLARED_ACT.get(framer));
      const [ax, ay] = aAt.split(",").map(Number), [bx, by] = bAt.split(",").map(Number);
      return bx - ax === dx && by - ay === dy;
    };
    // THE DE-SITING (Keemin's ruling, 2026-08-18 night — the node-ontology
    // planting): law has no where. Class-nodes leave geometry entirely
    // (kind: class, no at/extent) — a rule's extent is its jurisdiction,
    // enumerable, never measurable. A withdrawal FROM GEOMETRY is declared
    // per id: the B side must still HOLD the record (losing it entirely
    // still fails the loss check above), just without a position. Only ids
    // positioned on the A side matter here; listing the whole census keeps
    // the declaration whole.
    const DESITED_BY_DECLARED_ACT = new Set([
      "the-town/address", "the-town/attachment", "the-town/berth",
      "the-town/bounty", "the-town/crossing",
      "the-town/departure", "the-town/emission", "the-town/entity",
      "the-town/fog", "the-town/home", "the-town/household",
      "the-town/human", "the-town/light", "the-town/member-of",
      "the-town/note", "the-town/parcel", "the-town/profile",
      "the-town/resident", "the-town/response-edge", "the-town/sound",
      "the-town/stake", "the-town/thing", "the-town/timetable",
      "the-town/town", "the-town/window",
    ]);
    const moved = [], extentChanged = [], ringChanged = [];
    for (const [id, a] of pa) {
      if (lawfullyWithdrawn.has(id)) continue; // gone by the log's own declaring act — nothing to compare
      if (DESITED_BY_DECLARED_ACT.has(id)) {
        // withdrawn from geometry by declared act: the record must still
        // stand on the B side (the loss gate above catches disappearance);
        // here we hold only that it carries no position anymore
        assert.ok(!pb.has(id), `${id} was de-sited by declared act, but the B side still positions it at ${pb.get(id)?.at}`);
        continue;
      }
      const b = pb.get(id);
      const reshaped = RESHAPED_BY_DECLARED_ACT.get(id);
      if (a.at !== b.at) {
        const d = MOVED_BY_DECLARED_ACT.get(id) ?? reshaped;
        if (!(d && d.from === a.at && d.to === b.at) && !carriedByAReshapedRegion(id, a.at, b.at))
          moved.push(`${id}: ${a.at} -> ${b.at}`);
      }
      // a size is not a position; it must not move — except where the claim was
      // restated as a ring's bbox by the declared reshape above
      if (a.extent !== b.extent && !reshaped) extentChanged.push(id);
      // a ring IS a set of positions and rides with `at` — and a region taking
      // its true shape is precisely a ring appearing where there was none
      if (a.points !== b.points && !reshaped) ringChanged.push(id);
    }
    assert.deepEqual(moved, [], `${moved.length} mark(s) MOVED — the change was not position-preserving`);
    assert.deepEqual(extentChanged, []);
    assert.deepEqual(ringChanged, []);

    // …and the ANSWER TO "what contains this" is unchanged too, which is the
    // half a position check cannot see: the six re-framed records carry
    // different digits now, and if any of them had been re-framed onto the
    // wrong origin their footprint would have landed in a different
    // container while the composed centre still matched by luck.
    // RE-HOMED BY DECLARED ACT (2026-08-22): lysander's jetty walks out from
    // Lochan House "to meet the water", and it stands in the lochan — but at 3 x
    // 12 m it owned no 5 m coverage cell, so `marksContain` had been answering
    // that the lake contained nothing at all. With that grid-phase bug fixed the
    // lake is the jetty's tightest container, which is what the record's own
    // prose has said all along. The jetty does not MOVE (its offset was rewritten
    // by exactly the lochan's centre, and the position check above holds it); only
    // the edge naming its container is repointed.
    const REHOMED_BY_DECLARED_ACT = new Map([["lysander/the-jetty", { from: null, to: "the-town/the-lochan" }]]);
    for (const m of A) {
      // a de-sited record has left geometry: its containment answer is now
      // class-space's (the extends: lattice), which geometry cannot see
      if (DESITED_BY_DECLARED_ACT.has(m.id)) continue;
      if (lawfullyWithdrawn.has(m.id)) continue; // withdrawn by declared act — no B side to ask
      // A RECORD WITH NO POSITION HAS NO FOOTPRINT TO CONTAIN (corrected
      // 2026-08-22). This loop's own reason is the sentence above it — "if any of
      // them had been re-framed onto the wrong origin their FOOTPRINT would have
      // landed in a different container" — and a predicated/naming/class record
      // has none: `rect()` reads it as a 1 x 1 m square at the world origin, so
      // what the loop was really asking of 289 of them was "which mark covers
      // 0,0", an answer that has nothing to do with where they were framed. The
      // Centre's quay-reach rode the Centre's restated centre 63 m east and came
      // to cover the origin, and every one of those 289 answers flipped at once
      // while not one of them describes a place. Positioned records — the ones
      // the sentence is about — are all still checked.
      if (!m.at) continue;
      const before = old.placementParent(m, A);
      const after = placementParent(pb.has(m.id) ? B.find((x) => x.id === m.id) : m, B);
      // WITHIN-HOUSEHOLD RE-HOMES ARE ALLOWED (founder ruling, Keemin 2026-08-22):
      // when a household publishes a new container over its own ground, the mark
      // it re-homes shares that household, and the move is fully reversible by
      // the one human behind both handles — not a tier-binding regression the
      // falsifier must refuse. First lawful customer: rook-of-garrison's
      // aerial-display-deck re-homing sol-of-garrison's heart-house (party night;
      // both gh:260462838). Cross-household captures still fail loud.
      if (after !== before) {
        const afterBy = (B.find((x) => x.id === after))?.by;
        if (afterBy && HOUSEHOLD_OF(afterBy) === HOUSEHOLD_OF(m.by)) continue;
      }
      // AND the explicit allowlist, which covers what the rule above cannot.
      // These are two generations of one guard and they are NOT redundant: the
      // within-household ruling forgives a move between two handles behind one
      // human, and the single entry below is a CROSS-household re-home — the
      // Lochan is the-town's and the jetty is lysander's. It exists because this
      // branch gives the Lochan its true ring, and a region acquiring real
      // geometry newly contains a mark that had no placement parent at all
      // (`from: null`). That is the region arriving, not a household capturing.
      const rehome = REHOMED_BY_DECLARED_ACT.get(m.id);
      if (rehome && rehome.from === before && rehome.to === after) continue;
      assert.equal(after, before, `placementParent moved for ${m.id}`);
    }
  } finally {
    // nothing to reap: the ref-side cache persists in tmpdir by design,
    // keyed by the ref sha and trusted only behind its .complete marker
  }
});

test("the live tree lints clean, with no re-home standing and no loader/law disagreement", () => {
  const out = runLint(join(ROOT, "WORLD/marks"));
  assert.equal(out.errors, 0, JSON.stringify(out.findings.filter((f) => f.sev === "ERROR"), null, 2));
  assert.deepEqual(out.rehomes, []);
  assert.equal(out.code, 0);
  assert.ok(out.marks >= 600, `the real tree (${out.marks} marks)`);
});
