#!/usr/bin/env node
// boarding-flip-disclosure — who moves when boarding-is-presence is retired.
//
//   node tools/boarding-flip-disclosure.mjs [--at 2026-08-11T22:00:00Z] [--json]
//
// Ruled 2026-08-11 (Keemin): an entity is moved by a mark only by its own
// agreement. The carry condition became EDGE **and** PERMISSION — standing in
// her footprint at cast-off, which the old law already required, AND an
// unsevered agreement, which is new.
//
// SO THE FLIP IS EXACTLY THE SECOND CONJUNCT. The edge half is unchanged, which
// means nobody moves for a reason the old law would not also have recognised;
// everyone who moves does so because they were carried on presence alone, and
// under the new law presence alone carries nobody. Nobody in the record ever
// held a permission — the verb did not exist — so every inferred passage is
// un-inferred, and the people it had carried are standing where they last walked
// to instead.
//
// That is a real change to where real residents are, so it is DISCLOSED BY NAME
// rather than shipped quietly. This prints the list Wright publishes at deploy:
// every walker whose derived current position differs under the two laws, with
// both answers and the reason.
//
// WORTH SAYING PLAINLY IN THE DISCLOSURE ITSELF: these residents did nothing
// wrong and broke no rule. They rode a boat the town told them they could ride
// by standing on it. The law changed under them, and the honest thing is to name
// them rather than let the flip move them quietly.
//
// WHY THE RETIRED LAW LIVES HERE. `tools/vessel.mjs` no longer knows how to
// carry anyone by presence, and it should not — that is the whole ruling. But a
// disclosure that cannot compute the old answer cannot say what changed, so the
// retired derivation is vendored below, once, in the tool whose only job is to
// retire it. It reads the same service, the same schedule and the same ledger
// the engine does; only the boarding predicate is its own.
//
// Reads the record and writes nothing. Deploying is a separate act.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadMarks, fold } from "./marks-fold.mjs";
import { pointInRect } from "./geometry.mjs";
import {
  positionAt as walkPositionAt, fractionalCrossing,
  WALK_M_PER_CROSSING,
} from "./walk.mjs";
import { ledgerRecords, storeRecords } from "./movement-records.mjs";
import {
  serviceFromFold, servicesFromFold, positionAt, sailingsBetween, footprintOf,
  ashoreOf, instantOf, DAY_CROSSINGS,
} from "./vessel.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WHEELHOUSE = "the-town/the-wheelhouse";

const argOf = (flag) => { const i = process.argv.indexOf(flag); return i === -1 ? null : process.argv[i + 1]; };
const AS_JSON = process.argv.includes("--json");
const AT_MS = argOf("--at") ? Date.parse(argOf("--at")) : Date.now();

// ── the retired law, vendored ────────────────────────────────────────────────
//
// tools/vessel.mjs as it stood at 8766f1db: after a resident's last declared
// walk, replay the cast-offs and take the first whose instant caught them
// STANDING inside her footprint. Deposited ashore at that sailing's arrival,
// and standing still was never a second ticket.

const vesselOnSailing = (sailing, fc) => walkPositionAt(
  { from: sailing.from.at, toward: sailing.to.at, at: sailing.departFc,
    targetExtent: null, targetMarkId: sailing.to.markId, pace: sailing.pace }, fc);

function positionUnderPresenceLaw(departure, fractional, service) {
  const own = walkPositionAt(departure, fractional);
  if (!departure || !service) return own && { ...own, aboard: null, ashoreAt: null, boardedAt: null };

  const legEndFc = departure.at + (own.arrived ? own.travelledM : own.legM) /
    ((departure.pace > 0 ? departure.pace : WALK_M_PER_CROSSING / 1000) * 1000);
  const horizon = Math.min(fractional, legEndFc + DAY_CROSSINGS);

  let boarded = null;
  for (const sailing of sailingsBetween(service, departure.at, horizon)) {
    const p = walkPositionAt(departure, sailing.departFc);
    if (!p.arrived) continue;
    if (!pointInRect(p.x, p.y, footprintOf(service, sailing.from.at))) continue;
    boarded = sailing;
    break;
  }
  if (!boarded) return { ...own, aboard: null, ashoreAt: null, boardedAt: null };

  // THE EDGE THEY SATISFIED, kept so the disclosure can PROVE rather than assert
  // that each mover was a lawful rider: the stop she cast off from and the hour,
  // with the standing that earned it.
  const stood = walkPositionAt(departure, boarded.departFc);
  const edge = {
    stop: boarded.from.markId,
    castOff: new Date(instantOf(boarded.departFc)).toISOString(),
    stoodAt: { x: stood.x, y: stood.y },
    insideFootprint: pointInRect(stood.x, stood.y, footprintOf(service, boarded.from.at)),
    standing: stood.arrived,
  };

  const v = vesselOnSailing(boarded, fractional);
  if (!v.arrived) return { ...v, aboard: service.vessel.handle, ashoreAt: null, boardedAt: edge };

  const a = ashoreOf(service, boarded);
  return {
    x: a.x, y: a.y, arrived: true, standing: true,
    legM: 0, travelledM: 0, remainingM: 0, etaCrossings: 0,
    aboard: null, ashoreAt: boarded.to.markId, boardedAt: edge,
  };
}

// ── the record, both eras ────────────────────────────────────────────────────
//
// The walk ledger is frozen and `STATE/log/<crossing>.jsonl` is the record after
// it. Both loaders moved to `tools/movement-records.mjs` when the position-seed
// manifest would have become the third hand-written copy of them; the merge rule
// and the tie rule live there now, once. What stays here is the DISCLOSURE's own
// question — which walker governs at an instant — because the answer this tool
// needs is a map keyed by handle, not a list.

/** The governing departure per walker at an instant — one pass, latest wins. */
function governingAt(records, atMs) {
  const ordered = [...records].sort((a, b) => {
    const ta = Date.parse(a.iso), tb = Date.parse(b.iso);
    if (ta !== tb) return ta - tb;
    return a.era === b.era ? 0 : (a.era === "ledger" ? -1 : 1);
  });
  const governing = new Map();
  for (const r of ordered) {
    if (Date.parse(r.iso) > atMs) continue;
    if (!r.from || !r.toward || !Number.isFinite(r.at)) continue;
    governing.set(r.handle, r);
  }
  return governing;
}

// ── the flip ─────────────────────────────────────────────────────────────────

const round1 = (n) => Math.round(n * 10) / 10;
const place = (p) => `${round1(p.x)},${round1(p.y)}`;
const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// What the old law did FOR this walker, in the words a resident reads.
function whyCarried(before) {
  if (before.aboard) return `carried by ${before.aboard}, at sea`;
  if (before.ashoreAt) return `carried, and set down ashore at ${before.ashoreAt}`;
  return "moved by the schedule";
}

function main() {
  const state = fold({
    marks: loadMarks(join(ROOT, "WORLD/marks")),
    terrain: JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8")),
    stakes: [],
  });

  // Every service, not just the Post Office's: the mechanic is general, and a
  // disclosure that only checked the one line anyone has built would be true
  // today and quietly wrong the first time a resident proposes a second.
  const { services, errors } = servicesFromFold(state);
  const fractional = fractionalCrossing(AT_MS);

  const records = [...ledgerRecords(ROOT), ...storeRecords(ROOT)];
  const governing = governingAt(records, AT_MS);

  const findings = [];
  for (const [handle, dep] of [...governing].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const service of services) {
      // The vessel herself is not a passenger; her position is her timetable's.
      if (handle === service.vessel.handle) continue;
      const before = positionUnderPresenceLaw(dep, fractional, service);
      // NOBODY HAS AN AGREEMENT. The verb did not exist when these records were
      // written, so the new law's input is empty for every walker in it — which
      // is exactly what makes this a flip and not a migration.
      const after = positionAt(dep, fractional, service, []);
      if (!before || !after) continue;
      const delta = moved(before, after);
      if (delta < 0.05 && before.aboard === after.aboard && before.ashoreAt === after.ashoreAt) continue;
      findings.push({
        handle, service: service.markId, vessel: service.vessel.handle,
        was: place(before), now: place(after), moved_m: Math.round(delta),
        was_state: whyCarried(before),
        now_state: after.aboard ? `carried by ${after.aboard}` : "standing where they last walked to",
        declared: { at: dep.iso, toward: place(dep.toward), to: dep.targetMarkId ?? null, era: dep.era },
        // Computed, not assumed: the edge this rider actually satisfied.
        lawful_under_the_old_law: Boolean(before.boardedAt?.insideFootprint && before.boardedAt?.standing),
        boarded: before.boardedAt,
      });
    }
  }

  if (AS_JSON) {
    console.log(JSON.stringify({
      as_of: new Date(AT_MS).toISOString(), crossing: fractional,
      walkers_read: governing.size, records_read: records.length,
      services: services.map((s) => s.markId), service_errors: errors,
      findings,
    }, null, 2));
    return;
  }

  console.log(`THE BOARDING FLIP — who moves when boarding-is-presence is retired`);
  console.log(`as of ${new Date(AT_MS).toISOString()} (crossing ${fractional.toFixed(4)})`);
  console.log(`${records.length} movement records, ${governing.size} walkers with a governing record`);
  console.log(`services read: ${services.map((s) => s.markId).join(", ") || "(none)"}`);
  for (const e of errors) console.log(`  ! ${e.mark}: ${e.error}`);
  console.log("");

  if (!findings.length) {
    console.log("Nobody moves. No walker's derived position depends on being carried");
    console.log("without having agreed to it — the flip is invisible from where everyone stands.");
    return;
  }

  console.log(`${findings.length} resident${findings.length === 1 ? "" : "s"} stand${findings.length === 1 ? "s" : ""} somewhere else under the new law:`);
  console.log("");
  for (const f of findings) {
    console.log(`  ${f.handle}`);
    console.log(`    was  ${f.was}  — ${f.was_state}`);
    console.log(`    now  ${f.now}  — ${f.now_state}`);
    console.log(`    ${f.moved_m} m apart. Their last declared walk: ${f.declared.at}, toward ${f.declared.toward}${f.declared.to ? ` (${f.declared.to})` : ""}.`);
    if (f.boarded) {
      console.log(`    They boarded at ${f.boarded.stop}, ${f.boarded.castOff} — standing on her deck at the hour.`);
    }
    console.log("");
  }
  console.log("They are not being moved. They are being left where their own record put them:");
  console.log("the passage the old law inferred for them was never anything they said.");
  console.log("");

  // THE STRONGEST CLAIM IN THIS DISCLOSURE IS THE ONE MOST WORTH CHECKING, so it
  // is computed rather than written. The new law's EDGE is the old law's whole
  // test, so every mover should have satisfied it — if one did not, the flip is
  // doing something beyond adding the permission and the operator must know.
  const unlawful = findings.filter((f) => !f.lawful_under_the_old_law);
  if (unlawful.length) {
    console.log(`  ! ${unlawful.length} of these did NOT satisfy the edge under the old law:`);
    for (const f of unlawful) console.log(`      ${f.handle} — ${JSON.stringify(f.boarded)}`);
    console.log("  The flip is doing more than adding the permission. Do not deploy on this reading.");
    return;
  }
  console.log("Every one of them was a LAWFUL rider under the law of the day — checked, not assumed:");
  console.log("each was STANDING INSIDE her footprint at the cast-off that took them, which is the");
  console.log("whole of what the old law asked and is still half of what the new one asks. There was");
  console.log("no verb for agreeing, so not one of them could have agreed. The law changed under");
  console.log("them; naming them is the least the change owes them.");
}

main();
