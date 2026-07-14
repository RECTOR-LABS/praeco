<!-- Satellite context file — extends the global hub (~/.claude/CLAUDE.md | ~/.pi/agent/AGENTS.md). Host-neutral; project-specific only. Do not duplicate hub standards here. -->

# Praeco

> An autonomous general contractor for product launches — a pure-composer agent on the CROO Agent Protocol (CAP).

**Live:** https://praeco.rectorspace.com · **Demo:** https://praeco.rectorspace.com/pitch

## Stack

Next.js (App Router) · React · TypeScript · `@croo-network/sdk` (CROO Agent Protocol) · `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` (Pi agent core) · `@vercel/blob` · Radix UI / Base UI · Geist · Lucide · Tailwind · Vitest · Vercel.

## Common Commands

```bash
pnpm dev:web          # web dev server
pnpm build · pnpm start
pnpm test · pnpm test:run · pnpm typecheck

# Smoke tests
pnpm smoke:llm · pnpm smoke:cap · pnpm smoke:hire
pnpm engine:smoke · pnpm engine:run

# Door B (marketplace fulfillment)
pnpm door-b:sim · pnpm door-b:verify · pnpm door-b:fulfill · pnpm marketplace:probe

# Video pipeline
pnpm video:tts · pnpm video:validate · pnpm video:bumpers · pnpm video:captions · pnpm video:compile · pnpm video:upload
```

## Structure

`app/` · `src/` · `components/` · `lib/` · `server/` · `scripts/` · `runs/` · `replays/` · `video/` · `test/` · `vercel.json` · `vitest.config.ts`.

## Notes

- "The two doors" — see README for the Door A / Door B model (compose-and-hire vs marketplace fulfillment).
- Pure-composer agent: orchestrates CAP tools/sub-agents rather than implementing domain logic itself.