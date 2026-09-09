import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { isUnstakedCommons } from "./unstaked-return.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "unstaked-return.mjs");

// ── the predicate, against the PSA's four sentences ─────────────────────────
//
// Each falsifier quotes the law it is: town PSA 2026-09-09, which enforces town
// #1990 and the founder's ruling of 2026-08-28.

test('"every commons mark with no stake behind it returns" — a bare zero leaves', () => {
  assert.equal(isUnstakedCommons({ id: "rei/a-bench", by: "rei", sovereign: false, stamps: 0, weight: 0 }), true);
});

test('"marks on a resident\'s own ground stand" — sovereign is excluded', () => {
  assert.equal(isUnstakedCommons({ id: "rei/a-bench", by: "rei", sovereign: true, stamps: 0, weight: 0 }), false);
});

test('"the town\'s own ground is the town\'s to stake" — the-town is excluded', () => {
  assert.equal(isUnstakedCommons({ id: "the-town/a-region", by: "the-town", sovereign: false, stamps: 0, weight: 0 }), false);
});

test('"only with a stake behind it" — own escrow keeps a mark standing', () => {
  assert.equal(isUnstakedCommons({ id: "rei/a-bench", by: "rei", sovereign: false, stamps: 3, weight: 3 }), false);
});

test("weight with no stamps of its own keeps a mark standing (the breadth term)", () => {
  // `sage-reeves/the-high-ground` on the live tree: stamps 0, weight 2. Escrow
  // is not the only thing behind a mark; breadth across households is too, and
  // reading `stamps` alone would have returned it.
  assert.equal(isUnstakedCommons({ id: "sage/the-high-ground", by: "sage", sovereign: false, stamps: 0, weight: 2 }), false);
});

// ── the set is re-measured, never read from a list ──────────────────────────

test("a stake laid after an earlier measurement takes the mark out of the set", () => {
  const before = { id: "rei/a-bench", by: "rei", sovereign: false, stamps: 0, weight: 0 };
  assert.equal(isUnstakedCommons(before), true);
  const after = { ...before, stamps: 1, weight: 1 };   // the resident staked it during the week
  assert.equal(isUnstakedCommons(after), false);
});

// ── the tool's gates, end to end on a throwaway tree ────────────────────────

function tinyWorld() {
  const root = mkdtempSync(join(tmpdir(), "unstaked-return-"));
  const marks = join(root, "WORLD", "marks");
  const mk = (relPath, fm, body = "A thing.") => {
    const d = join(marks, relPath);
    mkdirSync(d, { recursive: true });
    const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
    writeFileSync(join(d, "mark.md"), `---\n${lines}\n---\n\n${body}\n`);
    return d;
  };
  // the world root, the town's own
  mk("let-there-be-light", { by: "the-town", kind: "sited", date: "2026-07-01", at: "{ x: 0, y: 0 }", extent: "{ w: 60000, h: 60000 }", tier: "constitution" });
  // an unstaked commons mark of rei's — this one returns
  mk("let-there-be-light/the-open-bench", { by: "rei", kind: "sited", date: "2026-07-10", at: "{ x: 100, y: 100 }", extent: "{ w: 20, h: 20 }" });
  // a predicated child nested inside it that STAYS. It is the town's, which is
  // the one reason to stay that cannot also rescue the parent: a stake on a
  // child fans UP, so staking the plaque would have kept the bench standing too
  // and there would be no hazard to see. (On the live tree the same shape
  // occurs with a resident's staked `welcome` under a parcel that fan-up does
  // not reach — `sol-of-garrison/rootlight-den-welcome`.)
  mk("let-there-be-light/the-open-bench/a-brass-plaque", { by: "the-town", kind: "predicated", date: "2026-07-11", slot: "material" });
  return { root, marks };
}

const run = (marksDir, extra = []) => {
  try {
    const out = execFileSync("node", [TOOL, "--marks-dir", marksDir, "--json", ...extra],
      { encoding: "utf8", maxBuffer: 1 << 28 });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: e.stdout ?? "", err: e.stderr ?? "" };
  }
};

test("the stamp gate: no --stakes is a refusal, not a zero-escrow sweep", () => {
  const { root, marks } = tinyWorld();
  try {
    const r = run(marks);
    assert.equal(r.code, 2);
    assert.match(r.err, /refusing to run without --stakes/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the re-parent gate: a predicated child that would bind to its grandparent refuses the run", () => {
  const { root, marks } = tinyWorld();
  try {
    const r = run(marks, ["--allow-stampless"]);
    assert.equal(r.code, 3, "the run refuses rather than re-parenting quietly");
    const receipt = JSON.parse(r.out);
    assert.equal(receipt.totals.reparent_hazards, 1);
    assert.equal(receipt.reparents[0].child, "the-town/a-brass-plaque");
    assert.equal(receipt.reparents[0].losing, "rei/the-open-bench");
    assert.equal(receipt.applied, false, "a refused run applies nothing");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the move is file-level: a child's mark.md is never carried off with its parent", () => {
  const { root, marks } = tinyWorld();
  try {
    const r = run(marks, ["--allow-stampless", "--allow-reparent"]);
    assert.equal(r.code, 0);
    const receipt = JSON.parse(r.out);
    const bench = receipt.moved.find((m) => m.mark === "rei/the-open-bench");
    assert.ok(bench, "the unstaked commons mark is in the move");
    for (const f of bench.files) {
      assert.ok(!f.includes("a-brass-plaque"),
        `the child's file ${f} must stay on main — WORLD/marks is a placement tree`);
    }
    assert.deepEqual(bench.files.map((f) => f.split("/").pop()), ["mark.md"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the town's own root is never in the move", () => {
  const { root, marks } = tinyWorld();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-reparent"]).out);
    assert.equal(receipt.moved.some((m) => m.mark.startsWith("the-town/")), false);
    const townRow = receipt.skipped.find((s) => s.mark === "the-town/let-there-be-light");
    assert.match(townRow.why, /town-owned/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── the parcel cascade ──────────────────────────────────────────────────────
//
// The PSA: "A further 150 stand on residents' OWN ground, a home or a parcel;
// the law lets your own ground carry a zero, and those stand." A parcel IS that
// ground, so an unstaked parcel returning takes it away from everything on it.

function estate() {
  const root = mkdtempSync(join(tmpdir(), "unstaked-return-parcel-"));
  const marks = join(root, "WORLD", "marks");
  const mk = (relPath, fm) => {
    const d = join(marks, relPath);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "mark.md"),
      `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nA thing.\n`);
  };
  mk("let-there-be-light", { by: "the-town", kind: "sited", date: "2026-07-01", at: "{ x: 0, y: 0 }", extent: "{ w: 60000, h: 60000 }", tier: "constitution" });
  // rei's parcel, unstaked — and rei's house standing fully inside it, which is
  // what makes the house sovereign and is exactly what the PSA says stands.
  mk("let-there-be-light/rei-parcel", { by: "rei", kind: "parcel", date: "2026-07-10", at: "{ x: 500, y: 500 }", extent: "{ w: 25, h: 25 }" });
  mk("let-there-be-light/rei-parcel/the-quiet-house", { by: "rei", kind: "sited", date: "2026-07-11", at: "{ x: 500, y: 500 }", extent: "{ w: 8, h: 8 }" });
  return { root, marks };
}

test("returning an unstaked parcel de-sovereigns what stands on it, and the run says so", () => {
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-reparent"]).out);
    assert.ok(receipt.moved.some((m) => m.mark === "rei/rei-parcel"), "the unstaked parcel is in the move");
    const house = receipt.skipped.find((s) => s.mark === "rei/the-quiet-house");
    assert.match(house.why, /sovereign/, "the house stands today, as the PSA promises");
    assert.equal(receipt.totals.cascade_next_crossing, 1,
      "the house would enter the set on the next crossing — the cascade must be reported, not discovered later");
    assert.equal(receipt.cascade[0].mark, "rei/the-quiet-house");
    assert.match(receipt.cascade[0].was, /own ground/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("--hold-occupied-parcels keeps the ground under a standing mark, and closes the cascade", () => {
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-reparent", "--hold-occupied-parcels"]).out);
    assert.equal(receipt.moved.some((m) => m.mark === "rei/rei-parcel"), false, "the occupied parcel is held");
    assert.equal(receipt.totals.parcels_held_occupied, 1);
    assert.equal(receipt.held[0].parcel, "rei/rei-parcel");
    assert.equal(receipt.totals.cascade_next_crossing, 0,
      "a held parcel is a choice, not a consequence — it must not report itself as its own cascade");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("every mark the fold saw is accounted for — moved or skipped with a reason", () => {
  const { root, marks } = tinyWorld();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-reparent"]).out);
    const named = new Set([...receipt.moved.map((m) => m.mark), ...receipt.skipped.map((s) => s.mark)]);
    assert.equal(named.size, receipt.totals.marks_folded,
      "a mark that is neither moved nor skipped is a mark the receipt lost");
    for (const s of receipt.skipped) assert.ok(s.why && s.why.length > 8, `${s.mark} skipped with no reason`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
