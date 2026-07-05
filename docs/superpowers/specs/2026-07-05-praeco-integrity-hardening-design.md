# Praeco — Integrity Hardening (design spec)

**Date:** 2026-07-05
**Status:** approved (brainstorming), pending implementation plan
**Author:** RECTOR + CIPHER

## Motivation

A code-grounded audit (five parallel investigations across intake, QA, money, discovery, and resilience) surfaced real gaps that a hackathon judge — or a paying user — would probe. This spec hardens the five that matter most before the CROO Agent Hackathon deadline (2026-07-12). Each decision below was reviewed and approved.

The sharpest finding: Praeco markets *"it never charges for a kit it can't deliver,"* but that is only true **pre-acceptance** (the fulfillability gate). **Post-acceptance**, a graceful engine failure (0 legs composed) still calls `deliverOrder` with an empty *"No composed kit was produced"* note and keeps the buyer's payment — because only a thrown exception triggers `rejectOrder`. This already happened on-chain (order `35673686…`, 0/3 legs). Fix 1 closes it.

## Goals

1. Stop charging buyers for under-delivered kits (make the money claim true).
2. Reject clearly out-of-scope intake instead of firing a run on nonsense.
3. Make the QA score binding, not decorative.
4. Base specialist reputation on **our own QA judgment of actual work**, not marketplace-self-reported popularity.
5. Publish an honest judge-facing Q&A that reflects these fixes and roadmaps the rest.

## Non-goals

- Building a buyer-side refund primitive (the CROO SDK exposes none; escrow-return on non-delivery is protocol behavior we rely on, not code we own).
- Durable/queue-based serverless execution (real-money runs stay on the long-lived CLI host; the deployed web app remains the `$0` sandbox).
- A user-facing feedback/rating UI (roadmapped, not built here).
- Any change to the pins / self-exclusion / fail-closed contract, or to the money guard's per-leg cap ($0.60) and run budget ($2.00).

## Test & rollout strategy

Everything is built TDD with **$0 mock/unit tests**. The single step that needs real USDC — confirming CAP returns the buyer's escrow on `rejectOrder` after payment (Fix 1) — is **gated on RECTOR's money-go**; the code and sim tests land now, the on-chain confirmation follows. Green (`pnpm test:run` + `pnpm typecheck` + `next build`) before every commit; one logical unit per commit; branch → PR → merge.

---

## Fix 1 — Door B rejects under-delivered orders

**Files:** `server/fulfill-order.ts`, `src/constants.ts`, `server/fulfill-order.test.ts`

**Behavior.** After `runJob(input)` returns `rec`, count delivered legs = `rec.assets.length` (the QA-accepted per-leg assets composed into the kit, from `run.ts` graceful-degradation logic). If `rec.assets.length < MIN_DELIVERABLE_LEGS` → call `provider.rejectOrder(orderId, reason)` and return `{ status: "rejected", orderId, reason }`. Otherwise deliver as today.

- New constant: `export const MIN_DELIVERABLE_LEGS = 2;` (in `src/constants.ts`). Deliver+charge only on 2/3 or 3/3; reject on 0/3 or 1/3.
- Reason string is specific and actionable: `` `delivered ${n} of ${REQUIRED_LEGS.length} legs (minimum ${MIN_DELIVERABLE_LEGS}) — order rejected, not charged` ``.
- The existing `rejectOrder`-on-`runJob`-throw path (intake/scope failures) is unchanged; this adds a second reject trigger for graceful under-delivery.

**Edge cases.**
- `rec.status === "failed"` with 0 assets → `< 2` → reject.
- Exactly 2 assets (a genuine 2/3 partial) → deliver (real, provenance-backed value).
- The buyer has already paid at this point (we waited for `PAID_STATUSES`); `rejectOrder` after payment relies on CAP escrow returning to the buyer on non-delivery ("no proof, no payment"). **This escrow-return is protocol behavior, verified on-chain later (money-gated).**

**Tests.** Update the existing "still delivers a partial run with a note" test — a 0-asset run now expects `status: "rejected"` (not delivered). Add: 1-leg → rejected; 2-leg → delivered; 3-leg → delivered. Assert `rejectOrder` (not `deliverOrder`) is called below threshold.

**Invariant closed:** "Praeco never charges for a kit it can't deliver" becomes true post-acceptance, not just pre-acceptance.

---

## Fix 2 — Intake scope-guard

**Files:** `src/engine/intake.ts` (brief schema + prompt + `buildBrief`), a new `OutOfScopeError`, Door A error surfacing (`server/live-run.ts` / the run routes), `src/engine/intake.test.ts`

**Behavior.** Extend the **existing** intake LLM call (no extra call): add `inScope: boolean` and `scopeReason: string` to `briefSchema`. The intake prompt instructs the model to set `inScope=false` **only** for a clear non-product / out-of-launch-scope request (e.g., "write me a smart contract", gibberish), and to default `inScope=true` when uncertain (conservative, low false-positive).

`buildBrief` throws `OutOfScopeError(scopeReason)` when `inScope === false`, using the **same throw-propagation path** as existing intake failures (unreadable repo, missing input) so no new error plumbing is required.

- **Door A:** `OutOfScopeError` surfaces to the user with `scopeReason` — the SSE/live path emits an error frame carrying the reason; the POST path returns it via the hub's error status. (Reuse whatever the existing intake-throw path does; ensure `scopeReason` reaches the client rather than a generic 500.)
- **Door B:** the scope check runs inside the run (it needs the LLM). An out-of-scope Door-B order is therefore caught **post-accept** via the existing `runJob`-throw → `rejectOrder` path → buyer refunded, not charged. We deliberately keep the pre-accept fulfillability gate `$0`/read-only (no LLM call added to it).

**Edge cases.** Terse-but-legit briefs (a one-word product name a judge might test) must pass — the prompt errs toward `inScope=true`. Empty/short/malformed input is still rejected earlier by the existing zod shape gate (`server/gating.ts`), unchanged.

**Tests.** `inScope=false` → `buildBrief` throws `OutOfScopeError` with the reason; `inScope=true` → normal brief. A clearly-out-of-scope fixture ("write me a smart contract") and a legit-but-terse fixture (must pass).

---

## Fix 3 — QA score becomes binding

**Files:** `src/engine/qa.ts` (`qaVerdictSchema`, `reviewDeliverable`), `src/constants.ts`, `src/engine/qa.test.ts`

**Behavior.** `score` becomes **required** in `qaVerdictSchema` (`z.number().min(0).max(100)`). New constant `export const QA_ACCEPT_MIN_SCORE = 70;`. In `reviewDeliverable`, after obtaining the LLM verdict: if `action === "accept" && score < QA_ACCEPT_MIN_SCORE`, return a downgraded verdict — `action: "redo"`, the same `score`, and a reason like *"QA score 65 below 70 — revise."* All other verdicts pass through unchanged.

The downstream `submit_asset` gate already requires `action === "accept"`, and `MAX_PAID_ATTEMPTS_PER_LEG = 2` bounds retries — so an accept-but-low verdict becomes a bounded redo, and a leg that never clears 70 within 2 paid attempts drops (partial kit), which couples correctly with Fix 1.

**Edge cases.** The deterministic `formatGate` (can only emit `swap` or pass) runs first, unchanged. The threshold only governs the LLM verdict's `accept`. `redo`/`swap` verdicts are untouched.

**Tests.** `accept` + score 85 → accept; `accept` + score 65 → redo (with reason); `redo`/`swap` pass through; schema rejects a missing score. Update existing QA tests that assumed an optional/ignored score.

---

## Fix 4 — QA-outcome reputation (the largest slice)

Reputation derived from **Praeco's own QA judgment of delivered work**, replacing marketplace popularity as the primary signal.

**New module:** `src/cap/reputation.ts`
- Store shape: `ReputationStore = Record<string /*agentId*/, { accepts: number; rejects: number; lastSeen: string }>`.
- `qualityScore(entry?) = (accepts + 1) / (accepts + rejects + 2)` — Bayesian neutral prior; an unseen agent scores `0.5`.
- `loadReputation()` / `saveReputation(store)` — best-effort JSON at `process.env.REPUTATION_FILE ?? join(RUNS_DIR, "reputation.json")`, mirroring `server/persistence.ts` (try/catch-swallowed writes; returns `{}` when absent). Persists on the long-lived CLI host; harmlessly no-ops on Vercel's ephemeral FS ($0 sandbox, where agents are mock anyway).
- `applyOutcomes(store, outcomes: { agentId: string; outcome: "accept" | "reject" }[])` — increments counts, stamps `lastSeen` (timestamp passed in, not read from clock inside the pure fn).

**Outcome capture (run wiring):** `src/engine/tools.ts` (`qa_review`) records, per verdict, `{ agentId: hire.agentId, outcome: verdict.action === "accept" ? "accept" : "reject" }` into the run context (`src/engine/context.ts`). At run end (`src/engine/run.ts`, after the agent loop), load → `applyOutcomes` → save. A redo (same provider) yields a `reject` then an `accept` for that agent; a swap yields a `reject` for A and an `accept` for B — both fair.

**Ranking integration:** `src/cap/discovery.ts`
- `discoverForLeg` opts gains `qualityScoreOf?: (agentId: string) => number` (absent → treat all as `0.5`, preserving today's behavior when no store is threaded).
- `RankedListing` splits the old `repScore` into two fields: `qualityScore` (from our store) and `completionRate` (marketplace, kept). The `log10(completedOrders)` **popularity term is dropped**.
- New comparator order: `formatDeRank (asc) → relevance (desc) → qualityScore (desc) → completionRate (desc) → price (asc)`. The relevance>0 hard gate, pins (fail-closed, relevance 999), self-exclusion, and top-N (`SEARCH_CANDIDATE_LIMIT`) are all unchanged.

**Gate consistency:** `src/cap/fulfillability.ts` loads the store and passes `qualityScoreOf` into its `discoverForLeg` call, so the pre-accept gate ranks identically to the engine.

**Prompt:** `src/engine/agent.ts` — replace *"Prefer high completionRate and many completedOrders"* with *"Prefer specialists with a strong track record in Praeco's own QA (qualityScore), then high completionRate."*

**Wiring:** load the store once at `runLaunchJob` start; thread `qualityScoreOf` to the tools' `discoverForLeg` and to the gate. Store path via env as above.

**Edge cases.**
- Cold-start: unseen agent → `0.5` (neutral) → still tried, ranked above proven-bad (`<0.5`) and below proven-good (`>0.5`). No chicken-and-egg trap.
- Vercel: `loadReputation` → `{}` → all `0.5` → ranking degrades to `relevance → completionRate → price`. Fine.
- Empty/corrupt file → treat as `{}`.

**Tests.** Unit: `qualityScore` (prior, accepts-only, rejects-only, mixed), `applyOutcomes`, best-effort load/save round-trip + missing-file. Ranking: qualityScore outranks a popular-but-unproven agent; cold-start neutral; completionRate as tiebreak. Integration: a run with a redo/swap updates the store as expected. Update existing `discovery.test.ts` orderings for the new comparator.

---

## Fix 5 — Judge-facing integrity & limitations doc

**File:** `docs/integrity-and-limitations.md`, linked from `docs/BUIDL.md` (and README).

An honest Q&A answering all 13 audit questions, structured as: **what Praeco does (with the fixes)** and **known limitations + roadmap**. It states plainly:

- Fixed scope (3 legs); shape validation + the new scope-guard; the Door B fulfillability gate and the Door A asymmetry (Door A deploys as the `$0` sandbox).
- QA = art-director LLM + the new binding score threshold + on-chain provenance; validity is LLM-judged (documented), the composed posts aren't per-asset QA'd (roadmap).
- **No buyer-refund primitive in the CROO SDK** (protocol limitation); the money model is spend-forward with pre-spend gates; Fix 1 now rejects (no charge) on under-delivery; redo/swap remain sunk cost (documented).
- Selection now uses **QA-outcome reputation** (our work-judgment) over marketplace popularity; residual reliance on keyword relevance + self-reported completionRate (roadmap).
- Serverless resilience: real-money runs on the CLI/long-lived host; deployed web app is the `$0` sandbox; no incremental persistence/resume (roadmap).

Judges reward self-aware honesty; this doc pre-empts the probing rather than hiding from it.

---

## Sequencing

Implement in dependency-friendly order: **Fix 3 (QA threshold)** and **Fix 1 (empty-kit reject)** first (small, independent, high value); **Fix 2 (scope-guard)** next; **Fix 4 (reputation)** last (largest, touches discovery + run wiring + persistence); **Fix 5 (doc)** written to reflect the shipped behavior. Each fix is its own commit/PR-able unit under one branch.

## Open questions

None outstanding — all four design decisions are locked (reject threshold N=2; conservative folded-in scope flag; QA T=70; persisted QA-outcome reputation with a neutral prior). The only deferred item is the money-gated on-chain escrow-return confirmation for Fix 1.
