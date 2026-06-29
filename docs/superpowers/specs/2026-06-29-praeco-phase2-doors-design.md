# Praeco — Phase 2 Design Spec: The Two Doors (Web App + CAP Listing)

**Status:** Draft for review
**Date:** 2026-06-29
**Hackathon:** CROO Agent Hackathon (DoraHacks) — submission **2026-07-09 ~23:59 UTC+8** (~10 days), Demo Day **Jul 16**
**Builds on:** `docs/superpowers/specs/2026-06-27-praeco-design.md` (master design) · Phase-1 engine (proven on-chain, merged PR #1) · `docs/superpowers/specs/2026-06-28-phase1-engine-proof.md`
**Branch:** `feat/phase0-derisk` (holds Phase 0 + 1)

---

## 1. Goal

Phase 1 delivered the **engine**: `runLaunchJob(input, deps) → RunRecord`, a GLM-5.2 agent loop that discovers → hires → pays → QA's → composes real CAP specialists on Base, emitting a typed `WorklogEvent` stream. It is proven (9 live hires, 3 counterparties) and merged.

Phase 2 wraps that engine in the **two front doors** the hackathon judges and scores:

- **Door A (hero):** a human web app — Landing → Intake → live **Agent-Economy Theater** → Finished Kit → shareable Replay.
- **Door B (mandatory):** Praeco listed as a callable **CAP service** on the CROO Agent Store, hitting the *same* engine entry point.

Phase 2 also folds in the **engine-quality fixes** Phase 1 deferred, so the demo's golden-path run produces a clean 3/3 kit.

**Why this is the judged hero:** Door A drives Innovation (20%) + Usability/Adoption (15%) + Presentation (10%) = 45% of the score, and the live on-chain runs it enables feed the Technical-Execution order-count bonus (30%).

## 2. Decisions locked (from the Phase-2 brainstorm)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Run experience | **Hybrid, replay-anchored** | Dominates/ties every judging criterion; highest Presentation *floor* (replay can't flake on Demo Day) while still earning real on-chain orders via gated-live. |
| D2 | Deploy target | **Railway** (not Vercel) | Long-lived container → no serverless timeout, native WebSocket + minutes-long SSE. Resolves the master spec's Vercel-vs-VPS contradiction. |
| D3 | Topology | **Single Railway service**: Next.js (standalone) + engine **in-process**, per-run CAP WS | Simplest; engine stays an importable module so a web/worker split is a later option, not a prerequisite. |
| D4 | Theater layout | **A — Trading floor**: 3 leg-lanes + live money ledger | Best spectacle-per-build-hour; makes A2A composability + on-chain proof *visible*; plain shadcn, projector-safe. |
| D5 | Run modes | **replay** (default, public, $0) · **sandbox** (public, $0, real GLM + mock CAP) · **live** (RECTOR-gated, real USDC) | Public visitors always get a safe, real-looking show; live stays behind a server-side gate. |
| D6 | Live-run gating (Phase 2) | **Server-side secret / allowlist; RECTOR-only.** Browser wallet-connect + pay-Praeco buyer flow → **Phase 3.** | Prevents a public form from draining the agent wallet; buyer wallets are a Phase-3 traction task either way. |
| D7 | Replay persistence | **`RunRecord` JSON on a Railway volume**; `/replay/:id` reads it | No DB needed for read-by-id; Postgres only if we later want indexing/search. |

## 3. Architecture

### 3.1 Engine-as-a-service (no engine refactor)

The engine already exposes exactly the seam Phase 2 needs:

- `runLaunchJob(input, deps)` accepts `deps.onEvent: (e: WorklogEvent) => void` and `Worklog.subscribe()` fans out every event live.
- `RunRecord` (the return value) already serializes the full run (brief, assets, kit, worklog, spend, receipts) — it *is* the replay format, already written to `runs/<runId>.json` by `scripts/run-job.ts`.

So Phase 2 adds a **transport + UI** around an unchanged engine. The only engine touches are the deferred quality fixes in §7 (independent of the web layer).

### 3.2 Repo structure (low-churn, single package)

Keep one package. Add Next.js (App Router) at the repo root; the engine stays in `src/` and is imported directly by route handlers and server modules.

```
app/                      # Next.js App Router (UI + API routes) — NEW
  (marketing)/page.tsx    # 1 Landing
  intake/page.tsx         # 2 Intake
  run/[id]/page.tsx       # 3 Theater (live: sandbox/live runs)
  replay/[id]/page.tsx    # 5 Replay (persisted RunRecord)
  kit/[id]/page.tsx       # 4 Finished Kit (also embeddable in 3/5)
  api/runs/route.ts       # POST start run -> {runId}
  api/runs/[id]/stream/route.ts   # GET SSE
components/               # shadcn + Theater components — NEW
server/                   # web<->engine glue (run hub, persistence, gating) — NEW
src/                      # engine — UNCHANGED (cap/, engine/, llm/, types.ts…)
scripts/                  # CLIs — unchanged
```

Rationale: avoids restructuring the proven engine into a monorepo mid-hackathon; types are shared by direct import (`import type { WorklogEvent } from "@/src/types"`). A pnpm-workspace split is noted as a post-submission option, not now.

### 3.3 Deployment (Railway)

- One service, `next build` with `output: "standalone"`, started as a Node server (`node .next/standalone/server.js`). Long-lived → SSE streams for the whole run; per-run `connectWebSocket()` / `close()` exactly as `run-job.ts` does today.
- A **Railway volume** mounted at `/data/runs` holds `RunRecord` JSON. `RUNS_DIR` env points the persistence module at it (defaults to `./runs` locally).
- All engine env vars (CROO_*, OLLAMA_*, BASE_RPC_URL, PRAECO_AGENT_ID/WALLET, SVC_* pins) become Railway service variables. New: `LIVE_RUN_TOKEN` (gate), `RUNS_DIR`, `PUBLIC_BASE_URL` (for share links). Secrets never reach the client.
- The Railway skill (`npx skills add railwayapp/railway-skills`) is added at the deploy step.

## 4. SSE transport & run lifecycle (the core)

### 4.1 Run hub

`server/run-hub.ts` keeps an in-memory registry of active runs:

```
type RunMode = "replay" | "sandbox" | "live";
interface ActiveRun {
  runId: string;
  mode: RunMode;
  status: "running" | "done" | "error";
  buffer: SseEvent[];        // every event so far, with monotonic id
  subscribers: Set<(e: SseEvent) => void>;
  record?: RunRecord;        // set on completion
}
interface SseEvent { id: number; event: WorklogEventKind; data: WorklogEvent; }
```

- **Start (sandbox/live):** `POST /api/runs` validates input + mode, creates an `ActiveRun`, and kicks off `runLaunchJob(input, deps)` with `onEvent` pushing each `WorklogEvent` into the buffer (assigning an incrementing `id`) and fanning out to subscribers. On resolve, store `record`, write JSON to `RUNS_DIR`, mark `done`. Returns `{ runId }`.
- **Stream:** `GET /api/runs/:id/stream` returns an SSE `ReadableStream`. On connect it **first flushes the buffer** (so late joins / refreshes catch up — critical for a public link), honoring `Last-Event-ID` to resume after a drop, then forwards live events until a terminal event (`run_completed` / `run_aborted` / `error`), then closes.
- **Backpressure / lifetime:** active runs are evicted from memory after completion + a short TTL (the persisted JSON is the source of truth thereafter). A heartbeat comment (`:\n\n`) every 15s keeps proxies from closing idle live runs.

### 4.2 Replay path

`GET /api/runs/:id/stream` with no active run (or `?mode=replay`) loads `RUNS_DIR/<id>.json` and **re-emits `record.worklog[]` paced by the original `at` deltas**, clamped to `[120ms, 1500ms]` between events so it feels live without dragging. Query `?speed=1|4|max` (max = no delay) drives a Theater speed control. Same wire format as live → the Theater component is mode-agnostic.

### 4.3 Wire format

Standard SSE: `id: <n>\nevent: <WorklogEventKind>\ndata: <JSON WorklogEvent>\n\n`. The client's `EventSource` switches on `event` to update lane state, the ledger, and the thinking feed. One schema, three modes, two doors.

## 5. Run modes & security

| Mode | Trigger | CAP | Money | Gate |
|---|---|---|---|---|
| **replay** | open `/replay/:id` or Landing "Watch a run" | none (reads JSON) | $0 | public |
| **sandbox** | Intake → "Try it free" | **mock** marketplace (the existing `run-job.ts` mock path) | $0, no chain | public, rate-limited |
| **live** | Intake → "Run live ⚿" | **real** CAP on Base | real USDC | **`LIVE_RUN_TOKEN` required** |

**Hardening (code, not prose):**
- `POST /api/runs` validates with zod: `mode ∈ {replay,sandbox,live}`; input is `{ text }` (≤2000 chars) **or** `{ repoUrl }` (must match `^https://github.com/[\w.-]+/[\w.-]+/?$`). Reject otherwise with an actionable 400.
- **live** requires a valid `LIVE_RUN_TOKEN` (header/`Authorization`); without it → 403. The Landing "Run live" CTA is behind a minimal admin gate that holds the token server-side; it is never shipped to anonymous clients.
- Concurrency caps: **1 live run at a time**, ≤3 concurrent sandbox runs, per-IP rate limit on `POST /api/runs`. Excess → 429 with retry hint.
- Sandbox uses the existing mock CAP/fetch (real GLM, $0) so the agent loop is genuine but no chain/USDC is touched.
- The engine's existing money safety (BudgetGuard, pay-only-in-`created`, single payOrder/hire, funding gate, MAX_TURNS) remains the last line of defense on any live run.

## 6. Door A — the five screens

**Stack:** Next.js App Router + Tailwind + shadcn/ui. Dark theme (projector-first). Lucide icons (no emoji-as-icon).

1. **Landing / Hero.** One-line pitch + the thesis (great products die at launch). Three CTAs → the three modes: ▶ *Watch a run* (opens a flagship replay), *Try it free* (sandbox intake), *Run live ⚿* (gated). A strip of recent shareable replays with their on-chain totals.
2. **Intake.** One smart field that accepts a one-liner **or** a GitHub URL (repo-native intake; auto-detected). Optional advanced overrides (audience/tone) collapsed by default — `buildBrief` infers them otherwise. Mode selector (segmented). Submit → `POST /api/runs` → redirect to `/run/:id`.
3. **Theater (Layout A) — the hero.** Streams the live run:
   - **Brain bar:** Praeco status, run timer, live **spend meter** (sums `hire_paid` amounts vs. the brief's budget), leg progress (n/3).
   - **3 lanes** (Research · Landing copy · OG image), each advancing a stage rail driven by events: `leg_search → leg_candidate → hire_negotiating → hire_order_created → hire_paid → hire_delivered → qa_verdict → asset_submitted`. `hire_blocked` / QA `redo`/`swap` render as a visible state change (robustness, not a hidden retry). A receipt chip appears in-lane on `hire_paid`.
   - **Money ledger:** a streaming ticker of payments — `agentName → $amount → Basescan ✓` (link from `provenance.basescanUrl`).
   - **Thinking feed:** `agent_step` narration (collapsible) so judges see Praeco reason.
   - On `run_completed`, a "View kit" CTA reveals screen 4.
   - **Event → UI map is the contract** between engine and Theater; it lives in this spec and a typed `theaterReducer`.
4. **Finished Kit.** Renders `LaunchKit`: landing copy, OG image, tweet thread, short pitch, PH/HN blurb, README polish — each with its **provenance card** (`agent · $amount · contentHash · Basescan ↗`). Copy-to-clipboard per asset, download (kit JSON + markdown), and a **Share** button → the replay URL. **Graceful image handling:** if `ogImageRef` is a URL → render the image; if it is `hash:<…>` or a redemption reference (the known Pygm format gap, §7) → show the provenance + an "asset reference" card rather than a broken `<img>`.
5. **Replay.** `/replay/:id` — the *same* Theater component re-playing a persisted `RunRecord`, with a speed control (1×/4×/skip) and the finished kit below. Open-graph tags make the shared link rich. This is novelty 1's "the replay *is* the audit trail."

## 7. Engine prerequisites for a clean kit (deferred Phase-1 quality)

A flawless golden-path run must exist to anchor the flagship replay + demo video. These are understood from Phase 1 (no redesign needed) — execution only:

- **Research leg:** already solved — pin `SVC_RESEARCH=2aaf227e-…` (Foundr "Idea Analysis", $0.10); QA accepts it for a DeFi product. Pins are authoritative + fail-closed.
- **Copy/image deliverable-FORMAT gap:** Pygm "Code" services return a redemption code + platform URL, not inline content → QA rejects. Fix: (a) prefer providers that deliver **inline** copy / an inline image URL (evaluate Foundr "Landing Page" `4bd62f49…` / "Brand Identity"), **or** (b) add an engine step that redeems the code / fetches the report link and feeds fetched content to QA + compose. Decide during implementation by testing the candidate providers.
- **QA `swap` vs `redo`** (`src/engine/qa.ts`): on a wrong-type/format deliverable return `swap`, not `redo`.
- **Pin redo-cap:** an authoritative pin that keeps failing QA currently redo-loops to MAX_TURNS — add a per-leg redo cap with swap-fallback.
- **Wallet:** top up the agent wallet `0xee47…7D31` (~0.74 USDC now) before any live demo run.

These ship as their own small commits/plan, sequenced **before** the demo recording, and are exercised by the existing vitest + `engine:smoke`.

## 8. Door B — Praeco as a callable CAP service (mandatory)

Door B lists Praeco as a **seller** on the CROO Agent Store; an inbound order maps to the same `runLaunchJob`.

- **De-risk spike first (mirrors Phase 0):** Phase 0/1 used the SDK's **buyer** side (`AgentClient` hiring). Door B needs the **seller/provider** side — register/list a service under the existing agent (`ce5362ad-…`), subscribe to inbound order events over the WS, accept → run → deliver with a `contentHash`. **First task is a focused smoke** confirming the SDK's seller API shape and the listing flow on mainnet, exactly as Phase 0 de-risked the buyer flow. The design below is contingent on that spike; if the SDK lacks a seller path, we fall back to the documented CAP listing/registration flow and adapt.
- **Service definition:** requirement schema `{ brief: string }` (the one-liner or repo URL). Price ~$2.00 USDC (master spec money flow: +$2 in, −~$0.70 hires, ~$1.30 kept). Deliverable: the kit as markdown + a provenance JSON blob; `contentHash` over the deliverable.
- **Handler:** inbound order → parse `brief` → `IntakeInput` → `runLaunchJob` (live deps) → on `completed`, deliver the kit; on `partial`/`failed`, deliver what passed QA + a note (graceful degradation) or dispute per CAP lifecycle.
- **Shared entry point:** Door A's live route and Door B's handler both call one `startEngineRun()` in `server/` → literally "two doors, one engine," and Door B brings Praeco **ONLINE** (a hard requirement).

## 9. Data contracts

- **Reused unchanged:** `WorklogEvent`/`WorklogEventKind`, `RunRecord`, `LaunchKit`, `LaunchAsset`, `ProvenanceCard` (`src/types.ts`).
- **New (web layer, `server/types.ts`):** `RunMode`; `SseEvent { id; event; data }`; `StartRunRequest { mode; text? ; repoUrl? }`; `StartRunResponse { runId }`. No new engine types.

## 10. Testing strategy

- **Engine:** existing 101 vitest stay green; the §7 fixes add unit tests (QA swap-vs-redo, pin redo-cap, any redeem/fetch step). `pnpm test:run` + `pnpm typecheck` green before every commit.
- **Web — run hub & SSE:** unit-test the hub (buffer + fan-out + `Last-Event-ID` resume + terminal close) and the replay pacer against a **committed fixture `RunRecord`** (exported from one of the real Phase-1 runs — `runs/` is gitignored, so a sanitized copy lands in `test/fixtures/`). Mode/gate/zod validation tested at the route boundary (live without token → 403; bad input → 400; concurrency cap → 429).
- **Theater reducer:** pure `theaterReducer(state, WorklogEvent)` unit-tested across the full event sequence incl. `hire_blocked`, `qa_verdict: redo|swap`, partial runs.
- **e2e smoke:** drive `/run/:id` (sandbox) and `/replay/:id` against a fixture; assert lanes/ledger/kit render. No mainnet in CI — sandbox + fixtures only.

## 11. Implementation sequencing & scope

**Build order (writing-plans will detail Door A first):**
1. **Door A skeleton** — Next.js on Railway, run hub + SSE, sandbox mode end-to-end, Theater A consuming a fixture, then live sandbox. *(Hero, de-risks Demo Day first.)*
2. **Replay + persistence + Finished Kit** — volume JSON, `/replay/:id`, kit view + share.
3. **Engine §7 fixes** — clean golden-path kit; produce the flagship replay.
4. **Door B** — seller de-risk spike → listing → handler. *(Mandatory; smaller than Door A.)*
5. **Live mode hardening + gate**, then a gated live run to seed the flagship replay.

**In scope:** the five screens, three modes, SSE transport, replay persistence, Door B listing, the §7 engine fixes.
**Out of scope (Phase 3+):** browser wallet-connect + pay-Praeco buyer flow, ≥5 buyer-wallet traction, Postgres/indexing, the master spec's stretch wildcards (visible bidding, tip-the-best, forkable recipes), `feat/phase0-derisk → main` merge + public flip + BUIDL filing (Phase 4).

## 12. Risks & mitigations

- **Door B SDK seller path unknown** → front-load the de-risk spike (§8); Door A (the scored hero) does not depend on it.
- **Third-party provider flakiness during a live demo** (master spec's #1 risk) → the flagship **replay** is the demo anchor; live is shown as proof, not depended on. Graceful degradation already in the engine.
- **Long SSE on a platform proxy** → Railway is long-lived; heartbeat comments + `Last-Event-ID` resume keep streams robust.
- **Single in-process engine concurrency** → fine at demo scale with the §5 caps; web/worker split is a known later option (engine is already an importable module).
- **Image/copy format gap** (§7) → Kit view degrades gracefully *and* the engine fix targets a real inline asset; either way the demo never shows a broken image.
- **10-day window** → Door A first (max score, max de-risk); Door B is mandatory-but-small; engine fixes are scoped and understood.
