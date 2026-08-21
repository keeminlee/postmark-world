// home-image-backfill.test — the parcel write's falsifiers.
//
// Each test names the law sentence it asserts, quoted verbatim from the gold
// plan (Starstory PULSE/gold-plans/postmark-home-images/postmark-home-images.md,
// "The law"). Law 3 is this leg's whole reason to be careful, and law 4 is the
// one it enforces at the record layer.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHELF_URL, nonShelfUrls, parcelsByHandle, withImageField, planBackfill, applyBackfill } from "./home-image-backfill.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELF = "https://media.postmark.town/media/keeminlee/70c2f03d0bcdd54ca117e8fa3c9d9dcf7ee7bc176f58cec0116b281b4f188de6.jpg";
const OTHER = "https://media.postmark.town/media/fox-hearth/13c63aff006fad0fccf843c97ed433c1788e8372d4ca237c3fe716c7e3d76845.jpg";

// A parcel record shaped as the seeder writes it, on a temp disk so the write
// path is the real one — the frontmatter, the CRLF, the provenance pair.
const PARCEL_MD = (by, extra = "") =>
  ["---", `by: ${by}`, "kind: parcel", "date: 2026-07-24", "at: { x: -350, y: -200 }",
    "extent: { w: 25, h: 25 }", ...(extra ? [extra] : []), "pre: true",
    `derived_from: seeding/manifest.json — "the-house at grid_m {x: 575, y: -2600} · placement_status: resident-claimed"`,
    "---", "", `The ground ${by}'s house stands on — ${by}'s claim, held on the record.`, ""].join("\r\n");

function tree(spec) {
  const root = mkdtempSync(join(tmpdir(), "home-image-backfill-"));
  const marks = [];
  for (const [handle, opts] of Object.entries(spec)) {
    const dir = join(root, handle);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "mark.md"), PARCEL_MD(handle, opts.image ? `image: ${opts.image}` : ""));
    marks.push({ id: `${handle}/${handle}-parcel`, by: handle, kind: "parcel", _dir: dir, ...(opts.image ? { image: opts.image } : {}) });
  }
  return { root, marks };
}

// ── law 3 ────────────────────────────────────────────────────────────────────

test('A RESIDENT-HUNG IMAGE IS NEVER OVERWRITTEN: "The backfill fills only parcels whose `image:` is absent; a parcel that already carries an image keeps it, silently."', () => {
  const { root, marks } = tree({ bare: {}, hung: { image: OTHER } });
  try {
    const plan = planBackfill({ bare: SHELF, hung: SHELF }, marks);
    assert.deepEqual(plan.write.map((r) => r.handle), ["bare"], "only the parcel with no image is written");
    assert.deepEqual(plan.keep.map((r) => r.handle), ["hung"]);
    applyBackfill(plan.write);
    const kept = readFileSync(join(root, "hung", "mark.md"), "utf8");
    assert.match(kept, /^image: https:\/\/media\.postmark\.town\/media\/fox-hearth\//m, "the resident's own image survived untouched");
    assert.ok(!kept.includes(SHELF), "and the office's guess never landed anywhere in the file");
    // "silently": the parcel that kept its image is reported as kept, not as a
    // near-miss or a conflict — there is nothing here for anyone to resolve
    assert.deepEqual(plan.keep[0], { handle: "hung", parcel: "hung/hung-parcel", image: OTHER });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("law 3 has a SECOND lock, on the file itself: a fold that missed an image cannot make the write overwrite one", () => {
  // The fold said the parcel was bare; the file on disk says otherwise (a stale
  // fold, a hand-edit between the plan and the write). The file wins.
  const { root, marks } = tree({ hung: { image: OTHER } });
  try {
    const stale = [{ ...marks[0] }];
    delete stale[0].image;                       // the fold's blind spot
    const plan = planBackfill({ hung: SHELF }, stale);
    assert.deepEqual(plan.write.map((r) => r.handle), ["hung"], "the plan is willing — that is the trap");
    const { wrote, keptAtWrite } = applyBackfill(plan.write);
    assert.deepEqual(wrote, [], "and the write refuses anyway");
    assert.deepEqual(keptAtWrite, ["hung"]);
    assert.ok(readFileSync(join(root, "hung", "mark.md"), "utf8").includes(OTHER));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("idempotent: the second run has nothing left to do, by the same rule that protected the resident on the first", () => {
  const { root, marks } = tree({ a: {}, b: {} });
  try {
    const first = planBackfill({ a: SHELF, b: OTHER }, marks);
    assert.equal(applyBackfill(first.write).wrote.length, 2);
    const after = ["a", "b"].map((h) => readFileSync(join(root, h, "mark.md"), "utf8"));

    // re-run against the record as it now stands
    const refolded = marks.map((m) => ({ ...m, image: h(root, m.by) }));
    const second = planBackfill({ a: SHELF, b: OTHER }, refolded);
    assert.deepEqual(second.write, [], "nothing to write the second time");
    assert.equal(applyBackfill(second.write).wrote.length, 0);
    assert.deepEqual(["a", "b"].map((x) => readFileSync(join(root, x, "mark.md"), "utf8")), after, "the files are byte-identical");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
const h = (root, by) => (readFileSync(join(root, by, "mark.md"), "utf8").match(/^image: (\S+)$/m) || [])[1];

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
  // the real CLI, run for real: it must exit non-zero and never reach the marks
  const urls = join(mkdtempSync(join(tmpdir(), "home-image-backfill-cli-")), "urls.json");
  writeFileSync(urls, JSON.stringify({ urls: { good: SHELF, bad: "https://example.com/x.jpg" } }));
  try {
    execFileSync(process.execPath, [join(HERE, "home-image-backfill.mjs"), "--urls", urls], { encoding: "utf8", stdio: "pipe" });
    assert.fail("the run should have refused");
  } catch (e) {
    assert.equal(e.status, 1, "a refusal exits non-zero");
    assert.match(String(e.stderr), /REFUSING THE RUN/);
    assert.match(String(e.stderr), /✗ bad/, "the offender is named");
    assert.ok(!/✓ good/.test(String(e.stdout ?? "")), "and the good entry was not written on the way past");
  } finally { rmSync(dirname(urls), { recursive: true, force: true }); }
});

// ── the join, and the things it refuses to guess ─────────────────────────────

test("the join is the record's own `by:` — a handle with no parcel is NAMED, and two parcels are never picked between", () => {
  const marks = [
    { id: "a/a-parcel", by: "a", kind: "parcel", _dir: "/nowhere/a" },
    { id: "d/one-parcel", by: "d", kind: "parcel", _dir: "/nowhere/d1" },
    { id: "d/two-parcel", by: "d", kind: "parcel", _dir: "/nowhere/d2" },
    { id: "a/a-house", by: "a", kind: "sited", _dir: "/nowhere/h" },
  ];
  const { parcels, ambiguous } = parcelsByHandle(marks);
  assert.deepEqual([...parcels.keys()].sort(), ["a", "d"]);
  assert.deepEqual([...ambiguous.keys()], ["d"]);

  const plan = planBackfill({ a: SHELF, c: SHELF, d: SHELF }, marks);
  assert.deepEqual(plan.write.map((r) => r.handle), ["a"]);
  assert.deepEqual(plan.unmatched, ["c"], "a handle whose art has nowhere to hang is named, not dropped");
  assert.deepEqual(plan.ambiguous, [{ handle: "d", parcels: ["d/one-parcel", "d/two-parcel"] }]);
});

// ── the write itself ─────────────────────────────────────────────────────────

test("the field lands above the provenance pair, and the file's own line endings survive", () => {
  const crlf = PARCEL_MD("wright");
  const out = withImageField(crlf, SHELF);
  assert.ok(out.includes("\r\n"), "a CRLF record stays CRLF");
  assert.ok(!/[^\r]\n/.test(out), "and no lone LF sneaks in");
  const fm = out.split("\r\n");
  assert.equal(fm[fm.indexOf(`image: ${SHELF}`) + 1], "pre: true", "image: sits just above pre:/derived_from:");
  assert.equal(fm[fm.indexOf(`image: ${SHELF}`) - 1], "extent: { w: 25, h: 25 }");
  // the body is untouched
  assert.ok(out.endsWith("The ground wright's house stands on — wright's claim, held on the record.\r\n"));

  const lf = crlf.split("\r\n").join("\n");
  const outLf = withImageField(lf, SHELF);
  assert.ok(!outLf.includes("\r"), "an LF record stays LF");

  // no provenance pair at all: the field goes last
  const plain = "---\nby: x\nkind: parcel\n---\n\nbody\n";
  assert.equal(withImageField(plain, SHELF), `---\nby: x\nkind: parcel\nimage: ${SHELF}\n---\n\nbody\n`);
  assert.equal(withImageField(`---\nby: x\nimage: ${OTHER}\n---\n\nbody\n`, SHELF), null);
});

test("--dry writes nothing and reports the same list a real run would write", () => {
  const { root, marks } = tree({ a: {}, b: {} });
  try {
    const before = ["a", "b"].map((x) => readFileSync(join(root, x, "mark.md"), "utf8"));
    const plan = planBackfill({ a: SHELF, b: OTHER }, marks);
    const dry = applyBackfill(plan.write, { dry: true });
    assert.deepEqual(dry.wrote, ["a", "b"], "the dry list is the real list");
    assert.deepEqual(["a", "b"].map((x) => readFileSync(join(root, x, "mark.md"), "utf8")), before, "and not one byte moved");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
