// sail.mjs — the pen's ceremony hand: file a vessel sailing as paced departures.
//
// A sailing is not a new mechanic. Per the pace ruling (2026-08-06): at sailing
// time the pen files the vessel's paced departure and one per ticketed
// passenger, and everyone aboard derives together. This tool exists so a
// thirty-line ceremony is one reviewed command instead of thirty hand-typed
// ledger lines — the manifest file is the reviewable artifact, this is just
// the hand that copies it faithfully.
//
// Usage:
//   node tools/sail.mjs WORLD/sailing-2026-08-08.json --leg 1            (dry-run: print)
//   node tools/sail.mjs WORLD/sailing-2026-08-08.json --leg 1 --file    (append to the ledger)
//
// Dry-run is the default on purpose: the ceremony is read before it is filed.
// Every composed line is round-tripped through DEPARTURE_RE before anything is
// written — a line the grammar cannot parse back is refused, not filed.

import { readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPARTURE_RE,
  formatDeparture,
  fractionalCrossing,
  parseWalkLedger,
} from "./walk.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(here, "..", "WORLD", "walk-ledger.md");
const HOUSEHOLDS = path.join(here, "..", "WORLD", "households.json");

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
const doFile = args.includes("--file");
const legArg = args.find((a, i) => args[i - 1] === "--leg") ?? "1";

if (!manifestPath) {
  console.error("usage: node tools/sail.mjs <sailing-manifest.json> [--leg N] [--file]");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const leg = (manifest.legs ?? []).find((l) => String(l.leg) === String(legArg));
if (!leg) {
  console.error(`sail: manifest has no leg ${legArg}`);
  process.exit(1);
}

// Handles are checked against the derived registry, but absence is a warning,
// not a refusal: the registry's own note says handles absent there fold as
// their own household (the export lags joins by design — it is derived, and
// refreshing it is the office's lane, not a boarding requirement).
const registry = JSON.parse(readFileSync(HOUSEHOLDS, "utf8"));
const known = new Set(Object.keys(registry.households ?? {}));

const departMs = Date.parse(leg.depart);
if (Number.isNaN(departMs)) {
  console.error(`sail: leg ${leg.leg} depart is not a parseable instant: ${leg.depart}`);
  process.exit(1);
}
const at = fractionalCrossing(departMs);

const walkers = [leg.vessel, ...[...(leg.passengers ?? [])].sort()];
const seen = new Set();
const lines = [];
const warnings = [];

for (const handle of walkers) {
  if (seen.has(handle)) { warnings.push(`duplicate walker dropped: ${handle}`); continue; }
  seen.add(handle);
  if (handle !== leg.vessel && !known.has(handle)) {
    warnings.push(`not in households export (folds solo; export may lag joins): ${handle}`);
  }
  const line =
    formatDeparture({
      handle,
      from: { x: leg.from[0], y: leg.from[1] },
      toward: { x: leg.toward[0], y: leg.toward[1] },
      at,
      targetExtent: { w: leg.within[0], h: leg.within[1] },
      targetMarkId: leg.to,
      iso: new Date(departMs).toISOString(),
    }) + ` · pace ${leg.pace}`;
  if (!DEPARTURE_RE.test(line)) {
    console.error(`sail: composed a line the grammar refuses — nothing filed:\n${line}`);
    process.exit(1);
  }
  lines.push(line);
}

// The whole batch must also survive the real parser (belt over braces — the
// regex test above is per-line; this catches anything about joining them).
const roundTrip = parseWalkLedger(lines.join("\n"));
if (roundTrip.unrecognized.length || roundTrip.departures.length !== lines.length) {
  console.error("sail: round-trip parse mismatch — nothing filed");
  process.exit(1);
}

console.log(`sailing: ${manifest.sailing} · leg ${leg.leg} · depart ${leg.depart} (at ${at.toFixed(4)})`);
console.log(`vessel: ${leg.vessel} · passengers: ${walkers.length - 1} · pace ${leg.pace} km/crossing`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
console.log("");
for (const l of lines) console.log(l);

if (!doFile) {
  console.log("\n(dry-run — pass --file to append these to WORLD/walk-ledger.md)");
  process.exit(0);
}

appendFileSync(LEDGER, lines.map((l) => l + "\n").join(""));
console.log(`\nfiled: ${lines.length} departure(s) appended to WORLD/walk-ledger.md`);
