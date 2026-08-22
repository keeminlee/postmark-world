// viewer-credentials.test.mjs — every read carries the page's own cookies.
//
// Founder on dev, 2026-08-21: "World isn't loading for me at
// https://dev.postmark.town/world/". dev sits behind Cloudflare Access, and the
// viewer's reads said `credentials: "omit"` — which strips cookies from OUR OWN
// host as well as anyone else's, so the edge answered a login redirect instead
// of the record and the World never arrived on a page that otherwise rendered.
//
// `same-origin` sends cookies only to the page's own origin, so it fixes the
// office and record lanes and changes nothing for the cross-origin raw
// fallback, which receives none either way.

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

test("the cross-origin fallback is unaffected, which is why the change is safe", () => {
  // The record chain ends at raw.githubusercontent — a different origin, which
  // receives no cookies under same-origin exactly as it received none under
  // omit. If that ever stops being a different host, this assumption needs
  // re-reading rather than inheriting.
  assert.match(SOURCE, /const RAW = "https:\/\/raw\.githubusercontent\.com/,
    "the fallback is still an absolute cross-origin URL");
  assert.match(SOURCE, /worldStatePaths = \(\) => \[officeUrl\("\/world\/state"\), "\/WORLD\/world-state\.json", `\$\{RAW\}/,
    "and the chain still runs same-origin office, then same-origin file, then the cross-origin fallback");
});
