// reparent-keep-world.mjs — THE REPARENT VERB.
// POS-102 · postmark#2865 · founder-ruled 2026-09-16 ("let's do that and delay
// the retirement of marks to w39 release"; "the class fixes goes on w39 train").
//
// A mark's file numbers are written RELATIVE to the frame that binds it (SCHEMA
// v3 § The frame; the tier binding, 2026-08-11), and the frame is found by the
// tree around the file. So a STRUCTURAL edit — a frame's record leaving canon on
// the return, or coming back when it is staked again — changes what a standing
// mark's numbers compose to without anyone writing a number. The 05:45Z crossing
// of 2026-09-16 caught twelve marks moving by up to a kilometre exactly that way
// (hal's whole house, ryuu-kurogane's and noe's houses, rei's thyme gift), and
// world PR #79 stopped the bleeding by KEEPING a frame with standing children.
// That was a gate. This is the verb the scene graph was missing:
//
//     A STRUCTURAL EDIT NEVER MOVES ANYTHING.
//
// `reparentKeepWorld(child, frame)` — the child's WORLD position, re-expressed as
// file numbers against the frame it has now. The loader's own arithmetic run
// backwards (worldToFile / fileToWorld, the same pair coords-equivalence.mjs
// proved the v2→v3 migration with), checked exactly in doubles and REFUSED rather
// than rounded when a pair does not survive — moving a mark by 1e-14 m to make
// the sum come out is still moving it.
//
// `keepWorldAcross(marksDir, before)` — the tree-level pass. Load the tree after
// the edit; every standing record whose FRAME is now a different mark than it was
// gets its numbers rewritten so it composes to the position it held; then the
// tree is reloaded and the invariant read back off it. Two directions, one verb:
// a frame leaving hands its children to the next frame up (grandchildren compose
// against their own parents and follow for free); a frame returning takes them
// back. Relative storage stays the normal form — it is not the defect; the
// missing invariant was.
//
// Not this: absolute-for-everything (two storage semantics side by side) —
// considered 2026-09-16 and set aside for the scene-graph shape.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMarks, worldToFile, fileToWorld, ringToFile, ringToWorld } from "./marks-fold.mjs";

/** The verb's one refusal: it names the record(s) and never writes past them. */
export class ReframeRefusal extends Error {
  constructor(message, refused = []) {
    super(message);
    this.name = "ReframeRefusal";
    this.refused = refused;
  }
}

const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
const ringKey = (r) => (Array.isArray(r) && r.length
  ? JSON.stringify(r.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y])))
  : null);
const fileOf = (rec) => join(rec._dir, "mark.md").replace(/\\/g, "/");

/**
 * The world as it stands — every readable record's composed world position, its
 * ring, the numbers its file actually says, and WHICH mark framed it. Taken
 * before a structural edit; handed to `keepWorldAcross` after.
 */
export function snapshotWorld(marksDir) {
  const before = new Map();
  for (const rec of loadMarks(marksDir)) {
    if (rec._error || before.has(rec.id)) continue;   // a duplicate id is the fold's error to report; first wins here, as in the loader
    before.set(rec.id, {
      id: rec.id,
      at: rec.at && Number.isFinite(rec.at.x) && Number.isFinite(rec.at.y) ? { x: rec.at.x, y: rec.at.y } : null,
      points: Array.isArray(rec.points) && rec.points.length ? rec.points : null,
      fileAt: rec._fileAt ? { x: rec._fileAt.x, y: rec._fileAt.y } : null,
      frame: rec._frameId ?? null,
      file: fileOf(rec),
    });
  }
  return before;
}

/**
 * reparentKeepWorld(child, frame) — the verb itself.
 *   child: { id, at: {x,y} (WORLD), points: ring (WORLD) | null }
 *   frame: { x, y } — the centre the child's numbers are to be written against
 * Returns the FILE numbers { at, points } that compose back to exactly the world
 * position given, or throws ReframeRefusal naming the child.
 */
export function reparentKeepWorld(child, frame) {
  if (!child?.at) throw new ReframeRefusal(`${child?.id ?? "?"}: carries no position — nothing to re-express`, [{ id: child?.id ?? null }]);
  const origin = { x: frame?.x ?? 0, y: frame?.y ?? 0 };
  const at = worldToFile(child.at, origin);
  if (!same(fileToWorld(at, origin), child.at)) {
    throw new ReframeRefusal(
      `${child.id}: ${child.at.x},${child.at.y} does not survive re-framing on ${origin.x},${origin.y} in doubles — refusing to move a mark by rounding`,
      [{ id: child.id }],
    );
  }
  let points = null;
  if (Array.isArray(child.points) && child.points.length) {
    points = ringToFile(child.points, origin);
    if (ringKey(ringToWorld(points, origin)) !== ringKey(child.points)) {
      throw new ReframeRefusal(
        `${child.id}: its points ring does not survive re-framing on ${origin.x},${origin.y} in doubles — refusing to move a ring by rounding`,
        [{ id: child.id }],
      );
    }
  }
  return { at, points };
}

// ── the file ─────────────────────────────────────────────────────────────────
// Only the frontmatter's `at:` line (and `points:` when a ring rides along) is
// rewritten; the body, the other fields and the line endings are left as the
// author wrote them. The spellings are the ones parseRecord reads back — the bare
// `{ x: N, y: N }` and the SVG-style ring — and a number that would need exponent
// notation to spell is refused, because `-?[\d.]+` would not read it back.

const num = (n) => {
  const s = String(n);
  if (/e/i.test(s)) throw new ReframeRefusal(`${s} would need exponent notation, which the record's own parser does not read`);
  return s;
};
const ringText = (ring) => ring.map((p) => (Array.isArray(p) ? `${num(p[0])},${num(p[1])}` : `${num(p.x)},${num(p.y)}`)).join(" ");
const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/;

export function rewriteNumbers(text, { at, points }, id = "?") {
  const m = text.match(FRONTMATTER_RE);
  if (!m) throw new ReframeRefusal(`${id}: no frontmatter block to rewrite`, [{ id }]);
  let fm = m[2];
  if (!/^at: .*$/m.test(fm)) throw new ReframeRefusal(`${id}: carries a position but has no "at:" line to rewrite`, [{ id }]);
  fm = fm.replace(/^at: .*$/m, `at: { x: ${num(at.x)}, y: ${num(at.y)} }`);
  if (points) {
    if (!/^points: .*$/m.test(fm)) throw new ReframeRefusal(`${id}: carries a ring but has no "points:" line to rewrite`, [{ id }]);
    fm = fm.replace(/^points: .*$/m, `points: ${ringText(points)}`);
  }
  return text.slice(0, m[1].length) + fm + text.slice(m[1].length + m[2].length);
}

/**
 * keepWorldAcross(marksDir, before, { skip }) — the pass.
 *
 * `before` is `snapshotWorld` taken before the edit. `skip` is the set of
 * mark.md paths the edit itself wrote (a published record's numbers are its
 * author's word and are never second-guessed here).
 *
 * Rounds, not one sweep: a child is written against its new frame only once that
 * frame's own centre is settled (where it was, or authored by the edit), so a
 * frame that is itself being re-expressed never lends a half-repaired centre to
 * its children. Each round settles one level; the tree's depth bounds it.
 *
 * Returns the receipt — one row per rewritten record, naming the frame it left
 * and the frame it has now — or throws ReframeRefusal, having written nothing
 * for the record it names (a refusal in a later round leaves earlier rounds'
 * exact rewrites standing; they are exact, and the caller's tree is scratch
 * until it commits).
 */
export function keepWorldAcross(marksDir, before, { skip = new Set(), maxRounds = 16 } = {}) {
  const skipFiles = new Set([...skip].map((p) => String(p).replace(/\\/g, "/")));
  const skipped = (rec) => skipFiles.has(fileOf(rec));
  const displaced = (rec, was) => !same(rec.at, was.at) || ringKey(rec.points) !== ringKey(was.points);
  const moved = new Map();

  for (let round = 1; ; round++) {
    const after = loadMarks(marksDir).filter((m) => !m._error);
    const byId = new Map();
    for (const rec of after) if (!byId.has(rec.id)) byId.set(rec.id, rec);
    // A frame is SETTLED when its own centre is where it was, or the edit wrote
    // it (authored), or it is new to the tree. Only then may a child be written
    // against it.
    const settled = (rec) => {
      const f = rec._frameId ? byId.get(rec._frameId) : null;
      if (!f || skipped(f)) return true;
      const w = before.get(f.id);
      return !w || !w.at || same(f.at, w.at);
    };

    const plan = [];
    for (const rec of after) {
      const was = before.get(rec.id);
      if (!was || !was.at || !rec._fileAt || skipped(rec)) continue;
      if ((rec._frameId ?? null) === was.frame) continue;   // the same mark frames it: if it composes elsewhere just now, that frame is mid-repair or its author moved it — the v3 law, not this verb's business
      if (!displaced(rec, was)) continue;                    // a different frame at the same centre — the numbers already say the right place
      if (!settled(rec)) continue;                           // its new frame is itself mid-repair — next round
      plan.push({ rec, was });
    }
    if (!plan.length) break;
    if (round > maxRounds) {
      throw new ReframeRefusal(`the re-framing did not settle in ${maxRounds} rounds — ${plan.map((p) => p.rec.id).join(", ")} still move`,
        plan.map((p) => ({ id: p.rec.id, file: fileOf(p.rec) })));
    }

    const refused = [], writes = [];
    for (const { rec, was } of plan) {
      try { writes.push({ rec, was, numbers: reparentKeepWorld(was, rec._origin) }); }
      catch (e) {
        if (!(e instanceof ReframeRefusal)) throw e;
        refused.push({ id: rec.id, file: fileOf(rec), frame_from: was.frame, frame_to: rec._frameId ?? null, reason: e.message });
      }
    }
    if (refused.length) {
      throw new ReframeRefusal(`${refused.length} standing mark(s) cannot keep their place exactly across this edit: ${refused.map((r) => r.id).join(", ")}`, refused);
    }
    for (const { rec, was, numbers } of writes) {
      const file = fileOf(rec);
      writeFileSync(file, rewriteNumbers(readFileSync(file, "utf8"), numbers, rec.id));
      moved.set(rec.id, {
        id: rec.id, file,
        frame_from: was.frame, frame_to: rec._frameId ?? null,
        at_from: was.fileAt, at_to: numbers.at,
        ring: numbers.points ? numbers.points.length : 0,
      });
    }
  }

  // THE PROOF — the invariant, read back off the tree rather than trusted from the
  // arithmetic above: every record that stood before and stands now, whose frame
  // is a different mark than it was, composes to exactly the position it held.
  // (A record whose frame is the SAME mark rides that frame wherever its author
  // put it — the v3 law — and is not this edit's doing.)
  const still = [];
  for (const rec of loadMarks(marksDir).filter((m) => !m._error)) {
    const was = before.get(rec.id);
    if (!was || !was.at || !rec.at || skipped(rec)) continue;
    if ((rec._frameId ?? null) === was.frame) continue;
    if (displaced(rec, was)) still.push({ id: rec.id, file: fileOf(rec), was: was.at, now: { x: rec.at.x, y: rec.at.y } });
  }
  if (still.length) {
    throw new ReframeRefusal(`the edit moved ${still.length} standing mark(s): ${still.slice(0, 5).map((d) => `${d.id} ${d.was.x},${d.was.y} -> ${d.now.x},${d.now.y}`).join("; ")}${still.length > 5 ? "; …" : ""}`, still);
  }
  return [...moved.values()];
}
