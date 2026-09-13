// town-ground.test.mjs — the falsifier for "all world visuals are from the world".
//
// Founder, 2026-09-08: "no more atlas background, all world visuals are from the
// world." `townGround()` answers it. This is the assertion that the answer is
// true, and the hard part is choosing an assertion that CAN FAIL.
//
// A SCREENSHOT DIFF WOULD PASS ON A HARDCODED RING. So would "the page paints",
// and so would "the ground contains twelve polygons". Each of those confirms
// that something was drawn; none of them asks where the numbers came from. The
// question is provenance, so the test reads provenance:
//
//   1. EVERY drawn element names a source in `data-src`, and the only elements
//      exempt are the sheet itself (paper, rule wash) and what sits in <defs>.
//      A new hardcoded shape has no source and reddens here.
//   2. Every source RESOLVES against the record — a mark id that the marks
//      index holds, a feature id skeleton.features holds, a night enclave
//      skeleton.light holds, or the day axis with both its poles present. An
//      invented source reddens here.
//   3. Every mark-sourced polygon MATCHES the mark it names — vertex for vertex,
//      projected back through the registration into metres, to the ground's
//      own grain (it writes a tenth of a px; 0.25 m at 5 m per px). This is
//      the one with teeth: a ring copied out of the atlas and labelled with a
//      mark's id passes (1) and (2) and dies here, and so does a ring that stops
//      tracking a region the record has since moved.
//
// (3) is deliberately a BACK-PROJECTION rather than a re-derivation. Re-deriving
// the ground and comparing it to itself is an identity assertion, which is the
// defect this lane's own carry names: verifying a claim and watching it are two
// acts, and only the second is a test. Back-projection compares two independent
// things — what the svg says, and what the record says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { townGround, townRegionMarks, townWaterShapes } from "../spectator/viewer.mjs";
import { REGION_SLUGS } from "./region-outsiders.mjs";
// the TREE, for the Headland: its mark is on disk, and folding it into
// world-state.json is the keeper's act not this lane's — so the region tests
// read the record where the mark actually stands, and hold whether or not the
// served fold has caught up (it had not on 09-08; it had by S64 on 09-09)
import { loadMarks } from "./marks-fold.mjs";
import { polygonOf, pointInPolygon } from "./geometry.mjs";

/** ground two rings both hold, in hectares — 1 m cells, bbox-bounded */
function sharedHectares(A, B) {
  const ax = A.map((p) => p.x), ay = A.map((p) => p.y);
  const bx = B.map((p) => p.x), by = B.map((p) => p.y);
  const x0 = Math.max(Math.min(...ax), Math.min(...bx)), x1 = Math.min(Math.max(...ax), Math.max(...bx));
  const y0 = Math.max(Math.min(...ay), Math.min(...by)), y1 = Math.min(Math.max(...ay), Math.max(...by));
  if (x1 <= x0 || y1 <= y0) return 0;                 // the bounding boxes miss: nothing shared
  let n = 0;
  for (let x = x0; x <= x1; x += 1)
    for (let y = y0; y <= y1; y += 1)
      if (pointInPolygon(x, y, A) && pointInPolygon(x, y, B)) n++;
  return n / 10000;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const world = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const VIEWER = readFileSync(join(ROOT, "spectator/viewer.mjs"), "utf8");

// the registration the page itself parses, read from the record the same way
const om = String(skeleton._grid?.origin ?? "").match(/\((\d+)\s*,\s*(\d+)\)/);
const sm = String(skeleton._grid?.scale ?? "").match(/(\d+(?:\.\d+)?)\s*m per atlas px/);
const originPx = { x: +om[1], y: +om[2] }, mPerPx = +sm[1];
// the ground writes svg coordinates to a tenth of a px (viewer.mjs, `toFixed(1)`),
// so a vertex comes back through the registration within half of that, in
// metres: 0.05 px × 5 m per px = 0.25 m. The tolerance is the instrument's own
// resolution, read off the record's scale — not a number chosen to be green.
// (S64, 2026-09-09: a 0.1 m pin turned red on the Headland's decimal trace the
// first time the fold carried it; postmark#2618.)
const GRAIN_M = 0.05 * mPerPx + 1e-9;
const ground = () => townGround(world.marks, skeleton, { originPx, mPerPx });

// the sheet: the paper and the ruled wash carry no geometry of their own
const SHEET = new Set(["wv-tg-paper", "wv-tg-rule"]);
const DRAWN = /<(polygon|polyline|line|circle|ellipse|rect|text|path)\b([^>]*)>/g;

/** every drawn element OUTSIDE <defs> */
function drawnElements(svgText) {
  const body = svgText.replace(/<defs>[\s\S]*?<\/defs>/g, "");
  const out = [];
  for (const m of body.matchAll(DRAWN)) {
    const attrs = m[2];
    const cls = (attrs.match(/class="([^"]*)"/) ?? [, ""])[1].split(/\s+/);
    out.push({
      tag: m[1], attrs, classes: cls,
      src: (attrs.match(/data-src="([^"]*)"/) ?? [, null])[1],
      points: (attrs.match(/points="([^"]*)"/) ?? [, null])[1],
    });
  }
  return out;
}

/** the record's answer for a source token, or null if the record does not hold it */
function resolveSource(src) {
  const [kind, ...rest] = String(src).split(":");
  const id = rest.join(":");
  if (kind === "mark") return world.marks.find((m) => m.id === id) ?? null;
  if (kind === "feature") return (skeleton.features ?? []).find((f) => f.id === id) ?? null;
  if (kind === "light" && id === "day-axis")
    return Number.isFinite(skeleton.light?.dawn_pole_m?.x) && Number.isFinite(skeleton.light?.dark_pole_m?.x)
      ? skeleton.light : null;
  if (kind === "light") return (skeleton.light?.night_enclaves ?? []).find((e) => e.id === id) ?? null;
  return null;
}

test("THE FOUNDER'S SENTENCE: every drawn element on the town's ground names its source", () => {
  const els = drawnElements(ground().svgText);
  assert.ok(els.length > 20, `the ground draws something (${els.length} elements)`);
  const unsourced = els
    .filter((e) => !e.src && !e.classes.some((c) => SHEET.has(c)))
    .map((e) => `${e.tag} class="${e.classes.join(" ")}"`);
  assert.deepEqual(unsourced, [],
    "an element with no data-src is an element drawn from somewhere that is not the world");
});

test("…and every source RESOLVES in the record — a name the record does not hold is a fabrication", () => {
  const bad = drawnElements(ground().svgText)
    .filter((e) => e.src && !resolveSource(e.src))
    .map((e) => e.src);
  assert.deepEqual([...new Set(bad)], [], "these data-src tokens name nothing the record holds");
});

test("…and every mark-sourced ring IS that mark's ring, vertex for vertex, back in metres", () => {
  const g = ground();
  const drift = [];
  for (const e of drawnElements(g.svgText)) {
    if (!e.points || !e.src?.startsWith("mark:")) continue;
    const mark = resolveSource(e.src);
    const ring = mark?.points ?? [];
    const drawn = e.points.trim().split(/\s+/).map((p) => p.split(",").map(Number));
    if (drawn.length !== ring.length) { drift.push(`${e.src}: ${drawn.length} vertices drawn, ${ring.length} on the mark`); continue; }
    for (let i = 0; i < ring.length; i++) {
      // back through the registration: ground units → metres
      const mx = (drawn[i][0] - g.originPx.x) * g.mPerPx, my = (drawn[i][1] - g.originPx.y) * g.mPerPx;
      const [rx, ry] = Array.isArray(ring[i]) ? ring[i] : [ring[i].x, ring[i].y];
      if (Math.abs(mx - rx) > GRAIN_M || Math.abs(my - ry) > GRAIN_M)
        { drift.push(`${e.src} vertex ${i}: drawn (${mx},${my}) vs record (${rx},${ry})`); break; }
    }
  }
  assert.deepEqual(drift, [], "a drawn ring must be the mark's own ring, not a copy of one");
});

test("THE HEADLAND IS A REGION — the thirteenth, in the tree, drawn like the twelve", () => {
  // Founder-ruled 2026-09-08: "yes, the headland should be a region." It had been
  // on the atlas as PROVISIONAL since 2026-07-21 and in no mark and no skeleton
  // feature at all — the map showing a thing the record did not claim.
  assert.ok(REGION_SLUGS.includes("the-headland"), "the roster holds it");
  assert.equal(REGION_SLUGS.length, 13, "and is thirteen now");

  // read from the TREE, not from world-state.json. world-state.json is the
  // SETTLEMENT's artifact — every commit that touches it is a sweep — and a
  // build lane does not write the keeper's surface. So the mark is on disk and
  // the fold publishes it at the next crossing; until then the served record
  // holds twelve and the page draws twelve, which is correct, not a failure.
  const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const headland = tree.find((m) => m.id === "claude-of-tulip/the-headland");
  assert.ok(headland, "the mark stands in the tree, filed by identity per the freeze");
  assert.equal(headland.by, "claude-of-tulip", "founded by the resident Ferry told it was his to found");

  const [cited, quote] = String(headland.derived_from ?? "").split(/\s+—\s+/);
  assert.ok(cited && quote, "derived_from names a file and quotes it");

  // a vertex count, like a region count, is a number that moves: the clip that
  // keeps the ring out of spar's ground adds vertices along the border, and
  // will add or drop more if either ring is ever retraced. What must hold is
  // that it is a RING of the same order as the twelve carry (11–31), not a
  // particular tally somebody has to remember to update.
  const twelve = REGION_SLUGS.filter((s) => s !== "the-headland")
    .map((s) => tree.find((m) => String(m.id).split("/")[1] === s && m.points?.length))
    .filter(Boolean).map((m) => m.points.length);
  assert.ok(headland.points.length >= Math.min(...twelve) && headland.points.length <= Math.max(...twelve),
    `a promontory traced from the coastline, ${headland.points.length} vertices, within the twelve's ${Math.min(...twelve)}–${Math.max(...twelve)}`);

  // and the ground draws it when handed a record that holds it
  const drawn = townGround(tree, skeleton, { originPx, mPerPx });
  const ids = [...drawn.svgText.matchAll(/<polygon class="wv-tg-region"[^>]*data-src="mark:([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 13, `thirteen washes on the ground (${ids.length})`);
  assert.ok(ids.includes("claude-of-tulip/the-headland"), "the Headland among them");
  assert.match(drawn.svgText, /<text class="wv-tg-region-label"[^>]*data-src="mark:claude-of-tulip\/the-headland"[^>]*>The Headland<\/text>/,
    "wearing its own name, through the same label rule as the twelve — unchanged");
});

test("…and the thirteenth CAN go missing: drop it from the roster and the ground draws twelve", () => {
  const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const twelve = REGION_SLUGS.filter((s) => s !== "the-headland");
  assert.equal(townRegionMarks(tree, twelve).length, 12, "the roster is what decides, and it can be wrong");
  assert.equal(townRegionMarks(tree).length, 13, "with it, thirteen");
});

test("THE CITED LETTER SAYS IT — a derived_from is a claim, and this reads it back", (t) => {
  // The first version of the Headland's mark cited the aion-solare letter of
  // 2026-07-14; not one of the phrases it quoted is in that file, and all of
  // them are in the postmaster letter of the same day. A `derived_from` is a
  // claim about where words came from, and an unchecked one is a plausible path.
  //
  // ⚠ AND THIS CHECK'S OWN FIRST VERSION HAD THE DEFECT IT EXISTS TO CATCH.
  // It lived inside the region test and, where the town clone was absent, it
  // PRINTED A LINE AND PASSED. A guard that reports "I could not tell" as green
  // is the same false all-clear as an uncited quote — the day's own class, in
  // the newest code on the branch. It is its own test now so it can SKIP, out
  // loud, exactly as tools/town-ground-page.test.mjs skips when Playwright is
  // missing. A skip is not a pass.
  //
  // The world repo does not own WHITE_PAGES and must never red for its absence,
  // which is why this is a skip rather than a failure.
  const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const headland = tree.find((m) => m.id === "claude-of-tulip/the-headland");
  assert.ok(headland, "the mark stands in the tree");
  const [cited, quote] = String(headland.derived_from ?? "").split(/\s+—\s+/);
  assert.ok(cited && quote, "derived_from names a file and quotes it");

  const townClone = join(ROOT, "..", "..", "..", "Starstory", "MEEPS", "postmark");
  const letter = join(townClone, cited);
  if (!existsSync(letter)) return t.skip(
    `the town clone is not at ${townClone}, so the quote in the Headland's derived_from is UNCHECKED — `
    + `nothing here would notice it citing a letter that does not contain it, which is exactly the defect `
    + `this test was written for (${cited})`);

  const said = readFileSync(letter, "utf8");
  const spoken = quote.replace(/^"|"$/g, "");
  assert.ok(said.includes(spoken), `the cited letter actually says it, verbatim: ${cited}`);
  // and it can fail: a phrase the letter does not carry is not found in it
  assert.ok(!said.includes("a basalt promontory where sound carries strangely"),
    "a plausible paraphrase is not in the letter — so `includes` is really reading it");
});

test("BORDER, NOT ENTER: no two region rings share more than 0.05 ha of ground", () => {
  // The founder, 2026-07-21, on the Headland's own neck (quoted in the
  // renderer's HEADLAND_INLAND block): the wash closes across the neck so the
  // two regions MEET. Meeting is not entering. Until 2026-09-08 the record had
  // no overlapping region pair at all — the recession's "rings tile" — and the
  // Headland's raw trace would have made it the first, by 0.87 ha.
  //
  // The cap is 0.05 ha rather than zero because a polygon chord cannot follow a
  // curve exactly; the clip under-claims by a metre for the same reason the
  // recession does, and what is left is chord slack, not a claim.
  const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const rings = REGION_SLUGS
    .map((slug) => tree.find((m) => String(m.id).split("/")[1] === slug && m.points?.length))
    .filter(Boolean)
    .map((m) => ({ id: m.id, ring: polygonOf(m) }));
  assert.ok(rings.length >= 13, `every region on the roster carries a ring (${rings.length})`);

  const over = [];
  for (let i = 0; i < rings.length; i++)
    for (let j = i + 1; j < rings.length; j++) {
      const ha = sharedHectares(rings[i].ring, rings[j].ring);
      if (ha > 0.05) over.push(`${rings[i].id} × ${rings[j].id}: ${ha.toFixed(3)} ha`);
    }
  assert.deepEqual(over, [], "regions border one another; they do not enter one another");
});

test("…and it CAN fail: the Headland's unclipped trace is caught", () => {
  // the flip is the ring as it stood before the clip — the same 13 vertices the
  // trace produces with `clipToNeighbours` skipped. If this ever stops being
  // caught, the cap above has stopped meaning anything.
  const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const spar = polygonOf(tree.find((m) => m.id === "spar/the-doubled-coast"));
  const unclipped = `-1441.1,5525.1 -1679.9,5728.7 -1928.4,5929.4 -2177.7,6143.1 -2392.4,6330.2 -2133.8,6588.7 -1780.1,6645.3 -1420,6466.3 -1163.5,6150.6 -1037,5868.1 -944.9,5674.8 -1042.4,5477.5 -1237.2,5423.9`
    .split(" ").map((s) => { const [x, y] = s.split(",").map(Number); return { x, y }; });
  assert.ok(sharedHectares(unclipped, spar) > 0.05,
    "the raw trace really does enter spar's ground, so the cap has something to catch");

  const clipped = polygonOf(tree.find((m) => m.id === "claude-of-tulip/the-headland"));
  assert.ok(sharedHectares(clipped, spar) <= 0.05, "and the committed ring does not");
});

test("THE GROUND CARRIES THE HEADLAND — and the tree never draws less than the served record", () => {
  // Written 2026-09-08 as a pinned DIFF: "exactly one wash and one name arrive,
  // and nothing leaves", read between the served fold (which had not yet caught
  // up) and the tree (where the mark already stood). The first fold that carried
  // the Headland made that diff lawfully EMPTY and the test red — S64, 09-09,
  // refused on it: an instrument placed at a moment, measuring itself
  // (postmark#2618). A founding diff is not a permanent invariant. What IS
  // permanent is the relation the diff was standing in for: the Headland is on
  // the ground the tree draws, and the tree draws every region the served
  // record draws — a founding adds, it does not displace.
  const tree = loadMarks(join(ROOT, "WORLD/marks")).filter((m) => !m._error);
  const drawnIn = (marks) => [...townGround(marks, skeleton, { originPx, mPerPx }).svgText
    .matchAll(/class="wv-tg-(region|region-label)"[^>]*data-src="mark:([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);

  const served = drawnIn(world.marks);   // the record as the settlement last published it
  const drawn = drawnIn(tree);           // the record where the marks stand now

  for (const token of ["region:claude-of-tulip/the-headland", "region-label:claude-of-tulip/the-headland"])
    assert.ok(drawn.includes(token), `the founding is on the ground: ${token}`);
  assert.deepEqual(served.filter((x) => !drawn.includes(x)), [],
    "and not one region leaves — a founding adds, it does not displace");

  // the relation CAN fail: a tree that has lost a region draws less than the record
  const lost = townRegionMarks(tree)[0].id;
  const lessened = drawnIn(tree.filter((m) => m.id !== lost));
  assert.ok(served.some((x) => !lessened.includes(x)), `dropping ${lost} is caught as a region leaving`);
});

test("THE ROSTERS ARE THE RECORD'S, not this file's: every region on them, and the water, ringed", () => {
  // RELATIONAL, never a literal count — the roster grows (it grew today) and a
  // test naming a number goes red on its own the next time the town founds
  // something. It asserts that the ground draws every region the record it was
  // handed actually holds, which stays true across a founding and across the
  // settlement that publishes one.
  const regions = townRegionMarks(world.marks);
  const ringedOnRoster = REGION_SLUGS
    .filter((s) => world.marks.some((m) => String(m?.id ?? "").split("/")[1] === s && m.points?.length));
  assert.equal(regions.length, ringedOnRoster.length,
    `every region the SERVED record holds is drawn (${regions.map((m) => m.id).join(", ")})`);
  // today that is twelve, because the Headland's mark is on disk and the
  // settlement has not folded it into world-state.json yet. Stated as a fact
  // with its own retirement condition rather than asserted as a cap.
  assert.ok(regions.length >= 12, `at least the twelve (${regions.length})`);
  const waters = townWaterShapes(world.marks, skeleton);
  assert.ok(waters.length >= 6, `the inland water and the sea (${waters.length})`);
  const svg = ground().svgText;
  for (const m of regions) assert.match(svg, new RegExp(`data-src="mark:${m.id}"`), `${m.id} is drawn`);
  for (const w of waters) assert.match(svg, new RegExp(`data-(src|feature)="(mark:)?${w.feature.id}"`), `${w.feature.id} is drawn`);
});

test("A FLOOR UNDER OMISSION: every skeleton feature that has geometry is ON the ground", () => {
  // Every other assertion in this file checks that what IS drawn is honest.
  // None of them notices something QUIETLY MISSING — drop a `kind` from the
  // filter and a whole feature leaves the map with every test still green.
  // Presence is a different question from provenance and needs its own floor.
  //
  // THE RULE HAS TWO SPELLINGS, and stating only the first would be wrong about
  // six of the thirteen. A feature whose outline lives on a mark's `points:` is
  // drawn by the WATER pass and sourced `mark:<mark id>` with the feature named
  // in `data-feature`; the rest are drawn from the skeleton's own geometry and
  // sourced `feature:<id>`. Both are "on the ground"; neither is optional.
  const svg = ground().svgText;
  const GEOMETRY = ["line_m", "trees_m", "at_m", "centerline_m", "ring_m", "center_m"];
  const hasGeometry = (f) => GEOMETRY.some((k) => f[k] !== undefined);

  const missing = [];
  for (const f of skeleton.features ?? []) {
    if (!hasGeometry(f)) continue;
    const asFeature = svg.includes(`data-src="feature:${f.id}"`);
    const asWater = svg.includes(`data-feature="${f.id}"`);
    if (!asFeature && !asWater) missing.push(f.id);
  }
  assert.deepEqual(missing, [], "a feature the skeleton gives geometry to is not on the map");

  // ferrys-route is the ONE exclusion and it is excluded by name, with its
  // reason, rather than by a filter that would silently swallow the next one:
  // the record itself says it has no shape yet — "geometry derived per-crossing
  // from delivery walk; v0 symbolic" — so there is nothing to draw.
  const ferry = (skeleton.features ?? []).find((f) => f.id === "ferrys-route");
  assert.ok(ferry, "the route is still on the record");
  assert.equal(hasGeometry(ferry), false,
    "ferrys-route carries no geometry — if it ever does, this test starts requiring it on the ground");
  assert.doesNotMatch(svg, /data-src="feature:ferrys-route"/, "and nothing is drawn for it meanwhile");

  // the count is stated so a feature vanishing from the SKELETON is also visible
  const geometric = (skeleton.features ?? []).filter(hasGeometry);
  assert.equal(geometric.length, 12, `twelve of the thirteen features have a shape (${geometric.length})`);
});

test("…and the floor CAN fail: a feature dropped from the filter is caught", () => {
  // the flip, run against the function rather than against a mutilated source:
  // hand townGround a skeleton with one feature's geometry removed, and the
  // floor's own predicate must stop finding it on the ground
  const svg = ground().svgText;
  for (const id of ["aelyria-cliffs", "the-sea", "blackwater-bend-grove"]) {
    assert.ok(svg.includes(`data-src="feature:${id}"`) || svg.includes(`data-feature="${id}"`),
      `${id} is on the ground today`);
  }
  // remove one and the ground stops carrying it — which is exactly what the
  // floor above reads, so the floor reds
  const without = { ...skeleton, features: (skeleton.features ?? []).filter((f) => f.id !== "aelyria-cliffs") };
  const thinned = townGround(world.marks, without, { originPx, mPerPx }).svgText;
  assert.ok(!thinned.includes('data-src="feature:aelyria-cliffs"'),
    "the cliffs leave the map when the skeleton stops naming them — the floor's red condition");
  // and the rest of the ground is untouched, so the floor points at the one that left
  assert.ok(thinned.includes('data-feature="the-sea"'), "the sea is still there");
});

test("THE REGISTRATION DID NOT MOVE — the ground still stands on the skeleton's own grid", () => {
  const g = ground();
  assert.deepEqual(g.originPx, originPx, "the origin is the skeleton's Ferry's-crossing anchor");
  assert.equal(g.mPerPx, mPerPx, "the scale is the skeleton's ruled 5 m per px");
  // the day axis, projected, is the pair of numbers the ATLAS had hardcoded in
  // its own `daylight` gradient — the record was always the source and the
  // drawing had merely baked the answer. If this pair ever stops matching, the
  // ground and the drawing have genuinely diverged and someone should know.
  assert.match(g.svgText, /id="wv-tg-day"[^>]*x1="1500\.0" y1="850\.0" x2="105\.0" y2="1190\.0"/,
    "dawn (5075,450) and dark (-1900,2150) project to the atlas's own (1500,850) → (105,1190)");
});

test("THE CALL SITE PASSES A SET THAT EXISTS — a CHEAP SECOND GUARD, not the real one", () => {
  // ⚠ READ THIS BEFORE TRUSTING THIS TEST. It is a source-text regex, and a
  // regex proves a line was TYPED — never that its value reaches the screen.
  // The fresh reviewer kept this exact call site, discarded its answer, mounted
  // a blank sheet, and every assertion in this file stayed green. It is brittle
  // the other way too: reordering `mountScene`'s arguments reds it while nothing
  // about the page has changed.
  //
  // THE REAL GUARD IS `tools/town-ground-page.test.mjs`, which boots the rig and
  // counts what is actually on the mounted ground. This one is kept because it
  // costs nothing and it still runs where Playwright is absent — which is the
  // one condition in which the real guard silently stops watching.
  //
  // The bug it was written for: this lane's first call site passed `data.marks`.
  // `data` is { trueWorld, myWorld, worldState, skeleton, manifest } and there
  // is no `marks` on it. Every other assertion in this file stayed green,
  // because each one hands `townGround` the marks itself and none of them asked
  // what the PAGE hands it. A falsifier that supplies its own input cannot watch
  // the wiring.
  // the CALL, not the declaration (`export function townGround(marks, …)` sits
  // 4,000 lines above it and matches a lazier pattern — the first version of
  // this assertion caught the definition and reported `marks`)
  // ⚑ THE CALL SITE MOVED ON 2026-09-10 and this guard went red, correctly:
  // it is a source-text regex and the source text changed. The ground now reads
  // `allMarks()`, which is the assembled fold where there is one and — on the
  // resident path, which loads no fold at all — the read's own `records`,
  // carrying the town's ground set for exactly this call. The guard follows the
  // call site; it does not get to hold it still.
  //
  // The regex now accepts a CALL as well as a dotted name, because the first
  // version could only see `world.marks` and a lane that swapped in an accessor
  // reported "loadMinimap calls townGround" — a failure about the regex wearing
  // the costume of a failure about the page.
  const call = VIEWER.match(/const ground = townGround\(([A-Za-z0-9_.]+(?:\(\))?), ([A-Za-z0-9_.]+)/);
  assert.ok(call, "loadMinimap calls townGround");
  assert.equal(call[1], "allMarks()",
    "the ground reads every mark the page can speak about — the same set the pips stand on, "
    + "which is the fold where there is one and the read's records where there is not");
  assert.equal(call[2], "data.skeleton");
  // and the name it passes is a thing the module actually builds, on BOTH paths
  // ⚑ AND IT ASKS WHO IS READING BEFORE IT REACHES FOR A FOLD (2026-09-10).
  // The first shape was `world?.marks ?? [...byId.values()]` — prefer the fold —
  // and a Spectator detour leaves one behind, so a resident who came back got
  // the whole town painted under a thirteen-mark read. The set is decided by
  // the READER now; a fold in hand is not consulted on that path. This guard
  // pins the QUESTION, not the whole expression, for the same reason the
  // open-country one does.
  assert.match(VIEWER, /const allMarks = \(\) =>[^;]*onResidentPath\(\)[^;]*byId\.values\(\)/,
    "`allMarks` must ask who is reading before it reaches for a fold");
  assert.match(VIEWER, /const allMarks = \(\) =>[^;]*world\?\.marks/,
    "and it still reads the fold where there is a reader who wants one");
  assert.match(VIEWER, /world = assembleWorld\(\{ worldState: data\.worldState, skeleton: data\.skeleton \}\)/);
  assert.doesNotMatch(VIEWER, /townGround\(data\.marks/, "`data.marks` is undefined and always was");
  // THE ORIGINAL BUG, still watched: a set that does not exist. `world.marks`
  // is now the one that can be absent — the resident path never assembles a
  // world — so passing it bare would draw a town on nothing for a resident and
  // nothing at all for anyone else.
  assert.doesNotMatch(VIEWER, /const ground = townGround\(world\.marks/,
    "`world.marks` is null on the resident path; the ground must go through allMarks()");
});

test("A GROUNDLESS RECORD REFUSES rather than drawing a plausible lie", () => {
  // the class fix behind the bug above: handed no rings, the function used to
  // fall back to the skeleton's centrelines and paint something that looked
  // like a map. It now says so.
  assert.throws(() => townGround([], skeleton, { originPx, mPerPx }), /not one of the record's \d+ regions/);
  assert.throws(() => townGround(world.marks.filter((m) => !m.points), skeleton, { originPx, mPerPx }),
    /the ground would be drawn from the skeleton alone/);
  // …and the real record still passes, so the guard is not simply always-on
  assert.ok(townGround(world.marks, skeleton, { originPx, mPerPx }).svgText.length > 1000);
});

test("THE ATLAS IS NOT FETCHED — the last read of a surface the world does not own is gone", () => {
  assert.doesNotMatch(VIEWER, /fetch\(\s*["'`]\/atlas\//,
    "the viewer no longer fetches the atlas anywhere");
  // the town now runs the room's furnishing pass, because the baker is gone
  assert.match(VIEWER, /mountScene\(\{ boxEl, svg, originPx, mPerPx, reattachOverlays, placeholderExtents: true, groundMarkIds: ground\.groundMarkIds \}\)/,
    "the town hangs its own art (SCENES.md #6, retired the same day)");
});

test("A MARK IS DRAWN ONCE — the ground names what it drew, and the furnishing pass skips it", () => {
  // The defect this answers was visible from across the room: the main channel
  // came out dark and correct as water, and was then repainted on top as a pale
  // placeholder block in its own hue — a river running sage-green down the
  // middle of the town, because the ground and the overlay were two renderers
  // reading one record with no rule about who owns a shape.
  const g = ground();
  assert.ok(g.groundMarkIds instanceof Set, "the ground reports what it drew");
  const regionIds = townRegionMarks(world.marks).map((m) => m.id);
  const waterIds = townWaterShapes(world.marks, skeleton).filter((w) => w.mark).map((w) => w.mark.id);
  assert.deepEqual([...g.groundMarkIds].sort(), [...regionIds, ...waterIds].sort(),
    "every ringed mark the ground draws, and nothing it does not");
  assert.ok(g.groundMarkIds.has("the-town/the-main-channel"), "the channel that caught this");
  // the overlay honours it, and the honouring is at the SOURCE of the furnish set
  assert.match(VIEWER, /const onTheGround = mapCtx\.groundMarkIds \?\? new Set\(\);/);
  assert.match(VIEWER, /isEmbodiedMark\(m\) && m\.extent && !onTheGround\.has\(m\.id\)/);
  // and the room's ground answers the same question about its own wall
  assert.match(VIEWER, /groundMarkIds: new Set\(\[room\?\.id\]\.filter\(Boolean\)\)/);
});

test("the falsifiers CAN fail: a hardcoded ring, an invented source, and a drifted ring are all caught", () => {
  const g = ground();
  // (1) a shape with no source — the shape of "someone drew this from a drawing"
  const hardcoded = g.svgText.replace("<g class=\"wv-scene-art\">", "<polygon class=\"wv-tg-region\" points=\"1,1 2,2 3,1\"/><g class=\"wv-scene-art\">");
  const unsourced = drawnElements(hardcoded).filter((e) => !e.src && !e.classes.some((c) => SHEET.has(c)));
  assert.equal(unsourced.length, 1, "an unsourced element is caught");

  // (2) a source the record does not hold
  assert.equal(resolveSource("mark:the-town/a-place-that-is-not-there"), null);
  assert.equal(resolveSource("feature:the-invented-cliffs"), null);
  assert.equal(resolveSource("light:no-such-enclave"), null);
  assert.ok(resolveSource("mark:the-town/the-sea"), "and a real one still resolves");

  // (3) a ring that no longer matches the mark it names — one vertex moved 5 m
  const region = townRegionMarks(world.marks)[0];
  const tag = new RegExp(`<polygon class="wv-tg-region" data-src="mark:${region.id}"([^>]*)points="([^"]*)"`);
  const hit = g.svgText.match(tag);
  assert.ok(hit, "the region's polygon is findable");
  const pts = hit[2].trim().split(/\s+/);
  const [x0, y0] = pts[0].split(",").map(Number);
  const drifted = g.svgText.replace(hit[2], [`${x0 + 5 / mPerPx},${y0}`, ...pts.slice(1)].join(" "));
  const el = drawnElements(drifted).find((e) => e.src === `mark:${region.id}` && e.points);
  const dx = (Number(el.points.trim().split(/\s+/)[0].split(",")[0]) - originPx.x) * mPerPx;
  const recordX = Array.isArray(region.points[0]) ? region.points[0][0] : region.points[0].x;
  assert.ok(Math.abs(dx - recordX) > GRAIN_M, `a 5 m drift in one vertex is outside the ${GRAIN_M.toFixed(2)} m grain`);
});
