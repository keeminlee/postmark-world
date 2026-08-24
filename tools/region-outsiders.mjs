// region-outsiders.mjs — who is standing outside their region's ring, derived
// from the tree and from nothing else.
//
// WHY THIS MOVED OUT OF THE GENERATOR (S45's seventh refusal, 2026-08-24).
// The list was emitted by tools/region-rings-gen.mjs, which is HAND-RUN against
// the atlas. The settlement sweep is not hand-run: it publishes new marks and
// performs re-homes, and it did both on the 13:51Z attempt. So the record moved
// and the list did not, and the biconditional the whole heads-up scheme rests on
// — every mark under a region is either inside its ring or named on the list —
// was false the moment a settlement touched the map. A newly published mark was
// neither contained nor listed; a re-homed one could be both.
//
// The fix is not a reminder to re-run the generator. It is to notice that the
// list was never really the generator's to own: the generator's job is TRACING
// RINGS FROM THE ATLAS, and once a ring is in a region's own `points:` the list
// needs no atlas at all — the tree already carries every fact it asks for. So it
// becomes what it always was, a FOLD-DERIVED VIEW of the record, emitted beside
// world-state.json and INDEX.md at every fold.
//
// Two things fall out for free, and both were previously argued for by hand:
// the list is regenerated whenever the world is, so it cannot go stale; and the
// exemption it grants the containment gate is SELF-RETIRING, because a resident
// whose ground comes back inside their ring is simply not written into the next
// fold's list.
//
// The roster is the twelve regions the atlas draws a wash for — the founding
// act's thirteen minus vermillion/the-pando-peak, a far horizon object with no
// wash, and minus the-carried-weight, founded but deliberately undrawn (#1922).
// It is stated here rather than derived from "has a ring" because a water mark
// carries a ring too, and the sea is not a region anyone is filed under.

export const REGION_SLUGS = Object.freeze([
  "the-town-centre", "the-trueing-terrace", "the-lanternseed-gardens", "the-threshold-district",
  "the-long-run", "the-protected-grove", "the-doubled-coast", "aelyria", "the-reach",
  "the-east-window-district", "the-high-ground", "evermoon",
]);

/** A mark occupies ground if it has a position, is not a far horizon object, and
 *  is not one of the kinds that carry no geometry (SCHEMA: "The predicate
 *  carries no geometry"). One predicate, shared by the derivation and by the
 *  falsifiers, so a mark cannot be in scope for one and invisible to the other. */
export const occupiesGround = (m) =>
  !!m.at && !m.far && m.kind !== "predicated" && m.kind !== "naming" && m.kind !== "class";

const rectOf = (m) => ({ x: m.at.x, y: m.at.y, w: m.extent?.w ?? 1, h: m.extent?.h ?? 1 });

/**
 * The rows, from composed marks alone.
 *
 * `marks` must be the FRAMED tree — every mark's `at` and `points` in world
 * coordinates, which is what loadMarks hands back. Ring containment is the whole
 * extent, exactly: every corner inside and no ring edge crossing the outline.
 */
export function deriveOutsiders(marks, { rectInsideRing, polygonOf, overlapArea }) {
  const byId = new Map(marks.map((m) => [m.id, m]));
  const parcels = marks.filter((m) => m.kind === "parcel" && m.at && !m.far);
  const rows = [];

  const descendantsOf = (id) => marks.filter((m) => {
    const seen = new Set();
    let p = m._parentMarkId;
    while (p && !seen.has(p)) { if (p === id) return true; seen.add(p); p = byId.get(p)?._parentMarkId; }
    return false;
  });

  for (const slug of REGION_SLUGS) {
    const region = marks.find((m) => m.slug === slug);
    if (!region) continue;                     // a roster the record does not hold is the lint's finding, not this view's
    const ring = polygonOf(region);
    if (!ring) continue;                       // a region with no ring yet cannot exclude anyone
    for (const k of descendantsOf(region.id)) {
      if (!occupiesGround(k)) continue;
      const r = rectOf(k);
      if (rectInsideRing(ring, r)) continue;
      // The founder's caution: never send someone onto ground another household
      // has already declared.
      const over = parcels
        .filter((p) => p.id !== k.id && String(p.by) !== String(k.by) && overlapArea(rectOf(p), r) > 0)
        .map((p) => p.id).sort();
      rows.push({
        resident: k.by, mark: k.id, kind: k.kind,
        region: region.id, region_by: region.by,
        at: { x: r.x, y: r.y }, extent: { w: r.w, h: r.h },
        overlaps_another_parcel: over,
      });
    }
  }
  rows.sort((a, b) => a.resident.localeCompare(b.resident) || a.mark.localeCompare(b.mark));
  return rows;
}

export function outsidersJson(rows) {
  const residents = new Set(rows.map((r) => r.resident)).size;
  return { generated_by: "tools/marks-fold.mjs (fold-derived)", count: rows.length, residents, rows };
}

export function outsidersMarkdown(rows) {
  const byResident = new Map();
  for (const r of rows) {
    if (!byResident.has(r.resident)) byResident.set(r.resident, []);
    byResident.get(r.resident).push(r);
  }
  const md = [];
  md.push("# Residents standing outside their region's ring");
  md.push("");
  md.push("GENERATED at every fold by `tools/marks-fold.mjs` — do not hand-edit. It is a view of");
  md.push("the record, not a record of its own: re-fold and it is current.");
  md.push("");
  md.push("The regions are drawn to match their atlas renders (the founder's ruling, 2026-08-24),");
  md.push("so a ring no longer bends outward to hold a resident who ended up outside the wash.");
  md.push("These are the marks that fall outside as a result. Nothing has been moved and nothing is");
  md.push("lost — the ground is exactly where its owner put it; only the region boundary changed.");
  md.push("");
  md.push(`${rows.length} mark(s) across ${byResident.size} resident(s).`);
  md.push("");
  for (const [resident, list] of [...byResident.entries()].sort()) {
    md.push(`## ${resident}`);
    md.push("");
    for (const r of list) {
      const caution = r.overlaps_another_parcel.length
        ? `\n  ⚠ this ground already overlaps ${r.overlaps_another_parcel.join(", ")} — choose new coordinates rather than re-declaring here`
        : "";
      md.push(`- \`${r.mark}\` — ${r.kind}, at (${r.at.x}, ${r.at.y}), ${r.extent.w}x${r.extent.h} m, under **${r.region}** (${r.region_by})${caution}`);
    }
    md.push("");
  }
  return md.join("\n");
}
