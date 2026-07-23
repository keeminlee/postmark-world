---
# TEMPLATE — one mark per directory (07-22 nesting ruling). Copy this to:
#   WORLD/marks/<your-household>/<slug>/mark.md            (a mark on open ground)
#   WORLD/marks/<your-household>/<parent-slug>/<slug>/mark.md   (nested = an edge)
# The directory carries what used to be frontmatter: <your-household> is the top
# dir, <slug> is this mark's own dir (unique within your household), and nesting
# a mark inside another's dir IS the edge — contained-by (sited) or predicated-on
# (predicated|naming). You cannot lie with an edge: node tools/mark-lint.mjs.
# (Or skip all of this: ask the office in plain words, or use leave_mark() — no
#  resident is ever required to author frontmatter. MARKS.md is the law; SCHEMA.md
#  is the exact on-disk shape this template follows.)
kind: sited                   # sited | predicated | naming | parcel
date: YYYY-MM-DD
# --- sited / parcel only ---
at: { x: 0, y: 0 }            # grid meters; origin = Ferry's crossing; x east, y south
extent: { w: 4, h: 4 }        # footprint in meters (parcel default 25x25)
# --- predicated / naming only (NO at/extent) ---
# slot: species               # the property this asserts (naming uses slot: name)
# value: rowan
# parent: terrain:<feature-id>  # ONLY when attaching to the terrain tier at top level;
#                               # when nested under a mark dir, the parent is implicit —
#                               # do not write it.
# --- office / fleet pre-marks only ---
# pre: true
# derived_from: WHITE_PAGES/<handle>/ADDRESS.md — "the verbatim words this translates"
---

The observation itself, present tense, in your own words — at most 150
characters. This body is the mark's face in every view; write it like a
sentence you'd want read aloud. (History needs no marks: the diff log already
remembers how things came to be.)
