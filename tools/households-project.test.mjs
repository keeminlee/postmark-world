#!/usr/bin/env node
// households-project.test.mjs — the household key's derivation.
// Run: node --test tools/households-project.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "households-project.mjs");

// a throwaway town clone carrying just the one file the projector reads
function town(registry) {
  const dir = mkdtempSync(join(tmpdir(), "postmark-households-"));
  mkdirSync(join(dir, "tools"), { recursive: true });
  writeFileSync(join(dir, "tools/households.json"), JSON.stringify(registry, null, 2));
  return dir;
}
function project(dir) {
  return JSON.parse(execFileSync(process.execPath, [TOOL, "--town", dir, "--json"], { encoding: "utf8" }));
}

test("a household holding TWO accounts projects its residents to ONE key", () => {
  // The cadaeic shape, which is the whole reason the key is the declared slug and
  // not the credential id.
  const dir = town({
    households: {
      "cadaeic.space": {
        accounts: [{ login: "vertas-marginalia", id: 306985727 }, { login: "cadaeix-bot", id: 314099683 }],
        residents: ["vertas-marginalia", "arky"],
      },
    },
  });
  try {
    const { households } = project(dir);
    assert.equal(households["vertas-marginalia"], "cadaeic.space");
    assert.equal(households["arky"], "cadaeic.space", "two accounts, two residents, one house");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a handle in no declared household is left out — the fold reads it as solo, never as blocked", () => {
  const dir = town({ households: { "the-rookery": { accounts: [{ login: "crowandclock", id: 265401358 }], residents: ["crow", "moth"] } } });
  try {
    const { households } = project(dir);
    assert.equal(households["crow"], "the-rookery");
    assert.equal("a-brand-new-resident" in households, false, "registry lag leaves a resident ungrouped, not refused");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the registry's own invariants are ENFORCED, not assumed: a resident in two households REFUSES the projection", () => {
  const dir = town({
    households: {
      "house-one": { accounts: [{ login: "one", id: 1 }], residents: ["shared-resident"] },
      "house-two": { accounts: [{ login: "two", id: 2 }], residents: ["shared-resident"] },
    },
  });
  try {
    assert.throws(() => project(dir), (e) => {
      const err = String(e.stderr ?? "");
      assert.match(err, /REFUSING TO PROJECT/);
      assert.match(err, /"shared-resident" is declared in TWO households/);
      return true;
    }, "a household key nobody declared is worse than no key at all");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an account claimed by two households REFUSES too", () => {
  const dir = town({
    households: {
      "house-one": { accounts: [{ login: "shared", id: 99 }], residents: ["a"] },
      "house-two": { accounts: [{ login: "shared", id: 99 }], residents: ["b"] },
    },
  });
  try {
    assert.throws(() => project(dir), (e) => {
      assert.match(String(e.stderr ?? ""), /account shared \(99\) is declared in TWO households/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the projection carries no `logins` map — the PR lane asks a credential question, not a household one", () => {
  // WORLD/households.json serves two consumers at two grains: the fold wants
  // household identity (declared slug), lane-wall/settlement-sweep want to bind a
  // GitHub actor and a branch name to a household (account grain). Emitting only
  // the household map means nothing can point the lane wall at a file that answers
  // a different question than the one it is asking.
  const dir = town({ households: { h: { accounts: [{ login: "l", id: 1 }], residents: ["r"] } } });
  try {
    const out = project(dir);
    assert.equal("logins" in out, false);
    assert.equal(out.key, "declared household slug");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
