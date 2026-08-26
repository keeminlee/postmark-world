// record-sources.mjs — WHERE A READER MAY READ THE TOWN'S RECORD FROM.
//
// One place decides the source chain for every public record file the viewer
// reads, because the thing that went wrong was decided in five different places
// and nobody could see all five at once.
//
// ── THE LAW ────────────────────────────────────────────────────────────────
//
// The site's world pin obeys a guardrail the founder ruled on 2026-08-25, and
// it is quoted here verbatim rather than paraphrased:
//
//     "tags only, never main tip."
//
// That guardrail is enforced at BUILD time by `tools/lib/world-pin.mjs` in the
// site repo: prod is assembled from a blessed `settlement/S<n>` tag and never
// from this repo's main branch. But a build-time guardrail is only as strong as
// what the page does at READ time — and until 2026-08-26 the viewer answered
// every record it could not find same-origin by fetching
// `raw.githubusercontent.com/keeminlee/postmark-world/main`, which is the world's
// main tip: precisely the bytes the guardrail exists to keep out of prod.
//
// It was not hypothetical. `WORLD/walk-ledger.md` was missing from the site's
// staging list, so `https://postmark.town/WORLD/walk-ledger.md` answered 404 in
// production, and every departure the town displayed was read from unblessed
// main. The build obeyed the law and the page walked around it.
//
// So the second half of the guardrail lives here: **no chain this module builds
// may name the world's main tip.** A record that cannot be read from the page's
// own origin (or from an office standing beside it) is an ABSENCE, and an
// absence is something a reader is told about — never something quietly filled
// in from a branch nobody blessed.
//
// ── WHAT REPLACED THE FALLBACK ─────────────────────────────────────────────
//
// The raw fallback was never really serving the standalone habitat it was
// written for; it was covering two missing routes. `spectator/server.mjs` now
// serves `/WORLD/walk-ledger.md` and `/seeding/manifest.json` off this clone's
// own disk, exactly as it already served world-state and the threshold ledger,
// so a local spectator reads a complete record from the tree it is standing in
// — which is strictly better than github's main branch ever was.
//
// Pure and I/O-free on purpose: these are decisions, and a decision that cannot
// be tested without a network is a decision nobody tests.

/** The world repo's main tip. Named ONLY so a falsifier can assert its absence. */
export const WORLD_MAIN_TIP = "https://raw.githubusercontent.com/keeminlee/postmark-world/main";

/**
 * True when `url` would read the world repo's unblessed main branch.
 * The guardrail sentence this answers to: "tags only, never main tip."
 */
export function readsMainTip(url) {
  return String(url ?? "").startsWith(WORLD_MAIN_TIP);
}

/**
 * The ordered sources for one public record file.
 *
 * `record` is the same-origin path (`/WORLD/walk-ledger.md`). `office` is an
 * office route that answers with the same record wrapped in JSON, when one
 * exists — it goes FIRST, because an office reads the clone it actually has
 * while a staged file is a photograph taken at build time.
 *
 * `json` says how to unwrap the answer: an office lane hands over a JSON object
 * carrying the text under `key`; a file IS the text (or IS the JSON).
 */
export function recordSources(record, { office = null, key = null } = {}) {
  const path = String(record ?? "");
  if (!path.startsWith("/")) throw new Error(`record source must be a same-origin path, got ${JSON.stringify(record)}`);
  const chain = [];
  if (office) chain.push({ url: String(office), json: true, key });
  chain.push({ url: path, json: path.endsWith(".json"), key: null });
  return chain;
}

/**
 * The absence a reader is shown when every source for `record` refused.
 *
 * A NAME, not a shrug. An empty departures rail and a departures rail that
 * could not be read look identical on screen, and the difference is the whole
 * bug: one says nobody walked, the other says we do not know. This sentence is
 * the second one, said out loud.
 */
export function recordAbsenceMessage(record, { office = null } = {}) {
  const tried = recordSources(record, { office }).map((source) => source.url).join(" and ");
  return `${record} could not be read (tried ${tried}) — this reading is INCOMPLETE, not empty.`;
}
