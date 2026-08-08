#!/usr/bin/env node
// return-sweep — true the return leg's passenger list from the world itself.
//
// The ruling (Keemin, 2026-08-08 party night): every resident at the mountain
// sails home automatically — no letter needed. So the manifest is not a list
// anyone writes; it is a DERIVATION, taken minutes before cast-off: whoever is
// standing at the Pando landing rides. Staying is a place, not a paperwork act
// — step away from the landing before noon and the boat respects it. (A
// resident who cannot walk and wants to stay writes the office, and a mind
// per-cases it — the door that is always open.)
//
// Excluded by construction: the vessel herself, and anyone whose HOME is the
// mountain (vermillion's household) — the boat does not carry the mountain's
// own residents home; they are home.
//
// Usage:
//   node tools/return-sweep.mjs [--at 2026-08-09T11:52:00Z] [--leg 2] [--write]
// Dry by default: prints the derived list. --write rewrites the sailing
// manifest's leg passengers in place; sail.mjs then files it, unchanged —
// this tool decides WHO, the ceremony hand decides HOW, same as leg 1.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWalkLedger, positionAt, fractionalCrossing } from "./walk.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const MANIFEST = path.join(ROOT, "WORLD", "sailing-2026-08-08.json");
const LEDGER = path.join(ROOT, "WORLD", "walk-ledger.md");
const SEEDING = path.join(ROOT, "seeding", "manifest.json");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const WRITE = args.includes("--write");
const LEG = opt("--leg") ?? "2";
const AT_ISO = opt("--at");

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const leg = (manifest.legs ?? []).find((l) => String(l.leg) === String(LEG));
if (!leg) { console.error(`return-sweep: no leg ${LEG}`); process.exit(1); }

const VESSEL = leg.vessel;
// the landing: the leg departs FROM the mountain — its `from` is the ring's
// centre. 220 m covers the parcel and a party's worth of wandering around it;
// beyond that is a chosen road, not a lingered evening.
const CENTRE = { x: leg.from[0], y: leg.from[1] };
const RING_M = 220;

// whose home is the mountain — they are excluded: the boat doesn't take the
// mountain's own residents "home". The home ring is WIDER than the landing
// ring on purpose (vermillion's hall registers 420 m off the leg's from-point;
// a host waving from the quayside must not be swept aboard his guests' boat).
const HOME_RING_M = 1500;
const seeding = JSON.parse(readFileSync(SEEDING, "utf8"));
const homedHere = new Set();
for (const h of seeding.homes ?? []) {
  if (!h.grid_m) continue;
  if (Math.hypot(h.grid_m.x - CENTRE.x, h.grid_m.y - CENTRE.y) <= HOME_RING_M) homedHere.add(h.household);
}

const at = AT_ISO ? fractionalCrossing(Date.parse(AT_ISO)) : fractionalCrossing();
const { departures } = parseWalkLedger(readFileSync(LEDGER, "utf8"));
const lastByHandle = new Map();
for (const d of departures) lastByHandle.set(d.handle, d); // file order: last filed governs

const riding = [], staying = [];
for (const [handle, d] of lastByHandle) {
  if (handle === VESSEL) continue;
  const p = positionAt(d, at);
  const dist = Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y);
  if (dist > RING_M) { staying.push(`${handle} — ${Math.round(dist)} m from the landing (their road is their own)`); continue; }
  if (homedHere.has(handle)) { staying.push(`${handle} — home is the mountain; they are home`); continue; }
  riding.push(handle);
}
riding.sort();

console.log(`return-sweep · leg ${LEG} · at ${at.toFixed(4)}${AT_ISO ? ` (${AT_ISO})` : " (now)"}`);
console.log(`landing ring: ${RING_M} m around ${CENTRE.x},${CENTRE.y}`);
console.log(`riding home (${riding.length}):`);
for (const h of riding) console.log("  ⛵", h);
if (staying.length) { console.log(`not aboard (${staying.length}):`); for (const s of staying) console.log("  ⚓", s); }
if (riding.length === 0) console.log("⚠ nobody at the landing — she sails home empty, which is honest, but check the derivation before believing it");

if (WRITE) {
  leg.passengers = riding;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nwrote ${riding.length} passenger(s) into leg ${LEG} of ${path.basename(MANIFEST)} — sail.mjs files it from here`);
}
