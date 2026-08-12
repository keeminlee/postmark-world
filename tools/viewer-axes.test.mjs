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
  MAX_ZOOM_OUT,
  MIST_BANKS,
  mistBandSVG,
  farGlyphUnit,
  placedArtSVG,
  vesselGlyphSVG,
  vesselHandles,
  VESSEL_GLYPH_SCALE,
  VESSEL_MIN_FRAME_FRACTION,
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
  markStateClasses,
  draftMarkIds,
  viewerAxisState,
  viewerFilterControls,
  viewerJourneyState,
  viewerCanAct,
  walkDestinationLabel,
  worldFrameReading,
  TOUR_SLIDES,
  tourStep,
  tourProgress,
  readTourSeen,
  writeTourSeen,
  tourSeenKey,
  TOUR_SEEN_KEY,
  TOUR_KIND_MARKS,
  TOUR_WALK_LEG,
  recentActivity,
  actSubjectGone,
  activityDayLabel,
  activityDayKey,
  WORLD_ROOT_ID,
  walkerDestinationName,
  walkerHandleFromHoverId,
  walkerHoverId,
  bubbleTrailStep,
  paintingMarkIds,
  isWalkableTarget,
  WALK_TARGET_MAX_EXTENT_M,
  placeBubble,
  readPaintingOnly,
  writePaintingOnly,
  PAINTING_ONLY_KEY,
  contestedMarksAtPoint,
  orderInnermostFirst,
  fanOffsetPx,
  markIdHash,
  coLocatedMarkIds,
  FAN_RADIUS_PX,
  parseStakeCommits,
  msToNextSettlementAttempt,
  formatCountdown,
  settlementChipText,
  safeAvatarUrl,
  safeHexColor,
  monogramOf,
  residentFace,
  residentHref,
  DEFAULT_FACE_COLOR,
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
  assert.match(row, />✦ 12<\/button><\/div>$/);
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
  assert.match(line, /class="wv-backing"[^>]*>✦ 12<\/button>/);
  assert.doesNotMatch(line, /wv-details|wv-detail-author|wv-detail-date|by wright|2026-07-29/i);
  assert.doesNotMatch(line, /entire quoted body|cbody|tbody/);
  assert.doesNotMatch(line.replace(/data-(?:id|mark)="[^"]*"/g, ""), /wright\/the-crossing-door/);
});

test("a stamp chip is a symbol and a number, and zero says zero", () => {
  const line = investigateNameLine({ id: "wright/the-crossing-door", stamps: 0 });
  assert.match(line, /<b class="cname">The Crossing Door<\/b>/);
  assert.match(line, />✦ 0<\/button>/);
  assert.doesNotMatch(line, /pre-mark|awaiting its resident/);

  // no verb inside the readout: the chip states the backing and its title says
  // what pressing it does. One shape everywhere, zero included.
  const zero = backingButton("wright/the-crossing-door", 0);
  assert.match(zero, /class="wv-backing is-zero"/, "zero still reads as the quiet case");
  assert.match(zero, />✦ 0<\/button>/);
  assert.match(zero, /title="read backing and back this mark"/, "the verb lives in the title");
  assert.doesNotMatch(zero, /back<\/button>|no belief staked/);
  assert.match(backingButton("x/y", 1234), />✦ 1,234<\/button>/, "and it still groups");
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

test("one marks row is the whole vocabulary — the World lens is gone", () => {
  const states = [
    [{ identityResolved: false, markFilter: "mine" }, false, "everything"],
    [{ identityResolved: true, markFilter: "everything" }, true, "everything"],
    [{ identityResolved: true, markFilter: "mine" }, true, "just mine"],
    [{ identityResolved: true, markFilter: "new" }, true, "new"],
  ];

  for (const [input, controls, filter] of states)
    assert.deepEqual(viewerAxisState(input), { controls, filter },
      "the axis state carries no composition question any more");

  const row = viewerFilterControls(states[2][0]);
  assert.match(row, />everything<\/button>.*>just mine<\/button>.*>new<\/button>/);
  assert.match(row, /class="wv-fchip on" data-mark-filter="mine">just mine/);
  assert.doesNotMatch(row, /data-world-base|True World|My World/,
    "no lens survives anywhere in the control row");

  const anonymous = viewerFilterControls(states[0][0]);
  assert.match(anonymous, /data-mark-filter="mine" disabled/);
});

test("a draft is a state beside the tier, not a tier of its own", () => {
  assert.equal(markStateClasses({ tier: "home" }), "t-home");
  assert.equal(markStateClasses({ tier: "home", draft: true }), "t-home is-draft",
    "a drafted home is still a home; only its colour changes");
  assert.equal(markStateClasses({ tier: "constitution", draft: true }), "t-constitution is-draft");
  assert.equal(markStateClasses(), "t-market");
  assert.equal(markStateClasses({ tier: "nonsense", draft: true }), "t-market is-draft",
    "an unknown tier falls back to market rather than emitting a class nothing styles");

  // the cell title says the state AND keeps saying the kind
  const drafted = markCellTitle({ name: "The Low Door", tier: "constitution", draft: true });
  assert.match(drafted, /class="wv-chip is-draft"/);
  assert.match(drafted, /class="wv-chip t-constitution">constitution/,
    "the tier chip survives the draft chip");
  assert.doesNotMatch(markCellTitle({ name: "The Low Door", tier: "constitution" }), /is-draft/);

  // and a relation line in an investigate tree speaks the same two words
  const line = investigateNameLine({ id: "limen/the-low-door" }, { name: "The Low Door", tier: "home", draft: true });
  assert.match(line, /class="wv-rnode t-home is-draft"/);
});

test("only the drafts a colour can actually draw become grey", () => {
  const ids = draftMarkIds([
    { id: "limen/new-bench", status: "added" },
    { id: "limen/the-low-door", status: "modified" },
    { id: "limen/old-lantern", status: "deleted" },
  ]);
  assert.ok(ids.has("limen/new-bench"), "a mark the town has never seen reads as a draft");
  assert.ok(ids.has("limen/the-low-door"), "so does your unpublished edit of one it has");
  assert.ok(!ids.has("limen/old-lantern"),
    "a deleted draft is an absence — it is not in the composed fold, so nothing can be painted grey");

  assert.equal(draftMarkIds().size, 0);
  assert.equal(draftMarkIds([null, {}, { status: "added" }]).size, 0, "an entry with no id names nothing");
  assert.ok(draftMarkIds([{ mark: "limen/legacy-shape", status: "added" }]).has("limen/legacy-shape"),
    "the portfolio's other id spelling is read too, the same way mineIds reads it");
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
    "The Trueing House Parcel · 830 m · west",
    "a destination inside a mark is NAMED by it — the town has a name for that ground",
  );
  assert.equal(
    walkDestinationLabel({ x: 170, y: 0 }, marks, {}, { x: 1000, y: 0 }),
    "open ground · 830 m · west",
    "and open ground is what is left when nothing but the world contains you",
  );

  // the two halves of the ruling, on one point: naming a mark aims at its CENTRE,
  // while a point inside it stays the point and only borrows the name
  const inTheParcel = pointWalkDestination({ x: 10, y: 0 }, marks);
  assert.deepEqual(
    { x: inTheParcel.x, y: inTheParcel.y }, { x: 10, y: 0 },
    "clicking inside a mark does not march you to the middle of it");
  assert.match(
    walkDestinationLabel(inTheParcel, marks, {}, { x: 840, y: 0 }),
    /^The Trueing House Parcel/, "but it does read as that mark");

  // the world root contains everything, so it names nothing
  const roomy = [{ id: WORLD_ROOT_ID, kind: "sited", at: { x: 0, y: 0 }, extent: { w: 320000, h: 320000 } }];
  assert.equal(pointWalkDestination({ x: 900, y: 900 }, roomy).inside, null,
    "let-there-be-light frames everything, so being inside it is being outdoors");
  assert.equal(walkDestinationLabel(pointWalkDestination({ x: 900, y: 900 }, roomy), roomy, {}, { x: 0, y: 0 }),
    "open ground · 1,273 m · southeast");
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

// ── painting-only: the bubbles ───────────────────────────────────────────────

test("a bubble takes the side of its anchor that has room, and says when neither does", () => {
  const box = { w: 400, h: 300 }, size = { w: 120, h: 60 };
  const right = placeBubble({ anchor: { x: 40, y: 150 }, size, box });
  assert.equal(right.side, "right");
  assert.ok(right.x > 40, "it sits to the right of what it describes");

  // hard against the right edge there is no room on that side, so it flips
  const left = placeBubble({ anchor: { x: 380, y: 150 }, size, box });
  assert.equal(left.side, "left");
  assert.ok(left.x + size.w < 380, "and clears the anchor going the other way");

  // a bubble wider than either shoulder covers its own anchor, and admits it
  const over = placeBubble({ anchor: { x: 200, y: 150 }, size: { w: 380, h: 60 }, box });
  assert.equal(over.side, "over");
  assert.ok(over.x >= 8 && over.x + 380 <= box.w - 8, "clamped inside the painting even so");
});

test("a bubble is clamped into the painting rather than allowed to hang off it", () => {
  const box = { w: 400, h: 300 }, size = { w: 120, h: 60 };
  const high = placeBubble({ anchor: { x: 200, y: 0 }, size, box });
  assert.ok(high.y >= 8, "an anchor at the top edge does not push the box off the top");
  const low = placeBubble({ anchor: { x: 200, y: 300 }, size, box });
  assert.ok(low.y + size.h <= box.h - 8, "nor off the bottom");

  // a bubble taller than the painting cannot be clamped into it; it pins to the
  // top rather than resolving to a negative offset (max wins over min)
  const tall = placeBubble({ anchor: { x: 200, y: 150 }, size: { w: 120, h: 900 }, box });
  assert.equal(tall.y, 8, "an over-tall bubble starts at the top edge, never above it");

  for (const bad of [
    { anchor: { x: NaN, y: 1 }, size, box },
    { anchor: { x: 1, y: 1 }, size: { w: "x", h: 1 }, box },
    {},
  ]) assert.equal(placeBubble(bad), null, "nonsense places nothing");
});

test("the painting shows what tells from here PLUS all of yours, and asks no filter", () => {
  const ids = paintingMarkIds({ radialIds: ["a", "b"], mineIds: ["b", "far-away", "staked-elsewhere"] });
  assert.ok(ids.has("a"), "what the eye tells is on the painting");
  assert.ok(ids.has("far-away"), "and so is a mark of yours beyond this sight");
  assert.ok(ids.has("staked-elsewhere"), "owned or staked, mine is mine");
  assert.equal(ids.size, 4, "the union, with the overlap counted once");

  // the chips are the Telling's question — nothing here reads them
  assert.deepEqual(
    [...paintingMarkIds({ radialIds: ["a"], mineIds: ["m"], markFilter: "new" })].sort(),
    ["a", "m"], "a filter argument is ignored rather than obeyed");

  assert.deepEqual([...paintingMarkIds({ radialIds: ["a"] })], ["a"], "a spectator has no marks of their own");
  assert.equal(paintingMarkIds().size, 0);
});
test("how you read the world is remembered, and a storage that refuses is not fatal", () => {
  const store = new Map();
  const fake = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  // The Painting is the page and the Telling is what you open (Keemin,
  // 2026-08-05), so nothing remembered means painting-only.
  assert.equal(readPaintingOnly(fake), true, "an unvisited browser gets the painting");
  writePaintingOnly(fake, true);
  assert.equal(store.get(PAINTING_ONLY_KEY), "1");
  assert.equal(readPaintingOnly(fake), true);
  writePaintingOnly(fake, false);
  assert.equal(store.get(PAINTING_ONLY_KEY), "0");
  assert.equal(readPaintingOnly(fake), false, "and a reader who opened the Telling keeps it open");

  const hostile = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readPaintingOnly(hostile), true, "a private-mode browser reads as the default");
  assert.doesNotThrow(() => writePaintingOnly(hostile, true), "and refusing to remember is not an error");
  assert.equal(readPaintingOnly(null), true);
});

test("a bubble steps around the one it must not cover, and gives up gracefully", () => {
  const box = { w: 600, h: 400 }, size = { w: 150, h: 80 };
  // the pinned bubble is sitting on the right; the glance takes the free side
  const avoid = { x: 220, y: 0, w: 300, h: 400 };
  const stepped = placeBubble({ anchor: { x: 200, y: 200 }, size, box, avoid });
  assert.equal(stepped.side, "left", "it goes the other way rather than under");
  assert.ok(stepped.x + size.w <= avoid.x, "and clears the obstacle entirely");

  // both sides blocked horizontally: step above or below instead
  const band = { x: 0, y: 150, w: 600, h: 100 };
  const dodged = placeBubble({ anchor: { x: 300, y: 200 }, size, box, avoid: band });
  const clears = dodged.y + size.h <= band.y || dodged.y >= band.y + band.h;
  assert.ok(clears, `stepped clear of the band vertically (y=${dodged.y})`);

  // an obstacle covering the whole pane cannot be dodged; place it anyway rather
  // than refuse to draw — a bubble somewhere beats no bubble at all
  const everywhere = { x: 0, y: 0, w: 600, h: 400 };
  const placed = placeBubble({ anchor: { x: 300, y: 200 }, size, box, avoid: everywhere });
  assert.ok(placed && Number.isFinite(placed.x) && Number.isFinite(placed.y));
  assert.ok(placed.y >= 8 && placed.y + size.h <= box.h - 8, "and still inside the pane");

  // no obstacle behaves exactly as before
  assert.deepEqual(
    placeBubble({ anchor: { x: 100, y: 200 }, size, box }),
    placeBubble({ anchor: { x: 100, y: 200 }, size, box, avoid: null }));
});

test("a bubble dodges the whole crowd, not just the first one it lands on", () => {
  const box = { w: 700, h: 500 }, size = { w: 160, h: 90 };
  // two obstacles stacked down the right-hand side: dodging one must not park it
  // on the other, which is what a single-rect `avoid` did with three bubbles up
  const crowd = [{ x: 200, y: 40, w: 300, h: 120 }, { x: 200, y: 170, w: 300, h: 120 }];
  const placed = placeBubble({ anchor: { x: 180, y: 150 }, size, box, avoid: crowd });
  const hits = crowd.filter((r) =>
    placed.x < r.x + r.w && placed.x + size.w > r.x && placed.y < r.y + r.h && placed.y + size.h > r.y);
  assert.deepEqual(hits, [], `clear of both (got ${JSON.stringify(placed)})`);

  // a single rect still works, and means the same as a one-item list
  const one = { x: 200, y: 40, w: 300, h: 120 };
  assert.deepEqual(
    placeBubble({ anchor: { x: 180, y: 90 }, size, box, avoid: one }),
    placeBubble({ anchor: { x: 180, y: 90 }, size, box, avoid: [one] }));

  // junk in the list is ignored rather than poisoning the arithmetic with NaN
  const withJunk = placeBubble({ anchor: { x: 180, y: 150 }, size, box, avoid: [null, { x: "x" }, ...crowd] });
  assert.ok(Number.isFinite(withJunk.x) && Number.isFinite(withJunk.y));
  assert.deepEqual(withJunk, placed);
});

test("the bubble remembers how you got there, so every child can go back", () => {
  // a fresh selection off the painting starts a new trail, whatever came before
  assert.deepEqual(bubbleTrailStep(["a", "b", "c"], "select", "z"), ["z"]);
  assert.deepEqual(bubbleTrailStep([], "select", "a"), ["a"]);
  assert.deepEqual(bubbleTrailStep(["a"], "select", null), [], "selecting nothing is closing");

  // following pushes; back pops to exactly where you came from
  const down = bubbleTrailStep(bubbleTrailStep(["a"], "follow", "b"), "follow", "c");
  assert.deepEqual(down, ["a", "b", "c"]);
  assert.deepEqual(bubbleTrailStep(down, "back"), ["a", "b"]);
  assert.deepEqual(bubbleTrailStep(bubbleTrailStep(down, "back"), "back"), ["a"]);

  // the first mark has nowhere to go back to, and back is a no-op rather than
  // an empty trail — closing is the ✕'s job, not the back button's
  assert.deepEqual(bubbleTrailStep(["a"], "back"), ["a"]);
  assert.deepEqual(bubbleTrailStep([], "back"), []);

  // a cycle is kept as walked, not collapsed: stepping back retraces your route
  const cycle = bubbleTrailStep(bubbleTrailStep(["a"], "follow", "b"), "follow", "a");
  assert.deepEqual(cycle, ["a", "b", "a"]);
  assert.deepEqual(bubbleTrailStep(cycle, "back"), ["a", "b"],
    "back from a revisit lands on b, which is where you actually came from");

  // junk in, sane out
  assert.deepEqual(bubbleTrailStep(null, "follow", "a"), ["a"]);
  assert.deepEqual(bubbleTrailStep(["a", null, "b"], "back"), ["a"]);
  assert.deepEqual(bubbleTrailStep(["a"], "follow", null), ["a"], "following nowhere goes nowhere");
  assert.deepEqual(bubbleTrailStep(["a"], "sideways"), ["a"]);
});

test("a mark you cannot set out for is still not a destination", () => {
  const district = { id: "limen/the-district", kind: "sited", tier: "market", at: { x: 0, y: 0 }, extent: { w: 1725, h: 2325 } };
  const crossing = { id: "the-town/the-crossing", kind: "sited", tier: "constitution", at: { x: 0, y: 0 }, extent: { w: 380, h: 18 } };
  const house    = { id: "limen/the-house", kind: "sited", tier: "market", at: { x: 40, y: 40 }, extent: { w: 60, h: 60 } };
  const parcel   = { id: "limen/a-parcel", kind: "parcel", tier: "market", at: { x: 400, y: 400 }, extent: { w: 25, h: 25 } };

  assert.equal(isWalkableTarget(house), true);
  assert.equal(isWalkableTarget(parcel), true, "a parcel is ground you can stand on");
  assert.equal(isWalkableTarget(district), false, "2,325 m across is a region, not a destination");
  assert.equal(isWalkableTarget(crossing), false, "the town's own furniture is not a destination");
  assert.equal(isWalkableTarget({ ...house, at: null }), false, "an unplaced mark is nowhere to go");
  assert.equal(isWalkableTarget({ ...house, kind: "predicated" }), false, "a property of a thing has no ground");
  assert.equal(isWalkableTarget({ ...house, extent: { w: WALK_TARGET_MAX_EXTENT_M, h: 1 } }), false, "the cap is exclusive");
  assert.equal(isWalkableTarget(), false);
});

test("only a pip names a mark; containment only names the ground", () => {
  // The click rule, entire. Containment does not choose the target — it chooses
  // the WORDS — so a region can neither swallow a click nor march you to its
  // centre, and this path needs no walkable/unwalkable rule of its own.
  const district = { id: "limen/the-district", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 1725, h: 2325 } };
  const house    = { id: "limen/the-house", kind: "sited", at: { x: 40, y: 40 }, extent: { w: 60, h: 60 } };
  const told = [district, house];

  assert.equal(snappedMarkAtPoint({ x: 100, y: 100 }, []), null,
    "deep inside a region with no pip nearby, a click names no mark");
  assert.equal(snappedMarkAtPoint({ x: 100, y: 100 }, [{ id: "limen/the-district", x: 104, y: 100 }]),
    "limen/the-district", "its own pip still names it, which is how a region is selected");

  // and the point keeps its coordinates while borrowing the smallest name over it
  const deep = pointWalkDestination({ x: 700, y: 700 }, told);
  assert.deepEqual({ x: deep.x, y: deep.y }, { x: 700, y: 700 }, "the spot you clicked is the spot");
  assert.equal(deep.inside, "limen/the-district");
  assert.match(walkDestinationLabel(deep, told, {}, { x: 0, y: 0 }), /^The District/);

  const inner = pointWalkDestination({ x: 45, y: 45 }, told);
  assert.equal(inner.inside, "limen/the-house", "the SMALLEST container wins, not the outermost");
  assert.notDeepEqual(
    [deep.x, deep.y, deep.inside], [inner.x, inner.y, inner.inside],
    "two spots in one region are two destinations, not one centre twice");
});

test("a place that already has a word in front of it does not bring its own", () => {
  const marks = [
    { id: "wright/the-trueing-house", kind: "sited", at: { x: 0, y: 0 }, extent: { w: 8, h: 8 } },
  ];
  assert.equal(standingLocationLabel({ x: 0, y: 0 }, marks), "standing in The Trueing House");
  assert.equal(standingLocationLabel({ x: 0, y: 0 }, marks, {}, { prefix: false }), "The Trueing House",
    "the walk desk's From row supplies the verb, so the label must not repeat it");
  assert.equal(standingLocationLabel({ x: 900, y: 0 }, marks), "on open ground");
  assert.equal(standingLocationLabel({ x: 900, y: 0 }, marks, {}, { prefix: false }), "open ground");
});

test("the frame answers no relations, and never walks the world to say so", async () => {
  // Everything is inside let-there-be-light, so "within it" is the whole register
  // rather than an answer — and answering it is what made the click slow. The
  // fixture is built so `investigate` WOULD have plenty to say: three districts
  // sitting squarely inside the root, one of them nesting a house.
  const root = { id: WORLD_ROOT_ID, kind: "sited", household: "the-town",
    at: { x: 0, y: 0 }, extent: { w: 320_000, h: 320_000 }, body: "The light comes from the northeast." };
  const districts = [
    { id: "limen/the-threshold-district", kind: "sited", at: { x: 1488, y: 1808 }, extent: { w: 1725, h: 2325 } },
    { id: "wright/the-trueing-terrace", kind: "sited", at: { x: 925, y: -2400 }, extent: { w: 1750, h: 1500 } },
    { id: "rei/the-lanternseed-gardens", kind: "sited", at: { x: 1325, y: -1000 }, extent: { w: 1750, h: 1450 } },
  ];
  const house = { id: "limen/the-wide-spaced-lanterns", kind: "sited", at: { x: 1500, y: 1800 }, extent: { w: 60, h: 60 } };
  const axis = { id: "the-town/the-day-axis", kind: "predicated", parent: WORLD_ROOT_ID, slot: "light", value: "northeast", weight: 4 };
  const marks = [root, ...districts, house, axis];

  // the control: the general verb does answer, so an empty answer below is the
  // special case doing its work and not a fixture that had nothing in it
  const { investigate } = await import("./world-verbs.mjs");
  assert.ok(investigate(WORLD_ROOT_ID, { marks }).children.length >= 3,
    "investigate would name the districts — that is the answer we are declining");

  const d = worldFrameReading(root, marks);
  assert.deepEqual(d.children, [], "the frame names nothing as within it");
  assert.deepEqual(d.parents, [], "and sits inside nothing");
  assert.deepEqual(d.alongside, [], "and stands beside nothing");
  assert.deepEqual(d.more, { predicates: 0, children: 0 },
    "no held-back count either — there is no cut here, so there is nothing withheld");

  // its own terms are its own: the light axis is a property of the frame, not a
  // mark living inside it, so it keeps its seat
  assert.deepEqual(d.predicates.map((p) => p.id), ["the-town/the-day-axis"]);
  assert.equal(d.body, root.body, "the establishing line still reads");
  assert.equal(d.id, WORLD_ROOT_ID);

  assert.deepEqual(worldFrameReading(null), { error: "no mark" });
});

test("no stray backtick hides inside the viewer's STYLE or MARKUP templates", async () => {
  // Both are one long template literal, so a backtick written inside a comment —
  // quoting a class name, say — ends the template early and the CSS after it is
  // parsed as JavaScript. What you get is a ReferenceError naming some fragment
  // of a selector ("minimap is not defined") from a line nowhere near the cause,
  // which is a genuinely bad half-hour. Three of them in one sitting on
  // 2026-08-04 bought this test.
  //
  // Importing the module already fails when this happens; the point here is to
  // fail with the line number of the backtick instead of the line number of the
  // wreckage.
  const { readFile } = await import("node:fs/promises");
  const here = new URL("../spectator/viewer.mjs", import.meta.url);
  const lines = (await readFile(here, "utf8")).split(/\r?\n/);

  const open = (needle) => lines.findIndex((line) => line.startsWith(needle));
  const spans = [
    { name: "STYLE", from: open("const STYLE = ") },
    { name: "MARKUP", from: open("const MARKUP = ") },
  ];
  assert.ok(spans.every((s) => s.from >= 0), "both templates must still be found by their opening line");

  for (const span of spans) {
    // the template ends at the first line that is exactly the closing backtick
    const end = lines.findIndex((line, i) => i > span.from && line.trim() === "`;");
    assert.ok(end > span.from, `${span.name} has no closing backtick`);
    for (let i = span.from + 1; i < end; i++) {
      // interpolation inside MARKUP is legitimate and uses backticks for its own
      // nested templates; a backtick is only a problem inside a comment or prose
      const line = lines[i];
      if (!line.includes("`") || line.includes("${")) continue;
      assert.fail(`${span.name}: stray backtick at ${span.name === "STYLE" ? "" : ""}line ${i + 1} — ${line.trim()}`);
    }
  }
});

test("the tour walks forward, back, and off the end", () => {
  const n = TOUR_SLIDES.length;
  assert.equal(tourStep(0, "next", n), 1);
  assert.equal(tourStep(1, "back", n), 0);
  assert.equal(tourStep(0, "back", n), 0, "back from the first slide stays put");
  assert.equal(tourStep(n - 1, "next", n), -1, "walking off the last slide is finishing");
  assert.equal(tourStep(3, "skip", n), -1);
  assert.equal(tourStep(0, 5, n), 5, "a dot jumps");
  assert.equal(tourStep(2, 99, n), 2, "a dot out of range changes nothing");
  assert.equal(tourStep(2, -1, n), 2);
  // a caller that lost count must not fall off the end of the deck
  assert.equal(tourStep(999, "next", n), -1);
  assert.equal(tourStep(undefined, "next", n), 1);
  assert.equal(tourStep(0, "next", 0), -1, "an empty deck is already over");

  assert.equal(tourProgress(0, 8), "1 / 8");
  assert.equal(tourProgress(7, 8), "8 / 8");
  assert.equal(tourProgress(99, 8), "8 / 8");
});

test("every slide is complete, and its anchor is a class the viewer really writes", async () => {
  assert.ok(TOUR_SLIDES.length >= 6 && TOUR_SLIDES.length <= 10,
    "a tour nobody finishes teaches nothing; keep the deck short");
  const ids = new Set();
  const anchors = [];
  for (const slide of TOUR_SLIDES) {
    assert.match(slide.id, /^[a-z-]+$/, `slide id ${slide.id}`);
    assert.equal(ids.has(slide.id), false, `duplicate slide id ${slide.id}`);
    ids.add(slide.id);
    assert.ok(slide.title?.length > 8, `${slide.id} needs a title`);
    assert.ok(slide.body?.length > 80, `${slide.id} needs a body worth a slide`);
    if (slide.anchor === undefined) continue;
    assert.match(slide.anchor, /^\.[a-z-]+$/, `${slide.id} anchor must be one class selector`);
    anchors.push(slide.anchor.slice(1));
  }
  assert.ok(anchors.length >= 3, "a tour that points at nothing may as well be a page of prose");

  // The copy is prose and stays true on its own; an anchor is a PROMISE ABOUT
  // MARKUP, and it is the one part of a slide a refactor can quietly break. A
  // renamed class does not throw — the slide just centres, and the tour stops
  // pointing at anything, which is the failure nobody would ever notice.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../spectator/viewer.mjs", import.meta.url), "utf8");
  for (const cls of anchors)
    assert.ok(source.includes(`class="${cls}`) || source.includes(`ctl ${cls}`) || source.includes(`"${cls} `)
      || source.includes(`${cls}"`),
      `no element in the viewer carries the class ${cls}, which a tour slide points at`);
});

test("the tour is remembered against the resident, not the browser", () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  assert.equal(TOUR_SEEN_KEY, "pm_world_tour_seen");
  assert.equal(tourSeenKey("limen"), "pm_world_tour_seen:limen");

  assert.equal(readTourSeen(storage, "limen"), false, "a resident who has not been greeted");
  writeTourSeen(storage, "limen");
  assert.equal(readTourSeen(storage, "limen"), true);
  // TWO HOUSEHOLDS ON ONE BROWSER ARE TWO ARRIVALS — the whole point of scoping
  assert.equal(readTourSeen(storage, "wright"), false, "greeting one resident does not greet the next");
  writeTourSeen(storage, "wright");
  assert.equal(readTourSeen(storage, "wright"), true);
  assert.deepEqual([...store.keys()].sort(), ["pm_world_tour_seen:limen", "pm_world_tour_seen:wright"]);

  // A SPECTATOR IS ALWAYS UNSEEN (Keemin, 2026-08-12, overruling 08-05's "never
  // greeted"): the signed-out World page is a front door now, so the greeting
  // returns every visit. Reading `false` is what makes it fire for them — and
  // the no-record half is unchanged and now load-bearing, because "every visit"
  // is precisely what having nothing to write gives you for free.
  assert.equal(tourSeenKey(""), null);
  assert.equal(tourSeenKey(undefined), null);
  assert.equal(readTourSeen(storage, ""), false, "a spectator is greeted every visit");
  assert.equal(readTourSeen(storage, undefined), false);
  writeTourSeen(storage, "");
  assert.equal(store.size, 2, "a spectator leaves no record behind");
  assert.equal(readTourSeen(storage, ""), false, "and is still unseen after the write that did nothing");
  // even where storage is refused outright, a spectator is greeted: the answer
  // never depended on storage, so it cannot be broken by losing it
  assert.equal(readTourSeen(null, ""), false);

  // private mode throws on both, and a viewer that cannot remember must still run
  const sealed = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readTourSeen(sealed, "limen"), true, "a browser that cannot remember is not nagged every load");
  assert.doesNotThrow(() => writeTourSeen(sealed, "limen"));
  assert.equal(readTourSeen(undefined, "limen"), true);
});

test("the record of acts is newest-first, and admits that it knows two precisions", () => {
  const departures = [
    { iso: "2026-08-04T22:30:00.000Z", handle: "wright", toward: { x: 575, y: -2600 }, targetMarkId: "wright/the-trueing-house" },
    { iso: "2026-08-04T06:05:00.000Z", handle: "rei", toward: { x: 12, y: 8 }, targetMarkId: null },
    { iso: "2026-07-28T09:00:00.000Z", handle: "limen", toward: { x: 0, y: 0 }, targetMarkId: "the-town/the-town-centre" },
  ];
  const marks = [
    { id: "the-fen/the-fen", date: "2026-08-04", by: "the-fen" },
    { id: "noe/the-lit-window", date: "2026-08-02", by: "noe" },
  ];
  const names = new Map([["wright/the-trueing-house", "The Trueing House"], ["the-fen/the-fen", "The Fen"]]);
  const rows = recentActivity({ departures, marks, names, now: "2026-08-05T12:00:00Z", limit: 10 });

  assert.deepEqual(rows.map((r) => `${r.kind}:${r.who}`), [
    "walk:wright", "walk:rei", "mark:the-fen", "mark:noe", "walk:limen",
  ], "newest day first; within a day the thing that knows its second comes before the thing that knows only its date");

  // A DEPARTURE KNOWS ITS SECOND, A MARK ONLY ITS DAY. Sorting the day as if it
  // were midnight would push every mark under every walk that shares its date —
  // which is a claim about order the record does not make.
  assert.equal(rows[2].day, rows[1].day, "the mark and the later walk are the same day");
  assert.equal(rows[2].time, "");

  assert.equal(rows[0].name, "The Trueing House");
  assert.equal(rows[1].subject, null, "a walk to bare ground names no mark");
  assert.equal(rows[4].name, null, "and a name we were not given stays null rather than guessed");

  assert.equal(activityDayKey("2026-08-04T22:30:00.000Z"), "2026-08-04");
  assert.equal(activityDayKey("2026-08-04"), "2026-08-04");
  assert.equal(activityDayKey(null), "");

  assert.equal(activityDayLabel("2026-08-05", "2026-08-05"), "today");
  assert.equal(activityDayLabel("2026-08-04", "2026-08-05"), "yesterday");
  assert.equal(activityDayLabel("2026-08-02", "2026-08-05"), "3 days ago");
  assert.equal(activityDayLabel("2026-07-28", "2026-08-05"), "28 Jul");
  assert.equal(activityDayLabel("", "2026-08-05"), "");

  // THE STRIKE MEANS ONE THING: the mark this act named is no longer in the
  // record. It used to mean "not provably present", which is a different claim
  // and true of two innocent states.
  const fold = new Map([["the-fen/the-fen-parcel", {}], ["spar/the-calcite-hearth", {}]]);
  assert.equal(actSubjectGone("vermillion/retired-mark", fold), true, "named a mark the fold has lost");
  assert.equal(actSubjectGone("the-fen/the-fen-parcel", fold), false, "a parcel in the record is not gone");
  assert.equal(actSubjectGone(null, fold), false,
    "a walk toward bare coordinates names no mark — it cannot have lost one");
  assert.equal(actSubjectGone("spar/the-calcite-hearth", new Map()), false,
    "before the fold arrives nothing is known to be missing, because nothing is known");

  assert.deepEqual(recentActivity({}), [], "nothing to report is a clean empty, not a throw");
  assert.equal(recentActivity({ departures, marks, limit: 2 }).length, 2, "the cap is the cap");
  assert.deepEqual(recentActivity({ departures: [{ handle: "x" }], marks: [{ id: "y" }] }), [],
    "an entry with no time cannot be placed in a record ordered by time, so it is not in one");

  // A RESIDENT CORRECTING THEIR COURSE IS STILL ONE JOURNEY. Four departures in an
  // afternoon said the same thing four times and pushed every mark off the list;
  // latest-wins is the ledger's own rule, so the record of acts keeps the latest.
  const fidgety = [
    { iso: "2026-08-04T09:00:00.000Z", handle: "dylan", toward: { x: 1, y: 1 } },
    { iso: "2026-08-04T09:05:00.000Z", handle: "dylan", toward: { x: 2, y: 2 } },
    { iso: "2026-08-04T09:09:00.000Z", handle: "dylan", toward: { x: 3, y: 3 }, targetMarkId: "the-town/the-locks" },
    { iso: "2026-08-03T09:00:00.000Z", handle: "dylan", toward: { x: 4, y: 4 } },
  ];
  const collapsed = recentActivity({ departures: fidgety, marks: [{ id: "a/b", date: "2026-08-04", by: "a" }], now: "2026-08-05T00:00:00Z" });
  assert.equal(collapsed.filter((r) => r.kind === "walk" && r.day === "2026-08-04").length, 1, "one walk that day");
  assert.equal(collapsed[0].subject, "the-town/the-locks", "and it is the LAST one, not the first");
  assert.equal(collapsed.filter((r) => r.kind === "mark").length, 1, "which leaves room for what else happened");
  assert.equal(collapsed.filter((r) => r.day === "2026-08-03").length, 1, "yesterday is its own day, and keeps its own walk");
});

// ───────── the faces on the map ─────────
//
// This is the one surface that renders a user-supplied IMAGE and a user-supplied
// NAME. The tests that matter are the refusals: a URL that is not a plain
// same-origin path must not reach an SVG <image href>, and no amount of
// escaping would have saved us, because `javascript:` survives entity-escaping
// intact. So the rule is a whitelist and these are its teeth.

test("an avatar URL is whitelisted, not sanitised — anything not a rooted local path is refused", () => {
  assert.equal(safeAvatarUrl("/media/wright-avatar-card.jpg"), "/media/wright-avatar-card.jpg");
  assert.equal(safeAvatarUrl("/media/a_b.c-d~e/f.png"), "/media/a_b.c-d~e/f.png", "ordinary URL characters pass");

  for (const hostile of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "//evil.example/x.jpg",
    "https://evil.example/x.jpg",
    "/media/../../etc/passwd",
    "/media/x.jpg?onerror=alert(1)",
    "/media/x.jpg#\" onload=\"alert(1)",
    "  javascript:alert(1)  ",
    "media/x.jpg",
    "",
    null,
    undefined,
    "/" + "a".repeat(400),
  ]) assert.equal(safeAvatarUrl(hostile), null, `refused: ${String(hostile).slice(0, 40)}`);
});

test("a colour is a hex literal or it is the town's gold — never whatever arrived", () => {
  assert.equal(safeHexColor("#b08d57"), "#b08d57");
  assert.equal(safeHexColor("#ABC"), "#ABC");
  for (const bad of ["red", "url(x)", "expression(1)", "#12345", "rgb(1,2,3)", "", null, "#gggggg"])
    assert.equal(safeHexColor(bad), DEFAULT_FACE_COLOR, `fell back: ${String(bad)}`);
  assert.equal(safeHexColor(null, "#000"), "#000", "the fallback is the caller's to choose");
});

test("a monogram is one grapheme, not one code unit", () => {
  assert.equal(monogramOf("Wright"), "W");
  assert.equal(monogramOf("  ellery "), "E");
  assert.equal(monogramOf("", "the-post-office"), "T", "no name falls back to the handle");
  assert.equal(monogramOf("", ""), "?", "and nothing at all still renders something");
  assert.equal(monogramOf("Émile"), "É", "an accented letter is one monogram");
  assert.equal(monogramOf("🦊 fox"), "🦊", "…and so is an emoji, rather than half a surrogate pair");
});

test("residentFace answers for a resident the map knows nothing about", () => {
  const bare = residentFace("stranger");
  assert.deepEqual(bare, {
    handle: "stranger", name: "stranger", avatar: null,
    color: DEFAULT_FACE_COLOR, monogram: "S", household: null,
  }, "no meta is today's dot with a letter in it — never a broken image");

  const full = residentFace("wright", {
    name: "Wright", avatar: "/media/wright-avatar-card.jpg", color: "#b08d57", household: "The Trueing House",
  });
  assert.equal(full.avatar, "/media/wright-avatar-card.jpg");
  assert.equal(full.monogram, "W");
  assert.equal(full.household, "The Trueing House");

  const hostile = residentFace("x", { name: "  ", avatar: "javascript:alert(1)", color: "url(x)" });
  assert.equal(hostile.avatar, null, "a refused avatar leaves the monogram, not a hole");
  assert.equal(hostile.color, DEFAULT_FACE_COLOR);
  assert.equal(hostile.name, "x", "an all-whitespace name falls back to the handle");
});

test("a resident link is encoded, and a handle that isn't handle-shaped gets no link", () => {
  assert.equal(residentHref("wren-winter"), "/residents/wren-winter/");
  for (const bad of ["../../etc", "Wright", "a b", "", null, "<script>", "-leading"])
    assert.equal(residentHref(bad), null, `no link for: ${String(bad)}`);
});

// ───────── the settlement chip ─────────
//
// The chip must never promise a blessing. Settlement is ATTEMPTED on the beat
// and the gate can refuse — so the countdown is to an attempt, and the number
// is whatever last landed, and neither is derived from the other.

test("the countdown runs to the next 06:00/18:00Z attempt, in UTC", () => {
  const at = (iso) => msToNextSettlementAttempt(Date.parse(iso));
  assert.equal(at("2026-08-08T00:00:00Z"), 6 * 3600e3, "midnight → six hours to the morning attempt");
  assert.equal(at("2026-08-08T05:59:00Z"), 60e3, "a minute before is a minute");
  assert.equal(at("2026-08-08T06:00:00Z"), 12 * 3600e3, "standing ON the boundary means the NEXT one, not this one again");
  assert.equal(at("2026-08-08T12:00:00Z"), 6 * 3600e3, "noon → the evening attempt");
  assert.equal(at("2026-08-08T18:00:01Z"), 12 * 3600e3 - 1e3, "just past the evening rolls to tomorrow morning");
  assert.equal(at("2026-08-08T23:59:00Z"), 6 * 3600e3 + 60e3, "late night crosses the date line correctly");
  // month and year boundaries are the case a naive +1 day gets wrong
  assert.equal(at("2026-08-31T20:00:00Z"), 10 * 3600e3, "the last night of a month rolls into the next");
  assert.equal(at("2026-12-31T20:00:00Z"), 10 * 3600e3, "…and the last night of a year rolls into the next");
});

test("the countdown reads at a glance — no 0h, and never a negative", () => {
  assert.equal(formatCountdown(3 * 3600e3 + 12 * 60e3), "3h 12m");
  assert.equal(formatCountdown(12 * 60e3), "12m", "no hours means no 0h");
  assert.equal(formatCountdown(59e3), "under a minute");
  assert.equal(formatCountdown(0), "under a minute");
  assert.equal(formatCountdown(-5000), "under a minute", "a clock that slipped backwards still reads sanely");
});

test("the chip says ATTEMPT, carries the last number that LANDED, and survives having none", () => {
  const now = Date.parse("2026-08-08T14:48:00Z");
  assert.equal(settlementChipText({ n: 22 }, now), "S22 · next attempt in 3h 12m");
  // the refusal case: the number does not move, the countdown starts again, and
  // the chip needs no special wording for it
  assert.equal(settlementChipText({ n: 22 }, Date.parse("2026-08-08T18:00:01Z")), "S22 · next attempt in 11h 59m");
  // an office that cannot name a settlement loses the number, keeps the truth
  for (const none of [null, undefined, {}, { n: "x" }, { n: -1 }])
    assert.equal(settlementChipText(none, now), "next attempt in 3h 12m", `no number for ${JSON.stringify(none)}`);
  assert.equal(settlementChipText({ n: 0 }, now), "S0 · next attempt in 3h 12m", "S0 is a number, not an absence");
  assert.doesNotMatch(settlementChipText({ n: 22 }, now), /next settlement/,
    "the chip must never promise a blessing the gate can refuse");
});

test("a stake row is PARSED out of the town's log, never assumed", () => {
  const rows = parseStakeCommits([
    { subject: "stake: wren-winter -> world-mark/the-town/the-jetty · 12", date: "2026-08-08T10:00:00Z" },
    { subject: "stake: rei -> world-mark/wright/the-trueing-terrace · 1", date: "2026-08-08T09:00:00Z" },
    { subject: "walk: somebody went somewhere", date: "2026-08-08T08:00:00Z" },
    { subject: "stake: NOTAHANDLE -> world-mark/x · 3", date: "2026-08-08T07:00:00Z" },
    { subject: "stake: rei -> something-else/x · 3", date: "2026-08-08T07:00:00Z" },
    { subject: "stake: rei -> world-mark/x · many", date: "2026-08-08T07:00:00Z" },
    { subject: "stake: rei -> world-mark/x · 3" },                     // no date
  ]);
  assert.deepEqual(rows.map((r) => [r.handle, r.mark, r.n]), [
    ["wren-winter", "the-town/the-jetty", 12],
    ["rei", "wright/the-trueing-terrace", 1],
  ], "only well-formed stake subjects with a date become rows");
  assert.deepEqual(parseStakeCommits(null), [], "no log is not a throw");
});

test("the feed interleaves all four kinds on one chronological stream", () => {
  const rows = recentActivity({
    departures: [{ iso: "2026-08-08T12:00:00Z", handle: "rei", toward: { x: 1, y: 2 } }],
    marks: [{ id: "wright/a-mark", date: "2026-08-08", by: "wright" }],
    stakes: [{ iso: "2026-08-08T13:00:00Z", handle: "wren-winter", mark: "the-town/the-jetty", n: 12 }],
    blessings: [{ n: 22, date: "2026-08-08T14:54:00Z" }, { n: 21, date: "2026-08-07T18:07:00Z" }],
    now: "2026-08-08T15:00:00Z",
    limit: 20,
  });
  const kinds = rows.map((r) => r.kind);
  for (const k of ["walk", "mark", "stake", "settlement"]) assert.ok(kinds.includes(k), `${k} is on the stream`);
  // within a day the ones that know their second sort newest-first
  const today = rows.filter((r) => r.day === "2026-08-08");
  assert.equal(today[0].kind, "settlement", "14:54 blessing leads the day");
  assert.equal(today[1].kind, "stake", "then the 13:00 stake");
  assert.equal(rows.find((r) => r.kind === "settlement").n, 22);
  // a blessing has no author — the keeper's gate is not a resident
  assert.equal(rows.find((r) => r.kind === "settlement").who, "");
});

test("a quiet lane contributes nothing and cannot empty the rail", () => {
  const base = { marks: [{ id: "wright/a-mark", date: "2026-08-08", by: "wright" }], now: "2026-08-08T15:00:00Z" };
  const withNothing = recentActivity(base);
  const withEmpties = recentActivity({ ...base, stakes: [], blessings: [], departures: [] });
  assert.deepEqual(withEmpties, withNothing, "empty lanes are the same as absent ones");
  assert.equal(withNothing.length, 1, "and the rail still carries what it had");
});

// ───── the contested click ─────
//
// The rule under test is DON'T GUESS: one pip in radius behaves exactly as it
// always did, more than one and the reader chooses. The head of the contested
// list must always be what the old snap would have returned, or the two
// disagree and a chooser could open on a mark the click never touched.

const PIP = (id, x, y) => ({ id, x, y });

test("one pip in radius is not contested \u2014 today's behaviour, unchanged", () => {
  const pips = [PIP("a/one", 100, 100), PIP("b/far", 400, 400)];
  assert.deepEqual(contestedMarksAtPoint({ x: 102, y: 101 }, pips), ["a/one"]);
  assert.equal(snappedMarkAtPoint({ x: 102, y: 101 }, pips), "a/one", "the snap agrees");
});

test("several pips in radius all come back, nearest first", () => {
  const pips = [PIP("a/parcel", 100, 100), PIP("b/house", 101, 100), PIP("c/pred", 100, 102), PIP("z/far", 900, 900)];
  const got = contestedMarksAtPoint({ x: 100, y: 100 }, pips);
  assert.deepEqual(got, ["a/parcel", "b/house", "c/pred"], "the far one is not in the pile");
  assert.equal(got[0], snappedMarkAtPoint({ x: 100, y: 100 }, pips),
    "the head of the list IS what the old snap picks \u2014 they can never disagree");
});

test("nothing in radius is an empty list, and bad input is not a throw", () => {
  assert.deepEqual(contestedMarksAtPoint({ x: 0, y: 0 }, [PIP("a", 999, 999)]), []);
  assert.deepEqual(contestedMarksAtPoint({ x: NaN, y: 0 }, [PIP("a", 0, 0)]), []);
  assert.deepEqual(contestedMarksAtPoint({ x: 0, y: 0 }, []), []);
  assert.deepEqual(contestedMarksAtPoint({ x: 0, y: 0 }, [{ x: 0, y: 0 }]), [], "a pip with no id is not a choice");
});

test("the chooser lists INNERMOST first \u2014 the thing you are standing on top of", () => {
  const byId = new Map([
    ["t/district", { id: "t/district", extent: { w: 2000, h: 2000 } }],
    ["t/parcel", { id: "t/parcel", extent: { w: 25, h: 25 } }],
    ["t/house", { id: "t/house", extent: { w: 9, h: 12 } }],
    ["t/pred", { id: "t/pred" }],  // a predicate takes its parent's locus: no extent
  ]);
  assert.deepEqual(
    orderInnermostFirst(["t/district", "t/house", "t/pred", "t/parcel"], byId),
    ["t/pred", "t/house", "t/parcel", "t/district"],
    "predicate, building, parcel, district \u2014 most specific claim at the top");
  // stable and total: equal areas fall back to the id, so the list never shuffles
  const tie = new Map([["a/x", { extent: { w: 5, h: 5 } }], ["b/x", { extent: { w: 5, h: 5 } }]]);
  assert.deepEqual(orderInnermostFirst(["b/x", "a/x"], tie), ["a/x", "b/x"]);
  assert.deepEqual(orderInnermostFirst(["ghost"], new Map()), ["ghost"], "an unknown id still gets a row");
  assert.deepEqual(orderInnermostFirst(null, new Map()), []);
});

test("the fan is deterministic, small, and never dances when its neighbours change", () => {
  const a = fanOffsetPx("the-town/the-jetty");
  assert.deepEqual(a, fanOffsetPx("the-town/the-jetty"), "same id, same offset, every render");
  assert.ok(Math.abs(Math.hypot(a.dx, a.dy) - FAN_RADIUS_PX) < 1e-9, "the offset is exactly the fan radius");
  assert.ok(Math.hypot(a.dx, a.dy) <= 6, "and it is a few pixels, not a scatter");
  // different marks land in different directions
  const b = fanOffsetPx("the-town/the-quay-reach");
  assert.ok(Math.hypot(a.dx - b.dx, a.dy - b.dy) > 1e-6, "two marks do not sit on top of each other");
  // the angle comes from the ID alone, so a mark's offset is independent of who
  // else happens to be in its pile \u2014 this is what stops the jump when one
  // appears, disappears, or is filtered out
  assert.deepEqual(fanOffsetPx("t/one"), fanOffsetPx("t/one"));
  assert.equal(markIdHash("t/one"), markIdHash("t/one"));
  assert.notEqual(markIdHash("t/one"), markIdHash("t/two"));
});

test("co-location is same-anchor or within a metre \u2014 the pile, not the neighbourhood", () => {
  const marks = [
    { id: "a", at: { x: 10, y: 10 } },
    { id: "b", at: { x: 10, y: 10 } },        // exactly stacked
    { id: "c", at: { x: 10.5, y: 10 } },      // half a metre off
    { id: "d", at: { x: 40, y: 10 } },        // its own spot
    { id: "e" },                              // unplaced
  ];
  const stacked = coLocatedMarkIds(marks);
  assert.deepEqual([...stacked].sort(), ["a", "b", "c"]);
  assert.equal(stacked.has("d"), false, "a mark alone at its spot is not fanned");
  assert.equal(stacked.has("e"), false, "an unplaced mark has no spot to share");
  assert.equal(coLocatedMarkIds([]).size, 0);
});

// ── the crossing: the vessel, the far artwork, the water between ─────────────

test("a boat is whatever the FOLD calls a vessel, not a handle typed in here", () => {
  const marks = [
    { id: "the-town/the-wheelhouse", mechanic: "timetable",
      timetable: { vessel: "the-town/the-post-office", stops: [] } },
    { id: "the-town/the-post-office" },                       // the vessel's own mark
    { id: "someone/a-second-line", mechanic: "timetable",
      timetable: { vessel: "someone/the-night-packet", stops: [] } },
    { id: "the-town/the-quay" },
  ];
  const handles = vesselHandles(marks);
  assert.deepEqual([...handles].sort(), ["the-night-packet", "the-post-office"],
    "every timetable's vessel draws as a hull — a second line needs no code here");
  // the door publishes walkers under BARE handles; the timetable names mark ids
  assert.equal(handles.has("the-town/the-post-office"), false, "the household prefix is dropped");

  assert.equal(vesselHandles([]).size, 0);
  assert.equal(vesselHandles().size, 0);
  assert.equal(vesselHandles([{ mechanic: "timetable" }]).size, 0, "a timetable naming no vessel is not a boat");
  assert.equal(vesselHandles([{ timetable: { vessel: "a/b" } }]).size, 0, "and neither is a vessel with no mechanic");
  assert.equal(vesselHandles([null, undefined, 3]).size, 0, "junk in the fold does not throw");
});

test("the vessel is drawn, mirrored toward her destination, and never rotated", () => {
  const west = vesselGlyphSVG({
    at: { x: 100, y: 50 }, toward: { x: -900, y: -900 }, unit: 2, moving: true,
    label: "the-post-office — 109142 m to go",
  });
  assert.match(west, /^<g class="wv-vessel moving"/);
  assert.match(west, /translate\(100,50\) scale\(2\)/);
  assert.equal(/scale\(-1,1\)/.test(west), false, "sailing west, the bow already faces left");
  assert.equal(/rotate\(/.test(west), false, "a profile boat is never rotated — she would sail uphill");
  for (const part of ["wv-vessel-hull", "wv-vessel-mast", "wv-vessel-sail", "wv-vessel-flap", "wv-vessel-water"])
    assert.ok(west.includes(part), "the glyph carries its " + part);
  assert.ok(west.includes('aria-label="the-post-office — 109142 m to go"'), "she is named to a screen reader");

  const east = vesselGlyphSVG({ at: { x: 0, y: 0 }, toward: { x: 500, y: 0 }, unit: 1, moving: true });
  assert.match(east, /scale\(-1,1\)/, "sailing east she is mirrored to face her destination");

  const moored = vesselGlyphSVG({ at: { x: 0, y: 0 }, toward: { x: 500, y: 0 }, unit: 1, moving: false });
  assert.equal(/scale\(-1,1\)/.test(moored), false, "at rest she keeps her bow left rather than aiming at nothing");
  assert.ok(moored.includes('class="wv-vessel"'), "and drops the moving class with it");

  // nothing here may throw or emit half a glyph on bad input
  assert.equal(vesselGlyphSVG(), "");
  assert.equal(vesselGlyphSVG({ at: { x: NaN, y: 0 }, unit: 1 }), "");
  assert.equal(vesselGlyphSVG({ at: { x: 0, y: 0 }, unit: 0 }), "");
  assert.equal(
    vesselGlyphSVG({ at: { x: 0, y: 0 }, unit: 1, toward: null, moving: true }),
    vesselGlyphSVG({ at: { x: 0, y: 0 }, unit: 1, moving: true }),
    "a mover with no destination still draws");
});

test("a far glyph is floored at a fraction of the FRAME, so zooming out cannot erase it", () => {
  // at the painting's own width the floor and the authored size agree closely,
  // which is what keeps every zoom this map has always had unchanged
  const atPainting = farGlyphUnit(1, 1500, VESSEL_MIN_FRAME_FRACTION);
  assert.ok(Math.abs(atPainting - 1) < 0.4, `at full width the floor barely moves (${atPainting})`);
  // out at journey width the authored size would be three pixels of hull; the
  // floor takes over and the glyph holds a constant share of the frame
  const journey = farGlyphUnit(1, 24000, VESSEL_MIN_FRAME_FRACTION);
  assert.ok(journey > 9, `at 24000 the floor carries the glyph (${journey})`);
  assert.ok(Math.abs((journey * 60) / 24000 - 1 / 25) < 1e-9, "she is exactly a twenty-fifth of the frame");
  // and she is drawn larger than the crowd she carries — a hull the size of the
  // passenger pile is not a boat, it is more pile
  const walkerDiameter = 22;                       // the walker ring is r = 11
  assert.ok(60 * VESSEL_GLYPH_SCALE > walkerDiameter * 3, "the deck reads around its crowd");
  // zoomed IN, markerScale still owns the size — the floor must not interfere
  assert.equal(farGlyphUnit(24, 25, VESSEL_MIN_FRAME_FRACTION), 1 / 24);
  // and nonsense never collapses a glyph to nothing
  assert.equal(farGlyphUnit(0, 0, 0), 1);
  assert.equal(farGlyphUnit(NaN, NaN, NaN), 1);
  assert.equal(farGlyphUnit(2, NaN, 0.5), 0.5, "a bad frame falls back to the authored size");
});

test("placed artwork is sized by the mark it hangs on, and refuses an unvouched URL", () => {
  const art = placedArtSVG({
    at: { x: -18607, y: -18332 }, extent: { w: 800, h: 800 },
    href: "/media/vermillion-pando-peak-the-true-mountain-card.jpg",
    label: "Pando Peak", id: "pando-peak",
  });
  assert.ok(art.includes('x="-19007"') && art.includes('y="-18732"'), "centred on the mark's own at");
  assert.ok(art.includes('width="800"'), "and sized by the mark's own extent");
  assert.match(art, /preserveAspectRatio="xMidYMid slice"/, "filled, not stretched");
  assert.match(art, /clip-path="url\(#wv-art-clip-pando-peak\)"/);
  assert.ok(art.includes("wv-far-art-frame"), "framed like the atlas's own placed art");
  assert.ok(art.includes('aria-label="Pando Peak"'));

  // the floor exists but is not the normal road — the record's extent wins
  const floored = placedArtSVG({ at: { x: 0, y: 0 }, extent: { w: 10, h: 10 }, minSize: 400, href: "/media/a.jpg" });
  assert.ok(floored.includes('width="400"'));

  // THE WHITELIST IS THE POINT: one road for URLs into an <image href>
  const refused = ["javascript:alert(1)", "https://elsewhere.example/x.jpg", "//host/x.jpg",
    "/media/../../etc/passwd", "/media/x.jpg?q=1", "", null, undefined];
  for (const bad of refused)
    assert.equal(placedArtSVG({ at: { x: 0, y: 0 }, extent: { w: 9, h: 9 }, href: bad }), "",
      `refused: ${String(bad)}`);
  assert.equal(placedArtSVG({ at: { x: NaN, y: 0 }, href: "/media/a.jpg" }), "");
  assert.equal(placedArtSVG({ at: { x: 0, y: 0 }, extent: { w: 0, h: 0 }, href: "/media/a.jpg" }), "",
    "a mark with no extent hangs no picture");
});

test("the mist is deterministic weather laid along the recorded corridor", () => {
  const from = { x: 485, y: 760 }, to = { x: -18607, y: -18332 };
  const a = mistBandSVG({ from, to });
  assert.equal(a, mistBandSVG({ from, to }), "the same crossing gets the same weather, on every clone");
  assert.equal([...a.matchAll(/<ellipse /g)].length, MIST_BANKS, "every bank is drawn");
  assert.match(a, /<radialGradient id="wv-mist-grad">/);
  assert.ok(a.includes('class="wv-mist"') && a.includes('aria-hidden="true"'),
    "weather is not something a screen reader should have to hear about");

  // STATIC BY CONSTRUCTION — the one promise this layer makes to a panning reader
  for (const moving of ["<animate", "animateTransform", "filter=", "feTurbulence", "dur="])
    assert.equal(a.includes(moving), false, `the mist carries no ${moving}`);

  // the banks lie along the passage rather than scattered over the whole world
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  for (const m of a.matchAll(/<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g)) {
    const cx = Number(m[1]), cy = Number(m[2]);
    const t = ((cx - from.x) * (to.x - from.x) + (cy - from.y) * (to.y - from.y)) / (span * span);
    assert.ok(t > -0.25 && t < 1.25, `a bank at ${cx},${cy} sits along the passage (t=${t.toFixed(2)})`);
  }

  assert.equal(mistBandSVG(), "");
  assert.equal(mistBandSVG({ from, to, banks: 0 }), "");
  assert.equal(mistBandSVG({ from, to: from }), "", "a crossing of no distance has no water to fill");
  assert.equal(mistBandSVG({ from: { x: NaN, y: 0 }, to }), "");
});

test("the camera can be pointed at the crossing it is drawing", () => {
  // the atlas is 1500 units wide at 5 m per unit, registered at (485,760)
  const widest = 1500 * MAX_ZOOM_OUT;
  const M_PER_PX = 5;
  // THE SHORT SIDE IS WHAT BINDS. The crossing runs at forty-five degrees, so a
  // landscape pane runs out of height long before it runs out of width — sizing
  // the ceiling against view.w alone is how you get a frame that holds the boat
  // and drops the mountain off the top edge (seen, 2026-08-08).
  const peakDropM = Math.abs(-95458 - 0);
  for (const [pane, ratio] of [["16:10 landscape", 0.72], ["very wide", 0.62], ["phone", 1.4]]) {
    const heightM = widest * ratio * M_PER_PX;
    assert.ok(heightM > peakDropM * 1.05,
      `${pane}: the widest frame is ${Math.round(heightM / 1000)} km tall, and the peak is ${peakDropM / 1000} km down`);
  }
  // the OLD ceiling is the thing being fixed: it could not hold either of them
  const oldWest = (485 - 1500 * 1.1) * M_PER_PX;
  assert.ok(oldWest > -18299, "under 1.1 the boat could not be looked at, at any pan");
  assert.ok(oldWest > -95458, "and the peak was further out still");
  // and the zoom-IN floor is untouched by any of this
  assert.equal(MAX_ZOOM_IN, 60);
});
