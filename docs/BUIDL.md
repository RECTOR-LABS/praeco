# Praeco — DoraHacks BUIDL

> Draft submission copy for the CROO Agent Hackathon. Paste into DoraHacks and trim per field limits.

## Tagline

An autonomous general contractor for product launches — it hires, pays, and QA's real specialist agents on CROO, then hands you a ready-to-post launch kit with on-chain receipts.

## The problem

Great products die at launch. The launch itself is a dozen small specialist jobs — market positioning, landing copy, an OG image, the Product Hunt / Hacker News / Twitter posts — and no solo builder has the time, taste, or budget to coordinate a dozen freelancers for each one. So the work gets skipped, and good products ship to silence.

## What Praeco does

You give Praeco one sentence (or a GitHub repo). It then, autonomously and on-chain:

1. **Discovers** specialist agents on the CROO marketplace and ranks them per job by relevance, reputation, and price.
2. **Hires and pays** them in USDC on Base — real orders, real settlement.
3. **QA's every deliverable** with an art-director pass that returns `accept` / `redo` / `swap`, and acts on the verdict (submit, retry, or switch providers).
4. **Composes** the results into a finished launch kit: landing copy, OG image, a tweet thread, a short pitch, a PH/HN blurb, and a polished README intro.

Every asset comes back with a **provenance card** — which agent produced it, how much it cost, the content hash, and a Basescan link. The full run is persisted as a replayable record.

## Why it's different

- **The replay *is* the audit trail.** One `RunRecord` powers both "watch it think" (a live Theater UI) and "verify it happened" (`/replay/:id` + on-chain receipts). Not a screenshot — a verifiable artifact.
- **A real QA curation loop**, not one-shot generation. The `accept/redo/swap` verdict is what turns raw marketplace output into a coherent kit, and it's rendered visibly rather than hidden.
- **Money is a hard invariant.** A per-leg price cap and a total run budget are enforced by the loop *before* any hire — the LLM cannot exceed them. On the seller side, Praeco spends only *after* the buyer has paid — and a **pre-accept fulfillability gate** makes it reject-with-reason rather than charge for a kit it can't fully staff and afford.

## Two doors, one engine (Praeco is callable)

The same engine sits behind two front doors:

- **Door A — Human web app** ([praeco.rectorspace.com](https://praeco.rectorspace.com)): describe a product, watch the run stream live, get the kit.
- **Door B — CAP seller**: Praeco is **registered and live on the CROO Agent Store** (`Product Launch Kit`, $2 USDC). An agent places an order; Praeco runs a **pre-accept fulfillability check** (reject-with-reason if it can't fully staff the kit), then accepts → waits for payment → runs the *same* `runLaunchJob()` → delivers the kit as markdown + a provenance JSON blob with a `contentHash`. The full lifecycle is **proven on Base mainnet** (order → paid → deliver, on-chain `txHash`).

Door B is what makes Praeco a two-sided participant in the agent economy, not a demo: it *buys* from the marketplace (hiring specialists, proven on Base) and *sells* into it (a **registered CROO seller**, its fulfillment lifecycle proven on Base).

## Proven on-chain

Praeco is live on **Base mainnet**, on both sides of the market:

- **As a buyer** — the engine has run autonomous hires across **independent counterparty agents**, each discovered, negotiated, paid in USDC, and delivered with verifiable on-chain receipts.
- **As a seller** — Praeco's CROO listing has completed the full order lifecycle on-chain (`order → paid → deliver`), committing a `contentHash` on delivery.

**Verify it yourself:**

- CROO seller listing — `Product Launch Kit`, serviceId `5168a527-df1d-45fb-bcaa-a638f2a1fcf9`
- Seller order lifecycle — order `35673686…`, deliver tx [`0x975474…ad84`](https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84) on Basescan

CI runs entirely on mocks — no live USDC in tests.

## How it's built

- **Agent loop:** GLM-5.2:cloud (via Ollama) driving a small deterministic toolbelt (`search_marketplace`, `get_service_schema`, `hire_specialist`, `qa_review`, `submit_asset`) through the [Pi SDK](https://pi.dev) (`@earendil-works/pi-agent-core` / `pi-ai`).
- **Marketplace + payments:** [`@croo-network/sdk`](https://www.npmjs.com/package/@croo-network/sdk) for CAP — both the buyer side (hiring) and the seller side (fulfillment) — with USDC settlement on Base.
- **Money guard:** a loop-level `beforeToolCall` gate enforcing the per-leg cap and run budget; spend committed at pay-time so accounting can't be lost.
- **Door A:** Next.js 15 (App Router) + Tailwind + shadcn/ui + Lucide, streaming the run over SSE; deployed on Vercel.
- **Quality:** TypeScript throughout, TDD with Vitest (CI runs entirely on mocks — no live USDC in tests).

## Links

- **Live app:** https://praeco.rectorspace.com
- **Repo (MIT):** https://github.com/RECTOR-LABS/praeco
- **CROO seller listing:** `Product Launch Kit` — serviceId `5168a527-df1d-45fb-bcaa-a638f2a1fcf9`
- **On-chain proof:** [deliver tx on Basescan](https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84)
- **Demo video:** _(add link once recorded)_

## What's next

- Broaden the specialist roster and pin a vetted golden-path provider set per leg.
- Richer kit formats (multi-image, video teaser) as marketplace providers appear.
- A public "order Praeco" flow so any agent can commission a launch kit end-to-end.
