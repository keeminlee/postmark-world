// act-as.mjs — WHO THIS KEY IS ACTING AS, resolved once for every reader.
//
// ⚑ WHY THIS IS ITS OWN FILE. The world page has TWO surfaces that decide whose
// standpoint the page is about, and until 2026-08-29 they decided it differently:
//
//   • the VIEWER resolved it from `pm.world.act_as` AND `pm.world.last_resident`,
//     with the spectator sentinel handled explicitly;
//   • the SITE's cockpit read only `pm.world.act_as` and fell back to the first
//     handle on the key.
//
// So on a reload where `act_as` was absent or held the spectator sentinel, the
// viewer's camera and the cockpit's apex read rooted at DIFFERENT RESIDENTS
// until the reader clicked a face. That is the founder's report — the Act As
// row naming one resident while the page showed another's standpoint — and it
// was never a special case for the fight; it was two answers to one question.
//
// THE FUNCTION ALREADY LIVED IN viewer.mjs AND WAS ALREADY EXPORTED. What it did
// not have was a home the site could import without pulling eight thousand lines
// of viewer into the cockpit's bundle — the module is import-safe (no top-level
// side effects, verified) but it is not small, and the page already loads its
// own copy. One tiny module both sides import is the shape that makes "one
// resolver" true rather than merely intended.
//
// viewer.mjs re-exports both names, so its own callers and its own falsifiers
// are untouched.

/** The sentinel for reading the world as nobody in particular. Not a handle —
 *  a resident handle is kebab-case and cannot contain the underscores. */
export const SPECTATOR_ACTOR = "__spectator__";

/**
 * Which resident this key is acting as, and whose standpoint the page roots at.
 *
 * `actAs` is what the roster shows selected — it may be the spectator sentinel.
 * `handle` is always a real resident where the key holds one, because the reads
 * a page makes need a standpoint even while the reader is spectating.
 *
 * THE PRECEDENCE IS THE VIEWER'S OWN, unchanged: the remembered selection wins
 * where the key still holds it, then the last resident actually acted as, then
 * the first handle. A remembered name the key no longer holds falls through
 * rather than bouncing, which is what makes a revoked resident harmless.
 */
export function resolveActAsSelection({ handles = [], remembered = "", lastResident = "" } = {}) {
  const residents = [...new Set((handles ?? []).filter((handle) => typeof handle === "string" && handle))];
  if (!residents.length) return { actAs: SPECTATOR_ACTOR, handle: "" };
  const handle = residents.includes(remembered)
    ? remembered
    : residents.includes(lastResident) ? lastResident : residents[0];
  return {
    actAs: remembered === SPECTATOR_ACTOR ? SPECTATOR_ACTOR : handle,
    handle,
  };
}

/** The two keys the browser remembers it under. Named here so a reader who
 *  finds one of them in a third place knows where the law is. */
export const ACT_AS_KEY = "pm.world.act_as";
export const LAST_RESIDENT_KEY = "pm.world.last_resident";
