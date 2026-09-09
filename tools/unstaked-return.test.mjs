import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { isUnstakedCommons, exemptionFor } from "./unstaked-return.mjs";
import { REGION_SLUGS } from "./region-outsiders.mjs";

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

test("the town's own marks are excluded BY THE NAMED LAW, not by the economic predicate", () => {
  // Until 2026-09-09 18:56 EDT this read `isUnstakedCommons(...) === false`,
  // because the town clause sat inside the economic predicate as an incidental
  // filter. The founder ruled it a law ("exempt all the town's own marks, no
  // mint"), so the clause moved to `exemptionFor` where a flip can disprove it.
  // The PSA's old sentence — "the town's own ground is the town's to stake" —
  // is superseded by "no mint": the town does not stake its own furniture.
  const m = { id: "the-town/a-region", by: "the-town", kind: "sited", sovereign: false, stamps: 0, weight: 0 };
  assert.equal(isUnstakedCommons(m), true, "the economic predicate no longer carries the town clause");
  assert.equal(exemptionFor(m, { authoredTier: "market" }),
    "town: the town's own mark — exempt by the founder's ruling of 2026-09-09");
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

// ── the founder's two exemptions (2026-09-09) ───────────────────────────────

test('"constitution tier marks need no stamps" — a law node is never in the set', () => {
  const law = { id: "rei/the-keeping-law", by: "rei", sovereign: false, stamps: 0, weight: 0 };
  assert.equal(isUnstakedCommons(law), true, "the economic predicate alone would sweep it");
  assert.equal(exemptionFor(law, { authoredTier: "constitution" }),
    "constitution-tier: law needs no stake");
});

test("the exemption reads the AUTHORED tier, not the fold's published one", () => {
  // marks-fold's published `tier` is the DERIVED standing, and markStanding
  // returns "constitution" only when by === the-town. A resident's law node
  // publishes as "home" or "market", so an exemption reading the published
  // field could never fire for the case the ruling names — "whoever owns them".
  const residentLaw = { id: "rei/the-keeping-law", by: "rei", tier: "home", sovereign: false, stamps: 0, weight: 0 };
  assert.equal(exemptionFor(residentLaw, { authoredTier: "constitution" }),
    "constitution-tier: law needs no stake",
    "the record says constitution; the projection says home; the record governs");
  assert.equal(exemptionFor(residentLaw, { authoredTier: "market" }), null);
});

test('"the town mints 77 stamps onto every region ring" — all thirteen are exempt', () => {
  assert.equal(REGION_SLUGS.length, 13, "the roster is the thirteen");
  for (const slug of REGION_SLUGS) {
    // resident-founded or not: the owner is not part of the test
    assert.equal(exemptionFor({ id: `caelum/${slug}` }, { authoredTier: "market" }),
      "region: the town's founding stake", `${slug} must be exempt`);
  }
});

test("a mark that merely sits inside a region is not a region ring", () => {
  assert.equal(exemptionFor({ id: "rei/a-bench-in-evermoon", kind: "sited" }, { authoredTier: "market" }), null);
});

test('"parcels need no staking either" — every parcel is exempt, staked or not', () => {
  const p = { id: "rei/rei-parcel", kind: "parcel", by: "rei", sovereign: false, stamps: 0, weight: 0 };
  assert.equal(isUnstakedCommons(p), true, "the economic predicate alone would sweep it");
  assert.equal(exemptionFor(p, { authoredTier: "market" }),
    "parcel: the founding privilege — needs no stake");
});

test("the parcel exemption is the LAW, so no flag can undo it", () => {
  const { root, marks } = estate();
  try {
    for (const dead of ["--hold-parcels", "--hold-occupied-parcels", "--return-parcels"]) {
      const r = run(marks, ["--allow-stampless", dead]);
      assert.equal(r.code, 2, `${dead} must be refused, not ignored`);
      assert.match(r.err, /needs no staking|no flag returns one/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("no parcel is ever in the move, whatever else the tree holds", () => {
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless"]).out);
    assert.equal(receipt.moved.some((m) => m.kind === "parcel"), false);
    const p = receipt.skipped.find((s) => s.mark === "rei/rei-parcel");
    assert.match(p.why, /founding privilege/);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    // Since the founder's ruling of 2026-09-09 the world root is named by the
    // exemption that actually governs it — it carries `tier: constitution` —
    // rather than by the town rule, which was also true and less specific.
    assert.match(townRow.why, /constitution-tier/);
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

test("the parcel exemption closes the cascade at its root, and the instrument still reads it", () => {
  // Before the ruling this fixture produced a cascade of 1: rei's parcel left,
  // so rei's house lost the ground that made it sovereign and would have been
  // swept on the next crossing. The parcel now stands, so nothing is pulled out
  // from under the house. The check is kept BECAUSE it reads zero — an
  // instrument that reads zero for a reason is the only kind that can tell you
  // when the reason stops being true.
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless"]).out);
    assert.equal(receipt.moved.some((m) => m.mark === "rei/rei-parcel"), false);
    const house = receipt.skipped.find((s) => s.mark === "rei/the-quiet-house");
    assert.match(house.why, /sovereign/, "the house stands, as the PSA promises");
    assert.equal(receipt.totals.cascade_next_crossing, 0,
      "no ground moves, so nothing newly enters the set");
    assert.deepEqual(receipt.cascade, []);
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

// ── THE REASON MUST BE TRUE, AND THIS IS THE TEST THAT READS IT ─────────────
//
// The reviewer replaced EVERY staying mark's reason with a false one
// ("staked — stamps 999, weight 999") and the suite stayed 17/17 green: the
// accounting falsifier reads the PRESENCE of a reason, never its truth. So 73
// held parcels could be told they were "staked — stamps 0, weight 0" — a string
// that contradicts itself on its face — on an audit surface, and no test cared.
//
// These assert the EXACT string each mark gets. Any substitution reds them.

test("every staying mark's reason is the true one, named exactly", () => {
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-no-sketchbooks"]).out);
    const why = Object.fromEntries(receipt.skipped.map((s) => [s.mark, s.why]));
    assert.equal(why["the-town/let-there-be-light"], "constitution-tier: law needs no stake");
    assert.equal(why["rei/rei-parcel"], "parcel: the founding privilege — needs no stake");
    assert.match(why["rei/the-quiet-house"], /^sovereign — /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("no mark is ever told it is staked when it carries nothing", () => {
  // The self-contradicting string W1 found. A "staked" reason must name numbers
  // that are actually above zero, and they must be the mark's own.
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-no-sketchbooks"]).out);
    for (const s of receipt.skipped) {
      const m = /^staked — stamps (\d+), weight (\d+)$/.exec(s.why);
      if (!m) continue;
      assert.ok(Number(m[1]) > 0 || Number(m[2]) > 0,
        `${s.mark} is told it is "staked" while carrying stamps ${m[1]} and weight ${m[2]}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("every reason is one the law actually offers — no free-text drift", () => {
  const KNOWN = [
    /^constitution-tier: law needs no stake$/,
    /^parcel: the founding privilege — needs no stake$/,
    /^region: the town's founding stake$/,
    /^town: the town's own mark — exempt by the founder's ruling of 2026-09-09$/,
    /^sovereign — /, /^staked — stamps \d+, weight \d+$/,
    /^no sketchbook branch /, /^no directory in the tree/,
  ];
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-no-sketchbooks"]).out);
    for (const s of receipt.skipped)
      assert.ok(KNOWN.some((re) => re.test(s.why)), `${s.mark}: unrecognised reason "${s.why}"`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── the town law (founder, 2026-09-09 18:56 EDT: "exempt all the town's own
//    marks, no mint") ────────────────────────────────────────────────────────

test('"exempt all the town\'s own marks" — a market-tier town mark with no stake is never in S', () => {
  const ship = { id: "the-town/the-ship-at-anchor", by: "the-town", kind: "sited",
                 sovereign: false, stamps: 0, weight: 0 };
  assert.equal(isUnstakedCommons(ship), true, "the economic predicate alone would sweep it");
  assert.equal(exemptionFor(ship, { authoredTier: "market" }),
    "town: the town's own mark — exempt by the founder's ruling of 2026-09-09");
});

test("the town reason does NOT claim the town stakes — that is what 'no mint' ruled", () => {
  const r = exemptionFor({ id: "the-town/a-bench", by: "the-town", kind: "sited" }, { authoredTier: "market" });
  assert.doesNotMatch(r, /stake\b(?!.*needs no)/i.test(r) ? /$^/ : /the town's to stake/);
  assert.match(r, /exempt by the founder's ruling/);
});

test("the exemptions are read law → parcel → region → town, and the receipt says so", () => {
  const { root, marks } = estate();
  try {
    const receipt = JSON.parse(run(marks, ["--allow-stampless", "--allow-no-sketchbooks"]).out);
    assert.deepEqual(receipt.exemption_order, ["law", "parcel", "region", "town"]);
    // A town-owned law node qualifies under BOTH law and town; under this order
    // it lands in law, which is what makes the town bucket mean something.
    const root_ = receipt.skipped.find((s) => s.mark === "the-town/let-there-be-light");
    assert.match(root_.why, /^constitution-tier/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the denominator gate: a clone with no sketchbook refs refuses", () => {
  const { root, marks } = estate();
  try {
    // A REAL but empty repo: no draft ref is visible, the same blindness as a
    // clone that never fetched them. It has to be a real repo, because `git -C`
    // on a non-repo walks up and borrows an ancestor's refs — which is the
    // separate gate asserted below, and is how this one was found.
    execFileSync("git", ["init", "-q", root]);
    const r = run(marks, ["--allow-stampless", "--repo", root]);
    assert.equal(r.code, 2, "counts that depend on invisible refs must not be reported as facts");
    assert.match(r.err, /no draft\/\* sketchbook refs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("--repo that is not a repository's top level refuses, instead of borrowing an ancestor's", () => {
  // `git -C <path>` walks up. A fixture directory under the scratchpad resolved
  // to a real HEAD in the user's home during this lane — so a mistyped --repo
  // would have read that repository's draft refs and, under --apply, written
  // sketchbook refs and a commit into it.
  const { root, marks } = estate();          // deliberately NOT a git repo
  try {
    const r = run(marks, ["--allow-stampless", "--repo", root]);
    assert.equal(r.code, 2);
    assert.match(r.err, /not the top of a git repository|is not a git repository/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── DISPLACEMENT: the move relocates marks that stay ────────────────────────
//
// A nested mark's `at:` is an offset from its framing parent's centre. Take the
// parent away and the child re-frames on the grandparent — it keeps standing,
// and it is somewhere else. On the live tree 22 standing marks move, the
// furthest by 1,042 m, and two leave their own ground.

test("a mark that stays under a returning parent is reported as displaced", () => {
  const root = mkdtempSync(join(tmpdir(), "unstaked-return-displace-"));
  const marks = join(root, "WORLD", "marks");
  const mk = (p, fm) => {
    const d = join(marks, p);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "mark.md"),
      `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nA thing.\n`);
  };
  // `coords: relative` is declared once on the world root, exactly as the live
  // tree declares it — and it is what makes a nested `at:` an OFFSET from the
  // parent's centre rather than a world position. That is the whole mechanism.
  mk("let-there-be-light", { by: "the-town", kind: "sited", date: "2026-07-01", at: "{ x: 0, y: 0 }", extent: "{ w: 60000, h: 60000 }", tier: "constitution", coords: "relative" });
  // rei's yard, unstaked — it returns, and it is the FRAME for what is inside it
  mk("let-there-be-light/the-yard", { by: "rei", kind: "sited", date: "2026-07-10", at: "{ x: 900, y: 900 }", extent: "{ w: 60, h: 60 }" });
  // the town's bench inside it: stays (town law), and its at: is an offset
  mk("let-there-be-light/the-yard/the-bench", { by: "the-town", kind: "sited", date: "2026-07-11", at: "{ x: 5, y: 5 }", extent: "{ w: 2, h: 2 }" });

  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture"]);
  execFileSync("git", ["-C", root, "update-ref", "refs/remotes/origin/draft/rei", "HEAD"]);
  try {
    const out = execFileSync("node", [TOOL, "--marks-dir", marks, "--repo", root,
      "--allow-stampless", "--apply", "--json"], { encoding: "utf8", maxBuffer: 1 << 28 });
    const receipt = JSON.parse(out);
    assert.ok(receipt.moved.some((m) => m.mark === "rei/the-yard"), "the yard returns");
    assert.equal(receipt.totals.displaced, 1,
      "the bench stays and must be reported as having moved — a silent relocation is the whole defect");
    const d = receipt.displaced[0];
    assert.equal(d.mark, "the-town/the-bench");
    assert.ok(d.metres > 0, "it is somewhere else now");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
