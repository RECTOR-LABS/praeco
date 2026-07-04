# Door B — Real On-Chain Fulfillment Proof (2026-07-04)

Praeco's Door B (CAP **seller**) flow was exercised **end-to-end on Base mainnet**. The
on-chain order lifecycle — negotiation → accept → paid → **deliver** — completed with
**real transactions**. The engine **composition** failed (stale, offline sub-agent
pins), so the delivered kit was empty. The money invariant held perfectly: a failed
run spent **$0** (fail-closed). Full details + the proper fix plan below.

> **✅ Update (2026-07-04):** The three fixes in the "Proper fix plan" below shipped in
> **PR #12** (`main`): a pre-accept **fulfillability gate** (reject-with-reason — never
> charge for a job we can't staff + afford), a **self-exclusion** guard, and a
> **stale-pin startup warning** — the fail-closed pin contract preserved, then hardened
> by a max-effort code-review pass. The integrity defect described here is **closed**.
> Remaining: one live clean 3/3 capture — now known to be gated on marketplace
> **supply** (a live inline-image provider + an in-budget copywriter must be
> online), **not** a pin refresh. See "Post-fix live verification" below;
> `pnpm marketplace:probe` monitors it at $0.

## ✅ Proven on-chain (real)

- **Seller service registered** on CROO (dashboard-only, done via browser this session):
  - name **Product Launch Kit**, serviceId **`5168a527-df1d-45fb-bcaa-a638f2a1fcf9`**
  - agent **`ce5362ad-272f-42aa-b656-f4e51796bcaf`** ("Praeco"), price **$2.00 USDC**, SLA 30 min
  - requirement schema **`{ brief: string }`** (matches `parseBrief`), deliverable **text**
  - skill tags: research-report, automation-workflow, content-creative
  - verified live in `GET /public/agents/{id}` → `services: [ … ]`, `status: active`
- **Agent wallet** `0xee47A5bda206E188a2857F908E5E2E62C7DA7D31` funded to **$2.74 USDC**.
  - It is an **AA smart-contract wallet** (61-byte proxy). Gas is **sponsored / paid in USDC**
    (top-up showed "Estimated Gas ~$0.01 USDC, deducted from amount") → **0 ETH required**.
- **Real buyer order** placed (self-order from account wallet `0x7A87…C5C1`, total **$2.01**
  incl. ~$0.01 USDC gas) against the live service, brief = "A privacy-first habit tracker
  for indie developers".
- **Provider fulfillment** (`pnpm door-b:fulfill --watch`) auto-detected → accepted →
  waited for payment → **paid** → ran engine → **delivered**:

  | field | value |
  |---|---|
  | negotiationId | `626e43c6-5e68-4a16-a4e4-67f20ae23268` |
  | orderId | `35673686-c363-45d2-b4ce-fdfb22a380fe` |
  | deliveryId | `c2073ba5-9d44-45f7-9aff-ecd7e2f79c60` |
  | **deliver txHash** | `0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84` |
  | contentHash | `0xfa2bd434494d1d49daa35c925230587feee9ed6197559381496ab9bc3c14fc6c` |
  | status path | creating → created → paying → **paid** → (engine) → **delivered** |

  Basescan: https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84

## ❌ What failed — and why

- Engine run `live-1783145533191` finished **`failed`, spent 0 base units, 0/3 legs**.
- **Root cause:** 2 of 3 pinned sub-agent services are **offline / absent** from the live catalog:
  - research `3f8b1e7d-…` → **gone** (0 candidates)
  - landing_copy `4bd62f49-…` → **gone** (0 candidates)
  - og_image `4dab1a29-…` (Pygm Studio) → still live (1 candidate)
- Pins are **authoritative / fail-closed** (deliberate safety contract — prior review rejected
  "pin-escape"). A stale pin ⇒ 0 candidates ⇒ leg unfillable ⇒ run fails, **money-safe ($0)**.
- **Baseline engine is sound:** `pnpm engine:smoke` = **COMPLETED 3/3, spent $0.70** (sandbox,
  real GLM + mock market). The failure is integration/marketplace, not code.
- **Live catalog snapshot** (161 services / 76 agents), *unpinned* discovery:
  - research → 5 candidates (ZERU `e8998099-…`, VERIS, DeFi Data Report) ✅
  - landing_copy → weak (seo_audit, summarize, autopost) — **no dedicated copywriter online** ⚠️
  - og_image → Pygm + others ✅
  - ⚠️ Praeco's **own** service now appears as a candidate for other legs → **self-hire risk**
    if pins are cleared.

## 🎯 The real defect (integrity gap)

Praeco **accepted + charged** a paid order it **could not fulfill**, then delivered an empty
failure-kit. A production-grade contractor must verify it *can* do the job **before** taking
the money, and reject-with-reason otherwise.

## 🔧 Proper fix plan — dedicated engine session (TDD + review) — ✅ SHIPPED (PR #12)

1. **Fulfillability pre-check before `accept`** — confirm every required leg has a live,
   hireable specialist; **reject-with-reason** if not (never deliver a failed kit / never
   charge for work that can't be done).
2. **Self-exclusion guard** — exclude own `agentId` (`ce5362ad-…`) from discovery candidates.
3. **Pin hygiene** — refresh `SVC_*` pins to online specialists (research→ZERU, og_image→Pygm;
   landing_copy TBD) + a **stale-pin startup warning**. Keep the fail-closed pin contract
   (do **not** re-introduce pin-escape).

Then one clean live 3/3 run → a real kit + a real on-chain hire-chain = the demo centerpiece.

## ✅ Post-fix live verification (2026-07-04, later) — the gate works; clean 3/3 is supply-blocked

A **read-only `$0` probe** (`pnpm marketplace:probe` — public REST, no WS, no spend) against the
live catalog (**164 services / 78 agents**) confirms the merged gate behaves exactly as designed,
and surfaces *why* a clean 3/3 isn't capturable yet.

**1. The gate correctly refuses to charge.** With the current `.env` pins, `checkFulfillability`
returns `ok=false` and would **reject-with-reason before `accept`** — `$0` spent:

> `research: pinned service 3f8b1e7d-… is offline (stale pin); landing_copy: pinned service 4bd62f49-… is offline (stale pin)`

Two dead pins ⇒ reject at `$0` ⇒ no empty-kit delivery, no charge. This is the integrity fix in action.

**2. Clean 3/3 is blocked by marketplace SUPPLY, not by pins or budget.** Refreshing pins fixes two
legs but not the third. A deeper `$0` schema check (`pnpm marketplace:probe --deliverables`) shows the
launch-kit cannot be cleanly staffed from the *current* marketplace at any budget:

| Leg | Best live option | Verdict |
|---|---|---|
| research | ZERU `e8998099-…` — $0.05, text report (`rel=28`, online) | ✅ clean, in budget |
| og_image | Pygm `4dab1a29-…` — $0.50, online, but delivers *"one redeemable **code** for a single image generation task"* — **not an inline image**. Every Pygm service is a "…Code"; **no inline-image provider exists in the catalog at any price**. | ❌ no clean provider |
| landing_copy | no copywriter in budget — Mirai = X-content/autopost MCP access, OpsPilot = SEO *audit* (consumes copy, doesn't write it). GhostWriter (plagiarism check) $1.00 and MegaPhone (real copy) $3.00 are **over the $0.60 leg cap**. | ❌ off-target / over cap |

So "one clean live 3/3" is gated on **marketplace supply** — a real inline-image provider **and** an
in-budget copywriter coming online — not on our code, our pins, or the wallet. Chasing it now would
spend real USDC for a ≤1/3 kit (one real research report, a redemption code where the image belongs,
off-target text where the copy belongs), which is exactly the anti-pattern the gate exists to prevent.

**Monitoring.** `pnpm marketplace:probe` flips to `✅ STAFFABLE` the moment supply allows (exit code 0);
until then the `$0` gate-rejection above **is** the on-chain-integrity proof — Praeco declines a job it
can't fully fulfill, before taking a cent.

## Reproduce / verify
- Baseline: `pnpm engine:smoke` → 3/3, $0.
- Live supply + gate check: `pnpm marketplace:probe` (read-only, $0, no WS) → per-leg staffability + the exact pre-accept gate verdict; add `--deliverables` for each candidate's deliverable format.
- Gate in sim: `pnpm door-b:sim` → fulfillable → accepted → delivered, $0.
- On-chain order: Basescan tx above; CROO **My Orders** shows order `35673686-…`.
