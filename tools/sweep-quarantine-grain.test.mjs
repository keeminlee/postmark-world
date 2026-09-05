// sweep-quarantine-grain.test.mjs — a drawer is not a household.
//
// ── THE CASE THE 08-24 RULING DID NOT SEE (postmark#2515) ──────────────────
//
// The whole-tree quarantine was narrowed to candidates on 2026-08-24 on the
// founder's word: "the crossing judges what a household publishes, not what its
// stale tree happens to contain." That ruling fixed the axis it was about — WHICH
// ROWS are judged — and left the other one alone: WHOSE rows they are.
//
// A sketchbook is named for a GitHub LOGIN (`draft/<login>`), and one login may
// keep several handles. `draft/devadavisson` is one drawer for `berthillon` and
// `current-the-reader`. Between S55 and S58 berthillon offered three cones
// declared `kind: parcel` — inadmissible, because berthillon already holds
// `chez-antoine` and the fold's law is one parcel per handle — and the drawer
// was set aside whole every crossing. Current-the-reader's eleven admissible
// marks were never judged, for five crossings, and the residents learned of it
// from the silence.
//
// The unit of judgment is the household. The unit of quarantine was the drawer.
//
// ── THE BAR ───────────────────────────────────────────────────────────────
//
//   BY NAME        — the quarantine entry names the AUTHORING household and the
//                    row, not just the drawer. A neighbour reading the receipt
//                    must be able to tell whose row it was.
//   THE REST PASS  — the other household's admissible rows publish at the same
//                    crossing. This is the whole point.
//   CONSERVATIVE   — nothing from the quarantined household half-applies, and a
//                    candidate whose author cannot be read at all still sets the
//                    WHOLE drawer aside, exactly as before.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { settlementSweep } from "./settlement-sweep.mjs";
import { withTool } from "./engine-files.mjs";

// Same scratch discipline as sweep-quarantine.test.mjs (2026-09-01: 1,005
// orphan `postmark-stakes-*` directories stood in the box's /tmp the day it
// filled). Every temp directory this file makes is removed when it finishes.
const SCRATCH = [];
const scratch = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); SCRATCH.push(d); return d; };
after(() => { for (const d of SCRATCH) rmSync(d, { recursive: true, force: true }); });

const HERE = dirname(fileURLToPath(import.meta.url));
const record = ({ kind = "sited", by, tier, at, extent, body }) => {
  const lines = ["---", `kind: ${kind}`, `by: ${by}`, ...(tier ? [`tier: ${tier}`] : []), "date: 2026-09-03"];
  if (at) lines.push(`at: { x: ${at.x}, y: ${at.y} }`);
  if (extent) lines.push(`extent: { w: ${extent.w}, h: ${extent.h} }`);
  return `${lines.join("\n")}\n---\n\n${body}\n`;
};

/**
 * THE SHARED DRAWER, in miniature.
 *
 * `main` holds a parcel for each of two handles. ONE sketchbook — named for the
 * login the two share, not for either handle — offers:
 *
 *   · alice's SECOND parcel      inadmissible: the fold's per-handle clause,
 *                                "household already holds a parcel
 *                                (relocation = replace, not add)"
 *   · bob's shed on bob's ground admissible, and staked, so it is a real
 *                                publication rather than a row the sweep would
 *                                have skipped for its own reasons
 *
 * Neither handle stands in `WORLD/households.json` — which is the live shape:
 * berthillon and current-the-reader are both absent from main's registry, so
 * the fold's own `credOf` gives each one `solo:<handle>`, its own household.
 * `opts.registry` puts them under ONE credential household instead, which is
 * the case that must still be quarantined together.
 */
function town(t, { aliceSecondParcel = true, registry = null, anonymousRow = false, stakeAlice = true } = {}) {
  const repo = mkdtempSync(join(tmpdir(), "postmark-grain-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (p, text) => { const f = join(repo, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  const has = (ref, p) => { try { git("cat-file", "-e", `${ref}:${p}`); return true; } catch { return false; } };

  mkdirSync(join(repo, "tools"), { recursive: true });
  for (const file of withTool("mark-lint.mjs")) cpSync(join(HERE, file), join(repo, "tools", file));
  put("WORLD/skeleton.json", JSON.stringify({ features: [], physics_registry: {} }));
  put("WORLD/marks/let-there-be-light/mark.md", record({
    by: "the-town", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 }, body: "the frame" }));
  put("WORLD/marks/let-there-be-light/alice-parcel/mark.md", record({
    kind: "parcel", by: "alice", at: { x: 100, y: 100 }, extent: { w: 100, h: 100 }, body: "alice's parcel" }));
  put("WORLD/marks/let-there-be-light/bob-parcel/mark.md", record({
    kind: "parcel", by: "bob", at: { x: 400, y: 400 }, extent: { w: 100, h: 100 }, body: "bob's parcel" }));
  if (registry) put("WORLD/households.json", JSON.stringify(registry, null, 1) + "\n");
  put("WORLD/settlement-publications.json", JSON.stringify({ version: 1, published: {} }) + "\n");

  git("init", "-q", "-b", "main");
  execFileSync(process.execPath, [join(repo, "tools", "marks-fold.mjs")], { cwd: repo });
  git("add", "-A");
  git("-c", "user.name=f", "-c", "user.email=f@t.invalid", "commit", "-q", "-m", "published main");

  // ONE drawer, named for the shared login, carrying both handles' work.
  git("switch", "-q", "-c", "draft/shared-login");
  if (aliceSecondParcel)
    put(SECOND_PARCEL, record({ kind: "parcel", by: "alice", at: { x: 800, y: 800 }, extent: { w: 100, h: 100 }, body: "alice reaches for a second square" }));
  if (anonymousRow)
    // A record with no author at all — `household` and `by` both absent — that
    // is ALSO inadmissible (it lands on top of bob's parcel). Both halves are
    // needed: an authorless row that folds clean must still publish, or the
    // grouping would have invented a new refusal, which the sweep's own
    // registry note forbids ("registry lag must not strand the pen's own
    // writes"). The fallback bites only where the unbindable row is bad.
    put(ANON_ROW, "---\nkind: parcel\ndate: 2026-09-03\nat: { x: 400, y: 400 }\nextent: { w: 100, h: 100 }\n---\n\nnobody's square, on top of bob's\n");
  put(BOB_SHED, record({ by: "bob", at: { x: 410, y: 410 }, extent: { w: 10, h: 10 }, body: "bob's shed" }));
  git("add", "WORLD/marks");
  git("-c", "user.name=f", "-c", "user.email=f@t.invalid", "commit", "-q", "-m", "the shared drawer");
  git("switch", "-q", "main");

  const stakesPath = join(scratch("postmark-grain-stakes-"), "stakes.json");
  // `stakeAlice: false` leaves alice's parcel UNSTAKED, which the withdrawal
  // pair below needs: escrow anchors a staked mark against withdrawal on its
  // own, so a "the withdrawal was held" assertion taken over a staked mark
  // proves nothing about the quarantine. The control found that.
  writeFileSync(stakesPath, JSON.stringify([
    ...(stakeAlice ? [{ holder: "alice", mark: "alice/alice-parcel", n: 3, weight: 3, tick: 0 }] : []),
    { holder: "bob", mark: "bob/bob-parcel", n: 3, weight: 3, tick: 0 },
  ]));
  return { repo, git, has, stakesPath };
}

const SECOND_PARCEL = "WORLD/marks/let-there-be-light/alice-second-parcel/mark.md";
const BOB_SHED = "WORLD/marks/let-there-be-light/bob-parcel/bob-shed/mark.md";
const ANON_ROW = "WORLD/marks/let-there-be-light/nobodys-square/mark.md";

test("the control: with no inadmissible row, the shared drawer settles whole", (t) => {
  const { repo, stakesPath, has } = town(t, { aliceSecondParcel: false });
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });
  assert.deepEqual(out.quarantined, [], "a clean drawer quarantines nobody");
  assert.equal(has("main", BOB_SHED), true, "and bob's shed reaches main");
});

test("FALSIFIER: one household's inadmissible row does not hold the other household's admissible rows", (t) => {
  const { repo, stakesPath, has } = town(t);
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });

  // THE REST PASS — the whole point of #2515, and the thing that was false for
  // five crossings.
  assert.equal(has("main", BOB_SHED), true,
    "bob's admissible shed publishes even though alice's row in the same drawer could not be admitted");
  assert.ok(out.published.some((p) => String(p.id ?? "") === "bob/bob-shed"),
    `bob's row is in the published channel: ${JSON.stringify(out.published.map((p) => p.id))}`);

  // CONSERVATIVE — alice's row reaches nothing.
  assert.equal(has("main", SECOND_PARCEL), false, "alice's second parcel does not reach main");
  for (const channel of ["published", "left_drafted", "unpublished", "withdrawn", "dropped"])
    assert.ok(!JSON.stringify(out[channel] ?? []).includes("alice-second-parcel"),
      `alice-second-parcel leaked into ${channel} — a quarantined household must not be half-read`);
});

test("BY NAME: the quarantine entry names the authoring household, the author, and the row", (t) => {
  const { repo, stakesPath } = town(t);
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });

  assert.equal(out.quarantined.length, 1, "exactly the one household, not the drawer");
  const q = out.quarantined[0];
  assert.equal(q.household, "solo:alice",
    "the household is the one the fold's own credOf names — not the drawer's login");
  assert.equal(q.by, "alice", "and the authoring handle is carried, because that is who a letter is addressed to");
  assert.equal(q.ref, "draft/shared-login", "the drawer is still named, so an operator can find the branch");
  assert.equal(q.row, "alice/alice-second-parcel",
    "`row` carries the mark id that poisoned it — it was null on every receipt S55 through S58");
  assert.match(q.detail, /household already holds a parcel/, "the fold's own sentence rides along");
  assert.ok(!JSON.stringify(out.quarantined).includes("bob"),
    "and bob is named nowhere in the quarantine — he did nothing");
});

test("CONSERVATIVE: a row whose author cannot be read at all still sets the WHOLE drawer aside", (t) => {
  const { repo, stakesPath, has } = town(t, { aliceSecondParcel: false, anonymousRow: true });
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });

  assert.equal(out.quarantined.length, 1, "the drawer is quarantined once, as a drawer");
  assert.equal(out.quarantined[0].household, "shared-login",
    "and it is named for the drawer, because no authoring household could be read");
  assert.equal(out.quarantined[0].by, null, "there is no author to name");
  assert.equal(has("main", BOB_SHED), false,
    "bob's row is held too — an unreadable author is the one case that still refuses the whole drawer");
});

test("a registered multi-handle household stays ONE group: the cap keeps its accounting", (t) => {
  // alice and bob under one credential household. The per-handle clause still
  // refuses alice's second parcel, and now bob is in the SAME group, so his row
  // is held with hers. This is the case grouping-by-bare-handle would have got
  // wrong, and it is the reason the grouping key is the fold's own credOf.
  const { repo, stakesPath, has } = town(t, {
    registry: { households: { alice: "gh:1", bob: "gh:1" }, logins: { "shared-login": "gh:1" } },
  });
  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });
  assert.equal(out.quarantined.length, 1);
  assert.equal(out.quarantined[0].household, "gh:1",
    "the credential household is the group, so its parcel-claim cap is counted over the whole group");
  assert.equal(has("main", BOB_SHED), false,
    "bob shares alice's household here, so his row waits with hers — this is not the shared-LOGIN case");
});

test("A SET-ASIDE HOUSEHOLD'S WITHDRAWALS WAIT WITH ITS PUBLICATIONS — by name, in the crossing's journal", (t) => {
  // THE LAW THIS COVERS SHIPPED WITH NO FALSIFIER, and the reviewer found it:
  // "this household's sketchbook rows were set aside this crossing, so its
  // withdrawals wait with them" is new resident-facing refusal grammar, and
  // grep for it across the world tree returned nothing.
  //
  // It matters more than a missing test usually does. Without it a
  // household-grained quarantine holds a household's ADDITIONS and lets its
  // DELETIONS through — a half-applied sketchbook, which is the exact thing the
  // quarantine's conservative direction exists to prevent. alice offers an
  // inadmissible second parcel AND withdraws a mark she already has on main; the
  // second must wait for the first.
  const { repo, git, has, stakesPath } = town(t, { stakeAlice: false });
  git("switch", "-q", "draft/shared-login");
  git("rm", "-q", "-r", "WORLD/marks/let-there-be-light/alice-parcel");
  git("-c", "user.name=f", "-c", "user.email=f@t.invalid", "commit", "-q", "-m", "alice withdraws her parcel too");
  git("switch", "-q", "main");

  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });

  assert.equal(has("main", "WORLD/marks/let-there-be-light/alice-parcel/mark.md"), true,
    "alice's withdrawal did NOT execute — it waits with the rows that were set aside");
  const held = out.left_drafted.find((x) => String(x.id ?? "").includes("alice-parcel"));
  assert.ok(held, `the withdrawal is reported, not dropped: ${JSON.stringify(out.left_drafted)}`);
  assert.equal(held.reason,
    "this household's sketchbook rows were set aside this crossing, so its withdrawals wait with them",
    "and it is refused in its own words, not folded into somebody else's reason");

  // THE OTHER HALF, or the assertion above proves only that withdrawals are
  // hard: bob is in a different household in the same drawer and his row still
  // publishes, so the hold is scoped to alice and not to the sketchbook.
  assert.equal(has("main", BOB_SHED), true, "bob's shed still publishes — the hold is alice's, not the drawer's");
});

test("THE CONTROL FOR IT: with nothing set aside, the SAME withdrawal executes", (t) => {
  // Without this, the test above is equally consistent with "withdrawals never
  // run in this fixture", which would be a green that proves nothing.
  const { repo, git, has, stakesPath } = town(t, { aliceSecondParcel: false, stakeAlice: false });
  git("switch", "-q", "draft/shared-login");
  git("rm", "-q", "-r", "WORLD/marks/let-there-be-light/alice-parcel");
  git("-c", "user.name=f", "-c", "user.email=f@t.invalid", "commit", "-q", "-m", "alice withdraws her parcel");
  git("switch", "-q", "main");

  const out = settlementSweep({ repo, stakesPath, mainBranch: "main" });
  assert.deepEqual(out.quarantined, [], "nothing is set aside in this run");
  assert.equal(has("main", "WORLD/marks/let-there-be-light/alice-parcel/mark.md"), false,
    "so the very same withdrawal executes — the hold above was the quarantine's doing, not the fixture's");
  assert.ok(out.withdrawn.some((w) => String(w.id ?? "").includes("alice-parcel")),
    `and it is reported as a withdrawal: ${JSON.stringify(out.withdrawn)}`);
});

test("a quarantine is not a silence: the drawer is still there afterwards", (t) => {
  const { repo, stakesPath, git } = town(t);
  settlementSweep({ repo, stakesPath, mainBranch: "main" });
  assert.match(git("for-each-ref", "--format=%(refname:short)", "refs/heads/draft/"), /draft\/shared-login/,
    "setting a household aside must not delete the drawer — the household fixes the row and the next crossing takes it");
});
