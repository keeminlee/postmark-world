// harm-gate.test.mjs — the crossing's refusing gate, held from both sides.
// Every check below has a green twin and a red twin over the same fixture, and
// the red names the mark. The last test is the day this gate was built: the
// 17:45Z 09-16 return, replayed as the sweep would commit it, green — and the
// same tree with one lawful return left out of the report, red on that mark.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { harmGate, defaultBase } from "./harm-gate.mjs";
import { withTool } from "./engine-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const record = ({ kind = "sited", by, tier, at, extent, body = "a mark", coords, date = "2026-07-28" }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), `date: ${date}`];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  if (coords) lines.push(`coords: ${coords}`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

function fixture(t, prefix = "postmark-harm-") {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, text) => { const full = join(repo, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); return path; };
  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }, null, 2));
  put("WORLD/marks/let-there-be-light/mark.md", record({ by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, coords: "relative", body: "the frame" }));
  const paths = {
    district: put("WORLD/marks/let-there-be-light/the-district/mark.md", record({ by: "limen", at: { x: 1000, y: 2000 }, extent: { w: 3000, h: 3000 }, body: "a district" })),
    terrace: put("WORLD/marks/let-there-be-light/the-district/the-terrace/mark.md", record({ by: "limen", at: { x: 0, y: 500 }, extent: { w: 300, h: 2000 }, body: "a terrace" })),
    parcelA: put("WORLD/marks/let-there-be-light/the-district/the-terrace/the-parcel/mark.md", record({ kind: "parcel", by: "hal", at: { x: -100, y: -50 }, extent: { w: 30, h: 30 }, body: "hal's parcel" })),
    parcelB: put("WORLD/marks/let-there-be-light/the-district/far-parcel/mark.md", record({ kind: "parcel", by: "noe", at: { x: 800, y: 800 }, extent: { w: 30, h: 30 }, body: "noe's parcel" })),
    lamp: put("WORLD/marks/let-there-be-light/the-district/the-lamp/mark.md", record({ by: "alice", at: { x: 200, y: 200 }, extent: { w: 2, h: 2 }, body: "a lamp" })),
  };
  put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: {
    "alice/the-lamp": { household: "house-a", path: paths.lamp, class: "commons" },
    "limen/the-terrace": { household: "house-limen", path: paths.terrace, class: "commons" },
  } }, null, 2) + "\n");
  // a stake on the district, which never leaves in these tests: the fold refuses
  // to write a stampless world (the 09-16 scratch-fold class), and the lamp must
  // carry NO escrow so that its return is lawful
  const DISTRICT_STAKE = [{ holder: "s", mark: "limen/the-district", n: 2, weight: 2 }];
  const fold = (stakes = DISTRICT_STAKE) => {
    const stakesPath = join(repo, "stakes.json");
    writeFileSync(stakesPath, JSON.stringify(stakes));
    execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs"), "--stakes", stakesPath], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
    return stakesPath;
  };
  const commit = (msg) => { git("add", "-A"); git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", msg); return git("rev-parse", "HEAD").trim(); };
  git("init", "-q", "-b", "main");
  const stakesPath = fold();
  const base = commit("published main");
  const unregister = (id) => { const reg = JSON.parse(readFileSync(join(repo, "WORLD/settlement-publications.json"), "utf8")); delete reg.published[id]; writeFileSync(join(repo, "WORLD/settlement-publications.json"), JSON.stringify(reg, null, 2) + "\n"); };
  return { repo, git, put, paths, fold, commit, base, stakesPath, unregister };
}

const names = (out, name) => out.checks.find((c) => c.name === name);

test("a lawful crossing is NO HARM: a mark returns with the sweep saying so, and the base is read off the settlement commit", (t) => {
  const f = fixture(t);
  unlinkSync(join(f.repo, f.paths.lamp)); rmSync(dirname(join(f.repo, f.paths.lamp)), { recursive: true, force: true });
  f.unregister("alice/the-lamp");
  f.fold();
  f.commit("settlement: sweep 0 published, 1 unpublished, 0 left drafted, 0 withdrawn, 0 quarantined, 0 dropped, 0 re-framed");
  assert.equal(defaultBase(f.repo), "HEAD~1", "HEAD is a settlement commit, so the base is its parent");
  const out = harmGate({ repo: f.repo, sweep: { unpublished: [{ id: "alice/the-lamp" }] }, stakes: f.stakesPath });
  assert.equal(out.ok, true, JSON.stringify(out.checks.filter((c) => !c.ok)));
  assert.deepEqual(out.checks.map((c) => c.name), ["lint", "moved", "lost", "escrow", "parcels"]);
  assert.equal(out.before, 6); assert.equal(out.after, 5);
});

test("LOST: a mark gone with no act names the mark; the same tree with the act is clean", (t) => {
  const f = fixture(t);
  rmSync(dirname(join(f.repo, f.paths.lamp)), { recursive: true, force: true });
  f.unregister("alice/the-lamp");
  f.fold();
  f.commit("settlement: sweep 0 published, 0 unpublished, 0 left drafted, 0 withdrawn, 0 quarantined, 0 dropped, 0 re-framed");
  const red = harmGate({ repo: f.repo, sweep: {} });
  assert.equal(red.ok, false);
  assert.match(names(red, "lost").rows.join("\n"), /^alice\/the-lamp: gone, and no act names it$/m);
  const green = harmGate({ repo: f.repo, sweep: { unpublished: [{ id: "alice/the-lamp" }] } });
  assert.equal(green.ok, true, JSON.stringify(green.checks.filter((c) => !c.ok)));
});

test("MOVED: a standing mark whose position changed with no act names the mark; the same move, published by its author, is the author's", (t) => {
  const f = fixture(t);
  f.put(f.paths.lamp, record({ by: "alice", at: { x: 260, y: 200 }, extent: { w: 2, h: 2 }, body: "a lamp, moved" }));
  f.fold();
  f.commit("settlement: sweep 1 published, 0 unpublished, 0 left drafted, 0 withdrawn, 0 quarantined, 0 dropped, 0 re-framed");
  const red = harmGate({ repo: f.repo, sweep: {} });
  assert.equal(red.ok, false);
  assert.match(names(red, "moved").rows.join("\n"), /^alice\/the-lamp: 1200,2200 -> 1260,2200 \(no act names it\)$/m);
  const green = harmGate({ repo: f.repo, sweep: { published: [{ id: "alice/the-lamp" }] } });
  assert.equal(green.ok, true, JSON.stringify(green.checks.filter((c) => !c.ok)));
});

test("MOVED, the verb's claim: a frame that left and a child the sweep says it re-expressed — the child must stand exactly where it stood", (t) => {
  const f = fixture(t);
  // the terrace leaves; hal's parcel is re-expressed against the district: -100,-50 on the terrace (1000,2500) = 900,2450 = -100,450 on the district
  rmSync(join(f.repo, f.paths.terrace), { force: true });
  f.put(f.paths.parcelA, record({ kind: "parcel", by: "hal", at: { x: -100, y: 450 }, extent: { w: 30, h: 30 }, body: "hal's parcel" }));
  f.unregister("limen/the-terrace");
  f.fold();
  f.commit("settlement: sweep 0 published, 1 unpublished, 0 left drafted, 0 withdrawn, 0 quarantined, 0 dropped, 1 re-framed");
  const green = harmGate({ repo: f.repo, sweep: { unpublished: [{ id: "limen/the-terrace" }], reframed: [{ id: "hal/the-parcel" }] } });
  assert.equal(green.ok, true, JSON.stringify(green.checks.filter((c) => !c.ok)));
  // and the broken verb: re-expressed to the wrong numbers
  f.put(f.paths.parcelA, record({ kind: "parcel", by: "hal", at: { x: -100, y: 460 }, extent: { w: 30, h: 30 }, body: "hal's parcel" }));
  f.fold();
  f.commit("settlement: sweep (the verb rounded)");
  const red = harmGate({ repo: f.repo, sweep: { reframed: [{ id: "hal/the-parcel" }] }, base: "HEAD~2" });
  assert.equal(red.ok, false);
  assert.match(names(red, "moved").rows.join("\n"), /^hal\/the-parcel: 900,2450 -> 900,2460 \(re-expressed by the verb, and it moved — the verb's claim is broken\)$/m);
});

test("THE SWEEP'S WORD IS HELD TO THE TREE: a mark it says it published that does not stand, a mark it says it removed that still stands", (t) => {
  const f = fixture(t);
  // nothing changed in the tree; the report lies in both directions
  const red = harmGate({ repo: f.repo, base: "HEAD", sweep: { published: [{ id: "alice/a-mark-that-never-landed" }], unpublished: [{ id: "alice/the-lamp" }] } });
  assert.equal(red.ok, false);
  const rows = names(red, "lost").rows.join("\n");
  assert.match(rows, /alice\/a-mark-that-never-landed: the sweep says it published this mark, and it does not stand/);
  assert.match(rows, /alice\/the-lamp: the sweep says it removed this mark, and it still stands/);
});

test("PARCELS: two standing parcels sharing ground names both; apart, clean", (t) => {
  const f = fixture(t);
  f.put(f.paths.parcelB, record({ kind: "parcel", by: "noe", at: { x: -90, y: 460 }, extent: { w: 30, h: 30 }, body: "noe's parcel, moved onto hal's" }));
  f.fold();
  f.commit("settlement: sweep 1 published, 0 unpublished, 0 left drafted, 0 withdrawn, 0 quarantined, 0 dropped, 0 re-framed");
  const red = harmGate({ repo: f.repo, sweep: { published: [{ id: "noe/far-parcel" }] } });
  assert.equal(red.ok, false, JSON.stringify(red.checks));
  assert.match(names(red, "parcels").rows.join("\n"), /(hal\/the-parcel x noe\/far-parcel|noe\/far-parcel x hal\/the-parcel): \d+(\.\d+)? m² of shared ground/,
    "both parcels named, whichever the walk met first: " + names(red, "parcels").rows.join(" | "));
  assert.equal(names(red, "moved").ok, true, "the move was published, so it is the author's");
});

test("ESCROW: a fold that ran stampless while stake rows name standing marks is harm; the fold with its stakes is clean", (t) => {
  const f = fixture(t);
  const green = harmGate({ repo: f.repo, base: "HEAD", sweep: {}, stakes: f.stakesPath });
  assert.equal(green.ok, true, JSON.stringify(green.checks.filter((c) => !c.ok)));
  assert.match(names(green, "escrow").note, /fold stamps 2, stake rows on standing marks 1/);
  // the fold re-run with no stakes at all, while the ledger still names the lamp
  execFileSync(process.execPath, [join(f.repo, "tools", "marks-fold.mjs"), "--allow-stampless"], { cwd: f.repo, stdio: ["ignore", "pipe", "pipe"] });
  f.commit("settlement: sweep (folded stampless)");
  const red = harmGate({ repo: f.repo, sweep: {}, stakes: f.stakesPath, base: "HEAD~1" });
  assert.equal(red.ok, false);
  assert.match(names(red, "escrow").rows.join("\n"), /1 stake row\(s\) name standing marks and the fold carries 0 stamps — it folded stampless/);
});

test("COULD NOT GATE is never a pass: no fold, no verdict", (t) => {
  const f = fixture(t);
  unlinkSync(join(f.repo, "WORLD", "world-state.json"));
  f.commit("settlement: sweep (no fold)");
  assert.throws(() => harmGate({ repo: f.repo, sweep: {} }), /could not gate: no WORLD\/world-state.json/);
});

// ── the day it was built ─────────────────────────────────────────────────────
// The 17:45Z 09-16 crossing returned fifty escrow-0 commons marks and was
// refused by the tier falsifier's ledger, not by any harm. Replayed here over
// the REAL tree, as the sweep commits it: with the fifty in the report, no harm;
// with one of them (lysander's jetty, the one the ledger tripped on) left out of
// the report, harm named on exactly that mark.
test("THE 09-16 RETURN, REPLAYED: fifty lawful returns are no harm; one return the report forgot is named", (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "postmark-harm-return-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  cpSync(join(ROOT, "WORLD"), join(scratch, "WORLD"), { recursive: true });
  cpSync(join(ROOT, "tools"), join(scratch, "tools"), { recursive: true });
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "world-fixture", type: "module" }));
  const git = (...args) => execFileSync("git", ["-C", scratch, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q", "-b", "main"); git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", "world main");
  // the fifty: every escrow-0 commons row in the registry — the return's own rule — capped so the test stays a test
  const regPath = join(scratch, "WORLD", "settlement-publications.json");
  const reg = JSON.parse(readFileSync(regPath, "utf8"));
  const returned = Object.entries(reg.published).filter(([, e]) => e.class === "commons" && existsSync(join(scratch, e.path))).slice(0, 50);
  assert.ok(returned.length >= 20, `the live registry holds enough commons rows to replay a return (${returned.length})`);
  // a frame with standing marks beneath it is KEPT by the return (PR #79): it
  // stays, record and row alike. The first draft of this replay unlinked such a
  // frame's record and left its children standing, and the gate's second check
  // named the town's pando landing moved 888 m — which is the harm the KEEP
  // gate exists to prevent, caught by the gate this file is proving.
  const kept = [];
  const left = [];
  for (const [id, e] of returned) {
    const holdsChildren = execFileSync("git", ["-C", scratch, "ls-files", "--", dirname(e.path)], { encoding: "utf8" })
      .split(/\r?\n/).filter((p) => p && p !== e.path.replace(/\\/g, "/")).length > 0;
    if (holdsChildren) { kept.push(id); continue; }
    rmSync(dirname(join(scratch, e.path)), { recursive: true, force: true });
    delete reg.published[id];
    left.push([id, e]);
  }
  assert.ok(left.length >= 20, `enough returns to replay (${left.length} left, ${kept.length} kept)`);
  writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");
  git("add", "-A");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@test.invalid", "commit", "-q", "-m", `settlement: sweep 0 published, ${left.length} unpublished, ${kept.length} left drafted, 0 withdrawn, 0 quarantined, 0 dropped, 0 re-framed`);
  const report = { unpublished: left.map(([id]) => ({ id })) };
  const green = harmGate({ repo: scratch, sweep: report, lint: false });
  assert.equal(green.ok, true, JSON.stringify(green.checks.filter((c) => !c.ok)));
  t.diagnostic(`${left.length} returned and ${kept.length} kept over ${green.before} marks: no harm`);
  const forgotten = left.find(([id]) => id === "lysander/the-jetty") ?? left[0];
  const red = harmGate({ repo: scratch, sweep: { unpublished: report.unpublished.filter((r) => r.id !== forgotten[0]) }, lint: false });
  assert.equal(red.ok, false);
  assert.deepEqual(names(red, "lost").rows, [`${forgotten[0]}: gone, and no act names it`], "exactly the forgotten mark, and nothing else");
});
