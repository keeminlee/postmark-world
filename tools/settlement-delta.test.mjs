// settlement-delta.test.mjs — THE EQUIVALENCE GATE for §4's delta folds.
//
// The world-runtime ladder, §4, verbatim:
//
//   "Today the sweep folds each of ~27 sketchbooks against the whole world
//    (`foldRef`): ~28 whole-world O(m²) folds per settlement. Target: fold main
//    ONCE; per sketchbook, validate only its delta (`markDelta` already computes
//    it) against that folded state — O(k·m) per branch; keep ONE full fold of
//    the merged result as the final gate. ~28 full folds → ~1 + 27 cheap checks.
//    Cross-household composition (two drafts conflicting only with each other)
//    surfaces at the merged fold, as now."
//
// ── WHY THIS FILE EXISTS BEFORE THE OPTIMIZATION DOES ────────────────────────
//
// The two paths do NOT fold the same world, and that is not a subtlety — it is
// the whole risk. Today each sketchbook is folded as ITS OWN TREE. Measured on a
// throwaway clone of the live record (2026-08-23, world main a1f08ea7): every
// one of the 23 live sketchbooks is ~115 marks BEHIND main. So "validate the
// delta against main's folded state" judges each sketchbook against a world
// with 115 marks its own tree does not contain.
//
// That could move a verdict. `markStanding` walks a mark's ancestry to find its
// governing ground, and 115 extra marks is 115 more chances for that walk to
// stop somewhere else. Whether it DOES move one is a question of fact, and the
// answer belongs in a test rather than in a hope.
//
// So this file asserts the property §4's optimization needs and does not
// currently have a name for: FOR EVERY DELTA ROW, THE VERDICT IS THE SAME
// WHICHEVER WORLD IT WAS DERIVED IN. A perf slice that changes one verdict is
// not a perf slice, and this is the gate that says so out loud.
//
// ── THE LIVE MEASUREMENT THIS ENCODES ────────────────────────────────────────
//
// Run against a throwaway clone of postmark-world at main a1f08ea7, with the
// live escrow reproduced from main's own world-state (101 staked marks):
//
//   24 whole-world folds (main + 23 sketchbooks), 940 marks each
//   main's fold alone            11.5 s
//   all 24 folds                176.7 s   ← of a 363.7 s settlement
//   per sketchbook               ~6.8 s = archive 1.0 + loadMarks 1.8 + fold 4.0
//   delta rows across ALL 23      37
//   verdict equivalence          37 / 37 agree, 0 divergences
//
// Thirty-seven rows, adjudicated by a hundred and seventy-seven seconds of
// folding. That is the case for §4, measured rather than estimated — and the
// 37/37 is the green light this gate exists to keep green.
//
//   node --test tools/settlement-delta.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { draftBranches, foldRef, markDelta, recordAt, foldMeter, resetFoldMeter } from "./settlement-sweep.mjs";
import { markStanding } from "./mark-standing.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier, at, extent, body, consent, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (consent) lines.push(`consent: { ${consent} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

/**
 * A world shaped like the live one in the way that matters: sketchbooks cut at
 * different times, so each is BEHIND main by marks it has never seen. A fixture
 * where every branch is current would assert nothing — the two paths would be
 * folding the same tree and could not possibly disagree.
 */
function staleWorld(t, label) {
  const repo = mkdtempSync(join(tmpdir(), `postmark-delta-${label}-`));
  t.after(() => { try { rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* litter */ } });
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (p, text) => { const f = join(repo, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame" }));
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's ground" }));
  put("WORLD/marks/let-there-be-light/bob-parcel/mark.md", record({
    kind: "parcel", by: "bob", at: { x: 400, y: 400 }, extent: { w: 100, h: 100 }, body: "bob's ground" }));

  git("init", "-q", "-b", "main");
  git("config", "user.name", "fixture");
  git("config", "user.email", "fixture@test.invalid");
  git("add", "-A");
  git("commit", "-q", "-m", "canon, as the sketchbooks were cut from it");

  // THE SKETCHBOOKS, cut HERE — before main grows.
  git("switch", "-q", "-c", "draft/house-a");
  put("WORLD/marks/let-there-be-light/alice-parcel/alice-shed/mark.md", record({
    by: "alice", at: { x: 100, y: 100 }, extent: { w: 10, h: 10 }, body: "on her own ground" }));
  put("WORLD/marks/let-there-be-light/alice-afield/mark.md", record({
    by: "alice", at: { x: 2000, y: 2000 }, extent: { w: 10, h: 10 }, body: "out in the commons" }));
  git("add", "-A"); git("commit", "-q", "-m", "house-a's sketches");

  git("switch", "-q", "main");
  git("switch", "-q", "-c", "draft/house-b");
  // bob drops a mark ON ALICE'S GROUND — the cross-household case, and the one
  // whose verdict depends on what the walk finds above it.
  put("WORLD/marks/let-there-be-light/alice-parcel/bob-visits/mark.md", record({
    by: "bob", at: { x: 100, y: 100 }, extent: { w: 6, h: 6 }, body: "a guest on alice's ground" }));
  git("add", "-A"); git("commit", "-q", "-m", "house-b's sketch");

  // NOW MAIN MOVES ON, and neither sketchbook has ever seen any of it. This is
  // the ~115-mark staleness the live record actually carries, in miniature.
  git("switch", "-q", "main");
  for (let i = 0; i < 12; i++) put(`WORLD/marks/let-there-be-light/later-${i}/mark.md`, record({
    by: "carol", at: { x: 3000 + i * 40, y: 3000 }, extent: { w: 8, h: 8 }, body: `published after the sketchbooks were cut (${i})`, date: "2026-08-01" }));
  // and one of them lands ON ALICE'S GROUND, so main's world genuinely differs
  // above the very ancestry the walk climbs
  put("WORLD/marks/let-there-be-light/alice-parcel/late-arrival/mark.md", record({
    by: "alice", at: { x: 100, y: 100 }, extent: { w: 20, h: 20 }, body: "alice published this after cutting her sketchbook", date: "2026-08-01" }));
  git("add", "-A"); git("commit", "-q", "-m", "main moves on");

  return { repo, git };
}

/** The two worlds a delta row can be judged in, and the verdict each gives. */
function verdictsBothWays(repo, stakes = []) {
  const mainState = foldRef(repo, "main", stakes);
  const mainFolded = new Map(mainState.marks.map((m) => [m.id, m]));
  const rows = [];
  for (const branch of draftBranches(repo)) {
    const branchFolded = new Map(foldRef(repo, branch, stakes).marks.map((m) => [m.id, m]));
    const deltas = markDelta(repo, "main", branch);

    // §4's world: main's ONE fold, with this sketchbook's own delta overlaid.
    const overlay = new Map(mainFolded);
    for (const d of deltas) {
      if (d.status === "D") continue;
      const rec = recordAt(repo, branch, d.path);
      if (rec?.id) overlay.set(rec.id, branchFolded.get(rec.id) ?? rec);
    }

    for (const d of deltas) {
      if (d.status === "D" || !d.branchTouched) continue;
      const rec = recordAt(repo, branch, d.path);
      if (!rec?.id) continue;
      rows.push({
        branch, id: rec.id,
        wholeWorld: markStanding(branchFolded.get(rec.id) ?? rec, branchFolded),
        delta: markStanding(overlay.get(rec.id) ?? rec, overlay),
      });
    }
  }
  return rows;
}

test("§4 equivalence — every delta row's verdict is the same in both worlds, on a STALE fixture", (t) => {
  // "Target: fold main ONCE; per sketchbook, validate only its delta … against
  // that folded state." The substitution is only lawful if it decides nothing
  // differently, and staleness is the condition under which it might.
  const { repo } = staleWorld(t, "equiv");
  const rows = verdictsBothWays(repo);

  assert.ok(rows.length >= 3, `the fixture must actually produce delta rows to compare — got ${rows.length}`);
  const diverged = rows.filter((r) => r.wholeWorld !== r.delta);
  assert.deepEqual(diverged, [],
    "a perf slice that changes one verdict is not a perf slice — these rows read differently in the two worlds");

  // and the fixture is genuinely stale, or the assertion above is vacuous
  const mainCount = foldRef(repo, "main", []).marks.length;
  const branchCount = foldRef(repo, "draft/house-a", []).marks.length;
  assert.ok(mainCount > branchCount + 5,
    `main must be meaningfully ahead of the sketchbook or the two worlds are the same world (main ${mainCount}, branch ${branchCount})`);
});

test("§4 equivalence — the cross-household guest reads the same in both worlds", (t) => {
  // bob's mark stands on alice's ground. Its verdict is the ancestry walk's
  // answer, which is exactly what 115 extra marks could disturb — and the case
  // the live record's own sketchbooks are full of.
  const { repo } = staleWorld(t, "guest");
  const rows = verdictsBothWays(repo);
  const guest = rows.find((r) => r.id === "bob/bob-visits");
  assert.ok(guest, "the guest row is in the delta");
  assert.equal(guest.wholeWorld, guest.delta);
  assert.equal(guest.delta, "market",
    "absent a welcome, a guest at the doorstep is a guest — in either world (mark-standing § groundVerdict)");
});

test("§4's premise, measured — the sweep folds the whole world once per sketchbook", (t) => {
  // "~28 whole-world O(m²) folds per settlement." This is that claim as an
  // assertion rather than an estimate: one fold for main, one for every
  // sketchbook, each over the entire mark set.
  const { repo } = staleWorld(t, "meter");
  resetFoldMeter();
  const branches = draftBranches(repo);
  foldRef(repo, "main", []);
  for (const b of branches) foldRef(repo, b, []);

  assert.equal(foldMeter.whole, branches.length + 1,
    "one whole-world fold for main and one for every sketchbook — the cost §4 exists to remove");
  assert.ok(foldMeter.marks > 10, "and each of them folds the whole mark set, not a delta");
  assert.ok(foldMeter.wholeMs >= 0);
});

test("the meter counts what it says it counts, and resets per sweep", (t) => {
  const { repo } = staleWorld(t, "reset");
  resetFoldMeter();
  assert.equal(foldMeter.whole, 0);
  foldRef(repo, "main", []);
  assert.equal(foldMeter.whole, 1);
  foldRef(repo, "main", []);
  assert.equal(foldMeter.whole, 2, "two folds counted as two");
  resetFoldMeter();
  assert.equal(foldMeter.whole, 0, "and a fresh sweep starts from nothing, so a report's number is that sweep's");
});
