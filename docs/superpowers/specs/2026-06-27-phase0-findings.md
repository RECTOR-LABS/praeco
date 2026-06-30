# Praeco — Phase-0 De-Risk Findings (Task 7)

**Date:** 2026-06-27
**Status:** ✅ **Phase 0 COMPLETE** — every component of the stack is proven end-to-end with real on-chain evidence.
**Resolves:** SPEC §15 (Phase-0 de-risk / open questions).

---

## TL;DR

Praeco **autonomously discovered → negotiated → paid USDC on Base → received a proof-carrying deliverable**, end-to-end, from its own funded agent wallet. The CAP hire/settle pipeline, GLM-5.2 (Ollama Cloud) LLM, and CAP public-REST discovery all work. Two non-obvious gates were discovered and resolved (an empty agent wallet, and where input schemas live). Total cost of the entire de-risk: **~$0.11**.

---

## The proof (one real, completed mainnet hire)

Praeco (`ce5362ad…`) hired **OpsPilot**'s `seo_rules_audit` service ($0.10) and received an 18-rule SEO audit.

| Stage | On-chain evidence |
|---|---|
| Order created | `createTx 0xda5bd3d7…347ef` · chainOrderId `41116` |
| **Paid** (USDC, Base) | `payTx 0x434759db…269f25` |
| **Delivered** | `deliverTx 0x33d1ce5f…465539` · `contentHash 0xad6bda58…15f7a8` |
| **Cleared** (escrow → provider) | order status `completed` |
| Requester wallet debit | `0xee47…7D31`: **2.000000 → 1.888624 USDC** (−$0.10 service, −~$0.011 gas) |

Deliverable (`deliverableType: "schema"`): `total_score 48/82` across title/description/structure/images/technical/links, each rule scored with a message. Carries a `contentHash` → **proof-carrying delivery is real and free** (pillar #2 validated).

Order `20917ea8…` · negotiation `6da6e9fe…` · delivery `fad89d1d…` · provider wallet `0xC752…5546`.

---

## SPEC §15 — resolved

| # | Open question | Answer |
|---|---|---|
| 1 | CAP SDK smoke: place + settle a USDC order | ✅ **Done, mainnet.** Full lifecycle negotiate→accept→create→pay→deliver→clear in ~90s. No testnet exists (see #3). |
| 2 | Agent registration / listing fee | **None** observed (0%-fee launch window). Registration **silently requires an avatar** — a hard gate, not documented. |
| 3 | Testnet vs mainnet for judging | **Mainnet only.** CROO/CAP runs on **Base mainnet USDC**; there is no testnet. All "real orders" are genuine mainnet settlements. |
| 4 | Per-service prices (research + copy legs) | All curated legs **$0.10** (100000 base units): SEO audit, Verifiable Research, Landing Page. Image gen $0.50. Hundreds of proven data services at $0.10. Realized cost/hire ≈ **$0.11** ($0.10 + ~$0.011 gas). |
| 5 | ERC-4337 vault deploy cost (0%-gas window) | Agent AA wallet is **auto-created with the agent** (no deploy step for us). Gas is **not** zero but trivial: ~$0.0026 for a wallet→wallet top-up, ~$0.011 baked into a hire. |
| 6 | Pi SDK + GLM-5.2-via-Ollama wiring | ✅ Resolved. `glm-5.2:cloud` via a custom pi-ai provider (`baseUrl https://ollama.com/v1`, `openAICompletionsApi`, `compat:{supportsDeveloperRole:false,supportsReasoningEffort:false}`). Text + JSON + tool-calling verified; **$0** (flat-rate). See `scripts/llm-smoke.ts`. |
| 7 | Does CAP expose reputation/Merit for Discovery? | ✅ **Yes, richly.** Per-agent: `completedOrders`, `completionRate`, `totalEarned`, `totalVolume`, `avgDeliveryText`, `onlineStatus`; per-service `orders7d`. Ample signal for the novelty-3 ranking. (An ecosystem `croo-reputation-agent` also exists.) |
| 8 | Builder faucet / USDC credit | Not found; funded via deBridge (Solana USDC → Base USDC). Not pursued further. |

---

## Key findings & gotchas (engine-critical)

### 1. Agents hire from their OWN wallet — not the account wallet ⚠️
There are **two distinct wallets**:
- **Account / owner wallet** (`MAIN WALLET` on the dashboard): `0x7A87…C5C1` — what deBridge funded.
- **Per-agent wallet** = the agent's CAP `walletAddress`: Praeco = `0xee47A5bda206E188a2857F908E5E2E62C7DA7D31`.

The SDK authenticates **as the agent**, and `payOrder` checks `order.requesterWalletAddress` = the **agent** wallet. **An empty agent wallet silently kills every hire** — the provider never accepts, the negotiation sits `pending` forever with **no rejection** (no "insufficient funds" error). This was the entire Phase-0 blocker. **Fund the agent wallet** via dashboard → My Agents → Top Up (transfers from the account main wallet; 3-step flow: open → select source → enter amount + Confirm).

> The prior session's note that `0x7A87…C5C1` is "where hiring USDC lives" was **wrong** — that's the account wallet; hires draw from `0xee47…`.

### 2. Counterparty input schemas live on the AGENT endpoint
Not on `/services` or `/services/{id}`. They're at:
`GET https://api.croo.network/backend/v1/public/agents/{agentId}` → `.services[]` each carries:
- `requirementType` (`"schema"` | `"text"`), `requirementSchema` (JSON array of `{name,type,required}`), `requirementText`
- `deliverableType`, `deliverableSchema`, `deliverableText`

Example — OpsPilot `seo_rules_audit` requires: `title`, `description`, `h1`, `bodyText` (string), `hasHttps` (boolean) — **all required**. Sending `{url}` → `"unsupported requirement field"`; sending a partial set → silent `pending`. **This is how Praeco's engine learns any counterparty's input contract** — fetch the agent record, read `requirementSchema`, have GLM-5.2 fill it.

### 3. Acceptance gates: funded wallet + online presence
- Requester **agent wallet must hold USDC** before a provider will accept (see #1).
- Agent presence: an authenticated **WebSocket connection flips `onlineStatus` offline→online** and holds it while open. Hold the WS during a hire. (Funded + online → OpsPilot accepted in **1.5s**.)

### 4. SDK quirks
- `listOrders` role = `buyer`|`provider`; `listNegotiations` role = `requester`|`provider` (different vocab).
- The WebSocket **replays historical events on connect** — filter events by the current `negotiationId`/`orderId`, or (more robustly) **poll** `getNegotiation`/`listOrders`.
- `EventType.NegotiationRejected` (`order_negotiation_rejected`) ≠ `OrderRejected` (`order_rejected`). Provider rejections at the negotiation stage use the former.
- `negotiate → accept` is provider-driven; on accept the backend submits `createOrder` on-chain (provider gas). Requester then `payOrder`.

### 5. Discovery surface (public REST, no auth)
`GET …/public/{services | search?q= | agents | agents/{id} | live-feed}`. Prices in USDC base units (100000 = $0.10). `orders7d` = popularity proxy. `live-feed` shows real completed orders (proof the network is live) but **omits the `requirements` payload**.

---

## Implications for the Phase-1 engine

1. **Wallet provisioning is a first-class step.** The engine must ensure Praeco's agent wallet is funded before any hire, surface low-balance, and (Phase-2) automate top-ups. Treat balance as the gate, not reputation.
2. **Schema resolution layer.** For each candidate counterparty: fetch agent record → parse `requirementSchema` → GLM-5.2 maps the job intake into a valid payload. Handle strict providers (reject on bad field) and lenient ones (accept anything, may stub).
3. **Provider reliability ranking.** Use `completionRate`/`completedOrders`/`avgDeliveryText`/`onlineStatus` — not just price. Several 0-order agents are stubs that accept but never deliver; proven agents (OpsPilot 99.96%, 2754 orders) settle in ~60s.
4. **Robust order tracking via polling**, not raw WS events (replay hazard). Keep WS open only for presence.
5. **Costs are negligible** (~$0.11/hire) — the composer can hire several legs per job cheaply.

---

## Verify / reproduce

```bash
pnpm test:run        # 3 pass (config loader)
pnpm smoke:llm       # GLM-5.2 text/JSON/tool-calling, $0
pnpm smoke:cap       # REST auth + WebSocket
pnpm smoke:hire      # LIVE ~$0.11 — full discover→pay→deliver (requires funded agent wallet)
```
