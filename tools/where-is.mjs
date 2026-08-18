// where-is.mjs — ONE answer to "where is this resident", for every surface.
//
// Before this module there were four independent implementations of that
// question — the office's orient, the office's read_home, the office's walkers
// list, and the viewer's own client-side guess — and every position bug the town
// has had was two of them disagreeing:
//
//   · 2026-08-04 · read_home said vermillion was unplaced while the fold plainly
//     held his parcel, because read_home joined a one-time seeding snapshot and
//     orient joined the living fold. The viewer needs read_home's answer to set
//     an origin, so he could not walk anywhere at all.
//   · #1044 · the same shape on wren-winter.
//
// The cure is the one this codebase already uses everywhere else: the law lives
// in the engine and every surface imports it (see world.mjs's "THE LAW IS NOT
// HERE" and the office's thin-over-the-clone rule). Position simply never got
// that treatment. It has it now.
//
// TWO questions, deliberately distinct — conflating them is its own bug:
//   homeOf(handle)  — where do you LIVE. Your ground. Ruling 7: the parcel IS
//                     the home; the house is a sited mark standing on it.
//   whereIs(handle) — where ARE you. Your walk if you have one, else your home,
//                     else the town's porch (see THE PORCH below).
//
// Pure: no fs, no git, no engine import — the caller supplies the folded world
// and the parsed ledger, exactly as walk.mjs takes a record and a clock. That is
// what lets the office, the spectator, and any clone all recompute the same
// answer without a second copy of the reasoning.

import { currentDeparture, positionAt, fractionalCrossing } from "./walk.mjs";

// The honest nowhere. A resident the record cannot place is NOT PLACED, and
// every caller must be able to tell that from a coordinate. The grid origin is
// Ferry's crossing, a real place; returning it for "unknown" is how a viewer
// ends up telling a dragon he is standing in the Town Centre.
export const NOWHERE = Object.freeze({
  x: null, y: null, placed: false, source: null, mark_id: null,
});

// THE PORCH. Ruled 2026-08-18 (Keemin): a resident with no walk and no ground
// stands at the quay — the town's porch — rather than nowhere at all.
//
// This does NOT retire the rule above; it is the reason that rule was written,
// served better. What the old comment forbids is a place SMUGGLED IN as an
// answer, and it is right to forbid it: the dragon read the Town Centre because
// nothing in the answer said "we are guessing". So the porch arrives DECLARED —
// `source: "quay"` and the quay's own mark id — and any caller that cared about
// the distinction can still make it, on a field rather than by inference.
//
// The alternative it replaces was not honesty, it was silence: the plural answer
// simply dropped everyone it could not place, so a third of the roll was absent
// from the town's own map with nothing anywhere saying so. A labelled default is
// legible; an omission is not.
//
// The coordinate is READ FROM THE RECORD, never held here. A world whose fold
// has no quay has no porch, and answers NOWHERE — refuse or disclose an absent
// input, never quietly substitute for it.
export const QUAY_MARK_ID = "the-town/the-quay";

export function porchOf(world) {
  const quay = (world?.marks ?? []).find((m) => m.id === QUAY_MARK_ID);
  if (!quay || !Number.isFinite(quay.at?.x) || !Number.isFinite(quay.at?.y)) return { ...NOWHERE };
  return { x: quay.at.x, y: quay.at.y, placed: true, source: "quay", mark_id: quay.id };
}

// A handle's household key, at the grain the town DECLARES.
//
// Ruled 2026-08-18: ground resolves at HOUSEHOLD grain. The vocabulary is the
// one the fold already consumes — the registry projection from the town's own
// resolver (tools/households-project.mjs), published back out as
// `world.households`. Asking it here rather than deriving a second answer is the
// whole point: a second resolver is how the four position implementations this
// module replaced came to disagree in the first place.
//
// A handle the registry does not know falls back to what it always did — the
// household its own marks carry, else the handle. Registry lag must never
// unplace anyone; it may only leave them ungrouped (households-project's law).
export function householdOf(handle, world) {
  const declared = world?.households?.[handle];
  if (declared) return declared;
  const own = (world?.marks ?? []).find((m) => m.by === handle && m.household);
  return own?.household ?? handle;
}

// The key a published parcel row answers to. Resolved the same way the READER
// is, through the same map, so the two sides of the comparison cannot be at
// different grains — which is the failure a second copy of the key on the row
// itself would have made possible.
const parcelKey = (parcel, world) => householdOf(parcel?.household, world);

// EVERY parcel the resident's household holds, the handle's own first.
//
// Plural because a household may hold several (the claim cap is 3, and the
// Reeves' four stand by exception) — and because the reading defect this fixes
// was exactly the assumption that a resident's ground is a resident's own.
//
// THE CLAIMING LAW IS UNCHANGED. "Every resident-handle may hold one parcel"
// stays handle-grain (MARKS.md § Parcels) and the cap stays credential-grain.
// This changes who can READ ground, never who may hold it.
export function parcelsFor(handle, world) {
  if (!handle) return [];
  const parcels = world?.parcels ?? [];
  const key = householdOf(handle, world);
  const own = parcels.filter((p) => p.household === handle);
  const family = parcels.filter((p) => p.household !== handle && parcelKey(p, world) === key);
  return [...own, ...family];
}

// The one parcel a single-parcel caller means. Kept because most callers hold
// exactly one and should not have to know that plural is possible.
export function parcelFor(handle, world) {
  return parcelsFor(handle, world)[0] ?? null;
}

// WHERE DO YOU LIVE. The parcel is an AREA and a standpoint is a POINT, so
// something must choose: this takes the centre (CALLS.md C2).
//
// When a household holds several, the pick is DETERMINISTIC and it SAYS WHICH:
// the handle's own ground first, else the household's first in fold order. A
// resident reading a sibling's ground should be able to see that is what
// happened, so `via` and the full holding are on the answer.
export function homeOf(handle, world) {
  const parcels = parcelsFor(handle, world);
  const parcel = parcels[0] ?? null;
  if (!parcel || !Number.isFinite(parcel.at?.x) || !Number.isFinite(parcel.at?.y)) return { ...NOWHERE };
  return {
    x: parcel.at.x, y: parcel.at.y, placed: true, source: "parcel",
    mark_id: parcel.id ?? null, parcel,
    household: householdOf(handle, world),
    via: parcel.household === handle ? "own" : "household",
    household_parcels: parcels.map((p) => p.id),
  };
}

// WHERE ARE YOU. A declared walk wins — it is the resident's own most recent
// statement about themselves — then the ground you live on, then the porch.
// `departures` is walk.mjs's parsed ledger; pass [] when a surface only cares
// about ground.
//
// THREE TIERS, one derivation, and each says which it is. Before this there were
// two tiers and a silence; the silence was the bug (see THE PORCH).
export function whereIs(handle, { world = null, departures = [], at = fractionalCrossing() } = {}) {
  const departure = currentDeparture(departures ?? [], handle);
  if (departure) {
    const p = positionAt(departure, at);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return {
        x: p.x, y: p.y, placed: true, source: "walk",
        mark_id: departure.targetMarkId ?? null,
        position: p, departure,
      };
    }
  }
  const home = homeOf(handle, world);
  if (home.placed) return home;
  return porchOf(world);
}

// EVERY placed resident, in ONE list, in one vocabulary.
//
// There are not three kinds of resident. For a while the town published two
// lists and painted three colours — walking (pink), arrived (green), standing
// (grey) — and that was a category error worth naming, because "arrived" and
// "standing" are THE SAME STATE. Both are a person at rest at a place. What
// differed was only PROVENANCE: whether we learned the position from a walk
// record or from their parcel. We were rendering how-we-know as if it were
// what-they-are, so a resident who had never walked looked like a different
// species from one who had.
//
// So: one list, and exactly two states — `moving` or still. Provenance survives
// as `source` ("walk" | "parcel" | "quay") because it is honest and belongs in a
// tooltip; it just never decides what someone looks like.
//
// `source` IS THE HONESTY, so it must never be broader than what it claims. A
// resident standing on the porch because the record has nothing else to say
// about them reads `quay`, not `walk` — a placement is not an act its subject
// performed, and calling it one misattributes the act to them.
//
// `handles` is who to consider. Callers pass the roster they know (parcel
// households plus anyone with a walk record); this owns the shape, so the office
// door and the local spectator cannot drift apart the way they just did.
export function publicResidents(handles, { world = null, departures = [], at = fractionalCrossing() } = {}) {
  const seen = new Set();
  const out = [];
  for (const handle of handles ?? []) {
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    const here = whereIs(handle, { world, departures, at });
    if (!here.placed) continue;
    const p = here.position ?? null;
    const moving = Boolean(p && p.arrived === false);
    out.push({
      handle,
      x: here.x, y: here.y,
      source: here.source,          // how we know — never how it renders
      moving,
      toward: moving ? (here.departure?.toward ?? null) : null,
      remaining_m: moving ? p.remainingM : 0,
      eta_crossings: moving ? p.etaCrossings : 0,
      mark_id: here.mark_id ?? null,
    });
  }
  return out;
}

// One sentence naming where an answer came from, so no surface has to invent
// wording that might describe the camera in the grammar of a body.
export function sourceLabel(where, handle = "this resident") {
  if (!where?.placed) return `${handle} has no ground on the map yet`;
  if (where.source === "walk") {
    return where.position && where.position.arrived === false
      ? `the road — a walk in progress (${Math.round(where.position.remainingM)} m to go)`
      : "where the walk arrived";
  }
  // The porch says out loud that it is a default, because a reader who cannot
  // tell a default from a choice is the reader NOWHERE was written to protect.
  if (where.source === "quay") return `the quay — the town's porch, where the record places anyone it cannot yet place elsewhere`;
  if (where.via === "household") return `their household's ground (${where.mark_id})`;
  return `their ground (${where.mark_id})`;
}
