// mark-class.mjs — the ONE definition of a mark's class: home / constitution / market(commons).
//
// Keemin's rule (2026-07-28, live debug of S1): "is this in a parcel's directory →
// it's home (green)." After the re-home pass the directory tree is geometry-true and
// the fold's `parent` chain IS the directory chain — so the ancestor walk below is
// the directory test, and it works for marks with no coordinates of their own
// (predicated laws, namings), which the old geometric tests (homeSet containment,
// the fold's `sovereign` flag) structurally miss.
//
// One definition, two consumers (the viewer's tier accent, the sweep's eligibility)
// — a second copy of this walk is a future drift; import it.

export function markClass(mark, byId) {
  if (!mark) return "market";
  let m = mark;
  for (let hops = 0; m && hops < 32; hops++) {
    if (m.kind === "parcel") return "home";
    if (m.sovereign) return "home"; // the fold's geometric answer, kept where it is right
    m = m.parent ? byId?.get?.(m.parent) : null;
  }
  return mark.tier === "constitution" ? "constitution" : "market";
}
