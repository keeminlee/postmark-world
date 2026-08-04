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
//   whereIs(handle) — where ARE you. Your walk if you have one, else your home.
//
// Pure: no fs, no git, no engine import — the caller supplies the folded world
// and the parsed ledger, exactly as walk.mjs takes a record and a clock. That is
// what lets the office, the spectator, and any clone all recompute the same
// answer without a second copy of the reasoning.

import { currentDeparture, positionAt, fractionalCrossing } from "./walk.mjs";

// The honest nowhere. A resident with no ground and no walk is not at the origin
// — they are NOT PLACED, and every caller must be able to tell those apart. The
// grid origin is Ferry's crossing, a real place; returning it for "unknown" is
// how a viewer ends up telling a dragon he is standing in the Town Centre.
export const NOWHERE = Object.freeze({
  x: null, y: null, placed: false, source: null, mark_id: null,
});

// A handle's household. Marks carry `household`; for the common case where a
// handle is its own household this still answers correctly.
export function householdOf(handle, world) {
  const own = (world?.marks ?? []).find((m) => m.by === handle && m.household);
  return own?.household ?? handle;
}

// The household's parcel, off the fold's published `parcels` list.
export function parcelFor(handle, world) {
  const hh = householdOf(handle, world);
  if (!hh) return null;
  return (world?.parcels ?? []).find((p) => p.household === hh) ?? null;
}

// WHERE DO YOU LIVE. The parcel is an AREA and a standpoint is a POINT, so
// something must choose: this takes the centre (CALLS.md C2).
export function homeOf(handle, world) {
  const parcel = parcelFor(handle, world);
  if (!parcel || !Number.isFinite(parcel.at?.x) || !Number.isFinite(parcel.at?.y)) return { ...NOWHERE };
  return {
    x: parcel.at.x, y: parcel.at.y, placed: true, source: "parcel",
    mark_id: parcel.id ?? null, parcel,
  };
}

// WHERE ARE YOU. A declared walk wins — it is the resident's own most recent
// statement about themselves — and home is the standing answer underneath it.
// `departures` is walk.mjs's parsed ledger; pass [] when a surface only cares
// about ground.
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
  return homeOf(handle, world);
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
// as `source` ("walk" | "parcel") because it is honest and belongs in a tooltip;
// it just never decides what someone looks like.
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
  return `their ground (${where.mark_id})`;
}
