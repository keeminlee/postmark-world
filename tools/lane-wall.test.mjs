import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// lane-wall answers ONE question — is every change in this diff the PR
// author's to make? — so each case below is one way the answer can be no,
// plus the one way it is yes.

const record = ({ kind = "sited", by, tier, at, extent, body }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), "date: 2026-08-05"];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), "postmark-lane-wall-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const put = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("lane-wall.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  // alice's parcel exists on main — geometry will file marks at 110,110 under it
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's ground",
  }));
  put("WORLD/households.json", JSON.stringify({
    households: { alice: "gh:1", mallory: "gh:3" },
    logins: { "house-a": "gh:1", "house-m": "gh:3" },
  }, null, 2) + "\n");
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "main");
  git("switch", "-q", "-c", "pr-head");
  const wall = (authorId, authorLogin, baseBranch = null) => {
    try {
      const out = execFileSync(process.execPath, [
        join(repo, "tools", "lane-wall.mjs"),
        "--repo", repo, "--base", "main", "--head", "pr-head",
        "--author-id", String(authorId), "--author-login", authorLogin, "--json",
        ...(baseBranch ? ["--base-branch", baseBranch] : []),
      ], { encoding: "utf8" });
      return { ...JSON.parse(out.trim()), code: 0 };
    } catch (e) {
      return { ...JSON.parse(String(e.stdout).trim()), code: e.status };
    }
  };
  const commit = (msg) => {
    git("add", "-A");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", msg);
  };
  return { repo, git, put, wall, commit };
}

test("lane-wall: the author's own well-placed mark and note pass", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/marks/let-there-be-light/alice-parcel/porch/mark.md", record({
    by: "alice", at: { x: 110, y: 110 }, extent: { w: 4, h: 4 }, body: "a porch on her own ground",
  }));
  put("NOTES/alice.md", "Remember the blue door.\n");
  commit("alice adds a porch and a note");
  const verdict = wall(1, "alicehub");
  assert.equal(verdict.ok, true, JSON.stringify(verdict.violations ?? []));
  assert.equal(verdict.code, 0);
});

test("lane-wall: a borrowed pen is refused, and the hint names your real handles", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/marks/let-there-be-light/alice-parcel/forged/mark.md", record({
    by: "alice", at: { x: 120, y: 120 }, extent: { w: 4, h: 4 }, body: "mallory writing as alice",
  }));
  commit("mallory forges");
  const verdict = wall(3, "malloryhub");
  assert.equal(verdict.ok, false);
  assert.match(verdict.violations[0].defect, /not one of your residents/);
  assert.match(verdict.violations[0].hint, /mallory/, "the hint teaches the author their own registered handles");
});

test("lane-wall: paths outside the lane are refused (tools, canon, the registry itself)", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/households.json", JSON.stringify({ households: { mallory: "gh:1" } }) + "\n");
  put("tools/innocent.mjs", "// nothing to see\n");
  commit("mallory reaches past the lane");
  const verdict = wall(3, "malloryhub");
  assert.equal(verdict.ok, false);
  assert.equal(verdict.violations.length, 2, "both paths refused");
  for (const v of verdict.violations) assert.match(v.defect, /mark records and your own notes only/);
});

test("lane-wall: a misplaced mark is refused and the hint prints the correct path", (t) => {
  const { put, wall, commit } = fixture(t);
  // geometrically inside alice-parcel, but filed at the marks root
  put("WORLD/marks/let-there-be-light/misfiled/mark.md", record({
    by: "alice", at: { x: 130, y: 130 }, extent: { w: 4, h: 4 }, body: "right ground, wrong sketchbook",
  }));
  commit("alice misfiles");
  const verdict = wall(1, "alicehub");
  assert.equal(verdict.ok, false);
  assert.match(verdict.violations[0].defect, /geometry files this mark under alice\/alice-parcel/);
  assert.match(verdict.violations[0].hint, /alice-parcel\/misfiled\/mark\.md/, "the gate teaches the exact path");
  assert.match(verdict.violations[0].hint, /place-mark/, "and names the tool that answers first");
});

test("lane-wall: the sketchbook itself must be the author's — binding rides the logins map", (t) => {
  const { put, wall, commit } = fixture(t);
  put("WORLD/marks/let-there-be-light/alice-parcel/gate/mark.md", record({
    by: "alice", at: { x: 140, y: 140 }, extent: { w: 4, h: 4 }, body: "a gate on her own ground",
  }));
  commit("alice adds a gate");
  assert.equal(wall(1, "alicehub", "draft/house-a").ok, true, "your own sketchbook passes");
  const foreign = wall(1, "alicehub", "draft/house-m");
  assert.equal(foreign.ok, false);
  assert.match(foreign.violations[0].defect, /not yours/);
  const toMain = wall(1, "alicehub", "main");
  assert.equal(toMain.ok, false);
  assert.match(toMain.violations[0].hint, /settlement's pen/);
  const unbound = wall(1, "alicehub", "draft/nowhere");
  assert.equal(unbound.ok, false);
  assert.match(unbound.violations[0].defect, /not in the registry/);
});

test("lane-wall: an unregistered author is refused with the registry-lag hint, and a foreign note is refused", (t) => {
  const { put, wall, commit } = fixture(t);
  put("NOTES/alice.md", "not mallory's note to leave\n");
  commit("mallory writes in alice's notebook");
  const carol = wall(99, "carolhub");
  assert.equal(carol.ok, false);
  assert.match(carol.violations[0].hint, /no handles are registered|not one of your residents/);
});
