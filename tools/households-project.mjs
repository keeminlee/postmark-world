#!/usr/bin/env node
// households-project.mjs — project the TOWN's declared household registry into
// the key the fold's household law needs.
//
//   node tools/households-project.mjs --town <town clone> [--out <path>] [--json]
//
// ── WHY THIS EXISTS, AND WHAT IT IS NOT ──────────────────────────────────────
//
// The fold groups handles into households for every conflict rule — sovereignty,
// rivalry, consent. It has been reading WORLD/households.json, which keys by
// CREDENTIAL ID (`gh:306985727`). That key is wrong for household law, and the
// file is stale besides.
//
// Wrong, because the town's ruling (Keemin, 2026-08-07) is that a household is a
// HUMAN: `1 human = 1 household = N residents = up to N GitHub accounts`. A
// household may hold SEVERAL accounts. cadaeic.space holds two — vertas-marginalia
// and cadaeix-bot — so a credential-keyed grain files its two residents as
// strangers to each other, which breaks sovereignty, consent and the automatic
// same-household +1 for precisely the families the law exists to serve.
//
// Stale, because nothing refreshes it on a cadence: it carries
// `generated_at: 2026-08-07T12:58Z` and therefore predates the 2026-08-08
// consolidation harvest that declared fox-hearth and the-rookery. A copy without
// a channel is a copy that rots.
//
// So this tool derives the mapping FRESH from the authority — the town repo's own
// `tools/households.json`, the DECLARED identity registry — and keys by declared
// household SLUG (`cadaeic.space`, `the-rookery`). A handle in no declared
// household is its own household, `solo:<handle>`, exactly as before: registry lag
// must never block a new resident, only leave them ungrouped until the town knows
// them.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
//
// NOT the economy's dated key source. Household keys OVER TIME live in the stamp
// ledger's dated `registry:` lines (the tulip lesson: base registries are
// from-genesis truth, and retroactive edits turn the replay red). The town's
// `world-stake.mjs` has its own dated `householdOf` and this tool does not touch
// it. What is derived here is CURRENT-STATE household identity, which is what a
// fold of the present world asks for.
//
// NOT a replacement for WORLD/households.json. That file also carries a `logins`
// map which the PR lane (lane-wall.mjs, settlement-sweep.mjs) reads to bind a
// branch name and a GitHub actor to a household — a CREDENTIAL question, whose
// right grain is still the account. One file serving both consumers now needs two
// grains in it; this tool deliberately emits only the household map, so nothing
// can point the lane wall at a file that answers a different question than the one
// it is asking. See the report accompanying this branch.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const has = (name) => args.includes(name);

const TOWN = opt("--town", null);
const OUT = opt("--out", null);

if (!TOWN) {
  console.error(`households-project.mjs — derive the world's household key from the town's declared registry.

  node tools/households-project.mjs --town <path to a postmark town clone> [--out <file>] [--json]

The town clone is the authority (its tools/households.json). There is no default
path on purpose: this must be read from a clone whose freshness you have checked,
not from whatever copy happens to be lying around.`);
  process.exit(2);
}

const REG = join(resolve(TOWN), "tools/households.json");
if (!existsSync(REG)) {
  console.error(`no declared registry at ${REG} — is --town a postmark town clone?`);
  process.exit(2);
}

const raw = JSON.parse(readFileSync(REG, "utf8"));
const declared = raw.households ?? {};

// ── the registry's OWN invariants, enforced loudly ───────────────────────────
// The registry states these about itself ("a resident appears in at most one
// household; an account id appears in at most one household"). A projection that
// quietly picked a winner on a violation would hand the fold a household grain
// that nobody declared, so this refuses instead. The whole point of keying on a
// declared thing is that somebody declared it.
const violations = [];
const seenResident = new Map();
const seenAccount = new Map();
for (const [slug, h] of Object.entries(declared)) {
  for (const r of h.residents ?? []) {
    if (seenResident.has(r)) violations.push(`resident "${r}" is declared in TWO households: ${seenResident.get(r)} and ${slug}`);
    else seenResident.set(r, slug);
  }
  for (const a of h.accounts ?? []) {
    const key = String(a.id ?? a.login);
    if (seenAccount.has(key)) violations.push(`account ${a.login} (${a.id}) is declared in TWO households: ${seenAccount.get(key)} and ${slug}`);
    else seenAccount.set(key, slug);
  }
}
if (violations.length) {
  console.error(`REFUSING TO PROJECT — the declared registry violates its own invariants:\n`);
  for (const v of violations) console.error(`  · ${v}`);
  console.error(`\nThe household key is only as good as the declaration behind it. Fix the town's
tools/households.json (or ask the households whose lines disagree), then re-run.`);
  process.exit(1);
}

const households = Object.fromEntries([...seenResident.entries()].sort(([a], [b]) => a.localeCompare(b)));

const out = {
  generated_at: new Date().toISOString(),
  key: "declared household slug",
  source: `town tools/households.json — the DECLARED identity registry (1 human = 1 household = N residents = up to N accounts, Keemin 2026-08-07)`,
  note: "handle → declared household slug, for marks-fold.mjs's household law (sovereignty, rivalry, consent). A handle absent here folds as solo:<handle> — registry lag never blocks a resident, it only leaves them ungrouped. NOT the economy's dated key source (that is the stamp ledger's dated registry: lines) and NOT a replacement for WORLD/households.json, whose `logins` map answers a credential question at account grain for the PR lane. Regenerate with tools/households-project.mjs --town <town clone>.",
  households,
};

const text = JSON.stringify(out, null, 2) + "\n";
if (OUT) { writeFileSync(OUT, text); console.error(`projected ${Object.keys(households).length} handles into ${Object.keys(declared).length} declared households → ${OUT}`); }
if (has("--json") || !OUT) console.log(text);
