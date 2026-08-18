// movement-records.mjs — the movement record, both eras, in one place.
//
// The town has recorded movement two ways. `WORLD/walk-ledger.md` is the
// founding era's record and was FROZEN at 2026-08-10T20:25Z with its own seam
// line; `STATE/log/<crossing>.jsonl` is the record after it. Neither is wrong
// and neither is complete: a resident set down ashore at the freeze has that
// record in the store and nowhere else, and a resident who has not moved since
// July has theirs in the ledger and nowhere else. Reading either alone puts real
// residents in places they left.
//
// THIS EXISTS BECAUSE THE JOIN WAS BEING WRITTEN OUT LONGHAND, AGAIN. Position
// already survived one round of this: `where-is.mjs`'s own header names the four
// independent implementations of "where is this resident" whose disagreements
// were every position bug the town had. The era join was on the same road — the
// office has one (`departuresAcrossEras`, with a flag and a disclosure it needs),
// `boarding-flip-disclosure.mjs` had a second, and the position-seed manifest
// would have been the third. Three copies of a merge rule is how the fourth one
// silently disagrees.
//
// Pure-ish: reads the two files it is pointed at, nothing else. No fold, no
// engine, no clock of its own — the caller passes the instant it means.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseWalkLedger } from "./walk.mjs";

export const LEDGER_REL = "WORLD/walk-ledger.md";
export const LOG_REL = "STATE/log";

/** The founding era. Absent file = no records, never an error: a fresh clone is not a broken one. */
export function ledgerRecords(root) {
  const path = join(root, LEDGER_REL);
  if (!existsSync(path)) return [];
  const { departures } = parseWalkLedger(readFileSync(path, "utf8"));
  return departures.map((d) => ({ ...d, era: "ledger" }));
}

/**
 * Stage D. The store's journal, one JSON object per line, keeping only what the
 * ledger's grammar also carries — so a record from either era answers to the
 * same arithmetic in walk.mjs.
 *
 * A line that does not parse is SKIPPED rather than fatal, matching the ledger's
 * own `unrecognized` tolerance: a journal is append-only and a half-written last
 * line at a crash is a normal thing to find, not a reason to lose the other 536.
 */
export function storeRecords(root) {
  const dir = join(root, LOG_REL);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort()) {
    for (const raw of readFileSync(join(dir, file), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type !== "departure") continue;
      const p = ev.payload ?? {};
      out.push({
        iso: ev.at, handle: ev.actor, era: "store",
        from: p.from, toward: p.toward, at: p.crossing,
        targetExtent: p.within ?? null, targetMarkId: p.to ?? null, pace: p.pace ?? null,
        source: file,
      });
    }
  }
  return out;
}

/**
 * Both eras, ordered, latest last — the order `currentDeparture` reads.
 *
 * THE TIE RULE, and it is not arbitrary: the ledger cannot gain a line after the
 * freeze, so a store row at the same instant is by construction the later
 * statement. Ties therefore go to the store.
 *
 * `atMs` drops records the caller's instant has not reached yet. A record with
 * no from/toward/crossing is not a movement and is dropped here rather than
 * left to produce NaN coordinates three call-frames away.
 */
export function mergedRecords(root, { atMs = Date.now() } = {}) {
  return [...ledgerRecords(root), ...storeRecords(root)]
    .sort((a, b) => {
      const ta = Date.parse(a.iso), tb = Date.parse(b.iso);
      if (ta !== tb) return ta - tb;
      return a.era === b.era ? 0 : (a.era === "ledger" ? -1 : 1);
    })
    .filter((r) => Date.parse(r.iso) <= atMs && r.from && r.toward && Number.isFinite(r.at));
}
