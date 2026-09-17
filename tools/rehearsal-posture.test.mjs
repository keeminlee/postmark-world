// rehearsal-posture.test.mjs — the crossing rehearsal's two guards, and the
// proof that each of them can fail.
//
// A guard that has never been seen to red is a guard nobody has measured. Every
// check in `rehearsal-posture.mjs` and every refusal in `rehearsal-stakes.mjs`
// gets a fixture here that breaks exactly that one condition, so the day one of
// them stops firing the suite says so instead of the world finding out at a
// crossing.
//
// The `[pin] ` titles read this repository's real files as text and assert over
// their shape, so they belong to the pull-request suite rather than the candle
// (suite.yml, ruled 2026-09-14). The fixture tests below are ordinary behaviour
// and run everywhere.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rehearsalPosture, envReads, ALLOWED_TOOL_ENV, WORKFLOW_REL } from "./rehearsal-posture.mjs";
import { stakesFromState, deriveRehearsalStakes, UNATTRIBUTED_HOLDER } from "./rehearsal-stakes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── the fixture repo ─────────────────────────────────────────────────────────
// Small enough to read at a glance and complete enough that every check has
// something to look at. `holds()` is the posture as it should be; each falsifier
// changes exactly one thing.
const GOOD_WORKFLOW = `# a rehearsal
name: crossing rehearsal
on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  crossing-rehearsal:
    runs-on: ubuntu-latest
    steps:
      - run: node tools/settlement-sweep.mjs --stakes s.json
`;

function fixture(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-rehearsal-posture-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  mkdirSync(join(dir, "tools"), { recursive: true });
  writeFileSync(join(dir, WORKFLOW_REL), overrides.workflow ?? GOOD_WORKFLOW);
  writeFileSync(join(dir, "tools", "settlement-sweep.mjs"), overrides.sweep ?? `const a = process.env.BOT_NAME; const b = process.env.BOT_EMAIL;\n`);
  writeFileSync(join(dir, "tools", "harm-gate.mjs"), overrides.gate ?? `// five checks, none of them reads a column\nexport const x = 1;\n`);
  return dir;
}

function posture(overrides = {}, env = null) {
  const dir = fixture(overrides);
  try { return rehearsalPosture({ repo: dir, workflow: WORKFLOW_REL, env }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

const broke = (out, name) => {
  assert.equal(out.ok, false, `expected ${name} to break the posture, and it held`);
  assert.ok(out.failures.some((f) => f.name === name), `expected a ${name} failure, got ${out.failures.map((f) => f.name).join(", ") || "none"}`);
};

test("the fixture posture holds — otherwise every falsifier below is meaningless", () => {
  const out = posture();
  assert.equal(out.ok, true, out.failures.map((f) => `${f.name}: ${f.detail}`).join("\n"));
  assert.equal(out.checks.length, 7);
});

test("FALSIFIER 1: the base-token trigger breaks it, even inside a comment", () => {
  broke(posture({ workflow: GOOD_WORKFLOW.replace("# a rehearsal", "# never use pull" + "_request_target here") }), "trigger");
  // and as the real thing, which is the case that matters
  broke(posture({ workflow: GOOD_WORKFLOW.replace("  pull_request:", "  pull" + "_request_target:") }), "trigger");
});

test("FALSIFIER 2: a missing permissions block breaks it, and so does a widened one", () => {
  broke(posture({ workflow: GOOD_WORKFLOW.replace(/permissions:\n  contents: read\n\n/, "") }), "permissions");
  broke(posture({ workflow: GOOD_WORKFLOW.replace("  contents: read", "  contents: write") }), "permissions");
  broke(posture({ workflow: GOOD_WORKFLOW.replace("  contents: read", "  contents: read\n  packages: read") }), "permissions");
});

test("FALSIFIER 3: a secret reference breaks it", () => {
  broke(posture({ workflow: GOOD_WORKFLOW.replace("      - run: node", "      - run: echo ${{ secrets.ANYTHING }}\n      - run: node") }), "secrets");
});

test("FALSIFIER 4: a push, a tag, a remote or a gh call breaks it — and a comment about one does not", () => {
  for (const verb of ["git push origin HEAD", "git tag v1", "git remote add x y", "git remote set-url origin x", "gh pr comment 1"]) {
    broke(posture({ workflow: GOOD_WORKFLOW.replace("      - run: node", `      - run: ${verb}\n      - run: node`) }), "verbs");
  }
  const out = posture({ workflow: GOOD_WORKFLOW.replace("# a rehearsal", "# the sweep never runs git push, and this job must not either") });
  assert.equal(out.ok, true, "a verb named in prose is not a verb the job runs");
});

test("FALSIFIER 5: an env block breaks it", () => {
  broke(posture({ workflow: GOOD_WORKFLOW.replace("    steps:", "    env:\n      ANYTHING: 1\n    steps:") }), "env");
});

test("FALSIFIER 6: a new env read in a tool the job runs breaks it", () => {
  broke(posture({ sweep: `const u = process.env.DATABASE_URL;\n` }), "consumers");
  broke(posture({ gate: `const u = process.env["WORLD2_DSN"];\n` }), "consumers");
  // the two the sweep already reads are named, deliberately, and stay quiet
  assert.equal(posture({ sweep: `process.env.BOT_NAME; process.env.BOT_EMAIL;\n` }).ok, true);
  assert.deepEqual(ALLOWED_TOOL_ENV, ["BOT_EMAIL", "BOT_NAME"]);
});

test("FALSIFIER 7: a harm-gate check that reads weight breaks it — the rehearsal does not reproduce that column", () => {
  const out = posture({ gate: `check("weight", rows);\n` });
  broke(out, "weight");
  assert.match(out.failures.find((f) => f.name === "weight").detail, /rehearsal-stakes/);
});

test("FALSIFIER 8: the runtime deny-list sees a store or a pen when one is handed to it", () => {
  broke(posture({}, { PATH: "/usr/bin", DATABASE_URL: "postgres://x" }), "runtime-env");
  broke(posture({}, { PATH: "/usr/bin", GITHUB_WRITE_TOKEN: "x" }), "runtime-env");
  const clean = posture({}, { PATH: "/usr/bin", HOME: "/home/runner", RUNNER_TEMP: "/tmp" });
  assert.equal(clean.ok, true, clean.failures.map((f) => f.detail).join("\n"));
  assert.equal(clean.checks.length, 8, "the runtime check is the eighth, and only when an environment is handed in");
});

test("a workflow that is not there is a broken posture, not a quiet pass", () => {
  const dir = mkdtempSync(join(tmpdir(), "postmark-rehearsal-posture-"));
  try {
    const out = rehearsalPosture({ repo: dir, workflow: WORKFLOW_REL });
    assert.equal(out.ok, false);
    assert.equal(out.failures[0].name, "workflow");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("envReads finds both spellings and nothing that merely looks like one", () => {
  assert.deepEqual(envReads(`process.env.A; process.env["B"]; process.env['C']; notprocess_env_D; env.E`), ["A", "B", "C"]);
});

// ── the stakes derivation ────────────────────────────────────────────────────

const STATE = {
  marks: [
    { id: "a/one", stamps: 3 },
    { id: "b/two", stamps: 1 },
    { id: "c/three", stamps: 0 },
  ],
  portfolios: {
    alex: [{ mark: "a/one", stamps: 2 }, { mark: "b/two", stamps: 1 }],
    bo: [{ mark: "a/one", stamps: 1 }, { mark: "c/three", stamps: 0 }],
  },
};

test("the stakes are the tree's own arithmetic, read the other way", () => {
  const out = stakesFromState(structuredClone(STATE));
  assert.equal(out.rows.length, 3, "the zero row stakes nothing and is not a stake");
  assert.equal(out.totalN, 4);
  assert.equal(out.checked, 3);
  const byMark = new Map();
  for (const r of out.rows) byMark.set(r.mark, (byMark.get(r.mark) ?? 0) + r.n);
  assert.equal(byMark.get("a/one"), 3);
  assert.equal(byMark.get("b/two"), 1);
  assert.equal(byMark.get("c/three"), undefined);
  // weight goes in as n, deliberately — the breadth bonus is not reconstructible per row
  for (const r of out.rows) assert.equal(r.weight, r.n);
});

test("FALSIFIER: a DEFICIT refuses rather than guess which reading is the town", () => {
  const drifted = structuredClone(STATE);
  drifted.marks[0].stamps = 9;              // portfolios sum 3, stamps 9 — dropping rows cannot produce this
  assert.throws(() => stakesFromState(drifted), /a DEFICIT, which dropping non-positive holder rows cannot produce/);
  const orphan = structuredClone(STATE);
  orphan.marks = orphan.marks.filter((m) => m.id !== "b/two");
  assert.throws(() => stakesFromState(orphan), /no mark in the fold carries that id/);
});

test("an EXCESS is a holder the portfolio book dropped, and it is restored rather than refused", () => {
  // alex +2 and bo +1 on a/one, and a third holder who unstaked to -1: the book
  // keeps only the positive holders, the mark keeps the net. Reachable law, not drift.
  const unstaked = structuredClone(STATE);
  unstaked.marks[0].stamps = 2;             // 3 in the book, 2 on the mark
  const out = stakesFromState(unstaked);
  assert.equal(out.balanced.length, 1);
  assert.match(out.balanced[0], /^a\/one: 1 of net unstake dropped from the book, restored$/);
  const byMark = new Map();
  for (const r of out.rows) byMark.set(r.mark, (byMark.get(r.mark) ?? 0) + r.n);
  assert.equal(byMark.get("a/one"), 2, "the escrow the sweep and the gate read comes out EXACT");
  const row = out.rows.find((r) => r.holder === UNATTRIBUTED_HOLDER);
  assert.equal(row.n, -1);
  assert.equal(row.weight, -1);
  assert.doesNotMatch(row.holder, /^[a-z0-9-]+$/, "it must not be readable as a resident handle");
});

test("a clean state balances nothing — the restoration is not a silent default", () => {
  assert.deepEqual(stakesFromState(structuredClone(STATE)).balanced, []);
});

test("FALSIFIER: an empty stake picture refuses — it is not a quiet town, it is an emptied commons", () => {
  assert.throws(() => stakesFromState({ marks: [{ id: "a/one", stamps: 0 }], portfolios: {} }), /Refusing rather/);
  assert.throws(() => stakesFromState({ marks: [] }), /carries no `portfolios`/);
  assert.throws(() => stakesFromState({ portfolios: {} }), /carries no `marks`/);
});

// ── the pins: this repository's real files ───────────────────────────────────

test("[pin] the crossing rehearsal workflow holds every posture check", () => {
  const out = rehearsalPosture({ repo: ROOT });
  assert.equal(out.ok, true, out.failures.map((f) => `${f.name}: ${f.detail}`).join("\n"));
});

test("[pin] the rehearsal's stakes derive from this tree's own fold", () => {
  // DELIBERATELY NOT a strict-reconciliation assertion over the LIVE tree. This
  // suite runs after the crossing's own push as a checker, and a control that can
  // red a settlement over a town doing nothing wrong outranks its own purpose.
  // The strict reconciliation is held where a red is cheap and actionable: the
  // fixture tests above, and the rehearsal job itself, where a refusal is one
  // pull request's red check rather than the town's.
  const out = deriveRehearsalStakes(ROOT);
  assert.ok(out.rows.length > 0, "this tree records escrow");
  assert.ok(out.totalN > 0);
  const state = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8"));
  assert.equal(out.checked, state.marks.length, "every mark in the fold was looked at");
  assert.equal(out.totalN, state.marks.reduce((a, m) => a + (Number(m.stamps) || 0), 0),
    "the escrow the sweep would read equals the escrow this tree records");
});

test("[pin] the workflow the posture guards is the one the repository actually has", () => {
  const yaml = readFileSync(join(ROOT, WORKFLOW_REL), "utf8");
  assert.match(yaml, /^name: crossing rehearsal$/m, "the check's name is what a reader looks for on the pull request");
  assert.match(yaml, /tools\/rehearsal-stakes\.mjs/, "the job derives its stakes rather than taking an empty file");
  assert.match(yaml, /tools\/settlement-sweep\.mjs/, "the job runs the real sweep");
  assert.match(yaml, /tools\/harm-gate\.mjs/, "the job runs the real gate");
  assert.match(yaml, /tools\/rehearsal-posture\.mjs/, "the job asserts its own posture before it runs the tree's code");
});
