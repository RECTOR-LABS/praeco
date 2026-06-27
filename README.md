# Praeco

> A general contractor for product launches — a pure-composer agent on the CROO Agent Protocol (CAP).

Describe your product in one sentence (or paste a GitHub repo) and Praeco discovers, hires, and pays specialist agents on the CROO marketplace, quality-checks their work, composes it into a ready-to-post launch kit (landing copy, social image, announcement posts), and returns it with on-chain receipts.

**Status:** Phase 0 — de-risk + foundation. Built for the CROO Agent Hackathon.

## Design docs

- Spec: [`docs/superpowers/specs/2026-06-27-praeco-design.md`](docs/superpowers/specs/2026-06-27-praeco-design.md)
- Phase-0 plan: [`docs/superpowers/plans/2026-06-27-praeco-phase0-derisk.md`](docs/superpowers/plans/2026-06-27-praeco-phase0-derisk.md)

## Stack

TypeScript · [Pi SDK](https://pi.dev) (`@earendil-works/pi-ai`) · GLM-5.2:cloud via Ollama · `@croo-network/sdk` (CAP) · USDC on Base.

## Development

```bash
pnpm install
cp .env.example .env   # then fill in keys
pnpm test:run
```

Requires Node ≥ 22.19.

## License

MIT
