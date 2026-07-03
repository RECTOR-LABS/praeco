# Praeco — Door B: Callable CAP Seller Service (fulfillment CLI)

**Date:** 2026-07-02
**Status:** Approved design (brainstorm) — pending spec review → writing-plans
**Builds on:** phase-2 doors design §8 (`docs/superpowers/specs/2026-06-29-praeco-phase2-doors-design.md:149-156`), Phase-1 engine (`runLaunchJob`), the seller-SDK spike (this doc §2).
**Scope:** List Praeco as a *seller* on the CROO Agent Store and fulfill inbound orders with the same engine, delivering the kit on-chain. **Engine `src/*` untouched.** Lean CLI (not an always-on worker).

---

## 1. Goal

Door B is the hackathon's **mandatory** requirement: Praeco listed as a callable CAP service, where an inbound order maps to the same `runLaunchJob` that Door A uses — "two doors, one engine." This brings Praeco **online** as a seller (it already works as a buyer). An inbound order pays Praeco ~$2 USDC; Praeco spends ~$0.70 hiring sub-agents and keeps the spread.

**This cycle** delivers: the fulfillment code + a CLI, fully tested at **$0** against a mock provider + sandbox engine. The real on-chain order (needs a wallet top-up + a buyer) is a gated follow-up.

## 2. Feasibility — seller-SDK spike findings

`@croo-network/sdk` v0.2.1. Verified against `dist/*.d.ts`:

- ✅ **Seller runtime exists on the same `AgentClient`** (no separate class): `acceptNegotiation(negId)` / `acceptNegotiationWithFundAddress(negId, addr)`, `rejectNegotiation`, `deliverOrder(orderId, {deliverableType, deliverableText?, deliverableSchema?})`, `rejectOrder`, `listNegotiations({role:'provider'})`, `uploadFile`.
- ⚠️ **Registration/listing is NOT in the SDK** — dashboard-only ("agent creation, service registration, SDK-Key issuance … handled in the Dashboard"; Phase-0 noted a silent avatar requirement). → a one-time RECTOR dashboard step (§10).
- 🔩 **Discovery = poll, not WS-react.** The WS replays history on connect and a duplicate same-SDK-key connection is fatal (close 1008). Mirror the proven buyer path: hold one WS for presence, **poll `listNegotiations({role:'provider', status:'pending'})`**.
- 🆓 **`contentHash` is computed by the backend** and returned on the `Delivery` — we submit `deliverableText`/`deliverableSchema` and read the hash back (proof-carrying delivery, free).
- 💸 **`acceptNegotiation` costs *provider* gas** (backend auto-creates the order on-chain on accept) + Praeco later pays sub-agents ~$0.70. Agent wallet (~0.74 USDC) needs a top-up before a real order.
- 📦 **Deliverable types are `"text"` | `"schema"` only** (no file/url/image type); large/binary goes via `uploadFile → objectKey` referenced in text. The kit → `deliverableText` (markdown) works directly.

## 3. Decisions

- **D1** Lean **fulfillment CLI** (`door-b:fulfill`), run on-demand — not an always-on VPS worker (that's post-hackathon).
- **D2** **Build + simulate first ($0)**; real on-chain order is a gated follow-up.
- **D3** **Poll** `listNegotiations({role:'provider', status:'pending'})` for inbound; hold one WS for presence only (robust vs WS replay + duplicate-key death).
- **D4** Deliver `deliverableType:"text"` = kit markdown, `deliverableSchema` = provenance JSON.
- **D5** **Run the engine only after the buyer has paid** (`getOrder.status === "paid"`) — Praeco is +$2 before spending.
- **D6** Shared entry: the fulfillment path calls the unchanged `runLaunchJob` (+ `buildLiveDeps`/`buildSandboxDeps`) — same engine as Door A.

## 4. Architecture (small, testable units)

| Unit | Responsibility |
|---|---|
| `src/cap/provider.ts` — `CapProvider` interface + `AgentClientProvider` wrapper | Seller ops: `listInboundNegotiations()`, `acceptNegotiation(negId, fundAddr?)`, `getOrder(id)`, `deliverOrder(id, req)`. Wraps `AgentClient`; narrow + mockable (mirrors `CapBuyer`, `src/cap/hire.ts:9`). |
| `src/cap/mock-provider.ts` | Simulates one paid inbound order (pending negotiation → accept → paid → accept delivery). Drives the $0 sim + TDD. |
| `server/kit-markdown.ts` — `kitToMarkdown(RunRecord): string`, `kitProvenanceJson(RunRecord): string` | Render the `LaunchKit` as the markdown deliverable + a provenance JSON blob. Pure functions. |
| `server/fulfill-order.ts` — `fulfillOrder(provider, deps)` | The core accept→wait-paid→run→deliver flow, with an injected provider + engine runner → fully unit-testable. Returns a result (`{orderId, contentHash, status}`). |
| `scripts/door-b-fulfill.ts` — CLI | Wires the **real** `AgentClientProvider` + `buildLiveDeps`, or `--sim` → `mockProvider` + `buildSandboxDeps`. Flags: one-shot (default), `--watch` (poll loop), `--sim`. |

## 5. Flow (money-safe by construction)

```
connect AgentClient + connectWebSocket()          # presence (providers won't transact with an offline agent)
poll listNegotiations({role:'provider',status:'pending'})   # inbound orders (robust vs WS replay)
  → pick one; parse requirements.brief → IntakeInput ({text} | {repoUrl})
  → assertFunded(agent wallet)                     # accept costs provider gas
  → acceptNegotiation(negId)  (or …WithFundAddress if require_fund_transfer)
  → poll getOrder(orderId) until status==="paid"   # BUYER PAID before we spend a cent
      (expired/rejected → abort, no engine run, no spend)
  → runLaunchJob(input, liveDeps) → RunRecord      # shared engine entry (spends ~$0.70)
  → deliverOrder(orderId, {                        # backend returns contentHash (proof, free)
        deliverableType:"text",
        deliverableText: kitToMarkdown(rec),
        deliverableSchema: kitProvenanceJson(rec) })
  → log on-chain receipt (orderId, contentHash, deliver txHash)
```

Idempotency: process one order per invocation, tracked by `orderId` (guards poll overlap / WS replay).

## 6. Deliverable format & graceful degradation

- `deliverableText` = `kitToMarkdown(rec)`: headline/landing copy, tweet thread, short pitch, PH/HN blurb, README polish, OG image reference, and a provenance section (`agent · $amount · contentHash · Basescan ↗` per leg).
- `deliverableSchema` = `kitProvenanceJson(rec)`: the `ProvenanceCard[]` + spend + runId as JSON.
- **Partial/failed run** (graceful degradation, engine §10): deliver whatever passed QA + a clear note; if nothing usable, `rejectOrder(orderId, reason)` per the CAP lifecycle rather than deliver junk.

## 7. Money safety & idempotency

- Engine (the only spend) runs **only after `status:"paid"`** (D5) → Praeco never spends on an unpaid/abandoned order.
- `assertFunded` before `acceptNegotiation` (accept costs gas); the engine's existing guards (BudgetGuard, per-leg cap, pay-only-in-`created`, single `payOrder`, `MAX_TURNS`) remain the last line of defense on the buyer side.
- One order per invocation; `orderId` de-dupe. `--watch` sleeps between polls and skips already-handled ids.
- **Same-SDK-key WS caveat:** only the Door B process connects the provider WS on `CROO_SDK_KEY`; a concurrent live Door-A buyer run on the same key would collide (close 1008). Door A live is gated off and no longer holds a persistent WS (single-request on Vercel), so no conflict in practice — documented as a constraint.

## 8. Error handling

- Negotiation parse failure (no/invalid `brief`) → `rejectNegotiation(negId, reason)`; never accept an unfulfillable order.
- `acceptNegotiation` failure (gas/funding) → surfaced, abort this order (no partial state).
- Buyer never pays (order expires) → abort cleanly, no engine run.
- Engine throws → `rejectOrder` with a traceable reason (don't leave the buyer hanging), or deliver a partial if any legs passed.
- `deliverOrder` failure → retry with backoff; surface the failure (no silent swallow).

## 9. Testing (TDD, $0, no mainnet)

- `fulfillOrder` against `mockProvider` + `buildSandboxDeps`: full accept→paid→run→deliver→contentHash path; assert the delivered `deliverableText` contains the kit + a `contentHash` comes back. Cover: happy path, buyer-never-pays (no run), partial run (graceful note), reject-on-bad-brief.
- `kitToMarkdown`/`kitProvenanceJson` pure-function unit tests against a fixture `RunRecord`.
- `AgentClientProvider` thin-wrapper mapping tests (mock `AgentClient`).
- No live USDC / no real network in CI. `pnpm test:run` + `pnpm typecheck` green; existing suite stays green.

## 10. Prerequisites (RECTOR, not code — at the real-order step)

1. **Dashboard-register** the "Praeco" service at agent.croo.network under agent `ce5362ad…`: requirement schema `{ brief: string }`, price ~$2.00 USDC, `deliverableType: text`, + an avatar (silent requirement). Note the resulting `serviceId`.
2. **Top up the agent wallet** `0xee47…7D31` before a real order (accept-gas + ~$0.70 hires + headroom).
3. A **buyer wallet** to place the proof order (RECTOR's audience / a second account) — also feeds Phase-3 traction (≥5 buyer wallets).

## 11. Out of scope

- Always-on VPS worker (post-hackathon productionization).
- The real on-chain order (gated on §10 — separate step).
- Deliverable *quality* beyond graceful degradation — the clean-3/3-kit (real inline copy/image, [[praeco-clean-kit-parked]]) is a separate parked effort; Door B delivers whatever the current engine + graceful degradation produce.
- Browser wallet-connect / pay-Praeco buyer UI (Phase 3).

## 12. Risks

- **Mainnet runtime unverified** (spike was code-level only) → the plan opens with a **mainnet runtime spike**: register-adjacent, accept→deliver against one self-placed real order, before relying on it. If accept/deliver behaves differently than the `.d.ts` implies, adapt.
- **Provider gas on accept** → `assertFunded` gate + wallet top-up prerequisite; abort if unfunded.
- **Deliverable-format gap** on a live run (Pygm codes) → graceful degradation delivers what passed; a clean kit needs the parked engine fix.
- **Deadline** (~7 days) → lean CLI keeps Door B small; the mandatory bar (listed + callable + one proof) is achievable without the always-on worker.

## Decisions recap

D1 lean CLI · D2 build+sim first · D3 poll not WS · D4 text-markdown + schema-provenance · D5 spend-only-after-paid · D6 shared `runLaunchJob` entry.
