#!/usr/bin/env node
// world-carve-live.test.mjs — the falsifiers, run against THE REAL WORLD.
//
// Everything in determination.test.mjs and consent.test.mjs is a two-rectangle
// fixture, which is how you check that a rule says what you think it says. This
// file checks something else: that the rule, turned loose on the 612 marks the
// town has actually made, moves EXACTLY what was predicted and nothing else.
//
// Escrow comes from WORLD/fixtures/stakes-2026-08-10.json — the town's own
// derived export (`node tools/world-stake.mjs --escrow --json` in a town clone at
// keeminlee/postmark 8a31403, re-derived byte-identical at 0ca018d), pinned here
// so this file can fail. Folded with zero escrow every weight is zero, every
// assertion below is vacuous, and the test would pass while proving nothing.
//
// The household grain comes from WORLD/fixtures/households-declared-2026-08-10.json
// — handle → DECLARED HOUSEHOLD SLUG, projected by tools/households-project.mjs
// from the town's own tools/households.json. NOT from WORLD/households.json, which
// is stale (2026-08-07) and keyed by credential id, a grain that files one
// household's two accounts as strangers. Both facts are asserted below rather than
// trusted.
//
// Run: node --test tools/world-carve-live.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fold, loadMarks } from "./marks-fold.mjs";
import { isRegionContainer } from "./consent.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const marks = loadMarks(join(ROOT, "WORLD/marks"));
const terrain = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const households = JSON.parse(readFileSync(join(ROOT, "WORLD/fixtures/households-declared-2026-08-10.json"), "utf8")).households;
const staleCanon = JSON.parse(readFileSync(join(ROOT, "WORLD/households.json"), "utf8"));
const stakes = JSON.parse(readFileSync(join(ROOT, "WORLD/fixtures/stakes-2026-08-10.json"), "utf8"));
const state = fold({ marks, terrain, stakes, households, tick: 1 });
const w = (id) => state.marks.find((m) => m.id === id)?.weight;
const groundContests = state.rivalries.filter((r) => r.kind === "region");

test("the fixture is live: the world folds with real escrow, or every assertion below is vacuous", () => {
  assert.ok(marks.length >= 600, `the real tree, not a fixture (${marks.length} marks)`);
  assert.ok(stakes.length > 0 && stakes.some((s) => s.n > 0), "real open positions");
  assert.ok(state.marks.some((m) => m.weight > 0), "and they reached the fold");
  assert.equal(state.errors.length, 0, "the world folds clean");
});

// ── STAGE 1: the household grain ─────────────────────────────────────────────

test("SOVEREIGNTY FLIP: rei's white flower stands inside wright's parcel, and one household holds both handles", () => {
  // The live instance of the grain defect. `rei` and `wright` are both pinned to
  // gh:67605380 — one person, two handles — so the flower standing in the trueing
  // house's parcel was a stranger on its own household's ground: folded as a
  // commons mark, listed in the public index, exposed to rivalry.
  assert.equal(households["rei"], households["wright"], "the premise: one declared household (starforge)");
  assert.notEqual("rei", "wright", "…reached by two different handles");

  const flower = state.marks.find((m) => m.id === "rei/the-white-flower-at-wrights-door");
  assert.ok(flower, "the mark is there");
  assert.equal(flower.sovereign, true, "and it is sovereign on its own household's ground");

  // and it is genuinely a CROSS-HANDLE case: the parcel is wright's, not rei's
  const parcel = state.parcels.find((p) => p.id === "wright/the-trueing-house-parcel");
  assert.ok(parcel, "the parcel is wright's");
  assert.notEqual(parcel.household, flower.household);

  // the consequence: a sovereign mark leaves the commons, so the rivalry it was
  // in leaves with it. Before the grain fix this pair was a live 2-mark contest.
  const named = new Set(groundContests.flatMap((r) => r.claims.map(([id]) => id)));
  assert.equal(named.has("rei/the-white-flower-at-wrights-door"), false, "it is nobody's rival now");
});

test("THE CADAEIC CASE: one declared household holding TWO accounts resolves as ONE — the case a credential key cannot express", () => {
  // cadaeic.space is declared with two accounts (vertas-marginalia gh:306985727 and
  // cadaeix-bot gh:314099683) and two residents. This is the proof case for keying
  // household law on the DECLARED SLUG rather than the credential id.
  assert.equal(households["vertas-marginalia"], "cadaeic.space");
  assert.equal(households["arky"], "cadaeic.space", "one house, whichever account the resident signs with");

  // and the defect, stated against the file that still carries it: the shipped
  // WORLD/households.json splits this household in two.
  assert.notEqual(staleCanon.households["vertas-marginalia"], staleCanon.households["arky"],
    "the credential-keyed export files two residents of one house as strangers");

  // …with the consequence that matters. arky has left no mark yet, so this is the
  // real registry and vertas's REAL parcel with the one mark that does not exist
  // yet — the day arky sets something down inside their own household's ground, it
  // is sovereign, and under the credential key it would not have been.
  const fence = state.parcels.find((p) => p.id === "vertas-marginalia/la-lanterne-parcel");
  assert.ok(fence, "vertas holds a real parcel");
  const arkysMark = {
    id: "arky/a-lantern-of-my-own", slug: "a-lantern-of-my-own", by: "arky", household: "arky",
    kind: "sited", tier: "market", at: { x: fence.at.x, y: fence.at.y }, extent: { w: 4, h: 4 },
    date: "2026-08-10", body: "a lantern of my own",
  };
  const withArky = fold({ marks: [...marks, arkysMark], terrain, stakes, households, tick: 1 });
  assert.equal(withArky.marks.find((m) => m.id === "arky/a-lantern-of-my-own").sovereign, true,
    "sovereign on their own household's ground");

  const underCredentialKey = fold({ marks: [...marks, arkysMark], terrain, stakes, households: staleCanon.households, tick: 1 });
  assert.equal(underCredentialKey.marks.find((m) => m.id === "arky/a-lantern-of-my-own").sovereign, false,
    "and a stranger there under the credential key — this is the whole difference");
});

test("the declared grain is INERT on today's world — it corrects the key without moving the world", () => {
  // Every credential-id group of more than one handle in the stale export is
  // covered exactly by one declared household, so no family SPLITS under the new
  // grain; the only join it makes is cadaeic.space, whose second resident has left
  // no mark. A regrain that quietly moved weights would be a migration, not a fix.
  const byCred = new Map();
  for (const [h, k] of Object.entries(staleCanon.households)) byCred.set(k, [...(byCred.get(k) ?? []), h]);
  for (const [k, hs] of byCred) {
    if (hs.length < 2) continue;
    const slugs = new Set(hs.map((h) => households[h] ?? `solo:${h}`));
    assert.equal(slugs.size, 1, `${k} [${hs.join(", ")}] must stay one household, not split into ${[...slugs].join(" | ")}`);
    assert.ok(!String([...slugs][0]).startsWith("solo:"), `${k} must be a DECLARED household, not an undeclared remainder`);
  }
  const underCredentialKey = fold({ marks, terrain, stakes, households: staleCanon.households, tick: 1 });
  const before = new Map(underCredentialKey.marks.map((m) => [m.id, `${m.weight}|${m.sovereign}`]));
  for (const m of state.marks) assert.equal(before.get(m.id), `${m.weight}|${m.sovereign}`, `${m.id} must not move on the regrain`);

  // …AND the two grains must still be genuinely different laws, or "inert" means
  // nothing. Everything above asserts SAMENESS, which is exactly what a mutation
  // collapsing the two sources into one map would also produce: the test would
  // then be comparing a fold to itself and would report the regrain as safe no
  // matter what it did. So prove the difference is observable — put a mark under
  // arky, the one resident the two grains disagree about, and require the answers
  // to diverge. Inertness on today's tree is then a fact about today's MARKS, not
  // an accident of the two maps having become the same thing.
  const fence = state.parcels.find((p) => p.id === "vertas-marginalia/la-lanterne-parcel");
  const arkysMark = {
    id: "arky/a-lantern-of-my-own", slug: "a-lantern-of-my-own", by: "arky", household: "arky",
    kind: "sited", tier: "market", at: { x: fence.at.x, y: fence.at.y }, extent: { w: 4, h: 4 },
    date: "2026-08-10", body: "a lantern of my own",
  };
  const declaredWithArky = fold({ marks: [...marks, arkysMark], terrain, stakes, households, tick: 1 });
  const credentialWithArky = fold({ marks: [...marks, arkysMark], terrain, stakes, households: staleCanon.households, tick: 1 });
  assert.notEqual(
    declaredWithArky.marks.find((m) => m.id === "arky/a-lantern-of-my-own").sovereign,
    credentialWithArky.marks.find((m) => m.id === "arky/a-lantern-of-my-own").sovereign,
    "the two grains must disagree where they genuinely differ, or this whole test is comparing a fold to itself",
  );
});

test("one-parcel-per stays at HANDLE grain — the Reeves legally hold four", () => {
  // MARKS.md § Parcels: "every resident-handle may hold one parcel". The grain
  // ruling moved every CONFLICT rule to the household and left this one where the
  // written law puts it, so the reeves household's four parcels all stand. (The
  // Reeves are single-account, so they pass under either grain — which is exactly
  // why cadaeic, above, is the falsifier that can only pass under the declared one.)
  const reeves = state.parcels.filter((p) => households[p.household] === "reeves");
  assert.equal(reeves.length, 4, "four parcels, four handles, one household");
  assert.equal(new Set(reeves.map((p) => p.household)).size, 4, "one apiece");
  assert.equal(state.errors.filter((e) => /already holds a parcel|claim capped/.test(e.error ?? "")).length, 0);
});

// ── STAGE 2: the region carve ────────────────────────────────────────────────

test("THE PANDO SLOT DISSOLVES: 28 marks are no longer one contest, and the peak keeps its ground", () => {
  // Before: one site-slot chained 28 marks — a peak, its porch, its garden, five
  // trees, a lantern hook — totalling 194 with a 46% top share, which is below the
  // 50% determine threshold and therefore VAGUE FOREVER by construction.
  const pandoIds = new Set(state.marks
    .filter((m) => m.at && Math.abs(m.at.x + 95458) < 2000 && Math.abs(m.at.y + 95458) < 2000)
    .map((m) => m.id));
  assert.ok(pandoIds.size >= 20, "the Pando neighbourhood is still densely built");

  // no slot rivalry survives there at all
  assert.equal(state.rivalries.filter((r) => r.kind === "slot").length, 0);

  // the contests that remain are intersection-only and cross-household, every one
  const pando = groundContests.filter((r) => r.claims.some(([id]) => pandoIds.has(id)));
  for (const c of pando) {
    const creds = new Set(c.claims.map(([id]) => households[state.marks.find((m) => m.id === id).household] ?? id));
    assert.ok(creds.size > 1, `${c.claims.map(([i]) => i).join(" vs ")} — a contest needs two households`);
    assert.ok(c.determined !== null, "and every one of them RESOLVES, where the 28-mark slot never could");
  }

  // vermillion's peak keeps the meadow. Its own garden, view-peak and lake caves
  // hold their own cells inside it — that is composition, and the overlay files it
  // as `within`. What it LOSES, to another household, is 90 m² out of 12,960,000:
  // a lantern hook, a pot, a window, a lantern, a wall line.
  const peak = state.determination["vermillion/the-pando-peak"];
  assert.ok(peak, "the peak has an overlay");
  assert.equal(peak.held_area + peak.within_area + peak.lost_area + peak.vague_area, peak.area, "the overlay tiles the claim exactly");
  assert.ok(peak.lost_area > 0, "it genuinely loses the cells the dense foreign claims hold");
  assert.ok(peak.lost_area / peak.area < 0.0001, `and only those — ${peak.lost_area} m² of ${peak.area}`);
  assert.ok(peak.within_area > peak.lost_area * 1000, "what looks like loss is overwhelmingly its own composition");
});

test("the dense pond carves the thin meadow, live: every mark that takes ground off the peak is denser than it", () => {
  const peakArea = 3600 * 3600;
  const peakDensity = w("vermillion/the-pando-peak") / peakArea;
  const takers = new Set((state.determination["vermillion/the-pando-peak"].lost ?? []).map((r) => r.to));
  assert.ok(takers.size >= 4, `several claims carve out of the peak (${[...takers].join(", ")})`);
  for (const id of takers) {
    const m = state.marks.find((x) => x.id === id);
    const d = m.weight / (m.extent.w * m.extent.h);
    assert.ok(d > peakDensity, `${id} at ${d.toExponential(2)} is denser than the peak at ${peakDensity.toExponential(2)}`);
  }
});

test("the carve is an OVERLAY on the real world — not one claim on disk was moved or resized", () => {
  // The falsifier for "derived, never stored", run over all 612: every published
  // position and extent is byte-identical to the record the fold read.
  const onDisk = new Map(marks.filter((m) => !m._error).map((m) => [m.id, m]));
  for (const m of state.marks) {
    const rec = onDisk.get(m.id);
    assert.deepEqual(m.at, rec.at, `${m.id} at`);
    assert.deepEqual(m.extent, rec.extent, `${m.id} extent`);
    assert.deepEqual(m.points ?? null, rec.points ?? null, `${m.id} points`);
  }
  assert.equal(state.marks.length, onDisk.size, "and nobody is missing");
});

// ── STAGE 3: the default table, on a world that has written no words ─────────

test("NOTHING ELSE MOVES: with no consent word anywhere, exactly the predicted weights change and no mark is returned", () => {
  // The live world carries no `consent:` map yet, so this is the default table
  // alone. These eight are the whole of what it moves. The numbers were predicted
  // before the build from the shape of the tree; any ninth line here, or any of
  // these eight landing elsewhere, means the table is doing something unruled.
  const expected = {
    "the-town/let-there-be-light": 122,          // was 147
    "the-town/pando-peak": 87,                   // was 108
    "vermillion/the-pando-peak": 69,             // was 90
    "vermillion/porch-hill": 15,                 // was 22
    "vermillion/vermillion-view-peak": 12,       // was 14
    "sol-of-garrison/the-protected-grove": 7,    // was 10
    "limen/the-threshold-district": 10,          // was 11
    "limen/footpath-becomes-a-suggestion": 0,    // was 1
  };
  for (const [id, weight] of Object.entries(expected)) assert.equal(w(id), weight, id);

  assert.equal(state.returned.length, 0, "nobody has spoken, so nobody is returned");
  assert.equal(state.marks.filter((m) => m.kept).length, 0, "and nobody is kept");
});

test("wright's trueing terrace KEEPS its 6 — the one place the credential grain changed the prediction", () => {
  // Measured at handle grain this mark was expected to fall 6 → 0, because its
  // only backed child is `rei/the-white-flower-at-wrights-door` and rei is not
  // wright. At credential grain they are one household, so the edge is structural
  // and the weight stays. Recorded here as its own falsifier because it is the
  // exact difference between the two grains, on the real tree.
  assert.equal(w("wright/the-trueing-terrace"), 6);
  assert.equal(households["rei"], households["wright"]);
});

test("the town's region containers take fan-up by CLASS, and no resident district does", () => {
  for (const id of ["the-town/let-there-be-light", "the-town/pando-peak", "the-town/the-town-centre"]) {
    const m = state.marks.find((x) => x.id === id);
    assert.ok(m, id);
    assert.ok(m.weight > 0, `${id} is as real as what stands in it`);
  }
  // the marker is the town's alone — no resident-authored mark carries it
  const claimed = marks.filter(isRegionContainer);
  assert.deepEqual([...new Set(claimed.map((m) => m.by))], ["the-town"]);
  assert.equal(claimed.length, 3, "seeded on the obvious three, and nothing else");
});
