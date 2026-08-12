// mark-standing.mjs — the ONE definition of a mark's standing: home / constitution / market(commons).
//
// Called markClass until 2026-08-09, when RECONCILIATION.md § 9 Q2 gave "class"
// to type/token — the spine of the new grammar — and kept "standing" for this
// verdict, which is what it always was: where one mark stands, and whose ground
// it stands on.
//
// Keemin's rule (2026-07-28, live debug of S1): "is this in a parcel's directory →
// it's home (green)" — refined 2026-07-30 (sovereign and home align completely),
// and settled 2026-08-12 into the three-case ground verdict below. The ancestor
// walk finds the governing ground (the parcel, or a sovereign structure standing
// on one) and asks one question of it: is this mark the ground's own. It works
// for marks with no coordinates of their own (predicated laws, namings), which
// purely geometric tests structurally miss.
//
// One definition, five consumers (the viewer's accent, the sweep's eligibility,
// the loader's frame rank, the fold's published standing, the lint's prose) —
// a second copy of this walk is a future drift; import it.
//
// ---------- one walk, one truth (Keemin's ruling, 2026-08-12) ----------
// STANDING IS DERIVED HERE AND NOWHERE ELSE, AND NEVER DECLARED BY A RESIDENT.
// A `tier:` line on a resident's record states nothing, because standing is a
// fact about the GROUND a mark stands on and the ground is not the author's to
// assert. Nothing downstream may read that field as authority; it asks this
// walk instead.
//
// The one exception is the town's own law, read BELOW BEFORE the walk. The
// constitution is the town speaking about the town's ground, and it has to be
// answered before any ancestor is looked at: a reach of the town's river filed
// inside a resident's parcel would otherwise come back "market" — a guest on
// their fence — and the whole tier binding exists to make exactly that
// impossible. (Migrating the law layer off the field and onto class-nodes is a
// later pass; until then the town states its own standing and no one else does.)
//
// ---------- conferred sovereignty (Keemin's ruling, 2026-08-12 evening) -------
// Standing on sovereign ground is a DERIVABLE TRAIT, and the three cases are
// decided in `groundVerdict` below — the one place, so that the fold, the lint,
// the sweep and the viewer cannot disagree about who is at home:
//
//   SAME HOUSEHOLD    home. Not a conferral at all: same-household composition
//                     is structural (consent.mjs's default table — "an estate's
//                     own wing is part of the estate"). Two of one person's
//                     handles are one household, so their marks compose across
//                     handles and neither asks the other's permission.
//
//   WELCOMED          home, under the ground-holder's name. The holder's word
//                     about a cross-household mark standing on their ground,
//                     written in their own record's `consent:` map. This is the
//                     conferral, and it is the only one.
//
//   ABSENT / OPPOSED  market, exactly as before. Absent is the resting state: a
//                     guest at the doorstep is a guest. `opposed` is the return
//                     law and belongs to consent.mjs; nothing here touches it.

import { consentMap } from "./consent.mjs";

const TOWN = "the-town";

// THE GRAIN. Every conflict rule in this world scopes to the HOUSEHOLD — the
// human behind the handle — because a conflict between two of one person's own
// residents is not a conflict (marks-fold.mjs § the household grain). The fold
// resolves it onto each record as `_cred` and publishes it as
// `declared_household`, so this reads the resolved value wherever the caller
// has one and falls back to the handle where nobody has resolved it yet.
//
// The fallback is safe by construction, not by luck: the two callers that have
// not resolved it (the loader's frame walk and the lint) consume only the RANK
// this verdict maps to, and home and market map to the SAME rank on resident
// ground. A grain difference there cannot move a mark or change a refusal —
// tier-frames.test.mjs holds that as its own assertion.
export function standingHouseholdOf(mark) {
  return mark?._cred ?? mark?.declared_household ?? mark?.household ?? mark?.by ?? null;
}

export function markStanding(mark, byId) {
  if (!mark) return "market";
  if ((mark.by ?? mark.household) === TOWN && mark.tier === "constitution") return "constitution";
  const house = standingHouseholdOf(mark);
  let m = mark;
  for (let hops = 0; m && hops < 32; hops++) {
    if (m.kind === "parcel" || m.sovereign || m._sovereign) return groundVerdict(m, mark, house);
    // The containment chain, whatever the caller calls it: `parent` is the
    // authored edge a predicate carries, `_parentMarkId` the loader's directory
    // edge, `placementParent` the published store's. The three are the same
    // fact — the lint refuses an edge that does not name the tightest
    // geometric container, so the directory IS the geometry here.
    const up = m.parent ?? m._parentMarkId ?? m.placementParent;
    m = up ? byId?.get?.(up) : null;
  }
  return "market";
}

// The verdict at the ground — the one place the three cases live, and the one
// place a fourth would go.
//
// The consent word is read off the record the walk STOPPED at, which is the
// nearest sovereign ground and therefore the most specific holder: a house can
// speak about what stands inside the house, its parcel about what stands on the
// parcel (consent.mjs, "a mark's author about what stands inside their mark").
//
// This reads the authored word directly and never resolveConsent's output, so
// there is no cycle: consent.mjs imports nothing, and the fold calls the two
// independently. The readings cannot contradict each other on conferral either,
// because this asks the word only about a mark the walk has already established
// is a CONTAINMENT descendant of the ground — a strictly smaller domain than
// the geometric intersection resolveConsent's parcel rule runs over.
function groundVerdict(ground, mark, house) {
  const holder = standingHouseholdOf(ground);
  if (holder == null || house == null) return "market";
  if (holder === house) return "home";
  return mark.id != null && consentMap(ground)?.[mark.id] === "welcomed" ? "home" : "market";
}
