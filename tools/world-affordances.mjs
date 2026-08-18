// world-affordances.mjs — WHAT CAN THIS ACTOR DO FROM HERE, once, for everyone.
//
// The office's apex door and the site's Actions rail ask the identical
// question, and until now they answered it in two places: the door resolved
// grants from the store, and the rail read the door's answer over the network
// once per Act-As switch. That second road cost a request per switch and made
// the palette stale between them — and, worse, the two halves had already
// drifted once: the door's own reader dropped `for:` on the floor while the
// store's reader defaulted it to `resident`, so no client could tell a grant
// minted for a human from one minted for a resident (found 2026-08-18, the
// Actions-rail step; recorded then as a residue owed).
//
// So the resolution lives HERE, in the package both consume, and each caller
// decorates the result with what only it knows: the office adds the flat tool
// an action dispatches to and the fields that tool takes; the viewer adds the
// doors it has renderers for. Neither re-implements the law.
//
// THE GATE IS NOT DECIDED HERE, and that is deliberate. Whether a mark may mint
// a verb at all is a security boundary with a reviewed implementation on each
// side (the office's `isClassMark` over its store; the world's own lint over
// the record), and the two do not currently agree about one clause — the office
// asks whether the mark's PATH contains `/the-keeping-works/`, the world walks
// PLACEMENT ancestry to the works. They agree on every mark in the record
// today; they are still two definitions, and collapsing a security predicate is
// a bigger act than this module. So `standsInTheWorks` arrives as an argument
// and each caller passes the one it already trusts.

// A class mark's grants, as declared. `actions:`/`action` are the keys;
// `affordances:`/`subverb` are the pre-rename spellings (2026-08-15), still
// read so a record hydrated from older law keeps its doors open.
export function declaredGrants(mark) {
  const list = mark?.actions ?? mark?.props?.actions ?? mark?.affordances ?? mark?.props?.affordances;
  return Array.isArray(list) ? list : [];
}

// `for:` absent means resident — today's intent made explicit, never a guess.
// This is the store's own rule (`actionEntriesOf`), stated once so the door and
// the client cannot disagree about what an undeclared grant is for.
export const grantActorKind = (grant) => String(grant?.for ?? "resident").trim() || "resident";

export const BLURB_MAX = 150; // the class grammar's own cap (LOGOS/classes.md)

// WHY a door is open to you, and the three answers are different facts: you are
// inside the thing, you can see it, or the law travels.
export function viaFor(id, { spine, reach }) {
  if (spine.has(id)) return "within";
  if (reach.has(id)) return "in reach";
  return "ambient";
}

/**
 * The actions in force at a standpoint.
 *
 * `marks` is the class-mark set the CALLER has already gated. `reachIds` is
 * open-your-eyes' own ranking — the marks the field-of-view build already
 * decided were salient here — so a door appears exactly when the thing that
 * carries it is visible. An ambient class reaches a caller standing in
 * genuinely empty space, which is why no ids is not "nothing to ask".
 *
 * `residueOf(id)` hands back the residue class the grant points at, or null.
 * The blurb is QUOTED from it rather than copied beside the grant, because a
 * paraphrase beside a meaning is a drift waiting to happen; a pointer that
 * cannot resolve is said out loud rather than papered over.
 *
 * `actorKind` filters by the kind each grant is FOR. Passing null resolves
 * every kind — which is what the door does when it is describing the law
 * rather than answering for a particular actor.
 */
export function resolveAffordances({
  marks = [],
  spineIds = [],
  reachIds = [],
  actorKind = null,
  residueOf = () => null,
  isAmbient = (m) => m?.ambient === true || m?.props?.ambient === true,
} = {}) {
  const spine = new Set(spineIds.filter(Boolean));
  const reach = new Set(reachIds.filter(Boolean));
  const entries = [];
  for (const mark of marks) {
    const id = mark?.id;
    if (!id) continue;
    // Gate, then reach. The caller gated; this decides whether the caller can
    // SEE it from where they stand — on their spine, within their eyes' reach,
    // or everywhere, if the class declares itself ambient.
    if (!spine.has(id) && !reach.has(id) && !isAmbient(mark)) continue;
    const via = viaFor(id, { spine, reach });
    for (const grant of declaredGrants(mark)) {
      const action = String(grant?.action ?? grant?.subverb ?? "").trim();
      if (!action) continue;
      const forKind = grantActorKind(grant);
      if (actorKind !== null && forKind !== actorKind) continue;
      const residueId = String(grant?.residue ?? "").trim() || null;
      const residue = residueId ? residueOf(residueId) : null;
      entries.push({
        action,
        for: forKind,
        blurb: residue ? String(residue.text ?? "").slice(0, BLURB_MAX) : String(grant?.blurb ?? "").slice(0, BLURB_MAX),
        ...(residue ? { blurb_from: residue.from } : {}),
        ...(residue?.dials && Object.keys(residue.dials).length ? { dials: residue.dials } : {}),
        ...(residueId && !residue ? { residue_unresolved: residueId } : {}),
        from: id,
        class: mark.class ?? mark?.props?.class ?? null,
        declared_fields: grant?.fields ?? null,
        via,
      });
    }
  }
  return entries;
}

/**
 * The residue lookup over a FOLD (the browser's road to the same answer the
 * office reaches through SQL). Gated looser than the verb-minting gate on
 * purpose — a residue class mints no verbs of its own, so requiring `actions:`
 * here would blind exactly this lookup. Authorship and tier still hold: only
 * the town's own constitutional record is ever quoted as a meaning.
 */
export function residueLookupFromMarks(marks = []) {
  const byId = new Map();
  for (const m of marks ?? []) {
    if (!m?.id) continue;
    if (m.by !== "the-town" || m.tier !== "constitution") continue;
    if ((m.class ?? m?.props?.class) == null) continue;
    byId.set(m.id, m);
  }
  return (id) => {
    const m = byId.get(String(id));
    if (!m) return null;
    return { from: m.id, class: m.class ?? m?.props?.class, dials: m.dials ?? m?.props?.dials ?? null, text: String(m.body ?? m?.props?.body ?? "") };
  };
}

/**
 * The class marks in a fold that may mint verbs — the client's half of the
 * gate. `standsInTheWorks` is the caller's, for the reason at the top of this
 * file; the default walks PLACEMENT ancestry to the Keeping Works, which is the
 * definition the world's own lint uses.
 */
export const THE_WORKS = "the-town/the-keeping-works";
export function placementWalkStandsInTheWorks(marks = []) {
  const byId = new Map((marks ?? []).map((m) => [m.id, m]));
  return (mark) => {
    let cur = mark;
    for (let hop = 0; cur && hop < 32; hop += 1) {
      if (cur.id === THE_WORKS) return true;
      const parent = cur.placementParent ?? cur?.props?.placementParent ?? null;
      if (!parent) return false;
      cur = byId.get(parent);
    }
    return false;
  };
}
export function classMarksIn(marks = [], { standsInTheWorks = null } = {}) {
  const inWorks = standsInTheWorks ?? placementWalkStandsInTheWorks(marks);
  return (marks ?? []).filter((m) => m?.by === "the-town"
    && m?.tier === "constitution"
    && (m.class ?? m?.props?.class) != null
    && declaredGrants(m).length > 0
    && inWorks(m));
}
