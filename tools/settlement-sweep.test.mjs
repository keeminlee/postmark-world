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
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier, at, extent, body, coords }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), "date: 2026-07-28"];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (coords) lines.push(`coords: ${coords}`);
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
  for (const file of withTool("mark-lint.mjs"))
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
    ["house-a", "alice/alice-market", "commons"],
    ["house-a", "alice/home-garden", "home"],
    ["house-b", "bob/bob-market", "commons"],
  ].sort());
  assert.deepEqual(report.left_drafted.map((row) => [row.household, row.id]).sort(), [
    ["founder-house", "the-town/crossing-bell"],
    ["house-a", "alice/alice-sketch"],
    ["house-b", "bob/bob-sketch"],
  ].sort());
  // THE TOWN WALL (#1697). The crossing bell used to publish from here, and that
  // is the road the-town/berth's widened grant travelled. The town's own record
  // is ruled onto main by a founder's pen — in the act that also moves whatever
  // guards it — and no sketchbook admits one, a founder's sketchbook included.
  assert.match(report.left_drafted.find((row) => row.id === "the-town/crossing-bell").reason, /town wall/,
    "and the refusal names the wall rather than reading as an eligibility miss");
  assert.deepEqual(report.unpublished.map((row) => [row.household, row.id]), [
    ["house-a", "alice/old-commons"],
  ]);

  assert.equal(has("main", aHome), true);
  assert.equal(has("main", aBacked), true);
  assert.equal(has("main", bBacked), true);
  assert.equal(has("main", constitution), false, "the town's own record never arrives on main by sweep");
  assert.equal(has("draft/founder-house", constitution), true, "it stays in the drawer that drew it");
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

test("withdrawal: a branch deletion of your own published mark unpublishes at the crossing — escrow and children refuse by name (the revision family, 2026-08-19)", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "postmark-withdraw-"));
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
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's parcel",
  }));
  const gone = "WORLD/marks/let-there-be-light/alice-parcel/old-shed/mark.md";
  put(gone, record({ by: "alice", at: { x: 100, y: 100 }, extent: { w: 10, h: 10 }, body: "a shed alice no longer wants" }));
  const anchored = "WORLD/marks/let-there-be-light/anchored-market/mark.md";
  put(anchored, record({ by: "alice", at: { x: 900, y: 900 }, extent: { w: 10, h: 10 }, body: "a commons someone still backs" }));
  const parentPath = "WORLD/marks/let-there-be-light/alice-yard/mark.md";
  put(parentPath, record({ by: "alice", at: { x: 1500, y: 1500 }, extent: { w: 40, h: 40 }, body: "a yard holding a bench" }));
  const childPath = "WORLD/marks/let-there-be-light/alice-yard/the-bench/mark.md";
  put(childPath, record({ by: "alice", at: { x: 1500, y: 1500 }, extent: { w: 2, h: 2 }, body: "a bench inside the yard" }));
  put("WORLD/settlement-publications.json", JSON.stringify({
    version: 1,
    published: {
      "alice/old-shed": { household: "house-a", path: gone, class: "home" },
      "alice/anchored-market": { household: "house-a", path: anchored, class: "commons" },
    },
  }, null, 2) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  git("switch", "-q", "-c", "draft/house-a");
  rmSync(join(repo, dirname(gone)), { recursive: true, force: true });
  rmSync(join(repo, dirname(anchored)), { recursive: true, force: true });
  rmSync(join(repo, parentPath), { force: true }); // deletes the yard's OWN record; the bench stays
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house a withdraws three ways");
  git("switch", "-q", "main");

  const remote = mkdtempSync(join(tmpdir(), "postmark-withdraw-remote-"));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main", "draft/house-a");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([
    { holder: "supporter", mark: "alice/anchored-market", n: 5, weight: 10 },
  ]));
  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.withdrawn, [{ household: "house-a", id: "alice/old-shed", path: gone }],
    "the free withdrawal executes, and only it");
  assert.equal(has("main", gone), false, "the shed leaves canon");
  assert.match(report.left_drafted.find((row) => row.id === "alice/anchored-market").reason, /escrow anchors/,
    "the staked deletion refuses by the anchor's name");
  assert.equal(has("main", anchored), true, "and the anchored mark stays published");
  assert.match(report.left_drafted.find((row) => row.id === "alice/alice-yard").reason, /still stand inside/,
    "the parent deletion refuses by its children's name");
  assert.equal(has("main", parentPath), true, "the yard stays");
  assert.equal(has("main", childPath), true, "and the bench is never stranded");
  const registry = JSON.parse(readFileSync(join(repo, "WORLD", "settlement-publications.json"), "utf8"));
  assert.equal(registry.published["alice/old-shed"], undefined, "the registry lets the withdrawn mark go");
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
});

test("the authorship wall: a registered author never publishes from another household's sketchbook", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-wall-"));
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
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  // the wall's whole input: main's registry binds handles AND branch logins
  put("WORLD/households.json", JSON.stringify({
    households: { alice: "gh:1", mallory: "gh:3" },
    logins: { "house-a": "gh:1", "house-m": "gh:3" },
  }, null, 2) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  // mallory's sketchbook: one forged mark (alice's registered name), one honest
  // mark, one unverifiable stranger (carol is not in the registry)
  git("switch", "-q", "-c", "draft/house-m");
  const forged = "WORLD/marks/let-there-be-light/forged-market/mark.md";
  const honest = "WORLD/marks/let-there-be-light/own-market/mark.md";
  const stray = "WORLD/marks/let-there-be-light/stray-market/mark.md";
  put(forged, record({ by: "alice", at: { x: 500, y: 500 }, extent: { w: 10, h: 10 }, body: "signed with a borrowed pen" }));
  put(honest, record({ by: "mallory", at: { x: 700, y: 700 }, extent: { w: 10, h: 10 }, body: "mallory's own claim" }));
  put(stray, record({ by: "carol", at: { x: 900, y: 900 }, extent: { w: 10, h: 10 }, body: "an unregistered hand — status quo" }));
  git("add", "WORLD/marks");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house m sketches");
  git("switch", "-q", "main");

  const remote = mkdtempSync(join(tmpdir(), "postmark-settlement-wall-remote-"));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main", "draft/house-m");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([
    { holder: "s1", mark: "alice/forged-market", n: 5, weight: 10 },
    { holder: "s2", mark: "mallory/own-market", n: 5, weight: 10 },
    { holder: "s3", mark: "carol/stray-market", n: 5, weight: 10 },
  ]));
  const report = settlementSweep({ repo, stakesPath });

  const publishedIds = report.published.map((row) => row.id).sort();
  assert.deepEqual(publishedIds, ["carol/stray-market", "mallory/own-market"],
    "the honest mark and the unverifiable one publish; the forged one never does");
  const walled = report.left_drafted.find((row) => row.id === "alice/forged-market");
  assert.ok(walled, "the forged mark is reported, not silently dropped");
  assert.match(walled.reason, /authorship/, "the reason names the wall");
  assert.match(walled.reason, /gh:1/, "the reason names whose resident the pen belongs to");
  assert.equal(has("main", forged), false, "the borrowed pen never reaches published main");
  assert.equal(has("draft/house-m", forged), true, "the record stays in the sketchbook for its author-of-record to contest");
  assert.equal(has("main", honest), true);
  assert.equal(has("main", stray), true);
});

test("a drafted mark revised after its add still reseats — the crossing after publication replays add+revise against the published final blob (the FluffUPando edge, 2026-08-11)", (t) => {
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

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  // The drawer history the 2026-08-11 tense sweep created — and any resident
  // who edits their own draft creates too: the record is ADDED in one commit
  // and REVISED in a later one. The sweep publishes the FINAL blob to main;
  // a naive history replay then hits the earlier add against main's published
  // version (add/add, different content) one commit before the revise that
  // would have made them identical.
  const twicePath = "WORLD/marks/let-there-be-light/twice-told-market/mark.md";
  git("switch", "-q", "-c", "draft/house-a");
  put(twicePath, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "first telling" }));
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "mark: alice/twice-told-market — add");
  const finalText = record({ by: "alice", at: { x: 805, y: 805 }, extent: { w: 10, h: 10 }, body: "second telling — same mark, revised in the drawer" });
  put(twicePath, finalText);
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "revise: alice/twice-told-market");
  git("switch", "-q", "main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([
    { holder: "supporter-a", mark: "alice/twice-told-market", n: 5, weight: 10 },
  ]));

  const report = settlementSweep({ repo, stakesPath });

  assert.ok(report.published.find((row) => row.id === "alice/twice-told-market"),
    "the revised mark publishes");
  assert.equal(readFileSync(join(repo, twicePath), "utf8"), finalText,
    "main carries the FINAL telling, not the first");
  const receipt = report.rebased.find((row) => row.branch === "draft/house-a");
  assert.ok(receipt, "the sketchbook was reseated at all");
  assert.notEqual(receipt.mode, undefined);
  // The reseat is pure transport: the drawer's final word survives it
  // byte-for-byte, and the published record leaves no delta for the next
  // crossing to re-stage.
  const branchBlob = git("show", `draft/house-a:${twicePath}`);
  assert.equal(branchBlob, finalText, "the drawer's final word is byte-preserved through the reseat");
  const delta = git("diff", "--name-only", "main", "draft/house-a", "--", twicePath).trim();
  assert.equal(delta, "", "a published record leaves no residual delta on the reseated sketchbook");
});

test("the re-home pass: a resident's new claim grows around the town's reach, and the sweep re-points the paper instead of refusing the crossing", (t) => {
  // The live shape of § the tier binding. `the-town/the-reach` stands on open
  // ground, filed under the root because nothing contained it. Alice then
  // claims a meadow around it — perfectly lawful, and it makes the reach's
  // directory edge stop naming its tightest container. The reach outranks the
  // meadow, so it is framed by the world and re-pointing the edge costs
  // nothing. The crossing must publish the meadow AND move the paper, in two
  // readable commits, without moving a metre of ground.
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-rehome-"));
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
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  // the relative frame, declared on the record that IS the frame — without it
  // the tree is v2 absolute and the re-framing half of this is untested
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  const reachPath = "WORLD/marks/let-there-be-light/the-reach/mark.md";
  put(reachPath, record({
    by: "the-town", tier: "constitution", at: { x: 1000, y: 1000 }, extent: { w: 100, h: 20 },
    body: "a reach of the town's own river",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  git("switch", "-q", "-c", "draft/house-a");
  const meadowPath = "WORLD/marks/let-there-be-light/the-meadow/mark.md";
  put(meadowPath, record({ by: "alice", at: { x: 1000, y: 1000 }, extent: { w: 400, h: 400 }, body: "alice's meadow" }));
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house a claims a meadow");
  git("switch", "-q", "main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([{ holder: "s1", mark: "alice/the-meadow", n: 5, weight: 10 }]));

  const reachAt = () => JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"))
    .marks.find((m) => m.id === "the-town/the-reach").at;
  const before = reachAt();
  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.published.map((row) => row.id), ["alice/the-meadow"],
    "the claim publishes — a lawful mark is never bounced for the paper it disturbs");
  assert.deepEqual(report.rehomed.map((row) => [row.mark, row.from_parent, row.to_parent]),
    [["the-town/the-reach", null, "alice/the-meadow"]]);

  const moved = "WORLD/marks/let-there-be-light/the-meadow/the-reach/mark.md";
  assert.equal(has("main", moved), true, "the reach is filed inside the meadow now");
  assert.equal(has("main", reachPath), false, "and no longer at the top");

  // THE GROUND DID NOT MOVE — the whole claim of the commit message, checked
  // against the re-folded world rather than asserted.
  assert.deepEqual(reachAt(), before, "the reach composes to exactly the position it held");
  assert.deepEqual(reachAt(), { x: 1000, y: 1000 });
  assert.match(readFileSync(join(repo, moved), "utf8"), /^at: \{ x: 1000, y: 1000 \}$/m,
    "and it still carries world numbers, because the meadow does not bind it");

  // TWO READABLE COMMITS, the repair ahead of the settlement it made room for
  const log = git("log", "--format=%s", "-3").split(/\r?\n/);
  assert.match(log[0], /^settlement: sweep 1 published/);
  assert.equal(log[1], "re-home: the-town/the-reach from (root) to alice/the-meadow — the paper moved, the ground did not");
  assert.equal(git("show", "--name-only", "--format=", "HEAD~1").trim().split(/\r?\n/).every((p) => /the-reach/.test(p)), true,
    "the re-home commit carries the re-home and nothing else");

  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
  const lint = execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], { cwd: repo, encoding: "utf8" });
  assert.match(lint, /CLEAN/, "and the tree the crossing leaves behind has no re-home standing");
});

test("the re-home pass re-frames a mark whose new parent DOES bind it, so the ground still does not move", (t) => {
  // The case a plain `git mv` gets wrong. The cairn outranks the meadow it is
  // filed under (world-framed, world numbers), but its tightest container turns
  // out to be a CONSTITUTION district — which binds it. After the move the very
  // same digits mean somewhere else, so the pass must re-write them.
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-reframe-"));
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
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  // Alice's meadow, with the town's district correctly filed inside it (the
  // district outranks the meadow, so it carries WORLD numbers), and the town's
  // cairn filed beside the district rather than in it — also world-framed,
  // because the meadow does not bind it either.
  put("WORLD/marks/let-there-be-light/the-meadow/mark.md", record({
    by: "alice", at: { x: 1000, y: 1000 }, extent: { w: 400, h: 400 }, body: "alice's meadow",
  }));
  put("WORLD/marks/let-there-be-light/the-meadow/the-district/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 1010, y: 1005 }, extent: { w: 60, h: 60 },
    body: "the town's own district",
  }));
  const cairnPath = "WORLD/marks/let-there-be-light/the-meadow/the-cairn/mark.md";
  put(cairnPath, record({
    by: "the-town", tier: "constitution", at: { x: 1010, y: 1005 }, extent: { w: 4, h: 4 },
    body: "the town's cairn, framed by the world",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([]));

  // The cairn's tightest container is the district, not the meadow — so it
  // re-homes into a mark of EQUAL tier, which binds it. World numbers become
  // an offset, or the cairn lands 1010,1005 further out than it stands.
  const report = settlementSweep({ repo, stakesPath });
  assert.deepEqual(report.rehomed.map((row) => [row.mark, row.from_parent, row.to_parent]),
    [["the-town/the-cairn", "alice/the-meadow", "the-town/the-district"]]);
  const receipt = report.rehomed[0];
  assert.ok(receipt.reframed, "the pass knew the binding changed and re-framed the record");
  assert.deepEqual(receipt.reframed.origin, { x: 1010, y: 1005 }, "framed on the district that now binds it");
  assert.deepEqual(receipt.reframed.was, { x: 1010, y: 1005 }, "it used to carry world numbers");
  assert.deepEqual(receipt.reframed.at, { x: 0, y: 0 }, "and now carries the offset that means the same place");

  const moved = "WORLD/marks/let-there-be-light/the-meadow/the-district/the-cairn/mark.md";
  assert.match(readFileSync(join(repo, moved), "utf8"), /^at: \{ x: 0, y: 0 \}$/m);
  const state = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  assert.deepEqual(state.marks.find((m) => m.id === "the-town/the-cairn").at, { x: 1010, y: 1005 },
    "THE GROUND DID NOT MOVE — a plain git mv here would have left the cairn at 2020,2010");
  assert.equal(state.errors.length, 0);
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
  assert.match(execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], { cwd: repo, encoding: "utf8" }), /CLEAN/);
});

test("nested re-homes: a mark re-homed INTO a directory that then moves itself still ends up where the law says, and the paths the commits stage are the live ones", (t) => {
  // Found by building the fixture above and watching it fail. Deepest-first
  // ordering keeps a child from being carried off by a parent that is also
  // leaving — but it does NOT stop the reverse: the cairn moves into the
  // district, and then the district moves into the meadow, carrying the cairn
  // with it. The tree ends up right either way; what breaks is the bookkeeping,
  // because every path recorded before that second move points at a directory
  // that no longer exists, and `git add` fails on a pathspec matching nothing.
  //
  // The district here is also PUBLISHED in the same crossing, so its old path
  // exists in neither HEAD nor the final worktree — the other half of the same
  // bug.
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-nested-"));
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
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  // The meadow is anchored ON THE WORLD ORIGIN, and that is load-bearing rather
  // than decorative. A resident's mark can never OUTRANK another resident's
  // (standingRank knows two ranks, constitution and market), so the only door
  // left open to a resident's re-home is the lint's second one: the frame the
  // mark would be read in does not change. A container sitting on the origin
  // keeps it, so the district below moves as paper — the same door the lint's
  // own comment describes for a top-level mark a new claim grew around.
  put("WORLD/marks/let-there-be-light/the-meadow/mark.md", record({
    by: "alice", at: { x: 0, y: 0 }, extent: { w: 4000, h: 4000 }, body: "alice's meadow",
  }));
  put("WORLD/marks/let-there-be-light/the-meadow/the-cairn/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 1010, y: 1005 }, extent: { w: 4, h: 4 },
    body: "the town's cairn",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  // The district arrives at the TOP level in this crossing; geometry puts it
  // inside the meadow, and the cairn inside it. It is a RESIDENT's district
  // because of the town wall (#1697): nothing signed `the-town` publishes from a
  // sketchbook any more, so a town-signed district here would simply never
  // land and the nested move under test would never happen. The subject is the
  // bookkeeping of a move that carries another move, which is indifferent to
  // whose claim it is.
  git("switch", "-q", "-c", "draft/house-a");
  put("WORLD/marks/let-there-be-light/the-district/mark.md", record({
    by: "alice", at: { x: 1010, y: 1005 }, extent: { w: 60, h: 60 },
    body: "alice's district",
  }));
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "the district");
  git("switch", "-q", "main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([{ holder: "s1", mark: "alice/the-district", n: 5, weight: 10 }]));

  const report = settlementSweep({ repo, stakesPath });
  const rows = Object.fromEntries(report.rehomed.map((r) => [r.mark, r]));
  assert.deepEqual(Object.keys(rows).sort(), ["alice/the-district", "the-town/the-cairn"]);
  assert.equal(rows["the-town/the-cairn"].to_path,
    "WORLD/marks/let-there-be-light/the-meadow/the-district/the-cairn",
    "the cairn's recorded path followed the district that carried it");
  assert.equal(rows["alice/the-district"].to_path, "WORLD/marks/let-there-be-light/the-meadow/the-district");

  const state = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  assert.equal(state.errors.length, 0);
  for (const id of ["the-town/the-cairn", "alice/the-district"])
    assert.deepEqual(state.marks.find((m) => m.id === id).at, { x: 1010, y: 1005 },
      `${id} composes where it always stood`);
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
  assert.match(execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], { cwd: repo, encoding: "utf8" }), /CLEAN/);
});

// ── #1697, the supersession class: four falsifiers ──────────────────────────
//
// Two instances put this on the record. fox-hearth (S30 era): a draft replay
// resurrected coordinates main had amended. the-town/berth (2026-08-18): the
// first box sweep, 914ddc26, resurrected a stale draft copy and silently
// WIDENED a constitutional grant — `say for: berth` lost its `for:`, and an
// absent `for:` reads as RESIDENT under LOGOS. The full suite was green
// throughout both.
//
// The mechanism is one line: markDelta diffed the branch against CURRENT main
// rather than against the branch's own merge-base, so a mark MAIN amended after
// the branch was cut read as a change the BRANCH was making — and the sweep
// published the branch's stale copy over the amendment. The second face is the
// authorship wall standing down for an author the registry cannot bind, and
// `the-town` is bound to no household by construction.
//
// These four are the gate on the fix. They share a fixture shape the older
// tests build inline; it is factored here rather than copied four more times.
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
  const blob = (ref, path) => git("show", `${ref}:${path.replace(/\\/g, "/")}`);
  // Every commit re-folds first, the way a real writer's does: a fixture whose
  // world-state.json lags its own marks tests a tree no crossing ever sees.
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
    repo, git, put, blob, commit, stakesPath,
    stakes: (rows) => writeFileSync(stakesPath, JSON.stringify(rows)),
    sweep: () => settlementSweep({ repo, stakesPath }),
    state: () => JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8")),
  };
}

test("FALSIFIER 1 (fox-hearth's shape): a sketchbook's stale UNCHANGED copy never overwrites the amendment main made after it was cut", (t) => {
  const c = crossing(t, "supersession-stale");
  const hearth = "WORLD/marks/let-there-be-light/the-fox-hearth/mark.md";
  c.put(hearth, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "the fox hearth" }));
  c.commit("published main");

  // The sketchbook is cut here and never touches the hearth again.
  c.git("branch", "draft/house-a");

  // Main amends the hearth AFTER the cut — a founder's correction, a re-home's
  // re-framing, a prior crossing: main is the amender either way.
  const amended = record({ by: "alice", at: { x: 900, y: 900 }, extent: { w: 10, h: 10 }, body: "the fox hearth, moved by the town's own hand" });
  c.put(hearth, amended);
  c.commit("main amends the hearth");

  // Escrow, so the ONLY thing that can stop this publishing is supersession.
  c.stakes([{ holder: "s1", mark: "alice/the-fox-hearth", n: 5, weight: 10 }]);
  const report = c.sweep();

  assert.equal(report.published.some((row) => row.id === "alice/the-fox-hearth"), false,
    "the sketchbook proposed nothing about this mark, so the crossing publishes nothing for it");
  assert.equal(c.blob("main", hearth), amended,
    "main's amendment survives the sweep BYTE-IDENTICAL — this is the assertion the class exists for");
  assert.deepEqual(c.state().marks.find((m) => m.id === "alice/the-fox-hearth").at, { x: 900, y: 900 },
    "and the folded world stands where main put it, not where the drawer remembers");
  const row = report.left_drafted.find((r) => r.id === "alice/the-fox-hearth" || /fox-hearth/.test(r.path));
  assert.ok(row, "the crossing reports the superseded copy rather than passing over it in silence");
  assert.match(row.reason, /supersession/, "and the reason names supersession");
});

test("FALSIFIER 2 (the berth's shape): a CHANGED copy of a town-owned mark never publishes from a sketchbook, whatever the registry can bind", (t) => {
  const c = crossing(t, "supersession-townwall");
  // The live condition exactly: the registry binds the household's login and
  // its resident, and does NOT bind `the-town` — so the authorship wall reads
  // an unverifiable author and stands down, which is how the berth's grant got
  // through. The town wall must not inherit that courtesy.
  c.put("WORLD/households.json", JSON.stringify({
    households: { alice: "gh:1" }, logins: { "house-a": "gh:1" },
  }, null, 2) + "\n");
  const berth = "WORLD/marks/let-there-be-light/berth/mark.md";
  // Body text stands in for the grant's `for:` — the widening in the record was
  // one field on an actions: line; what the crossing has to refuse is the whole
  // class of a sketchbook re-writing the town's own text.
  const ruled = record({
    by: "the-town", tier: "constitution", at: { x: 500, y: 500 }, extent: { w: 50, h: 40 },
    body: "a berth may say, for: berth",
  });
  c.put(berth, ruled);
  c.commit("published main");

  c.git("switch", "-q", "-c", "draft/house-a");
  c.put(berth, record({
    by: "the-town", tier: "constitution", at: { x: 500, y: 500 }, extent: { w: 50, h: 40 },
    body: "a berth may say",
  }));
  c.commit("house a widens the grant in its own drawer");
  c.git("switch", "-q", "main");

  const report = c.sweep();

  assert.equal(report.published.some((row) => row.id === "the-town/berth"), false,
    "the town's own record never publishes from a household's sketchbook");
  const row = report.left_drafted.find((r) => r.id === "the-town/berth");
  assert.ok(row, "the refusal is reported, not silently dropped");
  assert.match(row.reason, /town wall/, "and the reason names the wall");
  assert.equal(c.blob("main", berth), ruled,
    "main's ruled text survives BYTE-IDENTICAL — the widened copy stays in the drawer");
  assert.equal(c.git("show", `draft/house-a:${berth}`).includes("for: berth"), false,
    "the sketchbook keeps its own version for its author-of-record to contest");
});

test("FALSIFIER 3 (the control): a resident's genuine edit of their own mark publishes exactly as it did before", (t) => {
  // The non-regression, and it is green on BOTH sides of the fix by design. A
  // falsifier set with no green control cannot tell a fix from a padlock.
  const c = crossing(t, "supersession-legit");
  const stall = "WORLD/marks/let-there-be-light/the-market-stall/mark.md";
  c.put(stall, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "first telling" }));
  c.commit("published main");

  c.git("switch", "-q", "-c", "draft/house-a");
  const revised = record({ by: "alice", at: { x: 820, y: 820 }, extent: { w: 10, h: 10 }, body: "alice's own second telling" });
  c.put(stall, revised);
  c.commit("house a revises its own stall");
  c.git("switch", "-q", "main");

  c.stakes([{ holder: "s1", mark: "alice/the-market-stall", n: 5, weight: 10 }]);
  const report = c.sweep();

  assert.deepEqual(report.published.map((row) => row.id), ["alice/the-market-stall"]);
  assert.equal(c.blob("main", stall), revised, "the resident's word lands on main byte-for-byte");
  assert.deepEqual(c.state().marks.find((m) => m.id === "alice/the-market-stall").at, { x: 820, y: 820 });
  assert.equal(c.git("diff", "--name-only", "main", "draft/house-a", "--", stall).trim(), "",
    "and the published record leaves no delta on the reseated sketchbook");
});

test("FALSIFIER 4 (the both-edited edge): when main and the sketchbook both moved a mark, the crossing picks NO winner", (t) => {
  const c = crossing(t, "supersession-both");
  const well = "WORLD/marks/let-there-be-light/the-well/mark.md";
  c.put(well, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "the well" }));
  c.commit("published main");

  c.git("switch", "-q", "-c", "draft/house-a");
  c.put(well, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "the well, as the drawer has it" }));
  c.commit("house a revises the well");
  c.git("switch", "-q", "main");

  const amended = record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "the well, as main has it" });
  c.put(well, amended);
  c.commit("main amends the well after the sketchbook's base");

  c.stakes([{ holder: "s1", mark: "alice/the-well", n: 5, weight: 10 }]);
  const report = c.sweep();

  assert.equal(report.published.some((row) => row.id === "alice/the-well"), false,
    "a contested mark is not a settlement admission");
  const row = report.left_drafted.find((r) => r.id === "alice/the-well");
  assert.ok(row, "the contest is reported");
  assert.match(row.reason, /rebase and re-affirm/,
    "and the reason tells the resident what to do about it");
  assert.equal(c.blob("main", well), amended, "nothing of main's was overwritten");
  assert.equal(c.git("show", `draft/house-a:${well}`).includes("as the drawer has it"), true,
    "and nothing of the drawer's was destroyed");
});
