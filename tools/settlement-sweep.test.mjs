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

const record = ({ kind = "sited", by, tier = "market", at, extent, body, coords }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, `tier: ${tier}`, "date: 2026-07-28"];
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
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs", "determination.mjs", "consent.mjs"])
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
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs", "determination.mjs", "consent.mjs"])
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
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs", "determination.mjs", "consent.mjs"])
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
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs", "determination.mjs", "consent.mjs"])
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
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs", "determination.mjs", "consent.mjs"])
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
  for (const file of ["geometry.mjs", "marks-fold.mjs", "mark-lint.mjs", "determination.mjs", "consent.mjs"])
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  put("WORLD/marks/let-there-be-light/the-meadow/mark.md", record({
    by: "alice", at: { x: 1000, y: 1000 }, extent: { w: 400, h: 400 }, body: "alice's meadow",
  }));
  put("WORLD/marks/let-there-be-light/the-meadow/the-cairn/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 1010, y: 1005 }, extent: { w: 4, h: 4 },
    body: "the town's cairn",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  // the district arrives at the TOP level in this crossing; geometry puts it
  // inside the meadow, and the cairn inside it
  git("switch", "-q", "-c", "draft/founder-house");
  put("WORLD/marks/let-there-be-light/the-district/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 1010, y: 1005 }, extent: { w: 60, h: 60 },
    body: "the town's own district",
  }));
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "the district");
  git("switch", "-q", "main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([]));

  const report = settlementSweep({ repo, stakesPath });
  const rows = Object.fromEntries(report.rehomed.map((r) => [r.mark, r]));
  assert.deepEqual(Object.keys(rows).sort(), ["the-town/the-cairn", "the-town/the-district"]);
  assert.equal(rows["the-town/the-cairn"].to_path,
    "WORLD/marks/let-there-be-light/the-meadow/the-district/the-cairn",
    "the cairn's recorded path followed the district that carried it");
  assert.equal(rows["the-town/the-district"].to_path, "WORLD/marks/let-there-be-light/the-meadow/the-district");

  const state = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  assert.equal(state.errors.length, 0);
  for (const id of ["the-town/the-cairn", "the-town/the-district"])
    assert.deepEqual(state.marks.find((m) => m.id === id).at, { x: 1010, y: 1005 },
      `${id} composes where it always stood`);
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
  assert.match(execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], { cwd: repo, encoding: "utf8" }), /CLEAN/);
});
