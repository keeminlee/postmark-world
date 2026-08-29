#!/usr/bin/env node
// demo/serve.mjs — the enter/exit(mark) DEMO SLICE, in one process.
//
// ⚠ THIS IS NOT PRODUCTION AND NEVER BECOMES IT. It exists so the enter/exit
// pair can be SEEN and argued with at the 2026-08-18 sitting, before the law is
// planted in LOGOS. Nothing here merges; nothing here deploys; the branch it
// lives on (jetto/enter-exit-demo) is a design artifact.
//
// ── what is REAL here, and what is a stub ───────────────────────────────────
//
// REAL — every one of these is the same code the town runs:
//   · the world record: this worktree's own WORLD/world-state.json, folded from
//     the marks tree by tools/marks-fold.mjs
//   · the field of view, the telling, the containment spine — the viewer imports
//     the engine unbundled and computes them client-side, exactly as the island
//   · the walk: tools/walk.mjs's own grammar and derived position
//   · THE ENTEREXIT ACTS: tools/thresholds.mjs adjudicates every entry against the
//     mark's own entry law, appends the acts, and derives occupancy from them.
//     The handshake, the refusal, the chain, the scoped read — all real.
//
// STUBBED, loudly, and only here:
//   · THE IDENTITY DOOR. GitHub OAuth cannot complete headless, so `/api/ops/
//     whoami` hands out a demo household (the same stub shape step 2's QA used).
//     Nobody signs in; the demo household is asserted by this file.
//   · the stamp balance and the household portfolio, which the viewer's
//     identity gate wants before it will let anyone act. Flat fixtures.
//
// NOT TOUCHED, deliberately: the box, any main, the real office, the real
// town's ledgers. Every write this server makes lands in demo/state/, which is
// git-ignored and deleting it is the whole of "reset the demo".
//
// Run:  node demo/serve.mjs      →  http://localhost:4880

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { parseWalkLedger, publicWalkers, fractionalCrossing, formatDeparture, positionAt, currentDeparture, extentForArrival } from "../tools/walk.mjs";
import { publicResidents } from "../tools/where-is.mjs";
import { enter, exit, enterPrompt, exitPrompt, enteredScope, entryPlan } from "../tools/world-verbs.mjs";
import { parseThresholdLedger, occupancyAt, occupantsOf, containsEdges, LEDGER_HEADER, termsAt, stampAt } from "../tools/thresholds.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const STATE = join(HERE, "state");
const PORT = Number(process.env.PORT ?? 4880);
const ATLAS_ORIGIN = process.env.ATLAS_ORIGIN ?? "https://postmark.town";
const STAMP_LEDGER = process.env.STAMP_LEDGER ?? "G:/Wright-HQ/postmark/WHITE_PAGES/stamp-ledger.md";

// ── the demo household (THE STUB — see the header) ──────────────────────────
// Three real residents of the real town, because a demo that invents people
// reads as a mock-up and this one is meant to read as the place. The postmaster
// lives 450 m from her own boat, which is why she walks first.
// Overridable for the same reason DEMO_PACE_KM is: a demo dial, stated out loud.
// QA for the interiors work needs the stub to hand out the handle whose entry
// is on the REAL record, and hardcoding that resident into the demo household
// would put him in a script he never agreed to be in.
const DEMO_HANDLES = String(process.env.DEMO_HANDLES ?? "postmaster,illuminator,kilean")
  .split(",").map((h) => h.trim()).filter(Boolean);
const DEMO_KEY = "demo-key";

// THE ONE DEMO DIAL, and it is loud on purpose. A resident's stride is 60 km per
// crossing (decision 008b's departure-class dial), which puts the postmaster's
// 450 m walk to her own boat about six real minutes away — long enough that
// nobody watching a demo would ever see it land, and the whole point of the
// walk in this script is that it lands and puts her inside NOTHING. So the
// demo stamps a faster stride on its own departures. It is stamped ON THE LEG,
// in the record's own grammar (`· pace <n>`), exactly as the vessel's 405 is —
// which is the reason this is a dial and not a lie: every line says what law
// derived it, and the real town's 60 is untouched.
const DEMO_PACE_KM = Number(process.env.DEMO_PACE_KM ?? 10000);

const MIME = { ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".html": "text/html; charset=utf-8", ".md": "text/markdown; charset=utf-8" };

// ── demo/state — the only thing this server writes ──────────────────────────
const WALKS = join(STATE, "walk-ledger.md");
const ENTER_EXIT_LEDGER = join(STATE, "threshold-ledger.md");

function ensureState() {
  if (!existsSync(STATE)) mkdirSync(STATE, { recursive: true });
  if (!existsSync(WALKS)) {
    // the town's real ledger, copied — then the demo's own departures appended,
    // so the seeded occupant's body stands where his entry says he is
    const seeded = join(HERE, "seed", "walk-seed.md");
    const extra = existsSync(seeded) ? readFileSync(seeded, "utf8").split("\n").filter((l) => l.startsWith("- ")) : [];
    writeFileSync(WALKS, `${readFileSync(join(ROOT, "WORLD/walk-ledger.md"), "utf8").replace(/\n*$/, "\n")}${extra.join("\n")}\n`, "utf8");
  }
  if (!existsSync(ENTER_EXIT_LEDGER)) {
    const seed = join(HERE, "seed", "threshold-ledger.md");
    writeFileSync(ENTER_EXIT_LEDGER, existsSync(seed) ? readFileSync(seed, "utf8") : LEDGER_HEADER, "utf8");
  }
}
const readWalks = () => parseWalkLedger(readFileSync(WALKS, "utf8"));
const readEnterExits = () => parseThresholdLedger(readFileSync(ENTER_EXIT_LEDGER, "utf8"));
const appendLines = (file, lines) => {
  const prev = readFileSync(file, "utf8");
  writeFileSync(file, `${prev}${prev.endsWith("\n") ? "" : "\n"}${lines.join("\n")}\n`, "utf8");
};

// ── the world, re-read per request (the fold is on disk; edits show up live) ─
function loadWorld() {
  const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
  return { marks: worldState.marks ?? [], terrain: null, worldState };
}
function manifest() {
  try { return JSON.parse(readFileSync(join(ROOT, "seeding/manifest.json"), "utf8")); } catch { return { homes: [] }; }
}
function homeOf(handle) {
  const h = (manifest().homes ?? []).find((e) => e.household === handle && e.grid_m);
  return h ? { x: Number(h.grid_m.x), y: Number(h.grid_m.y), markId: `${h.household}/${h.home_id}` } : null;
}
/** Where a resident stands: the live walk if there is one, else their home.
 *  (The wind-down's POSITION'S SOURCE OF TRUTH thread proposes replacing this
 *  else-branch with a seeded `within` edge — out of this demo's scope, and
 *  named here because this IS the fallback that thread is about.) */
function standpointOf(handle, at = fractionalCrossing()) {
  const d = currentDeparture(readWalks().departures, handle);
  const p = d ? positionAt(d, at) : null;
  if (p) return { x: p.x, y: p.y, name: handle };
  const home = homeOf(handle);
  return home ? { x: home.x, y: home.y, name: handle } : { x: 0, y: 0, name: handle };
}

// ── http plumbing ───────────────────────────────────────────────────────────
function send(res, code, body, type) {
  res.writeHead(code, { "content-type": type ?? "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), MIME[".json"]);
function serveFile(res, relPath) {
  const abs = normalize(join(ROOT, relPath));
  if (!abs.startsWith(normalize(ROOT))) return json(res, 403, { error: "forbidden" });
  if (!existsSync(abs)) return json(res, 404, { error: `not found: ${relPath}` });
  send(res, 200, readFileSync(abs), MIME[abs.slice(abs.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream");
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
async function proxyTown(res, pathname) {
  try {
    const r = await fetch(ATLAS_ORIGIN + pathname, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json(res, r.status, { error: `atlas upstream ${r.status}` });
    send(res, 200, Buffer.from(await r.arrayBuffer()), r.headers.get("content-type") ?? "application/octet-stream");
  } catch (e) { json(res, 502, { error: `atlas proxy failed (offline?): ${String(e?.message ?? e)}` }); }
}
const SHELF_ORIGIN = process.env.SHELF_ORIGIN ?? "https://media.postmark.town";
async function proxyShelf(res, pathname) {
  try {
    const r = await fetch(SHELF_ORIGIN + pathname, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json(res, r.status, { error: `shelf upstream ${r.status}` });
    send(res, 200, Buffer.from(await r.arrayBuffer()), r.headers.get("content-type") ?? "application/octet-stream");
  } catch (e) { json(res, 502, { error: `shelf proxy failed (offline?): ${String(e?.message ?? e)}` }); }
}

// ── the shell, with the demo's own bootstrap ────────────────────────────────
//
// The viewer's identity gate wants a key in localStorage before it will ask the
// office who you are, so the demo plants one. It also plants step 2's landing
// default (the READ, not the painting) when the reader has expressed no
// preference — the enter/exit cut lives in the read, and opening on the map
// would hide the thing the demo is for.
function shell() {
  const html = readFileSync(join(ROOT, "spectator/index.html"), "utf8");
  const boot = `<script>
  try {
    localStorage.setItem("pm_key", ${JSON.stringify(DEMO_KEY)});
    if (localStorage.getItem("pm_world_painting_only") === null) localStorage.setItem("pm_world_painting_only", "0");
  } catch (e) {}
</script>
`;
  return html.replace("<div id=\"app\"></div>", `${boot}<div id="app"></div>`);
}

// ── the apex door: walk · enter · exit ──────────────────────────────────────
//
// The same `{ do, args, handle }` envelope the MCP door and the real office
// speak, so the viewer's own apexAct() is unchanged code talking to a smaller
// office. The three acts below are the whole of this door.
async function apex(body) {
  const action = String(body.do ?? "").trim();
  const args = body.args ?? {};
  const handle = String(body.handle ?? "").trim();
  if (!handle) return { error: "bounce", code: 422, defect: "no handle", hint: "the demo office acts only as a named resident" };
  if (!DEMO_HANDLES.includes(handle)) return { error: "bounce", code: 403, defect: `${handle} is not in the demo household`, hint: `try one of ${DEMO_HANDLES.join(", ")}` };

  const world = loadWorld();
  // the clock the RECORD will hold, not the one the process happens to read —
  // the writer and the reader must agree to the last decimal (thresholds.mjs
  // § stampAt, and the QA bug that earned it)
  const at = stampAt(fractionalCrossing());
  const occupancy = occupancyAt(readEnterExits().acts, at);
  const here = standpointOf(handle, at);

  if (action === "walk") {
    const to = { x: Number(args.x), y: Number(args.y) };
    if (!Number.isFinite(to.x) || !Number.isFinite(to.y))
      return { error: "bounce", code: 422, defect: "a walk needs two finite coordinates", hint: "args: { x, y }" };
    const target = args.mark ? world.marks.find((m) => m.id === args.mark) : null;
    const line = formatDeparture({
      handle, from: { x: here.x, y: here.y }, toward: to, at,
      targetExtent: target ? extentForArrival("entry", target.extent) : null,
      targetMarkId: args.mark ?? null,
      pace: DEMO_PACE_KM,
    });
    appendLines(WALKS, [line]);
    const d = currentDeparture(readWalks().departures, handle);
    const p = positionAt(d, at);
    // R15, said out loud at the moment it matters: the walk moved him and put
    // him inside NOTHING. The prompt is how the decoupling stays legible.
    const landed = { x: d.toward.x, y: d.toward.y, name: handle };
    return {
      did: "walk",
      result: { leg_m: p.legM, eta_crossings: p.etaCrossings, position: p, line,
                entered_nothing: true,
                enter_prompt: enterPrompt(landed, world, { occupancy, handle }) },
    };
  }

  if (action === "enter") {
    const markId = String(args.mark ?? "").trim();
    if (!markId) return { error: "bounce", code: 422, defect: "enter what?", hint: "args: { mark: \"<by>/<slug>\" }" };
    const answer = enter(here, markId, world, { occupancy, handle, at, accepted: args.accept === true });
    if (answer.error) return { error: "bounce", code: 422, defect: answer.error, hint: "the mark must exist and have an extent — there is no inside to a point" };
    // The bundled walk: entering from outside carries the navigation with it,
    // and the walk half is recorded as a walk, in the walk ledger, because that
    // is what it is. (Two acts, two ledgers, one button.)
    // …once. A door that asks for your word is answered on a second call, and
    // re-recording the same journey each time would put two departures for one
    // walk into an append-only record. Already headed there = already walking.
    const heading = currentDeparture(readWalks().departures, handle);
    const alreadyHeaded = heading?.targetMarkId === markId && !positionAt(heading, at)?.arrived;
    if (answer.walk && !alreadyHeaded) {
      const target = world.marks.find((m) => m.id === markId);
      appendLines(WALKS, [formatDeparture({
        handle, from: { x: here.x, y: here.y }, toward: answer.walk.to, at,
        targetExtent: extentForArrival("centre", target?.extent), targetMarkId: markId, pace: DEMO_PACE_KM,
      })]);
    }
    if (answer.rows.length) appendLines(ENTER_EXIT_LEDGER, answer.rows);
    const after = occupancyAt(readEnterExits().acts, at);
    return {
      did: "enter",
      terms: answer.adjudications.map((c) => c.terms).filter(Boolean),
      result: {
        target: markId, chain: answer.chain, adjudications: answer.adjudications,
        entered: answer.entered, stranded: answer.stranded,
        refused: answer.refused ?? null, awaiting: answer.awaiting ?? null,
        walked: answer.walk ?? null,
        within: after.get(handle) ?? [],
        scope: answer.entered.length ? enteredScope(answer.entered[answer.entered.length - 1], world, { occupancy: after, handle }) : null,
      },
    };
  }

  if (action === "exit") {
    const markId = String(args.mark ?? "").trim() || (occupancy.get(handle) ?? []).slice(-1)[0];
    if (!markId) return { error: "bounce", code: 422, defect: "you are not within anything", hint: "there is nothing to step out of" };
    const answer = exit(markId, world, { occupancy, handle, at });
    if (answer.error) return { error: "bounce", code: 422, defect: answer.error, hint: "exit names a mark you are within" };
    appendLines(ENTER_EXIT_LEDGER, answer.rows);
    const after = occupancyAt(readEnterExits().acts, at);
    return {
      did: "exit",
      result: { target: markId, left: answer.left, within: after.get(handle) ?? [], into: answer.into,
                scope: answer.into ? enteredScope(answer.into, world, { occupancy: after, handle }) : null },
    };
  }

  return { error: "bounce", code: 422, defect: `"${action}" is not one of the demo's acts`, hint: "this office affords walk, enter, exit — and nothing else, on purpose" };
}

// ── the stakes half (read-only, exactly as the spectator's) ─────────────────
const STAKE_RE = /^-\s+(\S+)\s+·\s+(\S+)\s+→\s+(stake|return):mark:(\S+)\s+·\s+(\d+)/;
function stakesFor(holder) {
  if (!existsSync(STAMP_LEDGER)) return { holder, stakes: [], source: null };
  const net = new Map();
  for (const line of readFileSync(STAMP_LEDGER, "utf8").split(/\r?\n/)) {
    const m = line.match(STAKE_RE);
    if (!m || m[2] !== holder) continue;
    net.set(m[4], (net.get(m[4]) ?? 0) + (m[3] === "return" ? -Number(m[5]) : Number(m[5])));
  }
  return { holder, stakes: [...net].filter(([, n]) => n !== 0).map(([mark, n]) => ({ mark, n })), source: STAMP_LEDGER };
}

// ── routes ──────────────────────────────────────────────────────────────────
ensureState();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (p === "/" || p === "/index.html") return send(res, 200, shell(), MIME[".html"]);
    if (p === "/world-engine/spectator/viewer.mjs") return serveFile(res, "spectator/viewer.mjs");
    if (p.startsWith("/world-engine/tools/") && p.endsWith(".mjs")) return serveFile(res, "tools/" + p.slice("/world-engine/tools/".length));
    if (p === "/WORLD/world-state.json") return serveFile(res, "WORLD/world-state.json");
    if (p === "/WORLD/skeleton.json") return serveFile(res, "WORLD/skeleton.json");
    if (p === "/seeding/manifest.json") return serveFile(res, "seeding/manifest.json");
    if (p === "/WORLD/walk-ledger.md") return send(res, 200, readFileSync(WALKS, "utf8"), MIME[".md"]);
    // THE SITE'S PIN, SIMULATED. Set STAGED_LEDGER to a frozen copy and this route
    // serves that instead of live state — which is precisely what the built site
    // does, and the condition the office-first order exists to survive.
    if (p === "/WORLD/threshold-ledger.md") return send(res, 200,
      readFileSync(process.env.STAGED_LEDGER || ENTER_EXIT_LEDGER, "utf8"), MIME[".md"]);
    // the office's own live ledger door, mirrored — the viewer asks this FIRST now,
    // and the demo must exercise the same path the site will (see server.mjs).
    if (p === "/api/world/threshold-ledger")
      return json(res, 200, { ledger: readFileSync(ENTER_EXIT_LEDGER, "utf8"), source: "the demo rig's own state" });

    // ── the identity door · THE STUB ────────────────────────────────────────
    if (p === "/api/ops/whoami")
      return json(res, 200, { principal: "demo@enter-exit", handles: DEMO_HANDLES, demo_stub: true,
                              note: "STUBBED IDENTITY — GitHub OAuth cannot complete headless. Everything below this door is real." });
    if (p === "/api/world/state") return serveFile(res, "WORLD/world-state.json");
    if (p === "/api/world/skeleton") return serveFile(res, "WORLD/skeleton.json");
    // the office surfaces this demo has no room behind. Answered EMPTY rather
    // than 404 so the console stays clean enough that a real error is visible in
    // it — each says demo_stub, so nobody mistakes quiet for working.
    if (p === "/api/world/settlements") return json(res, 200, { settlements: [], recent: [], demo_stub: true });
    if (p === "/api/repo/log") return json(res, 200, { commits: [], demo_stub: true });
    if (p === "/world-engine/residents-meta.json") return json(res, 200, {});
    if (p === "/api/world/my-marks") return json(res, 200, { drafts: [], published: [], backed: [], demo_stub: true });
    if (p.startsWith("/api/stamps/")) return json(res, 200, { stamps: 0, demo_stub: true });
    if (p.startsWith("/api/homes/")) {
      const h = decodeURIComponent(p.slice("/api/homes/".length));
      const home = homeOf(h);
      return json(res, 200, home ? { world: { sited: true, x: home.x, y: home.y, mark_id: home.markId } } : { world: { sited: false } });
    }

    // ── the acts ────────────────────────────────────────────────────────────
    // The BARE apex read — where the Actions rail (R16) gets its palette.
    //
    // THE RAIL IS NEVER HANDED A VERB LIST. That is R16's whole point and the
    // viewer has a falsifier defending it, so enter/exit reach the buttons the
    // way every other verb does: this door GRANTS them in `actions`, the rail
    // derives the palette from what it was granted, and the viewer's registry
    // only says how to open the flow. Take these two entries away and the
    // buttons vanish with no viewer edit — which is exactly the property the
    // demo is meant to show still holds.
    //
    // The grant is THIS OFFICE'S assertion, not a class mark's: a demo office
    // with no world store has no class-mark gate to read one from. That is the
    // honest gap and it is the last thing standing between this and production
    // — when the law is planted at the sitting, the grant moves onto a class
    // mark and this branch of the stub deletes itself.
    if (p === "/api/world/apex" && req.method === "GET") {
      const handle = url.searchParams.get("handle") ?? "";
      const at = stampAt(fractionalCrossing());
      const here = handle ? standpointOf(handle, at) : { x: 0, y: 0, name: "a spectator" };
      const within = occupancyAt(readEnterExits().acts, at).get(handle) ?? [];
      // A spectator is a camera and is granted nothing — the rail hides itself
      // for them rather than showing an empty section.
      const actions = handle ? [
        { action: "enter", dispatches_to: "world_enter", grant: "yours", class: "resident", via: "within",
          from: "the-town/resident",
          blurb: "Enter a mark. Walking moves you to coordinates and puts you inside nothing; entering is the act with mechanical weight, and the mark answers it with its own word." },
        { action: "exit", dispatches_to: "world_exit", grant: "yours", class: "resident", via: "within",
          from: "the-town/resident",
          blurb: "Step out of a mark you are within — you nullifying your own side of the edge you authored, which needs nobody's answer." },
      ] : [];
      return json(res, 200, {
        standpoint: { stance: handle ? "embodied" : "spectator", handle: handle || null, x: here.x, y: here.y },
        within, nearby: [], actions,
        granted: { yours: actions.map((a) => a.action), here: [] },
        law: {
          source: "the demo office itself — there is no world store here, so no class mark is being read",
          demo_stub: true,
          note: "enter/exit are granted by this stub, not by the town's law. Planting them on a class mark is the sitting's act, not this branch's.",
        },
      });
    }

    if (p === "/api/world/apex" && req.method === "POST") {
      const answer = await apex(await readBody(req));
      return json(res, answer?.error === "bounce" ? (answer.code ?? 422) : 200, answer);
    }

    // ── occupancy: the derived read the viewer's cut is drawn from ──────────
    if (p === "/api/world/occupancy" || p === "/api/occupancy") {
      const at = url.searchParams.get("at") === null ? fractionalCrossing() : Number(url.searchParams.get("at"));
      const { acts, unrecognized } = readEnterExits();
      const occupancy = occupancyAt(acts, at);
      return json(res, 200, {
        at,
        within: Object.fromEntries(occupancy),                      // handle → the chain of marks they entered
        occupants: Object.fromEntries(occupantsOf(occupancy)),      // mark → who is inside it
        edges: containsEdges(occupancy),                            // the literal contains edges, entity children
        acts: acts.length, unrecognized: unrecognized.length,
      });
    }

    if (p === "/api/walks" || p === "/api/world/walkers") {
      const raw = url.searchParams.get("at");
      const at = raw === null ? fractionalCrossing() : Number(raw);
      const { departures, unrecognized } = readWalks();
      const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
      const roster = [...departures.map((d) => d.handle), ...((worldState.parcels ?? []).map((pc) => pc.household))].filter(Boolean);
      return json(res, 200, { at, now: fractionalCrossing(),
        walkers: publicResidents(roster, { world: worldState, departures, at }),
        departures: departures.length, unrecognized: unrecognized.length });
    }
    if (p === "/api/stakes") {
      const holder = url.searchParams.get("holder");
      return holder ? json(res, 200, stakesFor(holder)) : json(res, 400, { error: "holder required" });
    }
    if (p === "/api/demo/reset") {
      rmSync(STATE, { recursive: true, force: true });
      ensureState();
      return json(res, 200, { reset: true, note: "demo/state re-seeded — the town's own record was never touched" });
    }

    if (p.startsWith("/atlas/") || p.startsWith("/media/")) return proxyTown(res, p);
    // the media shelf, at its own host — see spectator/server.mjs for why this
    // cannot just be /media/
    if (p.startsWith("/shelf/")) return proxyShelf(res, "/media/" + p.slice("/shelf/".length));
    json(res, 404, { error: `not found: ${p}` });
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e), stack: String(e?.stack ?? "").split("\n").slice(0, 4) });
  }
}).listen(PORT, () => {
  const { acts } = readEnterExits();
  console.log(`enter/exit DEMO  →  http://localhost:${PORT}`);
  console.log(`  record    : ${join(ROOT, "WORLD")}  (real, this worktree's fold)`);
  console.log(`  demo state: ${STATE}  (${readWalks().departures.length} departures · ${acts.length} enterexit acts) — delete it, or GET /api/demo/reset, to start over`);
  console.log(`  identity  : STUBBED — household ${DEMO_HANDLES.join(", ")}`);
  console.log(`  the box, the real office and every main branch are untouched by this process.`);
});
