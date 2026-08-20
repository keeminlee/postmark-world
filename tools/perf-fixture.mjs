#!/usr/bin/env node
// perf-fixture.mjs — a synthetic world N times the size of the real one.
//
// ⚠ SCRATCH. This writes a FIXTURE, never the record. It refuses to write into
// WORLD/ at all (see the guard below), because the one way this tool could do
// real damage is by being pointed at the town by a tired hand.
//
// The founder's question behind the perf pass is "which bottlenecks get worse at
// 10× marks", and that is not a question you can answer by reasoning about
// complexity classes: an O(n) path with a small constant and an O(n) path that
// allocates a DOM node per mark diverge by two orders of magnitude at the same
// big-O. So the fixture is real: the actual world-state, with its marks cloned
// into a lattice around the town, keeping every field the fold and the engine
// read so nothing downstream can tell it is dealing with a copy.
//
// Usage:  node tools/perf-fixture.mjs <out-dir> [multiplier]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [outArg, multArg] = process.argv.slice(2);
if (!outArg) {
  console.error("usage: node tools/perf-fixture.mjs <out-dir> [multiplier]");
  process.exit(2);
}
const OUT = resolve(outArg);
const MULT = Math.max(1, Number(multArg ?? 10) | 0);

// THE GUARD. A fixture that can be written over the record is not a fixture, it
// is a loaded gun pointed at the town. Refuse the record's own directory, and
// refuse anything inside it, whatever it is called.
const RECORD = resolve(join(ROOT, "WORLD"));
if (OUT === RECORD || OUT.startsWith(RECORD + "\\") || OUT.startsWith(RECORD + "/")) {
  console.error(`refused: ${OUT} is the record. A fixture never writes into WORLD/.`);
  process.exit(3);
}

const worldState = JSON.parse(readFileSync(join(ROOT, "WORLD/world-state.json"), "utf8"));
const skeleton = JSON.parse(readFileSync(join(ROOT, "WORLD/skeleton.json"), "utf8"));
const real = worldState.marks ?? [];

// Embodied marks are what the overlay draws, so they are what the copies must be.
// Predicates and namings ride along unchanged: cloning them would inflate the
// count without touching the path under test, which would be cheating the number.
const embodied = real.filter((m) => m?.at && Number.isFinite(m.at.x) && Number.isFinite(m.at.y));
const others = real.filter((m) => !embodied.includes(m));

// A LATTICE, NOT A PILE. Copies are spread on a grid wide enough that the clones
// do not all land inside one another — a 10× world where every extra mark shares
// one coordinate would exercise the fan and nothing else, and the fan is not what
// is being measured.
const RING_M = 3000;
const side = Math.ceil(Math.sqrt(MULT));
const clones = [];
for (let copy = 1; copy < MULT; copy += 1) {
  const gx = copy % side, gy = Math.floor(copy / side);
  const dx = (gx - (side - 1) / 2) * RING_M;
  const dy = (gy - (side - 1) / 2) * RING_M;
  for (const m of embodied) {
    clones.push({
      ...m,
      id: `perf-${copy}/${String(m.id ?? "mark").replace(/\//g, "-")}`,
      at: { x: m.at.x + dx, y: m.at.y + dy },
      ...(Array.isArray(m.points)
        ? { points: m.points.map((p) => (Array.isArray(p) ? [p[0] + dx, p[1] + dy] : p)) }
        : {}),
      // the clone is nobody's: a synthetic mark must never claim a resident's
      // authorship, or a screenshot of the fixture reads as a screenshot of them
      by: `perf-${copy}`,
      household: `perf-${copy}`,
      _fixture: true,
    });
  }
}

const out = { ...worldState, marks: [...real, ...clones], _fixture: { multiplier: MULT, generated: new Date().toISOString(), real: real.length, clones: clones.length } };
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "world-state.json"), JSON.stringify(out), "utf8");
writeFileSync(join(OUT, "skeleton.json"), JSON.stringify(skeleton), "utf8");
console.log(`fixture ×${MULT} → ${OUT}`);
console.log(`  real marks   : ${real.length} (${embodied.length} embodied)`);
console.log(`  clones added : ${clones.length}`);
console.log(`  total marks  : ${out.marks.length}`);
