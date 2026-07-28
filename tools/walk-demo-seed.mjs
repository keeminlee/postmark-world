#!/usr/bin/env node
// walk-demo-seed.mjs — write a LOCAL, THROWAWAY walk ledger so the spectator has
// something to draw. For looking at the mechanic in a browser; nothing else.
//
//   node tools/walk-demo-seed.mjs        # write WORLD/walk-ledger.md
//   node tools/walk-demo-seed.mjs --rm   # delete it again
//
// DO NOT COMMIT THE FILE THIS WRITES. These departures were never declared by
// the residents named in them, and the ledger is a real record in production —
// a fabricated line in it is a lie about what someone did. It exists here so a
// reader can watch derivation work, then delete it.
//
// The departures are backdated so a walker is already partway along, because a
// walk covers 15 km per 12-hour crossing (~0.35 m/s) and a freshly-seeded one
// would sit motionless on top of its own start.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDeparture, fractionalCrossing } from "./walk.mjs";
import { segmentCrossesWater, crossings } from "./water.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "WORLD", "walk-ledger.md");

if (process.argv.includes("--rm")) {
  if (existsSync(LEDGER)) { unlinkSync(LEDGER); console.log(`removed ${LEDGER}`); }
  else console.log("nothing to remove");
  process.exit(0);
}

const world = JSON.parse(readFileSync(join(ROOT, "WORLD", "world-state.json"), "utf8"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD", "skeleton.json"), "utf8"));
const now = fractionalCrossing();

// Pick real parcels as origins, and for each find a destination on dry land. The
// water gate is OFF for v0, so this is no longer required for the legs to be
// accepted — it is kept because dry legs read more clearly on the painting than
// walkers standing mid-river.
const parcels = (world.parcels ?? []).slice(0, 24);
// The demo has to be LOOKED AT, which constrains it twice. Legs must be long —
// a 3 km leg is over in 0.2 of a crossing, so short legs give a map of walkers
// who have all already arrived — but they must also stay inside the painting: the
// viewer fits to the marks' extent, and a walker 22 km out is off-screen even
// after "fit". So: the farthest dry leg that still lands within the inhabited
// bounds. First cut ignored the bounds and put 6 of 7 walkers off the map.
const INHABITED = (() => {
  const xs = parcels.map((p) => p.at.x), ys = parcels.map((p) => p.at.y);
  const pad = 1500;
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad,
           y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad };
})();
const inside = (p) => p.x >= INHABITED.x0 && p.x <= INHABITED.x1 && p.y >= INHABITED.y0 && p.y <= INHABITED.y1;

function reachable(from) {
  let best = null;
  for (let r = 4000; r <= 16000; r += 1000)
    for (let i = 0; i < 48; i++) {
      const th = (i / 48) * Math.PI * 2;
      const to = { x: Math.round(from.x + Math.cos(th) * r), y: Math.round(from.y + Math.sin(th) * r) };
      if (!inside(to)) continue;
      if (segmentCrossesWater(from, to, skeleton)) continue;
      if (!best || r > best.r) best = { to, r };
    }
  return best?.to ?? null;
}

const lines = [];
// A spread of ages so the map shows every state at once: just set out, halfway,
// nearly there, and long since arrived.
const picks = [
  { p: parcels[parcels.length - 1], age: 0.05 },
  { p: parcels[0], age: 0.4 },
  { p: parcels[5], age: 0.75 },
  { p: parcels[9], age: 4.0 },
  { p: parcels[13], age: 0.2 },
  { p: parcels[17], age: 0.9 },
];
for (const { p, age } of picks) {
  if (!p) continue;
  const from = { x: p.at.x, y: p.at.y };
  const to = reachable(from);
  if (!to) { console.log(`  (no dry leg found from ${p.household} — skipped)`); continue; }
  lines.push(formatDeparture({ handle: p.household, from, toward: to, at: Math.max(0, now - age) }));
}
// and one standing still, so the "standing" colour appears
if (parcels[3]) {
  const s = { x: parcels[3].at.x, y: parcels[3].at.y };
  lines.push(formatDeparture({ handle: parcels[3].household, from: s, toward: s, at: now - 1 }));
}

const header = `# Walk ledger — LOCAL DEMO DATA, DO NOT COMMIT

Written by tools/walk-demo-seed.mjs. These departures were never declared by the
residents named here. Delete with \`node tools/walk-demo-seed.mjs --rm\`.

Grammar: \`- <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional-crossing>[ · to <mark-id>]\`
`;
writeFileSync(LEDGER, `${header}\n${lines.join("\n")}\n`, "utf8");
console.log(`wrote ${lines.length} demo departures → ${LEDGER}`);
console.log(`clock is at crossing ${now.toFixed(3)}`);
console.log(`crossings on the map: ${crossings(skeleton).map((c) => c.id).join(", ")}`);
console.log(`\nnow run:  node spectator/server.mjs   → http://localhost:4877`);
console.log(`then drag the "scrub" slider under the painting to run the clock forward.`);
console.log(`\nremember: node tools/walk-demo-seed.mjs --rm  when you are done looking.`);
