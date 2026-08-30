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
const ARENA = `${WORKS}/postmark-node/mark/portal-ground/arena/mark.md`;

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

test("the human's stride POINTS at the resident's — one number, one home", () => {
  // LOGOS/classes.md § The human class, as amended 2026-08-30, verbatim:
  //   "the pace dial POINTS, it does not restate … Both dead copies now name
  //    their owner — `the-town/resident` — in the record's own sentinel idiom,
  //    the way `held-grant-slot` and the adversary's dials say `unsealed`: the
  //    slot stays declared, so the law still says a human has a stride, and the
  //    VALUE has one home."
  //
  // This test used to assert `human.pace_km_per_crossing === 60` and then that
  // it equalled the resident's — which reads like a consistency check and is
  // not one: it PINNED a second copy of the number, so the copy could only be
  // removed by editing the test. Three nodes declared this stride and exactly
  // one was ever read (`departurePace` asks the-town/resident by name, office
  // src/world-classes.mjs:143-146). The assertion now is that the second copy
  // does not exist.
  const resident = field(`${WORKS}/postmark-node/entity/resident/mark.md`, "dials");
  const human = field(HUMAN, "dials");

  assert.equal(human.pace_km_per_crossing, "the-town/resident",
    "the human class declares the SLOT and names its owner — a literal here is a second copy of a number that has one home");
  assert.equal(typeof resident.pace_km_per_crossing, "number",
    "and the owner carries the value itself — the pointer must point at a declaration that actually declares");
  assert.ok(resident.pace_km_per_crossing > 0);

  // the pointer resolves: whatever the resident is ruled to, the human is that,
  // because there is nothing else for it to be.
  const slot = `${WORKS}/postmark-edge/depart/pace-slot/mark.md`;
  assert.equal(scalar(slot, "value"), "the-town/resident",
    "the third declaration points too — depart's own body already said 'The stride is the mover's, never this verb's'");
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
  // LOGOS/classes.md § The portal ground, verbatim (amended 2026-08-30):
  //   "Its roster names both kinds — for every verb it grants. ... (Interim
  //    state, 2026-08-30: the roster stands EMPTY — the arena retired with its
  //    boss (992a3338) and the combat verbs returned to the town's keeping ...
  //    The contract above is the law of any verb the roster carries, not a
  //    promise that it carries one; which verbs return ... is the portal
  //    sitting's to rule.)"
  //
  // ⚠ SUPERSEDED IN PLACE 2026-08-30 with that amendment. Before it, this
  // test pinned the dungeon-era roster (four verbs × two kinds). The law it
  // asserts now is the both-kinds contract on WHATEVER the roster carries,
  // plus the interim fact itself — an empty roster — so a verb quietly
  // re-granted without its human twin, or with own-ground scope, still fails
  // here the day it appears.
  const actions = field(PORTAL, "actions");
  assert.ok(Array.isArray(actions), "the class carries a roster, even empty — the channel is law, its contents are rulings");
  assert.equal(actions.length, 0,
    "the interim roster is EMPTY (992a3338; the portal sitting rules what returns) — a verb appearing here without that sitting is drift, not a tidy");
  const byVerb = new Map();
  for (const a of actions) byVerb.set(a.action, [...(byVerb.get(a.action) ?? []), a]);
  for (const [v, entries] of byVerb) {
    const kinds = entries.map((a) => a.for ?? "resident").sort();
    assert.deepEqual(kinds, ["human", "resident"],
      `${v} reaches a resident and a guest's human — an absent for: IS the resident entry`);
    for (const e of entries)
      assert.equal(e.scope, undefined,
        `${v} is class-scoped: a portal grants to VISITORS, so own-ground would empty the room`);
  }
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
  // ALL FIVE, and `lift` is in the list because it was once not. 1fa16e5a added
  // the five `requires:` lines together and gave lift `arena` where its four
  // siblings got `portal-ground`; 992a3338 then retired the arena, leaving lift
  // fenced to a class with no instance anywhere in the world. The guard is an
  // exact string match against the spine's own class values with no ancestor
  // expansion (office src/world-apex.mjs:1185-1192 builds byClass off each
  // mark's own `class:`), so that fence could never pass — the engine's own
  // lesson at src/world-apex.mjs:1938-1943, arrived at from the mark side:
  //   "a precondition that can never be satisfied is not a guard, it is a wall,
  //    and it would have read as 'the law says so' to anyone who looked."
  // Enumerating five verbs rather than four is the whole of the falsifier: a
  // loop that skips one is how the one got skipped.
  for (const v of ["strike", "guard", "cast", "loot", "lift"]) {
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

test("every fighting verb ENDS THE TURN, and none of them carries a cooldown any more", () => {
  // ⚠ SUPERSEDED 2026-08-26 by the founder's turn ruling, and the replacement
  // is STRICTER than what it replaced. This test used to assert the opposite —
  // that each verb carried a `cooldown_seconds` dial and that NOTHING declared
  // a turn order — quoting the clause "Turn order would be a second clock; a
  // cooldown is the one the town already has." The founder overruled the clause.
  //
  // The lazy repair is deleting this test. The honest one asserts the property
  // the change establishes AND the absence of the thing it replaced, so a
  // half-migration — a verb that ends the turn while still carrying a cooldown,
  // i.e. two pacing laws at once — fails here where before it could not.
  //
  // LOGOS/classes.md § The arena, verbatim:
  //   "While an encounter is live, an arena affords its verbs — and walking —
  //    only to whoever the wheel is on."
  for (const v of ["strike", "guard", "cast", "lift"]) {
    const dials = field(VERB(v), "dials");
    assert.equal(dials.ends_turn, true, `${v} spends the turn that used it`);
    assert.equal(dials.cooldown_seconds, undefined,
      `${v} still carries a cooldown — a wheel and a cooldown are two pacing laws, and a verb under both obeys neither predictably`);
  }
  // loot is the exception and it is on the record as one: the fight is over by
  // then, so there is no wheel left for it to spend.
  assert.equal(field(VERB("loot"), "dials").ends_turn, false);
});

test("the one dial that names a duration resolves at a door, never on a clock", () => {
  // LOGOS/classes.md § Pacing is a WHEEL, verbatim:
  //   "Turn ORDER is a property of a log; a turn TIMER would have been the
  //    second clock, which is why the one dial that names a duration
  //    (`turn_timeout`) resolves at the next door touch and never on its own."
  // The founder's second-clock objection to turn order was overruled; the
  // objection itself was not answered by ignoring it, and this is where the
  // answer is checkable. A duration dial anywhere but the arena would be a
  // ticker in the making.
  const arena = field(ARENA, "dials");
  assert.ok(Number.isFinite(arena.turn_timeout_s) && arena.turn_timeout_s > 0);

  // THE CLASS DEFAULT IS A NUMBER, and this asserts WHICH — LOGOS/classes.md
  // § Pacing is a wheel, as amended 2026-08-30, verbatim:
  //   "`turn_timeout_s` is an unsealed instance dial: the arena class carries
  //    the default (600) and each encounter may set its own, the way every
  //    unsealed slot in this record works — the class never speaks the
  //    instance's value."
  // `> 0` could not tell 600 from 45, which is exactly the confusion the
  // amendment settles: the founder's 16:54 ruling on 2026-08-29 (0352e561) set
  // the candle vault to a named 45, and 992a3338 stripped the vault's wheel
  // dials three hours later, so that 45 now exists nowhere in the world. The
  // doc names 600 and so does the record; pinning it here is what keeps a
  // rename or a re-tune failing a test instead of failing the town.
  assert.equal(arena.turn_timeout_s, 600,
    "the arena class carries the DEFAULT turn timeout, and LOGOS names it 600 — an instance may set its own, but the class's own number is this one");
  for (const v of ["strike", "guard", "cast", "lift", "loot"])
    for (const k of Object.keys(field(VERB(v), "dials")))
      assert.ok(!/_s$|_seconds$/.test(k),
        `${v} declares "${k}" — no verb names a duration; the only one in this design is the arena's, and it fires at a door`);
});

test("the fighting verbs roll DICE, and every die is on the record", () => {
  // ⚠ SUPERSEDED 2026-08-26 by the founder's dice ruling. This asserted fixed
  // integer damage and quoted "a portal ground's arithmetic is fixed damage,
  // fixed dials, and a scripted answer". The founder wants dice; atom 8 is
  // unchanged; so the clause narrowed to "no UNWITNESSED randomness" and the
  // number became a DIE.
  //
  // The replacement is stricter in the way that matters: a die on the record is
  // amendable law, and this test fails if any verb's randomness moves off the
  // record into an office — which is the only way dice could break atom 8 here.
  //
  // LOGOS/classes.md § The witnessed roll, verbatim:
  //   "The die is a class dial, like every other number a class speaks — so
  //    what a verb rolls is amendable law, not a constant in an office."
  const strike = field(VERB("strike"), "dials");
  const cast = field(VERB("cast"), "dials");
  for (const [name, d] of [["strike", strike], ["cast", cast]]) {
    assert.ok(Number.isInteger(d.to_hit_die) && d.to_hit_die > 1, `${name} names its to-hit die`);
    assert.ok(Number.isInteger(d.damage_die) && d.damage_die > 1, `${name} names its damage die`);
    assert.ok(Number.isInteger(d.beats_ac), `${name} names what a hit has to beat`);
    assert.equal(d.damage, undefined, `${name} still carries flat damage beside a die — two answers to one question`);
  }
  assert.ok(cast.damage_die > strike.damage_die,
    "cast costs the same turn and reaches further — if its die were no better, nobody would ever spend one on it");
  assert.equal(field(VERB("guard"), "dials").halves_next_hit, true,
    "guard's effect is a dial, not a hardcode — the town can amend what bravery is worth");
});

test("the arena keeps the wheel, and the plain portal ground does NOT", () => {
  // LOGOS/classes.md § The arena, verbatim:
  //   "Crossing into an arena is joining its fight. Nothing else in the town
  //    has a threshold that means that, which is why it is a class and not a
  //    dial."
  // The discriminating leg: if both classes carried the wheel dials, the split
  // would be decoration and the antechamber would be a fight nobody declared.
  assert.equal(scalar(ARENA, "extends"), "portal-ground",
    "an arena IS a portal ground — same lent verbs, same fence, plus a wheel");
  const arena = field(ARENA, "dials");
  for (const k of ["turn_timeout_s", "initiative_die", "lift_to"])
    assert.ok(k in arena, `the arena declares ${k}`);
  const plain = field(PORTAL, "dials");
  for (const k of ["turn_timeout_s", "initiative_die", "lift_to"])
    assert.equal(plain[k], undefined, `the plain portal ground must not declare ${k} — a room with a wheel and no fight is a room that cannot be walked through`);
});

test("lift is granted by the arena and by nothing else", () => {
  // LOGOS/classes.md § Downed, not dead, verbatim:
  //   "Any ally may spend their WHOLE turn lifting you, and you come back at
  //    partial strength. The cost is the turn; that is the entire economy of
  //    it."
  const arenaActions = field(ARENA, "actions");
  const liftKinds = arenaActions.filter((a) => a.action === "lift").map((a) => a.for ?? "resident").sort();
  assert.deepEqual(liftKinds, ["human", "resident"],
    "the arena grants lift to BOTH kinds — a guest's human watching a housemate lie there and unable to help is the one shape this room must not have");
  assert.ok(!(field(PORTAL, "actions") ?? []).some((a) => a.action === "lift"),
    "the antechamber does not — there is nobody down in a room with no fight in it");
  const lift = field(VERB("lift"), "dials");
  assert.equal(lift.ends_turn, true, "the cost IS the turn");
  assert.ok(Number.isInteger(lift.restores_to) && lift.restores_to > 0,
    "and you come back at PARTIAL strength, a number the record carries");
  // THE GRANT IS THE ARENA'S; THE FENCE IS THE PORTAL'S — two different things,
  // and reading them as one is what left lift fenced to `arena` after the
  // retirement. What the arena alone hands out is the `actions` roster asserted
  // above. Where the verb may be performed once handed out is its own residue
  // class's guard, and LOGOS/classes.md § The portal ground states that for
  // every verb without exception, verbatim:
  //   "Its verbs cannot leave it. Each verb class names a guard in gate
  //    position — requires: {within_class: portal-ground}"
  // "portal-ground" and not "arena" is therefore the law for lift exactly as it
  // is for its four siblings.
  //
  // STATED PRECISELY, because the obvious reading is wrong: the guard does NOT
  // expand ancestors. `spineClasses` is a flat list of each spine mark's own
  // `class:` value (office src/world-apex.mjs:1185-1192), so a ground filed
  // `class: arena` would put "arena" on the spine and NOT "portal-ground", and
  // this fence would refuse there. That is true of all five verbs identically
  // and is not what this line changed — every live portal ground today is
  // `class: portal-ground` (the parlor, the candle vault, the cellar door), and
  // `class: arena` has exactly one occurrence in the world: its own class
  // declaration, no instance. If the portal sitting ever seats an arena-classed
  // instance, all five fences need the ancestor question answered together.
  assert.equal(field(VERB("lift"), "requires").within_class, "portal-ground",
    "lift is fenced to the portal ground like every other lent verb — the arena limits who GRANTS it, not where it may be performed");
});

// ── the first instances ─────────────────────────────────────────────────────
//
// A clause with no instance is a clause nobody has had to mean. These assert
// the SHAPE of the first ones, never their content: what the marks SAY is the
// author's and changes freely; what they must BE is law and does not.

test("the first portal ground stands geometrically inside the parcel it was built on", () => {
  // WORLD/marks/SCHEMA.md § Nesting, verbatim:
  //   "a nested `sited` mark must be geometrically contained by its parent"
  // Under the freeze the directory no longer says who contains what, so the
  // claim is checked where it now lives: in the numbers. Rei's parcel sits at
  // world (1088, -794.5) — its own at (-250, 200) offset from the Lanternseed
  // Gardens' centre (1338, -994.5) — and is 25 m square.
  const parcelWorld = { x: 1338 - 250, y: -994.5 + 200 };
  const fence = { x0: parcelWorld.x - 12.5, x1: parcelWorld.x + 12.5, y0: parcelWorld.y - 12.5, y1: parcelWorld.y + 12.5 };
  const g = frontmatter("WORLD/marks/wright/the-cellar-door/mark.md");
  assert.equal(g.class, "portal-ground");
  const box = { x0: g.at.x - g.extent.w / 2, x1: g.at.x + g.extent.w / 2,
                y0: g.at.y - g.extent.h / 2, y1: g.at.y + g.extent.h / 2 };
  assert.ok(box.x0 >= fence.x0 && box.x1 <= fence.x1 && box.y0 >= fence.y0 && box.y1 <= fence.y1,
    `the portal ground must sit inside the parcel: it spans x ${box.x0}…${box.x1} y ${box.y0}…${box.y1}, the parcel x ${fence.x0}…${fence.x1} y ${fence.y0}…${fence.y1}`);
});

test("the thing that lends a verb is the TOWN's, and the things that do not lend are ordinary", () => {
  // LOGOS/classes.md § The three channels, verbatim:
  //   "only a thing whose `by:` is the town's own pen may carry a held grant"
  const lender = frontmatter("WORLD/marks/the-town/the-good-lighter/mark.md");
  assert.equal(lender.by, "the-town");
  assert.equal(lender.class, "thing");
  assert.ok(Array.isArray(lender.held_grant) && lender.held_grant.length >= 1);
  for (const g of lender.held_grant)
    assert.ok(g.residue, "a held grant names its residue — the door quotes the residue's own mark, never a copy beside the grant");
  for (const t of ["a-slice-to-take-home", "the-wick-end"]) {
    const carried = frontmatter(`WORLD/marks/the-town/${t}/mark.md`);
    assert.equal(carried.class, "thing", "what is carried out is an ORDINARY thing — that is the whole thesis of the room");
    assert.equal(carried.held_grant, undefined, "a trophy lends nothing; it is a keepsake, not a key");
  }
});

test("the adversary's numbers are on its own mark, not in any office", () => {
  // LOGOS/classes.md § The portal ground, verbatim:
  //   "instances carry `hp` and `hits_for` as their own UNSEALED dials, so two
  //    adversaries differ by what the record says about each and not by a
  //    branch in code"
  //
  // ⚠ SUPERSEDED IN PLACE 2026-08-30: the first adversary FELL (the cake,
  // 2026-08-29 ~22:44Z, Sol's natural 20) and was reclassed `thing` by the
  // retirement ruling (dff16f12) — the Lit Cake is a monument now, not a boss.
  // So the instance half of this falsifier retires with its subject: the
  // adversary class stands with NO live instance again, which the header's own
  // words allow ("a clause with no instance is a clause nobody has had to
  // mean"). The class-grammar half is still live law and still checked. When
  // the next adversary stands, the instance assertions return with its name.
  const cls = field(`${WORKS}/postmark-node/mark/adversary/mark.md`, "dials");
  assert.equal(cls.hp, "unsealed", "the class speaks the grammar and never the value");
  assert.equal(cls.hits_for, "unsealed");
  const monument = frontmatter("WORLD/marks/wright/the-unlit-cake/mark.md");
  assert.equal(monument.class, "thing", "the fallen boss is an ordinary thing — the retirement ruling, held");
  assert.equal(monument.dials, undefined, "a monument carries no combat dials");
});

test("the portal ground carries entry terms, because it binds those it reaches", () => {
  // LOGOS/reads-and-affordances.md § The apex, verbatim:
  //   "the terms delivered before an act binds are the class-nodes' own
  //    content, because you cannot be bound by law you were not shown at the
  //    door."
  // A ground that grants verbs and asks for no word would be binding a visitor
  // with law it never showed them.
  const g = frontmatter("WORLD/marks/wright/the-cellar-door/mark.md");
  assert.ok(g.entry, "the portal ground declares an entry law");
  assert.ok(g.entry.edge, "it declares a counter-edge, which is what makes the door ASK rather than assume");
  assert.ok(String(g.entry.consequence ?? "").length > 0, "and says what crossing costs, in its own words");
});

/** Frontmatter as data. Deliberately a small hand-parser rather than the fold:
 *  a falsifier that runs the machinery it is checking cannot fail when the
 *  machinery is what is wrong. */
function frontmatter(rel) {
  const text = readFileSync(join(here, "..", rel), "utf8");
  const body = text.split("---")[1] ?? "";
  const out = {};
  for (const line of body.split("\n")) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, k, raw] = m;
    if (/^[[{]/.test(raw)) {
      // the record's two object spellings: strict JSON, and the bare
      // `{ x: 1, y: 2 }` the frontmatter reader also takes.
      try { out[k] = JSON.parse(raw); }
      catch { try { out[k] = JSON.parse(raw.replace(/([{,]\s*)([a-z_]+)\s*:/g, '$1"$2":')); } catch { out[k] = raw; } }
    } else out[k] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}

// ── the sweep's own reader ──────────────────────────────────────────────────
//
// Deliberately small: a directory walk of the works, so the scope check above
// inspects the whole registry rather than the list this file happens to know
// about. A guard that only checks its author's own marks is a guard against
// nothing.
import { readdirSync, statSync } from "node:fs";
function markFiles(dir = join(here, "..", WORKS), out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) markFiles(p, out);
    else if (name === "mark.md") out.push(p);
  }
  return out;
}
