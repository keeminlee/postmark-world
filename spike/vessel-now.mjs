// vessel-now.mjs — the timetable mechanic, CONSUMED.
//
// L1's red says `timetable` declares `tools/vessel.mjs` and the running office
// never loads it: a mechanic wired to nothing. This is the first tool in the
// spike that consumes the module AS A SERVICE — asks the wheelhouse's own
// timetable where the Post Office is right now, when she next casts off, and
// what her whole 24-hour cycle looks like. (`spike/service-crosscheck.mjs`
// imports vessel.mjs too, but to measure a DISAGREEMENT between two position
// derivations; nothing has yet simply run the schedule and read the answer.)
// It does not reimplement one line of the arithmetic — every number below comes
// out of tools/vessel.mjs, so the spike cannot quietly disagree with the world
// about where the boat is.
//
// The service is read from the FOLD, on disk, exactly as the module's own law
// requires: a timetable names its stops BY MARK ID and copies no coordinates, so
// the stop marks' `at` — read fresh here — IS the schedule's geometry. That is
// what makes the 2026-08-08 re-siting of the Pando landing a zero-edit change to
// the wheelhouse: this script proves it by printing the stop coordinates it
// derived against the wheelhouse's untouched `timetable:` field.
//
//   node spike/vessel-now.mjs                       # now
//   node spike/vessel-now.mjs --at 2026-08-09T14:00:00Z
//   node spike/vessel-now.mjs --marks-dir WORLD/marks

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMarks } from "../tools/marks-fold.mjs";
import {
  serviceFromFold, vesselPositionAt, nextDepartures, sailingsBetween,
  instantOf, ashoreOf, footprintOf, DAY_CROSSINGS,
} from "../tools/vessel.mjs";
import { fractionalCrossing, CROSSING_MS } from "../tools/walk.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const arg = (k, d = null) => {
  const i = process.argv.indexOf(k);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const MARKS_DIR = arg("--marks-dir", join(ROOT, "WORLD/marks"));
const WHEELHOUSE = arg("--service", "the-town/the-wheelhouse");
const AT_ISO = arg("--at", new Date().toISOString());
const nowMs = Date.parse(AT_ISO);
if (!Number.isFinite(nowMs)) { console.error(`unparseable --at: ${AT_ISO}`); process.exit(1); }
const nowFc = fractionalCrossing(nowMs);

const marks = loadMarks(MARKS_DIR);
let service;
try { service = serviceFromFold({ marks }, WHEELHOUSE); }
catch (e) { console.error(`no service: ${e.message}`); process.exit(1); }

const HOURS_PER_CROSSING = CROSSING_MS / 3_600_000;
const iso = (fc) => new Date(instantOf(fc)).toISOString().replace(".000Z", "Z");
const clock = (fc) => iso(fc).slice(11, 16) + "Z";
const km = (m) => (m / 1000).toFixed(2);
const hrs = (dFc) => (dFc * HOURS_PER_CROSSING).toFixed(2);
const pt = (p) => `${p.x},${p.y}`;

// ── the service, as the fold hands it over ──────────────────────────────────
console.log(`the service · ${service.markId}  (read from the fold at ${MARKS_DIR})`);
console.log(`  vessel  ${service.vessel.markId}  handle "${service.vessel.handle}"  footprint ${service.vessel.extent.w}x${service.vessel.extent.h} m`);
console.log(`  pace    ${service.pace} km/crossing  (a crossing is ${HOURS_PER_CROSSING} h)`);
for (const [i, s] of service.stops.entries()) {
  console.log(`  stop ${i}  ${s.markId} at ${pt(s.at)}  ${s.extent ? `${s.extent.w}x${s.extent.h} m` : "(no extent)"}`
    + `  departs ${s.departs.map(clock).join(" / ")}`);
}
console.log(`  These coordinates were read from the STOP MARKS just now. The wheelhouse's`);
console.log(`  timetable field names ids only — it has never carried a coordinate.\n`);

// ── the derived cycle ───────────────────────────────────────────────────────
// One whole day of cast-offs, with what the schedule leaves over at each berth.
// Nothing here is stored: it is arithmetic over (timetable, clock).
// The window is half-open at the start ((from, to]) so a sailing replays exactly
// once when windows chain — so both ends are shifted back by an epsilon to catch
// the day's own 00:00Z cast-off once and not the next day's.
const day = Math.floor(nowFc / DAY_CROSSINGS);
const EPS = 1e-9;
const cycle = sailingsBetween(service, day * DAY_CROSSINGS - EPS, (day + 1) * DAY_CROSSINGS - EPS);

console.log(`the derived cycle · one 24 h round, day ${day} (crossings ${day * DAY_CROSSINGS}–${(day + 1) * DAY_CROSSINGS})`);
console.log(`  depart   from                          arrive   at                            leg km   under way   then alongside`);
for (const s of cycle) {
  // The dwell: from this arrival to the next cast-off out of the stop she just
  // reached. Read off the schedule, never written down anywhere.
  const nxt = nextDepartures(service, s.arriveFc, 1, { from: s.to.markId })[0];
  const dwell = nxt ? nxt.departFc - s.arriveFc : null;
  console.log(`  ${clock(s.departFc)}    ${s.from.markId.padEnd(28)}  ${clock(s.arriveFc)}    ${s.to.markId.padEnd(28)}  `
    + `${km(s.legM).padStart(7)}  ${hrs(s.arriveFc - s.departFc).padStart(7)} h  ${dwell === null ? "     —" : `${hrs(dwell).padStart(7)} h`}`);
}
const legs = [...new Set(cycle.map((s) => Math.round(s.legM * 100) / 100))];
console.log(`  the run: ${legs.map((m) => `${km(m)} km (${m.toFixed(2)} m)`).join(" / ")} each way`
  + ` · ${cycle.length} cast-offs a day · the cycle closes on itself`);
console.log(`  under way ${hrs(cycle[0].arriveFc - cycle[0].departFc)} h of every 6 h leg-to-leg — the run length is DERIVED from the`);
console.log(`  two stop marks' positions, so re-siting a stop re-times the service with no edit to the schedule.\n`);

// ── where she is, at four instants ──────────────────────────────────────────
const upcoming = nextDepartures(service, nowFc, 2);
// One mid-crossing instant: halfway along the next sailing's leg — the state
// that only exists because position is computed, never stored.
const mid = upcoming.length ? (upcoming[0].departFc + upcoming[0].arriveFc) / 2 : nowFc;

const instants = [
  { label: "now", fc: nowFc },
  ...upcoming.map((s, i) => ({ label: `next departure ${i + 1}`, fc: s.departFc })),
  { label: "mid-crossing", fc: mid },
].sort((a, b) => a.fc - b.fc);

console.log(`the vessel, derived · asked at ${AT_ISO} (crossing ${nowFc.toFixed(4)})`);
for (const { label, fc } of instants) {
  const v = vesselPositionAt(service, fc);
  if (!v) { console.log(`  ${label.padEnd(18)} ${iso(fc)}  — no sailing has happened yet at this instant`); continue; }
  const s = v.sailing;
  const where = v.berthed
    ? `berthed at ${v.atStop}`
    : `under way ${s.from.markId} -> ${s.to.markId}, ${km(v.travelledM)} of ${km(s.legM)} km, ${hrs(s.arriveFc - fc)} h to go`;
  console.log(`  ${label.padEnd(18)} ${iso(fc)}  crossing ${fc.toFixed(4)}`);
  console.log(`  ${"".padEnd(18)} at ${pt(v)}  ${where}`);
  const fp = footprintOf(service, v);
  console.log(`  ${"".padEnd(18)} boarding zone (her footprint, here): x ${fp.x - fp.w / 2}..${fp.x + fp.w / 2}, y ${fp.y - fp.h / 2}..${fp.y + fp.h / 2}`);
  if (v.berthed) console.log(`  ${"".padEnd(18)} she sets arrivals down ashore at ${pt(ashoreOf(service, s))} — outside her own footprint, so the next cast-off passes over them`);
  console.log();
}

// ── the receipt the re-siting needs ─────────────────────────────────────────
// The whole point of stops-by-id: the landing moved, and this file, the
// wheelhouse, and vessel.mjs are all unchanged by it.
const landing = service.stops.find((s) => s.markId === "the-town/the-pando-landing");
if (landing) {
  const OBSERVED = { x: -94570, y: -94570 }; // the 2026-08-09T12:00Z cast-off, walk-ledger line 250
  const r = { x: landing.at.x, y: landing.at.y, w: landing.extent.w, h: landing.extent.h };
  const inside = OBSERVED.x >= r.x - r.w / 2 && OBSERVED.x <= r.x + r.w / 2
              && OBSERVED.y >= r.y - r.h / 2 && OBSERVED.y <= r.y + r.h / 2;
  console.log(`the re-siting receipt`);
  console.log(`  the 12:00Z cast-off of 2026-08-09 left from ${pt(OBSERVED)} (walk-ledger line 250)`);
  console.log(`  the landing's footprint, as derived above: ${inside ? "CONTAINS it" : "does NOT contain it"}`);
  console.log(`  the wheelhouse's timetable field was not edited to make that true.`);
}
