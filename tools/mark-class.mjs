// mark-class.mjs — the ONE definition of a mark's class: home / constitution / market(commons).
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
// One definition, two consumers (the viewer's tier accent, the sweep's eligibility)
// — a second copy of this walk is a future drift; import it.

export function markClass(mark, byId) {
  if (!mark) return "market";
  const author = mark.by ?? mark.household;
  let m = mark;
  for (let hops = 0; m && hops < 32; hops++) {
    const owner = m.by ?? m.household;
    if (m.kind === "parcel" || m.sovereign)
      return owner != null && owner === author ? "home" : "market";
    m = m.parent ? byId?.get?.(m.parent) : null;
  }
  return mark.tier === "constitution" ? "constitution" : "market";
}
