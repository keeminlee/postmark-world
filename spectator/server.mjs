#!/usr/bin/env node
// world-spectator server — READ-ONLY local host for the told-world viewer.
//
// A spectator is a CAMERA, not an agent: there is no write path here. The viewer
// computes the field of view CLIENT-SIDE (viewer.mjs imports the same engine a
// clone runs), so this server only SERVES — it never tells. Its jobs:
//   • /                         → the shell (spectator/index.html)
//   • /world-engine/**          → the viewer module + the engine .mjs (so the
//                                  browser imports the exact library, unbundled)
//   • /WORLD/*.json             → the world's public record, off THIS clone's disk
//   • /WORLD/threshold-ledger.md → the crossings; the page derives occupancy from
//                                  them the way it derives position from walks
//   • /api/stakes?holder=       → per-holder stakes, parsed from the town's
//                                  stamp-ledger (LOCAL-ONLY; the island hides the half)
//   • /atlas/*, /media/*        → proxied to postmark.town (the painting and its
//                                  assets; the processed images the map hangs
//                                  placed artwork from)
//
// The island (postmark.town/world) has none of this server — it serves the same
// viewer.mjs statically and STAGES the same record files beside it at build time,
// so the page reads `/WORLD/**` same-origin exactly as it does here. It reads the
// atlas same-origin too, and the stakes half feature-detects itself off. Neither
// habitat reads the world repo's main tip any more; see `tools/record-sources.mjs`.
//
// Run: node server.mjs   → http://localhost:4877
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { parseWalkLedger, publicWalkers, fractionalCrossing } from "../tools/walk.mjs";
import { publicResidents } from "../tools/where-is.mjs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.PORT ?? 4877);
// the town clone's stamp-ledger — READ-ONLY (brief: read only, never write here).
// Overridable; defaults to the Wright-HQ town clone the brief names.
const STAMP_LEDGER = process.env.STAMP_LEDGER ?? "G:/Wright-HQ/postmark/WHITE_PAGES/stamp-ledger.md";
const ATLAS_ORIGIN = process.env.ATLAS_ORIGIN ?? "https://postmark.town";
// the media shelf — a DIFFERENT host from the town, and deliberately not folded
// into ATLAS_ORIGIN: /media/ means one thing on the site and another on the shelf
const SHELF_ORIGIN = process.env.SHELF_ORIGIN ?? "https://media.postmark.town";
const SHELF_ROUTE = "/shelf/";

const MIME = { ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8" };
const STAKE_RE = /^-\s+(\S+)\s+·\s+(\S+)\s+→\s+(stake|return):mark:(\S+)\s+·\s+(\d+)/;

function send(res, code, body, type) {
  res.writeHead(code, { "content-type": type ?? "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj), MIME[".json"]); }

// serve a file from within ROOT only (no traversal outside the clone)
function serveFile(res, relPath) {
  const abs = normalize(join(ROOT, relPath));
  if (!abs.startsWith(normalize(ROOT))) return json(res, 403, { error: "forbidden" });
  if (!existsSync(abs)) return json(res, 404, { error: `not found: ${relPath}` });
  const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
  send(res, 200, readFileSync(abs), MIME[ext] ?? "application/octet-stream");
}

// The world the page reads. Normally this clone's WORLD/; WORLD_DIR points it at
// a synthetic one for a perf run, and says so on the console at boot so nobody
// ever mistakes a fixture reading for a reading of the town.
const WORLD_DIR = process.env.WORLD_DIR ? normalize(process.env.WORLD_DIR) : null;
function serveWorld(res, file) {
  if (!WORLD_DIR) return serveFile(res, "WORLD/" + file);
  const abs = join(WORLD_DIR, file);
  if (!existsSync(abs)) return json(res, 404, { error: `not found: ${abs}` });
  send(res, 200, readFileSync(abs), MIME[".json"]);
}

// per-holder stakes from the stamp-ledger (net per mark; return = withdrawal)
function stakesFor(holder) {
  if (!existsSync(STAMP_LEDGER)) return { holder, stakes: [], source: null, note: "no stamp-ledger found on this box" };
  const net = new Map();
  for (const line of readFileSync(STAMP_LEDGER, "utf8").split(/\r?\n/)) {
    const m = line.match(STAKE_RE);
    if (!m || m[2] !== holder) continue;
    const mark = m[4], n = m[3] === "return" ? -Number(m[5]) : Number(m[5]);
    net.set(mark, (net.get(mark) ?? 0) + n);
  }
  const stakes = [...net].filter(([, n]) => n !== 0).map(([mark, n]) => ({ mark, n }));
  return { holder, stakes, source: STAMP_LEDGER };
}

// The town's own static surfaces, mirrored read-only: /atlas/* is the painting
// and its assets, /media/* is the processed image pipeline the map hangs placed
// artwork from. Both are served same-origin on postmark.town, so proxying them
// here is what makes the local spectator show the same map the island does
// rather than a page of broken images.
async function proxyOrigin(res, origin, pathname) {
  const url = origin + pathname;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json(res, r.status, { error: `upstream ${r.status} for ${url}` });
    const buf = Buffer.from(await r.arrayBuffer());
    send(res, 200, buf, r.headers.get("content-type") ?? "application/octet-stream");
  } catch (e) {
    json(res, 502, { error: `proxy failed (offline?): ${String(e?.message ?? e)}` });
  }
}
const proxyTown = (res, pathname) => proxyOrigin(res, ATLAS_ORIGIN, pathname);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (p === "/" || p === "/index.html") return serveFile(res, "spectator/index.html");
    if (p === "/world-engine/spectator/viewer.mjs") return serveFile(res, "spectator/viewer.mjs");
    if (p.startsWith("/world-engine/tools/") && p.endsWith(".mjs")) return serveFile(res, "tools/" + p.slice("/world-engine/tools/".length));
    // WORLD_DIR lets a perf run serve a synthetic world in the record's place
    // (tools/perf-fixture.mjs). Unset — which is every real run — this is the
    // record off this clone's disk, byte for byte as before.
    if (p === "/WORLD/world-state.json") return serveWorld(res, "world-state.json");
    if (p === "/WORLD/skeleton.json") return serveWorld(res, "skeleton.json");
    // the crossings, as a FILE rather than as a door. Occupancy is derived from
    // the acts client-side (the same shape as position from the walk ledger), so
    // what the page needs is the record, not this server's opinion of it — and
    // serving it here is what lets a local read stand on THIS clone's disk
    // instead of falling through to the published raw file.
    if (p === "/WORLD/threshold-ledger.md") return serveFile(res, "WORLD/threshold-ledger.md");
    // the walks, for the same reason and by the same rule. This route was
    // MISSING until 2026-08-26, and its absence is what the raw-github fallback
    // was really covering: a local spectator asked this server for the ledger,
    // got a 404, and quietly read the world repo's main tip instead — a
    // different world from the one on this clone's disk. The fallback is gone
    // now, so this route is not a convenience; it is the answer.
    if (p === "/WORLD/walk-ledger.md") return serveFile(res, "WORLD/walk-ledger.md");
    if (p === "/seeding/manifest.json") return serveFile(res, "seeding/manifest.json"); // homes → green (viewer derives home-ness; the record is untouched)

    if (p === "/api/stakes") {
      const holder = url.searchParams.get("holder");
      if (!holder) return json(res, 400, { error: "holder required" });
      return json(res, 200, stakesFor(holder));
    }

    // /api/walks — the movement ledger's derived state, for the walkers layer.
    // `?at=` scrubs the clock: a walker covers 15 km per 12-hour crossing, about
    // 0.35 m/s, so a live view of a real walk looks frozen. Passing a fractional
    // crossing lets a reader watch a journey run. Derivation is pure, so a
    // scrubbed answer is exactly what that instant will really hold.
    if (p === "/api/walks") {
      const raw = url.searchParams.get("at");
      const at = raw === null ? fractionalCrossing() : Number(raw);
      if (!Number.isFinite(at) || at < 0) return json(res, 400, { error: "at must be a fractional crossing >= 0" });
      let text = "";
      try { text = readFileSync(join(ROOT, "WORLD/walk-ledger.md"), "utf8"); } catch { /* no ledger yet */ }
      const { departures, unrecognized } = parseWalkLedger(text);
      // the fold, for everyone standing on their own ground; a spectator with no
      // world-state still gets the walk ledger's answer rather than an error
      let worldState = null;
      try { worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8")); } catch { /* ledger only */ }
      const roster = [
        ...departures.map((d) => d.handle),
        ...((worldState?.parcels ?? []).map((pc) => pc.household)),
      ].filter(Boolean);
      return json(res, 200, {
        at, now: fractionalCrossing(),
        // one vocabulary, shared with the office door — and it is the ENGINE's,
        // not each publisher's own. publicResidents folds the walk ledger and the
        // world's parcels into a single list with two states; assembling that
        // shape twice is exactly how the door and this server drifted apart.
        walkers: worldState
          ? publicResidents(roster, { world: worldState, departures, at })
          : publicWalkers(departures, at),
        departures: departures.length, unrecognized: unrecognized.length,
      });
    }

    if (p.startsWith("/atlas/") || p.startsWith("/media/")) return proxyTown(res, p);
    // THE SHELF, which is a different host from the town. An SVG <image href> may
    // carry no protocol and no host (safeAvatarUrl refuses both — escaping is the
    // wrong tool for a URL), so a mark's picture reaches the interior floor as a
    // same-origin /shelf/ path and is proxied at the shelf here. It cannot be
    // folded into /media/ above: that is the SITE's media root, and the two
    // shelves hold different files under identical-looking paths.
    if (p.startsWith(SHELF_ROUTE)) return proxyOrigin(res, SHELF_ORIGIN, "/media/" + p.slice(SHELF_ROUTE.length));

    json(res, 404, { error: "not found — /, /world-engine/**, /WORLD/*.json, /WORLD/threshold-ledger.md, /api/stakes?holder=, /api/walks?at=, /atlas/*, /media/*" });
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, () => {
  console.log(`world-spectator (read-only) → http://localhost:${PORT}`);
  console.log(`  record : ${WORLD_DIR ? `${WORLD_DIR}   ⚠ SYNTHETIC FIXTURE, not the town` : join(ROOT, "WORLD")}`);
  console.log(`  ledger : ${STAMP_LEDGER}${existsSync(STAMP_LEDGER) ? "" : "  (absent — stakes half will show empty)"}`);
  console.log(`  atlas  : proxied from ${ATLAS_ORIGIN}`);
});
