import assert from "node:assert/strict";
import test from "node:test";

import {
  clampStakeAmount,
  createMarkInteractionStore,
  disciplineAtlasImages,
  formatEtaCrossings,
  MARK_SNAP_RADIUS_PX,
  officeBase,
  pointWalkDestination,
  previewStakeLedgerLine,
  previewWalkLeg,
  snappedMarkAtPoint,
  viewerAxisControls,
  viewerAxisState,
  viewerFilterControls,
} from "../spectator/viewer.mjs";

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
  assert.deepEqual(
    previewWalkLeg({ from: { x: 0, y: 0 }, toward: { x: 30_000, y: 0 } }),
    { distanceM: 30_000, etaCrossings: 2, viaCrossings: [] },
  );
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
