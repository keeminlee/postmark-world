import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  BLURB_MAX,
  classMarksIn,
  declaredGrants,
  grantActorKind,
  placementWalkStandsInTheWorks,
  residueLookupFromMarks,
  resolveAffordances,
  viaFor,
} from "./world-affordances.mjs";
import { parseRecord } from "./marks-fold.mjs";

const ROOT = join(import.meta.dirname, "..");

// ── the shape of a class mark as the FOLD carries it ─────────────────────────
const classMark = (id, actions, extra = {}) => ({
  id, by: "the-town", tier: "constitution", class: id.split("/")[1],
  placementParent: "the-town/the-keeping-works", actions, ...extra,
});
const residueMark = (id, body, dials) => ({
  id, by: "the-town", tier: "constitution", class: id.split("/")[1], body, dials,
});

test("a grant with no `for:` is FOR A RESIDENT — the absent case is a rule, never a guess", () => {
  // The office store's own reader defaults it; the door's reader dropped it on
  // the floor. That disagreement is why this lives in one place now.
  assert.equal(grantActorKind({ action: "say" }), "resident");
  assert.equal(grantActorKind({ action: "say", for: "human" }), "human");
  assert.equal(grantActorKind({ action: "say", for: "  " }), "resident");
  assert.equal(grantActorKind({}), "resident");
  assert.equal(grantActorKind(null), "resident");
});

test("both spellings of the grant list are read, so older law keeps its doors", () => {
  assert.equal(declaredGrants({ actions: [{ action: "say" }] }).length, 1);
  assert.equal(declaredGrants({ affordances: [{ subverb: "say" }] }).length, 1);
  assert.equal(declaredGrants({ props: { actions: [{ action: "say" }] } }).length, 1);
  assert.deepEqual(declaredGrants({}), []);
  assert.deepEqual(declaredGrants({ actions: "not-a-list" }), []);
});

test("via says WHY a door is open, and the three answers are different facts", () => {
  const spine = new Set(["a"]), reach = new Set(["b"]);
  assert.equal(viaFor("a", { spine, reach }), "within");
  assert.equal(viaFor("b", { spine, reach }), "in reach");
  assert.equal(viaFor("c", { spine, reach }), "ambient");
});

test("a mark out of sight grants nothing — unless its class travels", () => {
  const marks = [
    classMark("the-town/resident", [{ action: "say", residue: "the-town/sound" }], { ambient: true }),
    classMark("the-town/household", [{ action: "join", residue: "the-town/member-of" }]),
  ];
  // standing nowhere near either: the ambient class still reaches, the other does not
  const far = resolveAffordances({ marks, spineIds: [], reachIds: [] });
  assert.deepEqual(far.map((e) => e.action), ["say"]);
  assert.equal(far[0].via, "ambient");
  // walk into the household class's reach and its verb appears — no other input changed
  const near = resolveAffordances({ marks, spineIds: [], reachIds: ["the-town/household"] });
  assert.deepEqual(near.map((e) => e.action).sort(), ["join", "say"]);
  assert.equal(near.find((e) => e.action === "join").via, "in reach");
  // and standing INSIDE it reads as a different fact again
  const within = resolveAffordances({ marks, spineIds: ["the-town/household"], reachIds: [] });
  assert.equal(within.find((e) => e.action === "join").via, "within");
});

test("the actor kind fences the palette, and a null kind describes the whole law", () => {
  const marks = [
    classMark("the-town/resident", [{ action: "say" }], { ambient: true }),
    classMark("the-town/human", [{ action: "say", for: "human" }], { ambient: true }),
    classMark("the-town/berth", [{ action: "say", for: "berth" }], { ambient: true }),
  ];
  assert.deepEqual(resolveAffordances({ marks, actorKind: "resident" }).map((e) => e.from), ["the-town/resident"]);
  assert.deepEqual(resolveAffordances({ marks, actorKind: "human" }).map((e) => e.from), ["the-town/human"]);
  assert.deepEqual(resolveAffordances({ marks, actorKind: "berth" }).map((e) => e.from), ["the-town/berth"]);
  // an actor kind nothing is minted for gets an empty palette, not a default one
  assert.deepEqual(resolveAffordances({ marks, actorKind: "seagull" }), []);
  assert.equal(resolveAffordances({ marks, actorKind: null }).length, 3);
});

test("the blurb is QUOTED from the residue, capped, and an unresolved pointer says so", () => {
  const long = "x".repeat(BLURB_MAX + 40);
  const marks = [classMark("the-town/resident", [
    { action: "say", residue: "the-town/sound" },
    { action: "walk", residue: "the-town/nowhere" },
    { action: "wave", blurb: "an inline blurb from pre-pointer law" },
  ], { ambient: true })];
  const residueOf = residueLookupFromMarks([residueMark("the-town/sound", long, { radius_m: 60 })]);
  const out = resolveAffordances({ marks, residueOf });
  const say = out.find((e) => e.action === "say");
  assert.equal(say.blurb.length, BLURB_MAX, "the class grammar's own cap");
  assert.equal(say.blurb_from, "the-town/sound");
  assert.deepEqual(say.dials, { radius_m: 60 }, "the act's physics ride with it");
  const walk = out.find((e) => e.action === "walk");
  assert.equal(walk.residue_unresolved, "the-town/nowhere", "a pointer that cannot resolve is said out loud");
  assert.equal(walk.blurb_from, undefined);
  const wave = out.find((e) => e.action === "wave");
  assert.equal(wave.blurb, "an inline blurb from pre-pointer law");
});

test("the residue lookup quotes only the town's own constitution", () => {
  const lookup = residueLookupFromMarks([
    residueMark("the-town/sound", "the town's own", {}),
    { id: "rei/sound", by: "rei", tier: "market", class: "sound", body: "a resident's copy" },
    { id: "the-town/unclassed", by: "the-town", tier: "constitution", body: "no class" },
  ]);
  assert.equal(lookup("the-town/sound").text, "the town's own");
  assert.equal(lookup("rei/sound"), null, "a resident cannot author a meaning the door quotes");
  assert.equal(lookup("the-town/unclassed"), null);
  assert.equal(lookup("nothing"), null);
});

test("the client's half of the gate admits only grant-minting town constitution in the works", () => {
  const works = { id: "the-town/the-keeping-works", by: "the-town", tier: "constitution" };
  const marks = [
    works,
    classMark("the-town/resident", [{ action: "say" }]),                              // admitted
    { ...classMark("the-town/parcel", []), actions: [] },                             // no grants: not a verb-minter
    { ...classMark("rei/forgery", [{ action: "say" }]), by: "rei" },                  // not the town's
    { ...classMark("the-town/draft", [{ action: "say" }]), tier: "market" },          // not constitution
    { ...classMark("the-town/elsewhere", [{ action: "say" }]), placementParent: null }, // not in the works
  ];
  assert.deepEqual(classMarksIn(marks).map((m) => m.id), ["the-town/resident"]);
});

test("the placement walk terminates on a cycle rather than hanging the browser", () => {
  const a = { id: "a", placementParent: "b" }, b = { id: "b", placementParent: "a" };
  const stands = placementWalkStandsInTheWorks([a, b]);
  assert.equal(stands(a), false);
});

// ── the record itself, not a fixture ─────────────────────────────────────────
test("THE LIVE RECORD: four class marks mint twelve grants, and every residue resolves", () => {
  // The step-7 brief said grants live on "~26 class marks". The record says
  // FOUR, minting twelve. Asserting the real numbers here means the next person
  // reads them off a test instead of off a brief.
  //
  // Read from the RECORD, not from world-state.json: the fold is a build
  // artifact that lags the mark files, and a test that quietly skips when the
  // artifact is stale is a test that cannot fail.
  const files = readdirSync(join(ROOT, "WORLD/marks"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith("mark.md"));
  const marks = [];
  for (const rel of files) {
    const abs = join(ROOT, "WORLD/marks", rel);
    const rec = parseRecord(readFileSync(abs, "utf8"), abs);
    if (!rec) continue;
    // the id the fold gives a mark is `<by>/<slug>`; the slug is its directory
    const slug = rel.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2)[0];
    marks.push({ ...rec, id: `${rec.by}/${slug}`, placementParent: "the-town/the-keeping-works" });
  }
  const granting = marks.filter((m) => m.by === "the-town" && m.tier === "constitution" && declaredGrants(m).length);
  assert.equal(granting.length, 4, "four class marks mint verbs today");
  assert.equal(granting.reduce((n, m) => n + declaredGrants(m).length, 0), 12, "twelve grants across them");

  const residueOf = residueLookupFromMarks(marks);
  const all = resolveAffordances({ marks: granting, actorKind: null, reachIds: granting.map((m) => m.id), residueOf });
  assert.equal(all.length, 12);
  for (const e of all) {
    assert.ok(e.action, "every entry names an action");
    assert.ok(!e.residue_unresolved, `residue pointer resolves: ${e.action} -> ${e.residue_unresolved}`);
    assert.ok(e.blurb.length > 0 && e.blurb.length <= BLURB_MAX, `${e.action} quotes its residue within the cap`);
  }
  // the resident's own palette is the nine ambient grants; the human's is one
  const asResident = resolveAffordances({ marks: granting, actorKind: "resident", reachIds: granting.map((m) => m.id), residueOf });
  assert.equal(asResident.length, 10, "nine on the resident class + join on the household class");
  const asHuman = resolveAffordances({ marks: granting, actorKind: "human", reachIds: granting.map((m) => m.id), residueOf });
  assert.deepEqual(asHuman.map((e) => e.action), ["say"], "the human class mints exactly one voice");
});
