// reached-grants-flips.mjs — proof that reached-grants.test.mjs CAN fail.
//
// A green suite is an assertion until something has watched it go red. Each
// flip below breaks ONE clause of the law on the record, runs the suite, and
// requires that the test NAMED beside it is the one that fails — because a
// mutation caught by the wrong assertion proves the wrong thing, and a
// mutation caught by nothing at all is a green light over a hole.
//
// Two guards on the apparatus itself, both earned:
//   · every flip verifies the file actually CHANGED before running the suite —
//     a mutation that silently no-ops makes its own test look robust;
//   · a flip whose suite comes back GREEN is reported as an APPARATUS failure,
//     not a pass. A flip is only useful when it can go red.
//
// Run: node tools/reached-grants-flips.mjs   (exit 0 = every flip flipped)

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const WORKS = "WORLD/marks/let-there-be-light/the-town-centre/the-keeping-works";
const at = (rel) => join(root, rel);

const HUMAN = `${WORKS}/postmark-node/entity/human/mark.md`;
const RESIDENT = `${WORKS}/postmark-node/entity/resident/mark.md`;
const PARCEL = `${WORKS}/postmark-node/mark/parcel/mark.md`;
const PORTAL = `${WORKS}/postmark-node/mark/portal-ground/mark.md`;
const HELD = `${WORKS}/postmark-node/mark/thing/held-grant-slot/mark.md`;
const VERB = (v) => `${WORKS}/postmark-edge/${v}/mark.md`;
const ARENA = `${WORKS}/postmark-node/mark/portal-ground/arena/mark.md`;

/** Each flip: the file it breaks, the edit, and the test title that must catch it. */
const FLIPS = [
  { name: "the human's roster grows a second ambient grant",
    file: HUMAN, catches: "the human's ambient roster is STILL one grant",
    edit: (t) => t.replace('"residue": "the-town/say"}]',
      '"residue": "the-town/say"}, {"action": "walk", "for": "human", "residue": "the-town/depart"}]') },

  { name: "the human's stride drifts off the resident's",
    file: HUMAN, catches: "the human carries the resident's own stride",
    edit: (t) => t.replace('"pace_km_per_crossing": 60', '"pace_km_per_crossing": 30') },

  { name: "the parcel's walk loses its relation scope (every guest's human walks your garden)",
    file: PARCEL, catches: "the parcel class grants walk and say to the ground's OWN household's human",
    edit: (t) => t.replace('{"action": "walk", "for": "human", "scope": "own-ground",',
                           '{"action": "walk", "for": "human",') },

  { name: "a scoped grant lands with no for: (and so reads as RESIDENT)",
    file: RESIDENT, catches: "no grant anywhere is scoped without naming the kind it is for",
    edit: (t) => t.replace('{"action": "walk", "residue": "the-town/depart"}',
                           '{"action": "walk", "scope": "own-ground", "residue": "the-town/depart"}') },

  { name: "the held-grant slot is sealed to one value (every weapon the same weapon)",
    file: HELD, catches: "the held-grant slot is unsealed and in the town's own custody",
    edit: (t) => t.replace("value: unsealed", "value: strike") },

  { name: "the held-grant slot leaves the town's custody",
    file: HELD, catches: "the held-grant slot is unsealed and in the town's own custody",
    edit: (t) => t.replace("values-tier: constitution", "values-tier: sovereign") },

  // ⚠ TRUED 2026-08-30 with the roster's interim emptiness (992a3338 + the
  // LOGOS amendment): the two dungeon-era flips edited grant entries that no
  // longer exist, so they matched nothing. The live flips now catch the two
  // ways the interim state can rot: a verb sneaking back in at all, and — for
  // the day the sitting DOES re-grant — a verb arriving without its human
  // twin. (The own-ground flip returns with the roster.)
  { name: "a verb sneaks back onto the retired roster without the portal sitting",
    file: PORTAL, catches: "the portal ground's roster names BOTH actor kinds",
    edit: (t) => t.replace(/^actions: \[\]$/m,
      'actions: [{"action": "strike", "residue": "the-town/strike"}]') },

  { name: "strike escapes the portal (the weapon carried home works on the quay)",
    file: VERB("strike"), catches: "every portal verb is fenced to the portal by a guard in gate position",
    edit: (t) => t.replace('requires: {"within_class": "portal-ground", ', "requires: {")
                  .replace('requires: {"within_class": "portal-ground"}', "requires: {}") },

  { name: "strike grows a phase guard (nobody may swing at a boss that is standing)",
    file: VERB("strike"), catches: "loot is additionally fenced to a spent encounter",
    edit: (t) => t.replace('requires: {"within_class": "portal-ground"}',
                           'requires: {"within_class": "portal-ground", "phase": "spent"}') },

  { name: "loot loses its phase guard (the reward is a decoration, not a consequence)",
    file: VERB("loot"), catches: "loot is additionally fenced to a spent encounter",
    edit: (t) => t.replace(', "phase": "spent"', "") },


  // ── the wheel, the dice and the lift (the founder's 2026-08-26 rulings) ──
  { name: "a fighting verb keeps a cooldown beside the wheel (two pacing laws at once)",
    file: VERB("strike"), catches: "every fighting verb ENDS THE TURN",
    edit: (t) => t.replace("\"ends_turn\": true}", "\"ends_turn\": true, \"cooldown_seconds\": 20}") },

  { name: "a fighting verb stops spending the turn that used it",
    file: VERB("guard"), catches: "every fighting verb ENDS THE TURN",
    edit: (t) => t.replace("\"ends_turn\": true}", "\"ends_turn\": false}") },

  { name: "a verb grows a duration dial of its own (a ticker in the making)",
    file: VERB("cast"), catches: "the one dial that names a duration resolves at a door",
    edit: (t) => t.replace("\"ends_turn\": true}", "\"ends_turn\": true, \"recharge_seconds\": 30}") },

  { name: "the arena drops its turn timeout, so an absent hand freezes the room",
    file: ARENA, catches: "the one dial that names a duration resolves at a door",
    edit: (t) => t.replace("\"turn_timeout_s\": 600, ", "") },

  { name: "a verb carries flat damage beside its die — two answers to one question",
    file: VERB("strike"), catches: "the fighting verbs roll DICE",
    edit: (t) => t.replace("\"damage_die\": 6", "\"damage_die\": 6, \"damage\": 4") },

  { name: "a verb's die leaves the record",
    file: VERB("cast"), catches: "the fighting verbs roll DICE",
    edit: (t) => t.replace("\"to_hit_die\": 20, ", "") },

  { name: "cast stops buying more than strike (nobody would ever spend one)",
    file: VERB("cast"), catches: "the fighting verbs roll DICE",
    edit: (t) => t.replace("\"damage_die\": 10", "\"damage_die\": 6") },

  { name: "guard's effect leaves the record for the code",
    file: VERB("guard"), catches: "the fighting verbs roll DICE",
    edit: (t) => t.replace("\"halves_next_hit\": true, ", "") },

  { name: "the arena stops extending the portal ground",
    file: ARENA, catches: "the arena keeps the wheel, and the plain portal ground does NOT",
    edit: (t) => t.replace("extends: portal-ground", "extends: mark") },

  { name: "the plain portal ground grows a wheel (a room you cannot walk through)",
    file: PORTAL, catches: "the arena keeps the wheel, and the plain portal ground does NOT",
    edit: (t) => t.replace("dials: {\"beat_seconds\": 20}", "dials: {\"beat_seconds\": 20, \"turn_timeout_s\": 600, \"initiative_die\": 20, \"lift_to\": 8}") },

  { name: "the arena stops granting lift, so nobody can be picked up",
    file: ARENA, catches: "lift is granted by the arena and by nothing else",
    edit: (t) => t.replace("{\"action\": \"lift\", \"residue\": \"the-town/lift\"}, ", "") },

  { name: "lifting costs no turn",
    file: VERB("lift"), catches: "lift is granted by the arena and by nothing else",
    edit: (t) => t.replace("\"ends_turn\": true", "\"ends_turn\": false") },

  // ⚠ TRUED 2026-08-30 with lift's fence (the audit's F1). This flip edited
  // `requires: {"within_class": "arena"}` — the dead fence itself — so once the
  // fence is corrected the edit matches nothing and the flip proves nothing.
  // Same rot class as the two dungeon-era flips above: anchored on a value that
  // moved. Re-anchored on the live fence, and it now catches the same escape
  // for lift that the strike flip catches for strike.
  { name: "lift escapes the portal (a downed hand could be lifted anywhere in the world)",
    file: VERB("lift"), catches: "every portal verb is fenced to the portal by a guard in gate position",
    edit: (t) => t.replace('requires: {"within_class": "portal-ground"}', "requires: {}") },

  // ── the first instances ─────────────────────────────────────────────────
  { name: "the portal ground drifts outside the parcel it was built on",
    file: "WORLD/marks/wright/the-cellar-door/mark.md",
    catches: "the first portal ground stands geometrically inside the parcel",
    // ⚠ TRUED 2026-08-30: this flip edited coordinates the door no longer
    // wears (1097,-785 — a pre-transfer placement), so it matched nothing and
    // proved nothing (the wake-card had it flagged as the dead flip). Same
    // rot class as the dials flip below: anchored on a value, not a shape.
    edit: (t) => t.replace(/^at: \{.*$/m, "at: { x: 1140, y: -785 }") },

  { name: "the portal ground stops asking for a word at its door",
    file: "WORLD/marks/wright/the-cellar-door/mark.md",
    catches: "the portal ground carries entry terms",
    edit: (t) => t.replace('"edge": "within", ', "") },

  { name: "a trophy starts lending verbs of its own",
    file: "WORLD/marks/the-town/the-wick-end/mark.md",
    catches: "the thing that lends a verb is the TOWN's",
    edit: (t) => t.replace("loot: true", 'loot: true\nheld_grant: [{"action": "strike", "residue": "the-town/strike"}]') },

  { name: "the lender's grant stops naming its residue (a blurb kept beside the grant)",
    file: "WORLD/marks/the-town/the-good-lighter/mark.md",
    catches: "the thing that lends a verb is the TOWN's",
    edit: (t) => t.replace(', "residue": "the-town/strike"', "") },

  { name: "the fallen boss regrows combat dials (the monument un-retires)",
    file: "WORLD/marks/wright/the-unlit-cake/mark.md",
    catches: "the adversary's numbers are on its own mark",
    // ⚠ SUPERSEDED IN PLACE 2026-08-30 with its test: the cake fell and was
    // reclassed `thing` (dff6→ the retirement ruling), so the old flip —
    // mangle the boss's dials — has no dials to mangle. The test now asserts
    // the MONUMENT state (class thing, no dials); the flip that catches it is
    // giving the monument dials back. (The prior flip's own lesson kept:
    // anchor on shape, never on a literal value.)
    edit: (t) => t.replace(/^class: thing$/m, 'class: thing\ndials: {"hp": 1}') },

  { name: "the adversary CLASS seals a value every instance must wear",
    file: `${WORKS}/postmark-node/mark/adversary/mark.md`,
    catches: "the adversary's numbers are on its own mark",
    edit: (t) => t.replace('"hp": "unsealed"', '"hp": 60') },
];

const suite = () => {
  try {
    execFileSync(process.execPath, ["--test", "tools/reached-grants.test.mjs"],
      { cwd: root, encoding: "utf8", stdio: "pipe" });
    return { green: true, out: "" };
  } catch (e) { return { green: false, out: String(e.stdout ?? "") + String(e.stderr ?? "") }; }
};

// The control leg. If the suite is not green BEFORE any flip, every red below
// proves nothing — it would be reporting a pre-existing failure as a catch.
const control = suite();
if (!control.green) {
  console.error("APPARATUS: the suite is not green before any flip was applied — nothing below would mean anything.");
  console.error(control.out.slice(0, 2000));
  process.exit(1);
}
console.log("control · suite green before any flip\n");

let failures = 0;
for (const f of FLIPS) {
  const path = at(f.file);
  const original = readFileSync(path, "utf8");
  const mutated = f.edit(original);
  if (mutated === original) {
    console.log(`APPARATUS  ${f.name}\n           the edit changed nothing — this flip proves nothing`);
    failures += 1;
    continue;
  }
  writeFileSync(path, mutated);
  const r = suite();
  writeFileSync(path, original);

  if (r.green) {
    console.log(`APPARATUS  ${f.name}\n           the law was broken and the suite stayed GREEN — this is a hole, not a pass`);
    failures += 1;
  } else if (!r.out.includes(f.catches)) {
    console.log(`WRONG-CATCH ${f.name}\n            went red, but not at "${f.catches}"`);
    failures += 1;
  } else {
    console.log(`RED  ${f.name}\n     caught by: ${f.catches}`);
  }
}

// The suite must be green again after the last restore — a flip runner that
// leaves the tree mutated has turned a proof into a landmine.
const after = suite();
console.log(`\nrestore · suite ${after.green ? "green" : "RED — THE TREE IS STILL MUTATED"} after every flip`);
if (!after.green) failures += 1;

console.log(`\n${FLIPS.length - failures}/${FLIPS.length} flips flipped red at the assertion that names them.`);
process.exit(failures ? 1 : 0);
