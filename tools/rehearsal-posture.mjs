#!/usr/bin/env node
// rehearsal-posture.mjs — THE REHEARSAL CANNOT WRITE, READ OFF THE FILE THAT
// CONFIGURES IT.
//
//   node tools/rehearsal-posture.mjs [--workflow <path>] [--env] [--json]
//
// The crossing rehearsal runs a settlement over a pull request's own tree. That
// is the whole value and the whole danger: a job that runs an untrusted tree's
// code must not be able to reach anything the tree could ask it to reach. Every
// claim in `crossing-rehearsal.yml`'s SECURITY paragraph is a sentence in a
// comment, and a sentence in a comment is worth nothing — three copies of a
// promise are one promise, copied. So the promise is READ OFF THE FILE.
//
// SEVEN CHECKS, all over the one file that decides what the job can do, plus
// the two files that decide what the job's tools consume:
//
//   1. trigger      — `pull_request`, and the string `pull_request_target`
//                     appears nowhere. `pull_request_target` runs with the BASE
//                     repository's token and secrets while checking out the
//                     pull request's code, which is the one combination that
//                     would turn this job into a write pen for anybody who can
//                     open a pull request.
//   2. permissions  — a top-level `permissions:` block granting exactly
//                     `contents: read`. Absent, it inherits whatever the
//                     repository's default is, and a repository default is not
//                     a promise this file makes.
//   3. secrets      — no `secrets.` reference. There is nothing here to unlock.
//   4. verbs        — no `git push`, `git tag`, `git remote add|set-url`, and no
//                     `gh` invocation. The sweep's own header says it never
//                     pushes; this holds the JOB to the same, so a future step
//                     cannot quietly do what the tool declines to.
//   5. env          — no `env:` block anywhere in the file. The job hands its
//                     tools nothing, which is the only claim about env that is
//                     cheap to keep true.
//   6. consumers    — the env keys `settlement-sweep.mjs` and `harm-gate.mjs`
//                     actually read are a subset of a NAMED list. This is the
//                     half check 5 cannot do alone: "the job sets nothing" is
//                     only a security property if nothing it runs reads
//                     something the runner already carries. Measured at write
//                     time: the sweep reads BOT_NAME and BOT_EMAIL (git identity
//                     fallbacks, harmless), the gate reads nothing. A new read
//                     appearing on either side reds this and asks a person.
//   7. weight       — `harm-gate.mjs` reads no `weight`. THIS ONE IS NOT ABOUT
//                     SECURITY and it is here because it is about this
//                     rehearsal's honesty: the stakes are rebuilt from
//                     `WORLD/world-state.json`, which records escrow per holder
//                     exactly and the breadth bonus only per mark, so the rows
//                     carry `weight = n` and 38 marks' bonus (255 weight on
//                     world main e3cf2b37) is not reproduced. No gate check
//                     reads weight today, so the verdict is sound. The day one
//                     does, this goes red and the limit is a finding rather
//                     than a wrong answer nobody notices. See
//                     `tools/rehearsal-stakes.mjs` § WHAT IT DOES NOT REPRODUCE.
//
// `--env` adds an eighth, which only means anything inside the job: a named
// deny-list of store and write keys must be absent from the live environment.
// It is off by default because on a developer's box it would fail for reasons
// that say nothing about the job.
//
// Exit 0 is the posture held. Exit 1 is a posture broken, named.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

export const WORKFLOW_REL = ".github/workflows/crossing-rehearsal.yml";

/**
 * The env keys the rehearsal's own tools may read. Derived by reading the
 * tools, not by remembering them: anything outside this set must be argued for
 * by a person before the job hands an untrusted tree's code near it.
 */
export const ALLOWED_TOOL_ENV = ["BOT_EMAIL", "BOT_NAME"];

/** Keys whose presence in the job would mean it can reach a store or a pen. */
export const DENIED_RUNTIME_ENV = [
  /^DATABASE_URL$/, /^PG[A-Z]*$/, /^WORLD2_/, /^POSTMARK_/, /^SETTLEMENT_/,
  /^TOWN_CLONE$/, /^WORLD_CLONE$/, /^OFFICE_/, /_TOKEN$/, /_SECRET$/, /^AWS_/, /^SSH_/,
];

/** `process.env.X` and `process.env["X"]` reads in a source file. */
export function envReads(source) {
  const keys = new Set();
  for (const m of source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) keys.add(m[1]);
  for (const m of source.matchAll(/process\.env\[\s*["'`]([^"'`]+)["'`]\s*\]/g)) keys.add(m[1]);
  return [...keys].sort();
}

/** Comment lines do not configure anything; a verb inside one is prose. */
function code(yaml) {
  return yaml.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join("\n");
}

export function rehearsalPosture({ repo = ROOT, workflow = WORKFLOW_REL, env = null } = {}) {
  const failures = [];
  const fail = (name, detail) => failures.push({ name, detail });

  const workflowPath = resolve(repo, workflow);
  if (!existsSync(workflowPath)) {
    return { ok: false, checks: [], failures: [{ name: "workflow", detail: `${workflow} does not exist — this tool asserts a posture for a job that is not here` }] };
  }
  const yaml = readFileSync(workflowPath, "utf8");
  const body = code(yaml);

  // 1 · trigger
  if (/pull_request_target/.test(yaml)) {
    fail("trigger", `${workflow} names pull_request_target. That trigger runs with the base repository's token and `
      + `secrets while checking out the pull request's code — the job would become a write pen for anyone who can `
      + `open a pull request. Even in a comment: this check reads the whole file on purpose, because the cheapest `
      + `way for it to arrive is a copied line.`);
  }
  if (!/^on:\s*$/m.test(body) || !/^\s{2}pull_request:\s*$/m.test(body)) {
    fail("trigger", `${workflow} does not declare an \`on:\` block with \`pull_request:\` — this tool cannot tell what runs this job`);
  }

  // 2 · permissions
  const perms = body.match(/^permissions:\s*\n((?:[ \t]+\S.*\n?)+)/m);
  if (!perms) {
    fail("permissions", `${workflow} declares no top-level \`permissions:\` block, so the job inherits the repository default. `
      + `A repository default is a setting someone can change without touching this file; the posture must be stated here.`);
  } else {
    const granted = [...perms[1].matchAll(/^\s+([a-z-]+):\s*(\S+)\s*$/gm)].map(([, k, v]) => `${k}: ${v}`);
    if (granted.length !== 1 || granted[0] !== "contents: read") {
      fail("permissions", `${workflow} grants ${granted.length ? granted.join(", ") : "(nothing readable)"} — the rehearsal needs `
        + `exactly \`contents: read\` and must hold nothing else`);
    }
  }

  // 3 · secrets
  if (/secrets\./.test(body)) fail("secrets", `${workflow} references a secret. This job runs an untrusted tree's code; there is nothing here to unlock.`);

  // 4 · verbs
  for (const [verb, re] of [
    ["git push", /git\s+push\b/], ["git tag", /git\s+tag\b/],
    ["git remote add", /git\s+remote\s+add\b/], ["git remote set-url", /git\s+remote\s+set-url\b/],
    ["gh", /(^|[\s|;&(])gh\s+[a-z]/m],
  ]) if (re.test(body)) fail("verbs", `${workflow} runs \`${verb}\`. The rehearsal publishes nothing: the sweep's own header says it never pushes, and the job must not be able to do what the tool declines to.`);

  // 5 · env block
  if (/^\s*env:\s*$/m.test(body)) fail("env", `${workflow} declares an \`env:\` block. The job hands its tools nothing — that is the only claim about env that stays true without anyone maintaining it.`);

  // 6 · consumers — read the files that consume env, not the memory of them
  for (const rel of ["tools/settlement-sweep.mjs", "tools/harm-gate.mjs"]) {
    const p = join(repo, rel);
    if (!existsSync(p)) { fail("consumers", `${rel} is not in this tree — the rehearsal runs it and this check cannot read it`); continue; }
    const extra = envReads(readFileSync(p, "utf8")).filter((k) => !ALLOWED_TOOL_ENV.includes(k));
    if (extra.length) {
      fail("consumers", `${rel} now reads ${extra.join(", ")} from the environment. The rehearsal sets no env, so these would come `
        + `from the runner itself, next to an untrusted tree's code. Decide deliberately whether the rehearsal may run this tool, `
        + `then add the key to ALLOWED_TOOL_ENV with the reason.`);
    }
  }

  // 7 · weight — the honesty check, not a security one
  {
    const p = join(repo, "tools", "harm-gate.mjs");
    if (existsSync(p) && /\bweight\b/.test(readFileSync(p, "utf8"))) {
      fail("weight", `tools/harm-gate.mjs now reads \`weight\`. The rehearsal feeds the sweep stakes rebuilt from `
        + `WORLD/world-state.json, whose portfolios carry \`n\` exactly and no per-row breadth bonus, so every row goes in at `
        + `\`weight = n\`. A gate check that reads weight would be measuring a column this rehearsal does not reproduce, and `
        + `its verdict would stop meaning what the check's name says. See tools/rehearsal-stakes.mjs § WHAT IT DOES NOT REPRODUCE.`);
    }
  }

  // 8 · the live environment, only when asked
  if (env) {
    const present = Object.keys(env).filter((k) => DENIED_RUNTIME_ENV.some((re) => re.test(k)));
    if (present.length) fail("runtime-env", `the environment carries ${present.sort().join(", ")} — a store or a pen is in reach of this job`);
  }

  const names = ["trigger", "permissions", "secrets", "verbs", "env", "consumers", "weight", ...(env ? ["runtime-env"] : [])];
  const checks = names.map((name) => ({ name, ok: !failures.some((f) => f.name === name), rows: failures.filter((f) => f.name === name).map((f) => f.detail) }));
  return { ok: failures.length === 0, workflow, checks, failures };
}

function main(argv) {
  const opt = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const out = rehearsalPosture({
    repo: resolve(opt("--repo", ROOT)),
    workflow: opt("--workflow", WORKFLOW_REL),
    env: argv.includes("--env") ? process.env : null,
  });
  for (const c of out.checks) console.error(`rehearsal-posture: ${c.ok ? "ok   " : "BROKEN"} ${c.name}${c.rows.map((r) => `\n    ${r}`).join("")}`);
  console.error(`rehearsal-posture: ${out.ok ? "the rehearsal cannot write" : `${out.failures.length} broken`} — ${out.workflow}`);
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main(process.argv.slice(2));
