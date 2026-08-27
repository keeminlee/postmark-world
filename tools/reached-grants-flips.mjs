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

  { name: "the portal stops granting to guests' humans",
    file: PORTAL, catches: "the portal ground's roster names BOTH actor kinds",
    edit: (t) => t.replace('{"action": "strike", "for": "human", "residue": "the-town/strike"}, ', "") },

  { name: "a portal grant picks up own-ground (a portal that only its owner may play in)",
    file: PORTAL, catches: "the portal ground's roster names BOTH actor kinds",
    edit: (t) => t.replace('{"action": "loot", "for": "human", "residue": "the-town/loot"}',
                           '{"action": "loot", "for": "human", "scope": "own-ground", "residue": "the-town/loot"}') },

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

  { name: "cast loses its cooldown (a word you may spend without pause)",
    file: VERB("cast"), catches: "every portal verb carries its own cooldown dial",
    edit: (t) => t.replace(', "cooldown_seconds": 60', "") },

  { name: "a verb declares a turn order (a second clock beside the town's)",
    file: VERB("guard"), catches: "every portal verb carries its own cooldown dial",
    edit: (t) => t.replace('"cooldown_seconds": 40', '"cooldown_seconds": 40, "turn_order": 2') },

  { name: "cast stops buying more than strike (nobody would ever spend it)",
    file: VERB("cast"), catches: "the fighting verbs' damage lives on the record",
    edit: (t) => t.replace('"damage": 6', '"damage": 4') },

  { name: "guard's effect leaves the record for the code",
    file: VERB("guard"), catches: "the fighting verbs' damage lives on the record",
    edit: (t) => t.replace('"halves_next_hit": true, ', "") },
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
