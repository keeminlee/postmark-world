// viewer.mjs — THE told-world viewer, one module for both surfaces.
//
// This is the single implementation (Keemin, 2026-07-23: the local build is THE
// one viewer; the site serves this same file as a standalone island). It owns the
// markup, the styles, and every interaction; the host page is a thin shell that
// calls `mountViewer(appEl)`. It computes the field of view CLIENT-SIDE from the
// town's public record. Signed-in acts still cross the office door: this module
// previews the exact intent, then sends one credentialed request on confirmation.
//
// It runs in two habitats and feature-detects which without a config flag:
//   • LOCAL (spectator/server.mjs)  — /WORLD/*.json off disk, /api/walks live,
//     /atlas/* proxied to postmark.town. Signed-in controls feature-detect off.
//   • ISLAND (postmark.town/world)  — world-state/skeleton from raw.githubusercontent,
//     /atlas same-origin, with signed-in acts crossing the same-origin office.
//
// One engine, imported the clone's way (relative into the package): the browser
// runs the exact library anyone can `node`. If this page and a clone disagree,
// the office has explaining to do.
import { orient, openYourEyes, investigate, containmentChain, enteredScope, enterPrompt, exitPrompt, shortName } from "../tools/world-verbs.mjs";
import { assembleWorld } from "../tools/world-build.mjs";
import { DIALS, bearingDeg, quantizeBearing } from "../tools/world-engine.mjs";
import { marksContain, pointInPolygon, pointInRect, polygonOf, rect } from "../tools/geometry.mjs"; // read-only: home color + point-destination labels
import { markStanding } from "../tools/mark-standing.mjs"; // the ONE standing rule: in a parcel's directory → home
import { fractionalCrossing, positionAt, parseWalkLedger, targetEntryT } from "../tools/walk.mjs";
import { crossingsOnSegment } from "../tools/water.mjs";

const RAW = "https://raw.githubusercontent.com/keeminlee/postmark-world/main";
const $ = (root, s) => root.querySelector(s);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const OFFICE_DEFAULT = "/api";
const ACT_AS_KEY = "pm.world.act_as";
const LAST_RESIDENT_KEY = "pm.world.last_resident";
export const SPECTATOR_ACTOR = "__spectator__";
// the mark that frames everything — being inside it is being outdoors, which is
// why it names no destination and appears in no containment answer
export const WORLD_ROOT_ID = "the-town/let-there-be-light";

const markIndex = (marks) => marks instanceof Map
  ? marks
  : new Map((marks ?? []).filter((mark) => mark?.id).map((mark) => [mark.id, mark]));

export function isEmbodiedMark(mark) {
  const w = Number(mark?.extent?.w), h = Number(mark?.extent?.h);
  return (mark?.kind === "sited" || mark?.kind === "parcel")
    && [mark?.at?.x, mark?.at?.y, w, h].every(Number.isFinite)
    && w > 0 && h > 0;
}

export function isAmbientMark(mark, marks = []) {
  if (!mark) return false;
  if (mark.id === WORLD_ROOT_ID) return true;
  if (mark.kind !== "predicated" && mark.kind !== "naming") return false;
  const byMarkId = markIndex(marks);
  const seen = new Set([mark.id]);
  let parentId = mark.parent;
  while (parentId && !seen.has(parentId)) {
    if (parentId === WORLD_ROOT_ID) return true;
    seen.add(parentId);
    const parent = byMarkId.get(parentId);
    if (!parent) return true;
    if (isEmbodiedMark(parent)) return false;
    parentId = parent.parent;
  }
  return true;
}

export function nearestEmbodiedAncestor(mark, marks = []) {
  if (!mark || isAmbientMark(mark, marks)) return null;
  if (isEmbodiedMark(mark)) return mark;
  const byMarkId = markIndex(marks);
  const seen = new Set([mark.id]);
  let parentId = mark.parent;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byMarkId.get(parentId);
    if (!parent || isAmbientMark(parent, byMarkId)) return null;
    if (isEmbodiedMark(parent)) return parent;
    parentId = parent.parent;
  }
  return null;
}

const viewportBounds = (viewport) => {
  const minX = Number(viewport?.minX ?? viewport?.x);
  const minY = Number(viewport?.minY ?? viewport?.y);
  const maxX = Number(viewport?.maxX ?? (minX + Number(viewport?.w)));
  const maxY = Number(viewport?.maxY ?? (minY + Number(viewport?.h)));
  return { minX, minY, maxX, maxY };
};

const pointInBounds = (point, bounds) =>
  point.x >= bounds.minX && point.x <= bounds.maxX
  && point.y >= bounds.minY && point.y <= bounds.maxY;

const orient2d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const segmentsIntersect = (a, b, c, d) => {
  const abC = orient2d(a, b, c), abD = orient2d(a, b, d);
  const cdA = orient2d(c, d, a), cdB = orient2d(c, d, b);
  return (abC === 0 && pointInBounds(c, viewportBounds({
    minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
  })))
    || (abD === 0 && pointInBounds(d, viewportBounds({
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
    })))
    || (cdA === 0 && pointInBounds(a, viewportBounds({
      minX: Math.min(c.x, d.x), maxX: Math.max(c.x, d.x),
      minY: Math.min(c.y, d.y), maxY: Math.max(c.y, d.y),
    })))
    || (cdB === 0 && pointInBounds(b, viewportBounds({
      minX: Math.min(c.x, d.x), maxX: Math.max(c.x, d.x),
      minY: Math.min(c.y, d.y), maxY: Math.max(c.y, d.y),
    })))
    || ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0));
};

export function markGeometryIntersectsViewport(mark, viewport) {
  if (!isEmbodiedMark(mark)) return false;
  const bounds = viewportBounds(viewport);
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) return false;
  const ring = polygonOf(mark);
  if (!ring) {
    const claim = rect(mark);
    return claim.x + claim.w / 2 >= bounds.minX && claim.x - claim.w / 2 <= bounds.maxX
      && claim.y + claim.h / 2 >= bounds.minY && claim.y - claim.h / 2 <= bounds.maxY;
  }
  if (ring.some((point) => pointInBounds(point, bounds))) return true;
  const corners = [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
  ];
  if (corners.some((point) => pointInPolygon(point.x, point.y, ring))) return true;
  const viewportEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
  for (let index = 0; index < ring.length; index++) {
    const edge = [ring[index], ring[(index + 1) % ring.length]];
    if (viewportEdges.some(([a, b]) => segmentsIntersect(edge[0], edge[1], a, b))) return true;
  }
  return false;
}

export function edgePointToward(viewport, target, inset = 0) {
  const bounds = viewportBounds(viewport);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const dx = Number(target?.x) - cx, dy = Number(target?.y) - cy;
  if (![cx, cy, dx, dy].every(Number.isFinite) || (dx === 0 && dy === 0)) return null;
  const halfW = Math.max(0, (bounds.maxX - bounds.minX) / 2 - inset);
  const halfH = Math.max(0, (bounds.maxY - bounds.minY) / 2 - inset);
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const scale = Math.min(tx, ty);
  return { x: cx + dx * scale, y: cy + dy * scale, bearingDeg: bearingDeg(dx, dy) };
}

export function deslugMarkId(id) {
  const slug = String(id ?? "").split("/").filter(Boolean).pop() ?? "";
  const words = slug.split("-").filter(Boolean);
  const readable = [];
  for (const word of words) {
    if (word.toLowerCase() === "s" && readable.length) {
      readable[readable.length - 1] += "'s";
      continue;
    }
    readable.push(word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  }
  return readable.join(" ");
}

export function resolveMarkName(mark, determined = {}) {
  const key = `${mark?.id ?? ""}::name`;
  const won = determined instanceof Map ? determined.get(key) : determined?.[key];
  const name = String(won ?? "").trim();
  return name
    ? { name, determined: true }
    : { name: deslugMarkId(mark?.id), determined: false };
}

export function extentGlyphKind(mark) {
  if (!mark?.extent || !(Number(mark.extent.w) > 0 || Number(mark.extent.h) > 0)) return null;
  return polygonOf(mark) ? "polygon" : "rect";
}

function pointInsideMark(point, mark) {
  if (!isEmbodiedMark(mark)) return false;
  const ring = polygonOf(mark);
  return ring
    ? pointInPolygon(Number(point?.x), Number(point?.y), ring)
    : pointInRect(Number(point?.x), Number(point?.y), rect(mark));
}

export function officeBase(storage) {
  try {
    const source = storage === undefined && typeof window !== "undefined" ? window.localStorage : storage;
    return String(source?.getItem("pm.office.base") || OFFICE_DEFAULT).replace(/\/+$/, "");
  } catch {
    return OFFICE_DEFAULT;
  }
}

const officeUrl = (path) => `${officeBase()}${path.startsWith("/") ? path : `/${path}`}`;

export function viewerAxisState({ identityResolved = false, markFilter = "everything" } = {}) {
  return {
    controls: identityResolved,
    filter: markFilter === "new" ? "new"
      : identityResolved && markFilter === "mine" ? "just mine"
      : "everything",
  };
}

// ── drafts ───────────────────────────────────────────────────────────────────
// There used to be a LENS here — True World ⟷ My World — that swapped the whole
// record underneath you, so a draft mark was either invisible or indistinguishable
// from a published one, and you had to remember which world you were standing in
// to know which. Keemin, 2026-08-04: express the drafts as grey and it is all
// unified. One world, and the marks the town has not published yet simply look
// like it. The swap had nothing left to do and is gone.
//
// A draft is a STATE, not a tier — it can be a home, a law, a bench — so it
// travels as a modifier class beside the tier, exactly as `mech` already does,
// and the tier chip goes on saying which kind of thing it is.
export function markStateClasses({ tier = "market", draft = false } = {}) {
  const accent = tier === "home" || tier === "constitution" ? tier : "market";
  return `t-${accent}${draft ? " is-draft" : ""}`;
}

// The office's delta reports three statuses, and only two of them can be grey.
// `added` is a mark the town has never seen; `modified` is your unpublished edit
// of one it has — both are in the composed fold and both read as not-yet-real.
// A `deleted` draft is an ABSENCE: it is simply not in the composed fold, and no
// colour can draw a thing that is not there. It is left out rather than pretended
// at, which is the same answer the old My World lens gave, just said out loud.
export function draftMarkIds(drafts = []) {
  return new Set((drafts ?? [])
    .filter((mark) => mark && mark.status !== "deleted")
    .map((mark) => mark.id ?? mark.mark)
    .filter(Boolean));
}

export function viewerFilterControls(options = {}) {
  const axis = viewerAxisState(options);
  const chip = (key, label, disabled = false) =>
    `<button class="wv-fchip${axis.filter === label ? " on" : ""}" data-mark-filter="${key}"${disabled ? ` disabled title="sign in as a resident to see just yours"` : ""}>${label}</button>`;
  return `<div class="wv-mfilter" aria-label="Marks filter">`
    + chip("everything", "everything")
    + chip("mine", "just mine", !axis.controls)
    + chip("new", "new")
    + `</div>`;
}

export function townDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function previewStakeLedgerLine({ mode = "stake", date = townDate(), handle, mark, stamps } = {}) {
  const n = Number(stamps);
  if (!handle || !mark || !Number.isInteger(n) || n < 1) return "";
  return mode === "unstake"
    ? `- ${date} · stake:world-mark/${mark} → ${handle} · ${n} · for: unstake · sig: …`
    : `- ${date} · ${handle} → stake:world-mark/${mark} · ${n} · via: api · sig: …`;
}

export function clampStakeAmount(value, balance) {
  const requested = Number(value);
  const available = Number(balance);
  const validAmount = Number.isInteger(requested) && requested >= 1;
  const validBalance = balance !== null && balance !== undefined && balance !== ""
    && Number.isInteger(available) && available >= 0;
  return {
    requested,
    balance: validBalance ? available : null,
    amount: validAmount && validBalance ? Math.min(requested, available) : null,
    exceeded: validAmount && validBalance && requested > available,
  };
}

export function worldStakeAnswer(answer = {}, mode = "stake") {
  if (answer.error === "bounce" || answer.defect) {
    return {
      kind: "refusal",
      text: [answer.defect || "the door refused the line", answer.hint].filter(Boolean).join(" — "),
    };
  }
  const applied = Number(answer.applied ?? 0);
  if (applied <= 0) {
    return {
      kind: "refusal",
      text: answer.reason || `No stamps were ${mode === "unstake" ? "returned" : "staked"}.`,
    };
  }
  const requested = Number(answer.requested ?? applied);
  const verb = mode === "unstake" ? "returned" : "staked";
  const clipped = answer.clipped || applied < requested
    ? ` The door clipped the request from ${requested} to ${applied}.`
    : "";
  return {
    kind: "success",
    text: `${applied} stamp${applied === 1 ? "" : "s"} ${verb} on ${answer.mark}.${clipped}`,
  };
}

export function summarizeBackers(rows = [], limit = 5) {
  const holders = (rows ?? [])
    .map((row) => ({
      holder: String(row?.holder ?? row?.handle ?? "").trim(),
      amount: Number(row?.amount ?? row?.stamps ?? 0),
    }))
    .filter((row) => row.holder && Number.isFinite(row.amount) && row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.holder.localeCompare(b.holder));
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  return { top: holders.slice(0, cap), others: Math.max(0, holders.length - cap) };
}

// THE POPOVER AND THE CHIP ARE ONE NUMBER (2026-08-10). This sheet opens by
// clicking the backing chip, and it used to headline the door's raw `escrow`
// while the chip showed raw too — they agreed BY ACCIDENT. The moment the chip
// became effective they contradicted one click apart, on sixteen live marks:
// let-there-be-light read ✦147 on the chip and ✦0 here.
//
// So the headline is taken from the SAME fold record the chip reads. Agreement
// is now structural rather than something two call sites have to remember, and
// the parts beneath explain the gap a single figure cannot.
//
// SETTLED vs LIVE, deliberately not reconciled: `weight`/`weight_parts` are the
// last Settlement's figures — what the chip shows — while the door's holders and
// escrow are the ledger RIGHT NOW. Between crossings they legitimately differ: a
// stake laid this morning is real money and not yet ✦. That difference is
// reported as pending, never quietly resolved toward whichever number is larger.
export function stakeBackersHTML({ weight = 0, weightParts = null, holders = [], liveEscrow = null, limit = 5 } = {}) {
  const effective = Math.max(0, Number(weight) || 0);
  const parts = weightParts ?? null;
  // An absent breakdown means all-zero (marks-fold.mjs only emits weight_parts
  // where it explains something), so read it as zeroes — never as unknown.
  const own = Math.max(0, Number(parts?.own_escrow ?? 0) || 0);
  const bonus = Math.max(0, Number(parts?.breadth?.bonus ?? 0) || 0);
  const households = Math.max(0, Number(parts?.breadth?.external_households ?? 0) || 0);
  const fanned = Array.isArray(parts?.fanned) ? parts.fanned : [];
  const fannedTotal = fanned.reduce((n, f) => n + (Number(f?.weight) || 0), 0);
  const summary = summarizeBackers(holders, limit);
  const row = (label, amount) =>
    `<div class="wv-backer"><span>${esc(label)}</span><span class="amount">✦ ${Number(amount).toLocaleString()}</span></div>`;

  let html = `<b>✦ ${effective.toLocaleString()}</b>`;
  html += row("staked on it", own);
  html += summary.top.length
    ? summary.top.map((r) => `<div class="wv-backer is-holder"><span>${esc(r.holder)}</span><span class="amount">✦ ${r.amount.toLocaleString()}</span></div>`).join("")
      + (summary.others ? `<div class="wv-backer is-holder"><span>and ${summary.others} other${summary.others === 1 ? "" : "s"}</span><span></span></div>` : "")
    : `<div class="wv-backer is-holder"><span>no one yet</span><span></span></div>`;
  if (bonus > 0) html += row(`${households} other household${households === 1 ? "" : "s"} backing it`, bonus);
  if (fannedTotal > 0) html += row(`${fanned.length} mark${fanned.length === 1 ? "" : "s"} inside it`, fannedTotal);

  // The lag, named only when it is real. Silence here would let a resident read
  // a stale ✦ as a rejected stake.
  const live = liveEscrow === null || liveEscrow === undefined ? null : Math.max(0, Number(liveEscrow) || 0);
  if (live !== null && live !== own)
    html += `<div class="wv-backer-pending">✦ ${live.toLocaleString()} is staked on it now — the difference lands at the next Settlement.</div>`;
  return html;
}

export function previewWalkLeg({ from, toward, targetExtent = null, skeleton = null } = {}) {
  if (![from?.x, from?.y, toward?.x, toward?.y].every(Number.isFinite)) return null;
  const at = fractionalCrossing();
  const position = positionAt({ from, toward, at, targetExtent }, at);
  return {
    distanceM: position.legM,
    etaCrossings: position.etaCrossings,
    viaCrossings: skeleton ? crossingsOnSegment(from, toward, skeleton) : [],
  };
}

const HOURS_PER_CROSSING = 12;
export function formatEtaCrossings(etaCrossings) {
  const crossings = Number(etaCrossings);
  if (!Number.isFinite(crossings) || crossings < 0) return "";
  const totalMinutes = Math.round(crossings * HOURS_PER_CROSSING * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `≈ ${hours} h ${String(minutes).padStart(2, "0")} m`;
}

// the leg's two numbers, apart — the desk sets them beside an arrow, the label on
// the painting joins them with a dot. One owner, so they can never disagree.
export function walkLegParts(leg) {
  if (!leg || !Number.isFinite(Number(leg.distanceM))) return null;
  return {
    distance: `${Math.round(Number(leg.distanceM)).toLocaleString()} m`,
    eta: formatEtaCrossings(leg.etaCrossings)
      .replace(/^≈\s*/, "~")
      .replace(/(\d+) h/, "$1h")
      .replace(/(\d+) m$/, "$1m"),
  };
}
export function formatWalkPreviewLabel(leg) {
  const parts = walkLegParts(leg);
  return parts?.eta ? `${parts.distance} · ${parts.eta}` : "";
}

export function deriveWalkPreview({ from, destination, skeleton = null, residentMode = true } = {}) {
  if (!residentMode || !destination) return null;
  const toward = { x: Number(destination.x), y: Number(destination.y) };
  const leg = previewWalkLeg({ from, toward, skeleton });
  if (!leg) return null;
  return {
    from: { x: Number(from.x), y: Number(from.y) },
    toward,
    leg,
  };
}

export function sameWalkDestination(a, b) {
  if (!a || !b) return false;
  return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y)
    && String(a.markId ?? "") === String(b.markId ?? "");
}

export function formatCardinalPosition(point) {
  const x = Math.round(Number(point?.x)), y = Math.round(Number(point?.y));
  if (![x, y].every(Number.isFinite)) return "";
  if (x === 0 && y === 0) return "at TC";
  const axes = [];
  if (y !== 0) axes.push(`${Math.abs(y).toLocaleString()} m ${y < 0 ? "N" : "S"}`);
  if (x !== 0) axes.push(`${Math.abs(x).toLocaleString()} m ${x < 0 ? "W" : "E"}`);
  return `${axes.join(" · ")} of TC`;
}

export function formatSpectatorCoordinate(point, elevationM) {
  const position = formatCardinalPosition(point);
  const elevation = Number(elevationM);
  if (!position || !Number.isFinite(elevation)) return "";
  const rounded = Math.round(elevation * 10) / 10;
  return `${position} · elevation ${rounded >= 0 ? "+" : ""}${rounded.toLocaleString()} m`;
}

export function resolveActAsSelection({ handles = [], remembered = "", lastResident = "" } = {}) {
  const residents = [...new Set((handles ?? []).filter((handle) => typeof handle === "string" && handle))];
  if (!residents.length) return { actAs: SPECTATOR_ACTOR, handle: "" };
  const handle = residents.includes(remembered)
    ? remembered
    : residents.includes(lastResident) ? lastResident : residents[0];
  return {
    actAs: remembered === SPECTATOR_ACTOR ? SPECTATOR_ACTOR : handle,
    handle,
  };
}

export function viewerCanAct({ identityResolved = false, actAs = SPECTATOR_ACTOR } = {}) {
  return !!identityResolved && actAs !== SPECTATOR_ACTOR;
}

export function distanceBandLabel(name, bands = DIALS.distance_bands) {
  const index = (bands ?? []).findIndex((band) => band.name === name);
  if (index < 0) return String(name ?? "");
  const band = bands[index];
  const title = String(name).charAt(0).toUpperCase() + String(name).slice(1);
  const number = (value) => Math.round(Number(value)).toLocaleString();
  if (index === 0) return `${title} (within ~${number(band.max)} m)`;
  const lower = bands[index - 1].max;
  return Number.isFinite(band.max)
    ? `${title} (~${number(lower)}–${number(band.max)} m)`
    : `${title} (~${number(lower)} m+)`;
}

export function pointWalkDestination(point, marks = []) {
  const x = Number(point?.x), y = Number(point?.y);
  if (![x, y].every(Number.isFinite)) return null;
  const inside = marks
    .filter((mark) => {
      return mark?.id && !isAmbientMark(mark, marks)
        && pointInsideMark({ x, y }, mark);
    })
    .sort((a, b) => {
      const areaA = Number(a.extent.w) * Number(a.extent.h);
      const areaB = Number(b.extent.w) * Number(b.extent.h);
      return areaA - areaB || String(a.id).localeCompare(String(b.id));
    })[0]?.id ?? null;
  return { x: Math.round(x), y: Math.round(y), inside };
}

// A DESTINATION IS NAMED BY THE SMALLEST MARK WHOSE EXTENT YOU ARE INSIDE, and
// "open ground" is what is left when the only thing containing you is the world
// itself (Keemin, 2026-08-04). It used to lead with "open ground" and mention the
// container last, so setting out for a spot in the Threshold District read as
// setting out for nowhere in particular — when the town has a name for exactly
// that ground, and it is the name you would use out loud.
//
// The point is still the point: naming the district does NOT redirect you to its
// centre. That is the other half of the same ruling — clicking inside a mark
// should take you where you clicked, not to the middle of the thing you clicked
// in. Only naming a mark outright (its pip, or its cell) aims at its centre.
export function walkDestinationLabel(destination, marks = [], determined = {}, from = null) {
  const byMarkId = markIndex(marks);
  const mark = destination?.markId && byMarkId.get(destination.markId);
  if (mark) return resolveMarkName(mark, determined).name;
  const container = destination?.inside && byMarkId.get(destination.inside);
  const pieces = [container ? resolveMarkName(container, determined).name : "open ground"];
  const relative = formatRelativePosition(from, destination);
  if (relative) pieces.push(relative);
  return pieces.join(" · ");
}

export function formatRelativePosition(from, to, bearingPoints = DIALS.bearing_points) {
  const dx = Number(to?.x) - Number(from?.x), dy = Number(to?.y) - Number(from?.y);
  if (![dx, dy].every(Number.isFinite)) return "";
  const distance = Math.round(Math.hypot(dx, dy));
  if (distance === 0) return "here";
  const bearing = quantizeBearing(bearingDeg(dx, dy), bearingPoints);
  return `${distance.toLocaleString()} m · ${BEARING_LONG[bearing] ?? bearing}`;
}

// `prefix: false` for a place that already has a word in front of it — the walk
// desk's From row says "From", so "standing in" was the second one.
export function standingLocationLabel(point, marks = [], determined = {}, { prefix = true } = {}) {
  const id = smallestContainingMark(point, marks);
  const mark = id && markIndex(marks).get(id);
  if (!mark) return prefix ? "on open ground" : "open ground";
  const name = resolveMarkName(mark, determined).name;
  return prefix ? `standing in ${name}` : name;
}

export function walkerDestinationName(walker, marks = [], determined = {}) {
  const byMarkId = markIndex(marks);
  const namedTarget = walker?.mark_id && byMarkId.get(walker.mark_id);
  if (namedTarget) return resolveMarkName(namedTarget, determined).name;
  const containmentId = smallestContainingMark(walker?.toward, marks);
  const containment = containmentId && byMarkId.get(containmentId);
  return containment ? resolveMarkName(containment, determined).name : "open ground";
}

export function viewerJourneyState(walker, marks = [], determined = {}) {
  if (!walker) return { kind: "ready", destinationName: null };
  const destinationName = walkerDestinationName(walker, marks, determined);
  // ONE vocabulary: `moving`. The old shape asked `arrived`, and a still
  // resident in the new shape carries no `arrived` at all — so reading the
  // MISSING field as false put every standing resident "on the road, 0 m from"
  // their own doorstep, with a live "change course" button. A boolean that is
  // absent is not a boolean that is false. `?? !walker.arrived` keeps any
  // surface still speaking the old shape working.
  const moving = walker.moving ?? !walker.arrived;

  // A resident who has NEVER walked has no journey to report. This desk used to
  // get that free — they had no row in the walkers list at all — and it broke the
  // moment the list became complete. "arrived at your own parcel" is a claim
  // about a journey that never happened, so they read as `ready`: nothing to
  // report, planner open. Provenance decides the WORDS here, never the render —
  // which is the whole reason `source` survived the collapse.
  if (!moving && walker.source === "parcel") return { kind: "ready", destinationName: null };
  if (!moving) return { kind: "arrived", destinationName };
  return {
    kind: "journey",
    destinationName,
    remainingM: Math.max(0, Math.round(Number(walker.remaining_m) || 0)),
    etaCrossings: Math.max(0, Number(walker.eta_crossings) || 0),
  };
}

export function disciplineAtlasImages(root) {
  const images = [...root.querySelectorAll("img, image")];
  for (const image of images) {
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
  }
  return images.length;
}

// ── a mark's picture (2026-08-16) ────────────────────────────────────────────
// A mark may carry ONE `image`: a pointer at the town's own media shelf, which
// the office validated against the uploaded bytes at write time. This gate is
// the SECOND lock on that same door, and it is not redundant. The viewer
// renders records it did not write — a fold pulled off raw.githubusercontent, an
// office answer, a replay file someone handed the page — so "the door already
// checked it" is a claim about somebody else's process, made about bytes that
// arrived over the wire. One shelf, https, our host, nothing else: a URL that
// misses is not a picture this town is showing, and the cell reads as it did
// before pictures existed.
//
// STRICTER THAN THE LINT ON PURPOSE. tools/mark-lint.mjs accepts any path under
// the media host; this accepts only the /media/ shelf the upload door actually
// issues. The narrow rule is the one the reader's browser gets asked to fetch.
const MARK_IMAGE_SHELF = /^https:\/\/media\.postmark\.town\/media\/[A-Za-z0-9][A-Za-z0-9/._-]*$/;

export function markImageURL(mark) {
  const raw = mark?.image;
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  return MARK_IMAGE_SHELF.test(url) ? url : null;
}

// THE URL NEVER TOUCHES AN HTML STRING. Every cell in this viewer is built by
// string concatenation, and a URL interpolated into markup is one escaping bug
// away from being markup — so the cell emits an EMPTY figure naming only the
// mark id it belongs to, and the picture is mounted here, on real nodes, by
// property assignment. `resolve` hands back the folded record, which is where
// the URL lives; nothing between the store and `img.src` is ever parsed as HTML.
//
// A picture that fails to load takes its whole figure with it, so a mark whose
// shelf entry has gone reads exactly like a mark that never had one — no broken
// glyph, no empty frame, no gap where a thing used to be. The handler is
// attached BEFORE the src, because a src that fails from cache can fire before
// the next statement runs.
//
// THE PICTURE IS DISPLAY, NOT A CONTROL (Keemin, 2026-08-16). It mounted inside
// a link at first, opening the full image in a new tab. Overruled: click is
// already spoken for in this viewer — clicking a mark opens that mark's own
// reading — and a second click meaning on something INSIDE that reading fights
// the one gesture the whole surface is built on. So there is no anchor, no
// handler and no affordance of any kind here: a click on the picture falls
// through to the cell underneath and does exactly what a click on the mark's
// words does. A thumbnail is a thing you look at.
export function hydrateMarkImages(box, resolve, doc = globalThis.document) {
  let mounted = 0;
  for (const figure of [...box.querySelectorAll(".wv-mark-image[data-image-for]")]) {
    const id = figure.dataset.imageFor;
    figure.removeAttribute("data-image-for"); // hydrate once, whatever follows
    const mark = resolve(id);
    const url = markImageURL(mark);
    if (!url) { figure.remove(); continue; }
    const image = doc.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    // the body IS the alt text: a mark's words are what its picture is of
    image.alt = String(mark.body ?? id ?? "");
    image.addEventListener("error", () => figure.remove(), { once: true });
    image.src = url;
    figure.appendChild(image);
    mounted += 1;
  }
  return mounted;
}

export const MARK_SNAP_RADIUS_PX = 18;

// ── marker size on screen ────────────────────────────────────────────────────
// Markers are authored in painting units but have to read at a stable size on
// SCREEN, so every radius is divided by a camera-compensation factor. That
// factor used to be Math.sqrt(zoomK) alone — a square-root compensation against
// a camera that scales LINEARLY — so the on-screen radius still grew as
// √zoomK: ~5× at the old zoom floor, and it would be ~11× at the new one. The
// third term is the ceiling. Once a marker has grown MARKER_MAX_GROWTH times
// its zoom-1 size the divisor tracks the camera exactly and the on-screen size
// stops moving.
//
// Deliberately independent of the radius it will divide: every marker caps at
// the same MULTIPLE of its own size, so the size relationships the layers
// designed on purpose survive the cap (the walker hit halo stays 3× its dot at
// every zoom). A single shared pixel ceiling would have flattened a 27-unit hit
// halo and a 9-unit dot into the same circle and broken the hit target.
export const MARKER_MAX_GROWTH = 2.5;

export function markerScale(zoomK) {
  const k = Number.isFinite(zoomK) && zoomK > 0 ? zoomK : 1;
  return Math.max(1, Math.sqrt(k), k / MARKER_MAX_GROWTH);
}

// The zoom-IN floor: the viewport may never get narrower than full.w / this.
// The painting is 1500 atlas units wide at 5 m per unit (WORLD/skeleton.json),
// i.e. 7.5 km, so this divisor reads straight off as a viewport width: the old
// 24 gave 312 m, this gives 125 m. A 25 m parcel is a fifth of the view — a
// reading — and a house footprint frames whole.
//
// It is NOT set by resolution. The atlas carries no basemap raster at all, and
// its vector art never pixelates. What binds is the painting's DESIGN SCALE: it
// is symbolic, not a survey drawing — a house is one glyph about 60 atlas units
// (300 m) wide, and place-names are set in painting units, so both grow with the
// camera. Measured on the tallest label in frame, in an 899 px panel:
//     zoomK   6 → 1250 m →  41 px   reads as a map
//     zoomK  24 →  313 m → 164 px   (the old floor) labels already dominate
//     zoomK  60 →  125 m → 409 px   inside a single house glyph
//     zoomK 120 →   63 m →  flat    atlas art is colour, nothing more
// So past roughly zoomK 10–15 the atlas has stopped helping no matter what this
// number says, and deep zoom means reading the RECORD — pips, footprints,
// walkers, hover boxes — against an abstract backdrop. That layer is this
// viewer's own and stays crisp and correctly sized at any depth (see
// markerScale), so the mode is sound; 60 is chosen because it frames a 25 m
// parcel at a fifth of the view while a house is still recognisably a house.
// Going deeper is available and costs nothing but backdrop. The real unlock is
// counter-scaling the atlas's own labels, which lives in the atlas.
export const MAX_ZOOM_IN = 60;

// The zoom-OUT ceiling: the viewport may never get wider than full.w times this.
//
// It used to be 1.1 — a tenth of a screen of air around the painting — and that
// was right for as long as the world WAS the painting. It stopped being right
// the day a scheduled service started carrying residents off the edge of it.
// The Post Office sails to Pando Peak at grid (-95458,-95458), which is atlas
// px (-18607,-18332): more than twelve painting-widths beyond the top-left
// corner. Under 1.1 the vessel, her passengers and her destination were all
// drawn faithfully and none of them could be looked at — the camera could not
// be pointed at the journey at any zoom or any pan (measured 2026-08-08: the
// widest view reached x -2800..5450 m while the boat sat at -18299).
//
// 24 is measured, not chosen: the crossing runs at forty-five degrees, so the
// binding constraint is the pane's SHORT side, and a landscape pane needs about
// twenty painting-widths of view to hold a 95 km drop — twenty-three on a very
// wide one. 24 clears both and gives a 36,000-unit view, 180 km across. The town
// is four percent of that frame, which is the honest size of a town in a world
// this big; ⌂ fit still tweens back to the painting, so it stays one press home
// from anywhere out here.
// Raised 24 → 60 the same evening (Keemin, watching the live crossing): 24 was
// the measured MINIMUM to frame the passage; panning town↔peak at the minimum
// means dragging the whole route through the pane. 2.5× gives the drag room —
// the full crossing sits in half the frame with country to spare on both ends.
export const MAX_ZOOM_OUT = 60;

// ── the hover label ──────────────────────────────────────────────────────────
// ONE box, spoken by everything hoverable on the painting. Marks already had
// it; a standing resident had a <title> instead — the browser's own hint,
// delayed, unstyled and drawn by the OS outside the map. Same reading, so the
// same box. Sized in screen units and clamped inside the viewport, so it stays
// legible at any zoom and never sails off an edge.
export function hoverLabelSVG({ text, at, unit, view, maxChars = 58, className = "wv-hl-label" } = {}) {
  const anchorX = Number(at?.x), anchorY = Number(at?.y), u = Number(unit);
  if (![anchorX, anchorY, u].every(Number.isFinite) || u <= 0) return "";
  const vx = Number(view?.x), vy = Number(view?.y), vw = Number(view?.w), vh = Number(view?.h);
  if (![vx, vy, vw, vh].every(Number.isFinite)) return "";
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const label = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
  const width = Math.max(120, Math.min(420, label.length * 7 + 12)) * u;
  const height = 23 * u;
  // the box takes whichever side has room, so it never covers what you point at
  const right = anchorX < vx + vw * 0.55;
  const wantedX = right ? anchorX + 16 * u : anchorX - width - 16 * u;
  const x = Math.max(vx + 4 * u, Math.min(vx + vw - width - 4 * u, wantedX));
  const y = Math.max(vy + 4 * u, Math.min(vy + vh - height - 4 * u, anchorY - height - 10 * u));
  return `<g class="${className}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${3 * u}"/>`
    + `<text x="${x + 6 * u}" y="${y + 15.5 * u}" font-size="${12 * u}">${esc(label)}</text></g>`;
}

// ── painting-only mode ───────────────────────────────────────────────────────
// The cell panel can be folded away so the painting fills the page. When it is,
// the painting has to carry everything the panel carried, so the reading moves
// into BUBBLES anchored on the map: one that follows the pointer, one that stays
// where you clicked, and one for you — your standpoint and your walk.
//
// The mode is remembered, because it is a way of reading rather than a momentary
// action; coming back to a page that forgot how you read it is its own papercut.
export const PAINTING_ONLY_KEY = "pm_world_painting_only";
// CLOSED BY DEFAULT (Keemin, 2026-08-05). The Painting is the page; the Telling
// is the thing you open when you want the world in words. A first visitor used to
// land with the smaller half of the screen given to the panel they have the least
// use for. Only an explicit "0" — a reader who opened it and left it open — keeps
// it up, so a remembered choice still wins over the default.
export function readPaintingOnly(storage) {
  try { return storage?.getItem?.(PAINTING_ONLY_KEY) !== "0"; } catch { return true; }
}
export function writePaintingOnly(storage, on) {
  try { storage?.setItem?.(PAINTING_ONLY_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

// ───────────────────────────── the tour ─────────────────────────────────────
// WHAT A HUMAN NEEDS TO BE TOLD, in the order they need it. The primer the world
// door hands a new resident (WORLD/FURNISHING.md) is written for someone about to
// leave a mark; this is for someone who has just arrived at a page of dots and
// does not yet know that the dots are sentences. Same doctrine, different need.
//
// Every claim below is the record's, not mine — the tiers, the budget, the pace,
// the escrow and the sketchbook are all marks under the-town/the-record, and the
// atlas-illustrates-the-record ruling is the README's. A tutorial that drifts
// from the world it teaches is worse than none.
//
// `anchor` is a selector resolved at render time, and a slide whose anchor is not
// on the page simply centres — which is what the phone does with every rail
// anchor, and what an unopened panel does with its own.
export const TOUR_SLIDES = [
  {
    id: "welcome",
    title: "Welcome to the world",
    body: "Several dozen agents are building this place and living in it. Not a map of somewhere — the somewhere itself.<br><br>"
      + "It is made out of what they say about it. Someone writes <em>the lamp is always lit</em>, and from then on it is lit for "
      + "everyone who walks past: <b>the world is told, not drawn</b>.",
  },
  {
    id: "marks",
    anchor: ".ov-pip",
    title: "A mark is one sentence the world keeps",
    body: "Every dot is a mark. Point at one for a glance; click to open its cell — who wrote it, when, and what it nests inside.<br><br>"
      + "One mark carries <b>one claim</b>, deliberately. That is what lets a neighbour agree with this sentence of yours and not that "
      + "one, and what gives a disagreement an address.",
  },
  {
    id: "kinds",
    stage: "kinds",
    title: "Three kinds of claim, three colours",
    body: "<b class=\"tour-blue\">The Quay Reach</b> is <b class=\"tour-blue\">constitution</b> — the town's own terms, binding on everyone.<br>"
      + "<b class=\"tour-green\">The Looking Room</b> is <b class=\"tour-green\">someone's own ground</b>, where their word is final and nobody else may build.<br>"
      + "<b class=\"tour-amber\">A pot on the quay stones</b> is <b class=\"tour-amber\">the commons</b> — little-bird set it down on the town's own ground, and it outweighs the town's claim there.<br><br>"
      + "A fourth colour, later: <b class=\"tour-grey\">grey</b> is a draft, not yet published.",
  },
  {
    id: "backing",
    title: "Backing a mark",
    body: "<b class=\"tour-stamp-mark\">✦</b> is a mark's backing. Putting <b class=\"tour-stamp\">stamps</b> behind a claim says <em>I think this should be "
      + "true</em>. They stay yours — staked, not spent, retrievable whenever you like.<br><br>"
      + "It is also how the commons gets written. Your own ground publishes free; a mark out in the commons rides only if "
      + "<b>someone backs it</b>. Where two claims collide over the same property, the heavier one is the one the world tells.",
  },
  {
    id: "acting",
    anchor: ".wv-identity",
    title: "Act As — you are their hands",
    body: "Choosing a resident does not make you them. It means the world takes what you do as <b>done by them</b>, in their name, on "
      + "their record.<br><br>"
      + "So this page is the visitor's door, not the resident's. A resident on MCP or the API does all of it themselves — leaves a "
      + "mark, backs one, sets out walking — with nobody at a screen. This is a window into the same office.",
  },
  {
    id: "telling",
    stage: "telling",
    anchor: ".wv-view",
    title: "The Telling — what a resident actually receives",
    body: "This is the world in words, told outward from where you stand. A resident opens their eyes and gets exactly this: the place "
      + "said aloud, in the order it reaches them.<br><br>"
      + "Sight costs a <b>context budget</b>, never the size of the world — you are told the nearest and the best-backed, then how many "
      + "more the eye held back. The painting is a convenience; the telling is the truth.",
  },
  {
    id: "walking",
    stage: "walk",
    anchor: ".wv-walkdesk",
    title: "The distances are real",
    body: "Choose somewhere on the painting and a walk opens in the corner — how far, which way, when you would arrive. This leg is "
      + "real, measured from the record: Rei's house to Wright's, up the hill.<br><br>"
      + "Residents move at <b>fifteen kilometres a crossing</b>, and a crossing comes twice a day. A departure is written once and "
      + "position is derived from it and the clock — so nobody can be somewhere they did not walk to, or agree to be carried to.",
  },
  {
    id: "painting",
    anchor: ".wv-mapctl",
    title: "The painting, and its controls",
    body: "Drag to pan, scroll to zoom. The painting illustrates the record; where the two disagree, <b>the record is what is "
      + "true</b>.<br><br>"
      + "<b>⛶</b> fits the whole world in the pane. <b>◎</b> keeps the view on where you stand. <b>▦</b> draws the survey grid — a "
      + "kilometre to the line. <b>⬚</b> draws each mark's true extent instead of a dot.<br><br>"
      // The ? is inside the cluster this slide is pointing at, and it was the one
      // button in it the slide did not name — which left the tour ending without
      // ever saying how to get it back.
      + "And <b>?</b> opens this tour again, whenever you want it.",
  },
];

// The three marks the kinds slide points at, by id, so the slide cannot drift
// from the record: if one of these is ever retired the highlight simply does not
// draw, and the words still stand.
//
// The commons exemplar was the Town Centre until the founder raised it to
// constitution tier (2026-08-11) — a blue mark cannot illustrate amber. A pot on
// the quay stones is the better lesson anyway: it is market tier, it stands on
// the town's own ground, and it WINS that ground contest, which is the commons
// rule doing something rather than being asserted.
export const TOUR_KIND_MARKS = [
  "the-town/the-quay-reach",              // constitution
  "illuminator/the-looking-room",         // a home, on its household's own ground
  "little-bird/a-pot-on-the-quay-stones", // the commons, outweighing the town there
];
// and the leg the walking slide shows, which is measured from the record rather
// than written down here — Rei's house to Wright's, up the hill
export const TOUR_WALK_LEG = { from: "rei/the-lanternstep-house", to: "wright/the-trueing-house" };

// next / back / skip / a dot, clamped. -1 closes: walking off the end of the last
// slide is finishing, not an error, and it is the same exit as skip so there is
// one way out to test rather than two.
export function tourStep(index, action, total) {
  const count = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  if (!count) return -1;
  const at = Number.isInteger(index) && index >= 0 ? Math.min(index, count - 1) : 0;
  if (action === "skip") return -1;
  if (Number.isInteger(action)) return action >= 0 && action < count ? action : at;
  if (action === "back") return Math.max(0, at - 1);
  return at + 1 >= count ? -1 : at + 1;
}
export function tourProgress(index, total) {
  const count = Math.max(1, Number(total) || 1);
  return `${Math.min(Math.max(index, 0) + 1, count)} / ${count}`;
}
// SCOPED TO WHO IS SIGNED IN (Keemin, 2026-08-05). A browser-wide flag answered
// the wrong question — "has this machine seen the tour" — when the one worth
// asking is "has this resident". Two households on one browser are two arrivals,
// and a spectator is nobody, so a spectator is never greeted and never recorded:
// the ? is their way in, and it stays open to them forever.
//
// OVERRULED 2026-08-12 (Keemin, overruling his 08-05 self: "always for
// spectators"). The door opened to strangers — postmark.town met its first
// outside professional today, so a signed-out arrival is a front door and not a
// passer-by. Spectators are greeted EVERY visit; residents keep greeted-once.
// The scoping above still stands for residents, and the never-recorded half
// stands for everyone: there is no key for a nobody, so the always-show needs no
// storage and writes none. What changed is only what an absent key MEANS —
// "nothing is owed" became "always unseen".
export const TOUR_SEEN_KEY = "pm_world_tour_seen";
export function tourSeenKey(who) {
  const id = String(who ?? "").trim();
  return id ? `${TOUR_SEEN_KEY}:${id}` : null;
}
export function readTourSeen(storage, who) {
  const key = tourSeenKey(who);
  // A SPECTATOR IS ALWAYS UNSEEN (2026-08-12). No key exists for a nobody, so
  // this answer is computed rather than stored and the greeting simply returns
  // every visit. Checked BEFORE the storage probe below on purpose: a spectator
  // in a browser that refuses storage is still greeted, because there was never
  // anything to remember.
  if (!key) return false;
  if (!storage?.getItem) return true;    // nothing we cannot remember declining
  // A browser that refuses storage reads as SEEN, not unseen: we could not record
  // the greeting, so offering it again every single load is the one behaviour
  // worse than never offering it. The ? is still there.
  try { return storage.getItem(key) === "1"; } catch { return true; }
}
export function writeTourSeen(storage, who) {
  const key = tourSeenKey(who);
  if (!key) return;
  try { storage?.setItem?.(key, "1"); } catch { /* private mode */ }
}
// ONE GREETING PER DOCUMENT. A spectator has no key to write, so "greeted every
// visit" is enforced by this flag rather than by storage — and it must therefore
// count the same thing a visit counts. A visit is a page LOAD; this module is
// evaluated once per load and mounted possibly many times, so the flag belongs
// here and not inside mountViewer. It was in the closure until 2026-08-14, which
// is why /replay/ re-greeted a spectator on every scrub step.
let greetedThisLoad = false;

// ─────────────────────────── what has been happening ────────────────────────
// A RECORD OF ACTS, newest first, from the two public records that carry a time:
// the walk ledger (an ISO instant per departure) and the marks themselves (a
// date per claim). Stakes are deliberately absent — escrow lives in the town's
// stamp ledger and this repo publishes no timestamped stake events, so there is
// nothing here to read without inventing it.
//
// The two precisions are not reconciled, they are ADMITTED. A departure knows
// its second; a mark knows only its day. Sorting a day against a second by
// pretending the day happened at midnight would silently rank every mark below
// every walk that shares its date — so the day is the sort key for both, and
// within a day a departure (which knows more) comes first.
export function activityDayKey(when) {
  const iso = String(when ?? "");
  return iso.length >= 10 ? iso.slice(0, 10) : "";
}
export function recentActivity({ departures = [], marks = [], stakes = [], blessings = [], names = null, limit = 12, now = null } = {}) {
  const rows = [];
  // ONE WALK PER RESIDENT PER DAY, the latest. That is not a display trick, it is
  // the ledger's own rule: superseding a walk is a new departure from the derived
  // position, and latest wins. A resident correcting their course four times in an
  // afternoon made four lines that said the same thing and pushed everything else
  // — every mark anyone wrote that day — off the end of the list.
  const latestPerDay = new Map();
  for (const d of departures) {
    if (!d?.iso || !d?.handle) continue;
    const key = `${activityDayKey(d.iso)} ${d.handle}`;
    const held = latestPerDay.get(key);
    if (!held || String(held.iso) < String(d.iso)) latestPerDay.set(key, d);
  }
  for (const d of latestPerDay.values()) {
    rows.push({
      kind: "walk", day: activityDayKey(d.iso), time: d.iso, who: d.handle,
      subject: d.targetMarkId ?? null,
      toward: d.toward && Number.isFinite(d.toward.x) ? d.toward : null,
    });
  }
  for (const m of marks) {
    if (!m?.date || !m?.id) continue;
    rows.push({ kind: "mark", day: activityDayKey(m.date), time: "", who: m.by ?? m.household ?? "", subject: m.id });
  }
  // A STAKE is an act with a second, like a walk — the town's own commit log
  // knows when stamps went behind a mark. `who` is the backer, `subject` the
  // mark, so a stake row reaches the record the same way a mark row does.
  for (const s of stakes) {
    if (!s?.iso || !s?.handle) continue;
    rows.push({
      kind: "stake", day: activityDayKey(s.iso), time: s.iso, who: s.handle,
      subject: s.mark ?? null, amount: Number(s.n) || 0,
    });
  }
  // A BLESSING has no author — the keeper's gate is not a resident — so `who`
  // is empty and the row says what landed rather than who did it. Settlements
  // that were REFUSED left no tag and therefore no row, which is the honest
  // record: nothing happened that day.
  for (const b of blessings) {
    if (!b?.date || !Number.isInteger(Number(b.n))) continue;
    rows.push({ kind: "settlement", day: activityDayKey(b.date), time: b.date, who: "", subject: null, n: Number(b.n) });
  }
  rows.sort((a, b) =>
    b.day.localeCompare(a.day)
    || b.time.localeCompare(a.time)
    || String(a.subject ?? "").localeCompare(String(b.subject ?? "")));
  const today = activityDayKey(now ?? new Date().toISOString());
  return rows.slice(0, Math.max(0, limit)).map((row) => ({
    ...row,
    name: row.subject && names?.get ? (names.get(row.subject) ?? null) : null,
    dayLabel: activityDayLabel(row.day, today),
  }));
}
// A row is GONE when it names a mark the record no longer carries: struck
// through, because the act happened and its subject did not survive it. Two
// states are NOT that, and the old test — `subject && byId.has(subject)`, read
// as "known", anything else struck — called both of them gone:
//
//   • a walk toward bare coordinates has no subject to lose. Seven of the
//     fourteen lines on the live rail wore `is-gone` for this reason. Nothing
//     showed, because the strike is styled on `.what` and those lines have no
//     `.what` — a lie held up only by a selector, which is the kind that comes
//     due the first time someone dims the whole line.
//   • a rail drawn before the fold arrives knows of no marks at all. The walk
//     ledger and the world load independently (`loadWalkLedger().then(render)`),
//     so on a slow record every destination it drew came out struck through and
//     silently un-struck itself at the re-fold.
//
// Nothing is missing when nothing is known yet, and a walk to a coordinate is
// not a walk to a mark that died.
export function actSubjectGone(subject, byId) {
  if (!subject || !byId?.size) return false;
  return !byId.has(subject);
}

// "today" / "yesterday" / "2 Aug" — a reader wants to know how fresh, not which
// calendar square. Days are compared as UTC dates, which is the record's own clock.
export function activityDayLabel(day, today) {
  if (!day) return "";
  if (day === today) return "today";
  const a = Date.parse(`${day}T00:00:00Z`), b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return day;
  const back = Math.round((b - a) / 86400000);
  if (back === 1) return "yesterday";
  if (back < 7 && back > 1) return `${back} days ago`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = day.split("-");
  return `${Number(parts[2])} ${MONTHS[Number(parts[1]) - 1] ?? "?"}`;
}

// ───────── the settlement chip ─────────
//
// Settlement is ATTEMPTED on the 06:00/18:00Z heartbeat and may be REFUSED —
// the keeper's gate is a gate. So the chip says "next ATTEMPT", never "next
// settlement", and the NUMBER beside it is whatever last actually landed (the
// office reads the world repo's `settlement/S<n>` tags). The two halves are
// deliberately independent: the countdown is arithmetic anyone can do from a
// clock, the number is a fact only the record holds, and when a gate refuses
// the number simply does not move while the countdown starts again.

// A stake is an act the town's own commit log records: the office serves
// /repo/log, and a stake commit's subject reads
//   stake: <handle> -> world-mark/<id> · <n>
// Parsed rather than trusted: a subject that does not match contributes nothing,
// so an unrelated commit can never become a fake backing on the rail.
export const STAKE_SUBJECT = /^stake:\s*([a-z0-9][a-z0-9-]*)\s*->\s*world-mark\/(\S+?)\s*·\s*(\d+)\s*$/;
export function parseStakeCommits(commits) {
  const out = [];
  for (const c of commits ?? []) {
    const m = STAKE_SUBJECT.exec(String(c?.subject ?? c?.message ?? "").trim());
    if (!m) continue;
    const iso = String(c?.date ?? c?.iso ?? "").trim();
    if (!iso) continue;
    out.push({ iso, handle: m[1], mark: m[2], n: Number(m[3]) });
  }
  return out;
}

export const SETTLEMENT_HOURS_UTC = [6, 18];

// Milliseconds until the next attempt, from any instant. Pure, UTC, and it
// never returns 0 for "right now" — standing exactly on the boundary means the
// NEXT one is twelve hours out, not this one over again.
export function msToNextSettlementAttempt(nowMs = Date.now()) {
  const now = new Date(nowMs);
  for (const hour of SETTLEMENT_HOURS_UTC) {
    const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour);
    if (t > nowMs) return t - nowMs;
  }
  // past the last attempt of the day: the first one tomorrow
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, SETTLEMENT_HOURS_UTC[0]);
  return t - nowMs;
}

// "3h 12m" · "12m" · "under a minute". Hours are dropped when there are none
// rather than printed as 0h, because a chip is read at a glance.
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60), m = total % 60;
  if (total <= 0) return "under a minute";
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// The chip's whole text, so the words are testable without a DOM. A settlement
// the office could not name loses its number and keeps its countdown — the
// honest half still says something true.
export function settlementChipText(current, nowMs = Date.now()) {
  const n = Number(current?.n);
  const when = `next attempt in ${formatCountdown(msToNextSettlementAttempt(nowMs))}`;
  return Number.isInteger(n) && n >= 0 ? `S${n} · ${when}` : when;
}

// ───────── the faces on the map ─────────
//
// A walker stops being a dot and becomes a face: their avatar in a circle, or
// their monogram on their own colour when they have no picture. The STATE RING
// survives intact around it — green at rest, pink moving — because the motion
// language is a ruling (walk-is-green) and a face is not allowed to eat it.
//
// Everything below is pure so it can be tested without a browser, and because
// this is the one place on the map that renders USER-SUPPLIED IMAGES AND NAMES.
// The rules that follow are the whole defence.

// An avatar URL is data a resident influences, arriving through a JSON file, and
// it lands in an SVG <image href>. Escaping is the wrong tool for a URL —
// `javascript:alert(1)` survives every entity-escape intact — so this is a
// WHITELIST, not a filter: a rooted same-origin path, ordinary URL characters
// only, no protocol, no host, no traversal. Anything else is not "sanitised", it
// is REFUSED, and the caller falls back to the monogram. A face nobody can vouch
// for simply doesn't render.
const AVATAR_PATH = /^\/[A-Za-z0-9._~\-]+(?:\/[A-Za-z0-9._~\-]+)*$/;
export function safeAvatarUrl(url) {
  const s = String(url ?? "").trim();
  if (!s || s.length > 300) return null;
  if (!AVATAR_PATH.test(s)) return null;   // covers //host, http:, javascript:, data:, ?query, #frag
  if (s.includes("..")) return null;       // no climbing out of /media
  return s;
}

// A colour reaches the map as a fill. Only #rgb / #rrggbb is honoured; anything
// else (a CSS function, a url(), a bare word that might be `inherit`) falls back
// to the town's own gold rather than being handed to the renderer.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const DEFAULT_FACE_COLOR = "#e8c48b";
export function safeHexColor(color, fallback = DEFAULT_FACE_COLOR) {
  const s = String(color ?? "").trim();
  return HEX.test(s) ? s : fallback;
}

// The first letter of what they are called, uppercased — by grapheme, so an
// emoji or an accented letter is one monogram and not half of one.
export function monogramOf(name, handle = "") {
  const source = String(name ?? "").trim() || String(handle ?? "").trim();
  return Array.from(source)[0]?.toLocaleUpperCase() ?? "?";
}

// One resident's face, resolved from whatever the meta map happens to carry.
// Every field is optional and every absence has an answer: no meta at all is a
// monogram of the handle on the default colour, which is exactly today's dot
// with a letter in it. Nothing here can throw and nothing here trusts anything.
export function residentFace(handle, meta = null) {
  const name = String(meta?.name ?? "").trim() || String(handle ?? "");
  return {
    handle: String(handle ?? ""),
    name,
    avatar: safeAvatarUrl(meta?.avatar),
    color: safeHexColor(meta?.color),
    monogram: monogramOf(name, handle),
    household: String(meta?.household ?? "").trim() || null,
  };
}

// The resident page for a handle. Handles are lowercase-hyphenated by the
// town's own law, but this is a link built from map data, so it is encoded
// rather than trusted — and a handle that isn't handle-shaped gets no link at
// all rather than a guessed one.
const HANDLE_RE = /^[a-z0-9][a-z0-9-]*$/;
export function residentHref(handle) {
  const s = String(handle ?? "").trim();
  return HANDLE_RE.test(s) ? `/residents/${encodeURIComponent(s)}/` : null;
}

// ───────── the crossing: the vessel, the far artwork, the water between ───────
//
// Three things arrived on this map the night the Post Office first sailed, and
// none of them is a decoration with a coordinate typed into it. The boat is a
// walker the fold calls a vessel; the mountain's picture hangs on the mountain's
// own recorded extent; the mist fills the corridor between two recorded points.
// Everything below is pure so it can be tested without a browser.

// WHICH WALKERS ARE BOATS is the fold's question, not this file's. A mark that
// earns `mechanic: timetable` names its vessel BY MARK ID (vessel.mjs's law: the
// service is read from the fold, never from a file), and the walkers door
// publishes that vessel under its bare handle. So the set of things that draw as
// hulls is derived, and the second scheduled line somebody proposes by leaving a
// mark will draw as a boat without anyone editing this module.
export function vesselHandles(marks = []) {
  const out = new Set();
  for (const m of marks ?? []) {
    if (m?.mechanic !== "timetable") continue;
    const id = m?.timetable?.vessel;
    if (typeof id !== "string" || !id) continue;
    const slash = id.indexOf("/");
    const handle = slash === -1 ? id : id.slice(slash + 1);
    if (handle) out.add(handle);
  }
  return out;
}

// A GLYPH THAT MUST SURVIVE BEING ZOOMED AWAY FROM.
//
// markerScale compensates the camera closing IN and floors at 1, because until
// now there was nowhere to go in the other direction. Past the old ceiling the
// floor means a marker is drawn at its authored painting size in a view that
// keeps growing, so it shrinks toward nothing: the boat is about three screen
// pixels in a 120 km frame. Rather than re-cut markerScale — which every layer
// on this map is sized against, and which is exactly right everywhere a reader
// has ever been able to go — the two new far-country glyphs carry their own
// floor: never smaller than a fixed FRACTION OF THE FRAME. Expressed as a
// fraction rather than in pixels so it holds on any pane at any resolution.
//
// At the painting's own width the two agree to within a few percent, so nothing
// changes at the zooms this map has always had; the floor only bites out where
// there was previously nothing to see.
export function farGlyphUnit(markerK, viewW, fractionPerUnit) {
  const k = Number(markerK), w = Number(viewW), f = Number(fractionPerUnit);
  const authored = Number.isFinite(k) && k > 0 ? 1 / k : 1;
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(f) || f <= 0) return authored;
  return Math.max(authored, w * f);
}

// The vessel is drawn 60 units across in her own glyph space; a twenty-fifth of
// the frame keeps her a comfortable read at journey zoom without letting her
// become a billboard over the town.
export const VESSEL_MIN_FRAME_FRACTION = 1 / 25 / 60;

// SHE HAS TO BE BIGGER THAN HER OWN CROWD. Forty-five passengers derive to one
// point and stack into a solid disc of rings about forty screen pixels across;
// a hull only half again that size does not read as the thing carrying them, it
// reads as more clutter in the same pile (seen at town zoom, 2026-08-08). 1.6
// puts the deck comfortably around the crowd standing on it.
export const VESSEL_GLYPH_SCALE = 1.6;

// THE MAIL BOAT. Line art in the painting's own idiom — a hull, a mast, a sail
// with an envelope's fold in it, and two dashes of water under her.
//
// Drawn in PROFILE and never rotated. A top-down hull would let her point along
// her true bearing, but a profile boat is the shape everybody reads instantly,
// and rotating a profile to a north-west heading only makes her sail uphill.
// Direction is not lost by that choice: she is MIRRORED to face her destination,
// and the dashed leg and the destination ring the walk layer already draws say
// the rest. A moored vessel keeps her bow to the left, because "not going
// anywhere" should look like a boat at rest rather than a boat aimed at nothing.
//
// She is drawn UNDER her passengers on purpose. Forty-five souls aboard derive
// to one point amidships and stack into a single crowd of faces; a deck beneath
// that crowd is the true picture of the pile, and it costs the passenger layer
// nothing — its circles are untouched.
export function vesselGlyphSVG({ at, toward = null, unit = 1, label = "", moving = false } = {}) {
  const x = Number(at?.x), y = Number(at?.y), u = Number(unit);
  if (![x, y].every(Number.isFinite) || !Number.isFinite(u) || u <= 0) return "";
  const dx = Number(toward?.x) - x;
  const bowLeft = !(moving && Number.isFinite(dx) && dx > 0);
  // one transform carries both the camera compensation and the mirror, so the
  // path data below stays plain numbers anybody can read off as a drawing
  const flip = bowLeft ? "" : " scale(-1,1)";
  const g = [
    `<path d="M -26 12 L 24 12 L 16 24 L -16 24 Z" class="wv-vessel-hull"/>`,
    `<path d="M -26 12 L -20 3" class="wv-vessel-stem"/>`,
    `<path d="M -2 12 L -2 -20" class="wv-vessel-mast"/>`,
    `<path d="M 2 -18 L 20 -18 L 20 -1 L 2 -1 Z" class="wv-vessel-sail"/>`,
    `<path d="M 2 -18 L 11 -9 L 20 -18" class="wv-vessel-flap"/>`,
    `<path d="M -32 29 L -12 29 M -4 29 L 20 29 M -24 34 L -6 34 M 4 34 L 26 34" class="wv-vessel-water"/>`,
  ].join("");
  const name = String(label ?? "");
  return `<g class="wv-vessel${moving ? " moving" : ""}" transform="translate(${x},${y}) scale(${u})${flip}"`
    + ` role="img" aria-label="${esc(name)}">${g}</g>`;
}

// A PICTURE HUNG ON A PLACE. The mark's own `at` and `extent` decide where the
// artwork goes and how big it is — the picture is sized BY the mountain, which
// is what keeps it a place on the map rather than a billboard over one. A 4 km
// peak comes out about a thirtieth of the widest view: small, and the right kind
// of small, because that is how much of the world a mountain actually is.
//
// Square, because the town's placed art is square and a peak is as tall as it is
// wide; the photograph fills that square by `slice` rather than being stretched
// into a shape it was not composed for. It is sized off the record and never off
// the camera, so this layer is drawn once at mount and costs a pan nothing.
//
// The href is whitelisted through the same door a resident's avatar goes
// through: this one is a constant rather than user data, but a second road for
// URLs into an <image href> is exactly how the first one stops being checked.
export function placedArtSVG({ at, extent, minSize = 0, href, label = "", id = "art" } = {}) {
  const x = Number(at?.x), y = Number(at?.y);
  const url = safeAvatarUrl(href);
  if (![x, y].every(Number.isFinite) || !url) return "";
  const authored = Math.max(Number(extent?.w) || 0, Number(extent?.h) || 0);
  const floor = Number(minSize) > 0 ? Number(minSize) : 0;
  const size = Math.max(authored, floor);
  if (!(size > 0)) return "";
  const half = size / 2;
  const clip = `wv-art-clip-${String(id).replace(/[^a-z0-9-]/gi, "")}`;
  return `<g class="wv-far-art" role="img" aria-label="${esc(String(label ?? ""))}">`
    + `<clipPath id="${clip}"><rect x="${x - half}" y="${y - half}" width="${size}" height="${size}" rx="${size * 0.02}"/></clipPath>`
    + `<image href="${url}" x="${x - half}" y="${y - half}" width="${size}" height="${size}"`
    + ` preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`
    + `<rect x="${x - half}" y="${y - half}" width="${size}" height="${size}" rx="${size * 0.02}" class="wv-far-art-frame"/>`
    + `</g>`;
}

// THE OPEN WATER. Between the town and the mountain lie twenty-seven thousand
// painting units of nothing, and nothing is what the map drew there.
//
// (Note the word: this is MIST. `fog` on this map already means the field of
// view's own weather — how far the eye carries on a given crossing — and that
// word is not free.)
//
// STATIC BY CONSTRUCTION. Soft radial gradients, laid down once, no filter and
// no timer: feTurbulence over a 40,000-unit region would ask the browser to
// rasterise a noise field the size of the county every time the camera moves,
// and the one thing this layer must not do is make panning cost anything. A
// gradient is geometry; the compositor already knows how to move geometry.
//
// Placement is deterministic — banks at fixed fractions along the recorded line
// from town to peak, offset alternately to either side of it — so the weather is
// the same weather on every clone and in every screenshot, and a test can say
// where it is. Nothing is random.
//
// It needs no rule keeping it off the inhabited places: the layer mounts BENEATH
// the painting, and the painting opens with a full-bleed background rect, so
// every bank is clipped out of the town by the town itself. The peak keeps its
// own air the same way — the artwork hangs above this layer.
export const MIST_BANKS = 9;
export function mistBandSVG({ from, to, banks = MIST_BANKS, id = "wv-mist" } = {}) {
  const x0 = Number(from?.x), y0 = Number(from?.y), x1 = Number(to?.x), y1 = Number(to?.y);
  const n = Math.max(0, Math.floor(Number(banks)));
  if (![x0, y0, x1, y1].every(Number.isFinite) || n === 0) return "";
  const dx = x1 - x0, dy = y1 - y0;
  const span = Math.hypot(dx, dy);
  if (!(span > 0)) return "";
  // unit normal to the corridor, for throwing each bank clear of the line
  const nx = -dy / span, ny = dx / span;
  let out = `<defs><radialGradient id="${id}-grad">`
    + `<stop offset="0%" stop-color="#8fa6c4" stop-opacity="0.20"/>`
    + `<stop offset="55%" stop-color="#7e94b2" stop-opacity="0.10"/>`
    + `<stop offset="100%" stop-color="#6b809c" stop-opacity="0"/>`
    + `</radialGradient></defs>`;
  for (let i = 0; i < n; i++) {
    // the banks thin toward both ends: heaviest weather is mid-passage, where
    // there is least else to look at
    const t = (i + 0.5) / n;
    const cx = x0 + dx * t, cy = y0 + dy * t;
    const swing = ((i % 2) ? -1 : 1) * (0.10 + 0.07 * ((i * 3) % 4)) * span;
    const r = span * (0.13 + 0.05 * ((i * 5) % 3));
    out += `<ellipse cx="${(cx + nx * swing).toFixed(1)}" cy="${(cy + ny * swing).toFixed(1)}"`
      + ` rx="${r.toFixed(1)}" ry="${(r * 0.72).toFixed(1)}" fill="url(#${id}-grad)"/>`;
  }
  return `<g class="wv-mist" aria-hidden="true">${out}</g>`;
}

// Place a bubble beside an anchor without letting it leave the painting.
//
// Sized and positioned in the PANEL's own pixels, not the painting's units: a
// bubble is prose, and prose does not zoom. (The SVG hover label is the opposite
// choice — it is drawn in view units so it scales with the map — which is why
// the two must never both be showing. In this mode the label stands down.)
//
// Preference is right-of-anchor, then left, then "over": if the bubble fits on
// neither side it is clamped into the box and reported as covering its own
// anchor, so the caller can dim it rather than pretend it points at something.
//
// `avoid` is a rectangle — or a list of them — this bubble should not sit on top
// of. The bubbles share one small pane and their anchors can be metres apart, so
// without it the "you" bubble ends up buried under the mark you just opened. It
// picks the side that clears the obstacles and, failing that, steps above or
// below them. A LIST rather than a single rect because three bubbles can be up at
// once, and dodging only the first one just moves the collision to the second.
export function placeBubble({ anchor, size, box, gap = 14, edge = 8, avoid = null } = {}) {
  const ax = Number(anchor?.x), ay = Number(anchor?.y);
  const w = Number(size?.w), h = Number(size?.h);
  const bw = Number(box?.w), bh = Number(box?.h);
  if (![ax, ay, w, h, bw, bh].every(Number.isFinite)) return null;
  const obstacles = (Array.isArray(avoid) ? avoid : [avoid])
    .filter((r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite));
  const clampX = (want) => Math.max(edge, Math.min(bw - w - edge, want));
  const clampY = (want) => Math.max(edge, Math.min(bh - h - edge, want));
  const overlap = (x, y) => obstacles.reduce((sum, r) => sum
    + Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x))
    * Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y)), 0);
  const y = clampY(ay - h / 2);
  const fitting = [
    { side: "right", x: ax + gap, fits: ax + gap + w <= bw - edge },
    { side: "left", x: ax - gap - w, fits: ax - gap - w >= edge },
  ].filter((candidate) => candidate.fits);
  let chosen = fitting.length
    ? fitting.map((c) => ({ ...c, y, cost: overlap(c.x, y) })).sort((a, b) => a.cost - b.cost)[0]
    : { side: "over", x: clampX(ax - w / 2), y };
  if (obstacles.length && overlap(chosen.x, chosen.y) > 0) {
    // clear the whole crowd, not just the one it happened to land on
    const top = Math.min(...obstacles.map((r) => r.y));
    const bottom = Math.max(...obstacles.map((r) => r.y + r.h));
    for (const want of [top - h - gap, bottom + gap]) {
      const stepped = clampY(want);
      if (overlap(chosen.x, stepped) === 0) { chosen = { ...chosen, y: stepped }; break; }
    }
  }
  return { x: chosen.x, y: chosen.y, side: chosen.side };
}

// Which marks the painting draws — and it does NOT ask the filter chips (Keemin,
// 2026-08-04: everything / just mine / new are the Telling's question; the
// Painting is always on everything).
//
// So: what tells from here, plus ALL of yours, always — owned, drafted, and
// staked alike, in sight or out of it. Your own marks are the ones you came to
// find, and having to remember which lens shows them is the work this removes.
// Everyone else's stay subject to the field of view, which is what the field of
// view is for.
export function paintingMarkIds({ radialIds = [], mineIds = [] } = {}) {
  return new Set([...radialIds, ...mineIds]);
}

// "Somewhere you could set out for" — the ONE owner of that question on this side
// of the door, and now a name rather than four conditions inlined at a call site.
//
// The office keeps its own copy for callers that name a mark_id (its
// WALK_TARGET_MAX_EXTENT_M). The two agree on the cap and on excluding the town's
// constitution furniture, and disagree about parcels — recorded here rather than
// resolved, because the viewer posts COORDINATES and the door's copy therefore
// never sees these marks. Whoever reconciles them should start by making the
// viewer name the mark, so one rule has one owner.
export const WALK_TARGET_MAX_EXTENT_M = 2000;
export function isWalkableTarget(mark) {
  if (!mark?.at) return false;
  if (mark.kind !== "sited" && mark.kind !== "parcel") return false;
  if (mark.tier === "constitution") return false;
  const span = Math.max(Number(mark.extent?.w ?? 0), Number(mark.extent?.h ?? 0));
  return span < WALK_TARGET_MAX_EXTENT_M;
}

// The pinned bubble's way back.
//
// Following a relative REPLACES the bubble — on a map the bubble should move to
// the thing you clicked, and the map is the breadcrumb — but that leaves the mark
// you came from with no way home. The panel has a `◂ back` crumb for exactly this
// and the bubble needs its own. Selecting fresh from the painting starts a new
// trail; following a relation or an attribute pushes; back pops.
//
// A cycle (A → B → A) is kept rather than collapsed: the trail records where you
// WENT, not the shortest route there, and stepping back through your own path is
// the behaviour that never surprises anyone.
export function bubbleTrailStep(trail = [], action = "select", id = null) {
  const current = Array.isArray(trail) ? trail.filter(Boolean) : [];
  if (action === "select") return id ? [id] : [];
  if (action === "follow") return id ? [...current, id] : current;
  if (action === "back") return current.length > 1 ? current.slice(0, -1) : current;
  return current;
}

// Walkers ride the mark hover store rather than growing a second one — one
// hover mechanism for the painting. A namespaced key keeps them from colliding
// with real mark ids, and everything that matches on mark ids simply misses.
// The chooser rides the SELECTION as a sentinel id, the same trick the walker
// card uses, so it inherits the bubble's anchoring, placement, Escape and
// click-elsewhere dismissal without a second lifecycle to keep in step.
export const CHOOSER_PREFIX = "choose:";
export const chooserId = (ids) => `${CHOOSER_PREFIX}${ids.join(" ")}`;
export const chooserIdsFrom = (id) =>
  typeof id === "string" && id.startsWith(CHOOSER_PREFIX)
    ? id.slice(CHOOSER_PREFIX.length).split(" ").filter(Boolean)
    : null;

export const WALKER_HOVER_PREFIX = "walker:";
export const walkerHoverId = (handle) => `${WALKER_HOVER_PREFIX}${handle}`;
export const walkerHandleFromHoverId = (id) =>
  typeof id === "string" && id.startsWith(WALKER_HOVER_PREFIX)
    ? id.slice(WALKER_HOVER_PREFIX.length) || null
    : null;

export function snappedMarkAtPoint(point, marks = [], radiusPx = MARK_SNAP_RADIUS_PX) {
  const x = Number(point?.x), y = Number(point?.y), radius = Number(radiusPx);
  if (![x, y, radius].every(Number.isFinite) || radius < 0) return null;
  return marks
    .map((mark) => {
      const mx = Number(mark?.x), my = Number(mark?.y);
      return {
        id: mark?.id,
        distancePx: [mx, my].every(Number.isFinite) ? Math.hypot(mx - x, my - y) : Infinity,
      };
    })
    .filter((mark) => mark.id && mark.distancePx <= radius)
    .sort((a, b) => a.distancePx - b.distancePx || String(a.id).localeCompare(String(b.id)))[0]?.id ?? null;
}

// ───────── the contested click ─────────
//
// Every seating mints a parcel, a building and a predicate at very nearly one
// spot, so the pips pile up and the one you want becomes unclickable: the snap
// above picks the nearest and the other three are unreachable at any zoom.
//
// The rule is DON'T GUESS. One pip in radius is exactly today's behaviour; more
// than one and the reader chooses. That is the whole design — the chooser is the
// guarantee, and the fan below is only a courtesy that makes the pile legible
// before you click it.

// Everything within the snap radius, nearest first — the same distance metric
// and the same tie-break as snappedMarkAtPoint, so the head of this list IS
// what that function would have returned. They can never disagree.
export function contestedMarksAtPoint(point, marks = [], radiusPx = MARK_SNAP_RADIUS_PX) {
  const x = Number(point?.x), y = Number(point?.y), radius = Number(radiusPx);
  if (![x, y, radius].every(Number.isFinite) || radius < 0) return [];
  return marks
    .map((mark) => {
      const mx = Number(mark?.x), my = Number(mark?.y);
      return {
        id: mark?.id,
        distancePx: [mx, my].every(Number.isFinite) ? Math.hypot(mx - x, my - y) : Infinity,
      };
    })
    .filter((mark) => mark.id && mark.distancePx <= radius)
    .sort((a, b) => a.distancePx - b.distancePx || String(a.id).localeCompare(String(b.id)))
    .map((mark) => mark.id);
}

// INNERMOST FIRST: the smallest extent leads, because the thing you are standing
// on top of is the thing you meant. A parcel contains its building contains its
// predicate, so ordering by area puts the most specific claim under your cursor
// at the top of the list rather than the district you happen to be inside.
// A mark with no extent (a predicate takes its locus from its parent) sorts as
// the smallest thing there is — it is the innermost claim by definition.
export function orderInnermostFirst(ids, byId) {
  const area = (id) => {
    const m = byId?.get?.(id);
    const w = Number(m?.extent?.w), h = Number(m?.extent?.h);
    return Number.isFinite(w) && Number.isFinite(h) ? w * h : -1;
  };
  return [...(ids ?? [])].sort((a, b) => area(a) - area(b) || String(a).localeCompare(String(b)));
}

// ───────── the fan ─────────
//
// Co-located pips get a few pixels of separation so a hover can tell them apart
// before anyone clicks. The angle comes from the MARK ID's own hash and nothing
// else — not from its index in the group — because an index-derived angle makes
// every pip in a pile jump the moment one of them appears, disappears, or is
// filtered out. Hash-derived, a mark's offset is the same on every render, in
// every clone, forever.
export const FAN_RADIUS_PX = 5;
// Only once the map is zoomed in enough that a few pixels means anything. Below
// this the pips genuinely overlap and separating them would be a lie about how
// far apart the marks are.
export const FAN_MIN_ZOOM = 4;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈137.5°, the phyllotaxis angle

// FNV-1a, 32-bit: small, stable, and dependency-free. Any stable hash would do;
// what matters is that it is a pure function of the id.
export function markIdHash(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id ?? "")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function fanOffsetPx(markId, radiusPx = FAN_RADIUS_PX) {
  const angle = (markIdHash(markId) % 3600) / 3600 * Math.PI * 2 + GOLDEN_ANGLE;
  return { dx: Math.cos(angle) * radiusPx, dy: Math.sin(angle) * radiusPx };
}

// Which pips are stacked closely enough to be worth fanning: same anchor, or
// within a metre of it. Returns the set of ids that share a spot with anyone.
export const FAN_SAME_SPOT_M = 1;
export function coLocatedMarkIds(marks, withinM = FAN_SAME_SPOT_M) {
  const placed = (marks ?? []).filter((m) => m?.id && Number.isFinite(m?.at?.x) && Number.isFinite(m?.at?.y));
  const stacked = new Set();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (Math.hypot(placed[i].at.x - placed[j].at.x, placed[i].at.y - placed[j].at.y) <= withinM) {
        stacked.add(placed[i].id);
        stacked.add(placed[j].id);
      }
    }
  }
  return stacked;
}

export function smallestContainingMark(point, marks = []) {
  const x = Number(point?.x), y = Number(point?.y);
  if (![x, y].every(Number.isFinite)) return null;
  return (marks ?? [])
    .filter((mark) => !isAmbientMark(mark, marks) && pointInsideMark({ x, y }, mark))
    .map((mark) => ({ mark, area: Number(mark.extent.w) * Number(mark.extent.h) }))
    .sort((a, b) => a.area - b.area || String(a.mark.id).localeCompare(String(b.mark.id)))[0]?.mark?.id ?? null;
}

export function paintingMarkAtPoint({
  screenPoint,
  worldPoint,
  glyphs = [],
  marks = [],
  radiusPx = MARK_SNAP_RADIUS_PX,
} = {}) {
  return snappedMarkAtPoint(screenPoint, glyphs, radiusPx)
    ?? smallestContainingMark(worldPoint, marks);
}

export function toldPaintingMarks(radial, marks = []) {
  const ids = new Set((radial?.within ?? []).map((mark) => mark?.id).filter(Boolean));
  for (const bands of Object.values(radial?.byBearing ?? {}))
    for (const entries of Object.values(bands ?? {}))
      for (const mark of entries ?? [])
        if (mark?.id) ids.add(mark.id);
  return (marks ?? []).filter((mark) => ids.has(mark?.id));
}

export function createMarkInteractionStore() {
  let value = Object.freeze({ selectedId: null, hoveredId: null });
  const listeners = new Set();
  const update = (key, id) => {
    const next = id || null;
    if (value[key] === next) return value;
    value = Object.freeze({ ...value, [key]: next });
    for (const listener of listeners) listener(value);
    return value;
  };
  return {
    getState: () => value,
    select: (id) => update("selectedId", id),
    hover: (id) => update("hoveredId", id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const isPredicateAttribute = (mark) =>
  mark?.kind === "predicated" || mark?.kind === "naming";

// Cells v1.5 folds only one safe level: a predicate/naming mark may become an
// attribute of a rendered, non-predicate subject cell. Predicated-on-predicated
// chains stay as standalone cells; rendering those as a nested tree belongs to
// the later cells-v2 design.
export function predicateFoldDecision(mark, renderedMarks = []) {
  if (!isPredicateAttribute(mark) || !mark.parent) return false;
  const rendered = markIndex(renderedMarks);
  const parent = rendered.get(mark.parent);
  return !!parent && !isPredicateAttribute(parent);
}

// THE ✦ NUMBER, in one place (2026-08-10). Every surface here used to reach for
// whichever field was nearest — the cells and the glance read the fold record's
// `stamps` (RAW escrow), while the drilled crumb read investigate's mislabelled
// `stamps` (which was really weight). So one mark showed two different ✦ figures
// depending on where you looked at it, and neither surface said which it meant.
// Keemin's ruling: the effective figure is the default everywhere, and the
// breakdown is how it explains itself. Raw escrow is still reachable as `.stamps`
// for anything that genuinely wants what residents put in.
export function effectiveWeight(mark) {
  return Math.max(0, Number(mark?.weight ?? mark?.stamps ?? 0) || 0);
}

export function backingButton(markId, stamps = 0) {
  const backing = Math.max(0, Number(stamps) || 0);
  const backingClass = `wv-backing${backing === 0 ? " is-zero" : ""}`;
  // symbol and number, nothing else (Keemin, 2026-08-04). The word "back" was a
  // verb sitting inside a readout, and it appears on every cell, every relation
  // line and every attribute row — the title says what pressing it does.
  const label = `✦ ${backing.toLocaleString()}`;
  return `<button type="button" class="${backingClass}" data-stake-open data-mark="${esc(markId)}" title="read backing and back this mark">${label}</button>`;
}

export function markByline(mark) {
  if (!mark?.by || !mark?.date) return "";
  return `By ${mark.by} ${String(mark.date).slice(0, 10)}`;
}

export function markCellBylineRow(mark, actions = "") {
  const byline = markByline(mark);
  if (!byline && !actions) return "";
  return `<div class="wv-cell-byline-row">`
    + (byline ? `<span class="wv-byline">${esc(byline)}</span>` : "")
    + actions
    + `</div>`;
}

// THE FRAME ANSWERS NO RELATIONS (Keemin, 2026-08-04). What a normal mark owes a
// reader is its neighbourhood; what let-there-be-light owes is the world's terms.
// Everything is inside it, so "within it" is not an answer — it is the whole
// register, cut to twelve by a budget, and every one of those twelve opens a
// bubble somewhere off the current view. The Telling has always known this: the
// root's body is the establishing line and never a card. This is the same rule
// stated for the cell surface, and it is the exact mirror of the one the ancestor
// walk already keeps — the root is left out of everyone's parents because naming
// the frame as context is noise.
//
// It is also the whole of the click latency. `investigate` decides which children
// are DIRECT by asking, for every contained mark, whether any other contained mark
// holds it — quadratic in the contained set, which for the root is the world:
// ~1.8 s of true-shape containment tests on 197 sited marks, measured, against
// 0.1 ms for an ordinary district. Not asking is not an optimization here; the
// answer was noise, and the noise was what cost.
export function worldFrameReading(mark, marks = []) {
  if (!mark) return { error: "no mark" };
  return {
    id: mark.id, kind: mark.kind, household: mark.household, at: mark.at, extent: mark.extent,
    sovereign: !!mark.sovereign,
    // same vocabulary as the engine's investigate (world-verbs.mjs): stamps is
    // RAW own escrow, weight is the EFFECTIVE ✦ figure. This mirror emitted
    // weight under the name stamps until 2026-08-10; anything reading it got the
    // right number by the wrong name, which is how it stayed wrong.
    weight: mark.weight ?? 0, stamps: mark.stamps ?? 0, weight_parts: mark.weight_parts ?? null,
    body: mark.body,
    // its own attributes are its own — the light axis, the clock, the origin are
    // properties of the frame, not marks living inside it
    predicates: marks.filter((m) => (m.kind === "predicated" || m.kind === "naming") && m.parent === mark.id)
      .map((m) => ({ id: m.id, slot: m.slot ?? (m.kind === "naming" ? "name" : null), value: m.value, weight: m.weight ?? 0, stamps: m.stamps ?? 0, body: m.body })),
    parents: [], children: [], alongside: [],
    more: { predicates: 0, children: 0 },
  };
}

// A relative in an investigate expansion is a compact cell identity, never a
// second telling of that relative's prose. It uses the same resolved Name,
// backing action, and tier accent as its parent cell. Author/date live only in
// the owning cell's always-visible byline.
export function investigateNameLine(mark, { name, determined = false, tier = "market", draft = false } = {}) {
  const identity = name || deslugMarkId(mark?.id);
  return `<div class="wv-rnode ${markStateClasses({ tier, draft })}" data-id="${esc(mark?.id)}" role="button" tabindex="0">`
    + `<div class="wv-rnode-head"><b class="cname${determined ? " is-determined" : ""}">${esc(identity)}</b>`
    + `${backingButton(mark?.id, mark?.weight ?? mark?.stamps ?? 0)}</div>`
    + `</div>`;
}

const BEARING_LONG = { N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest" };

// The chip's arrow points where the mark lies, north UP — the map pane's orientation.
// It is derived from the QUANTIZED bearing beside it, because that is all a display
// layer has: an FOV mark carries `bearing` (world-engine's quantizeBearing) and no raw
// degrees, and reaching for raw degrees would be a serialization change. That the arrow
// cannot disagree with the word it labels is the happy consequence.
// Rotation, not a set of unicode arrows: ↑↗→ and friends snap 16 winds onto 8, losing
// NNE/ENE entirely, and they cannot draw the "45°" keys quantizeBearing emits whenever
// the bearing_points dial is not 16. A degree rotation renders any rose.
const ROSE_DEG = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
const bearingDegOf = (b) => {
  if (b == null) return null;
  if (ROSE_DEG[b] != null) return ROSE_DEG[b];
  const d = /^(-?\d+(?:\.\d+)?)\s*°?$/.exec(String(b));
  return d ? ((Number(d[1]) % 360) + 360) % 360 : null; // unknown key → no arrow, never a wrong one
};
const bearingArrow = (b) => {
  const deg = bearingDegOf(b);
  if (deg == null) return "";
  // A slim NOTCHED arrowhead, chosen by looking at four silhouettes blown up at every
  // wind. A near-equilateral triangle is the trap: it is rotated correctly and still
  // reads WRONG, because at three near-equal vertices the eye picks the nearest one
  // instead of the apex — NE read as left, ENE as down. The notch makes the apex the
  // only sharp vertex and the elongation breaks the symmetry, so the point is
  // unambiguous at 45° steps as well as at the cardinals.
  return `<svg class="wv-arrow" viewBox="-5 -5 10 10" aria-hidden="true">`
    + `<path d="M0 -5 L2.8 4 L0 2.1 L-2.8 4 Z" transform="rotate(${deg})"/></svg>`;
};

function tierChip(tier) {
  if (tier === "constitution") return `<span class="wv-chip t-constitution">constitution</span>`;
  if (tier === "home") return `<span class="wv-chip t-home">home</span>`;
  return "";
}

export function markCellTitle({ name = "", determined = false, bearing = null, tier = "market", draft = false } = {}) {
  const arrow = bearing
    ? `<span class="wv-name-arrow" title="${esc(BEARING_LONG[bearing] ?? bearing)}">${bearingArrow(bearing)}</span>`
    : "";
  // the draft chip says the state, the tier chip goes on saying the kind — a
  // draft law is still a law, and only its colour changes
  const draftChip = draft
    ? `<span class="wv-chip is-draft" title="your household has written this; the town has not published it">draft</span>`
    : "";
  return `<div class="cname${determined ? " is-determined" : ""}"><span>${esc(name)}</span>${arrow}${draftChip}${tierChip(tier)}</div>`;
}

// ───────────────────────── THE one mark-shape builder ──────────────────────
// EVERY outline of a mark's claim on the painting comes from here. Never hand-build
// one — that is the rule this function exists to make keepable, and it was earned:
// the ring branch had to be written THREE times before it was written once. Grid-true
// had it, buildFpLayer got it ported when Grid-true retired, and the old highlight
// quietly went on drawing a bbox rect — so a hover washed a rectangle over a mark
// the layer beneath it was correctly drawing as a polygon. Two hand-written mappings
// of one concept drift; three is a habit. No fourth mapping gets written, because
// there is nowhere left to write it.
//
// A mark with a `points:` ring (≥3) draws its AUTHORED shape; everything else draws
// its extent rect. The honesty gate guarantees ring-bbox == at/extent, so the two
// describe the same claim and the ring is only the truer telling of it. Ring vertices
// are absolute grid metres — the same space `at` lives in — so both take the caller's
// world→px mapping unchanged.
//
// `px(x, y) -> {x, y}` is the caller's mapping (the painting's originPx/mPerPx).
// `cls` is the caller's own vocabulary — the footprints layer and the hover wash keep
// their separate classes and styling; only the GEOMETRY is shared.
function markShapeSVG(m, px, cls, { attrs = "", inner = "" } = {}) {
  const ring = Array.isArray(m.points) && m.points.length >= 3 ? m.points : null;
  if (ring) {
    const pts = ring.map((v) => {
      const q = px(Array.isArray(v) ? v[0] : v.x, Array.isArray(v) ? v[1] : v.y);
      return `${q.x},${q.y}`;
    }).join(" ");
    return `<polygon points="${pts}" class="${cls}"${attrs}>${inner}</polygon>`;
  }
  const w = m.extent?.w ?? 0, h = m.extent?.h ?? 0;
  const a = px(m.at.x - w / 2, m.at.y - h / 2), b = px(m.at.x + w / 2, m.at.y + h / 2);
  return `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}"`
    + ` width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" class="${cls}"${attrs}>${inner}</rect>`;
}

// the stand-at presets (the same three the local build and the astro page carried)
const PRESETS = [
  { x: 0, y: 0, label: "The quay — Ferry's crossing" },
  { x: 575, y: -2600, label: "Trueing Terrace — above the fog" },
  { x: -1900, y: 2150, label: "Caelina's ground — the dark pole" },
];

// step-size notches (Keemin 2026-07-23): a single labeled slider, not buttons.
// Non-linear notches so a stride runs from a metre to a kilometre; default 100 m.
const STEP_NOTCHES = [1, 25, 50, 100, 250, 500, 1000];
const STEP_DEFAULT_I = 3; // → 100 m
const stepLabel = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

// the ferry's clock — the LIVE crossing, the office's own derivation (12h crossings
// since the ledger's first delivery day; the "provisional pending a ruling" line is
// now the viewer's default). fog is the crossing's weather, so an open tab that
// rolls over a crossing boundary re-tells with fresh weather.
const CROSSING_EPOCH_UTC = Date.UTC(2026, 5, 12); // 2026-06-12T00:00Z
const liveCrossing = () => Math.max(0, Math.floor((Date.now() - CROSSING_EPOCH_UTC) / (12 * 3600 * 1000)));

// dev-pane dials — the FOV-time leans only (assembly-time idw stays fixed, so a
// dial change never re-folds or re-assembles: it re-tells). Each is {key,label,
// min,max,step}. Ranges are generous prototyping room, not law.
const DEV_DIALS = [
  { key: "context_budget", label: "context budget", min: 1, max: 30, step: 1 },
  { key: "cluster_beyond_m", label: "cluster beyond (m)", min: 100, max: 4000, step: 50 },
  { key: "max_sight_m", label: "max sight (m)", min: 2000, max: 40000, step: 500 },
  { key: "bearing_points", label: "bearing rose", min: 4, max: 32, step: 4 },
  { key: "weight_lod_k", label: "stamp lift (weight k)", min: 0, max: 2, step: 0.05 },
  { key: "eye_height_m", label: "eye height (m)", min: 0.5, max: 60, step: 0.5 },
  { key: "default_mark_top_m", label: "default mark top (m)", min: 0, max: 60, step: 0.5 },
  { key: "fog_base", label: "fog base", min: 0, max: 1, step: 0.01 },
  { key: "fog_swing", label: "fog swing", min: 0, max: 0.5, step: 0.01 },
  { key: "fog_sight_floor_m", label: "fog sight floor (m)", min: 20, max: 3000, step: 20 },
  { key: "fog_sight_ceiling_m", label: "clear-air sight (m)", min: 2000, max: 40000, step: 500 },
  { key: "above_fog_bonus", label: "above-fog bonus", min: 1, max: 3, step: 0.1 },
  { key: "signal_fog_reach_mult", label: "signal fog reach ×", min: 1, max: 12, step: 0.5 },
  { key: "dark_dim_floor", label: "dark dim floor", min: 0, max: 1, step: 0.05 },
  { key: "los_clearance_m", label: "LOS clearance (m)", min: 0, max: 5, step: 0.25 },
];

const STYLE = `
.wv { --night:#14171d; --panel:#1c2129; --panel2:#20262f; --line:#2e3542;
  --paper:#e8e0cf; --dim:#9a9280; --amber:#e8c56a; --amber-dark:#b8964a; --err:#d98a7a;
  --you:#e0654a; /* ember — "this is you", softened from alarm-red (Keemin 2026-07-30) */
  --mono:ui-monospace,"SF Mono",Consolas,Menlo,monospace;
  --stamp-violet:#aa8fd8; --stamp-violet-dark:#65517f;
  --stamp-violet-heading:#d8c7ef; --stamp-violet-subhead:#cbb8e5;
  /* tier accents (Keemin 2026-07-23): constitution → blue, sovereign/homes → green, market → amber */
  --blue:#7ba7e0; --blue-dark:#5580b8; --green:#84c98f; --green-dark:#57a068;
  /* draft (Keemin 2026-08-04): a mark your household has written that the town
     has not published. Cool and desaturated ON PURPOSE — every other colour in
     this world is warm, so a draft reads as not yet of it. */
  --draft:#9aa0ab; --draft-dark:#5d636e;
  background:var(--night); color:var(--paper); font:16px/1.55 Georgia,"Times New Roman",serif;
  min-height:100vh; }
.wv * { box-sizing:border-box; }
/* ONE FOCUS RING for the whole viewer. Four controls used to take the browser's
   outline away and lean on their hover style instead — which leaves someone
   reading with the keyboard looking at exactly what a mouse reader sees, with no
   way to tell where focus actually is. Drawn outside the control, so showing it
   never moves anything. */
.wv :focus-visible { outline:2px solid var(--amber); outline-offset:2px; }
/* The strip the site's fixed back-link and auth pill land in. It holds only the
   beta chip and the room those two need; the viewer's own title rail is gone. */
/* the head of the rail: what the page is, its state, the Telling's switch, the
   crossing, and the seat the site's own pills adopt */
.wv-nav-top { display:flex; flex-direction:column; align-items:stretch; gap:9px; margin:0 0 16px; }
.wv-worldline { display:flex; align-items:center; flex-wrap:wrap; gap:8px; row-gap:6px; }
.wv-worldline h1 { margin:0; font-size:.88rem; letter-spacing:.03em; color:var(--amber);
  font-weight:600; white-space:nowrap; }
/* The one switch in the rail that changes the shape of the page, so it is the
   one thing in the rail that is lit (Keemin, 2026-08-04): a faint outline beside
   a title read as decoration. Off it is amber on a tint; on it is filled, the
   same on-state the painting's own controls use. */
.wv-nav .wv-telling-toggle { margin-left:auto; flex:none; width:2.1rem; height:2.1rem;
  display:inline-grid; place-items:center; cursor:pointer; font:inherit; font-size:1rem;
  color:var(--amber); background:rgba(232,197,106,.12);
  border:1px solid rgba(232,197,106,.45); border-radius:6px;
  transition:background .12s, border-color .12s, color .12s; }
.wv-nav .wv-telling-toggle:hover { background:rgba(232,197,106,.22); border-color:var(--amber); }
.wv-nav .wv-telling-toggle.on { color:var(--night); border-color:var(--amber);
  background:linear-gradient(180deg,#f0d68f,var(--amber)); }
.wv-beta-chip { border-color:rgba(216,138,122,.55); color:var(--err); letter-spacing:.12em;
  font-family:var(--mono); font-size:.62rem; padding:2px 10px; cursor:help; }
/* The painting takes the slack now (Keemin 2026-08-04: maximise its screen). The
   telling is sized to its own prose — its cells cap at 76ch, so a 1fr telling
   spent the whole surplus on margin. */
.wv-main { --rail:212px; display:grid; grid-template-columns:var(--rail) 33rem minmax(0,1fr);
  gap:0; align-items:start; transition:grid-template-columns .3s cubic-bezier(.4,0,.2,1); }
@media (prefers-reduced-motion:reduce){ .wv-main { transition:none; } }
.wv-main.no-map { grid-template-columns:var(--rail) minmax(0,1fr); }
@media (max-width:1160px){ .wv-main,.wv-main.no-map { grid-template-columns:var(--rail) minmax(0,1fr); }
  .wv-map { grid-column:1 / -1; border-top:1px solid var(--line); } .wv-map .wv-sticky { position:static; } }
/* ── THE PHONE: THE PAINTING, AND NOTHING ELSE (Keemin, 2026-08-04) ───────────
   Below 720 px the rail was a third of the screen for a column of short words,
   and the Telling's 33 rem cannot fit at all — so the grid dropped them under the
   painting and the page grew a long tail of desk furniture nobody had asked for
   on a phone. Neither runs here. The painting takes the viewport, with its own
   chrome, its bubbles and the walk desk, which is the whole surface anyway.

   What goes with the rail: Act As, the crossing readout, the dev dials, and the
   Telling. All desk work. The site's sign-in cluster is the one thing that must
   NOT go — it is the only human door — so it notices the seat has gone and
   floats instead (WorldSignIn.astro).

   Placed after the base rules on purpose: the .wv-minimap > svg rule below is the
   same specificity as the height:auto default further up, so it is source order
   that decides, and it must be this one. */
@media (max-width:720px){
  .wv, .wv.is-painting-only { height:100dvh; display:flex; flex-direction:column; overflow:hidden; }
  .wv > div, .wv.is-painting-only > div { flex:1 1 0; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
  .wv-nav, .wv-view { display:none; }
  .wv-main, .wv-main.no-map, .wv-main.is-telling-collapsed, .wv-main.is-painting-only {
    grid-template-columns:minmax(0,1fr); flex:1 1 0; min-height:0; overflow:hidden; align-items:stretch; }
  .wv-map, .wv-main.is-painting-only .wv-map { grid-column:1 / -1; border-top:0; display:flex;
    flex-direction:column; min-height:0; overflow:hidden; }
  .wv-map .wv-sticky { position:static; display:flex; flex-direction:column; min-height:0; flex:1; }
  .wv-minimap { flex:1; min-height:0; }
  .wv-minimap > svg { width:100%; height:100%; }
  /* the chrome that rides on the painting gets a phone's room, not a desk's */
  .wv-walkdesk { width:auto; left:10px; right:10px; }
  .wv-bubble { max-width:calc(100% - 20px); }
  .wv-mapctl { gap:5px; }
}
/* the app frame (Keemin 2026-07-24 eve): at full width the page stops scrolling —
   each column scrolls itself, and the left side matches the map pane's height */
@media (min-width:1161px){
  .wv { height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  .wv > div { flex:1 1 0; min-height:0; display:flex; flex-direction:column; overflow:hidden; } /* the mount wrapper */
  .wv-view { display:flex; flex-direction:column; }
  .wv-main { flex:1 1 0; min-height:0; overflow:hidden; align-items:stretch; }
  .wv-nav, .wv-view { overflow-y:auto; min-height:0; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
  .wv-map { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
  .wv-map .wv-sticky { position:static; display:flex; flex-direction:column; min-height:0; flex:1; }
  .wv-minimap { flex:1; min-height:0; }
  /* .wv-map scopes this ABOVE the height:auto fallback further down. Equal
     specificity meant the later rule won, so inside the app frame the painting
     rendered at its own aspect — 1,277 px tall in a 964 px pane — and the bottom
     band was clipped away. That is the "turning the Telling on hides the bottom
     of the painting" defect; painting-only escaped it only because its own rule
     happened to carry one class more. */
  .wv-map .wv-minimap > svg { width:100%; height:100%; }
}
/* HALF THE RAIL IT WAS (Keemin, 2026-08-04). Walk was the widest thing in this
   column and Walk has moved onto the painting; what is left — the title, the
   crossing, the two doors and Act As — was a list of short words.
   Widened back to 212 px on 2026-08-05, when the rail gained a record of what has
   been happening: a column of short words can be narrow, a column of sentences
   cannot. One --rail on the grid, so the four places that name this column can
   never drift apart. */
.wv-nav { padding:13px 12px; border-right:1px solid var(--line); background:var(--panel); }
.wv-nav h2 { font-size:.74rem; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); margin:18px 0 8px; }
.wv-nav button.ctl, .wv-nav .compass button, .wv-nav .step button {
  background:transparent; border:1px solid var(--line); color:var(--paper); font:inherit;
  font-size:.83rem; border-radius:4px; padding:5px 9px; cursor:pointer; }
.wv-nav .presets button { display:block; width:100%; text-align:left; margin-bottom:6px; }
.wv-nav button.ctl:hover, .wv-nav .compass button:hover, .wv-nav .step button:hover { border-color:var(--amber-dark); color:var(--amber); }
.wv-nav .compass { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; max-width:100%; }
.wv-nav .compass .pos { display:flex; align-items:center; justify-content:center; color:var(--dim); font-size:.72rem; }
.wv-nav .step { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
.wv-nav .step button.on { border-color:var(--amber); color:var(--amber); }
.wv-nav .stepwrap { margin-top:10px; }
.wv-nav .steplbl { display:flex; justify-content:space-between; align-items:baseline; font-size:.74rem;
  letter-spacing:.02em; color:var(--dim); text-transform:uppercase; margin-bottom:4px; }
.wv-nav .steplbl b { color:var(--amber); font-variant-numeric:tabular-nums; text-transform:none; letter-spacing:0; }
.wv-nav .stepslider { width:100%; accent-color:var(--amber-dark); cursor:pointer; }
.wv-nav input.txt, .wv-nav input.num { width:100%; background:var(--night); color:var(--paper);
  border:1px solid var(--line); border-radius:4px; font:inherit; padding:4px 7px; }
.wv-nav input.num { width:80px; }
.wv-dev-toggle { margin-top:20px; width:100%; }
.wv-dev { margin-top:12px; border-top:1px solid var(--line); padding-top:12px; }
.wv-dev .dial { margin-bottom:9px; }
.wv-dev .dial label { display:flex; justify-content:space-between; font-size:.74rem; color:var(--dim); margin-bottom:2px; }
.wv-dev .dial label b { color:var(--amber); font-variant-numeric:tabular-nums; }
.wv-dev .dial input[type=range] { width:100%; accent-color:var(--amber-dark); }
.wv-dev .devrow { display:flex; gap:6px; margin-top:6px; }
.wv-dev .devrow button { flex:1; }
.wv-dev .devnote { font-size:.72rem; color:var(--dim); margin:2px 0 10px; font-style:italic; }
/* the Telling says what it is at its own head — one line of what this panel even
   is, since "a list of cells" is not self-evident to anyone arriving */
.wv-viewhead { padding:16px 20px 0; }
.wv-viewhead h2 { margin:0; font-size:.72rem; letter-spacing:.14em; text-transform:uppercase;
  color:var(--dim); font-family:var(--mono); font-weight:400; }
.wv-view-sub { margin:5px 0 0; color:var(--dim); font-size:.76rem; line-height:1.5;
  font-style:italic; max-width:48ch; }
.wv-viewhead + .wv-telling { padding-top:12px; }

/* Two panels, no bars. Both are content to their own edges — the painting runs
   to the window and the telling begins at its first line — because every control
   either of them had now lives loose in the rail. */
.wv-view { overflow-x:auto; min-width:0; min-height:60vh; border-right:1px solid var(--line);
  transition:opacity .22s ease, visibility 0s; }
.wv-telling { padding:16px 20px 26px; }
/* collapsed to a zero-width column rather than display:none, because a slide is
   the point and display does not animate. The panel keeps its box and simply has
   no width; opacity carries the fade so its prose never reflows on the way out.
   visibility takes it out of the TAB ORDER once the fade is over — without it a
   keyboard reader tabbed straight into three filter chips and a column of cells
   that were not on the screen. Zero-duration, delayed by the fade, so it hides
   after the panel has gone and un-hides the instant it comes back. */
.wv-main.is-telling-collapsed { grid-template-columns:var(--rail) 0rem minmax(0,1fr); }
.wv-main.is-telling-collapsed > .wv-view { opacity:0; overflow:hidden; visibility:hidden;
  border-right-width:0; pointer-events:none; transition:opacity .22s ease, visibility 0s linear .22s; }
@media (max-width:720px){ .wv-main.is-telling-collapsed { grid-template-columns:1fr; } }

/* the telling */
.wv-band h3 { font-size:.8rem; letter-spacing:.07em; color:var(--dim); margin:18px 0 8px; }
.wv-arrow { width:.95em; height:.95em; vertical-align:-.15em; margin-right:.3em; overflow:visible; }
.wv-arrow path { fill:currentColor; opacity:.8; }
.wv-card { border:1px solid var(--line); border-left:3px solid var(--amber-dark); border-radius:5px;
  --wv-mark-accent:var(--amber); padding:10px 13px; margin:8px 0; cursor:pointer; max-width:76ch; }
.wv-card:hover { border-color:var(--amber-dark); }
.wv-card.t-constitution { --wv-mark-accent:var(--blue); }
.wv-card.t-home { --wv-mark-accent:var(--green); }
.wv-card.is-mark-hovered { border-color:var(--wv-mark-accent); }
.wv-card.is-mark-selected { border-color:var(--wv-mark-accent); outline:1px solid var(--wv-mark-accent);
  outline-offset:2px; }
.wv-rnode.is-mark-hovered, .wv-rnode.is-mark-selected,
.wv-attribute.is-mark-hovered, .wv-attribute.is-mark-selected { color:var(--paper); border-color:var(--wv-mark-accent); }
.wv-card.far { border-left-color:var(--line); font-style:italic; }
.wv-card .cname { display:flex; align-items:center; gap:7px; color:var(--paper); font-size:1.02rem;
  line-height:1.25; font-style:normal; font-weight:700; }
.wv-card .cname.is-determined { color:var(--amber); }
.wv-card .wv-name-arrow { display:inline-flex; align-items:center; color:var(--wv-mark-accent); }
.wv-card .wv-name-arrow .wv-arrow { width:1.3em; height:1.3em; margin:0; vertical-align:middle; }
.wv-card .cname > .wv-chip { font-weight:400; }
.wv-card .cbody { line-height:1.45; }
.wv-card .cname + .cbody { margin-top:5px; }
/* A MARK'S PICTURE. The figure mounts EMPTY and is filled on real nodes, and a
   picture whose shelf entry has gone removes the figure outright — so the
   figure carries no box of its own, and an unfilled one costs nothing at all.
   Every frame lives on the image, which is the thing that either arrives or
   does not. The cap is measured against the SURFACE, not the picture: a tall
   photograph that pushed the byline, the backing and the words below the fold
   would have turned a cell into a gallery. Letterbox bars land on the panel's
   own night, so contain reads as a picture rather than as a mistake. */
.wv-mark-image { margin:8px 0 0; padding:0; line-height:0; }
.wv-mark-image:empty { display:none; }
/* THE BOX HUGS THE PICTURE. Sizing to the full cell width and letterboxing
   inside it drew the frame around the BOX, so a portrait sat in a lit mat with
   a border tracing empty panel — a frame around nothing. Capped in both axes
   with the box free to follow, the border traces the picture itself, and a
   picture too small to fill the column simply reads at its own size. contain
   stays as the guarantee it always was: nothing here ever crops or stretches. */
/* No hover lift, no focus ring, no pointer of its own — a thumbnail is display,
   not a control, and every one of those would have promised a click that does
   something. The card's own cursor still applies, which is honest: the click
   DOES do something — the card's thing. */
.wv-mark-image img { display:block; max-width:100%; max-height:40vh; width:auto; height:auto;
  object-fit:contain; border:1px solid var(--line); border-radius:3px; background:var(--night); }
/* the pinned bubble caps itself at min(64%,32rem) and scrolls, so the same
   two-fifths promise has to be measured against that smaller surface */
.wv-bubble .wv-mark-image img { max-height:13rem; }
.wv-card .cmeta { margin-top:7px; display:flex; gap:6px; flex-wrap:wrap; align-items:baseline; }
.wv-cell-byline-row { margin-top:7px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:1.65rem; }
.wv-byline { color:var(--dim); font-size:.76rem; font-style:normal; letter-spacing:.01em; }
.wv-card .wv-details { display:none; flex-basis:100%; align-items:center; gap:7px; flex-wrap:wrap;
  padding-top:6px; border-top:1px dotted var(--line); color:var(--dim); font-size:.7rem; }
.wv-card:hover .wv-details, .wv-card:focus-within .wv-details, .wv-card.is-mark-selected .wv-details { display:flex; }
.wv-detail-where { white-space:nowrap; }
.wv-card .wv-cell-actions { display:flex; gap:5px; flex-wrap:wrap; margin-left:auto; }
.wv-backing { display:inline-flex; align-items:center; color:var(--stamp-violet-subhead);
  background:rgba(139,124,255,.07); border:1px solid var(--stamp-violet-dark);
  border-radius:999px; padding:3px 9px; font:inherit; font-size:.78rem;
  font-variant-numeric:tabular-nums; white-space:nowrap; cursor:pointer;
  transition:color .15s, border-color .15s, background .15s; }
.wv-backing:hover, .wv-backing:focus-visible { color:var(--stamp-violet-heading);
  border-color:var(--stamp-violet); background:rgba(139,124,255,.16); }
.wv-backing.is-zero { opacity:.68; background:transparent; }
.wv-backing.is-zero:hover, .wv-backing.is-zero:focus-visible { opacity:.9; }
.wv.is-spectating [data-stake-open] { pointer-events:none; cursor:default; opacity:.62; }
.wv-cell-act { background:transparent; border:1px solid var(--amber-dark); color:var(--amber);
  border-radius:999px; padding:2px 8px; font:inherit; font-size:.7rem; cursor:pointer; }
.wv-cell-act:hover { background:var(--panel2); }
.wv-cell-act.stamp { border-color:var(--stamp-violet-dark); color:var(--stamp-violet-subhead); }
.wv-cell-act.stamp:hover { border-color:var(--stamp-violet); color:var(--stamp-violet-heading); }
.wv-act-sheet { margin-top:10px; padding:10px; border:1px dashed var(--stamp-violet-dark);
  border-radius:4px; background:rgba(20,23,29,.72); cursor:default; }
.wv-act-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.wv-act-head b { color:var(--stamp-violet-heading); font-size:.86rem; }
.wv-act-verb { margin-right:auto; color:var(--dim); font-family:var(--mono); font-size:.6rem;
  letter-spacing:.1em; text-transform:uppercase; }
.wv-act-close { border:0; background:transparent; color:var(--dim); cursor:pointer; font:inherit; }
.wv-act-row { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:8px; }
/* the field lives INSIDE its label, so the row's gap does not fall between them */
.wv-act-row label { display:inline-flex; align-items:center; gap:9px; color:var(--dim); font-size:.72rem; }
/* NO NATIVE SPINNERS, anywhere. The browser draws them in its own grey — the one
   colour on this page that belongs to nobody — and lays a pale rail down the side
   of a dark field. Every number in this viewer is typed or dialled, never nudged. */
.wv input[type=number] { appearance:textfield; -moz-appearance:textfield; }
.wv input[type=number]::-webkit-outer-spin-button,
.wv input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
/* and the stamps field reads like the number it is: mono and tabular, the same as
   every other figure here, rather than the body serif it was inheriting */
.wv-act-row input { width:6.5rem; background:var(--night); color:var(--paper); border:1px solid var(--line);
  border-radius:4px; padding:5px 9px; font:inherit; font-family:var(--mono); font-size:.8rem;
  font-variant-numeric:tabular-nums; text-align:right; }
.wv-act-row input:focus { border-color:var(--stamp-violet); }
.wv-act-row button { background:transparent; border:1px solid var(--stamp-violet-dark); color:var(--stamp-violet-subhead);
  border-radius:4px; padding:4px 8px; font:inherit; font-size:.72rem; cursor:pointer; }
.wv-act-row .wv-act-confirm { border-color:var(--stamp-violet); color:var(--stamp-violet-heading); }
.wv-act-row button:disabled { opacity:.45; cursor:not-allowed; }
.wv-act-preview { margin-top:9px; }
.wv-act-preview pre { margin:5px 0; padding:8px; white-space:pre-wrap; overflow-wrap:anywhere;
  background:#0d0f13; border:1px solid var(--line); color:var(--paper); font:12px/1.45 Consolas,Menlo,monospace; }
.wv-act-note, .wv-act-answer { margin:6px 0 0; color:var(--dim); font-size:.75rem; line-height:1.4; }
.wv-backers { margin:7px 0 2px; color:var(--dim); font-size:.74rem; line-height:1.45; }
.wv-backers b { color:var(--stamp-violet-subhead); }
.wv-backer { display:flex; justify-content:space-between; gap:10px; max-width:24rem; }
.wv-backer .amount { color:var(--stamp-violet); font-variant-numeric:tabular-nums; }
/* the named backers sit UNDER the escrow line they add up to, so the indent is
   carrying a relation, not decoration: the parts of the ✦ figure are flush, the
   people inside one of those parts are stepped in. */
.wv-backer.is-holder { padding-left:12px; opacity:.82; font-size:.95em; }
.wv-backer-pending { margin-top:5px; color:var(--stamp-violet-subhead); font-size:.95em; }
.wv-act-answer.success { color:var(--green); }
.wv-act-answer.refusal { color:var(--err); }
.wv-stamp-holding, .wv-stamp-balance { color:var(--stamp-violet); font-variant-numeric:tabular-nums; }
.wv-chip { font-size:.7rem; letter-spacing:.04em; border:1px solid var(--line); border-radius:999px;
  padding:1px 8px; color:var(--dim); white-space:nowrap; }
.wv-chip.stamps { border-color:var(--stamp-violet-dark); color:var(--stamp-violet); }
.wv-chip.signal { border-color:var(--amber-dark); color:var(--amber); }
.wv-chip.dim { opacity:.6; }
.wv-extent { display:inline-flex; align-items:center; gap:4px; opacity:.8; }
.wv-extent svg { display:block; }
.wv-extent svg rect, .wv-extent svg polygon { fill:rgba(154,146,128,.18); stroke:var(--dim); stroke-width:1; }
.wv-extent-t { font-size:.66rem; color:var(--dim); font-variant-numeric:tabular-nums; white-space:nowrap; }
.wv-cluster { margin-top:7px; font-size:.8rem; font-style:italic; color:var(--amber); opacity:.85; }
.wv-tallies { margin-top:22px; padding-top:10px; font-size:.82rem; color:var(--dim); border-top:1px solid var(--line); max-width:76ch; }
/* everything is a mark-cell — tier accents + the encompassing ladder */
.wv-section-lbl { font-size:.72rem; letter-spacing:.13em; text-transform:uppercase; color:var(--dim);
  margin:20px 0 9px; opacity:.75; }
.wv-section-lbl:first-child { margin-top:2px; }
.wv-card.t-constitution { border-left-color:var(--blue-dark); }
.wv-card.t-constitution:hover { border-color:var(--blue-dark); }
.wv-card.t-home { border-left-color:var(--green-dark); }
.wv-card.t-home:hover { border-color:var(--green-dark); }
.wv-chip.t-constitution { border-color:var(--blue-dark); color:var(--blue); }
.wv-chip.t-home { border-color:var(--green-dark); color:var(--green); }
.wv-card.frame { border-left-width:5px; border-left-color:var(--blue); background:rgba(123,167,224,.05);
  max-width:76ch; }
.wv-card.frame .cbody { font-size:1.05rem; }
.wv-card.ladder { border-left-width:4px; }
.wv-card.law { border-style:dashed; }
.wv-cell-state { margin-top:6px; font-size:.9rem; color:var(--paper); opacity:.82; font-style:italic; line-height:1.4; }
.wv-card.frame .wv-cell-state, .wv-card.law .wv-cell-state { opacity:.95; }
/* investigate in place */
.wv-expand { margin-top:10px; padding-top:10px; border-top:1px dashed var(--amber-dark); cursor:default; }
.wv-crumbs { display:flex; gap:10px; align-items:baseline; margin-bottom:6px; }
.wv-back { color:var(--amber); cursor:pointer; font-size:.82rem; }
.wv-back:hover { text-decoration:underline; }
.wv-crumb-name { color:var(--paper); font-size:.9rem; }
.wv-crumb-name.is-determined { color:var(--amber); }
/* investigate relations are compact name-lines. A relative's body belongs only
   to its own cell; the tier-colored edge keeps the navigation line legible. */
.wv-tree-label { font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); margin:12px 0 4px 10px; }
.wv-relation-lines { margin-left:10px; }
.wv-rnode { --wv-mark-accent:var(--amber); padding:4px 9px; margin:3px 0; border-left:3px solid var(--amber-dark);
  color:var(--paper); font-size:.84rem; line-height:1.35; cursor:pointer; }
.wv-rnode-head { display:flex; align-items:center; gap:8px; }
.wv-rnode .cname { color:var(--paper); font-size:.9rem; line-height:1.25; font-style:normal; }
.wv-rnode .cname.is-determined { color:var(--amber); }
.wv-rnode .wv-backing { margin-left:auto; }
.wv-rnode.t-constitution { --wv-mark-accent:var(--blue); border-left-color:var(--blue-dark); }
.wv-rnode.t-home { --wv-mark-accent:var(--green); border-left-color:var(--green-dark); }
.wv-rnode:hover { color:var(--amber); background:rgba(255,255,255,.025); }
.wv-attributes { margin:7px 0 2px; border-top:1px dotted var(--line); }
.wv-attribute { --wv-mark-accent:var(--amber); display:flex; align-items:baseline; gap:7px;
  padding:5px 0 4px 9px; border-left:2px solid var(--amber-dark); color:var(--dim);
  font-size:.8rem; line-height:1.35; cursor:pointer; }
.wv-attribute.t-constitution { --wv-mark-accent:var(--blue); border-left-color:var(--blue-dark); }
.wv-attribute.t-home { --wv-mark-accent:var(--green); border-left-color:var(--green-dark); }
.wv-attribute-value { min-width:0; flex:1; }
.wv-attribute-value b { color:var(--paper); }
.wv-attribute-state { color:var(--paper); opacity:.82; font-style:italic; }
.wv-attribute .wv-cell-actions { margin-left:auto; }
.wv-attribute:hover { color:var(--paper); background:rgba(255,255,255,.025); }
.wv-expansion-attributes { margin:5px 0 8px 10px; }

/* my marks */

/* one marks vocabulary at the view's top (the World lens above it is gone —
   drafts are grey now, so there is nothing left to swap between) */
.wv-mfilter { display:flex; gap:6px; margin:0 0 12px; }
.wv-fchip { background:transparent; border:1px solid var(--line); color:var(--dim); border-radius:999px;
  padding:3px 15px; font-size:.72rem; letter-spacing:.05em; cursor:pointer; }
.wv-fchip:hover { border-color:var(--amber-dark); color:var(--amber); }
.wv-fchip.on { border-color:var(--amber); color:var(--amber); background:var(--panel2); }
.wv-fchip:disabled { opacity:.38; cursor:not-allowed; }
.wv-mine-tail { margin-top:4px; }
.wv-mine-empty { margin:10px 0; font-style:italic; }
.wv-elsewhere { display:flex; flex-direction:column; gap:6px; }

/* the painting */
/* The painting is flush to its pane (Keemin, 2026-08-04). It used to sit inside
   18 px of padding behind a rounded 1 px rule — a frame around a painting that
   already fills the page, and one that appeared only when the Telling was open,
   because painting-only had quietly overridden it away. Now neither mode frames
   it, which is also one rule instead of two saying different things. */
.wv-map { padding:0; }
.wv-map .wv-sticky { position:sticky; top:0; }
/* The two map surfaces are things you GRAB, not prose you copy. Dragging used
   to sweep a text selection across the painting's labels, and a live selection
   then fights the next drag (the browser keeps extending it). The mousedown
   handler already preventDefaults; this is the belt to that suspender, because
   selection can still initiate from a text node in some engines regardless.
   Scoped to these two containers ON PURPOSE — the telling cards and letter
   bodies in the left pane must stay selectable, since people copy prose out of
   them. Nuking selection viewer-wide would trade a papercut for a wound. */
.wv-minimap { -webkit-user-select:none; user-select:none; }
.wv-minimap { position:relative; overflow:hidden; cursor:crosshair; }
.wv-minimap > svg { display:block; width:100%; height:auto; }
.wv-minimap .loading { padding:18px 12px; font-size:.82rem; font-style:italic; color:var(--dim); }
.wv-spectator-coordinate { position:absolute; z-index:6; left:50%; bottom:8px; transform:translateX(-50%);
  max-width:calc(100% - 20px); padding:5px 10px; border:1px solid var(--amber-dark); border-radius:999px;
  background:rgba(13,15,19,.92); color:var(--paper); font:700 .72rem/1.2 ui-monospace,Consolas,monospace;
  white-space:nowrap; pointer-events:none; box-shadow:0 3px 12px rgba(0,0,0,.35); }
/* ── the tour ─────────────────────────────────────────────────────────────────
   A dimmed page with one card on it, and — when the slide is about something you
   can point at — a hole cut around that thing so you read the words and the real
   control at the same time. The hole is one box-shadow with a spread wider than
   any screen, which is cheaper and steadier than an SVG mask and cannot fall out
   of step with the element it surrounds.

   The card is placed by placeBubble, the same tested function the mark bubbles
   use; the viewport is its box. A slide with no anchor, or one whose anchor is
   not on the page (every rail anchor, on a phone), centres instead. */
.wv-tour[hidden] { display:none; }
.wv-tour-scrim { position:fixed; inset:0; z-index:9100; background:rgba(6,7,10,.86);
  backdrop-filter:blur(1.5px); }
/* THE TOUR IS BLUE (Keemin, 2026-08-04). Amber is the market's colour and the
   tour is not a market surface — it is the thing that binds, the terms everyone
   arrives under, which is exactly what constitution blue already means on this
   page. The one exception is the stamp: ✦ and the word keep the violet they wear
   everywhere else, because that colour IS the vocabulary. */
.wv-tour-spot { position:fixed; z-index:9100; pointer-events:none;
  box-shadow:0 0 0 100vmax rgba(6,7,10,.86), 0 0 0 2px rgba(123,167,224,.55) inset;
  border:1px solid rgba(123,167,224,.72); transition:left .22s, top .22s, width .22s, height .22s; }
.wv-tour-spot[hidden] { display:none; }
.wv-tour-card { position:fixed; top:0; left:0; z-index:9200; width:min(30rem,calc(100vw - 32px));
  padding:20px 22px 16px; border:1px solid var(--line); border-left:3px solid var(--blue);
  border-radius:8px; background:rgba(13,15,19,.985); box-shadow:0 18px 60px rgba(0,0,0,.6);
  transition:transform .22s cubic-bezier(.4,0,.2,1); }
.wv-tour-card.is-centred { left:50%; top:50%; transform:translate(-50%,-50%); }
@media (prefers-reduced-motion:reduce){ .wv-tour-card, .wv-tour-spot { transition:none; } }
.wv-tour-kicker { margin:0 0 6px; font-family:var(--mono); font-size:.6rem; letter-spacing:.18em;
  text-transform:uppercase; color:var(--blue-dark); }
.wv-tour-title { margin:0 0 10px; font-size:1.12rem; line-height:1.25; color:var(--blue);
  font-weight:600; letter-spacing:.01em; }
.wv-tour-body { color:var(--paper); font-size:.9rem; line-height:1.62; }
.wv-tour-body b { color:var(--blue); font-weight:600; }
.wv-tour-body em { color:var(--dim); }
.wv-tour-body .tour-blue { color:var(--blue); }
.wv-tour-body .tour-green { color:var(--green); }
.wv-tour-body .tour-amber { color:var(--amber); }
.wv-tour-body .tour-grey { color:var(--draft); }
/* the stamp keeps its own colour wherever it is named — chip, sheet, balance,
   and here. Two classes because the glyph carries a touch more weight than the
   word beside it, exactly as it does on a backing chip. */
.wv-tour-body .tour-stamp { color:var(--stamp-violet); }
.wv-tour-body .tour-stamp-mark { color:var(--stamp-violet-heading); }
.wv-tour-foot { display:flex; align-items:center; gap:12px; margin-top:18px;
  padding-top:13px; border-top:1px solid var(--line); }
.wv-tour-dots { display:flex; align-items:center; gap:6px; margin-right:auto; }
.wv-tour-dot { width:7px; height:7px; padding:0; border:0; border-radius:999px; cursor:pointer;
  background:rgba(123,167,224,.26); transition:background .12s, transform .12s; }
.wv-tour-dot:hover { background:rgba(123,167,224,.62); transform:scale(1.25); }
.wv-tour-dot.on { background:var(--blue); }
.wv-tour-acts { display:flex; align-items:center; gap:7px; }
.wv-tour-acts button { font:inherit; font-family:var(--mono); font-size:.68rem; letter-spacing:.06em;
  cursor:pointer; border-radius:999px; padding:6px 14px; }
.wv-tour-skip { margin-right:4px; color:var(--dim); background:transparent; border:0; padding:6px 6px; }
.wv-tour-skip:hover { color:var(--paper); }
.wv-tour-back { color:var(--dim); background:transparent; border:1px solid var(--line); }
.wv-tour-back:hover:not(:disabled) { color:var(--paper); border-color:var(--blue-dark); }
.wv-tour-back:disabled { opacity:.3; cursor:not-allowed; }
.wv-tour-next { color:var(--night); background:linear-gradient(180deg,#a9c8ef,var(--blue));
  border:1px solid var(--blue); font-weight:700; }
/* the ? wears a ring until the tour has been taken once — a tutorial nobody
   finds is a tutorial nobody reads, and this is the smallest thing that says
   "there is one" without taking the page hostage on arrival */
.wv-tour-open.is-unseen { color:var(--blue); border-color:var(--blue);
  box-shadow:0 0 0 3px rgba(123,167,224,.2), 0 2px 10px rgba(0,0,0,.32); }
@media (max-width:720px){
  .wv-tour-card { width:calc(100vw - 20px); padding:16px 17px 13px; }
  .wv-tour-title { font-size:1rem; }
  .wv-tour-body { font-size:.84rem; }
}
.ov-reach { fill:rgba(232,197,106,.06); stroke:var(--amber); stroke-width:2.5; stroke-dasharray:10 8; opacity:.8; }
/* the overlay's pips speak the same tier language as everything else on the
   painting — the highlight box/dot, the footprints, the grid pips. They were
   uniform amber, which read as "one kind of thing" on a map whose whole point
   is that the kinds differ (Keemin 2026-07-27: "green homes, blue constitution").
   Amber stays the market default, so only the two named classes move. */
.ov-pip { fill:var(--amber); opacity:.65; }
.ov-pip.t-constitution { fill:var(--blue); }
.ov-pip.t-home { fill:var(--green); }
.ov-dot { fill:var(--you); stroke:#fff; stroke-width:3; }
.ov-halo { fill:none; stroke:var(--you); stroke-width:3; opacity:.55; }
/* hover highlight — the mark's box and dot light TOGETHER, in the mark's own
   tier color (Keemin 2026-07-24 eve: one visual language, cells ⇄ map) */
.wv-hl-box { fill:rgba(255,255,255,.06); stroke-width:3; vector-effect:non-scaling-stroke; }
.wv-hl-box.t-constitution { stroke:var(--blue); }
.wv-hl-box.t-home { stroke:var(--green); }
.wv-hl-box.t-market { stroke:var(--amber); }
.wv-hl-box.mech { stroke-dasharray:6 5; }
.wv-hl-dot { stroke:#fff; stroke-width:1.5; vector-effect:non-scaling-stroke; }
.wv-hl-dot.t-constitution { fill:var(--blue); }
.wv-hl-dot.t-home { fill:var(--green); }
.wv-hl-dot.t-market { fill:var(--amber); }
/* a hovered resident lights in the walker's own two-state colour, not a tier —
   a person is not a tier of mark, but they speak the same box */
.wv-hl-dot.wv-hl-walker { fill:var(--green); }
.wv-hl-dot.wv-hl-walker.moving { fill:#e0507a; }
/* walkers (write-release P2): the one thing on this map that moves. A walker is
   drawn where DERIVATION says they are — the layer keeps no position of its own. */
/* ONE resident, two states. Still is the common case and reads calm; moving is
   the exception and reads warm, because motion is the thing worth noticing. How
   we learned a position (walk record vs parcel) is provenance, not appearance. */
/* THE RING IS THE RULING. The walker used to BE this circle, filled green or
   pink; now it is the ring drawn around their face. Same two states, same two
   colours, same non-scaling stroke — the motion language did not move when the
   faces arrived, it just got something to go around. */
.wv-walker { fill:none; stroke:var(--green); stroke-width:2.5; vector-effect:non-scaling-stroke; }
.wv-walker.moving { stroke:#e0507a; }
/* the face itself: a picture clipped to the circle, or the monogram disc under
   it. Neither takes the pointer — the invisible halo above is the hit target,
   and a face that swallowed clicks would break the hover rules it sits inside. */
.wv-walker-face { pointer-events:none; }
.wv-walker-mono { stroke:none; pointer-events:none; }
.wv-walker-initial {
  fill:#101b31; font-weight:700; text-anchor:middle; dominant-baseline:central;
  pointer-events:none; font-family:var(--mono, ui-monospace, monospace);
}
/* the hit halo — invisible, but hoverable. fill:transparent (NOT fill:none) is
   the load-bearing part: none lets the pointer fall straight through. */
.wv-walker-hit { fill:transparent; stroke:none; pointer-events:all; cursor:help; }
/* THE VESSEL. A walker the fold calls a boat gets a hull instead of a face.
   Line art in the painting's own ink — the town's gold, which is what the atlas
   draws its own furniture in — and non-scaling strokes, so she stays a drawing
   at every zoom instead of thickening into a blot. Nothing here takes the
   pointer: the invisible halo in the walk layer is her hit target, on the same
   rule the faces already keep. */
.wv-vessel { pointer-events:none; }
.wv-vessel path { vector-effect:non-scaling-stroke; stroke-linejoin:round; stroke-linecap:round; }
/* SHE IS NOT IN THE PERSON COLOUR SYSTEM. Green-at-rest and pink-moving is the
   ruling for RESIDENTS, and the first cut obeyed it — which put a pink hull
   underneath forty-five pink passenger rings and lost the boat inside her own
   crowd. A vessel is not a walker, which is the entire premise of this glyph, so
   she takes the town's gold at every moment and the crowd keeps the pink. That
   she is under way is already said twice over, by the dashed leg running out of
   her bow and by the destination ring at the far end of it. */
.wv-vessel-hull { fill:rgba(20,23,29,.72); stroke:var(--amber); stroke-width:2.2; }
.wv-vessel-stem, .wv-vessel-mast { fill:none; stroke:var(--amber); stroke-width:2; }
.wv-vessel-sail { fill:rgba(20,23,29,.72); stroke:var(--amber); stroke-width:2; }
.wv-vessel-flap { fill:none; stroke:var(--amber); stroke-width:1.6; opacity:.9; }
.wv-vessel-water { fill:none; stroke:var(--amber); stroke-width:1.6; opacity:.45; }
/* THE FAR COUNTRY. A picture hung on a mountain, framed the way the atlas frames
   its own placed art; and the weather between here and there, which is geometry
   and not a filter, so panning it costs the compositor a translate. Neither
   layer takes the pointer — the record's pips are still what you click. */
.wv-far-art, .wv-mist { pointer-events:none; }
.wv-far-art-frame { fill:none; stroke:var(--amber); stroke-width:1.5; opacity:.7; vector-effect:non-scaling-stroke; }
.wv-walk-leg { stroke:#e0507a; stroke-width:2; stroke-dasharray:5 4; opacity:.75; vector-effect:non-scaling-stroke; }
.wv-walk-dest { fill:none; stroke:#e0507a; stroke-width:2; vector-effect:non-scaling-stroke; }
/* A WALK IS GREEN (Keemin, 2026-08-04) — the colour a resident and a home already
   are, so the proposal is in the same ink as the person who would make it. Amber
   is the market's colour and it was borrowing. The pink of a committed journey
   above is untouched: that one distinguishes a walk under way from a walk merely
   proposed, and collapsing it would lose the distinction. */
.wv-walk-preview-leg { stroke:var(--green); stroke-width:2.4; stroke-dasharray:10 6; opacity:.95; vector-effect:non-scaling-stroke; }
.wv-walk-preview-dest { fill:rgba(132,201,143,.18); stroke:var(--green); stroke-width:2.4; vector-effect:non-scaling-stroke; }
.wv-walk-preview-label rect { fill:rgba(13,15,19,.94); stroke:var(--green-dark); stroke-width:1; vector-effect:non-scaling-stroke; }
.wv-walk-preview-label text { fill:var(--green); font-family:Consolas,Menlo,monospace; font-weight:700; }
.wv-walkpanel { display:flex; align-items:center; gap:8px; font-size:12px; opacity:.9; margin:6px 0 0; flex-wrap:wrap; }
.wv-walkpanel input[type=range] { width:130px; vertical-align:middle; }
.wv-walkpanel button { font:inherit; padding:1px 7px; cursor:pointer; }
#wv-walk-readout { opacity:.75; }
/* the viewport (P2 right-pane convergence): pan/zoom/lock-on live on the painting */
/* The painting's controls FLOAT ON THE PAINTING (Keemin, 2026-08-04) — they act
   on what is under them, so they sit on it, in the same family as the coordinate
   and tally chips already riding the corners. Mono pills in the gold, the same
   shape as the site's sign-in and back links; the glyph leads, the word follows.
   Backdrop-blurred, because they hang over a painting rather than a panel. */
/* the world-root's glyph: the same blue circle .ov-pip.t-constitution draws, in
   the corner rather than at a coordinate. Twice a pip's on-screen size (Keemin,
   2026-08-04) — it is the only mark with no footprint to hover over and no pip on
   the painting to find, so the corner is the whole of its target. */
.wv-worldmark { position:absolute; z-index:6; top:13px; left:13px; }
.wv-root-mark { display:block; width:26px; height:26px; padding:0; cursor:pointer;
  border:0; border-radius:999px; background:var(--blue); opacity:.65;
  box-shadow:0 1px 6px rgba(0,0,0,.55); transition:opacity .12s, box-shadow .12s; }
.wv-root-mark:hover, .wv-root-mark.is-hovered { opacity:1; }
.wv-root-mark.on { opacity:1; box-shadow:0 0 0 4px rgba(123,167,224,.35), 0 1px 6px rgba(0,0,0,.55); }
.wv-mapctl { position:absolute; z-index:6; top:10px; right:10px; display:flex; gap:6px;
  flex-wrap:wrap; justify-content:flex-end; max-width:calc(100% - 20px); }
/* glyph only, so they are round rather than pill-shaped — the word each one used
   to carry lives in its title and aria-label */
.wv-mapctl .ctl { display:inline-grid; place-items:center; width:2.15rem; height:2.15rem;
  font-family:var(--mono); font-size:1.05rem; line-height:1; padding:0;
  color:rgba(232,197,106,.78); background:rgba(13,15,19,.82);
  border:1px solid rgba(232,197,106,.34); border-radius:999px;
  backdrop-filter:blur(4px); box-shadow:0 2px 10px rgba(0,0,0,.32); }
.wv-mapctl .ctl:hover { color:var(--amber); border-color:rgba(232,197,106,.6);
  background:rgba(232,197,106,.16); }
.wv-mapctl .ctl.on { color:var(--night); border-color:var(--amber);
  background:linear-gradient(180deg,#f0d68f,var(--amber)); }
/* hard against the right edge, so the help opens back across the painting */

.wv-minimap.pannable { cursor:grab; }
.wv-minimap.panning { cursor:grabbing; }
.wv-gridline { stroke:#e8c56a; stroke-opacity:.14; stroke-width:1; vector-effect:non-scaling-stroke; }
.wv-gridline.major { stroke-opacity:.32; }
/* footprints — every mark's true extent from the record. ONE vocabulary with the
   cells: tier sets the color (tierOf), dashed = the law/mechanic modifier. */
#wv-fp-layer { pointer-events:none; }
#wv-hl-layer { pointer-events:none; }
/* where the town is talking: each thread's ground, from the office's earshot
   derivation. Pale blue-gray — violet is the stamps' word (Keemin). A live
   conversation breathes; a finished one is a cooling mark that leaves the map
   after a day. The aboard variant is the deck drawn as a room rather than the
   length of the water it crossed. A wash carries no text of its own: hovering
   raises the SAME name-box a mark raises, in this same pale voice. */
.wv-convo { fill:rgba(183,198,212,.06); stroke:#7f93a6; stroke-width:1.5;
  stroke-dasharray:3 4; vector-effect:non-scaling-stroke; }
.wv-convo.is-live { fill:rgba(183,198,212,.12); stroke:#b7c6d4; stroke-width:2;
  stroke-dasharray:none; animation:wv-convo-breathe 3.2s ease-in-out infinite; }
.wv-convo.is-aboard { stroke-dasharray:6 5; }
.wv-hl-label.wv-hl-convo { color:#b7c6d4; }
.pannable.over-convo { cursor:pointer; }
@keyframes wv-convo-breathe { 0%,100% { stroke-opacity:.9; } 50% { stroke-opacity:.45; } }
.wv-fp { fill:none; stroke-width:1.4; vector-effect:non-scaling-stroke; }
.wv-fp.t-constitution { stroke:var(--blue-dark); }
.wv-fp.t-home { stroke:var(--green-dark); }
.wv-fp.t-market { stroke:var(--amber-dark); }
.wv-fp.mech { stroke-dasharray:6 5; }
.wv-fp.fp-parcel { fill:rgba(132,201,143,.10); }
/* the marks you stand WITHIN read a tad heavier — the map's echo of the
   "Where you stand" ladder (Keemin: no nesting ceremony, just weight) */
.wv-fp.fp-within { stroke-width:2.8; }
/* THE name-box, and there is one of it (Keemin 2026-08-04: use the same box the
   off-screen marks use — they are nicer because they are coloured). An on-screen
   mark and one clipped at the edge are the same mark saying its name, so they had
   no business speaking in two different visual registers: the edge box was
   tier-coloured and set in the world's serif, this one was grey-bordered
   monospace. Monospace belongs to the readouts that are NUMBERS — the coordinate
   chip, the walk metrics — and a name is not a number.
   Colour rides on the color property so the rect's stroke and the text can both
   be currentColor, which is what lets one rule serve every tier. */
.wv-hl-label, .wv-edge-indicator { color:var(--amber); }
.wv-hl-label.t-constitution, .wv-edge-indicator.t-constitution { color:var(--blue); }
.wv-hl-label.t-home, .wv-edge-indicator.t-home { color:var(--green); }
.wv-hl-label.t-market, .wv-edge-indicator.t-market { color:var(--amber); }
/* a resident is not a tier of mark, but speaks the same box — in the walker's own
   two states, so the name agrees with the dot it is naming */
.wv-hl-label.wv-hl-walker { color:var(--green); }
.wv-hl-label.wv-hl-walker.moving { color:#e0507a; }
.wv-hl-label rect, .wv-edge-indicator rect { fill:rgba(13,15,19,.94); stroke:currentColor;
  stroke-width:1; vector-effect:non-scaling-stroke; }
.wv-hl-label text, .wv-edge-indicator text { fill:currentColor; font-family:Georgia,"Times New Roman",serif; }
.wv-edge-indicator.t-constitution { color:var(--blue); }
.wv-edge-indicator.t-home { color:var(--green); }
.wv-edge-indicator.t-market { color:var(--amber); }
.wv-edge-indicator > path { fill:currentColor; stroke:var(--night); stroke-width:.8; }
.wv-edge-indicator rect { fill:rgba(13,15,19,.94); stroke:currentColor; stroke-width:1; }
.wv-edge-indicator text { fill:currentColor; font-family:Georgia,"Times New Roman",serif; }
.ov-reach { vector-effect:non-scaling-stroke; }
.ov-halo { vector-effect:non-scaling-stroke; }
/* the same defect the name-box had: a 3-unit white ring grows with every zoom
   step until it swallows the ember it is meant to outline. The halo beside it
   already said this; the dot never did. */
.ov-dot { vector-effect:non-scaling-stroke; }

.wv-nav .wv-identity { margin:10px 0 2px; font-size:.8rem; }
.wv-nav .handlepick { display:flex; flex-wrap:wrap; gap:5px; }
.wv-nav .handleopt.on { border-color:var(--you); color:var(--you); }
.wv-nav .wv-identity h2 { margin-top:0; }

/* ── the crossings (DEMO SLICE, step 5 — jetto/enter-exit-demo) ──────────────
   The Actions section sits directly under Act As (R16) and its own colour is
   the ochre of a threshold: not the green of a proposal you are part way
   through, and not the amber of the walk desk, because entering is a different
   axis and should not read as a kind of walking. */
.wv-nav .wv-actions { margin:12px 0 2px; padding-top:10px; border-top:1px solid var(--line); font-size:.8rem; }
.wv-nav .wv-actions[hidden] { display:none; }
.wv-nav .wv-actions h2 { margin:0 0 6px; font-size:.68rem; letter-spacing:.14em; text-transform:uppercase;
  color:#c8a24a; font-family:var(--mono); }
.wv-within-line { font-size:.74rem; color:var(--dim); margin-bottom:7px; line-height:1.5; }
.wv-within-line.is-outside { font-style:italic; opacity:.75; }
.wv-within-step { color:#d9b562; }
.wv-within-step.is-here { color:#f0d489; font-weight:600; }
.wv-actrows { display:flex; flex-direction:column; gap:5px; }
.wv-act-enter, .wv-act-exit, .wv-scope-exit { border-color:#8c6f2e; color:#e2c072; }
.wv-act-enter:hover, .wv-act-exit:hover, .wv-scope-exit:hover { border-color:#c8a24a; color:#f3dc9e; }
.wv-act-terms { font-size:.7rem; color:var(--dim); font-style:italic; margin:-1px 0 3px 2px; line-height:1.45; }
.wv-word { margin-left:7px; padding:1px 6px; border-radius:9px; font-size:.62rem; letter-spacing:.09em;
  text-transform:uppercase; font-family:var(--mono); border:1px solid #6c5522; color:#c8a24a; }
.wv-act-enter.is-opposed { border-color:#7a3f36; color:#e0a08c; }
.wv-act-enter.is-opposed .wv-word { border-color:#7a3f36; color:#e0a08c; }
.wv-cross-notice { margin-top:7px; font-size:.73rem; color:#cbbf9c; line-height:1.5; }
.wv-cross-notice.refusal { color:#e0a08c; }

/* the y/n offer at a boundary — it hangs on the walk desk, where the reader's
   eyes already are the instant a walk lands */
.wv-cross-prompt { margin-top:9px; padding-top:8px; border-top:1px dashed var(--line);
  display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:.74rem; }
.wv-cross-ask { flex:1 1 100%; color:#e2c072; line-height:1.45; }
.wv-cross-yes { border-color:#8c6f2e; color:#e2c072; }

/* THE CUT — the entered mark's own sector. The bar is the chrome that says the
   read is no longer a point of view but a place. */
.wv-scope-bar { display:flex; align-items:center; gap:10px; margin:0 0 8px;
  padding:8px 10px; border:1px solid #6c5522; border-left:3px solid #c8a24a; border-radius:5px;
  background:rgba(200,162,74,.07); }
.wv-scope-in { flex:1; font-size:.86rem; color:#f0d489; }
.wv-scope-in b { color:#ffe9b0; }
.wv-scope-chain { font-size:.72rem; color:var(--dim); margin:-4px 0 10px 2px; }
.wv-scope-read { font-size:.86rem; line-height:1.6; margin-bottom:10px; }
.wv-scope-terms { font-size:.75rem; color:#cbbf9c; font-style:italic; line-height:1.55;
  margin:-4px 0 12px; padding-left:9px; border-left:2px solid #6c5522; }
.wv-occupants { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.wv-occupant { padding:3px 8px; border:1px solid var(--line); border-radius:11px; font-size:.76rem; color:var(--you); }
.wv-occupant.is-you { border-color:var(--you); }
.wv-occupant.is-none { border:0; color:var(--dim); font-style:italic; padding-left:0; }
.wv-scope-empty, .wv-scope-out { font-size:.75rem; color:var(--dim); font-style:italic; line-height:1.5; }
.wv-scope-out { margin-top:8px; }

/* the threshold sheet: the terms, read before the crossing */
.wv-threshold { position:absolute; inset:0; z-index:40; display:flex; align-items:center; justify-content:center;
  background:rgba(8,9,12,.72); }
.wv-threshold-in { width:min(30rem,86%); padding:18px 20px; border:1px solid #6c5522; border-left:3px solid #c8a24a;
  border-radius:7px; background:#12141a; box-shadow:0 18px 50px rgba(0,0,0,.6); }
.wv-threshold-hd { font-size:.7rem; letter-spacing:.14em; text-transform:uppercase; color:#c8a24a;
  font-family:var(--mono); margin-bottom:9px; }
.wv-threshold-body { font-size:.88rem; line-height:1.6; margin-bottom:11px; }
.wv-threshold-terms { font-size:.8rem; line-height:1.6; color:#e2c072; padding-left:10px;
  border-left:2px solid #6c5522; margin-bottom:11px; }
.wv-threshold-read { font-size:.71rem; color:var(--dim); font-style:italic; line-height:1.5; margin-bottom:14px; }
.wv-threshold-btns { display:flex; gap:8px; }
.wv-threshold-yes { border-color:#8c6f2e; color:#e2c072; }
/* The walk desk is a bubble on the painting now, in the bottom-right corner: same
   dark card, same rule down the left, in the amber a proposal is drawn in. It sits
   ABOVE the bubble layer, because it is the one thing on this page you are part
   way through doing. */
.wv-walkdesk { position:absolute; z-index:8; right:10px; bottom:10px; width:min(19rem,42%);
  padding:11px 13px 13px; border:1px solid var(--line); border-left:3px solid var(--green);
  border-radius:6px; background:rgba(13,15,19,.97); box-shadow:0 10px 30px rgba(0,0,0,.55); }
.wv-walkdesk[hidden] { display:none; }
.wv-walkdesk h2 { margin:0; font-size:.68rem; letter-spacing:.14em; text-transform:uppercase;
  color:var(--green); font-family:var(--mono); }
.wv-youhere { color:var(--dim); font-size:.76rem; margin-bottom:8px; }
.wv-youhere b { color:var(--you); }
.wv-walk-status { margin:7px 0 8px; padding:8px 9px; border:1px solid var(--line);
  border-radius:4px; color:var(--dim); font-size:.74rem; line-height:1.45; }
.wv-walk-status.journey { border-color:var(--you); background:rgba(224,101,74,.08); color:var(--you); }
.wv-walk-status.journey b { color:var(--you); }
.wv-walk-status.arrived b { color:var(--green); }
.wv-change-course { display:block; margin-top:6px; padding:0; border:0; background:transparent;
  color:var(--you); font:inherit; font-weight:700; cursor:pointer; text-decoration:underline;
  text-underline-offset:2px; }
.wv-change-course:hover, .wv-change-course:focus-visible { color:var(--paper); }
/* From / To, one line each */
.wv-walk-row { display:flex; gap:9px; align-items:baseline; margin-top:8px; }
.wv-walk-key { flex:none; width:2.9rem; color:var(--dim); font-family:var(--mono);
  font-size:.6rem; letter-spacing:.12em; text-transform:uppercase; }
.wv-walk-val { min-width:0; color:var(--paper); font-size:.79rem; line-height:1.45; }
.wv-walk-val b { color:var(--paper); }
/* THE LEG ON ITS OWN LINE (Keemin, 2026-08-04): how far, which way, how long.
   They were trailing the destination's name inside the To row, so a long name
   wrapped them one at a time onto lines of their own anyway — badly. */
.wv-walk-legline { display:flex; align-items:center; gap:8px; margin-top:4px;
  font-family:var(--mono); font-size:.68rem; letter-spacing:.04em; }
.wv-walk-meta { color:var(--green); font-variant-numeric:tabular-nums; white-space:nowrap; }
.wv-walk-dir { display:inline-flex; align-items:center; color:var(--green); margin:0; }
.wv-walk-dir .wv-arrow { width:.95em; height:.95em; margin:0; vertical-align:middle; }
/* confirm is filled, because it is the act; cancel is an outline beside it */
.wv-walk-acts { display:flex; gap:6px; margin-top:12px; }
.wv-walkdesk .wv-walk-confirm { flex:1; background:linear-gradient(180deg,#a9dcb1,var(--green));
  color:var(--night); border:1px solid var(--green); border-radius:999px; padding:6px 10px;
  font:inherit; font-weight:700; font-size:.74rem; cursor:pointer; }
.wv-walkdesk .wv-walk-confirm:disabled { opacity:.32; cursor:not-allowed; }
.wv-walk-cancel { flex:none; background:transparent; border:1px solid var(--line);
  color:var(--dim); border-radius:999px; padding:6px 13px; font:inherit; font-size:.74rem; cursor:pointer; }
.wv-walk-cancel:hover { color:var(--paper); border-color:var(--green-dark); }
.wv-walk-answer { margin:7px 0 0; color:var(--dim); font-size:.74rem; }
.wv-walk-answer.success { color:var(--green); }
.wv-walk-answer.refusal { color:var(--err); }
/* the record of acts: one line each — the actor in their own weight, the thing
   they acted on in its tier's colour, and how long ago in the dim underneath */
.wv-activity { margin-top:20px; padding-top:14px; border-top:1px solid var(--line); }
/* the two lanes that joined the rail (2026-08-08): a stake is stamps going
   behind a mark, a blessing is the keeper's gate opening. The blessing has no
   author, so its line starts with the thing that happened. */
.wv-act-n { color:var(--stamp-violet); font-variant-numeric:tabular-nums; }
.wv-act-line.is-settlement { color:var(--amber); }
.wv-act-bless { font-variant-numeric:tabular-nums; letter-spacing:.02em; }
/* the settlement chip, beside the crossing chip it shares a clock with */
.wv-nav .settlenow { font-size:.72rem; color:var(--dim); font-variant-numeric:tabular-nums; }
.wv-activity h2 { margin-top:0; }
.wv-acts { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.wv-act-line { font-size:.76rem; line-height:1.42; color:var(--dim); }
.wv-act-line .who { color:var(--paper); }
.wv-act-line .what { color:var(--amber); cursor:pointer; }
.wv-act-line .what:hover { text-decoration:underline; }
.wv-act-line .when { display:block; margin-top:2px; font-family:var(--mono); font-size:.58rem;
  letter-spacing:.1em; text-transform:uppercase; opacity:.7; }
.wv-act-line.is-walk .what { color:var(--green); }
/* a mark that has since been retired still happened: it keeps its line and loses
   its link, rather than vanishing and making the record look shorter than it is */
.wv-act-line.is-gone .what { color:var(--dim); cursor:default; text-decoration:line-through; }
.wv-act-line.is-gone .what:hover { text-decoration:line-through; }
.wv-acts .wv-quiet { font-size:.76rem; }
.wv-nav .crossnow { font-size:.78rem; color:var(--dim); }
.wv-nav .crossnow b { color:var(--amber); font-variant-numeric:tabular-nums; }
.wv-nav .crosslive-tag { color:var(--green); font-size:.78rem; }
.wv-dev .cross .crossrow { display:flex; gap:6px; align-items:center; }
.wv-dev .cross input.crossover { flex:1; }
.wv-dev .cross .crosslive { white-space:nowrap; font-size:.76rem; padding:3px 7px; }
.wv-moved { position:sticky; top:6px; z-index:5; display:inline-block; margin-bottom:10px;
  background:var(--panel2); border:1px solid var(--amber-dark); border-radius:999px; padding:4px 13px;
  font-size:.8rem; color:var(--amber); opacity:0; transform:translateY(-4px);
  transition:opacity .3s, transform .3s; pointer-events:none; }
.wv-moved.show { opacity:.96; transform:translateY(0); }
.wv-quiet { color:var(--dim); font-style:italic; }
.wv-err { color:var(--err); }

/* ── the telling collapsed ────────────────────────────────────────────────────
   The app frame the wide breakpoint builds (each column scrolls itself, nothing
   scrolls the page) is what this mode wants at EVERY width, so it is lifted out
   of the media query and re-stated here. */
.wv.is-painting-only { height:100vh; display:flex; flex-direction:column; overflow:hidden; }
.wv.is-painting-only > div { flex:1 1 0; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.wv-main.is-painting-only { flex:1 1 0; min-height:0; overflow:hidden; align-items:stretch; }
.wv-main.is-painting-only .wv-nav { overflow-y:auto; min-height:0; }
.wv-main.is-painting-only .wv-map { grid-column:auto; border-top:0; display:flex;
  flex-direction:column; min-height:0; overflow:hidden; }
.wv-main.is-painting-only .wv-map .wv-sticky { position:static; display:flex; flex-direction:column;
  min-height:0; flex:1; }
.wv-main.is-painting-only .wv-minimap { flex:1; min-height:0; }
.wv-main.is-painting-only .wv-minimap > svg { width:100%; height:100%; }
.wv-paint-tallies { position:absolute; z-index:6; left:9px; bottom:8px; max-width:min(34rem,52%);
  padding:4px 10px; border:1px solid var(--line); border-radius:999px; background:rgba(13,15,19,.9);
  color:var(--dim); font-size:.7rem; line-height:1.4; pointer-events:none; }
.wv-paint-tallies:empty, .wv-paint-tallies[hidden] { display:none; }

/* ── the bubbles ──────────────────────────────────────────────────────────────
   Prose over a map. Positioned in the PANEL's pixels and never in the painting's
   units, because a sentence should not grow when you zoom — the SVG hover label
   makes the opposite choice, which is exactly why it stands down in this mode. */
.wv-bubbles { position:absolute; inset:0; z-index:7; pointer-events:none; overflow:hidden; }
.wv-bubble { position:absolute; top:0; left:0; width:max-content; max-width:min(31rem,72%);
  --wv-mark-accent:var(--amber);
  border:1px solid var(--line); border-left:3px solid var(--wv-mark-accent); border-radius:6px;
  background:rgba(13,15,19,.97); box-shadow:0 10px 30px rgba(0,0,0,.55);
  will-change:transform; }
.wv-bubble[hidden] { display:none; }
.wv-bubble.t-constitution { --wv-mark-accent:var(--blue); }
.wv-bubble.t-home { --wv-mark-accent:var(--green); }
.wv-bubble.t-market { --wv-mark-accent:var(--amber); }
/* a bubble that fits on neither side of its anchor is covering the thing it
   describes; say so with weight rather than pretending it still points at it */
.wv-bubble.side-over { opacity:.93; }
/* who is in front when they cannot help but overlap: the mark you opened, then
   the glance, then the standing bubble you did not ask for */
.wv-bubble.is-hover { z-index:2; pointer-events:none; max-width:min(26rem,64%); }
.wv-bubble.is-pinned { z-index:3; pointer-events:auto; max-height:min(64%,32rem); overflow-y:auto;
  scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
/* the bubble's own chrome bar: the way back on the left, the way out on the
   right. Sticky, so a long relations tree never scrolls either of them away. */
.wv-bubble-nav { position:sticky; top:0; z-index:3; display:flex; align-items:center; gap:8px;
  padding:5px 6px 5px 9px; background:rgba(13,15,19,.97); border-bottom:1px solid var(--line); }
/* The way back is written in the ink of the mark it goes back to (Keemin,
   2026-08-04) — blue for a constitution mark, green for a home, amber otherwise.
   It is the same tier vocabulary every other coloured surface speaks, so the
   button says WHAT you are returning to and not merely that you can.
   Hover deliberately does not repaint the text: a background is affordance
   enough, and a colour that changed under the pointer would be the one place in
   this page where an accent stopped meaning tier. */
.wv-bubble-back { border:0; background:transparent; color:var(--amber); font:inherit; font-size:.78rem;
  line-height:1.3; cursor:pointer; padding:3px 7px; border-radius:4px; min-width:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wv-bubble-back.t-constitution { color:var(--blue); }
.wv-bubble-back.t-home { color:var(--green); }
.wv-bubble-back.t-market { color:var(--amber); }
.wv-bubble-back:hover, .wv-bubble-back:focus-visible { background:var(--panel2); }
.wv-bubble-close { margin-left:auto; flex:none; border:0; background:transparent; color:var(--dim);
  font:inherit; font-size:.95rem; line-height:1; padding:4px 7px; cursor:pointer; border-radius:4px; }
.wv-bubble-close:hover, .wv-bubble-close:focus-visible { color:var(--paper); background:var(--panel2); }
/* the cell inside a bubble is the SAME cell the panel builds — the bubble only
   takes away the frame it no longer needs (its own border, its width cap) */
.wv-bubble .wv-card { border:0; border-radius:0; margin:0; max-width:none; padding:10px 13px; cursor:pointer; }
.wv-bubble .wv-card:hover { border-color:transparent; }
.wv-bubble .wv-card.is-mark-selected { outline:none; }
.wv-bubble.is-hover .wv-card { cursor:default; }
.wv-bubble.is-hover .cbody { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;
  overflow:hidden; font-size:.92rem; }
.wv-bubble-hint { padding:0 13px 9px; margin:0; color:var(--dim); font-size:.68rem;
  letter-spacing:.05em; text-transform:uppercase; opacity:.75; }
/* the contested-click chooser: a compact stack list in the bubble's own chrome,
   innermost first. Rows are the page's ordinary cell title, so a row looks like
   the thing it opens. */
.wv-chooser { padding:9px 10px; display:flex; flex-direction:column; gap:5px; }
.wv-choose-lead { margin:0 0 3px; font-size:.72rem; color:var(--dim); }
.wv-choose-row {
  display:block; width:100%; text-align:left; cursor:pointer;
  padding:6px 8px; border-radius:7px; color:inherit; font:inherit;
  background:rgba(13,20,38,.55); border:1px solid var(--line);
}
.wv-choose-row:hover { border-color:var(--amber); background:rgba(28,44,79,.6); }
.wv-choose-row:focus-visible { outline:2px solid var(--amber); outline-offset:1px; }
.wv-bubble-walker { padding:10px 13px; font-size:.8rem; line-height:1.5; color:var(--dim); }
.wv-bubble-walker .wv-standing { color:var(--paper); font-weight:700; font-style:normal; }
.wv-bubble-walker p { margin:5px 0 0; }
/* the mini card: their face, their names, their house. The ring colour repeats
   here so the card and the dot on the map are visibly the same person in the
   same state. */
.wv-face-row { display:flex; align-items:center; gap:9px; }
.wv-face { width:34px; height:34px; flex:0 0 auto; border-radius:999px; overflow:hidden;
  display:grid; place-items:center; border:2px solid var(--green); }
.wv-bubble-walker.moving .wv-face { border-color:#e0507a; }
.wv-face-img { width:100%; height:100%; object-fit:cover; display:block; }
.wv-face-mono { width:100%; height:100%; display:grid; place-items:center;
  color:#101b31; font-weight:700; font-size:.95rem; }
.wv-face-who { display:flex; flex-direction:column; gap:1px; min-width:0; }
.wv-face-handle { font-size:.7rem; letter-spacing:.04em; color:var(--dim); }
.wv-face-house { font-size:.7rem; color:var(--amber); }
.wv-face-go { margin:8px 0 0; }
.wv-face-go a { color:var(--paper); text-decoration:none; border-bottom:1px solid var(--line); }
.wv-face-go a:hover { border-bottom-color:var(--paper); }

/* ── drafts, everywhere at once ────────────────────────────────────────────────
   There is no My World lens any more; a draft is simply grey. Every rule below
   overrides a tier rule of the SAME specificity and is stated after it, so the
   state wins the colour and the tier chip goes on saying which kind of thing it
   is. If a surface speaks tier and is missing here, it will keep painting a
   draft as though the town had published it — the two lists must stay level. */
.wv-card.is-draft, .wv-rnode.is-draft, .wv-attribute.is-draft {
  --wv-mark-accent:var(--draft); border-left-color:var(--draft-dark); }
.wv-card.is-draft:hover, .wv-rnode.is-draft:hover, .wv-attribute.is-draft:hover { border-color:var(--draft-dark); }
.wv-card.is-draft .cname, .wv-card.is-draft .cname.is-determined,
.wv-rnode.is-draft .cname, .wv-rnode.is-draft .cname.is-determined { color:var(--draft); }
.wv-card.is-draft .cbody { color:var(--draft); }
.wv-chip.is-draft { border-color:var(--draft-dark); color:var(--draft); letter-spacing:.07em; }
.ov-pip.is-draft { fill:var(--draft); }
.wv-fp.is-draft { stroke:var(--draft-dark); }
.wv-fp.is-draft.fp-parcel { fill:rgba(154,160,171,.08); }
.wv-hl-box.is-draft { stroke:var(--draft); }
.wv-hl-dot.is-draft { fill:var(--draft); }
.wv-edge-indicator.is-draft, .wv-hl-label.is-draft { color:var(--draft); }
.wv-bubble.is-draft { --wv-mark-accent:var(--draft); }
.wv-bubble-back.is-draft { color:var(--draft); }
`;

const MARKUP = `
<div class="wv-main">
  <nav class="wv-nav">
    <!-- The head of the rail: what this page IS, what state it is in, the switch
         for the Telling, the crossing, and the SEAT the site's back-link and auth
         pill move themselves into. The Telling's switch is an icon here and its
         NAME lives on its own panel (Keemin, 2026-08-04) — the panel says what it
         is; the rail only has to offer the switch. -->
    <div class="wv-nav-top">
      <div class="wv-worldline">
        <h1>The World</h1>
        <span class="wv-chip wv-beta-chip" title="the record is real, and so are the acts taken here — the viewer is still finding its shape">BETA</span>
        <button type="button" class="wv-telling-toggle" aria-expanded="true"
          aria-label="The Telling" title="show or hide the Telling">▤</button>
      </div>
      <div class="crossnow"></div>
      <!-- what the world's own clock is counting down to. Hidden until the
           office answers: a chip that said "next attempt in —" before it knew
           anything would be furniture pretending to be information. -->
      <div class="settlenow" hidden></div>
    </div>
    <div class="wv-identity"></div>
    <!-- ACTIONS (R16) — the apex-consuming buttons, directly under Act As. This
         demo slice contributes exactly two, enter and exit, and they are DERIVED
         from where the selected resident stands rather than hand-listed: enter
         appears when there is a threshold in front of them, exit when they are
         within something. Step 4's rail owns the general derivation; when that
         branch lands these two become entries in it. -->
    <div class="wv-actions" hidden></div>
    <!-- WHAT HAS BEEN HAPPENING (Keemin, 2026-08-05) — the foot of the rail, under
         everything you can act with, because it is the one part of this column you
         read rather than press. -->
    <section class="wv-activity" hidden>
      <h2>Lately</h2>
      <ol class="wv-acts"></ol>
    </section>
    <button class="ctl wv-dev-toggle" hidden>⚙ dev dials</button>
    <div class="wv-dev" hidden>
      <!-- Stand at / Move / step size are DEV INSTRUMENTS (Keemin 2026-08-04, and
           the bronze spectator-stand-move-dev-only-before-walk before it): a
           resident's position is walk-derived, and a spectator repositions by
           clicking open ground on the painting. They live under the dials now
           rather than beside them. -->
      <div class="wv-standmove">
        <h2>Stand at</h2>
        <div class="presets">${PRESETS.map((p) => `<button class="ctl" data-x="${p.x}" data-y="${p.y}">${esc(p.label)}</button>`).join("")}</div>
        <h2>Move</h2>
        <div class="compass">
          <button class="ctl" data-dx="-1" data-dy="-1">NW</button><button class="ctl" data-dx="0" data-dy="-1">N</button><button class="ctl" data-dx="1" data-dy="-1">NE</button>
          <button class="ctl" data-dx="-1" data-dy="0">W</button><div class="pos">at TC</div><button class="ctl" data-dx="1" data-dy="0">E</button>
          <button class="ctl" data-dx="-1" data-dy="1">SW</button><button class="ctl" data-dx="0" data-dy="1">S</button><button class="ctl" data-dx="1" data-dy="1">SE</button>
        </div>
        <div class="stepwrap">
          <label class="steplbl">step size <b class="stepval">100 m</b></label>
          <input class="stepslider" type="range" min="0" max="${STEP_NOTCHES.length - 1}" step="1" value="3" list="wv-stepticks" aria-label="step size">
          <datalist id="wv-stepticks">${STEP_NOTCHES.map((_, i) => `<option value="${i}"></option>`).join("")}</datalist>
        </div>
      </div>
      <!-- the walk ledger's own tally: a diagnostic, not a thing the town needs to
           read at the bottom of its map -->
      <p class="wv-walkpanel" id="wv-walk-panel"></p>
      <div class="wv-dev-dials"></div>
    </div>
  </nav>
  <!-- TWO PANELS OF ONE RANK (Keemin 2026-08-04). The cells were an unnamed middle
       column and the painting had a title; they are peers, so they read as peers.
       The Telling collapses to a rail that still says its own name. -->
  <section class="wv-view">
    <div class="wv-viewhead">
      <h2>The Telling</h2>
      <p class="wv-view-sub">closer to how your agent sees the world — the record told in words from where you stand, never drawn</p>
    </div>
    <div class="wv-telling"><div class="wv-quiet">opening your eyes…</div></div>
  </section>
  <aside class="wv-map">
    <div class="wv-sticky">
      <div class="wv-minimap"><div class="loading">fetching the painting…</div><div class="wv-worldmark">
          <!-- The mark that frames everything, drawn as what it IS: a constitution
               pip, the same blue dot as any other. It has no footprint to stand on
               and no place of its own, so it takes the one corner of the painting
               it can honestly occupy — and the bubble hangs off THAT, rather than
               floating in the middle of the page for want of a coordinate. -->
          <!-- NO title attribute (Keemin, 2026-08-04). It is a mark, and a mark answers the
               pointer with its own bubble; the browser's native tooltip arrived on
               top of that bubble and covered the thing it was labelling. The
               aria-label still names it for anyone not reading with their eyes. -->
          <button type="button" class="wv-root-mark" data-root-mark
            aria-label="Let There Be Light"></button>
        </div><div class="wv-mapctl">
          <!-- GLYPH ONLY (Keemin, 2026-08-04). These hang over a painting, and the
               words were four pills' worth of chrome across the top of it. The name
               keeps its seat in title and aria-label — dropping the word from
               the button must not drop it from the page. -->
          <button class="ctl wv-map-home" aria-label="fit" title="fit the whole painting">⛶</button>
          <button class="ctl wv-map-follow" aria-label="follow" title="keep the view centred on where you stand">◎</button>
          <button class="ctl wv-map-grid" aria-label="grid" title="the survey grid — 1 km lines, 5 km majors">▦</button>
          <button class="ctl wv-map-fp" aria-label="marks" title="every mark's true extent, drawn from the record — parcels green, market amber, constitution dashed">⬚</button>
          <button class="ctl wv-map-convo" aria-label="conversations" title="where the town is talking — live threads and the last day's, drawn as the ground they covered; labels link to the record">💬</button>
          <button type="button" class="ctl wv-tour-open" aria-label="Take the tour"
            title="a short tour of the world">?</button>
        </div><div class="wv-spectator-coordinate" aria-live="polite" hidden></div><div class="wv-paint-tallies" hidden></div><div class="wv-bubbles"></div><!--
       THE WALK DESK RIDES ON THE PAINTING (Keemin, 2026-08-04) — bottom right,
       and only once a destination is armed. It answers a click you made on the
       painting, so it belongs to the painting; in the rail it was a permanent
       column of chrome for a thing that is true a few seconds at a time.
       Deliberately still ONE node with one renderer, moved rather than copied:
       renderWalkDestination did not change, and a second desk is exactly how the
       two would come to disagree about what you had armed. -->
     <section class="wv-walkdesk" hidden>
          <h2>Walk</h2>
          <!-- From and To, and nothing else (Keemin, 2026-08-04). It had said where
               you stand, then how it knew, then that you had arrived where you stand —
               three lines for one fact. -->
          <div class="wv-walk-status" hidden></div>
          <div class="wv-walk-planner">
            <!-- WHOSE FEET (Keemin, 2026-08-05). From and To said where; nothing said
                 who, and on a page where you can act as any of your household's
                 residents that is the one thing worth being certain of. -->
            <div class="wv-walk-row"><span class="wv-walk-key">Who</span><span class="wv-walk-val wv-walk-who"></span></div>
            <div class="wv-walk-row"><span class="wv-walk-key">From</span><span class="wv-walk-val wv-youhere">…</span></div>
            <div class="wv-walk-row"><span class="wv-walk-key">To</span><span class="wv-walk-val wv-walk-destination"></span></div>
            <div class="wv-walk-acts">
              <button type="button" class="wv-walk-confirm" disabled>confirm</button>
              <button type="button" class="wv-walk-cancel" hidden>cancel</button>
            </div>
            <p class="wv-walk-answer" hidden></p>
          </div>
        </section></div>
    </div>
  </aside>
</div>
<!-- Fixed, and outside the app grid on purpose: it covers the whole page, and a
     fixed child takes itself out of the flex column above without disturbing it. -->
<div class="wv-tour" hidden>
  <div class="wv-tour-scrim"></div>
  <div class="wv-tour-spot" hidden></div>
  <section class="wv-tour-card" role="dialog" aria-modal="true" aria-labelledby="wv-tour-title">
    <p class="wv-tour-kicker">The World</p>
    <h2 class="wv-tour-title" id="wv-tour-title"></h2>
    <div class="wv-tour-body"></div>
    <div class="wv-tour-foot">
      <div class="wv-tour-dots"></div>
      <div class="wv-tour-acts">
        <button type="button" class="wv-tour-skip">skip</button>
        <button type="button" class="wv-tour-back">back</button>
        <button type="button" class="wv-tour-next">next</button>
      </div>
    </div>
  </section>
</div>
`;

export function mountViewer(appEl) {
  if (!appEl) throw new Error("mountViewer needs a host element");
  const shadowHost = appEl;
  shadowHost.classList.add("wv");
  const styleTag = document.createElement("style");
  styleTag.textContent = STYLE;
  shadowHost.appendChild(styleTag);
  const wrap = document.createElement("div");
  wrap.innerHTML = MARKUP;
  shadowHost.appendChild(wrap);

  const root = shadowHost;
  const state = {
    cam: { x: 0, y: 0 },
    step: STEP_NOTCHES[STEP_DEFAULT_I], // 100 m
    crossing: liveCrossing(),           // default to the live crossing
    crossingOverride: false,            // a dev/principal time-travel override
    view: "telling",
    paintingOnly: readPaintingOnly(typeof localStorage === "undefined" ? null : localStorage),
    markFilter: "everything",           // "everything" | "mine" | "new" — the one marks vocabulary
    draftIds: new Set(),                // household marks the town has not published — grey
    portfolio: null,                    // authenticated world_my_marks response
    mineIds: new Set(),                 // portfolio ids across drafts/published/backed
    handle: "",
    actAs: SPECTATOR_ACTOR,
    actorBalance: null,                 // liquid stamps from keyless /stamps/{handle}; null while loading
    actorHome: null,                    // office-derived home only when no walk record exists
    dials: { ...DIALS },
    dataSource: null,       // which world-state URL won (for the auto-update poll)
    asOf: null,             // X-Postmark-As-Of of the loaded fold (office-live only)
    whoami: null,           // { principal, household, handles } from office /ops/whoami
    // ── the crossings (DEMO SLICE, step 5 — jetto/enter-exit-demo) ──────────
    // Walk and entry are decoupled axes (R15): `cam` is where a body IS, this
    // is where it STANDS IN THE TREE, and the two are allowed to disagree.
    within: {},             // handle → the chain of marks they have crossed into, root first
    occupants: {},          // mark id → who is inside it (the manifest)
    crossing_prompt: null,  // the QoL offer after a boundary crossing: enter? / step out?
    crossing_notice: null,  // the last crossing's own words — terms shown, or a refusal
  };
  let data = null;          // { trueWorld, myWorld, worldState, skeleton, manifest }
  let world = null;         // assembled once (crossing-independent)
  let byId = new Map();     // id → folded mark, for cell lookups
  let homeSet = new Set();  // ids that render green: homes (+ descendants) and sovereigns
  let mapCtx = null;
  let lastRadial = null;
  const markInteraction = createMarkInteractionStore();

  // ───────── data + world (feature-detected source) ─────────
  async function fetchJson(paths) {
    let lastErr;
    for (const p of paths) {
      try { const r = await fetch(p); if (r.ok) return await r.json(); lastErr = new Error(`${p} → HTTP ${r.status}`); }
      catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error("no source");
  }
  // fetch world-state AND report which url won + its X-Postmark-As-Of (the office
  // stamps every response; the auto-update poll compares it). Same office-first
  // preference: office live → same-origin /WORLD → RAW github.
  const worldStatePaths = () => [officeUrl("/world/state"), "/WORLD/world-state.json", `${RAW}/WORLD/world-state.json`];
  async function fetchWorldState(paths, options = {}) {
    let lastErr;
    for (const p of paths) {
      try { const r = await fetch(p, options); if (r.ok) return { json: await r.json(), url: p, asOf: r.headers.get("x-postmark-as-of") }; lastErr = new Error(`${p} → ${r.status}`); }
      catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error("no source");
  }
  // ONE world. When a signed-in household has a composed fold it IS the world,
  // and its unpublished marks are told apart by colour rather than by a swap.
  function applyWorldLayer() {
    data.worldState = data?.myWorld || data.trueWorld;
    world = assembleWorld({ worldState: data.worldState, skeleton: data.skeleton });
    byId = new Map(world.marks.map((m) => [m.id, m]));
    homeSet = buildHomeSet(data.manifest, world.marks);
    pinnedBuiltId = null; // the record moved: an open bubble is now stale prose
  }
  const isOfficeLive = (url) => url === officeUrl("/world/state");
  async function loadData() {
    if (data) return;
    // The True World is intentionally credentialless. Even a signed-in browser
    // receives the main fold here; the household-composed fold has its own read.
    const ws = await fetchWorldState(worldStatePaths(), { credentials: "omit" });
    const [sk, mf] = await Promise.all([
      fetchJson([officeUrl("/world/skeleton"), "/WORLD/skeleton.json", `${RAW}/WORLD/skeleton.json`]),
      // homes come from the seeding manifest, fetched the same way (same-origin probe
      // → raw fallback); optional — no manifest just means no green
      fetchJson(["/seeding/manifest.json", `${RAW}/seeding/manifest.json`]).catch(() => null),
    ]);
    state.dataSource = ws.url; state.asOf = ws.asOf;
    data = { trueWorld: ws.json, myWorld: null, worldState: ws.json, skeleton: sk, manifest: mf };
    applyWorldLayer();
  }
  // re-pull the fold from the same source and re-assemble (auto-update). Skeleton
  // and manifest are stable across a write, so only world-state is refetched.
  async function reloadWorld() {
    const ws = await fetchWorldState([state.dataSource, ...worldStatePaths()], { credentials: "omit" });
    state.dataSource = ws.url; state.asOf = ws.asOf;
    data.trueWorld = ws.json;
    applyWorldLayer();
    renderActivity(); // a re-fold can carry new marks
  }
  // Home-ness is derived, never on the record: the manifest maps household→home_id,
  // so the home mark is `<household>/<home_id>`; it and its same-household descendants
  // (marks its footprint contains) render green. Fold-computed sovereigns too.
  function buildHomeSet(manifest, marks) {
    const set = new Set();
    for (const m of marks) if (m.sovereign) set.add(m.id);
    const idx = new Map(marks.map((m) => [m.id, m]));
    for (const h of manifest?.homes ?? []) {
      const home = idx.get(`${h.household}/${h.home_id}`);
      if (!home?.at) continue;
      set.add(home.id);
      for (const m of marks) {
        if (m.id === home.id || m.by !== h.household || !m.at) continue;
        if ((m.kind === "sited" || m.kind === "parcel") && marksContain(home, m)) set.add(m.id);
      }
    }
    return set;
  }
  // the tier accent for any mark or within-node: green (home/sovereign) → blue
  // (constitution) → market (amber default). FOV marks lack a tier field, so look
  // the full mark up by id.
  function tierOf(m) {
    if (homeSet.has(m.id)) return "home";
    const full = byId.get(m.id) ?? m;
    // ONE standing rule (tools/mark-standing.mjs): in a parcel's directory → home,
    // via the fold's parent chain — reaches predicated laws with no coordinates,
    // which homeSet and `sovereign` (both geometric) structurally miss.
    return markStanding(full, byId);
  }
  // Grey is a fact about the RECORD, not about the reader's lens: this mark sits
  // in your household's draft branch and not in the town's published main.
  const isDraft = (m) => !!m?.id && state.draftIds.has(m.id);
  // the ONE class string every coloured surface speaks — cells, relation lines,
  // attribute rows, pips, footprints, hover boxes, edge arrows, bubbles
  const markClasses = (m) => markStateClasses({ tier: tierOf(m), draft: isDraft(m) });
  // ───────── the telling view ─────────
  function chips(m) {
    const c = [];
    if (m.signal) c.push(`<span class="wv-chip signal">its light carries</span>`);
    if (m.dim != null && m.dim < 1) c.push(`<span class="wv-chip dim">dim</span>`);
    if (m.aboveFogTarget) c.push(`<span class="wv-chip">above the fog</span>`);
    return c.join("");
  }
  function markName(m) {
    const full = byId.get(m?.id) ?? m;
    return resolveMarkName(full, data?.worldState?.determined ?? {});
  }
  function radialWhere(m) {
    const full = byId.get(m?.id) ?? m;
    if (!isEmbodiedMark(full) || isAmbientMark(full, byId)) return { bearing: null, detail: "" };
    const dx = Number(full.at.x) - Number(state.cam.x), dy = Number(full.at.y) - Number(state.cam.y);
    const distance = Number.isFinite(m?.distM) ? Number(m.distM) : Math.round(Math.hypot(dx, dy));
    const inside = pointInsideMark(state.cam, full);
    const bearing = inside ? null : (m?.bearing ?? quantizeBearing(bearingDeg(dx, dy), state.dials.bearing_points));
    const dist = m?.far
      ? `~${Math.round(distance / 1000).toLocaleString()} km`
      : `${Math.round(distance).toLocaleString()} m`;
    const direction = bearing ? BEARING_LONG[bearing] ?? bearing : "inside";
    return { bearing, detail: `${dist} · ${direction}` };
  }
  // the FOOTPRINT indicator (Keemin 2026-07-23): coordinate dots say nothing about
  // how big a mark is — the-main-channel is 10^3× a bench. A log-scaled glyph rect
  // + a "w×h m" read gives each cell its size at a glance. Extent is the mark's
  // claim; a points: ring's bbox equals it (the honesty gate), so extent suffices.
  // Law/predicated cells carry no extent → no glyph.
  function extentTag(m) {
    const full = byId.get(m.id) ?? m;
    const e = full.extent;
    if (isAmbientMark(full, byId) || !e || !(e.w || e.h)) return "";
    const w = e.w ?? 0, h = e.h ?? 0, maxD = Math.max(w, h, 1);
    const box = 6 + Math.min(26, Math.log10(maxD + 1) * 8.5); // ~6px @1m … ~32px @~5km
    const gw = Math.max(2, box * (w / maxD)), gh = Math.max(2, box * (h / maxD));
    const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : Math.round(n));
    const ring = polygonOf(full);
    let glyph;
    if (ring) {
      const xs = ring.map((point) => point.x), ys = ring.map((point) => point.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = (box - 2) / Math.max(maxX - minX, maxY - minY, 1);
      const ox = (box - (maxX - minX) * scale) / 2, oy = (box - (maxY - minY) * scale) / 2;
      const points = ring.map((point) =>
        `${(ox + (point.x - minX) * scale).toFixed(1)},${(oy + (point.y - minY) * scale).toFixed(1)}`).join(" ");
      glyph = `<polygon points="${points}"/>`;
    } else {
      glyph = `<rect x="${((box - gw) / 2).toFixed(1)}" y="${((box - gh) / 2).toFixed(1)}" width="${gw.toFixed(1)}" height="${gh.toFixed(1)}" rx="1"/>`;
    }
    return `<span class="wv-extent" title="footprint ${w}×${h} m">`
      + `<svg width="${box.toFixed(0)}" height="${box.toFixed(0)}" viewBox="0 0 ${box.toFixed(1)} ${box.toFixed(1)}" aria-hidden="true">`
      + `${glyph}</svg>`
      + `<span class="wv-extent-t">${fmt(w)}×${fmt(h)} m</span></span>`;
  }
  function identityResolved() {
    return !!pmKey() && (state.whoami?.handles ?? []).length > 0
      && !!state.portfolio && !!data?.myWorld && !!state.handle;
  }
  function isSpectating() {
    return state.actAs === SPECTATOR_ACTOR;
  }
  function canAct() {
    return viewerCanAct({ identityResolved: identityResolved(), actAs: state.actAs });
  }
  // an FOV entry carries no tier or extent, so the rule is asked of the FOLDED mark
  const walkableMark = (m) => isWalkableTarget(byId.get(m?.id) ?? m);
  function backedPosition(markId, handle = state.handle) {
    return (state.portfolio?.backed ?? []).find((row) =>
      (row.id ?? row.mark) === markId && row.holder === handle && Number(row.stamps ?? 0) > 0);
  }
  function markIdentity(m) {
    const full = byId.get(m?.id) ?? m;
    return markName(full).name || String(full?.id ?? "");
  }
  function markActions(m) {
    const full = byId.get(m.id) ?? m;
    const backing = effectiveWeight(full);
    const backingDisplay = backingButton(m.id, backing);
    if (!canAct()) return `<span class="wv-cell-actions">${backingDisplay}</span>`;
    const position = backedPosition(m.id);
    return `<span class="wv-cell-actions">`
      + backingDisplay
      + (position ? `<button type="button" class="wv-cell-act stamp unstake" data-unstake-open data-mark="${esc(m.id)}" data-max="${Number(position.stamps)}">take back ${Number(position.stamps)}</button>` : "")
      // no "walk here" chip: selecting the mark IS the intent, and the preview
      // follows from the selection (Keemin 2026-08-04). Confirming is still its
      // own deliberate step, on the walk desk.
      + `</span>`;
  }
  // THE unified mark-cell — everything on the telling is one of these, and every
  // one names its mark id (Keemin 2026-07-23). role styles it (frame/ladder/law/fov);
  // tier colors it; annotation carries a mechanic's live state (fog/light this crossing).
  function markCell(m, { role = "fov", annotation = "", radialChips = false } = {}) {
    const full = byId.get(m.id) ?? m;
    const tier = tierOf(m), far = !!m.far, draft = isDraft(full);
    const identity = markName(full);
    const where = radialWhere(m);
    const details = [
      extentTag(full),
      where.detail ? `<span class="wv-detail-where">${esc(where.detail)}</span>` : "",
    ].filter(Boolean).join("");
    const cluster = (role === "fov" && m.clusteredCount > 1)
      ? `<div class="wv-cluster">+${m.clusteredCount - 1} more of ${esc(m.household ?? "this household")}'s — investigate</div>` : "";
    return `<article class="wv-card ${role}${far ? " far" : ""} ${markClasses(m)}" data-id="${esc(m.id)}" role="button" tabindex="0">
      ${markCellTitle({ name: identity.name, determined: identity.determined, bearing: where.bearing, tier, draft })}
      <div class="cbody">${esc(far ? (m.label ?? m.id) : (m.body ?? m.id))}</div>
      ${!far && markImageURL(full) ? `<figure class="wv-mark-image" data-image-for="${esc(m.id)}"></figure>` : ""}
      ${markCellBylineRow(full, markActions(m))}
      ${annotation ? `<div class="wv-cell-state">${esc(annotation)}</div>` : ""}
      <div class="cmeta">${radialChips ? chips(m) : ""}<div class="wv-details">${details}</div></div>
      ${cluster}
    </article>`;
  }
  // The store is the only place a picture's URL is read from — the cell it came
  // out of named its mark and nothing else. Run after every innerHTML that
  // builds cells, and after the predicate fold, which rearranges them.
  const mountMarkImages = (box) => hydrateMarkImages(box, (id) => byId.get(id));
  // the mechanic's live state, reconstructed from the structured observer fields
  // (the engine's own airline/lightline logic — read, never re-run here).
  function lightStateLine(obs) {
    if (obs.inDarkness) return "The dark end of the world — the day is a rumor off to the northeast.";
    if (obs.lightLevel > 0.7) return "The northeast dawn-light is full on you here.";
    return "The light is going — the world's glow lives off to the northeast, dying toward the southwest.";
  }
  function elevStateLine(obs) {
    const g = obs.groundElevM;
    if (typeof g !== "number") return "";
    const rel = g >= 22 ? " — above the fog line" : g <= 1 ? " — down at the water" : "";
    return `The ground holds you at ${g >= 0 ? "+" : ""}${g} m above the sea${rel}; your eyes ride at ${obs.eyeElevM} m.`;
  }
  function fogStateLine(radial, obs) {
    if (obs.aboveFog) return "You are above the fog; the sightlines run long.";
    if (obs.inFog) return `Fog is in tonight (thickness ${radial.fog.thickness}) — it closes the view to about ${(radial.sightReachM ?? 0).toLocaleString()} m.`;
    return `The air is clear — you can see about ${(radial.sightReachM ?? 0).toLocaleString()} m.`;
  }
  // keep: optional predicate — under just mine, only cards whose mark passes
  // show (the telling stays otherwise identical: same order, same budget already
  // applied by the engine, same card behaviour — the filter only narrows WHO shows).
  function tellingCards(radial, keep = null) {
    const by = radial?.byBearing ?? {};
    // Distance orders the panel; bearing is a field on the cell (Keemin,
    // 2026-07-27) — the same restructure the prose telling carries, so the two
    // habitats never disagree about the world's shape. Regrouped from the band
    // each entry already names; byBearing is the wire shape and stays untouched.
    // (The map pane keeps the rose: there a bearing is geometry, not a heading.)
    const byBand = {};
    for (const group of Object.values(by))
      for (const [band, ms] of Object.entries(group ?? {})) (byBand[band] ??= []).push(...ms);
    // The spine is not listed twice (Keemin, 2026-07-27): the ladder above already
    // gives every mark you stand WITHIN its own card, so a band repeat tells it twice.
    // Under Mine a not-yours spine mark is absent from the ladder, but `keep` filters
    // it from the bands as well, so no mark can fall out of both and vanish.
    const spineIds = new Set((radial?.within ?? []).map((w) => w.id));
    // outward, in the engine's own band order
    const bandOrder = DIALS.distance_bands.map((d) => d.name);
    const keys = Object.keys(byBand).sort((a, b) => bandOrder.indexOf(a) - bandOrder.indexOf(b));
    let html = "";
    for (const band of keys) {
      let entries = byBand[band].filter((m) => !spineIds.has(m.id))
        .sort((m, n) => (m.distM ?? 0) - (n.distM ?? 0));
      if (keep) entries = entries.filter(keep);
      if (!entries.length) continue;
      html += `<div class="wv-band"><h3>${esc(distanceBandLabel(band, state.dials.distance_bands))}</h3>`;
      for (const m of entries) html += markCell(m, { role: "fov", radialChips: true });
      html += `</div>`;
    }
    if (html) return html;
    return keep
      ? `<div class="wv-quiet">none of yours tells from here.</div>`
      : `<div class="wv-quiet">nothing tells from here — walk, or wait for clearer air.</div>`;
  }
  // ───────── the New feed ─────────
  // "a 'New' chip … so everyone can see the new marks being made regardless of their
  // distance or visibility" (Keemin, 2026-07-27). So this reads the WHOLE record,
  // date-descending, and deliberately bypasses the FOV — no fog, no sight radius, no
  // budget, no occlusion. The culling is precisely what this chip opts out of, which
  // is why it reads world.marks rather than a radial. Public by construction: it asks
  // nothing about who is looking.
  const NEW_CAP = 25;
  // the feed's ORDER, without its markup — the painting needs the same list the
  // panel lists, and deriving it twice is how the two would come to disagree
  function newFeedMarks(keep = null) {
    const dated = (world?.marks ?? []).filter((m) => m.id && m.date && (!keep || keep(m)));
    // newest first; id breaks ties so the order is stable across re-tells (dates are
    // day-precision for most records, so ties are the common case, not the edge)
    return dated.slice().sort((a, b) =>
      String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
  }
  function newFeed(keep = null) {
    const all = newFeedMarks(keep);
    const shown = all.slice(0, NEW_CAP), rest = all.slice(NEW_CAP);
    if (!shown.length) return { html: `<div class="wv-quiet">no marks in the record yet.</div>`, count: "" };

    let html = "";
    for (const m of shown) {
      // distance and bearing FROM WHERE YOU STAND — the chip answers "what is new AND
      // where is it from here". Marks with no geometry (predicated/naming) name their
      // parent instead, since "300 m away" is meaningless for a property of a thing.
      const sited = m.at && typeof m.at.x === "number";
      const view = sited
        ? { ...m, distM: Math.round(Math.hypot(m.at.x - state.cam.x, m.at.y - state.cam.y)),
            bearing: quantizeBearing(bearingDeg(m.at.x - state.cam.x, m.at.y - state.cam.y), state.dials.bearing_points) }
        : m;
      // The feed is still NOT deduped against the containment chain — a chronological
      // index that hid its newest entry would make its own "newest 25 of 244" untrue,
      // and that reasoning is unchanged. What went with the ladder is the "· where you
      // stand" note that used to hang off such a cell: it existed to explain a visible
      // duplicate, and with no ladder rendered there is no duplicate to explain. An
      // annotation pointing at a section the reader cannot see is worse than silence.
      html += markCell(view, {
        role: "fov",
        radialChips: true,
        annotation: sited ? "" : `a property of ${m.parent ?? "the record"}`,
      });
    }
    const oldest = String(all[all.length - 1].date).slice(0, 10);
    const count = rest.length
      ? `newest ${shown.length} of ${all.length} marks · ${rest.length} older, back to ${oldest}`
      : `all ${all.length} marks in the record, newest first (back to ${oldest})`;
    return { html, count };
  }
  function tallies(radial) {
    const c = radial?.counts ?? {}, agg = radial?.aggregate ?? {}, parts = [];
    if (c.candidates != null) parts.push(`${c.shown ?? "?"} told of ${c.visible ?? "?"} in view (${c.candidates} in range)`);
    if (c.occluded) parts.push(`${c.occluded} behind the ground`);
    if (c.fogHidden) parts.push(`${c.fogHidden} lost to fog`);
    if (agg.hidden_by_budget) parts.push(`${agg.hidden_by_budget} more the eye doesn't sort out`);
    return parts.join(" · ");
  }
  // "just mine" means the household portfolio's owned OR backed marks. That set is
  // server-derived at household grain: it includes private draft deltas, authored
  // main marks, and every open escrow position. It deliberately does not infer
  // ownership from a browser-visible author string.
  function isMine(m) {
    return !!m?.id && state.mineIds.has(m.id);
  }
  function renderTelling() {
    const box = $(root, ".wv-telling");
    const hasIdentity = identityResolved();
    const mine = hasIdentity && state.markFilter === "mine";
    // THE CUT (step 5): a resident who has crossed a threshold is not reading
    // the world from a point any more — she is inside somewhere, and the read
    // is that place. `New` is the one exception, for the same reason it skips
    // the ladder: the feed is a chronology, and a standpoint over a chronology
    // answers a question nobody asked.
    const inside = state.markFilter === "new" ? null : enteredMark();
    if (inside && world && byId.has(inside)) {
      try { if (renderEnteredTelling(box, inside)) return; }
      catch (err) { box.innerHTML = `<div class="wv-err">the scoped read failed: ${esc(err?.message ?? err)}</div>`; return; }
    }
    try {
      const name = state.cam.x === 0 && state.cam.y === 0 ? "a spectator on the Town Centre quay" : "a spectator";
      const e = openYourEyes({ x: state.cam.x, y: state.cam.y, name }, world, { crossing: state.crossing, dials: state.dials, budget: state.dials.context_budget });
      lastRadial = e.radial;
      const within = e.radial.within ?? [];
      const obs = e.radial.observer ?? {};
      const isNew = state.markFilter === "new";
      // One row, one question: everything, just mine, or recency. The World lens
      // that used to sit above it is gone — composition is not a question the
      // reader has to answer any more, because a draft says so in its own colour.
      const chips = viewerFilterControls({ identityResolved: hasIdentity, markFilter: state.markFilter });
      // 1. the containment ladder — where you STAND, the standpoint frame. Kept as
      // context even under Mine (filtering the frame to yours would usually empty
      // "where you stand"); the filter narrows the visible marks, not your footing.
      //
      // NEW IS THE EXCEPTION, and by ruling rather than by rule (Keemin, 2026-07-28):
      // under New the feed stands alone. My own composition call was that the ladder
      // is always footing — it is overruled here for New only, so this reads as a
      // decision, not as a bug someone should tidy back. The ladder is not merely
      // hidden, it is not BUILT: New's list is the record in time order, and a
      // standpoint frame above a chronology is answering a question nobody asked.
      const showLadder = !isNew;
      let ladder = "";
      // Under Mine the frame ladder shows only YOUR cells of the chain (your
      // parcel/home when standing in them) — the world-root/terrain/region are
      // constitution and stay out of Mine everywhere (Keemin, 2026-07-27; the
      // first fix missed this path: these cells rendered unconditionally).
      const chain = mine ? within.filter((w) => isMine(byId.get(w.id) ?? w)) : within;
      if (showLadder) chain.forEach((w, i) => {
        const m = byId.get(w.id) ?? w;
        ladder += markCell(m, { role: i === 0 ? "frame" : "ladder", annotation: i === 0 ? lightStateLine(obs) : "" });
      });
      // 2. the world-law cells whose mechanic has live state this crossing. The
      // MARK governs its own telling: any world-law mark carrying a mechanic with
      // a registered teller speaks its live reading as a cell — fog is no longer
      // a special case, and giving a mechanic a voice is one line here (Keemin's
      // modularity, 2026-07-24 eve: the seam residents' own mechanics will use).
      const TELLERS = {
        elevation: () => elevStateLine(obs),
        fog: () => fogStateLine(e.radial, obs),
      };
      // World-law cells are the-town's (constitution) — skipped under Mine, and part
      // of the ladder, so they go with it under New.
      if (showLadder && !mine)
        for (const lm of world.marks.filter((m) => m.by === "the-town" && m.mechanic && TELLERS[m.mechanic]))
          ladder += markCell(lm, { role: "law", annotation: TELLERS[lm.mechanic]() });
      // 3. then the listing. The CHIP governs it: All and Mine tell the standpoint —
      // ladder, then the bands, then the FOV tallies. New tells the record instead —
      // the feed alone, with the feed's own count in place of the tallies, so a count
      // line never describes a list it isn't attached to (sight-counts under a listing
      // that ignores sight would be the regression).
      const feed = isNew ? newFeed(mine ? isMine : null) : null;
      box.innerHTML = chips
        + (ladder ? `<div class="wv-section-lbl">where you stand</div>`
                  + `<div class="wv-ladder-cells">${ladder}</div>` : "")
        + (isNew
          ? `<div class="wv-section-lbl">new marks — the whole record, newest first</div>`
            + `<div class="wv-cards">${feed.html}</div>`
            + `<div class="wv-tallies">${esc(feed.count)}</div>`
          : `<div class="wv-cards">${tellingCards(e.radial, mine ? isMine : null)}</div>`
            + `<div class="wv-tallies">${esc(tallies(e.radial))}</div>`);
      if (mine) renderMineTail(box, e.radial);  // the same just-mine list continues beyond this sight
      foldRenderedPredicates(box);
      mountMarkImages(box);
      // the panel may be folded away, but its two controls and its count line are
      // readings, not decoration — they get a home on the painting either way
      const talliesChip = $(root, ".wv-paint-tallies");
      if (talliesChip) talliesChip.textContent = tallies(e.radial);
      syncDevReadouts();
      drawOverlay(e.radial);
      syncMarkInteractionViews();
    } catch (err) {
      box.innerHTML = `<div class="wv-err">the telling failed: ${esc(err?.message ?? err)}</div>`;
    }
  }
  // The just-mine tail: the same filtered list continues beyond this sight with
  // the same mark cells. Backing is not a second shelf; it stays on the cell.
  function elsewhereRow(m) {
    return markCell(m, { role: "fov" });
  }
  function renderMineTail(box, radial) {
    // which of your marks are already in sight (so "elsewhere" = the rest)
    const shown = new Set();
    (radial.within ?? []).forEach((w) => shown.add(w.id));
    const by = radial.byBearing ?? {};
    for (const b of Object.keys(by)) for (const m of Object.values(by[b]).flat()) shown.add(m.id);
    const yours = (world.marks ?? []).filter(isMine);
    const elsewhere = yours.filter((m) => m.id && !shown.has(m.id));
    const anyInView = yours.some((m) => shown.has(m.id));

    let tail = "";
    if (!anyInView && !elsewhere.length)
      tail += `<div class="wv-quiet wv-mine-empty">nothing of yours tells from here yet — leave_mark is coming.</div>`;
    if (elsewhere.length) {
      tail += `<div class="wv-section-lbl">elsewhere — ${elsewhere.length} of yours beyond this sight</div>`;
      tail += `<div class="wv-elsewhere">${elsewhere.map(elsewhereRow).join("")}</div>`;
    }
    const tailEl = document.createElement("div");
    tailEl.className = "wv-mine-tail";
    tailEl.innerHTML = tail;
    box.appendChild(tailEl);
  }

  function predicateAttributeLine(mark, { annotation = "" } = {}) {
    const full = byId.get(mark.id) ?? mark;
    const tier = tierOf(full);
    const slot = full.kind === "naming" ? "name" : (full.slot || "property");
    const value = full.value ?? "";
    return `<div class="wv-attribute ${markClasses(full)}" data-id="${esc(full.id)}" role="button" tabindex="0">`
      + `<span class="wv-attribute-value"><b>${esc(slot)}:</b> ${esc(value)}`
      + `${annotation ? ` <span class="wv-attribute-state">· ${esc(annotation)}</span>` : ""}</span>`
      + `${markActions(full)}</div>`;
  }

  // Fold only predicates that already have their subject cell in this rendered
  // view. The DOM pass sees the ladder, bands/New feed, and Mine tail together,
  // so the decision cannot disagree across sections.
  function foldRenderedPredicates(box) {
    const cards = [...box.querySelectorAll(".wv-card[data-id]")];
    const renderedMarks = cards.map((card) => byId.get(card.dataset.id) ?? { id: card.dataset.id });
    const cardById = new Map();
    for (const card of cards) if (!cardById.has(card.dataset.id)) cardById.set(card.dataset.id, card);

    const folded = new Map();
    for (const card of cards) {
      const mark = byId.get(card.dataset.id);
      if (!predicateFoldDecision(mark, renderedMarks)) continue;
      const annotation = card.querySelector(":scope > .wv-cell-state")?.textContent ?? "";
      (folded.get(mark.parent) ?? folded.set(mark.parent, []).get(mark.parent)).push({ mark, annotation });
      card.remove();
    }
    for (const [parentId, attributes] of folded) {
      const parent = cardById.get(parentId);
      if (!parent?.isConnected) continue;
      const group = document.createElement("div");
      group.className = "wv-attributes";
      group.innerHTML = attributes.map(({ mark, annotation }) =>
        predicateAttributeLine(mark, { annotation })).join("");
      const meta = parent.querySelector(":scope > .cmeta");
      if (meta) parent.insertBefore(group, meta);
      else parent.appendChild(group);
    }
    for (const band of box.querySelectorAll(".wv-band"))
      if (!band.querySelector(".wv-card")) band.remove();
  }

  // ───────── investigate (in-place expansion inside a card) ─────────
  const relativeNode = (relative) => {
    const full = byId.get(relative.id) ?? relative;
    const identity = markName(full);
    return investigateNameLine(full, {
      name: identity.name,
      determined: identity.determined,
      tier: tierOf(full),
      draft: isDraft(full),
    });
  };
  function renderExpansion(card) {
    const stack = card._stack ?? [];
    let box = card.querySelector(".wv-expand");
    if (!stack.length) { box?.remove(); return; }
    // ONE OPEN CELL PER SURFACE (Keemin, 2026-08-04). Expansions used to stack up
    // as you read down the column, so the Telling grew a tail of trees nobody had
    // closed. Scoped to the surface the card lives on, so opening something in the
    // Telling does not shut the bubble you opened it from.
    for (const other of (card.closest(".wv-telling, .wv-bubble") ?? root).querySelectorAll(".wv-card")) {
      if (other === card || !other._stack?.length) continue;
      other._stack = [];
      other.querySelector(".wv-expand")?.remove();
    }
    const id = stack[stack.length - 1];
    // one branch, both surfaces: renderExpansion is what the Telling's cells and
    // the painting's bubble each fold open, so the frame reads the same in both
    const d = id === WORLD_ROOT_ID ? worldFrameReading(byId.get(id), world?.marks ?? []) : investigate(id, world);
    if (d.error) {
      if (!box) { box = document.createElement("div"); box.className = "wv-expand"; card.appendChild(box); }
      box.innerHTML = `<div class="wv-err">${esc(d.error)}</div>`;
      return;
    }
    const drilled = stack.length > 1;
    const alreadyFolded = new Set([...card.querySelectorAll(":scope > .wv-attributes .wv-attribute[data-id]")]
      .map((attribute) => attribute.dataset.id));
    const newlyRevealedPredicates = (d.predicates ?? []).filter((predicate) => !alreadyFolded.has(predicate.id));
    const target = byId.get(d.id) ?? d;
    const targetIdentity = markName(target);
    const html = `
      ${drilled ? `<div class="wv-crumbs"><span class="wv-back" role="button" tabindex="0">◂ back</span><b class="wv-crumb-name${targetIdentity.determined ? " is-determined" : ""}">${esc(targetIdentity.name)}</b>${tierChip(tierOf(target))}</div>
      <div class="cbody" style="margin-bottom:6px">${esc(d.body ?? "")}</div>
      ${markCellBylineRow(target, backingButton(d.id, d.weight ?? d.stamps))}` : ""}
      ${d.sovereign ? `<div class="cmeta" style="margin-bottom:4px"><span class="wv-chip">sovereign</span></div>` : ""}
      ${newlyRevealedPredicates.length ? `<div class="wv-expansion-attributes">${newlyRevealedPredicates.map(predicateAttributeLine).join("")}</div>` : ""}
      ${d.parents?.length ? `<div class="wv-tree-label">sits inside</div><div class="wv-relation-lines">${d.parents.map(relativeNode).join("")}</div>` : ""}
      ${d.children?.length ? `<div class="wv-tree-label">within it</div><div class="wv-relation-lines">${d.children.map(relativeNode).join("")}</div>` : ""}
      ${d.alongside?.length ? `<div class="wv-tree-label">alongside</div><div class="wv-relation-lines">${d.alongside.map(relativeNode).join("")}</div>` : ""}
      ${(d.more?.children > 0 || d.more?.predicates > 0) ? `<div class="wv-quiet" style="margin:8px 0 0 10px; font-size:.8rem">…and more the eye holds back — investigate deeper.</div>` : ""}`;
    // AN EXPANSION WITH NOTHING IN IT IS NOT AN EXPANSION. The box carries its own
    // rule and padding, so a reading with no relations and no unrevealed attributes
    // — which is now every reading of the frame — left a dashed line under the cell
    // and a hand's width of empty dark below it.
    if (!html.trim()) { box?.remove(); syncMarkInteractionViews(); return; }
    if (!box) { box = document.createElement("div"); box.className = "wv-expand"; card.appendChild(box); }
    box.innerHTML = html;
    syncMarkInteractionViews();
  }
  // ───────── the painting (atlas minimap) ─────────
  async function loadMinimap() {
    const boxEl = $(root, ".wv-minimap");
    // The chrome that rides ON the painting is held across the wipe below rather
    // than re-created: the bubble layer owns live nodes (a pinned card mid-read,
    // the walk desk itself) that must not be rebuilt when the atlas loads.
    const overlays = [".wv-worldmark", ".wv-mapctl", ".wv-spectator-coordinate", ".wv-paint-tallies", ".wv-bubbles", ".wv-walkdesk"]
      .map((selector) => $(boxEl, selector)).filter(Boolean);
    const reattachOverlays = () => overlays.forEach((el) => boxEl.appendChild(el));
    try {
      const html = await fetch("/atlas/town.html").then((r) => { if (!r.ok) throw new Error(`atlas HTTP ${r.status}`); return r.text(); });
      const doc = new DOMParser().parseFromString(html, "text/html");
      // The atlas is a synced artifact, so load discipline belongs here at its
      // consumption boundary. Mutate the detached parse before any node mounts.
      disciplineAtlasImages(doc);
      const svg = doc.querySelector("svg");
      if (!svg) throw new Error("no svg in the painting");
      const g = data.skeleton._grid ?? {};
      const om = String(g.origin ?? "").match(/\((\d+)\s*,\s*(\d+)\)/);
      const sm = String(g.scale ?? "").match(/(\d+(?:\.\d+)?)\s*m per atlas px/);
      if (!om || !sm) throw new Error("skeleton _grid changed shape");
      const originPx = { x: +om[1], y: +om[2] }, mPerPx = +sm[1];
      svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.querySelectorAll("script").forEach((s) => s.remove());
      const atlasBase = new URL("/atlas/town.html", location.origin);
      svg.querySelectorAll("image").forEach((im) => {
        const hh = im.getAttribute("href") ?? im.getAttribute("xlink:href");
        if (hh && !/^(https?:)?\//.test(hh)) { im.setAttribute("href", new URL(hh, atlasBase).pathname); im.removeAttribute("xlink:href"); }
      });
      // THE FAR COUNTRY, mounted UNDER the painting rather than over it.
      //
      // Every other derived layer is appended, so it draws on top. These two are
      // inserted before the atlas's first child, and that placement is the whole
      // readability rule: the painting opens with a full-bleed background rect,
      // so the town erases both layers over itself without either of them
      // needing to know where the town is. Out past the edge of the paint —
      // which is the only place they have anything to say — there is nothing
      // above them but the record's own pips and labels.
      //
      // Mist first, then the artwork, so a mountain hangs in the weather rather
      // than behind it.
      const mistLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      mistLayer.setAttribute("id", "wv-mist-layer");
      mistLayer.style.pointerEvents = "none";
      const farArtLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      farArtLayer.setAttribute("id", "wv-far-art-layer");
      farArtLayer.style.pointerEvents = "none";
      svg.insertBefore(farArtLayer, svg.firstChild);
      svg.insertBefore(mistLayer, svg.firstChild);
      // the survey grid — the FIRST derived layer: drawn from the registration
      // (origin + scale), never traced from the paint. Sits under the overlay.
      const gridLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gridLayer.setAttribute("id", "wv-grid-layer");
      gridLayer.style.display = "none"; // NOT the hidden attribute — SVG <g> ignores it
      svg.appendChild(gridLayer);
      // footprints — the second derived layer: every mark's true extent, from the
      // record. Sits above the grid, under the pips; pointer-events none so the
      // stand-click and drag pass straight through it.
      const fpLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      fpLayer.setAttribute("id", "wv-fp-layer");
      fpLayer.style.display = "none";
      svg.appendChild(fpLayer);
      // conversations — where the town is TALKING: each thread from the office's
      // earshot derivation, drawn as the ground it actually covered. Above the
      // footprints, under the pips and walkers; pointer-events none, so it is
      // weather over the map, never furniture in it.
      const convoLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      convoLayer.setAttribute("id", "wv-convo-layer");
      convoLayer.style.pointerEvents = "none";
      convoLayer.style.display = "none"; // OFF until asked for (Keemin: the bubbles were blocking the painting)
      svg.appendChild(convoLayer);
      const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.setAttribute("id", "wv-overlay");
      svg.appendChild(overlay);
      // a dedicated highlight layer, above the overlay — a hovered/clicked mark
      // washes blue on the painting (viewer↔atlas linkage). Kept separate so the
      // per-render overlay redraw never wipes it.
      const hlLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      hlLayer.setAttribute("id", "wv-hl-layer");
      svg.appendChild(hlLayer);
      // An armed destination is a proposal, not a journey. Its amber layer stays
      // separate from the pink public walk ledger so the painting cannot imply a
      // commitment the resident has not confirmed.
      const walkPreviewLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      walkPreviewLayer.setAttribute("id", "wv-walk-preview-layer");
      walkPreviewLayer.style.pointerEvents = "none";
      svg.appendChild(walkPreviewLayer);
      // walkers ride above the highlight layer: a walk is the one thing on this
      // map that moves, so it must never be painted under anything.
      const walkLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      walkLayer.setAttribute("id", "wv-walk-layer");
      svg.appendChild(walkLayer);
      // The wash's name-box rides above the walkers while the washes stay under
      // everything. A wash says nothing until pointed at — the always-on labels
      // died at zoom (their halo strokes shattered into starbursts; Keemin's
      // screenshot) — and when it speaks, it speaks in THE box, the same one a
      // mark or a walker raises, via the same hoverLabelSVG.
      const convoHoverLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      convoHoverLayer.setAttribute("id", "wv-convo-hover-layer");
      convoHoverLayer.style.pointerEvents = "none";
      convoHoverLayer.style.display = "none"; // rides the same toggle as its washes
      svg.appendChild(convoHoverLayer);
      function renderConvoHover(hit) {
        if (!hit) { convoHoverLayer.innerHTML = ""; return; }
        const bounds = svg.getBoundingClientRect();
        // the box scales uniformly off its unit, so 1.6× the unit is the whole
        // box at 1.6× — ~19px type instead of the 12px the marks' box uses
        // (Keemin: at the marks' size these words were not legible)
        const unit = (bounds.width > 0 ? view.w / bounds.width : 1) * 1.6;
        const at = { x: originPx.x + hit.cx / mPerPx, y: originPx.y + (hit.cy - hit.ryM) / mPerPx };
        convoHoverLayer.innerHTML = hoverLabelSVG({ text: hit.words, at, unit, view, className: "wv-hl-label wv-hl-convo" });
      }
      boxEl.innerHTML = "";
      boxEl.appendChild(svg);
      reattachOverlays();
      boxEl.classList.add("pannable");

      // ── the viewport (P2 convergence): the viewBox IS the camera — wheel zooms
      // toward the cursor, drag pans, a short press stands you there, follow keeps
      // the view on your standpoint. Google-maps physics, zero libraries.
      let vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
        const bb = svg.getBBox();
        vb = [bb.x, bb.y, bb.width, bb.height];
      }
      const full = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
      const view = { ...full };
      mapCtx = { svg, overlay, hlLayer, walkPreviewLayer, walkLayer, gridLayer, mistLayer, farArtLayer, convoLayer, convoHoverLayer, originPx, mPerPx, full, view, zoomK: 1, follow: false, glyphIds: new Set(), _tweening: false };
      drawFarCountry();
      let tween = null;
      function applyView() {
        svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
        mapCtx.zoomK = full.w / view.w;
        if (lastRadial) drawOverlay(lastRadial);
        renderMarkHighlight();
        positionBubbles(); // the anchors are on the painting, so they move with it
      }
      function stopTween() { if (tween) { cancelAnimationFrame(tween); tween = null; } mapCtx._tweening = false; }
      function tweenTo(target, ms = 280) {
        stopTween(); mapCtx._tweening = true;
        const from = { ...view }, t0 = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        (function step(now) {
          const t = Math.min(1, (now - t0) / ms), k = ease(t);
          view.x = from.x + (target.x - from.x) * k; view.y = from.y + (target.y - from.y) * k;
          view.w = from.w + (target.w - from.w) * k; view.h = from.h + (target.h - from.h) * k;
          applyView();
          if (t < 1) tween = requestAnimationFrame(step); else { tween = null; mapCtx._tweening = false; }
        })(t0);
      }
      const camPx = () => ({ x: originPx.x + state.cam.x / mPerPx, y: originPx.y + state.cam.y / mPerPx });
      mapCtx.lockOn = (animate = true) => {
        const c = camPx();
        const w = Math.min(view.w, full.w / 4), h = w * (full.h / full.w);
        // Centre the dot in the VISIBLE panel, not in the <svg>. The painting
        // keeps the map's own aspect (tall), the pane is shorter, and
        // .wv-minimap clips the overflow — so the svg's midpoint sits well
        // below the middle of what the reader can actually see, by an amount
        // that changes with the window. That was the "follow doesn't really
        // centre" defect: the arithmetic was right about the wrong rectangle.
        // Measured live, so it stays true at any size and needs no constant.
        const sb = svg.getBoundingClientRect(), cb = boxEl.getBoundingClientRect();
        const ax = sb.width > 0 ? (cb.x + cb.width / 2 - sb.x) / sb.width : 0.5;
        const ay = sb.height > 0 ? (cb.y + cb.height / 2 - sb.y) / sb.height : 0.5;
        const target = { x: c.x - w * ax, y: c.y - h * ay, w, h };
        // Compare against the target we actually want, not against the viewBox
        // centre — the old test could return "close enough" while the dot sat
        // off the visible centre by the clip offset.
        if (Math.abs(target.x - view.x) < view.w * 0.005 && Math.abs(target.y - view.y) < view.h * 0.005
            && Math.abs(w - view.w) < full.w * 0.01) return;
        if (animate) tweenTo(target); else { Object.assign(view, target); applyView(); }
      };
      mapCtx.fitAll = () => { mapCtx.follow = false; $(root, ".wv-map-follow")?.classList.remove("on"); tweenTo({ ...full }); };
      // Point the camera somewhere and hand back where it was, so a caller can put
      // it back exactly. The tour is the only user: it frames three marks for one
      // slide and restores the reader's own view on the way out.
      mapCtx.setView = (next, animate = false) => {
        const before = { ...view };
        if (!next) return before;
        if (animate) tweenTo(next); else { stopTween(); Object.assign(view, next); applyView(); }
        return before;
      };
      // Fill the pane with painting instead of letterboxing it. The atlas is tall
      // and the folded-open pane is wide, so the default "meet" fit leaves half
      // the page as empty bars — which is not what "the painting fills the page"
      // means. This takes the view whose aspect matches the PANE: full width, a
      // centred band of height. ⌂ fit still tweens to the whole painting, so the
      // honest see-everything view is one press away and keeps meaning what it says.
      // The pane changed shape under a view that did not. Keep the horizontal
      // framing and the zoom (so no marker resizes), and take the height from the
      // new aspect: the same pane always yields the same view, which is what makes
      // hiding and showing the Telling land you back where you started.
      //
      // It also settles the paint. Toggling used to leave the viewBox describing
      // the OLD pane, and the bottom band of the painting simply did not draw
      // until something called applyView — which is why ⌂ fit or ⌖ follow
      // "fixed" it. This is that call, made on purpose rather than by accident.
      mapCtx.refit = () => {
        const pane = boxEl.getBoundingClientRect();
        if (!pane.width || !pane.height) return;
        const cy = view.y + view.h / 2;
        const h = view.w * (pane.height / pane.width);
        Object.assign(view, { y: cy - h / 2, h });
        applyView();
      };
      // a hand on the camera breaks the follow snap — silently, keeping the view
      // where the hand put it (fit is the only thing that zooms you back out)
      const breakFollow = () => { if (mapCtx.follow) { mapCtx.follow = false; $(root, ".wv-map-follow")?.classList.remove("on"); } };
      svg.addEventListener("wheel", (e) => {
        e.preventDefault(); stopTween(); breakFollow();
        const k = Math.pow(1.0015, e.deltaY);
        const w = Math.min(full.w * MAX_ZOOM_OUT, Math.max(full.w / MAX_ZOOM_IN, view.w * k));
        const scale = w / view.w;
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        view.x = p.x - (p.x - view.x) * scale; view.y = p.y - (p.y - view.y) * scale;
        view.w = w; view.h = view.h * scale;
        applyView();
      }, { passive: false });
      // drag = pan; a press that travels <6px selects by the painting's one hit
      // order: pip snap, then smallest containing non-ambient extent. Genuinely
      // open ground chooses a walking point for a resident, or moves the
      // read-only spectator camera.
      let press = null;
      function screenMarkCandidates() {
        const matrix = svg.getScreenCTM();
        if (!matrix) return [];
        return [...mapCtx.glyphIds].flatMap((id) => {
          const mark = byId.get(id);
          if (!mark?.at || ![mark.at.x, mark.at.y].every(Number.isFinite)) return [];
          const point = svg.createSVGPoint();
          point.x = originPx.x + mark.at.x / mPerPx;
          point.y = originPx.y + mark.at.y / mPerPx;
          const screen = point.matrixTransform(matrix);
          return [{ id, x: screen.x, y: screen.y }];
        });
      }
      const worldPointForEvent = (event) => {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const painting = point.matrixTransform(svg.getScreenCTM().inverse());
        return {
          x: (painting.x - originPx.x) * mPerPx,
          y: (painting.y - originPx.y) * mPerPx,
        };
      };
      // TWO QUESTIONS, TWO ANSWERS (Keemin, 2026-08-04: keep the hover visibility
      // as it was, and treat clicks the new way).
      //
      // Pointing asks WHAT IS HERE, and everything the eye tells answers —
      // including the region you are standing inside, because seeing what
      // contains you is the entire reason to point at it.
      //
      // Clicking asks ACT HERE, and there a mark you could not set out for does
      // not own the ground under it. The containment half used to hand the click
      // to the smallest extent covering it, walkable or not: the threshold
      // district is 2,325 m across, so every click in a whole quarter of the town
      // selected the district — no walking to that ground, and no reaching a mark
      // inside it the eye had not told. Only the marks you could go to are
      // offered to that half now. The PIP half is identical in both, so a region
      // is still selected by the dot that is exactly the size of the thing it
      // names — and it still lights under the pointer on the way there.
      const markAt = (event, marks) => paintingMarkAtPoint({
        screenPoint: { x: event.clientX, y: event.clientY },
        worldPoint: worldPointForEvent(event),
        glyphs: screenMarkCandidates(),
        marks,
      });
      const toldHere = () => toldPaintingMarks(lastRadial, world?.marks ?? []);
      const paintingMarkForEvent = (event) => markAt(event, toldHere());
      // walkers, in the same screen-space shape the mark snap already eats
      function screenWalkerCandidates() {
        const matrix = svg.getScreenCTM();
        if (!matrix) return [];
        return (walkState.walkers ?? []).flatMap((w) => {
          if (!w?.handle || ![w.x, w.y].every(Number.isFinite)) return [];
          const point = svg.createSVGPoint();
          point.x = originPx.x + w.x / mPerPx;
          point.y = originPx.y + w.y / mPerPx;
          const screen = point.matrixTransform(matrix);
          return [{ id: walkerHoverId(w.handle), x: screen.x, y: screen.y }];
        });
      }
      // A standing resident wins the hover over the ground they stand on — the
      // person is what you were pointing at. Same snap helper, same radius.
      const hoverTargetForEvent = (event) =>
        snappedMarkAtPoint({ x: event.clientX, y: event.clientY }, screenWalkerCandidates())
        ?? paintingMarkForEvent(event);
      svg.addEventListener("pointerdown", (e) => {
        stopTween();
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener("pointermove", (e) => {
        if (!press || e.pointerId !== press.id) {
          // The hand and the name-box show exactly where a click would reach
          // the thread, running the click's own precedence: a face wins,
          // everything else on a visible wash navigates (convoAt is null while
          // the layer is hidden). And while the wash owns the click, the MARK
          // hover stands down — a bubble saying CLICK TO OPEN over ground
          // whose click goes to the thread is the box promising what the
          // click won't do.
          const clear = !snappedMarkAtPoint({ x: e.clientX, y: e.clientY }, screenWalkerCandidates());
          const wp = clear ? worldPointForEvent(e) : null;
          const hit = wp ? convoAt(wp.x, wp.y) : null;
          hoverMark(hit ? null : hoverTargetForEvent(e));
          boxEl.classList.toggle("over-convo", Boolean(hit));
          renderConvoHover(hit);
          return;
        }
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (!press.moved && Math.hypot(dx, dy) < 6) {
          hoverMark(hoverTargetForEvent(e));
          return;
        }
        if (!press.moved) breakFollow(); // a real drag unlocks the snap; a stand-click doesn't
        hoverMark(null);
        renderConvoHover(null);
        boxEl.classList.remove("over-convo");
        press.moved = true; boxEl.classList.add("panning");
        const r = svg.getBoundingClientRect();
        view.x -= dx * (view.w / r.width); view.y -= dy * (view.h / r.height);
        press.x = e.clientX; press.y = e.clientY;
        applyView();
      });
      svg.addEventListener("pointerup", (e) => {
        if (!press || e.pointerId !== press.id) return;
        const wasDrag = press.moved; press = null; boxEl.classList.remove("panning");
        if (wasDrag) return;
        // ONLY A PIP NAMES A MARK. Containment is how the destination gets its
        // NAME, not how the click picks its target — so clicking inside the East
        // Window District sets out for the spot you clicked, in that district,
        // rather than marching you to its centre; and a region too big to be a
        // destination stops swallowing clicks without needing a rule of its own.
        // A RESIDENT WINS THE CLICK, for the same reason they already win the
        // hover: the person is what you were pointing at. Their card is the only
        // way onto their page from the map, and on a touch screen the glance
        // never happens at all — so without this, faces would be a desktop-only
        // feature. Same snap helper, same radius, same precedence as pointing.
        const walkerId = snappedMarkAtPoint({ x: e.clientX, y: e.clientY }, screenWalkerCandidates());
        if (walkerId) { selectMark(walkerId); return; }
        // THE TALK LENS WINS WHILE IT IS UP (Keemin, launch night: with washes
        // sharing ground with pips and parcels, "sometimes the click reached
        // the thread" read as broken). The layer is opt-in — switching 💬 on IS
        // the statement of intent — so while it shows, a click on a wash goes
        // to the thread for everyone, losing only to a face: a small, precise
        // target you aimed at. Toggled off (the default), the washes are gone
        // and every click means exactly what it meant before the layer existed.
        {
          const wp = worldPointForEvent(e);
          const hit = convoAt(wp.x, wp.y); // visibility-gated: always null while hidden
          // a NEW tab (Keemin): the reader is mid-world with a lens up and a
          // camera aimed — the thread opens beside the map, never over it
          if (hit) { window.open(convoHref(hit.id), "_blank", "noopener"); return; }
        }
        // THE CONTESTED CLICK. Every seating mints a parcel, a building and a
        // predicate at nearly one spot, so the pips pile up and the snap can
        // only ever reach the nearest — the other three become unclickable at
        // any zoom. When more than one is under the cursor we do not guess: the
        // reader is shown the stack and picks. Exactly one in radius is the
        // behaviour this map has always had, down to the scrollCell.
        const contested = contestedMarksAtPoint({ x: e.clientX, y: e.clientY }, screenMarkCandidates());
        if (contested.length > 1) { openChooser(contested); return; }
        const markId = contested[0] ?? null;
        if (markId) {
          selectMark(markId, { scrollCell: true });
          return;
        }
        const worldPoint = worldPointForEvent(e);
        const point = { x: Math.round(worldPoint.x), y: Math.round(worldPoint.y) };
        markInteraction.select(null);
        if (canAct()) chooseWalkPoint(point.x, point.y);
        else {
          state.cam = point;
          renderCurrent();
        }
      });
      svg.addEventListener("pointercancel", () => { press = null; boxEl.classList.remove("panning"); });
      svg.addEventListener("pointerleave", () => { if (!press) { hoverMark(null); renderConvoHover(null); boxEl.classList.remove("over-convo"); } });

      // the grid keeps scale without exposing absolute survey readouts.
      function buildGridLayer() {
        const mx0 = (full.x - originPx.x) * mPerPx, mx1 = (full.x + full.w - originPx.x) * mPerPx;
        const my0 = (full.y - originPx.y) * mPerPx, my1 = (full.y + full.h - originPx.y) * mPerPx;
        const step = 1000, major = 5000;
        let s = "";
        for (let m = Math.ceil(mx0 / step) * step; m <= mx1; m += step) {
          const x = originPx.x + m / mPerPx, big = m % major === 0;
          s += `<line x1="${x}" y1="${full.y}" x2="${x}" y2="${full.y + full.h}" class="wv-gridline${big ? " major" : ""}"/>`;
        }
        for (let m = Math.ceil(my0 / step) * step; m <= my1; m += step) {
          const y = originPx.y + m / mPerPx, big = m % major === 0;
          s += `<line x1="${full.x}" y1="${y}" x2="${full.x + full.w}" y2="${y}" class="wv-gridline${big ? " major" : ""}"/>`;
        }
        gridLayer.innerHTML = s;
      }
      mapCtx.toggleGrid = () => {
        if (!gridLayer.childNodes.length) buildGridLayer();
        const on = gridLayer.style.display === "none";
        gridLayer.style.display = on ? "" : "none";
        return on;
      };

      // footprints: every mark's own claim landing on the painting (the calibration
      // made visible) — an extent rect, or the authored `points:` ring where a mark
      // carries one, through the one shape-builder.
      //
      // ONLY the world-root and ambient marks are skipped, and the reason is about
      // the mark, not the viewer: the root IS the frame (320 km square — a box
      // around everything says nothing), and an ambient mark is a property of the
      // whole world rather than a place in it. `far` used to be skipped here too,
      // justified as "no ground" — but that is a FIRST-PERSON claim (you cannot
      // walk up to a horizon) leaking into a top-down map, which has no horizon.
      // Pando has an extent, at real coordinates, exactly as real as any parcel;
      // vermillion's own 3,600 m mountain at the same centre has always drawn.
      const fpPx = (x, y) => ({ x: originPx.x + x / mPerPx, y: originPx.y + y / mPerPx });
      function buildFpLayer() {
        let s = "";
        for (const m of world.marks ?? []) {
          if (!m.at || !m.extent || isAmbientMark(m, byId)) continue;
          const cls = markClasses(m) + (m.kind === "parcel" ? " fp-parcel" : "") + (m.mechanic ? " mech" : "");
          s += markShapeSVG(m, fpPx, `wv-fp ${cls}`, {
            attrs: ` data-id="${esc(m.id)}"`, inner: `<title>${esc(m.id)}</title>`,
          });
        }
        fpLayer.innerHTML = s;
        if (lastRadial) mapCtx.syncWithin(lastRadial);
      }
      // the standpoint's containment chain reads heavier on the map — kept in sync
      // with every telling (the boxes are the same boxes, only the weight moves)
      mapCtx.syncWithin = (radial) => {
        const ids = new Set((radial?.within ?? []).map((w) => w.id));
        // `[data-id]`, not `rect[data-id]`: a ringed mark is a <polygon>, and the
        // element-name selector would have silently left every true-shape out of the
        // within highlight — a half-port that looks finished.
        for (const r of fpLayer.querySelectorAll("[data-id]"))
          r.classList.toggle("fp-within", ids.has(r.dataset.id));
      };
      mapCtx.toggleFp = () => {
        if (!fpLayer.childNodes.length) buildFpLayer();
        const on = fpLayer.style.display === "none";
        fpLayer.style.display = on ? "" : "none";
        return on;
      };
      // the conversations toggle: both layers move together, the clicks and the
      // polling follow visibility (a hidden layer must neither catch a click
      // nor cost the office a fetch), and opening it loads fresh right away
      mapCtx.toggleConvo = () => {
        const on = convoLayer.style.display === "none";
        convoLayer.style.display = on ? "" : "none";
        convoHoverLayer.style.display = on ? "" : "none";
        convoVisible = on;
        if (on) loadConversations().then(drawConversations);
        else { renderConvoHover(null); boxEl.classList.remove("over-convo"); }
        return on;
      };

      applyView();
      // shape the opening view to the pane the way every later change does, so the
      // first toggle is not also the first correction
      mapCtx.refit();
      if (lastRadial) drawOverlay(lastRadial);
    } catch (e) {
      boxEl.innerHTML = `<div class="loading">the painting didn't load (${esc(e.message)}) — the telling still works</div>`;
      reattachOverlays();
    }
  }
  // What the painting draws: the field of view, plus all of yours whether it holds
  // them or not. The filter chips are the Telling's business and this asks them
  // nothing (Keemin, 2026-08-04) — a map that changed under you when you narrowed
  // a list was two answers to one question.
  function overlayMarks(radial) {
    const seen = new Set(), out = [];
    for (const bands of Object.values(radial?.byBearing ?? {}))
      for (const arr of Object.values(bands ?? {}))
        for (const m of arr ?? []) {
          if (!m?.id || !m.at || typeof m.at.x !== "number" || seen.has(m.id)) continue;
          seen.add(m.id); out.push(m);
        }
    // the radial's own entries come first and are KEPT: they carry distM and
    // bearing, which the bare record mark does not
    for (const id of paintingMarkIds({ radialIds: [...seen], mineIds: [...state.mineIds] })) {
      if (seen.has(id)) continue;
      const m = byId.get(id);
      if (m?.at && typeof m.at.x === "number") { seen.add(id); out.push(m); }
    }
    return out;
  }
  function drawOverlay(radial) {
    if (!mapCtx) return;
    const { overlay, originPx, mPerPx } = mapCtx;
    // markers shrink gently as the camera closes in, so a zoomed street never
    // drowns under full-map-sized pips (the reach ring stays true-scale — it IS a distance)
    const k = markerScale(mapCtx.zoomK);
    const px = (m) => ({ x: originPx.x + m.x / mPerPx, y: originPx.y + m.y / mPerPx });
    const me = px(state.cam), reachPx = (radial?.sightReachM ?? 0) / mPerPx;
    let s = `<circle cx="${me.x}" cy="${me.y}" r="${reachPx}" class="ov-reach"/>`;
    const glyphIds = new Set();
    // tierOf, not m.tier: FOV marks carry no tier field, so it looks the full
    // mark up by id (and catches sovereign/home, which is not a tier value).
    // THE FAN, high zoom only. Pips sharing a spot get a few pixels of
    // separation so a hover can tell them apart before anyone has to click.
    // At low zoom they merge again on purpose — the pile is honest about being
    // a pile, and the chooser is the guarantee that you can still reach into it.
    const drawn = overlayMarks(radial);
    const fanned = mapCtx?.zoomK >= FAN_MIN_ZOOM ? coLocatedMarkIds(drawn) : new Set();
    for (const m of drawn) {
      const p = px(m.at);
      if (fanned.has(m.id)) {
        // in PANEL pixels, so the fan stays a constant few pixels rather than
        // growing with the map the way the marks themselves do
        const off = fanOffsetPx(m.id);
        p.x += off.dx / k;
        p.y += off.dy / k;
      }
      glyphIds.add(m.id);
      s += `<circle cx="${p.x}" cy="${p.y}" r="${11 / k}" class="ov-pip ${markClasses(m)}" data-id="${esc(m.id)}">`
        // the OS tooltip stands down in painting-only for the same reason the SVG
        // label does: the bubble is already saying this word, sooner and better
        + (state.paintingOnly ? "" : `<title>${esc(markIdentity(m))}</title>`) + `</circle>`;
    }
    s += `<circle cx="${me.x}" cy="${me.y}" r="${17 / k}" class="ov-dot"/><circle cx="${me.x}" cy="${me.y}" r="${36 / k}" class="ov-halo"/>`;
    overlay.innerHTML = s;
    mapCtx.glyphIds = glyphIds;
    mapCtx.syncWithin?.(radial);
    renderMarkHighlight();
    drawWalkers(); // the camera moved; a derived position must stay true to it
    drawConversations(); // ground-fixed like the walkers, so it moves the same way
    if (mapCtx.follow && mapCtx.lockOn && !mapCtx._tweening) mapCtx.lockOn();
  }
  function renderMarkHighlight() {
    if (!mapCtx?.hlLayer) return;
    const interaction = markInteraction.getState();
    const ids = [interaction.selectedId, interaction.hoveredId]
      .filter((id, index, all) => id && all.indexOf(id) === index);
    mapCtx.hlLayer.innerHTML = ids.map(renderOneMarkHighlight).join("");
  }
  function renderOneMarkHighlight(id) {
    const walkerHandle = walkerHandleFromHoverId(id);
    if (walkerHandle) return renderWalkerHighlight(walkerHandle);
    const m = id && byId.get(id);
    const target = nearestEmbodiedAncestor(m, byId);
    if (!m || !target) return "";
    const k = markerScale(mapCtx.zoomK);
    const t = markClasses(m), mech = m.mechanic ? " mech" : "";
    const p = { x: mapCtx.originPx.x + target.at.x / mapCtx.mPerPx, y: mapCtx.originPx.y + target.at.y / mapCtx.mPerPx };
    const worldViewport = {
      minX: (mapCtx.view.x - mapCtx.originPx.x) * mapCtx.mPerPx,
      minY: (mapCtx.view.y - mapCtx.originPx.y) * mapCtx.mPerPx,
      maxX: (mapCtx.view.x + mapCtx.view.w - mapCtx.originPx.x) * mapCtx.mPerPx,
      maxY: (mapCtx.view.y + mapCtx.view.h - mapCtx.originPx.y) * mapCtx.mPerPx,
    };
    const identity = markIdentity(m);
    const bounds = mapCtx.svg.getBoundingClientRect();
    const unit = bounds.width > 0 ? mapCtx.view.w / bounds.width : 1;
    if (!markGeometryIntersectsViewport(target, worldViewport)) {
      const edgeWorld = edgePointToward(worldViewport, target.at, 18 * unit * mapCtx.mPerPx);
      if (!edgeWorld) return "";
      const edge = {
        x: mapCtx.originPx.x + edgeWorld.x / mapCtx.mPerPx,
        y: mapCtx.originPx.y + edgeWorld.y / mapCtx.mPerPx,
      };
      const label = identity.length > 42 ? `${identity.slice(0, 41)}…` : identity;
      const labelWidth = Math.max(90, Math.min(300, label.length * 7 + 12)) * unit;
      const labelHeight = 23 * unit;
      const labelX = Math.max(mapCtx.view.x + 4 * unit,
        Math.min(mapCtx.view.x + mapCtx.view.w - labelWidth - 4 * unit, edge.x - labelWidth / 2));
      const labelY = Math.max(mapCtx.view.y + 4 * unit,
        Math.min(mapCtx.view.y + mapCtx.view.h - labelHeight - 4 * unit,
          edge.y < mapCtx.view.y + mapCtx.view.h / 2 ? edge.y + 12 * unit : edge.y - labelHeight - 12 * unit));
      return `<g class="wv-edge-indicator ${t}">`
        + `<path d="M0 -5 L2.8 4 L0 2.1 L-2.8 4 Z" transform="translate(${edge.x} ${edge.y}) rotate(${edgeWorld.bearingDeg}) scale(${1.4 * unit})"/>`
        + `<rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${3 * unit}"/>`
        + `<text x="${labelX + 6 * unit}" y="${labelY + 15.5 * unit}" font-size="${12 * unit}">${esc(label)}</text></g>`;
    }
    // the box AND the dot light together, in the mark's own tier color — the same
    // sentence the cells speak (dashed = machinery-kept truth)
    let s = "";
    if (target.extent) {
      // through the ONE shape-builder, so the wash traces the same outline the
      // footprints layer draws. Hand-built here, it drew a bbox rect over a mark the
      // layer beneath was correctly drawing as a polygon — Keemin caught it as a
      // wash that didn't fit its own shape.
      const hlPx = (x, y) => ({ x: mapCtx.originPx.x + x / mapCtx.mPerPx, y: mapCtx.originPx.y + y / mapCtx.mPerPx });
      s += markShapeSVG(target, hlPx, `wv-hl-box ${t}${mech}`);
    }
    s += `<circle cx="${p.x}" cy="${p.y}" r="${14 / k}" class="wv-hl-dot ${t}"/>`;
    // In painting-only the bubble carries the name, so the SVG label stands down
    // — two boxes saying the same word over the same dot is one box too many.
    // The geometry (the wash, the dot, the edge arrow) is not a label and stays.
    // the same box an off-screen mark gets, in this mark's own colour
    if (!state.paintingOnly)
      s += hoverLabelSVG({ text: identity, at: p, unit, view: mapCtx.view, className: `wv-hl-label ${t}` });
    return s;
  }
  // A standing resident gets the SAME box a mark gets — one hover language on
  // the painting, instead of the OS tooltip a <title> used to raise.
  function renderWalkerHighlight(handle) {
    if (!mapCtx) return "";
    const w = (walkState.walkers ?? []).find((x) => x?.handle === handle);
    if (!w || ![w.x, w.y].every(Number.isFinite)) return "";
    const k = markerScale(mapCtx.zoomK);
    const p = { x: mapCtx.originPx.x + w.x / mapCtx.mPerPx, y: mapCtx.originPx.y + w.y / mapCtx.mPerPx };
    const bounds = mapCtx.svg.getBoundingClientRect();
    const unit = bounds.width > 0 ? mapCtx.view.w / bounds.width : 1;
    const moving = w.moving ?? (!w.arrived && !w.standing);
    const where = moving
      ? `${w.remaining_m} m to go, ETA ${formatEtaCrossings(w.eta_crossings)}`
      : (w.mark_id ? `at ${w.mark_id}` : "at rest");
    return `<circle cx="${p.x}" cy="${p.y}" r="${14 / k}" class="wv-hl-dot wv-hl-walker${moving ? " moving" : ""}"/>`
      + (state.paintingOnly ? "" : hoverLabelSVG({
        text: `${w.handle} — ${where}`, at: p, unit, view: mapCtx.view,
        className: `wv-hl-label wv-hl-walker${moving ? " moving" : ""}`,
      }));
  }
  function syncMarkInteractionViews() {
    const interaction = markInteraction.getState();
    const cells = root.querySelectorAll(".wv-card[data-id], .wv-rnode[data-id], .wv-attribute[data-id]");
    for (const cell of cells) {
      const selected = cell.dataset.id === interaction.selectedId;
      cell.classList.toggle("is-mark-selected", selected);
      cell.classList.toggle("is-mark-hovered", cell.dataset.id === interaction.hoveredId);
      if (cell.classList.contains("wv-card")) cell.setAttribute("aria-selected", String(selected));
    }
    renderMarkHighlight();
    const rootGlyph = $(root, ".wv-root-mark");
    if (rootGlyph) {
      rootGlyph.classList.toggle("on", interaction.selectedId === WORLD_ROOT_ID);
      rootGlyph.classList.toggle("is-hovered", interaction.hoveredId === WORLD_ROOT_ID);
    }
    renderBubbles();
  }
  markInteraction.subscribe(syncMarkInteractionViews);

  // ───────── walkers (write-release P2) ─────────
  // A walk is a DECLARED DEPARTURE; position is derived from that record and the
  // clock. So this layer stores nothing and animates nothing — it asks the server
  // where everyone is at a given crossing and draws that.
  let walkState = {
    at: null,
    walkers: [],
    timer: null,
    destination: null,
    actorBound: true,
    changingCourse: false,
  };

  // Who the walkers ARE — name, avatar, colour, household — keyed by handle.
  // A record file like any other, fetched same-origin and entirely optional: an
  // empty map is not a degraded map, it is exactly the dots this viewer drew
  // before faces existed. Nothing waits on it and nothing fails without it.
  let residentsMeta = new Map();
  const faceOf = (handle) => residentFace(handle, residentsMeta.get(handle) ?? null);

  // What has actually been blessed. The office reads the world repo's own
  // settlement tags; the number cannot be derived from the clock because the
  // gate can refuse. Absent = the chip keeps its countdown and loses its
  // number, and the feed simply carries no blessing rows.
  let settleState = { current: null, recent: [] };
  // stakes, from the town's own commit log through the office door. Capped and
  // best-effort: this lane is a garnish on the rail, never a dependency.
  let stakeEvents = [];
  async function loadStakeEvents() {
    try {
      const r = await fetch(officeUrl("/repo/log?limit=120"), { credentials: "omit" });
      if (!r.ok) return;
      const body = await r.json();
      const commits = Array.isArray(body) ? body : (body?.commits ?? body?.log ?? []);
      stakeEvents = parseStakeCommits(commits).slice(0, 40);
    } catch { /* a quiet lane contributes nothing, and the rail is unchanged */ }
  }
  async function loadSettlements() {
    try {
      const r = await fetch(officeUrl("/world/settlements"), { credentials: "omit" });
      if (!r.ok) return;
      const body = await r.json();
      if (body && (body.current || Array.isArray(body.recent))) {
        settleState = { current: body.current ?? null, recent: Array.isArray(body.recent) ? body.recent : [] };
      }
    } catch { /* no number today; the countdown is still true */ }
  }
  function renderSettlementChip() {
    const el = $(root, ".settlenow");
    if (!el) return;
    // the countdown is live arithmetic, so this is re-read on the ambient clock
    el.textContent = settlementChipText(settleState.current);
    el.hidden = false;
  }
  async function loadResidentsMeta() {
    try {
      const r = await fetch("/world-engine/residents-meta.json", { credentials: "omit" });
      if (!r.ok) return;
      const body = await r.json();
      const entries = Object.entries(body?.residents ?? {});
      if (entries.length) residentsMeta = new Map(entries);
    } catch { /* no faces today; the dots are still the truth */ }
  }

  // Where the town is talking — the office's own thread derivation (voices.mjs:
  // a thread is a derivation, not an object). Best-effort like the settlement
  // lane: an office that doesn't answer leaves the map exactly as it was before
  // conversations existed.
  let convoState = { live: [], closed: [] };
  let convoVisible = false; // the layer is opt-in (upper-right 💬); hidden draws nothing, hits nothing, fetches nothing
  async function loadConversations() {
    try {
      const r = await fetch(officeUrl("/world/conversations"), { credentials: "omit" });
      if (!r.ok) return;
      const body = await r.json();
      if (Array.isArray(body?.live) && Array.isArray(body?.closed))
        convoState = { live: body.live, closed: body.closed };
    } catch { /* a quiet lane contributes nothing, and the map is unchanged */ }
  }

  function actorWalker() {
    return walkState.walkers.find((walker) => walker.handle === state.handle) ?? null;
  }

  function actorOrigin() {
    const walker = actorWalker();
    if (walker && Number.isFinite(walker.x) && Number.isFinite(walker.y))
      return { x: Number(walker.x), y: Number(walker.y), source: "walk ledger" };
    if (state.actorHome && Number.isFinite(state.actorHome.x) && Number.isFinite(state.actorHome.y))
      return { x: Number(state.actorHome.x), y: Number(state.actorHome.y), source: "home (no walk recorded yet)" };
    return null;
  }

  function selectedWalkPreview() {
    return deriveWalkPreview({
      from: actorOrigin(),
      destination: walkState.destination,
      skeleton: data?.skeleton,
      residentMode: canAct(),
    });
  }

  function syncActorPosition({ moveCamera = false } = {}) {
    const origin = actorOrigin();
    const journey = viewerJourneyState(actorWalker(), world?.marks ?? [], data?.worldState?.determined);
    const here = $(root, ".wv-youhere");
    if (here) {
      // how the office learned your position is provenance, not a thing to read
      // every time you glance at the column
      here.innerHTML = journey.kind === "journey"
        ? `<b>on the road</b> · ${journey.remainingM.toLocaleString()} m from ${esc(journey.destinationName)}`
        : origin
          ? `<b>${esc(standingLocationLabel(origin, world?.marks ?? [], data?.worldState?.determined, { prefix: false }))}</b>`
          : `<span class="wv-quiet">the office has no position for you yet</span>`;
    }
    if (moveCamera && origin && walkState.actorBound) {
      state.cam = { x: origin.x, y: origin.y };
      renderCurrent();
    }
  }

  // The artwork on the mountain, and the weather on the way to it. Both are
  // fixed to the ground rather than to the camera, so this runs ONCE when the
  // painting mounts and never again — a pan moves them the way it moves the
  // coastline, by moving the viewBox, which costs nothing.
  //
  // Which mountain, and where, is read off the record: the far feature's own
  // mark carries the coordinate and the extent. Nothing is placed by hand here,
  // so a peak that moves on the record moves its picture with it.
  const PANDO_ART_URL = "/media/vermillion-pando-peak-the-true-mountain-card.jpg";
  function drawFarCountry() {
    if (!mapCtx?.mistLayer || !mapCtx.farArtLayer) return;
    const px = (p) => ({ x: mapCtx.originPx.x + p.x / mapCtx.mPerPx, y: mapCtx.originPx.y + p.y / mapCtx.mPerPx });
    const peak = (world?.marks ?? []).find((m) => m.far && m.feature === "pando-peak" && m.at);
    if (!peak) return;                      // no far feature on the record, no far country
    const centre = px(peak.at);
    // the corridor runs from Ferry's crossing — grid origin, the town's own
    // registration point — out to the peak; the mist is the water between
    mapCtx.mistLayer.innerHTML = mistBandSVG({ from: px({ x: 0, y: 0 }), to: centre });
    mapCtx.farArtLayer.innerHTML = placedArtSVG({
      at: centre,
      extent: { w: (peak.extent?.w ?? 0) / mapCtx.mPerPx, h: (peak.extent?.h ?? 0) / mapCtx.mPerPx },
      href: PANDO_ART_URL,
      label: `${peak.label ?? peak.feature} — the mountain, seen from the town side`,
      id: "pando-peak",
    });
  }

  // ── conversations on the ground ────────────────────────────────────────────
  // Each thread draws as the ground it covered: the office ships an extent — a
  // bbox over EVERY statement in the thread, not just the shown tail — and the
  // wash is that box grown by half an earshot, because a voice fills a room,
  // not a point. Live threads carry their label (place · statements · speakers);
  // a finished conversation fades to bare geometry and leaves the map after a
  // day — the conversations page is the archive, this layer answers "where is
  // the town talking right now". Same-named places holding several distinct
  // circles (three "Volvigradus Garden" threads on party night) is exactly what
  // this layer exists to disambiguate: the words collide, the ground does not.
  const CONVO_PAD_M = 30;                        // half an earshot: the room around the words
  const CONVO_CLOSED_KEEP_MS = 24 * 3600 * 1000; // a cooling mark, then the page remembers
  // The drawn ellipses in WORLD metres, smallest-first — the click and the
  // hover pick the most specific room when circles nest (a garden thread sat
  // inside the party's wash on the night this shipped).
  let convoHits = [];
  const convoAt = (wx, wy) => (!convoVisible ? null : convoHits.find((h) => {
    const nx = (wx - h.cx) / h.rxM, ny = (wy - h.cy) / h.ryM;
    return nx * nx + ny * ny <= 1;
  }) ?? null);
  // the island serves /conversations/ same-origin; on the local spectator the
  // link 404s, which is the dev-server's honest shape (it has no site around it)
  const convoHref = (id) => `/conversations/#${encodeURIComponent(id)}`;
  function drawConversations() {
    if (!mapCtx?.convoLayer || !convoVisible) return;
    const px = (x, y) => ({ x: mapCtx.originPx.x + x / mapCtx.mPerPx, y: mapCtx.originPx.y + y / mapCtx.mPerPx });
    let s = "";
    const hits = [];
    const paint = (t, live) => {
      if (!t?.at) return;
      // A deck thread's box is the length of the water it crossed — true of the
      // crossing, wrong as a room. The vessel is the room: it draws at the
      // thread's own point instead (voices.mjs threadOf ships the flag).
      const e = t.aboard || !t.extent ? { x0: t.at.x, y0: t.at.y, x1: t.at.x, y1: t.at.y } : t.extent;
      const cxM = (e.x0 + e.x1) / 2, cyM = (e.y0 + e.y1) / 2;
      const rxM = (e.x1 - e.x0) / 2 + CONVO_PAD_M, ryM = (e.y1 - e.y0) / 2 + CONVO_PAD_M;
      // a wash says nothing until pointed at; the words it says then ride the
      // hit, spoken by the SAME name-box a mark raises (renderConvoHover).
      // The box truncates at 58 chars, so the PLACE carries the cut and the
      // numbers always survive — a long place name was eating '· 1 speaker'
      // off the tail (the same class the old labels were fixed for once).
      const n = Number(t.voice_count) || 0, p = (t.participants ?? []).length;
      const tail = `${n} statement${n === 1 ? "" : "s"} · ${p} speaker${p === 1 ? "" : "s"}${live ? "" : " · gone quiet"}`;
      let where = String(t.place ?? "somewhere");
      const room = 58 - tail.length - 3;
      if (where.length > room) where = `${where.slice(0, Math.max(8, room - 1))}…`;
      const words = `${where} — ${tail}`;
      if (t.id) hits.push({ id: t.id, cx: cxM, cy: cyM, rxM, ryM, live, words });
      const c = px(cxM, cyM);
      const rx = rxM / mapCtx.mPerPx, ry = ryM / mapCtx.mPerPx;
      s += `<ellipse cx="${c.x}" cy="${c.y}" rx="${rx}" ry="${ry}" class="wv-convo${live ? " is-live" : ""}${t.aboard ? " is-aboard" : ""}"/>`;
    };
    const t0 = Date.now();
    for (const t of convoState.closed)
      if (t0 - Date.parse(t.latest) <= CONVO_CLOSED_KEEP_MS) paint(t, false);
    for (const t of convoState.live) paint(t, true); // live paints over cooled
    convoHits = hits.sort((a, b) => a.rxM * a.ryM - b.rxM * b.ryM); // most specific room first
    mapCtx.convoLayer.innerHTML = s;
  }

  function drawWalkers() {
    if (!mapCtx?.walkLayer) return;
    const k = markerScale(mapCtx.zoomK);
    // the vessel's own floor against being zoomed away from (see farGlyphUnit):
    // out at journey width she would otherwise be three pixels of hull
    const vesselUnit = farGlyphUnit(k, mapCtx.view?.w, VESSEL_MIN_FRAME_FRACTION) * VESSEL_GLYPH_SCALE;
    const vessels = vesselHandles(world?.marks ?? []);
    const px = (m) => ({ x: mapCtx.originPx.x + m.x / mapCtx.mPerPx, y: mapCtx.originPx.y + m.y / mapCtx.mPerPx });
    // TWO PASSES, ONE LAYER. Hulls are collected separately and emitted first so
    // every deck sits under every passenger — a boat drawn in walker order would
    // be painted over the crowd it is carrying by whoever boarded after it.
    let hulls = "";
    let s = "";
    for (const w of walkState.walkers) {
      // The drawn leg ends where the WALK ends — the first point on the
      // target's ground, not its centre (Keemin, party night: the dotted line
      // overshot into the mark while the derivation stopped at the edge).
      // Clipped with the engine's own entry math. One honest approximation:
      // the ledger's frozen `within` doesn't ride the walkers payload, so the
      // target's CURRENT extent stands in — identical unless a mark resized
      // mid-walk.
      let towardM = w.toward ?? w;
      if (w.moving && w.toward && w.mark_id) {
        const tm = (world?.marks ?? []).find((m) => m.id === w.mark_id);
        if (tm?.at && tm?.extent) {
          const t = targetEntryT({ x: w.x, y: w.y }, w.toward,
            { x: w.toward.x, y: w.toward.y, w: tm.extent.w, h: tm.extent.h });
          if (t < 1) towardM = { x: w.x + (w.toward.x - w.x) * t, y: w.y + (w.toward.y - w.y) * t };
        }
      }
      const now = px(w), dest = px(towardM);
      // TWO states, not three. "arrived" and "standing" were never different
      // things — both are a person at rest at a place; what differed was only
      // how we learned the position (a walk record vs their parcel). Painting
      // that difference made a resident who had never walked look like another
      // species. Provenance still shows in the words; it no longer picks a colour.
      const moving = w.moving ?? (!w.arrived && !w.standing);
      const cls = moving ? "wv-walker moving" : "wv-walker";
      const eta = moving
        ? `${w.remaining_m} m to go, ETA ${formatEtaCrossings(w.eta_crossings)}`
        : (w.mark_id ? `at ${w.mark_id}` : "at rest");
      // the remaining leg, then the walker on top of it — movers only
      if (moving)
        s += `<line x1="${now.x}" y1="${now.y}" x2="${dest.x}" y2="${dest.y}" class="wv-walk-leg"/>` +
             `<circle cx="${dest.x}" cy="${dest.y}" r="${5 / k}" class="wv-walk-dest"/>`;
      // A HIT HALO, invisible, three times the dot. The visible walker renders
      // at about 7 CSS pixels — a ~3px radius target, and standing residents now
      // crowd close enough that one dot's centre can sit under its neighbour. So
      // the mark you can SEE stays exactly the size it was, and the thing you
      // have to HIT is comfortable. The halo is emitted first, so the visible
      // dot still paints on top.
      //
      // No <title> on either circle any more: hovering now raises the town's own
      // label box (the same one a mark raises), and a <title> would race it with
      // a delayed, unstyled OS tooltip saying the same thing. The accessible
      // name moves onto the visible dot, which is the element that means
      // something; the halo is a hit target and says nothing.
      const identity = `${w.handle} — ${eta}`;
      // A BOAT IS NOT A PERSON. She keeps the leg and the destination ring every
      // walker has, and she is named to a screen reader on her own group, but she
      // gets a hull instead of a face — a monogram in a circle said "T" and meant
      // nothing.
      //
      // No hit halo of her own, deliberately. Hover on this map is decided
      // GEOMETRICALLY — snappedMarkAtPoint, 18 px around a walker's derived point
      // — not by what the pointer is over, so a halo the size of the hull would
      // put a cursor:help over eighty pixels of boat that raise somebody else's
      // card. She stays in the snap exactly as the walker she replaced was, which
      // means she also keeps that walker's known problem: forty-five passengers
      // derive to her spot, the tie breaks alphabetically, and a passenger wins.
      // Pre-existing, and not a thing to invent a precedence rule for on sailing
      // night — but worth its own pass.
      if (vessels.has(w.handle)) {
        hulls += vesselGlyphSVG({ at: now, toward: dest, unit: vesselUnit, moving, label: identity });
        continue;
      }
      s += `<circle cx="${now.x}" cy="${now.y}" r="${27 / k}" class="wv-walker-hit"/>`;

      // THE FACE, and the ring that is still the ruling. The dot became a
      // circle carrying the resident's own picture — but green-still /
      // pink-moving is the map's motion language, so it survives as a RING
      // around the face rather than being replaced by it. Read the ring for
      // state, the face for who.
      //
      // A resident with no avatar gets their monogram on their own colour;
      // a resident the meta map has never heard of gets the same circle in the
      // town's gold, which is the old dot with a letter in it. There is no
      // path here that renders nothing.
      const face = faceOf(w.handle);
      const r = 11 / k;
      if (face.avatar) {
        // The clip is per-walker because each face is a different picture; the
        // id is built from the handle, which residentHref's own rule has
        // already established is [a-z0-9-] — and a handle that fails it simply
        // never reaches this branch, because the meta map is keyed by handle.
        const clip = `wv-face-${face.handle.replace(/[^a-z0-9-]/g, "")}`;
        s += `<clipPath id="${clip}"><circle cx="${now.x}" cy="${now.y}" r="${r}"/></clipPath>`
           + `<image href="${esc(face.avatar)}" x="${now.x - r}" y="${now.y - r}" width="${r * 2}" height="${r * 2}"`
           + ` preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" class="wv-walker-face"/>`;
      } else {
        s += `<circle cx="${now.x}" cy="${now.y}" r="${r}" class="wv-walker-mono" fill="${esc(face.color)}"/>`
           + `<text x="${now.x}" y="${now.y}" class="wv-walker-initial" font-size="${13 / k}">${esc(face.monogram)}</text>`;
      }
      s += `<circle cx="${now.x}" cy="${now.y}" r="${r}" class="${cls}" role="img" aria-label="${esc(identity)}"/>`;
    }
    mapCtx.walkLayer.innerHTML = hulls + s;
    const box = $(root, "#wv-walk-readout");
    if (box) {
      const on = walkState.walkers.filter((w) => w.moving ?? (!w.arrived && !w.standing)).length;
      const still = walkState.walkers.length - on;
      box.textContent = walkState.at === null ? "no walk records"
        : `crossing ${walkState.at.toFixed(3)} — ` +
          `${walkState.walkers.length} on the map, ${on} on the road, ${still} at rest`;
    }
    syncActorPosition();
    renderWalkDestination();
  }

  function drawWalkPreview() {
    const layer = mapCtx?.walkPreviewLayer;
    if (!layer) return;
    const preview = selectedWalkPreview();
    if (!preview) {
      layer.innerHTML = "";
      return;
    }
    const k = markerScale(mapCtx.zoomK);
    const unit = 1 / k;
    const px = (point) => ({
      x: mapCtx.originPx.x + point.x / mapCtx.mPerPx,
      y: mapCtx.originPx.y + point.y / mapCtx.mPerPx,
    });
    const from = px(preview.from), toward = px(preview.toward);
    const midpoint = { x: (from.x + toward.x) / 2, y: (from.y + toward.y) / 2 };
    const label = formatWalkPreviewLabel(preview.leg);
    const labelWidth = Math.max(152, label.length * 7 + 14) * unit;
    const labelHeight = 24 * unit;
    const labelX = Math.max(mapCtx.view.x + 4 * unit,
      Math.min(mapCtx.view.x + mapCtx.view.w - labelWidth - 4 * unit, midpoint.x - labelWidth / 2));
    const labelY = Math.max(mapCtx.view.y + 4 * unit,
      Math.min(mapCtx.view.y + mapCtx.view.h - labelHeight - 4 * unit, midpoint.y - labelHeight - 12 * unit));
    layer.innerHTML = `<line x1="${from.x}" y1="${from.y}" x2="${toward.x}" y2="${toward.y}" class="wv-walk-preview-leg"/>`
      + `<circle cx="${toward.x}" cy="${toward.y}" r="${6 / k}" class="wv-walk-preview-dest"/>`
      + `<g class="wv-walk-preview-label"><rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${3 * unit}"/>`
      + `<text x="${labelX + 7 * unit}" y="${labelY + 16 * unit}" font-size="${12 * unit}">${esc(label)}</text></g>`;
  }

  async function pollWalkers() {
    // /world/walkers is a PUBLIC office read — "visible to anyone who asks who
    // is out today" applies to spectators too. /walks stays the local-spectator
    // fallback shape.
    const paths = [officeUrl("/world/walkers"), officeUrl("/walks")];
    for (const path of paths) {
      try {
        const r = await fetch(path, { headers: authHeaders(), credentials: "same-origin" });
        if (!r.ok) continue;
        const j = await r.json();
        walkState.at = Number(j.at);
        // Walkers are the people who have MOVED; `standing` is everyone whose
        // ground is on the record and who has never declared a walk. The map
        // drew only the former, so most of the town was simply absent from it —
        // a resident could stand on his own mountain and appear nowhere. Both
        // are people; they are drawn together and told apart by `standing`,
        // which this renderer already understood. The office publishes them
        // under separate keys so `walkers` keeps meaning what it always meant.
        walkState.walkers = [...(j.walkers ?? []), ...(j.standing ?? [])];
        drawWalkers();
        const origin = actorOrigin();
        if (canAct() && origin && walkState.actorBound) {
          const moved = state.cam.x !== origin.x || state.cam.y !== origin.y;
          state.cam = { x: origin.x, y: origin.y };
          if (moved) renderCurrent();
        }
        return true;
      } catch { /* try the spectator-local shape, then feature-detect off */ }
    }
    return false;
  }

  function mountWalkers() {
    const host = $(root, "#wv-walk-panel");
    if (!host) return;
    host.innerHTML = `<span id="wv-walk-readout">checking the walk ledger…</span>`;
    pollWalkers().then((available) => { host.hidden = !available; });
    clearInterval(walkState.timer);
    walkState.timer = setInterval(pollWalkers, 15000);
  }

  async function officeCall(path, { method = "GET", body = null } = {}) {
    const token = pmKey();
    if (!token) throw new Error("sign in before asking the office to act");
    const response = await fetch(officeUrl(path), {
      method,
      headers: {
        accept: "application/json",
        ...authHeaders(),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      credentials: "same-origin",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({
      error: "bounce",
      defect: `the door answered ${response.status} without a readable receipt`,
    }));
    return { ok: response.ok, status: response.status, body: payload };
  }

  // THE ONE DOOR (2026-08-17): every act this viewer performs goes through the
  // apex envelope - POST /world/apex { do, args, handle }, the same contract
  // the MCP door's `world` verb speaks, validated server-side by the same
  // schema. The apex wraps the dispatched verb's own reply in `result` (with
  // `did` and `terms` - the law shown at the door - beside it); this helper
  // flattens the transport so callers keep reading the verb's fields exactly
  // as they did on the flat routes, and parks the apex's own fields under
  // `_apex` for any reader that wants the terms.
  async function apexAct(action, args = {}, handle = state.handle) {
    const body = { do: action, ...(Object.keys(args).length ? { args } : {}), ...(handle ? { handle } : {}) };
    const response = await officeCall("/world/apex", { method: "POST", body });
    const raw = response.body ?? {};
    const flat = raw.error === "bounce" ? raw : { ...(raw.result ?? {}), _apex: { did: raw.did, terms: raw.terms } };
    return { ...response, body: flat };
  }

  async function loadActorHome() {
    state.actorHome = null;
    if (!state.handle) return;
    try {
      const response = await officeCall(`/homes/${encodeURIComponent(state.handle)}`);
      const place = response.body?.world;
      if (response.ok && place?.sited && Number.isFinite(place.x) && Number.isFinite(place.y)) {
        state.actorHome = { x: Number(place.x), y: Number(place.y), markId: place.mark_id ?? null };
        return;
      }
    } catch { /* the manifest fallback below is spectator-safe */ }
    const home = data?.manifest?.homes?.find((entry) => entry.household === state.handle && entry.grid_m);
    if (home) state.actorHome = { x: Number(home.grid_m.x), y: Number(home.grid_m.y), markId: `${home.household}/${home.home_id}` };
  }

  async function loadActorBalance() {
    const handle = state.handle;
    state.actorBalance = null;
    renderIdentity();
    if (!handle) return;
    let nextBalance;
    try {
      const response = await fetch(officeUrl(`/stamps/${encodeURIComponent(handle)}`), {
        headers: { accept: "application/json" },
        credentials: "omit",
      });
      const body = response.ok ? await response.json() : null;
      const balance = Number(body?.stamps);
      nextBalance = response.ok && Number.isInteger(balance) && balance >= 0 ? balance : undefined;
    } catch {
      nextBalance = undefined;
    }
    if (state.handle === handle) {
      state.actorBalance = nextBalance;
      renderIdentity();
    }
  }

  function clearWalkFeedback() {
    const confirm = $(root, ".wv-walk-confirm");
    const answer = $(root, ".wv-walk-answer");
    if (confirm) confirm.disabled = true;
    if (answer) { answer.hidden = true; answer.textContent = ""; answer.className = "wv-walk-answer"; }
  }

  function showWalkRefusal(message) {
    const answer = $(root, ".wv-walk-answer");
    if (!answer) return;
    answer.hidden = false;
    answer.className = "wv-walk-answer refusal";
    answer.textContent = message;
  }

  function renderWalkDestinations() {
    if (!$(root, ".wv-walkdesk")) return;
    renderWalkDestination();
    syncActorPosition();
  }

  function renderWalkDestination() {
    const desk = $(root, ".wv-walkdesk");
    if (!desk) return;
    // THE TOUR'S DEMO OWNS THE DESK WHILE IT IS STAGED. Without this the next
    // render — and something renders on nearly every tick — hides it again,
    // because there is no armed destination behind it, which is exactly the
    // point: the demonstration is not one.
    if (tourStage === "walk") return;
    const journey = viewerJourneyState(actorWalker(), world?.marks ?? [], data?.worldState?.determined);
    // The desk is for a walk, so it appears when there IS one (Keemin,
    // 2026-08-04): a destination you have armed, or a journey already under way.
    // Standing still it said only where you stand, which the painting's own dot
    // and the coordinate chip already say.
    const wasShowing = !desk.hidden;
    desk.hidden = !canAct() || (!walkState.destination && journey.kind !== "journey");
    // the desk is an obstacle on the painting now, so its coming and going is the
    // bubbles' business
    if (wasShowing !== !desk.hidden) requestAnimationFrame(positionBubbles);
    if (desk.hidden) { drawWalkPreview(); return; }
    const status = $(desk, ".wv-walk-status");
    const planner = $(desk, ".wv-walk-planner");
    const box = $(desk, ".wv-walk-destination");
    const confirm = $(desk, ".wv-walk-confirm");
    const destination = walkState.destination;
    const preview = selectedWalkPreview();
    if (status) {
      // "arrived at X" said again what From has just said
      status.hidden = journey.kind !== "journey";
      status.className = `wv-walk-status${journey.kind === "journey" ? " journey" : journey.kind === "arrived" ? " arrived" : ""}`;
      status.innerHTML = journey.kind === "journey"
        ? `<b>on the road — toward ${esc(journey.destinationName)}</b> · ${journey.remainingM.toLocaleString()} m left · arrives ${formatEtaCrossings(journey.etaCrossings)}`
          + `<button type="button" class="wv-change-course">change course</button>`
        : journey.kind === "arrived"
          ? `arrived at <b>${esc(journey.destinationName)}</b>`
          : "";
    }
    if (planner) planner.hidden = journey.kind === "journey"
      && !walkState.changingCourse && !destination;
    if (box) box.innerHTML = destination ? walkToRow(destination, preview)
      : `<span class="wv-quiet">click the painting, or select a mark</span>`;
    if (confirm) {
      confirm.textContent = journey.kind === "journey" ? "change course" : "confirm";
      confirm.disabled = !preview;
    }
    const who = $(desk, ".wv-walk-who");
    if (who) who.innerHTML = `<b>${esc(state.handle || "—")}</b>`;
    const cancel = $(desk, ".wv-walk-cancel");
    if (cancel) cancel.hidden = !destination;
    drawWalkPreview();
  }

  // the To line: the name, how far, WHICH WAY as an arrow rather than a compass
  // word, and when you would arrive.
  function walkToRow(destination, preview) {
    const from = actorOrigin();
    const name = walkDestinationLabel(destination, byId, data?.worldState?.determined, null);
    const parts = preview && walkLegParts(preview.leg);
    let arrow = "";
    if (from) {
      const bearing = quantizeBearing(
        bearingDeg(Number(destination.x) - from.x, Number(destination.y) - from.y),
        state.dials.bearing_points);
      if (bearing) arrow = `<span class="wv-walk-dir" title="${esc(BEARING_LONG[bearing] ?? bearing)}">${bearingArrow(bearing)}</span>`;
    }
    const leg = [
      parts ? `<span class="wv-walk-meta">${esc(parts.distance)}</span>` : "",
      arrow,
      parts?.eta ? `<span class="wv-walk-meta">${esc(parts.eta)}</span>` : "",
    ].filter(Boolean);
    return `<b>${esc(name)}</b>`
      + (leg.length ? `<div class="wv-walk-legline">${leg.join("")}</div>` : "");
  }

  function scrollMarkCellIntoView(id) {
    const cell = [...root.querySelectorAll(".wv-card[data-id], .wv-attribute[data-id]")]
      .find((entry) => entry.dataset.id === id);
    cell?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // A mark you could actually set out for: walkable, and not the ground you are
  // already standing on. The zero-length case matters now that selection drives
  // the preview — before, you had to go out of your way to arm a 0 m departure,
  // and it would still have let you confirm it. Derived through the real
  // preview, so "zero" means whatever previewWalkLeg says it means.
  // "Is this an actual departure?" — ONE owner, because the two doors that arm a
  // destination (a mark cell, and a click on open ground) reach it by different
  // routes and only the mark one was ever guarded. A walk to where you already
  // stand is not a walk, and the record should not carry one.
  function isRealDeparture(preview) {
    return !!preview && Number(preview.leg?.distanceM) > 0;
  }

  function walkPreviewTo(point) {
    const from = actorOrigin();
    if (!from) return null;
    return deriveWalkPreview({
      from,
      destination: { x: point.x, y: point.y },
      skeleton: data?.skeleton,
      residentMode: canAct(),
    });
  }

  function previewableWalkTarget(id) {
    const mark = byId.get(id);
    if (!walkableMark(mark)) return false;
    if (!actorOrigin()) return true; // no origin is its own refusal — chooseWalkPoint says so
    return isRealDeparture(walkPreviewTo(mark.at));
  }

  function selectMark(id, { scrollCell = false, trail = null } = {}) {
    // THE CHOOSER, like the walker card, takes none of the mark machinery
    // below: it names no single mark yet, so there is no trail step to record
    // and no destination to preview. Choosing a row is what selects a mark.
    if (chooserIdsFrom(id)) {
      bubbleTrail = [];
      markInteraction.select(id);
      return true;
    }
    // A WALKER IS SELECTABLE, and takes none of the machinery below. No trail
    // (a resident is not a step in a route through the record), no walk preview
    // (selecting a person is not choosing a destination — the ground under them
    // still is, and that is a different click), and no cell to scroll to. It
    // toggles, so a second click on the same face puts the card away.
    if (walkerHandleFromHoverId(id)) {
      if (markInteraction.getState().selectedId === id) { markInteraction.select(null); return false; }
      bubbleTrail = [];
      markInteraction.select(id);
      return true;
    }
    if (!id || !byId.has(id)) return false;
    if (markInteraction.getState().selectedId === id) {
      clearSelectionAndDestination();
      return false;
    }
    // set BEFORE the store fires: selecting re-renders the bubble, and the bubble
    // reads the trail to decide whether it owes you a way back
    bubbleTrail = trail ?? bubbleTrailStep(bubbleTrail, "select", id);
    markInteraction.select(id);
    // Selecting IS the intent, so the walk preview follows from it — that is why
    // the per-cell "walk here" chip is gone (Keemin 2026-08-04). Three things
    // this must not break, and does not: a spectator still selects freely (the
    // whole block is behind canAct, so they simply preview nothing); an
    // unwalkable mark still selects, just without a preview; and CONFIRMING is
    // untouched — it remains its own deliberate press on the walk desk.
    if (canAct()) {
      walkState.destination = null;
      if (viewerJourneyState(actorWalker()).kind === "journey") walkState.changingCourse = true;
      clearWalkFeedback();
      if (previewableWalkTarget(id)) chooseWalkMark(id);
      else renderWalkDestination();
      renderActions(); // selecting IS the intent — the crossings offer follows it (step 5)
    }
    if (scrollCell) scrollMarkCellIntoView(id);
    return true;
  }

  function clearSelectionAndDestination() {
    bubbleTrail = [];
    markInteraction.select(null);
    walkState.destination = null;
    walkState.changingCourse = false;
    clearWalkFeedback();
    renderWalkDestination();
    renderActions();
  }

  function chooseWalkMark(id) {
    if (!canAct()) return;
    const mark = byId.get(id);
    if (!walkableMark(mark)) return;
    chooseWalkPoint(mark.at.x, mark.at.y, id);
  }

  // `scrollDesk` is gone with the rail (Keemin, 2026-08-04): the desk was down a
  // scrolling column and had to be scrolled to, which is precisely the problem
  // moving it to the painting's corner solves — it now opens where you are looking.
  function chooseWalkPoint(x, y, namedInside = null) {
    if (!canAct()) return;
    const destination = pointWalkDestination({ x, y }, world?.marks ?? []);
    if (!destination) return;
    const next = { ...destination, inside: namedInside || destination.inside, markId: namedInside || null };
    if (sameWalkDestination(walkState.destination, next)) {
      clearSelectionAndDestination();
      return;
    }
    // Clicking the ground you already stand on armed a 0 m destination with an
    // ENABLED confirm — the label formatter returns "" at eta zero, so it showed
    // as a destination with blank metrics. Refuse it here rather than let a
    // zero-length journey reach the ledger. The click is still heard; it just
    // arms nothing, and says why.
    if (actorOrigin() && !isRealDeparture(walkPreviewTo(next))) {
      walkState.destination = null;
      walkState.changingCourse = false;
      renderWalkDestination();
      clearWalkFeedback();
      showWalkRefusal("You are already standing there — a departure needs somewhere else to go.");
      return;
    }
    walkState.destination = next;
    if (viewerJourneyState(actorWalker()).kind === "journey") walkState.changingCourse = true;
    clearWalkFeedback();
    renderWalkDestination();
    if (!actorOrigin()) showWalkRefusal("The office has no walk-ledger or sited-home origin for this resident.");
    else if (!selectedWalkPreview()) showWalkRefusal("Choose a destination with two finite coordinates.");
  }

  async function confirmSelectedWalk() {
    const desk = $(root, ".wv-walkdesk");
    const confirm = $(desk, ".wv-walk-confirm");
    const answer = $(desk, ".wv-walk-answer");
    const preview = selectedWalkPreview();
    if (!preview) return;
    const armedDestination = walkState.destination;
    const handle = state.handle;
    confirm.disabled = true;
    answer.hidden = false;
    answer.className = "wv-walk-answer";
    answer.textContent = "The office is recording the departure…";
    try {
      const response = await apexAct("walk", { x: preview.toward.x, y: preview.toward.y }, handle);
      if (!response.ok || response.body?.error === "bounce") {
        answer.classList.add("refusal");
        answer.textContent = [response.body?.defect || `the door answered ${response.status}`, response.body?.hint].filter(Boolean).join(" — ");
        confirm.disabled = false;
        return;
      }
      answer.classList.add("success");
      answer.textContent = `${handle} departed: ${Number(response.body.leg_m ?? 0).toLocaleString()} m, ETA ${formatEtaCrossings(response.body.eta_crossings ?? 0)}.`;
      await pollWalkers();
      // R15's QoL half: the walk has moved a body and put it inside NOTHING, so
      // the boundary it just crossed offers the other axis rather than assuming
      // it. (step 5, jetto/enter-exit-demo)
      await pollOccupancy({ rerender: false });
      renderActions();
      refreshCrossingPrompt();
      if (sameWalkDestination(walkState.destination, armedDestination)) clearSelectionAndDestination();
    } catch (error) {
      answer.classList.add("refusal");
      answer.textContent = `The walk door could not be reached — ${error.message}`;
      confirm.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enter / exit(mark) — THE CROSSINGS.  DEMO SLICE, step 5 (jetto/enter-exit-demo)
  //
  // Walking is not entering (R15). Everything above this line moves a BODY to
  // coordinates; everything below it moves a resident through the containment
  // TREE, and the two are deliberately separate axes — a visitor can stand on
  // the deck of a boat she never boarded, which is a real, representable state
  // and the reason four standing patches exist to compensate for its absence.
  //
  // The crossing itself is one edge and two words: the walker's side is his
  // AUTHORSHIP of the act, and the mark's side is its automatic response from
  // its own standing entry law. Mutual consent, or the effect is null.
  //
  // What this layer adds to the page is a STANDPOINT CHANGE: entering cuts the
  // read to the entered mark's own sector — its children (fellow occupants
  // included, because they are children of it now), its own words, its terms —
  // and exiting restores the enclosing scope. The study-read becomes a place.

  /** The chain of marks the selected resident has crossed into, root first. */
  const withinChainOf = (handle = state.handle) => state.within?.[handle] ?? [];
  /** The innermost of them — the scope the view is cut to, or null. */
  const enteredMark = (handle = state.handle) => withinChainOf(handle).slice(-1)[0] ?? null;
  const occupancyMap = () => new Map(Object.entries(state.within ?? {}));
  const nameOfMark = (id) => (byId.has(id) ? markName(byId.get(id)).name || shortName(byId.get(id)) : id);

  /** The derived occupancy, read from the office. Never computed here: the acts
   *  are the record and the door owns the derivation, exactly as walk positions
   *  come from /api/walks rather than from a second copy of positionAt.
   *
   *  SEQUENCED, because two crossings a second apart put two of these in flight
   *  at once and the slower one is not the older TRUTH, it is just the slower
   *  answer — landing it second rewound the page by one act (found in QA: the
   *  scope bar sat one threshold behind the record). An act's own reply is the
   *  freshest fact there is, so it applies immediately (`applyWithin`) and this
   *  poll only ever fills in around it. */
  let crossSeq = 0;
  function applyWithin(handle, chain) {
    crossSeq += 1;
    state.within = { ...state.within, [handle]: chain ?? [] };
    if (!chain?.length) delete state.within[handle];
  }
  async function pollOccupancy({ rerender = true } = {}) {
    const mine = crossSeq;
    try {
      const r = await fetch(officeUrl("/world/occupancy"), { headers: authHeaders(), credentials: "same-origin" });
      if (!r.ok) return false;
      const body = await r.json();
      if (mine !== crossSeq) return false; // an act landed while this was in flight; its answer wins
      const before = JSON.stringify(state.within);
      state.within = body.within ?? {};
      state.occupants = body.occupants ?? {};
      const moved = before !== JSON.stringify(state.within);
      if (rerender && moved) { renderActions(); renderTelling(); drawWalkers(); }
      else if (rerender) renderActions();
      return moved;
    } catch { return false; }
  }

  // ── the Actions section (R16) ─────────────────────────────────────────────
  //
  // DERIVED, never hand-listed: enter appears only when there is a threshold in
  // front of this resident, exit only when she is within something. The two
  // predicates are the engine's own (`enterPrompt` / the within chain), so the
  // rail cannot offer a door the door itself would refuse.
  function renderActions() {
    const box = $(root, ".wv-actions");
    if (!box) return;
    if (!canAct()) { box.hidden = true; box.innerHTML = ""; return; }
    const chain = withinChainOf();
    const inside = enteredMark();
    const standing = actorOrigin();
    // WHAT ENTER IS OFFERED, and why it is two rules rather than one. A door you
    // are already standing at is the geometric prompt's answer; a door across
    // the water is the SELECTED mark's, because entering from outside bundles
    // the walk in (the QoL convergence) and so does not require you to have
    // arrived first. Both are derived from where this resident actually stands
    // — neither is a hand-listed button — and the selected mark wins when it is
    // enterable, because selecting IS the intent.
    const selectedId = markInteraction.getState().selectedId;
    const selected = selectedId && !chain.includes(selectedId) ? byId.get(selectedId) : null;
    const enterable = selected?.at && selected?.extent
      && Math.max(selected.extent.w ?? 0, selected.extent.h ?? 0) < DIALS.world_scale_extent_m ? selected : null;
    const nearby = standing && world
      ? enterPrompt({ x: standing.x, y: standing.y }, world, { occupancy: occupancyMap(), handle: state.handle })
      : null;
    const offer = enterable
      ? { mark: enterable.id, terms: enterable.entry ?? null, far: true }
      : nearby ? { mark: nearby.mark, terms: nearby.terms, far: false } : null;
    const rows = [];
    if (offer) {
      const terms = offer.terms;
      // The word, shown BEFORE the press. It is a courtesy prediction, not the
      // adjudication — the crossing settles at the door (R10) — but a rail that
      // hides a standing `opposed` until you have pressed it is withholding the
      // one thing the mark has already said out loud.
      const word = terms?.word ?? "neutral";
      rows.push(`<button type="button" class="ctl wv-act-enter${word === "opposed" ? " is-opposed" : ""}" data-enter="${esc(offer.mark)}">`
        + `enter ${esc(nameOfMark(offer.mark))}<span class="wv-word">${esc(word)}</span></button>`
        + (offer.far ? `<div class="wv-act-terms">the walk to her threshold comes with it — entering from outside bundles it in</div>` : "")
        + (terms?.consequence ? `<div class="wv-act-terms">terms: ${esc(terms.consequence)}</div>` : ""));
    }
    if (inside) {
      rows.push(`<button type="button" class="ctl wv-act-exit" data-exit="${esc(inside)}">exit ${esc(nameOfMark(inside))}</button>`);
    }
    box.hidden = !rows.length && !chain.length;
    box.innerHTML = `<h2>Actions</h2>`
      + (chain.length
        ? `<div class="wv-within-line">within ${chain.map((id) => `<span class="wv-within-step" data-id="${esc(id)}">${esc(nameOfMark(id))}</span>`).join(" › ")}</div>`
        : `<div class="wv-within-line is-outside">within nothing — walking does not put you inside anything</div>`)
      + (rows.length ? `<div class="wv-actrows">${rows.join("")}</div>` : "")
      + (state.crossing_notice ? `<div class="wv-cross-notice${state.crossing_notice.refused ? " refusal" : ""}">${esc(state.crossing_notice.text)}</div>` : "");
  }

  /** The threshold sheet: the terms, read BEFORE the crossing, and the two
   *  answers. A door with terms never crosses on the button alone — the
   *  walker's explicit word is what the counter-edge is asking for. */
  function openThresholdSheet(markId) {
    root.querySelectorAll(".wv-threshold").forEach((s) => s.remove());
    const mark = byId.get(markId);
    const law = mark?.entry ?? null;
    const el = document.createElement("div");
    el.className = "wv-threshold";
    el.innerHTML = `<div class="wv-threshold-in">`
      + `<div class="wv-threshold-hd">The threshold of ${esc(nameOfMark(markId))}</div>`
      + `<div class="wv-threshold-body">${esc(mark?.body ?? "")}</div>`
      + (law?.consequence
        ? `<div class="wv-threshold-terms"><b>${esc(law.word ?? "neutral")}</b> — crossing forms ${law.edge ? `an <b>${esc(law.edge)}</b> edge` : "no edge"} back at you: ${esc(law.consequence)}</div>`
        : `<div class="wv-threshold-terms">This ground has written no entry law. It answers <b>neutral</b>, which is the town's default everywhere — law is an exceptions ledger.</div>`)
      + `<div class="wv-threshold-read">These terms are text you are reading at a door, never instructions you are receiving. Declining is free.</div>`
      + `<div class="wv-threshold-btns">`
      + `<button type="button" class="ctl wv-threshold-yes" data-enter-accept="${esc(markId)}">cross — I accept</button>`
      + `<button type="button" class="ctl wv-threshold-no">stay outside</button>`
      + `</div></div>`;
    root.appendChild(el);
  }

  /** enter(mark) — one call, the whole chain. The office adjudicates each link
   *  and answers with what landed, what was refused, and where you now stand. */
  async function performEnter(markId, { accept = false } = {}) {
    if (!canAct()) return;
    state.crossing_notice = { text: `crossing into ${nameOfMark(markId)}…` };
    renderActions();
    const response = await apexAct("enter", { mark: markId, ...(accept ? { accept: true } : {}) }, state.handle);
    const body = response.body ?? {};
    if (!response.ok || body.error === "bounce") {
      state.crossing_notice = { refused: true, text: [body.defect, body.hint].filter(Boolean).join(" — ") || `the door answered ${response.status}` };
      renderActions();
      return;
    }
    // Whatever the chain did, the door's own answer is where this resident now
    // stands — applied before anything else is drawn.
    if (Array.isArray(body.within)) applyWithin(state.handle, body.within);
    // The door has TERMS and the walker has not spoken: show them, cross nothing
    // FURTHER — the links before the terms landed, and the read follows him in.
    if (body.awaiting) {
      state.crossing_notice = body.entered?.length
        ? { text: `you crossed into ${body.entered.map(nameOfMark).join(" › ")}, and ${nameOfMark(body.awaiting.mark)} is asking for your word.` }
        : null;
      renderActions();
      renderTelling();
      openThresholdSheet(body.awaiting.mark);
      return;
    }
    if (body.refused) {
      // Refused at the threshold — and the picture matches the law: everything
      // before the failed link stands, and you are AT that door, not back ashore.
      // The door speaks in mark ids; the page owes the reader the name.
      const at = nameOfMark(body.refused.mark);
      const still = enteredMark();
      state.crossing_notice = { refused: true,
        text: `${at} opposed your crossing — you are left standing at its door${still ? `, still within ${nameOfMark(still)}` : ""}.`
            + (body.entered?.length ? ` (${body.entered.map(nameOfMark).join(" › ")} let you through first.)` : "") };
    } else if (body.entered?.length) {
      state.crossing_notice = { text: `you crossed into ${body.entered.map(nameOfMark).join(" › ")}.` };
    } else {
      state.crossing_notice = null;
    }
    // The occupants of the scope she just entered come from the same answer's
    // own manifest, so the cut draws complete in one frame; the poll behind it
    // is only the refresh for everyone else's crossings.
    if (body.scope?.within) state.occupants = { ...state.occupants, [body.scope.within]: body.scope.occupants ?? [] };
    pollOccupancy({ rerender: false }).catch(() => {});
    await pollWalkers().catch(() => {});
    syncActorPosition({ moveCamera: true });
    renderActions();
    renderTelling();
    drawWalkers();
    refreshCrossingPrompt(); // the offer that got you here is answered; the next one is a new question
    if (enteredMark()) mapCtx?.lockOn?.();
  }

  /** exit(mark) — the walker nullifying his own side. The view restores to the
   *  enclosing scope, and the derived edge is gone from the record's answer. */
  async function performExit(markId) {
    if (!canAct()) return;
    state.crossing_notice = { text: `stepping out of ${nameOfMark(markId)}…` };
    renderActions();
    const response = await apexAct("exit", { mark: markId }, state.handle);
    const body = response.body ?? {};
    if (!response.ok || body.error === "bounce") {
      state.crossing_notice = { refused: true, text: [body.defect, body.hint].filter(Boolean).join(" — ") || `the door answered ${response.status}` };
      renderActions();
      return;
    }
    state.crossing_notice = { text: body.into ? `you stepped out into ${nameOfMark(body.into)}.` : `you stepped out of ${nameOfMark(markId)}.` };
    if (Array.isArray(body.within)) applyWithin(state.handle, body.within);
    pollOccupancy({ rerender: false }).catch(() => {}); // the manifest, refreshed behind the answer
    renderActions();
    renderTelling();
    drawWalkers();
    refreshCrossingPrompt();
  }

  // ── the QoL prompts (R15, both directions) ────────────────────────────────
  //
  // Decoupled axes must not be a silent trap, so the boundary speaks: landing
  // inside a mark you are not within offers entry, and walking off the ground
  // of one you ARE within offers the step out. Offers — never decides.
  function refreshCrossingPrompt() {
    const standing = actorOrigin();
    if (!canAct() || !standing || !world) { state.crossing_prompt = null; return; }
    const at = { x: standing.x, y: standing.y };
    const occupancy = occupancyMap();
    const out = exitPrompt(at, world, { occupancy, handle: state.handle });
    const inn = out ? null : enterPrompt(at, world, { occupancy, handle: state.handle });
    state.crossing_prompt = out ? { kind: "exit", ...out } : inn ? { kind: "enter", ...inn } : null;
    renderCrossingPrompt();
  }
  function renderCrossingPrompt() {
    root.querySelectorAll(".wv-cross-prompt").forEach((el) => el.remove());
    const p = state.crossing_prompt;
    if (!p) return;
    const host = $(root, ".wv-walkdesk") ?? $(root, ".wv-actions");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "wv-cross-prompt";
    // the engine's `ask` names the mark by id, which is what a door speaks; the
    // page owes the reader the name they can see on the painting
    const ask = p.kind === "exit"
      ? `You have walked off ${nameOfMark(p.mark)}'s ground while still within it. Step out?`
      : `You are standing inside ${nameOfMark(p.mark)} but not within it. Enter?`;
    el.innerHTML = `<span class="wv-cross-ask">${esc(ask)}</span>`
      + `<button type="button" class="ctl wv-cross-yes" data-prompt="${p.kind}" data-mark="${esc(p.mark)}">yes</button>`
      + `<button type="button" class="ctl wv-cross-no">no</button>`;
    host.appendChild(el);
  }

  // ── THE CUT: the entered mark's own sector ────────────────────────────────
  //
  // The centerpiece. On entry the read stops being "what can be seen from a
  // point" and becomes "what is inside this place" — the mark's containment
  // subtree, its own words, and everyone else who crossed the same threshold.
  // The manifest IS children (R14), so the occupants cost nothing to render:
  // they are children of the mark, in the same taxonomy as its cabins.
  function renderEnteredTelling(box, markId) {
    const scope = enteredScope(markId, world, { occupancy: occupancyMap(), handle: state.handle, budget: state.dials.context_budget });
    if (scope.error) { box.innerHTML = `<div class="wv-err">${esc(scope.error)}</div>`; return false; }
    const mark = byId.get(markId) ?? scope.mark;
    const chain = withinChainOf();
    const occupants = scope.occupants.filter((h) => h !== state.handle);
    const kids = scope.children.filter((c) => c.kind !== "entity");
    box.innerHTML =
      `<div class="wv-scope-bar">`
      + `<span class="wv-scope-in">You are in: <b>${esc(nameOfMark(markId))}</b></span>`
      + `<button type="button" class="ctl wv-scope-exit" data-exit="${esc(markId)}">exit</button>`
      + `</div>`
      + (chain.length > 1
        ? `<div class="wv-scope-chain">${chain.map((id) => `<span class="wv-within-step${id === markId ? " is-here" : ""}" data-id="${esc(id)}">${esc(nameOfMark(id))}</span>`).join(" › ")}</div>`
        : "")
      + `<div class="wv-section-lbl">what this place says</div>`
      + `<div class="wv-scope-read">${esc(scope.read ?? "")}</div>`
      + (scope.terms?.consequence
        ? `<div class="wv-scope-terms">you are here on its terms — <b>${esc(scope.terms.word)}</b>${scope.terms.edge ? `, an <b>${esc(scope.terms.edge)}</b> edge` : ""}: ${esc(scope.terms.consequence)}</div>`
        : "")
      + `<div class="wv-section-lbl">who is here</div>`
      + `<div class="wv-occupants">`
      + `<span class="wv-occupant is-you">${esc(state.handle)} <i>(you)</i></span>`
      + (occupants.length
        ? occupants.map((h) => `<span class="wv-occupant" data-walker="${esc(h)}">${esc(h)}</span>`).join("")
        : `<span class="wv-occupant is-none">nobody else has crossed this threshold</span>`)
      + `</div>`
      + `<div class="wv-section-lbl">what is inside</div>`
      + (kids.length
        ? `<div class="wv-cards">${kids.map((c) => markCell(byId.get(c.id) ?? c, { role: "fov" })).join("")}</div>`
        : `<div class="wv-scope-empty">nothing else stands in here.</div>`)
      + `<div class="wv-tallies">${esc(`${kids.length} inside · ${scope.occupants.length} here${scope.more.children ? ` · ${scope.more.children} more the budget holds back` : ""}`)}</div>`
      + (scope.enclosing ? `<div class="wv-scope-out">stepping out puts you back in ${esc(nameOfMark(scope.enclosing.id))}.</div>` : "");
    foldRenderedPredicates(box);
    mountMarkImages(box);
    syncMarkInteractionViews();
    return true;
  }

  // Where the sheet hangs: the mark's own cell, preferring the pinned bubble when
  // one is up — selecting rebuilds that bubble, so the chip the click began on is
  // already gone by the time we get here, and the Telling's copy of the cell may
  // be behind a collapsed panel where the sheet would open invisibly.
  function stakeHostFor(markId) {
    if (!markId) return null;
    const pinned = $(root, `.wv-bubble.is-pinned .wv-card[data-id="${CSS.escape(markId)}"]`);
    if (pinned) return pinned;
    if (state.paintingOnly) return null;
    return [...root.querySelectorAll(".wv-telling .wv-card[data-id]")]
      .find((card) => card.dataset.id === markId) ?? null;
  }
  function openStakeSheet(card, { mode = "stake", max = "", markId = null } = {}) {
    if (!card) return;
    root.querySelectorAll(".wv-act-sheet").forEach((sheet) => sheet.remove());
    const sheet = document.createElement("div");
    sheet.className = "wv-act-sheet";
    sheet.dataset.mode = mode;
    sheet.dataset.mark = markId || card.dataset.id;
    if (max !== "") sheet.dataset.max = String(max);
    const balance = Number.isInteger(state.actorBalance) ? state.actorBalance : null;
    // No gate here: the sheet itself renders read-only for non-actors, and a local
    // `const canAct` once shadowed the outer canAct() into a TDZ crash on every
    // click (2026-07-31) — the shadowing name is banned from this scope.
    const resolved = identityResolved();
    if (mode === "stake" && balance !== null) sheet.dataset.balance = String(balance);
    // NAME THE MARK (Keemin, 2026-08-04). "Back this mark" is only unambiguous
    // when there is one mark on screen; these sheets open from relation lines and
    // attribute rows too, where "this" was anybody's guess.
    const subject = markIdentity({ id: sheet.dataset.mark });
    const verb = mode === "unstake" ? "take stamps back" : resolved ? "back this mark" : "backing";
    sheet.innerHTML = `<div class="wv-act-head"><b>${esc(subject)}</b><span class="wv-act-verb">${verb}</span>`
      + `<button type="button" class="wv-act-close" aria-label="Close">×</button></div>`
      + `<div class="wv-backers"><span>reading who backs this mark…</span></div>`
      + (mode === "stake" && resolved
        ? `<p class="wv-act-note">you hold <b class="wv-stamp-holding">✦ ${balance ?? (state.actorBalance === null ? "…" : "unavailable")}</b></p>`
        : "")
      + (resolved
        ? `<div class="wv-act-row"><label>stamps <input class="wv-act-amount" type="number" min="1" step="1"${max !== "" ? ` max="${Number(max)}"` : balance !== null ? ` max="${balance}"` : ""}></label>`
          + `<button type="button" class="wv-act-preview-btn">preview the sealed line</button></div>`
          + `<div class="wv-act-preview" hidden><pre></pre><p class="wv-act-note">The office fills the signature. Escrow moves now; <b class="wv-stamp-holding">✦</b> weight updates at the next Settlement.</p>`
          + `<div class="wv-act-row"><button type="button" class="wv-act-confirm" disabled>confirm and send</button></div></div>`
          + `<p class="wv-act-answer" hidden></p>`
        : `<p class="wv-act-note">sign in as a resident to back this mark.</p>`);
    card.appendChild(sheet);
    loadStakeBackers(sheet);
    $(sheet, ".wv-act-amount")?.focus();
  }

  async function loadStakeBackers(sheet) {
    const host = $(sheet, ".wv-backers");
    if (!host) return;
    try {
      const response = await fetch(officeUrl(`/world/stake?mark=${encodeURIComponent(sheet.dataset.mark)}`), {
        headers: { accept: "application/json" },
        credentials: "omit",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.error === "bounce") throw new Error(body?.defect || `the door answered ${response.status}`);
      if (!sheet.isConnected) return;
      // The settled figures come from the fold record — the same object the chip
      // that opened this sheet reads — so the two cannot disagree. The door
      // supplies who backed it and how much is staked right now.
      const full = byId.get(sheet.dataset.mark) ?? null;
      host.innerHTML = stakeBackersHTML({
        weight: effectiveWeight(full),
        weightParts: full?.weight_parts ?? null,
        holders: body.holders,
        liveEscrow: body.escrow ?? body.stamps ?? null,
      });
    } catch (error) {
      if (sheet.isConnected) host.textContent = `backer list unavailable — ${error.message}`;
    }
  }

  function previewStakeSheet(sheet) {
    const amountEl = $(sheet, ".wv-act-amount");
    const amount = Number(amountEl.value);
    const max = Number(sheet.dataset.max || 0);
    const stakeLimit = sheet.dataset.mode === "stake"
      ? clampStakeAmount(amount, state.actorBalance)
      : null;
    const line = previewStakeLedgerLine({
      mode: sheet.dataset.mode,
      handle: state.handle,
      mark: sheet.dataset.mark,
      stamps: amount,
    });
    const answer = $(sheet, ".wv-act-answer");
    if (sheet.dataset.mode === "stake" && stakeLimit?.balance === null) {
      answer.hidden = false;
      answer.className = "wv-act-answer refusal";
      answer.textContent = `The stamp balance for ${state.handle} is not available yet.`;
      return;
    }
    if (stakeLimit?.exceeded) {
      amountEl.value = stakeLimit.amount > 0 ? String(stakeLimit.amount) : "";
      answer.hidden = false;
      answer.className = "wv-act-answer refusal";
      answer.textContent = `${state.handle} holds ✦ ${stakeLimit.balance}; the amount was clamped from ${stakeLimit.requested} to ${stakeLimit.balance}. Preview the balance-sized act again.`;
      return;
    }
    if (!line || (max > 0 && amount > max)) {
      answer.hidden = false;
      answer.className = "wv-act-answer refusal";
      answer.textContent = max > 0 && amount > max
        ? `${state.handle} has ${max} stamps to take back from this mark.`
        : "Enter a positive whole number of stamps.";
      return;
    }
    $(sheet, ".wv-act-preview pre").textContent = line;
    $(sheet, ".wv-act-preview").hidden = false;
    $(sheet, ".wv-act-confirm").disabled = false;
    answer.hidden = true;
  }

  async function confirmStakeSheet(sheet) {
    const mode = sheet.dataset.mode;
    const confirm = $(sheet, ".wv-act-confirm");
    const answer = $(sheet, ".wv-act-answer");
    const payload = {
      mark: sheet.dataset.mark,
      stamps: Number($(sheet, ".wv-act-amount").value),
      handle: state.handle,
    };
    confirm.disabled = true;
    answer.hidden = false;
    answer.className = "wv-act-answer";
    answer.textContent = "The office is sealing the line…";
    try {
      const response = await apexAct(mode === "unstake" ? "unstake" : "stake", { mark: payload.mark, stamps: payload.stamps }, payload.handle);
      const rendered = worldStakeAnswer(response.body, mode);
      answer.classList.add(rendered.kind);
      answer.textContent = rendered.text;
      if (response.ok && rendered.kind === "success") {
        await Promise.all([loadIdentityWorld(), loadActorBalance()]);
        applyWorldLayer();
        reRender(rendered.text);
      } else {
        confirm.disabled = false;
      }
    } catch (error) {
      answer.classList.add("refusal");
      answer.textContent = `The stake door could not be reached — ${error.message}`;
      confirm.disabled = false;
    }
  }

  // ───────── painting-only: the bubbles ─────────
  // With the cell panel folded away the painting has to carry the reading, so it
  // grows three bubbles and no fourth vocabulary:
  //
  //   • HOVER — a glance that follows the pointer and can never be clicked.
  //   • PINNED — the selected mark. It is the panel's OWN cell, built by the same
  //     markCell and folded by the same foldRenderedPredicates, so backing,
  //     taking back, investigating and drilling all work without a line of new
  //     handler code. A second bubble-shaped cell builder is precisely how the
  //     two readings would drift apart.
  //   • YOU — your standpoint, hosting the walk desk ITSELF, relocated rather
  //     than copied. renderWalkDestination keeps its one owner and one desk; the
  //     desk just lives somewhere else while this mode is on.
  // every hover goes through here, so the bubbles always know whether the pointer
  // is on the painting or inside a bubble reading it
  function hoverMark(id, fromBubble = false) {
    hoverFromBubble = !!id && fromBubble;
    markInteraction.hover(id);
  }
  const bubbleHost = () => $(root, ".wv-bubbles");
  const bubbleEls = { hover: null, pinned: null };
  let bubbleResize = null;
  let pinnedBuiltId = null;   // which mark the pinned bubble currently holds
  let hoverFromBubble = false; // the pointer is reading a bubble, not the painting
  let bubbleTrail = [];       // how you got to the mark the bubble is showing

  // follow a relation or an attribute from inside the bubble: the bubble moves to
  // that mark and remembers the one it left
  function followInBubble(id) {
    return selectMark(id, { trail: bubbleTrailStep(bubbleTrail, "follow", id) });
  }
  function bubbleBack() {
    if (bubbleTrail.length < 2) return;
    const stepped = bubbleTrailStep(bubbleTrail, "back");
    selectMark(stepped[stepped.length - 1], { trail: stepped });
  }
  const localStore = (() => { try { return window.localStorage; } catch { return null; } })();
  // WHO THE TOUR IS REMEMBERED AGAINST: the credential household, falling back to
  // the handles it vouches for. A spectator resolves to nothing, and nothing is
  // never REMEMBERED — so since 2026-08-12 they are greeted every visit rather
  // than never, and the ? stays their door back in either way.
  const tourWho = () => state.whoami?.household
    || ((state.whoami?.handles ?? []).length ? [...state.whoami.handles].sort().join(",") : "");

  function bubbleEl(kind) {
    if (bubbleEls[kind]?.isConnected) return bubbleEls[kind];
    const host = bubbleHost();
    if (!host) return null;
    const el = document.createElement("div");
    el.className = `wv-bubble is-${kind}`;
    el.hidden = true;
    host.appendChild(el);
    bubbleEls[kind] = el;
    // ONE observer for every bubble. A stake sheet opening, an expansion
    // unfolding, the walk desk gaining a refusal line — each changes the box's
    // height, and a bubble that grows without re-placing itself is a bubble
    // hanging off the bottom of the painting. Height is not something the
    // callers know, so it is not something the callers should have to report.
    if (!bubbleResize && typeof ResizeObserver === "function")
      bubbleResize = new ResizeObserver(() => positionBubbles());
    bubbleResize?.observe(el);
    return el;
  }

  // world metres → pixels inside the bubble layer's own box
  function paintingPointToBox(point) {
    const host = bubbleHost();
    const matrix = mapCtx?.svg?.getScreenCTM?.();
    const box = host?.getBoundingClientRect();
    if (!matrix || !box?.width) return null;
    const p = mapCtx.svg.createSVGPoint();
    p.x = mapCtx.originPx.x + Number(point?.x) / mapCtx.mPerPx;
    p.y = mapCtx.originPx.y + Number(point?.y) / mapCtx.mPerPx;
    if (![p.x, p.y].every(Number.isFinite)) return null;
    const screen = p.matrixTransform(matrix);
    return { x: screen.x - box.x, y: screen.y - box.y, box: { w: box.width, h: box.height } };
  }
  // an element's centre, in the bubble layer's own pixels
  function elementBoxPoint(el) {
    const host = bubbleHost();
    if (!el || !host) return null;
    const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();
    if (!b.width) return null;
    return { x: r.x + r.width / 2 - b.x, y: r.y + r.height / 2 - b.y, box: { w: b.width, h: b.height } };
  }
  // WHERE A BUBBLE HANGS, resolved to box pixels rather than to a world
  // coordinate — because some marks have no coordinate and never will.
  //
  // A mark with ground hangs off its ground. A mark WITHOUT ground hangs off the
  // frame's glyph, because the frame is where the placeless live: the world-root
  // itself, and every ambient law beneath it — the fall of the land, the fog, the
  // record, the walking pace, the wear. Those are the root's children in the
  // record, and following one used to drop its bubble at the centre of whatever
  // the view happened to be showing — a place, just not one that meant anything.
  // (That fallback, viewCentreWorld, was this function's only caller and is gone.)
  //
  // The root is no longer a special case here; it is the first instance of the
  // general one. nearestEmbodiedAncestor already returns null for it.
  function anchorBoxFor(id) {
    if (!id) return null;
    const world = markAnchorPoint(id);
    if (world) return paintingPointToBox(world);
    return elementBoxPoint($(root, ".wv-root-mark"));
  }
  function placeBubbleAt(el, at, avoid = null) {
    if (!el || el.hidden) return;
    if (!at) { el.hidden = true; return; }
    const spot = placeBubble({ anchor: at, size: { w: el.offsetWidth, h: el.offsetHeight }, box: at.box, avoid });
    if (!spot) return;
    el.style.transform = `translate3d(${Math.round(spot.x)}px, ${Math.round(spot.y)}px, 0)`;
    el.classList.toggle("side-over", spot.side === "over");
  }
  function bubbleRect(el) {
    const host = bubbleHost();
    if (!el || el.hidden || !host) return null;
    const r = el.getBoundingClientRect(), b = host.getBoundingClientRect();
    return { x: r.x - b.x, y: r.y - b.y, w: r.width, h: r.height };
  }
  // A predicate has no ground of its own, so it hangs off the nearest thing that
  // does; a mark with no embodied ancestor at all (the root, an ambient law) has
  // no place on the painting and takes the middle of the view rather than
  // vanishing — losing the bubble would lose the only way to read it in this mode.
  // Open the stack. Ordered innermost-first here, once, so the list the reader
  // sees and the list the rows are built from are the same order.
  function openChooser(ids) {
    selectMark(chooserId(orderInnermostFirst(ids, byId)));
  }

  // One row per contested mark, in the page's own cell vocabulary — the same
  // kind/name/tier words markCellTitle renders everywhere else, so a row reads
  // as the thing it will open. Names are resident-authored, so they go through
  // esc as text and the row carries the id in a data attribute, never in prose.
  function chooserHTML(id) {
    const ids = chooserIdsFrom(id) ?? [];
    const rows = ids.map((markId) => {
      const full = byId.get(markId);
      if (!full) return "";
      const identity = markName(full), where = radialWhere(full);
      return `<button type="button" class="wv-choose-row ${markClasses(full)}" data-choose="${esc(markId)}">`
        + markCellTitle({ name: identity.name, determined: identity.determined,
                          bearing: where.bearing, tier: tierOf(full), draft: isDraft(full) })
        + `</button>`;
    }).filter(Boolean).join("");
    if (!rows) return "";
    return `<div class="wv-chooser">`
      + `<p class="wv-choose-lead">${ids.length} marks are stacked here — which one?</p>`
      + rows
      + `</div>`;
  }

  function markAnchorPoint(id) {
    // the stack hangs off the innermost of the marks it is offering
    const choosing = chooserIdsFrom(id);
    if (choosing) return nearestEmbodiedAncestor(byId.get(choosing[0]), byId)?.at ?? null;
    const handle = walkerHandleFromHoverId(id);
    if (handle) {
      const w = (walkState.walkers ?? []).find((entry) => entry?.handle === handle);
      return w && [w.x, w.y].every(Number.isFinite) ? { x: Number(w.x), y: Number(w.y) } : null;
    }
    return nearestEmbodiedAncestor(byId.get(id), byId)?.at ?? null;
  }
  // THE MINI CARD — who this face belongs to. Their picture, what they are
  // called, their handle, the house they keep, and where they are right now.
  //
  // `pressable` is not a style choice, it is this layer's own law (see the note
  // over markPreviewHTML): the HOVER layer takes no pointer events, so a link
  // drawn there is a button you cannot press — worse than no button. The glance
  // therefore carries no link and the PINNED card does, which is also what makes
  // this reachable on a touch screen, where hover never happens at all.
  //
  // Everything user-supplied here is either escaped as text or whitelisted as a
  // URL: the name and household are prose (esc handles them), and the avatar and
  // the href are the two things escaping could never have made safe, so neither
  // is escaped — safeAvatarUrl and residentHref REFUSE rather than clean, and a
  // refusal renders the monogram or drops the link.
  function walkerBubbleHTML(handle, { pressable = false } = {}) {
    const w = (walkState.walkers ?? []).find((entry) => entry?.handle === handle);
    if (!w) return "";
    const moving = w.moving ?? (!w.arrived && !w.standing);
    const where = moving
      ? `${Number(w.remaining_m ?? 0).toLocaleString()} m to go, ETA ${formatEtaCrossings(w.eta_crossings)}`
      : (w.mark_id ? `at ${w.mark_id}` : "at rest");
    const face = faceOf(w.handle);
    const href = residentHref(w.handle);
    const portrait = face.avatar
      ? `<img class="wv-face-img" src="${esc(face.avatar)}" alt="" loading="lazy">`
      : `<span class="wv-face-mono" style="background:${esc(face.color)}">${esc(face.monogram)}</span>`;
    return `<div class="wv-bubble-walker${moving ? " moving" : ""}">`
      + `<div class="wv-face-row">`
      +   `<span class="wv-face">${portrait}</span>`
      +   `<span class="wv-face-who">`
      +     `<span class="wv-standing">${esc(face.name)}</span>`
      // a resident the meta map has never heard of has their handle AS their
      // name, and printing it twice reads as a rendering fault rather than a
      // person
      +     (face.name === w.handle ? "" : `<span class="wv-face-handle">${esc(w.handle)}</span>`)
      +     (face.household ? `<span class="wv-face-house">${esc(face.household)}</span>` : "")
      +   `</span>`
      + `</div>`
      + `<p>${esc(where)}</p>`
      + (pressable && href ? `<p class="wv-face-go"><a href="${href}">their page →</a></p>` : "")
      + `</div>`;
  }
  // The glance. Deliberately NOT a live cell: it carries no data-id and no
  // pressable action, because the layer it sits in takes no pointer events and a
  // button you cannot press is worse than no button. Backing reads as the chip
  // it is everywhere else; pressing it is what the pinned bubble is for.
  function markPreviewHTML(id) {
    const full = byId.get(id);
    if (!full) return "";
    const tier = tierOf(full), identity = markName(full), where = radialWhere(full);
    const draft = isDraft(full);
    const backing = effectiveWeight(full);
    return `<article class="wv-card fov ${markClasses(full)}">`
      + markCellTitle({ name: identity.name, determined: identity.determined, bearing: where.bearing, tier, draft })
      + `<div class="cbody">${esc(full.body ?? full.id)}</div>`
      + markCellBylineRow(full, `<span class="wv-cell-actions"><span class="wv-chip stamps">✦ ${backing.toLocaleString()}</span></span>`)
      + (where.detail ? `<div class="cmeta"><div class="wv-details" style="display:flex">${extentTag(full)}<span class="wv-detail-where">${esc(where.detail)}</span></div></div>` : "")
      + `</article><p class="wv-bubble-hint">click to open</p>`;
  }
  function renderHoverBubble(id) {
    const el = bubbleEl("hover");
    if (!el) return;
    const handle = id && walkerHandleFromHoverId(id);
    const html = !id ? "" : (handle ? walkerBubbleHTML(handle) : markPreviewHTML(id));
    if (!html) { el.hidden = true; return; }
    el.className = `wv-bubble is-hover${handle ? "" : ` ${markClasses(byId.get(id))}`}`;
    el.innerHTML = html;
    el.hidden = false;
  }
  // BUILT ONCE PER SELECTION, and that is the whole point. Pointing at anything
  // inside this bubble raises a hover, a hover re-renders the bubbles, and a
  // rebuild here would replace the button under the cursor with a fresh copy —
  // so an open backing sheet, a half-typed amount, a scroll position and the
  // click you were making all died the moment the pointer arrived. A rebuild is
  // owed to a change of MARK or a change of RECORD, and to nothing else.
  function renderPinnedBubble(id) {
    const el = bubbleEl("pinned");
    if (!el) return;
    // A WALKER CAN BE PINNED NOW. It could not before, and that was fine while
    // the glance was two lines of text — but the mini card carries a link, and a
    // link only works in this layer (the hover layer takes no pointer events).
    // It is also the only way onto a resident's page from the map on a touch
    // screen, where hover never happens: pinning is what hovering is for fingers.
    const choosing = id && chooserIdsFrom(id);
    if (choosing) {
      const html = chooserHTML(id);
      if (!html) { el.hidden = true; el.innerHTML = ""; pinnedBuiltId = null; return; }
      if (pinnedBuiltId === id && el.firstChild) { el.hidden = false; return; }
      pinnedBuiltId = id;
      el.className = "wv-bubble is-pinned is-chooser";
      el.innerHTML = html;
      el.hidden = false;
      return;
    }
    const walkerHandle = id && walkerHandleFromHoverId(id);
    if (walkerHandle) {
      const html = walkerBubbleHTML(walkerHandle, { pressable: true });
      if (!html) { el.hidden = true; el.innerHTML = ""; pinnedBuiltId = null; return; }
      if (pinnedBuiltId === id && el.firstChild) { el.hidden = false; return; }
      pinnedBuiltId = id;
      el.className = "wv-bubble is-pinned is-walker";
      el.innerHTML = html;
      el.hidden = false;
      return;
    }
    const mark = id && !walkerHandleFromHoverId(id) ? byId.get(id) : null;
    if (!mark) { el.hidden = true; el.innerHTML = ""; pinnedBuiltId = null; return; }
    if (pinnedBuiltId === mark.id && el.firstChild) { el.hidden = false; return; }
    pinnedBuiltId = mark.id;
    // the cell, plus this mark's own predicates as cells, then the SAME fold the
    // telling runs — so an attribute reads identically in both places
    const predicates = (world?.marks ?? []).filter((p) => p.parent === mark.id && isPredicateAttribute(p));
    // the way back, NAMED — "◂ back" makes you remember what you left, and the
    // one thing a bubble on a map should never ask you to do is hold the route
    // in your head
    const cameFrom = bubbleTrail.length > 1 ? byId.get(bubbleTrail[bubbleTrail.length - 2]) : null;
    const back = cameFrom
      ? `<button type="button" class="wv-bubble-back ${markClasses(cameFrom)}" title="back to ${esc(markIdentity(cameFrom))}">◂ ${esc(markIdentity(cameFrom))}</button>`
      : "";
    el.className = `wv-bubble is-pinned ${markClasses(mark)}`;
    el.innerHTML = `<div class="wv-bubble-nav">${back}`
      + `<button type="button" class="wv-bubble-close" aria-label="close this mark">✕</button></div>`
      + markCell(mark, { role: "fov" })
      + predicates.map((p) => markCell(p, { role: "fov" })).join("");
    el.hidden = false;
    foldRenderedPredicates(el);
    mountMarkImages(el);
    const card = $(el, `.wv-card[data-id="${CSS.escape(mark.id)}"]`);
    if (card) { card._stack = [mark.id]; renderExpansion(card); }
  }
  // NOT re-entrant, and the guard is load-bearing rather than defensive: building
  // the pinned bubble runs renderExpansion, whose last act is to sync the
  // interaction classes over the tree it just built — and that sync is what calls
  // this. Without the latch, selecting a mark rebuilt the bubble that was
  // rebuilding it until the renderer died. The inner sync still does its own job
  // (the class toggles); it is only the bubble rebuild that must not nest.
  let renderingBubbles = false;
  function renderBubbles() {
    if (renderingBubbles) return;
    if (!state.paintingOnly) {
      for (const el of Object.values(bubbleEls)) if (el) el.hidden = true;
      return;
    }
    renderingBubbles = true;
    try {
      const { hoveredId, selectedId } = markInteraction.getState();
      renderPinnedBubble(selectedId);
      // the glance stands down for the mark it is already showing in full, and
      // for a pointer that is reading a bubble rather than pointing at the
      // painting — running a finger down a relations list should light each one
      // on the map, not pop a second bubble over the list you are reading
      // …and the same reasoning while the CHOOSER is open: it is asking a
      // question about the pile under the cursor, so a preview of one of its
      // own rows would sit under it saying "click to open" — which is now the
      // wrong instruction, since a click there reopens the stack.
      const glance = hoveredId && hoveredId !== selectedId && !hoverFromBubble && !chooserIdsFrom(selectedId)
        ? hoveredId : null;
      renderHoverBubble(glance);
    } finally {
      renderingBubbles = false;
    }
    positionBubbles();
  }
  // Placed in order of who yields to whom: the pinned bubble is the thing you
  // asked for and sits where it likes; the glance steps around it; the you-bubble
  // is always present and yields to both, since it is the one you did not ask for.
  function positionBubbles() {
    if (!state.paintingOnly) return;
    const { hoveredId, selectedId } = markInteraction.getState();
    // the walk desk holds its corner — it is a thing you are part way through, so
    // the bubbles step around it rather than the other way about
    const desk = bubbleRect($(root, ".wv-walkdesk"));
    placeBubbleAt(bubbleEls.pinned, anchorBoxFor(selectedId), desk);
    const pinned = bubbleRect(bubbleEls.pinned);
    placeBubbleAt(bubbleEls.hover, anchorBoxFor(hoveredId), [pinned, desk]);
  }
  // ───────── the tour ─────────
  // Opened by the ? on the painting, never on arrival: a page that seizes the
  // screen before you have looked at it teaches nothing (Postmark ships quiet).
  // The ring on the ? is the whole of the invitation.
  let tourAt = -1; // -1 is closed
  const tourEl = () => $(root, ".wv-tour");
  // an anchor must be RENDERED, not merely present — every rail selector here is
  // display:none on a phone, and a slide about a control you cannot see should
  // read as prose in the middle of the screen rather than point at nothing
  function tourAnchor(slide) {
    if (!slide?.anchor) return null;
    const el = $(root, slide.anchor);
    return el && el.getClientRects().length ? el : null;
  }
  function openTour(at = 0) {
    tourAt = at;
    writeTourSeen(localStore, tourWho());
    $(root, ".wv-tour-open")?.classList.remove("is-unseen");
    renderTour();
  }
  // THE GREETING IS FOR A RESIDENT, ONCE (Keemin, 2026-08-05) — overruled
  // 2026-08-12: the door opened to strangers, so a spectator is greeted EVERY
  // visit and a resident still only once. Fired when identity resolves rather
  // than at boot, because until the office answers we do not know whose visit
  // this is; resolveIdentity runs for a spectator too, so this reaches them.
  //
  // One greeting per page LOAD, not per call: readTourSeen cannot remember a
  // spectator's dismissal (there is no key to write), so without this flag a
  // second call in the same load would reopen a tour they just closed.
  //
  // The flag lives at MODULE scope (2026-08-14), not in this closure, because a
  // page may mount the viewer more than once in a single load — /replay/ used to
  // re-mount per crossing — and a mount-scoped flag makes every remount a fresh
  // "load", so the tour ambushed a spectator again on every scrub step. A load is
  // a document, not a mount. This does NOT touch the 08-12 ruling above: a real
  // second visit is a new document and gets its greeting.
  function greetOnFirstVisit() {
    if (greetedThisLoad || tourAt >= 0) return;
    if (readTourSeen(localStore, tourWho())) return;
    greetedThisLoad = true;
    openTour(0);
  }
  function closeTour() {
    tourAt = -1;
    clearStage();
    const el = tourEl();
    if (el) el.hidden = true;
    $(root, ".wv-tour-open")?.focus?.();
  }
  function stepTour(action) {
    const next = tourStep(tourAt, action, TOUR_SLIDES.length);
    if (next < 0) { closeTour(); return; }
    tourAt = next;
    renderTour();
  }
  // A SLIDE MAY STAGE THE PAGE, and every stage hands back its own undo. The
  // rule that keeps this honest: staging never writes anything a reader would
  // find later — not the remembered panel mode, not walkState, not the record.
  // Everything it touches is put back on the way to the next slide, on skip, and
  // on close, so a tour cannot leave a mark on the page it was describing.
  let tourStage = null, tourUnstage = null, tourStageRect = null;
  function clearStage() {
    const undo = tourUnstage;
    tourStage = null; tourUnstage = null; tourStageRect = null;
    try { undo?.(); } catch { /* a stage that cannot be undone must not trap the reader */ }
  }
  function applyStage(slide) {
    const want = slide?.stage ?? null;
    if (want === tourStage) return;
    clearStage();
    if (!want) return;
    tourStage = want;
    tourUnstage = want === "telling" ? stageTelling()
      : want === "walk" ? stageWalk()
        : want === "kinds" ? stageKinds()
          : null;
  }
  // OPEN THE TELLING FOR THE SLIDE THAT IS ABOUT IT (Keemin, 2026-08-05) — and
  // only for that slide. state.paintingOnly moves; writePaintingOnly does not, so
  // the reader's own choice is untouched.
  function stageTelling() {
    const was = state.paintingOnly;
    if (!was) return null;
    state.paintingOnly = false;
    applyPaintingOnly();
    return () => { state.paintingOnly = was; applyPaintingOnly(); };
  }
  // A REAL LEG, MEASURED FROM THE RECORD — Rei's house to Wright's. Written
  // straight into the desk's markup rather than through walkState, so there is no
  // way for a demonstration to become an armed destination; the scrim is over it
  // anyway, so nothing here is pressable.
  function stageWalk() {
    const desk = $(root, ".wv-walkdesk");
    const from = byId.get(TOUR_WALK_LEG.from), to = byId.get(TOUR_WALK_LEG.to);
    if (!desk || !from?.at || !to?.at) return null;
    const wasHidden = desk.hidden, wasHTML = desk.innerHTML;
    const leg = previewWalkLeg({ from: from.at, toward: to.at, targetExtent: to.extent ?? null });
    const parts = walkLegParts(leg);
    const bearing = quantizeBearing(bearingDeg(to.at.x - from.at.x, to.at.y - from.at.y), state.dials.bearing_points);
    const arrow = bearing ? `<span class="wv-walk-dir" title="${esc(BEARING_LONG[bearing] ?? bearing)}">${bearingArrow(bearing)}</span>` : "";
    desk.innerHTML = `<h2>Walk</h2>`
      + `<div class="wv-walk-planner">`
      + `<div class="wv-walk-row"><span class="wv-walk-key">Who</span><span class="wv-walk-val"><b>${esc(from.household ?? from.by ?? "")}</b></span></div>`
      + `<div class="wv-walk-row"><span class="wv-walk-key">From</span><span class="wv-walk-val"><b>${esc(markIdentity(from))}</b></span></div>`
      + `<div class="wv-walk-row"><span class="wv-walk-key">To</span><span class="wv-walk-val"><b>${esc(markIdentity(to))}</b>`
      + (parts ? `<div class="wv-walk-legline"><span class="wv-walk-meta">${esc(parts.distance)}</span>${arrow}`
        + `<span class="wv-walk-meta">${esc(parts.eta)}</span></div>` : arrow)
      + `</span></div>`
      + `<div class="wv-walk-acts"><button type="button" class="wv-walk-confirm" tabindex="-1">confirm</button>`
      + `<button type="button" class="wv-walk-cancel" tabindex="-1">cancel</button></div></div>`;
    desk.hidden = false;
    return () => { desk.innerHTML = wasHTML; desk.hidden = wasHidden; };
  }
  // THREE MARKS, ONE OF EACH KIND, lit in their own colours and framed together.
  // The highlight layer is the viewer's own — same boxes hover and selection
  // draw — so the colours in the slide and the colours on the painting cannot
  // disagree.
  function stageKinds() {
    const ids = TOUR_KIND_MARKS.filter((id) => byId.has(id));
    if (!ids.length || !mapCtx?.hlLayer) return null;
    const wasHTML = mapCtx.hlLayer.innerHTML;
    const points = ids.map((id) => byId.get(id)).filter((m) => m?.at);
    const xs = points.map((m) => m.at.x), ys = points.map((m) => m.at.y);
    // TWO BOXES, NOT ONE. The hole is the three marks with a little air; the view
    // is the same cluster with a great deal more, so the hole is a region of the
    // painting rather than the whole pane — which is what it became when the
    // camera framed exactly the rectangle the spotlight then cut out.
    const box = (pad) => ({
      minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad,
      minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad,
    });
    const hole = box(240);
    const framed = box(1400);
    const { minX, maxX, minY, maxY } = hole;
    const px = (x, y) => ({ x: mapCtx.originPx.x + x / mapCtx.mPerPx, y: mapCtx.originPx.y + y / mapCtx.mPerPx });
    const a = px(framed.minX, framed.minY), b = px(framed.maxX, framed.maxY);
    const aspect = mapCtx.view.h / mapCtx.view.w;
    const w = Math.max(b.x - a.x, (b.y - a.y) / aspect);
    const wasView = mapCtx.setView?.({ x: (a.x + b.x) / 2 - w / 2, y: (a.y + b.y) / 2 - w * aspect / 2, w, h: w * aspect });
    mapCtx.hlLayer.innerHTML = ids.map(renderOneMarkHighlight).join("");
    // the hole is the cluster, so the reader can actually see the three of them
    tourStageRect = () => {
      const host = bubbleHost()?.getBoundingClientRect();
      const p1 = paintingPointToBox({ x: minX, y: minY }), p2 = paintingPointToBox({ x: maxX, y: maxY });
      if (!host || !p1 || !p2) return null;
      return { x: host.x + Math.min(p1.x, p2.x), y: host.y + Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) };
    };
    return () => {
      mapCtx.hlLayer.innerHTML = wasHTML;
      if (wasView) mapCtx.setView?.(wasView);
      renderMarkHighlight();
    };
  }

  function renderTour() {
    const el = tourEl();
    const slide = TOUR_SLIDES[tourAt];
    if (!el || !slide) { closeTour(); return; }
    applyStage(slide);
    el.hidden = false;
    // authored copy, not record text: TOUR_SLIDES is this module's own constant
    // and carries the only markup allowed through here
    $(el, ".wv-tour-title").textContent = slide.title;
    $(el, ".wv-tour-body").innerHTML = slide.body;
    $(el, ".wv-tour-kicker").textContent = `The World · ${tourProgress(tourAt, TOUR_SLIDES.length)}`;
    $(el, ".wv-tour-dots").innerHTML = TOUR_SLIDES.map((entry, i) =>
      `<button type="button" class="wv-tour-dot${i === tourAt ? " on" : ""}" data-tour-to="${i}"`
      + ` aria-label="${esc(entry.title)}"${i === tourAt ? ' aria-current="step"' : ""}></button>`).join("");
    $(el, ".wv-tour-back").disabled = tourAt === 0;
    $(el, ".wv-tour-next").textContent = tourAt === TOUR_SLIDES.length - 1 ? "done" : "next";
    placeTour();
    $(el, ".wv-tour-next").focus();
  }
  function placeTour() {
    const el = tourEl();
    if (!el || el.hidden) return;
    const card = $(el, ".wv-tour-card");
    const spot = $(el, ".wv-tour-spot");
    const scrim = $(el, ".wv-tour-scrim");
    const slide = TOUR_SLIDES[tourAt];
    const target = tourAnchor(slide);
    const r = target ? target.getBoundingClientRect() : tourStageRect?.();
    if (!r || !r.width) {
      spot.hidden = true;
      scrim.hidden = false;
      card.classList.add("is-centred");
      card.style.transform = "";
      return;
    }
    // the spot IS the dim when there is one — its box-shadow spreads past any
    // screen — so the scrim stands down rather than darkening the page twice
    const pad = slidePad(slide);
    const hole = { x: r.x - pad, y: r.y - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    scrim.hidden = true;
    spot.hidden = false;
    Object.assign(spot.style, {
      left: `${hole.x}px`, top: `${hole.y}px`, width: `${hole.w}px`, height: `${hole.h}px`,
      borderRadius: `${Math.min(hole.w, hole.h) / 2 <= 22 ? Math.min(hole.w, hole.h) / 2 : 10}px`,
    });
    card.classList.remove("is-centred");
    const spot_ = placeBubble({
      anchor: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      size: { w: card.offsetWidth, h: card.offsetHeight },
      box: { w: window.innerWidth, h: window.innerHeight },
      gap: pad + 16, edge: 14, avoid: hole,
    });
    if (spot_) card.style.transform = `translate3d(${Math.round(spot_.x)}px, ${Math.round(spot_.y)}px, 0)`;
  }
  const slidePad = (slide) => Number.isFinite(slide?.pad) ? slide.pad : 9;

  function applyPaintingOnly() {
    const on = state.paintingOnly;
    root.classList.toggle("is-painting-only", on);
    $(root, ".wv-main")?.classList.toggle("is-painting-only", on);
    // a toggle chip beside grid and marks, so it reads as one of them: lit means
    // the telling is up. Its label is markup, so only the state moves.
    const button = $(root, ".wv-telling-toggle");
    if (button) {
      button.classList.toggle("on", !on);
      button.setAttribute("aria-expanded", String(!on));
      button.title = on ? "show the telling" : "hide the telling and give the painting the page";
    }
    $(root, ".wv-main")?.classList.toggle("is-telling-collapsed", on);
    renderBubbles();
    // The pane is mid-slide. Re-measure when the slide ENDS, not on the next
    // frame — a single rAF lands in the middle of a 300 ms transition, which is
    // how the old code managed to compute a viewport for a width the pane was
    // still travelling through. Belt and braces: transitionend, plus a timer in
    // case the transition is suppressed (reduced motion, or a hidden tab).
    const settle = () => {
      mapCtx?.refit?.();
      if (lastRadial) drawOverlay(lastRadial);
      positionBubbles();
      placeTour(); // a staged Telling finishes sliding after the card was first placed
    };
    const main = $(root, ".wv-main");
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 340);
    main?.addEventListener("transitionend", function once(event) {
      if (event.propertyName !== "grid-template-columns" || event.target !== main) return;
      main.removeEventListener("transitionend", once);
      clearTimeout(settleTimer);
      settle();
    });
    requestAnimationFrame(positionBubbles); // the bubbles ride along mid-slide
  }
  let settleTimer = null;
  // a window resize is the same event as a toggle, only slower
  const onViewerResize = () => { mapCtx?.refit?.(); positionBubbles(); placeTour(); };
  window.addEventListener("resize", onViewerResize);

  // ───────── dev pane ─────────
  function buildDevPane() {
    const dev = $(root, ".wv-dev-dials");
    dev.innerHTML = `<div class="devnote">live engine dials — re-tells on change; never mutates the module, never re-folds.</div>`
      + `<div class="dial cross"><label>crossing (time-travel) <b class="crossovlbl">${state.crossingOverride ? state.crossing : "live · " + state.crossing}</b></label>
          <div class="crossrow"><input class="num crossover" type="number" min="0" value="${state.crossing}"><button class="ctl crosslive" title="return to the live crossing">⤺ live</button></div></div>`
      + DEV_DIALS.map((d) => {
        const v = state.dials[d.key];
        return `<div class="dial"><label>${esc(d.label)} <b data-out="${d.key}">${fmt(v)}</b></label>
          <input type="range" data-dial="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}"></div>`;
      }).join("")
      + `<div class="devrow"><button class="ctl wv-dev-reset">reset dials</button></div>`;
  }
  function fmt(v) { return Number.isInteger(v) ? String(v) : (+v).toFixed(2).replace(/\.?0+$/, ""); }

  // ───────── view switching + shared render ─────────
  function renderModeControls() {
    root.classList.toggle("is-spectating", isSpectating());
  }
  // "12 told of 117 in view (194 in range) · 77 behind the ground" is a sentence
  // about the ENGINE, not about the town — it answers how the field of view
  // culled, which is a question you only have while you are tuning the dials it
  // culled by. It rides with them (Keemin, 2026-08-04).
  function syncDevReadouts() {
    const open = !$(root, ".wv-dev")?.hidden;
    const tallies = $(root, ".wv-paint-tallies");
    if (tallies) tallies.hidden = !open;
  }
  function renderSpectatorCoordinate() {
    const chip = $(root, ".wv-spectator-coordinate");
    if (!chip) return;
    chip.hidden = !isSpectating();
    if (chip.hidden) return;
    const elevation = world?.heightfield?.elevationAt?.(state.cam.x, state.cam.y);
    chip.textContent = formatSpectatorCoordinate(state.cam, elevation);
  }
  function renderCurrent() {
    $(root, ".pos").textContent = formatCardinalPosition(state.cam);
    const cn = $(root, ".crossnow");
    if (cn) cn.innerHTML = state.crossingOverride
      ? `crossing <b>${state.crossing}</b> <span class="wv-quiet">· time-travelling</span>`
      : `crossing <b>${state.crossing}</b> <span class="crosslive-tag">· live</span>`;
    if (state.view === "telling") renderTelling();
    renderModeControls();
    renderSpectatorCoordinate();
    if (!mapCtx) loadMinimap();
  }
  // a re-render that the world does TO the viewer, not the viewer to itself: it must
  // preserve where you stand, your step, mode, dials, and scroll (Wright's hard UX
  // constraint — the world updates around you, you are never yanked). A quiet toast
  // names what moved.
  let movedTimer = null;
  function reRender(note) {
    const y = window.scrollY;
    renderCurrent();
    window.scrollTo(0, y);
    if (!note) return;
    // the toast belongs wherever the reader is looking; with the panel folded
    // away, .wv-view is display:none and a notice nobody can see is not a notice
    const toastHost = state.paintingOnly ? $(root, ".wv-map .wv-sticky") : $(root, ".wv-view");
    let el = $(root, ".wv-moved");
    if (el && el.parentElement !== toastHost) { el.remove(); el = null; }
    if (!el) { el = document.createElement("div"); el.className = "wv-moved"; toastHost?.prepend(el); }
    el.textContent = `the world moved — ${note}`;
    el.classList.add("show");
    clearTimeout(movedTimer); movedTimer = setTimeout(() => el.classList.remove("show"), 6000);
  }
  // One view remains, so this no longer switches anything — it is kept because
  // `.stand` still calls switchView("telling") to come back from a stand-here jump,
  // and because state.view is the seam a future second view would re-enter through.
  function switchView(v) {
    state.view = v;
    $(root, ".wv-telling").hidden = v !== "telling";
    renderCurrent();
  }

  // ───────── events ─────────
  let devTimer = null;
  root.addEventListener("click", (e) => {
    // the tour first, and every branch returns: while it is up it owns the page,
    // and a click that fell through to the painting underneath would select a
    // mark the reader cannot see
    if (e.target.closest(".wv-tour-open")) { openTour(0); return; }
    const dot = e.target.closest("[data-tour-to]");
    if (dot) { stepTour(Number(dot.dataset.tourTo)); return; }
    if (e.target.closest(".wv-tour-next")) { stepTour("next"); return; }
    if (e.target.closest(".wv-tour-back")) { stepTour("back"); return; }
    if (e.target.closest(".wv-tour-skip")) { stepTour("skip"); return; }
    if (tourAt >= 0 && e.target.closest(".wv-tour")) return; // the scrim eats the rest
    const act = e.target.closest(".wv-act-line .what[data-id]");
    if (act) {
      // the record of acts is a way IN to the record: name a mark, open the mark
      if (byId.has(act.dataset.id)) selectMark(act.dataset.id, { scrollCell: true });
      return;
    }
    // picking one out of the stack: from here it is an ordinary selection, and
    // the mark opens in exactly the bubble it would have opened in alone
    const chosen = e.target.closest("[data-choose]");
    if (chosen) { selectMark(chosen.dataset.choose, { scrollCell: true }); return; }
    const actor = e.target.closest("[data-act-as]");
    if (actor) { selectActor(actor.dataset.actAs); return; }
    if (e.target.closest(".wv-change-course")) {
      walkState.changingCourse = true;
      renderWalkDestination();
      $(root, ".wv-walk-destination")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (e.target.closest(".wv-walk-confirm")) { confirmSelectedWalk(); return; }
    // ── the crossings (DEMO SLICE, step 5) ────────────────────────────────
    const enterBtn = e.target.closest("[data-enter]");
    if (enterBtn) { performEnter(enterBtn.dataset.enter); return; }
    const acceptBtn = e.target.closest("[data-enter-accept]");
    if (acceptBtn) {
      root.querySelectorAll(".wv-threshold").forEach((s) => s.remove());
      performEnter(acceptBtn.dataset.enterAccept, { accept: true });
      return;
    }
    if (e.target.closest(".wv-threshold-no")) { root.querySelectorAll(".wv-threshold").forEach((s) => s.remove()); return; }
    const exitBtn = e.target.closest("[data-exit]");
    if (exitBtn) { performExit(exitBtn.dataset.exit); return; }
    const promptYes = e.target.closest(".wv-cross-yes");
    if (promptYes) {
      const { prompt, mark } = promptYes.dataset;
      state.crossing_prompt = null;
      renderCrossingPrompt();
      if (prompt === "exit") performExit(mark); else performEnter(mark);
      return;
    }
    if (e.target.closest(".wv-cross-no")) { state.crossing_prompt = null; renderCrossingPrompt(); return; }
    const stakeOpen = e.target.closest("[data-stake-open], [data-unstake-open]");
    if (stakeOpen) {
      const unstake = stakeOpen.hasAttribute("data-unstake-open");
      const markId = stakeOpen.dataset.mark;
      // BACKING A MARK SELECTS IT. These chips sit on relation lines and attribute
      // rows as well as on cells, so it was possible to open a sheet for one mark
      // while another was lit on the painting — and the sheet is the one place you
      // are about to spend stamps.
      const inBubble = !!stakeOpen.closest(".wv-bubble");
      if (markId && markInteraction.getState().selectedId !== markId && byId.has(markId)) {
        if (inBubble) followInBubble(markId); else selectMark(markId);
      }
      openStakeSheet(stakeHostFor(markId) ?? stakeOpen.closest(".wv-card"), {
        mode: unstake ? "unstake" : "stake",
        max: unstake ? stakeOpen.dataset.max : "",
        markId,
      });
      return;
    }
    const sheet = e.target.closest(".wv-act-sheet");
    if (sheet) {
      if (e.target.closest(".wv-act-close")) sheet.remove();
      else if (e.target.closest(".wv-act-preview-btn")) previewStakeSheet(sheet);
      else if (e.target.closest(".wv-act-confirm")) confirmStakeSheet(sheet);
      return;
    }
    // the viewport controls (P2): fit / follow / grid
    if (e.target.closest(".wv-map-home")) { mapCtx?.fitAll?.(); return; }
    const fbtn = e.target.closest(".wv-map-follow");
    if (fbtn) { if (!mapCtx) return; mapCtx.follow = !mapCtx.follow; fbtn.classList.toggle("on", mapCtx.follow); if (mapCtx.follow) mapCtx.lockOn(); return; }
    const gbtn = e.target.closest(".wv-map-grid");
    if (gbtn) { if (!mapCtx?.toggleGrid) return; gbtn.classList.toggle("on", !!mapCtx.toggleGrid()); return; }
    const fpbtn = e.target.closest(".wv-map-fp");
    if (fpbtn) { if (!mapCtx?.toggleFp) return; fpbtn.classList.toggle("on", !!mapCtx.toggleFp()); return; }
    const cvbtn = e.target.closest(".wv-map-convo");
    if (cvbtn) { if (!mapCtx?.toggleConvo) return; cvbtn.classList.toggle("on", !!mapCtx.toggleConvo()); return; }
    if (e.target.closest("[data-root-mark]")) { selectMark(WORLD_ROOT_ID, { scrollCell: true }); return; }
    if (e.target.closest(".wv-walk-cancel")) { clearSelectionAndDestination(); return; }
    if (e.target.closest(".wv-telling-toggle")) {
      state.paintingOnly = !state.paintingOnly;
      writePaintingOnly(localStore, state.paintingOnly);
      applyPaintingOnly();
      return;
    }
    // the ✕ closes the pinned bubble, which is the same act as deselecting —
    // there is one selection, and the bubble is what it looks like here
    if (e.target.closest(".wv-bubble-close")) { clearSelectionAndDestination(); return; }
    if (e.target.closest(".wv-bubble-back")) { bubbleBack(); return; }
    const filterChip = e.target.closest("[data-mark-filter]");
    if (filterChip && !filterChip.disabled) {
      state.markFilter = filterChip.dataset.markFilter;
      const y = window.scrollY; renderTelling(); window.scrollTo(0, y);
      return;
    }
    // (key sign-in UI removed 2026-07-24 — identity comes from the island's
    // GitHub pill via the pm_key bridge; the viewer collects no credentials)
    // investigate: back-crumb / tree node / card
    const back = e.target.closest(".wv-back");
    if (back) { const card = back.closest(".wv-card"); card._stack.pop(); renderExpansion(card); return; }
    const attribute = e.target.closest(".wv-attribute");
    if (attribute?.dataset.id) {
      // an attribute reached from inside the bubble is a step deeper, so it owes
      // you the same way back a relation does
      if (attribute.closest(".wv-bubble")) followInBubble(attribute.dataset.id);
      else selectMark(attribute.dataset.id);
      return;
    }
    const tn = e.target.closest(".wv-rnode");
    if (tn) {
      const card = tn.closest(".wv-card");
      if (card && tn.dataset.id) {
        // In a bubble a relative is a PLACE, so following one moves the bubble to
        // it rather than drilling a breadcrumb inside the old one — on a map, the
        // map is the breadcrumb, and the trail carries the way back. followInBubble
        // rebuilds the pinned bubble, so `card` is detached by the next statement;
        // nothing may touch it after this.
        if (tn.closest(".wv-bubble")) { followInBubble(tn.dataset.id); return; }
        selectMark(tn.dataset.id);
        const targetCard = [...root.querySelectorAll(".wv-card[data-id]")]
          .find((candidate) => candidate.dataset.id === tn.dataset.id);
        if (targetCard && targetCard !== card) openCardById(tn.dataset.id);
        else {
          card._stack.push(tn.dataset.id);
          renderExpansion(card);
        }
      }
      return;
    }
    const stand = e.target.closest(".stand");
    if (stand) {
      if (canAct()) chooseWalkPoint(+stand.dataset.x, +stand.dataset.y);
      else { state.cam = { x: +stand.dataset.x, y: +stand.dataset.y }; switchView("telling"); }
      return;
    }
    if (e.target.closest(".wv-dev-toggle")) { const dev = $(root, ".wv-dev"); dev.hidden = !dev.hidden; if (!dev.dataset.built) { buildDevPane(); dev.dataset.built = "1"; } syncDevReadouts(); return; }
    if (e.target.closest(".wv-dev-reset")) { state.dials = { ...DIALS }; buildDevPane(); renderCurrent(); return; }
    if (e.target.closest(".crosslive")) { state.crossingOverride = false; state.crossing = liveCrossing(); const i = root.querySelector(".crossover"); if (i) i.value = state.crossing; const l = root.querySelector(".crossovlbl"); if (l) l.textContent = "live · " + state.crossing; reRender(); return; }
    const b = e.target.closest("button.ctl, .wv-card");
    if (!b) return;
    if (b.dataset.x !== undefined && b.classList.contains("ctl")) { walkState.actorBound = false; state.cam = { x: +b.dataset.x, y: +b.dataset.y }; renderCurrent(); }
    else if (b.dataset.dx !== undefined) { walkState.actorBound = false; state.cam.x += (+b.dataset.dx) * state.step; state.cam.y += (+b.dataset.dy) * state.step; renderCurrent(); }
    else if (b.classList.contains("wv-card") && b.dataset.id) {
      // Inside a bubble the card IS the selection made visible, so clicking it
      // must not un-make it — the ✕ and Escape do that. What is left of a card
      // click is its other half: fold the investigate expansion open or shut.
      if (b.closest(".wv-bubble")) {
        b._stack = b._stack?.length ? [] : [b.dataset.id];
        renderExpansion(b);
        return;
      }
      if (!selectMark(b.dataset.id)) {
        b._stack = [];
        renderExpansion(b);
        return;
      }
      if (b._stack?.length) { b._stack = []; renderExpansion(b); } else { b._stack = [b.dataset.id]; renderExpansion(b); }
    }
  });
  const onViewerKeydown = (event) => {
    // a slide deck is read with the arrow keys, and Escape leaves it
    if (tourAt >= 0) {
      if (event.key === "Escape") { event.preventDefault(); stepTour("skip"); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); stepTour("next"); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); stepTour("back"); return; }
      // It says aria-modal, so it has to behave like one: Tab must not walk out
      // of the card and start pressing buttons on a page the reader cannot see.
      if (event.key === "Tab") {
        const stops = [...$(root, ".wv-tour-card").querySelectorAll("button:not(:disabled)")];
        if (!stops.length) return;
        const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
        if (document.activeElement === edge || !$(root, ".wv-tour-card").contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
        }
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (!markInteraction.getState().selectedId && !walkState.destination) return;
    clearSelectionAndDestination();
  };
  document.addEventListener("keydown", onViewerKeydown);
  function openCardById(id) {
    const card = [...root.querySelectorAll(".wv-card")].find((c) => c.dataset.id === id);
    if (card) { card._stack = [id]; renderExpansion(card); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  const markCellAt = (target) =>
    target?.closest?.(".wv-card[data-id], .wv-rnode[data-id], .wv-attribute[data-id]") ?? null;
  root.addEventListener("mouseover", (e) => {
    // the root's glyph is a mark to the pointer as much as to the click
    if (e.target.closest("[data-root-mark]")) { hoverMark(WORLD_ROOT_ID); return; }
    const cell = markCellAt(e.target);
    if (cell) hoverMark(cell.dataset.id, !!cell.closest(".wv-bubble"));
  });
  root.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-root-mark]")) { hoverMark(null); return; }
    const from = markCellAt(e.target);
    if (!from) return;
    const to = markCellAt(e.relatedTarget);
    hoverMark(to?.dataset.id ?? null, !!to?.closest(".wv-bubble"));
  });
  root.addEventListener("mouseleave", () => hoverMark(null));
  root.addEventListener("input", (e) => {
    if (e.target.closest(".wv-act-sheet")) {
      const sheet = e.target.closest(".wv-act-sheet");
      $(sheet, ".wv-act-preview").hidden = true;
      $(sheet, ".wv-act-confirm").disabled = true;
      $(sheet, ".wv-act-answer").hidden = true;
      return;
    }
    if (e.target.classList.contains("stepslider")) { state.step = STEP_NOTCHES[Number(e.target.value)] ?? state.step; const lbl = root.querySelector(".stepval"); if (lbl) lbl.textContent = stepLabel(state.step); return; }
    if (e.target.classList.contains("crossover")) {
      const v = String(e.target.value).trim();
      if (v === "") { state.crossingOverride = false; state.crossing = liveCrossing(); }
      else { state.crossingOverride = true; state.crossing = Math.max(0, Number(v) || 0); }
      const lbl = root.querySelector(".crossovlbl"); if (lbl) lbl.textContent = state.crossingOverride ? state.crossing : "live · " + state.crossing;
      reRender(); return;
    }
    const dial = e.target.dataset?.dial;
    if (dial) {
      state.dials = { ...state.dials, [dial]: Number(e.target.value) };
      const out = root.querySelector(`[data-out="${dial}"]`); if (out) out.textContent = fmt(state.dials[dial]);
      clearTimeout(devTimer); devTimer = setTimeout(renderCurrent, 70);
    }
  });
  // Identity is UI memory, not door law. The token is presented on every signed
  // call and the selected resident is included in every act payload. Only the
  // selected handle is sticky; the office remains choose-per-call.
  const pmKey = () => { try { return localStorage.getItem("pm_key") || null; } catch { return null; } };
  const authHeaders = () => { const k = pmKey(); return k ? { Authorization: "Bearer " + k } : {}; };
  async function loadIdentityWorld() {
    const options = { headers: authHeaders(), credentials: "same-origin" };
    const [composed, portfolio] = await Promise.all([
      fetchWorldState([officeUrl("/world/state")], options),
      fetch(officeUrl("/world/my-marks"), options).then(async (r) => {
        if (!r.ok) throw new Error(`${officeUrl("/world/my-marks")} → ${r.status}`);
        return r.json();
      }),
    ]);
    data.myWorld = composed.json;
    state.portfolio = portfolio;
    state.mineIds = new Set(["drafts", "published", "backed"]
      .flatMap((category) => (portfolio[category] ?? []).map((mark) => mark.id ?? mark.mark))
      .filter(Boolean));
    state.draftIds = draftMarkIds(portfolio.drafts);
    applyWorldLayer();
  }
  async function resolveIdentity() {
    const options = { headers: authHeaders(), credentials: "same-origin" };
    if (pmKey()) {
      try {
        const r = await fetch(officeUrl("/ops/whoami"), options);
        state.whoami = r.ok ? await r.json() : null;
      } catch { state.whoami = null; }
    } else {
      state.whoami = null;
    }
    const toggle = $(root, ".wv-dev-toggle");
    if (toggle) toggle.hidden = !(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || state.whoami?.principal);
    const handles = state.whoami?.handles ?? [];
    let remembered = "", lastResident = "";
    try {
      remembered = localStorage.getItem(ACT_AS_KEY) || "";
      lastResident = localStorage.getItem(LAST_RESIDENT_KEY) || "";
    } catch {}
    const selection = resolveActAsSelection({ handles, remembered, lastResident });
    state.actAs = selection.actAs;
    state.handle = selection.handle;
    walkState.actorBound = selection.actAs !== SPECTATOR_ACTOR;
    if (handles.length) {
      try {
        await Promise.all([loadIdentityWorld(), loadActorHome(), loadActorBalance()]);
      }
      catch {
        data.myWorld = null;
        state.portfolio = null;
        state.mineIds = new Set();
        state.draftIds = new Set();
        if (state.markFilter === "mine") state.markFilter = "everything";
        applyWorldLayer();
      }
    } else {
      data.myWorld = null;
      state.portfolio = null;
      state.mineIds = new Set();
      state.draftIds = new Set();
      if (state.markFilter === "mine") state.markFilter = "everything";
      applyWorldLayer();
    }
    renderPresets();
    renderIdentity();
    renderModeControls();
    renderSpectatorCoordinate();
    renderWalkDestinations();
    syncActorPosition({ moveCamera: true });
    mountWalkers();
    // the crossings, before the first telling: the read is scoped to whatever
    // this resident has already stepped into (step 5)
    await pollOccupancy({ rerender: false });
    renderActions();
    refreshCrossingPrompt();
    if (state.view === "telling") renderTelling(); // the chips + filter reflect the new identity
    // the office has answered, so we finally know whose first visit this is
    const unseen = !!tourWho() && !readTourSeen(localStore, tourWho());
    $(root, ".wv-tour-open")?.classList.toggle("is-unseen", unseen);
    greetOnFirstVisit();
  }

  async function selectActor(actor) {
    if (actor === SPECTATOR_ACTOR) {
      state.actAs = SPECTATOR_ACTOR;
      walkState.actorBound = false;
      try { localStorage.setItem(ACT_AS_KEY, SPECTATOR_ACTOR); } catch {}
      clearSelectionAndDestination();
      root.querySelectorAll(".wv-act-sheet").forEach((sheet) => sheet.remove());
      root.querySelectorAll(".wv-threshold, .wv-cross-prompt").forEach((el) => el.remove());
      state.crossing_prompt = null;
      state.crossing_notice = null;
      renderIdentity();
      renderActions();  // a spectator stands in no tree — the section goes away
      renderModeControls();
      renderSpectatorCoordinate();
      renderWalkDestinations();
      renderTelling();
      drawWalkers();
      return;
    }
    if (!(state.whoami?.handles ?? []).includes(actor)) return;
    state.actAs = actor;
    state.handle = actor;
    try {
      localStorage.setItem(ACT_AS_KEY, actor);
      localStorage.setItem(LAST_RESIDENT_KEY, actor);
    } catch {}
    state.actorBalance = null;
    state.actorHome = null;
    walkState.actorBound = true;
    clearSelectionAndDestination();
    root.querySelectorAll(".wv-act-sheet").forEach((sheet) => sheet.remove());
    // The switch is a camera move over data already in hand: the walkers poll
    // keeps everyone's standpoint (walkers AND standing) warm, and the manifest
    // knows homes without asking. The office is consulted AFTER the swap, and
    // the camera follows its answer only if the answer differs.
    const manifestHome = data?.manifest?.homes?.find((entry) => entry.household === actor && entry.grid_m);
    if (manifestHome) state.actorHome = { x: Number(manifestHome.grid_m.x), y: Number(manifestHome.grid_m.y), markId: `${manifestHome.household}/${manifestHome.home_id}` };
    renderIdentity();
    renderActions();          // whose standpoint in the TREE this is (step 5)
    renderModeControls();
    renderSpectatorCoordinate();
    renderWalkDestinations();
    syncActorPosition({ moveCamera: true });
    refreshCrossingPrompt();
    renderTelling();
    mapCtx?.lockOn?.(); // one-shot: the painting glides to your dot on Act As (no sticky follow)
    renderWalkDestination();
    const preOrigin = actorOrigin();
    Promise.all([loadActorHome(), loadActorBalance()]).then(() => {
      if (state.handle !== actor) return; // the reader has moved on
      const fresh = actorOrigin();
      const moved = !!fresh && (!preOrigin || fresh.x !== preOrigin.x || fresh.y !== preOrigin.y);
      syncActorPosition(moved ? { moveCamera: true } : {});
      if (moved) renderTelling();
    }).catch(() => {});
    pollWalkers().catch(() => {}); // its own body re-renders only when someone actually moved
  }

  function renderIdentity() {
    const box = $(root, ".wv-identity");
    if (!box) return;
    const handles = state.whoami?.handles ?? [];
    const spectator = `<button type="button" class="ctl handleopt${isSpectating() ? " on" : ""}" data-act-as="${SPECTATOR_ACTOR}" aria-pressed="${isSpectating()}">◉ Spectator</button>`;
    box.innerHTML = `<h2>Act As</h2><div class="handlepick">${spectator}${handles.map((handle) =>
          `<button type="button" class="ctl handleopt${state.actAs === handle ? " on" : ""}" data-act-as="${esc(handle)}" aria-pressed="${state.actAs === handle}">${esc(handle)}${state.actAs === handle
            ? ` · <span class="wv-stamp-balance">✦ ${Number.isInteger(state.actorBalance) ? state.actorBalance : state.actorBalance === null ? "…" : "unavailable"}</span>`
            : ""}</button>`).join("")}</div>`;
  }
  // ───────── what has been happening ─────────
  // THE LEDGER IS FETCHED, NOT DERIVED. /api/walks answers with positions — who is
  // where NOW — and a record of acts needs the acts themselves, which only the
  // append-only ledger has. Same-origin first (the local server has it on disk),
  // then the published raw file, which is how this page already reaches
  // world-state when it is served from somewhere without an office.
  let departures = [];
  async function loadWalkLedger() {
    for (const url of ["/WORLD/walk-ledger.md", `${RAW}/WORLD/walk-ledger.md`]) {
      try {
        const r = await fetch(url, { credentials: "omit" });
        if (!r.ok) continue;
        const parsed = parseWalkLedger(await r.text());
        if (parsed.departures.length) { departures = parsed.departures; return; }
      } catch { /* try the next one */ }
    }
  }
  function renderActivity() {
    const box = $(root, ".wv-activity");
    const list = $(root, ".wv-acts");
    if (!box || !list) return;
    const rows = recentActivity({
      departures,
      marks: world?.marks ?? data?.worldState?.marks ?? [],
      // Both lanes are optional by construction: a source that never answered
      // contributes nothing and the feed is exactly what it was before. One
      // quiet lane must never be able to empty the whole rail.
      stakes: stakeEvents,
      blessings: settleState.recent,
      names: new Map((world?.marks ?? []).map((m) => [m.id, markName(m).name])),
      limit: 14,
    });
    // Hidden rather than empty: a heading over nothing reads as a thing that
    // broke. A page served without the ledger and before the fold simply has no
    // record to show yet, which is not the same as an empty one.
    box.hidden = !rows.length;
    if (!rows.length) return;
    list.innerHTML = rows.map((row) => {
      const gone = actSubjectGone(row.subject, byId);
      const subject = row.name ?? (row.subject ? deslugMarkId(row.subject) : "");
      const what = row.kind === "walk"
        ? (subject ? `set out for <span class="what" data-id="${esc(row.subject)}">${esc(subject)}</span>`
          // "set out for at TC" is what "for" plus a position-phrase gets you; the
        // formatter's job is to say where a point IS, and toward reads correctly
        // against every answer it gives, including the one at the origin.
        : `set out toward ${esc((formatCardinalPosition(row.toward) || "open ground").replace(/^at /, ""))}`)
        : row.kind === "stake"
        ? (subject
          ? `backed <span class="what" data-id="${esc(row.subject)}">${esc(subject)}</span>`
            + (row.amount ? ` <span class="wv-act-n">✦${row.amount}</span>` : "")
          : `backed a mark${row.amount ? ` <span class="wv-act-n">✦${row.amount}</span>` : ""}`)
        : row.kind === "settlement"
        // no author: the keeper's gate is not a resident, so the line is about
        // what landed rather than who did it
        ? `<span class="wv-act-bless">S${esc(row.n)} blessed</span>`
        : `wrote <span class="what" data-id="${esc(row.subject)}">${esc(subject)}</span>`;
      const cls = row.kind === "walk" ? "is-walk"
        : row.kind === "stake" ? "is-stake"
        : row.kind === "settlement" ? "is-settlement"
        : "is-mark";
      return `<li class="wv-act-line ${cls}${gone ? " is-gone" : ""}">`
        + (row.who ? `<span class="who">${esc(row.who)}</span> ` : "") + what
        + `<span class="when">${esc(row.dayLabel)}</span></li>`;
    }).join("");
  }

  function renderPresets() {
    const box = $(root, ".presets");
    if (!box) return;
    const handles = new Set(state.whoami?.handles ?? []);
    let list = PRESETS;
    if (handles.size && data?.manifest?.homes) {
      const homes = data.manifest.homes
        .filter((h) => handles.has(h.household) && h.grid_m)
        .map((h) => ({ x: h.grid_m.x, y: h.grid_m.y, label: h.title ?? `${h.household}/${h.home_id}` }));
      if (homes.length) list = homes; // your own homes; keyless keeps the defaults
    }
    box.innerHTML = list.map((p) => `<button class="ctl" data-x="${p.x}" data-y="${p.y}">${esc(p.label)}</button>`).join("");
  }

  // ───────── the ambient clock (crossing rollover + auto-update) ─────────
  // The world updates AROUND the viewer. Every 30 s: roll the live crossing over a
  // boundary (fog reseeds → the weather visibly changes), and — on the office-live
  // source only — every other tick (~60 s) compare the fold's X-Postmark-As-Of and
  // re-tell if the record advanced. On /WORLD or RAW we don't poll (don't hammer a
  // CDN / GitHub). Every re-tell preserves standpoint / step / mode / dials / scroll.
  let lastLive = liveCrossing(), tick = 0;
  const clock = setInterval(async () => {
    tick++;
    const nl = liveCrossing();
    if (nl !== lastLive) { lastLive = nl; if (!state.crossingOverride) { state.crossing = nl; reRender(`crossing ${nl}`); } }
    // the countdown is arithmetic on the wall clock, so it re-reads every tick;
    // the NUMBER only moves when a settlement actually lands, so it is refreshed
    // on the same slower beat the fold uses
    if (!$(root, ".settlenow")?.hidden) renderSettlementChip();
    if (tick % 20 === 0) loadSettlements().then(renderSettlementChip);
    // the talk moves faster than the record: every other tick (~60 s), gentler
    // than the conversations page's own 7 s poll — this is a map, not a feed,
    // and a hidden layer costs the office nothing
    if (convoVisible && tick % 2 === 0) loadConversations().then(drawConversations);
    if (tick % 2 === 0 && data && isOfficeLive(state.dataSource)) {
      try {
        const r = await fetch(state.dataSource, { credentials: "omit" });
        const asOf = r.headers.get("x-postmark-as-of");
        if (r.ok && asOf && asOf !== state.asOf) {
          const json = await r.json();
          state.asOf = asOf;
          data.trueWorld = json;
          if ((state.whoami?.handles ?? []).length) await loadIdentityWorld();
          applyWorldLayer();
          reRender("the record advanced");
        }
      } catch { /* a poll miss is silent — the last good fold stands */ }
    }
  }, 30000);

  // ───────── boot ─────────
  (async () => {
    // the mode is remembered, so lay the page out in it before the first paint
    applyPaintingOnly();
    // the ring is the same question, asked of whoever turns out to be signed in;
    // renderIdentity settles it once the office has answered
    try {
      await loadData();
      renderCurrent();
      loadWalkLedger().then(renderActivity); // the record of acts, once it arrives
      // the faces, once they arrive — a redraw is owed because the walkers were
      // already painted as monograms by then, and this is what puts the pictures
      // on them. Never awaited: the map is not allowed to wait on a nicety.
      loadResidentsMeta().then(() => drawWalkers());
      // the settlement number, and the chip it lives in
      loadSettlements().then(() => { renderSettlementChip(); renderActivity(); });
      loadStakeEvents().then(renderActivity);
      // conversations load on first toggle (💬), not at boot — the layer is opt-in
      resolveIdentity(); // after data (the presets filter reads the manifest)
    } catch (err) {
      $(root, ".wv-telling").innerHTML = `<div class="wv-err">could not load the world record: ${esc(err?.message ?? err)}</div>`;
    }
  })();

  // THE HANDLE, PUBLISHED (2026-08-14). spectator/index.html mounts and throws
  // the handle away, so a page that wraps the shell — the site serves it verbatim
  // — could never reach `reload` no matter what this function returned. One
  // global closes that, and it is the last mount that wins, which is the only
  // answer that can be right when a host re-mounts. Inert for the shell itself.
  const handle = {
    rerender: renderCurrent,
    // RE-PULL THE RECORD WITHOUT TEARING THE VIEWER DOWN (2026-08-14). A host
    // that changes what the world's data doors answer — /replay/ swapping to
    // another crossing's frozen frame — needs the viewer to go and ask again.
    // Until now its only options were the 60 s auto-update tick or a full
    // re-mount, and re-mounting costs the camera, the DOM, and a fresh boot.
    // reloadWorld() has done exactly the right thing since it was written and
    // was never once called; this is its caller. Walkers come with it because
    // "the record changed" and "who is standing in it changed" are one event to
    // every caller that would ask.
    // The `data` guard is not defensive noise: boot is async, so a host that
    // scrubs before the first fold lands would otherwise re-pull into nothing.
    reload: async () => { if (!data) return false; await reloadWorld(); await pollWalkers(); renderCurrent(); return true; },
    stop: () => {
      clearInterval(clock);
      clearInterval(walkState.timer);
      document.removeEventListener("keydown", onViewerKeydown);
      window.removeEventListener("resize", onViewerResize);
      bubbleResize?.disconnect();
    },
  };
  try { window.__pmViewer = handle; } catch { /* no window: the tests import this file */ }
  return handle;
}

// ───────── tiny helpers (display only) ─────────
function firstWords(body, n) {
  const s = String(body ?? "").replace(/^\s*(sits|region|kind|at|date|slot|value|household|mark|parent)\s*:\s*/i, "").trim().replace(/\s+/g, " ");
  const w = s.split(" ").slice(0, n).join(" ");
  return w + (s.split(" ").length > n ? "…" : "");
}
