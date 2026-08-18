#!/usr/bin/env node
// fanup-ab.mjs — SANDBOX A/B falsifier for the conserved-flow fan-up
// (gold plan postmark-world-view-system § the sandbox round). Folds the real
// world twice at the same sha and stakes — fanup:legacy vs fanup:flow — and
// reports: conservation, redistribution movers, per-channel receipts, and the
// perception A/B from four named standpoints. Reads only; writes one report
// pair to --out. Never a production surface.
//
//   node tools/fanup-ab.mjs --stakes <derived.json> --out <dir>
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWorld } from "./world-poc.mjs";
import { openYourEyes } from "./world-verbs.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const STAKES = arg("--stakes", null);
const OUT = arg("--out", ".");
mkdirSync(OUT, { recursive: true });

const CROSSING = 37; // pinned: determinism over "now" — fog is crossing-seeded

console.error("folding legacy…");
const legacy = buildWorld({ crossing: CROSSING, stakesPath: STAKES, fanup: "legacy" });
console.error("folding flow…");
const flow = buildWorld({ crossing: CROSSING, stakesPath: STAKES, fanup: "flow" });

const wLeg = new Map(legacy.marks.map((m) => [m.id, m.weight ?? 0]));
const wFlow = new Map(flow.marks.map((m) => [m.id, m.weight ?? 0]));

// ── conservation ─────────────────────────────────────────────────────────────
const rec = flow.fanup;
// the true input is the stakes file itself (n + breadth = weight rows)
const stakes = JSON.parse(readFileSync(STAKES, "utf8"));
const stakedWeight = stakes.reduce((s, r) => s + (r.weight ?? r.n), 0);
const sinkSet = new Set(rec.sinks);
const sinkTotalFlow = [...wFlow.entries()].filter(([id]) => sinkSet.has(id)).reduce((s, [, w]) => s + w, 0)
  + Object.entries(legacy.terrain_weight ?? {}).length * 0; // terrain handled below
const terrainFlow = Object.values(flow.terrain_weight ?? {}).reduce((s, w) => s + w, 0);
const refusedTotal = rec.refused.reduce((s, r) => s + r.amount, 0);

// ── movers ───────────────────────────────────────────────────────────────────
const ids = new Set([...wLeg.keys(), ...wFlow.keys()]);
const movers = [...ids]
  .map((id) => ({ id, legacy: wLeg.get(id) ?? 0, flow: +(wFlow.get(id) ?? 0).toFixed(2), delta: +((wFlow.get(id) ?? 0) - (wLeg.get(id) ?? 0)).toFixed(2) }))
  .filter((m) => Math.abs(m.delta) > 0.005)
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

// ── perception A/B ───────────────────────────────────────────────────────────
const at = (world, id) => world.marks.find((m) => m.id === id)?.at;
const STANDPOINTS = [
  { name: "the lanternseed gardens", pos: at(legacy, "the-town/the-lanternseed-gardens") },
  { name: "the keeping works", pos: at(legacy, "the-town/the-keeping-works") },
  { name: "the town centre crossing (quay {0,0})", pos: { x: 0, y: 0 } },
  { name: "hal's green-lamp house", pos: at(legacy, "hal/the-green-lamp") },
].filter((s) => s.pos);

const carriedIds = (world, pos, budget = 12) => {
  const eyes = openYourEyes({ ...pos, name: "A/B probe" }, world, { crossing: CROSSING, budget });
  return eyes.fov.carried.map((m) => `${m.id}${m.clusteredCount ? ` (+${m.clusteredCount})` : ""} ✦${(wFlow.get(m.id) ?? 0).toFixed(1)}/${wLeg.get(m.id) ?? 0}`);
};
const attentionIds = (world, pos) => {
  const eyes = openYourEyes({ ...pos, name: "A/B probe" }, world, { crossing: CROSSING, budget: 1e9 });
  return eyes.fov.carried
    .slice()
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 12)
    .map((m) => `${m.id} ✦${(m.weight ?? 0).toFixed(1)}`);
};

const percept = STANDPOINTS.map((s) => ({
  standpoint: s.name, at: s.pos,
  scenery_legacy: carriedIds(legacy, s.pos),
  scenery_flow: carriedIds(flow, s.pos),
  attention_flow: attentionIds(flow, s.pos),
}));

// two tellings for the eyes, works standpoint
const worksPos = STANDPOINTS.find((s) => s.name.includes("keeping"))?.pos;
const tellLegacy = worksPos ? openYourEyes({ ...worksPos, name: "An operator in the Keeping Works" }, legacy, { crossing: CROSSING }).tell() : "";
const tellFlow = worksPos ? openYourEyes({ ...worksPos, name: "An operator in the Keeping Works" }, flow, { crossing: CROSSING }).tell() : "";

// ── channel receipts (spot) ──────────────────────────────────────────────────
const byChannel = {};
for (const f of rec.flows) { byChannel[f.channel] = (byChannel[f.channel] ?? 0) + f.amount; }
const instanceFlows = rec.flows.filter((f) => f.channel === "instance-of");

const report = {
  crossing: CROSSING,
  inputs: { stake_rows: stakes.length, raw_escrow: stakes.reduce((s, r) => s + r.n, 0), staked_weight: stakedWeight },
  declarations: rec.declarations,
  instance_edges: rec.instance_edges,
  conservation: {
    staked_weight_input: stakedWeight,
    sink_marks_total: +sinkTotalFlow.toFixed(2),
    terrain_total: +terrainFlow.toFixed(2),
    refused_total: +refusedTotal.toFixed(2),
    check: +(sinkTotalFlow + terrainFlow + refusedTotal).toFixed(2),
  },
  flow_by_channel: Object.fromEntries(Object.entries(byChannel).map(([k, v]) => [k, +v.toFixed(2)])),
  instance_flows: instanceFlows,
  refused: rec.refused,
  movers,
  perception: percept,
};
writeFileSync(join(OUT, "fanup-ab.json"), JSON.stringify(report, null, 2));

const md = [];
md.push(`# fan-up A/B — legacy vs conserved flow (sandbox, crossing ${CROSSING})`);
md.push(`\ninputs: ${stakes.length} stake rows · ${report.inputs.raw_escrow} raw escrow · ${stakedWeight} staked weight (incl. breadth)`);
md.push(`declarations found by the works gate: ${Object.keys(rec.declarations).length} · instance-of edges: ${rec.instance_edges}`);
md.push(`\n## conservation\nstaked-weight input ${stakedWeight} → sinks ${report.conservation.sink_marks_total} + terrain ${report.conservation.terrain_total} + refused-at-consent ${report.conservation.refused_total} = ${report.conservation.check}`);
md.push(`\n## flow by channel\n` + Object.entries(report.flow_by_channel).map(([k, v]) => `- ${k}: ${v}`).join("\n"));
md.push(`\n## instance-of flows (every one)\n` + (instanceFlows.length ? instanceFlows.map((f) => `- ${f.from} → ${f.to}: ${f.amount}`).join("\n") : "*(none — no staked instance carries a class)*"));
md.push(`\n## refused (consent stopped it)\n` + (rec.refused.length ? rec.refused.map((f) => `- ${f.from} ⇥ ${f.to} (${f.channel}): ${f.amount}`).join("\n") : "*(none)*"));
md.push(`\n## movers (|Δ| > 0.005)\n| mark | legacy | flow | Δ |\n|---|---|---|---|`);
for (const m of movers.slice(0, 40)) md.push(`| ${m.id} | ${m.legacy} | ${m.flow} | ${m.delta > 0 ? "+" : ""}${m.delta} |`);
for (const p of percept) {
  md.push(`\n## standpoint: ${p.standpoint} (${p.at.x},${p.at.y})`);
  md.push(`\n**scenery, legacy** (id ✦flow/legacy):\n` + p.scenery_legacy.map((x) => `- ${x}`).join("\n"));
  md.push(`\n**scenery, flow:**\n` + p.scenery_flow.map((x) => `- ${x}`).join("\n"));
  md.push(`\n**pure attention (flow weights):**\n` + p.attention_flow.map((x) => `- ${x}`).join("\n"));
}
md.push(`\n## the telling from the works — legacy\n\n\`\`\`\n${tellLegacy}\n\`\`\``);
md.push(`\n## the telling from the works — flow\n\n\`\`\`\n${tellFlow}\n\`\`\``);
writeFileSync(join(OUT, "fanup-ab.md"), md.join("\n"));
console.error(`wrote ${join(OUT, "fanup-ab.md")} and .json`);
