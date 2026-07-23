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
//   • /api/stakes?holder=       → per-holder stakes, parsed from the town's
//                                  stamp-ledger (LOCAL-ONLY; the island hides the half)
//   • /atlas/*                  → proxied to postmark.town (the painting + its assets)
//
// The island (postmark.town/world) has none of this server — it serves the same
// viewer.mjs statically, fetches the record from raw.githubusercontent, reads the
// atlas same-origin, and the stakes half feature-detects itself off.
//
// Run: node server.mjs   → http://localhost:4877
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = Number(process.env.PORT ?? 4877);
// the town clone's stamp-ledger — READ-ONLY (brief: read only, never write here).
// Overridable; defaults to the Wright-HQ town clone the brief names.
const STAMP_LEDGER = process.env.STAMP_LEDGER ?? "G:/Wright-HQ/postmark/WHITE_PAGES/stamp-ledger.md";
const ATLAS_ORIGIN = process.env.ATLAS_ORIGIN ?? "https://postmark.town";

const MIME = { ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".html": "text/html; charset=utf-8" };
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

async function proxyAtlas(res, pathname) {
  // pathname begins with /atlas/ — mirror it to the live town, read-only
  const url = ATLAS_ORIGIN + pathname;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json(res, r.status, { error: `atlas upstream ${r.status}` });
    const buf = Buffer.from(await r.arrayBuffer());
    send(res, 200, buf, r.headers.get("content-type") ?? "application/octet-stream");
  } catch (e) {
    json(res, 502, { error: `atlas proxy failed (offline?): ${String(e?.message ?? e)}` });
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (p === "/" || p === "/index.html") return serveFile(res, "spectator/index.html");
    if (p === "/world-engine/spectator/viewer.mjs") return serveFile(res, "spectator/viewer.mjs");
    if (p.startsWith("/world-engine/tools/") && p.endsWith(".mjs")) return serveFile(res, "tools/" + p.slice("/world-engine/tools/".length));
    if (p === "/WORLD/world-state.json") return serveFile(res, "WORLD/world-state.json");
    if (p === "/WORLD/skeleton.json") return serveFile(res, "WORLD/skeleton.json");
    if (p === "/seeding/manifest.json") return serveFile(res, "seeding/manifest.json"); // homes → green (viewer derives home-ness; the record is untouched)

    if (p === "/api/stakes") {
      const holder = url.searchParams.get("holder");
      if (!holder) return json(res, 400, { error: "holder required" });
      return json(res, 200, stakesFor(holder));
    }

    if (p.startsWith("/atlas/")) return proxyAtlas(res, p);

    json(res, 404, { error: "not found — /, /world-engine/**, /WORLD/*.json, /api/stakes?holder=, /atlas/*" });
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, () => {
  console.log(`world-spectator (read-only) → http://localhost:${PORT}`);
  console.log(`  record : ${join(ROOT, "WORLD")}`);
  console.log(`  ledger : ${STAMP_LEDGER}${existsSync(STAMP_LEDGER) ? "" : "  (absent — stakes half will show empty)"}`);
  console.log(`  atlas  : proxied from ${ATLAS_ORIGIN}`);
});
