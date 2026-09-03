// settlement-worldfix.test.mjs — the drain night's four defects, each with the
// falsifier that can only pass if the fix is real.
//
// Founder mandate, 2026-08-27 ~01:00 ET, verbatim in the parts these assert:
//
//   2. "RECEIPTS LIE BY OMISSION — the settlement commit says 'sweep N
//       published, M unpublished' but left_drafted (42 rows tonight!), dropped,
//       quarantined never appear."
//   3. "NO LOUD-EMPTY GUARD — a sweep finding zero candidates while draft
//       branches hold escrowed marks completes green."
//   4. "ONE BAD MARK REFUSES THE WHOLE TOWN … nothing isolates a suite-red to
//       its offending mark."
//
// Every test below was run RED FIRST against the unmodified tools — the
// receipts for those runs are in
// G:/Starstory/docs/2026-08-27/worldfix-receipts.md § "red-first".

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { settlementSweep, surveySketchbooks, SUITE_QUARANTINE_REASON } from "./settlement-sweep.mjs";
import { isolate } from "./settlement-isolate.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier, at, extent, body, date = "2026-08-27" }) => [
  "---",
  `kind: ${kind}`,
  `by: ${by}`,
  ...(tier ? [`tier: ${tier}`] : []),
  `at: ${JSON.stringify(at)}`,
  ...(extent ? [`extent: ${JSON.stringify(extent)}`] : []),
  `date: ${date}`,
  "---",
  "",
  body,
  "",
].join("\n");

/**
 * The same shape `settlement-sweep.test.mjs` uses: a real git repo with a real
 * fold, so nothing here is asserted against a tree no crossing could produce.
 */
function crossing(t, name) {
  const repo = mkdtempSync(join(tmpdir(), `postmark-${name}-`));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));

  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const put = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  const commit = (message) => {
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
    git("add", "-A");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", message);
  };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  git("init", "-q", "-b", "main");
  writeFileSync(stakesPath, JSON.stringify([]));

  return {
    repo, git, put, commit, stakesPath,
    stakes: (rows) => writeFileSync(stakesPath, JSON.stringify(rows)),
    sweep: (options = {}) => settlementSweep({ repo, stakesPath, ...options }),
    subject: (ref = "main") => git("log", "-1", "--format=%s", ref).trim(),
    message: (ref = "main") => git("log", "-1", "--format=%B", ref),
    marksOn: (ref) => git("ls-tree", "-r", "--name-only", ref, "--", "WORLD/marks")
      .split(/\r?\n/).map((l) => l.trim()).filter((l) => l.endsWith("/mark.md")),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT 3 · the loud-empty guard
// ─────────────────────────────────────────────────────────────────────────────

test("THE SENSOR: the survey finds an escrow-backed mark standing in a sketchbook, by a path the candidate loop does not share", (t) => {
  const c = crossing(t, "survey-sees");
  c.commit("the world");
  c.git("branch", "draft/house-a");
  c.git("checkout", "-q", "draft/house-a");
  c.put("WORLD/marks/let-there-be-light/the-lamp/mark.md",
    record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a lamp" }));
  c.commit("alice leaves a lamp");
  c.git("checkout", "-q", "main");

  const withEscrow = surveySketchbooks(c.repo, "main", new Map([["alice/the-lamp", 5]]));
  assert.equal(withEscrow.branches, 1, "one sketchbook is standing");
  assert.equal(withEscrow.delta_rows, 1, "holding one mark main does not have");
  assert.equal(withEscrow.escrow_backed_deltas, 1, "and the town has staked stamps behind it");
  assert.equal(withEscrow.escrow_backed[0].id, "alice/the-lamp", "named, so the refusal can name it too");

  // THE FLIP. Same repo, same sketchbook, same mark — no stakes. The survey must
  // go quiet, or it would report every ordinary waiting mark as a starving
  // crossing and the guard would refuse the town twice a day forever.
  const without = surveySketchbooks(c.repo, "main", new Map());
  assert.equal(without.delta_rows, 1, "the delta is still there");
  assert.equal(without.escrow_backed_deltas, 0, "but nothing is anchored to it, so the survey says nothing");
});

test("THE GUARD (defect 3): a crossing that saw NOTHING on every channel, while a sketchbook holds an escrow-backed mark, REFUSES instead of exiting green", (t) => {
  const c = crossing(t, "loud-empty");
  c.commit("the world, and no sketchbooks at all");

  // The contradiction, planted through the documented seam. With the reading
  // code working, "saw nothing" and "nothing was there" are the same state —
  // which is exactly why two days of starving crossings were invisible. The
  // guard's whole job is to notice when they come apart.
  const blindCrossing = () => c.sweep({
    surveyor: () => ({
      branches: 1, delta_rows: 1, escrow_backed_deltas: 1,
      escrow_backed: [{ household: "house-a", ref: "draft/house-a", path: "WORLD/marks/let-there-be-light/the-lamp/mark.md", id: "alice/the-lamp", escrow: 5 }],
    }),
  });

  assert.throws(blindCrossing, (error) => {
    assert.match(error.message, /starving crossing/, "the refusal says what kind of failure this is");
    assert.match(error.message, /alice\/the-lamp/, "and names the mark that proves the crossing was blind");
    assert.match(error.message, /5✦/, "with the escrow that makes it urgent");
    assert.ok(Array.isArray(error.starving) && error.starving.length === 1,
      "carrying the evidence, so settlement-auto.sh can put it in the receipt");
    return true;
  }, "a crossing that saw nothing while something was there must never complete green");

  // THE FLIP, and it is the important half: an HONESTLY empty crossing still
  // passes. A guard that refuses a genuinely quiet town is worse than no guard —
  // it would stop every real settlement to protect against a hypothetical one.
  const honestlyQuiet = c.sweep({ surveyor: () => ({ branches: 0, delta_rows: 0, escrow_backed_deltas: 0, escrow_backed: [] }) });
  assert.equal(honestlyQuiet.published.length, 0, "nothing published, because nothing was there");
  assert.deepEqual(honestlyQuiet.surveyed, { branches: 0, delta_rows: 0, escrow_backed_deltas: 0 },
    "and the report carries the survey, so the quiet pass says what it looked at");
});

test("THE GUARD stands down for a crossing that DECLINED things for reasons — 42 left drafted is a working crossing, not a starving one", (t) => {
  const c = crossing(t, "loud-empty-declines");
  c.commit("the world");
  c.git("branch", "draft/house-a");
  c.git("checkout", "-q", "draft/house-a");
  c.put("WORLD/marks/let-there-be-light/the-lamp/mark.md",
    record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a lamp" }));
  c.commit("alice leaves a lamp nobody has staked");
  c.git("checkout", "-q", "main");

  // No stakes: the lamp is commons with zero escrow, so it is LEFT DRAFTED for a
  // stated reason. That is the live 2026-08-26 shape — 38 of the 42 rows — and
  // the guard must not touch it. Meanwhile the survey is told there IS an
  // escrow-backed mark, so the only thing keeping this crossing alive is the
  // `sawNothing` half of the condition.
  const report = c.sweep({
    surveyor: () => ({ branches: 1, delta_rows: 1, escrow_backed_deltas: 1, escrow_backed: [{ id: "alice/the-lamp", ref: "draft/house-a", household: "house-a", escrow: 5, path: "x" }] }),
  });
  assert.equal(report.published.length, 0, "nothing publishes");
  assert.equal(report.left_drafted.length, 1, "but the crossing had something to SAY about it");
  assert.match(report.left_drafted[0].reason, /commons needs escrow/, "and the reason is the ordinary one");
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT 2 · the receipts
// ─────────────────────────────────────────────────────────────────────────────

test("THE COMMIT NAMES EVERY CHANNEL (defect 2), including the empty ones — a zero is a fact about this crossing and its absence is a crossing that never looked", (t) => {
  const c = crossing(t, "all-channels");
  c.commit("the world");
  c.git("branch", "draft/house-a");
  c.git("checkout", "-q", "draft/house-a");
  c.put("WORLD/marks/let-there-be-light/the-lamp/mark.md",
    record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a lamp" }));
  c.commit("alice leaves a lamp");
  c.git("checkout", "-q", "main");
  c.stakes([{ holder: "s1", mark: "alice/the-lamp", n: 5, weight: 5 }]);

  const report = c.sweep();
  assert.equal(report.published.length, 1, "the lamp crosses");

  const subject = c.subject("main");
  // The exact sentence the founder called a lie by omission was
  // "settlement: sweep 0 published, 0 unpublished". Every channel, by name.
  for (const phrase of ["published", "unpublished", "left drafted", "withdrawn", "quarantined", "dropped"]) {
    assert.match(subject, new RegExp(`\\d+ ${phrase}`),
      `the settlement commit must name the ${phrase} channel with its count — this is the whole of defect 2`);
  }
  assert.match(subject, /0 quarantined/, "and a channel that stayed empty says so, rather than vanishing");
  assert.deepEqual(report.surveyed, { branches: 1, delta_rows: 1, escrow_backed_deltas: 1 },
    "the report carries the survey so the quiet-pass path can say what it surveyed");
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFECT 4 · one bad mark must not refuse the whole town
// ─────────────────────────────────────────────────────────────────────────────

/** A town of `n` households, each publishing one staked mark, all eligible. */
function town(t, name, households) {
  const c = crossing(t, name);
  c.commit("the world");
  for (const { login, by, slug, at } of households) {
    c.git("branch", `draft/${login}`, "main");
    c.git("checkout", "-q", `draft/${login}`);
    c.put(`WORLD/marks/let-there-be-light/${slug}/mark.md`,
      record({ by, at, extent: { w: 10, h: 10 }, body: `${by}'s ${slug}` }));
    c.commit(`${by} leaves ${slug}`);
    c.git("checkout", "-q", "main");
  }
  c.stakes(households.map(({ by, slug }) => ({ holder: "s1", mark: `${by}/${slug}`, n: 5, weight: 5 })));

  // The pre-sweep refs, exactly as settlement-auto.sh records them — the sweep
  // rebases the sketchbooks, so this is unrecoverable afterwards.
  const before = {
    main: c.git("rev-parse", "main").trim(),
    branches: Object.fromEntries(households.map(({ login }) => [`draft/${login}`, c.git("rev-parse", `draft/${login}`).trim()])),
  };
  const beforePath = `${c.repo}-before.json`;
  t.after(() => rmSync(beforePath, { force: true }));
  writeFileSync(beforePath, JSON.stringify(before));

  const sweepPath = `${c.repo}-sweep.json`;
  t.after(() => rmSync(sweepPath, { force: true }));

  return {
    ...c, before, beforePath, sweepPath,
    firstSweep: () => { const r = c.sweep(); writeFileSync(sweepPath, JSON.stringify(r)); return r; },
  };
}

test("VERMILLION'S CASE REPLAYED (defect 4): one household's off-world amend reddens the gate — it alone is quarantined, and EVERY OTHER HOUSEHOLD STILL PUBLISHES", (t) => {
  // The live shape, 2026-08-27T01:13Z: an amend moved vermillion/the-pando-peak
  // to at:(-95458,-95458), ~95km outside the world; the landing is anchored on
  // that peak, so eleven vessel/timetable tests went red and the 03:22:57Z
  // crossing published NOTHING FOR ANYONE.
  const OFF_WORLD = { x: -95458, y: -95458 };
  const w = town(t, "isolate-offworld", [
    { login: "FluffUPando", by: "vermillion", slug: "the-pando-peak", at: OFF_WORLD },
    { login: "house-b", by: "bob", slug: "the-well", at: { x: 800, y: 800 } },
    { login: "house-c", by: "cara", slug: "the-orchard", at: { x: 1200, y: 1200 } },
    { login: "house-d", by: "dev", slug: "the-bridge", at: { x: 1600, y: 1600 } },
  ]);

  const first = w.firstSweep();
  assert.equal(first.published.length, 4, "the sweep publishes all four — its own admission does not catch this, which is why the gate is the one that finds it");

  // THE GATE, standing in for the world's 686-test grammar suite: red exactly
  // while the off-world peak is in canon. The condition is read off the tree, so
  // the isolator gets no hint it could not get from the record itself.
  let gateRuns = 0;
  const gate = (repo) => {
    gateRuns++;
    // `git grep` exits 1 when nothing matches, which is the GREEN case here.
    let offWorld = "";
    try { offWorld = execFileSync("git", ["-C", repo, "grep", "-l", "-e", "-95458", "main", "--", "WORLD/marks"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { offWorld = ""; }
    return { green: offWorld === "", log: offWorld ? "not ok 387 - VERMILLION'S CASE: standing on the berth centre when she casts off\n" : "" };
  };

  const result = isolate({ repo: w.repo, sweepPath: w.sweepPath, beforePath: w.beforePath, stakesPath: w.stakesPath, gate });

  assert.equal(result.attributed, true, "the red is attributable to a mark this crossing carried");
  assert.deepEqual(result.quarantined.map((q) => q.id), ["vermillion/the-pando-peak"],
    "EXACTLY the offending mark is held back — not its household's other work, not a neighbour's");

  // The half the founder actually cares about: everyone else settles.
  const published = new Set((result.report.published ?? []).map((r) => r.id));
  for (const id of ["bob/the-well", "cara/the-orchard", "dev/the-bridge"]) {
    assert.ok(published.has(id), `${id} publishes — its household did nothing wrong and must not be held hostage`);
  }
  assert.equal(published.has("vermillion/the-pando-peak"), false, "and the offending mark does not");

  // It SHOUTS: the household has to be able to learn this happened.
  assert.equal(result.report.suite_quarantined.length, 1, "the quarantine is a named channel on the report");
  assert.equal(result.report.suite_quarantined[0].id, "vermillion/the-pando-peak");
  const held = result.report.left_drafted.find((r) => r.id === "vermillion/the-pando-peak");
  assert.ok(held, "and it is left drafted rather than lost");
  assert.equal(held.reason, SUITE_QUARANTINE_REASON, "with the gate's own reason, not 'needs escrow'");
  assert.match(w.message("main"), /grammar suite refused this crossing until 1 mark\(s\) were held back/,
    "the settlement commit itself says a mark was held back, and which");
  assert.match(w.message("main"), /vermillion\/the-pando-peak/);

  // The mark is not destroyed: it stands in its own sketchbook and crosses again
  // when its geometry is fixed.
  assert.ok(w.marksOn("draft/FluffUPando").some((p) => p.includes("the-pando-peak")),
    "the held-back mark is still in the household's sketchbook — a quarantine is not a deletion");
  assert.ok(gateRuns >= 2, `the verdict was reached by running the gate (${gateRuns} times), not by guessing`);
});

test("THE OVERLAP REPLAYED (defect 4, second shape): two marks that redden the gate only TOGETHER — bisection stalls, the shrink finishes the job, and the innocent households publish", (t) => {
  // milo/the-purple-door overlapping jack-tully-brannon/the-brannon-lantern:
  // neither mark is wrong alone, so no per-mark admission check can see it, and
  // halving the held-back set never lands on a green half.
  const w = town(t, "isolate-overlap", [
    { login: "milo", by: "milo", slug: "the-purple-door", at: { x: 900, y: 900 } },
    { login: "brannon", by: "jack-tully-brannon", slug: "the-brannon-lantern", at: { x: 902, y: 902 } },
    { login: "house-c", by: "cara", slug: "the-orchard", at: { x: 4000, y: 4000 } },
    { login: "house-d", by: "dev", slug: "the-bridge", at: { x: 6000, y: 6000 } },
  ]);
  w.firstSweep();

  const bothPresent = (repo) => {
    const on = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", "main", "--", "WORLD/marks"], { encoding: "utf8" });
    return on.includes("the-purple-door") && on.includes("the-brannon-lantern");
  };
  const gate = (repo) => ({ green: !bothPresent(repo), log: bothPresent(repo) ? "not ok - two marks occupy one ground\n" : "" });

  const result = isolate({ repo: w.repo, sweepPath: w.sweepPath, beforePath: w.beforePath, stakesPath: w.stakesPath, gate });

  assert.equal(result.attributed, true, "the overlap is attributable even though neither mark is wrong alone");
  assert.ok(result.quarantined.length >= 1, "at least one of the pair is held back");
  assert.ok(result.quarantined.every((q) => ["milo/the-purple-door", "jack-tully-brannon/the-brannon-lantern"].includes(q.id)),
    "and ONLY the pair is ever held back — no innocent mark is quarantined to make the gate go green");

  const published = new Set((result.report.published ?? []).map((r) => r.id));
  for (const id of ["cara/the-orchard", "dev/the-bridge"]) {
    assert.ok(published.has(id), `${id} publishes — this is the founder's requirement, that everyone else still settles`);
  }
  assert.equal(gate(w.repo).green, true, "and the record it leaves behind actually passes the gate");
});

test("THE WINNING CHECKOUT: two independently red marks leave the repo on the green crossing the report names", (t) => {
  const w = town(t, "isolate-two-independent", [
    { login: "house-a", by: "alice", slug: "the-bad-lamp", at: { x: 800, y: 800 } },
    { login: "house-b", by: "bob", slug: "the-bad-well", at: { x: 1200, y: 1200 } },
    { login: "house-c", by: "cara", slug: "the-orchard", at: { x: 4000, y: 4000 } },
    { login: "house-d", by: "dev", slug: "the-bridge", at: { x: 6000, y: 6000 } },
  ]);
  w.firstSweep();

  const gate = (repo) => {
    const on = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", "main", "--", "WORLD/marks"], { encoding: "utf8" });
    const red = on.includes("the-bad-lamp") || on.includes("the-bad-well");
    return { green: !red, log: red ? "not ok - either bad mark reddens the town alone\n" : "" };
  };

  const result = isolate({ repo: w.repo, sweepPath: w.sweepPath, beforePath: w.beforePath, stakesPath: w.stakesPath, gate });

  assert.deepEqual(result.quarantined.map((q) => q.id), ["alice/the-bad-lamp", "bob/the-bad-well"],
    "both independently red marks are necessary quarantines");
  assert.equal(gate(w.repo).green, true,
    "the checkout must be rewound from the final red shrink trial to the remembered green winner");
  assert.equal(w.git("rev-parse", "main").trim(), result.main,
    "the immutable main left for publication must be the same green commit returned in the report");
});

test("THE HONEST REFUSAL: a red the crossing did not cause is NOT pinned on a household — the town refuses, exactly as it did before", (t) => {
  const w = town(t, "isolate-unattributable", [
    { login: "house-a", by: "alice", slug: "the-lamp", at: { x: 800, y: 800 } },
    { login: "house-b", by: "bob", slug: "the-well", at: { x: 1200, y: 1200 } },
  ]);
  w.firstSweep();

  // A machinery failure: red no matter what this crossing carries.
  const gate = () => ({ green: false, log: "not ok 1 - the fixture is live\n" });
  const result = isolate({ repo: w.repo, sweepPath: w.sweepPath, beforePath: w.beforePath, stakesPath: w.stakesPath, gate });

  assert.equal(result.attributed, false, "an unattributable red is reported as unattributable");
  assert.deepEqual(result.quarantined, [], "and NOBODY is quarantined for it — this is the guard against blaming a household for a broken box");
  assert.equal(result.rounds, 1, "and it costs exactly one trial to find out, because phase 0 asks the question first");
  assert.match(result.reason, /not this crossing's to fix/);
});
