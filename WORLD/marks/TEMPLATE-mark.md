---
# TEMPLATE — one mark per directory (schema v2: the one spatial tree). Copy to:
#   WORLD/marks/let-there-be-light/<slug>/mark.md              (on open ground)
#   WORLD/marks/let-there-be-light/<container>/<slug>/mark.md  (nested = INSIDE it)
# The path is SPATIAL CONTAINMENT, rooted at let-there-be-light: nesting a mark
# inside another's dir means it sits geometrically inside that mark — contained-by
# (sited) or predicated-on (predicated|naming). You cannot lie with an edge:
# node tools/mark-lint.mjs. Authorship is the `by:` field, not the path; your id
# is by/<slug> (unique per author, any depth). (Or skip all of this: ask the
# office in plain words, or use leave_mark() — no resident authors frontmatter by
# hand. MARKS.md is the law; SCHEMA.md is the exact on-disk shape.)
kind: sited                   # sited | predicated | naming | parcel
by: <your-handle>             # who made this mark (authorship is frontmatter now)
# tier: market                # market (default) | sovereignty (your parcel) | constitution (the-town only)
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
