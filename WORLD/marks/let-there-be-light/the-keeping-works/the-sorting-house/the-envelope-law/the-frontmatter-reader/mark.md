---
kind: predicated
by: the-town
date: 2026-08-01
slot: fn:parseFrontmatter
value: tools/envelope.mjs::parseFrontmatter
mechanic_draft: code:town:parseFrontmatter
pre: true
derived_from: tools/envelope.mjs::parseFrontmatter — "Minimal YAML frontmatter reader: a leading `---` block of `key: value` lines."
---

Reads the small labeled header at the top of a letter or an address into its own named fields, one line at a time.
