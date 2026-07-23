#!/usr/bin/env node
// world-spectator server — READ-ONLY local viewer over the semantic world.
//
// A spectator is a CAMERA, not an agent: movement is coordinate re-query, the
// walk verb is never invoked, no wear is written, nothing staked. Zero writes —
// the read-only law is structural here (the walk/stake/mark verbs are simply
// never imported), not behavioral.
//
// Local dev only (Keemin's call 2026-07-22: spectator read-only, no deploy;
// the held dyad-policy question on browser WRITES stays parked). Rides the
// sandbox engine at ../town-sandbox — the world library consumed read-only
// through its public exports; nothing here re-implements engine logic.
//
// Run: node server.mjs   → http://localhost:4877
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorld } from "../tools/world-poc.mjs";
import { orient, openYourEyes, investigate } from "../tools/world-verbs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKS_DIR = join(HERE, "..", "WORLD", "marks");
const PORT = Number(process.env.PORT ?? 4877);

// deterministic per crossing (fog seeds from the crossing number), so a world
// is cached per crossing — same crossing, same world, same telling.
const worlds = new Map();
function worldFor(crossing) {
  if (!worlds.has(crossing)) worlds.set(crossing, buildWorld({ crossing, marksDir: MARKS_DIR }));
  return worlds.get(crossing);
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

const num = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(join(HERE, "index.html"), "utf8"));
      return;
    }

    if (url.pathname === "/api/eyes") {
      const x = num(url.searchParams.get("x"), 0);
      const y = num(url.searchParams.get("y"), 0);
      const crossing = num(url.searchParams.get("crossing"), 19);
      const world = worldFor(crossing);
      const name =
        x === 0 && y === 0 ? "a spectator on the Town Centre quay" : `a spectator at (${x}, ${y})`;
      const observer = { x, y, name };
      const eyes = openYourEyes(observer, world, { crossing });
      const o = orient(observer, world, { crossing });
      json(res, 200, { orient: o, telling: eyes.tell(), radial: eyes.radial });
      return;
    }

    if (url.pathname === "/api/investigate") {
      const mark = url.searchParams.get("mark");
      if (!mark) return json(res, 400, { error: "mark required" });
      const crossing = num(url.searchParams.get("crossing"), 19);
      json(res, 200, investigate(mark, worldFor(crossing)));
      return;
    }

    json(res, 404, { error: "not found — /, /api/eyes?x=&y=&crossing=, /api/investigate?mark=" });
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, () => {
  console.log(`world-spectator (read-only) → http://localhost:${PORT}`);
  console.log(`marks: ${MARKS_DIR}`);
});
