// viewer-credentials.test.mjs — every read carries the page's own cookies.
//
// Founder on dev, 2026-08-21: "World isn't loading for me at
// https://dev.postmark.town/world/". dev sits behind Cloudflare Access, and the
// viewer's reads said `credentials: "omit"` — which strips cookies from OUR OWN
// host as well as anyone else's, so the edge answered a login redirect instead
// of the record and the World never arrived on a page that otherwise rendered.
//
// `same-origin` sends cookies only to the page's own origin, so it fixed the
// office and record lanes. It was originally reasoned about ALONGSIDE a
// cross-origin raw fallback, which received no cookies either way — and on
// 2026-08-26 that fallback was removed outright (it read the world repo's
// unblessed main tip, which the release lane's world-pin guardrail forbids:
// "tags only, never main tip"). So the reasoning is now shorter than it was:
// every read this module makes for a record goes to the page's own origin, and
// `same-origin` is simply the whole truth about where they go.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "spectator", "viewer.mjs"), "utf8");

test('NO READ OMITS THE PAGE\'S OWN COOKIES: not one fetch says credentials: "omit"', () => {
  // The property IS the behaviour, so the source is the honest surface to
  // assert on — there is no way to observe this without an authenticating edge.
  const omits = [...SOURCE.matchAll(/credentials:\s*["']omit["']/g)];
  assert.equal(omits.length, 0,
    `${omits.length} fetch site(s) still omit credentials; behind an authenticating edge each one is a read that never arrives`);
});

test("and every fetch that names credentials at all names same-origin", () => {
  const named = [...SOURCE.matchAll(/credentials:\s*["']([a-z-]+)["']/g)].map((m) => m[1]);
  assert.ok(named.length >= 11, `expected the viewer's read sites to still declare credentials; found ${named.length}`);
  assert.deepEqual([...new Set(named)], ["same-origin"],
    "one setting across the whole module — a second spelling is a site someone will forget");
  // `include` would be the real mistake: it sends cookies CROSS-origin, which
  // is what `omit` was there to prevent and is not what this fixes.
  assert.doesNotMatch(SOURCE, /credentials:\s*["']include["']/,
    "no read may send this page's cookies to another host");
});

test("there is no cross-origin record lane left to reason about", () => {
  // SUPERSEDES "the cross-origin fallback is unaffected, which is why the change
  // is safe" (2026-08-21). That test asserted the raw-github fallback was still
  // present, because the credentials change had to be shown not to disturb it.
  // The fallback is gone (2026-08-26), so the assertion that it EXISTS is now a
  // written-down false premise rather than a guard, and asserting its absence is
  // the guard the same reasoning wants today.
  assert.doesNotMatch(SOURCE, /raw\.githubusercontent\.com\/keeminlee\/postmark-world/,
    "no read may reach the world repo's raw host — see tools/record-sources.mjs");
  assert.match(SOURCE, /worldStatePaths = \(\) => recordSources\("\/WORLD\/world-state\.json", \{ office: officeUrl\("\/world\/state"\) \}\)/,
    "and the chain runs same-origin office, then this origin's own staged file, and stops");
});
