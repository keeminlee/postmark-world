// reached-grants.test.mjs — the three channels, asserted against the record.
//
// Sibling of ruled-grants.test.mjs, and written in its discipline: every
// assertion carries the VERBATIM law sentence it asserts, so a reader who
// disagrees with the test is disagreeing with a quotable clause and not with
// my paraphrase of one. A brief is lossy; the gated document is not.
//
// WHAT THIS GUARDS. LOGOS/classes.md § Class-nodes has said since 2026-08-15:
//
//   "The resident class carries every resident's standing capabilities,
//    world-wide by its own ambient declaration; a ground's class may grant
//    more to those it reaches."
//
// That second clause stood for eleven days with ZERO live instances. The parcel
// grant below is the first, and a clause with exactly one instance is a clause
// one careless sweep away from having none again — which is the failure
// ruled-grants.test.mjs was written for after sweep 914ddc26 silently widened
// `say for: berth`. Same class of accident, same kind of guard.
//
// These tests read MARK FILES, never the store. The record is the law; a store
// is a projection of it, and a falsifier that reads the projection cannot tell
// you the law changed — only that the copy did.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const WORKS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works";

const read = (rel) => readFileSync(join(here, "..", rel), "utf8");
const field = (rel, name) => {
  const line = read(rel).split("\n").find((l) => l.startsWith(`${name}:`));
  assert.ok(line, `${rel} carries a ${name}: line`);
  return JSON.parse(line.slice(name.length + 1).trim());
};
const scalar = (rel, name) => {
  const line = read(rel).split("\n").find((l) => l.startsWith(`${name}:`));
  return line ? line.slice(name.length + 1).trim() : null;
};

const HUMAN = `${WORKS}/postmark-node/entity/human/mark.md`;
const PARCEL = `${WORKS}/postmark-node/mark/parcel/mark.md`;
const PORTAL = `${WORKS}/postmark-node/mark/portal-ground/mark.md`;
const HELD_SLOT = `${WORKS}/postmark-node/mark/thing/held-grant-slot/mark.md`;
const VERB = (v) => `${WORKS}/postmark-edge/${v}/mark.md`;

// ── channel 1 · ambient, unchanged ──────────────────────────────────────────

test("the human's ambient roster is STILL one grant — the fence moved onto the household's ground, not off it", () => {
  // LOGOS/classes.md § The human class, verbatim:
  //   "The one-grant fence IS the scope fence: everything further waits for
  //    the humans-as-residents design, and arrives — if it arrives — as law
  //    here first."
  // The parcel grant is that arrival. It lands on the PARCEL class, so the
  // human class's own ambient roster must be untouched: a human off their own
  // ground is a voice through their resident, exactly as before. This test
  // fails if a later hand "tidies" the new grants onto the human class, which
  // would make them ambient and hand every human a walk everywhere.
  const actions = field(HUMAN, "actions");
  assert.equal(actions.length, 1,
    "the human class grants exactly one action ambiently — walk arrives from the GROUND, never from the actor");
  assert.equal(actions[0].action, "say");
  assert.equal(actions[0].for, "human",
    "an absent for: reads as RESIDENT under LOGOS — this widening is exactly what the sweep must refuse");
});

test("the human carries the resident's own stride, 60 km/crossing", () => {
  // LOGOS/classes.md § The human class (2026-08-26 proposal), verbatim:
  //   "the human class gains a pace dial (60 km/crossing, the resident's own
  //    stride — a person's walk is a person's walk)"
  // The number is the one ruled for the resident at decision 008b and guarded
  // in ruled-grants.test.mjs. Two classes, ONE number, and this asserts they
  // agree rather than asserting the literal twice.
  const resident = field(`${WORKS}/postmark-node/entity/resident/mark.md`, "dials");
  const human = field(HUMAN, "dials");
  assert.equal(human.pace_km_per_crossing, 60);
  assert.equal(human.pace_km_per_crossing, resident.pace_km_per_crossing,
    "a person's walk is a person's walk — an embodied human moves at the resident stride, and the two dials are one ruling");
});

// ── channel 2 · ground-granted, and the relation scope ──────────────────────

test("the parcel class grants walk and say to the ground's OWN household's human", () => {
  // LOGOS/classes.md § Class-nodes, verbatim:
  //   "a ground's class may grant more to those it reaches"
  // and § The three channels, verbatim:
  //   "the grant reaches only an actor whose own household is the household
  //    of the ground granting it. A guest's human standing on the same parcel
  //    receives nothing, and that is the point."
  const actions = field(PARCEL, "actions");
  assert.deepEqual(actions.map((a) => a.action).sort(), ["say", "walk"],
    "the parcel's roster is exactly walk and say — the embodiment is deliberately two verbs wide");
  for (const a of actions) {
    assert.equal(a.for, "human", `${a.action} on the parcel is granted to the human kind`);
    assert.equal(a.scope, "own-ground",
      `${a.action} is relation-scoped: a guest's human on this ground receives nothing`);
    assert.ok(a.residue, `${a.action} names its residue — the door quotes the residue's own mark`);
  }
});

test("no grant anywhere is scoped without naming the kind it is for", () => {
  // LOGOS/classes.md § The three channels, verbatim:
  //   "A grant names who it is for, and may name a relation."
  // `scope:` is an ADDITION to `for:`, never a substitute. A scoped entry with
  // no `for:` reads as RESIDENT under the absent-for law, which would silently
  // hand a relation-scoped verb to the class the law makes the default — the
  // widening ruled-grants.test.mjs exists to refuse, arriving through a new key.
  // Swept over every class mark in the works, not only the ones this lane wrote.
  const roots = markFiles();
  let scoped = 0;
  for (const rel of roots) {
    const text = readFileSync(rel, "utf8");
    const line = text.split("\n").find((l) => l.startsWith("actions:"));
    if (!line) continue;
    for (const a of JSON.parse(line.slice("actions:".length).trim())) {
      if (a.scope == null) continue;
      scoped += 1;
      assert.ok(a.for, `${rel}: "${a.action}" carries scope: ${a.scope} with no for: — an absent for: reads as RESIDENT`);
    }
  }
  assert.ok(scoped > 0, "the sweep found at least one scoped grant — a guard that inspects nothing passes vacuously");
});

// ── channel 3 · held ────────────────────────────────────────────────────────

test("the held-grant slot is unsealed and in the town's own custody", () => {
  // LOGOS/classes.md § The two constitutionalities, verbatim:
  //   "sealed is CLASS-GOVERNED, unsealed is INSTANCE-GOVERNED — the axis is
  //    where the value lives, never rank"
  // and § The three channels, verbatim:
  //   "only a thing whose `by:` is the town's own pen may carry a held grant"
  // Unsealed is what lets one weapon differ from another; constitutional
  // custody on the VALUES is what stops a resident hanging a verb on a pocket.
  // Both halves, or the channel is a capability-escalation door.
  assert.equal(scalar(HELD_SLOT, "slot"), "held-grant");
  assert.equal(scalar(HELD_SLOT, "value"), "unsealed",
    "each object fills its own — the class speaks the grammar, never the value");
  assert.equal(scalar(HELD_SLOT, "values-tier"), "constitution",
    "scope and custody compose: unsealed + constitutional custody is the town's pen and nobody else's");
});

// ── the portal ground ───────────────────────────────────────────────────────

test("the portal ground's roster names BOTH actor kinds for every verb it grants", () => {
  // LOGOS/classes.md § The portal ground, verbatim:
  //   "The verbs carry `for: human` entries beside the resident ones, so a
  //    guest's human plays inside the portal without any claim outside it.
  //    These are class-scoped, never `scope: own-ground` — a portal's whole
  //    nature is that it grants to visitors."
  const actions = field(PORTAL, "actions");
  const verbs = ["cast", "guard", "loot", "strike"];
  for (const v of verbs) {
    const entries = actions.filter((a) => a.action === v);
    assert.equal(entries.length, 2, `${v} is granted to two kinds`);
    const kinds = entries.map((a) => a.for ?? "resident").sort();
    assert.deepEqual(kinds, ["human", "resident"],
      `${v} reaches a resident and a guest's human — an absent for: IS the resident entry`);
    for (const e of entries)
      assert.equal(e.scope, undefined,
        `${v} is class-scoped: a portal grants to VISITORS, so own-ground would empty the room`);
  }
  assert.deepEqual([...new Set(actions.map((a) => a.action))].sort(), verbs,
    "the roster is exactly these four — a fifth verb is a law change, not a tidy");
});

test("every portal verb is fenced to the portal by a guard in gate position", () => {
  // LOGOS/classes.md § The derived, verbatim:
  //   "Guards are deriveds in gate position: a verb or slot may name a derived
  //    and a required value as its precondition — that is the whole condition
  //    grammar"
  // and § The portal ground, verbatim:
  //   "So a held grant carried out of the portal opens nothing: the channel is
  //    location-independent, and the verb's own precondition is not."
  // THIS IS THE TEST THAT KEEPS THE WORLD OUTSIDE UNCHANGED. Without it, a
  // weapon carried home from the party grants `strike` on the quay.
  for (const v of ["strike", "guard", "cast", "loot"]) {
    const req = field(VERB(v), "requires");
    assert.equal(req.within_class, "portal-ground",
      `${v} cannot be performed outside a portal ground, whichever channel opened it`);
  }
});

test("loot is additionally fenced to a spent encounter, and it is the only one that is", () => {
  // LOGOS/classes.md § The portal ground, verbatim:
  //   "Whatever a portal ground's encounter is made of — how much of it is
  //    left, who may act again yet, what phase it has reached — is derived
  //    from that ground's own rows in the log."
  // The phase guard is a derived in gate position over that fold. Fencing the
  // fighting verbs on phase too would make the room unfightable; fencing loot
  // is what makes the reward a consequence rather than a decoration.
  assert.equal(field(VERB("loot"), "requires").phase, "spent");
  for (const v of ["strike", "guard", "cast"])
    assert.equal(field(VERB(v), "requires").phase, undefined,
      `${v} carries no phase guard — you may swing at a boss that is still standing`);
});

test("every portal verb carries its own cooldown dial, and nothing carries a turn order", () => {
  // LOGOS/classes.md § The portal ground, verbatim:
  //   "Turn order would be a second clock; a cooldown is the one the town
  //    already has."
  for (const v of ["strike", "guard", "cast", "loot"]) {
    const dials = field(VERB(v), "dials");
    assert.ok("cooldown_seconds" in dials, `${v} paces itself with a cooldown`);
    assert.ok(Number.isFinite(dials.cooldown_seconds) && dials.cooldown_seconds >= 0);
    assert.equal(dials.turn_order, undefined, `${v} declares no turn order — the free-for-all is the design`);
  }
});

test("the fighting verbs' damage lives on the record, and no two of them agree by accident", () => {
  // LOGOS/classes.md, atom 8, verbatim:
  //   "The evaluation is deterministic and discretion-free — no favorites are
  //    expressible, because the function has no input where one could go."
  // Fixed damage on the class is what makes that true of a fight. A verb whose
  // damage is not on the record has its number somewhere the town cannot amend.
  const strike = field(VERB("strike"), "dials");
  const cast = field(VERB("cast"), "dials");
  assert.ok(Number.isInteger(strike.damage) && strike.damage > 0, "strike's damage is a whole number on the record");
  assert.ok(Number.isInteger(cast.damage) && cast.damage > 0, "cast's damage is a whole number on the record");
  assert.ok(cast.damage > strike.damage,
    "cast costs a longer cooldown and buys more — if it did not, nobody would ever spend it");
  assert.equal(field(VERB("guard"), "dials").halves_next_hit, true,
    "guard's effect is a dial, not a hardcode — the town can amend what bravery is worth");
});

// ── the sweep's own reader ──────────────────────────────────────────────────
//
// Deliberately last and deliberately small: a directory walk of the works, so
// the scope check above inspects the whole registry rather than the list this
// file happens to know about. A guard that only checks its author's own marks
// is a guard against nothing.

import { readdirSync, statSync } from "node:fs";
function markFiles(dir = join(here, "..", WORKS), out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) markFiles(p, out);
    else if (name === "mark.md") out.push(p);
  }
  return out;
}
