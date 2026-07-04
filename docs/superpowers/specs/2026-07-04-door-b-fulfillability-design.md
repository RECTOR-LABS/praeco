# Praeco — Door B engine-hardening: fulfillability pre-check, self-exclusion, pin hygiene

**Date:** 2026-07-04
**Status:** Approved design (brainstorm) — pending spec review → writing-plans
**Builds on:** Door B fulfillment CLI (`server/fulfill-order.ts`, `docs/superpowers/specs/2026-07-02-door-b-design.md`), the engine's discovery (`src/cap/discovery.ts`), and the **on-chain proof + diagnosis** in `docs/door-b-onchain-proof.md`.
**Scope:** Make Praeco's live Door B composition survive real marketplace conditions. Three integration-robustness fixes to the seller path + engine discovery. **Money invariants and the fail-closed pin contract are preserved, not weakened.**

---

## 1. Problem (observed on Base mainnet, 2026-07-04)

The Door B on-chain **mechanics** were proven end-to-end: a real self-order was accepted → paid → **delivered** (deliver txHash `0x97547499…`, order `35673686…`). But the engine **composition** failed — `failed`, **0/3 legs, $0 spent** — because 2 of 3 pinned specialist services had gone **offline** (research `3f8b1e7d…`, landing_copy `4bd62f49…`, both absent from the live 161-service catalog). Pins are authoritative / fail-closed by design (a prior review deliberately rejected "pin-escape"), so a stale pin ⇒ 0 candidates ⇒ leg unfillable ⇒ run fails, money-safe.

**The integrity defect:** Praeco **accepted + charged** a paid order it **could not fulfill**, then delivered an empty failure-kit. The money guard held ($0 engine spend), but the buyer paid ~$2 for nothing. A production-grade contractor must verify it *can staff and afford* the job **before** taking the money, and reject-with-reason otherwise.

Two secondary risks surfaced in the same diagnosis:
- **Self-hire:** Praeco now has its own broad "Product Launch Kit" service (`5168a527…`, agent `ce5362ad…`). With pins cleared it ranks as a candidate for *other* legs → Praeco could hire itself.
- **Stale-pin invisibility:** an offline pin only manifests as a silent 0-candidate leg — no operator-facing signal until a run fails.

The baseline engine is **sound**: `pnpm engine:smoke` = COMPLETED 3/3, spent $0.70 (sandbox, real GLM + mock market). The failure is integration/marketplace, not the agent loop.

## 2. Goals / non-goals

**Goals**
- G1 — Never `accept`+charge an order Praeco cannot fully staff **and** afford. Reject-with-a-specific-reason instead, at **$0** (before accept).
- G2 — Never let Praeco appear as a candidate to hire itself.
- G3 — Surface stale pins to the operator proactively (startup warning) and in rejection reasons.

**Non-goals (explicitly out of scope this cycle)**
- N1 — Re-introducing "pin-escape" / any weakening of the fail-closed pin contract. Stale pins are an operator-config problem (refresh) + a visibility problem (warn), not a reason to auto-fall-back to an unvetted provider.
- N2 — Refreshing the `SVC_*` pin **values** in `.env`. That is a run-time operational step (`.env` is gitignored/secret); the under-served `landing_copy` leg is a RECTOR decision at the live-run step, not code.
- N3 — The live 3/3 capture, demo video, BUIDL filing, buyer-wallet growth. Gated on this landing + RECTOR's explicit go.
- N4 — Changing the agent loop, QA, compose, or the accept→pay→deliver mechanics (all proven).

## 3. Decisions

- **D1 — Strict reject-whole-order.** If *any* required leg has zero *affordable* candidates, reject the whole negotiation. Never accept + deliver a partial/empty kit for full price. (RECTOR-confirmed.)
- **D2 — Availability **and** affordability.** A leg counts as fulfillable only if it has ≥1 candidate priced ≤ leg cap; the kit is feasible only if the cheapest affordable per-leg combo ≤ run budget. A leg we can't afford is a leg we can't fulfill. (RECTOR-confirmed.)
- **D3 — The gate reuses the engine's own `discoverForLeg`.** One discovery function, called by both the pre-check and the run, so the gate faithfully predicts the run (no drift between "what we checked" and "what the engine does").
- **D4 — The pre-check is read-only public REST (no WS, no spend), runs *before* `accept`.** A rejection therefore costs $0 — not even provider accept-gas.
- **D5 — Self-exclusion is universal.** `discoverForLeg` drops Praeco's own `agentId` before *both* the pinned and ranked branches. A pin pointing at Praeco's own service is an operator error → fail-closed `[]` (correct — you never hire yourself).
- **D6 — Stale-pin warning is non-fatal.** Log a WARN per pinned id absent from the live catalog; fail-closed still guarantees money-safety. Visibility, not enforcement.
- **D7 — The `checkFulfillable` dep is optional** on `fulfillOrder`. Absent ⇒ current behavior (back-compat; existing tests untouched). The real CLI wires it in.

## 4. Architecture (small, testable units)

| Unit | Responsibility |
|---|---|
| `src/cap/fulfillability.ts` — **NEW** | `assessFulfillability(services, agentsById, opts)` (pure) → `{ ok, reason, perLeg }`; `findStalePins(services, preferred)` (pure) → pinned ids absent from catalog; `checkFulfillability(cfg, fetchImpl)` (async wrapper) fetches both catalogs and calls the pure fn. |
| `src/cap/discovery.ts` — **EDIT** | `discoverForLeg` gains `opts.excludeAgentId`; filters own-agent services before the pinned + ranked branches. No other behavior change. |
| `src/engine/context.ts` — **EDIT** | `RunConfig` gains `selfAgentId?: string`. |
| `src/engine/run.ts` — **EDIT** | Threads `deps.config.praecoAgentId` → `ctx.config.selfAgentId`. |
| `src/engine/tools.ts` — **EDIT** | `search_marketplace` passes `excludeAgentId: ctx.config.selfAgentId` into `discoverForLeg`. |
| `server/fulfill-order.ts` — **EDIT** | New optional `checkFulfillable?: () => Promise<FulfillabilityAssessment>` dep; gate runs after brief-valid, before `assertFunded`/`accept`; on `!ok` → `rejectNegotiation` + `{ status:"rejected" }`. |
| `scripts/door-b-fulfill.ts` — **EDIT** | Real path wires `checkFulfillable = () => checkFulfillability(cfg, fetch)`; logs `findStalePins` once at startup. `--sim` wires the pre-check over the **mock** catalog with **pins cleared** (mirroring `buildSandboxDeps`, §12) so the $0 offline proof covers the gate without the real stale mainnet `SVC_*` rejecting every sim order. |

## 5. Module API

```ts
// src/cap/fulfillability.ts
export interface LegAssessment {
  leg: LegKind;
  candidates: number;        // matched for the leg (pre-affordability), self excluded, pin honored
  affordable: number;        // subset priced <= leg cap
  cheapestBaseUnits?: string;// cheapest affordable candidate (undefined if none)
  pinned?: string;           // the pinned serviceId for this leg, if any
  note?: string;             // specific reason when the leg is not fulfillable
}
export interface FulfillabilityAssessment {
  ok: boolean;               // every leg fulfillable AND cheapest full combo within run budget
  reason?: string;           // aggregated top-line reason when !ok
  perLeg: LegAssessment[];
}
export interface AssessOpts {
  legs: LegKind[];
  preferredServiceIds: Partial<Record<LegKind, string>>;
  selfAgentId?: string;
  legCapBaseUnits: bigint;
  runBudgetBaseUnits: bigint;
  queries?: Partial<Record<LegKind, string>>;  // canonical per-leg query; default table below
}
export function assessFulfillability(
  services: ServiceListing[],
  agentsById: Map<string, AgentRecord>,
  opts: AssessOpts,
): FulfillabilityAssessment;

export function findStalePins(
  services: ServiceListing[],
  preferred: Partial<Record<LegKind, string>>,
): Array<{ leg: LegKind; serviceId: string }>;

export async function checkFulfillability(
  cfg: Config, fetchImpl: FetchFn,
): Promise<FulfillabilityAssessment>;
```

```ts
// src/cap/discovery.ts — discoverForLeg opts
{ preferredServiceId?: string; limit?: number; excludeAgentId?: string }
```

**Canonical per-leg queries** (approximate a real LLM search so the unpinned pre-check doesn't under-count via an empty query; ignored entirely when a leg is pinned, since `discoverForLeg` short-circuits on the pin):

| leg | default query |
|---|---|
| `research` | `market research competitive analysis report` |
| `landing_copy` | `landing page marketing copy content` |
| `og_image` | `og image social preview banner design` |

## 6. Affordability math (precise)

Prices are USDC base-unit decimal strings; parse with the existing `priceOf` semantics (empty/NaN ⇒ `+Infinity` ⇒ treated as unaffordable — never accidentally "cheapest").

For each required `leg`:
1. `candidates = discoverForLeg(services, agentsById, leg, queries[leg], { preferredServiceId: preferred[leg], excludeAgentId: selfAgentId })`
2. `affordable = candidates.filter(c => priceOf(c.priceBaseUnits) <= legCapBaseUnits)`
3. If `affordable.length === 0`, the leg is **unfulfillable**; `note` is specific:
   - `preferred[leg]` set **and** absent from catalog → `pinned service <id> is offline (stale pin)`
   - `candidates.length === 0` → `no live specialist matches this leg`
   - else → `cheapest candidate $X exceeds the $Y leg cap`
4. Else `cheapestBaseUnits = min(priceOf over affordable)`.

Kit feasibility:
- `ok = every leg has affordable ≥ 1` **and** `Σ cheapestBaseUnits ≤ runBudgetBaseUnits`.
- If all legs affordable but the sum exceeds budget → `!ok`, `reason = "cheapest full kit $S exceeds the $B run budget"`.
- Otherwise `reason` aggregates the unfulfillable legs' notes (e.g. `landing_copy: no live specialist matches this leg`).

This is a **necessary** feasibility test (∃ an affordable assignment), not a guarantee the engine picks it — the engine may hire a pricier top-ranked candidate and partial-fail, which its own per-leg cap + run-budget guard handles (graceful degradation). The gate's job is to eliminate the *guaranteed-empty* case (0 affordable candidates for a required leg, or an unaffordable full kit) before any money moves.

## 7. Flow — gate inserted before accept (money-safe by construction)

```
listInboundNegotiations() → pick n
parseBrief(n.requirements) → invalid ⇒ rejectNegotiation (unchanged)
─── NEW ───────────────────────────────────────────────────────────
checkFulfillable?()  → { ok, reason, perLeg }         # read-only REST, no WS, $0
  !ok ⇒ rejectNegotiation(n.id, `cannot fulfill: ${reason}`) ; return { status:"rejected", reason }
  ok  ⇒ log per-leg affordability, continue
────────────────────────────────────────────────────────────────────
assertFunded()                                        # accept costs provider gas (unchanged)
acceptNegotiation(n.id) → orderId                     # UNCHANGED from here down
poll getOrder until PAID (abort-early on terminal-pre-pay)
runJob(input)  → spends ~$0.70, only post-payment
deliverOrder(...) with retry
```

## 8. Invariants preserved

- The gate is **read-only** (public `/services` + `/agents`, no WS, no chain write). A rejection spends $0 and never touches the wallet.
- `assertFunded → accept → wait-paid → spend → deliver-with-retry`, the per-leg cap, run budget, idempotent `paidOrderIds`, commit-at-pay, and the **fail-closed pin contract** are all unchanged.
- Self-exclusion only *removes* Praeco's own services from candidate pools; it cannot cause an unvetted hire.
- Only ONE live WS per `CROO_SDK_KEY` — the gate adds no WS (REST only), safe alongside the fulfill watcher.

## 9. Testing plan (TDD, per unit)

- **`src/cap/fulfillability.test.ts` (new)** — pure, hand-built catalogs:
  - all 3 legs have affordable candidates → `ok`.
  - a leg with 0 matching candidates → `!ok`, reason names the leg.
  - a leg pinned to an absent service → `!ok`, note = stale pin.
  - a leg whose only candidate exceeds the leg cap → `!ok`, note = exceeds cap.
  - all legs affordable but Σ cheapest > run budget → `!ok`, reason = exceeds run budget.
  - own-agent service excluded → if it was the only candidate for a leg, that leg is unfulfillable.
  - `findStalePins` flags absent pins, ignores present ones, ignores unset legs.
- **`src/cap/discovery.test.ts` (add)** — `excludeAgentId` removes own services from ranked results; removes own service even when pinned (→ `[]`); pin still authoritative for a non-excluded agent.
- **`server/fulfill-order.test.ts` (add)** — `checkFulfillable` `!ok` ⇒ `rejectNegotiation` called, `acceptNegotiation` **not** called, status `rejected`; `ok` ⇒ proceeds to accept; **absent** ⇒ proceeds (back-compat).
- **Integration/verify** — `pnpm engine:smoke` still 3/3 $0; `--sim` pre-check passes over the mock catalog.

## 10. Verification / done

- `pnpm test:run` (183 existing + new, all green) · `pnpm typecheck` · `pnpm exec next build` · `pnpm engine:smoke` (3/3, $0).
- Manual $0 probe: point the gate at the live catalog with the current (stale) pins → it should **reject** with the stale-pin reason (reproduces the 2026-07-04 failure as a clean rejection instead of an empty delivery).
- **Then, gated on RECTOR + confirmed-online specialists:** refresh `SVC_*` (N2) and do ONE clean live 3/3 → capture into `docs/door-b-onchain-proof.md`.

## 11. Risks / mitigations

- **False-negative over-rejection** (empty-query under-count) → mitigated by canonical per-leg queries (§5); pinned legs are exact.
- **Double catalog fetch** (gate + engine each fetch once per order) → accepted; cheap REST, runs once per accepted order, keeps the seller path decoupled from engine internals (no shared cache coupling).
- **Gate vs engine drift** → mitigated by D3 (both call the same `discoverForLeg`).

## 12. Sim-wiring note (gotcha)

`buildSandboxDeps` deliberately clears `config.preferredServiceIds = {}` because the mock catalog has none of the real `SVC_*` ids (fail-closed would otherwise reject every leg). The `--sim` fulfillability check must mirror this exactly: assess over the **mock** catalog (`mockFetch`) with **pins cleared**. If `--sim` instead used the real `cfg` pins, `findStalePins` would flag all three as absent from the mock catalog and the gate would reject every simulated order — a false failure. The real (non-sim) path keeps the real pins and catalog, so a genuinely stale pin correctly rejects.
