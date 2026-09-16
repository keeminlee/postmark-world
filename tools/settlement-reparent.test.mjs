// settlement-reparent.test.mjs — THE REPARENT VERB at its two call sites in the
// sweep (POS-102 · postmark#2865, 2026-09-16). The unit is in
// reparent-keep-world.test.mjs; this is the crossing: a real repo, two
// settlements, and the fold's own world-state.json as the instrument that says
// where everything stands.
//
//   1. A zero-stake frame with another household's marks filed on it LEAVES on
//      the return (PR #79's KEEP gate is retired); the marks are re-expressed
//      against the next frame up and compose to exactly where they were; the
//      seat stands as their filing; the receipt names the frames.
//   2. The frame is staked again and RETURNS from its sketchbook; the same marks
//      are re-expressed back into it — to the byte.
//   3. THE DOOR: a mark that cannot keep its place exactly keeps its frame
//      standing, by name, and the crossing completes.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const record = ({ kind = "sited", by, tier, at, extent, points, body = "a mark", coords, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (points) lines.push(`points: ${points}`);
  if (coords) lines.push(`coords: ${coords}`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};
const line = (file, key) => (readFileSync(file, "utf8").match(new RegExp(`^${key}: .*$`, "m")) ?? [null])[0];
const worldState = (repo) => {
  const s = JSON.parse(readFileSync(join(repo, "WORLD", "world-state.json"), "utf8"));
  return new Map(s.marks.map((m) => [m.id, { at: m.at ?? null, points: m.points ?? null }]));
};

function crossingRepo(t, prefix) {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, text) => { const full = join(repo, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); return path; };
  const has = (ref, path) => { try { git("cat-file", "-e", `${ref}:${path}`); return true; } catch { return false; } };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  const seal = () => {
    git("init", "-q", "-b", "main");
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
    git("add", "-A");
    git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "published main");
    const remote = mkdtempSync(join(tmpdir(), `${prefix}remote-`));
    t.after(() => rmSync(remote, { recursive: true, force: true }));
    execFileSync("git", ["init", "--bare", "-q", remote]);
    git("remote", "add", "origin", remote);
    git("push", "-q", "origin", "main");
  };
  const stakesPath = `${repo}-stakes.json`;
  t.after(() => rmSync(stakesPath, { force: true }));
  const sweep = (stakes) => { writeFileSync(stakesPath, JSON.stringify(stakes)); return settlementSweep({ repo, stakesPath }); };
  return { repo, git, put, has, seal, sweep };
}

test("THE REPARENT VERB AT THE CROSSING (POS-102 · postmark#2865): a frame leaves and what stands on it keeps its place; staked again, it returns and takes them back — to the byte", (t) => {
  const c = crossingRepo(t, "postmark-reparent-");
  c.put("WORLD/marks/let-there-be-light/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  const district = c.put("WORLD/marks/let-there-be-light/the-district/mark.md", record({ by: "limen", at: { x: 1000, y: 2000 }, extent: { w: 3000, h: 3000 }, body: "a district" }));
  const terrace = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/mark.md", record({ by: "limen", at: { x: 0, y: 500 }, extent: { w: 300, h: 2000 }, body: "a terrace" }));
  const parcel = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/the-parcel/mark.md", record({ kind: "parcel", by: "hal", at: { x: -100, y: -50 }, extent: { w: 30, h: 30 }, body: "hal's parcel" }));
  const house = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/the-parcel/the-house/mark.md", record({ by: "hal", at: { x: 0, y: 0 }, extent: { w: 10, h: 10 }, body: "hal's house" }));
  const ring = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/the-ring/mark.md", record({ by: "wright", at: { x: 20, y: 20 }, extent: { w: 10, h: 10 }, points: "15,15 25,15 25,25 15,25", body: "a ring of stones" }));
  const plaque = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/the-plaque/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 1005, y: 2505 }, extent: { w: 2, h: 2 }, body: "the town's plaque" }));
  c.put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: {
    "limen/the-terrace": { household: "house-limen", path: terrace, class: "commons" },
  } }, null, 2) + "\n");
  c.seal();
  const originals = Object.fromEntries([terrace, parcel, house, ring, plaque].map((p) => [p, readFileSync(join(c.repo, p), "utf8")]));
  const world0 = worldState(c.repo);
  assert.deepEqual(world0.get("hal/the-parcel").at, { x: 900, y: 2450 }, "the fold composes hal's parcel through the terrace");
  assert.deepEqual(world0.get("wright/the-ring").points, [[1015, 2515], [1025, 2515], [1025, 2525], [1015, 2525]]);

  // ── 1. the terrace has no stake behind it: this crossing returns it ──
  const one = c.sweep([]);
  assert.deepEqual(one.unpublished.map((r) => r.id), ["limen/the-terrace"], "the terrace leaves canon for want of escrow");
  assert.equal(one.left_drafted.some((r) => r.id === "limen/the-terrace"), false, "no KEEP line — PR #79's gate is retired");
  assert.equal(existsSync(join(c.repo, terrace)), false, "its record is gone");
  assert.equal(existsSync(join(c.repo, dirname(terrace))), true, "its seat stands as the filing of what stood on it");
  assert.equal(line(join(c.repo, parcel), "at"), "at: { x: -100, y: 450 }", "hal's parcel is written against the district now");
  assert.equal(readFileSync(join(c.repo, house), "utf8"), originals[house], "the house rides its parcel — not written");
  assert.equal(line(join(c.repo, ring), "at"), "at: { x: 20, y: 520 }");
  assert.equal(line(join(c.repo, ring), "points"), "points: 15,515 25,515 25,525 15,525", "the ring rides the same frame as its at");
  assert.equal(readFileSync(join(c.repo, plaque), "utf8"), originals[plaque], "the plaque outranks the terrace: the world framed it all along — not written");
  assert.deepEqual(one.reframed.map((r) => [r.id, r.frame_from, r.frame_to, r.at_from, r.at_to]).sort(), [
    ["hal/the-parcel", "limen/the-terrace", "limen/the-district", { x: -100, y: -50 }, { x: -100, y: 450 }],
    ["wright/the-ring", "limen/the-terrace", "limen/the-district", { x: 20, y: 20 }, { x: 20, y: 520 }],
  ], "the receipt names each re-expressed mark with the frame it left and the frame it has now");
  const world1 = worldState(c.repo);
  for (const id of ["limen/the-district", "hal/the-parcel", "hal/the-house", "wright/the-ring", "the-town/the-plaque"])
    assert.deepEqual(world1.get(id), world0.get(id), `${id} composes to exactly where it was — the fold's own word`);
  assert.equal(world1.has("limen/the-terrace"), false);
  assert.match(c.git("log", "-1", "--format=%s", "main"), /1 unpublished, .*2 re-framed/, "the settlement commit names the channel with its count");
  assert.equal(c.has("main", parcel), true);
  assert.equal(c.has("main", terrace), false);
  assert.equal(c.has("draft/house-limen", terrace), true, "the return carries the terrace to its household's sketchbook");
  assert.equal(c.git("status", "--porcelain").trim(), "", "main checkout closes clean");

  // ── 2. a supporter stakes the terrace: it returns from the sketchbook ──
  const two = c.sweep([{ holder: "supporter", mark: "limen/the-terrace", n: 3, weight: 5 }]);
  assert.deepEqual(two.published.map((r) => r.id), ["limen/the-terrace"], "the terrace publishes again");
  assert.equal(readFileSync(join(c.repo, terrace), "utf8"), originals[terrace], "at its own numbers");
  assert.equal(readFileSync(join(c.repo, parcel), "utf8"), originals[parcel], "hal's parcel is back to the byte");
  assert.equal(readFileSync(join(c.repo, ring), "utf8"), originals[ring], "and the ring");
  assert.deepEqual(two.reframed.map((r) => [r.id, r.frame_from, r.frame_to]).sort(), [
    ["hal/the-parcel", "limen/the-district", "limen/the-terrace"],
    ["wright/the-ring", "limen/the-district", "limen/the-terrace"],
  ], "the same verb, the other way");
  const world2 = worldState(c.repo);
  for (const [id, w] of world0) assert.deepEqual(world2.get(id), w, `${id} after the round trip`);
  assert.match(c.git("log", "-1", "--format=%s", "main"), /1 published, .*2 re-framed/);
  assert.equal(c.git("status", "--porcelain").trim(), "", "main checkout closes clean");
});

test("THE DOOR AT THE CROSSING: a mark that cannot keep its place exactly keeps its frame standing, by name on the KEEP line, and the crossing completes", (t) => {
  // coords-frame.test.mjs's pair, built into a tree (see reparent-keep-world.test.mjs THE DOOR)
  const c = crossingRepo(t, "postmark-reparent-door-");
  c.put("WORLD/marks/let-there-be-light/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  c.put("WORLD/marks/let-there-be-light/the-district/mark.md", record({ by: "limen", at: { x: 1010, y: 2005 }, extent: { w: 20000, h: 20000 }, body: "a district" }));
  const terrace = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/mark.md", record({ by: "limen", at: { x: -1010, y: -2005 }, extent: { w: 8000, h: 8000 }, body: "a terrace" }));
  const stone = c.put("WORLD/marks/let-there-be-light/the-district/the-terrace/the-stone/mark.md", record({ by: "hal", at: { x: 1075, y: -790.9 }, extent: { w: 1, h: 1 }, body: "a stone" }));
  c.put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: {
    "limen/the-terrace": { household: "house-limen", path: terrace, class: "commons" },
  } }, null, 2) + "\n");
  c.seal();
  const stoneText = readFileSync(join(c.repo, stone), "utf8");
  const terraceText = readFileSync(join(c.repo, terrace), "utf8");

  const report = c.sweep([]);
  assert.deepEqual(report.unpublished, [], "the terrace does not leave");
  const kept = report.left_drafted.find((r) => r.id === "limen/the-terrace");
  assert.ok(kept, `the terrace is on the KEEP line: ${JSON.stringify(report.left_drafted.map((r) => [r.id, r.reason]))}`);
  assert.match(kept.reason, /^kept: hal\/the-stone stands inside it and cannot keep its place exactly if it leaves \(.*rounding.*\)/, "and the reason names the mark and the door");
  assert.equal(readFileSync(join(c.repo, terrace), "utf8"), terraceText, "the terrace's record stands, byte for byte");
  assert.equal(readFileSync(join(c.repo, stone), "utf8"), stoneText, "the stone was not written");
  assert.deepEqual(report.reframed, []);
  const registry = JSON.parse(readFileSync(join(c.repo, "WORLD", "settlement-publications.json"), "utf8"));
  assert.ok(registry.published["limen/the-terrace"], "the registry still names it published");
  assert.equal(c.git("log", "-1", "--format=%s", "main").trim(), "published main",
    "the frame stayed and nothing else changed, so main did not move — a crossing that changes nothing cuts no commit, as before");
  assert.equal(c.git("status", "--porcelain").trim(), "", "main checkout closes clean");
});
