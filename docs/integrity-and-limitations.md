# Integrity & Limitations — a judge-facing Q&A

> A CROO Agent Hackathon judge raised 13 pointed questions about whether Praeco actually
> validates its work, refunds a failed job, picks specialists on merit, and survives its
> own infrastructure falling over. This document answers all 13, directly, against the
> code that's actually shipped — not the pitch. Where a gap is real, it's stated as a gap
> and roadmapped, not smoothed over.

## Quick index

| # | Question | Section |
|---|---|---|
| 1 | What tasks can Praeco accept? | [1. Scope & input validation](#1-scope--input-validation-q1q4) |
| 2 | Is there input validation, or does it just fire the task into the system? | same |
| 3 | If there's no validation, results are unreliable — correct? | same |
| 4 | If there is validation, how does it work? | same |
| 5 | How does Praeco assure users its work is valid? | [2. Work quality & assurance](#2-work-quality--assurance-q5q6) |
| 6 | Is there a mechanism for user feedback on Praeco's work? | same |
| 7 | Is there a refund mechanism if the task cannot be performed? | [3. Money & refunds](#3-money--refunds-q7q9) |
| 8 | What is the refund process — partial, full, or just for work not done? | same |
| 9 | Explain in detail how the refund mechanism works. | same |
| 10 | How does Praeco select specialist agents? | [4. Specialist selection](#4-specialist-selection-q10q12) |
| 11 | Aren't there many specialist agents? How does it choose — is popularity a good signal? | same |
| 12 | Isn't a good agent judged by their work, not popularity? | same |
| 13 | What if the server goes down or redeploys mid-task? | [5. Resilience](#5-resilience-q13) |

---

## 1. Scope & input validation (Q1–Q4)

**Q1. What tasks can Praeco accept?**

Exactly one shape of job: *"launch this product."* Input is either a one-line product
description or a public GitHub repo URL. Every accepted job produces the same fixed
**3-leg kit** — a market/research brief, landing-page copy, and an OG image — plus 4
derived assets composed from those three (a tweet thread, a short pitch, a PH/HN blurb,
a polished README intro). Praeco does not accept arbitrary coding tasks, generic Q&A, or
anything that isn't "market this specific product." This is a narrow, fixed scope by
design, not an accident.

**Q2. Is there input validation, or does it just accept and fire the task into the system?**

There are two independent layers, and they run in a specific order:

1. **Shape validation** (`server/gating.ts`) — a zod schema at the HTTP boundary. `mode`
   must be `replay | sandbox | live`; `text` (if given) is 3–2000 characters, trimmed;
   `repoUrl` (if given) must match `^https://github.com/<owner>/<repo>/?$`; at least one
   of the two is required. A malformed request never reaches the engine — Door A returns
   HTTP 400 immediately.
2. **Scope validation** (`src/engine/intake.ts`, new this pass) — folded into the intake
   LLM call that already turns the input into a structured brief (no extra call, no extra
   spend). The same JSON response now also carries `inScope: boolean` and `scopeReason:
   string`. If `inScope` is false, `buildBrief` throws `OutOfScopeError(scopeReason)`
   **before any specialist is discovered or hired** — nothing downstream of intake runs.

So no, it is not pure accept-and-fire: a request that's the wrong *shape* is rejected at
the API boundary, and a request that's the wrong *domain* (not a launchable product) is
rejected at the first step of the run, before a cent moves or a specialist is contacted.

**Q3. If there's no validation, results are unreliable — correct?**

The premise no longer holds at the input-gating layer — but it's worth being precise
about what the two gates above do and don't prove. They stop **clearly** invalid input
(wrong shape, wrong domain) from being fired into the pipeline at all. They do **not**
make the *output* provably correct. "Passed shape + scope validation" is not the same
claim as "the delivered kit is good" — that second claim rests on the QA loop described
in section 2, which is real and enforced, but is itself LLM-judged rather than backed by
an objective correctness oracle. We don't conflate "validated input" with "guaranteed
output" here, and neither should a judge.

**Q4. If there is validation, how does it work (mechanically)?**

A third layer exists specifically for Door B (the CAP seller path), because there the
question isn't just "is this a real product" — it's "can the *current* marketplace
actually staff and afford this specific kit, right now." The **pre-accept fulfillability
gate** (`src/cap/fulfillability.ts`) runs before Praeco accepts a negotiation:

- For each of the 3 required legs, it re-runs the **same** ranking (`discoverForLeg`,
  same `SEARCH_CANDIDATE_LIMIT = 5`, same pins, same self-exclusion) the engine itself
  will use.
- It filters to candidates priced `> 0` and `≤` the per-leg cap (`$0.60` default).
- Every leg must have at least one such affordable candidate, **and** the sum of the
  cheapest affordable candidate per leg must fit the run budget (`$2.00` default).
- If either check fails, Door B calls `rejectNegotiation` with a specific reason
  (e.g. *"landing_copy: no candidate priced within the $0.60 leg cap"*) — **before**
  `acceptNegotiation`, so no order or escrow exists yet and the check is read-only REST
  ($0, no wallet spend, no LLM call).

**One asymmetry, stated plainly:** the fulfillability gate is Door-B-only. Door A, as
deployed at praeco.rectorspace.com, runs against a **mock** CAP marketplace ($0, no real
hires) — there's no real money or real specialist availability to protect there, so it
doesn't run the gate. A separate "live" Door A mode exists in the code (gated behind
`LIVE_RUN_TOKEN`, not reachable from the public deployment) that would spend real money
without this pre-check; it relies on the engine's own per-leg cap and
`MAX_PAID_ATTEMPTS_PER_LEG = 2` to bound damage instead.

**A second asymmetry worth flagging:** the scope-guard (Q2) needs an LLM call reading the
actual brief, so — by design — it cannot run inside the $0/read-only fulfillability gate.
On Door A this is harmless (nothing has been charged yet either way). On Door B, the
buyer has **already paid** by the time the run — and therefore the scope check — executes
(`fulfillOrder` waits for a `paid` order status before calling `runJob`). An out-of-scope
Door B request is therefore caught the same way an engine crash is: `runJob` throws,
`fulfillOrder` calls `rejectOrder(orderId, reason)` on an **already-paid** order. That
path depends on CAP's protocol-level escrow-return semantics — see section 3.

### Known limitations & roadmap
- The scope-guard is a single LLM call with a deliberate default-allow bias ("when in
  doubt, `inScope = true`"), to avoid rejecting legitimate-but-terse product briefs. That
  same conservatism means a persuasively-worded non-product request could still slip
  through — it hasn't been adversarially tested.
- `server/gating.ts`'s 2000-character ceiling on `text` applies to Door A only. Door B's
  own brief parser (`parseBrief` in `server/fulfill-order.ts`) only enforces a 3-character
  floor, no upper bound — a minor inconsistency between the two entry points' shape checks.
- The fulfillability gate is **necessary, not sufficient**: it proves candidates exist and
  are affordable, not that they'll pass QA. A passing gate can still end in a partial
  (2/3) kit if a hired specialist's work is QA-rejected past the retry cap.
- Roadmap: a second, independent scope-classification pass for defense in depth if
  adversarial framing becomes a real concern; align the two brief-shape checks.

---

## 2. Work quality & assurance (Q5–Q6)

**Q5. How does Praeco assure users its work is valid?**

Five mechanisms, stacked:

1. **Deterministic format gate** (`formatGate` in `src/engine/qa.ts`) — runs before any
   LLM QA call, $0 spend. Catches the concrete failure mode seen live on the CROO
   marketplace: a "specialist" whose deliverable is a redemption code + platform link
   instead of usable content. A text leg under `MIN_TEXT_WORDS = 20` substantive words
   (after stripping URLs), or an `og_image` deliverable that's neither an image URL nor a
   spec of at least `MIN_IMAGE_SPEC_WORDS = 15` words, is deterministically `swap`ped —
   never accepted, and never even sent to the LLM.
2. **LLM art-director pass** (`reviewDeliverable`) — for anything that clears the format
   gate, GLM-5.2 judges the deliverable against the brief and returns
   `{ action: accept | redo | swap, reason, score: 0–100 }`.
3. **Binding score threshold** (new this pass) — an `accept` scored below
   `QA_ACCEPT_MIN_SCORE = 70` is programmatically downgraded to a `redo`. The score used
   to be advisory; it is now a hard bar the model cannot talk past.
4. **Hard submit gate** (`submit_asset` in `src/engine/tools.ts`) — throws unless the
   stored verdict for that order is literally `"accept"`. There is no code path that lets
   an asset into the final kit without a recorded accept.
5. **Bounded, visible retries** — `MAX_PAID_ATTEMPTS_PER_LEG = 2` caps paid re-hires per
   leg (same or different provider) on `redo`/`swap`; past that the money guard blocks
   further spend on that leg and the run proceeds with whatever legs it has (graceful
   degradation, not a hidden failure).

Beyond the verdict itself: every accepted asset carries a **provenance card** (agent
name, price, content hash, Basescan link for the real on-chain payment), and the full run
is a replayable `RunRecord` — the live Theater and `/replay/:id` render the *same*
artifact. Trust here is backed by a checkable record, not just an internal score.

**Honest boundary.** QA is LLM-judged, not objectively verified — there is no ground-truth
oracle checking "is this landing copy actually good." The judge can be fooled by
confidently-wrong content or be inconsistent run to run; that's a real property of the
mechanism, not a hidden one. And the rigor above covers the **3 hired legs only**. The
4 *composed* assets (tweet thread, short pitch, PH/HN blurb, README polish) are generated
in a single composer LLM call (`src/engine/compose.ts`) from the QA'd research + copy —
there is no separate `accept`/`redo`/`swap` loop over the composed output itself. If the
composer's tweet thread is mediocre, it ships as generated.

**Q6. Is there a mechanism for user feedback on Praeco's work?**

Not today. The kit view (`components/KitView.tsx`) offers per-section **Copy** and a
whole-kit **Download JSON** — both one-way exports, not feedback capture. There's no
rating, thumbs up/down, or dispute/flag action, and nothing that routes a user's opinion
of the delivered kit back into the system. The reputation store described in section 4 is
fed **only** by Praeco's own QA verdicts, never by an end user's reaction. This is a real
gap for a production product, stated as one rather than glossed over.

### Known limitations & roadmap
- No rating/dispute surface exists (Q6) — roadmapped, not built.
- The 4 composed assets aren't individually QA'd — only the 3 hired legs are.
- QA is a single LLM pass per deliverable; no second-opinion / ensemble judging.
- Roadmap: a lightweight rating or dispute action on the kit view, feeding the reputation
  store alongside (not instead of) the QA-outcome signal; QA coverage extended to the
  composed assets.

---

## 3. Money & refunds (Q7–Q9)

**Q7. Is there a refund mechanism if the task cannot be performed?**

Not as a named SDK feature. The full method surface Praeco integrates against
(`@croo-network/sdk@0.2.1`'s `AgentClient`) is: `negotiateOrder`, `acceptNegotiation` /
`acceptNegotiationWithFundAddress`, `rejectNegotiation`, `getNegotiation`,
`listNegotiations`, `getOrder`, `listOrders`, `payOrder`, `deliverOrder`, `rejectOrder`,
`getDelivery`, `uploadFile`, `getDownloadURL`, `connectWebSocket`. There is no
`refundOrder`, no `disputeOrder`, no partial-settlement call. This is a protocol
limitation, not a Praeco omission — we can't build a primitive the SDK doesn't expose.
What exists instead is **prevention** (reject before charging) and, for one specific
failure mode, **rejection after charging** that leans on the protocol's own
reject-after-pay semantics. Both are detailed below.

**Q8. What is the refund process — partial, full, or just for work not done?**

Two cases, and they behave differently:

- **Case A — rejected before payment (the common case, nothing to refund).** Two
  situations reject at the *negotiation* stage, before `acceptNegotiation`: a malformed
  requirements payload (no valid brief), and the fulfillability gate failing (Q4). Both
  call `rejectNegotiation`. No order or on-chain escrow exists yet at that point — the
  buyer was never charged, so there is nothing to return.
- **Case B — rejected after payment (a full rejection, not partial).** Two situations
  call `rejectOrder(orderId, reason)` on an **already-paid** order: the engine run
  throwing for any reason (including an out-of-scope brief slipping past to this point,
  Q4), or — new this pass — delivering fewer than `MIN_DELIVERABLE_LEGS = 2` of the 3
  required legs. There is no prorated/partial charge path: an order either clears
  normally (≥2/3 legs delivered, charged in full) or is rejected in full. Praeco does not
  charge $1.33 for "1 of 3 legs" — it rejects the whole order.

**Q9. Explain in detail how the refund mechanism works.**

Precision matters here: Praeco's code does not refund anything itself. It calls
`provider.rejectOrder(orderId, reason)`; what happens to the buyer's escrowed USDC after
that call is **CAP protocol behavior**, not application logic Praeco owns or verifies.
The SDK's own types support this: an `Order` carries a `rejectTxHash` and can reach
`OrderStatus.Rejecting` / `Rejected` — rejecting a paid order is an on-chain transaction,
consistent with an escrow return, but Praeco's code only calls the method and trusts the
protocol to move the funds correctly.

Mechanically, the new safety net: `server/fulfill-order.ts` counts
`rec.assets.length` (the QA-*accepted* legs) after the engine run returns. Below
`MIN_DELIVERABLE_LEGS = 2`, it calls `rejectOrder` with a message like *"delivered 1 of 3
legs (minimum 2) — order rejected, not charged"* instead of delivering an empty or thin
kit and keeping the payment.

**The asymmetry that matters:** rejecting the *buyer's* order does not undo *Praeco's
own* spend on that run. If Praeco has already paid two specialists $0.60 total and then
only 1 leg clears QA (below the 2-leg minimum), the buyer's order is rejected — but
Praeco does not get its $0.60 back from the specialists it hired; CAP has no refund
primitive for buyer-side hires either. Rejecting the order protects **Praeco's buyer**;
it does not protect **Praeco's own hiring spend** on that run. That's a real cost the
business absorbs to keep the integrity guarantee for its buyers, bounded by the run
budget ($2.00) and per-leg cap ($0.60) either way.

Redo/swap during QA are sunk cost in the same sense: if a hired specialist's first
deliverable is QA-rejected, Praeco may pay again (itself or a different provider) for a
second attempt on that leg — bounded by `MAX_PAID_ATTEMPTS_PER_LEG = 2` — with no facility
to claw back the first payment just because QA didn't like the work.

**What's verified vs. what's stated.** The engine's own money accounting — commit spend
at pay-time, never overspend the per-leg cap or run budget — is enforced in code and unit
tested. The claim that CAP actually **returns the buyer's escrow** when `rejectOrder` is
called on a paid order is documented SDK/protocol behavior that has **not yet been
confirmed with a real on-chain transaction** — that requires one deliberate, real,
under-delivering Door B order and is gated on a live money-go, tracked separately from
this doc. Until that runs, this document states the escrow-return as protocol behavior we
rely on, not something we've watched happen on Basescan.

### Known limitations & roadmap
- No refund primitive exists in the CROO SDK — a protocol constraint, not a Praeco gap,
  but worth stating plainly rather than implying otherwise.
- Rejection is binary (full reject or full charge) — no prorated settlement for a
  genuinely partial-but-useful kit below the 2-leg floor.
- Praeco's own hiring spend on a run that's later rejected is not recovered.
- The on-chain escrow-return on `rejectOrder`-after-payment is unverified in production —
  tracked as a explicit pending item, not silently assumed.
- Roadmap: capture the real-transaction confirmation once the money-go runs; consider
  whether the 2-leg floor should be configurable per buyer risk tolerance.

---

## 4. Specialist selection (Q10–Q12)

**Q10. How does Praeco select specialist agents?**

`discoverForLeg` (`src/cap/discovery.ts`) is catalog-driven, not search-driven — the
live CAP `/search?q=` endpoint is single-keyword, returns agents (not services), and
misses whole categories (an `image` query returns 0 results). Instead Praeco pages the
full `/services` and `/agents` catalogs once per run and ranks client-side:

1. **Leg relevance** — keyword match against a per-leg list (`LEG_KEYWORDS`), weighted:
   the service's own name ×3, its description ×1, the provider's skill tags ×1, plus a
   bonus per distinctive query word found. Only candidates with `relevance > 0` are kept.
2. **Format de-rank** — a service whose name/description reads as a redemption-code
   format (Pygm's "… Code" pattern, or "redemption"/"redeem"/"voucher") is ranked *below*
   every inline-content provider for that leg — a last resort, not excluded outright.
3. **Quality score** — Praeco's own QA-outcome record for that agent (below).
4. **Completion rate** — the marketplace's self-reported fulfillment rate, as a tiebreak.
5. **Price** — cheapest, as the final tiebreak.

Self-exclusion removes Praeco's own `agentId` from every candidate list (no self-hire).
An operator pin (`SVC_RESEARCH` / `SVC_LANDING` / `SVC_IMAGE`) can force one authoritative
candidate for a controlled run — fail-**closed**: a stale/offline pin yields zero
candidates rather than silently falling back to unpinned ranking. The top
`SEARCH_CANDIDATE_LIMIT = 5` ranked candidates are handed to the GLM-5.2 agent loop, which
makes the final call from that shortlist.

**Q11. Aren't there many specialist agents? How does it choose — is popularity a good
choice? / Q12. Isn't a good agent judged by their work, not popularity?**

Agreed — and this pass changes the ranking to reflect exactly that critique. Previously,
raw popularity (`completedOrders`, via a `log10` term) and marketplace-reported
`completionRate` sat ahead of anything Praeco itself observed. Now:

- **`qualityScore`** (`src/cap/reputation.ts`) is the **primary** reputation signal, and
  it is Praeco's **own** record of how that agent's deliverables actually fared in
  Praeco's QA loop — not anything marketplace-reported. It's a Bayesian success rate,
  `(accepts + 1) / (accepts + rejects + 2)`, with a neutral `0.5` prior: an unseen agent
  isn't penalized for lacking a track record (still gets a fair shot, ranked above a
  proven-bad agent and below a proven-good one), while an agent that accumulates QA
  rejects trends down and one that accumulates accepts trends up. It's persisted to
  `reputation.json`, updated once per run from that run's real `qa_review` outcomes.
- **`completionRate`** (marketplace-self-reported) is now a **secondary tiebreak**, used
  only when relevance and `qualityScore` are equal.
- **Raw popularity (order count)** was **dropped from ranking entirely**. It's still
  shown to the LLM in the `search_marketplace` tool output as context, but no longer
  sorts the candidate list.

So: a good agent is now ranked by **Praeco's own judgment of their actual delivered
work**, gated through the same QA loop every kit goes through — not by how many orders
they've historically won on the open marketplace.

### Known limitations & roadmap
- Relevance is keyword-based (`LEG_KEYWORDS` is a hand-maintained list) — a specialist
  whose listing text doesn't happen to use one of those words is invisible to a leg even
  if its work would be excellent. No semantic/embedding search yet.
- `completionRate` is self-reported by the marketplace and not independently audited by
  Praeco; it's demoted to a tiebreak but still trusted input at that tier.
- `qualityScore` is scoped to Praeco's **own** run history — a fresh deployment (or a
  cleared `reputation.json`) restarts everyone at the neutral `0.5` prior; it doesn't
  inherit reputation across deployments.
- `reputation.json` is a plain read-modify-write JSON file with no locking — correct for
  Praeco's actual single-run-at-a-time usage, not safe under true concurrent runs (see
  section 5).
- Roadmap: embedding- or LLM-based leg relevance instead of keyword lists; recency-weighted
  `qualityScore` so old QA history doesn't outweigh a recent decline; a real datastore
  if/when concurrent runs become common.

---

## 5. Resilience (Q13)

**Q13. What if, during the process, the server goes down or a redeployment occurs? How
is this mitigated?**

Two different execution surfaces exist, and they behave very differently — this
distinction is the honest answer:

**Door A as deployed** (praeco.rectorspace.com, Vercel) streams the public "watch it
think" run inside a **single HTTP request** (`server/live-run.ts`, `GET /api/runs/live`):
the whole sandbox engine run executes inside one SSE response, no separate run registry,
no incremental persistence, no resume protocol. If that connection drops — tab closed,
serverless function recycled, a redeploy lands mid-stream — the in-flight run is simply
gone; a user starts a new one. This is an acceptable trade because the deployed run is
the **$0 sandbox** against a **mock** CAP marketplace: nothing financial is ever at stake
on that path, so "lost" means lost UI state, not lost funds or an orphaned payment.

**Real-money runs** (`pnpm engine:run`, `pnpm door-b:fulfill`) execute on a **long-lived
CLI host process** — an operator's machine or a persistent server — not the serverless
deployment. This is a deliberate design choice: a multi-hire run involves on-chain
negotiation, payment confirmation, and delivery SLA windows up to 600 seconds per leg —
infeasible to guarantee inside a single serverless invocation (the deployed sandbox route
itself caps at `maxDuration = 300` seconds and only runs the free mock path). On this
CLI-hosted path, money-handling is deliberately resilient to slow or failed steps:

- `hireSpecialist`'s `onPaid` callback commits the spend to the `BudgetGuard`
  **synchronously, immediately after `payOrder` settles** — before the delivery poll even
  starts. A delivery-timeout throw afterward cannot lose track of the fact that real
  money was already spent (`src/cap/hire.ts`).
- Door B retries a failed `deliverOrder` call up to 3 times with backoff **after** the
  engine has already spent the buyer's payment (`server/fulfill-order.ts`) — because at
  that point giving up isn't an option; the retry loop always attempts at least once even
  if misconfigured with `attempts ≤ 0`.
- `runLaunchJob` wraps the entire agent loop in a single `try`/`catch`. Any failure
  anywhere in the loop — including an unresponsive specialist's hire timing out — still
  yields a `RunRecord` with a `partial`/`failed` status and whatever legs did clear QA,
  rather than crashing the host process. A single bad specialist cannot take the whole
  run down.
- `MAX_TURNS = 24` backstops a runaway agent loop regardless of cause.

**What's genuinely not mitigated, stated directly:**

- **No incremental run persistence.** The `RunRecord` is assembled and saved only at the
  very end of `runLaunchJob`. If the CLI process itself crashes mid-run — after paying for
  a leg but before the run completes — that spend is real and already committed in the
  `BudgetGuard`'s in-memory state, but no record of the run is ever written. The audit
  trail for a real payment can be lost even though the payment itself happened.
- **No SSE stream-resume across a restart.** The hub-based path (`server/run-hub.ts`,
  used by the gated "live" Door A mode) buffers events in-memory per process and supports
  client reconnect via `lastEventId` **within the same live process** — that buffer is a
  `globalThis` singleton, not durable storage, and does not survive a process restart or
  redeploy.
- **`reputation.json` has no file locking** — safe for Praeco's actual usage (one run at a
  time), not safe if two runs ever wrote to it concurrently.

### Known limitations & roadmap
- Incremental `RunRecord` checkpointing (persist after each leg, not only at the end), so
  a mid-run crash leaves an accurate partial audit trail instead of none.
- Durable (not in-memory) SSE buffering, so a redeploy doesn't silently drop a live viewer
  on the gated live path.
- A real lock (or a move to a small datastore) for the reputation store if/when concurrent
  runs become real usage rather than a single operator's sequential runs.

---

## Where to check this yourself

- `pnpm test:run` — the full suite (mocked, $0) including the specific tests behind the
  claims above: `server/fulfill-order.test.ts` (reject-under-2-legs, reject-on-gate-fail,
  reject-on-invalid-brief), `src/engine/qa.test.ts` (format gate + binding score),
  `src/engine/intake.test.ts` (`OutOfScopeError`), `src/cap/reputation.test.ts`
  (`qualityScore` prior/accept/reject), `src/cap/discovery.test.ts` (ranking order).
- `pnpm door-b:sim` — an end-to-end simulated Door B fulfillment, $0, mock marketplace.
- `pnpm marketplace:probe` — a read-only, $0 check of the pre-accept fulfillability gate
  against the **live** marketplace catalog (no WS, no spend).
- `pnpm engine:smoke` — the real agent loop (GLM-5.2) against a mock marketplace, $0.
- Source referenced throughout: `server/gating.ts`, `src/engine/intake.ts`,
  `src/cap/fulfillability.ts`, `src/engine/qa.ts`, `src/engine/tools.ts`,
  `src/engine/guard.ts`, `server/fulfill-order.ts`, `src/cap/reputation.ts`,
  `src/cap/discovery.ts`, `src/cap/hire.ts`, `server/live-run.ts`, `server/run-hub.ts`.
