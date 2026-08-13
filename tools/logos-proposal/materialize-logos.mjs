// materialize-logos.mjs — turn logos-spec.mjs into a lawful fixture tree and
// gate it with the REAL mark-lint. The fixture is a throwaway: regenerable,
// never truth. Usage: node materialize-logos.mjs <real-world-repo> <fixture-dir>
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DOCS, DATE, BY } from "./logos-spec.mjs";

const [REAL, FIX] = process.argv.slice(2);
if (!REAL || !FIX) { console.error("usage: node materialize-logos.mjs <real-repo> <fixture-dir>"); process.exit(2); }

// ── spec checks: one claim per body (≤150), leaves unique tree-wide ──────────
const problems = [];
const leaves = new Map();
const checkNode = (n, path) => {
  if (!n.body || n.body.length > 150) problems.push(`BODY ${n.body ? n.body.length : 0} chars @ ${path}/${n.leaf}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n.leaf)) problems.push(`SLUG ${n.leaf} @ ${path}`);
  if (leaves.has(n.leaf)) problems.push(`DUP LEAF ${n.leaf}: ${leaves.get(n.leaf)} vs ${path}`);
  leaves.set(n.leaf, path);
};
for (const d of DOCS) { checkNode(d, "logos"); for (const s of d.sections) { checkNode(s, d.leaf); for (const c of s.claims) checkNode(c, `${d.leaf}/${s.leaf}`); } }
if (problems.length) { console.error("SPEC PROBLEMS:\n" + problems.join("\n")); process.exit(1); }

// ── fixture skeleton: real root + real the-record, then the graft ────────────
rmSync(FIX, { recursive: true, force: true });
const marks = join(FIX, "WORLD", "marks", "let-there-be-light");
mkdirSync(join(marks, "the-record"), { recursive: true });
cpSync(join(REAL, "WORLD/marks/let-there-be-light/mark.md"), join(marks, "mark.md"));
cpSync(join(REAL, "WORLD/marks/let-there-be-light/the-record/mark.md"), join(marks, "the-record", "mark.md"));

const markFile = (n, sourceDoc) => `---
kind: predicated
by: ${BY}
date: ${DATE}
slot: ${n.leaf}
value: ${n.value}
source: LOGOS/${sourceDoc}
---

${n.body}
`;

let count = 0;
for (const d of DOCS) {
  const dDir = join(marks, "the-record", d.leaf);
  mkdirSync(dDir, { recursive: true });
  writeFileSync(join(dDir, "mark.md"), markFile(d, d.file)); count++;
  for (const s of d.sections) {
    const sDir = join(dDir, s.leaf);
    mkdirSync(sDir, { recursive: true });
    writeFileSync(join(sDir, "mark.md"), markFile(s, d.file)); count++;
    for (const c of s.claims) {
      const cDir = join(sDir, c.leaf);
      mkdirSync(cDir, { recursive: true });
      writeFileSync(join(cDir, "mark.md"), markFile(c, d.file)); count++;
    }
  }
}

// ── fixture LOGOS: real docs, Rendered lines updated to name the new ids ─────
// (What a real merge would also do — the fidelity law's own requirement that
// the document knows its renderings. "not yet" lines are superseded here.)
mkdirSync(join(FIX, "LOGOS"), { recursive: true });
const idsByFile = new Map(DOCS.map((d) => [d.file, [
  `${BY}/${d.leaf}`,
  ...d.sections.flatMap((s) => [`${BY}/${s.leaf}`, ...s.claims.map((c) => `${BY}/${c.leaf}`)]),
]]));
for (const f of readdirSync(join(REAL, "LOGOS")).filter((x) => x.endsWith(".md"))) {
  let text = readFileSync(join(REAL, "LOGOS", f), "utf8");
  if (idsByFile.has(f)) {
    // Strip every Rendered span whole (they wrap until a sentence-ending period,
    // the lint's own span rule) — the end-state doc names the NEW renderings.
    const lines = text.split(/\r?\n/);
    const kept = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^Rendered in the world\b/.test(lines[i])) {
        while (i < lines.length && !/\.\s*$/.test(lines[i]) && lines[i + 1]?.trim() !== "") i++;
        continue;
      }
      kept.push(lines[i]);
    }
    text = kept.join("\n") + `\n\nRendered in the world as ${idsByFile.get(f).map((i) => `\`${i}\``).join(", ")}.\n`;
  }
  writeFileSync(join(FIX, "LOGOS", f), text);
}

console.log(`materialized ${count} marks under the-record in ${FIX}`);

// ── the gate: the REAL lint, no substitutes ──────────────────────────────────
try {
  const out = execFileSync("node", [join(REAL, "tools/mark-lint.mjs"),
    "--repo", FIX,
    "--marks-dir", join(FIX, "WORLD/marks"),
    "--terrain", join(REAL, "WORLD/skeleton.json"),
    "--households", join(REAL, "WORLD/households.json"),
  ], { encoding: "utf8" });
  console.log(out.trim().split("\n").slice(-3).join("\n"));
} catch (e) {
  console.error("LINT REFUSED:\n" + String(e.stdout ?? "").split("\n").slice(0, 25).join("\n"));
  process.exit(1);
}
