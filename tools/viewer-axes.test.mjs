import assert from "node:assert/strict";
import test from "node:test";

import {
  backingButton,
  clampStakeAmount,
  createMarkInteractionStore,
  deslugMarkId,
  disciplineAtlasImages,
  distanceBandLabel,
  deriveWalkPreview,
  extentGlyphKind,
  edgePointToward,
  formatCardinalPosition,
  formatEtaCrossings,
  formatRelativePosition,
  formatSpectatorCoordinate,
  formatWalkPreviewLabel,
  hoverLabelSVG,
  isAmbientMark,
  investigateNameLine,
  markByline,
  markCellBylineRow,
  markCellTitle,
  markGeometryIntersectsViewport,
  MARKER_MAX_GROWTH,
  markerScale,
  MARK_SNAP_RADIUS_PX,
  MAX_ZOOM_IN,
  officeBase,
  paintingMarkAtPoint,
  pointWalkDestination,
  predicateFoldDecision,
  previewStakeLedgerLine,
  previewWalkLeg,
  resolveActAsSelection,
  resolveMarkName,
  sameWalkDestination,
  SPECTATOR_ACTOR,
  nearestEmbodiedAncestor,
  snappedMarkAtPoint,
  smallestContainingMark,
  standingLocationLabel,
  summarizeBackers,
  toldPaintingMarks,
  viewerAxisControls,
  viewerAxisState,
  viewerFilterControls,
  viewerJourneyState,
  viewerCanAct,
  walkDestinationLabel,
  walkerDestinationName,
  walkerHandleFromHoverId,
  walkerHoverId,
} from "../spectator/viewer.mjs";

test("distance-band headings derive their approximate ranges from the LOD dials", () => {
  const bands = [
    { name: "underfoot", max: 50 },
    { name: "close by", max: 400 },
    { name: "far off", max: Infinity },
  ];
  assert.equal(distanceBandLabel("underfoot", bands), "Underfoot (within ~50 m)");
  assert.equal(distanceBandLabel("close by", bands), "Close by (~50–400 m)");
  assert.equal(distanceBandLabel("far off", bands), "Far off (~400 m+)");
});

test("painting hits pips first, then the smallest true containing extent", () => {
  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320_000, h: 320_000 } },
    { id: "wright/yard", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 } },
    { id: "wright/bench", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 10, h: 4 } },
    {
      id: "wright/courtyard",
      kind: "sited",
      at: { x: 30, y: 30 },
      extent: { w: 20, h: 20 },
      points: [[20, 20], [40, 20], [40, 25], [25, 25], [25, 40], [20, 40]],
    },
    { id: "wright/fog-hidden", kind: "sited", at: { x: 600, y: 600 }, extent: { w: 20, h: 20 } },
  ];
  assert.equal(smallestContainingMark({ x: 0, y: 0 }, marks), "wright/bench");
  assert.equal(smallestContainingMark({ x: 34, y: 34 }, marks), "wright/yard",
    "a point in a polygon notch falls through to the next containing extent");
  assert.equal(smallestContainingMark({ x: 22, y: 35 }, marks), "wright/courtyard");
  assert.equal(smallestContainingMark({ x: 500, y: 500 }, marks), null,
    "the ambient world root never captures open ground");
  assert.equal(
    paintingMarkAtPoint({
      screenPoint: { x: 100, y: 100 },
      worldPoint: { x: 0, y: 0 },
      glyphs: [{ id: "wright/pip", x: 110, y: 100 }],
      marks,
    }),
    "wright/pip",
    "pip snap wins even over a smaller containing extent",
  );

  const radial = {
    within: [{ id: "the-town/let-there-be-light" }, { id: "wright/yard" }],
    byBearing: { E: { "close by": [{ id: "wright/bench" }] } },
  };
  const candidates = toldPaintingMarks(radial, marks);
  assert.deepEqual(
    candidates.map((mark) => mark.id),
    ["the-town/let-there-be-light", "wright/yard", "wright/bench"],
    "extent candidates are exactly the radial telling plus the containment ladder",
  );
  assert.equal(
    paintingMarkAtPoint({
      screenPoint: { x: 100, y: 100 },
      worldPoint: { x: 45, y: 45 },
      glyphs: [],
      marks: candidates,
    }),
    "wright/yard",
    "a containing ladder mark stays hoverable without a pip",
  );
  assert.equal(
    paintingMarkAtPoint({
      screenPoint: { x: 100, y: 100 },
      worldPoint: { x: 600, y: 600 },
      glyphs: [],
      marks: candidates,
    }),
    null,
    "untold foggy or occluded extents leave open ground inert",
  );
});

test("walk point labels honor polygon extents instead of their bounding boxes", () => {
  const water = {
    id: "the-town/test-water",
    kind: "sited",
    at: { x: 30, y: 30 },
    extent: { w: 20, h: 20 },
    points: [[20, 20], [40, 20], [40, 25], [25, 25], [25, 40], [20, 40]],
  };
  assert.deepEqual(
    pointWalkDestination({ x: 34, y: 34 }, [water]),
    { x: 34, y: 34, inside: null },
    "a dry point in the polygon notch is not labelled as inside the water",
  );
  assert.deepEqual(
    pointWalkDestination({ x: 22, y: 35 }, [water]),
    { x: 22, y: 35, inside: water.id },
    "a point inside the authored polygon keeps its containment label",
  );
});

test("off-screen geometry resolves predicates to places and clips at the viewport edge", () => {
  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320_000, h: 320_000 } },
    { id: "the-town/the-fog", kind: "predicated", parent: "the-town/let-there-be-light" },
    { id: "wright/house", kind: "sited", at: { x: 300, y: 0 }, extent: { w: 40, h: 20 } },
    { id: "wright/welcome", kind: "predicated", parent: "wright/house" },
  ];
  assert.equal(nearestEmbodiedAncestor(marks[3], marks), marks[2]);
  assert.equal(nearestEmbodiedAncestor(marks[1], marks), null, "ambient predicates never acquire a location");
  assert.equal(markGeometryIntersectsViewport(marks[2], { x: -50, y: -50, w: 100, h: 100 }), false);
  assert.equal(markGeometryIntersectsViewport(
    { ...marks[2], at: { x: 60, y: 0 } },
    { x: -50, y: -50, w: 100, h: 100 },
  ), true, "a partially visible extent is on-screen");
  assert.deepEqual(
    edgePointToward({ x: -50, y: -50, w: 100, h: 100 }, marks[2].at, 10),
    { x: 40, y: 0, bearingDeg: 90 },
  );
});

test("the pure cardinal formatter remains available for the door-side sweep", () => {
  assert.equal(formatCardinalPosition({ x: 925, y: -2400 }), "2,400 m N · 925 m E of TC");
  assert.equal(formatCardinalPosition({ x: -1200, y: 0 }), "1,200 m W of TC");
  assert.equal(formatCardinalPosition({ x: 0, y: 75 }), "75 m S of TC");
  assert.equal(formatCardinalPosition({ x: 0, y: 0 }), "at TC");
  assert.equal(formatCardinalPosition({ x: "nope", y: 0 }), "");
});

test("spectator is the named default lens and never gains resident act authority", () => {
  assert.deepEqual(resolveActAsSelection(), { actAs: SPECTATOR_ACTOR, handle: "" });
  assert.deepEqual(
    resolveActAsSelection({ handles: ["wright", "rei"], remembered: SPECTATOR_ACTOR, lastResident: "rei" }),
    { actAs: SPECTATOR_ACTOR, handle: "rei" },
    "spectating retains a resident only as body context",
  );
  assert.deepEqual(
    resolveActAsSelection({ handles: ["wright", "rei"], remembered: "wright", lastResident: "rei" }),
    { actAs: "wright", handle: "wright" },
  );
  assert.equal(viewerCanAct({ identityResolved: true, actAs: SPECTATOR_ACTOR }), false);
  assert.equal(viewerCanAct({ identityResolved: true, actAs: "wright" }), true);
  assert.equal(viewerCanAct({ identityResolved: false, actAs: "wright" }), false);
});

test("spectator coordinates reuse cardinal grammar and add record-derived elevation", () => {
  const label = formatSpectatorCoordinate({ x: 925, y: -2400 }, 37.04);
  assert.equal(label, "2,400 m N · 925 m E of TC · elevation +37 m");
  assert.doesNotMatch(label, /\b925\s*,\s*-?2400\b/, "raw x,y never leaks into the chip");
  assert.equal(formatSpectatorCoordinate({ x: 0, y: 0 }, -0.25), "at TC · elevation -0.2 m");
});

test("viewer-facing locations use containment names and relative ground directions", () => {
  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320_000, h: 320_000 } },
    { id: "wright/the-trueing-terrace", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 100, h: 100 } },
    { id: "wright/the-trueing-house", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 8, h: 8 } },
  ];
  assert.equal(standingLocationLabel({ x: 0, y: 0 }, marks), "standing in The Trueing House");
  assert.equal(standingLocationLabel({ x: 40, y: 0 }, marks), "standing in The Trueing Terrace");
  assert.equal(standingLocationLabel({ x: 500, y: 0 }, marks), "on open ground");
  assert.equal(formatRelativePosition({ x: 1000, y: 0 }, { x: 170, y: 0 }), "830 m · west");
});

test("the walk desk selects ready, journey, and arrived from the latest walker derivation", () => {
  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 10_000, h: 10_000 } },
    { id: "wright/the-trueing-house", kind: "sited", at: { x: 600, y: 0 }, extent: { w: 100, h: 100 } },
  ];
  const determined = { "wright/the-trueing-house::name": "the Trueing House" };
  const walking = {
    arrived: false,
    standing: false,
    remaining_m: 415,
    eta_crossings: 0.03,
    toward: { x: 600, y: 0 },
    mark_id: "wright/the-trueing-house",
  };

  assert.deepEqual(viewerJourneyState(null, marks, determined), {
    kind: "ready",
    destinationName: null,
  });
  assert.deepEqual(viewerJourneyState(walking, marks, determined), {
    kind: "journey",
    destinationName: "the Trueing House",
    remainingM: 415,
    etaCrossings: 0.03,
  });
  assert.deepEqual(viewerJourneyState({ ...walking, arrived: true, remaining_m: 0 }, marks, determined), {
    kind: "arrived",
    destinationName: "the Trueing House",
  });

  // REGRESSION 2026-08-04. The resident shape moved from `arrived` to `moving`,
  // and this function still asked for `arrived` — which a still resident no
  // longer carries at all. A MISSING boolean read as false, so every standing
  // resident was reported "on the road, 0 m from" their own doorstep, with a
  // live "change course" button. Absent is not false.
  const stillFromWalk = { handle: "wright", x: 600, y: 0, source: "walk", moving: false,
    toward: null, remaining_m: 0, eta_crossings: 0, mark_id: "wright/the-trueing-house" };
  assert.deepEqual(viewerJourneyState(stillFromWalk, marks, determined), {
    kind: "arrived",
    destinationName: "the Trueing House",
  }, "someone who walked and stopped has arrived — not a 0 m journey");

  // And someone who NEVER walked has no journey to report at all. "Arrived at
  // your own parcel" is a claim about a trip that never happened.
  const neverWalked = { handle: "vermillion", x: 600, y: 0, source: "parcel", moving: false,
    toward: null, remaining_m: 0, eta_crossings: 0, mark_id: "wright/the-trueing-house" };
  assert.deepEqual(viewerJourneyState(neverWalked, marks, determined), {
    kind: "ready",
    destinationName: null,
  }, "never walked = nothing to report, planner open");
});

test("walker destinations prefer a carried mark Name, then point containment, then open ground", () => {
  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 10_000, h: 10_000 } },
    { id: "wright/the-trueing-terrace", kind: "sited", at: { x: 600, y: 0 }, extent: { w: 300, h: 300 } },
    { id: "wright/the-crossing-bench", kind: "sited", at: { x: -500, y: 0 }, extent: { w: 20, h: 8 } },
  ];
  const determined = {
    "wright/the-trueing-terrace::name": "the Trueing Terrace",
    "wright/the-crossing-bench::name": "the Crossing Bench",
  };

  assert.equal(
    walkerDestinationName(
      { mark_id: "wright/the-crossing-bench", toward: { x: 600, y: 0 } },
      marks,
      determined,
    ),
    "the Crossing Bench",
    "declared mark intent wins over the destination point's incidental containment",
  );
  assert.equal(
    walkerDestinationName({ mark_id: null, toward: { x: 600, y: 0 } }, marks, determined),
    "the Trueing Terrace",
  );
  assert.equal(
    walkerDestinationName({ mark_id: null, toward: { x: 20_000, y: 0 } }, marks, determined),
    "open ground",
  );
});

test("backer summaries show the top five and count everyone else", () => {
  const summary = summarizeBackers([
    { handle: "sixth", stamps: 1 },
    { holder: "third", amount: 7 },
    { handle: "first", stamps: 12 },
    { handle: "fifth", stamps: 3 },
    { handle: "second", stamps: 9 },
    { handle: "fourth", stamps: 5 },
    { handle: "seventh", stamps: 0 },
  ]);
  assert.deepEqual(summary, {
    top: [
      { holder: "first", amount: 12 },
      { holder: "second", amount: 9 },
      { holder: "third", amount: 7 },
      { holder: "fourth", amount: 5 },
      { holder: "fifth", amount: 3 },
    ],
    others: 1,
  });
});

test("extent glyphs distinguish honest polygon claims from rectangles", () => {
  assert.equal(extentGlyphKind({ extent: { w: 10, h: 5 } }), "rect");
  assert.equal(
    extentGlyphKind({
      extent: { w: 10, h: 5 },
      points: [[0, 0], [10, 0], [8, 5], [2, 4]],
    }),
    "polygon",
  );
  assert.equal(extentGlyphKind({ kind: "predicated" }), null);
});

test("mark names de-slug cleanly and honor a fold-determined naming predicate", () => {
  assert.equal(deslugMarkId("wright/the-crossing-bench"), "The Crossing Bench");
  assert.equal(deslugMarkId("gael-renton/the-dreamer-s-anchor"), "The Dreamer's Anchor");
  assert.deepEqual(
    resolveMarkName(
      { id: "jetto-of-starforge/the-waystation" },
      { "jetto-of-starforge/the-waystation::name": "the Waystation" },
    ),
    { name: "the Waystation", determined: true },
  );
  assert.deepEqual(
    resolveMarkName({ id: "wright/the-crossing-bench" }, {}),
    { name: "The Crossing Bench", determined: false },
  );
});

test("predicates fold only when their non-predicate subject cell is rendered", () => {
  const house = { id: "wright/the-trueing-house", kind: "sited" };
  const welcome = {
    id: "wright/welcome",
    kind: "predicated",
    parent: house.id,
    slot: "welcome",
    value: "the lamp is left on",
  };
  const naming = {
    id: "wright/house-name",
    kind: "naming",
    parent: house.id,
    value: "The Trueing House",
  };
  const nested = {
    id: "wright/welcome-name",
    kind: "naming",
    parent: welcome.id,
    value: "The Keeping Light",
  };

  assert.equal(predicateFoldDecision(welcome, [house, welcome]), true);
  assert.equal(predicateFoldDecision(naming, [house, naming]), true);
  assert.equal(
    predicateFoldDecision(welcome, [welcome]),
    false,
    "a predicate whose parent is outside the current view keeps its standalone card",
  );
  assert.equal(
    predicateFoldDecision(nested, [welcome, nested]),
    false,
    "predicated-on-predicated chains stay out of the deliberately safe non-nested pass",
  );
  assert.equal(predicateFoldDecision(house, [house]), false);
});

test("cell identity rows keep tier beside the arrow and backing beside the byline", () => {
  const mark = {
    id: "wright/the-crossing-door",
    by: "wright",
    date: "2026-07-29T23:10:00Z",
    stamps: 12,
  };
  const title = markCellTitle({
    name: "The Crossing Door",
    determined: true,
    bearing: "NE",
    tier: "home",
  });
  const row = markCellBylineRow(mark, backingButton(mark.id, mark.stamps));

  assert.equal(markByline(mark), "By wright 2026-07-29");
  assert.match(title, /^<div class="cname is-determined">/);
  assert.match(title, /<span class="wv-name-arrow"[^>]*>.*<\/span><span class="wv-chip t-home">home<\/span><\/div>$/);
  assert.match(row, /^<div class="wv-cell-byline-row"><span class="wv-byline">By wright 2026-07-29<\/span><button/);
  assert.match(row, />✦ 12 · back<\/button><\/div>$/);
});

test("investigate relatives inherit names and backing without duplicated byline details or id prose", () => {
  const relative = {
    id: "wright/the-crossing-door",
    by: "wright",
    date: "2026-07-29T23:10:00Z",
    stamps: 12,
    body: "The entire quoted body that already belongs to its own cell.",
  };
  const line = investigateNameLine(relative, {
    name: "The Crossing Door",
    determined: true,
    tier: "home",
  });

  assert.match(line, /class="wv-rnode t-home"/);
  assert.match(line, /data-id="wright\/the-crossing-door"/);
  assert.match(line, /role="button" tabindex="0"/);
  assert.match(line, /<b class="cname is-determined">The Crossing Door<\/b>/);
  assert.match(line, /class="wv-backing"[^>]*>✦ 12 · back<\/button>/);
  assert.doesNotMatch(line, /wv-details|wv-detail-author|wv-detail-date|by wright|2026-07-29/i);
  assert.doesNotMatch(line, /entire quoted body|cbody|tbody/);
  assert.doesNotMatch(line.replace(/data-(?:id|mark)="[^"]*"/g, ""), /wright\/the-crossing-door/);
});

test("investigate identities de-slug by default and zero backing uses neutral-true copy", () => {
  const line = investigateNameLine({ id: "wright/the-crossing-door", stamps: 0 });
  assert.match(line, /<b class="cname">The Crossing Door<\/b>/);
  assert.match(line, />✦ 0 · back<\/button>/);
  assert.doesNotMatch(line, /pre-mark|awaiting its resident/);

  const zeroDetail = backingButton("wright/the-crossing-door", 0, { neutralZero: true });
  assert.match(zeroDetail, /class="wv-backing is-zero"/);
  assert.match(zeroDetail, />✦ 0 — no belief staked yet<\/button>/);
  assert.doesNotMatch(zeroDetail, /pre-mark|awaiting its resident/);
});

test("ambient marks are the root and predicates with no embodied ancestor", () => {
  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320_000, h: 320_000 } },
    { id: "the-town/the-fog", kind: "predicated", parent: "the-town/let-there-be-light" },
    { id: "the-town/fog-thickness", kind: "predicated", parent: "the-town/the-fog" },
    { id: "wright/house", kind: "sited", at: { x: 20, y: 30 }, extent: { w: 10, h: 8 } },
    { id: "wright/welcome", kind: "predicated", parent: "wright/house" },
    { id: "wright/welcome-name", kind: "naming", parent: "wright/welcome" },
    { id: "wright/open-ground-note", kind: "predicated", parent: "missing/mark" },
  ];
  assert.equal(isAmbientMark(marks[0], marks), true, "the world root is explicitly ambient");
  assert.equal(isAmbientMark(marks[1], marks), true, "fog reaches only the ambient root");
  assert.equal(isAmbientMark(marks[2], marks), true, "predicate chains stay ambient without an embodied ancestor");
  assert.equal(isAmbientMark(marks[4], marks), false, "a predicate on a bounded place is locatable");
  assert.equal(isAmbientMark(marks[5], marks), false, "naming predicates follow the same ancestry rule");
  assert.equal(isAmbientMark(marks[6], marks), true, "an unlocatable predicate fails ambient-safe");
  assert.equal(isAmbientMark(marks[3], marks), false, "an ordinary embodied mark is a place");
});

test("detached atlas images get lazy loading before mount", () => {
  const attributes = [{}, {}, {}];
  const root = {
    querySelectorAll: (selector) => {
      assert.equal(selector, "img, image");
      return attributes.map((record) => ({
        setAttribute: (name, value) => { record[name] = value; },
      }));
    },
  };
  assert.equal(disciplineAtlasImages(root), 3);
  assert.deepEqual(attributes, [
    { loading: "lazy", decoding: "async" },
    { loading: "lazy", decoding: "async" },
    { loading: "lazy", decoding: "async" },
  ]);
});

test("the lens and one filter row stay orthogonal", () => {
  const states = [
    [{ identityResolved: false, baseLayer: "mine", markFilter: "mine" }, false, "True World", "everything"],
    [{ identityResolved: true, baseLayer: "true", markFilter: "everything" }, true, "True World", "everything"],
    [{ identityResolved: true, baseLayer: "true", markFilter: "mine" }, true, "True World", "just mine"],
    [{ identityResolved: true, baseLayer: "mine", markFilter: "everything" }, true, "My World", "everything"],
    [{ identityResolved: true, baseLayer: "mine", markFilter: "new" }, true, "My World", "new"],
  ];

  for (const [input, controls, base, filter] of states)
    assert.deepEqual(viewerAxisState(input), { controls, base, filter });

  assert.equal(viewerAxisControls(states[0][0]), "", "anonymous spectators get no identity axes");

  const trueMine = viewerAxisControls(states[2][0]);
  assert.match(trueMine, />True World<\/button>/);
  assert.match(trueMine, />My World<\/button>/);
  assert.match(trueMine, /data-world-base="true"[^>]*>True World/);
  assert.doesNotMatch(trueMine, /just mine|data-mark-filter/, "the lens has no competing filter vocabulary");

  const myEverything = viewerAxisControls(states[3][0]);
  assert.match(myEverything, /class="wv-fchip on" data-world-base="mine">My World/);

  const row = viewerFilterControls(states[2][0]);
  assert.match(row, />everything<\/button>.*>just mine<\/button>.*>new<\/button>/);
  assert.match(row, /class="wv-fchip on" data-mark-filter="mine">just mine/);

  const anonymous = viewerFilterControls(states[0][0]);
  assert.match(anonymous, /data-mark-filter="mine" disabled/);
});

test("signed office calls share the one /api-default base", () => {
  assert.equal(officeBase({ getItem: () => null }), "/api");
  assert.equal(officeBase({ getItem: () => "https://door.example/api/" }), "https://door.example/api");
  assert.equal(officeBase({ getItem: () => { throw new Error("storage denied"); } }), "/api");
});

test("stake amounts clamp to the acting resident's liquid balance", () => {
  assert.deepEqual(
    clampStakeAmount(200, 199),
    { requested: 200, balance: 199, amount: 199, exceeded: true },
  );
  assert.deepEqual(
    clampStakeAmount("7", 199),
    { requested: 7, balance: 199, amount: 7, exceeded: false },
  );
  assert.deepEqual(
    clampStakeAmount(1, null),
    { requested: 1, balance: null, amount: null, exceeded: false },
  );
});

test("stake and walk previews use the sealed grammar and pure walk derivation", () => {
  assert.equal(
    previewStakeLedgerLine({
      date: "2026-07-28",
      handle: "alpha",
      mark: "beta/bench",
      stamps: 7,
    }),
    "- 2026-07-28 · alpha → stake:world-mark/beta/bench · 7 · via: api · sig: …",
  );
  assert.equal(
    previewStakeLedgerLine({
      mode: "unstake",
      date: "2026-07-28",
      handle: "alpha",
      mark: "beta/bench",
      stamps: 2,
    }),
    "- 2026-07-28 · stake:world-mark/beta/bench → alpha · 2 · for: unstake · sig: …",
  );
  const leg = previewWalkLeg({ from: { x: 0, y: 0 }, toward: { x: 30_000, y: 0 } });
  assert.deepEqual(leg, { distanceM: 30_000, etaCrossings: 2, viaCrossings: [] });
  assert.equal(formatWalkPreviewLabel(leg), "30,000 m · ~24h 00m");
  assert.deepEqual(
    deriveWalkPreview({ from: { x: 0, y: 0 }, destination: { x: 30_000, y: 0 } }),
    { from: { x: 0, y: 0 }, toward: { x: 30_000, y: 0 }, leg },
    "the painting, desk, and confirmation can share one derived preview",
  );
  assert.equal(
    deriveWalkPreview({ from: { x: 0, y: 0 }, destination: { x: 30_000, y: 0 }, residentMode: false }),
    null,
    "camera movement has no walking ETA",
  );
  assert.equal(sameWalkDestination({ x: 4, y: 8, markId: null }, { x: 4, y: 8 }), true);
  assert.equal(sameWalkDestination({ x: 4, y: 8, markId: "a" }, { x: 4, y: 8, markId: "b" }), false);
});

test("the walk desk formats crossing ETAs as clock time and labels point containment", () => {
  assert.equal(formatEtaCrossings(125 / (12 * 60)), "≈ 2 h 05 m");
  assert.equal(formatEtaCrossings(2), "≈ 24 h 00 m");
  assert.equal(formatEtaCrossings(-1), "");

  const marks = [
    { id: "the-town/let-there-be-light", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 1000, h: 1000 } },
    { id: "wright/the-trueing-house-parcel", kind: "parcel", at: { x: 0, y: 0 }, extent: { w: 25, h: 25 } },
    { id: "wright/the-trueing-house", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 8, h: 8 } },
  ];
  assert.deepEqual(
    pointWalkDestination({ x: 10, y: 0 }, marks),
    { x: 10, y: 0, inside: "wright/the-trueing-house-parcel" },
  );
  assert.deepEqual(
    pointWalkDestination({ x: 0, y: 0 }, marks),
    { x: 0, y: 0, inside: "wright/the-trueing-house" },
  );
  assert.equal(
    walkDestinationLabel(
      { x: 0, y: 0, markId: "wright/the-trueing-house" },
      marks,
    ),
    "The Trueing House",
  );
  assert.equal(
    walkDestinationLabel(
      { x: 10, y: 0, inside: "wright/the-trueing-house-parcel" },
      marks,
      {},
      { x: 840, y: 0 },
    ),
    "open ground · 830 m · west · in The Trueing House Parcel",
    "ground stays relative while its record-derived containment label remains",
  );
  assert.equal(
    walkDestinationLabel({ x: 170, y: 0 }, marks, {}, { x: 1000, y: 0 }),
    "open ground · 830 m · west",
  );
});

test("painting mark hit-testing uses the nearest glyph inside an 18 px snap radius", () => {
  const glyphs = [
    { id: "wright/near", x: 108, y: 100 },
    { id: "wright/far", x: 117, y: 100 },
  ];
  assert.equal(MARK_SNAP_RADIUS_PX, 18);
  assert.equal(snappedMarkAtPoint({ x: 100, y: 100 }, glyphs), "wright/near");
  assert.equal(snappedMarkAtPoint({ x: 135, y: 100 }, glyphs), "wright/far");
  assert.equal(snappedMarkAtPoint({ x: 136, y: 100 }, glyphs), null);
  assert.equal(
    snappedMarkAtPoint({ x: 100, y: 100 }, [
      { id: "wright/z", x: 101, y: 100 },
      { id: "wright/a", x: 99, y: 100 },
    ]),
    "wright/a",
    "equidistant glyphs resolve deterministically",
  );
});

test("mark selection and hover share one observable interaction store", () => {
  const store = createMarkInteractionStore();
  const observed = [];
  const unsubscribe = store.subscribe((state) => observed.push(state));
  store.select("wright/bench");
  store.hover("wright/gate");
  store.hover("wright/gate");
  assert.deepEqual(store.getState(), {
    selectedId: "wright/bench",
    hoveredId: "wright/gate",
  });
  assert.equal(observed.length, 2, "unchanged interaction state does not redraw either surface");
  store.hover(null);
  assert.deepEqual(store.getState(), {
    selectedId: "wright/bench",
    hoveredId: null,
  });
  unsubscribe();
});

test("marker compensation puts a CEILING on on-screen size, not just a square root", () => {
  // on-screen radius is proportional to base / markerScale(zoomK) * zoomK
  const onScreen = (base, zoomK) => (base / markerScale(zoomK)) * zoomK;
  assert.equal(markerScale(1), 1, "at rest a marker is drawn at its authored size");
  // the old behaviour, kept as the thing we are fixing: sqrt compensation alone
  // let the on-screen size grow without bound as the camera closed in
  assert.ok(Math.sqrt(120) > 10, "the deepest zoom would have been >10x under sqrt alone");
  // the ceiling: past MARKER_MAX_GROWTH the on-screen size stops moving
  const capped = onScreen(11, MARKER_MAX_GROWTH ** 2);
  for (const zoomK of [MARKER_MAX_GROWTH ** 2, 20, 60, MAX_ZOOM_IN]) {
    assert.ok(onScreen(11, zoomK) <= capped + 1e-9, `zoomK ${zoomK} stays under the ceiling`);
  }
  assert.ok(Math.abs(onScreen(11, MAX_ZOOM_IN) - 11 * MARKER_MAX_GROWTH) < 1e-9,
    "at the floor a marker sits at exactly MARKER_MAX_GROWTH times its authored size");
});

test("the marker ceiling is a MULTIPLE, so designed size relationships survive it", () => {
  // the walker hit halo is authored at 3x its dot precisely so the target is
  // comfortable; a shared absolute ceiling would have flattened them together
  const onScreen = (base, zoomK) => (base / markerScale(zoomK)) * zoomK;
  for (const zoomK of [1, 4, 25, MAX_ZOOM_IN]) {
    assert.ok(Math.abs(onScreen(27, zoomK) / onScreen(9, zoomK) - 3) < 1e-9,
      `hit halo stays 3x the dot at zoomK ${zoomK}`);
  }
});

test("markerScale refuses nonsense zoom rather than collapsing a marker", () => {
  for (const bad of [0, -4, NaN, undefined, null, "deep"]) {
    assert.equal(markerScale(bad), 1, `${String(bad)} falls back to the authored size`);
  }
});

test("the zoom floor frames a parcel: MAX_ZOOM_IN reads as a viewport width", () => {
  const ATLAS_UNITS_WIDE = 1500, M_PER_UNIT = 5; // WORLD/skeleton.json
  const viewportM = (ATLAS_UNITS_WIDE / MAX_ZOOM_IN) * M_PER_UNIT;
  assert.ok(viewportM <= 125, "a 25 m parcel is at least a fifth of the tightest view");
  assert.ok(viewportM > 25, "the tightest view still holds a whole parcel, with ground around it");
  assert.ok(MAX_ZOOM_IN > 24, "and it is deeper than the floor it replaced");
});

test("a walker hover id round-trips and never collides with a mark id", () => {
  assert.equal(walkerHoverId("wren"), "walker:wren");
  assert.equal(walkerHandleFromHoverId(walkerHoverId("wren")), "wren");
  assert.equal(walkerHandleFromHoverId("wright/the-trueing-house"), null,
    "a real mark id is not mistaken for a resident");
  for (const bad of [null, undefined, 42, "walker:", ""]) {
    assert.equal(walkerHandleFromHoverId(bad), null, `${String(bad)} names no resident`);
  }
});

test("the hover label is one box: clamped inside the viewport, sized in screen units", () => {
  const view = { x: 0, y: 0, w: 100, h: 100 };
  const box = hoverLabelSVG({ text: "wren — at rest", at: { x: 50, y: 50 }, unit: 0.1, view });
  assert.match(box, /<g class="wv-hl-label">/);
  assert.match(box, /wren — at rest/);
  // a mark hard against the right edge still gets its whole box on screen
  const edge = hoverLabelSVG({ text: "wren", at: { x: 99.5, y: 1 }, unit: 0.1, view });
  const x = Number(edge.match(/<rect x="([-0-9.]+)"/)[1]);
  const w = Number(edge.match(/width="([-0-9.]+)"/)[1]);
  assert.ok(x >= view.x, "the box never sails off the left edge");
  assert.ok(x + w <= view.x + view.w, "nor off the right");
  assert.equal(hoverLabelSVG({ text: "", at: { x: 1, y: 1 }, unit: 1, view }), "",
    "nothing to say draws no box");
  assert.equal(hoverLabelSVG({ text: "wren", at: { x: NaN, y: 1 }, unit: 1, view }), "",
    "a walker with no derivable position draws no box");
});

test("a long identity is elided rather than allowed to overrun its box", () => {
  const view = { x: 0, y: 0, w: 1000, h: 1000 };
  const long = "a".repeat(200);
  const box = hoverLabelSVG({ text: long, at: { x: 500, y: 500 }, unit: 1, view });
  const text = box.match(/font-size="[-0-9.]+">([^<]*)</)[1];
  assert.ok(text.length <= 58, "the label is cut to the box it is drawn in");
  assert.ok(text.endsWith("…"), "and says that it was cut");
});
