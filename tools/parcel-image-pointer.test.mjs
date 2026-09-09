// parcel-image-pointer.test.mjs — the parcel carries a POINTER to its picture,
// and the four laws of the write, each one able to fail.
//
// The ruling, quoted: "the parcel mark is a resident's home … the home image is
// the parcel mark's image"; "build less: the mark carries POINTERS — marks'
// existing field precedent for heavier data — and world_investigate and the
// site RESOLVE the pointer" (Keemin, 2026-09-09).
//
//   node --test tools/parcel-image-pointer.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMarks } from "./marks-fold.mjs";
import { applyPointers, nonShelfPointers, planPointers, pointersFrom } from "./parcel-image-pointer.mjs";

const SHELF = "https://media.postmark.town/media/fixture/aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999.jpg";
const OTHER = "https://media.postmark.town/media/fixture/0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff.png";

// A tiny fixture tree: the root, one parcel with no image, one parcel already
// wearing a resident's picture, one sited mark that is not a parcel.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "parcel-pointer-"));
  const marks = join(root, "WORLD", "marks");
  const put = (rel, text) => { mkdirSync(join(marks, rel), { recursive: true }); writeFileSync(join(marks, rel, "mark.md"), text); };
  put("let-there-be-light", "---\nkind: sited\nby: the-town\ntier: constitution\ndate: 2026-07-22\nat: { x: 0, y: 0 }\nextent: { w: 320000, h: 320000 }\ncoords: relative\n---\n\nLet there be light.\n");
  put("let-there-be-light/bare-parcel", "---\nkind: parcel\nby: alpha\ndate: 2026-08-01\nat: { x: 100, y: 100 }\n---\n\nA parcel with no picture yet.\n");
  put("let-there-be-light/worn-parcel", `---\nkind: parcel\nby: beta\ndate: 2026-08-01\nat: { x: 300, y: 100 }\nimage: ${OTHER}\n---\n\nA parcel whose resident hung their own picture.\n`);
  put("let-there-be-light/a-bench", "---\nkind: sited\nby: gamma\ndate: 2026-08-01\nat: { x: 500, y: 100 }\nextent: { w: 2, h: 1 }\n---\n\nA bench, not a parcel.\n");
  return { root, marks, load: () => loadMarks(marks).filter((m) => !m._error) };
}

test("LAW 4 — the shelf is the only mint: one off-shelf URL names the offender, so the run can refuse", () => {
  assert.deepEqual(nonShelfPointers({ "alpha/bare-parcel": SHELF }), []);
  const bad = nonShelfPointers({ "alpha/bare-parcel": SHELF, "beta/worn-parcel": "https://evil.example.test/x.jpg", "gamma/a-bench": "https://media.postmark.town/m/short.jpg" });
  assert.deepEqual(bad.map(([id]) => id), ["beta/worn-parcel", "gamma/a-bench"], "the off-host url AND the off-/media/ path are both refused — the renderer's shelf rule, not the lint's looser one");
});

test("THE POINTER IS PLANTED IN THE PRECEDENT'S FIELD, on the parcel, and the fold reads it back", () => {
  const f = fixture();
  const plan = planPointers({ "alpha/bare-parcel": SHELF }, f.load());
  assert.deepEqual(plan.write.map((w) => w.id), ["alpha/bare-parcel"]);
  const { wrote } = applyPointers(plan.write);
  assert.deepEqual(wrote, ["alpha/bare-parcel"]);
  const raw = readFileSync(join(f.marks, "let-there-be-light/bare-parcel/mark.md"), "utf8");
  assert.match(raw, new RegExp(`^image: ${SHELF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), "the field is `image:` — the one the lint, the fold and the viewer already read");
  // and the reader named in the tool's header reads it: the fold carries the pointer
  const folded = f.load().find((m) => m.id === "alpha/bare-parcel");
  assert.equal(folded.image, SHELF, "marks-fold must hand the pointer to world-state.json, or nothing downstream can walk it");
  assert.equal(folded.kind, "parcel", "and the mark is still the parcel it was");
});

test("LAW 3 — a resident-hung image is never overwritten, silently; and that is the idempotence", () => {
  const f = fixture();
  const plan = planPointers({ "beta/worn-parcel": SHELF, "alpha/bare-parcel": SHELF }, f.load());
  assert.deepEqual(plan.keep.map((k) => k.id), ["beta/worn-parcel"], "the worn parcel is kept, not written");
  const before = readFileSync(join(f.marks, "let-there-be-light/worn-parcel/mark.md"), "utf8");
  applyPointers(plan.write);
  assert.equal(readFileSync(join(f.marks, "let-there-be-light/worn-parcel/mark.md"), "utf8"), before, "the resident's own picture stands byte for byte");
  assert.match(before, new RegExp(OTHER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // second run: nothing to do, by the same rule
  const again = planPointers({ "beta/worn-parcel": SHELF, "alpha/bare-parcel": SHELF }, f.load());
  assert.deepEqual(again.write, [], "a second run has nothing left to write");
  assert.deepEqual(again.keep.map((k) => k.id).sort(), ["alpha/bare-parcel", "beta/worn-parcel"]);
});

test("THE FILE OUTRANKS THE FOLD — a stale plan cannot overwrite a picture the file already carries", () => {
  const f = fixture();
  const plan = planPointers({ "alpha/bare-parcel": SHELF }, f.load());
  // between plan and write, somebody hung a picture on the file
  const path = join(f.marks, "let-there-be-light/bare-parcel/mark.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("at: { x: 100, y: 100 }", `at: { x: 100, y: 100 }\nimage: ${OTHER}`));
  const { wrote, keptAtWrite } = applyPointers(plan.write);
  assert.deepEqual(wrote, []);
  assert.deepEqual(keptAtWrite, ["alpha/bare-parcel"]);
  assert.match(readFileSync(path, "utf8"), new RegExp(OTHER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("ONLY A PARCEL — a sited mark and an unknown id are named, never written", () => {
  const f = fixture();
  const plan = planPointers({ "gamma/a-bench": SHELF, "nobody/nowhere": SHELF }, f.load());
  assert.deepEqual(plan.write, []);
  assert.deepEqual(plan.notParcel, [{ id: "gamma/a-bench", kind: "sited" }]);
  assert.deepEqual(plan.missing, ["nobody/nowhere"]);
});

test("the join file's rows are read as { parcel: pointer }, and a row that already had an image is not a pointer to plant", () => {
  const doc = { rows: [
    { parcel: "alpha/bare-parcel", pointer: SHELF, existing_image: null },
    { parcel: "beta/worn-parcel", pointer: OTHER, existing_image: OTHER },
    { parcel: "gamma/no-pointer", pointer: null, existing_image: null },
  ] };
  assert.deepEqual(pointersFrom(doc), { "alpha/bare-parcel": SHELF });
  assert.deepEqual(pointersFrom({ "x/y": SHELF, "z/w": null }), { "x/y": SHELF });
});
