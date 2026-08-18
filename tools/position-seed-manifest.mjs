#!/usr/bin/env node
// position-seed-manifest.mjs — who the town has never placed, and where the
// founder's landing act should put them.
//
//   node tools/position-seed-manifest.mjs --town <town clone> [--out <path>] [--json]
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────────
//
// A PREPARED manifest, not an act. Nothing here moves anybody: it reads the town
// roll, the declared household registry, the folded world and both eras of the
// movement record, and prints the one list the seeding ruling needs — every
// resident, what the record can say about where they are, and what a placement
// would have to assert to make that durable.
//
// It lives beside `seeding/manifest.json` and for the same reason: `seeding/` is
// outside `WORLD/`, because WORLD/ holds only what is backed. A manifest is a
// build intermediate a human reads before anything lands.
//
// ── WHY THE ROLL, AND NOT THE ROSTER ─────────────────────────────────────────
//
// Every existing position surface asks about "walk records ∪ parcel households"
// (office positions.mjs, spectator/server.mjs). That roster cannot contain a
// resident who has neither — so the residents this manifest exists to find are
// exactly the ones no position surface has ever asked about. They were not
// answered wrongly; they were never a question. The town's own WHITE_PAGES is
// the only list of who exists, so that is the list this reads.
//
// ── THE FOUR STATES, AS THE RECORD ACTUALLY HOLDS THEM ───────────────────────
//
//   walk       — a movement record governs. Their own statement; nothing to do.
//   parcel     — no record, but their handle holds ground. Ruling 7 places them.
//   household  — no record, no ground of their own, but their DECLARED household
//                holds ground. Invisible before the household-grain ruling
//                (2026-08-18); readable now, and still nothing to seed — the
//                reading was the repair.
//   unplaced   — no record, no ground at any grain. These are the seeding set,
//                and the ruled destination is the quay: the town's porch.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
//
// It writes no movement record. The precedent it was pointed at — the era
// seam's `--set-down-ashore`, which placed 27 residents in one act — encoded
// those placements as zero-distance DEPARTURES attributed to the residents
// themselves, with no target mark. That is why eleven of them still read
// `source: "walk", mark_id: null` today and read as a defaulting bug from
// outside (issue #1864). Repeating that shape would misattribute 28 more acts
// to people who did not perform them, which is the exact thing the seeding
// ruling forbids. The mechanism is the founder's to choose; this prepares the
// list, the reasons, and the receipts.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { mergedRecords } from "./movement-records.mjs";
import { whereIs, homeOf, parcelsFor, householdOf, porchOf, QUAY_MARK_ID } from "./where-is.mjs";
import { fractionalCrossing } from "./walk.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const has = (name) => args.includes(name);

const TOWN = opt("--town");
const WORLD = resolve(opt("--world", ROOT));
const OUT = opt("--out");

if (!TOWN) {
  console.error(`position-seed-manifest.mjs — the prepared seeding list.

  node tools/position-seed-manifest.mjs --town <path to a postmark town clone> [--world <root>] [--out <file>] [--json]

The town clone is the authority for BOTH the roll (WHITE_PAGES/) and the declared
household registry (tools/households.json). There is no default path on purpose,
for households-project.mjs's reason: this must be read from a clone whose
freshness you have checked, not from whatever copy happens to be lying around.`);
  process.exit(2);
}

const town = resolve(TOWN);
for (const [what, path] of [["roll", join(town, "WHITE_PAGES")], ["registry", join(town, "tools/households.json")]]) {
  if (!existsSync(path)) { console.error(`no ${what} at ${path} — is --town a postmark town clone?`); process.exit(2); }
}

// ── the roll ─────────────────────────────────────────────────────────────────
const roll = readdirSync(join(town, "WHITE_PAGES"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !["TEMPLATE", "_archived"].includes(e.name))
  .map((e) => e.name).sort();

// ── the world, as it is published ────────────────────────────────────────────
// The COMMITTED fold, not a regenerated one: `marks-fold.mjs` is a generator as
// well as a reader, and a clone without a stamp ledger regenerates it degraded.
// Read what the town published.
const world = JSON.parse(readFileSync(join(WORLD, "WORLD/world-state.json"), "utf8"));

// The household projection the fold ran on rides on the published state now. If
// this world predates that, project it here from the same authority the fold
// uses — never a second resolver, just the same one, later.
if (!world.households) {
  const declared = JSON.parse(readFileSync(join(town, "tools/households.json"), "utf8")).households ?? {};
  const map = {};
  for (const [slug, h] of Object.entries(declared)) for (const r of h.residents ?? []) map[r] = slug;
  world.households = map;
  world._households_projected_here = true;
}

// An unreadable HEAD is disclosed, never guessed — the manifest says "unknown"
// rather than carrying a sha nobody can check out.
const headSha = (repo) => {
  try { return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return "unknown (not a git checkout, or git unavailable)"; }
};

const atMs = Date.now();
const at = fractionalCrossing(atMs);
const departures = mergedRecords(WORLD, { atMs });
const governing = new Set(departures.map((d) => d.handle));
const porch = porchOf(world);

const rows = roll.map((handle) => {
  const here = whereIs(handle, { world, departures, at });
  const home = homeOf(handle, world);
  const parcels = parcelsFor(handle, world);
  const state = governing.has(handle) ? "walk"
    : home.placed ? (home.via === "own" ? "parcel" : "household")
    : here.placed ? "unplaced" : "unplaceable";
  return {
    handle,
    household: householdOf(handle, world),
    state,
    reads_now: { x: here.x, y: here.y, source: here.source, mark_id: here.mark_id },
    // WHAT THEY READ BEFORE THIS BRANCH — the "from what" the seeding needs. A
    // resident whose household holds ground read NOTHING at all: not a wrong
    // coordinate, an absence from every plural answer in town.
    read_before: governing.has(handle) ? "the same (a movement record governs)"
      : parcels.some((p) => p.household === handle) ? "the same (their own parcel)"
      : parcels.length ? "unplaced — their household's ground was invisible to their handle"
      : "unplaced — absent from every walkers list, with nothing disclosing it",
    household_parcels: parcels.map((p) => p.id),
    // The landing act's assertion, for the states that need one. `null` means
    // the record already places them and a placement would be noise.
    seed: state === "unplaced"
      ? { to: "quay", mark_id: QUAY_MARK_ID, at: { x: porch.x, y: porch.y },
          because: "no movement record and no ground at any grain — the ruled default is the town's porch" }
      : null,
  };
});

const byState = (s) => rows.filter((r) => r.state === s);

// ── the era-seam audit ───────────────────────────────────────────────────────
// The 27 placements the seam already made, and how they read today. This is not
// a proposal; it is the receipt that the precedent mechanism has a cost, so the
// founder chooses the seeding's shape with that in hand.
const SEAM_ISO = "2026-08-10T20:22:54.785Z";
const seam = departures.filter((d) => d.iso === SEAM_ISO);
const seamStillReading = seam.filter((d) => {
  const here = whereIs(d.handle, { world, departures, at });
  return here.source === "walk" && here.mark_id === null &&
    Math.abs(here.x - d.from.x) < 0.001 && Math.abs(here.y - d.from.y) < 0.001;
});

const manifest = {
  _what: "PREPARED, NOT LANDED. The seeding list for the position-truth ruling (2026-08-18). Nothing here has moved anybody; the landing act is the founder's.",
  _generated_at: new Date(atMs).toISOString(),
  _derived: {
    generated_by: "tools/position-seed-manifest.mjs",
    // The SHAS, not the paths, are what make this re-derivable by someone who is
    // not on this machine — a reviewed artifact should name its inputs in terms
    // the reviewer can also check out.
    town_sha: headSha(town),
    world_sha: headSha(WORLD),
    roll_source: "WHITE_PAGES/ — the town's own list of who exists, because a walk-records ∪ parcels roster cannot contain the residents this manifest is for",
    household_key: world._households_projected_here
      ? "projected here from the town's tools/households.json (this world's fold predates publishing it)"
      : "world.households — the projection the fold itself ran on",
    movement_records: { total: departures.length, note: "both eras: the frozen walk ledger and STATE/log — tools/movement-records.mjs" },
    crossing: at,
  },
  counts: {
    roll: rows.length,
    walk: byState("walk").length,
    parcel: byState("parcel").length,
    household: byState("household").length,
    unplaced: byState("unplaced").length,
    unplaceable: byState("unplaceable").length,
  },
  porch: { mark_id: QUAY_MARK_ID, at: { x: porch.x, y: porch.y }, placed: porch.placed },
  era_seam_audit: {
    instant: SEAM_ISO,
    placements: seam.length,
    still_reading_as_their_own_walk: seamStillReading.map((d) => d.handle).sort(),
    note: "The seam's --set-down-ashore wrote these as zero-distance departures attributed to the residents, with no target mark. Those still standing on them read `source: walk, mark_id: null` — a town placement wearing the resident's own act. This is the cost of copying that mechanism, stated so the founder can decline to.",
  },
  seeds: rows.filter((r) => r.seed),
  residents: rows,
};

const text = JSON.stringify(manifest, null, 2) + "\n";
if (OUT) {
  writeFileSync(resolve(OUT), text);
  console.error(`roll ${manifest.counts.roll} · walk ${manifest.counts.walk} · own parcel ${manifest.counts.parcel} · household ground ${manifest.counts.household} · to seed ${manifest.counts.unplaced} → ${OUT}`);
}
if (has("--json") || !OUT) console.log(text);
