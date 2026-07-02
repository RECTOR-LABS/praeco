# Praeco — Railway → Vercel Migration (Door A transport re-architecture)

**Date:** 2026-07-01
**Status:** Approved design (brainstorm) — pending spec review → writing-plans
**Owner:** RECTOR / CIPHER
**Scope:** Re-platform the Door A web app from Railway (one long-lived Node service) to Vercel (Fluid functions + Blob + Upstash Redis + Vercel Sandbox), preserving **all three run modes** (replay, sandbox, live). The engine (`src/*`) is **not modified**.

---

## 1. Motivation & decision

- **Driver: cost** (RECTOR). After weighing the alternatives (stay on Railway, deploy to the existing VPS at ~$0 marginal, frontend-only hybrid), RECTOR chose a **full migration to Vercel, all modes, robust** — accepting the higher *likely* cost (Vercel Pro + metered Sandbox/Redis/Blob vs Railway's ~$5/mo floor), ~3–4 days of effort, and the pre-demo risk. This spec records that decision and the design that satisfies it.
- **Hard constraint:** the engine `src/*` is proven on Base mainnet (9 live hires, 3 counterparties). **Do not touch it.** All changes are confined to `server/*`, one client hook, config, and deploy wiring.
- **Deadline context:** CROO Agent Hackathon, 2026-07-09 (~8 days). This migration competes for runway with Door B (mandatory) + the demo. Sequencing is a live concern (see §10).

## 2. Why this is a re-architecture, not a redeploy

Door A is a **stateful, long-running SSE service** — exactly what Railway (D2/D3) was chosen for. Three couplings break on Vercel's per-request serverless model:

| # | Railway coupling | Evidence | Serverless failure |
|---|---|---|---|
| 1 | Process-wide **in-memory hub** holds each run's event buffer + SSE subscriber set | `server/run-hub.ts:44-46` (`globalThis` singleton; comment: *"survives across requests on Railway's long-lived Node server"*) | The POST that starts a run and the GET that streams it are **separate requests → different instances**. `hub.get(runId)` finds nothing. |
| 2 | **Fire-and-forget** multi-minute execution *after* the POST responds | `server/start-run.ts:34-41` (`void runner(...).then(hub.finish)`) | Compute is tied to the request; post-response work is bounded by function max duration. A real run is ~5–20 min. |
| 3 | **`/data` volume** for RunRecord JSON | `server/persistence.ts:7-14` (`fs.writeFile(RUNS_DIR)`) | No persistent local filesystem on Vercel. |

Run-duration reality (drives the execution choice):
- **replay** — short, read-only (paced playback of a completed RunRecord).
- **sandbox** — ~30s–3 min (GLM-inference-bound; mock CAP returns instantly; ~34 agent steps).
- **live** — ~5–20 min (real poll windows: `server/engine-deps.ts:31` → `80×2s` negotiation + `120×5s` delivery, *per leg*). Currently gated **off** (`LIVE_RUN_TOKEN` unset).

## 3. Target architecture (engine `src/*` untouched)

### 3.1 Storage — Vercel Blob
`server/persistence.ts` swaps `node:fs` → `@vercel/blob`. RunRecords stored as private JSON at `runs/{runId}.json`. `saveRecord`/`loadRecord`/`listRecords` keep their signatures; only the backend changes. Tiny payloads (~20–30 KB).

### 3.2 Event bus — Upstash Redis (Streams)
The in-memory `RunHub` is replaced by a **Redis-Streams-backed hub with the same interface** (`create`/`publish`/`subscribe`/`finish`/`get`/`activeCount`), so `stream-run.ts` and `start-run.ts` barely change (D5).

- Per run, `XADD run:{id} * <SseEvent>` — the Redis Stream entry ID **is** the SSE `id:` (monotonic, replay-addressable).
- Live tail + reconnect: SSE reads via `XREAD BLOCK` from the client's `Last-Event-ID`. One primitive gives **durable buffer + live fan-out + replay-from-offset**.
- Run status/meta in a hash `run:{id}:meta`; an active-run set per mode powers capacity gating (§3.7).
- Upstash chosen over Vercel Queues: Queues is at-least-once *job delivery* to consumer functions, not live SSE fan-out. Redis Streams is the right fit (D3).

### 3.3 Execution — Vercel Sandbox (sandbox + live); direct for replay
- **replay:** `GET /stream` loads the RunRecord from Blob → `replayStream` (unchanged) → SSE. No engine, no Redis.
- **sandbox + live:** the run executes inside a **Vercel Sandbox** microVM (D2 — the only Vercel primitive that runs 5–20 min in one go without decomposing the proven engine into Workflow steps):
  - Created from a **git source** (`@vercel/sandbox`: clone the repo at a pinned revision) → `npm ci` → run `scripts/sandbox-run.ts`.
  - That entry calls `runLaunchJob` with an `onEvent` that does `XADD` to Redis; on completion it writes the RunRecord to Blob and marks status `done`.
  - Sandbox config: `runtime: node24`, `resources` (vcpus/memory sized to the engine), `timeout` (5 min sandbox / 30 min live, `extendTimeout()` as needed), `env` (engine secrets + `REDIS_URL` + `BLOB_*`), `networkPolicy: custom` **allowlist** (GLM/Ollama, CAP API+WS, Base RPC, Upstash, Blob) — least privilege (CLAUDE.md).
  - **Cold start** (clone + `npm ci` ≈ 30–60 s) is surfaced as a `provisioning` state in the worklog/UI; snapshots (`keepLastSnapshots`) warm subsequent runs.

### 3.4 SSE route — `server/stream-run.ts`
- Active run → tail the Redis Stream from `Last-Event-ID` (`XREAD BLOCK`) → `sseFrame` → close on terminal (`run_completed`/`run_aborted`).
- No active run → Blob RunRecord → `replayStream` (the existing disk-replay fallback, now Blob-backed). `Last-Event-ID` honored identically.

### 3.5 Kickoff — `server/start-run.ts`
`POST /api/runs`: validate + gate (unchanged `gating.ts`) → `runId` → create the Redis run entry → **provision the Sandbox** (fire-and-forget of provisioning, not of a 20-min in-process loop) → return `{ runId }`. No engine runs in the function.

### 3.6 Client reconnect — `components/theater/useRunStream.ts`
Remove `es.onerror = () => es.close()` (which currently defeats reconnection). Rely on native `EventSource` auto-reconnect (it resends `Last-Event-ID`), resuming from the Redis Stream. Close only on terminal events. This is what makes function-duration cutoffs invisible to the viewer.

### 3.7 Capacity gate — `server/gating.ts`
`assertCapacity` reads the Redis active-run count per mode instead of `hub.activeCount`. Same caps (`live:1, sandbox:3, replay:999`).

## 4. Data flow — a sandbox/live run

```
Browser POST /api/runs {mode,text}
  → gating (zod + live token) → runId
  → Redis: create run:{id}:meta(status=provisioning)
  → provision Vercel Sandbox (clone@SHA, npm ci, tsx scripts/sandbox-run.ts, env, netPolicy)
  → 200 {runId}                                    // function returns immediately

Sandbox (independent, durable up to 30m)
  runLaunchJob(input, deps{ onEvent: e => XADD run:{id} * e })
    → engine emits worklog events → XADD (id = stream id)
  on finish → Blob put runs/{id}.json → Redis meta.status=done → XADD terminal

Browser GET /api/runs/:id/stream   (EventSource, auto-reconnect)
  → active? XREAD BLOCK from Last-Event-ID → sseFrame → … → terminal → close
  → not active? Blob loadRecord → replayStream (paced) → close
```

No cross-instance in-memory state anywhere; Redis is the single source of truth for in-flight events, Blob for completed runs.

## 5. Components & interfaces

| File | Change |
|---|---|
| `server/hub.ts` (rename from `run-hub.ts` or keep name) | Redis-Streams adapter implementing the existing `RunHub` interface. |
| `server/persistence.ts` | `@vercel/blob` backend; same `saveRecord`/`loadRecord`/`listRecords` signatures. |
| `server/sandbox-runner.ts` **(new)** | Provision + drive a Vercel Sandbox for a run; maps mode → resources/timeout/netpolicy. |
| `scripts/sandbox-run.ts` **(new)** | Thin entry executed *inside* the sandbox: `loadConfig` → `runLaunchJob` → `onEvent`=Redis XADD → RunRecord to Blob. Reuses `buildSandboxDeps`/`buildLiveDeps`. |
| `server/stream-run.ts` | Tail Redis Stream (active) / Blob replay (completed). |
| `server/start-run.ts` | Provision Sandbox instead of in-process fire-and-forget. |
| `server/gating.ts` | Redis-backed active-run count. |
| `components/theater/useRunStream.ts` | Reconnect fix. |
| `vercel.json` **(new)** / drop `railway.json` | Fluid on; `maxDuration` for the stream route; function config. `next.config.mjs` carries over unchanged. |

## 6. Error handling & degradation

- **Sandbox provision failure** → mark `error` in Redis + emit an `error` SSE frame; no payment attempted (live money guards live in the engine, which never started).
- **Redis unavailable** → fail closed (500); never silently drop events (CLAUDE.md: no swallowed failures).
- **Blob write failure on finish** → retry with backoff; surface the failure in the worklog; the run's events are still in Redis for the stream.
- **Reconnect across a function cutoff** → `Last-Event-ID` replay from Redis; no duplicate events, **no engine re-run** (the Sandbox is the single runner; the function only tails).
- **Live money safety** → unchanged; the engine's per-leg cap, funded-wallet gate, single-pay invariant all still hold. The Sandbox `networkPolicy` allowlist is defense-in-depth.

## 7. Testing (TDD; keep the 140 green, add adapters)

- `hub.ts` — publish/subscribe/replay-from-offset against a Redis test double (mock `XADD`/`XREAD`).
- `persistence.ts` — save/load/list against a mocked `@vercel/blob`.
- `sandbox-runner.ts` — provision + event-forward against a mocked `@vercel/sandbox`.
- `stream-run.ts`/`start-run.ts` — same observable behavior against the new hub double.
- No live USDC / no real network in CI (mock SDK/fetch/LLM, as today). `pnpm test:run` + `pnpm typecheck` green; `next build` clean before every commit.

## 8. Deployment / cutover

1. Provision Marketplace integrations: **Upstash Redis** + **Vercel Blob** (env auto-injected into the project).
2. Vercel project on team `rectors-projects` (`team_ChFWVdEkY44d43iO4jyj1hxD`); env vars = 8 engine (`CROO_*`, `BASE_RPC_URL`, `OLLAMA_*`, `PRAECO_AGENT_ID/WALLET`) + `REDIS_URL` + `BLOB_READ_WRITE_TOKEN` + Sandbox auth (`VERCEL_TEAM_ID/PROJECT_ID/TOKEN`); `LIVE_RUN_TOKEN` + `SVC_*` left **unset** (live off). Fluid enabled.
3. DNS: flip `praeco.rectorspace.com` (Cloudflare) from Railway → Vercel; verify SSL. Keep Railway running until Vercel is green, then decommission (cost stops).
4. **Plan tier:** Vercel **Pro** is likely required (extended `maxDuration` + commercial use). Confirm before cutover.

## 9. De-risk spike (FIRST plan task, before the full build)

Prove the riskiest unknown end-to-end: `@vercel/sandbox` can (a) clone the private repo, (b) `npm ci`, (c) run `runLaunchJob` in **sandbox mode** (mock CAP, $0), (d) `XADD` events to Upstash Redis, and (e) a Vercel function tails them over SSE to a browser. If the spike is red, revisit the execution model before investing in the full transport rewrite.

## 10. Risks

- **Sandbox cold-start latency** (clone + install) — mitigate with a `provisioning` UX + snapshots; validate real numbers in the spike.
- **Cost** — Sandbox metered + Pro; higher than Railway. Accepted by RECTOR.
- **Redis-Streams ↔ SSE id mapping** — validate exact semantics (entry-id ordering, `Last-Event-ID` resume) in the spike.
- **Deadline** — this competes with Door B (mandatory) + demo across ~8 days. If the spike or build slips, fall back to keeping Railway for the hackathon and finishing the migration after (explicit go/no-go after the spike).

## 11. Out of scope

- Engine `src/*` changes. The parked **clean-3/3-kit engine fix** (QA swap-gate + format-aware discovery + attempt-cap + pin-escape, approach A) is a separate spec/plan, resumed after this migration.
- UI redesign; new features.

## Decisions

- **D1** Full migration, all three modes, robust (not demo-path-first) — RECTOR, cost-driven, eyes-open.
- **D2** Vercel **Sandbox** for engine execution — the only Vercel primitive that runs 5–20 min in one shot without decomposing the proven engine.
- **D3** Upstash **Redis Streams** as the event bus — durable buffer + live tail + replay-from-offset in one primitive; Queues is job-delivery, not live fan-out.
- **D4** Vercel **Blob** for RunRecords.
- **D5** One Redis-hub abstraction preserving the `RunHub` interface — keeps `server/*` blast radius small.
- **D6** Client reconnect via native `EventSource` + `Last-Event-ID` — turns function-duration cutoffs into invisible resumes.
