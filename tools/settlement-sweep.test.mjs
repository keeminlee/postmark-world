import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier = "market", at, extent, body }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, `tier: ${tier}`, "date: 2026-07-28"];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

test("settlement publishes/keeps/unpublishes per household, then rebases every sketchbook", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const put = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  const has = (ref, path) => {
    try { git("cat-file", "-e", `${ref}:${path}`); return true; } catch { return false; }
  };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs"])
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's parcel",
  }));
  put("WORLD/marks/let-there-be-light/bob-parcel/mark.md", record({
    kind: "parcel", by: "bob", at: { x: 400, y: 400 }, extent: { w: 100, h: 100 }, body: "bob's parcel",
  }));
  const oldPath = "WORLD/marks/let-there-be-light/old-commons/mark.md";
  put(oldPath, record({
    by: "alice", at: { x: 1000, y: 1000 }, extent: { w: 10, h: 10 }, body: "a formerly backed commons",
  }));
  const foundingPath = "WORLD/marks/let-there-be-light/founding-commons/mark.md";
  put(foundingPath, record({
    by: "founder", at: { x: 1200, y: 1200 }, extent: { w: 10, h: 10 }, body: "the founding estate stays",
  }));
  put("WORLD/settlement-publications.json", JSON.stringify({
    version: 1,
    published: {
      "alice/old-commons": { household: "house-a", path: oldPath, class: "commons" },
    },
  }, null, 2) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  git("switch", "-q", "-c", "draft/house-a");
  const aHome = "WORLD/marks/let-there-be-light/alice-parcel/home-garden/mark.md";
  const aBacked = "WORLD/marks/let-there-be-light/alice-market/mark.md";
  const aPrivate = "WORLD/marks/let-there-be-light/alice-sketch/mark.md";
  put(aHome, record({ by: "alice", at: { x: 100, y: 100 }, extent: { w: 10, h: 10 }, body: "a sovereign home garden" }));
  put(aBacked, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons" }));
  put(aPrivate, record({ by: "alice", at: { x: 850, y: 850 }, extent: { w: 10, h: 10 }, body: "an unstaked sketch" }));
  git("add", "WORLD/marks");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house a sketches");

  git("switch", "-q", "main");
  git("switch", "-q", "-c", "draft/house-b");
  const bBacked = "WORLD/marks/let-there-be-light/bob-market/mark.md";
  const bPrivate = "WORLD/marks/let-there-be-light/bob-sketch/mark.md";
  put(bBacked, record({ by: "bob", at: { x: 1400, y: 1400 }, extent: { w: 10, h: 10 }, body: "bob's backed commons" }));
  put(bPrivate, record({ by: "bob", at: { x: 1450, y: 1450 }, extent: { w: 10, h: 10 }, body: "bob's private sketch" }));
  git("add", "WORLD/marks");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house b sketches");
  git("switch", "-q", "main");
  git("branch", "draft/house-empty");
  git("switch", "-q", "-c", "draft/founder-house");
  const constitution = "WORLD/marks/let-there-be-light/crossing-bell/mark.md";
  put(constitution, record({
    by: "the-town", tier: "constitution", at: { x: 2000, y: 2000 }, extent: { w: 10, h: 10 }, body: "the crossing bell",
  }));
  git("add", constitution);
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "founder constitution draft");
  git("switch", "-q", "main");

  const remote = mkdtempSync(join(tmpdir(), "postmark-settlement-remote-"));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main", "draft/house-a", "draft/house-b", "draft/house-empty", "draft/founder-house");
  git("branch", "-D", "draft/house-b");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([
    { holder: "supporter-a", mark: "alice/alice-market", n: 5, weight: 10 },
    { holder: "supporter-b", mark: "bob/bob-market", n: 2, weight: 7 },
  ]));
  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.published.map((row) => [row.household, row.id, row.class]).sort(), [
    ["founder-house", "the-town/crossing-bell", "constitution"],
    ["house-a", "alice/alice-market", "commons"],
    ["house-a", "alice/home-garden", "home"],
    ["house-b", "bob/bob-market", "commons"],
  ].sort());
  assert.deepEqual(report.left_drafted.map((row) => [row.household, row.id]).sort(), [
    ["house-a", "alice/alice-sketch"],
    ["house-b", "bob/bob-sketch"],
  ].sort());
  assert.deepEqual(report.unpublished.map((row) => [row.household, row.id]), [
    ["house-a", "alice/old-commons"],
  ]);

  assert.equal(has("main", aHome), true);
  assert.equal(has("main", aBacked), true);
  assert.equal(has("main", bBacked), true);
  assert.equal(has("main", constitution), true);
  assert.equal(has("main", aPrivate), false);
  assert.equal(has("main", bPrivate), false);
  assert.equal(has("main", oldPath), false);
  assert.equal(has("main", foundingPath), true, "unregistered founding estate is never stripped");

  assert.equal(has("draft/house-a", aPrivate), true);
  assert.equal(has("draft/house-a", oldPath), true);
  assert.equal(has("draft/house-a", aHome), true, "published main remains beneath the rebased sketchbook");
  assert.equal(git("diff", "--name-only", "main", "draft/house-a", "--", aHome, aBacked).trim(), "",
    "published marks leave the draft delta");
  assert.match(git("diff", "--name-only", "main", "draft/house-a"), /alice-sketch/);
  assert.match(git("diff", "--name-only", "main", "draft/house-a"), /old-commons/);
  assert.match(git("diff", "--name-only", "main", "draft/house-b"), /bob-sketch/);

  const mainSha = git("rev-parse", "main").trim();
  for (const branch of ["draft/founder-house", "draft/house-a", "draft/house-b", "draft/house-empty"])
    assert.equal(git("merge-base", "main", branch).trim(), mainSha, `${branch} is rebased on settled main`);
  assert.equal(git("rev-parse", "draft/house-empty").trim(), mainSha,
    "content-identical sketchbook is reset directly to settled main");
  assert.equal(report.rebased.find((row) => row.branch === "draft/house-empty")?.mode, "reset",
    "clean sketchbook takes the update-ref fast path");
  assert.equal(report.rebased.find((row) => row.branch === "draft/house-a")?.mode, "rebase",
    "sketchbook carrying live drafts takes the true rebase path");

  const state = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  assert.equal(state.errors.length, 0);
  assert.equal(state.marks.some((mark) => mark.id === "alice/alice-market"), true);
  assert.equal(state.marks.some((mark) => mark.id === "alice/old-commons"), false);
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
});
