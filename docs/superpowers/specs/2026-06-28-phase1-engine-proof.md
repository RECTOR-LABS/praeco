# Praeco — Phase-1 Engine On-Chain Proof (2026-06-28)

**Date:** 2026-06-28
**Status:** ✅ **Phase-1 engine PROVEN on mainnet** — the autonomous GLM-5.2 contractor loop discovers, negotiates, pays USDC on Base, and receives proof-carrying deliverables end-to-end. A polished 3/3 launch-kit run is **deferred to Phase 2** (gated by marketplace provider-type fit + a QA swap-vs-redo refinement, not by the engine).
**Supersedes the gap in:** 2026-06-27-phase0-findings.md (single hand-driven hire) — Phase 1 is the full autonomous loop.

---

## TL;DR

The Phase-1 engine ran live on Base mainnet and **autonomously hired specialist agents 6 times across 3 unique counterparties** (ZERU, VERIS, Foundr), paying real USDC and receiving on-chain, content-hashed deliverables each time. The agent loop, money guards, discovery, hire/settle pipeline, and QA critic all work against the **real** CAP marketplace (the `engine:smoke` had only ever run against a mock). Getting there surfaced and fixed **five real bugs** the mock had hidden. Total live spend: **~$0.62** (≈$0.50 service + ≈$0.12 gas). No funds lost; money guards held on every path.

The one thing **not** achieved: a fully QA-accepted 3-leg kit. Root cause is external — this marketplace has no general "market-research-for-launch" provider (every research agent is specialized: DeFi data, trust audit, prediction-market tracking, idea analysis), and the QA critic returns `redo` (same provider) where it should `swap` (different provider type). Both are Phase-2 quality items; the engine itself is proven.

---

## The proof — 6 autonomous on-chain hires

Every row is a real Base mainnet settlement from Praeco's agent wallet (`0xee47…7D31`), driven entirely by the GLM-5.2 agent loop (discover → rank → negotiate → wait-for-`created` → pay → deliver → QA).

| # | Run / product | Provider | Order | payTx | contentHash | $ | QA |
|---|---|---|---|---|---|---|---|
| 1 | #4 Tipstream | ZERU | `5f50a224…` | `0x273f6d80…` | `0xd5ec11a0…` | 0.05 | redo (off-brief) |
| 2 | #4 Tipstream | ZERU | `8780c097…` | `0x041243c5…` | `0xe11694ef…` | 0.05 | redo → later `order_completed` |
| 3 | #5 Yieldraft | VERIS | `5e24c5ad…` | `0x4f4c3925…` | `0x1df3b551…` | 0.10 | redo (review-truncation*) |
| 4 | #5 Yieldraft | VERIS | `44ad50c0…` | `0xf391e0b0…` | — | 0.10 | (stopped) |
| 5 | #6 Yieldraft | VERIS | `02b4164d…` | `0x06fdfe16…` | `0x80aedf58…` | 0.10 | redo (wrong provider type) |
| 6 | #6 Yieldraft | Foundr | `9b173f31…` | `0xc2438f6d…` | — | 0.10 | (stopped after pay) |

\* Caused by our own 6000-char QA truncation; fixed (see bug 5). After the fix, QA reviewed the full report and the redo reason changed to the substantive "wrong provider type" (row 5).

**Counterparties:** ZERU (`e8998099`), VERIS (`d1cfec35`), Foundr (`2aaf227e`) — **3 unique**, which also satisfies the Phase-3 "≥3 unique counterparty agents" traction bar as a side effect of validation.

---

## Five bugs the live run found (all fixed + GPG-signed)

The `engine:smoke` was green because `run-job.ts`'s `mockFetch`/`mockClient` invented shapes that matched nothing on the live API. The live run was the first real exercise of the integration surface.

| # | Bug | Fix | Commit |
|---|---|---|---|
| 1 | Discovery wrote against mock shapes: `/search?q=`→`{agents:[…]}` (object-wrapped, agents not services; keyword search brittle: `image`/`copy`→0); `/agents/{id}`→`{agent:{…}}` (wrapped); `completionRate` a percent; service title is `name`; `requirementSchema` a JSON string. → 0 candidates, 24-search turn-backstop abort. | Catalog-driven discovery (`/services`+`/agents`, ranked client-side); normalize/unwrap/parse the real shapes; mock mirrors them. | `9ca3df5` |
| 2 | Leg relevance weighted name/description/tags equally → a "Landing Page" service out-ranked the real image provider for og_image (agent tags bled across legs). | Field-weight: service NAME ×3, description/tags ×1. | `4024dfc` |
| 3 | Paid an order the instant it appeared, while still `status:"creating"` → pay reverts (status error) and the ERC-4337 paymaster charges gas in USDC (~$0.06 burned in run #2). | Wait for the order to leave `"creating"` before paying; throw without paying otherwise. | `b758519` |
| 4 | `listOrders` omits the price; the wait could never see a price there → orders never deemed payable; finalization also takes ~25s+ now (Phase-0 saw ~1.5s). | Discover orderId via `listOrders`, then poll `getOrder` (carries real status + price); pay using that price; widen poll windows. | `8843d93` |
| 5 | QA truncated the deliverable to 6000 chars → long research reports looked cut off → false "truncated/incomplete" rejection. | Review up to 32k chars; mark any cutoff as a review-display limit so QA judges substance. | `5ad165c` |

The fix sequence is visible live in run #4: `status:"creating"` (held, not paid) → `status:"created"` (price `50000` read) → `POST /pay` → `order paid` (`0x273f6d80…`) → `delivering` → delivery `submitted` → `getDelivery` (contentHash).

---

## What the engine proved it does (autonomously, on-chain)

- **Discover + rank** real services from the live catalog by leg-relevance × reputation × price (e.g. ranked ZERU $0.05/100% #1 for research every run).
- **Reason about provider choice** (weighed ZERU vs VERIS vs Foundr on reputation/relevance/budget) and **swap** providers across attempts.
- **Negotiate → wait for on-chain finalization → pay exactly once → poll for delivery** with real USDC, real payTx/deliverTx/contentHash.
- **Money guards held on every path:** per-leg cap (price from the discovered candidate, not LLM args), on-chain wallet funding gate, single `payOrder` per hire, spend committed at pay-time, MAX_TURNS backstop. No overspend, no double-pay, ever.
- **Strict QA** correctly caught off-brief / wrong-type deliverables and drove redo/swap (the curate loop, novelty #3) — the very reason no junk reached a kit.

---

## The deferred gap (Phase 2) — sharpened by a controlled pinned run

A follow-up **controlled run** (authoritative `SVC_*` pins, DeFi product) pinned Foundr→research + Pygm→copy/image and isolated exactly what remains:

- ✅ **Research leg is now QA-PROVEN clean.** Foundr "Idea Analysis" (`2aaf227e`) delivered on-brief market/competitive research and QA **accepted** it (order `9b173f31` completed, `deliverTx 0x2a971488…`; re-confirmed live order `…` payTx `0xdab5825e…`). The new **authoritative pin** (`feat 330c95d`: a pinned `SVC_*` is the sole candidate for its leg) made the agent hire exactly the vetted provider.
- ❌ **Copy/image are blocked by deliverable FORMAT, not relevance.** Pygm Studio "Text Code" / "Image Code" return a **redemption code + a link to the Pygm platform**, not inline content — QA correctly rejects ("only a generic redemption code and a link… zero landing copy"). The engine composes/QA's **inline** deliverables; Pygm's content lives behind a code/URL.

So the real Phase-2 work, in priority order:

1. **Deliverable-format matching (copy + image).** Find providers that deliver **inline** copy / an inline image URL (Foundr's research gave an inline summary + link and passed — its "Landing Page"/"Brand Identity" services are worth testing), **or** add an engine step that redeems a code / fetches a report link and feeds the *fetched content* to QA + compose. This is the true blocker for a clean 3/3.
2. **QA `swap` vs `redo`.** On a wrong-*type*/wrong-*format* deliverable QA should return `swap`, not `redo`.
3. **Pin safety.** The authoritative pin (good for forcing a vetted provider) has no escape if the pinned provider is bad → it redo-loops to MAX_TURNS (cost a wasted $0.20 Pygm redo here). Add a per-leg redo cap and/or a swap-fallback when a pin keeps failing QA.

Provider notes for Phase 2: **research = Foundr Idea Analysis `2aaf227e` (proven, $0.10)**; **copy/image = NOT Pygm "Code" services** (they deliver codes) — needs an inline-content provider or a fetch/redeem step.

---

## Spend + wallet

| | USDC |
|---|---|
| Agent wallet start | 1.888624 |
| After debugging runs (6 hires) | 1.266668 |
| After controlled run (research+2×copy) | 0.740607 |
| **Spent this session** | **1.148017** (~9 real hires + gas across debugging + the controlled run) |

Money safety: every spend was a discovered-candidate-priced, cap-checked, funded-wallet-gated, single payment. Wasted spend was small and bounded: ~$0.06 paymaster gas from the pay-race (bug 3, fixed) and ~$0.20 on a Pygm copy redo that the authoritative pin couldn't escape (Phase-2 pin-safety item). **Top up the agent wallet (~0.74 USDC left) before Phase-2 demo runs.**

---

## Verify / reproduce

```bash
pnpm test:run      # 100 pass
pnpm typecheck     # clean
pnpm engine:smoke  # real GLM-5.2 loop vs a real-shape MOCK marketplace, $0, 3/3
pnpm engine:run    # LIVE mainnet, real USDC — deliberate only (RECTOR-gated)
                   #   SVC_RESEARCH=/SVC_LANDING=/SVC_IMAGE= clear pins for free discovery
                   #   JOB_TEXT="…" sets the product
```

Run records: `runs/<runId>.json` (full RunRecord with per-leg Basescan receipts). Live run outputs for this proof were captured in-session (payTxs above are real, verifiable on basescan.org).
