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

const record = ({ kind = "sited", by, tier, at, extent, body, coords, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
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
  assert.equal(has("draft/founder-house", constitution), true, "it stays in the sketchbook that drew it");
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

  // The sketchbook history the 2026-08-11 tense sweep created — and any resident
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
  const finalText = record({ by: "alice", at: { x: 805, y: 805 }, extent: { w: 10, h: 10 }, body: "second telling — same mark, revised in the sketchbook" });
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
  // The reseat is pure transport: the sketchbook's final word survives it
  // byte-for-byte, and the published record leaves no delta for the next
  // crossing to re-stage.
  const branchBlob = git("show", `draft/house-a:${twicePath}`);
  assert.equal(branchBlob, finalText, "the sketchbook's final word is byte-preserved through the reseat");
  const delta = git("diff", "--name-only", "main", "draft/house-a", "--", twicePath).trim();
  assert.equal(delta, "", "a published record leaves no residual delta on the reseated sketchbook");
});

// ── THE MOVER IS GONE (the freeze, 2026-08-25) ──────────────────────────────
//
// Three tests stood here, and all three were about the re-home pass: that it
// re-pointed a drifted edge instead of refusing the crossing, that it re-framed
// a mark whose new parent bound it so the ground did not move, and that nested
// moves ended up where the law said with live paths in every commit. It was
// careful machinery, and the founder deleted it (LOGOS/state-and-time.md § The
// freeze):
//
//   "The re-home pass is DELETED from the settlement save. The settlement writes
//    a mark once; nothing moves it after. (This retires the publish+re-home
//    wedge — #1862's class — by removing the mover.)"
//
// One test replaces the three, and it is their inverse: the same shape — a
// resident's new claim growing around the town's reach — and the assertion is
// that NOTHING HAPPENS to the reach. No move, no re-frame, no second commit, no
// finding. The three properties the old pass worked to preserve (the ground does
// not move, the numbers stay true, the history stays readable) are preserved
// here by there being nothing to preserve them through.
//
// The fixture carries a REAL filing-freeze manifest, so this is also the
// end-to-end receipt for the two gates: the crossing leaves a tree that satisfies
// them, and it publishes a new mark filed at its id.
test("THE MOVER IS GONE: a resident's new claim publishes, and the reach it grew around does not move a directory or a digit", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-freeze-"));
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
  // the relative frame, declared on the record that IS the frame — a directory
  // still FRAMES what is written inside it after the freeze, and this fixture
  // would not notice if that half broke
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  const reachPath = "WORLD/marks/let-there-be-light/the-reach/mark.md";
  put(reachPath, record({
    by: "the-town", tier: "constitution", at: { x: 1000, y: 1000 }, extent: { w: 100, h: 20 },
    body: "a reach of the town's own river",
  }));
  // THE FOSSIL'S BOUNDARY, as of this fixture's own freeze: both marks alive
  // before the crossing, each at the path it is filed at. Gate A holds them
  // there; gate B holds anything born after to its id.
  put("WORLD/filing-freeze.json", JSON.stringify({
    law: "Filing is frozen as of 2026-08-25. A mark's directory is its historical filing: it carries no claim, and it never moves again.",
    frozen_at: "2026-08-25",
    count: 2,
    marks: {
      "the-town/let-there-be-light": "WORLD/marks/let-there-be-light",
      "the-town/the-reach": "WORLD/marks/let-there-be-light/the-reach",
    },
  }, null, 2) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  git("switch", "-q", "-c", "draft/house-a");
  // Alice's meadow is born AFTER the freeze, so it is filed by identity:
  // "New marks are filed by identity — WORLD/marks/<household>/<slug>/."
  const meadowPath = "WORLD/marks/alice/the-meadow/mark.md";
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
  assert.equal("rehomed" in report, false,
    "and the report carries no re-home channel at all — an always-empty answer is a state with no receipt");

  // THE PAPER DID NOT MOVE. Under the old pass the reach would now be filed
  // inside the meadow; the meadow contains it, and it outranks the meadow, which
  // is exactly the shape the pass existed for.
  assert.equal(has("main", reachPath), true, "the reach is filed where it always was");
  assert.equal(has("main", "WORLD/marks/alice/the-meadow/the-reach/mark.md"), false,
    "and nothing filed it inside the claim that grew around it");

  // THE GROUND DID NOT MOVE EITHER — checked against the re-folded world rather
  // than asserted, exactly as the old test checked it.
  assert.deepEqual(reachAt(), before, "the reach composes to exactly the position it held");
  assert.deepEqual(reachAt(), { x: 1000, y: 1000 });
  assert.match(readFileSync(join(repo, reachPath), "utf8"), /^at: \{ x: 1000, y: 1000 \}$/m,
    "and its digits were never re-written, because nothing re-framed it");

  // ONE COMMIT. The old crossing spent a second one on the repair, ahead of the
  // settlement it made room for. There is no repair.
  const log = git("log", "--format=%s", "-2").split(/\r?\n/);
  assert.match(log[0], /^settlement: sweep 1 published/);
  assert.equal(log[1], "published main", "no re-home commit sits between the settlement and the world before it");

  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
  const lint = execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], { cwd: repo, encoding: "utf8" });
  assert.match(lint, /CLEAN/,
    "and the tree the crossing leaves behind satisfies the freeze: every fossil where the manifest names it, and the new mark at its id");

  // THE FLIP, so the manifest above is not decoration: perform BY HAND exactly
  // the re-home the deleted pass used to perform — file the reach inside the
  // claim that grew around it — and the same gate that just passed refuses it.
  // (The slug is preserved, so the id is unchanged and this is a MOVE; renaming
  // the leaf would change the id and be a different finding, gate B's.)
  git("mv", "WORLD/marks/let-there-be-light/the-reach", "WORLD/marks/alice/the-meadow/the-reach");
  const moved = (() => {
    try { return execFileSync(process.execPath, [join(repo, "tools", "mark-lint.mjs")], { cwd: repo, encoding: "utf8" }); }
    catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); }
  })();
  assert.match(moved, /it never moves again/,
    "an existing mark directory that moves is refused — the gate quotes the law it is enforcing");
  assert.match(moved, /the frozen filing names WORLD\/marks\/let-there-be-light\/the-reach/,
    "…and names the seat the fossil holds it to");
});

// The containment map is the other half of the freeze: filing stopped answering
// "what contains what", so the fold has to. "The fold emits the containment map
// beside world-state.json every settlement. The browsable truth is generated;
// the source files rest."
test("the crossing emits the containment map, and it answers from the GROUND rather than from the tree", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-containment-"));
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
  // The cairn is filed at the top of the tree and STANDS inside the district.
  // That divergence is lawful now and is the whole point of the map: the tree
  // says one thing about where a file lives, and the map says the other thing —
  // where the mark stands.
  put("WORLD/marks/let-there-be-light/the-district/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 1000, y: 1000 }, extent: { w: 400, h: 400 },
    body: "a district of the town",
  }));
  put("WORLD/marks/let-there-be-light/the-cairn/mark.md", record({
    by: "alice", at: { x: 1000, y: 1000 }, extent: { w: 20, h: 20 }, body: "a cairn on the district's ground",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  // The map is deliberately NOT in the first commit, so the crossing is what
  // introduces it. A fold-written file the sweep does not stage leaves the next
  // checkout dirty, and this fixture would not notice if it did.
  rmSync(join(repo, "WORLD", "containment.json"), { force: true });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([]));
  settlementSweep({ repo, stakesPath });

  const map = JSON.parse(readFileSync(join(repo, "WORLD", "containment.json"), "utf8"));
  const row = (id) => map.marks.find((m) => m.id === id);
  assert.equal(row("alice/the-cairn").parent, "the-town/the-district",
    "the cairn is contained by the district it stands in — the ground's answer, not the directory's");
  assert.deepEqual(row("alice/the-cairn").chain, ["the-town/the-district", "the-town/let-there-be-light"],
    "and the chain runs all the way to the frame");
  assert.equal(row("the-town/let-there-be-light").parent, null, "the root is contained by nothing");
  assert.deepEqual(map.marks.map((m) => m.id), [...map.marks.map((m) => m.id)].sort(),
    "sorted by id, so a settlement's diff shows what the ground did and never what the walk order was");

  assert.equal(git("status", "--porcelain").trim(), "",
    "and the crossing staged it — a file the fold writes and the sweep does not track leaves the next checkout dirty");
  assert.match(git("show", "--name-only", "--format=", "HEAD"), /WORLD\/containment\.json/,
    "…in the settlement commit itself");
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
    "and the folded world stands where main put it, not where the sketchbook remembers");
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
  c.commit("house a widens the grant in its own sketchbook");
  c.git("switch", "-q", "main");

  const report = c.sweep();

  assert.equal(report.published.some((row) => row.id === "the-town/berth"), false,
    "the town's own record never publishes from a household's sketchbook");
  const row = report.left_drafted.find((r) => r.id === "the-town/berth");
  assert.ok(row, "the refusal is reported, not silently dropped");
  assert.match(row.reason, /town wall/, "and the reason names the wall");
  assert.equal(c.blob("main", berth), ruled,
    "main's ruled text survives BYTE-IDENTICAL — the widened copy stays in the sketchbook");
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
  c.put(well, record({ by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "the well, as the sketchbook has it" }));
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
  assert.equal(c.git("show", `draft/house-a:${well}`).includes("as the sketchbook has it"), true,
    "and nothing of the sketchbook's was destroyed");
});

test("the ground-closure hold: a staked child never crosses without its drafted parent (the goodie-bag crossing, 2026-08-21)", (t) => {
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
  put("WORLD/marks/let-there-be-light/sol-grove/mark.md", record({
    by: "sol", at: { x: 500, y: 500 }, extent: { w: 200, h: 200 }, body: "sol's grove, published ground",
  }));
  put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: {} }, null, 2) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  git("switch", "-q", "-c", "draft/house-f");
  const archway = "WORLD/marks/let-there-be-light/sol-grove/f-archway/mark.md";
  const table = "WORLD/marks/let-there-be-light/sol-grove/f-archway/f-table/mark.md";
  put(archway, record({ by: "fabel", at: { x: 500, y: 520 }, extent: { w: 20, h: 20 }, body: "an archway, unstaked" }));
  put(table, record({ by: "fabel", at: { x: 505, y: 522 }, extent: { w: 5, h: 5 }, body: "a staked table under a drafted archway" }));
  git("add", "WORLD/marks");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house f furnishes");
  git("switch", "-q", "main");

  const remote = mkdtempSync(join(tmpdir(), "postmark-settlement-remote-"));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git("remote", "add", "origin", remote);
  git("push", "-q", "origin", "main", "draft/house-f");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([
    { holder: "sol", mark: "fabel/f-table", n: 1, weight: 1 },
  ]));
  const report = settlementSweep({ repo, stakesPath });

  // the child is HELD, loudly, with the ground named — never published alone
  assert.equal(has("main", table), false, "the staked child must not cross without its parent");
  assert.equal(has("main", archway), false, "the unstaked parent stays drafted as before");
  const heldRow = report.left_drafted.find((row) => row.id === "fabel/f-table");
  assert.ok(heldRow, "the held child appears in left_drafted");
  assert.match(heldRow.reason, /still drafted — the family crosses together/,
    "and the reason names the drafted ground, not a generic miss");
  // the crossing itself SETTLES — the whole point: one split family never
  // refuses the town's settlement again
  const state = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  assert.deepEqual(state.errors, []);
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
});

test("a ROOT-PARKED draft publishes and STAYS PARKED — the cairn case, after the freeze (2026-08-25)", (t) => {
  // The live shape caught by the shadow rehearsal at 19:03Z on 2026-08-22: the
  // draft door parks every sited draft at the root, and a staked one publishes
  // at the save. Until the freeze the SAME crossing then filed it into its
  // tightest geometric container, which is the publish+re-home wedge the founder
  // named by its class and closed by removing the mover:
  //
  //   "The re-home pass is DELETED from the settlement save. The settlement
  //    writes a mark once; nothing moves it after. (This retires the
  //    publish+re-home wedge — #1862's class — by removing the mover.)"
  //
  // The cairn therefore publishes exactly once, at the seat it was parked in,
  // and the fold answers where it STANDS. Both halves are asserted below,
  // because the point of the freeze is that they are allowed to differ.
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-parked-"));
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
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  // the EXISTING container, published long before this crossing
  put("WORLD/marks/let-there-be-light/the-district/mark.md", record({
    by: "bram", at: { x: 1000, y: 1000 }, extent: { w: 400, h: 400 }, body: "bram's district, already canon",
  }));

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");

  // the draft: parked at the ROOT by the door, standing on district ground
  git("switch", "-q", "-c", "draft/house-c");
  const parkedPath = "WORLD/marks/let-there-be-light/the-cairn/mark.md";
  put(parkedPath, record({ by: "carys", at: { x: 1010, y: 990 }, extent: { w: 4, h: 4 }, body: "a cairn, left where the author stood" }));
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house c parks a cairn");
  git("switch", "-q", "main");

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([{ holder: "s1", mark: "carys/the-cairn", n: 5, weight: 10 }]));

  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.published.map((row) => row.id), ["carys/the-cairn"], "the staked parked draft publishes");
  assert.equal(has("main", parkedPath), true, "…and stays at the seat it was parked in");
  assert.equal(has("main", "WORLD/marks/let-there-be-light/the-district/the-cairn/mark.md"), false,
    "nothing filed it into the district — the settlement writes a mark once and nothing moves it after");
  const worldAt = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"))
    .marks.find((m) => m.id === "carys/the-cairn").at;
  assert.deepEqual(worldAt, { x: 1010, y: 990 }, "the mark did not move — the declared world position to the digit");
  // WHERE IT STANDS is still answered, by the fold, in the artifact that exists
  // for exactly this: "containment lives only in the derived fold, emitted as an
  // artifact each settlement."
  const map = JSON.parse(readFileSync(join(repo, "WORLD", "containment.json"), "utf8"));
  assert.equal(map.marks.find((m) => m.id === "carys/the-cairn").parent, "bram/the-district",
    "the cairn stands on the district's ground, which the map says and the tree no longer has to");
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
});

// ── the-already-standing (the-town/the-already-standing, 2026-08-23) ─────────
//
// The law these three assert, verbatim:
//
//   "A parked copy of a mark already standing in canon, identical but for its
//    frame and its hour, is the drain's to drop — nothing moves, nothing
//    refuses."
//
// The shape is the S45 refusal class, from the worldkeeper's 2026-08-23 daily:
// draft/devadavisson was cut before its own puzzles were filed into the
// protected grove, so it re-offers a root-parked copy of each one every
// crossing — byte-identical to what stands but for `date:` and the coordinate
// FRAME ({x:-1375,y:-2510} world against {x:0,y:115} grove-relative: the same
// place said twice). The publish wrote the copy back at the root, the re-home
// pass computed the seat it already occupies, and the whole crossing refused.
//
// THE DRAIN OUTLIVED THE PASS THAT FED IT (the freeze, 2026-08-25). It used to
// read the re-home findings — a parked copy always produced one — and now asks
// the law's own question directly: which ids stand twice, with one of the two
// parked at the root. Its behaviour is unchanged and these three still hold it
// from both sides; what changed is which of them the WORLD refuses through,
// since without a mover the duplicate the drain declines to drop is a duplicate
// id at the gate.
//
// One fixture, three endings. `twin` is what main already holds inside the
// grove; pass null for the shape where nothing stands there yet.
const alreadyStandingFixture = (t, { twin, parkedBody }) => {
  const repo = mkdtempSync(join(tmpdir(), "postmark-settlement-standing-"));
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
  const commit = (message) => git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", message);

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs"))
    cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 },
    coords: "relative", body: "the frame",
  }));
  put("WORLD/marks/let-there-be-light/the-grove/mark.md", record({
    by: "bram", at: { x: 1000, y: 1000 }, extent: { w: 400, h: 400 }, body: "the protected grove, already canon",
  }));
  put("WORLD/settlement-publications.json", JSON.stringify({
    version: 1,
    published: {
      "devadavisson/the-puzzle": {
        household: "devadavisson",
        path: "WORLD/marks/let-there-be-light/the-grove/the-puzzle/mark.md",
        class: "commons",
      },
    },
  }, null, 2) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  commit("base main");

  // The sketchbook, cut HERE — before the puzzle was filed — and the door parks
  // its copy at the root, in world numbers, on the day it was left.
  git("switch", "-q", "-c", "draft/devadavisson");
  const parkedPath = "WORLD/marks/let-there-be-light/the-puzzle/mark.md";
  put(parkedPath, record({
    by: "devadavisson", at: { x: 1010, y: 990 }, extent: { w: 4, h: 4 },
    body: parkedBody, date: "2026-08-23",
  }));
  git("add", "-A");
  commit("the door parks a puzzle at the root");

  // Main, meanwhile: an earlier crossing published the puzzle and filed it into
  // the grove, so its numbers are grove-relative and its hour is that day's.
  git("switch", "-q", "main");
  const standingPath = "WORLD/marks/let-there-be-light/the-grove/the-puzzle/mark.md";
  if (twin) {
    put(standingPath, record({
      by: "devadavisson", at: { x: 10, y: -10 }, extent: { w: 4, h: 4 },
      body: twin, date: "2026-08-01",
    }));
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
    git("add", "-A");
    commit("the puzzle stands in the grove");
  }

  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  writeFileSync(stakesPath, JSON.stringify([{ holder: "s1", mark: "devadavisson/the-puzzle", n: 5, weight: 10 }]));
  return { repo, git, has, stakesPath, parkedPath, standingPath };
};

test("FALSIFIER (the devadavisson shape): a parked copy of a mark already standing in canon, identical but for its frame and its hour, is DROPPED — the crossing proceeds and canon does not move (the-town/the-already-standing, 2026-08-23)", (t) => {
  const body = "a puzzle in the protected grove";
  const { repo, git, has, stakesPath, parkedPath, standingPath } =
    alreadyStandingFixture(t, { twin: body, parkedBody: body });

  const canonBefore = git("rev-parse", `main:${standingPath}`).trim();
  const said = [];
  const realError = console.error;
  console.error = (...args) => said.push(args.join(" "));
  let report;
  try { report = settlementSweep({ repo, stakesPath }); } finally { console.error = realError; }

  assert.deepEqual(report.dropped.map((row) => [row.id, row.path, row.standing_path]), [[
    "devadavisson/the-puzzle",
    "WORLD/marks/let-there-be-light/the-puzzle/mark.md",
    "WORLD/marks/let-there-be-light/the-grove/the-puzzle/mark.md",
  ]], "the drain names the drop, the seat it was parked at, and the seat that already stands");
  assert.deepEqual(report.published.map((row) => row.id), [],
    "nothing was published: a copy of what already stands is not a publication");
  assert.equal("rehomed" in report, false, "and there is no mover left for anything to move through");

  assert.equal(git("rev-parse", `main:${standingPath}`).trim(), canonBefore,
    "canon is byte-unchanged — the standing mark is the same blob it was");
  assert.equal(has("main", parkedPath), false, "and the parked copy is off the tree");
  assert.equal(
    JSON.parse(readFileSync(join(repo, "WORLD", "settlement-publications.json"), "utf8"))
      .published["devadavisson/the-puzzle"].path,
    standingPath,
    "the ledger goes on naming the seat that stands, not the root the drain emptied");
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");

  const line = said.find((s) => s.includes("[the-already-standing]"));
  assert.ok(line, "the drop is never silent — it says so on the journal");
  assert.equal(line,
    "[the-already-standing] dropped devadavisson/the-puzzle parked at WORLD/marks/let-there-be-light/the-puzzle/mark.md — already standing at WORLD/marks/let-there-be-light/the-grove/the-puzzle/mark.md, identical but for its frame and its hour");
});

test("FALSIFIER (the safety inverse): the SAME shape with one word of the body changed is a real edit against a real seat, and the crossing refuses exactly as it did before (the-town/the-already-standing, 2026-08-23)", (t) => {
  // The law drops what is "identical but for its frame and its hour". This is
  // the boundary: everything matches except one word of prose. If it were eaten
  // silently, a resident's genuine revision would vanish into the drain — so the
  // refusal must stand. (Comment out the body comparison in
  // identicalButForFrameAndHour and this test goes green: that is the flip.)
  //
  // WHICH DOOR THE REFUSAL LEAVES BY changed with the freeze, and only that. It
  // used to be the re-home pass declining to file one seat over another. With no
  // mover, the tree simply ends the crossing holding the same id twice, and the
  // gate refuses it by name — which is the more honest refusal of the two: the
  // problem was never the move, it was two records claiming one identity.
  const { repo, stakesPath } = alreadyStandingFixture(t, {
    twin: "a puzzle in the protected grove",
    parkedBody: "a puzzle in the forbidden grove",
  });
  assert.throws(() => settlementSweep({ repo, stakesPath }), (error) => {
    assert.match(error.message, /^the crossing does not lint clean: 1 error\(s\)/,
      "the crossing refuses rather than eating a resident's revision");
    assert.match(error.message, /duplicate id "devadavisson\/the-puzzle"/,
      "…and names the real complaint: one identity, two records");
    return true;
  });
});

test("FALSIFIER (the sibling law): a root-parked mark with NO twin already standing publishes and STAYS PARKED, and the drain never touches it (the freeze, 2026-08-25)", (t) => {
  const { repo, git, has, stakesPath, parkedPath, standingPath } =
    alreadyStandingFixture(t, { twin: null, parkedBody: "a puzzle in the protected grove" });

  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.dropped, [], "nothing already stands there, so the drain has nothing to drop");
  assert.deepEqual(report.published.map((row) => row.id), ["devadavisson/the-puzzle"],
    "the staked parked draft publishes");
  assert.equal(has("main", parkedPath), true,
    "and stays exactly where the door parked it — the settlement writes a mark once; nothing moves it after");
  assert.equal(has("main", standingPath), false, "nothing filed it into the grove");
  // the grove is still its ground, and the map is where that is now said
  assert.equal(
    JSON.parse(readFileSync(join(repo, "WORLD", "containment.json"), "utf8"))
      .marks.find((m) => m.id === "devadavisson/the-puzzle").parent,
    "bram/the-grove",
    "the puzzle stands on the grove's ground, derived at the fold rather than asserted by its path");
  const worldAt = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"))
    .marks.find((m) => m.id === "devadavisson/the-puzzle").at;
  assert.deepEqual(worldAt, { x: 1010, y: 990 }, "the mark did not move — the declared world position to the digit");
  assert.equal(git("status", "--porcelain").trim(), "", "main checkout closes clean");
});

// ── the eol boundary (S45, 2026-08-23) ─────────────────────────────────────
// The law these four assert, verbatim from the Worldkeeper's craft receipt:
//
//   "Line-ending law needs a normalization crossing. Adding `eol=lf` without
//    truing an existing CRLF blob can make a stale branch dirty before replay
//    begins."
//
// The live shape: main declared `*.mjs text eol=lf` (304890d2) over a
// tools/consent.mjs blob holding 241 CRLF lines and no bare LF. The file
// carries a deliberate NUL (a Map-key delimiter), so git had been sniffing it
// binary and skipping conversion — which is how the CRLF got committed in the
// first place. Once `text` is declared, checkout writes LF, the blob still
// holds CRLF, and NO working-tree content can make them agree. Every rebase
// worktree the crossing opens is dirty the moment the replay moves HEAD onto
// main, and git stops with `cannot rebase: You have unstaged changes.`

const NUL = String.fromCharCode(0);   // the delimiter itself, spelled so no editor can eat it
const NUL_RELIC = (eol) => [
  "// a relic with a deliberate NUL — a Map-key delimiter, so git sniffs it",
  "// BINARY and switches off the line-ending net (the viewer.mjs shape).",
  "export const key = (a, b) => a + NUL + b;",
  "",
].join(eol);

const eolFixture = (t, prefix) => {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const put = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  const commit = (message, ...paths) => {
    // A TARGETED add where the caller names paths. 304890d2 committed only
    // .gitattributes; a fixture that swept the tree with -A would renormalize
    // the very blob whose staleness is the whole subject, and quietly assert
    // nothing. The real omission is the fixture.
    git("add", ...(paths.length ? ["--", ...paths] : ["-A"]));
    git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", message);
  };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) {
    // LF on the way in. The engine tools are scenery here, and a host whose own
    // checkout carries CRLF would otherwise smuggle a SECOND violator into the
    // fixture and make these assertions read the host instead of the law.
    const bytes = readFileSync(join(HERE, file));
    const lf = bytes.toString("latin1").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    writeFileSync(join(repo, "tools", file), Buffer.from(lf, "latin1"));
  }
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame",
  }));
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's parcel",
  }));

  git("init", "-q", "-b", "main");
  // the fixture states its own line-ending world; the class does not depend on
  // the host's core.autocrlf, and a falsifier that did would be a coin flip
  git("config", "core.autocrlf", "false");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  return { repo, git, put, commit };
};

const stakesFile = (t, repo, rows) => {
  const path = repo + "-stakes.json";
  t.after(() => rmSync(path, { force: true }));
  writeFileSync(path, JSON.stringify(rows));
  return path;
};

test("THE CLASS (S45's shape): a stale sketchbook crosses a NEW `*.mjs text eol=lf` boundary over a CRLF blob — the crossing completes and names what it carried", (t) => {
  const { repo, git, put, commit } = eolFixture(t, "postmark-settlement-eol-class-");

  // 1. the relic is committed CRLF, before any line-ending law governs it
  put("tools/relic.mjs", NUL_RELIC("\r\n"));
  commit("published main, with a CRLF relic nobody has declared a law about");
  const relicBlob = git("rev-parse", "main:tools/relic.mjs").trim();

  // 2. the sketchbook is cut here — stale by construction, old attributes
  git("switch", "-q", "-c", "draft/house-a");
  put("WORLD/marks/let-there-be-light/alice-market/mark.md", record({
    by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons",
  }));
  commit("house a sketches");
  git("switch", "-q", "main");

  // 3. THEN the law lands on main — and trues no blob (304890d2's omission)
  put(".gitattributes", "*.mjs text eol=lf\n");
  commit("gitattributes: tools pinned LF", ".gitattributes");
  assert.equal(git("rev-parse", "main:tools/relic.mjs").trim(), relicBlob,
    "the blob still holds CRLF — declaring the law did not rewrite it");
  // The claim the whole fix rests on, proved rather than asserted. `eol=lf`
  // converts on the way IN, not on the way out: checkout writes the CRLF blob
  // back verbatim, and the clean filter turns it to LF when git reads it — so
  // what git would store never equals what git is holding, and NO working-tree
  // content closes that round trip. This is not drift a checkout clears.
  rmSync(join(repo, "tools", "relic.mjs"));
  git("checkout", "--", "tools/relic.mjs");
  const stored = () => git("hash-object", "--path", "tools/relic.mjs", "--", join(repo, "tools", "relic.mjs")).trim();
  assert.notEqual(stored(), relicBlob, "straight from git's own checkout, the round trip does not close");
  writeFileSync(join(repo, "tools", "relic.mjs"), NUL_RELIC("\n"));
  assert.notEqual(stored(), relicBlob, "nor does it with LF on disk instead");
  assert.equal(git("rev-parse", "main:tools/relic.mjs").trim(), relicBlob, "and the blob has not moved");

  // Left written by us, so the mtime is fresh and git must compare CONTENT
  // rather than trust the stat it recorded during its own checkout. A falsifier
  // that let git take its fast path would pass or fail on timing.
  assert.match(git("status", "--porcelain"), /relic\.mjs/, "the crossing meets it dirty");

  const stakesPath = stakesFile(t, repo, [{ holder: "s1", mark: "alice/alice-market", n: 5, weight: 10 }]);
  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.published.map((row) => row.id), ["alice/alice-market"],
    "the crossing publishes — the boundary did not stop it");
  const seat = report.rebased.find((row) => row.branch === "draft/house-a");
  assert.equal(seat.rebased_onto, git("rev-parse", "main").trim(),
    "and the stale sketchbook is reseated on settled main");
  // WHETHER the replay wedges at all is git's stat cache talking. The two
  // sides of this replay hold the SAME blob, so the checkout onto main never
  // rewrites the file; git only notices the violation when it re-reads content
  // instead of trusting the stat it recorded at `worktree add`. That is why
  // exactly ONE of the box's 33 sketchbooks refused on 2026-08-23 while the
  // rest crossed over the same broken blob — and why the assertion here is
  // that the crossing completes and names correctly, not that it wedges.
  // (Shape two's REFUSAL path is deterministic and falsified separately: when
  // the sketchbook wrote the file, the blobs differ, the checkout must rewrite
  // it, and the boundary shows every time.)
  assert.ok(seat.eol_crossed.every((path) => path === "tools/relic.mjs"),
    "if the replay met the boundary it named exactly what it carried, and nothing else");
  assert.deepEqual(report.eol_boundary, ["tools/relic.mjs"],
    "and the gate says out loud which blob still violates main's own eol law, instead of refusing over it");
  assert.equal(git("rev-parse", "draft/house-a").trim(), git("rev-parse", "main").trim(),
    "the sketchbook reseated whole: its one mark published, so its tip is settled main itself");
});

test("FALSIFIER (the discrimination, rebase side): a sketchbook that WROTE the eol-dirty file is never carried inert — the crossing refuses and names the branch", (t) => {
  const { repo, git, put, commit } = eolFixture(t, "postmark-settlement-eol-touched-");

  put("tools/relic.mjs", NUL_RELIC("\r\n"));
  commit("published main, with a CRLF relic");

  git("switch", "-q", "-c", "draft/house-a");
  // the ONE difference from the class above: this sketchbook edited the relic,
  // so the two sides of the replay hold different blobs and the path is not
  // inert. Marking it assume-unchanged could drop a resident's write.
  put("tools/relic.mjs", NUL_RELIC("\r\n").replace("relic with", "relic edited by house-a with"));
  put("WORLD/marks/let-there-be-light/alice-market/mark.md", record({
    by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons",
  }));
  commit("house a sketches, and touches the relic");
  git("switch", "-q", "main");

  put(".gitattributes", "*.mjs text eol=lf\n");
  commit("gitattributes: tools pinned LF", ".gitattributes");

  const stakesPath = stakesFile(t, repo, [{ holder: "s1", mark: "alice/alice-market", n: 5, weight: 10 }]);
  assert.throws(() => settlementSweep({ repo, stakesPath }), (error) => {
    assert.match(error.message, /draft\/house-a did not rebase cleanly/, "it refuses by branch name");
    assert.equal(error.phase, "rebase", "and the refusal carries its phase, separate from any journal line");
    assert.deepEqual(error.eol_dirt, ["tools/relic.mjs"], "naming the path it declined to carry");
    return true;
  });
});

test("FALSIFIER (the discrimination, gate side): one REAL uncommitted edit among the phantoms and the crossing still refuses, by name, leaving the work untouched", (t) => {
  const { repo, put, commit } = eolFixture(t, "postmark-settlement-eol-real-");
  // no `text` law here: the relic is NUL-binary, so git compares it byte for
  // byte and a Windows tool's CRLF rewrite is genuine, clearable phantom dirt
  put("tools/relic.mjs", NUL_RELIC("\n"));
  put("WORLD/notes.txt", "the operator's own file\n");
  commit("published main");

  writeFileSync(join(repo, "tools", "relic.mjs"), NUL_RELIC("\r\n"));      // phantom
  const realEdit = "the operator's own file, MID-EDIT and not yet committed\n";
  writeFileSync(join(repo, "WORLD", "notes.txt"), realEdit);               // real

  const stakesPath = stakesFile(t, repo, []);
  assert.throws(() => settlementSweep({ repo, stakesPath }), (error) => {
    assert.match(error.message, /needs a clean checkout/, "the real edit stops the crossing");
    assert.match(error.message, /WORLD\/notes\.txt/, "and is named — not the phantom beside it");
    assert.equal(error.phase, "clean-check");
    return true;
  });
  assert.equal(readFileSync(join(repo, "WORLD", "notes.txt"), "utf8"), realEdit,
    "the uncommitted work is still there: a crossing that refuses never clears anything");
  assert.equal(readFileSync(join(repo, "tools", "relic.mjs"), "utf8"), NUL_RELIC("\r\n"),
    "and neither is the phantom — judge first, touch nothing");
});

test("FALSIFIER (the control): phantom-only dirt IS cleared and the crossing proceeds — the discrimination cuts both ways", (t) => {
  const { repo, git, put, commit } = eolFixture(t, "postmark-settlement-eol-phantom-");
  put("tools/relic.mjs", NUL_RELIC("\n"));
  commit("published main");

  git("switch", "-q", "-c", "draft/house-a");
  put("WORLD/marks/let-there-be-light/alice-market/mark.md", record({
    by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons",
  }));
  commit("house a sketches");
  git("switch", "-q", "main");

  writeFileSync(join(repo, "tools", "relic.mjs"), NUL_RELIC("\r\n"));
  assert.match(git("status", "--porcelain"), /relic\.mjs/, "git calls it modified");

  const stakesPath = stakesFile(t, repo, [{ holder: "s1", mark: "alice/alice-market", n: 5, weight: 10 }]);
  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.published.map((row) => row.id), ["alice/alice-market"], "the crossing runs");
  assert.equal(readFileSync(join(repo, "tools", "relic.mjs"), "utf8"), NUL_RELIC("\n"),
    "and the drifted file is restored from its own blob — clearable phantom dirt truly clears");
  assert.deepEqual(report.eol_boundary, [],
    "nothing irreconcilable survives: this blob always obeyed the law");
});

test("THE CLASS, shape two (draft/Domovoi-Boulanger's shape): a sketchbook that CARRIES the law and breaks it is dirty at checkout, before the replay begins — and still crosses", (t) => {
  // The live pair: two of the 33 sketchbooks had already been reseated after
  // 304890d2, so their own trees declare `*.mjs text eol=lf` over the stale
  // CRLF blob. Their rebase worktree is dirty the instant it is created, and
  // once main has been trued the two sides hold DIFFERENT blobs — so nothing
  // can be marked inert, and git will not move HEAD over a file it believes
  // has local changes. The sketchbook's copy is brought into agreement with
  // main instead, on the throwaway, and the rebase drops that as empty.
  const { repo, git, put, commit } = eolFixture(t, "postmark-settlement-eol-carried-");

  put("tools/relic.mjs", NUL_RELIC("\r\n"));
  commit("published main, with a CRLF relic nobody has declared a law about");
  put(".gitattributes", "*.mjs text eol=lf\n");
  commit("gitattributes: tools pinned LF", ".gitattributes");
  const staleBlob = git("rev-parse", "main:tools/relic.mjs").trim();

  // the sketchbook is cut here, so it carries BOTH the law and the stale blob
  git("switch", "-q", "-c", "draft/house-a");
  put("WORLD/marks/let-there-be-light/alice-market/mark.md", record({
    by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons",
  }));
  commit("house a sketches", "WORLD/marks");   // targeted: the relic keeps its stale blob
  git("switch", "-q", "main");

  // and THEN main is trued — the normalization crossing 304890d2 never made
  git("add", "--renormalize", "--", "tools/relic.mjs");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "normalize the relic to LF");
  const truedBlob = git("rev-parse", "main:tools/relic.mjs").trim();
  assert.notEqual(truedBlob, staleBlob, "main's blob moved; the sketchbook's did not");
  assert.equal(git("rev-parse", "draft/house-a:tools/relic.mjs").trim(), staleBlob,
    "the sketchbook still holds the CRLF blob, under a law it carries itself");

  const stakesPath = stakesFile(t, repo, [{ holder: "s1", mark: "alice/alice-market", n: 5, weight: 10 }]);
  const report = settlementSweep({ repo, stakesPath });

  assert.deepEqual(report.published.map((row) => row.id), ["alice/alice-market"], "the crossing publishes");
  const seat = report.rebased.find((row) => row.branch === "draft/house-a");
  assert.deepEqual(seat.eol_crossed, ["tools/relic.mjs"], "the receipt names what it brought into agreement");
  assert.equal(git("rev-parse", "draft/house-a:tools/relic.mjs").trim(), truedBlob,
    "and the reseated sketchbook now holds MAIN'S OWN blob — the only thing it gave up is line endings");
  assert.equal(seat.rebased_onto, git("rev-parse", "main").trim(), "seated on settled main");
  assert.equal(git("rev-parse", "draft/house-a").trim(), git("rev-parse", "main").trim(),
    "and the normalization left NO commit behind — the sketchbook's one mark published, so its "
    + "reseated tip is main itself; a surviving normalization commit would show here as a delta");
});

test("FALSIFIER (shape two's guard): a sketchbook whose stale copy does NOT normalize to main's blob is a real divergence — the crossing refuses and names the path", (t) => {
  const { repo, git, put, commit } = eolFixture(t, "postmark-settlement-eol-diverged-");

  put("tools/relic.mjs", NUL_RELIC("\r\n"));
  commit("published main, with a CRLF relic nobody has declared a law about");
  put(".gitattributes", "*.mjs text eol=lf\n");
  commit("gitattributes: tools pinned LF", ".gitattributes");

  git("switch", "-q", "-c", "draft/house-a");
  // One word of real content changed, still in CRLF. Renormalizing this would
  // NOT land on main's blob, so it is a divergence wearing eol-only clothes.
  // Planted past the clean filter on purpose: `git add` under the law would
  // normalize it on the way in, and no ordinary command can commit this shape.
  // A bad merge or another tool can still produce it, and the guard must hold.
  const rewritten = NUL_RELIC("\r\n").replace("a relic with", "a relic house-a rewrote, with");
  writeFileSync(join(repo, "tools", "relic.mjs"), rewritten);
  const planted = git("hash-object", "-w", "--no-filters", "--", join(repo, "tools", "relic.mjs")).trim();
  git("update-index", "--add", "--cacheinfo", `100644,${planted},tools/relic.mjs`);
  put("WORLD/marks/let-there-be-light/alice-market/mark.md", record({
    by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons",
  }));
  git("add", "--", "WORLD/marks");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "house a sketches, and rewrites the relic");
  assert.equal(git("rev-parse", "draft/house-a:tools/relic.mjs").trim(), planted,
    "the sketchbook holds its own CRLF rewrite");
  // --force: the planted blob makes its own checkout dirty on sight, which is
  // the very condition under test. Even leaving the branch needs the override.
  git("switch", "-q", "--force", "main");

  git("add", "--renormalize", "--", "tools/relic.mjs");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "normalize the relic to LF");

  const stakesPath = stakesFile(t, repo, [{ holder: "s1", mark: "alice/alice-market", n: 5, weight: 10 }]);
  assert.throws(() => settlementSweep({ repo, stakesPath }), (error) => {
    assert.match(error.message, /draft\/house-a carries line endings main does not share: tools\/relic\.mjs/,
      "it refuses by branch AND path — the resident's word is never renormalized away");
    assert.equal(error.phase, "rebase");
    return true;
  });
});

test("FALSIFIER (the rewind): a shape-one normalization followed by a failed replay leaves the sketchbook's ref exactly where it was found", (t) => {
  // The normalization is a real commit on the sketchbook, made before the
  // replay is known to work. Every other refusal in this crossing leaves the
  // tree as it found it; this one has to as well, or a refused crossing quietly
  // rewrites 33 sketchbooks.
  const { repo, git, put, commit } = eolFixture(t, "postmark-settlement-eol-rewind-");

  put("tools/relic.mjs", NUL_RELIC("\r\n"));
  put("tools/doomed.mjs", "export const doomed = 1;\n");
  commit("published main, with a CRLF relic nobody has declared a law about");
  put(".gitattributes", "*.mjs text eol=lf\n");
  commit("gitattributes: tools pinned LF", ".gitattributes");

  // cut AFTER the law, so the sketchbook carries it over the stale blob
  git("switch", "-q", "-c", "draft/house-a");
  rmSync(join(repo, "tools", "doomed.mjs"));
  put("WORLD/marks/let-there-be-light/alice-market/mark.md", record({
    by: "alice", at: { x: 800, y: 800 }, extent: { w: 10, h: 10 }, body: "a backed commons",
  }));
  commit("house a sketches, and deletes a tool", "WORLD/marks", "tools/doomed.mjs");
  const sketchbookTip = git("rev-parse", "draft/house-a").trim();
  git("switch", "-q", "--force", "main");

  // main trues the relic (so shape one fires) AND edits the file the sketchbook
  // deleted (so the replay hits a modify/delete that -X theirs will not resolve)
  git("add", "--renormalize", "--", "tools/relic.mjs");
  put("tools/doomed.mjs", "export const doomed = 2;\n");
  commit("normalize the relic, and edit the doomed tool", "tools/relic.mjs", "tools/doomed.mjs");

  const stakesPath = stakesFile(t, repo, [{ holder: "s1", mark: "alice/alice-market", n: 5, weight: 10 }]);
  assert.throws(() => settlementSweep({ repo, stakesPath }), (error) => {
    assert.match(error.message, /draft\/house-a did not rebase cleanly/, "the replay refuses");
    return true;
  });
  assert.equal(git("rev-parse", "draft/house-a").trim(), sketchbookTip,
    "and the sketchbook's ref is exactly where the crossing found it — the normalization commit is gone");
  assert.equal(git("log", "--format=%s", "-1", "draft/house-a").trim(), "house a sketches, and deletes a tool",
    "its own last word is still its own last word");
});
