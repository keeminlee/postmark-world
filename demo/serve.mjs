#!/usr/bin/env node
// DEMO — the works portal. One process, no network, nothing ships.
//
//   node demo/serve.mjs            → http://localhost:4890
//   PORT=5000 node demo/serve.mjs  → somewhere else
//
// Every read is off THIS worktree's disk and every response is computed fresh,
// so editing a mark and reloading the page shows the edit. There is no cache and
// no write path: the demo cannot change the world it is drawing.
//
// This is exploration scaffolding. It asserts no law, changes no engine, fold or
// lint behaviour, and lives entirely under demo/.

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorksGraph, buildMap } from "./works-graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4890);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, code, body, type) {
  res.writeHead(code, { "content-type": type ?? "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), MIME[".json"]);

function serveStatic(res, rel) {
  const abs = normalize(join(HERE, rel));
  if (!abs.startsWith(normalize(HERE))) return json(res, 403, { error: "forbidden" });
  if (!existsSync(abs)) return json(res, 404, { error: `not found: ${rel}` });
  send(res, 200, readFileSync(abs), MIME[extname(abs).toLowerCase()] ?? "application/octet-stream");
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p === "/" || p === "/index.html") return serveStatic(res, "index.html");
    if (p === "/app.js" || p === "/app.css") return serveStatic(res, p.slice(1));

    // the class-space graph, re-derived from the marks tree on every request
    if (p === "/graph.json") return json(res, 200, buildWorksGraph());
    // the map the crossing starts from, same records, same read
    if (p === "/map.json") return json(res, 200, buildMap());

    return json(res, 404, { error: `no route ${p}` });
  } catch (e) {
    // a broken record should say so on the page, not vanish into a blank screen
    return json(res, 500, { error: String(e && e.message ? e.message : e), stack: String(e && e.stack) });
  }
});

server.listen(PORT, () => {
  const g = buildWorksGraph();
  console.log(`works-portal demo → http://localhost:${PORT}`);
  console.log(`  class-space: ${g.counts.nodes} nodes (${g.counts.classNodes} class, ${g.counts.predicates} predicate), ${g.counts.edges} edges`);
  console.log(`  by type: ${Object.entries(g.counts.byEdgeType).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (g.counts.unresolved) console.log(`  ${g.counts.unresolved} edge target(s) outside class-space — see the page's Unresolved panel`);
  console.log(`  read from: ${g.worksPath}`);
});
