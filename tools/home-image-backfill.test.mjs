// home-image-backfill.test — the home-mark write's falsifiers.
//
// Each test names the law sentence it asserts, quoted verbatim from the gold
// plan as AMENDED (Starstory PULSE/gold-plans/postmark-home-images/
// postmark-home-images.md, "The law"; Keemin's 2026-08-21 late amendment moved
// the image from the parcel to the home mark). Law 3 is this leg's whole reason
// to be careful, and law 4 is the one it enforces at the record layer.
//
// The doctrine this sits under is LOGOS/classes.md § "The tells edges": address
// tells parcel, home tells home-mark, profile tells resident. The dwelling is
// the home-mark; the parcel is the claim.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks } from "./marks-fold.mjs";
import { SHELF_URL, nonShelfUrls, homeMarkFor, homeMarksByHandle, withImageField, planBackfill, applyBackfill } from "./home-image-backfill.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SHELF = "https://media.postmark.town/media/keeminlee/70c2f03d0bcdd54ca117e8fa3c9d9dcf7ee7bc176f58cec0116b281b4f188de6.jpg";
const OTHER = "https://media.postmark.town/media/fox-hearth/13c63aff006fad0fccf843c97ed433c1788e8372d4ca237c3fe716c7e3d76845.jpg";

// records shaped as the tree really holds them, on a temp disk so the write
// path is the real one — the frontmatter, the CRLF, the provenance pair
const MD = (by, kind, body, extra = "") =>
  ["---", `by: ${by}`, `kind: ${kind}`, "date: 2026-07-24", "at: { x: -350, y: -200 }",
    "extent: { w: 25, h: 25 }", ...(extra ? [extra] : []), "pre: true",
    `derived_from: seeding/manifest.json — "the-house at grid_m {x: 575, y: -2600} · placement_status: resident-claimed"`,
    "---", "", body, ""].join("\r\n");

// one household: a parcel, the dwelling inside it at its centre, and the
// `slot: home` predicate the seeder nests under the parcel
function household(handle, { homeImage = null, predicate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "home-image-backfill-"));
  const parcelDir = join(root, `${handle}-parcel`), homeDir = join(parcelDir, "the-house");
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(parcelDir, "mark.md"), MD(handle, "parcel", `The ground ${handle}'s house stands on.`));
  writeFileSync(join(homeDir, "mark.md"), MD(handle, "sited", `${handle}'s house.`, homeImage ? `image: ${homeImage}` : ""));
  const parcel = { id: `${handle}/${handle}-parcel`, by: handle, kind: "parcel", at: { x: 0, y: 0 }, _dir: parcelDir };
  const home = { id: `${handle}/the-house`, slug: "the-house", by: handle, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 12, h: 12 }, _dir: homeDir, _parentMarkId: parcel.id, ...(homeImage ? { image: homeImage } : {}) };
  const marks = [parcel, home];
  if (predicate) marks.push({ id: `${handle}/${handle}-parcel/home`, by: handle, kind: "predicated", slot: "home", value: "the-house", _parentMarkId: parcel.id });
  return { root, parcelDir, homeDir, marks, parcel, home };
}
const read = (dir) => readFileSync(join(dir, "mark.md"), "utf8");

// ── law 2: the retarget itself ───────────────────────────────────────────────

test('THE IMAGE RIDES THE DWELLING: "A household\'s HOME art is its HOME MARK\'s canonical default image" — and the parcel is never touched', () => {
  // The falsifier for the amendment (Keemin, 2026-08-21 late: "ADDRESS = parcel
  // mark, HOME = home mark… put the image on the *home* mark"). Aimed at the
  // parcel, as this tool was first built, the first assertion still passes and
  // this one fails — which is the whole point of writing it this way round.
  const h = household("wright");
  try {
    const plan = planBackfill({ wright: SHELF }, h.marks);
    assert.deepEqual(plan.write.map((r) => r.home), ["wright/the-house"], "the write targets the dwelling, not the claim");
    applyBackfill(plan.write);
    assert.match(read(h.homeDir), new RegExp(`^image: ${SHELF.replace(/[/.]/g, "\\$&")}$`, "m"), "the home mark carries the art");
    assert.ok(!read(h.parcelDir).includes("image:"), "and the PARCEL carries no picture — a claim has no face");
  } finally { rmSync(h.root, { recursive: true, force: true }); }
});

// ── law 3 ────────────────────────────────────────────────────────────────────

test('A RESIDENT-HUNG IMAGE IS NEVER OVERWRITTEN: "The backfill fills only home marks whose `image:` is absent; a mark that already carries an image keeps it, silently."', () => {
  const bare = household("bare"), hung = household("hung", { homeImage: OTHER });
  try {
    const plan = planBackfill({ bare: SHELF, hung: SHELF }, [...bare.marks, ...hung.marks]);
    assert.deepEqual(plan.write.map((r) => r.handle), ["bare"], "only the home mark with no image is written");
    assert.deepEqual(plan.keep.map((r) => r.handle), ["hung"]);
    applyBackfill(plan.write);
    const kept = read(hung.homeDir);
    assert.match(kept, /^image: https:\/\/media\.postmark\.town\/media\/fox-hearth\//m, "the resident's own image survived untouched");
    assert.ok(!kept.includes(SHELF), "and the office's guess never landed anywhere in the file");
    // "silently": reported as kept, not as a near-miss or a conflict — there is
    // nothing here for anyone to resolve
    assert.deepEqual(plan.keep[0], { handle: "hung", home: "hung/the-house", image: OTHER });
  } finally { rmSync(bare.root, { recursive: true, force: true }); rmSync(hung.root, { recursive: true, force: true }); }
});

test("law 3 has a SECOND lock, on the file itself: a fold that missed an image cannot make the write overwrite one", () => {
  // The fold said the mark was bare; the file on disk says otherwise (a stale
  // fold, a hand-edit between the plan and the write). The file wins.
  const h = household("hung", { homeImage: OTHER });
  try {
    const stale = h.marks.map((m) => { const c = { ...m }; delete c.image; return c; });
    const plan = planBackfill({ hung: SHELF }, stale);
    assert.deepEqual(plan.write.map((r) => r.handle), ["hung"], "the plan is willing — that is the trap");
    const { wrote, keptAtWrite } = applyBackfill(plan.write);
    assert.deepEqual(wrote, [], "and the write refuses anyway");
    assert.deepEqual(keptAtWrite, ["hung"]);
    assert.ok(read(h.homeDir).includes(OTHER));
  } finally { rmSync(h.root, { recursive: true, force: true }); }
});

test("idempotent: the second run has nothing left to do, by the same rule that protected the resident on the first", () => {
  const a = household("a"), b = household("b");
  try {
    const marks = [...a.marks, ...b.marks];
    assert.equal(applyBackfill(planBackfill({ a: SHELF, b: OTHER }, marks).write).wrote.length, 2);
    const after = [read(a.homeDir), read(b.homeDir)];
    // re-fold: the record now carries what the first run wrote
    const refolded = marks.map((m) => (m.id === "a/the-house" ? { ...m, image: SHELF } : m.id === "b/the-house" ? { ...m, image: OTHER } : m));
    const second = planBackfill({ a: SHELF, b: OTHER }, refolded);
    assert.deepEqual(second.write, [], "nothing to write the second time");
    assert.deepEqual([read(a.homeDir), read(b.homeDir)], after, "the files are byte-identical");
  } finally { rmSync(a.root, { recursive: true, force: true }); rmSync(b.root, { recursive: true, force: true }); }
});

// ── the join, and the things it refuses to guess ─────────────────────────────

test("A HANDLE WHOSE HOME MARK CANNOT BE JOINED IS NAMED IN THE REPORT, NEVER GUESSED — with the candidates it had", () => {
  // lupi's real shape: a parcel whose only sited children are three 2 m details
  // of a threshold (door-light, the-lamp-and-the-knock, the-unworn-step), none
  // at its centre. The den itself was never planted. Three candidates and no
  // agreeing evidence is a refusal, not a coin toss.
  const parcel = { id: "lupi/den-parcel", by: "lupi", kind: "parcel", at: { x: 0, y: 0 }, _dir: "/nowhere/p" };
  const kids = ["door-light", "the-lamp-and-the-knock", "the-unworn-step"].map((slug) => ({
    id: `lupi/${slug}`, slug, by: "lupi", kind: "sited", at: { x: 10, y: 10 }, extent: { w: 2, h: 2 }, _dir: `/nowhere/${slug}`, _parentMarkId: parcel.id,
  }));
  // sahil's real shape: a parcel and one sited mark 1.7 km away that is a
  // 3200x1000 m shore, not a dwelling — nothing under the parcel at all
  const sahilParcel = { id: "sahil/deepghar", by: "sahil", kind: "parcel", at: { x: -400, y: 8400 }, _dir: "/nowhere/d" };
  const shore = { id: "sahil/the-far-shore", slug: "the-far-shore", by: "sahil", kind: "sited", at: { x: -2000, y: 7900 }, extent: { w: 3200, h: 1000 }, _dir: "/nowhere/s", _parentMarkId: "the-town/let-there-be-light" };

  const plan = planBackfill({ lupi: SHELF, sahil: SHELF }, [parcel, ...kids, sahilParcel, shore]);
  assert.deepEqual(plan.write, [], "nothing is written for either");
  assert.deepEqual(plan.noHomeMark.map((r) => r.handle).sort(), ["lupi", "sahil"]);
  const lupi = plan.noHomeMark.find((r) => r.handle === "lupi");
  assert.deepEqual(lupi.candidates, ["lupi/door-light", "lupi/the-lamp-and-the-knock", "lupi/the-unworn-step"],
    "the report NAMES what it had, so a mind can act on it");
  assert.match(lupi.why, /picking one is a judgment/);
  const sahil = plan.noHomeMark.find((r) => r.handle === "sahil");
  assert.match(sahil.why, /the dwelling was never planted/);
  assert.deepEqual(sahil.candidates, [], "a mark that is neither under the parcel nor at its centre is not a candidate at all");
});

test("the join reads the record in four layers, strongest evidence first — and never picks between equals", () => {
  const ctx = (marks) => {
    const byId = new Map(marks.map((m) => [m.id, m]));
    const sitedByHandle = new Map();
    for (const m of marks) { if (m.kind !== "sited") continue; if (!sitedByHandle.has(m.by)) sitedByHandle.set(m.by, []); sitedByHandle.get(m.by).push(m); }
    return { marks, byId, sitedByHandle };
  };
  const p = { id: "h/p", by: "h", kind: "parcel", at: { x: 0, y: 0 } };
  const house = { id: "h/house", slug: "house", by: "h", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 12, h: 12 }, _parentMarkId: "h/p" };
  const shed = { id: "h/shed", slug: "shed", by: "h", kind: "sited", at: { x: 5, y: 5 }, extent: { w: 3, h: 3 }, _parentMarkId: "h/p" };
  const pred = { id: "h/p/home", by: "h", kind: "predicated", slot: "home", value: "house", _parentMarkId: "h/p" };

  // 1. the predicate names it, in words
  assert.equal(homeMarkFor(p, ctx([p, house, shed, pred])).mark.id, "h/house");
  assert.match(homeMarkFor(p, ctx([p, house, shed, pred])).how, /predicate/);
  // the seeder's documented drift: the value matches a slug, not an id
  const drifted = { ...pred, value: "east-facing-window" };
  const cathedral = { id: "h/the-cathedral", slug: "east-facing-window", by: "h", kind: "sited", at: { x: 9, y: 9 }, _parentMarkId: "h/p" };
  assert.equal(homeMarkFor(p, ctx([p, cathedral, drifted])).mark.id, "h/the-cathedral");

  // 2. child AND centre together — rei's real shape: 24 sited marks and two at
  //    the parcel's centre, the house and a 0.2 m pocket lantern INSIDE it
  const lantern = { id: "h/pocket-lantern", slug: "pocket-lantern", by: "h", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 0.2, h: 0.2 }, _parentMarkId: "h/house" };
  const both = homeMarkFor(p, ctx([p, house, shed, lantern]));
  assert.equal(both.mark.id, "h/house", "the house is the parcel's own child at its centre; the lantern is the house's");
  assert.match(both.how, /child, standing at its centre/);

  // 3. the sole tree child
  assert.equal(homeMarkFor(p, ctx([p, { ...shed, at: { x: 5, y: 5 } }])).mark.id, "h/shed");
  // 4. the sole mark at the centre, where the tree says nothing
  const orphan = { ...house, _parentMarkId: "the-town/let-there-be-light" };
  assert.equal(homeMarkFor(p, ctx([p, orphan])).mark.id, "h/house");
  // and two equals, with nothing to separate them, is a refusal
  const twin = { id: "h/twin", slug: "twin", by: "h", kind: "sited", at: { x: 0, y: 0 }, _parentMarkId: "the-town/let-there-be-light" };
  assert.equal(homeMarkFor(p, ctx([p, orphan, twin])).mark, null);
});

test("THE LIVE RECORD: where the predicate and the geometry both answer, they AGREE — the layer order never has to resolve a disagreement", () => {
  // The layers are ordered, so a divergence would be silently settled by
  // ordering rather than surfaced. This is the probe that surfaces it: on the
  // record as it stands, 25 parcels carry both a `slot: home` predicate and a
  // sited child at their centre, and the two name the same mark 25 times. If
  // that ever stops being true, this fails and a mind looks.
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const byId = new Map(marks.map((m) => [m.id, m]));
  const sitedByHandle = new Map();
  for (const m of marks) {
    if (m.kind !== "sited" || !m.at || m.far || !m.by) continue;
    if (!sitedByHandle.has(m.by)) sitedByHandle.set(m.by, []);
    sitedByHandle.get(m.by).push(m);
  }
  let compared = 0;
  for (const parcel of marks.filter((m) => m.kind === "parcel" && m.by)) {
    const pred = marks.find((m) => m._parentMarkId === parcel.id && m.kind === "predicated" && m.slot === "home");
    if (!pred?.value) continue;
    const own = sitedByHandle.get(parcel.by) ?? [];
    const geom = own.filter((m) => m._parentMarkId === parcel.id && m.at.x === parcel.at.x && m.at.y === parcel.at.y);
    if (geom.length !== 1) continue;
    const named = homeMarkFor(parcel, { marks, byId, sitedByHandle });
    assert.equal(named.mark?.id, geom[0].id, `${parcel.id}: the predicate and the geometry disagree about which mark is the dwelling`);
    compared += 1;
  }
  assert.ok(compared >= 20, `expected the record to still hold both kinds of evidence for many parcels; compared ${compared}`);
});

test("THE LIVE RECORD: every handle is reported exactly once, and a parcel is never mistaken for a dwelling", () => {
  const marks = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const { homes, unreachable, parcels } = homeMarksByHandle(marks);
  assert.equal(homes.size + unreachable.size, parcels.size, "every parcel-holding handle lands in exactly one bucket");
  for (const [handle, found] of homes) {
    assert.equal(found.mark.kind, "sited", `${handle}'s home mark must be a dwelling, not a ${found.mark.kind}`);
    assert.notEqual(found.mark.id, found.parcel, `${handle}'s home mark must not be the parcel itself`);
    assert.equal(found.mark.by, handle, `${handle}'s home mark must be their own`);
  }
});

// ── law 4, at the record layer ───────────────────────────────────────────────

test('THE SHELF IS THE ONLY MINT: "Every URL written is a `https://media.postmark.town/…` URL minted by the office\'s own `uploadMedia` path" — anything else stops the run', () => {
  assert.ok(SHELF_URL.test(SHELF));
  assert.deepEqual(nonShelfUrls({ ok: SHELF }), []);
  for (const bad of [
    "https://example.com/nice.jpg",                                  // another host
    "https://media.postmark.town.evil.example/media/x.jpg",          // a host that merely starts the same way
    "http://media.postmark.town/media/x.jpg",                        // not https
    "https://media.postmark.town/uploads/x.jpg",                     // the host, but not the shelf the door issues
    "https://media.postmark.town/media/x.jpg?raw=1",                 // a query string is not a shelf path
    "data:image/png;base64,iVBORw0KGgo=",                            // bytes smuggled into the record
    "",
    null,
  ]) assert.deepEqual(nonShelfUrls({ h: bad }).map(([k]) => k), ["h"], `${JSON.stringify(bad)} should have been refused`);
});

test("the refusal is the RUN, not the entry — one bad URL writes nothing at all", () => {
  const dir = mkdtempSync(join(tmpdir(), "home-image-backfill-cli-"));
  const urls = join(dir, "urls.json");
  writeFileSync(urls, JSON.stringify({ urls: { good: SHELF, bad: "https://example.com/x.jpg" } }));
  try {
    execFileSync(process.execPath, [join(HERE, "home-image-backfill.mjs"), "--urls", urls], { encoding: "utf8", stdio: "pipe" });
    assert.fail("the run should have refused");
  } catch (e) {
    assert.equal(e.status, 1, "a refusal exits non-zero");
    assert.match(String(e.stderr), /REFUSING THE RUN/);
    assert.match(String(e.stderr), /✗ bad/, "the offender is named");
    assert.ok(!/✓ good/.test(String(e.stdout ?? "")), "and the good entry was not written on the way past");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the write itself ─────────────────────────────────────────────────────────

test("the field lands above the provenance pair, and the file's own line endings survive", () => {
  const crlf = MD("wright", "sited", "wright's house.");
  const out = withImageField(crlf, SHELF);
  assert.ok(out.includes("\r\n"), "a CRLF record stays CRLF");
  assert.ok(!/[^\r]\n/.test(out), "and no lone LF sneaks in");
  const fm = out.split("\r\n");
  assert.equal(fm[fm.indexOf(`image: ${SHELF}`) + 1], "pre: true", "image: sits just above pre:/derived_from:");
  assert.equal(fm[fm.indexOf(`image: ${SHELF}`) - 1], "extent: { w: 25, h: 25 }");
  assert.ok(out.endsWith("wright's house.\r\n"), "the body is untouched");

  assert.ok(!withImageField(crlf.split("\r\n").join("\n"), SHELF).includes("\r"), "an LF record stays LF");
  const plain = "---\nby: x\nkind: sited\n---\n\nbody\n";
  assert.equal(withImageField(plain, SHELF), `---\nby: x\nkind: sited\nimage: ${SHELF}\n---\n\nbody\n`);
  assert.equal(withImageField(`---\nby: x\nimage: ${OTHER}\n---\n\nbody\n`, SHELF), null);
});

test("--dry writes nothing and reports the same list a real run would write", () => {
  const a = household("a"), b = household("b");
  try {
    const before = [read(a.homeDir), read(b.homeDir)];
    const dry = applyBackfill(planBackfill({ a: SHELF, b: OTHER }, [...a.marks, ...b.marks]).write, { dry: true });
    assert.deepEqual(dry.wrote, ["a", "b"], "the dry list is the real list");
    assert.deepEqual([read(a.homeDir), read(b.homeDir)], before, "and not one byte moved");
  } finally { rmSync(a.root, { recursive: true, force: true }); rmSync(b.root, { recursive: true, force: true }); }
});
