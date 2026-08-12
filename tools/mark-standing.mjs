// mark-standing.mjs — the ONE definition of a mark's standing: home / constitution / market(commons).
//
// Called markClass until 2026-08-09, when RECONCILIATION.md § 9 Q2 gave "class"
// to type/token — the spine of the new grammar — and kept "standing" for this
// verdict, which is what it always was: where one mark stands, and whose ground
// it stands on. Same walk, truer word.
//
// Keemin's rule (2026-07-28, live debug of S1): "is this in a parcel's directory →
// it's home (green)" — refined 2026-07-30 (Keemin's ruling: sovereign and home align
// completely): home is YOUR OWN mark on YOUR OWN ground. The ancestor walk finds the
// governing ground (the parcel, or a sovereign structure standing on one) and the
// class is "home" only when the mark's author IS that ground's holder. A foreign mark
// inside someone else's parcel — a flower at the doorstep — is a guest on sovereign
// ground and classes market; it never wears the holder's green, never rides the
// holder's free lane at the sweep. The walk works for marks with no coordinates of
// their own (predicated laws, namings), which purely geometric tests structurally miss.
//
// One definition, now four consumers (the viewer's tier accent, the sweep's
// eligibility, the loader's frame rank, the fold's published standing) — a
// second copy of this walk is a future drift; import it.
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

const TOWN = "the-town";

export function markStanding(mark, byId) {
  if (!mark) return "market";
  const author = mark.by ?? mark.household;
  if (author === TOWN && mark.tier === "constitution") return "constitution";
  let m = mark;
  for (let hops = 0; m && hops < 32; hops++) {
    const owner = m.by ?? m.household;
    if (m.kind === "parcel" || m.sovereign)
      // THE ROSE SEAM (open — Keemin is still deciding). Whether a WELCOMED
      // cross-household child standing on sovereign ground also stands as home
      // under the HOLDER's name. If it is ruled in, it is one more disjunct on
      // this line and nowhere else in the world:
      //     owner != null && (owner === author || welcomed(m, mark))
      // which is the whole reason the verdict is one expression in one file.
      return owner != null && owner === author ? "home" : "market";
    m = m.parent ? byId?.get?.(m.parent) : null;
  }
  return "market";
}
