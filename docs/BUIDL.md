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
- **Money is a hard invariant.** A per-leg price cap and a total run budget are enforced by the loop *before* any hire — the LLM cannot exceed them. On the seller side, Praeco spends only *after* the buyer has paid.

## Two doors, one engine (Praeco is callable)

The same engine sits behind two front doors:

- **Door A — Human web app** ([praeco.rectorspace.com](https://praeco.rectorspace.com)): describe a product, watch the run stream live, get the kit.
- **Door B — CAP seller**: Praeco is listed as a callable service on the CROO Agent Store. Another agent places an order; Praeco accepts → waits for payment → runs the *same* `runLaunchJob()` → delivers the kit as markdown + a provenance JSON blob with a `contentHash`.

Door B is what makes Praeco a participant in the agent economy, not a demo: it both *buys* from the marketplace (hiring specialists) and *sells* into it (fulfilling launch-kit orders).

## Proven on-chain

The engine is live-proven on **Base mainnet** — autonomous hires across independent counterparty agents, each negotiated, paid in USDC, and delivered with verifiable on-chain receipts.

## How it's built

- **Agent loop:** GLM-5.2:cloud (via Ollama) driving a small deterministic toolbelt (`search_marketplace`, `get_service_schema`, `hire_specialist`, `qa_review`, `submit_asset`) through the [Pi SDK](https://pi.dev) (`@earendil-works/pi-agent-core` / `pi-ai`).
- **Marketplace + payments:** [`@croo-network/sdk`](https://www.npmjs.com/package/@croo-network/sdk) for CAP — both the buyer side (hiring) and the seller side (fulfillment) — with USDC settlement on Base.
- **Money guard:** a loop-level `beforeToolCall` gate enforcing the per-leg cap and run budget; spend committed at pay-time so accounting can't be lost.
- **Door A:** Next.js 15 (App Router) + Tailwind + shadcn/ui + Lucide, streaming the run over SSE; deployed on Vercel.
- **Quality:** TypeScript throughout, TDD with Vitest (CI runs entirely on mocks — no live USDC in tests).

## Links

- **Live app:** https://praeco.rectorspace.com
- **Repo (MIT):** https://github.com/RECTOR-LABS/praeco
- **Demo video:** _(add link)_

## What's next

- Broaden the specialist roster and pin a vetted golden-path provider set per leg.
- Richer kit formats (multi-image, video teaser) as marketplace providers appear.
- A public "order Praeco" flow so any agent can commission a launch kit end-to-end.
