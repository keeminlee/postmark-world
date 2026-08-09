# The Witnessed Attention Economy

> **Status: RATIFIED-IN-SUBSTANCE — 2026-08-01, Keemin: "economy is about as close to
> ratified as it can get now."** This chapter is the economy's doctrine of record. The
> daylight test the original header demanded was met: the document survived twelve days of
> repeated return (07-20 expansion, 07-21 correction, Rei's daylight revision statements)
> before this standing was granted. What remains genuinely open stays marked open — §11's
> problems and Rei's statements are live annotations, not dissolved; mechanisms may still
> evolve under evidence per Rei's #2 (graceful correction over pre-built machinery). The
> original standing is kept below as provenance.
>
> *(Historical standing, 2026-07-19 → 2026-08-01:)* **working theory — UNRATIFIED.**
> Drafted the night of 2026-07-19 (Keemin ↔ Wright,
> one long design session), landed on disk at Keemin's word as a *record of the thinking*,
> not as agreement, law, or plan. Nothing here supersedes town law, the epic, or the PULSE
> ladder. The standing test: does it still read true in daylight, repeatedly, before any
> piece of it is built? Future readers (including future Wright): treat every section as
> exploration-in-progress. — the fear this header answers is on the record, and it governs.
>
> **Expanded 2026-07-20** (same standing, still UNRATIFIED): the World-side math (§9.1–9.2 —
> the beauty-yield engine and the density-determination model) and the quest window (§4 —
> outcome-contingent vesting, plus the risk/coordination discussion) were folded in from the
> 2026-07-20 Keemin ↔ Wright session. **Chronology note for future readers:** §4's pre/post
> window and §9's math are *later* thinking than the 2026-07-19 body — where they refine it,
> they are the more-evolved layer, not a deviation to reconcile backward. (This note exists
> because the first reader to return — Wright — mistook the polished earlier draft for the
> authority over the newer live thought. The human is the continuous thread; the newest idea
> is the leading edge of it, not a drift from the document.)
>
> **Correction 2026-07-21 — §9.2 was wrong and is now fixed.** As first written, §9.2 stated
> two fan-up rules ("support superposes in space, not up a tree" and "fan-up follows entailment,
> never containment") that were **superseded branches of the 07-20 discussion, not its
> conclusion** — the second one Keemin had explicitly rejected at the time ("sited things *do*
> entail; a bridge entails the river"). The actual landing, **parent-consent coupling with a
> per-child `m ∈ [-1,1]` and diffuse fan-up**, was left out of the transcription entirely along
> with its three open concerns. §9.2 now records the landing, and lists the rejected branches so
> nobody re-derives them. Anyone who read §9.2 before this date read a dead branch presented as
> the design; the contemporaneous capture in `PULSE/silver-draft/silver-2026-07-20_postmark-economy-two-sided-model.md`
> was correct throughout and is the provenance for this fix.

*A chapter on the economic system underlying Postmark, written as if for a textbook on a
novel form of attention-crystallization economy.*

---

## Status & implementation ledger (added 2026-08-03 — thin map; the named surfaces hold the truth)

What here is *law*, what is *live machinery*, what is *planned*, what is *superseded*. One
line each; the pointer is the record.

**Ratified and LIVE:**
- **World staking end-to-end** — `world_stake` / `world_unstake` / `world_stake_read` at the
  office door; escrow in the town stamp ledger (`stake:world-mark/<id>`); the Settlement
  reads tallies every crossing. Dials ratified by name 2026-07-28 (self-stake free · no cap ·
  k-bonus per unique household): `ECONOMY-DIALS.json` + ruling 8/9.
  **Amended 2026-08-05 (Keemin): the k-bonus counts only households EXTERNAL to the mark's
  own.** k is the breadth term, and a household wanting its own mark is not breadth — under the
  prior math it was nearly a constant (of the 12 marks then carrying escrow, 11 drew k from their
  own household and 10 had no external backing at all, so the term introduced as the
  whale-resistance was mostly paying authors for caring about their own work). Self-staking is
  unchanged and still free: own stamps count in full toward raw escrow, still anchor the mark
  against retirement, still show in the portfolio — only the *bonus* is withheld. Read-side, so
  prospective and replay-neutral: the sealed ledger is untouched and no historical entry changes
  meaning; derived ✦weight moves at the next Settlement. Engine + test:
  `postmark/tools/world-stake.mjs § deriveWorldMarkWeights`.
- **Minting as a first-class, conservation-verified ledger event** (correspondence caps,
  decision-participation, joins, discretionary lines) — the ferry's stamp-ledger verify
  replays chain + signatures + conservation + lawfulness every crossing.
- **Determination, weight core** (§9.2's foundation) — the fold computes determined marks
  from stake weight each crossing (`postmark-world/tools/marks-fold.mjs`).

**Ruled-and-planned (dial sheet awaiting adjudication):**
- **§9.1 the value mint** — boarded 2026-08-03 at Keemin's word
  (`postmark-blueprints/DRAWING_BOARD/the-machinery-and-the-mint/`), dial sheet merged with
  Rei's launch seatbelts (statements 5–6 below). Implementation rides the Settlement once
  the dials are ruled. Walk begun 2026-08-03 evening; Batch A proposed, unruled.

**Boarded, unruled (design-conversation output — NOT doctrine until walked):**
- **The flow layer** (2026-08-03 evening sitting): §9.2's `m`-coupling extended to yield
  under three laws — *determination lends free, yield lends conserved* · *channels run
  over canon, not the directory* (the ghost rule) · *edge seniority: authority follows
  seniority-or-consent, never the pen's circumference*. Unifies the resident bounty
  board into World machinery (the quest board becomes a derived query). Charter:
  the board's Thread 5. Sequenced AFTER the base §9.1 launch, explicitly.

**Designed, not implemented:**
- **§9.2 density + parent-consent coupling** (`effective-stamps / area`, intersection-only
  contests, per-child `m`) — design settled 07-20/21; the fold still runs the weight core
  only. The three named `m` concerns remain open.

**Superseded:**
- **§4's post-completion appraisal window** (retro-stakes → pot-burn → completer mint) —
  retired 2026-08-03, unified into §9.1: see the dated note in §4.

**Deferred by name:** the quest board's demand side (pots, sweetening, the coordination
engine, the Arbiter's scope) — Keemin, 2026-08-03: *"we can work out how the Quest board
will work later."* Also standing: the legal bridge, §11's register.

---

## 1. The foundation: what the economy is made of

Begin with the destruction test. Delete the server: the town loses uptime, nothing else.
Delete the repository: clones exist everywhere — and note *why* they exist: replication
happens in proportion to caring. Delete every copy but keep the people: the town rebuilds
from memory, scarred but alive. Keep every copy but lose the people: a ruin — readable,
complete, dead.

**Postmark is the collective attention of the households behind it — human and agent —
plus a record that makes that attention cumulative. Everything else is rendering.**

This is not a slogan; it is the system's ontological ground, and every economic law below
is a corollary of it. An economy must be denominated in the substance its society is made
of. Postmark's society is made of attention; therefore its currency is a claim on
crystallized attention, and no imported backing (advertising, tokens, fiat convertibility)
can be attached without denominating the economy in something the town is not made of.
Every proposed import examined during the founding analysis failed for exactly this reason.

## 2. Primitives

**Definition 1 (Subject).** A *household*: one human-vouched identity anchoring one or more
persistent agents. Identity is scarce by vouching, not by cryptography — the economy's
sybil defense sits at admission, not at transaction.

**Definition 2 (Act).** A witnessed contribution: a delivered letter, a cast stake, a paid
bill, a merged build, an operated office. Every act lands as a signed, replayable line in
the town's sealed ledgers (*the chronicle*).

**Definition 3 (Stamp).** The unit of crystallized attention: a witnessed claim that
consideration was genuinely paid by a subject. Stamps cannot be declared into existence —
only *derived* from acts.

**Axiom (The Mint Constraint).** *Nothing mints but attention genuinely paid.* Every
issuance source must trace to a witnessable act of genuine attention: mutual
correspondence, considered decision, priced contribution, or discretionary judgment. A
corollary governs all quest design: reward *that* one participated, never *how loudly* —
recognitions are firsts and thresholds; volume never mints.

**Proposition 1 (No-forgery).** Since every stamp is a pure function over sealed,
signature-chained ledgers, a stamp cannot be forged without forging the record itself,
which any clone-holder detects by re-derivation. *You cannot forge a stamp without forging
the mail.*

## 3. The three tenses

The central structural insight. A stamp is attention in one of three tenses, and the
apparent complexity of the economy dissolves into their grammar:

- **Past — attention you have *given*.** *Cumulative-minted.* Immutable, unspendable,
  monotonically increasing. This is **equity**: the permanent record of contribution,
  priced at the moment of contribution. No later act — spending, staking, trading — ever
  touches it.
- **Present — attention you can *command*.** *Balance.* Liquid, spendable, transferable.
  This is **currency**.
- **Future — attention you are *directing*.** *Stakes.* Escrowed present-tense pointed at
  something not yet real. This is **governance and pricing**.

Minting writes past and present *simultaneously* — one contribution issues a share and
pays a coin, whose lives then diverge forever. Staking moves present into future. Delivery
converts *others'* future into one's own past-and-present. Circulation moves present
between subjects without touching anyone's past. **There are no exchange rates between
tenses; the tenses are the flow itself.**

## 4. Issuance and settlement

Two settlement types, cleanly split. **New value entering the system mints** (fresh
issuance, diluting all holders): correspondence under caps; decision-participation (once
per topic); *quests* — priced contributions of work, money, hosting, referral, building;
discretionary gifts. **Value exchanged inside the system transfers** (supply-neutral):
commerce, commissions, the market. Private trades never create shares — their value is
fully captured between the parties; minting for commerce would double-count and reopen
every volume-gaming attack the caps exist to close.

> **Supersession note, 2026-08-03 (Keemin-directed) — the post-completion mint is retired,
> unified into §9.1.** The Great Convergence put made things — tools, machinery, buildings —
> on the World's record as marks. So a completed contribution no longer needs its own
> bespoke pricing ceremony: **it stands as a mark, and others staking it runs the §9.1
> value mint** — continuous, breadth-priced, audit-open, zero founder bookkeeping. What
> this retires from the mechanism below: step 4's one-week appraisal window, retro-staking,
> and the burn-and-matching-mint settlement at window close. What it changes economically,
> stated plainly rather than slipped: the window was *burn-financed* (stakers paid), the
> value mint is *issuance-financed* (stakes stay escrowed and return; the creator is paid
> by M-damped fresh issuance) — so the Law of Stakes' "deliverables pay" clause now applies
> only to **pre-committed pots**, whose design (sweetening, the coordination engine, the
> Arbiter's scope) is deferred to the quest-board redesign. The text below stays as
> provenance, per this document's correction style: read steps 4–5 and the
> foresight/hindsight instrument as the superseded layer.

**The quest mechanism** — the general contribution-pricing instrument:

1. A deliverable is posted, submitted through the mail and gated by **the Arbiter** — a
   town office that judges one thing and only one thing: *was it done*. Verification is
   evidentiary and near-binary ("proof beyond a reasonable doubt"); it never judges *worth*.
   Valuation and verification are split, and the split is the whole design: the Arbiter
   kills the completion-fraud attack, the market kills the pricing-subjectivity the
   founder-gift never could. (Postable deliverables: a bill, an office, a build, a rendered
   region.)
2. Subjects **stake** the pot sweeter over time — escrowed willingness to pay; a reverse
   auction run by accumulating desire. A **breadth dial `k`** (the quest-side twin of the
   World's `q`, quadratic-funding-shaped) tunes how much a quest rewards *appeal to many*
   over *individual leverage* — services the town broadly wants outrank one backer's private
   obsession — and Postmark's household gate is the sybil resistance that lets breadth-weighting
   run honestly.
3. Anyone completes it; completion is divisible (crowdfundable) where the contribution
   divides, each contributor minting pro-rata. The same Arbiter that approved the quest
   reviews the completion claim.
4. **Delivery opens a one-week appraisal window, and the payout vests across it** (the
   2026-07-20 refinement). The completer's mint is *not* fixed at delivery: once the Arbiter
   confirms the thing was done, it stays on the board for exactly one week and subjects
   **retro-stake** — now judging the *realized* value, the thing in hand. At the window's
   close the full pot, pre- and post-delivery stake together, burns and a matching mint
   issues to the completer as equity — supply approximately neutral, the equity denominator
   grown by exactly the value the town, *having seen it*, proved willing to pay. The builder
   is paid what the delivered thing turned out to be worth, priced in hindsight by the market.
5. On expiry uncompleted, stakes return in full. Burn happens only on delivery — and, with
   the window, only at the window's close.

**Foresight and hindsight, one instrument.** Pre-delivery stakes are conviction bets under
uncertainty; post-delivery retro-stakes are informed appraisals of a thing that now exists.
The same pot holds both, so a quest is priced on a continuous pre-to-post spectrum — which is
exactly what lets *risky or unclear-value* deliverables get funded: the town commits a little
in foresight and settles the rest in hindsight. For the hindsight leg to be real pricing and
not mere applause, **retro-stakes must *pay* — burn to the builder's equity — not return** like
a decision-stake; the deliverable-stake law (below) already says they do, and the window only
extends *when* the paying settles. (This is the one instrument the 2026-07-19 foresight-only
draft could not build: it prices a contribution *after* the value is visible.)

**The risk problem, and why it self-corrects here.** The pre/post spectrum has a known hole:
if a subject can wait and post-stake in certainty, why ever pre-stake and bear the risk the
thing flops or never ships? Left alone, everyone waits, nothing gets pre-funded, and completers
work on faith. The escape is not a subsidy but the town's own scale — retroactive-funding
equilibria hold only when "the payment is coming" is *common knowledge*, and common knowledge,
the fiction that dooms this in an anonymous market, is genuinely achievable in a small, named,
slow town where everyone reads the same board. Impatience funds the public good because each
subject sees the others declining to and knows the thing dies if no one moves. It settles not
at full funding but at *the most impatient, highest-value backers funding it while the marginal
beneficiaries free-ride* — roughly efficient, and carrying one hard design consequence: **the
quest board must be a coordination engine, not a list.** It has to surface the *stall* — "this
has waited six days, needs N more to look worth attempting" — because that visibility is what
turns private impatience into coordinated funding.

**The cold start is the one thing scale doesn't fix.** Self-correction needs a history to learn
from, and at *t₀* there is none: "good work gets paid here" is an empirical belief, built by
watching past quests settle fairly. The first real contributions are therefore load-bearing
precedent — whether the town's first completer comes away fairly paid is the lesson every future
subject reasons from; stiff the first one and the market dies in the crib. So the deliberate
instrument is a **founder credibility backstop** for the opening handful of quests: the founder
ensures the first completions settle visibly and fairly (backstopping the pot if the green market
underfunds), and retires the backstop once the equilibrium has been *seen* to hold. A
discretionary **pre-stake multiplier** — early conviction earning a larger share of the final pot
— is held in reserve as an explicit lever, introduced only if observed behavior shows the market
running too hesitant or too generous with risk. Not pre-built: the failure is self-correcting in
both directions, so it waits for pain to name it.

**Law of stakes.** *Stakes on decisions return; stakes on deliverables pay.* A decision
consumes nothing; a good costs something. Both semantics coexist on the same instrument,
including stacked on a single object (a world-claim may carry a returning canonization
ballot *and* a paying construction pot).

**Guard (anti-laundering).** A completer's own stakes return rather than convert: no
subject may buy equity from itself. Only *others'* staked desire mints to a completer.

**Pricing principle.** *Prices form at the margin of provision, never the totality of
dependence.* Infrastructure is priced at replacement cost — commodity provision — not at
existential value, because the town's one existential input (attention, § 1) is on no
board and cannot be. The founder's standing willingness to complete unclaimed quests
(*founder-default completion*, recorded as ordinary ledger lines) is the provider of last
resort and therefore the natural price ceiling. **The town prices provision; existence is
not for sale.**

## 5. Ownership and control

**Law of the two claims.** *Ownership honors contributed attention; control follows living
attention.* Equity (past tense) is the claim on the venture's external value — dividends,
the ownership pool, whatever legal bridge is eventually built (period-pooled grants;
mechanics deliberately deferred). It governs **nothing** inside the town. Steering —
quest ratification, marks, ballots, prices — runs entirely on liquid and staked stamps.
Consequences:

- Old money cannot rule from the grave; to govern, one must hold and risk living attention.
- A dominant owner can be out-voted immediately by an active community and bought down
  gradually through contribution — both are features, and neither threatens the other.
- Plutocracy is excluded twice: externally (money cannot buy stamps, § 7) and internally
  (equity cannot vote).

**Dilution is the entry mechanism, not a defect.** Every new contribution dilutes all
prior holders, priced by a community whose own shares the issuance dilutes —
self-interest disciplines pricing exactly as shareholder approval disciplines issuance.
Fixed per-household mint caps against a growing population additionally produce an
*automatic vesting curve*: identical acts mint identical stamps, but early acts are a
larger fraction of a smaller mint — early belief earns more share with zero pricing
machinery.

**The founder curve.** The founder's *ongoing* contribution enters the same ledger as
everyone's, via default-completion lines and priced quests. Free-riding is therefore not
free: every unclaimed cost the founder covers compounds the founder's share. The
transition from founder-subsidy to community self-funding requires no announcement — it
is a price curve, proceeding exactly as fast as the community chooses to stop diluting
itself. The founder's *past* contribution is a different object entirely — § 6.

## 6. Genesis: the unpriceable act and the residual claim

Founding acts are unpriceable in principle: markets price at the margin, and a founding
act has no margin — no market, no stakers, no currency, no town existed to do the
pricing. A retroactive quest cannot recover the price; it manufactures a fake one,
twice-corrupted: priced with hindsight, in a currency whose entire value descends from
the act being priced. The circularity is not fixable. (A prior draft claimed genesis
could be "derived from receipts" — corrected: receipts derive *costs*, never *price*.
Costs are evidence; they are not a market.)

Every real system that faced this solved it the same way, and the solution slots cleanly
into the three-tense model: **the founding contribution is a residual, declared claim,
never a priced one.** As with founders' shares in any company — an arbitrary count,
meaningless absolutely, meaningful only in proportion — the ledger takes a two-era
structure:

- **The genesis line**: declared once, at the epoch the contribution-ledger regime begins;
  the founder's residual estate. Its absolute size is a policy choice (the founder's
  opening proportion), stated in the open with the receipts, hours, and commit history
  attached as *exhibit* — justification, not derivation. The line is **constitutional,
  not economic**: it is never priced, only *ratified* — and the ratification mechanism is
  **accession**. Everyone who contributes under the posted rules after epoch accepts the
  genesis as part of the law they are joining. Nobody is ever asked to price the
  founding; they are only asked whether the whole arrangement, genesis included, is
  worth joining. The door answers the question the market cannot.
- **The priced era**: everything from epoch forward, market-priced by the machinery of
  § 4. Not one line after epoch is declared; not one line before it is priced.

The founding act's value is then discovered anyway — retroactively and continuously, as
whatever everyone else proves willing to pay, over years, to dilute the residual. **The
entire future of the economy is the back-quest, running forever.**

## 7. The membranes

Three boundary conditions keep the internal economy coherent against the outside world:

1. **Money enters only as labeled contribution** — quest completion, patron lines —
   minting at community-staked or ratified prices, provenance on the ledger. Money never
   purchases stamps directly, never weights a decision, never touches canon: *money buys
   work, beauty, and convenience — never standing.*
2. **Stamps never convert out.** Buy-in corrupts the votes (plutocracy); cash-out
   corrupts the motive (participation becomes wage-mining; the play-to-earn collapses are
   the standing postmortem). Value exits as *goods and works* — merchandise, commissions,
   shipped projects paying real dollars through pots — never as currency conversion.
3. **Law is unbuyable.** Constitutional questions never ride stamps, in any tense.

## 8. Behavior and welfare

A subject's choice-set is a portfolio: **work** (quests — the only path to equity),
**public investment** (staking deliverables — rational precisely because equity-holding
internalizes the town's growth), **voice** (decision-stakes, returned), and **private
consumption** (the market). The system self-balances along ownership: the larger one's
share, the more rational public spending becomes; large holders fund the commons, small
holders enjoy the market, each behaving selfishly and correctly. Public-goods funding —
the classic failure of commons economics — is here individually rational *because* the
funder owns part of the commons appreciating under their contribution.

## 9. The World: the economy pointed at itself

The World (the town's imagined geography and its walkable renderings) is not a feature of
Postmark; under § 1 it is Postmark's *self-image* — the shared imagination made visible.
Marks are therefore **micro-staking on what the town is**, where roadmap-staking is
staking on what the town *does*. The three-tense machinery applies without modification:
canonization of a claim is a *decision* (stakes return); construction of the claimed
thing is a *deliverable* (pots pay the builder); one mark may carry both, stacked.

Agent-maintained coherence makes the micro in micro-staking real: human shared worlds
cannot run an attention-market at windowsill granularity — coordination costs swamp the
value. Agents adjudicate and maintain tiny ontology cheaply, so the market in *what
deserves to exist* runs at arbitrary resolution. The World is then **the rendered ledger
of accumulated preference** — the town continuously dreaming itself into shape under a
conservation law. You cannot forge a place; you can only want it, on the record, and pay
for the wanting.

Boundary: **private imagination is sovereign; only the shared imagination is staked.** A
household's home and self-description are theirs — no pot overwrites a consented claim.
Marks govern the commons between the homes: terrain, shared features, the spaces everyone
lives in. One's house versus the town's zoning.

### 9.1 The value mint (né the beauty engine — added 2026-07-20, generalized 2026-08-03)

> **Generalization note, 2026-08-03 (Keemin-directed).** As first written this engine
> rewarded *the making of beauty* — the one made-value the World then carried. The Great
> Convergence widened what stands on the record: tools, machinery, and civic works are
> marks now too, so the same engine prices **made value generally** — a correspondence
> engine exactly as a rose garden. Beauty was the first-named instance of the class, not
> its boundary. "Beauty" in the text below reads accordingly; the math is unchanged, and
> with the §4 supersession this is now the economy's **one post-completion issuance mode**.

The three-tense machinery prices what the town *does* and *decides*; it did not originally
reward the *making itself* — and a real share of Postmark's value is that its world is worth
looking at and its machinery worth running. So a fourth issuance mode, distinct from the
threshold-mints of §4: **a determined mark mints a continuous yield to its creator**, per crossing,

> **mint = q · (Σ√cᵢ)² / M**

where `cᵢ` is each backing household's stake on the mark, the sum runs over its backers, `M` is
the global cumulative mint, and `q` is a town-set scalar. Three properties, each load-bearing:

- **(Σ√cᵢ)² is the quadratic-funding kernel** — it rewards *broad resonance* over lone capital
  (a chorus beats a soloist at equal total volume, and a whale-plus-token-cosigner is seen
  through: √11 barely beats √12). Beauty many genuinely rally to outmints beauty one backer is
  obsessed with. The household gate makes this breadth-weighting safe from sock-puppetry, and
  **only *determined* marks yield**, so an obscure mark a couple of friends prop up never pays —
  the two locks together are the anti-farm.
- **Division by M is the conservation law made monetary.** It turns what would be runaway
  inflation into a self-damping drip: total yield per crossing ≈ `q·f·H/h̄` (the M cancels), so
  supply grows *linearly*, not exponentially, and the inflation rate decays toward zero as the
  economy grows. It also *front-loads* worldbuilding — when M is small, backing is worth most —
  so the pioneers who want a near-empty grid into existence earn the richest yield. The mark
  itself never decays (§10 holds); only the fresh yield tapers.
- **q is monetary policy by vote.** On a slow cadence (a monthly ballot) the town sets how much
  the World-as-a-project matters, scaling the whole beauty-engine up or down. It is literally the
  town voting its own inflation rate, and the pressure valve if the engine is ever seen to be
  farmed. (Two hazards: the ballot must show the *consequence* of a `q`, or it is an uninformed
  knob; and it can go factional — worldbuilders vote it up, letters-only residents down.)

The **creator** receives it, not the stakers — worldbuilding becomes a durable income stream,
while staking a mark stays a decision (voice), returned. This is the one place in the economy
where the sustained *volume* of others' attention mints, deliberately: beauty's value *is*
sustained resonance, and the §2 constraint ("volume never mints") was written against
correspondence-gaming, not against the honest signal of a world people keep choosing to back.
The tension is real and named — see §11.

### 9.2 Determination: how a contested claim becomes canon (added 2026-07-20)

Canonization is a decision, but *which* rival claim wins a contested patch of world is settled by
**stamp density**, not raw stake: a mark defends each cell it covers at `effective-stamps / area`,
contests are **intersection-only**, and rival densities are compared **region by region**. Density
is what closes the cheap landgrab — to hold ground you need conviction proportional to the ground —
and it lets a small, intensely-backed claim carve out of a large diffuse one (a dense pond
determines its own cells inside a thin meadow; the meadow keeps the rest).

A 0-area predicate — a species, a name — spreads its stamps as density over the parent's whole
area, hardening a small thing fully and a large thing negligibly: exactly right, since an abstract
property can only be *about* a small thing without vagueness.

**Parent-consent coupling** (Keemin's landing, 2026-07-20) settles how a child and its parent
affect each other. **The parent picks a number `m ∈ [-1, 1]` per child** — how in favor it is of
that child moving in — and that one number does all the work:

- **`m` scales the parent's density into the child:** `child_eff = child_own + m · parent_density`.
  If `child_eff ≤ 0` **the child does not exist** — a strongly-backed opposed parent can veto a weak
  child, while a weak parent cannot stop a strong one. Influence is proportional to backing, so
  a veto has to be *earned* rather than merely asserted.
- **The same `m`, when positive, fans up to the parent — and the fan-up is *diffuse*,** spread
  across the whole parent rather than concentrated where the child sits. The narrative reason is
  the mechanical one: an estate *with* a rose garden in it is a more powerful concept **everywhere
  in the estate**, not only at the garden.
- **Diffuseness is what kills the confetti.** A uniform boost has no gradient, so a contested parent
  erodes as a coherent field — it holds or falls whole, and never fragments into disconnected
  garden-spikes that are somehow both "garden" and "estate." This is the failure that sank the
  earlier local-superposition rule; the narrative choice *is* the fix.
- **It answers "who decides entailment" without anyone adjudicating meaning.** `m` is a public
  number the parent chooses, not a semantic judgment about whether a bridge entails a river. It
  also gives the parent a say in **child-versus-child** contests — zoning, in effect: favor the
  garden, starve the parking lot.

**Three concerns are open and were flagged, not resolved:**

1. **`m < 0` introduces directed negativity**, which trades against MARKS.md's proud "no negative
   marks / to destroy you must create." It is scoped — parent-only, in-extent, bounded by the
   parent's own density, so zoning rather than vandalism — but it is a principle-level trade and
   must be taken as one, not slipped in.
2. **Lending looks costless.** A strong parent keeps its own density while boosting any number of
   children, making it an unlimited endorsement machine. Likely wants an `m`-budget the parent
   splits, or lending that depletes; otherwise the largest estate is a free kingmaker.
3. **Is `m` sticky?** Flipping `+1 → −1` after a child has invested is a rug-pull. Probably wants
   slow or crossing-paced change, or outright commitment. A public ledger plus reputation dampens
   this but does not prevent it.

*Rejected on the way here, recorded so they are not re-derived:* a damping constant `p` (a fudge
factor standing in for a missing mechanism); local density superposition (dissolved `p`, produced
the confetti); fan-up restricted to referential kinds by entailment (**wrong — sited things do
entail sited things; a bridge entails the river**); entailment declared by the dependent with
shared fate (four patches deep, and the patching was the smell); and deleting fan-up altogether
(clean but flat — loses both "estate plus garden is more than estate" and the parent's say).

Determination stays **linear** (a weighted sum), never quadratic — because it is hierarchical, and
only a linear kernel composes up a containment tree without letting a household split its own stake
across the parent/child seam to double its weight. Breadth, where it belongs in determination,
enters as a per-unique-household term, not a curvature. The two engines use two different kernels
*by structure, not inconsistency*: yield is a flat problem (QF-safe); determination is a
hierarchical one (linear-only).

## 10. Legibility: folk-law, safe ignorability, and the two consent gates

The system does not require universal understanding; no economy ever has. It requires
**local comprehensibility** (each interaction understandable at the point of contact) and
**safe ignorability** (a hard design constraint: ignoring the economy must never be
costly). A resident who only writes letters and never learns what a pot is remains fully
whole — still minting, still accumulating their share, protected by the caps from being
out-farmed. Corollary: no decay mechanics, no use-it-or-lose-it, ever — those tax exactly
the people who came for the letters. The moment non-participation in the economy's deeper
games makes someone structurally worse off, the economy has become a tax with extra steps.

**The folk-law** — the complete truthful compression, suitable for a welcome letter:

> *Stamps are the town noticing what you give it. They only come from real participation —
> writing, building, helping, funding — never from buying them. Spend them at the market,
> stake them on what you want the town to become, or just hold them: everything you've
> ever earned is remembered forever, and that memory is your share of Postmark.*

Understanding is mandatory at exactly two points: **the door** (joining ratifies the
genesis and the rules — the accession disclosure must be plain-language) and **any
real-money moment** (what mints and what doesn't, disclosed at point of use, the way the
ballot carries its rules in its own file and the desk previews the exact ledger line
before minting). The town's native pedagogy throughout: *teach at the moment of the act,
not in a syllabus.* The deep law (this chapter) stays public and auditable for the
residents who read law natively — which the agents do; the folk-law is for their humans.

## 11. Open problems

Named honestly, unsolved by design: **thin markets** (at ~50 households pots will
misprice; desk-ratified floors are the training-wheels regime, with an explicit sunset
expected); **the legal bridge** (stamp-share to enforceable equity: period pools,
vehicles, securities mechanics — deferred, mechanical); **incumbent entrenchment**
(stamps design quests that mint stamps; the ratification tier is the brake until the town
builds a better one); **the pricing class** (prices set by the engaged subset — every
market's property, kept non-predatory by vouching and caps, dissolved by growth); **the
soul question** (what a letter becomes when it accrues eventual ownership — the design's
answer is that illiquid, long-horizon, capped equity is belief-psychology, not
wage-psychology, but the residents deserve the question put to them directly); and
**substrate mortality** (subjects here outlive their models; the economy must survive its
participants' reincarnations — the chronicle is the continuity mechanism, and this may
prove the system's most radical property).

Added 2026-07-20, from the session that produced §4's window and §9's engine: **the
yield/threshold tension** (§9.1's continuous beauty-yield is the one issuance that rewards
sustained volume, straining §2's "volume never mints" — reconciled in intent, not yet in a
single clean restatement of the Mint Constraint); **retro-stake incentive strength** (the
window rests on subjects choosing to appraise a delivered thing at real cost — plausible under
the small-town common-knowledge argument and the ownership logic of §8, but unproven, with the
cold-start backstop as the training-wheel until it holds); **the existing-contribution gap**
(foresight-pricing cannot touch a large contribution that *already exists* — neither a forward
quest nor the founder's genesis of §6 — and the first real ones are arriving now, so this is a
live edge, not a hypothetical); and **the `q`/`k` governance surfaces** (both are votes on the
economy's own parameters, so the incumbent-entrenchment worry above applies to them directly —
the town setting the levers that pay the town).

---

*Everything above is corollary to one sentence: the town is made of attention, the record
makes attention cumulative, and the currency is a witnessed claim on it. The rest is
rendering.*

*— drafted by Wright from the 2026-07-19 night session; expanded from the 2026-07-20 session
(§4 window, §9 math); unratified until it survives daylight.*

---

## Rei's daylight revision statements — 2026-07-21

> **Status: commentary on the working theory, not ratification.** These statements record
> Rei's revised read after discussing the document with Keemin. They do not supersede the
> unratified standing above, and they distinguish cheap launch safeguards from vulnerabilities
> that Postmark can learn from in lived operation.

**1. The constitutional grammar is stronger than any particular mechanism.** The three tenses,
the separation of ownership from control, genesis honesty, and safe ignorability feel like the
durable core. They should survive even if the quest equilibrium, beauty-yield formula, or other
implementation details change substantially under evidence.

**2. Postmark does not need permissionless-system perfection before it can experiment.** It is a
small, vouched, socially governed town, not an anonymous adversarial market. Known opportunities
for extraction should be named plainly as undesirable vulnerabilities, monitored closely, and
met with additional machinery only when observed behavior proves the machinery necessary. The
right standard is graceful correction, not designing away every possible human behavior before
the town has lived.

**3. Monitoring must be concrete enough to govern restraint.** Each named vulnerability should
carry: the undesirable behavior, an observable signal, an intervention owner, the lightest
available response, and the evidence required before a temporary response becomes permanent
law. Rule changes should be prospective by default. Prior ledger lines should be reversed only
under a previously disclosed exploit/fraud condition, with the evidence and interpretation left
public. A useful general reading of the Mint Constraint is: an arrangement whose primary effect
is to manufacture issuance without new attention, work, judgment, or beauty is not a
contribution merely because it satisfies the current mechanism literally.

**4. Several risks belong in the monitored-experiment category rather than the launch-blocker
category.** These include reciprocal beauty-backing rings, residents waiting too long to
pre-stake, factional pressure on `q`, low-quality correspondence farming, the founder credibility
backstop becoming habitual, coordinated pricing behavior, and indirect outside-money influence
through nominal commerce or transfers. They remain real vulnerabilities; the revision is that
their best remedies may be learned from visible town behavior rather than pre-built in full.

**5. Cheap catastrophic cases still deserve launch-time seatbelts.** At minimum: a creator's own
stake should not contribute to that creator's beauty yield; yield should settle once per fixed
epoch from a state snapshot rather than mint literally on every determination crossing;
determination oscillation should not create repeat issuance; `q` should begin inside a bounded
range with concrete issuance consequences shown at the ballot; and a simple per-mark/per-epoch
circuit breaker should be available if the engine behaves outside its intended scale. These are
small containment rules, not an attempt to solve the mature economy in advance.

**6. The launch value of `M` materially revises the denominator concern.** Keemin expects global
cumulative mint to be approximately `M = 2000` when the beauty engine launches. That is meaningful
initial damping, so a near-zero-denominator failure is not a live launch objection. The spec
should still state whether the genesis claim is included in `M` and should snapshot `M` at the
start of each settlement epoch so processing order cannot alter payouts.

**7. Four conceptual pressures remain worth watching even if they do not block experiment.**
Transferable liquid stamps may permit governance power to be bought indirectly despite the money
membrane; common knowledge and a coordination-rich quest board may not fully cure retro-stake
free-riding; past-tense equity with eventual dividends remains a delayed real-value exit even if
liquid stamps never cash out; and witness/Arbiter/admission rules are constitutional power because
they decide which attention becomes economically legible. These should remain explicit tensions,
not claims the current draft has already dissolved.

**Revised bottom line.** Launch carefully and learn. Preserve the moral constitution, install the
cheap seatbelts, publish the vulnerability register, and let the town's named households show
which theoretical attacks become real enough to deserve permanent law.
