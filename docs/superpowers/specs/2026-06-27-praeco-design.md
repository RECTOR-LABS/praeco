# Praeco — Design Specification

**Status:** Draft for review
**Date:** 2026-06-27
**Hackathon:** CROO Agent Hackathon (DoraHacks)
**Internal deadline:** **2026-07-09, 23:59 UTC+8** (organizer-graphic date — earlier and safer than the platform widget's "Jul 12 16:00"; we build to Jul 9)
**Key dates:** Submission Jul 9 · Internal review Jul 10–15 · **Demo Day Jul 16** · Final judging Jul 17–23 · Winners Jul 24
**Repo:** `RECTOR-LABS/praeco` (private until submission, flip public before filing the BUIDL)
**Tracks:** Creator & Content Ops Agents (primary) + Open – Any A2A Agents (secondary) — max 2 per BUIDL

---

## 1. One-liner

> **Praeco is a general contractor for product launches:** you describe what you built in one sentence (or paste a GitHub repo), and it automatically hires and pays a team of specialist AIs to deliver a ready-to-post launch kit — website copy, social images, and announcement posts — each carrying an on-chain receipt.

*Praeco* — Latin for **herald / public crier / auctioneer**. The auctioneer sense fits agent-commerce: Praeco convenes a market of specialists on your behalf.

**Punchy:** *One sentence in → a full launch kit out, built by a crew of AIs that Praeco hires and pays for you.*

## 2. Problem

People who build great things are usually too busy, broke, or non-marketing to launch them well. Producing the website copy, social images, announcement posts, and positioning is slow, scattered across a dozen tools, and normally means hiring and coordinating several freelancers. So **brilliant products launch to silence, or never launch at all** — not because they're bad, but because their makers ran out of time, skill, or money for the marketing.

**One-liner:** *Great products die at launch — not because they're bad, but because their makers can't market them fast, well, or cheaply.* Praeco closes that gap: what took a week and three freelancers now takes one sentence and a few cents.

## 3. What Praeco does — the core flow

Praeco is a **pure composer**: it never does the specialist work itself. For each job it acts as a general contractor — discovers the right specialist agents on the CROO marketplace, **hires and pays them in USDC** (one real CAP order each), quality-checks their deliverables, then composes the verified outputs into a finished launch kit and returns it with on-chain receipts.

**One run (example — habit-tracker app "Streaky"):**

1. **User pays Praeco** ~$2 USDC (CAP order: user → Praeco).
2. **Intake** — Praeco's brain (GLM-5.2) turns the repo URL / one-liner into a structured brief.
3. **Discover + hire** real marketplace specialists — each a genuine CAP order (lock escrow → deliver + proof → Praeco verifies → settle on Base, with a Basescan receipt):
   - research → e.g. **ProofResearch** (~$0.10)
   - landing page + copy → e.g. **Foundr** "Landing Page" (~$0.10)
   - OG/social image → e.g. **Pygm Studio** (~$0.50)
   - (optional) SEO audit → e.g. **OpsPilot** (~$0.10)
4. **QA + compose** — Praeco's GLM-5.2 critic-pass accepts/redoes/swaps each deliverable, then stitches everything together and generates the launch tweet thread, the Product Hunt / Hacker News blurb, and README polish.
5. **Deliver** the finished kit + **on-chain provenance** (Basescan links proving every payment).

**Money flow (per run):** user → Praeco **+$2.00**; Praeco → 3 specialists **−$0.70**; **Praeco keeps ~$1.30**. Praeco is a buyer *and* a seller in the live economy — it earns from the user, spends on the crew, keeps the spread.

**Two front doors, one engine:**
- **Door A (hero):** human web app (Next.js/Vercel) — intake, the live "Agent-Economy Theater", finished kit + receipts.
- **Door B (mandatory):** Praeco listed as a callable CAP service on the CROO Agent Store — other agents/humans can hire it. Same engine.

Both doors funnel into the **same CAP entry point**: a human on Door A connects a wallet and the app places a CAP order to Praeco's listed service, exactly as an agent caller would on Door B. So every job — human or agent — is a real CAP order, and Door A buyers count toward the ≥5 unique buyer wallets.

## 4. Hackathon fit — why this can win

**Judging weights (confirmed from the live page):**

| Weight | Criterion | How Praeco scores |
|---:|---|---|
| **30%** | Technical Execution (bonus: 10+ real CAP orders) | Every run = 3+ real CAP orders → clears the bonus fast; full lifecycle incl. verify/dispute |
| **25%** | A2A Composability (diversity & depth) | Hires 3+ **diverse, independent** agents per run — by design |
| **20%** | Innovation (hard-to-replicate) | Moved off the (taken) mechanic onto a **curated, verifiable, watchable vertical product** — see §5/§8 |
| **15%** | Usability & Real Adoption | Polished human product + audience-driven real buyers |
| **10%** | Presentation (scored at Demo Day) | The Agent-Economy Theater demos like nothing else; clean README |

**Prize structure (global leaderboard, NOT per-track):** 1st $3,500 · 2nd $2,500 · 3rd $1,500 · 4th–10th $300×7 · **Most Popular Agent $300** · **Most Innovative Agent $300** · plus Agent Store featured listing, $CROO airdrop whitelist (top 10), permanent listing. **Realistic targets:** top-10 + Most Innovative / Most Popular.

**Anti-sybil — cleared by design** (see §9): pure-composer hires *real independent* agents, so ≥3 unique counterparties and zero self-trade are structural, not bolted on.

## 5. Competitive landscape & differentiation

**The mechanic is already taken.** The 335-agent store has a cluster of "agent-hires-agents" composers: **CROO Contractor** ("A2A general contractor… hires, verifies, composes specialists, on-chain proof bundle" — 5 orders, $2.85, dev-tooling), **Axion** ("composer agent: subcontracts a multi-agent task, escrows USDC per sub-hire"), **Universal Workbench** ("request → structured workflow"), plus BUIDLs **CAProxy** and **CROO A2A Agent Chain**.

**But the vertical is wide open.** Store search: "launch kit" → nothing; "marketing" → nothing; "launch" → only crypto memecoin/DeFi launchers. **No one runs a creator/launch-kit product, and every composer is headless dev-tooling** with single-digit order counts.

**Differentiation — we win on *product*, not mechanic.** The four locked novelty features (§8) exploit what headless composers structurally cannot do:

> *Everyone else built headless plumbing that fires sub-hires and returns a blob. Praeco is a **curated, quality-controlled, watchable launch studio**: paste your repo, watch a real agent economy research, write, and design your launch live — Praeco QA's every hire (redoing or swapping failures), and every asset carries an on-chain receipt.*

## 6. Architecture

**Principle:** small, well-bounded units, each with one purpose and a clear interface, communicating through typed contracts. TypeScript end-to-end so the engine and app share types.

### Modules

| Module | Responsibility | Key deps |
|---|---|---|
| **Intake** | Repo URL / text → structured `LaunchBrief` (product, audience, features, tone). Reads README + code via GLM-5.2's 1M context. [novelty 4] | `pi-ai`, GLM-5.2 |
| **Discovery** | Query CAP marketplace for candidate specialists per leg; rank by reputation/Merit/completion-rate. [novelty 3] | `@croo-network/sdk`, CAP MCP |
| **Orchestrator** | The Pi agent loop: per leg, negotiate → lock escrow → receive deliverable + proof → hand to QA. CAP ops exposed as agent tools. | `pi-agent-core`, `@croo-network/sdk` |
| **QA / Critic** | GLM-5.2 art-director pass per deliverable: `accept` / `redo` / `swap-provider` against the brief. [novelty 3] | `pi-ai`, GLM-5.2 |
| **Composer** | Assemble verified deliverables + generate tweet thread, PH/HN blurb, README polish → `LaunchKit`. | `pi-ai`, GLM-5.2 |
| **Provenance** | Per-asset provenance cards (agent, amount, result hash, Basescan link). [novelty 2] | `@croo-network/sdk` |
| **Settlement** | Settle each sub-order (or dispute on QA-fail) in USDC on Base. | `@croo-network/sdk` |
| **Worklog/Events** | Emit a typed event for every step → SSE stream. Backbone of the Theater + replay. [novelty 1] | SSE |
| **Wallet** | ERC-4337 vault / Base wallet, USDC balance, gas. | `@croo-network/sdk` |
| **Web app (Door A)** | Next.js: intake form, live Agent-Economy Theater, finished kit + provenance, shareable replay page. [novelty 1,2] | Next.js, Tailwind, shadcn |
| **CAP listing (Door B)** | Praeco's own callable CAP service (mandatory requirement). | `@croo-network/sdk` |

### Tech stack (locked)

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Engine / agent runtime | **Pi SDK** — `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`, Node service on the **reclabs VPS** (persistent WebSocket for CAP order events — not serverless) |
| LLM | **GLM-5.2:cloud** (Z.ai, MIT, 1M context) via `pi-ai`'s Ollama provider — **one** model, reused for intake + QA + composition. OpenRouter as a swappable polish fallback. |
| CAP / settlement | `@croo-network/sdk` (+ CAP MCP `mcp://crew.network`: `marketplace.search`, `task.fund`, `settle.preview`, `wallet.balance`); USDC on **Base** |
| Web app | Next.js (App Router) + Tailwind + shadcn/ui on Vercel; live worklog via SSE |
| Images/research/copy | **Hired from the marketplace** — 0 image/research models in our code |

### Data flow

`User (web OR CAP call)` → Intake → Discovery → **per leg:** [Orchestrator hire → verify proof → QA → (settle | redo | swap)] → Composer → Provenance → **Deliver** (kit + receipts). The Worklog streams every step to the Theater throughout; each run is persisted as a shareable replay.

## 7. The launch kit (outputs)

**MVP kit:** landing copy · OG/social image · launch tweet thread · one-line pitch + short PH/HN blurb · README polish — each tagged with its provenance card.
**Stretch:** SEO audit, cold-DM template, badge set.

## 8. Novelty features — core (locked)

1. **🎭 Agent-Economy Theater.** A public, real-time stage where anyone *watches* Praeco discover → negotiate → pay → verify → settle each specialist, Basescan receipts streaming live; every run produces a **shareable replay**. Headless composers cannot offer this. → Presentation, Most Popular, Adoption.
2. **🧾 Proof-carrying launch kit.** Every asset ships with an on-chain provenance card (agent, amount, result hash, Basescan link). A verifiable marketing supply chain — on-thesis with CAP's "no proof, no payment." → Innovation, Composability.
3. **🔍 Curate + QA critic loop.** Discovery picks the *best* agent per leg (reputation/Merit routing); a GLM-5.2 critic pass then `accept`/`redo`/`swap`s each deliverable against the brief — using CAP's full verify/dispute lifecycle most demos skip. → Technical Execution, Adoption.
4. **📦 Repo-native intake.** Paste a GitHub URL; Praeco reads README + code via GLM-5.2's 1M context to auto-infer product/audience/features and brief the specialists. → Innovation, Usability.

**Wildcards (stretch):** visible negotiation among competing bids · tip-the-best-sub-agent bonus · forkable/re-runnable kit recipes.

## 9. Anti-sybil & demand strategy

**The real moat is demand, not the build.** Reward-eligibility flags (reviewed, not auto-DQ): <3 unique counterparty agents, <5 unique buyer wallets, concentrated self-trade, random 10% audit failure. Onboarding rewards capped at 3 agents per wallet cluster.

- **≥3 unique counterparty agents:** structural — every run hires 3+ *independent* specialists. Discovery deliberately rotates providers across runs to maximize diversity/depth.
- **No self-trade:** pure-composer means we never hire our own agents (the "build our own copywriter" idea stays a stretch and, if ever built, must remain a minority leg).
- **≥5 unique buyer wallets:** RECTOR's audience (RECTOR Academy / X / Discord) — motivated by a real launch kit + the $CROO airdrop whitelist. They *pay* Praeco, which funds the hires.
- **10% human audit:** every run is real and on-chain-verifiable; the Theater replay *is* the audit trail.

## 10. Reliability & error handling

Third-party specialist flakiness is the #1 demo risk (even CROO Contractor shows an EXPIRED order). Mitigations:
- **Per-leg fallback providers + retries** via Discovery; the QA loop can `swap` a failed/poor provider mid-run.
- **Graceful degradation:** if a hire fails, the Theater *reports it and continues* — reads as robustness, and past on-chain receipts still prove the system works.
- **Recorded golden-path run** for the demo video, independent of live third-party uptime.
- No silent failures: every error surfaces in the worklog with an actionable message.

## 11. Economics — the free route

| Line | Cost |
|---|---|
| Web app (Vercel hobby + subdomain) · engine (existing VPS) · LLM (Ollama Cloud flat-rate) · domain · Base gas (0%-fee window) | **$0** |
| USDC float for sub-hires (~$1/run) | self-funding: buyer pays $2 > $0.70 hires → net positive after first buyer |
| Bootstrap float (recouped by first buyers) | **~$0–10** |

**Net out-of-pocket: ~$0–10**, against a $10,200 pool. Cash is not the constraint; time + traction are.

## 12. Testing strategy

- Unit tests for every module (Intake parsing, Discovery ranking, QA verdicts, Composer, Provenance) — `pnpm test:run`, 80%+ on new code (CIPHER standard).
- CAP integration tested on **testnet first** (free faucet USDC), then a minimal mainnet pass.
- Golden-path e2e: brief → kit, with mocked specialist responses for deterministic CI.
- Reliability tests: simulate a failed/slow/poor hire → assert retry/swap/graceful-degradation.

## 13. Hard requirements checklist (all 5 mandatory)

- [ ] Listed on CROO Agent Store (Door B)
- [ ] Integrated with CAP — callable, settles on-chain
- [ ] Open source — public repo, MIT / Apache-2.0
- [ ] Demo (≤5-min video) + README (setup, SDK methods used, integration notes)
- [ ] BUIDL filed on DoraHacks before the deadline

## 14. Scope — MVP vs stretch

- **MVP (must ship):** pure-composer engine (discover→hire→verify→QA→compose→settle), Door A web app with Agent-Economy Theater + proof cards, repo-native intake, Door B CAP listing, the 5 hard requirements.
- **Stretch:** wildcards (visible negotiation, tip-the-best, forkable kits); SEO/cold-DM/badge outputs; our-own-copywriter fallback agent (only if quality/time demands, kept a minority leg).

## 15. Phase-0 de-risk / open questions

1. CAP SDK smoke test: list a test agent, place + settle a test USDC order (testnet → mainnet).
2. Agent registration/listing fee (if any) under the 0%-fee window.
3. Testnet vs mainnet for "real orders" judging — confirm via CROO Discord.
4. Exact per-service prices for the research + copy legs.
5. ERC-4337 vault deployment cost under the 0%-gas window.
6. Pi SDK embedding API + tool-definition pattern + GLM-5.2-via-Ollama wiring.
7. Does CAP expose reputation/Merit data for Discovery ranking (novelty 3)?
8. CROO builder faucet / USDC credit availability (could make it literally $0).

## 16. Milestones to Jul 9 (~12 days)

| Phase | Milestone |
|---|---|
| **0 · De-risk** | CAP SDK smoke test + Pi SDK + GLM-5.2 wiring (answers §15) |
| **1 · Engine** | Intake → Discovery → Orchestrator → QA → Composer → Settlement (testnet) |
| **2 · Doors** | Door A web app + Agent-Economy Theater + proof cards; Door B CAP listing |
| **3 · Real** | Mainnet orders; manufacture demand (≥3 counterparties, ≥5 buyer wallets) |
| **4 · Submit** | ≤5-min demo video + README; flip repo public; file BUIDL; prep Demo Day (Jul 16) |
