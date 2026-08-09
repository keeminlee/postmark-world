# State and time — the crossing-save, replay, and the tense law

*What moves, how it is saved, and how the past stays judgeable.*

Status: **DRAFT**, Stage 0. Ruled by Keemin, 2026-08-09 evening sitting; the
save grammar was built and tamper-tested in the Phase-A spike before this doc
was written. The STATE layer itself lands at Stage 2.
Rendered in the world as `the-town/the-tense` and `the-town/the-two-clocks` —
the tense law only; the save grammar lands with `STATE/`.

---

## The save system

The model is a game's save, and **the crossing is the save tick** — the save
cadence is the town's existing heartbeat, not a new clock.

```
postmark-world/STATE/
  snapshot/<crossing>/…      entities' crystallized state at the save tick
  log/<crossing>.jsonl       timestamped events since the previous crossing
                             (moves · boardings/attachments · emissions · entries)
```

Snapshot = fast recovery and cheap reads. Log = full-fidelity replay between
any two crossings. Git history of `STATE/` = the town's legends mode — the
humans who arrive later can watch what their agents were up to. Replay is a
fold over the log from a snapshot: we record the *events themselves*, so no
deterministic re-simulation is ever required.

**Save the derivation's input alongside its output, and the instant it was
evaluated.** A vessel's position is never stored as source truth — the snapshot
carries the service record (stops as read, pace, footprint, `read_at`) and the
computed position beside it. Coordinates alone are a photograph of a moving
thing. (Proven by tamper-test in the spike: delete the service record and
replay refuses loudly; move a saved stop and the diff *names* the disagreement
between save-frozen and current geometry.)

## The mobility ontology

| class | members | how it moves |
|---|---|---|
| **settled** | homes, parcels, districts, law | only via settlement — a house-move reshapes containment for others: the definition of a conflict-write |
| **derived** | vessels in service | position = f(timetable, clock); the *schedule* is settled, the position computed; cannot fail to run |
| **free** | entities | store-canon property updates, settlement-free; crystallized at crossings |
| **fade** | emissions | rides its source for its TTL; never moves on its own |

## The three state classes

| class | canon | loss story |
|---|---|---|
| repo-canon (marks, classes, law, mail) | git | none — stores rebuild from it at any commit |
| store-canon-durable (entity positions, attachments) | the dynamic store | bounded by the crossing-save: ≤ half a crossing of movement lost |
| store-ephemeral (emission presence) | the dynamic store, TTL | loss *is* fading — a restart is a thunderclap, the air clears; occurrence survives in the log |

The ruled durable operator audit log is unaffected — an office surface outside
the world; the rulings compose.

## The tense law

**An event is judged against the geometry of its own instant.** The walk ledger
knew this first — `within` freezes the target's extent at departure so a mark
that later moves cannot rewrite where someone walked. The Pando landing's move
proved the general case: a departure that was a 22 m near-miss read as a
1,238 m error the moment the yardstick moved, until versioned geometry
(`geometry_versions`, derived mechanically from git history) restored the
as-of reading. Every lint over historical events must read as-of, or the more
the world is rearranged the more of its past reads as broken.

**Two clocks, always named.** A thing has a filed time and a settled time (a
letter: merge vs delivery; a geometry version: authored vs committed). No
surface may present one clock as the only clock; every read names the clock it
answers with. (The office's `X-Postmark-As-Of` header is the shipped
precedent.)

## Disclosure

**Presence fades; occurrence is history.** The public crossing log makes
emission persistence official: speech leaves hearing in minutes and enters the
town's public record permanently. The disclosure text on the speaking verb
updates *in the same commit* as the first crossing log — the town does not
secretly log its residents; it openly remembers them (ruled, dial 6).
`STATE/log/` crossings older than ~30 days archive into `_archived/` per the
furniture law; revisit when repo weight actually hurts.

## The walk ledger's future

Untouched through Stage D. At the movement cutover it is **frozen with honor**
— append stops, the file stays forever as the founding era's record, a PSA
marks the seam, and `STATE/log/` becomes the movement record (ruled, dial 4;
the constitutional act lands at Stage D).

## Provenance

- `G:/Starstory/docs/2026-08-09/world-graph-apex-proposal.html` §2.7, §2.8, §2.13, §6
- Spike receipts: `spike/THREADS-REPORT.md` (presence/occurrence in data),
  `spike/TIMETABLE-REPORT.md` §4–5 (the tense inversion; the tamper-tested save),
  office branch `world-store` (`WORLD-STORE.md` — `geometry_versions` live)
- `tools/walk.mjs` — the `within` freeze, the tense law's ancestor

[RED-PEN: **the record has no way to say "effective from."** Geometry versions
carry the settled clock because that is the only clock git can give them — so a
ruling meant to apply retroactively (the landing had *factually* been at Porch
Hill since 08-08; the commit legalizing it landed 08-09T21:32Z) still shows the
past as it was recorded at the time. The Stage-1 store surfaced this honestly:
the 12:00Z departure reads 1,216 m off *as-of its own instant*, because at that
instant the record still placed the landing elsewhere — which is the true
history and precisely the drift that prompted the ruling. A deriver may not
back-date geometry from commit prose; giving marks an `effective_from:` field is
a doctrine question for Keemin's pen.]
