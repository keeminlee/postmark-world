#!/usr/bin/env node
// lane-wall.mjs — the authorship wall for the PR lane (WRITES.md).
//
// At the office door, identity is enforced by construction: the server derives
// `by` from your credential and you cannot express another household's name. A
// pull request can express anything — so this wall validates what the door made
// impossible. It answers ONE question: is every change in this diff the PR
// author's to make?
//
//   node tools/lane-wall.mjs --author-id 67605380 --author-login keeminlee \
//        --base <ref> --head <ref> [--repo <dir>] [--marks-dir <composed>] [--json]
//
// Checks, in order (each refusal names the fix — the gate teaches):
//   1. PATHS — every changed file is a mark record (WORLD/marks/**/mark.md) or
//      the author's own note (NOTES/<handle>.md). Nothing else rides this lane.
//   2. HANDLES — every `by:` on an added/changed mark, every NOTES filename, and
//      every DELETED mark's author resolve, via WORLD/households.json (read from
//      the BASE ref — the trusted side), to the PR author's own household:
//      `gh:<author-id>` or `login:<author-login>`. A handle the registry does
//      not know is refused — the lane's identity model IS the registry (the
//      office door remains open to unregistered handles; registry refresh is
//      world-households-export on pin churn).
//   3. PLACEMENT — every added sited/parcel mark sits exactly where
//      `placementParent` derives from its geometry (the same function the door,
//      the fold, and the lint use); predicated/naming sit in their parent's
//      directory. The refusal prints the correct path.
//   4. NOTES — one file, your handle, ≤2000 characters (the world_note cap).
//
// Exit 0 with a one-line verdict (or {ok:true} with --json); exit 1 with the
// violations otherwise. Read-only. Run it locally before opening the PR and the
// gate has nothing left to say.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMarks, parseRecord, placementParent } from "./marks-fold.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const REPO = opt("--repo", join(HERE, ".."));
const BASE = opt("--base");
const HEAD = opt("--head");
const AUTHOR_ID = opt("--author-id");
const AUTHOR_LOGIN = (opt("--author-login") ?? "").toLowerCase();
const MARKS_DIR = opt("--marks-dir", join(REPO, "WORLD", "marks"));
const JSON_OUT = args.includes("--json");

if (!BASE || !HEAD || !AUTHOR_ID)
  { console.error("usage: lane-wall.mjs --author-id <id> --author-login <login> --base <ref> --head <ref>"); process.exit(2); }

const git = (a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8" });
const showAt = (ref, path) => git(["show", `${ref}:${path.replace(/\\/g, "/")}`]);

// The registry, from the trusted side — never the head. Default: the BASE ref.
// CI passes --registry <file> pointing at MAIN's copy instead: a sketchbook is
// only as fresh as its last crossing, and identity should not age with it.
// (The path law below refuses any head-side registry edit regardless.)
let registry = {};
let logins = {};
try {
  const regPath = opt("--registry");
  const r = JSON.parse(regPath ? readFileSync(regPath, "utf8") : showAt(BASE, "WORLD/households.json"));
  registry = r.households ?? {};
  logins = r.logins ?? {};
} catch { /* no registry → every handle is unverifiable and will refuse below */ }

const myKeys = new Set([`gh:${AUTHOR_ID}`, ...(AUTHOR_LOGIN ? [`login:${AUTHOR_LOGIN}`] : [])]);
const mine = (handle) => myKeys.has(registry[handle] ?? "");
const myHandles = Object.keys(registry).filter(mine).sort();

const violations = [];
const refuse = (path, defect, hint) => violations.push({ path, defect, hint });

// 0 — the sketchbook is the author's own. --base-branch draft/<x> binds the
// branch name through the registry's logins map to a household; a PR into a
// sketchbook the registry says is someone else's is refused before anything
// else is read. (A branch the registry cannot bind is refused too: the lane
// only writes into sketchbooks it can attribute.)
const baseBranch = opt("--base-branch");
if (baseBranch) {
  if (!/^draft\//.test(baseBranch)) {
    refuse(baseBranch, "the lane lands only in draft/<household> sketchbooks",
      "open the PR against draft/<your-github-login> (main is settlement's pen)");
  } else {
    const bound = logins[baseBranch.slice("draft/".length).toLowerCase()] ?? null;
    if (!bound) refuse(baseBranch, "this sketchbook is not in the registry",
      "the logins map in WORLD/households.json binds branch names to households; it refreshes from the town pins");
    else if (!myKeys.has(bound)) refuse(baseBranch, "this sketchbook is not yours",
      `${baseBranch} belongs to ${bound}; yours is draft/${AUTHOR_LOGIN || "<your-github-login>"}`);
  }
}

// merge-base diff: what the PR actually introduces
const mergeBase = git(["merge-base", BASE, HEAD]).trim();
const rows = git(["diff", "--name-status", "-z", mergeBase, HEAD]).split("\0").filter(Boolean);
const changes = [];
for (let i = 0; i < rows.length; i += 2) {
  const status = rows[i]?.[0]; const path = rows[i + 1];
  if (status === "R" || status === "C") { // -z renames carry two paths
    changes.push({ status, path: rows[i + 2] }); i += 1;
  } else if (path) changes.push({ status, path });
}

const MARK_RE = /^WORLD\/marks\/.+\/mark\.md$/;
const NOTE_RE = /^NOTES\/([a-z0-9-]+)\.md$/;

for (const { status, path } of changes) {
  // 1 — the path law
  const markPath = MARK_RE.test(path);
  const notePath = NOTE_RE.exec(path);
  if (!markPath && !notePath) {
    refuse(path, "this lane carries mark records and your own notes only",
      "WORLD/marks/**/mark.md or NOTES/<your-handle>.md — anything else (tools, canon, others' files) goes to an ordinary PR for human review");
    continue;
  }
  if (status === "R" || status === "C") {
    refuse(path, "the lane does not move or copy records", "add and delete are the lane's verbs; a move is a delete plus an add, each judged on its own");
    continue;
  }

  if (notePath) {
    // 4 — notes law
    const handle = notePath[1];
    if (status !== "D") {
      if (!mine(handle)) refuse(path, `"${handle}" is not one of your residents`,
        myHandles.length ? `your registered handles: ${myHandles.join(", ")}` : `no handles are registered to gh:${AUTHOR_ID} — the registry (WORLD/households.json) refreshes from the town pins; the office door works meanwhile`);
      const body = showAt(HEAD, path);
      const chars = [...body.trim()].length;
      if (chars > 2000) refuse(path, `the note is ${chars} chars; the cap is 2000`, "one note to your returning self — a new note replaces the old");
    } else if (!mine(handle)) {
      refuse(path, `"${handle}" is not one of your residents`, "you may only remove your own note");
    }
    continue;
  }

  // 2 — handles law, both directions of the diff
  const ref = status === "D" ? mergeBase : HEAD;
  let record;
  try { record = parseRecord(showAt(ref, path), path); }
  catch (e) { refuse(path, "the record does not parse", String(e?.message ?? e).slice(0, 160)); continue; }
  const by = record.by;
  if (!by || !mine(by)) {
    refuse(path, status === "D"
      ? `"${by ?? "?"}" is not yours to erase`
      : `"${by ?? "(no by:)"}" is not one of your residents`,
      myHandles.length ? `your registered handles: ${myHandles.join(", ")}` : `no handles are registered to gh:${AUTHOR_ID} yet — the registry refreshes from the town pins; the office door works meanwhile`);
  }
}

// 3 — placement law, against the composed head tree
const placeable = changes.filter((c) => c.status !== "D" && MARK_RE.test(c.path));
if (placeable.length && violations.length === 0) {
  const marks = loadMarks(MARKS_DIR);
  const byId = new Map(marks.map((m) => [m.id, m]));
  // keys are diff-shaped ("WORLD/marks/…"), derived from the marks ROOT — so a
  // --marks-dir outside the repo (CI's composed worktree) keys identically
  const dirKey = (d) => `WORLD/marks/${relative(MARKS_DIR, d).replace(/\\/g, "/")}`.replace(/\/$/, "");
  const byDir = new Map(marks.map((m) => [dirKey(m._dir), m]));
  for (const { path } of placeable) {
    const dir = path.slice(0, -"/mark.md".length);
    const mark = byDir.get(dir);
    if (!mark) { refuse(path, "the record is not in the composed tree", "is the file named mark.md, in its own directory?"); continue; }
    const parentDir = dirname(dir).replace(/\\/g, "/");
    const parentMark = byDir.get(parentDir) ?? null;
    let rightParent;
    if (mark.kind === "sited" || mark.kind === "parcel") {
      rightParent = placementParent(mark, marks.filter((m) => m.id !== mark.id));
    } else {
      rightParent = mark.parent_id ?? parentMark?.id ?? null;
      if (parentMark && !["sited", "parcel"].includes(parentMark.kind))
        refuse(path, `"${parentMark.id}" cannot hold a description`, "only sited/parcel marks carry predicated/naming children");
    }
    const actualParent = parentMark?.id ?? null;
    if ((rightParent ?? null) !== actualParent) {
      const wantDir = rightParent && byId.get(rightParent)?._dir
        ? dirKey(byId.get(rightParent)._dir)
        : "WORLD/marks/let-there-be-light";
      refuse(path, `geometry files this mark under ${rightParent ?? "the open ground"}, not ${actualParent ?? "the root"}`,
        `its record belongs at: ${wantDir}/${dir.split("/").pop()}/mark.md — tools/place-mark.mjs answers this before the gate has to`);
    }
  }
}

if (JSON_OUT) console.log(JSON.stringify(violations.length ? { ok: false, violations } : { ok: true, changes: changes.length, handles: myHandles }));
else if (violations.length) {
  for (const v of violations) console.error(`refused: ${v.path}\n  ${v.defect}\n  ${v.hint}`);
} else console.log(`lane-wall: ${changes.length} change(s), all yours (${myHandles.join(", ")})`);
process.exit(violations.length ? 1 : 0);
